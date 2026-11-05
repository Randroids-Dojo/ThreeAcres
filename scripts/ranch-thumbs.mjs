// Thumb room under touch, at the Pixel 8 Pro's viewport (412 by 838, DPR 2.625):
// looking works from the middle and lower right, buttons win over the bellows,
// the stick works where it overlaps the bellows, the bellows still changes slot,
// and the journal page never blocks the stick. Every slot window's tap target
// is at least 44 px and overlaps no other target or button (with four windows
// and with the fifth), keeps at least 8 px from every button (Blow sat 2 px
// from the bottom-right one), and a long press on a window tips it out while a
// tap only picks it. The chosen window wears a ring and every filled window an
// icon; the zone's name clears the journal page; Blow moves on to the next
// window when one runs out and says so when the jar is empty. Real touch
// events through CDP.
//
// From the third playtest: the journal page holding the day's order and the
// next goal still clears the stick, the zone's name, the pause button and the
// shell corner; so does the order lesson's page; a wild downy let go of
// mid-tug gets away (and the crosshair note says so), with real touch on
// Pull; and with food chosen the crosshair marks a feeder it would land in.
// From the fourth: the morning's offers say so on the journal ("Orders wait on
// the price board."), the order taken shows its tally, and the count by the
// crosshair sits on its own ink backing (it ran into world words: "Sell²fluff").
// From the sixth: the time ring reads on grass (a pale arc on an ink track,
// measured from a screenshot) and the count keeps clear of it; the count steps
// off the sell crate's sign from 2 to 6 m ("Sell fl2ff"); the desktop journal
// page, three lines on it, sits inside the window (it ran 13 px off the bottom).
// Opens a ranch with every lesson taught, so every button is there.
// node scripts/ranch-thumbs.mjs [base url]
import { chromium } from 'playwright-core';
import { reachScan } from './qa/reach.mjs';

