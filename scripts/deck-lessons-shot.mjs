// Screenshot Seedbound (PORT=5252 by default): node scripts/deck-lessons-shot.mjs "<query>" <out.png> [w h] [eval js] [wait ms]
import { chromium } from 'playwright-core';
const [, , query = 'game=deck&fresh', out = '/tmp/deck-lessons/shot.png', w = '412', h = '838', js = '', waitMs = '1200'] = process.argv;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, hasTouch: +w < 700, isMobile: +w < 700 });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text()));
await p.goto(`http://localhost:${process.env.PORT ?? 5252}/?${query}`);
await p.waitForTimeout(2000);
if (js) {
  await p.evaluate(js);
  await p.waitForTimeout(+waitMs);
}
await p.screenshot({ path: out, fullPage: false });
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
