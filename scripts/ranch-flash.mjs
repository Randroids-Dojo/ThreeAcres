// Flash scan for Thistledown: reads every drawn frame back from WebGL inside
// the frame (before the browser composites it) and counts pure black pixels
// and magenta ones. With the NaN sentinel on, any non-finite shader output in
// the world or the bellows is painted magenta, opaque or blended.
//
// 1. Control: plant a real NaN with the sentinel off (it shows as black) and
//    on (magenta). The scan must catch both or its clean results mean nothing.
// 2. Scan: hundreds of frames per scenario, sentinel on: day, dawn, dusk,
//    night with nettlebacks, drawing downies into the muzzle, a puff storm,
//    selling with coins flying, a gate opening, looking at the sun.
//   node scripts/ranch-flash.mjs [framesPerScenario] [w h dpr]
import { launch, openRanch, frames } from './ranch-lib.mjs';

const N = Number(process.argv[2]) || 200;
const w = Number(process.argv[3]) || 412;
const h = Number(process.argv[4]) || 900;
const dpr = Number(process.argv[5]) || 2;
const b = await launch();
const { page, problems } = await openRanch(b, { width: w, height: h, dpr, touch: true, query: 'nolock' });

await page.evaluate(() => {
  window.__scan = { frames: 0, dirty: 0, black: 0, magenta: 0, worst: 0, log: [], on: false };
  let buf = null;
  window.ranch.debug.afterFrame = (gl) => {
    const sc = window.__scan;
    if (!sc.on) return;
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    if (!buf || buf.length !== W * H * 4) buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let black = 0;
    let magenta = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const r = buf[i];
      const g = buf[i + 1];
      const bb = buf[i + 2];
      if (r === 0 && g === 0 && bb === 0) black++;
      else if (r >= 230 && g <= 40 && bb >= 230) magenta++;
    }
    sc.frames++;
    sc.black += black;
    sc.magenta += magenta;
    if (black + magenta > 0) {
      sc.dirty++;
      if (sc.log.length < 6) sc.log.push({ f: sc.frames, black, magenta, hour: window.ranch.sim.s.hour.toFixed(2) });
    }
    sc.worst = Math.max(sc.worst, black + magenta);
  };
});
const reset = () => page.evaluate(() => Object.assign(window.__scan, { frames: 0, dirty: 0, black: 0, magenta: 0, worst: 0, log: [], on: true }));
const read = () => page.evaluate(() => ({ ...window.__scan }));
const place = (x, z, yaw, pitch, hour) => page.evaluate(([x, z, yaw, pitch, hour]) => {
  const r = window.ranch;
  const s = r.sim.s;
  const p = s.player;
  p.x = x; p.z = z; p.y = r.sim.phys.floor(x, z); p.yaw = yaw; p.pitch = pitch; p.vx = p.vz = 0;
  if (hour !== undefined) s.hour = hour;
}, [x, z, yaw, pitch, hour]);

