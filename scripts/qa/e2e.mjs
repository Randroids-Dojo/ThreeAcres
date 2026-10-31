// The whole app in Chrome: Sunup played by its bot, then a round of game
// switching through the shell, checking each game pauses, resumes and keeps
// its state. Frame times are taken without screenshots in the window.
// node scripts/qa/e2e.mjs [seconds] [w h] [base url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const [, , secs = '20', w = '1280', h = '800', base = 'http://localhost:5247'] = process.argv;
const out = '/tmp/acres-e2e';
mkdirSync(out, { recursive: true });
const phone = +w < 700;
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => (m.type() === 'error' || (m.type() === 'warning' && /WebGL|GL_/.test(m.text()))) && errs.push(m.type() + ' ' + m.text()));
await p.addInitScript(() => {
  window.__ft = [];
  let last = performance.now();
  const loop = (t) => {
    window.__ft.push(t - last);
    last = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
let failed = false;
const fail = (msg) => {
  failed = true;
  console.log('  FAIL', msg);
};
const stats = (ft) => {
  const a = ft.slice(30).sort((x, y) => x - y);
  if (!a.length) return {};
  const q = (k) => a[Math.min(a.length - 1, Math.floor(a.length * k))].toFixed(1);
  return { frames: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: a[a.length - 1].toFixed(1), over50: a.filter((x) => x > 50).length };
};
const sunup = () =>
  p.evaluate(() => {
    const s = window.sunup.state;
    return { day: s.day, coins: s.coins, rep: s.rep, water: s.water, tools: s.tools, harvested: Object.values(s.stats.harvested).reduce((a, b) => a + b, 0), frames: window.sunup.frames };
  });

// Sunup with the bot.
await p.goto(`${base}/?game=homestead&fresh&autoplay`);
await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 30000 });
await p.evaluate(() => (window.__ft = []));
await p.waitForTimeout(+secs * 1000);
const a = await sunup();
console.log('sunup', JSON.stringify(a), JSON.stringify(stats(await p.evaluate(() => window.__ft))));
if (a.harvested < 4) fail('the bot harvested almost nothing');
await p.screenshot({ path: `${out}/sunup-${phone ? 'phone' : 'desk'}.png` });

// Switch through every game and back.
for (const id of ['deck', 'ranch', 'homestead']) {
  await p.evaluate((id) => window.shell.play(id), id);
  await p.waitForFunction((id) => document.querySelector(`.gameroot[data-game="${id}"]:not(.off)`), id, { timeout: 30000 });
  await p.waitForTimeout(2500);
  const visible = await p.evaluate(() => [...document.querySelectorAll('.gameroot')].filter((r) => !r.classList.contains('off')).map((r) => r.dataset.game));
  if (visible.length !== 1 || visible[0] !== id) fail(`after switching to ${id}, visible games are ${visible.join(',')}`);
  await p.screenshot({ path: `${out}/switch-${id}-${phone ? 'phone' : 'desk'}.png` });
}
const c = await sunup();
if (c.day < a.day) fail(`Sunup went back from day ${a.day} to ${c.day}`);
const f0 = c.frames;
await p.waitForTimeout(500);
if ((await sunup()).frames <= f0) fail('Sunup did not resume');
// While another game runs, Sunup must be still.
await p.evaluate(() => window.shell.play('deck'));
await p.waitForTimeout(400);
const paused0 = (await sunup()).frames;
await p.waitForTimeout(800);
if ((await sunup()).frames !== paused0) fail('Sunup kept running while hidden');
// The title over a game pauses it too.
await p.evaluate(() => window.shell.play('homestead'));
await p.waitForTimeout(300);
await p.evaluate(() => window.shell.show());
await p.waitForTimeout(300);
const t0 = (await sunup()).frames;
await p.waitForTimeout(600);
if ((await sunup()).frames !== t0) fail('Sunup kept running under the title');
await p.evaluate(() => window.shell.hide());
console.log('switching', failed ? 'problems above' : 'ok');

if (errs.length) fail(errs.slice(0, 8).join('\n  '));
await b.close();
console.log(failed ? 'E2E FAILED' : 'E2E OK', `screens in ${out}`);
process.exit(failed ? 1 : 0);