const base = process.argv[2] ?? 'http://localhost:5247';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${base}/?game=ranch&fresh&taught`);
await p.waitForFunction(() => window.ranch && window.ranch.sim, null, { timeout: 30000 });
const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 9, radiusY: 9, force: 1 })) });
const S = () => p.evaluate(() => { const s = window.ranch.sim.s; return { yaw: s.player.yaw, x: s.player.x, z: s.player.z, slot: s.sel }; });
const box = (sel) => p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom }; }, sel);
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const drag = async (x0, y0, dx, dy, id) => {
  await touch('touchStart', [[x0, y0, id]]);
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', [[x0 + (dx * i) / 8, y0 + (dy * i) / 8, id]]);
    await p.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await p.waitForTimeout(120);
};
// Wake the touch controls.
await touch('touchStart', [[300, 300, 1]]);
await touch('touchEnd', []);
await p.waitForTimeout(500);

for (const [label, y] of [['middle right', 420], ['lower right', 600]]) {
  const a = await S();
  await drag(300, y, 70, 0, 2);
  const c = await S();
  check(`looking from the ${label}`, Math.abs(c.yaw - a.yaw) > 0.1, `yaw ${a.yaw.toFixed(2)} to ${c.yaw.toFixed(2)}`);
}
const puff = await box('.rt-puff');
const draw = await box('.rt-draw');
const jump = await box('.rt-jump');
const bel = await box('.rh-bellows');
check('buttons sit in the bottom-right quarter', [puff, draw, jump].every((q) => q.l > 206 && q.t > 838 * 0.72), `top of jump ${Math.round(jump.t)}`);
// What gets a touch at the overlap of the bellows and puff, and on the stick side of the bellows.
const hit = (x, y) => p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const owner = e?.closest('button, .rt-stick, .rt-look, .rh-bellows') ?? e; return owner?.getAttribute('class') ?? ''; }, [x, y]);
if (bel.r > puff.l && bel.b > puff.t) {
  const ox = (Math.max(bel.l, puff.l) + Math.min(bel.r, puff.r)) / 2;
  const oy = (Math.max(bel.t, puff.t) + Math.min(bel.b, puff.b)) / 2;
  check('puff wins where it overlaps the bellows', /rt-puff|ic/.test(await hit(ox, oy)), await hit(ox, oy));
} else check('puff clear of the bellows', true);
check('the stick wins on its side of the bellows', /rt-stick|rt-base|rt-knob/.test(await hit(Math.max(bel.l + 10, 120), bel.y)), await hit(Math.max(bel.l + 10, 120), bel.y));
const a = await S();
await drag(Math.max(bel.l + 14, 130), bel.y, 0, -60, 3);
await p.waitForTimeout(200);
const c = await S();
check('a stick drag that starts over the bellows walks', Math.hypot(c.x - a.x, c.z - a.z) > 0.3, `moved ${Math.hypot(c.x - a.x, c.z - a.z).toFixed(2)} m`);
const s0 = await S();
const bx = Math.min(bel.r - 12, puff.l - 12);
check('the bellows is still reachable on the right', /rh-bellows|rh-slotbtn/.test(await hit(bx, bel.t + 20)), await hit(bx, bel.t + 20));
await touch('touchStart', [[bx, bel.t + 20, 4]]);
await touch('touchEnd', []);
await p.waitForTimeout(150);
const s1 = await S();
check('tapping the bellows changes slot', s1.slot !== s0.slot, `${s0.slot} to ${s1.slot}`);
// Every slot window takes its own tap, including those on the stick's side: a lesson may say to tap any of them.
const covered = await p.evaluate(reachScan, '.rh-slotbtn, .rt-btn');
check('every slot window and button takes a tap', covered.length === 0, covered.map((q) => `${q.control} under ${q.under} at ${q.at}`).join(' | '));
// Thumb-sized windows: every target at least 44 px, none over another or over a button.
const targets = () => p.evaluate(() => [...document.querySelectorAll('.rh-slotbtn, .rt-btn')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className.replace(/ ?(down|holding|show)/g, ''), l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }));
const overlaps = (rs) => {
  const out = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i];
    const c = rs[j];
    if (!/slotbtn/.test(a.cls) && !/slotbtn/.test(c.cls)) continue;
    const w = Math.min(a.r, c.r) - Math.max(a.l, c.l);
    const h = Math.min(a.b, c.b) - Math.max(a.t, c.t);
    if (w > 0 && h > 0) out.push(`${a.cls}@${Math.round(a.l)},${Math.round(a.t)} x ${c.cls}@${Math.round(c.l)},${Math.round(c.t)} (${Math.round(w)}x${Math.round(h)})`);
  }
  return out;
};
/** The smallest gap between any window target and any button (negative: they overlap). */
const clearance = (rs) => {
  let worst = { g: 1e9, at: '' };
  for (const a of rs.filter((q) => /slotbtn/.test(q.cls))) for (const c of rs.filter((q) => /rt-btn/.test(q.cls))) {
    const g = Math.max(c.l - a.r, a.l - c.r, c.t - a.b, a.t - c.b);
    if (g < worst.g) worst = { g, at: `${c.cls.replace('rt-btn ', '')} by window @${Math.round(a.l)},${Math.round(a.t)}` };
  }
  return worst;
};
for (const n of [4, 5]) {
  if (n === 5) {
    await p.evaluate(() => window.ranch.sim.s.slots.push({ t: null, n: 0 }));
    await p.waitForTimeout(300);
  }
  const rs = await targets();
  const slots = rs.filter((q) => /slotbtn/.test(q.cls));
  check(`${n} windows: every window target is at least 44 px`, slots.length === n && slots.every((q) => q.w >= 44 && q.h >= 44), slots.map((q) => `${Math.round(q.w)}x${Math.round(q.h)}`).join(' '));
  const ov = overlaps(rs);
  check(`${n} windows: no window target overlaps another, or Blow, Pull, Jump or pause`, ov.length === 0, ov.join(' | '));
  const cl = clearance(rs);
  check(`${n} windows: every window target keeps at least 8 px from every button`, cl.g >= 8, `${Math.round(cl.g)} px, ${cl.at}`);
  const cov = await p.evaluate(reachScan, '.rh-slotbtn, .rt-btn');
  check(`${n} windows: every window and button takes a tap at five points across it`, cov.length === 0, cov.map((q) => `${q.control} under ${q.under} at ${q.at}`).join(' | '));
}
await p.evaluate(() => { const s = window.ranch.sim.s; s.slots.length = 4; s.sel = 0; });
await p.waitForTimeout(300);
// A tap picks a window; a long press tips it out on the ground in front of you.
await p.evaluate(() => { const sim = window.ranch.sim; const s = sim.s; for (const q of s.slots) { q.t = null; q.n = 0; } for (let i = 0; i < 5; i++) sim.stow('cloverhead'); for (let i = 0; i < 3; i++) sim.stow('sweetroot'); s.sel = 0; });
await p.waitForTimeout(200);
const w1 = await p.evaluate(() => window.ranch.slotScreen(1));
await touch('touchStart', [[w1.x, w1.y, 6]]);
await p.waitForTimeout(90);
await touch('touchEnd', []);
await p.waitForTimeout(250);
const tapState = await p.evaluate(() => { const s = window.ranch.sim.s; return { sel: s.sel, n: s.slots[1].n }; });
check('a tap on a window picks it and leaves it full', tapState.sel === 1 && tapState.n === 3, JSON.stringify(tapState));
const w0 = await p.evaluate(() => window.ranch.slotScreen(0));
const onGround0 = await p.evaluate(() => window.ranch.sim.s.items.filter((i) => !i.gone && i.type === 'cloverhead').length);
await touch('touchStart', [[w0.x, w0.y, 7]]);
await p.waitForTimeout(300);
const ringShown = await p.evaluate(() => document.querySelectorAll('.rh-slotbtn.holding').length === 1);
await p.waitForTimeout(600);
await touch('touchEnd', []);
await p.waitForTimeout(400);
const held = await p.evaluate(() => { const s = window.ranch.sim.s; return { n: s.slots[0].n, ground: s.items.filter((i) => !i.gone && i.type === 'cloverhead').length }; });
check('holding a window shows a ring filling, then tips the window out in front of you', ringShown && held.n === 0 && held.ground - onGround0 === 5, `ring ${ringShown}, left ${held.n}, on the ground +${held.ground - onGround0}`);
// A thumb that lands on a window and moves meant to walk: it walks, and nothing tips out.
await p.evaluate(() => { const sim = window.ranch.sim; for (let i = 0; i < 4; i++) sim.stow('cloverhead'); });
const wl = await p.evaluate(() => window.ranch.slotScreen(0));
const g0 = await S();
const n0 = await p.evaluate(() => window.ranch.sim.s.slots[0].n);
await touch('touchStart', [[wl.x, wl.y, 8]]);
for (let i = 1; i <= 30; i++) {
  await touch('touchMove', [[wl.x, wl.y - Math.min(i, 8) * 7, 8]]);
  await p.waitForTimeout(30);
}
await touch('touchEnd', []);
await p.waitForTimeout(200);
const g1 = await S();
const n1 = await p.evaluate(() => window.ranch.sim.s.slots[0].n);
await p.evaluate(() => { const r = window.ranch; const pl = r.sim.s.player; pl.x = -15.5; pl.z = 37.2; pl.y = r.sim.phys.floor(pl.x, pl.z); pl.yaw = -0.55; });
check('a drag that starts on a window walks, and tips nothing out', Math.hypot(g1.x - g0.x, g1.z - g0.z) > 0.5 && n1 === n0 && n0 > 0, `moved ${Math.hypot(g1.x - g0.x, g1.z - g0.z).toFixed(2)} m, window ${n0} -> ${n1}`);
// Round 8: the windows moved with the bellows as you turned (turning left slid them to x 85 to 131, right where
// the stick rests: a tap at 100,760 landed on one), and a window was chosen the moment a thumb landed, so walks to
// the crate switched fluff to clover heads three times. Now the tap targets hold still where the windows sit at
// rest, clear of the stick, and a window is chosen only when the finger lifts without dragging.
await p.evaluate(() => { const sim = window.ranch.sim; const s = sim.s; for (const q of s.slots) { q.t = null; q.n = 0; } for (let i = 0; i < 6; i++) sim.stow('tuft-clover'); for (let i = 0; i < 4; i++) sim.stow('cloverhead'); s.sel = 0; });
await p.waitForTimeout(300);
const stickBase = await p.evaluate(() => { const r = document.querySelector(".rt-base").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; });
// Points across the stick's resting circle, and the playtest's own spot.
const stickPts = [[100, 760]];
for (let a = 0; a < 12; a++) for (const f of [0.35, 0.7, 1]) stickPts.push([stickBase.x + Math.cos((a / 12) * Math.PI * 2) * stickBase.r * f, stickBase.y + Math.sin((a / 12) * Math.PI * 2) * stickBase.r * f]);
const turnRows = [];
for (const [label, x0, dx] of [['left', 404, -24], ['right', 214, 24]]) {
  await touch('touchStart', [[x0, 430, 33]]);
  const row = { turn: label, frames: 0, hits: 0, gap: 1e9, drawnIn: 0, drawnMinX: 1e9, drawnMaxX: -1e9 };
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', [[x0 + dx * i, 430, 33]]);
    for (let f = 0; f < 3; f++) {
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
      const q = await p.evaluate(([pts, stickBase]) => {
        const r = window.ranch;
        const btns = [...document.querySelectorAll('.rh-slotbtn')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getBoundingClientRect());
        // The nearest any window target comes to the stick's circle (negative: inside it).
        let gap = 1e9;
        for (const b of btns) {
          const cx = Math.max(b.left, Math.min(stickBase.x, b.right));
          const cy = Math.max(b.top, Math.min(stickBase.y, b.bottom));
          gap = Math.min(gap, Math.hypot(cx - stickBase.x, cy - stickBase.y) - stickBase.r);
        }
        const hits = pts.filter(([x, y]) => document.elementFromPoint(x, y)?.classList.contains('rh-slotbtn')).length;
        // Where the windows are drawn now (they sway with the bellows): how far into the stick's circle they come.
        const drawn = [0, 1, 2, 3].map((i) => r.slotDrawn(i)).filter(Boolean);
        const drawnIn = drawn.filter((w) => Math.hypot(w.x - stickBase.x, w.y - stickBase.y) < stickBase.r + 23).length;
        return { gap, hits, drawnIn, xs: drawn.map((w) => w.x) };
      }, [stickPts, stickBase]);
      row.frames++;
      row.hits += q.hits;
      row.gap = Math.min(row.gap, q.gap);
      row.drawnIn = Math.max(row.drawnIn, q.drawnIn);
      row.drawnMinX = Math.min(row.drawnMinX, ...q.xs);
      row.drawnMaxX = Math.max(row.drawnMaxX, ...q.xs);
    }
  }
  await touch('touchEnd', []);
  await p.waitForTimeout(500);
  row.gap = Math.round(row.gap);
  row.drawnMinX = Math.round(row.drawnMinX);
  row.drawnMaxX = Math.round(row.drawnMaxX);
  turnRows.push(row);
}
check('turning left and right, no window target comes within the stick\'s resting circle, nor takes a tap across it (the playtest\'s 100,760 among them)', turnRows.every((q) => q.frames >= 20 && q.hits === 0 && q.gap >= 4), JSON.stringify(turnRows));
check('(the control) while turning, the windows as drawn do sway: their targets would have moved with them', turnRows.some((q) => q.drawnMaxX - q.drawnMinX > 60), JSON.stringify(turnRows.map((q) => [q.drawnMinX, q.drawnMaxX])));
// A drag that starts on a window (the walking thumb landing on one) chooses nothing; a tap still does.
const sel0 = (await S()).slot;
const wd = await p.evaluate(() => window.ranch.slotScreen(1));
await touch('touchStart', [[wd.x, wd.y, 34]]);
for (let i = 1; i <= 12; i++) {
  await touch('touchMove', [[wd.x - Math.min(i, 6) * 6, wd.y - Math.min(i, 6) * 5, 34]]);
  await p.waitForTimeout(30);
}
await touch('touchEnd', []);
await p.waitForTimeout(250);
const selDrag = (await S()).slot;
await touch('touchStart', [[wd.x, wd.y, 35]]);
const selDown = await p.evaluate(() => window.ranch.sim.s.sel);
await p.waitForTimeout(90);
await touch('touchEnd', []);
await p.waitForTimeout(250);
const selTap = (await S()).slot;
check('a drag that starts on a window leaves the chosen window as it was; a tap chooses it only as the finger lifts', sel0 === 0 && selDrag === 0 && selDown === 0 && selTap === 1, `chosen ${sel0}, after the drag ${selDrag}, finger down ${selDown}, after the tap ${selTap}`);
await p.evaluate(() => { const r = window.ranch; const pl = r.sim.s.player; pl.x = -15.5; pl.z = 37.2; pl.y = r.sim.phys.floor(pl.x, pl.z); pl.yaw = -0.55; });
// The chosen window wears a ring, and every filled window an icon of what it holds (an empty one none).
await p.evaluate(() => { const sim = window.ranch.sim; const s = sim.s; for (const q of s.slots) { q.t = null; q.n = 0; } sim.stow('clover'); sim.stow('tuft-clover'); sim.stow('dewberry'); s.sel = 0; });
await p.waitForTimeout(300);
const marks = async () => p.evaluate(() => {
  const r = window.ranch;
  const ring = document.querySelector('.rh-slotsel');
  const rr = ring.getBoundingClientRect();
  const w = r.slotScreen(r.sim.s.sel);
  const icons = [...document.querySelectorAll('.rh-slotico')].map((e) => (e.classList.contains('on') ? e.getBoundingClientRect() : null));
  const near = (i) => { const q = r.slotScreen(i); const b = icons.find((c) => c && Math.hypot(c.x + c.width / 2 - q.x, c.y + c.height / 2 - q.y) < 4); return !!b; };
  return { on: ring.classList.contains('on'), off: Math.hypot(rr.x + rr.width / 2 - w.x, rr.y + rr.height / 2 - w.y), d: rr.width, icons: icons.filter(Boolean).length, filled: [0, 1, 2, 3].map(near) };
});
let mk = await marks();
check('the chosen window wears a cream ring, centred on it', mk.on && mk.off < 3 && mk.d >= 36, JSON.stringify(mk));
check('each filled window carries an icon, the empty one none', mk.icons === 3 && mk.filled.join() === 'true,true,true,false', JSON.stringify(mk.filled));
const w2 = await p.evaluate(() => window.ranch.slotScreen(2));
await touch('touchStart', [[w2.x, w2.y, 9]]);
await p.waitForTimeout(90);
await touch('touchEnd', []);
await p.waitForTimeout(250);
mk = await marks();
check('choosing another window moves the ring to it', (await S()).slot === 2 && mk.off < 3, `sel ${(await S()).slot}, ring off by ${mk.off.toFixed(1)}`);
// Blow: when the chosen window runs out, the next one that holds something is chosen; with nothing aboard it says so.
await p.evaluate(() => { const sim = window.ranch.sim; const s = sim.s; for (const q of s.slots) { q.t = null; q.n = 0; } s.slots[0] = { t: 'tuft-clover', n: 1 }; s.slots[2] = { t: 'clover', n: 1 }; s.sel = 0; const pl = s.player; pl.x = 0; pl.z = 30; pl.y = sim.phys.floor(0, 30); pl.yaw = 0; pl.pitch = 0.1; });
await p.waitForTimeout(200);
const blow = await box('.rt-puff');
const tapBlow = async (id) => { await touch('touchStart', [[blow.x, blow.y, id]]); await p.waitForTimeout(70); await touch('touchEnd', []); await p.waitForTimeout(400); };
await tapBlow(20);
const afterFluff = await p.evaluate(() => { const s = window.ranch.sim.s; return { sel: s.sel, slots: s.slots.map((q) => q.n) }; });
check('Blow sends the last fluff, and the window that still holds something is chosen', afterFluff.sel === 2 && afterFluff.slots[0] === 0, JSON.stringify(afterFluff));
await tapBlow(21);
const afterDowny = await p.evaluate(() => { const s = window.ranch.sim.s; return { left: s.slots[2].n, out: s.downies.filter((d) => !d.gone && d.tame && Math.hypot(d.x, d.z - 30) < 14).length }; });
check('the next tap of Blow blows the downy out (it did nothing in the playtest)', afterDowny.left === 0 && afterDowny.out >= 1, JSON.stringify(afterDowny));
await tapBlow(22);
const said = await p.evaluate(() => { const e = document.querySelector('.rh-say'); return e.classList.contains('on') ? e.textContent : ''; });
check('with nothing aboard, Blow says so', said === 'Nothing in the jar.', said);
// The zone's name comes up clear of the journal page.
await p.evaluate(() => { const h = window.ranch.hud; h.setLesson('Catch a downy out in Clover Meadow.', false); h.showZone('Clover Meadow'); });
await p.waitForTimeout(900);
const zp = await p.evaluate(() => { const a = document.querySelector('.rh-zone').getBoundingClientRect(); const b = document.querySelector('.rh-page').getBoundingClientRect(); return { zone: [a.left, a.top, a.right, a.bottom].map(Math.round), page: [b.left, b.top, b.right, b.bottom].map(Math.round), clear: a.top >= b.bottom || a.bottom <= b.top || a.left >= b.right || a.right <= b.left }; });
check("the zone's name sits clear of the journal page", zp.clear, JSON.stringify(zp));
await p.evaluate(() => window.ranch.hud.setLesson('', false));
// With the journal up, the stick still answers.
await p.evaluate(() => window.ranch.hud.showPage('Day 1', [{ text: 'Catch a clover downy.', done: false }, { text: 'Build a pen and blow a downy in.', done: false }], 30));
await p.waitForTimeout(700);
const pg = await box('.rh-page');
check('the journal sits clear of the stick', pg.b < 838 * 0.3, `page bottom ${Math.round(pg.b)}`);
const m0 = await S();
await drag(90, 700, 0, -60, 5);
await p.waitForTimeout(200);
const m1 = await S();
check('the stick walks with the journal up', Math.hypot(m1.x - m0.x, m1.z - m0.z) > 0.3);
await p.screenshot({ path: '/tmp/ranch-thumbs.png' });
await p.evaluate(() => window.ranch.hud.hidePage());

// The day's orders and the next goal on the journal page: three lines (two wrap), clear of the stick, the zone's name,
// the pause button, the coins and the shell corner.
await p.evaluate(() => {
  const r = window.ranch;
  const s = r.sim.s;
  s.hour = 7;
  s.gates.ridge = true;
  for (const [i, kind] of [[1, 'clover'], [2, 'ember']]) {
    s.pads[i].kind = 'pen';
    s.pads[i].ups = [];
    for (let k = 0; k < 6; k++) r.sim.spawn(kind, [6, 17, 28][i] + Math.cos(k) * 2, 26.5 + Math.sin(k) * 2, true);
  }
  r.sim.phys.setPads(s.pads);
  r.pads.sync(s.pads);
  s.goals = ['catch', 'pen', 'feed', 'sell'];
  r.sim.postOrders(true);
});
// (Any page of a goal just done goes first.)
await p.waitForTimeout(800);
await p.waitForFunction(() => !document.querySelector('.rh-page.up h4'), null, { timeout: 6000 });
await p.waitForTimeout(300);
const pageNow = () => p.evaluate(() => {
  const rect = (sel) => { const e = document.querySelector(sel); const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; };
  return { lines: [...document.querySelectorAll('.rh-page.up li span')].map((e) => e.textContent), page: rect('.rh-page'), pause: rect('.rt-pause'), coins: rect('.rh-coins'), offers: window.ranch.sim.offers().length, goal: window.ranch.sim.openGoals(1)[0].text };
});
const ow = await pageNow();
check('the morning\'s offers: the journal says they wait on the price board, then the next goal', ow.offers >= 2 && ow.lines.length === 2 && ow.lines[0] === 'Orders wait on the price board.' && ow.lines[1] === ow.goal, JSON.stringify(ow.lines));
// Taken at the board: one order, its tally on the journal.
await p.evaluate(() => window.ranch.sim.takeOrder(window.ranch.sim.offers().findIndex((o) => !o.live)));
await p.waitForTimeout(600);
const og = await pageNow();
const apart = (a, c) => a.r <= c.l || a.l >= c.r || a.b <= c.t || a.t >= c.b;
check('the order taken shows its tally on the journal, and the next goal', og.lines.length === 2 && /^(Clover|Ember) fluff( by noon| after 9 pm)?, 0 of \d+\.$/.test(og.lines[0]) && og.lines[1] === og.goal, JSON.stringify(og.lines));
check('with the order and the goal, the journal clears the stick, the pause button, the coins and the shell corner', og.page.b < 838 * 0.32 && apart(og.page, og.pause) && apart(og.page, og.coins) && !(og.page.l < 60 && og.page.t < 60), JSON.stringify(og));
await p.evaluate(() => window.ranch.hud.showZone('Ember Ridge'));
await p.waitForTimeout(700);
const oz = await p.evaluate(() => { const a = document.querySelector('.rh-zone').getBoundingClientRect(); const b = document.querySelector('.rh-page').getBoundingClientRect(); return { clear: a.top >= b.bottom || a.bottom <= b.top || a.left >= b.right || a.right <= b.left, zone: Math.round(a.top), page: Math.round(b.bottom) }; });
check("with the order and the goal up, the zone's name still sits clear of the journal page", oz.clear, JSON.stringify(oz));
await p.screenshot({ path: '/tmp/ranch-thumbs-orders.png' });
// The order lesson's page (when the first order is posted): clear of the pause button and the coins too.
await p.evaluate(() => { const r = window.ranch; const s = r.sim.s; s.learn = s.learn.filter((w) => w !== 'lesson:order'); s.learnCount['order:taken'] = 0; s.orders = []; r.sim.postOrders(true); const pl = s.player; pl.x = 0; pl.z = 30; pl.y = r.sim.phys.floor(0, 30); });
await p.waitForTimeout(800);
const ol = await p.evaluate(() => { const rect = (sel) => { const q = document.querySelector(sel).getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; }; return { line: window.ranch.seen().line, page: rect('.rh-page'), pause: rect('.rt-pause'), coins: rect('.rh-coins') }; });
check("the order lesson's line is up, its page clear of the pause button and the coins", ol.line === 'Take an order at the price board.' && apart(ol.page, ol.pause) && apart(ol.page, ol.coins) && ol.page.b < 838 * 0.32, JSON.stringify(ol));
await p.evaluate(() => { const s = window.ranch.sim.s; if (!s.learn.includes('lesson:order')) s.learn.push('lesson:order'); });
await p.waitForTimeout(1800);

// A wild downy let go of mid-tug gets away, with real touch on Pull; the note under the crosshair says so.
await p.evaluate(() => {
  const r = window.ranch;
  const s = r.sim.s;
  s.hour = 10;
  r.sim.wild = false;
  for (const q of s.slots) { q.t = null; q.n = 0; }
  const pl = s.player; pl.x = -16; pl.z = -2; pl.y = r.sim.phys.floor(-16, -2);
  const d = r.sim.spawn('clover', -16, -7.2, false);
  d.hunger = 0.2;
  d.hopT = 5;
  window.__wild = d;
  r.aimAt(d.x, d.y + 0.25, d.z);
});
const pullBtn = await box('.rt-draw');
await touch('touchStart', [[pullBtn.x, pullBtn.y, 23]]);
// (Round 10: pull until it is well under way, not for a fixed time: a puff-up holds the pull still, and a pull of
// 0.25 or less let go is only a short Pull, which leaves a wild downy where it is.)
let tugMax = 0;
for (let i = 0; i < 50 && tugMax <= 0.36; i++) {
  await p.evaluate(() => { const d = window.__wild; window.ranch.aimAt(d.x, d.y + 0.25, d.z); });
  await p.waitForTimeout(60);
  tugMax = Math.max(tugMax, await p.evaluate(() => window.__wild.tug));
}
await touch('touchEnd', []);
// (Round 7: a clover's let-go pull fades at 0.9 a second, so it gets away about 0.75 s later: wait for the note.
// Round 8: let go as it puffs up to pull back, it pulls back first, then bolts once left slack 1.3 s after.)
let got = null;
for (let i = 0; i < 60; i++) {
  got = await p.evaluate(() => { const d = window.__wild; const e = document.querySelector('.rh-say'); return { noPull: d.noPull, tame: d.tame, gone: d.gone, note: e.classList.contains('on') ? e.textContent : '' }; });
  if (got.note) break;
  await p.waitForTimeout(80);
}
// (Round 9: its first pull back may come early in a fight of beats, so it is let go a little nearer a third of the way in.)
check('let go mid-tug, a wild downy gets away: "It got away." and no second grab at once', tugMax > 0.3 && got.noPull > 0 && !got.tame && /^It got away\./.test(got.note), `tug ${tugMax.toFixed(2)} ${JSON.stringify(got)}`);

// Round 5: a brook digging in shows the time it has left on the tug ring (the fifth playtest's brooks dove after
// about 3 s with nothing to say so): an outer ring, shown only for a kind with a time, that shrinks as you pull.
await p.evaluate(() => {
  const r = window.ranch;
  const s = r.sim.s;
  s.hour = 10;
  s.gates.hollow = true;
  r.sim.phys.gates = { ...s.gates };
  for (const q of s.slots) { q.t = null; q.n = 0; }
  // Something in the jar, so the count by the crosshair is up beside the ring.
  s.slots[0] = { t: 'cloverhead', n: 6 };
  s.sel = 0;
  const pl = s.player; pl.x = 39; pl.z = 4; pl.y = r.sim.phys.floor(39, 4);
  const d = r.sim.spawn('brook', 43, 4, false);
  d.hunger = 0.2;
  d.hopT = 5;
  window.__wild = d;
  r.aimAt(d.x, d.y + 0.25, d.z);
});
await p.waitForTimeout(200);
await touch('touchStart', [[pullBtn.x, pullBtn.y, 24]]);
const ring = [];
let ringGeo = null;
let ringShot = null;
// (Round 8: the duel. Its time waits while it puffs up and pulls back, so this thumb lets go then and pulls again after.)
let pullDown = true;
// (Round 9: a brook's time is 5 s now and its fight two to four beats, so the thumb reads it for longer.)
for (let i = 0; i < 100 && ring.filter((q) => q.shown && q.left >= 0).length < 14; i++) {
  await p.evaluate(() => { const d = window.__wild; window.ranch.aimAt(d.x, d.y + 0.25, d.z); });
  await p.waitForTimeout(60);
  const st = await p.evaluate(() => { const c = document.querySelector('.rh-cross'); const l = c.querySelector('.x-left'); return { ...window.ranch.hud.tugState(), shown: c.classList.contains('timed') && getComputedStyle(l).display !== 'none', dash: parseFloat(l.style.strokeDashoffset || '0') }; });
  if ((st.tell || st.back) && pullDown) {
    await touch('touchEnd', [[pullBtn.x, pullBtn.y, 24]]);
    pullDown = false;
  } else if (!st.tell && !st.back && !pullDown) {
    await touch('touchStart', [[pullBtn.x, pullBtn.y, 24]]);
    pullDown = true;
  }
  // (Nor while it shivers on a fake puff: the crosshair is drawn a little bigger then.)
  if (st.tell || st.back || st.feint) continue;
  ring.push(st);
  // Mid-pull: how big the ring is, how far the count keeps from it, and a shot to read its contrast from.
  if (ring.length === 7 && ring[ring.length - 1].left >= 0) {
    ringGeo = await p.evaluate(() => {
      const c = document.querySelector('.rh-cross').getBoundingClientRect();
      const left = document.querySelector('.rh-cross .x-left');
      const ink = document.querySelector('.rh-cross .x-ink');
      const n = document.querySelector('.rh-count').getBoundingClientRect();
      const cx = c.left + c.width / 2;
      const cy = c.top + c.height / 2;
      const sw = parseFloat(getComputedStyle(left).strokeWidth) || 2;
      const iw = ink && getComputedStyle(ink).display !== 'none' ? parseFloat(getComputedStyle(ink).strokeWidth) || 0 : 0;
      // The box leaves the stroke out: its middle is the stroke's middle; the outer edge adds the wider stroke's half.
      const r0 = left.getBoundingClientRect().width / 2;
      const R = r0 + Math.max(sw, iw) / 2;
      const nx = Math.max(n.left, Math.min(cx, n.right));
      const ny = Math.max(n.top, Math.min(cy, n.bottom));
      return { cx, cy, r0, sw, across: 2 * R, gap: Math.hypot(nx - cx, ny - cy) - R, count: document.querySelector('.rh-count').textContent, left: window.ranch.hud.tugState().left };
    });
    ringShot = await p.screenshot();
  }
}
// (Round 9: a fight of beats may end this loop with the finger already up; CDP refuses a touchEnd with none down.)
if (pullDown) await touch('touchEnd', []);
await p.waitForTimeout(400);
const timed = ring.filter((q) => q.shown && q.left >= 0);
check("a brook digging in shows its time left on the tug ring, shrinking as you pull", timed.length >= 5 && timed[timed.length - 1].left < timed[0].left - 0.1 && timed[timed.length - 1].dash > timed[0].dash, JSON.stringify(timed.map((q) => q.left.toFixed(2))));
// Round 6: the time ring was a pale blue ring 37 px across on green grass, the count touching it. Read back from the
// shot along the drawn arc: the pale stroke against what lies just outside it (its ink track; grass before), and
// against the grass beyond. WCAG contrast of the median luminances.
let ringRead = null;
if (ringGeo && ringShot) {
  ringRead = await p.evaluate(async ([b64, g, dpr]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x2 = c.getContext('2d');
    x2.drawImage(img, 0, 0);
    const d = x2.getImageData(0, 0, c.width, c.height).data;
    const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const med = (r) => {
      const ls = [];
      for (let k = 0; k < 360 * g.left * 0.9; k += 2) {
        const a = ((k - 90) * Math.PI) / 180;
        const x = Math.round((g.cx + Math.cos(a) * r) * dpr);
        const y = Math.round((g.cy + Math.sin(a) * r) * dpr);
        const i = (y * c.width + x) * 4;
        ls.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
      }
      ls.sort((a, b) => a - b);
      return ls[Math.floor(ls.length / 2)];
    };
    const ct = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const ring = med(g.r0);
    const edge = med(g.r0 + g.sw / 2 + 1.1);
    const grass = med(g.across / 2 + 4);
    return { edge: +ct(ring, edge).toFixed(2), grass: +ct(ring, grass).toFixed(2) };
  }, [ringShot.toString('base64'), ringGeo, 2.625]);
}
check('the time ring reads on grass: 40 px or more across, its pale arc 6:1 or more against what is just outside it (it was 37 px and 2.6:1, grass behind it)', !!ringRead && ringGeo.across >= 40 && ringRead.edge >= 6, JSON.stringify({ ...ringGeo, ...ringRead }));
check('the count by the crosshair keeps 3 px or more clear of the time ring (it touched it, 0.4 px)', !!ringGeo && ringGeo.count !== '' && ringGeo.gap >= 3, JSON.stringify(ringGeo));
// A clover has no time: no outer ring.
await p.evaluate(() => {
  const r = window.ranch;
  const s = r.sim.s;
  for (const d of s.downies) if (!d.tame && !d.keep) d.gone = true;
  for (const q of s.slots) { q.t = null; q.n = 0; }
  const pl = s.player; pl.x = -16; pl.z = -2; pl.y = r.sim.phys.floor(-16, -2);
  const d = r.sim.spawn('clover', -16, -7.2, false);
  d.hopT = 5;
  window.__wild = d;
  r.aimAt(d.x, d.y + 0.25, d.z);
});
await p.waitForTimeout(200);
await touch('touchStart', [[pullBtn.x, pullBtn.y, 25]]);
let cloverRing = null;
for (let i = 0; i < 8; i++) {
  await p.evaluate(() => { const d = window.__wild; window.ranch.aimAt(d.x, d.y + 0.25, d.z); });
  await p.waitForTimeout(60);
  const q = await p.evaluate(() => ({ ...window.ranch.hud.tugState(), timed: document.querySelector('.rh-cross').classList.contains('timed') }));
  if (q.tug > 0) cloverRing = q;
}
await touch('touchEnd', []);
await p.waitForTimeout(400);
check('a clover digging in fills the tug ring with no time ring (it has no time)', !!cloverRing && cloverRing.left === -1 && !cloverRing.timed, JSON.stringify(cloverRing));
await p.evaluate(() => { const s = window.ranch.sim.s; for (const d of s.downies) if (!d.tame && !d.keep) d.gone = true; for (const q of s.slots) { q.t = null; q.n = 0; } });

// Round 9: the tell reads by day. The ninth playtest found its gold clear at night but faint against the cream arc
// by day. Now the whole ring turns a deep gold on a dark track: an ember pulled at noon on bright meadow grass, the
// game held the moment it puffs up (and again while it only pulls, for the plain arc), read back from the frame
// along the ring: the gold against its track (WCAG contrast), against the grass beyond, and its colour against the
// plain arc's (CIELAB distance). A control puts back round 8's tell (pale gold, no track) and must read worse.
const tellShots = {};
await p.evaluate(() => {
  const r = window.ranch;
  const s = r.sim.s;
  s.hour = 12;
  s.gates.ridge = true;
  r.sim.phys.gates = { ...s.gates };
  for (const d of s.downies) if (!d.tame && !d.keep) d.gone = true;
  for (const q of s.slots) { q.t = null; q.n = 0; }
  const pl = s.player; pl.x = -16; pl.z = -2; pl.y = r.sim.phys.floor(-16, -2);
  const d = r.sim.spawn('ember', -16, -7.4, false);
  d.hunger = 0.2;
  d.hopT = 9;
  window.__wild = d;
  r.aimAt(d.x, d.y + 0.25, d.z);
});
await p.waitForTimeout(250);
const tellGeo = async () => p.evaluate(() => {
  const c = document.querySelector('.rh-cross').getBoundingClientRect();
  const k = c.width / 48;
  return { cx: c.left + c.width / 2, cy: c.top + c.height / 2, k, tug: window.ranch.hud.tugState().tug };
});
for (const control of [false, true]) {
  if (control) await p.evaluate(() => { const st = document.createElement('style'); st.dataset.ctl = '1'; st.textContent = '.rh-cross .x-tugink { display: none !important; } .rh-cross.tug.tell .x-tug { stroke: #ffe7a0 !important; stroke-width: 3.6px !important; } .rh-cross.tug.tell { color: #fff0c4 !important; }'; document.head.append(st); });
  await p.evaluate(() => { const r = window.ranch; const d = window.__wild; d.tug = 0; d.strain = 0; d.back = 0; d.tell = 0; d.feint = 0; d.noPull = 0; d.x = -16; d.z = -7.4; r.frozen = false; });
  await touch('touchStart', [[pullBtn.x, pullBtn.y, 26]]);
  let gotTell = false;
  let gotPlain = false;
  for (let i = 0; i < 320 && !(gotTell && gotPlain); i++) {
    await p.evaluate(() => {
      const r = window.ranch;
      // (Caught, or off out of reach: another in its place.)
      let d = window.__wild;
      if (d.gone || Math.hypot(d.x + 16, d.z + 7.4) > 4) {
        d.gone = true;
        for (const q of r.sim.s.slots) { q.t = null; q.n = 0; }
        d = r.sim.spawn('ember', -16, -7.4, false);
        d.hunger = 0.2;
        d.hopT = 9;
        window.__wild = d;
      }
      d.noPull = 0;
      r.aimAt(d.x, d.y + 0.25, d.z);
    });
    await p.waitForTimeout(20);
    const st = await p.evaluate(() => window.ranch.hud.tugState());
    const want = !gotTell && st.tell ? 'tell' : !gotPlain && st.tug > 0.15 && !st.tell && !st.back && !st.feint ? 'plain' : '';
    if (!want || (control && want === 'plain')) continue;
    // Hold the game there, read the ring.
    await p.evaluate(() => { window.ranch.frozen = true; });
    await p.waitForTimeout(140);
    tellShots[`${control ? 'old ' : ''}${want}`] = { geo: await tellGeo(), shot: (await p.screenshot()).toString('base64') };
    await p.evaluate(() => { window.ranch.frozen = false; });
    if (want === 'tell') gotTell = true;
    else gotPlain = true;
    if (control) gotPlain = true;
  }
  await touch('touchEnd', []);
  await p.waitForTimeout(500);
}
const ringRead9 = {};
for (const [name, v] of Object.entries(tellShots)) {
  ringRead9[name] = await p.evaluate(async ([b64, g, dpr, plain]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x2 = c.getContext('2d');
    x2.drawImage(img, 0, 0);
    const d = x2.getImageData(0, 0, c.width, c.height).data;
    const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    // Along the ring (a plain arc only as far as it is filled), the median pixel by luminance.
    const at = (r, share) => {
      const px = [];
      for (let a = 0; a < 360 * share; a += 3) {
        const t = ((a - 90) * Math.PI) / 180;
        const x = Math.round((g.cx + Math.cos(t) * r) * dpr);
        const y = Math.round((g.cy + Math.sin(t) * r) * dpr);
        const i = (y * c.width + x) * 4;
        px.push([d[i], d[i + 1], d[i + 2]]);
      }
      const L = (q) => 0.2126 * lin(q[0]) + 0.7152 * lin(q[1]) + 0.0722 * lin(q[2]);
      px.sort((p1, p2) => L(p1) - L(p2));
      const m = px[Math.floor(px.length / 2)];
      return { rgb: m, L: L(m) };
    };
    const share = plain ? Math.max(0.2, Math.min(0.9, g.tug * 0.9)) : 0.95;
    const ring = at(13 * g.k, share);
    const track = at(16 * g.k, share);
    const grass = at(23 * g.k, 0.95);
    const ct = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return { ring: ring.rgb, track: ring && +ct(ring.L, track.L).toFixed(2), grass: +ct(ring.L, grass.L).toFixed(2) };
  }, [v.shot, v.geo, 2.625, name.endsWith('plain')]);
}
// CIELAB distance between two sRGB colours.
const lab = ([r, g, b]) => {
  const f = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))];
};
const dE = (a, b) => { const p1 = lab(a); const p2 = lab(b); return +Math.hypot(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]).toFixed(1); };
const T9 = ringRead9.tell;
const P9 = ringRead9.plain;
const O9 = ringRead9['old tell'];
const tellArc = T9 && P9 ? dE(T9.ring, P9.ring) : 0;
const oldArc = O9 && P9 ? dE(O9.ring, P9.ring) : 0;
check('round 9: by day the tell reads: the gold ring 4.5:1 or more against its track, and 30 or more (CIELAB) from the plain arc\'s colour', !!T9 && !!P9 && T9.track >= 4.5 && tellArc >= 30, JSON.stringify({ tell: T9, plain: P9, tellVsArc: tellArc }));
check('round 9: control, round 8\'s pale gold tell with no track, reads worse on the same grass (it must fail the bar)', !!O9 && (O9.track < 4.5 || oldArc < 30) && (oldArc < tellArc || O9.track < T9.track), JSON.stringify({ old: O9, oldVsArc: oldArc }));
await p.evaluate(() => { const s = window.ranch.sim.s; for (const d of s.downies) if (!d.tame && !d.keep) d.gone = true; window.ranch.frozen = false; document.querySelectorAll('style[data-ctl]').forEach((e) => e.remove()); });

// Round 9: the note under the crosshair sits on an ink backing ("12 sweetroots by the gate, to start them." was pale
// italic over bright grass). Its words against the backing laid over white (the worst grass): WCAG contrast.
const note9 = await p.evaluate(() => {
  const r = window.ranch;
  r.hud.note('A feeder of 12 sweetroots, to start them.', 4);
  const e = document.querySelector('.rh-say');
  const cs = getComputedStyle(e);
  const num = (v) => v.match(/[\d.]+/g).map(Number);
  const [fr, fg, fb] = num(cs.color);
  const bg = num(cs.backgroundColor);
  const a = bg[3] ?? 1;
  const over = [0, 1, 2].map((i) => bg[i] * a + 255 * (1 - a));
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const l1 = L([fr, fg, fb]);
  const l2 = L(over);
  return { text: e.textContent, alpha: a, italic: cs.fontStyle, contrast: +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2) };
});
check('round 9: the note under the crosshair sits on an ink backing, upright, its words 4.5:1 or more over the brightest grass', note9.alpha >= 0.6 && note9.italic !== 'italic' && note9.contrast >= 4.5, JSON.stringify(note9));

// Food chosen and aimed so a blow lands in a feeder's hopper: the crosshair marks the feeder.
const fm = await p.evaluate(() => {
  const r = window.ranch;
  const sim = r.sim;
  const s = sim.s;
  s.pads[1].ups = ['feeder'];
  s.pads[1].feeder = { t: null, n: 0 };
  sim.phys.setPads(s.pads);
  for (const q of s.slots) { q.t = null; q.n = 0; }
  s.slots[0] = { t: 'cloverhead', n: 5 };
  s.sel = 0;
  const hx = 17 + 4.4 * 0.72;
  const hz = 26.5 + 4.4 * 0.69;
  const pl = s.player; pl.x = hx + 1; pl.z = hz + 4.6; pl.y = sim.phys.floor(pl.x, pl.z);
  const hy = sim.phys.floor(hx, hz) + 1.55;
  for (let up = -0.4; up <= 1.6; up += 0.05) {
    r.aimAt(hx, hy + up, hz);
    if (sim.aimTarget(r.aim) === 'feeder') return up;
  }
  return null;
});
await p.waitForTimeout(300);
const fx = await p.evaluate(() => document.querySelector('.rh-cross').dataset.s);
check('with food chosen and a blow that would land in a feeder, the crosshair marks the feeder', fm !== null && fx === 'feeder', `${fm} ${fx}`);

// The count by the crosshair on its own ink backing, so world words never run into it: the backing's alpha,
// and the contrast of its number against it (readback of the count's box).
const cb = await p.evaluate(() => {
  const e = document.querySelector('.rh-count');
  const cs = getComputedStyle(e);
  const r = e.getBoundingClientRect();
  const m = cs.backgroundColor.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
  return { text: e.textContent, alpha: m ? Number(m[4] ?? 1) : 0, w: r.width, h: r.height, x: r.left, y: r.top, pad: parseFloat(cs.paddingLeft) };
});
check('the count by the crosshair sits on an ink backing (alpha 0.5 or more) with room round its number', cb.text !== '' && cb.alpha >= 0.5 && cb.pad >= 5 && cb.h >= 16, JSON.stringify(cb));
// Round 6: the count by the crosshair covered the sell crate's sign ("Sell fl2ff"). From the lane, 2 to 6 m off,
// every aim that shows the sell mark: the count's box against the sign plate's box on screen (the plate as
// props.ts sets it: 1 by 0.25 m, 0.62 m up the crate's lane side).
const signRows = [];
for (const dist of [2, 3, 4, 5, 6]) {
  signRows.push(await p.evaluate(async (dist) => {
    const r = window.ranch;
    const sim = r.sim;
    const s = sim.s;
    s.hour = 11;
    for (const q of s.slots) { q.t = null; q.n = 0; }
    s.slots[0] = { t: 'tuft-clover', n: 7, mix: Array(7).fill('tuft-clover') };
    s.sel = 0;
    const EX = -6.5;
    const EZ = 36.5;
    const pl = s.player;
    pl.x = EX;
    pl.z = EZ - 0.7 - dist;
    pl.y = sim.phys.floor(pl.x, pl.z);
    pl.vx = pl.vz = 0;
    const y0 = sim.phys.floor(EX, EZ);
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    let sells = 0;
    let over = 0;
    for (let dx = -0.3; dx <= 0.31; dx += 0.3) for (let y = 0; y <= 2.4; y += 0.08) {
      r.aimAt(EX + dx, y0 + y, EZ);
      await frame();
      if (document.querySelector('.rh-cross').dataset.s !== 'sell') continue;
      sells++;
      const pts = [[-0.5, -0.125], [0.5, -0.125], [0.5, 0.125], [-0.5, 0.125]].map(([a, b]) => r.project(EX + a, y0 + 0.62 + b, EZ - 0.775)).filter(Boolean);
      const n = document.querySelector('.rh-count').getBoundingClientRect();
      const ox = Math.min(n.right, Math.max(...pts.map((q) => q.x))) - Math.max(n.left, Math.min(...pts.map((q) => q.x)));
      const oy = Math.min(n.bottom, Math.max(...pts.map((q) => q.y))) - Math.max(n.top, Math.min(...pts.map((q) => q.y)));
      if (ox > 0 && oy > 0) over++;
    }
    for (const q of s.slots) { q.t = null; q.n = 0; }
    return { dist, sells, over };
  }, dist));
}
check('from 2 to 6 m, with the sell mark up, the count never lies over the crate\'s sign (it covered it on 17 to 21 aims of 90)', signRows.every((q) => q.sells >= 20 && q.over === 0), JSON.stringify(signRows));
// Round 6: the desktop journal page ran 13 px off the bottom of the window. With three lines on it, at 1280 by
// 800 and 1440 by 900, its box (rotation and all) sits inside the window with 8 px or more to spare.
const deskRows = [];
for (const [w, h] of [[1280, 800], [1440, 900]]) {
  const dctx = await b.newContext({ viewport: { width: w, height: h } });
  const dp = await dctx.newPage();
  await dp.goto(`${base}/?game=ranch&fresh&taught`);
  await dp.waitForFunction(() => window.ranch && window.ranch.frames > 8, null, { timeout: 30000 });
  await dp.evaluate(() => {
    const hud = window.ranch.hud;
    const set = hud.setGoal.bind(hud);
    const lines = ['Pull clover heads from the garden.', 'Clover fluff, 2 of 4.', 'Find the gold clover by the old oak.'].map((text) => ({ text, done: false }));
    hud.setGoal = () => set(lines);
  });
  await dp.waitForTimeout(1000);
  deskRows.push(await dp.evaluate(() => { const e = document.querySelector('.rh-page'); const r = e.getBoundingClientRect(); return { w: innerWidth, h: innerHeight, up: e.classList.contains('up'), lines: e.querySelectorAll('li').length, l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; }));
  await dctx.close();
}
check('desktop: the journal page with three lines sits inside the window, 8 px or more from every edge (it ran 13 px off the bottom)', deskRows.every((q) => q.up && q.lines === 3 && q.l >= 8 && q.t >= 8 && q.r <= q.w - 8 && q.b <= q.h - 8), JSON.stringify(deskRows));
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `THUMBS FAILED (${failed})` : 'THUMBS OK');
process.exit(failed ? 1 : 0);