let fail = 0;
const report = (label, r, wantDirty) => {
  const ok = wantDirty ? r.dirty === r.frames && r.frames > 0 : r.dirty === 0;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(42)} ${r.dirty}/${r.frames} frames flagged, black ${Math.round(r.black / Math.max(1, r.frames))} px and magenta ${Math.round(r.magenta / Math.max(1, r.frames))} px per frame${r.log.length && !wantDirty ? ` ${JSON.stringify(r.log)}` : ''}`);
};

// 1. Control.
console.log('Control:');
await place(0, 22, 0.1, -0.05, 11);
await frames(page, 10);
const control = async (label, setup, want) => {
  await page.evaluate(setup);
  await frames(page, 4);
  await reset();
  await frames(page, 8);
  const r = await read();
  await page.evaluate(() => window.ranch.injectNaN(false));
  report(label, r, want);
};
await control('nothing planted, sentinel on', () => window.ranch.watchNaN(true), false);
await control('a NaN planted, sentinel off (black)', () => { window.ranch.watchNaN(false); window.ranch.injectNaN(true); }, true);
await control('a NaN planted, sentinel on (magenta)', () => { window.ranch.watchNaN(true); window.ranch.injectNaN(true); }, true);
const c2 = await read();

// 2. Scenarios, sentinel on, real time.
console.log('Scan:');
await page.evaluate(() => window.ranch.watchNaN(true));
const scenario = async (label, setup, during) => {
  await page.evaluate(setup);
  await frames(page, 5);
  await reset();
  if (during) await during();
  else await frames(page, N);
  await page.evaluate(() => (window.__scan.on = false));
  report(label, await read(), false);
};
await scenario('morning on the porch', () => { const r = window.ranch; const p = r.sim.s.player; p.x = -15.5; p.z = 37.2; p.y = r.sim.phys.floor(p.x, p.z); p.yaw = -0.55; p.pitch = -0.08; r.sim.s.hour = 7.5; });
await scenario('sunrise, looking into the sun', () => { const r = window.ranch; const p = r.sim.s.player; p.x = 0; p.z = 0; p.yaw = -1.3; p.pitch = 0.15; r.sim.s.hour = 5.9; });
await scenario('dusk on the ridge, sun behind the crag', () => { const r = window.ranch; const s = r.sim.s; s.gates.ridge = true; r.sim.phys.gates.ridge = true; const p = s.player; p.x = -50; p.z = -16; p.y = r.sim.phys.floor(-50, -16); p.yaw = 0.9; p.pitch = 0.12; s.hour = 18.6; });
await scenario('night: nettlebacks at the ranch', () => { const r = window.ranch; const s = r.sim.s; s.hour = 23; const p = s.player; p.x = 0; p.z = 24; p.y = r.sim.phys.floor(0, 24); p.yaw = 0; p.pitch = -0.1; for (let i = 0; i < 3; i++) s.nettles.push({ id: 900 + i, x: -2 + i * 2, y: r.sim.phys.floor(-2 + i * 2, 18), z: 16, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: 0, mode: 'roam', modeT: 0, tx: 0, tz: 30, bristle: 0, roll: 0, gone: false, snuffT: 2 }); });
await scenario('drawing downies into the muzzle', () => {
  const r = window.ranch; const s = r.sim.s; s.hour = 13; const p = s.player; p.x = -16; p.z = -4; p.y = r.sim.phys.floor(-16, -4); p.yaw = 0.2; p.pitch = -0.25;
  for (let i = 0; i < 8; i++) r.sim.spawn(['clover', 'ember', 'brook', 'thistle'][i % 4], -16 + (i % 4) - 1.5, -7 - Math.floor(i / 4));
  for (let i = 0; i < 12; i++) r.sim.drop(['cloverhead', 'sweetroot', 'dewberry', 'tuft-ember'][i % 4], -17 + (i % 4), -6.5);
  s.up.cap = 2; s.up.slots = 1; s.slots.push({ t: null, n: 0 });
}, async () => {
  await page.keyboard.down('KeyF');
  await frames(page, N);
  await page.keyboard.up('KeyF');
});
await scenario('a puff storm', () => { const r = window.ranch; r.sim.s.hour = 15; r.sim.s.sel = 0; }, async () => {
  for (let i = 0; i < N / 10; i++) {
    await page.mouse.click(200, 400);
    await frames(page, 10);
  }
});
await scenario('selling: coins hop out of the crate', () => {
  const r = window.ranch; const s = r.sim.s; s.hour = 16; const p = s.player; p.x = -6.5; p.z = 32.6; p.y = r.sim.phys.floor(-6.5, 32.6); r.aimAt(-6.5, r.sim.phys.floor(-6.5, 36.5) + 0.7, 36.5);
  s.slots = [{ t: 'tuft-thistle', n: 30 }, { t: null, n: 0 }, { t: null, n: 0 }, { t: null, n: 0 }]; s.sel = 0;
}, async () => {
  await page.mouse.move(200, 400);
  await page.mouse.down();
  await frames(page, N);
  await page.mouse.up();
});
await scenario('a gate opening', () => {
  const r = window.ranch; const s = r.sim.s; s.gates.hollow = false; r.sim.phys.gates.hollow = false; s.coins = 5000; s.hour = 10;
  const p = s.player; p.x = 33; p.z = -24; p.y = r.sim.phys.floor(33, -24); r.aimAt(36, r.sim.phys.floor(36, -24) + 1.2, -24);
  r.sim.choose({ kind: 'gate', id: 'hollow', label: '', x: 0, y: 0, z: 0 }, 'gate:hollow');
});
await scenario('the day turning, three hours in fast time', () => { window.ranch.sim.s.hour = 17.5; }, async () => {
  for (let i = 0; i < N; i++) {
    await page.evaluate(() => (window.ranch.sim.s.hour += 0.018));
    await frames(page, 1);
  }
});

console.log(problems.length ? `problems: ${problems.slice(0, 5).join(' | ')}` : 'no console problems');
await b.close();
console.log(fail ? `FLASH FAILED (${fail})` : 'FLASH OK');
process.exit(fail ? 1 : 0);
