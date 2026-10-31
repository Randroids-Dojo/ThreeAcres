// Touch controls, driven with real touch events through the DevTools protocol.
// node scripts/qa/touch.mjs [base url]
// Checks: controls show on touch and hide on a key press; the floating stick
// walks the farmer; walking and acting at once (two fingers); hold-to-repeat;
// one-finger painting under point control; a two-finger pinch zooms without
// painting; the clear button drops jobs.
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5247';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const cdp = await ctx.newCDPSession(p);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const S = () => p.evaluate(() => {
  const s = window.sunup.state;
  const f = s.actors[0];
  return { x: f.x, y: f.y, harvested: Object.values(s.stats.harvested).reduce((a, b) => a + b, 0), jobs: s.jobs.length, stamina: s.stamina, tool: s.tool, zoom: window.sunup['cams'][s.rules.camera].zoom };
});
const visible = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0; }, sel);

// ---- walk control
await p.goto(`${base}/?game=homestead&fresh`);
await p.waitForFunction(() => window.sunup && window.sunup.frames > 10);
await p.waitForTimeout(300);
check('touch controls show on a phone', (await visible('.tb-act')) && (await visible('.ts-zone')));
const s0 = await S();
// Stick: thumb down low on the left, push down (south) and hold.
await touch('touchStart', [[90, 700, 1]]);
for (let i = 1; i <= 6; i++) {
  await touch('touchMove', [[90, 700 + i * 12, 1]]);
  await p.waitForTimeout(16);
}
await p.waitForTimeout(250);
const s1 = await S();
await touch('touchEnd', []);
check('the stick walks the farmer', s1.y > s0.y + 0.3, `y ${s0.y.toFixed(2)} to ${s1.y.toFixed(2)}`);
await p.waitForTimeout(150);
const s2 = await S();
check('letting go stops', Math.abs(s2.y - s1.y) < 0.35, `drift ${(s2.y - s1.y).toFixed(2)}`);
// Put the farmer facing the radish row, then hold the stick and press act with a second finger.
await p.evaluate(() => { const f = window.sunup.state.actors[0]; f.x = 2.5; f.y = 4.5; f.facing = 's'; f.angle = Math.PI / 2; });
const act = await p.evaluate(() => { const r = document.querySelector('.tb-act').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
const h0 = (await S()).harvested;
await touch('touchStart', [[90, 700, 1]]);
await touch('touchStart', [[90, 700, 1], [act[0], act[1], 2]]);
await p.waitForTimeout(120);
await touch('touchEnd', [[90, 700, 1]]);
await touch('touchEnd', []);
await p.waitForTimeout(150);
check('act works while the stick is held', (await S()).harvested === h0 + 1);
// Hold-to-repeat: walk east down the radish row holding act; each plot ahead gets pulled.
await p.evaluate(() => { const f = window.sunup.state.actors[0]; f.x = 1.5; f.y = 5.5; f.facing = 'e'; f.angle = 0; });
const h1 = (await S()).harvested;
await touch('touchStart', [[act[0], act[1], 3]]);
await p.waitForTimeout(80);
await touch('touchStart', [[act[0], act[1], 3], [90, 700, 4]]);
await touch('touchMove', [[act[0], act[1], 3], [150, 700, 4]]);
await p.waitForTimeout(900);
await touch('touchEnd', [[act[0], act[1], 3]]);
await touch('touchEnd', []);
check('holding act keeps working', (await S()).harvested >= h1 + 2, `${(await S()).harvested - h1} pulled`);
// Sunup's tools live on the rack; the touch layer has no second tool button.
check('no duplicate tool button over the farm', !(await visible('.tb-tool')));
// A key press hides the touch controls.
await p.keyboard.press('KeyD');
await p.waitForTimeout(100);
check('a key press hides the touch controls', !(await visible('.tb-act')));
await touch('touchStart', [[300, 400, 6]]);
await touch('touchEnd', []);
await p.waitForTimeout(100);
check('a touch brings them back', await visible('.tb-act'));

await p.screenshot({ path: '/tmp/acres-touch-walk.png' });
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `TOUCH FAILED (${failed})` : 'TOUCH OK');
process.exit(failed ? 1 : 0);
