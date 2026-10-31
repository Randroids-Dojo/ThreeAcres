// Thistledown played with real input on a desktop: keys and the mouse, with no
// pointer lock (right-drag looks). Scripted setup only places the player and
// points the view; every action is a real key, click or drag.
//   node scripts/ranch-play.mjs [shotsDir]
import fs from 'node:fs';
import { launch, openRanch, frames, checker, S } from './ranch-lib.mjs';

const shots = process.argv[2] || '/tmp/ranch/play';
fs.mkdirSync(shots, { recursive: true });
const { check, failed } = checker();
const b = await launch();
const { page, problems } = await openRanch(b, { width: 1280, height: 800, query: 'nolock' });
const W = 1280;
const H = 800;
const place = (x, z, ax, ay, az) => page.evaluate(([x, z, ax, ay, az]) => {
  const r = window.ranch;
  const p = r.sim.s.player;
  p.x = x; p.z = z; p.y = r.sim.phys.floor(x, z); p.vx = p.vz = p.vy = 0;
  if (ax !== undefined) r.aimAt(ax, ay, az);
}, [x, z, ax, ay, az]);
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png` });

// ---- move with keys
let s0 = await S(page);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1000);
await page.keyboard.up('KeyW');
await page.waitForTimeout(300);
let s1 = await S(page);
const moved = Math.hypot(s1.x - s0.x, s1.z - s0.z);
check('W walks forward', moved > 3, `${moved.toFixed(2)} m in 1 s`);
await page.waitForTimeout(200);
const s1b = await S(page);
check('letting go stops', Math.hypot(s1b.x - s1.x, s1b.z - s1.z) < 0.4, `drift ${Math.hypot(s1b.x - s1.x, s1b.z - s1.z).toFixed(2)} m`);
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyS');
await page.waitForTimeout(800);
await page.keyboard.up('KeyS');
await page.keyboard.up('ShiftLeft');
const s1c = await S(page);
check('shift sprints backwards with S', Math.hypot(s1c.x - s1b.x, s1c.z - s1b.z) > 4, `${Math.hypot(s1c.x - s1b.x, s1c.z - s1b.z).toFixed(2)} m in 0.8 s`);
// Jump.
const yj = (await S(page)).y;
await page.keyboard.down('Space');
await page.waitForTimeout(250);
const yj2 = (await S(page)).y;
await page.keyboard.up('Space');
check('space jumps', yj2 - yj > 0.5, `rose ${(yj2 - yj).toFixed(2)} m`);
await page.waitForTimeout(600);

// ---- look by right-drag (no pointer lock)
s0 = await S(page);
await page.mouse.move(640, 400);
await page.mouse.down({ button: 'right' });
for (let i = 1; i <= 10; i++) await page.mouse.move(640 + i * 20, 400 + i * 5);
await page.mouse.up({ button: 'right' });
s1 = await S(page);
check('right-drag turns the view', Math.abs(s1.yaw - s0.yaw) > 0.6 && s1.pitch < s0.pitch - 0.1, `yaw ${(s1.yaw - s0.yaw).toFixed(2)}, pitch ${(s1.pitch - s0.pitch).toFixed(2)}`);

// ---- draw up the porch downy
const d = await page.evaluate(() => { const d = window.ranch.sim.s.downies.find((q) => q.keep); return { x: d.x, y: d.y, z: d.z }; });
await place(d.x - 2.6, d.z + 1.6, d.x, d.y + 0.25, d.z);
await frames(page, 3);
await page.mouse.move(640, 400);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(300);
await shot('01-drawing');
await page.waitForTimeout(900);
await page.mouse.up({ button: 'right' });
s1 = await S(page);
check('holding right mouse draws the downy in', s1.slots[0][0] === 'clover' && s1.slots[0][1] === 1, JSON.stringify(s1.slots[0]));
check('the journal goal for it is done', s1.goals.includes('catch'));
await page.waitForTimeout(400);
await shot('02-journal');

// ---- build a pen at pad 1 through the hanging tags
// Pad 1: centre (17, 26.5), its post at (14.8, 31.8) on the lane side.
const padInfo = { x: 17, z: 26.5, px: 14.8, pz: 31.8 };
await place(padInfo.px + 1.2, padInfo.pz + 2.2, padInfo.px + 0.4, 5.6, padInfo.pz);
await frames(page, 5);
const coins0 = (await S(page)).coins;
await page.keyboard.press('KeyE');
await page.waitForTimeout(700);
s1 = await S(page);
check('E at the pad post hangs the build tags', s1.menu, JSON.stringify(await page.evaluate(() => window.ranch.menuOptions())));
await shot('03-tags');
// Click the first tag (Pen) with the mouse.
const tag = await page.evaluate(() => window.ranch.tagScreen(0));
check('the pen tag is on screen', tag && tag.x > 0 && tag.x < 1280 && tag.y > 0 && tag.y < 800, JSON.stringify(tag));
await page.mouse.click(tag.x, tag.y);
await page.waitForTimeout(900);
s1 = await S(page);
check('clicking the Pen tag builds a pen', s1.pads[1] === 'pen' && s1.coins === coins0 - 250, `${s1.pads[1]}, coins ${coins0} to ${s1.coins}`);
await shot('04-pen-built');

// ---- puff the downy into the pen
await place(17, 34.5, 17, 6.6, 26.5);
await frames(page, 3);
await page.mouse.click(640, 400);
await page.waitForTimeout(2600);
s1 = await S(page);
check('clicking puffs the downy into the pen', s1.penned === 1 && s1.goals.includes('pen'), `penned ${s1.penned}`);
await shot('05-penned');

// ---- gather clover heads from the starter garden
await page.evaluate(() => { const s = window.ranch.sim.s; for (const d of s.downies) if (d.pen === 1) d.hunger = 0.8; });
await place(6, 30.2, 6, 5.0, 26.8);
await frames(page, 3);
await page.mouse.down({ button: 'right' });
for (let i = 0; i < 6; i++) {
  await page.mouse.move(640 + (i % 2 ? 60 : -60), 400 + i * 4);
  await page.waitForTimeout(250);
}
await page.mouse.up({ button: 'right' });
s1 = await S(page);
const heads = s1.slots.find((q) => q[0] === 'cloverhead');
check('drawing over the garden picks up clover heads', heads && heads[1] >= 2, JSON.stringify(s1.slots));
// Select the clover head slot with the wheel or a number key.
const hi = s1.slots.findIndex((q) => q[0] === 'cloverhead');
await page.keyboard.press(`Digit${hi + 1}`);
await page.waitForTimeout(100);
check('a number key picks the slot', (await S(page)).sel === hi);

// ---- feed: puff a clover head into the pen
await place(17, 33.2, 17, 5.0, 27.6);
await frames(page, 3);
const fed0 = (await S(page)).fed;
await page.mouse.click(640, 400);
await page.waitForTimeout(400);
await page.mouse.click(640, 400);
let fedOk = false;
for (let i = 0; i < 20 && !fedOk; i++) {
  await page.waitForTimeout(300);
  fedOk = (await S(page)).fed > fed0;
}
await page.waitForTimeout(1500);
s1 = await S(page);
check('the downy eats its favourite', fedOk && s1.goals.includes('feed'), `fed ${s1.fed}`);
check('it sheds down', s1.tufts >= 2, `${s1.tufts} tufts`);
await shot('06-shed');

// ---- collect the down
await page.waitForTimeout(1500);
const tuftAt = (await page.evaluate(() => { const t = window.ranch.sim.s.items.find((i) => !i.gone && i.type.startsWith('tuft')); return t ? { x: t.x, y: t.y, z: t.z } : null; })) ?? { x: 17, y: 5, z: 27 };
await place(tuftAt.x, Math.min(tuftAt.z + 3.2, 33), tuftAt.x, tuftAt.y, tuftAt.z);
await frames(page, 3);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(1600);
await page.mouse.up({ button: 'right' });
s1 = await S(page);
const down = s1.slots.find((q) => q[0] === 'tuft-clover');
check('drawing picks up the down', down && down[1] >= 2, JSON.stringify(s1.slots));

// ---- sell at the Exchange
const di = s1.slots.findIndex((q) => q[0] === 'tuft-clover');
for (let i = 0; i < 5 && (await S(page)).sel !== di; i++) {
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(60);
}
check('Q cycles to the down slot', (await S(page)).sel === di);
await place(-6.5, 32.6, -6.5, 5.7, 36.5);
await frames(page, 3);
const c0 = (await S(page)).coins;
await page.mouse.down({ button: 'left' });
await page.waitForTimeout(1300);
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(1600);
s1 = await S(page);
check('puffing down into the crate sells it', s1.coins > c0 && s1.sold >= 2, `coins ${c0} to ${s1.coins}, sold ${s1.sold}`);
await shot('07-sold');

// ---- the Exchange board is readable from the lane
await place(-2, 33, -4.2, 6.6, 37.6);
await frames(page, 10);
await shot('08-board');

// ---- pause and resume through the shell, with a key held across it
await page.keyboard.down('KeyW');
await page.waitForTimeout(150);
await page.evaluate(() => window.shell.show());
await page.waitForTimeout(200);
await page.keyboard.up('KeyW');
const fA = (await S(page)).frames;
await page.waitForTimeout(500);
const pA = await S(page);
check('shell show pauses the loop', !pA.running && pA.frames === fA, `frames ${fA} to ${pA.frames}`);
await page.evaluate(() => window.shell.hide());
await page.waitForTimeout(500);
const pB = await S(page);
await page.waitForTimeout(400);
const pC = await S(page);
check('shell hide resumes the loop', pB.running && pC.frames > pB.frames + 10);
check('no stuck input after resume', !pC.held && Math.hypot(pC.x - pB.x, pC.z - pB.z) < 0.05, `held ${pC.held}, drift ${Math.hypot(pC.x - pB.x, pC.z - pB.z).toFixed(3)}`);

// ---- Esc pause page
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Esc opens the pause page', (await S(page)).paused);
await shot('09-pause');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('Enter on Back to the ranch resumes', !(await S(page)).paused);

// ---- save then reload restores exactly
// Pause through the shell first (it saves), so nothing moves between the save and the reload.
await page.evaluate(() => window.shell.show());
await page.waitForTimeout(200);
const saved = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('threeacres:v2:ranch')).data));
await page.goto(`${page.url().split('?')[0]}?game=ranch&nolock&freeze`);
await page.waitForFunction(() => window.ranch && window.ranch.frames > 3);
const loaded = await page.evaluate(() => JSON.stringify(window.ranch.loaded));
check('save then reload restores the ranch exactly', saved === loaded, saved === loaded ? `${saved.length} bytes` : `differs at ${[...saved].findIndex((c, i) => c !== loaded[i])}`);
if (saved !== loaded) {
  const i = [...saved].findIndex((c, k) => c !== loaded[k]);
  console.log('saved :', saved.slice(Math.max(0, i - 80), i + 80));
  console.log('loaded:', loaded.slice(Math.max(0, i - 80), i + 80));
}
const after = await S(page);
const carried = (q) => q.slots.filter((x) => x[0] === 'clover').reduce((a, x) => a + x[1], 0);
check('the pen, coins, canister and downies came back', after.pads[1] === 'pen' && after.coins === s1.coins && after.penned + carried(after) >= 1 && JSON.stringify(after.slots) === JSON.stringify(s1.slots), `${after.pads[1]}, ${after.coins}, penned ${after.penned}, carried ${carried(after)}`);

check('no console errors', problems.length === 0, problems.slice(0, 4).join(' | '));
await b.close();
console.log(failed() ? `PLAY FAILED (${failed()})` : 'PLAY OK');
process.exit(failed() ? 1 : 0);
