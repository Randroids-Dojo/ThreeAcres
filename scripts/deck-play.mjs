// Seedbound on a phone: plays whole seasons through the real UI with real touch
// events (CDP Input.dispatchTouchEvent) at 412 by 900. The balance bot picks
// each play; this script carries it out by tapping or dragging the card onto
// its plot and blowing out the lantern. Checks along the way:
//   - every play lands, by tap and by drag; long-press shows a card up close
//   - the totals the night shows equal the rules' harvests, and the ledger equals the run
//   - the market stall works by touch
//   - saving and reloading mid-season restores the run exactly
//   - pausing and resuming through the shell stops and restarts the table
//   - no console errors
// node scripts/deck-play.mjs [base url] [days]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5252';
const wantDays = Number(process.argv[3] ?? 14);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.6, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
p.on('console', (m) => m.type() === 'error' && errs.push(`console ${m.text()}`));
const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) });
const wait = (ms) => p.waitForTimeout(ms);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

async function tap(x, y, hold = 50) {
  await touch('touchStart', [[x, y, 1]]);
  await wait(hold);
  await touch('touchEnd', []);
  await wait(60);
}
async function drag(x0, y0, x1, y1) {
  await touch('touchStart', [[x0, y0, 2]]);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [[x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12, 2]]);
    await wait(16);
  }
  await wait(40);
  await touch('touchEnd', []);
  await wait(60);
}
/** A point on hand card i that is really on top (cards overlap in the fan). */
const cardPoint = (i) =>
  p.evaluate((i) => {
    const t = window.deck.table;
    const c = t.run.hand[i];
    const el = t.handEls.get(c.uid)?.el;
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
const plotPoint = (i) => p.evaluate((i) => { const r = window.deck.rects().plots[i]; return [r.left + r.width / 2, r.top + r.height * 0.6]; }, i);
const center = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const state = () => p.evaluate(() => JSON.parse(JSON.stringify(window.deck.state())));
const ready = () => p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 15000 });

// Record every audio cue and mood the game sends, through the shell's engine.
const hookAudio = () =>
  p.evaluate(() => {
    const a = window.shell.audio;
    if (a.__deckHooked) return;
    a.__deckHooked = true;
    window.__cues = [];
    window.__moods = [];
    const cue = a.cue.bind(a);
    const mood = a.mood.bind(a);
    a.cue = (name, opts) => {
      window.__cues.push([name, opts?.pitch ?? null]);
      return cue(name, opts);
    };
    a.mood = (m) => {
      if (m.game === 'deck') window.__moods.push([performance.now(), m.intensity, m.scene, m.season]);
      if (window.__moods.length > 4000) window.__moods.splice(0, 2000);
      return mood(m);
    };
  });
await p.goto(`${base}/?game=deck&fresh`);
await ready();
await hookAudio();
await wait(300);
check('the first day deals the teaching hand', (await p.evaluate(() => window.deck.state().hand.map((c) => c.id).join())) === 'carrot,radish,radish,can,lettuce');
check('a lesson shows on the first day', await p.evaluate(() => document.querySelector('.sb-hint')?.classList.contains('on')));

// Long-press a card: it comes up close; a tap puts it back.
{
  const [x, y] = await cardPoint(0);
  await tap(x, y, 650);
  check('long-press shows the card up close', await p.evaluate(() => document.querySelector('.sb-detail')?.classList.contains('on')));
  await tap(206, 300);
  check('a tap puts it back', !(await p.evaluate(() => document.querySelector('.sb-detail')?.classList.contains('on'))));
  check('long-press did not take the card up', await p.evaluate(() => !window.deck.table.held));
}

let days = 0;
let plays = 0;
let drags = 0;
let tapsPlays = 0;
let nightsChecked = 0;
let nightsOk = 0;
let shopVisits = 0;
let reloadDone = false;
let pauseDone = false;
let skipped = 0;
let failedPlays = 0;
let runs = 1;
const intensityPeaks = [];

