// Measures the 2D renderer: frame() time at phone and desktop sizes, a stress
// run that draws k frames per animation frame (so the GPU work is counted too:
// if k frames still fit in 16.7 ms, one frame costs under 16.7 / k ms), CPU
// throttled runs in a clean page, the cost of a dawn burst of events, and that
// pick(project(tile centre)) lands on the same tile for every tile in both
// camera modes at several zooms. getImageData is never used: reading back
// would push the canvas off the GPU and skew everything after it.
//   node scripts/render2d-perf.mjs [--frames=300] [--base=http://localhost:5248]

import { chromium } from 'playwright-core';
import fs from 'node:fs';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const BASE = arg('base', 'http://localhost:5248');
const FRAMES = Number(arg('frames', '300'));
const OUT = arg('out', '/tmp/acres-2d');

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const report = { perf: [], events: [], pick: [], errors: [] };

const CASES = [
  { name: 'phone 412x900 dpr2', vp: { width: 412, height: 900 }, dsf: 2.625, mobile: true },
  { name: 'desk 1280x800 dpr1', vp: { width: 1280, height: 800 }, dsf: 1, mobile: false },
  { name: 'desk 1280x800 dpr2', vp: { width: 1280, height: 800 }, dsf: 2, mobile: false },
];

for (const c of CASES) {
  const ctx = await browser.newContext({ viewport: c.vp, deviceScaleFactor: c.dsf, isMobile: c.mobile, hasTouch: c.mobile });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && report.errors.push(`[${c.name}] ${m.text()}`));
  page.on('pageerror', (e) => report.errors.push(`[${c.name}] ${e.message}`));
  await page.goto(`${BASE}/?dev=2d&fixture=lush`);
  await page.waitForFunction(() => window.harness && window.harness.frames > 5, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await ctx.newCDPSession(page);

  // Wrap frame() to time it.
  await page.evaluate(() => {
    const r = window.harness.renderers[0];
    const orig = r.frame.bind(r);
    window.__t = [];
    window.__k = 1;
    r.frame = (v) => {
      const t0 = performance.now();
      for (let i = 0; i < window.__k; i++) orig(v);
      window.__t.push((performance.now() - t0) / window.__k);
    };
  });

  const measure = async (label, setup, throttle, k) => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.evaluate(setup);
    await page.waitForTimeout(1500);
    await page.evaluate((k) => {
      window.__t = [];
      window.__k = k;
    }, k);
    const f0 = await page.evaluate(() => window.harness.frames);
    const w0 = Date.now();
    await page.waitForFunction((t) => window.harness.frames >= t, f0 + FRAMES, { timeout: 120000 });
    const wall = (Date.now() - w0) / 1000;
    const ts = await page.evaluate(() => window.__t.slice());
    await page.evaluate(() => (window.__k = 1));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    ts.sort((a, b) => a - b);
    const q = (p) => ts[Math.min(ts.length - 1, Math.floor(ts.length * p))];
    const mean = ts.reduce((a, b) => a + b, 0) / ts.length;
    const row = { case: c.name, label, throttle, k, frames: ts.length, mean: +mean.toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +ts[ts.length - 1].toFixed(2), fps: +(FRAMES / wall).toFixed(1) };
    report.perf.push(row);
    console.log(JSON.stringify(row));
  };

  const wide = () => {
    window.harness.setFixture('lush');
    window.harness.setCamera({ mode: 'wide', zoom: 1, panX: 0, panY: 0 });
    window.harness.setAnimate(true);
  };
  const close = () => {
    window.harness.setFixture('lush');
    window.harness.setCamera({ mode: 'close', zoom: 1 });
    window.harness.setAnimate(true);
  };
  const storm = () => {
    window.harness.setFixture('storm');
    window.harness.setCamera({ mode: 'wide', zoom: 1, panX: 0, panY: 0 });
    window.harness.setAnimate(true);
  };
  const night = () => {
    window.harness.setFixture('winter');
    window.harness.setCamera({ mode: 'wide', zoom: 1, panX: 0, panY: 0 });
    window.harness.setMinute(1000);
  };
  await measure('wide lush', wide, 1, 1);
  await measure('close lush', close, 1, 1);
  await measure('wide storm', storm, 1, 1);
  await measure('wide winter snow night', night, 1, 1);
  await measure('wide lush, 6 frames per rAF', wide, 1, 6);
  await measure('wide storm, 6 frames per rAF', storm, 1, 6);
  await measure('close lush, 6 frames per rAF', close, 1, 6);
  if (c.mobile) {
    await measure('wide lush, cpu x4', wide, 4, 1);
    await measure('close lush, cpu x4', close, 4, 1);
    await measure('wide storm, cpu x4', storm, 4, 1);
  }

  // A dawn burst: every field tile grows at once, plus a handful of others.
  const ev = await page.evaluate(() => {
    const h = window.harness;
    h.setFixture('lush');
    const r = h.renderers[0];
    const s = h.state;
    const list = [];
    for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) if (s.tiles[y * s.W + x] === 'field') list.push({ type: 'grow', x, y, crop: 'corn', stage: 3 });
    for (let i = 0; i < 4; i++) list.push(...list);
    return new Promise((res) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const t0 = performance.now();
          for (const e of list) r.onEvent(e, s);
          const t1 = performance.now();
          res({ events: list.length, ms: +(t1 - t0).toFixed(3) });
        }),
      ),
    );
  });
  report.events.push({ case: c.name, ...ev });
  console.log('dawn burst', c.name, JSON.stringify(ev));

  // pick(project(tile centre)) for every tile, both modes, several zooms.
  for (const mode of ['wide', 'close']) {
    for (const zoom of [0.6, 1, 1.8, 2.5]) {
      const res = await page.evaluate(
        async ([mode, zoom]) => {
          const h = window.harness;
          h.setAnimate(false);
          h.setFixture('lush');
          h.setCamera({ mode, zoom, panX: mode === 'wide' ? 1.5 : 0, panY: mode === 'wide' ? -1 : 0 });
          const r = h.renderers[0];
          await new Promise((res) => setTimeout(res, 900));
          await new Promise((res) => requestAnimationFrame(() => res()));
          const s = h.state;
          let ok = 0;
          let bad = 0;
          let onscreen = 0;
          const fails = [];
          const W = r.canvas.clientWidth;
          const H = r.canvas.clientHeight;
          for (let y = 0; y < s.H; y++) {
            for (let x = 0; x < s.W; x++) {
              for (const [fx, fy] of [
                [0.5, 0.5],
                [0.02, 0.02],
                [0.98, 0.98],
              ]) {
                const p = r.project(x + fx, y + fy, 0);
                const q = r.pick(p.x, p.y);
                if (fx === 0.5 && p.x >= 0 && p.y >= 0 && p.x < W && p.y < H) onscreen++;
                if (q && q.x === x && q.y === y) ok++;
                else {
                  bad++;
                  if (fails.length < 5) fails.push({ x, y, fx, p, q });
                }
              }
            }
          }
          // Off the map picks null.
          const o1 = r.project(-0.5, 3, 0);
          const o2 = r.project(s.W + 0.5, 3, 0);
          const nulls = r.pick(o1.x, o1.y) === null && r.pick(o2.x, o2.y) === null;
          // Pixels per tile on screen.
          const a = r.project(0, 0, 0);
          const b = r.project(1, 0, 0);
          return { ok, bad, onscreen, nulls, tilePx: +(b.x - a.x).toFixed(2), fails };
        },
        [mode, zoom],
      );
      const row = { case: c.name, mode, zoom, ...res };
      report.pick.push(row);
      console.log('pick', JSON.stringify(row));
    }
  }
  // Snap: the drawn camera jumps to the target at once.
  const snap = await page.evaluate(async () => {
    const h = window.harness;
    h.setCamera({ mode: 'wide', zoom: 1, panX: 0, panY: 0 });
    await new Promise((res) => setTimeout(res, 800));
    const r = h.renderers[0];
    const before = r.project(5.5, 5.5, 0);
    h.setCamera({ mode: 'close', zoom: 1 });
    h.show('2d');
    const after = r.project(5.5, 5.5, 0);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
    const later = r.project(5.5, 5.5, 0);
    return { moved: Math.hypot(after.x - before.x, after.y - before.y) > 1, settled: Math.hypot(later.x - after.x, later.y - after.y) < 0.5 };
  });
  report.snap = { ...(report.snap || {}), [c.name]: snap };
  console.log('snap', c.name, JSON.stringify(snap));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(report, null, 2));
const bad = report.pick.reduce((a, r) => a + r.bad, 0);
console.log(`pick round trip: ${bad === 0 ? 'all tiles OK' : `${bad} failures`}, off-map null: ${report.pick.every((r) => r.nulls)}`);
console.log(report.errors.length ? `errors:\n${report.errors.join('\n')}` : 'no console errors');
