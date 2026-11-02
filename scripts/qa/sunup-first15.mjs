// Sunup's first fifteen minutes on a phone, measured (round 9: the tester
// scored them engaging 3 of 10; Spring 4 and 6 had no jobs, Spring 5 four taps,
// and the first real choice came on Spring 9, about eight minutes in).
//
// A fresh game at the Pixel's size with touch, played for fifteen real minutes
// by an attentive player who follows the lesson line: it picks what is ripe,
// waters what is thirsty, fills the can, plants bare soil (for a request
// first), shoos crows, picks bugs, reads the board when the line or the badge
// says so, takes the offer with the bigger headline number (a real tap on its
// Accept), buys a field or builds when a line says to, and sleeps (yes to the
// question) once nothing is left to do. One action about every 1.2 s, as the
// playtest's thumb. Everything goes through the `window.sunup` hook and real
// taps on the board, so it runs on any build, before and after.
//
// This player works faster than the tester (who took 43 s over Spring 1 and
// slept by 10 am on Spring 5), so it plays the tester's first fifteen minutes
// by the calendar: Spring 1 to Summer 6 (or the minutes given, whichever ends
// first), pausing three seconds to read each new line and card.
//
// It reports: the real decisions (a board with two or more offers that could
// be accepted, and fields or tools bought), the day and minute of the first
// one, each day's real seconds and jobs, and the dead days (fewer than five
// jobs and no decision) and their seconds.
// node scripts/qa/sunup-first15.mjs [base url] [minutes] [last day]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5247';
const MINUTES = Number(process.argv[3] ?? 15);
/** Summer 6: where the tester's first fifteen minutes ended. */
const LAST_DAY = Number(process.argv[4] ?? 16);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const tap = async (x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
/** A real tap on the first visible element matching `sel` whose text matches `re`. */
const tapEl = async (sel, re) => {
  const at = await p.evaluate(([sel, src]) => {
    const re = src ? new RegExp(src) : null;
    const e = [...document.querySelectorAll(sel)].find((q) => q.getBoundingClientRect().width > 0 && !q.disabled && (!re || re.test(q.textContent.trim())));
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, [sel, re ? re.source : '']);
  if (at) await tap(at[0], at[1]);
  return !!at;
};
const send = (c) => p.evaluate((c) => window.sunup.input.push(c), c);

await p.goto(`${base}/?game=homestead&fresh&touch`);
await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 180000 });
const t0 = Date.now();
const secs = () => (Date.now() - t0) / 1000;

/** What a person sees and could do, read through the hook. */
const look = () =>
  p.evaluate(() => {
    const d = window.sunup;
    const s = d.state;
    const f = s.actors[0];
    const owned = (i) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && s.tiles[i] === 'field';
    const built = (i) => s.builds.some((q) => q.y * s.W + q.x === i);
    const tiles = { ripe: [], thirsty: [], bugs: [], bare: [], meadow: [], dead: [] };
    for (let i = 0; i < s.plots.length; i++) {
      if (!owned(i) || built(i)) continue;
      const pl = s.plots[i];
      const c = pl.crop;
      const at = [i % s.W, Math.floor(i / s.W)];
      if (c && c.dead) tiles.dead.push(at);
      else if (c && c.stage === 4) tiles.ripe.push(at);
      else if (c && c.bugs > 0) tiles.bugs.push(at);
      else if (c && !pl.wet) tiles.thirsty.push(at);
      else if (!c && pl.tilled) tiles.bare.push(at);
      else if (!c && !pl.tilled) tiles.meadow.push(at);
    }
    const crow = s.crows.find((c) => c.phase === 'in' || c.phase === 'peck');
    const dialog = document.querySelector('.dialog.on');
    const busy = !!(f.task || f.path.length || f.aim || (s.taps && s.taps.length));
    // A taken request that still wants seed.
    const want = s.orders.find((o) => o.taken !== false && o.items[0].n > 0);
    const learnt = (w) => s.learn.includes(w);
    return {
      day: s.day,
      minute: s.minute,
      night: s.turnover >= 0,
      coins: s.coins,
      water: s.water,
      stamina: s.stamina,
      tool: s.tool,
      line: document.querySelector('.hint.on')?.textContent ?? '',
      dialog: dialog ? dialog.dataset.kind ?? 'card' : '',
      dialogText: dialog ? dialog.textContent : '',
      badge: Number(document.querySelector('.topbtns .badge')?.textContent || 0) || (s.orders.some((o) => o.seen === false) ? 1 : 0),
      board: learnt('board'),
      can: learnt('can'),
      seedsOk: learnt('seeds'),
      hoe: learnt('hoe'),
      crow: crow ? [crow.x, crow.y] : null,
      busy,
      tiles,
      want: want ? want.items[0].crop : null,
      point: d.lessonTarget?.point ?? null,
      build: d.lessonTarget?.build ?? null,
      forSale: s.parcels.find((q) => !q.owned) ?? null,
      fields: s.parcels.filter((q) => q.owned).length,
      events: d.events.length,
      camera: s.rules.camera,
    };
  });

