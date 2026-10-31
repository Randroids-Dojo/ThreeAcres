// Thumb room under touch, at the Pixel 8 Pro's viewport (412 by 838, DPR 2.625):
// looking works from the middle and lower right, buttons win over the bellows,
// the stick works where it overlaps the bellows, the bellows still changes slot,
// and the journal page never blocks the stick. Real touch events through CDP.
// node scripts/ranch-thumbs.mjs [base url]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5247';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${base}/?game=ranch&fresh`);
await p.waitForFunction(() => window.ranch && window.ranch.sim, null, { timeout: 30000 });
const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 9, radiusY: 9, force: 1 })) });
const S = () => p.evaluate(() => { const s = window.ranch.sim.s; return { yaw: s.player.yaw, x: s.player.x, z: s.player.z, slot: s.sel }; });
const box = (sel) => p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom }; }, sel);
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const drag = async (x0, y0, dx, dy, id) => {
  await touch('touchStart', [[x0, y0, id]]);
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', [[x0 + (dx * i) / 8, y0 + (dy * i) / 8, id]]);
    await p.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await p.waitForTimeout(120);
};
// Wake the touch controls.
await touch('touchStart', [[300, 300, 1]]);
await touch('touchEnd', []);
await p.waitForTimeout(500);

for (const [label, y] of [['middle right', 420], ['lower right', 600]]) {
  const a = await S();
  await drag(300, y, 70, 0, 2);
  const c = await S();
  check(`looking from the ${label}`, Math.abs(c.yaw - a.yaw) > 0.1, `yaw ${a.yaw.toFixed(2)} to ${c.yaw.toFixed(2)}`);
}
const puff = await box('.rt-puff');
const draw = await box('.rt-draw');
const jump = await box('.rt-jump');
const bel = await box('.rh-bellows');
check('buttons sit in the bottom-right quarter', [puff, draw, jump].every((q) => q.l > 206 && q.t > 838 * 0.72), `top of jump ${Math.round(jump.t)}`);
// What gets a touch at the overlap of the bellows and puff, and on the stick side of the bellows.
const hit = (x, y) => p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const owner = e?.closest('button, .rt-stick, .rt-look, .rh-bellows') ?? e; return owner?.getAttribute('class') ?? ''; }, [x, y]);
if (bel.r > puff.l && bel.b > puff.t) {
  const ox = (Math.max(bel.l, puff.l) + Math.min(bel.r, puff.r)) / 2;
  const oy = (Math.max(bel.t, puff.t) + Math.min(bel.b, puff.b)) / 2;
  check('puff wins where it overlaps the bellows', /rt-puff|ic/.test(await hit(ox, oy)), await hit(ox, oy));
} else check('puff clear of the bellows', true);
check('the stick wins on its side of the bellows', /rt-stick|rt-base|rt-knob/.test(await hit(Math.max(bel.l + 10, 120), bel.y)), await hit(Math.max(bel.l + 10, 120), bel.y));
const a = await S();
await drag(Math.max(bel.l + 14, 130), bel.y, 0, -60, 3);
await p.waitForTimeout(200);
const c = await S();
check('a stick drag that starts over the bellows walks', Math.hypot(c.x - a.x, c.z - a.z) > 0.3, `moved ${Math.hypot(c.x - a.x, c.z - a.z).toFixed(2)} m`);
const s0 = await S();
const bx = Math.min(bel.r - 12, puff.l - 12);
check('the bellows is still reachable on the right', /rh-bellows|rh-slotbtn/.test(await hit(bx, bel.t + 20)), await hit(bx, bel.t + 20));
await touch('touchStart', [[bx, bel.t + 20, 4]]);
await touch('touchEnd', []);
await p.waitForTimeout(150);
const s1 = await S();
check('tapping the bellows changes slot', s1.slot !== s0.slot, `${s0.slot} to ${s1.slot}`);
// With the journal up, the stick still answers.
await p.evaluate(() => window.ranch.hud.showPage('Day 1', [{ text: 'Draw up a clover downy.', done: false }, { text: 'Build a pen and puff a downy in.', done: false }], 30));
await p.waitForTimeout(700);
const pg = await box('.rh-page');
check('the journal sits clear of the stick', pg.b < 838 * 0.3, `page bottom ${Math.round(pg.b)}`);
const m0 = await S();
await drag(90, 700, 0, -60, 5);
await p.waitForTimeout(200);
const m1 = await S();
check('the stick walks with the journal up', Math.hypot(m1.x - m0.x, m1.z - m0.z) > 0.3);
await p.screenshot({ path: '/tmp/ranch-thumbs.png' });
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `THUMBS FAILED (${failed})` : 'THUMBS OK');
process.exit(failed ? 1 : 0);
