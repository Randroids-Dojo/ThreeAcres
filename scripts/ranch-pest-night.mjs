// Thistledown: can you see a pest at night? The fifth playtest found a
// nettleback 6 m off at night a dark lump. Now its eyes are lit from within
// and a cool rim comes up on it at night. Measured by frame readback on the
// Pixel's viewport: a nettleback 6 and 10 m off in the meadow at 11 pm (and at
// noon for reference), the brightest 1% of the pixels over it (its eyes)
// against the ground around it, and its body's bright edge (90th percentile).
// The control turns its night look off and must read as the dark lump.
// Round 6: the sixth playtest saw a pest 20 m off as a dark speck. A warm glow
// round its eyes keeps about ten CSS px across however far off it is: at 20 m
// (up the ranch lane to the gate, as the playtest saw one) the check also counts how many CSS px over it are lit (eye glow at 120 of 255
// or more), so a speck of two pixels does not pass.
//   RANCH_URL=http://localhost:5247 node scripts/ranch-pest-night.mjs
import { checker, frames, launch, openRanch } from './ranch-lib.mjs';

const { check, failed } = checker();
const browser = await launch();
const { page, problems } = await openRanch(browser, { width: 412, height: 915, dpr: 2, touch: true, query: 'touch&freeze' });

await page.evaluate(() => {
  const r = window.ranch;
  window.__px = null;
  r.debug.afterFrame = (gl) => {
    const q = window.__want;
    if (!q) return;
    const k = gl.drawingBufferWidth / innerWidth;
    const read = (b) => {
      const x0 = Math.max(0, Math.round(b.x0 * k));
      const x1 = Math.min(gl.drawingBufferWidth, Math.round(b.x1 * k));
      const y0 = Math.max(0, Math.round(gl.drawingBufferHeight - b.y1 * k));
      const y1 = Math.min(gl.drawingBufferHeight, Math.round(gl.drawingBufferHeight - b.y0 * k));
      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 2 || h <= 2) return null;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const lum = [];
      for (let i = 0; i < buf.length; i += 4) lum.push(0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]);
      lum.sort((a, b) => a - b);
      const at = (p) => lum[Math.min(lum.length - 1, Math.floor(lum.length * p))];
      // How many CSS px over it are lit up (120 of 255 or more): the eyes' glow, not a speck.
      const lit = lum.filter((v) => v >= 120).length / (k * k);
      return { p50: at(0.5), p90: at(0.9), p99: at(0.99), n: lum.length, lit };
    };
    window.__px = { pest: read(q.pest), ground: read(q.ground) };
    window.__want = null;
  };
});

/** A nettleback `dist` m off, straight ahead, at an hour, with its night look on or off: readback over it and the ground beside it. */
async function look(hour, dist, glow) {
  await page.evaluate(([hour, dist, glow]) => {
    const r = window.ranch;
    const sim = r.sim;
    const s = sim.s;
    s.hour = hour;
    s.downies = s.downies.filter((d) => d.keep);
    s.items = s.items.filter((i) => i.rest);
    // Up close, in the meadow; at 20 m, up the ranch lane to the gate (as the playtest saw one), where tall
    // meadow grass does not stand between.
    const lane = dist >= 20;
    const p = s.player;
    p.x = lane ? 0.4 : -8;
    p.z = lane ? 19 + dist : -10;
    p.y = sim.phys.floor(p.x, p.z);
    const nx = p.x;
    const nz = p.z - dist;
    const ny = sim.phys.floor(nx, nz);
    s.nettles = [{ id: 9001, x: nx, y: ny, z: nz, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: 0, mode: 'roam', modeT: 99, tx: nx, tz: nz, bristle: 0, roll: 0, gone: false, snuffT: 99 }];
    r.creatures.nettleGlow = glow;
    r.aimAt(nx, ny + 0.5, nz);
  }, [hour, dist, glow]);
  await frames(page, 30);
  await page.evaluate(() => {
    const r = window.ranch;
    const n = r.sim.s.nettles[0];
    const box = (x0, x1, y0, y1, z) => {
      const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => r.project(x, y, z)).filter(Boolean);
      return { x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) };
    };
    // Over the pest (its body is about 0.72 m across and half a metre high), and a band of ground either side of it.
    const pest = box(n.x - 0.4, n.x + 0.4, n.y + 0.02, n.y + 0.5, n.z + 0.3);
    const ground = box(n.x + 0.9, n.x + 2.4, n.y - 0.05, n.y + 0.35, n.z);
    window.__want = { pest, ground };
  });
  await frames(page, 3);
  return page.evaluate(() => window.__px);
}

const rows = [];
for (const [hour, dist, glow] of [[12, 6, true], [23, 6, true], [23, 6, false], [23, 10, true], [23, 10, false], [23, 20, true], [23, 20, false]]) {
  const q = await look(hour, dist, glow);
  rows.push({ hour, dist, glow, q });
  if (hour === 23 && (dist === 6 || dist === 20)) await page.screenshot({ path: `/tmp/ranch-pest-night-${dist}-${glow ? 'on' : 'off'}.png` });
  console.log(`   ${hour}:00, ${dist} m, night look ${glow ? 'on ' : 'off'}: over the pest p99 ${q?.pest?.p99.toFixed(0)} (its eyes), p90 ${q?.pest?.p90.toFixed(0)}, p50 ${q?.pest?.p50.toFixed(0)}, ${q?.pest?.lit.toFixed(1)} CSS px lit; the ground beside it p50 ${q?.ground?.p50.toFixed(0)}, p90 ${q?.ground?.p90.toFixed(0)}`);
}
await page.evaluate(() => (window.ranch.creatures.nettleGlow = true));
const get = (h, d, g) => rows.find((r) => r.hour === h && r.dist === d && r.glow === g)?.q;
// Seen: its eyes stand well clear of the ground around it (the brightest 1% over it at least three times the ground's middle, and 120 of 255 or more).
const seen = (q) => !!q?.pest && !!q?.ground && q.pest.p99 >= 120 && q.pest.p99 >= q.ground.p50 * 3;
for (const d of [6, 10]) {
  check(`at 11 pm a pest ${d} m off shows: its eyes stand out from the dark ground`, seen(get(23, d, true)), JSON.stringify(get(23, d, true)));
  check(`the check finds a pest ${d} m off a dark lump with its night look off (control)`, !seen(get(23, d, false)), JSON.stringify(get(23, d, false)));
}
// At 20 m: its eyes stand out and are more than a speck: at least 12 CSS px over it lit (two 3 px beads light about 8).
const far = get(23, 20, true);
check('at 11 pm a pest 20 m off shows: its eyes stand out, and glow over 12 CSS px or more (not a speck)', seen(far) && far.pest.lit >= 12, JSON.stringify(far));
check('the check finds a pest 20 m off a dark speck with its night look off (control)', !(seen(get(23, 20, false)) && get(23, 20, false).pest.lit >= 12), JSON.stringify(get(23, 20, false)));
check('no console problems', problems.length === 0, problems.slice(0, 3).join(' | '));
await browser.close();
process.exit(failed() ? 1 : 0);