/** Seeds a person would pick now: for a taken request first, else the cheapest that can go in (read from the picker). */
const seedFor = (v) =>
  p.evaluate((want) => {
    const cards = [...document.querySelectorAll('.seedbar .seed')].filter((c) => !c.classList.contains('gone') && !c.classList.contains('locked') && !c.classList.contains('poor'));
    const crops = cards.map((c) => c.dataset.crop);
    if (want && crops.includes(want)) return want;
    return crops[0] ?? null;
  }, v.want);

// Each day: its real seconds, the farmer's jobs, and the decisions made.
const days = new Map();
const dayOf = (d) => {
  if (!days.has(d)) days.set(d, { from: secs(), to: secs(), jobs: 0, decisions: 0, coins: -1, lines: new Set() });
  return days.get(d);
};
const decisions = [];
let seenEvents = 0;
let lastDay = 0;
const JOBS = new Set(['harvest', 'water', 'plant', 'till', 'tend', 'build', 'clear', 'refill']);

let lastLine = '';
let lastDialog = '';
while (secs() < MINUTES * 60) {
  await p.waitForTimeout(1300);
  let v;
  try {
    v = await look();
  } catch {
    continue;
  }
  // Count the farmer's jobs since the last look.
  const fresh = await p.evaluate((n) => window.sunup.events.slice(n).map((e) => ({ type: e.type, by: e.by })), Math.min(seenEvents, v.events));
  seenEvents = v.events;
  const day = dayOf(v.day);
  day.to = secs();
  if (day.coins < 0 && !v.night) day.coins = v.coins;
  if (v.line) day.lines.add(v.line);
  for (const e of fresh) if (JOBS.has(e.type) && e.by === 1) day.jobs++;
  if (v.day !== lastDay) lastDay = v.day;
  if (v.day > LAST_DAY) break;
  if (v.night) continue;
  // A new line or card is read first.
  if ((v.line && v.line !== lastLine) || (v.dialog && v.dialog !== lastDialog)) {
    lastLine = v.line;
    lastDialog = v.dialog;
    await p.waitForTimeout(3000);
  }
  if (!v.dialog) lastDialog = '';
  // A card is open: answer it.
  if (v.dialog) {
    if (v.dialog === 'board') {
      // Offers that can be accepted now: two or more is a real decision.
      const offers = await p.evaluate(() => [...document.querySelectorAll('.dialog.on .item.req.offer')].map((n) => ({ head: n.querySelector('.tx b')?.textContent ?? '', ok: !!n.querySelector('button.accept:not(:disabled)') })));
      const ok = offers.filter((o) => o.ok);
      if (ok.length) {
        const num = (h) => Number((/[\d,]+/.exec(h)?.[0] ?? '0').replace(/,/g, ''));
        const pick = ok.reduce((a, o) => (num(o.head) > num(a.head) ? o : a));
        if (ok.length >= 2) {
          decisions.push({ at: secs(), day: v.day, what: `pair: ${ok.map((o) => o.head).join(' or ')}` });
          day.decisions++;
        }
        await p.evaluate((head) => {
          const n = [...document.querySelectorAll('.dialog.on .item.req.offer')].find((q) => (q.querySelector('.tx b')?.textContent ?? '') === head);
          n?.querySelector('button.accept')?.setAttribute('data-pick', '1');
        }, pick.head);
        await tapEl('.dialog.on button[data-pick]');
        await p.waitForTimeout(500);
      }
      // Older builds: a Deliver stamp hands a request over.
      if (await tapEl('.dialog.on button[data-deliver]')) await p.waitForTimeout(400);
      await tapEl('.dialog.on .closebtn');
      continue;
    }
    if (v.dialog === 'parcel' || v.dialog === 'buy' || v.dialog === 'build') {
      const yes = await tapEl('.dialog.on button.primary', /^(Buy|Build) for/);
      // (A build the lesson asks for is no choice; a field or a tool bought is.)
      if (yes && v.dialog !== 'build') {
        decisions.push({ at: secs(), day: v.day, what: 'buy' });
        day.decisions++;
      } else await tapEl('.dialog.on button', /^Not now$/);
      continue;
    }
    if (v.dialog === 'sleep') {
      // Asked before sleeping: sleep only when nothing is left.
      const left = v.tiles.ripe.length + v.tiles.thirsty.length + v.tiles.bugs.length + (v.crow ? 1 : 0);
      await tapEl('.dialog.on button', left ? /^Not now$/ : /^Sleep$/);
      continue;
    }
    await tapEl('.dialog.on .closebtn');
    continue;
  }
  if (v.busy) continue;
  // The board, when the line says so or a note is new.
  if (v.board && (/board/i.test(v.line) || v.badge > 0 || /smith/i.test(v.line))) {
    await tapEl('.topbtns .iconbtn:not(.viewbtn)');
    continue;
  }
  if (/View|whole farm/.test(v.line)) {
    await tapEl('.topbtns .viewbtn');
    await p.waitForTimeout(1500);
    await tapEl('.topbtns .viewbtn');
    continue;
  }
  const at = (t) => send({ type: 'actAt', x: t[0], y: t[1] });
  if (v.crow) {
    await at(v.crow);
    continue;
  }
  if (v.tiles.bugs.length) {
    await send({ type: 'tool', tool: 'hands' });
    await at(v.tiles.bugs[0]);
    continue;
  }
  if (v.tiles.ripe.length) {
    await at(v.tiles.ripe[0]);
    continue;
  }
  if (v.tiles.dead.length) {
    await at(v.tiles.dead[0]);
    continue;
  }
  if (v.can && v.tiles.thirsty.length) {
    if (v.water <= 0) {
      // The nearer well (the yard's, or the one where the field paths cross).
      const w = await p.evaluate((wells) => {
        const f = window.sunup.state.actors[0];
        return wells.sort((a, b) => Math.hypot(a[0] + 0.5 - f.x, a[1] + 0.5 - f.y) - Math.hypot(b[0] + 0.5 - f.x, b[1] + 0.5 - f.y))[0];
      }, [[11, 2], [6, 9]]);
      await send({ type: 'tool', tool: 'can' });
      await send({ type: 'actAt', x: w[0], y: w[1] });
      continue;
    }
    await send({ type: 'tool', tool: 'can' });
    await at(v.tiles.thirsty[0]);
    continue;
  }
  if (v.hoe && v.tiles.meadow.length) {
    await send({ type: 'tool', tool: 'hoe' });
    await at(v.tiles.meadow[0]);
    continue;
  }
  // A build or a field the line asks for: a tap on its pointer.
  if (v.point && v.build && /Build/.test(v.line) && v.coins >= (v.build === 'sprinkler' ? 200 : 40)) {
    await at([Math.floor(v.point.x), Math.floor(v.point.y)]);
    continue;
  }
  if (/Buy a second field/.test(v.line) && v.forSale) {
    await at([v.forSale.x + 1, v.forSale.y + 1]);
    continue;
  }
  if (v.seedsOk && v.tiles.bare.length) {
    if (v.tool !== 'seeds') {
      await send({ type: 'tool', tool: 'seeds' });
      await p.waitForTimeout(300);
    }
    const crop = await seedFor(v);
    if (crop) {
      await send({ type: 'seed', crop });
      await at(v.tiles.bare[0]);
      continue;
    }
  }
  // Nothing left to do: sleep (the button, then yes to the question if it asks).
  await tapEl('.toolbar .tool.act');
}

