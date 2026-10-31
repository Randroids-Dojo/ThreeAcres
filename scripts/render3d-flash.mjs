// Flash scan for the 3D renderer: reads every drawn frame back from WebGL
// (inside the frame, before the browser composites it) and counts pure black
// pixels and magenta pixels. A sibling project shipped one-frame black squares
// from pow() of a negative number. A NaN in an opaque material writes black;
// in a blended one, some GPUs (this Mac's) leave the pixel unchanged, so the
// renderer's NaN sentinel is switched on: any non-finite shader output, opaque
// or blended, is painted magenta.
//
// 1. Control: plant real NaNs (opaque and blended) with the sentinel off and
//    on. The scan must see them, or its clean results mean nothing.
// 2. Scan: several hundred frames per scenario (fixtures, cameras, weather,
//    hours, an event storm), animated, with the sentinel on.
//
//   node scripts/render3d-flash.mjs [framesPerScenario] [width height dpr]

import { frames, launch, openBench } from './render3d-lib.mjs';

const N = Number(process.argv[2]) || 240;
const width = Number(process.argv[3]) || 412;
const height = Number(process.argv[4]) || 900;
const dpr = Number(process.argv[5]) || 2;

const browser = await launch();
const { page, problems } = await openBench(browser, { width, height, dpr });

await page.evaluate(() => {
  const r = window.harness.renderers[0];
  window.__scan = { frames: 0, dirty: 0, worst: 0, total: 0, black: 0, magenta: 0, log: [], on: false };
  let buf = null;
  r.debug.afterFrame = (gl) => {
    const sc = window.__scan;
    if (!sc.on) return;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (!buf || buf.length !== w * h * 4) buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let black = 0;
    let magenta = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      if (r === 0 && g === 0 && b === 0) black++;
      else if (r >= 230 && g <= 40 && b >= 230) magenta++;
    }
    const bad = black + magenta;
    sc.frames++;
    sc.total += bad;
    sc.black += black;
    sc.magenta += magenta;
    if (bad > 0) {
      sc.dirty++;
      if (sc.log.length < 8) sc.log.push({ frame: sc.frames, black, magenta });
    }
    sc.worst = Math.max(sc.worst, bad);
  };
});

const reset = () => page.evaluate(() => Object.assign(window.__scan, { frames: 0, dirty: 0, worst: 0, total: 0, black: 0, magenta: 0, log: [], on: true }));
const read = () => page.evaluate(() => ({ ...window.__scan }));

// 1. Control.
const dbg = (expr) => page.evaluate(expr);
await dbg(() => window.harness.setFixture('lush'));
await frames(page, 5);
const phase = async (label, setup) => {
  await page.evaluate(setup);
  await frames(page, 3);
  await reset();
  await frames(page, 6);
  const r = await read();
  await page.evaluate(() => window.harness.renderers[0].debug.injectNaN(false));
  console.log(`  ${label.padEnd(40)} ${r.dirty}/${r.frames} frames flagged, black ${Math.round(r.black / Math.max(1, r.frames))} px and magenta ${Math.round(r.magenta / Math.max(1, r.frames))} px per frame`);
  return r;
};
console.log('Control:');
const c0 = await phase('nothing planted, sentinel on', () => window.harness.renderers[0].debug.watchNaN(true));
const c1 = await phase('opaque NaN, sentinel off', () => {
  const d = window.harness.renderers[0].debug;
  d.watchNaN(false);
  d.injectNaN(true, 'opaque');
});
const c2 = await phase('blended NaN, sentinel off', () => window.harness.renderers[0].debug.injectNaN(true, 'blended'));
const c3 = await phase('opaque NaN, sentinel on', () => {
  const d = window.harness.renderers[0].debug;
  d.watchNaN(true);
  d.injectNaN(true, 'opaque');
});
const c4 = await phase('blended NaN, sentinel on', () => window.harness.renderers[0].debug.injectNaN(true, 'blended'));
const seen = (r) => r.dirty >= r.frames - 1 && r.worst >= 64;
const controlOk = c0.dirty === 0 && seen(c1) && seen(c3) && seen(c4) && c3.magenta > 0 && c4.magenta > 0;
console.log(`  A blended NaN with the sentinel off was ${seen(c2) ? 'visible' : 'invisible'} on this GPU.`);
if (!controlOk) console.log('  The detector did not cleanly see the planted NaNs: results below cannot be trusted.');
await page.evaluate(() => window.harness.renderers[0].debug.watchNaN(true));

