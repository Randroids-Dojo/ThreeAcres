// Screenshots of the 2D renderer on the workbench, for review.
//   node scripts/render2d-shots.mjs [--only=lush,night] [--views=desk,phone] [--out=/tmp/acres-2d]
// Needs the 2D dev server: npx vite --config scripts/render2d-vite.config.ts

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const OUT = arg('out', '/tmp/acres-2d');
const BASE = arg('base', 'http://localhost:5248');
const ONLY = arg('only', '');
const VIEWS = arg('views', 'desk,phone').split(',');
const SETS = arg('sets', 'fixtures,camera,time,overlay,events').split(',');
fs.mkdirSync(OUT, { recursive: true });

const FIXTURES = ['start', 'lush', 'synergy', 'meadow', 'night', 'dusk', 'rain', 'storm', 'heat', 'autumn', 'winter'];
const VIEWPORTS = {
  desk: { width: 1280, height: 800, deviceScaleFactor: 1 },
  phone: { width: 412, height: 900, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const shots = [];
const errors = [];

async function frames(page, n) {
  const f0 = await page.evaluate(() => window.harness.frames);
  await page.waitForFunction((t) => window.harness.frames >= t, f0 + n, { timeout: 20000 });
}

for (const vname of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: VIEWPORTS[vname].width, height: VIEWPORTS[vname].height }, deviceScaleFactor: VIEWPORTS[vname].deviceScaleFactor, isMobile: VIEWPORTS[vname].isMobile, hasTouch: VIEWPORTS[vname].hasTouch });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${vname}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${vname}] pageerror: ${e.message}`));
  await page.goto(`${BASE}/?dev=2d&fixture=lush`);
  await page.waitForFunction(() => window.harness && window.harness.frames > 3, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  // Hide the workbench key bar for clean shots.
  await page.addStyleTag({ content: 'body > #app > div:nth-child(2) { display: none !important; }' });
  await frames(page, 30);

  const shot = async (name, label) => {
    const file = path.join(OUT, `${vname}-${name}.png`);
    await page.screenshot({ path: file });
    shots.push({ file, label: `${vname} ${label}`, view: vname });
  };

  const setup = async (fx, cam, minute) => {
    await page.evaluate(
      ([f, c, m]) => {
        window.harness.setFixture(f);
        window.harness.setCamera(c);
        if (m !== null) window.harness.setMinute(m);
      },
      [fx, cam, minute],
    );
    await frames(page, 40);
  };

  const list = ONLY ? ONLY.split(',') : FIXTURES;
  if (SETS.includes('fixtures')) {
    for (const f of list) {
      await setup(f, { mode: 'wide', zoom: 1, panX: 0, panY: 0 }, null);
      await shot(`wide-${f}`, `wide ${f}`);
    }
  }
  if (SETS.includes('camera')) {
    for (const f of ONLY ? list : ['lush', 'start', 'winter']) {
      await setup(f, { mode: 'close', zoom: 1, panX: 0, panY: 0 }, null);
      await shot(`close-${f}`, `close ${f}`);
    }
    await setup('lush', { mode: 'wide', zoom: 1.8, panX: 2, panY: 1 }, null);
    await shot('wide-zoom-lush', 'wide zoom 1.8 lush');
    await setup('lush', { mode: 'wide', zoom: 0.6, panX: 0, panY: 0 }, null);
    await shot('wide-zoomout-lush', 'wide zoom 0.6 lush');
  }
  if (SETS.includes('time')) {
    for (const [m, label] of [
      [0, '6am'],
      [360, 'noon'],
      [720, '6pm'],
      [870, '8.30pm'],
      [1000, 'night'],
    ]) {
      await setup('lush', { mode: 'wide', zoom: 1, panX: 0, panY: 0 }, m);
      await shot(`time-${label}`, `lush ${label}`);
    }
    // The night transition at its peak.
    await setup('lush', { mode: 'wide', zoom: 1, panX: 0, panY: 0 }, 900);
    await page.keyboard.press('n');
    await page.waitForTimeout(950);
    await shot('time-transition', 'night transition peak');
    await page.waitForTimeout(1500);
  }
  if (SETS.includes('overlay')) {
    await setup('synergy', { mode: 'wide', zoom: 1, panX: 0, panY: 0 }, null);
    await page.keyboard.press('o');
    await frames(page, 10);
    await shot('overlay-synergy-wide', 'overlay synergy wide');
    await page.evaluate(() => window.harness.setCamera({ mode: 'close' }));
    await page.evaluate(() => {
      const a = window.harness.state.actors[0];
      a.x = 4.5;
      a.y = 7.5;
    });
    await page.evaluate(() => window.harness.setAnimate(false));
    await frames(page, 60);
    await shot('overlay-synergy-close', 'overlay synergy close');
    await page.evaluate(() => window.harness.setAnimate(true));
    await page.keyboard.press('o');
  }
  if (SETS.includes('events')) {
    await setup('lush', { mode: 'close', zoom: 1, panX: 0, panY: 0 }, null);
    await page.evaluate(() => {
      window.harness.setAnimate(false);
      const a = window.harness.state.actors[0];
      a.x = 7.5;
      a.y = 7.5;
    });
    await frames(page, 60);
    const bursts = [
      ['till', [{ type: 'till', x: 7, y: 6, by: 1 }, { type: 'till', x: 8, y: 6, by: 1 }]],
      ['water', [{ type: 'water', x: 7, y: 7, by: 1 }, { type: 'water', x: 8, y: 7, by: 1 }]],
      ['plant', [{ type: 'plant', x: 9, y: 6, crop: 'corn', by: 1 }]],
      ['grow', Array.from({ length: 16 }, (_, i) => ({ type: 'grow', x: 7 + (i % 4), y: 5 + Math.floor(i / 4), crop: 'carrot', stage: 3 }))],
      ['harvest', [{ type: 'harvest', x: 5, y: 6, crop: 'carrot', quality: 3, by: 1 }, { type: 'harvest', x: 8, y: 6, crop: 'carrot', quality: 2, by: 1 }]],
      ['tend', [{ type: 'tend', x: 9, y: 7, by: 1 }]],
      ['clear', [{ type: 'clear', x: 8, y: 8, by: 1 }]],
      ['build', [{ type: 'build', x: 10, y: 8, kind: 'sprinkler', by: 1 }]],
      ['wither', [{ type: 'wither', x: 7, y: 8, crop: 'beans' }]],
      ['bugs', [{ type: 'bugs', x: 9, y: 8 }]],
      ['sprinkle', [{ type: 'sprinkle', x: 8, y: 7 }]],
      ['crow', [{ type: 'crowIn', id: 901, x: 8, y: 6 }, { type: 'crowEat', id: 900, x: 9, y: 6 }, { type: 'crowScared', id: 900, x: 6, y: 8 }]],
      ['deny', [{ type: 'deny', x: 8, y: 6, reason: 'no' }]],
      ['coins', [{ type: 'coins', amount: 120, x: 7, y: 7 }]],
      ['thunder', [{ type: 'thunder' }]],
      ['dawn', [{ type: 'dawn', day: 2, weather: 'sun', season: 0 }]],
    ];
    for (const [name, evs] of bursts) {
      await page.evaluate((list) => list.forEach((e) => window.harness.fire(e)), evs);
      await page.waitForTimeout(name === 'thunder' ? 40 : name === 'harvest' ? 380 : 160);
      await shot(`event-${name}`, `event ${name}`);
      await page.waitForTimeout(500);
    }
  }
  await ctx.close();
}
await browser.close();

// A contact sheet of every desk and phone shot in the folder, this run or earlier ones.
const all = fs
  .readdirSync(OUT)
  .filter((f) => /^(desk|phone)-.*\.png$/.test(f))
  .sort((a, b) => (a.startsWith('desk') === b.startsWith('desk') ? a.localeCompare(b) : a.startsWith('desk') ? -1 : 1));
const rows = all
  .map((f) => `<figure class="${f.split('-')[0]}"><img src="file://${path.join(OUT, f)}"><figcaption>${f.replace('.png', '').replace(/-/g, ' ')}</figcaption></figure>`)
  .join('\n');
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#2a2620;font:12px/1.3 ui-monospace,monospace;color:#eee;display:flex;flex-wrap:wrap;gap:8px;padding:8px}
figure{margin:0}figure.desk img{width:480px}figure.phone img{width:154px}figcaption{padding:2px 0}
</style>${rows}`;
fs.writeFileSync(path.join(OUT, 'contact.html'), html);
const b2 = await chromium.launch({ channel: 'chrome', headless: true });
const p2 = await b2.newPage({ viewport: { width: 1600, height: 900 } });
await p2.goto(`file://${path.join(OUT, 'contact.html')}`);
await p2.waitForTimeout(500);
await p2.screenshot({ path: path.join(OUT, 'contact.png'), fullPage: true });
await b2.close();

fs.writeFileSync(path.join(OUT, 'console.txt'), errors.join('\n'));
console.log(`${shots.length} shots in ${OUT}`);
console.log(errors.length ? `console errors/warnings:\n${errors.join('\n')}` : 'no console errors');
