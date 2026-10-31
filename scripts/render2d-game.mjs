// The 2D renderer inside the real game: Patchwork on a phone and a desktop,
// the bot playing for a while, a switch to 3D and back, and a new farm.
// Screenshots go to --out, with console errors listed.
//   node scripts/render2d-game.mjs [--base=http://localhost:5248] [--out=/tmp/acres-2d]
import { chromium } from 'playwright-core';

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const BASE = arg('base', 'http://localhost:5248');
const OUT = arg('out', '/tmp/acres-2d');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const errs = [];
for (const [name, vp] of [
  ['phone', { viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }],
  ['desk', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }],
]) {
  const ctx = await browser.newContext(vp);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`[${name}] pageerror ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errs.push(`[${name}] console ${m.text()}`));
  await p.goto(`${BASE}/?preset=patchwork&fresh&autoplay`);
  await p.waitForFunction(() => window.acres && window.acres.director.frames > 10, null, { timeout: 30000 });
  await p.waitForTimeout(6000);
  await p.screenshot({ path: `${OUT}/game-${name}-patchwork.png` });
  const info = await p.evaluate(() => {
    const s = window.acres.state();
    return { day: s.day, coins: s.coins, view: s.rules.view, camera: s.rules.camera, frames: window.acres.director.frames };
  });
  console.log(name, 'patchwork after 6 s of the bot', JSON.stringify(info));
  // Close camera, then to 3D and back, events flowing the whole time.
  await p.evaluate(() => window.acres.director.setRules({ camera: 'close' }));
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/game-${name}-close.png` });
  await p.evaluate(() => window.acres.director.setRules({ view: '3d' }));
  await p.waitForTimeout(4000);
  await p.evaluate(() => window.acres.director.setRules({ view: '2d', camera: 'wide' }));
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${OUT}/game-${name}-back-to-2d-crossfade.png` });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/game-${name}-back-to-2d.png` });
  await ctx.close();
}
await browser.close();
console.log(errs.length ? errs.join('\n') : 'no console errors');
