// Thistledown on a phone (412 by 900 at DPR 2.6) with real touch events sent
// through the DevTools protocol. Setup places the player and points the view;
// every action is a real touch on the stick, the look side or a button.
//   node scripts/ranch-touch.mjs [shotsDir]
import fs from 'node:fs';
import { launch, openRanch, frames, checker, S, touchSession } from './ranch-lib.mjs';

const shots = process.argv[2] || '/tmp/ranch/touch';
fs.mkdirSync(shots, { recursive: true });
const { check, failed } = checker();
const b = await launch();
const { ctx, page, problems } = await openRanch(b, { width: 412, height: 900, dpr: 2.6, touch: true });
const t = await touchSession(ctx, page);
const place = (x, z, ax, ay, az) => page.evaluate(([x, z, ax, ay, az]) => {
  const r = window.ranch;
  const p = r.sim.s.player;
  p.x = x; p.z = z; p.y = r.sim.phys.floor(x, z); p.vx = p.vz = p.vy = 0;
  if (ax !== undefined) r.aimAt(ax, ay, az);
}, [x, z, ax, ay, az]);
const centre = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.x + r.width / 2, r.y + r.height / 2] : null; }, sel);
const visible = async (sel) => !!(await centre(sel));
const tap = async (x, y, id = 9) => { await t.send('touchStart', [[x, y, id]]); await page.waitForTimeout(60); await t.send('touchEnd', []); };
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png` });

await page.waitForTimeout(300);
check('touch controls show on a phone', (await visible('.rt-draw')) && (await visible('.rt-puff')) && (await visible('.rt-jump')));
check('the shell corner is clear', await page.evaluate(() => {
  // Anything you can see or press, other than full-screen layers, must stay out of the top-left 60 px.
  const els = [...document.querySelectorAll('.rh *, .rt *')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.width < innerWidth * 0.6 && cs.visibility !== 'hidden' && cs.opacity !== '0' && cs.display !== 'none'; });
  return !els.some((e) => { const r = e.getBoundingClientRect(); return r.left < 60 && r.top < 60; });
}));
await shot('01-start');

// ---- the stick walks: thumb down on the left, push up
let s0 = await S(page);
await t.send('touchStart', [[100, 720, 1]]);
for (let i = 1; i <= 8; i++) { await t.send('touchMove', [[100, 720 - i * 9, 1]]); await page.waitForTimeout(16); }
await page.waitForTimeout(700);
let s1 = await S(page);
await t.send('touchEnd', []);
check('the stick walks forward', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 2, `${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(2)} m`);
await page.waitForTimeout(350);
s1 = await S(page);
await page.waitForTimeout(250);
const s2 = await S(page);
check('letting go stops', Math.hypot(s2.x - s1.x, s2.z - s1.z) < 0.05, `drift ${Math.hypot(s2.x - s1.x, s2.z - s1.z).toFixed(3)} m`);
// Drift past the rim: the stick follows the thumb.
await t.send('touchStart', [[100, 720, 2]]);
for (let i = 1; i <= 14; i++) { await t.send('touchMove', [[100, 720 - i * 12, 2]]); await page.waitForTimeout(16); }
const base = await page.evaluate(() => { const r = document.querySelector('.rt-base').getBoundingClientRect(); return r.y + r.height / 2; });
await t.send('touchEnd', []);
check('the stick follows a drifting thumb', base < 720 - 60, `base centre at y ${base.toFixed(0)}`);

// ---- look by dragging on the right
s0 = await S(page);
await t.send('touchStart', [[300, 420, 3]]);
for (let i = 1; i <= 10; i++) { await t.send('touchMove', [[300 - i * 12, 420 + i * 3, 3]]); await page.waitForTimeout(16); }
await t.send('touchEnd', []);
s1 = await S(page);
check('dragging on the right turns the view', Math.abs(s1.yaw - s0.yaw) > 0.4, `yaw ${(s1.yaw - s0.yaw).toFixed(2)}`);

// ---- hold Draw on the porch downy, while also holding the stick (two thumbs)
const d = await page.evaluate(() => { const d = window.ranch.sim.s.downies.find((q) => q.keep); return { x: d.x, y: d.y, z: d.z }; });
await place(d.x - 2.6, d.z + 1.6, d.x, d.y + 0.25, d.z);
await frames(page, 3);
const draw = await centre('.rt-draw');
await t.send('touchStart', [[draw[0], draw[1], 4]]);
await page.waitForTimeout(250);
await shot('02-drawing');
await page.waitForTimeout(900);
await t.send('touchEnd', []);
s1 = await S(page);
check('holding Draw pulls the downy in', s1.slots.some((q) => q[0] === 'clover'), JSON.stringify(s1.slots));
await page.waitForTimeout(300);
await shot('03-journal');

// ---- the Use button at a pad post, then tap the Pen tag
await place(14.8 + 1.2, 31.8 + 2.2, 14.8 + 0.4, 5.6, 31.8);
await frames(page, 6);
check('the Use button shows near a post', await visible('.rt-act.show'));
const act = await centre('.rt-act');
await tap(act[0], act[1]);
await page.waitForTimeout(700);
check('Use hangs the tags', (await S(page)).menu);
await shot('04-tags');
const tag = await page.evaluate(() => window.ranch.tagScreen(0));
const c0 = (await S(page)).coins;
check('nothing is chosen as the tags come down; Use says to tap a tag', await page.evaluate(() => { const c = window.ranch.tagChoice(); return c.hot === -1 && c.label === 'Tap a tag' && document.querySelector('.rt-act').textContent === 'Tap a tag'; }));
// A thumb chooses first (Use then says Buy), and a second tap on the chosen tag takes it.
await tap(tag.x, tag.y, 11);
await page.waitForTimeout(400);
s1 = await S(page);
check('a first tap on the Pen tag chooses it and spends nothing', s1.pads[1] === 'empty' && s1.coins === c0 && (await page.evaluate(() => window.ranch.tagChoice().label)) === 'Buy', `${s1.pads[1]}, ${c0} to ${s1.coins}`);
await tap(tag.x, tag.y, 11);
await page.waitForTimeout(900);
s1 = await S(page);
check('a second tap on the Pen tag builds it', s1.pads[1] === 'pen' && s1.coins === c0 - 250, `${s1.pads[1]}, ${c0} to ${s1.coins}`);

// ---- tap Puff to send the downy into the pen
await place(17, 34.5, 17, 6.6, 26.5);
await frames(page, 3);
const puff = await centre('.rt-puff');
await tap(puff[0], puff[1], 12);
await page.waitForTimeout(2600);
s1 = await S(page);
check('tapping Puff sends the downy into the pen', s1.penned === 1, `penned ${s1.penned}`);

// ---- slot windows on the bellows are tap targets
await page.evaluate(() => { const sim = window.ranch.sim; sim.stow('cloverhead'); sim.stow('cloverhead'); sim.stow('cloverhead'); sim.stow('tuft-clover'); });
await frames(page, 3);
const filled = (await S(page)).slots;
const want = filled.findIndex((q) => q[0] === 'tuft-clover');
const win = await page.evaluate((i) => window.ranch.slotScreen(i), want);
await tap(win.x, win.y, 13);
await page.waitForTimeout(150);
check('tapping a window on the bellows picks that slot', (await S(page)).sel === want, `sel ${(await S(page)).sel}, want ${want} at ${JSON.stringify(win)}`);
await shot('05-slots');
// Tapping the bellows' body flicks to the next slot that holds something.
// (Under touch the windows' own targets cover part of the body: tap a spot that is the body itself.)
const body = await page.evaluate(() => {
  const b = window.ranch.vm.bodyBox({ x0: 0, y0: 0, x1: 0, y1: 0 });
  for (const fy of [0.3, 0.2, 0.4, 0.5, 0.6, 0.7]) for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const x = (b.x0 + (b.x1 - b.x0) * fx) * innerWidth;
    const y = (b.y0 + (b.y1 - b.y0) * fy) * innerHeight;
    if (document.elementFromPoint(x, y)?.classList.contains('rh-bellows')) return { x, y };
  }
  return { x: ((b.x0 + b.x1) / 2) * innerWidth, y: b.y0 * innerHeight + 4 };
});
const selBefore = (await S(page)).sel;
await tap(body.x, body.y, 24);
await page.waitForTimeout(150);
const selAfter = (await S(page)).sel;
check('tapping the bellows flicks to the next filled slot', selAfter !== selBefore && filled[selAfter][0] !== null, `${selBefore} to ${selAfter}`);

// ---- feed through the pen: pick the clover heads and hold Puff while walking
const hi = filled.findIndex((q) => q[0] === 'cloverhead');
const win2 = await page.evaluate((i) => window.ranch.slotScreen(i), hi);
await tap(win2.x, win2.y, 14);
await page.evaluate(() => { for (const d of window.ranch.sim.s.downies) if (d.pen === 1) d.hunger = 0.8; });
await place(17, 33.2, 17, 5.0, 27.6);
await frames(page, 3);
const n0 = (await S(page)).slots[hi][1];
await t.send('touchStart', [[puff[0], puff[1], 15]]);
await page.waitForTimeout(80);
await t.send('touchStart', [[puff[0], puff[1], 15], [100, 720, 16]]);
await t.send('touchMove', [[puff[0], puff[1], 15], [100, 712, 16]]);
await page.waitForTimeout(650);
await t.send('touchEnd', [[100, 712, 16]]);
await t.send('touchEnd', []);
const n1 = (await S(page)).slots[hi]?.[1] ?? 0;
check('holding Puff repeats, even while walking', n0 - n1 >= 2, `${n0 - n1} puffed`);
let fed = false;
for (let i = 0; i < 20 && !fed; i++) { await page.waitForTimeout(300); fed = (await S(page)).goals.includes('feed'); }
check('the penned downy eats', fed);
await page.waitForTimeout(1600);
await shot('06-fed');

// ---- collect the down and sell it with the buttons
const tuft = await page.evaluate(() => { const t = window.ranch.sim.s.items.find((i) => !i.gone && i.type.startsWith('tuft')); return t && { x: t.x, y: t.y, z: t.z }; });
if (tuft) {
  await place(tuft.x, Math.min(tuft.z + 3, 33.2), tuft.x, tuft.y, tuft.z);
  await frames(page, 3);
  await t.send('touchStart', [[draw[0], draw[1], 17]]);
  await page.waitForTimeout(1500);
  await t.send('touchEnd', []);
}
s1 = await S(page);
const di = s1.slots.findIndex((q) => q[0] === 'tuft-clover');
const win3 = await page.evaluate((i) => window.ranch.slotScreen(i), di);
await tap(win3.x, win3.y, 18);
await place(-6.5, 32.8, -6.5, 5.7, 36.5);
await frames(page, 3);
const cc = (await S(page)).coins;
await t.send('touchStart', [[puff[0], puff[1], 19]]);
await page.waitForTimeout(1200);
await t.send('touchEnd', []);
await page.waitForTimeout(1500);
s1 = await S(page);
check('puffing down into the crate sells it', s1.coins > cc && s1.sold >= 2, `${cc} to ${s1.coins}, sold ${s1.sold}, slots ${JSON.stringify(s1.slots)}, sel ${s1.sel}, tuft slot ${di}`);
await shot('07-sold');

// ---- pause button and the pause page
const pz = await centre('.rt-pause');
await tap(pz[0], pz[1], 20);
await page.waitForTimeout(300);
check('the pause button opens the pause page', (await S(page)).paused);
await shot('08-pause');
const back = await page.evaluate(() => { const e = document.querySelector('.rh-pause [data-act=resume]'); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await tap(back[0], back[1], 21);
await page.waitForTimeout(300);
check('tapping Back to the ranch resumes', !(await S(page)).paused);

// ---- shell pause with a thumb down: nothing sticks
await t.send('touchStart', [[100, 720, 22]]);
await t.send('touchMove', [[100, 690, 22]]);
await page.evaluate(() => window.shell.show());
await page.waitForTimeout(200);
await t.send('touchEnd', []);
await page.evaluate(() => window.shell.hide());
await page.waitForTimeout(300);
const q0 = await S(page);
await page.waitForTimeout(400);
const q1 = await S(page);
check('no stuck input after a shell pause', !q1.held && Math.hypot(q1.x - q0.x, q1.z - q0.z) < 0.05, `held ${q1.held}`);

// ---- a key press hides the touch controls; a touch brings them back
await page.keyboard.press('KeyW');
await page.waitForTimeout(150);
check('a key press hides the touch controls', !(await visible('.rt-draw')));
await tap(300, 300, 23);
await page.waitForTimeout(150);
check('a touch brings them back', await visible('.rt-draw'));

check('no console errors', problems.length === 0, problems.slice(0, 4).join(' | '));
await b.close();
console.log(failed() ? `TOUCH FAILED (${failed()})` : 'TOUCH OK');
process.exit(failed() ? 1 : 0);
