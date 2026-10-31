// Seedbound's guided first season, played and measured. On a 412 by 838 phone
// with real touch (CDP Input.dispatchTouchEvent), then on a 1280 by 800 desktop
// with the mouse and keyboard, it plays the first season as a new player would
// and records exactly what is on the table at every step. It fails if:
//   - any piece of the table shows before the lesson that brings it in
//   - a lesson does not end when its action is done
//   - a note is longer than eight words, or a card face paints a sentence
//   - holding a card shows no preview where a bonus applies
//   - cost scoops on a card are under 14 CSS px, an unaffordable card is not
//     visibly darker (pixel luminance), or the scoops a held card would use do
//     not lift
//   - the lessons do not survive a reload, or a returning player gets the
//     guided season again
// Screens go to /tmp/deck-lessons/; the step-by-step table to steps-*.json.
// node scripts/deck-lessons.mjs [base url]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5252';
const out = '/tmp/deck-lessons';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

// Which lesson brings each piece in. A piece on the table before its lesson has come up is a failure.
const BRINGS = { lantern: 'lantern', peg: 'peg', scoops: 'scoops', coins: 'coins', tin: 'tin', spent: 'spent', tonight: 'weather', pages: 'pages', services: 'services' };
// Pieces the night may bring in itself, the moment they are first needed: the pegboard for the first harvest, coins at the season's end.
const NIGHT = { peg: 'the first harvest', coins: 'the season end' };

