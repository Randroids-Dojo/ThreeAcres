// Seedbound on a desktop: plays seasons through the real UI at 1280 by 800,
// alternating mouse days (hover, click, drag, click the lantern) and keyboard
// days (1 to 7, arrows, Enter, E, Space to skip, Esc), and works the market
// stall with the keyboard alone. Checks on-screen totals against the rules
// and the console for errors.
// node scripts/deck-desktop.mjs [base url] [days]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5252';
const wantDays = Number(process.argv[3] ?? 12);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
p.on('console', (m) => m.type() === 'error' && errs.push(`console ${m.text()}`));
const wait = (ms) => p.waitForTimeout(ms);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const cardPoint = (i) =>
  p.evaluate((i) => {
    const t = window.deck.table;
    const el = t.handEls.get(t.run.hand[i].uid)?.el;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (const fx of [0.5, 0.3, 0.7, 0.15]) for (const fy of [0.45, 0.3, 0.6]) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y)?.closest('.sb-card') === el) return [x, y];
    }
    return null;
  }, i);
const plotPoint = (i) => p.evaluate((i) => { const r = window.deck.rects().plots[i]; return [r.left + r.width / 2, r.top + r.height * 0.6]; }, i);
const center = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const ready = () => p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 15000 });
async function cursorTo(i) {
  const { cur, cols } = await p.evaluate(() => ({ cur: window.deck.table.cursor, cols: window.deck.state().cols }));
  const dc = (i % cols) - (cur % cols);
  const dr = Math.floor(i / cols) - Math.floor(cur / cols);
  for (let k = 0; k < Math.abs(dc); k++) await p.keyboard.press(dc > 0 ? 'ArrowRight' : 'ArrowLeft');
  for (let k = 0; k < Math.abs(dr); k++) await p.keyboard.press(dr > 0 ? 'ArrowDown' : 'ArrowUp');
}

await p.goto(`${base}/?game=deck&fresh`);
await ready();
// A returning player's table: every piece in, no guided deals (scripts/deck-lessons.mjs plays the guided season).
await p.evaluate(() => {
  window.deck.learnAll();
  window.deck.seed(4242);
});
await wait(300);

// Hover lifts a card and, after a moment, holds it up to read.
{
  const [x, y] = await cardPoint(2);
  const before = await p.evaluate(() => window.deck.rects().cards[2].top);
  await p.mouse.move(x, y);
  await wait(600);
  const after = await p.evaluate(() => window.deck.rects().cards[2].top);
  check('hover lifts a card', after < before - 5, `${before.toFixed(0)} to ${after.toFixed(0)}`);
  check('hover shows the card to read', await p.evaluate(() => document.querySelector('.sb-detail.on.hover') !== null));
  await p.mouse.move(640, 300);
  await wait(200);
  check('moving off puts it away', await p.evaluate(() => document.querySelector('.sb-detail.on') === null));
}
// Esc opens the almanac and closes it.
await p.keyboard.press('Escape');
await wait(100);
check('Esc opens the almanac', await p.evaluate(() => window.deck.table.sheets.kind === 'menu'));
await p.keyboard.press('Escape');
await wait(100);
check('Esc closes it', await p.evaluate(() => !window.deck.table.sheets.open));
// A number key takes a card up and Esc puts it down.
await p.keyboard.press('1');
check('1 takes up the first card', await p.evaluate(() => window.deck.table.held?.uid === window.deck.state().hand[0].uid));
await p.keyboard.press('Escape');
check('Esc puts it down', await p.evaluate(() => !window.deck.table.held));

