// Screenshot Seedbound: node scripts/deck-shot.mjs "<query>" <out.png> [w h] [eval js]
import { chromium } from 'playwright-core';
const [, , query = 'game=deck&fresh', out = '/tmp/deck/shot.png', w = '412', h = '900', js = ''] = process.argv;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, hasTouch: +w < 700, isMobile: +w < 700 });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text()));
await p.goto(`http://localhost:5252/?${query}`);
await p.waitForTimeout(2500);
if (js) { await p.evaluate(js); await p.waitForTimeout(1200); }
await p.screenshot({ path: out, fullPage: false });
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
