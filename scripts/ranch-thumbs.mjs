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
// From the third playtest: the journal page holding the day's orders and the
// next goal (three lines) still clears the stick, the zone's name, the pause
// button and the shell corner; so does the order lesson's page; a wild downy
// let go of mid-tug gets away (and the crosshair note says so), with real
// touch on Pull; and with food chosen the crosshair marks a feeder it would
// land in.
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
const og = await p.evaluate(() => {
  const rect = (sel) => { const e = document.querySelector(sel); const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; };
  return { lines: [...document.querySelectorAll('.rh-page.up li span')].map((e) => e.textContent), page: rect('.rh-page'), pause: rect('.rt-pause'), coins: rect('.rh-coins'), orders: window.ranch.sim.s.orders.length, goal: window.ranch.sim.openGoals(1)[0].text };
});
const apart = (a, c) => a.r <= c.l || a.l >= c.r || a.b <= c.t || a.t >= c.b;
check('the journal shows the day\'s orders with their tally, and the next goal', og.orders === 2 && og.lines.length === 3 && /^Clover fluff, 0 of \d+\.$/.test(og.lines.find((l) => l.startsWith('Clover')) ?? '') && /^Ember fluff, 0 of \d+\.$/.test(og.lines.find((l) => l.startsWith('Ember')) ?? '') && og.lines[2] === og.goal, JSON.stringify(og.lines));
check('with three lines, the journal clears the stick, the pause button, the coins and the shell corner', og.page.b < 838 * 0.32 && apart(og.page, og.pause) && apart(og.page, og.coins) && !(og.page.l < 60 && og.page.t < 60), JSON.stringify(og));
await p.evaluate(() => window.ranch.hud.showZone('Ember Ridge'));
await p.waitForTimeout(700);
const oz = await p.evaluate(() => { const a = document.querySelector('.rh-zone').getBoundingClientRect(); const b = document.querySelector('.rh-page').getBoundingClientRect(); return { clear: a.top >= b.bottom || a.bottom <= b.top || a.left >= b.right || a.right <= b.left, zone: Math.round(a.top), page: Math.round(b.bottom) }; });
check("with three lines, the zone's name still sits clear of the journal page", oz.clear, JSON.stringify(oz));
await p.screenshot({ path: '/tmp/ranch-thumbs-orders.png' });
// The order lesson's page (when the first order is posted): clear of the pause button and the coins too.
await p.evaluate(() => { const s = window.ranch.sim.s; s.learn = s.learn.filter((w) => w !== 'lesson:order'); s.learnCount.order = 0; s.learnCount['order:read'] = 0; const pl = s.player; pl.x = 0; pl.z = 30; pl.y = window.ranch.sim.phys.floor(0, 30); });
await p.waitForTimeout(800);
const ol = await p.evaluate(() => { const rect = (sel) => { const q = document.querySelector(sel).getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; }; return { line: window.ranch.seen().line, page: rect('.rh-page'), pause: rect('.rt-pause'), coins: rect('.rh-coins') }; });
check("the order lesson's line is up, its page clear of the pause button and the coins", ol.line === "Fill today's order on the price board." && apart(ol.page, ol.pause) && apart(ol.page, ol.coins) && ol.page.b < 838 * 0.32, JSON.stringify(ol));
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
let tugMax = 0;
for (let i = 0; i < 9; i++) {
  await p.evaluate(() => { const d = window.__wild; window.ranch.aimAt(d.x, d.y + 0.25, d.z); });
  await p.waitForTimeout(60);
  tugMax = Math.max(tugMax, await p.evaluate(() => window.__wild.tug));
}
await touch('touchEnd', []);
await p.waitForTimeout(500);
const got = await p.evaluate(() => { const d = window.__wild; const e = document.querySelector('.rh-say'); return { noPull: d.noPull, tame: d.tame, gone: d.gone, note: e.classList.contains('on') ? e.textContent : '' }; });
check('let go mid-tug, a wild downy gets away: "It got away." and no second grab at once', tugMax > 0.35 && got.noPull > 0 && !got.tame && got.note === 'It got away.', `tug ${tugMax.toFixed(2)} ${JSON.stringify(got)}`);

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
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `THUMBS FAILED (${failed})` : 'THUMBS OK');
process.exit(failed ? 1 : 0);
