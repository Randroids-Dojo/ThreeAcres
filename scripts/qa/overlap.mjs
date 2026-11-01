// Overlapping interface in Sunup, measured. Puts the game in each state that
// opens something (seed picker, build picker, board, a toast, a lesson line,
// the info caption) on a phone and on a desktop, collects the boxes of every
// visible HUD piece and fails on any pair that overlaps, on a ruled line
// through words, and on any visible button a tap cannot reach.
// node scripts/qa/overlap.mjs [base url]
import { chromium } from 'playwright-core';
import { strikeScan } from './strike.mjs';
import { reachScan } from './reach.mjs';

const base = process.argv[2] ?? 'http://localhost:5247';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failed = 0;

// Pieces that must never cover each other, by selector.
const PIECES = {
  shell: '.shellbtn',
  day: '.daycard',
  coins: '.coins',
  board: '.topbtns .iconbtn',
  rack: '.toolbar',
  seeds: '.seedbar',
  builds: '.buildbar',
  act: '.tb-act',
  stick: '.ts-base',
  line: '.hint.on',
  caption: '.info:not(.empty):not(.quiet)',
  toast: '.toasts .toast',
};

async function run(label, viewport, touch) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  await p.goto(`${base}/?game=homestead&fresh`);
  await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 30000 });
  if (touch) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: viewport.width - 60, y: 300, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  // Everything introduced, so every piece can show.
  await p.evaluate(() => {
    for (const what of ['can', 'sleep', 'coins', 'seeds', 'stamina', 'board', 'requests', 'hoe', 'pests', 'build', 'forecast', 'smith']) window.sunup.input.push({ type: 'unlock', what });
  });
  await p.waitForTimeout(400);
  const boxes = () =>
    p.evaluate((pieces) => {
      const out = [];
      for (const [name, sel] of Object.entries(pieces)) {
        for (const e of document.querySelectorAll(sel)) {
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || e.closest('.gone, .hidden, .off')) continue;
          let hidden = false;
          for (let a = e; a; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (s.display === 'none' || Number(s.opacity) < 0.05) hidden = true;
          }
          if (hidden) continue;
          const r = e.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          out.push({ name, l: r.left, t: r.top, r: r.right, b: r.bottom });
        }
      }
      return out;
    }, PIECES);
  const states = [
    ['plain', async () => {}],
    ['lesson line', async () => p.evaluate(() => window.sunup.hud.setLesson('Pull the ripe radishes. Walk up to one and hold the round button.'))],
    ['caption', async () => {
      await p.evaluate(() => {
        window.sunup.hud.setLesson('');
        const f = window.sunup.state.actors[0];
        f.x = 3.5; f.y = 4.5; f.facing = 's';
      });
    }],
    ['seed picker', async () => p.evaluate(() => window.sunup.hud.pickTool('seeds'))],
    ['build picker', async () => p.evaluate(() => window.sunup.hud.pickTool('build'))],
    ['toast', async () => p.evaluate(() => { window.sunup.hud.pickTool('hands'); window.sunup.hud.toast('<b>Spring 2</b>, cloudy<br>Sold 4 for 120.', 'big', 5000); })],
  ];
  for (const [name, setup] of states) {
    await setup();
    await p.waitForTimeout(450);
    const bx = await boxes();
    const hits = [];
    for (let i = 0; i < bx.length; i++) {
      for (let j = i + 1; j < bx.length; j++) {
        const A = bx[i];
        const B = bx[j];
        const w = Math.min(A.r, B.r) - Math.max(A.l, B.l);
        const h = Math.min(A.b, B.b) - Math.max(A.t, B.t);
        if (w > 2 && h > 2) hits.push(`${A.name}/${B.name} ${Math.round(w)}x${Math.round(h)}`);
      }
    }
    // A ruled line across the middle of any words reads as struck through.
    for (const q of await p.evaluate(strikeScan)) hits.push(`rule through "${q.text}" in ${q.in}`);
    // Every visible button must take a tap, not something lying over it (the stick's capture zone, say).
    for (const q of await p.evaluate(reachScan, 'button')) hits.push(`${q.control} is under ${q.under} at ${q.at}`);
    const ok = hits.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} ${name}${ok ? '' : `  (${hits.join(', ')})`}`);
    await p.screenshot({ path: `/tmp/acres-overlap-${label}-${name.replace(/ /g, '-')}.png` });
  }
  await ctx.close();
}

await run('phone', { width: 412, height: 838 }, true);
await run('desk', { width: 1280, height: 800 }, false);
await b.close();
console.log(failed ? `OVERLAP FAILED (${failed})` : 'OVERLAP OK');
process.exit(failed ? 1 : 0);
