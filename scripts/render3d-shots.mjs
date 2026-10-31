// Screenshots of the 3D renderer: every fixture at 1280x800 and 412x900, wide
// and close cameras, noon, dusk and night, the soil overlay, the night
// transition, a highlighted tile, and a burst of each event type. Writes PNGs
// and a labelled contact sheet.
//
//   node scripts/render3d-shots.mjs [outDir] [filter]
//
// Needs the workbench server: npx vite --config scripts/render3d-vite.config.ts

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { frames, launch, openBench } from './render3d-lib.mjs';

const OUT = process.argv[2] || '/tmp/acres-3d/shots';
const FILTER = process.argv[3] ? new RegExp(process.argv[3]) : null;
mkdirSync(OUT, { recursive: true });

const FIXTURES = ['start', 'lush', 'synergy', 'meadow', 'night', 'dusk', 'rain', 'storm', 'heat', 'autumn', 'winter'];
const SIZES = [
  { name: 'desk', width: 1280, height: 800, dpr: 1 },
  { name: 'phone', width: 412, height: 900, dpr: 2 },
];

const shots = [];
const problems = [];
const browser = await launch();

async function shot(page, name) {
  if (FILTER && !FILTER.test(name)) return;
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push({ name, file });
}

async function setup(page, fixture, camera, minute) {
  await page.evaluate(
    ({ fixture, camera, minute }) => {
      const h = window.harness;
      h.setAnimate(false);
      h.setFixture(fixture);
      if (minute !== undefined) h.setMinute(minute);
      h.setCamera({ mode: camera, zoom: 1, panX: 0, panY: 0 });
      // show() snaps the camera to the current framing.
      h.show('3d');
    },
    { fixture, camera, minute },
  );
  await frames(page, 12);
}

/** Moves the mouse over the centre of a tile so the harness highlights it. */
async function hover(page, x, y) {
  const p = await page.evaluate(([x, y]) => window.harness.renderers[0].project(x + 0.5, y + 0.5, 0), [x, y]);
  if (p) await page.mouse.move(p.x, p.y);
  await frames(page, 4);
}

