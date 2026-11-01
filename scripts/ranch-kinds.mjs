// The four kinds of downy side by side, close and at 15 m, by day and at
// night, to check each reads by its silhouette and not just its colour.
//   node scripts/ranch-kinds.mjs [outdir]
import fs from 'node:fs';
import { launch, openRanch, frames } from './ranch-lib.mjs';

// A URL is not a folder: the base comes from RANCH_URL (ranch-lib.mjs).
const out = process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : '/tmp/ranch/kinds';
fs.mkdirSync(out, { recursive: true });
const b = await launch();
const { page } = await openRanch(b, { width: 1280, height: 800, query: 'freeze' });
for (const [name, dist, hour, sil] of [['near', 3.2, 11, false], ['far-15m', 15, 11, false], ['night', 3.2, 22.5, false], ['silhouette-15m', 15, 11, true]]) {
  await page.evaluate(([dist, hour, sil]) => {
    const r = window.ranch;
    const s = r.sim.s;
    s.hour = hour;
    s.downies = [];
    s.items = [];
    const p = s.player;
    p.x = 4; p.z = -2; p.y = r.sim.phys.floor(4, -2);
    const kinds = ['clover', 'ember', 'brook', 'thistle'];
    kinds.forEach((k, i) => {
      const d = r.sim.spawn(k, 4 + (i - 1.5) * (dist / 4.2), -2 - dist);
      d.y = r.sim.phys.floor(d.x, d.z);
      d.grounded = true;
      d.yaw = 0;
    });
    r.aimAt(4, r.sim.phys.floor(4, -2 - dist) + 0.3, -2 - dist);
    // Silhouette test: every downy drawn flat dark, so only the shape is left.
    for (const k of kinds) {
      const m = r.scene.getObjectByName(`downy-${k}`);
      if (sil) {
        m.userData.mat = m.userData.mat || m.material;
        m.material = m.userData.flat || (m.userData.flat = new m.material.constructor({ color: 0x2a2236 }));
      } else if (m.userData.mat) m.material = m.userData.mat;
    }
    for (const n of ['eyes', 'scowls']) r.scene.getObjectByName(n).visible = !sil;
  }, [dist, hour, sil]);
  await frames(page, 12);
  if (dist > 10) {
    // Crop to the middle so the 15 m row is legible at its true size.
    await page.screenshot({ path: `${out}/${name}.png`, clip: { x: 340, y: 300, width: 600, height: 220 } });
  } else await page.screenshot({ path: `${out}/${name}.png` });
}
await b.close();
