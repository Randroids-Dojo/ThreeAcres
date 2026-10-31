// Frame cost of the 3D renderer at phone size (412x900 CSS px, DPR 2).
// Wraps renderer.frame so each frame is timed on the CPU, and once with
// gl.finish() so the GPU work is included, over a few hundred frames per
// scenario. Also records draw calls and triangles.
//
//   node scripts/render3d-perf.mjs [frames]

import { frames, launch, openBench } from './render3d-lib.mjs';

const N = Number(process.argv[2]) || 300;
const SCENARIOS = [
  { name: 'lush wide high', fixture: 'lush', camera: 'wide', quality: 'high' },
  { name: 'lush close high', fixture: 'lush', camera: 'close', quality: 'high' },
  { name: 'storm wide high', fixture: 'storm', camera: 'wide', quality: 'high' },
  { name: 'winter snow wide high', fixture: 'winter', camera: 'wide', quality: 'high' },
  { name: 'night wide high', fixture: 'night', camera: 'wide', quality: 'high' },
  { name: 'lush wide low', fixture: 'lush', camera: 'wide', quality: 'low' },
  { name: 'storm close low', fixture: 'storm', camera: 'close', quality: 'low' },
];

const browser = await launch();
const { page, problems } = await openBench(browser, { width: 412, height: 900, dpr: 2 });
await page.evaluate(() => {
  const r = window.harness.renderers[0];
  const gl = r.debug.renderer.getContext();
  const orig = r.frame.bind(r);
  window.__perf = { cpu: [], gpu: [], raf: [], last: 0, finish: false, quality: 'high', calls: 0, tris: 0 };
  r.frame = (v) => {
    const p = window.__perf;
    v = { ...v, quality: p.quality };
    const t0 = performance.now();
    orig(v);
    const t1 = performance.now();
    if (p.finish) gl.finish();
    const t2 = performance.now();
    p.cpu.push(t1 - t0);
    p.gpu.push(t2 - t0);
    if (p.last) p.raf.push(t0 - p.last);
    p.last = t0;
    const s = r.debug.stats();
    p.calls = s.calls;
    p.tris = s.triangles;
  };
});

const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const q = (k) => s[Math.min(s.length - 1, Math.floor(k * s.length))];
  return { med: q(0.5), p95: q(0.95), max: s[s.length - 1] };
};
const f = (x) => x.toFixed(2).padStart(6);

console.log(`Frames per scenario: ${N}. Canvas 412x900 CSS px at DPR 2 (824x1800).`);
console.log('scenario                    cpu med  p95    | cpu+gpu med  p95    max   | raf med  p95   | calls  tris');
for (const sc of SCENARIOS) {
  await page.evaluate((sc) => {
    const h = window.harness;
    h.setAnimate(true);
    h.setFixture(sc.fixture);
    h.setCamera({ mode: sc.camera, zoom: 1, panX: 0, panY: 0 });
    h.show('3d');
    window.__perf.quality = sc.quality;
  }, sc);
  await frames(page, 30);
  // Pass 1: CPU time and frame pacing without forcing a sync.
  await page.evaluate(() => Object.assign(window.__perf, { cpu: [], gpu: [], raf: [], last: 0, finish: false }));
  await frames(page, N);
  const a = await page.evaluate(() => ({ cpu: window.__perf.cpu, raf: window.__perf.raf, calls: window.__perf.calls, tris: window.__perf.tris }));
  // Pass 2: with gl.finish so the GPU cost lands in the measurement.
  await page.evaluate(() => Object.assign(window.__perf, { cpu: [], gpu: [], raf: [], last: 0, finish: true }));
  await frames(page, N);
  const b = await page.evaluate(() => window.__perf.gpu);
  const c = stats(a.cpu);
  const g = stats(b);
  const r = stats(a.raf);
  console.log(`${sc.name.padEnd(26)} ${f(c.med)} ${f(c.p95)}  | ${f(g.med)} ${f(g.p95)} ${f(g.max)} | ${f(r.med)} ${f(r.p95)} | ${String(a.calls).padStart(5)} ${String(a.tris).padStart(7)}`);
}
const gpu = await page.evaluate(() => {
  const gl = window.harness.renderers[0].debug.renderer.getContext();
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log(`GPU: ${gpu}`);
if (problems.length) console.log('Console problems:\n' + problems.join('\n'));
await browser.close();