let days = 0;
let mousePlays = 0;
let keyPlays = 0;
let drags = 0;
let failed = 0;
let nightsOk = 0;
let nights = 0;
let shopDone = false;
while (days < wantDays) {
  const phase = await p.evaluate(() => window.deck.state().phase);
  if (phase === 'shop') {
    // Keyboard only: arrows to an affordable good, Enter to look, Enter to buy, then on to the signpost.
    const s = await p.evaluate(() => window.deck.state());
    const idx = s.shop.cards.findIndex((c) => !c.sold && c.price <= s.coins);
    if (idx >= 0) {
      for (let k = 0; k < 30; k++) {
        await p.keyboard.press('ArrowDown');
        const on = await p.evaluate((idx) => document.activeElement === document.querySelectorAll('.sb-good')[idx], idx);
        if (on) break;
      }
      await p.keyboard.press('Enter');
      await wait(60);
      await p.keyboard.press('Enter');
      await wait(60);
      const after = await p.evaluate(() => window.deck.state());
      check('the stall sells by keyboard', after.coins === s.coins - s.shop.cards[idx].price, `${s.coins} to ${after.coins}`);
    }
    for (let k = 0; k < 40; k++) {
      const on = await p.evaluate(() => document.activeElement?.classList.contains('sb-signpost'));
      if (on) break;
      await p.keyboard.press('ArrowDown');
    }
    await p.keyboard.press('Enter');
    await wait(200);
    check('Enter on the signpost moves on', (await p.evaluate(() => window.deck.state().phase)) === 'day');
    shopDone = true;
    continue;
  }
  if (phase === 'over') {
    const pt = await center('.sb-entry .sb-plain');
    await p.mouse.click(...pt);
    await wait(300);
    continue;
  }
  const keyDay = days % 2 === 1;
  for (let k = 0; k < 9; k++) {
    const sug = await p.evaluate(() => window.deck.suggest());
    if (!sug) break;
    const uid = await p.evaluate((h) => window.deck.state().hand[h].uid, sug.h);
    if (keyDay) {
      await p.keyboard.press(String(sug.h + 1));
      if (sug.plot === null) await p.keyboard.press('Enter');
      else {
        await cursorTo(sug.plot);
        await p.keyboard.press('Enter');
        if (sug.to !== undefined && sug.to !== null) {
          await cursorTo(sug.to);
          await p.keyboard.press('Enter');
        }
      }
      keyPlays++;
    } else {
      const cp = await cardPoint(sug.h);
      const target = await plotPoint(sug.plot ?? 5);
      if ((k + days) % 2 === 0 && (sug.to === undefined || sug.to === null)) {
        await p.mouse.move(...cp);
        await p.mouse.down();
        for (let i = 1; i <= 10; i++) await p.mouse.move(cp[0] + ((target[0] - cp[0]) * i) / 10, cp[1] + ((target[1] - cp[1]) * i) / 10);
        await p.mouse.up();
        drags++;
      } else {
        await p.mouse.click(...cp);
        await p.mouse.click(...target);
        if (sug.to !== undefined && sug.to !== null) await p.mouse.click(...(await plotPoint(sug.to)));
      }
      mousePlays++;
    }
    await wait(650);
    const gone = await p.evaluate((uid) => !window.deck.state().hand.some((c) => c.uid === uid), uid);
    if (!gone) {
      failed++;
      console.log('  refused', JSON.stringify(sug), keyDay ? 'keys' : 'mouse');
      await p.keyboard.press('Escape');
      if (await p.evaluate(() => window.deck.table.sheets.open)) await p.keyboard.press('Escape');
      break;
    }
  }
  const rb = await p.evaluate(() => window.deck.ruleScores().length);
  const sb = await p.evaluate(() => window.deck.shownScores().length);
  if (keyDay) await p.keyboard.press('KeyE');
  else await p.mouse.click(...(await center('.sb-lantern')));
  await wait(150);
  if (keyDay && (await p.evaluate(() => window.deck.busy()))) {
    await wait(500);
    await p.keyboard.press('Space');
  }
  await p.waitForFunction(() => !window.deck.busy(), null, { timeout: 30000 });
  await wait(100);
  const chk = await p.evaluate(([rb, sb]) => {
    const d = window.deck;
    const s = d.state();
    return { rule: d.ruleScores().slice(rb), shown: d.shownScores().slice(sb), tally: d.tally(), want: s.phase === 'day' ? `${s.earned} of ${s.quota}` : null };
  }, [rb, sb]);
  nights++;
  if (JSON.stringify(chk.rule) === JSON.stringify(chk.shown) && (chk.want === null || chk.tally === chk.want)) nightsOk++;
  else console.log('  night mismatch', JSON.stringify(chk));
  days++;
}
check(`${days} days played by mouse and keyboard`, days >= wantDays, `${mousePlays} mouse plays (${drags} drags), ${keyPlays} keyboard plays`);
check('every play landed', failed === 0, `${failed} refused`);
check('night totals on screen equal the rules', nightsOk === nights, `${nightsOk} of ${nights}`);
check('worked the stall by keyboard', shopDone);
check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
