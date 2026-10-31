// Screenshots of Thistledown from the play camera at set places and hours,
// plus a contact sheet. node scripts/ranch-shots.mjs [outdir] [w h dpr] [only]
import fs from 'node:fs';
import { launch, openRanch, frames } from './ranch-lib.mjs';

const out = process.argv[2] || '/tmp/ranch/shots';
const w = +(process.argv[3] || 1280);
const h = +(process.argv[4] || 800);
const dpr = +(process.argv[5] || 1);
const only = process.argv[6] || '';
fs.mkdirSync(out, { recursive: true });

// x, z, yaw, pitch, hour; setup runs in the page first.
const VIEWS = [
  ['porch-morning', -15.5, 37.2, -0.55, -0.08, 8],
  ['ranch-pads', -2, 32, -1.9, -0.18, 10],
  ['gate-sign', 1.5, 26, 0.05, -0.05, 11],
  ['meadow-noon', 2, 8, 0.2, -0.04, 12.5],
  ['meadow-oak', -4, -18, -0.2, 0.0, 15],
  ['stream-bridge', 14, -8, -0.9, -0.12, 14],
  ['ranch-from-meadow', 4, -6, 3.0, 0.02, 17.5],
  ['ridge-vents', -39, -9, 1.75, 0.04, 16],
  ['ridge-crag-dusk', -50, -16, 0.9, 0.12, 18.6],
  ['hollow-pond', 42, -18, -2.2, -0.05, 10],
  ['hollow-deadtree', 52, -2, 0.9, 0.02, 19.2],
  ['ranch-dusk', 6, 35, 1.6, -0.05, 18.9],
  ['ranch-night', -4, 30, 2.6, 0.05, 23],
  ['meadow-night', 0, -2, 0.3, 0.1, 1.5],
  ['downies-close', -11, -4, 0.75, -0.2, 11],
];

const b = await launch();
const { page, problems } = await openRanch(b, { width: w, height: h, dpr, query: 'freeze' });
const shots = [];
for (const [name, x, z, yaw, pitch, hour] of VIEWS) {
  if (only && !name.includes(only)) continue;
  await page.evaluate(([x, z, yaw, pitch, hour]) => {
    const r = window.ranch;
    const s = r.sim.s;
    s.gates.ridge = s.gates.hollow = true;
    r.sim.phys.gates = { ...s.gates };
    const p = s.player;
    p.x = x; p.z = z; p.y = r.sim.phys.floor(x, z); p.yaw = yaw; p.pitch = pitch; p.vx = p.vz = 0;
    s.hour = hour;
  }, [x, z, yaw, pitch, hour]);
  await frames(page, 20);
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file });
  const info = await page.evaluate(() => window.ranch.renderInfo());
  shots.push({ name, file, info });
  console.log(name, info.calls, info.triangles);
}
// Contact sheet.
const cols = 3;
const tw = 420;
const th = Math.round((tw * h) / w);
const html = `<html><body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:4px;padding:4px">${shots.map((s) => `<div style="position:relative"><img src="file://${s.file}" style="width:${tw}px;height:${th}px;display:block"><span style="position:absolute;left:4px;top:4px;color:#fff;font:12px sans-serif;text-shadow:0 1px 2px #000">${s.name} · ${s.info.calls} calls</span></div>`).join('')}</body></html>`;
fs.writeFileSync(`${out}/sheet.html`, html);
const sp = await b.newPage({ viewport: { width: cols * (tw + 4) + 4, height: Math.ceil(shots.length / cols) * (th + 4) + 4 } });
await sp.goto(`file://${out}/sheet.html`);
await sp.waitForTimeout(300);
await sp.screenshot({ path: `${out}/sheet.png` });
if (problems.length) console.log(problems.slice(0, 10).join('\n'));
await b.close();
