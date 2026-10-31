// Close-ups of the farmer and a hand doing every verb in every facing, plus
// the walk cycle and crows, as one sheet for review.
//   node scripts/render2d-actors.mjs [--out=/tmp/acres-2d]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const OUT = arg('out', '/tmp/acres-2d');
const BASE = arg('base', 'http://localhost:5248');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${BASE}/?dev=2d&fixture=start`);
await page.waitForFunction(() => window.harness && window.harness.frames > 3);
await page.addStyleTag({ content: 'body > #app > div:nth-child(2) { display: none !important; }' });
const verbs = ['walk', 'idle', 'till', 'water', 'plant', 'harvest', 'tend', 'clear', 'build', 'scare'];
const dirs = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
const cells = [];
for (const role of ['farmer', 'hand']) {
  for (const verb of verbs) {
    for (const [di, ang] of dirs.entries()) {
      for (const phase of verb === 'idle' ? [0.5] : [0.25, 0.75]) {
        await page.evaluate(
          ([role, verb, ang, phase]) => {
            const h = window.harness;
            h.setAnimate(false);
            const s = h.state;
            s.minute = 360;
            s.actors.length = 1;
            const a = s.actors[0];
            a.role = role;
            a.tint = 2;
            a.x = 9.5;
            a.y = 4.5;
            a.angle = ang;
            a.moving = verb === 'walk';
            a.walked = phase * 0.9;
            a.task = verb === 'walk' || verb === 'idle' ? null : { verb, x: 9, y: 5, t: phase * 0.5, dur: 0.5 };
            h.setCamera({ mode: 'close', zoom: 2.5 });
          },
          [role, verb, ang, phase],
        );
        await page.waitForTimeout(verb === verbs[0] && di === 0 && phase === 0.25 ? 1200 : 60);
        const file = `${OUT}/actor-${role}-${verb}-${di}-${phase}.png`;
        await page.screenshot({ path: file, clip: { x: 450 - 110, y: 450 - 215, width: 220, height: 250 } });
        cells.push({ file, label: `${role} ${verb} ${['S', 'E', 'N', 'W'][di]} ${phase}` });
      }
    }
  }
}
const html = `<!doctype html><style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(8,150px);gap:2px;font:10px monospace;color:#fff}img{width:150px;display:block}</style>` + cells.map((c) => `<div><img src="file://${c.file}">${c.label}</div>`).join('');
fs.writeFileSync(`${OUT}/actors.html`, html);
const p2 = await browser.newPage({ viewport: { width: 1220, height: 800 } });
await p2.goto(`file://${OUT}/actors.html`);
await p2.waitForTimeout(500);
await p2.screenshot({ path: `${OUT}/actors-sheet.png`, fullPage: true });
await browser.close();
console.log(`${cells.length} actor cells, sheet at ${OUT}/actors-sheet.png`);
