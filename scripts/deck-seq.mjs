// Screenshot a sequence: node scripts/deck-seq.mjs "<query>" <outprefix> <w> <h> <setup js file> <ms,ms,...>
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [, , query, prefix, w, h, file, times] = process.argv;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, hasTouch: +w < 700, isMobile: +w < 700 });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text()));
await p.goto(`http://localhost:5252/?${query}`);
await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 15000 });
await p.waitForTimeout(400);
await p.evaluate(readFileSync(file, 'utf8'));
let t = 0;
for (const [i, ms] of times.split(',').map(Number).entries()) {
  await p.waitForTimeout(ms - t);
  t = ms;
  await p.screenshot({ path: `${prefix}-${i}.png` });
}
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