// 2. Scenarios.
const SCENARIOS = [
  { name: 'lush wide', fixture: 'lush', camera: 'wide' },
  { name: 'lush close', fixture: 'lush', camera: 'close' },
  { name: 'synergy overlay', fixture: 'synergy', camera: 'wide', keys: ['o'] },
  { name: 'meadow dawn', fixture: 'meadow', camera: 'wide' },
  { name: 'dusk', fixture: 'dusk', camera: 'wide' },
  { name: 'night close', fixture: 'night', camera: 'close' },
  { name: 'rain close', fixture: 'rain', camera: 'close' },
  { name: 'storm + thunder', fixture: 'storm', camera: 'wide', thunder: true },
  { name: 'heat', fixture: 'heat', camera: 'wide' },
  { name: 'autumn', fixture: 'autumn', camera: 'wide' },
  { name: 'winter snow close', fixture: 'winter', camera: 'close' },
  { name: 'event storm', fixture: 'lush', camera: 'wide', events: true },
  { name: 'day running', fixture: 'lush', camera: 'wide', clock: true },
];
let dirtyTotal = 0;
let frameTotal = 0;
for (const sc of SCENARIOS) {
  await page.evaluate((sc) => {
    const h = window.harness;
    h.setAnimate(true);
    h.setFixture(sc.fixture);
    h.setCamera({ mode: sc.camera, zoom: 1, panX: 0, panY: 0 });
    h.show('3d');
  }, sc);
  for (const k of sc.keys ?? []) await page.keyboard.press(k);
  await frames(page, 10);
  await reset();
  if (sc.clock) {
    await page.evaluate(() => (window.harness.state.minute = 0));
    await page.keyboard.press(' ');
  }
  // Fire events while the frames run.
  const stop = await page.evaluate((sc) => {
    const h = window.harness;
    const types = ['till', 'water', 'plant', 'grow', 'harvest', 'tend', 'clear', 'build', 'unbuild', 'wither', 'bugs', 'sprinkle', 'crowIn', 'crowEat', 'crowScared', 'deny', 'coins'];
    let i = 0;
    const id = setInterval(() => {
      if (sc.thunder && i % 6 === 0) h.fire({ type: 'thunder' });
      if (sc.events) {
        for (let k = 0; k < 4; k++) {
          const t = types[(i * 4 + k) % types.length];
          const x = 2 + ((i * 7 + k * 3) % 14);
          const y = 5 + ((i * 3 + k) % 9);
          h.fire({ type: t, x, y, by: 1, crop: 'corn', quality: (i + k) % 4, stage: 2, kind: 'sprinkler', id: 900, reason: 'x', amount: 5 });
        }
        if (i % 20 === 0) h.fire({ type: 'dawn', day: 2, weather: 'sun', season: 1 });
      }
      i++;
    }, 70);
    window.__stopEvents = () => clearInterval(id);
    return true;
  }, sc);
  void stop;
  if (sc.name === 'event storm') await page.keyboard.press('n');
  await frames(page, N);
  await page.evaluate(() => window.__stopEvents());
  if (sc.clock) await page.keyboard.press(' ');
  for (const k of sc.keys ?? []) await page.keyboard.press(k);
  const r = await read();
  dirtyTotal += r.dirty;
  frameTotal += r.frames;
  console.log(`${sc.name.padEnd(20)} frames ${String(r.frames).padStart(4)}  flagged ${r.dirty}  black px ${r.black}  magenta px ${r.magenta}${r.log.length ? '  ' + JSON.stringify(r.log) : ''}`);
}
console.log(`\nScanned ${frameTotal} frames at ${width}x${height} CSS px, DPR ${dpr} with the NaN sentinel on: ${dirtyTotal} with any black or magenta pixel. Detector control ${controlOk ? 'passed' : 'FAILED'}.`);
if (problems.length) console.log('Console problems:\n' + problems.join('\n'));
else console.log('No console errors or warnings.');
await browser.close();
process.exit(dirtyTotal || !controlOk ? 1 : 0);
