// Thistledown with a gamepad. Headless Chrome has no pads, so a stand-in
// navigator.getGamepads returns a pad whose sticks and buttons this script
// sets; the game polls it exactly as it would a real one.
//   node scripts/ranch-pad.mjs
import { launch, BASE, frames, checker, S } from './ranch-lib.mjs';

const { check, failed } = checker();
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  const pad = { id: 'stand-in pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__pad = pad;
  navigator.getGamepads = () => [pad, null, null, null];
});
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
await page.goto(`${BASE}/?game=ranch&fresh&nolock`);
await page.waitForFunction(() => window.ranch && window.ranch.frames > 8);
const set = (fn) => page.evaluate(fn);
const btn = (i, on) => page.evaluate(([i, on]) => { const q = window.__pad.buttons[i]; q.pressed = on; q.value = on ? 1 : 0; }, [i, on]);
const press = async (i) => { await btn(i, true); await frames(page, 3); await btn(i, false); await frames(page, 3); };

let s0 = await S(page);
await set(() => (window.__pad.axes[1] = -1));
await page.waitForTimeout(800);
await set(() => (window.__pad.axes[1] = 0));
let s1 = await S(page);
check('left stick walks', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 2.5, `${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(2)} m`);
s0 = await S(page);
await set(() => (window.__pad.axes[2] = 1));
await page.waitForTimeout(500);
await set(() => (window.__pad.axes[2] = 0));
s1 = await S(page);
check('right stick turns', s1.yaw < s0.yaw - 0.5, `yaw ${(s1.yaw - s0.yaw).toFixed(2)}`);
const y0 = (await S(page)).y;
await btn(0, true);
await page.waitForTimeout(220);
const y1 = (await S(page)).y;
await btn(0, false);
check('A jumps', y1 - y0 > 0.5);
await page.waitForTimeout(700);
// LT draws the porch downy.
await page.evaluate(() => { const r = window.ranch; const d = r.sim.s.downies.find((q) => q.keep); const p = r.sim.s.player; p.x = d.x - 2.5; p.z = d.z + 1.5; p.y = r.sim.phys.floor(p.x, p.z); r.aimAt(d.x, d.y + 0.25, d.z); });
await btn(6, true);
await page.waitForTimeout(1300);
await btn(6, false);
s1 = await S(page);
check('LT draws', s1.slots[0][0] === 'clover');
// RB and LB change slots.
await page.evaluate(() => window.ranch.sim.stow('cloverhead'));
const sel0 = (await S(page)).sel;
await press(5);
const sel1 = (await S(page)).sel;
await press(4);
const sel2 = (await S(page)).sel;
check('RB and LB change slots', sel1 === (sel0 + 1) % 4 && sel2 === sel0, `${sel0} ${sel1} ${sel2}`);
// RT puffs.
const n0 = (await S(page)).slots[sel2][1];
await press(7);
await page.waitForTimeout(200);
check('RT puffs', (await S(page)).slots[sel2][1] === n0 - 1);
// X at a pad post hangs the tags; X again buys the one under the crosshair.
await page.evaluate(() => { const r = window.ranch; r.sim.s.coins = 1000; const p = r.sim.s.player; p.x = 16; p.z = 34; p.y = r.sim.phys.floor(16, 34); r.aimAt(15.2, r.sim.phys.floor(15.2, 31.8) + 1.4, 31.8); });
await frames(page, 4);
await press(2);
await page.waitForTimeout(700);
check('X opens the post', (await S(page)).menu);
const hot = await page.evaluate(() => { const r = window.ranch; return r.menuOptions(); });
await page.evaluate(() => { const r = window.ranch; const t = r.tagScreen(0); });
// Aim at the first tag with the right stick: nudge until the crosshair is on it.
for (let i = 0; i < 60; i++) {
  const t = await page.evaluate(() => window.ranch.tagScreen(0));
  const dx = (t.x - 640) / 640;
  const dy = (t.y - 400) / 400;
  if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.03) break;
  await page.evaluate(([dx, dy]) => { window.__pad.axes[2] = Math.max(-1, Math.min(1, dx * 3)); window.__pad.axes[3] = Math.max(-1, Math.min(1, dy * 3)); }, [dx, dy]);
  await frames(page, 1);
}
await page.evaluate(() => { window.__pad.axes[2] = 0; window.__pad.axes[3] = 0; });
await frames(page, 3);
await press(2);
await page.waitForTimeout(800);
check('aiming at a tag and pressing X buys it', (await S(page)).pads[1] === 'pen', `${hot.join(',')} -> ${(await S(page)).pads[1]}`);
// Start pauses, A on the page resumes.
await press(9);
await page.waitForTimeout(200);
check('Start opens the pause page', (await S(page)).paused);
await press(0);
await page.waitForTimeout(200);
check('A on Back to the ranch resumes', !(await S(page)).paused);
check('no console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
await b.close();
console.log(failed() ? `PAD FAILED (${failed()})` : 'PAD OK');
process.exit(failed() ? 1 : 0);