while (days < wantDays) {
  const phase = await p.evaluate(() => window.deck.state().phase);
  if (phase === 'shop') {
    shopVisits++;
    // Buy the first affordable thing by touch: tap to look, tap again to buy.
    const before = await state();
    const idx = before.shop.cards.findIndex((c) => !c.sold && c.price <= before.coins);
    if (idx >= 0) {
      const sel = `.sb-good:nth-child(${idx + 1})`;
      let pt = await center(sel);
      await tap(pt[0], pt[1]);
      pt = await center(sel);
      await tap(pt[0], pt[1]);
      const after = await state();
      check('the stall sells a card by touch', after.coins === before.coins - before.shop.cards[idx].price && after.draw.length === before.draw.length + 1, `${before.coins} to ${after.coins}`);
    }
    const sp = await center('.sb-signpost');
    await p.evaluate(() => document.querySelector('.sb-signpost')?.scrollIntoView({ block: 'center' }));
    const sp2 = await center('.sb-signpost');
    await tap(...(sp2 ?? sp));
    await wait(200);
    check('the signpost leads on to the next season', (await p.evaluate(() => window.deck.state().phase)) === 'day');
    continue;
  }
  if (phase === 'over') {
    check('the run ends in an almanac entry', await p.evaluate(() => !!document.querySelector('.sb-entry')));
    const pt = await center('.sb-entry .sb-plain');
    await tap(...pt);
    await wait(300);
    check('a fresh page starts a new run', (await p.evaluate(() => window.deck.state().phase)) === 'day');
    runs++;
    continue;
  }

  // Play the bot's choices for the day.
  for (let k = 0; k < 9; k++) {
    const sug = await p.evaluate(() => window.deck.suggest());
    if (!sug) break;
    const before = await p.evaluate(() => ({ hand: window.deck.state().hand.length, energy: window.deck.state().energy, uid: window.deck.state().hand.map((c) => c.uid) }));
    const cp = await cardPoint(sug.h);
    if (!cp) {
      failedPlays++;
      break;
    }
    const isBoard = sug.plot === null;
    const move = sug.to !== undefined && sug.to !== null;
    if (move) {
      await tap(...cp);
      await tap(...(await plotPoint(sug.plot)));
      await tap(...(await plotPoint(sug.to)));
      tapsPlays++;
    } else if (isBoard) {
      const bp = await plotPoint(5);
      if ((plays + days) % 2) {
        await drag(...cp, ...bp);
        drags++;
      } else {
        await tap(...cp);
        await tap(...bp);
        tapsPlays++;
      }
    } else if ((plays + days) % 3 === 1) {
      await drag(...cp, ...(await plotPoint(sug.plot)));
      drags++;
    } else {
      await tap(...cp);
      await tap(...(await plotPoint(sug.plot)));
      tapsPlays++;
    }
    await wait(650);
    const after = await p.evaluate(() => ({ hand: window.deck.state().hand.map((c) => c.uid) }));
    const gone = before.uid[sug.h] !== undefined && !after.hand.includes(before.uid[sug.h]);
    if (gone) plays++;
    else {
      failedPlays++;
      await p.evaluate(() => window.deck.table.putDown(true));
      break;
    }
  }

  // Mid-season of the second season: save and reload must restore the run exactly.
  const st = await state();
  if (!reloadDone && (st.season > 0 || st.year > 1) && st.day === 3) {
    await p.evaluate(() => window.deck.table.save());
    const before = JSON.stringify(st);
    const tallyBefore = await p.evaluate(() => window.deck.tally());
    const cuesSoFar = await p.evaluate(() => window.__cues);
    await p.goto(`${base}/?game=deck`);
    await ready();
    await hookAudio();
    await p.evaluate((c) => window.__cues.push(...c), cuesSoFar);
    await wait(300);
    const after = JSON.stringify(await state());
    check('reload mid-season restores the run exactly', before === after, `${before.length} bytes`);
    check('the ledger after reload matches', tallyBefore === (await p.evaluate(() => window.deck.tally())), tallyBefore);
    reloadDone = true;
  }

  // End the day by blowing out the lantern.
  const lp = await center('.sb-lantern');
  const ruleBefore = await p.evaluate(() => window.deck.ruleScores().length);
  const shownBefore = await p.evaluate(() => window.deck.shownScores().length);
  await tap(...lp);
  await wait(100);
  const started = await p.evaluate(() => window.deck.busy());
  if (!started && (await p.evaluate(() => window.deck.state().phase)) === 'day') {
    check('the lantern ends the day', false);
    break;
  }
  // Pause and resume through the shell in the middle of a night, once.
  if (!pauseDone && started) {
    await wait(300);
    await p.evaluate(() => window.shell.show());
    const f0 = await p.evaluate(() => window.deck.frames());
    const t0 = await p.evaluate(() => window.deck.table.seq?.t ?? -1);
    await wait(400);
    const f1 = await p.evaluate(() => window.deck.frames());
    const t1 = await p.evaluate(() => window.deck.table.seq?.t ?? -1);
    check('the shell pauses the table', f1 === f0 && t1 === t0, `frames ${f0} to ${f1}`);
    await p.evaluate(() => window.shell.hide());
    await wait(300);
    const f2 = await p.evaluate(() => window.deck.frames());
    check('the shell resumes it where it was', f2 > f1 && (await p.evaluate(() => window.deck.busy())), `frames ${f1} to ${f2}`);
    pauseDone = true;
  }
  // Every third night, tap to skip the cascade.
  if (days % 3 === 2) {
    await wait(700);
    if (await p.evaluate(() => window.deck.busy())) {
      await tap(206, 300);
      skipped++;
    }
  }
  if (days === 0 || days === 4) {
    // Music intensity should rise towards 1 while a cascade runs.
    await p.waitForFunction(() => !window.deck.busy(), null, { timeout: 30000 });
    const peak = await p.evaluate(() => Math.max(...window.__moods.slice(-400).map((m) => m[1])));
    intensityPeaks.push(peak);
  }
  await p.waitForFunction(() => !window.deck.busy(), null, { timeout: 30000 });
  await wait(120);
  const chk = await p.evaluate(([rb, sb]) => {
    const d = window.deck;
    const s = d.state();
    return {
      rule: d.ruleScores().slice(rb),
      shown: d.shownScores().slice(sb),
      tally: d.tally(),
      want: s.phase === 'day' ? `${s.earned} of ${s.quota}` : null,
      purse: document.querySelector('.sb-purse b')?.textContent,
      coins: s.coins,
    };
  }, [ruleBefore, shownBefore]);
  nightsChecked++;
  const same = JSON.stringify(chk.rule) === JSON.stringify(chk.shown) && (chk.want === null || chk.tally === chk.want) && Number(chk.purse) === chk.coins;
  if (same) nightsOk++;
  else console.log('  night mismatch', JSON.stringify(chk));
  days++;
}

