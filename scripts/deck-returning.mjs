// Seedbound, round 8: a returning player's second run. On a 412 by 838 phone with real touch and a 1280 by 800
// desktop with the mouse, it starts a new player's guided run, plays its first days through the game's hooks, ends
// it (a missed quota), turns to a fresh page from the run's entry with a real tap, and checks the second run:
//   - every piece of the table a lesson brings in is on the table from its first dawn (the spent heap, tonight's
//     weather, the scoops, the tin, the pegboard, the purse, the lantern), as pieces and as visible elements: the
//     eighth playtest's guided run ended after 42 days without the heap or the weather, and runs 2 to 4 never had it
//   - the loss ledger lists each season's twist, as the won page does
//   - the run's first stall says to pick one engine and that it is free, shows the four cards large enough to read
//     (a face 70 px wide or more on the phone, 120 on the desktop; they were about 50), lays out no tray until one is
//     picked, and sells none of the engines' cards beside the free pick; a real tap picks one and the stall opens
//   - a hand stuck with cards the scoops cannot pay for today brings the spent heap's lesson, in eight words or fewer
//   - round 9: all four engines at the pick
//   - nothing in the shell's corner at any step
// node scripts/deck-returning.mjs [base url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { cornerScan } from './deck-checks.mjs';

const base = process.argv[2] ?? 'http://localhost:5247';
const out = '/tmp/deck-returning';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const PIECES = ['lantern', 'peg', 'scoops', 'bloom', 'coins', 'tin', 'spent', 'tonight', 'pages', 'services'];
const GIFTS = { bees: ['beehive'], hot: ['chili'], vines: ['beans'], tall: ['corn'] };

