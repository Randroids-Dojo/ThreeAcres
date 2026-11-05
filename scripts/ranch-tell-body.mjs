// Thistledown, round 10: the tug's tell on the downy's body, measured on the
// phone. The tenth playtest read the tug off the ring alone (solid gold for a
// real pull, pale for a fake); the ring sits round the crosshair, and the
// crosshair sits on the downy's middle, so at 6 to 10 m round 8's swell of a
// third stayed mostly inside the ring. Now a real tell rears the downy up
// (swelling, growing taller from its feet, leaning back to face you) so its top
// rises out past the ring, and a fake only swells a little.
//
// On the Pixel's viewport (412 by 915 at DPR 2.6), at noon on meadow grass, a
// wild ember 6, 8 and 10 m off with the crosshair on its middle, the game held:
// a frame with no downy, then at rest, at the height of a real tell and at the
// height of a fake one, the crosshair and HUD hidden. Its silhouette is what
// differs from the frame with no downy, time standing still for the frames (a
// second empty frame measures what noise is left). Reported per distance: the
// silhouette's area past the tug ring (CSS px squared), and how far its top
// rises above the ring's top (CSS px). A control puts back round 9's body tell
// (a third bigger, no rearing, a fake a sixth bigger) and must read worse.
//   RANCH_URL=http://localhost:5247 node scripts/ranch-tell-body.mjs
import { launch, openRanch, frames, checker } from './ranch-lib.mjs';

const { check, failed } = checker();
const DPR = 2.6;
const b = await launch();
const { page: p, problems } = await openRanch(b, { width: 412, height: 915, dpr: DPR, touch: true });
await frames(p, 10);

// The tug ring's outer edge, from the crosshair's own drawing (an ember has no time ring): r 13 plus half its ink.
const RING = await p.evaluate(() => {
  const c = document.querySelector('.rh-cross');
  const k = (c.getBoundingClientRect().width || 48) / 48;
  return { cx: innerWidth / 2, cy: innerHeight / 2, r: (13 + 7.5 / 2) * k };
});

await p.evaluate(() => {
  const r = window.ranch;
  const s = r.sim.s;
  s.hour = 12;
  for (const d of s.downies) if (!d.tame && !d.keep) d.gone = true;
  s.nettles = [];
  const d = r.sim.spawn('ember', -16, -9, false);
  d.hunger = 0.2;
  d.hopT = 99;
  d.yaw = 0;
  window.__d = d;
  r.frozen = true;
  // (Time stands still for the frames: no swaying grass, no drifting fluff, so what differs is the downy.)
  r.still = true;
  const st = document.createElement('style');
  st.textContent = '.rh-cross, .rh-page, .rt-btn, .rh-note, .rh-count { visibility: hidden !important; }';
  document.head.append(st);
});

const BOX = 240;
/** A frame's pixels round the crosshair (BOX by BOX CSS px), as RGB bytes. */
async function grab() {
  await frames(p, 3);
  const buf = await p.screenshot({ clip: { x: RING.cx - BOX / 2, y: RING.cy - BOX / 2, width: BOX, height: BOX } });
  return p.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, px: Array.from(g.getImageData(0, 0, img.width, img.height).data) };
  }, buf.toString('base64'));
}

/** What differs from the empty frame: area past the ring (CSS px squared), the top's rise over the ring's top (CSS px), and the area in all. */
function silhouette(a, none) {
  const k = a.w / BOX;
  let past = 0;
  let all = 0;
  let top = Infinity;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const i = (y * a.w + x) * 4;
      const d = Math.abs(a.px[i] - none.px[i]) + Math.abs(a.px[i + 1] - none.px[i + 1]) + Math.abs(a.px[i + 2] - none.px[i + 2]);
      if (d < 60) continue;
      all++;
      const cx = x / k - BOX / 2;
      const cy = y / k - BOX / 2;
      if (Math.hypot(cx, cy) > RING.r) past++;
      top = Math.min(top, cy);
    }
  }
  return { past: past / (k * k), all: all / (k * k), rise: top === Infinity ? -99 : -RING.r - top };
}

const set = (state) =>
  p.evaluate((state) => {
    const d = window.__d;
    d.gone = state === 'none';
    d.tell = 0;
    d.feint = 0;
    d.back = 0;
    if (state === 'tell') {
      d.tellLen = 0.5;
      d.tell = 0.02;
    }
    if (state === 'fake') {
      d.feintLen = 0.44;
      d.feint = 0.22;
    }
  }, state);

