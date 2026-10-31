// Seedbound contact sheet: the guided first screen, a full plot mid-day, a scoring
// cascade, the market stall, the run's almanac entry, a card up close and the
// almanac menu, at phone (412 by 900) and desktop (1280 by 800) sizes, plus
// every card face. Writes /tmp/deck/shots/*.png and /tmp/deck/contact-*.png.
// node scripts/deck-shots.mjs [base url]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5252';
const out = '/tmp/deck/shots';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const errs = [];

const STAGE = `(() => {
  const d = window.deck; d.learnAll(); d.seed(4242);
  const s = d.state();
  s.season = 1; s.day = 3; s.earned = 38; s.coins = 71; s.quota = 55; s.pages = ['bees', 'market'];
  const days = { radish: 1, carrot: 2, lettuce: 2, beans: 3, corn: 4, sunflower: 3, pumpkin: 5, strawberry: 3, mint: 2, garlic: 2, wheat: 3, chili: 2 };
  const put = (i, kind, age, extra = {}) => { s.plots[i].crop = { uid: 900 + i, kind, age, days: days[kind], up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false, ...extra }; };
  put(0, 'sunflower', 2); put(1, 'lettuce', 1); put(2, 'corn', 3); put(3, 'beans', 3);
  put(4, 'strawberry', 3, { picks: 1 }); put(5, 'carrot', 1); put(6, 'chili', 1); put(7, 'wheat', 2);
  put(8, 'garlic', 1); put(9, 'radish', 0); put(10, 'mint', 1); put(11, 'pumpkin', 3);
  put(13, 'wheat', 1, { pest: 2 }); put(14, 'carrot', 0);
  s.plots[12].obj = 'beehive'; s.plots[15].obj = 'scarecrow';
  for (const i of [4, 5, 6, 7]) s.plots[i].boost = 1;
  s.hand = [{ uid: 801, id: 'radish', up: false }, { uid: 802, id: 'compost', up: true }, { uid: 803, id: 'rain', up: false }, { uid: 804, id: 'beehive', up: false }, { uid: 805, id: 'pumpkin', up: false }];
  s.energy = 2; s.tonight = ['sun'];
  d.table.syncAll();
})()`;
const HOLD = `(() => { const t = window.deck.table; t.pickUp(t.run.hand[0].uid); t.board.hl.hover = null; })()`;
const BIG = `(() => {
  const d = window.deck; d.learnAll(); d.seed(31337);
  const s = d.state();
  s.pages = ['bees', 'market']; s.season = 2; s.quota = 65; s.earned = 30; s.coins = 160;
  const kinds = ['radish', 'sunflower', 'carrot', 'beans', 'radish', 'carrot', 'beans', 'corn', 'strawberry', 'lettuce', 'sunflower', 'chili', 'wheat', 'wheat', 'pumpkin', 'garlic'];
  const days = { radish: 1, carrot: 2, lettuce: 2, beans: 3, corn: 4, sunflower: 3, pumpkin: 5, strawberry: 3, mint: 2, garlic: 2, wheat: 3, chili: 2 };
  kinds.forEach((kind, i) => { s.plots[i].crop = { uid: 5000 + i, kind, age: days[kind] - 1, days: days[kind], up: i % 3 === 0, compost: i % 4 === 0 ? 1 : 0, rot: false, picks: 0, pest: 0, sprout: false }; });
  s.tonight = ['sun'];
  d.table.syncAll();
})()`;
const SEASON_OUT = (earned) => `(async () => {
  const d = window.deck; const w = (ms) => new Promise((r) => setTimeout(r, ms));
  d.learnAll(); d.seed(4243);
  d.state().earned = ${earned}; d.state().coins = Math.max(d.state().coins, 130);
  while (d.state().phase === 'day') { d.endDay(); d.skip(); await w(30); }
})()`;
const ENTRY = `(async () => {
  const d = window.deck; const w = (ms) => new Promise((r) => setTimeout(r, ms));
  d.learnAll(); d.seed(778);
  for (const e of [52, 61, 70]) { d.state().earned = e; while (d.state().phase === 'day') { d.endDay(); d.skip(); await w(30); } if (d.state().phase === 'shop') d.shop.leave(); }
  d.state().earned = 31; d.state().stats.bestHarvest = 34; d.state().stats.bestKind = 'carrot'; d.state().stats.totalEarned = 214; d.state().stats.harvests = 61;
  while (d.state().phase === 'day') { d.endDay(); d.skip(); await w(30); }
})()`;

const shots = [
  ['start', [], 0],
  ['board', [STAGE], 0],
  ['held', [STAGE, HOLD], 0],
  ['cascade', [BIG, 'window.deck.endDay()'], 2300],
  ['stall', [SEASON_OUT(60)], 0],
  ['entry', [ENTRY], 0],
  ['detail', ['(() => { const t = window.deck.table; t.sheets.detail(t.run.hand[0]); })()'], 0],
  ['almanac', ['window.deck.table.sheets.menu()'], 0],
];

async function take(w, h, tag) {
  const files = [];
  for (const [name, steps, delay] of shots) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: w < 700, isMobile: w < 700 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${tag} ${name}: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && errs.push(`${tag} ${name}: ${m.text()}`));
    await p.goto(`${base}/?game=deck&fresh`);
    await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 15000 });
    await p.waitForTimeout(500);
    for (const s of steps) await p.evaluate(s);
    await p.waitForTimeout(delay || 900);
    const file = `${out}/${tag}-${name}.png`;
    await p.screenshot({ path: file });
    files.push(`${file}=${tag} ${name}`);
    await ctx.close();
  }
  return files;
}

const phone = await take(412, 900, 'phone');
const desk = await take(1280, 800, 'desktop');
// Card faces.
{
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(`${base}/?game=deck&deckart`);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/faces.png`, fullPage: true });
  await p.close();
}
await b.close();

// Contact sheets.
const { execFileSync } = await import('node:child_process');
execFileSync('node', ['scripts/deck-sheet.mjs', '/tmp/deck/contact-phone.png', '4', '640', ...phone], { stdio: 'inherit' });
execFileSync('node', ['scripts/deck-sheet.mjs', '/tmp/deck/contact-desktop.png', '3', '420', ...desk], { stdio: 'inherit' });
console.log(errs.length ? errs.join('\n') : 'no errors');
void readFileSync;
