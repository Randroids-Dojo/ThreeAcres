// Every crop at every stage, alive and dead, large, as one sheet for review.
//   node scripts/render2d-crops.mjs [--out=/tmp/acres-2d]
import { chromium } from 'playwright-core';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const OUT = arg('out', '/tmp/acres-2d');
const BASE = arg('base', 'http://localhost:5248');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${BASE}/?dev=2d&fixture=start`);
await page.waitForFunction(() => window.harness && window.harness.frames > 3);
await page.addStyleTag({ content: 'body > #app > div:nth-child(2) { display: none !important; }' });
for (const [half, dead] of [
  ['live', false],
  ['dead', true],
]) {
  await page.evaluate((dead) => {
    const h = window.harness;
    h.setFixture('lush');
    h.setAnimate(false);
    const s = h.state;
    const kinds = ['radish', 'lettuce', 'carrot', 'beans', 'strawberry', 'sunflower', 'corn', 'pumpkin'];
    const days = { radish: 3, lettuce: 4, carrot: 5, beans: 5, strawberry: 6, sunflower: 6, corn: 7, pumpkin: 10 };
    s.actors.length = 1;
    s.actors[0].x = 0.5;
    s.actors[0].y = 0.5;
    s.crows.length = 0;
    s.jobs.length = 0;
    s.builds.length = 0;
    for (const p of s.plots) p.crop = null;
    // One crop per row, stages 0 to 4 across, on the field tiles of the west fields.
    const cols = [2, 3, 4, 5, 7];
    const rows = [5, 6, 7, 8, 10, 11, 12, 13];
    kinds.forEach((k, row) => {
      for (let st = 0; st <= 4; st++) {
        const i = rows[row] * s.W + cols[st];
        s.plots[i].tilled = true;
        s.plots[i].wet = false;
        s.plots[i].crop = { id: 500 + row * 5 + st, kind: k, age: days[k], stage: st, dry: 0, dead, bugs: 0, quality: 0, picks: 0, planted: 1 };
      }
    });
    h.setCamera({ mode: 'wide', zoom: 1.85, panX: -4, panY: 2 });
  }, dead);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/crops-${half}.png` });
}
await browser.close();
console.log(`crop sheets in ${OUT}/crops-live.png and crops-dead.png`);