async function session(label, viewport, touch) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errs.push(`console ${m.text()}`));
  const cdp = await ctx.newCDPSession(p);
  const wait = (ms) => p.waitForTimeout(ms);
  const touchEv = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) });
  async function tap(x, y, hold = 50) {
    if (touch) {
      await touchEv('touchStart', [[x, y, 1]]);
      await wait(hold);
      await touchEv('touchEnd', []);
    } else await p.mouse.click(x, y);
    await wait(90);
  }
  /** Drag from a to b; `mid` runs with the finger (or button) still down over b. */
  async function drag(x0, y0, x1, y1, mid) {
    if (touch) {
      await touchEv('touchStart', [[x0, y0, 2]]);
      for (let i = 1; i <= 12; i++) {
        await touchEv('touchMove', [[x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12, 2]]);
        await wait(16);
      }
      await wait(60);
      if (mid) await mid();
      await touchEv('touchEnd', []);
    } else {
      await p.mouse.move(x0, y0);
      await p.mouse.down();
      for (let i = 1; i <= 12; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12);
      await wait(60);
      if (mid) await mid();
      await p.mouse.up();
    }
    await wait(120);
  }
  const cardPoint = (i) =>
    p.evaluate((i) => {
      const t = window.deck.table;
      const c = t.run.hand[i];
      const el = c && t.handEls.get(c.uid)?.el;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      for (const fy of [0.35, 0.5, 0.2, 0.7]) {
        for (const fx of [0.3, 0.15, 0.45, 0.6, 0.8]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          if (y > innerHeight - 4) continue;
          if (document.elementFromPoint(x, y)?.closest('.sb-card') === el) return [x, y];
        }
      }
      return null;
    }, i);
  const handIndex = (id) => p.evaluate((id) => window.deck.state().hand.findIndex((c) => c.id === id), id);
  const plotPoint = (i) => p.evaluate((i) => { const r = window.deck.rects().plots[i]; return [r.left + r.width / 2, r.top + r.height * 0.6]; }, i);
  const center = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const idle = () => p.waitForFunction(() => !window.deck.busy(), null, { timeout: 30000 });
  const frames = (n = 6) => wait(n * 17);

  /** Exactly what is on the table right now. */
  const table = () =>
    p.evaluate(() => {
      const vis = (e) => {
        if (!e) return false;
        for (let a = e; a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
        }
        const r = e.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      };
      const q = (s) => document.querySelector(s);
      const d = window.deck;
      const sheet = q('.sb-sheets.on');
      return {
        day: d.state().day,
        season: d.state().season,
        phase: d.state().phase,
        hand: d.state().hand.map((c) => c.id),
        pieces: {
          lantern: vis(q('.sb-lantern')),
          peg: vis(q('.sb-peg')) || vis(q('.sb-ledger')),
          scoops: vis(q('.sb-scoops')),
          coins: vis(q('.sb-purse')),
          tin: vis(q('.sb-tin')),
          spent: vis(q('.sb-heap')),
          tonight: vis(q('.sb-tonight')) && !!q('.sb-tonight img'),
          pages: vis(q('.sb-pages')) || vis(q('.sb-cork')),
          services: vis(q('.sb-lip')),
        },
        cost: [...document.querySelectorAll('.sb-hand .sb-card .sb-cost i')].filter(vis).length,
        book: vis(q('.sb-book')),
        line: vis(q('.sb-hint.on')) ? q('.sb-hint').textContent : vis(q('.sb-stall-lesson')) ? q('.sb-stall-lesson').textContent : '',
        lesson: d.lesson()?.id ?? null,
        sheet: sheet ? sheet.dataset.kind : null,
        done: d.table.tutor.learn.done.slice(),
      };
    });

  // Every lesson that has come up so far (finished or on screen): the pieces it brings may show.
  const started = new Set();
  const nightBrought = new Set();
  const steps = [];
  const lines = new Set();
  async function step(name, extra = {}) {
    await frames(4);
    const t = await table();
    for (const id of t.done) started.add(id);
    if (t.lesson) started.add(t.lesson);
    if (t.line) lines.add(t.line);
    const early = Object.entries(t.pieces).filter(([k, on]) => on && !started.has(BRINGS[k]) && !nightBrought.has(k));
    steps.push({ step: name, ...t, ...extra });
    check(`${label}: ${name}: nothing before its lesson`, early.length === 0, early.length ? `early: ${early.map(([k]) => k).join(', ')}` : `on: ${Object.entries(t.pieces).filter(([, v]) => v).map(([k]) => k).join(', ') || 'plot and hand only'}${t.line ? `; "${t.line}"` : ''}`);
    return t;
  }
  const shot = (name) => p.screenshot({ path: `${out}/${label}-${name}.png` });
  const words = (s) => s.split(/\s+/).filter(Boolean).length;

  // Notes too, as they come and go.
  await p.addInitScript(() => {
    window.__notes = [];
    new MutationObserver(() => {
      const n = document.querySelector('.sb-note.on');
      if (n && window.__notes.at(-1) !== n.textContent) window.__notes.push(n.textContent);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });

  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  await wait(400);
  if (touch) {
    // Tell the shell this is a finger (touching bare table changes nothing).
    await touchEv('touchStart', [[200, 40, 9]]);
    await touchEv('touchEnd', []);
    await wait(100);
  }

  // ---------------------------------------------------------------- day 1: two radishes, the plot, one note
  let t = await step('day 1, first screen');
  await shot('1-first');
  check(`${label}: the first hand is two radishes`, t.hand.join() === 'radish,radish', t.hand.join());
  check(`${label}: no cost printed yet`, t.cost === 0);
  check(`${label}: the almanac stays, quietly`, t.book);
  check(`${label}: one line, about the radish`, /radish/i.test(t.line), t.line);
  if (!touch) {
    // Keyboard: take the first radish up and sow it with the arrows and Enter.
    await p.keyboard.press('Digit1');
    await frames(4);
    t = await step('day 1, radish taken up by key');
    check(`${label}: the line follows the keyboard`, /arrows|Enter/.test(t.line), t.line);
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Enter');
    await wait(500);
  } else {
    await tap(...(await cardPoint(0)));
    t = await step('day 1, radish taken up');
    check(`${label}: the line moves on to the plot`, /plot/i.test(t.line), t.line);
    await shot('2-held');
    await tap(...(await plotPoint(5)));
    await wait(500);
  }
  t = await step('day 1, one radish sown');
  check(`${label}: one action, then the next`, /other radish/i.test(t.line), t.line);
  // The second radish by drag: while it is over a plot the board shows what it would score there.
  {
    const cp = await cardPoint(0);
    const pp = await plotPoint(10);
    let pv = null;
    await drag(...cp, ...pp, async () => {
      pv = await p.evaluate(() => window.deck.preview());
      await shot('3-drag-preview');
    });
    check(`${label}: dragging over a plot previews its score`, !!pv?.total && pv.total.plot === 10 && pv.total.score === 2, JSON.stringify(pv?.total));
  }
  await wait(500);
  t = await step('day 1, both sown');
  check(`${label}: the lantern comes in once it is needed`, t.pieces.lantern && /lantern|Press E/.test(t.line), t.line);
  await shot('4-lantern');
  // End the day: the first harvest brings the pegboard. Yield only on the slip.
  nightBrought.add('peg');
  if (touch) await tap(...(await center('.sb-lantern')));
  else await p.keyboard.press('KeyE');
  await wait(1300);
  const slip1 = await p.evaluate(() => ({ slips: document.querySelectorAll('.sb-slip').length, bloom: document.querySelectorAll('.sb-slip .m').length }));
  await shot('5-first-harvest');
  check(`${label}: the first harvest shows yield only`, slip1.bloom === 0, JSON.stringify(slip1));
  await idle();
  await wait(300);

  // ---------------------------------------------------------------- day 2: the pegboard, then a carrot to plant beside
  t = await step('day 2, dawn');
  check(`${label}: day 2 deals a carrot and two radishes`, t.hand.join() === 'carrot,radish,radish', t.hand.join());
  check(`${label}: the pegboard came for the first harvest`, t.pieces.peg && /brass hole/i.test(t.line), t.line);
  await shot('6-peg');
  // Taking a card up ends the passive pegboard note; the stakes note follows.
  await tap(...(await cardPoint(await handIndex('carrot'))));
  t = await step('day 2, carrot taken up');
  check(`${label}: the next note says what missing it means`, /run ends/i.test(t.line), t.line);
  await tap(...(await plotPoint(5)));
  await wait(500);
  await tap(...(await cardPoint(await handIndex('radish'))));
  t = await step('day 2, radish taken up');
  check(`${label}: the companion lesson: one action`, /beside the carrot/i.test(t.line), t.line);
  let pv = await p.evaluate(() => window.deck.preview());
  const nextTo = [1, 4, 6, 9];
  const marked = (pv?.marks ?? []).filter((m) => m.yield === 2).map((m) => m.plot).sort();
  check(`${label}: a held radish marks +2 on every plot beside the carrot`, JSON.stringify(marked) === JSON.stringify(nextTo), JSON.stringify(pv?.marks));
  await shot('7-companion-preview');
  if (!touch) {
    // Hover a plot beside the carrot: the total, and the carrot's own gain.
    await p.mouse.move(...(await plotPoint(6)));
    await frames(6);
    pv = await p.evaluate(() => window.deck.preview());
    check(`${label}: hovering shows the total and what the carrot gains`, pv?.total?.score === 4 && pv.marks.some((m) => m.plot === 5 && m.bloom === 1), JSON.stringify(pv));
    await shot('7b-hover-preview');
    await p.mouse.click(...(await plotPoint(6)));
  } else await tap(...(await plotPoint(6)));
  await wait(500);
  t = await step('day 2, radish beside the carrot');
  check(`${label}: the companion lesson ends when the radish is beside it`, t.done.includes('companion'), t.done.join());
  await tap(...(await cardPoint(0)));
  await tap(...(await plotPoint(15)));
  await wait(500);
  if (touch) await tap(...(await center('.sb-lantern')));
  else await p.mouse.click(...(await center('.sb-lantern')));
  // The radish beside the carrot gets its +2 on an arc from the carrot.
  let arcs = 0;
  for (let k = 0; k < 40 && (await p.evaluate(() => window.deck.busy())); k++) {
    arcs = Math.max(arcs, await p.evaluate(() => document.querySelectorAll('.sb-arc.y').length));
    if (arcs) break;
    await wait(60);
  }
  check(`${label}: the +2 flies in from the carrot`, arcs > 0);
  await idle();
  await wait(300);

  // ---------------------------------------------------------------- day 3: bloom, then the scoops
  t = await step('day 3, dawn');
  check(`${label}: day 3 deals more than three scoops' worth`, t.hand.join() === 'radish,radish,carrot,lettuce', t.hand.join());
  check(`${label}: the bloom lesson`, /around the carrot/i.test(t.line), t.line);
  check(`${label}: still no scoops`, !t.pieces.scoops && t.cost === 0);
  await shot('8-bloom');
  // Drag a radish beside the carrot: the carrot's +1 bloom shows while it is over the plot.
  {
    const cp = await cardPoint(await handIndex('radish'));
    const pp = await plotPoint(4);
    let mid = null;
    await drag(...cp, ...pp, async () => {
      mid = await p.evaluate(() => window.deck.preview());
      await shot('9-bloom-preview');
    });
    check(`${label}: over a plot, the carrot shows +1 bloom and the radish its total`, mid?.marks?.some((m) => m.plot === 5 && m.bloom === 1) && mid?.total?.score === 4, JSON.stringify(mid));
  }
  await wait(500);
  if (touch) {
    await tap(...(await cardPoint(await handIndex('radish'))));
    await tap(...(await plotPoint(1)));
  } else {
    await p.keyboard.press(`Digit${(await handIndex('radish')) + 1}`);
    for (const k of ['ArrowUp']) await p.keyboard.press(k);
    await p.evaluate(() => (window.deck.table.cursor = 1));
    await p.keyboard.press('Enter');
  }
  await wait(600);
  t = await step('day 3, two radishes round the carrot');
  check(`${label}: the bloom lesson ends`, t.done.includes('bloom'), t.done.join());
  check(`${label}: the scoops arrive when the hand costs more than is left`, t.pieces.scoops && /scoop/i.test(t.line), t.line);
  check(`${label}: and the cards show their cost`, t.cost >= 2, `${t.cost} cost marks`);
  await shot('10-scoops');
  // Cost glyph size, measured.
  const glyph = await p.evaluate(() => {
    const t = window.deck.table;
    const sizes = [];
    for (const c of t.run.hand) for (const i of t.handEls.get(c.uid).el.querySelectorAll('.sb-cost i')) sizes.push(i.getBoundingClientRect().width);
    return sizes;
  });
  check(`${label}: cost scoops on cards are at least 14 px`, glyph.length > 0 && Math.min(...glyph) >= 14, glyph.map((x) => x.toFixed(1)).join(', '));
  // Take up the carrot: the one scoop it would use lifts.
  const lum = async (uid) => {
    const r = await p.evaluate((uid) => { const e = window.deck.table.handEls.get(uid).el.querySelector('img').getBoundingClientRect(); return { x: e.left, y: e.top, w: e.width, h: Math.min(e.height, innerHeight - e.top) }; }, uid);
    const png = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x + r.w * 0.15, y: r.y + r.h * 0.3, width: r.w * 0.7, height: r.h * 0.4, scale: 1 } });
    return p.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    }, png.data);
  };
  const lettuceUid = await p.evaluate(() => window.deck.state().hand.find((c) => c.id === 'lettuce').uid);
  const lumBefore = await lum(lettuceUid);
  if (touch) await tap(...(await cardPoint(await handIndex('carrot'))));
  else await p.keyboard.press(`Digit${(await handIndex('carrot')) + 1}`);
  await wait(350);
  const scoopsHeld = await p.evaluate(() => [...document.querySelectorAll('.sb-scoops img')].map((i) => ({ use: i.classList.contains('use'), empty: i.classList.contains('empty'), top: i.getBoundingClientRect().top })));
  await shot('11-scoop-lifts');
  const used = scoopsHeld.filter((s) => s.use);
  const rest = scoopsHeld.filter((s) => !s.use);
  check(`${label}: the scoop a held card would use lifts`, used.length === 1 && used[0].top < Math.min(...rest.map((s) => s.top)) - 4, JSON.stringify(scoopsHeld));
  if (touch) await tap(...(await plotPoint(13)));
  else {
    await p.evaluate(() => (window.deck.table.cursor = 13));
    await p.keyboard.press('Enter');
  }
  await wait(600);
  const emptyNow = await p.evaluate(() => document.querySelectorAll('.sb-scoops img.empty').length);
  check(`${label}: after the play the scoops are visibly empty`, emptyNow === 3, `${emptyNow} of 3 empty`);
  // The lettuce now costs more than is left: dimmed, and a tap only shakes it.
  const lumAfter = await lum(lettuceUid);
  check(`${label}: an unaffordable card is visibly darker`, lumAfter < lumBefore * 0.8, `luminance ${lumBefore.toFixed(0)} to ${lumAfter.toFixed(0)}`);
  const notesBefore = await p.evaluate(() => window.__notes.length);
  if (touch) await tap(...(await cardPoint(await handIndex('lettuce'))));
  else await p.keyboard.press(`Digit${(await handIndex('lettuce')) + 1}`);
  await wait(120);
  const nope = await p.evaluate((uid) => ({ held: !!window.deck.table.held, shake: window.deck.table.handEls.get(uid).el.classList.contains('nope'), flash: document.querySelectorAll('.sb-scoops img.flash').length, notes: window.__notes.slice() }), lettuceUid);
  await shot('12-unaffordable');
  check(`${label}: tapping it shakes it, flashes the missing scoop, and takes nothing up`, !nope.held && nope.shake && nope.flash === 1, JSON.stringify({ ...nope, notes: undefined }));
  check(`${label}: and no note about energy`, nope.notes.length === notesBefore && !nope.notes.some((n) => /energy/i.test(n)), nope.notes.slice(notesBefore).join(' | '));
  await wait(400);
  t = await step('day 3, scoops spent');
  check(`${label}: spent, the line turns to ending the day`, /End the day/.test(t.line) && t.pieces.scoops, t.line);
  // End the day: the carrot blooms ×3 with arcs from both radishes.
  if (touch) await tap(...(await center('.sb-lantern')));
  else await p.keyboard.press('KeyE');
  let bloomSeen = { arcs: 0, slip: 0 };
  for (let k = 0; k < 80 && (await p.evaluate(() => window.deck.busy())); k++) {
    const now = await p.evaluate(() => ({ arcs: document.querySelectorAll('.sb-arc.m').length, slip: document.querySelectorAll('.sb-slip .m').length }));
    bloomSeen = { arcs: Math.max(bloomSeen.arcs, now.arcs), slip: Math.max(bloomSeen.slip, now.slip) };
    if (now.arcs && !(await p.evaluate(() => document.querySelector('.sb-fx .sb-arc.m') === null))) await shot('13-bloom-arc');
    await wait(40);
  }
  await idle();
  await wait(200);
  t = await step('day 4, dawn');
  check(`${label}: the scoops lesson ends with the day`, t.done.includes('scoops'), t.done.join());
  const refilled = await p.evaluate(() => document.querySelectorAll('.sb-scoops img.refill').length);
  check(`${label}: dawn refills the scoops one after another`, refilled === 3, `${refilled} refilled`);
  const scores = await p.evaluate(() => window.deck.shownScores());
  check(`${label}: bloom flies in from each radish and shows on the slip`, bloomSeen.arcs > 0 && bloomSeen.slip > 0, JSON.stringify(bloomSeen));
  check(`${label}: the carrot paid 5 × 3`, scores.includes(15), scores.join(','));

  // ---------------------------------------------------------------- days 4 to 6: the rest as each first matters
  for (let guard = 0; guard < 40; guard++) {
    const st = await p.evaluate(() => ({ phase: window.deck.state().phase, day: window.deck.state().day }));
    if (st.phase !== 'day') break;
    t = await step(`day ${st.day}`);
    const l = t.lesson;
    if (l === 'tin') {
      await shot(`14-tin-day${st.day}`);
      if (touch || guard % 2) await tap(...(await center('.sb-tin')));
      else await p.keyboard.press('KeyD');
      await wait(300);
      check(`${label}: the tin opens to show the cards`, (await p.evaluate(() => window.deck.table.sheets.kind)) === 'deck');
      await p.keyboard.press('Escape').catch(() => {});
      await p.evaluate(() => window.deck.table.sheets.back());
      await wait(200);
      t = await step(`day ${st.day}, tin seen`);
      check(`${label}: the tin lesson ends once the tin is opened`, t.done.includes('tin'));
      continue;
    }
    if (l === 'spent') {
      await shot(`15-spent-day${st.day}`);
      const before = await p.evaluate(() => window.deck.state().discard.length);
      const cp = await cardPoint(0);
      if (touch) await drag(...cp, ...(await center('.sb-heap')));
      else {
        await p.keyboard.press('Shift+Digit1');
        await p.keyboard.press('KeyX');
      }
      await wait(400);
      const after = await p.evaluate(() => ({ n: window.deck.state().discard.length, tossed: window.deck.state().tossed }));
      check(`${label}: a card tossed onto Spent`, after.tossed && after.n === before + 1, JSON.stringify(after));
      t = await step(`day ${st.day}, tossed`);
      check(`${label}: the spent lesson ends with the toss`, t.done.includes('spent'));
      await shot(`16-tossed-day${st.day}`);
      continue;
    }
    if (l === 'can') {
      const ci = await handIndex('can');
      const target = await p.evaluate(() => window.deck.state().plots.findIndex((q) => q.crop && q.crop.age < q.crop.days - 1));
      if (ci >= 0 && target >= 0) {
        await tap(...(await cardPoint(ci)));
        await wait(150);
        pv = await p.evaluate(() => window.deck.preview());
        if (touch) {
          let mid = null;
          await p.evaluate(() => window.deck.table.putDown(true));
          await drag(...(await cardPoint(await handIndex('can'))), ...(await plotPoint(target)), async () => {
            mid = await p.evaluate(() => window.deck.preview());
            await shot('17-can-preview');
          });
          check(`${label}: a can over a row marks +1 night on its crops`, mid?.marks?.some((m) => m.nights >= 1), JSON.stringify(mid?.marks));
        } else {
          await p.mouse.move(...(await plotPoint(target)));
          await frames(5);
          const hov = await p.evaluate(() => window.deck.preview());
          check(`${label}: a can over a row marks +1 night on its crops`, hov?.marks?.some((m) => m.nights >= 1), JSON.stringify(hov?.marks));
          await p.mouse.click(...(await plotPoint(target)));
        }
        await wait(500);
        t = await step(`day ${st.day}, watered`);
        check(`${label}: the can lesson ends when a row is watered`, t.done.includes('can'));
        continue;
      }
    }
    if (l === 'weather') {
      const wi = await p.evaluate(() => window.deck.state().hand.findIndex((c) => c.id === 'rain' || c.id === 'sun' || c.id === 'storm'));
      await tap(...(await cardPoint(wi)));
      await wait(150);
      pv = await p.evaluate(() => window.deck.preview());
      await shot('18-weather-preview');
      await tap(...(await plotPoint(6)));
      await wait(500);
      t = await step(`day ${st.day}, weather played`);
      check(`${label}: the weather lesson ends when it is played; the clipping lies by the lantern`, t.done.includes('weather') && t.pieces.tonight, JSON.stringify(pv?.marks?.length));
      continue;
    }
    // Nothing to learn this moment: play the bot's choices, by touch or mouse, then the lantern.
    for (let k = 0; k < 8; k++) {
      const sug = await p.evaluate(() => window.deck.suggest());
      if (!sug) break;
      const uid = await p.evaluate((h) => window.deck.state().hand[h].uid, sug.h);
      const cp = await cardPoint(sug.h);
      if (!cp) break;
      await tap(...cp);
      if (sug.plot === null) await tap(...(await plotPoint(6)));
      else {
        await tap(...(await plotPoint(sug.plot)));
        if (sug.to !== undefined && sug.to !== null) await tap(...(await plotPoint(sug.to)));
      }
      await wait(500);
      if (await p.evaluate((uid) => window.deck.state().hand.some((c) => c.uid === uid), uid)) {
        await p.evaluate(() => window.deck.table.putDown(true));
        break;
      }
      const now = await table();
      if (now.lesson && now.lesson !== l) break;
    }
    const again = await table();
    if (again.lesson && again.lesson !== l && !again.done.includes(again.lesson)) continue;
    if (touch) await tap(...(await center('.sb-lantern')));
    else await p.keyboard.press('KeyE');
    await wait(300);
    await idle();
    await wait(200);
  }
  nightBrought.add('coins');
  await wait(400);

  // ---------------------------------------------------------------- the season's end: coins and the stall
  t = await step('season end');
  const cleared = t.phase === 'shop';
  check(`${label}: the guided season can be met`, cleared, `${t.phase}, ${await p.evaluate(() => window.deck.tally())}`);
  if (cleared) {
    await wait(300);
    t = await step('the stall');
    await shot('19-stall');
    check(`${label}: the stall's lesson: buy a seed`, /coins/i.test(t.line), t.line);
    check(`${label}: the first stall shows only the goods`, !t.pieces.pages && !t.pieces.services);
    const before = await p.evaluate(() => window.deck.state().coins);
    const idx = await p.evaluate(() => window.deck.state().shop.cards.findIndex((c) => c.price <= window.deck.state().coins));
    if (touch) {
      const sel = `.sb-good:nth-child(${idx + 1})`;
      await tap(...(await center(sel)));
      await tap(...(await center(sel)));
    } else {
      for (let k = 0; k < 20; k++) {
        if (await p.evaluate((idx) => document.activeElement === document.querySelectorAll('.sb-good')[idx], idx)) break;
        await p.keyboard.press('ArrowDown');
      }
      await p.keyboard.press('Enter');
      await p.keyboard.press('Enter');
    }
    await wait(300);
    const after = await p.evaluate(() => window.deck.state().coins);
    t = await step('the stall, bought');
    check(`${label}: bought a seed; the lesson ends`, after < before && t.done.includes('coins'), `${before} to ${after}`);
    await p.evaluate(() => document.querySelector('.sb-signpost').scrollIntoView({ block: 'center' }));
    if (touch) await tap(...(await center('.sb-signpost')));
    else await p.mouse.click(...(await center('.sb-signpost')));
    await wait(400);
    t = await step('summer, day 1');
    check(`${label}: on to summer`, t.phase === 'day' && t.season === 1);
    await shot('20-summer');
    // Reload mid-season: the lessons and pieces come back as they were.
    const was = await p.evaluate(() => ({ done: window.deck.table.tutor.learn.done.join(), seen: window.deck.pieces().sort().join() }));
    await p.evaluate(() => window.deck.table.save());
    await p.goto(`${base}/?game=deck`);
    await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
    await wait(400);
    const now = await p.evaluate(() => ({ done: window.deck.table.tutor.learn.done.join(), seen: window.deck.pieces().sort().join() }));
    check(`${label}: lessons survive a reload`, JSON.stringify(was) === JSON.stringify(now), now.seen);
    // The second and third stalls bring the pages, then the services.
    for (const [n, want] of [[2, 'pages'], [3, 'services']]) {
      await p.evaluate(async () => {
        const d = window.deck;
        const w = (ms) => new Promise((r) => setTimeout(r, ms));
        d.state().earned = 999;
        d.state().coins = 400;
        while (d.state().phase === 'day') {
          d.endDay();
          d.skip();
          await w(40);
        }
      });
      await wait(500);
      t = await step(`stall ${n}`);
      await shot(`21-stall-${n}`);
      check(`${label}: stall ${n} brings the ${want}, with its line`, t.pieces[want] && t.lesson === want && t.line.length > 0, `${t.line}`);
      if (n === 2) check(`${label}: still no services at stall 2`, !t.pieces.services);
      await p.evaluate(() => window.deck.shop.leave());
      await wait(300);
    }
  }

  // ---------------------------------------------------------------- words and faces
  const notes = await p.evaluate(() => window.__notes);
  const long = [...lines, ...notes].filter((s) => words(s) > 8);
  check(`${label}: every note is one short line (eight words at most)`, long.length === 0, long.length ? long.join(' | ') : `${lines.size} lesson lines, ${notes.length} notes`);
  if (label === 'phone') {
    const faces = await p.evaluate(() => {
      const ids = ['radish', 'carrot', 'lettuce', 'beans', 'corn', 'sunflower', 'pumpkin', 'strawberry', 'mint', 'garlic', 'wheat', 'chili', 'can', 'compost', 'fertiliser', 'trowel', 'shears', 'ladybirds', 'scarecrow', 'beehive', 'rain', 'sun', 'storm'];
      const o = {};
      for (const id of ids) for (const up of [false, true]) o[`${id}${up ? '+' : ''}`] = window.deck.faceText(id, up);
      return o;
    });
    // Allowed: the name, numbers and signs, Free, the Select stamp, the forecast masthead.
    const sentences = [];
    for (const [k, texts] of Object.entries(faces)) for (const s of texts) if (/[a-z]{2,}.*\s.*[a-z]{2,}/i.test(s) && !/^(THE FORECAST|WATERING CAN)$/i.test(s) && !/^Watering Can$/.test(s)) sentences.push(`${k}: "${s}"`);
    check('card faces carry no sentences, only a name, numbers and pictures', sentences.length === 0, sentences.length ? sentences.slice(0, 4).join(', ') : `${Object.keys(faces).length} faces, e.g. radish: ${faces.radish.join(' | ')}`);
  }
  check(`${label}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  writeFileSync(`${out}/steps-${label}.json`, JSON.stringify(steps, null, 1));
  await ctx.close();
}

/** A returning player (a finished run, from a save made before the lessons) gets the whole table and no guided deals. */
async function returning() {
  const ctx = await b.newContext({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  // Finish a run: miss the quota.
  await p.evaluate(async () => {
    const d = window.deck;
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    d.learnAll();
    d.table.tutor.learn.done = d.table.tutor.learn.done.filter((x) => x !== 'can');
    while (d.state().phase === 'day') {
      d.state().earned = 0;
      d.endDay();
      d.skip();
      await w(30);
    }
  });
  await p.waitForTimeout(400);
  const runs = await p.evaluate(() => window.deck.table.meta.runs);
  await p.evaluate(() => document.querySelector('.sb-entry .sb-plain').click());
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => ({ hand: window.deck.state().hand.length, script: window.deck.state().script.length, seen: window.deck.pieces().length }));
  check('returning player: a finished run skips the guided season', runs === 1 && s.hand === 5 && s.script === 0, JSON.stringify(s));
  check('returning player: the whole table is there', s.seen >= 9, `${s.seen} pieces`);
  await p.screenshot({ path: `${out}/returning-first.png` });
  // An older save (no lessons recorded) loads with everything in, and a refresher for the can.
  await p.evaluate(() => {
    const t = window.deck.table;
    const data = t.saveData();
    delete data.learn;
    data.taught = 6;
    localStorage.setItem('__deck_old', JSON.stringify(data));
  });
  const legacy = await p.evaluate(() => {
    const t = window.deck.table;
    const data = JSON.parse(localStorage.getItem('__deck_old'));
    t.load(data);
    return { seen: window.deck.pieces().length, done: t.tutor.learn.done.includes('can'), refresh: !t.tutor.learn.done.includes('can') && !t.tutor.learn.done.includes('weather') };
  });
  check('an older save: everything on the table, a refresher for the can and the weather', legacy.seen >= 9 && legacy.refresh, JSON.stringify(legacy));
  await ctx.close();
}

await session('phone', { width: 412, height: 838 }, true);
await session('desk', { width: 1280, height: 800 }, false);
await returning();
await b.close();
console.log(failed ? `LESSONS FAILED (${failed})` : 'LESSONS OK', `shots in ${out}`);
process.exit(failed ? 1 : 0);
