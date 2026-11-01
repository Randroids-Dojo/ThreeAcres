// The game switcher on a keyboard: Escape and the backquote key open and close it in every game, Tab stays on
// the switcher while it is up, and Enter on a focused card plays that game.
// node scripts/qa/shell-keys.mjs [url]
import { chromium } from 'playwright-core';

const url = process.argv[2] && /^https?:/.test(process.argv[2]) ? process.argv[2].replace(/\/$/, '') : 'http://localhost:5247';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const fails = [];
const ok = (cond, what) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) fails.push(what);
};
const errs = [];

const open = (p) => p.evaluate(() => document.querySelector('.shellover')?.classList.contains('on') ?? false);
const focusInOverlay = (p) => p.evaluate(() => !!document.activeElement && document.querySelector('.shellover').contains(document.activeElement));
const live = (p) => p.evaluate(() => document.querySelector('.gameroot:not(.off)')?.dataset.game ?? 'title');

for (const game of ['homestead', 'ranch', 'deck']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => errs.push(`${game} pageerror ${e.message}`));
  await p.goto(`${url}/?game=${game}&fresh${game === 'ranch' ? '&taught' : ''}`);
  await p.waitForFunction(() => window.shell && document.querySelector('.gameroot:not(.off)'), null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.mouse.click(640, 400);
  await p.waitForTimeout(300);

  await p.keyboard.press('Backquote');
  await p.waitForTimeout(300);
  ok(await open(p), `${game}: the backquote key opens the switcher`);
  ok(await focusInOverlay(p), `${game}: focus moves onto the switcher`);
  let stayed = true;
  for (let i = 0; i < 14; i++) {
    await p.keyboard.press('Tab');
    if (!(await focusInOverlay(p))) stayed = false;
  }
  ok(stayed, `${game}: fourteen Tabs stay on the switcher`);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  ok(!(await open(p)), `${game}: Escape closes the switcher`);
  ok((await live(p)) === game, `${game}: the game is back after Escape`);

  if (game === 'homestead') {
    // Sunup opens the switcher with Escape, so Escape twice must open and then close it.
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    ok(await open(p), 'homestead: Escape opens the switcher');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    ok(!(await open(p)), 'homestead: a second Escape closes it');
    const running = await p.evaluate(async () => {
      const m0 = window.sunup.state.minute;
      await new Promise((r) => setTimeout(r, 1200));
      return window.sunup.state.minute !== m0;
    });
    ok(running, 'homestead: the clock runs again after closing');
  }

  // Enter on a focused card plays it: here the next game's card.
  await p.keyboard.press('Backquote');
  await p.waitForTimeout(300);
  const other = game === 'deck' ? 'homestead' : 'deck';
  await p.evaluate((id) => document.querySelector(`.shellover button.game[data-game="${id}"]`).focus(), other);
  await p.keyboard.press('Enter');
  await p.waitForFunction((id) => document.querySelector(`.gameroot[data-game="${id}"]:not(.off)`) && !document.querySelector('.shellover.on'), other, { timeout: 30000 }).catch(() => {});
  ok((await live(p)) === other && !(await open(p)), `${game}: Enter on the ${other} card plays it`);
  ok(await p.evaluate(() => [...document.querySelectorAll('.gameroot')].every((r) => !r.inert)), `${game}: no game is left inert after closing`);
  await p.close();
}

console.log(errs.length ? errs.join('\n') : 'ok   no page errors');
await b.close();
if (fails.length || errs.length) {
  console.log(`SHELL KEYS FAILED: ${fails.length} checks`);
  process.exit(1);
}
console.log('SHELL KEYS OK');