check(`${days} days played through touch`, days >= wantDays, `${plays} plays: ${tapsPlays} by tap, ${drags} by drag; ${failedPlays} refused`);
check('every play the bot chose landed', failedPlays === 0);
check('night totals on screen equal the rules', nightsOk === nightsChecked, `${nightsOk} of ${nightsChecked} nights, ${skipped} skipped by a tap`);
check('visited the market', shopVisits > 0, `${shopVisits} visits, ${runs} runs`);
check('reload was tested', reloadDone);
check('pause was tested', pauseDone);
// Cue names must be the deck's names from docs/AUDIO_CUES.md, and harvests pitch-step.
const KNOWN = ['deck.draw', 'deck.shuffle', 'deck.hover', 'deck.pick', 'deck.drop', 'deck.play', 'deck.plant', 'deck.water', 'deck.weather', 'deck.grow', 'deck.harvest', 'deck.chip', 'deck.mult', 'deck.big', 'deck.quota', 'deck.fail', 'deck.buy', 'deck.page', 'deck.remove', 'deck.reroll', 'deck.pest', 'deck.crow', 'deck.endday', 'deck.deny'];
const cues = await p.evaluate(() => window.__cues);
const names = [...new Set(cues.map((c) => c[0]))].sort();
const unknown = names.filter((n) => !KNOWN.includes(n));
check('every audio cue is a documented deck cue', unknown.length === 0, `${names.length} names used: ${names.map((n) => n.slice(5)).join(', ')}${unknown.length ? `; unknown ${unknown}` : ''}`);
const pitches = cues.filter((c) => c[0] === 'deck.harvest').map((c) => c[1]);
check('harvest cues step their pitch', pitches.every((x) => typeof x === 'number') && new Set(pitches).size > 2, `${new Set(pitches).size} distinct pitches over ${pitches.length} harvests`);
const moods = await p.evaluate(() => window.__moods.length);
check('mood is sent every frame', moods > 100, `${moods} recorded`);
check('music intensity rises to about 1 in a cascade', intensityPeaks.length > 0 && intensityPeaks.every((x) => x > 0.9), intensityPeaks.map((x) => x.toFixed(2)).join(', '));
check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
