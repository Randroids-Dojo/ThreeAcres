// Scans every frame of the 2D renderer for one-frame flashes or missing
// layers while caches rebuild: zoom buckets, season and weather changes, mode
// switches, mass plot changes and the night transition. Each frame is copied
// into a 16x16 CPU canvas (the renderer's own canvas is never read back) and
// a block that jumps away and straight back is a flicker. A lightning flash
// is the positive control: the detector must see it.
//   node scripts/render2d-flicker.mjs [--view=phone|desk]

import { chromium } from 'playwright-core';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const BASE = arg('base', 'http://localhost:5248');
const VIEW = arg('view', 'phone');
const vp = VIEW === 'phone' ? { viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.625, isMobile: true } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage(vp);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/?dev=2d&fixture=lush`);
await page.waitForFunction(() => window.harness && window.harness.frames > 5);
await page.evaluate(() => {
  const h = window.harness;
  const r = h.renderers[0];
  const orig = r.frame.bind(r);
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d', { willReadFrequently: true });
  // Halve step by step so every pixel is averaged in; one big shrink would
  // alias a scrolling page into fake spikes.
  const steps = [];
  window.__fault = -1;
  window.__n = 0;
  r.frame = (v) => {
    orig(v);
    if (!window.__rec) return;
    if (window.__n++ === window.__fault) {
      // The control: one frame with a layer missing.
      const cx = r.canvas.getContext('2d');
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.fillStyle = '#f2e8cf';
      cx.fillRect(0, r.canvas.height * 0.4, r.canvas.width, r.canvas.height * 0.2);
    }
    let src = r.canvas;
    let w = src.width;
    let h2 = src.height;
    let k = 0;
    while (w > 32 || h2 > 32) {
      w = Math.max(16, Math.ceil(w / 2));
      h2 = Math.max(16, Math.ceil(h2 / 2));
      let st = steps[k];
      if (!st) {
        st = document.createElement('canvas');
        steps[k] = st;
      }
      if (st.width !== w || st.height !== h2) {
        st.width = w;
        st.height = h2;
      }
      const sg = st.getContext('2d');
      sg.clearRect(0, 0, w, h2);
      sg.drawImage(src, 0, 0, w, h2);
      src = st;
      k++;
    }
    g.clearRect(0, 0, 16, 16);
    g.drawImage(src, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    const L = new Uint8Array(256);
    for (let i = 0; i < 256; i++) L[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) | 0;
    window.__rec.push(L);
  };
});

async function scenario(name, steps) {
  await page.evaluate(() => {
    const h = window.harness;
    h.setFixture('lush');
    h.setAnimate(false);
    h.setCamera({ mode: 'wide', zoom: 1, panX: 0, panY: 0 });
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window.__rec = []));
  for (const s of steps) {
    if (typeof s === 'number') await page.waitForTimeout(s);
    else if (Array.isArray(s)) await page.evaluate(s[0], s[1]);
    else await page.evaluate(s);
  }
  await page.waitForTimeout(300);
  const rec = await page.evaluate(() => {
    const r = window.__rec.map((a) => Array.from(a));
    window.__rec = null;
    return r;
  });
  // A spike: a block that leaves its neighbours' level for a single frame.
  let worst = 0;
  let spikes = 0;
  for (let i = 1; i < rec.length - 1; i++) {
    let frameWorst = 0;
    for (let b = 0; b < 256; b++) {
      const a = rec[i - 1][b];
      const m = rec[i][b];
      const z = rec[i + 1][b];
      const s = Math.min(Math.abs(m - a), Math.abs(m - z)) - Math.abs(z - a);
      if (s > frameWorst) frameWorst = s;
    }
    // A fast glide can carry a dark band of trees across a block in two frames
    // (measured up to 28); a missing layer for one frame reads about 140.
    if (frameWorst > 40) spikes++;
    worst = Math.max(worst, frameWorst);
  }
  const row = { name, frames: rec.length, spikes, worst };
  console.log(JSON.stringify(row));
  return row;
}

const rows = [];
rows.push(await scenario('idle', [2000]));
rows.push(await scenario('control: one frame with a layer missing (must flag)', [() => (window.__fault = window.__n + 30), 1200]));
rows.push(await scenario('wide to close and back', [() => window.harness.setCamera({ mode: 'close', zoom: 1 }), 1500, () => window.harness.setCamera({ mode: 'wide', zoom: 1 }), 1500]));
rows.push(
  await scenario('pinch zoom steps', [
    ...[1.2, 1.5, 1.9, 2.3, 2.5, 2, 1.4, 0.9, 0.6, 1].flatMap((z) => [[(zz) => window.harness.setCamera({ zoom: zz }), z], 180]),
    800,
  ]),
);
rows.push(await scenario('season change in place', [() => (window.harness.state.day += 10), 1500, () => (window.harness.state.day += 10), 1500]));
rows.push(
  await scenario('winter snow starts and stops', [
    () => {
      window.harness.state.day = 34;
    },
    1500,
    () => (window.harness.state.weather = 'rain'),
    1500,
    () => (window.harness.state.weather = 'sun'),
    1500,
  ]),
);
rows.push(
  await scenario('every plot watered at once, then dried', [
    () => window.harness.state.plots.forEach((p) => (p.wet = true)),
    800,
    () => window.harness.state.plots.forEach((p) => (p.wet = false)),
    800,
  ]),
);
rows.push(await scenario('buy a field (fence comes down)', [() => (window.harness.state.parcels[5].owned = false), 600, () => (window.harness.state.parcels[5].owned = true), 600]));
await browser.close();

const control = rows.find((r) => r.name.startsWith('control'));
const others = rows.filter((r) => r !== control);
console.log(`detector sees the control: ${control.spikes > 0 ? 'yes' : 'NO'}`);
console.log(`flicker elsewhere: ${others.reduce((a, r) => a + r.spikes, 0)} spikes`);
if (errors.length) console.log(`page errors:\n${errors.join('\n')}`);
