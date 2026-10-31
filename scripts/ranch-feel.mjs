// Measures how Thistledown feels instead of eyeballing it: head bob size and
// rate, camera roll (must stay zero), field of view walking and sprinting,
// landing dip, how long the bellows takes to draw things in, puff speed,
// squash and stretch on a hopping downy, and footsteps per second.
//   node scripts/ranch-feel.mjs
import { launch, openRanch, frames, checker } from './ranch-lib.mjs';

const { check, failed } = checker();
const b = await launch();
const { page } = await openRanch(b, { width: 1280, height: 800, query: 'nolock' });
const sample = (secs, fn) => page.evaluate(([secs, src]) => new Promise((res) => {
  const f = new Function('r', `return (${src})(r)`);
  const out = [];
  const t0 = performance.now();
  const step = () => {
    out.push(f(window.ranch));
    if (performance.now() - t0 < secs * 1000) requestAnimationFrame(step);
    else res(out);
  };
  requestAnimationFrame(step);
}), [secs, fn.toString()]);
const cues = () => page.evaluate(() => { const a = window.shell.audio; window.__c = []; const c = a.cue.bind(a); a.cue = (n, o) => { window.__c.push([n, performance.now()]); c(n, o); }; });
await cues();
await page.evaluate(() => { const r = window.ranch; const p = r.sim.s.player; p.x = 0; p.z = 30; p.y = r.sim.phys.floor(0, 30); p.yaw = Math.PI / 2; p.pitch = 0; });

// ---- walking: bob, roll, fov, steps
await page.keyboard.down('KeyW');
await page.waitForTimeout(600);
const walk = await sample(3, (r) => ({ dy: r.camera.position.y - r.sim.s.player.y - 1.6, roll: r.camera.rotation.z, fov: r.camera.fov, x: r.camera.position.x, px: r.sim.s.player.x, pz: r.sim.s.player.z, cz: r.camera.position.z, t: performance.now() }));
await page.keyboard.up('KeyW');
const dys = walk.map((w) => w.dy);
const amp = Math.max(...dys) - Math.min(...dys);
let dips = 0;
for (let i = 1; i < dys.length - 1; i++) if (dys[i] < dys[i - 1] && dys[i] <= dys[i + 1] && dys[i] < (Math.max(...dys) + Math.min(...dys)) / 2) dips++;
const lateral = Math.max(...walk.map((w) => Math.abs(w.cz - w.pz)));
check('head bob is gentle: 2 to 4 cm up and down', amp > 0.02 && amp < 0.045, `${(amp * 100).toFixed(1)} cm`);
check('one dip per step, about two a second', dips / 3 > 1.6 && dips / 3 < 3.2, `${(dips / 3).toFixed(1)} per second`);
check('side sway stays under 1.5 cm', lateral < 0.015, `${(lateral * 100).toFixed(2)} cm`);
check('the camera never rolls', walk.every((w) => Math.abs(w.roll) < 1e-6));
check('field of view is 72 walking', walk.every((w) => Math.abs(w.fov - 72) < 0.6), `${Math.min(...walk.map((w) => w.fov)).toFixed(1)} to ${Math.max(...walk.map((w) => w.fov)).toFixed(1)}`);
const steps = await page.evaluate(() => window.__c.filter((c) => c[0] === 'ranch.step' || c[0] === 'ranch.stepstone').length);
check('footsteps keep time with walking', steps / 3.6 > 1.8 && steps / 3.6 < 3.2, `${(steps / 3.6).toFixed(1)} per second`);
await page.waitForTimeout(400);
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyW');
await page.waitForTimeout(900);
const sprint = await sample(1, (r) => r.camera.fov);
await page.keyboard.up('KeyW');
await page.keyboard.up('ShiftLeft');
check('sprinting widens the view a little, to 75 at most', Math.max(...sprint) > 73.5 && Math.max(...sprint) <= 75.01, `${Math.max(...sprint).toFixed(1)}`);

// ---- landing dip
await page.waitForTimeout(600);
await page.keyboard.press('Space');
const land = await sample(1.4, (r) => r.camera.position.y - r.sim.s.player.y - 1.6);
const dip = -Math.min(...land);
check('a landing dips the view a few centimetres and springs back', dip > 0.02 && dip < 0.12 && Math.abs(land[land.length - 1]) < 0.01, `${(dip * 100).toFixed(1)} cm`);

