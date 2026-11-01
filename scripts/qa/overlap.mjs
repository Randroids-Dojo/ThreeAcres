// Overlapping interface in Sunup, measured. Puts the game in each state that
// opens something (seed picker, build picker, board, a toast, a lesson line,
// the info caption, the sleep question, an empty can) on a phone and on a
// desktop, collects the boxes of every visible HUD piece and fails on any pair
// that overlaps, on a ruled line through words, and on any visible button a
// tap cannot reach. Also: the seed picker never covers the plot being worked
// and keeps every seed on screen, a toast shows over an open board (not behind
// it), what cannot be afforded is not stamped like what can, and the board's
// tabs stay put from tab to tab.
// Round 2: on a desktop the close camera keeps the crops a lesson is about
// clear of the lesson line and the rack; the keys show on the buttons (1 to
// 5, Enter, B, C, and a number on each seed); the keyboard alone picks a seed
// (a number key opens the picker, arrows and numbers choose without walking,
// Enter closes it without a sleep question, Escape closes it without the game
// switcher, Enter on a seed reached with Tab picks it); harvest words stay
// narrow; the view button keeps clear of everything.
// Round 3: the board with a pair of requests ("or" between them) on a phone
// and a desktop; B puts the keyboard on the board and Tab and Shift+Tab go
// round the board's own buttons only (they used to cycle eleven HUD pieces
// behind it), and Escape gives the keyboard back to the farm; the forecast's
// words stay inside the day card.
// Round 4: the whole-farm view on a phone and a desktop (View, or C): no
// overlaps, and every plot of all six fields between the day card and the
// controls; a busy night's morning card says three clauses at most; the
// board's notes run ten words at most and its close button says Close; the
// board and View buttons wear their words; the forecast's words are 11 px or
// more and the seed cards' lines 12 px or more.
// Round 5: the board's offers headline their gain over market and carry an
// Accept stamp that takes a tap; a taken note says what is growing for it;
// the build question; "Heat wave" keeps the day card to one line; on a
// desktop the HUD's type is a size up (it read tiny at 1280 by 800).
// Round 6: every HUD piece on the screen, in every state (on a heat-wave day
// the coins box and the View button ended at 418 px on a 412 px phone, the
// coins cut off); the heat wave with four-digit coins; a note's phrases never
// break across lines ("no / day to spare"); on a desktop the board's notes are
// 15 px or more in cards 300 px or wider and the key caps 11 px or more; the
// phone's whole-farm view leaves little blank sky above the farm; and with a
// mouse, the seed picker open, a click on a thirsty crop closes the picker
// and the lesson pointer comes back.
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
  board: '.topbtns .iconbtn:not(.viewbtn)',
  view: '.topbtns .viewbtn',
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

/**
 * Round 6, with a mouse: the seed picker open from the rack, a click on a thirsty carrot takes the can and waters it.
 * The picker hid but stayed open, and an open picker hides the lesson pointer, so the "Fill the can at the well"
 * arrow was gone until Escape. Now the picker closes and the pointer comes back.
 */