async function measure(dist) {
  await p.evaluate((dist) => {
    const r = window.ranch;
    const s = r.sim.s;
    const d = window.__d;
    const pl = s.player;
    pl.x = d.x;
    pl.z = d.z + dist;
    pl.y = r.sim.phys.floor(pl.x, pl.z);
    d.y = r.sim.phys.floor(d.x, d.z);
    r.aimAt(d.x, d.y + 0.25, d.z);
  }, dist);
  await frames(p, 6);
  await set('none');
  const none = await grab();
  const none2 = await grab();
  const out = { noise: silhouette(none2, none).all };
  for (const st of ['rest', 'tell', 'fake']) {
    await set(st);
    out[st] = silhouette(await grab(), none);
  }
  await set('rest');
  return out;
}

const DISTS = [6, 8, 10];
const now = {};
for (const D of DISTS) now[D] = await measure(D);
// The control: round 9's body tell.
const keep = await p.evaluate(() => ({ ...window.ranch.tellBody }));
await p.evaluate(() => Object.assign(window.ranch.tellBody, { swell: 0.34, stretch: 0, lean: 0, fake: 0.16 }));
const old = {};
for (const D of DISTS) old[D] = await measure(D);
await p.evaluate((k) => Object.assign(window.ranch.tellBody, k), keep);

const f = (q) => `past the ring ${q.past.toFixed(0)} px², top ${q.rise >= 0 ? `${q.rise.toFixed(1)} px above` : `${(-q.rise).toFixed(1)} px under`} the ring's top, ${q.all.toFixed(0)} px² in all`;
console.log(`Thistledown, the tell on the body: an ember at noon, the crosshair on its middle, the tug ring ${RING.r.toFixed(1)} CSS px round (phone, DPR ${DPR})`);
for (const [name, set] of [['now', now], ["control (round 9's body)", old]]) {
  console.log(`   ${name}:`);
  for (const D of DISTS) {
    const q = set[D];
    console.log(`      ${D} m (noise ${q.noise.toFixed(0)} px²): at rest ${f(q.rest)}; real tell ${f(q.tell)}; fake ${f(q.fake)}`);
  }
}
// The bar: a real tell grows the silhouette by 60% or more and lifts its top 8 CSS px or more, its gain past the ring
// clear of the noise; a fake grows it by under a third of the real one's gain, its top 8 px or more under the real
// one's, so the body tells a fake from a real pull as the ring does.
const gain = (q, st) => q[st].all - q.rest.all;
const lift = (q, st) => q[st].rise - q.rest.rise;
const real = (q) => q[st0].all >= q.rest.all * 1.6 && lift(q, st0) >= 8 && gain(q, st0) > q.noise * 4;
const st0 = 'tell';
const apart = (q) => gain(q, 'fake') < gain(q, 'tell') / 3 && q.tell.rise - q.fake.rise >= 8;
for (const D of DISTS) {
  const q = now[D];
  check(`${D} m: a real tell shows on the body: its silhouette 60% bigger or more, its top 8 px higher or more`, real(q), `${((q.tell.all / q.rest.all - 1) * 100).toFixed(0)}% bigger, top ${lift(q, 'tell').toFixed(1)} px higher, noise ${q.noise.toFixed(0)} px²; past the ring ${q.rest.past.toFixed(0)} to ${q.tell.past.toFixed(0)} px²`);
  check(`${D} m: a fake shows less: under a third of the real tell's growth, its top 8 px or more under the real one's`, apart(q), `fake ${((q.fake.all / q.rest.all - 1) * 100).toFixed(0)}% bigger, its top ${(q.tell.rise - q.fake.rise).toFixed(1)} px under the real one's`);
}
check("control: round 9's body (a third bigger, a fake a sixth bigger) does not tell a fake from a real pull by that bar at 6 to 10 m (it must fail)", !DISTS.every((D) => apart(old[D])), DISTS.map((D) => `${D} m: fake gain ${(gain(old[D], 'fake') / Math.max(1, gain(old[D], 'tell'))).toFixed(2)} of the real's, tops ${(old[D].tell.rise - old[D].fake.rise).toFixed(1)} px apart`).join('; '));
check('no console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
await b.close();
process.exit(failed() ? 1 : 0);
