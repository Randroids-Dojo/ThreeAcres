// pick(project(p)) round trip for the 3D renderer. For every tile of the map
// and both camera modes, at desk and phone sizes and a few zooms and pans,
// project points inside the tile (centre and near each corner) to CSS px and
// pick them back. Every on-screen point must come back to its own tile. Also
// reports the smallest tile on screen in the wide view, as a tap target.
//
//   node scripts/render3d-pick.mjs

import { frames, launch, openBench } from './render3d-lib.mjs';

const SIZES = [
  { name: 'desk 1280x800', width: 1280, height: 800, dpr: 1 },
  { name: 'phone 412x900', width: 412, height: 900, dpr: 2 },
];
const CAMERAS = [
  { mode: 'wide', zoom: 1, panX: 0, panY: 0 },
  { mode: 'wide', zoom: 2.5, panX: 3, panY: -2 },
  { mode: 'wide', zoom: 0.6, panX: -4, panY: 3 },
  { mode: 'close', zoom: 1, panX: 0, panY: 0 },
  { mode: 'close', zoom: 2.2, panX: 0, panY: 0 },
];

const browser = await launch();
let failures = 0;
let checked = 0;
for (const size of SIZES) {
  const { page, ctx, problems } = await openBench(browser, size);
  for (const cam of CAMERAS) {
    await page.evaluate((cam) => {
      const h = window.harness;
      h.setAnimate(false);
      h.setFixture('lush');
      h.setCamera(cam);
      h.show('3d');
    }, cam);
    await frames(page, 3);
    const r = await page.evaluate(() => {
      const h = window.harness;
      const rr = h.renderers[0];
      const s = h.state;
      const W = innerWidth;
      const H = innerHeight;
      const offs = [
        [0.5, 0.5],
        [0.06, 0.06],
        [0.94, 0.06],
        [0.06, 0.94],
        [0.94, 0.94],
      ];
      let n = 0;
      let bad = 0;
      const fails = [];
      let minTile = 1e9;
      for (let y = 0; y < s.H; y++) {
        for (let x = 0; x < s.W; x++) {
          for (const [ox, oy] of offs) {
            const p = rr.project(x + ox, y + oy, 0);
            if (!p || p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) continue;
            n++;
            const q = rr.pick(p.x, p.y);
            if (!q || q.x !== x || q.y !== y) {
              bad++;
              if (fails.length < 5) fails.push({ tile: [x, y], off: [ox, oy], px: [p.x.toFixed(1), p.y.toFixed(1)], got: q });
            }
          }
          if (s.tiles[y * s.W + x] === 'field') {
            const a = rr.project(x, y, 0);
            const b = rr.project(x + 1, y, 0);
            const c = rr.project(x, y + 1, 0);
            if (a && b && c && a.x >= 0 && b.x <= W && a.y >= 0 && c.y <= H) minTile = Math.min(minTile, Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y));
          }
        }
      }
      // Off the map must be null.
      const off = rr.project(-3, -3, 0);
      const offPick = off && off.x >= 0 && off.y >= 0 && off.x < W && off.y < H ? rr.pick(off.x, off.y) : null;
      return { n, bad, fails, minTile, offPick };
    });
    checked += r.n;
    failures += r.bad + (r.offPick ? 1 : 0);
    const label = `${size.name}  ${cam.mode} zoom ${cam.zoom} pan ${cam.panX},${cam.panY}`;
    console.log(`${label.padEnd(44)} points ${String(r.n).padStart(5)}  mismatches ${r.bad}  off-map ${r.offPick ? 'WRONG' : 'null'}${cam.mode === 'wide' && cam.zoom === 1 ? `  smallest field tile ${r.minTile.toFixed(1)} css px` : ''}`);
    for (const f of r.fails) console.log('   ', JSON.stringify(f));
  }
  if (problems.length) console.log(problems.join('\n'));
  await ctx.close();
}
await browser.close();
console.log(`\n${checked} points checked, ${failures} failures.`);
process.exit(failures ? 1 : 0);
