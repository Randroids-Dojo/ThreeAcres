// How much of the aim does a blow's puff of air hide? On the Pixel's viewport
// (412 by 838 at DPR 2.625, touch), facing an empty sky, reads every frame
// back from WebGL for a second after a blow and counts the pixels in the aim
// area (a square of 120 CSS px round the crosshair) that changed by more than
// a little from the frame before the blow. A run with no blow measures the
// drift of clouds and seed fluff, and a control replays the old puff (12 big,
// growing, half-opaque wisps) so the scan is shown to see a cloud at all.
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
await b.close();
console.log(failed() ? `BLOW CLOUD FAILED (${failed()})` : 'BLOW CLOUD OK');
process.exit(failed() ? 1 : 0);
