// How much of the aim does a blow's puff of air hide? On the Pixel's viewport
// (412 by 838 at DPR 2.625, touch), facing an empty sky, reads every frame
// back from WebGL for a second after a blow and counts the pixels in the aim
// area (a square of 120 CSS px round the crosshair) that changed by more than
// a little from the frame before the blow. A run with no blow measures the
// drift of clouds and seed fluff, and a control replays the old puff (12 big,
// growing, half-opaque wisps) so the scan is shown to see a cloud at all.
// Round 6: a pest sent rolling threw up a cream cloud (the building dust) that
// hid it after one blow at 3.5 m. With the sim held still (&freeze), a pest
// 3.5 m off at 11 pm and at noon: the share of its screen box that changes in
// the half second after the hit's effect, against a replay of the old dust.
//   node scripts/ranch-blow-cloud.mjs [url]      (or RANCH_URL)
import { launch, openRanch, frames, checker } from './ranch-lib.mjs';

const { check, failed } = checker();
const b = await launch();
const { page, problems } = await openRanch(b, { width: 412, height: 838, dpr: 2.625, touch: true, query: 'nolock' });
const BOX = 120;

await page.evaluate((BOX) => {
  const r = window.ranch;
  window.__cloud = { on: false, ref: null, cover: [] };
  let buf = null;
  r.debug.afterFrame = (gl) => {
    const c = window.__cloud;
    if (!c.on) return;
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    const k = W / innerWidth;
    const side = Math.round(BOX * k);
    const x0 = Math.round(W / 2 - side / 2);
    const y0 = Math.round(H / 2 - side / 2);
    if (!buf || buf.length !== side * side * 4) buf = new Uint8Array(side * side * 4);
    gl.readPixels(x0, y0, side, side, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    if (!c.ref) {
      c.ref = buf.slice();
      return;
    }
    let n = 0;
    for (let i = 0; i < buf.length; i += 4) if (Math.abs(buf[i] - c.ref[i]) + Math.abs(buf[i + 1] - c.ref[i + 1]) + Math.abs(buf[i + 2] - c.ref[i + 2]) > 24) n++;
    c.cover.push({ t: performance.now(), f: n / (side * side) });
  };
}, BOX);

/** Face the open sky from the meadow, hold still, and record a second of frames after `blow` runs. */
async function measure(label, blow) {
  await page.evaluate(() => {
    const r = window.ranch;
    const p = r.sim.s.player;
    p.x = 0;
    p.z = -20;
    p.y = r.sim.phys.floor(0, -20);
    p.vx = p.vz = 0;
    p.yaw = 0.4;
    p.pitch = 0.55;
    r.sim.s.hour = 11;
  });
  await frames(page, 30);
  await page.evaluate(() => Object.assign(window.__cloud, { on: true, ref: null, cover: [] }));
  await frames(page, 2);
  const t0 = await page.evaluate(blow);
  await frames(page, 70);
  const cover = await page.evaluate((t0) => {
    const c = window.__cloud;
    c.on = false;
    return c.cover.filter((q) => q.t >= t0).map((q) => ({ t: (q.t - t0) / 1000, f: q.f }));
  }, t0);
  const peak = Math.max(...cover.map((q) => q.f));
  // How long a fifth or more of the aim was hidden.
  const over = cover.filter((q) => q.f >= 0.2);
  const long = over.length ? over[over.length - 1].t - over[0].t : 0;
  console.log(`   ${label}: peak ${(peak * 100).toFixed(0)}% of the aim area, over 20% for ${long.toFixed(2)} s`);
  return { peak, long };
}

const still = await measure('no blow (clouds and seed fluff drifting)', () => performance.now());
const old = await measure('the old puff (control)', () => {
  const r = window.ranch;
  const a = r.aim;
  const fx = r.fx;
  const rnd = (k) => (Math.random() - 0.5) * 2 * k;
  for (let i = 0; i < 12; i++) {
    const sp = 2 + Math.random() * 5;
    fx.spawn(a.mx, a.my, a.mz, a.dx * sp + rnd(0.9), a.dy * sp + rnd(0.9) + 0.3, a.dz * sp + rnd(0.9), 0.35 + Math.random() * 0.3, 0.06, 0.5, 0xf8f4ec, 0.55, 0, 4);
  }
  return performance.now();
});
const now = await measure('a blow now', () => {
  const r = window.ranch;
  r.sim.stow('tuft-clover');
  r.sim.s.sel = r.sim.s.slots.findIndex((q) => q.t === 'tuft-clover');
  r.sim.puff(r.aim);
  return performance.now();
});

check('the scan sees a cloud: the old puff hides much of the aim', old.peak > 0.3, `${(old.peak * 100).toFixed(0)}%`);
check('the sky alone barely changes', still.peak < 0.03, `${(still.peak * 100).toFixed(1)}%`);
check('a blow now hides at most a fifth of the aim area', now.peak <= 0.2, `${(now.peak * 100).toFixed(0)}% (old ${(old.peak * 100).toFixed(0)}%)`);
check('and never for long', now.long <= 0.1, `${now.long.toFixed(2)} s over 20% (old ${old.long.toFixed(2)} s)`);
check('no console errors', problems.length === 0, problems.slice(0, 3).join(' | '));

// A pest hit: what the game draws when one is sent rolling, over the pest's own box.
const pest = await openRanch(b, { width: 412, height: 915, dpr: 2, touch: true, query: 'touch&freeze' });
const pp = pest.page;
await pp.evaluate(() => {
  window.__hit = { on: false, ref: null, cover: [], box: null };
  window.ranch.debug.afterFrame = (gl) => {
    const c = window.__hit;
    if (!c.on || !c.box) return;
    const k = gl.drawingBufferWidth / innerWidth;
    const q = c.box;
    const x0 = Math.max(0, Math.round(q.x0 * k));
    const x1 = Math.min(gl.drawingBufferWidth, Math.round(q.x1 * k));
    const y0 = Math.max(0, Math.round(gl.drawingBufferHeight - q.y1 * k));
    const y1 = Math.min(gl.drawingBufferHeight, Math.round(gl.drawingBufferHeight - q.y0 * k));
    const w = x1 - x0;
    const h = y1 - y0;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    if (!c.ref) {
      c.ref = buf.slice();
      return;
    }
    let n = 0;
    for (let i = 0; i < buf.length; i += 4) if (Math.abs(buf[i] - c.ref[i]) + Math.abs(buf[i + 1] - c.ref[i + 1]) + Math.abs(buf[i + 2] - c.ref[i + 2]) > 30) n++;
    c.cover.push({ t: performance.now(), f: n / (w * h) });
  };
});
async function hit(hour, how) {
  await pp.evaluate((hour) => {
    const r = window.ranch;
    const sim = r.sim;
    const s = sim.s;
    s.hour = hour;
    s.downies = s.downies.filter((d) => d.keep);
    s.items = s.items.filter((i) => i.rest);
    const p = s.player;
    p.x = -8;
    p.z = -10;
    p.y = sim.phys.floor(p.x, p.z);
    const nx = -8;
    const nz = -13.5;
    const ny = sim.phys.floor(nx, nz);
    s.nettles = [{ id: 9001, x: nx, y: ny, z: nz, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: 0, mode: 'roam', modeT: 99, tx: nx, tz: nz, bristle: 0, roll: 0, gone: false, snuffT: 99 }];
    r.aimAt(nx, ny + 0.4, nz);
  }, hour);
  await frames(pp, 40);
  await pp.evaluate(() => {
    const r = window.ranch;
    const n = r.sim.s.nettles[0];
    const pts = [[n.x - 0.4, n.y + 0.02], [n.x + 0.4, n.y + 0.02], [n.x + 0.4, n.y + 0.55], [n.x - 0.4, n.y + 0.55]].map(([x, y]) => r.project(x, y, n.z + 0.3));
    window.__hit.box = { x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) };
    Object.assign(window.__hit, { on: true, ref: null, cover: [] });
  });
  await frames(pp, 2);
  const t0 = await pp.evaluate((how) => {
    const r = window.ranch;
    const n = r.sim.s.nettles[0];
    // The game's own handling of a hit (its sound and its puff), or a replay of the old cream dust (the control).
    if (how === 'game') r.sim.events.push({ t: 'nettlehit', x: n.x, y: n.y, z: n.z });
    else if (how === 'old') r.fx.dust(n.x, n.y, n.z, 0.3);
    return performance.now();
  }, how);
  await frames(pp, 45);
  const cover = await pp.evaluate((t0) => {
    const c = window.__hit;
    c.on = false;
    return c.cover.filter((q) => q.t >= t0 && q.t <= t0 + 500).map((q) => q.f);
  }, t0);
  const peak = Math.max(...cover);
  const mean = cover.reduce((a, q) => a + q, 0) / Math.max(1, cover.length);
  console.log(`   a pest hit at ${hour}:00, ${how === 'game' ? 'as the game draws it' : how === 'old' ? 'the old dust (control)' : 'nothing (grass and fluff drifting)'}: peak ${(peak * 100).toFixed(1)}% of its box changed, mean ${(mean * 100).toFixed(1)}% over 0.5 s`);
  return { peak, mean };
}
const hits = {};
for (const hour of [23, 12]) for (const how of ['none', 'old', 'game']) hits[`${hour}-${how}`] = await hit(hour, how);
check('the scan sees a cloud over a pest: the old dust hides much of it (control)', hits['23-old'].peak > 0.3 && hits['12-old'].peak > 0.3, `${(hits['23-old'].peak * 100).toFixed(0)}% at night, ${(hits['12-old'].peak * 100).toFixed(0)}% by day`);
check('a pest sent rolling stays in sight: its hit changes at most 15% of its box, night or day (the old dust 60% or more)', hits['23-game'].peak <= 0.15 && hits['12-game'].peak <= 0.15, `${(hits['23-game'].peak * 100).toFixed(1)}% at night, ${(hits['12-game'].peak * 100).toFixed(1)}% by day; still ${(hits['23-none'].peak * 100).toFixed(1)}% and ${(hits['12-none'].peak * 100).toFixed(1)}%`);
check('no console errors (pest page)', pest.problems.length === 0, pest.problems.slice(0, 3).join(' | '));
await b.close();
console.log(failed() ? `BLOW CLOUD FAILED (${failed()})` : 'BLOW CLOUD OK');
process.exit(failed() ? 1 : 0);
