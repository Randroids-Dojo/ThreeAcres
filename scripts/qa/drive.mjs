// Drive the game with real input and report what happened.
// node scripts/qa/drive.mjs <scenario> [w h]
import { chromium } from 'playwright-core';
const [, , scenario = 'sunup', w = '1280', h = '800'] = process.argv;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text()));
const snap = () => p.evaluate(() => { const s = window.acres.state(); const f = s.actors[0]; return { day: s.day, min: Math.round(s.minute), coins: s.coins, stam: s.stamina, ap: s.ap, f: [f.x.toFixed(2), f.y.toFixed(2), f.facing], harvested: Object.values(s.stats.harvested).reduce((a, b) => a + b, 0), jobs: s.jobs.length, hands: s.actors.length - 1, rules: Object.values(s.rules).join(',') }; });
const events = () => p.evaluate(() => { const c = {}; for (const e of window.acres.director.events) c[e.type] = (c[e.type] || 0) + 1; return c; });
await p.goto(`http://localhost:5247/?preset=${scenario === 'mixer' ? 'sunup' : scenario}&fresh`);
await p.waitForFunction(() => window.acres && window.acres.director.frames > 10, null, { timeout: 20000 });
console.log('start', JSON.stringify(await snap()));
if (scenario === 'sunup') {
  // Walk down to the radishes, face them, pull them with Space.
  await p.keyboard.down('KeyS'); await p.waitForTimeout(250); await p.keyboard.up('KeyS');
  console.log('after S', JSON.stringify(await snap()));
  for (const k of ['KeyA', 'KeyD']) { await p.keyboard.down(k); await p.waitForTimeout(120); await p.keyboard.up(k); }
  await p.keyboard.down('KeyS'); await p.waitForTimeout(60); await p.keyboard.up('KeyS');
  await p.keyboard.press('Space'); await p.waitForTimeout(500);
  await p.keyboard.down('KeyD'); await p.waitForTimeout(240); await p.keyboard.up('KeyD');
  await p.keyboard.press('KeyS'); await p.keyboard.press('Space'); await p.waitForTimeout(500);
  console.log('after acting', JSON.stringify(await snap()));
  await p.keyboard.press('Digit3'); await p.keyboard.press('Space'); await p.waitForTimeout(500);
  console.log('after can', JSON.stringify(await snap()));
  await p.keyboard.press('Enter'); await p.waitForTimeout(3200);
  console.log('after sleep', JSON.stringify(await snap()));
} else if (scenario === 'bushel') {
  await p.waitForTimeout(500);
  await p.click('.speed button:nth-child(4)');
  await p.waitForTimeout(8000);
  console.log('after 8s at 4x', JSON.stringify(await snap()));
} else if (scenario === 'mixer') {
  await p.keyboard.press('KeyM'); await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/acres-mixer.png' });
  await p.click('.seg button[data-axis="clock"][data-value="turns"]'); await p.waitForTimeout(300);
  await p.click('.seg button[data-axis="view"][data-value="2d"]'); await p.waitForTimeout(700);
  await p.click('.preset[data-preset="bushel"]'); await p.waitForTimeout(700);
  console.log('after mixer', JSON.stringify(await snap()));
  await p.screenshot({ path: '/tmp/acres-mixer2.png' });
  await p.keyboard.press('Escape'); await p.keyboard.press('KeyB'); await p.waitForTimeout(400);
  await p.screenshot({ path: '/tmp/acres-board.png' });
}
console.log('events', JSON.stringify(await events()));
await p.screenshot({ path: `/tmp/acres-drive-${scenario}.png` });
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
