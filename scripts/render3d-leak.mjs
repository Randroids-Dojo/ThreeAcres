// Rebuild churn for the 3D renderer: switches fixtures (new state objects,
// seasons, owned parcels) many times and checks that GPU geometries,
// textures and shader programs stop growing.
//
//   node scripts/render3d-leak.mjs [rounds]

import { frames, launch, openBench } from './render3d-lib.mjs';

const ROUNDS = Number(process.argv[2]) || 6;
const FIXTURES = ['start', 'lush', 'synergy', 'meadow', 'night', 'dusk', 'rain', 'storm', 'heat', 'autumn', 'winter'];
const browser = await launch();
const { page, problems } = await openBench(browser, { width: 412, height: 900, dpr: 2 });
const counts = [];
for (let r = 0; r < ROUNDS; r++) {
  for (const f of FIXTURES) {
    await page.evaluate((f) => {
      const h = window.harness;
      h.setFixture(f);
      h.setCamera({ mode: Math.random() < 0.5 ? 'wide' : 'close' });
    }, f);
    await frames(page, 4);
    // Till and plant a little so parcel decor rebuilds too.
    await page.evaluate(() => {
      const s = window.harness.state;
      for (const p of s.parcels) p.owned = !p.owned;
    });
    await frames(page, 3);
  }
  const c = await page.evaluate(() => window.harness.renderers[0].debug.stats());
  counts.push(c);
  console.log(`round ${r + 1}: geometries ${c.geometries}  textures ${c.textures}  programs ${c.programs}`);
}
const first = counts[1];
const last = counts[counts.length - 1];
const grew = last.geometries > first.geometries + 4 || last.textures > first.textures + 2 || last.programs > first.programs;
console.log(grew ? 'Counts keep growing: a leak.' : 'Counts are flat after the first round: no leak.');
if (problems.length) console.log(problems.join('\n'));
await browser.close();
process.exit(grew ? 1 : 0);