async function pickerMouseCheck(p, label) {
  await p.evaluate(() => {
    const st = window.sunup.state;
    window.sunup.dialogs.close(true);
    window.sunup.input.push({ type: 'rules', patch: { camera: 'close' } });
    st.learn = st.learn.filter((w) => !w.startsWith('lesson:'));
    st.learn.push('lesson:pull');
    st.learnCount = {};
    Object.assign(st, { day: 2, minute: 60, coins: 100, stamina: 100, water: 12, weather: 'sun', orders: [], crows: [], crowPlan: [], builds: [], report: null });
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) {
      const q = st.plots[y * st.W + x];
      q.tilled = true;
      q.wet = false;
      q.crop = y === 6 ? { id: st.nextId++, kind: 'carrot', age: 1, stage: 1, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: 1 } : null;
    }
    st.tool = 'hands';
    Object.assign(st.actors[0], { x: 3.5, y: 4.5, facing: 's', task: null, path: [] });
  });
  await p.waitForTimeout(1200);
  const look = () => p.evaluate(() => ({ line: document.querySelector('.hint.on')?.textContent ?? '', bar: !document.querySelector('.seedbar').classList.contains('hidden'), picking: window.sunup.hud.picking, pointer: document.querySelector('.tpoint').classList.contains('on'), tool: window.sunup.state.tool }));
  const seeds = await p.evaluate(() => { const r = document.querySelector('.toolbar .tool[data-tool="seeds"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.click(seeds[0], seeds[1]);
  await p.waitForTimeout(400);
  const open = await look();
  const c = await p.evaluate(() => window.sunup.r3d.project(4.5, 6.5, 0));
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(1800);
  const after = await look();
  const ok = open.bar && !open.pointer && after.tool === 'can' && !after.bar && !after.picking && after.pointer;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} round 6: Seeds open, a click on a thirsty carrot takes the can and closes the picker, and the lesson pointer comes back  (${JSON.stringify({ open, after })})`);
}

async function run(label, viewport, touch) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  await p.goto(`${base}/?game=homestead&fresh`);
  await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 30000 });
  // The first lessons are about the radish row and the carrot row: on a desktop, neither sits under the line or the rack.
  if (!touch) {
    await p.mouse.move(640, 300);
    await p.waitForTimeout(1200);
    const f = await p.evaluate(() => {
      const line = document.querySelector('.hint.on')?.getBoundingClientRect();
      const rack = document.querySelector('.toolbar').getBoundingClientRect();
      const rows = [5, 6].map((y) => Math.max(...[2.5, 3.5, 4.5, 5.5].map((x) => window.sunup.r3d.project(x, y + 0.5, 0.4).y)));
      return { lineTop: line ? line.top : null, rackTop: rack.top, rows };
    });
    const ok = f.lineTop !== null && f.rows.every((y) => y < f.lineTop - 6 && y < f.rackTop);
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} the close camera keeps the radish and carrot rows clear of the lesson line and the rack  (${JSON.stringify(f)})`);
    await p.screenshot({ path: `/tmp/acres-overlap-${label}-first-lesson.png` });
  }
  if (touch) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: viewport.width - 60, y: 300, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  // Everything introduced, so every piece can show.
  await p.evaluate(() => {
    for (const what of ['can', 'sleep', 'coins', 'seeds', 'stamina', 'board', 'requests', 'hoe', 'pests', 'build', 'forecast', 'smith', 'wide', 'fields', 'seedtab']) window.sunup.input.push({ type: 'unlock', what });
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
    ['board with a toast', async () => p.evaluate(() => { window.sunup.dialogs.board('requests'); window.sunup.hud.toast('<b>Mabel\u2019s bakery</b> took the crops. +80 coins, +1 reputation.', 'big', 5000); })],
    // Round 3: a pair of requests to choose between, as a morning pins them.
    ['board requests, a pair', async () => p.evaluate(async () => {
      const st = window.sunup.state;
      window.sunup.dialogs.close(true);
      Object.assign(st, { day: 6, rep: 1, requested: 1, orders: [], coins: 300 });
      for (const q of st.plots) if (q.crop && q.crop.stage < 4) q.crop = null;
      window.sunup.pinRequests();
      window.sunup.dialogs.board('requests');
    })],
    // Round 5: one of the pair taken: its note says what is growing for it and when it is wanted.
    ['board requests, one taken', async () => p.evaluate(async () => {
      const st = window.sunup.state;
      const offer = st.orders.find((o) => o.taken === false);
      if (offer) window.sunup.input.push({ type: 'accept', id: offer.id });
      await new Promise((r) => setTimeout(r, 120));
      window.sunup.dialogs.board('requests');
    })],
    // Round 5: the lesson pointer asks before it builds.
    ['build question', async () => p.evaluate(() => { window.sunup.dialogs.close(true); window.sunup.dialogs.confirmBuild('scarecrow', 220, () => {}); })],
    // The forecast's three words sit inside the day card.
    ['forecast words', async () => p.evaluate(() => { window.sunup.dialogs.close(true); const st = window.sunup.state; st.weather = 'storm'; st.forecast = ['cloud', 'storm', 'heat']; })],
    // Round 5: "Heat wave" wrapped the day card onto two lines.
    ['heat wave', async () => p.evaluate(() => { const st = window.sunup.state; st.weather = 'heat'; st.forecast = ['heat', 'storm', 'rain']; })],
    // Round 6: the same with four-digit coins, the widest the top right gets (the tester's "190" was cut off at 412 px).
    ['heat wave, 1,190 coins', async () => p.evaluate(() => { const st = window.sunup.state; st.weather = 'heat'; st.forecast = ['heat', 'storm', 'cloud']; st.coins = 1190; })],
    ['sleep question', async () => p.evaluate(() => { window.sunup.dialogs.close(true); window.sunup.dialogs.confirmSleep(150, () => {}); })],
    // Round 4: the whole farm in one view (View on a phone, C on a keyboard), with the HUD over it.
    ['farm view', async () => p.evaluate(() => { window.sunup.dialogs.close(true); window.sunup.input.push({ type: 'rules', patch: { camera: 'wide' } }); })],
    // Round 4: a busy night: the morning card still says three clauses at most.
    ['morning card, a busy night', async () => p.evaluate(() => {
      const st = window.sunup.state;
      window.sunup.input.push({ type: 'rules', patch: { camera: 'close' } });
      st.report = { day: st.day - 1, sold: [{ crop: 'radish', n: 8, value: 240 }], wages: 0, grew: 9, withered: 2, eaten: 1, crewWork: 0, income: 240, filled: [{ who: 'Old Tamsin', reward: 145 }], lapsed: [{ who: 'The lighthouse keeper', crop: 'corn', n: 6 }], withdrawn: [{ who: 'Pell’s pickles', crop: 'carrot', n: 5 }], kept: [{ crop: 'lettuce', n: 3 }], ripe: 6, worn: 1 };
      window.sunup.hud['morning'](st);
    })],
    // Round 4: the smith's tab, once his lesson has come: its note is short.
    ['board smith', async () => p.evaluate(() => { window.sunup.dialogs.board('tools'); })],
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
    // Round 6: every piece is on the screen (a heat wave pushed the coins and the View button past a phone's edge).
    const vw = await p.evaluate(() => [innerWidth, innerHeight]);
    for (const q of bx) if (q.name !== 'dialog' && (q.l < -1 || q.r > vw[0] + 1 || q.t < -1 || q.b > vw[1] + 1)) hits.push(`${q.name} off the screen (${Math.round(q.l)} to ${Math.round(q.r)} of ${vw[0]})`);
    if (name.startsWith('heat wave')) {
      const q = await p.evaluate(() => { const n = document.querySelector('.coins .num'); const r = n.getBoundingClientRect(); return { text: n.textContent, right: Math.round(r.right), clip: n.scrollWidth > n.clientWidth + 1, view: Math.round(document.querySelector('.topbtns .viewbtn').getBoundingClientRect().right) }; });
      if (q.right > vw[0] || q.view > vw[0] || q.clip) hits.push(`coins or View cut off ${JSON.stringify(q)}`);
    }
    // Round 6: a note's phrases never break across two lines ("no / day to spare", "4 days to / go").
    if (name.startsWith('board requests')) {
      const broken = await p.evaluate(() => [...document.querySelectorAll('.dialog .item.req .nw')].filter((e) => { const rs = [...e.getClientRects()]; return rs.length > 1 && Math.abs(rs[0].top - rs[rs.length - 1].top) > 3; }).map((e) => e.textContent));
      if (broken.length) hits.push(`phrases broken across lines: ${broken.join(' | ')}`);
      const nw = await p.evaluate(() => document.querySelectorAll('.dialog .item.req .nw').length);
      if (!nw) hits.push('no phrases kept whole on the notes');
      if (!touch) {
        const q = await p.evaluate(() => ({ size: Math.min(...[...document.querySelectorAll('.dialog .item.req .tx > span')].map((e) => parseFloat(getComputedStyle(e).fontSize))), width: Math.min(...[...document.querySelectorAll('.dialog .item.req')].map((e) => e.getBoundingClientRect().width)) }));
        if (q.size < 15 || q.width < 300) hits.push(`desktop notes ${JSON.stringify(q)}`);
      }
    }
    if (name === 'plain' && !touch) {
      // Round 6: the key caps read (about 8 px on a desktop).
      const q = await p.evaluate(() => ['.toolbar .tool .key', '.toolbar .tool.act .key', '.topbtns .kcap'].map((k) => { const e = document.querySelector(k); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; }));
      if (Math.min(...q) < 11) hits.push(`desktop key caps ${q.join(', ')} px`);
    }
    if (name === 'farm view' && touch) {
      // Round 6: the phone's whole-farm view left the top 40% blank sky: the back trees now sit near the day card.
      const q = await p.evaluate(() => { const top = document.querySelector('.daycard').getBoundingClientRect().bottom; const trees = window.sunup.r3d.project(10, 0.5, 1.75).y; return { blank: Math.round(trees - top), share: +((trees - top) / innerHeight).toFixed(3) }; });
      console.log(`     ${label} farm view: blank sky between the day card and the back trees ${q.blank} px (${Math.round(q.share * 100)}% of the screen)`);
      if (q.share > 0.12) hits.push(`blank sky above the farm ${q.blank} px`);
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
    // The pair hangs together: two notes and "or" between them, all inside the board.
    if (name === 'board requests, a pair') {
      const q = await p.evaluate(() => {
        const notes = [...document.querySelectorAll('.dialog .pair .item.req')].map((e) => e.getBoundingClientRect());
        const or = document.querySelector('.dialog .pair .or')?.getBoundingClientRect();
        const d = document.querySelector('.dialog.on .body').getBoundingClientRect();
        const cross = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
        return { n: notes.length, or: !!or, inside: notes.every((r) => r.left >= d.left - 1 && r.right <= d.right + 1), clash: notes.length === 2 && or ? cross(notes[0], notes[1]) || notes.some((r) => cross(r, or)) : true };
      });
      if (q.n !== 2 || !q.or) hits.push(`the pair is not shown (${JSON.stringify(q)})`);
      if (!q.inside) hits.push('a request note runs off the board');
      if (q.clash) hits.push('the two notes or the "or" overlap');
      // Round 5: each offer headlines its gain over market, and carries an Accept stamp.
      const g = await p.evaluate(() => [...document.querySelectorAll('.dialog .pair .item.req')].map((e) => ({ head: e.querySelector('.tx > b')?.textContent ?? '', green: getComputedStyle(e.querySelector('.tx > b')).color, size: parseFloat(getComputedStyle(e.querySelector('.tx > b')).fontSize), stamp: e.querySelector('.btn')?.textContent ?? '' })));
      if (g.length !== 2 || g.some((x) => !/^\+[\d,]+ over market$/.test(x.head) || x.stamp !== 'Accept' || x.size < 15)) hits.push(`offer notes ${JSON.stringify(g)}`);
    }
    if (name === 'board requests, one taken') {
      const q = await p.evaluate(() => ({ pair: document.querySelectorAll('.dialog .pair').length, taken: [...document.querySelectorAll('.dialog .item.req.taken')].map((e) => [...e.querySelectorAll('.tx > *')].map((c) => c.textContent)) }));
      if (q.pair !== 0 || q.taken.length !== 1 || !/^For .+, \+[\d,]+ over market$/.test(q.taken[0][1]) || !/wanted by|Wanted by/.test(q.taken[0][q.taken[0].length - 1])) hits.push(`taken note ${JSON.stringify(q)}`);
    }
    if (name === 'build question') {
      const q = await p.evaluate(() => ({ title: document.querySelector('.dialog h2')?.textContent ?? '', btns: [...document.querySelectorAll('.dialog .ask .btn')].map((b) => b.textContent) }));
      if (q.title !== 'Build a scarecrow?' || q.btns.join() !== 'Build for 40,Not now') hits.push(`build question ${JSON.stringify(q)}`);
    }
    if (name === 'heat wave') {
      const q = await p.evaluate(() => { const n = document.querySelector('.daycard .sky > span:not(.ic):not(.fc)'); const r = n.getBoundingClientRect(); return { text: n.textContent, h: Math.round(r.height), line: parseFloat(getComputedStyle(n).lineHeight) || parseFloat(getComputedStyle(n).fontSize) * 1.3 }; });
      if (q.text !== 'Heat wave' || q.h > q.line * 1.4) hits.push(`"Heat wave" runs to ${q.h} px (one line is ${q.line})`);
    }
    if (name === 'plain' && !touch) {
      // Round 5: the desktop HUD's type was tiny at 1280 by 800.
      const q = await p.evaluate(() => {
        const px = (sel) => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; };
        return { date: px('.daycard .date'), sky: px('.daycard .sky'), tool: px('.toolbar .tool .lbl'), top: px('.topbtns .tlbl'), stamina: px('.daycard .stamina .mlbl'), coins: px('.coins') };
      });
      if (q.date < 22 || q.sky < 15 || q.tool < 13 || q.top < 13 || q.stamina < 13 || q.coins < 23) hits.push(`desktop type ${JSON.stringify(q)}`);
    }
    if (name === 'farm view') {
      const q = await p.evaluate(() => {
        const st = window.sunup.state;
        const top = document.querySelector('.daycard').getBoundingClientRect().bottom;
        const lows = [document.querySelector('.toolbar').getBoundingClientRect().top];
        for (const sel of ['.tb-act', '.ts-base']) { const e = document.querySelector(sel); if (e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none' && !e.closest('.touch:not(.show)')) lows.push(e.getBoundingClientRect().top); }
        const bottom = Math.min(...lows);
        let inside = 0;
        let n = 0;
        for (const pc of st.parcels) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) {
          n++;
          const pt = window.sunup.r3d.project(x + 0.5, y + 0.5, 0.3);
          if (pt && pt.x > 4 && pt.x < innerWidth - 4 && pt.y > top && pt.y < bottom) inside++;
        }
        return { camera: st.rules.camera, inside, n };
      });
      if (q.camera !== 'wide' || q.inside !== q.n) hits.push(`farm view shows ${q.inside} of ${q.n} plots (${q.camera})`);
    }
    if (name === 'morning card, a busy night') {
      const q = await p.evaluate(() => { const t = [...document.querySelectorAll('.toasts .toast')].pop(); return t ? (t.innerHTML.split('<br>')[1] ?? '').replace(/<[^>]+>/g, '') : ''; });
      const clauses = q.split(/[.,]\s*/).filter((x) => x.trim()).length;
      if (!q || clauses > 3) hits.push(`morning card has ${clauses} clauses: ${q}`);
    }
    // Round 4: the board's notes are footnotes, not letters, and its close button says what it does.
    if (name.startsWith('board')) {
      const q = await p.evaluate(() => ({
        notes: [...document.querySelectorAll('.dialog.on .list > p.legend')].map((e) => e.textContent.trim()),
        close: (() => { const b = document.querySelector('.dialog.on header .btn'); const l = b?.querySelector('.tlbl'); return { word: l?.textContent ?? '', shown: !!l && l.getBoundingClientRect().width > 10, aria: b?.getAttribute('aria-label') ?? '' }; })(),
      }));
      for (const t of q.notes) if (t.split(/\s+/).length > 10) hits.push(`board note of ${t.split(/\s+/).length} words: "${t}"`);
      if (q.close.word !== 'Close' || !q.close.shown || q.close.aria !== 'Close') hits.push(`close button ${JSON.stringify(q.close)}`);
    }
    // Round 4: small type read at about 9 and 10 px. The forecast's words 11 px or more, the seed cards' lines 12 or more.
    if (name === 'seed picker' || name === 'seed picker, end of season') {
      const q = await p.evaluate(() => [...document.querySelectorAll('.seedbar .seed')].filter((e) => getComputedStyle(e).display !== 'none').flatMap((e) => ['.nm', '.pr', '.wh'].map((k) => parseFloat(getComputedStyle(e.querySelector(k)).fontSize))));
      if (!q.length || Math.min(...q) < 12) hits.push(`seed card type ${Math.min(...q)} px`);
    }
    if (name === 'plain') {
      const q = await p.evaluate(() => [...document.querySelectorAll('.topbtns .iconbtn')].filter((e) => !e.classList.contains('gone') && e.getBoundingClientRect().width > 0).map((e) => { const l = e.querySelector('.tlbl'); return { t: l?.textContent ?? '', w: l ? l.getBoundingClientRect().width : 0, size: l ? parseFloat(getComputedStyle(l).fontSize) : 0 }; }));
      if (q.map((x) => x.t).join() !== 'Board,View' || q.some((x) => x.w < 10 || x.size < 11)) hits.push(`top buttons ${JSON.stringify(q)}`);
    }
    if (name === 'forecast words') {
      const q = await p.evaluate(() => {
        const card = document.querySelector('.daycard').getBoundingClientRect();
        const words = [...document.querySelectorAll('.daycard .fc .fl')].map((e) => e.getBoundingClientRect());
        return { n: words.length, inside: words.every((r) => r.left >= card.left - 1 && r.right <= card.right + 1 && r.bottom <= card.bottom + 1) };
      });
      if (q.n !== 3 || !q.inside) hits.push(`forecast words ${JSON.stringify(q)}`);
      const size = await p.evaluate(() => Math.min(...[...document.querySelectorAll('.daycard .fc .fl')].map((e) => parseFloat(getComputedStyle(e).fontSize))));
      if (size < 11) hits.push(`forecast words ${size} px`);
    }
    // Stamps you cannot afford are dashed and upright and say what they need.
    if (name === 'board fields, short of coins') {
      const b = await p.evaluate(() => [...document.querySelectorAll('.dialog .item .btn')].map((e) => ({ t: e.textContent, dis: e.disabled, dash: getComputedStyle(e).borderStyle, upper: getComputedStyle(e).textTransform })));
      if (!b.length || b.some((x) => !x.dis || x.dash !== 'dashed' || !/^(Need [\d,]+|Reputation \d+)$/.test(x.t))) hits.push(`unaffordable stamps ${JSON.stringify(b)}`);
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
  if (!touch) await keyboardChecks(p, label);
  if (!touch) await pickerMouseCheck(p, label);
  if (touch) {
    // Harvest words over a plot stay narrow, even for a long request.
    const w = await p.evaluate(() => {
      window.sunup.hud.float(3.5, 6.5, '18 of 20 strawberries');
      window.sunup.hud.float(4.5, 6.5, '20 strawberries ready');
      return [...document.querySelectorAll('.floaters .floater')].map((e) => e.getBoundingClientRect().width / innerWidth);
    });
    const ok = w.length > 0 && w.every((x) => x <= 0.6);
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} harvest words stay narrow  (${w.map((x) => `${Math.round(x * 100)}%`).join(', ')} of the width)`);
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

/** Desktop: the keys show on the buttons, and the keyboard alone opens, works and closes the seed picker. */
async function keyboardChecks(p, label) {
  const report = (name, ok, detail) => {
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} ${name}${detail ? `  (${detail})` : ''}`);
  };
  await p.evaluate(() => { window.sunup.dialogs.close(true); const st = window.sunup.state; st.day = 2; st.coins = 500; window.sunup.hud.pickTool('hands'); Object.assign(st.actors[0], { x: 3.5, y: 4.5, facing: 's', task: null, path: [] }); });
  await p.keyboard.press('KeyW');
  await p.waitForTimeout(300);
  const caps = await p.evaluate(() => {
    const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
    return {
      tools: [...document.querySelectorAll('.toolbar .tool[data-tool] .key')].filter(shown).map((e) => e.textContent).join(''),
      sleep: shown(document.querySelector('.toolbar .tool.act .key')) ? document.querySelector('.toolbar .tool.act .key').textContent : '',
      board: [...document.querySelectorAll('.topbtns .kcap')].filter(shown).map((e) => e.textContent).join(''),
    };
  });
  report('the keys show on the buttons: tools, Enter to sleep, B for the board, C for the view', caps.tools.startsWith('123') && caps.sleep === 'Enter' && caps.board === 'BC', JSON.stringify(caps));
  const st = () => p.evaluate(() => ({ seed: window.sunup.state.seed, tool: window.sunup.state.tool, x: window.sunup.state.actors[0].x, y: window.sunup.state.actors[0].y, picker: !document.querySelector('.seedbar').classList.contains('hidden'), dialog: window.sunup.dialogs.open, switcher: !!document.querySelector('.shellover.on'), keys: [...document.querySelectorAll('.seedbar .seed:not(.gone) .key')].map((e) => getComputedStyle(e).display !== 'none' ? e.textContent : '').join('') }));
  await p.keyboard.press('Digit3');
  await p.waitForTimeout(250);
  let a = await st();
  report('a number key opens the seed picker, each seed wearing its number', a.picker && a.tool === 'seeds' && a.keys === '1234', JSON.stringify(a));
  const seed0 = a.seed;
  await p.keyboard.down('ArrowRight');
  await p.waitForTimeout(400);
  await p.keyboard.up('ArrowRight');
  let b = await st();
  report('an arrow key chooses the next seed and does not walk the farmer', b.seed !== seed0 && Math.abs(b.x - a.x) < 0.01 && Math.abs(b.y - a.y) < 0.01 && b.picker, JSON.stringify({ from: seed0, to: b.seed, moved: Math.hypot(b.x - a.x, b.y - a.y).toFixed(2) }));
  await p.keyboard.press('Digit3');
  await p.waitForTimeout(200);
  b = await st();
  report('a number key picks that seed', b.seed === 'carrot' && b.picker, JSON.stringify(b));
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  b = await st();
  report('Enter closes the picker, with no sleep question', !b.picker && !b.dialog && b.seed === 'carrot', JSON.stringify(b));
  await p.keyboard.press('Digit3');
  await p.waitForTimeout(250);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  b = await st();
  report('Escape closes the picker, and does not open the game switcher', !b.picker && !b.switcher && !b.dialog, JSON.stringify(b));
  // A seed reached with Tab: Enter presses it (and is not taken for sleep).
  await p.keyboard.press('Digit3');
  await p.waitForTimeout(250);
  await p.evaluate(() => document.querySelector('.seedbar .seed[data-crop="lettuce"]').focus());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  b = await st();
  report('Enter on a seed reached with Tab picks it, with no sleep question', b.seed === 'lettuce' && !b.dialog, JSON.stringify(b));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  // The C key and the view button: the whole farm, and back.
  await p.keyboard.press('KeyC');
  await p.waitForTimeout(200);
  const wide = await p.evaluate(() => window.sunup.state.rules.camera);
  await p.evaluate(() => document.querySelector('.topbtns .viewbtn').click());
  await p.waitForTimeout(200);
  const back = await p.evaluate(() => window.sunup.state.rules.camera);
  report('C shows the whole farm and the view button brings the close view back', wide === 'wide' && back === 'close', `${wide}, then ${back}`);
  await p.evaluate(() => window.sunup.hud.pickTool('hands'));

  // Round 3: B left the keyboard outside the board, and Tab went round eleven HUD pieces behind it. Now B puts the
  // keyboard on the board, Tab and Shift+Tab stay on it, Enter on a tab changes tab and keeps the keyboard there, and
  // Escape closes it and gives the keyboard back to the farm.
  await p.evaluate(() => { window.sunup.dialogs.close(true); document.activeElement?.blur(); });
  await p.keyboard.press('KeyB');
  await p.waitForTimeout(400);
  const focusAt = () => p.evaluate(() => {
    const a = document.activeElement;
    return { inBoard: !!a && !!a.closest('.dialog.on'), text: a?.textContent?.trim().slice(0, 24) ?? '', tag: a?.tagName ?? '' };
  });
  const first = await focusAt();
  report('B opens the board with the keyboard on it', first.inBoard && first.text === 'Requests', JSON.stringify(first));
  const visits = [];
  for (let i = 0; i < 14; i++) {
    await p.keyboard.press('Tab');
    visits.push(await focusAt());
  }
  for (let i = 0; i < 4; i++) {
    await p.keyboard.down('Shift');
    await p.keyboard.press('Tab');
    await p.keyboard.up('Shift');
    visits.push(await focusAt());
  }
  const names = [...new Set(visits.map((v) => v.text))];
  report('Tab and Shift+Tab go round the board\u2019s own buttons only', visits.every((v) => v.inBoard) && names.length >= 3, `${visits.filter((v) => !v.inBoard).length} stops off the board; went round ${names.join(' | ')}`);
  // Enter on the Fields tab: the board shows fields, and the keyboard stays on it.
  await p.evaluate(() => [...document.querySelectorAll('.dialog .tabs button')].find((b) => b.textContent === 'Fields')?.focus());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  const tabbed = await p.evaluate(() => ({ on: document.querySelector('.dialog .tabs button.on')?.textContent, inBoard: !!document.activeElement?.closest('.dialog.on'), open: window.sunup.dialogs.open }));
  report('Enter on a tab changes tab and keeps the keyboard on the board', tabbed.on === 'Fields' && tabbed.inBoard && tabbed.open, JSON.stringify(tabbed));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const closed = await p.evaluate(() => ({ open: window.sunup.dialogs.open, switcher: !!document.querySelector('.shellover.on'), body: document.activeElement === document.body || !document.activeElement?.closest('.hud, .dialog') }));
  report('Escape closes the board and gives the keyboard back to the farm', !closed.open && !closed.switcher && closed.body, JSON.stringify(closed));
}

await run('phone', { width: 412, height: 838 }, true);
await run('desk', { width: 1280, height: 800 }, false);
await b.close();
console.log(failed ? `OVERLAP FAILED (${failed})` : 'OVERLAP OK');
process.exit(failed ? 1 : 0);