// ---- drawing: time to pull a downy in from 3 m and from 6 m
const drawTime = async (dist, kind) => {
  await page.evaluate(([dist, kind]) => {
    const r = window.ranch;
    const s = r.sim.s;
    s.slots.forEach((q) => { q.t = null; q.n = 0; });
    const p = s.player;
    p.x = 0; p.z = 28; p.y = r.sim.phys.floor(0, 28); p.vx = p.vz = 0;
    const d = kind === 'downy' ? r.sim.spawn('clover', 0, 28 - dist) : r.sim.drop('cloverhead', 0, 28 - dist);
    d.vx = d.vy = d.vz = 0;
    d.y = r.sim.phys.floor(0, 28 - dist) + (kind === 'downy' ? 0 : 0.12);
    if (kind === 'downy') { d.grounded = true; d.hopT = 99; }
    else { d.rest = true; }
    r.aimAt(0, d.y + 0.2, 28 - dist);
  }, [dist, kind]);
  await frames(page, 2);
  const t0 = await page.evaluate(() => performance.now());
  await page.keyboard.down('KeyF');
  await page.waitForFunction(() => window.ranch.sim.s.slots.some((q) => q.n > 0), null, { timeout: 5000 }).catch(() => {});
  const t1 = await page.evaluate(() => performance.now());
  await page.keyboard.up('KeyF');
  return (t1 - t0) / 1000;
};
const d3 = await drawTime(3, 'downy');
const d6 = await drawTime(6, 'downy');
const i6 = await drawTime(6, 'item');
check('a downy 3 m away streams in, in about half a second', d3 > 0.25 && d3 < 0.8, `${d3.toFixed(2)} s`);
check('one 6 m away takes a little longer', d6 > d3 && d6 < 1.3, `${d6.toFixed(2)} s`);
check('a clover head from 6 m', i6 < 1.2, `${i6.toFixed(2)} s`);

// ---- puff speed
await page.evaluate(() => {
  const r = window.ranch;
  r.sim.s.slots.forEach((q) => { q.t = null; q.n = 0; });
  r.sim.s.slots[0] = { t: 'cloverhead', n: 3 };
  r.sim.s.sel = 0;
  r.sim.s.player.pitch = 0.1;
  window.__maxId = r.sim.s.nextId;
});
await page.waitForTimeout(400);
await page.mouse.click(640, 400);
await frames(page, 1);
const v = await page.evaluate(() => { const it = window.ranch.sim.s.items.find((i) => i.id >= window.__maxId); return it ? Math.hypot(it.vx, it.vy, it.vz) : -1; });
check('a puff leaves at about 14 m/s', v > 12 && v < 16, `${v.toFixed(1)} m/s`);

// ---- squash and stretch on a hopping downy
await page.evaluate(() => { const r = window.ranch; const d = r.sim.spawn('ember', 3, 24); d.hopT = 0; window.__d = d; });
const sq = await sample(4, () => window.__d.squash);
check('hops squash on landing and stretch in the air', Math.min(...sq) < 0.85 && Math.max(...sq) > 1.08, `squash ${Math.min(...sq).toFixed(2)} to ${Math.max(...sq).toFixed(2)}`);

// ---- the bellows pump while drawing
await page.keyboard.down('KeyF');
await page.waitForTimeout(300);
const pump = await sample(1.5, (r) => r.vm.top.rotation.x);
await page.keyboard.up('KeyF');
let swings = 0;
const mid = (Math.max(...pump) + Math.min(...pump)) / 2;
for (let i = 1; i < pump.length; i++) if ((pump[i] - mid) * (pump[i - 1] - mid) < 0) swings++;
check('the bellows pump about two to three times a second while drawing', swings / 2 / 1.5 > 1.5 && swings / 2 / 1.5 < 4, `${(swings / 3).toFixed(1)} pumps a second, board ${Math.min(...pump).toFixed(2)} to ${Math.max(...pump).toFixed(2)} rad`);

await b.close();
console.log(failed() ? `FEEL FAILED (${failed()})` : 'FEEL OK');
process.exit(failed() ? 1 : 0);
