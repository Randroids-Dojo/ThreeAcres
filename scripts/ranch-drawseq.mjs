// A drawn downy and a clover head streaming into the muzzle, in slow motion,
// as a strip of frames. node scripts/ranch-drawseq.mjs [out.png]
import fs from 'node:fs';
import { launch, openRanch, frames } from './ranch-lib.mjs';
const out = process.argv[2] || '/tmp/ranch/drawseq.png';
const dir = '/tmp/ranch/drawseq';
fs.mkdirSync(dir, { recursive: true });
const b = await launch();
const { page } = await openRanch(b, { width: 960, height: 600, query: 'nolock&slow' });
await page.evaluate(() => {
  const r = window.ranch; const s = r.sim.s; s.hour = 10.5;
  const p = s.player; p.x = 0; p.z = 28; p.y = r.sim.phys.floor(0, 28);
  const d = r.sim.spawn('ember', 0.3, 23.8); d.hopT = 99; d.grounded = true; d.y = r.sim.phys.floor(0.3, 23.8);
  r.sim.drop('cloverhead', -0.6, 24.5); r.sim.drop('cloverhead', 0.9, 25);
  r.aimAt(0.2, d.y + 0.3, 23.8);
});
await frames(page, 10);
await page.keyboard.down('KeyF');
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${dir}/f${i}.png` });
}
await page.keyboard.up('KeyF');
await b.close();