for (const size of SIZES) {
  const { page, problems: pr, ctx } = await openBench(browser, size);
  const tag = size.name;
  for (const fx of FIXTURES) {
    const minute = undefined;
    await setup(page, fx, 'wide', minute);
    await shot(page, `${tag}-${fx}-wide`);
    if (['start', 'lush', 'night', 'winter', 'rain'].includes(fx)) {
      await setup(page, fx, 'close', minute);
      await shot(page, `${tag}-${fx}-close`);
    }
  }
  // Hours on the lush farm.
  for (const [label, m] of [
    ['dawn', 20],
    ['noon', 400],
    ['evening', 700],
    ['dusk', 820],
    ['night', 1000],
  ]) {
    await setup(page, 'lush', 'wide', m);
    await shot(page, `${tag}-hour-${label}`);
  }
  // Soil overlay on the synergy farm.
  await setup(page, 'synergy', 'wide');
  await page.keyboard.press('o');
  await frames(page, 6);
  await shot(page, `${tag}-synergy-overlay`);
  await setup(page, 'synergy', 'close');
  await shot(page, `${tag}-synergy-overlay-close`);
  await page.keyboard.press('o');
  // Highlight, ok and not ok.
  await setup(page, 'lush', 'close');
  await hover(page, 5, 7);
  await shot(page, `${tag}-highlight-ok`);
  await hover(page, 12, 3);
  await shot(page, `${tag}-highlight-none`);
  await page.mouse.move(-10, -10);
  // Night transition at its peak and half way.
  await setup(page, 'lush', 'wide', 300);
  await page.keyboard.press('n');
  await page.waitForTimeout(300);
  await shot(page, `${tag}-nightfall-part`);
  await page.waitForTimeout(650);
  await shot(page, `${tag}-nightfall-peak`);
  await page.waitForTimeout(1400);
  // Event bursts, each on a fitting tile of the lush farm, captured a moment after.
  const bursts = [
    ['till', { type: 'till', x: 13, y: 10, by: 1 }],
    ['water', { type: 'water', x: 3, y: 7, by: 1 }],
    ['plant', { type: 'plant', x: 3, y: 8, crop: 'corn', by: 1 }],
    ['grow', { type: 'grow', x: 4, y: 7, crop: 'lettuce', stage: 3 }],
    ['harvest', { type: 'harvest', x: 4, y: 6, crop: 'radish', quality: 3, by: 1 }],
    ['tend', { type: 'tend', x: 13, y: 6, by: 1 }],
    ['clear', { type: 'clear', x: 12, y: 5, by: 1 }],
    ['build', { type: 'build', x: 13, y: 11, kind: 'sprinkler', by: 1 }],
    ['unbuild', { type: 'unbuild', x: 14, y: 12, kind: 'scarecrow' }],
    ['wither', { type: 'wither', x: 12, y: 5, crop: 'corn' }],
    ['bugs', { type: 'bugs', x: 14, y: 6 }],
    ['sprinkle', { type: 'sprinkle', x: 13, y: 11 }],
    ['crowIn', { type: 'crowIn', id: 901, x: 3, y: 11 }],
    ['crowEat', { type: 'crowEat', id: 900, x: 8, y: 6 }],
    ['crowScared', { type: 'crowScared', id: 900, x: 8, y: 6 }],
    ['deny', { type: 'deny', x: 5, y: 8, reason: 'No' }],
    ['coins', { type: 'coins', amount: 50, x: 5, y: 3 }],
    ['thunder', { type: 'thunder' }],
    ['dawn', { type: 'dawn', day: 2, weather: 'sun', season: 0 }],
  ];
  for (const cam of ['close', 'wide']) {
    if (tag === 'phone' && cam === 'wide') continue;
    for (const [label, e] of bursts) {
      if (FILTER && !FILTER.test(`${tag}-event-${cam}-${label}`)) continue;
      await setup(page, label === 'thunder' ? 'storm' : 'lush', cam);
      if (cam === 'close' && e.x !== undefined) {
        await page.evaluate(([x, y]) => {
          const a = window.harness.state.actors[0];
          a.x = x + 0.5;
          a.y = y + 1.5;
        }, [e.x, e.y]);
        await frames(page, 50);
      }
      await page.evaluate((ev) => window.harness.fire(ev), e);
      await page.waitForTimeout(label === 'harvest' ? 380 : label === 'thunder' ? 60 : 160);
      await shot(page, `${tag}-event-${cam}-${label}`);
    }
  }
  // Burst of every event at once, many grow events at dawn.
  await setup(page, 'lush', 'wide');
  await page.evaluate(() => {
    const h = window.harness;
    for (let y = 5; y < 14; y++) for (let x = 2; x < 16; x++) h.fire({ type: 'grow', x, y, crop: 'radish', stage: 2 });
  });
  await page.waitForTimeout(120);
  await shot(page, `${tag}-event-wide-grow-all`);
  problems.push(...pr.map((p) => `${tag}: ${p}`));
  await ctx.close();
}
await browser.close();

// Contact sheets: one for the desk shots, one for the phone shots.
await contact(shots, OUT);

console.log(`${shots.length} shots in ${OUT}`);
if (problems.length) console.log('Console problems:\n' + problems.join('\n'));
else console.log('No console errors or warnings.');

async function contact(list, dir) {
  const b2 = await launch();
  for (const tag of ['desk', 'phone']) {
    const items = list.filter((s) => s.name.startsWith(tag));
    if (!items.length) continue;
    const cols = tag === 'desk' ? 4 : 7;
    const html = `<html><body style="margin:0;background:#1d1d1d;font:12px ui-monospace,monospace;color:#eee">
<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">
${items.map((s) => `<figure style="margin:0"><img style="width:100%;display:block" src="${s.name}.png"><figcaption>${s.name}</figcaption></figure>`).join('\n')}
</div></body></html>`;
    const file = join(dir, `contact-${tag}.html`);
    writeFileSync(file, html);
    const p2 = await b2.newPage({ viewport: { width: 1800, height: 1000 } });
    await p2.goto(`file://${file}`);
    await p2.waitForTimeout(400);
    await p2.screenshot({ path: join(dir, `contact-${tag}.png`), fullPage: true });
    await p2.close();
  }
  await b2.close();
  void readdirSync;
}
