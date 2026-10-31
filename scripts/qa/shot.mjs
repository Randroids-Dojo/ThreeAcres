// Screenshot the game: node scripts/qa/shot.mjs "<query>" <out.png> [w h] [steps json]
import { chromium } from 'playwright-core';
const [, , query = 'preset=sunup&fresh', out = '/tmp/acres.png', w = '1280', h = '800', stepsJson = '[]'] = process.argv;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: +w < 700, isMobile: +w < 700 });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text()));
await p.goto(`http://localhost:5247/?${query}`);
await p.waitForFunction(() => window.acres && window.acres.director.frames > 10, null, { timeout: 20000 });
for (const s of JSON.parse(stepsJson)) {
  if (s.eval) await p.evaluate(s.eval);
  if (s.wait) await p.waitForTimeout(s.wait);
  if (s.key) await p.keyboard.press(s.key);
  if (s.click) await p.mouse.click(s.click[0], s.click[1]);
}
await p.waitForTimeout(600);
await p.screenshot({ path: out });
console.log(JSON.stringify(await p.evaluate(() => { const s = window.acres.state(); return { day: s.day, minute: Math.round(s.minute), coins: s.coins, rules: s.rules, frames: window.acres.director.frames }; })));
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
