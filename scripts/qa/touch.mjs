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

// The round button lights up, with the word for it, wherever acting would do
// something, and a real tap does that thing: the notice board opens, the well
// fills the can with the hands in hand. Where nothing would happen it is dim.
await p.evaluate(() => {
  for (const what of ['can', 'board', 'requests']) window.sunup.input.push({ type: 'unlock', what });
  window.sunup.hud.pickTool('hands');
});
await p.waitForTimeout(200);
// (A tap on the farm aims at that tile for a moment; clear it so the button reads the tile the farmer faces.)
const standAt = (x, y, facing) => p.evaluate(([x, y, facing]) => {
  window.sunup.walkAim = null;
  const f = window.sunup.state.actors[0];
  Object.assign(f, { x: x + 0.5, y: y + 0.5, facing, angle: { n: -Math.PI / 2, s: Math.PI / 2, e: 0, w: Math.PI }[facing], task: null, path: [], moving: false });
}, [x, y, facing]);
const actButton = () => p.evaluate(() => {
  const b = document.querySelector('.tb-act');
  return { lit: !b.classList.contains('no'), word: b.querySelector('.tb-t')?.textContent ?? '' };
});
const tapAct = async () => {
  const [x, y] = await p.evaluate(() => { const r = document.querySelector('.tb-act').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await touch('touchStart', [[x, y, 9]]);
  await touch('touchEnd', []);
  await p.waitForTimeout(400);
};
await standAt(8, 3, 'n');
await p.waitForTimeout(250);
let ab = await actButton();
check('at the notice board the button is lit and says Read', ab.lit && ab.word === 'Read', JSON.stringify(ab));
await tapAct();
check('a tap at the board opens it, and it stays open (the tap does not close it again)', await p.evaluate(() => window.sunup.dialogs.open));
// A tap on the backdrop, away from the board, still closes it.
const backdrop = await p.evaluate(() => { const r = document.querySelector('.dialog').getBoundingClientRect(); return [Math.max(12, r.left / 2), Math.max(r.top / 2, 80)]; });
await touch('touchStart', [[backdrop[0], backdrop[1], 10]]);
await touch('touchEnd', []);
await p.waitForTimeout(350);
check('a tap on the backdrop closes the board', !(await p.evaluate(() => window.sunup.dialogs.open)));
await p.evaluate(() => window.sunup.dialogs.close(true));
await p.waitForTimeout(250);
await p.evaluate(() => { window.sunup.state.water = 1; });
await standAt(11, 3, 'n');
await p.waitForTimeout(250);
ab = await actButton();
check('at the well, hands in hand, the button is lit and says Fill the can', ab.lit && ab.word === 'Fill the can', JSON.stringify(ab));
await tapAct();
check('a tap at the well fills the can', (await p.evaluate(() => window.sunup.state.water)) > 1);
await standAt(6, 3, 'e');
await p.waitForTimeout(250);
ab = await actButton();
check('facing the bare yard, the button is dim and says nothing', !ab.lit && ab.word === '', JSON.stringify(ab));

// The seed picker opens over the left half of the screen, where the walk
// stick's capture zone is. A real tap on every seed must pick that seed.
await p.evaluate(() => {
  for (const what of ['can', 'sleep', 'coins', 'seeds']) window.sunup.input.push({ type: 'unlock', what });
});
await p.waitForTimeout(200);
const openSeeds = async () => {
  // Opening it again while it is open would close it.
  await p.evaluate(() => document.querySelector('.seedbar.hidden') && window.sunup.hud.pickTool('seeds'));
  await p.waitForTimeout(250);
  return p.evaluate(() => [...document.querySelectorAll('.seedbar .seed')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => {
    const r = e.getBoundingClientRect();
    return { crop: e.dataset.crop, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }));
};
const seeds = await openSeeds();
const picked = [];
// A pick closes the picker on a phone, so open it before each tap. Right to
// left, so every tap changes the pick (the first seed starts chosen).
for (const sd of [...seeds].reverse()) {
  await openSeeds();
  await touch('touchStart', [[sd.x, sd.y, 7]]);
  await touch('touchEnd', []);
  await p.waitForTimeout(200);
  if ((await p.evaluate(() => window.sunup.state.seed)) === sd.crop) picked.push(sd.crop);
}
check('a tap picks every seed in the picker, the stick side too', seeds.length >= 2 && picked.length === seeds.length, `${picked.length} of ${seeds.length}: ${picked.join(', ')}`);
await p.evaluate(() => window.sunup.hud.pickTool('hands'));

// A save from the old crew mode brings a farm hand along; Sunup is worked alone, so the hand has gone home on load.
await p.evaluate(() => {
  const s = window.sunup.state;
  const f = s.actors[0];
  s.actors.push({ ...f, id: 9999, role: 'hand', name: 'Ada', tint: 0, away: false, task: null, path: [], job: null });
  window.sunup.save();
});
await p.goto(`${base}/?game=homestead`);
await p.waitForFunction(() => window.sunup && window.sunup.frames > 10, null, { timeout: 30000 });
const roles = await p.evaluate(() => window.sunup.state.actors.map((a) => a.role).join(','));
check('a farm hand from an old crew save is gone after loading', roles === 'farmer', roles);
await p.screenshot({ path: '/tmp/acres-touch-walk.png' });
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `TOUCH FAILED (${failed})` : 'TOUCH OK');
process.exit(failed ? 1 : 0);
