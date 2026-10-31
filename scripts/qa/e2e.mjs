// Plays the real game in Chrome with the bot at the controls.
// node scripts/qa/e2e.mjs [seconds per preset] [w h] [base url]
// For each preset: autoplay, record frame times, errors and progress, and save
// screenshots. Then a switch storm: a random axis every 1.5 s for a while,
// checking the farm stays whole and both views keep drawing.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const [, , secs = '20', w = '1280', h = '800', base = 'http://localhost:5247'] = process.argv;
const out = '/tmp/acres-e2e';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const phone = +w < 700;
let failed = false;

async function page() {
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
  return { p, errs };
}

function stats(ft) {
  const a = ft.slice(30).sort((x, y) => x - y);
  if (!a.length) return {};
  const q = (k) => a[Math.min(a.length - 1, Math.floor(a.length * k))].toFixed(1);
  return { frames: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: a[a.length - 1].toFixed(1), over50: a.filter((x) => x > 50).length };
}

const summary = () =>
  window.acres &&
  (() => {
    const s = window.acres.state();
    const harvested = Object.values(s.stats.harvested).reduce((x, y) => x + y, 0);
    return { day: s.day, coins: s.coins, harvested, earned: s.stats.earned, fields: s.parcels.filter((p) => p.owned).length, hands: s.actors.filter((a) => a.role === 'hand' && !a.away).length, stars: s.almanac.stars, rep: s.rep, view: s.rules.view };
  })();

for (const preset of ['sunup', 'patchwork', 'bushel']) {
  const { p, errs } = await page();
  await p.goto(`${base}/?preset=${preset}&fresh&autoplay`);
  await p.waitForFunction(() => window.acres && window.acres.director.frames > 20, null, { timeout: 30000 });
  await p.evaluate(() => (window.__ft = []));
  const t0 = Date.now();
  let shot = 0;
  while (Date.now() - t0 < +secs * 1000) {
    await p.waitForTimeout(Math.min(5000, +secs * 1000 / 3));
    await p.screenshot({ path: `${out}/${preset}-${phone ? 'phone' : 'desk'}-${shot++}.png` });
  }
  const r = await p.evaluate(summary);
  const ft = stats(await p.evaluate(() => window.__ft));
  console.log(preset, JSON.stringify(r), JSON.stringify(ft));
  if (errs.length) {
    failed = true;
    console.log('  ERRORS', errs.slice(0, 8).join('\n  '));
  }
  if (r.day < 2 && preset !== 'patchwork') console.log('  WARN: no day passed');
  await p.close();
}

// Switch storm.
{
  const { p, errs } = await page();
  await p.goto(`${base}/?preset=sunup&fresh&autoplay`);
  await p.waitForFunction(() => window.acres && window.acres.director.frames > 20, null, { timeout: 30000 });
  await p.evaluate(() => (window.__ft = []));
  const axes = { view: ['2d', '3d'], camera: ['close', 'wide'], control: ['walk', 'point'], clock: ['day', 'turns', 'flow'], growth: ['classic', 'synergy'], goal: ['market', 'almanac', 'orders'], weather: ['calm', 'wild'], crew: ['solo', 'crew'], tools: ['kit', 'smart'] };
  const keys = Object.keys(axes);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = Math.max(12, Math.round(+secs / 1.5));
  const bad = [];
  for (let i = 0; i < n; i++) {
    const a = keys[Math.floor(rnd() * keys.length)];
    const v = axes[a][Math.floor(rnd() * axes[a].length)];
    await p.evaluate(([a, v]) => window.acres.director.setRules({ [a]: v }), [a, v]);
    await p.waitForTimeout(1500);
    const check = await p.evaluate(() => {
      const s = window.acres.state();
      const f = s.actors[0];
      const out = [];
      if (!Number.isFinite(f.x + f.y)) out.push('farmer NaN');
      if (s.ap < 0 || s.ap > s.apMax) out.push('ap ' + s.ap);
      if (s.coins < 0) out.push('coins ' + s.coins);
      const c = [...document.querySelectorAll('.stage canvas')].filter((x) => !x.classList.contains('hidden'));
      if (c.length !== 1) out.push(`${c.length} visible canvases`);
      return out;
    });
    if (check.length) bad.push(`${a}=${v}: ${check.join(', ')}`);
    if (i % 4 === 0) await p.screenshot({ path: `${out}/storm-${phone ? 'phone' : 'desk'}-${i}.png` });
  }
  const r = await p.evaluate(summary);
  console.log('storm', n, 'switches', JSON.stringify(r), JSON.stringify(stats(await p.evaluate(() => window.__ft))));
  if (bad.length) {
    failed = true;
    console.log('  PROBLEMS', bad.join('\n  '));
  }
  if (errs.length) {
    failed = true;
    console.log('  ERRORS', errs.slice(0, 8).join('\n  '));
  }
  await p.close();
}
await b.close();
console.log(failed ? 'E2E FAILED' : 'E2E OK', `screens in ${out}`);
process.exit(failed ? 1 : 0);
