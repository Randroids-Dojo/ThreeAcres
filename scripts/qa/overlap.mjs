// Overlapping interface in Sunup, measured. Puts the game in each state that
// opens something (seed picker, build picker, board, a toast, a lesson line,
// the info caption, the sleep question, an empty can) on a phone and on a
// desktop, collects the boxes of every visible HUD piece and fails on any pair
// that overlaps, on a ruled line through words, and on any visible button a
// tap cannot reach. Also: the seed picker never covers the plot being worked
// and keeps every seed on screen, a toast shows over an open board (not behind
// it), what cannot be afforded is not stamped like what can, and the board's
// tabs stay put from tab to tab.
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
  dialog: '.dialog.on',
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
    // The board's longest tab must not grow over the shell's corner button.
    ['board seeds', async () => p.evaluate(() => window.sunup.dialogs.board('seeds'))],
    // Fields you cannot afford: the stamp says what it needs and looks it.
    ['board fields, short of coins', async () => p.evaluate(() => { window.sunup.state.coins = 120; window.sunup.dialogs.board('fields'); })],
    // A toast while the board is open shows over it, below the board.
    ['board with a toast', async () => p.evaluate(() => { window.sunup.dialogs.board('requests'); window.sunup.hud.toast('<b>Mabel\u2019s bakery</b> took the crops. +80 coins and a good word.', 'big', 5000); })],
    ['sleep question', async () => p.evaluate(() => { window.sunup.dialogs.close(true); window.sunup.dialogs.confirmSleep(150, () => {}); })],
    ['empty can', async () => p.evaluate(() => { window.sunup.dialogs.close(true); window.sunup.state.water = 0; window.sunup.hud.pickTool('can'); })],
    // The seed picker opens away from the plot being worked: below when the plot is high on the screen, up top when it is low.
    ['seed picker, plot high', async () => p.evaluate(() => { const st = window.sunup.state; st.water = 12; window.sunup.hud.pickTool('hands'); const f = st.actors[0]; Object.assign(f, { x: 3.5, y: 4.5, facing: 's', task: null, path: [] }); window.sunup.hud.pickTool('seeds'); })],
    ['seed picker, plot low', async () => p.evaluate(() => { const st = window.sunup.state; window.sunup.hud.pickTool('hands'); st.parcels[2].owned = true; for (let y = 10; y < 14; y++) for (let x = 2; x < 6; x++) st.plots[y * st.W + x].tilled = true; const f = st.actors[0]; Object.assign(f, { x: 3.5, y: 11.5, facing: 's', task: null, path: [] }); window.sunup.hud.pickTool('seeds'); })],
    // The last days of spring: seven seeds, every one on screen.
    ['seed picker, end of season', async () => p.evaluate(() => { const st = window.sunup.state; window.sunup.hud.pickTool('hands'); st.day = 8; const f = st.actors[0]; Object.assign(f, { x: 3.5, y: 4.5, facing: 's', task: null, path: [] }); window.sunup.hud.pickTool('seeds'); })],
  ];
  for (const [name, setup] of states) {
    await setup();
    await p.waitForTimeout(450);
    const bx = await boxes();
    const hits = [];
    // An open board covers the HUD on purpose; then only the shell's corner must stay clear of it.
    const modal = bx.some((q) => q.name === 'dialog');
    for (let i = 0; i < bx.length; i++) {
      for (let j = i + 1; j < bx.length; j++) {
        const A = bx[i];
        const B = bx[j];
        if (modal && !((A.name === 'dialog' && B.name === 'shell') || (A.name === 'shell' && B.name === 'dialog'))) continue;
        const w = Math.min(A.r, B.r) - Math.max(A.l, B.l);
        const h = Math.min(A.b, B.b) - Math.max(A.t, B.t);
        if (w > 2 && h > 2) hits.push(`${A.name}/${B.name} ${Math.round(w)}x${Math.round(h)}`);
      }
    }
    // A ruled line across the middle of any words reads as struck through.
    for (const q of await p.evaluate(strikeScan)) hits.push(`rule through "${q.text}" in ${q.in}`);
    // Every visible button must take a tap, not something lying over it (the stick's capture zone, say).
    for (const q of await p.evaluate(reachScan, modal ? '.dialog.on button, .shellbtn' : 'button')) hits.push(`${q.control} is under ${q.under} at ${q.at}`);
    // A toast over an open board is on top of it, and clear of the board itself.
    if (name === 'board with a toast') {
      const t = await p.evaluate(() => {
        const e = document.querySelector('.toasts .toast');
        const r = e.getBoundingClientRect();
        const d = document.querySelector('.dialog.on').getBoundingClientRect();
        // Toasts take no taps, so hit testing skips them; let this one take them for the measurement.
        e.style.pointerEvents = 'auto';
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        e.style.pointerEvents = '';
        return { onTop: !!top && e.contains(top), clear: r.top >= d.bottom - 1 || r.bottom <= d.top + 1 };
      });
      if (!t.onTop) hits.push('toast is behind the board');
      if (!t.clear) hits.push('toast covers the board');
    }
    // Stamps you cannot afford are dashed and upright and say what they need.
    if (name === 'board fields, short of coins') {
      const b = await p.evaluate(() => [...document.querySelectorAll('.dialog .item .btn')].map((e) => ({ t: e.textContent, dis: e.disabled, dash: getComputedStyle(e).borderStyle, upper: getComputedStyle(e).textTransform })));
      if (!b.length || b.some((x) => !x.dis || x.dash !== 'dashed' || !/^Need [\d,]+$/.test(x.t))) hits.push(`unaffordable stamps ${JSON.stringify(b)}`);
      if (b.some((x) => x.upper === 'uppercase')) hits.push('stamps in capitals');
    }
    // The picker never covers the plot being worked, and every seed in it is on screen.
    if (name.startsWith('seed picker,')) {
      const q = await p.evaluate(() => {
        const r = document.querySelector('.seedbar').getBoundingClientRect();
        const a = window.sunup.hud['lastAim'];
        const pt = a ? window.sunup.r3d.project(a.x + 0.5, a.y + 0.5, 0) : null;
        const off = [...document.querySelectorAll('.seedbar .seed')].filter((e) => getComputedStyle(e).display !== 'none').some((e) => { const b = e.getBoundingClientRect(); return b.left < 0 || b.right > innerWidth || b.top < 0 || b.bottom > innerHeight; });
        return { covered: !!pt && pt.x > r.left && pt.x < r.right && pt.y > r.top && pt.y < r.bottom, off, n: document.querySelectorAll('.seedbar .seed:not(.gone)').length };
      });
      if (q.covered) hits.push('the picker covers the plot being worked');
      if (q.off) hits.push('a seed card is off the screen');
    }
    const ok = hits.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} ${name}${ok ? '' : `  (${hits.join(', ')})`}`);
    await p.screenshot({ path: `/tmp/acres-overlap-${label}-${name.replace(/[ ,]+/g, '-')}.png` });
  }
  // The board's tabs stay put from tab to tab (a centred board moved them with each tab's length).
  await p.evaluate(() => { window.sunup.dialogs.close(true); window.sunup.state.day = 3; });
  const tops = [];
  for (const tab of ['requests', 'fields', 'seeds', 'tools', 'builds']) {
    await p.evaluate((t) => window.sunup.dialogs.board(t), tab);
    await p.waitForTimeout(350);
    tops.push(await p.evaluate(() => Math.round(document.querySelector('.dialog .tabs').getBoundingClientRect().top)));
  }
  const still = new Set(tops).size === 1;
  if (!still) failed++;
  console.log(`${still ? 'ok  ' : 'FAIL'} ${label} the board's tabs stay put from tab to tab  (${tops.join(', ')})`);
  await ctx.close();
}

await run('phone', { width: 412, height: 838 }, true);
await run('desk', { width: 1280, height: 800 }, false);
await b.close();
console.log(failed ? `OVERLAP FAILED (${failed})` : 'OVERLAP OK');
process.exit(failed ? 1 : 0);