async function session(label, viewport, touch) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
  const cdp = await ctx.newCDPSession(p);
  const wait = (ms) => p.waitForTimeout(ms);
  const tapAt = async (sel, nth = 0) => {
    const pt = await p.evaluate(
      ([sel, nth]) => {
        const e = document.querySelectorAll(sel)[nth];
        if (!e) return null;
        e.scrollIntoView({ block: 'center' });
        const r = e.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      },
      [sel, nth],
    );
    if (!pt) return false;
    await wait(120);
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt[0], y: pt[1], id: 3, radiusX: 6, radiusY: 6, force: 1 }] });
      await wait(50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await p.mouse.click(pt[0], pt[1]);
    await wait(300);
    return true;
  };
  const corner = async (step) => {
    const hits = await p.evaluate(cornerScan);
    if (hits.length) check(`${label}: the shell's corner is clear (${step})`, false, hits.slice(0, 3).join('; '));
  };
  const shot = (name) => p.screenshot({ path: `${out}/${label}-${name}.png` });

  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  await wait(500);
  if (touch) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 260, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  // A new player's guided run: its first two days played by the bot through the hooks, the way a player would.
  const first = await p.evaluate(() => ({ guided: window.deck.state().guided, pieces: window.deck.pieces() }));
  check(`${label}: a new player's first run is the guided one, with few pieces on the table`, first.guided && first.pieces.length < 5, JSON.stringify(first));
  for (let d = 0; d < 2; d++) {
    for (let k = 0; k < 6; k++) {
      const play = await p.evaluate(() => window.deck.suggest());
      if (!play) break;
      await p.evaluate((pl) => window.deck.play(pl.h, pl.plot, pl.to), play);
      await wait(250);
    }
    await p.evaluate(() => {
      window.deck.endDay();
      window.deck.skip();
    });
    await wait(500);
  }
  // A season in the log with a twist (as a year 2 season would have), then the run ends on a missed quota.
  await p.evaluate(async () => {
    const d = window.deck;
    const s = d.state();
    s.stats.log.push({ year: 2, season: 0, earned: 700, quota: 640, cleared: true, carried: 0, twist: { id: 'glut', crop: 'carrot', ease: 0.2 }, idle: 0 });
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let g = 0; g < 10 && s.phase === 'day'; g++) {
      s.earned = 0;
      d.endDay();
      d.skip();
      await w(60);
    }
  });
  await wait(700);
  const entry = await p.evaluate(() => ({ phase: window.deck.state().phase, kind: window.deck.table.sheets.kind, text: document.querySelector('.sb-entry')?.textContent ?? '', runs: window.deck.table.meta.runs }));
  await shot('1-entry');
  check(`${label}: the guided run ends on a missed quota, with its entry`, entry.phase === 'over' && entry.kind === 'entry' && entry.runs === 1, JSON.stringify({ ...entry, text: entry.text.slice(0, 60) }));
  check(`${label}: the loss ledger lists each season's twist`, /Your carrots sell for half\./.test(entry.text), entry.text.slice(0, 240));
  await corner('the entry');
  // A fresh page, by a real tap.
  await tapAt('.sb-entry-foot .sb-plain');
  await wait(600);
  const second = await p.evaluate((all) => {
    const d = window.deck;
    const s = d.state();
    const shown = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return false;
      for (let a = e; a && a !== document.body; a = a.parentElement) {
        const st = getComputedStyle(a);
        if (st.display === 'none' || st.visibility === 'hidden' || a.classList.contains('sb-off')) return false;
      }
      return true;
    };
    return {
      guided: s.guided,
      phase: s.phase,
      day: s.day,
      missing: all.filter((x) => !d.pieces().includes(x)),
      heap: shown('.sb-heap'),
      tin: shown('.sb-tin'),
      lantern: shown('.sb-lantern'),
      scoops: shown('.sb-scoops'),
      peg: shown('.sb-peg'),
      purse: shown('.sb-purse'),
      tonight: !document.querySelector('.sb-tonight')?.classList.contains('sb-off'),
    };
  }, PIECES);
  await shot('2-second-run');
  check(`${label}: the second run is not guided and starts at its first dawn`, !second.guided && second.phase === 'day' && second.day === 1, JSON.stringify(second));
  check(`${label}: every piece a lesson brings in is earned from the second run's first dawn`, second.missing.length === 0, second.missing.join(', ') || 'all ten');
  check(
    `${label}: the spent heap, the weather, the tin, the scoops, the pegboard, the purse and the lantern are on the table`,
    second.heap && second.tonight && second.tin && second.scoops && second.peg && second.purse && second.lantern,
    JSON.stringify(second),
  );
  await corner('the second run');
  // Through spring to the run's first stall: the engine pick.
  await p.evaluate(async () => {
    const d = window.deck;
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let g = 0; g < 10 && d.state().phase === 'day'; g++) {
      d.state().earned = 99999;
      d.endDay();
      d.skip();
      await w(60);
    }
  });
  await wait(800);
  const stall = await p.evaluate((gifts) => {
    const s = window.deck.state();
    const faces = [...document.querySelectorAll('.sb-enginecard img:first-child')].map((e) => Math.round(e.getBoundingClientRect().width));
    const offered = (s.shop?.engines ?? []).flatMap((id) => gifts[id] ?? []);
    const head = document.querySelector('.sb-engines-head');
    const hr = head?.getBoundingClientRect();
    const cards = [...document.querySelectorAll('.sb-enginecard')].map((e) => e.getBoundingClientRect());
    return {
      phase: s.phase,
      head: head?.textContent ?? '',
      headShown: !!hr && hr.bottom > 0 && hr.top < innerHeight,
      n: cards.length,
      onScreen: cards.every((r) => r.top >= 0 && r.bottom <= innerHeight),
      faces,
      goods: document.querySelectorAll('.sb-good').length,
      engineCards: s.shop.cards.filter((o) => offered.includes(o.card)).map((o) => o.card),
    };
  }, GIFTS);
  await shot('3-engine-stall');
  check(`${label}: the second run's first stall says to pick one and that it is free`, stall.phase === 'shop' && /^Pick one to take home, free\.$/.test(stall.head) && stall.headShown, JSON.stringify({ head: stall.head, shown: stall.headShown }));
  const min = touch ? 70 : 120;
  // Round 9: all four engines on offer (three before; the ninth playtest's runs 2 and 3 were never offered the bees).
  check(`${label}: its four engine cards are large enough to read and all on the screen (faces ${min} px wide or more)`, stall.n === 4 && stall.faces.every((w) => w >= min) && stall.onScreen, `faces ${stall.faces.join(', ')} px, on screen ${stall.onScreen}`);
  check(`${label}: no tray until one is picked, and none of the engines' cards for sale`, stall.goods === 0 && stall.engineCards.length === 0, JSON.stringify({ goods: stall.goods, engineCards: stall.engineCards }));
  await corner('the engine stall');
  await tapAt('.sb-enginecard', 1);
  const picked = await p.evaluate((gifts) => {
    const s = window.deck.state();
    const offered = (s.shop?.engines ?? []).flatMap((id) => gifts[id] ?? []);
    return { i: s.shop.engine, goods: document.querySelectorAll('.sb-good').length, head: !!document.querySelector('.sb-engines-head'), engineCards: s.shop.cards.filter((o) => offered.includes(o.card)).map((o) => o.card) };
  }, GIFTS);
  await shot('4-engine-picked');
  check(`${label}: a real ${touch ? 'tap' : 'click'} picks an engine and the stall opens, still with none of their cards`, picked.i === 1 && picked.goods > 0 && !picked.head && picked.engineCards.length === 0, JSON.stringify(picked));
  await corner('the stall');
  await tapAt('.sb-signpost');
  await wait(600);
  // Summer: a hand of three-scoop corn and one scoop left, nothing else to play. The spent heap's lesson comes.
  const stuck = await p.evaluate(async () => {
    const d = window.deck;
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    d.hand(['corn', 'corn', 'corn']);
    d.state().energy = 1;
    d.table.syncAll();
    await w(500);
    return { season: d.state().season, lesson: d.lesson(), heap: !document.querySelector('.sb-heap').classList.contains('sb-off') };
  });
  await shot('5-stuck-hand');
  const words = (stuck.lesson?.text ?? '').split(/\s+/).filter(Boolean).length;
  check(
    `${label}: a hand stuck with cards too dear today brings the spent heap's lesson, in eight words or fewer`,
    stuck.season === 1 && stuck.lesson?.id === 'spent' && (touch ? /too dear today to Spent/.test(stuck.lesson.text) : /Spent|press X/.test(stuck.lesson.text)) && words <= 8 && stuck.heap,
    JSON.stringify(stuck),
  );
  check(`${label}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

await session('phone', { width: 412, height: 838 }, true);
await session('desktop', { width: 1280, height: 800 }, false);
await b.close();
console.log(failed ? `${failed} failed` : 'all ok');
process.exit(failed ? 1 : 0);