const rows = [...days.entries()].filter(([n, d]) => d.from < MINUTES * 60 && n <= LAST_DAY);
console.log(`Sunup, Spring 1 to day ${LAST_DAY} on a phone, at most ${MINUTES} minutes (${base}): reached day ${Math.min(lastDay, LAST_DAY + 1)} in ${(secs() / 60).toFixed(1)} min`);
console.log(`  real decisions ${decisions.length}: ${decisions.map((d) => `${d.what} (day ${d.day}, ${(d.at / 60).toFixed(1)} min)`).join('; ') || 'none'}`);
console.log(`  first decision at ${decisions.length ? `${(decisions[0].at / 60).toFixed(1)} min, day ${decisions[0].day}` : 'never'}; pairs chosen ${decisions.filter((d) => d.what.startsWith('pair')).length}`);
const dead = rows.filter(([, d]) => d.jobs < 5 && d.decisions === 0);
console.log(`  days: ${rows.map(([n, d]) => `${n}: ${Math.round(d.to - d.from)} s, ${d.jobs} jobs${d.decisions ? `, ${d.decisions} decision${d.decisions > 1 ? 's' : ''}` : ''}`).join(' | ')}`);
console.log(`  dead days (under 5 jobs, no decision): ${dead.length} (${dead.map(([n]) => n).join(', ') || 'none'}), ${Math.round(dead.reduce((a, [, d]) => a + (d.to - d.from), 0))} s of ${Math.round(secs())} s; days with a decision ${rows.filter(([, d]) => d.decisions > 0).length} of ${rows.length}`);
console.log(`  morning coins and lines: ${rows.map(([n, d]) => `${n}: ${d.coins} [${[...d.lines].join(' / ')}]`).join(' | ')}`);
console.log(`  page errors: ${errs.length}${errs.length ? ` (${errs[0]})` : ''}`);
await b.close();
process.exit(errs.length ? 1 : 0);
