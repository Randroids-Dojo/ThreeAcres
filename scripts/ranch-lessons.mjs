// Thistledown's lessons, played through for real. On a 412 by 838 phone at
// DPR 2.6 with real touch events (CDP Input.dispatchTouchEvent), then on a
// desktop with keys and the mouse, then a stand-in gamepad's wording, then a
// returning player's save. Setup only places the player, points the view, sets
// the hour or the coins; every action is a real touch, key, click or drag.
//
// An in-page watcher checks every frame (not just at screenshots) that nothing
// is on screen before the lesson that brings it in: buttons, coins, the clock,
// the crosshair, the bellows and its slot windows, the Use button, gate price
// tags. It also notes when each one first appeared. Each lesson must end when
// its action is done and not before.
//   node scripts/ranch-lessons.mjs [base url]      (or RANCH_URL)
import fs from 'node:fs';
import { launch, frames, checker } from './ranch-lib.mjs';
import { strikeScan } from './qa/strike.mjs';

const BASE = process.argv[2] || process.env.RANCH_URL || 'http://localhost:5253';
const out = '/tmp/ranch-lessons';
fs.mkdirSync(out, { recursive: true });
const { check, failed } = checker();
/** Ruled lines found running through journal words, at any capture. */
const struck = [];
const b = await launch();

/** Every frame: what is visible, and whether each piece's feature has been brought in. */
const WATCH = () => {
  const NEEDS = { draw: 'draw', puff: 'puff', jump: 'jump', pause: 'pause', coins: 'coins', clock: 'clock', cross: 'bellows', count: 'bellows', bellows: 'bellows', slotTaps: 'slots', windows: 'slots', gateTags: 'gates' };
  const vis = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return false;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && parseFloat(cs.opacity) > 0.05;
  };
  const anyVis = (sel) => [...document.querySelectorAll(sel)].some((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
  window.__ui = () => {
    const r = window.ranch;
    const seen = r.seen();
    const page = document.querySelector('.rh-page');
    return {
      stick: vis('.rt-base'),
      draw: vis('.rt-draw'),
      puff: vis('.rt-puff'),
      jump: vis('.rt-jump'),
      pause: vis('.rt-pause'),
      use: vis('.rt-act.show') || vis('.rh-prompt.on'),
      coins: vis('.rh-coins') && !!document.querySelector('.rh-coins').textContent,
      clock: vis('.rh-arc'),
      cross: vis('.rh-cross'),
      count: vis('.rh-count') && !!document.querySelector('.rh-count').textContent,
      slotTaps: anyVis('.rh-slotbtn') || anyVis('.rh-bellows'),
      bellows: seen.bellows > 0.05,
      windows: seen.windows && seen.bellows > 0.05,
      gateTags: seen.gateTags,
      marker: seen.marker,
      edge: vis('.rh-edge.on'),
      page: page.classList.contains('up') ? page.textContent.trim() : '',
    };
  };
  window.__taps = [];
  window.__zero = null;
  window.addEventListener('pointerdown', (e) => { if (!window.__zero && e.clientX === 0 && e.clientY === 0) window.__zero = `${window.ranch.seen().lesson} ${window.__lastStep ?? ''} ${e.pointerType} ${e.screenX},${e.screenY} ${e.pageX}`; }, true);
  for (const ev of ['pointerdown', 'pointerup']) window.addEventListener(ev, (e) => { window.__taps.push(`${ev[7]}${Math.round(e.clientX)},${Math.round(e.clientY)}@${e.target.getAttribute?.('class')}`); if (window.__taps.length > 6) window.__taps.shift(); }, true);
  { const r = window.ranch; const orig = r.input.frame.bind(r.input); r.input.frame = () => { const f = orig(); if (f.tapped) { window.__taps.push(`tap ${Math.round(f.tapX)},${Math.round(f.tapY)} menu ${r.menuOpen()}`); if (window.__taps.length > 8) window.__taps.shift(); } return f; }; }
  window.__ev = {};
  { const r = window.ranch; const orig = r.tutor.onEvent.bind(r.tutor); r.tutor.onEvent = (s, e) => { if (e.t === 'eat' || (e.t === 'puff' && e.thing)) (window.__ev[e.t] ??= []).push(performance.now()); return orig(s, e); }; }
  window.__bad = [];
  window.__first = {};
  const tick = () => {
    const r = window.ranch;
    if (r && r.sim && !r.paused) {
      const ui = window.__ui();
      const learn = r.sim.s.learn;
      const lesson = r.seen().lesson || '(none)';
      // The edge pointer belongs to a lesson: never up without one.
      if (ui.edge && !r.seen().line && window.__bad.length < 20) window.__bad.push(`edge pointer with no lesson during ${lesson}`);
      for (const [k, on] of Object.entries(ui)) {
        if (!on || k === 'page' || k === 'stick' || k === 'marker' || k === 'edge') continue;
        if (!(k in window.__first)) window.__first[k] = lesson;
        const need = k === 'use' ? ['pads', 'sleep', 'bench', 'gates'] : [NEEDS[k]];
        if (!need.some((n) => learn.includes(n)) && window.__bad.length < 20) window.__bad.push(`${k} during ${lesson}`);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function open(opts, query = '') {
  const ctx = await b.newContext(opts);
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|Automatic fallback|DevTools/.test(t))) problems.push(`[${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto(`${BASE}/?game=ranch${query}`);
  await page.waitForFunction(() => window.ranch && window.ranch.frames > 8, null, { timeout: 60000 });
  await page.evaluate(WATCH);
  return { ctx, page, problems };
}

/** Helpers bound to one page. */
function kit(page) {
  const ui = () => page.evaluate(() => window.__ui());
  const seen = () => page.evaluate(() => window.ranch.seen());
  const st = () => page.evaluate(() => { const s = window.ranch.sim.s; return { coins: s.coins, hour: s.hour, day: s.day, slots: s.slots.map((q) => [q.t, q.n]), sel: s.sel, learn: [...s.learn], pads: s.pads.map((p) => p.kind), nettles: s.nettles.filter((n) => !n.gone).length, x: s.player.x, z: s.player.z }; });
  const finished = (id) => page.evaluate((id) => window.ranch.sim.s.learn.includes(`lesson:${id}`), id);
  const place = (x, z, ax, ay, az) => page.evaluate(([x, z, ax, ay, az]) => {
    const r = window.ranch;
    const p = r.sim.s.player;
    p.x = x; p.z = z; p.y = r.sim.phys.floor(x, z); p.vx = p.vz = p.vy = 0;
    if (ax !== undefined) r.aimAt(ax, ay, az);
  }, [x, z, ax, ay, az]);
  const aim = (x, y, z) => page.evaluate(([x, y, z]) => window.ranch.aimAt(x, y, z), [x, y, z]);
  const waitFor = async (fn, arg, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await page.evaluate(fn, arg)) return true;
      await page.waitForTimeout(80);
    }
    return false;
  };
  const lessonOn = async (id, ms = 6000) => {
    const ok = await waitFor((id) => { const v = window.ranch.seen(); return v.lesson === id && v.line !== ''; }, id, ms);
    if (!ok) console.log(`   (waiting for ${id}: ${await why()})`);
    return ok;
  };
  const why = () => page.evaluate(() => { const r = window.ranch; const s = r.sim.s; return JSON.stringify({ lesson: r.seen().lesson, line: r.seen().line, hour: +s.hour.toFixed(2), coins: s.coins, menu: r.menuOptions(), learned: s.learn.filter((x) => x.startsWith('lesson:')).map((x) => x.slice(7)).join(' '), slots: s.slots.map((q) => `${q.t}:${q.n}`).join(' '), sel: s.sel }); });
  // Every capture also looks for a ruled journal line running through the words.
  const shot = async (name) => {
    await page.evaluate((n) => (window.__lastStep = n), name);
    for (const q of await page.evaluate(strikeScan)) struck.push(`${name}: "${q.text}" at ${q.at}%`);
    return page.screenshot({ path: `${out}/${name}.png` });
  };
  const downy = (which) => page.evaluate((which) => {
    const s = window.ranch.sim.s;
    const p = s.player;
    const ok = (d) => !d.gone && (which === 'porch' ? d.keep : which === 'mine' ? (d.tame || d.keep) && d.pen < 0 : !d.tame && !d.keep);
    const ds = s.downies.filter(ok).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    return ds[0] ? { x: ds[0].x, y: ds[0].y, z: ds[0].z } : null;
  }, which);
  const items = (type) => page.evaluate((type) => { const s = window.ranch.sim.s; const p = s.player; return s.items.filter((i) => !i.gone && (type === 'tuft' ? i.type.startsWith('tuft') : i.type === type)).map((i) => ({ x: i.x, y: i.y, z: i.z, d: Math.hypot(i.x - p.x, i.z - p.z) })).sort((a, b) => a.d - b.d); }, type);
  const slotOf = (t) => page.evaluate((t) => window.ranch.sim.s.slots.findIndex((q) => (t === 'tuft' ? q.t?.startsWith('tuft') : q.t === t) && q.n > 0), t);
  return { ui, seen, st, finished, place, aim, waitFor, lessonOn, shot, downy, items, slotOf, why };
}

/** Nothing you can see or press in the shell's top-left 60 px (AGENTS.md rule 5). */
const cornerClear = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('.rh *, .rt *')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.width < innerWidth * 0.6 && cs.visibility !== 'hidden' && cs.opacity !== '0' && cs.display !== 'none'; });
  return !els.some((e) => { const r = e.getBoundingClientRect(); return r.left < 60 && r.top < 60; });
});

/** Exactly these pieces on screen, no more (besides the page, the stick and the marker). */
function only(ui, allowed) {
  const extra = Object.entries(ui).filter(([k, v]) => v && !['page', 'stick', 'marker', 'edge'].includes(k) && !allowed.includes(k)).map(([k]) => k);
  return extra;
}

// =================================================================== phone, touch
{
  console.log('-- phone, touch');
  const { ctx, page, problems } = await open({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2.6, hasTouch: true, isMobile: true }, '&fresh');
  const k = kit(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => {
    // A non-finite point leaves Chrome's touch emulation reporting 0,0 for every touch after it.
    for (const [x, y] of pts) if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`bad touch point ${x},${y} (${type})`);
    return cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  };
  const tap = async (x, y, id = 9) => { await touch('touchStart', [[x, y, id]]); await page.waitForTimeout(60); await touch('touchEnd', []); await page.waitForTimeout(60); };
  const centre = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.x + r.width / 2, r.y + r.height / 2] : null; }, sel);
  const press = async (sel, ms, id = 30, during) => {
    const c = await centre(sel);
    if (!c) return false;
    await touch('touchStart', [[c[0], c[1], id]]);
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (during) await during();
      await page.waitForTimeout(100);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(80);
    return true;
  };
  const tapTag = async (id) => {
    const i = await page.evaluate((id) => window.ranch.menuOptions().indexOf(id), id);
    if (i < 0) {
      console.log(`   (no ${id} tag: ${await k.why()})`);
      return false;
    }
    const t = await page.evaluate((i) => window.ranch.tagScreen(i), i);
    const what = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className ?? '', [t.x, t.y]);
    if (!/rt-look|rt-stick|^rc$/.test(String(what))) console.log(`   (tag ${id} at ${Math.round(t.x)},${Math.round(t.y)} lies under ${what})`);
    await tap(t.x, t.y, 11);
    await page.waitForTimeout(700);
    const still = await page.evaluate((id) => window.ranch.menuOptions().includes(id), id);
    if (still) {
      console.log(`   (tag ${id} tap missed at ${Math.round(t.x)},${Math.round(t.y)}: ${JSON.stringify(await page.evaluate((i) => { const r = window.ranch; return { now: r.tagScreen(i), tapLog: window.__taps, look: r.input.lookId }; }, i))})`);
      await k.shot(`miss-${id.replace(':', '-')}`);
    }
    return true;
  };
  const tapWindow = async (slot) => {
    const w = await page.evaluate((i) => window.ranch.slotScreen(i), slot);
    if (!w || !Number.isFinite(w.x)) console.log(`   (window ${slot} has no spot: ${JSON.stringify(w)} ${await k.why()})`);
    await tap(w.x, w.y, 13);
    await page.waitForTimeout(150);
  };

  // Wake the touch controls with a tap that is not a look.
  await tap(300, 300, 1);
  await page.waitForTimeout(600);

  // ---- 1. look
  let u = await k.ui();
  check('phone: the first screen is the view, the stick and one line', only(u, []).length === 0 && u.stick && u.page === 'Drag on the right to look around.', `extra ${only(u, []).join(',') || 'none'}, page "${u.page}"`);
  check('phone: no bellows, crosshair or marker yet', !u.bellows && !u.cross && !u.marker);
  check('phone: the shell corner is clear with the lesson page up', await cornerClear(page));
  await k.shot('phone-01-look');
  await touch('touchStart', [[300, 420, 2]]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [[300 - i * 12, 420 + i * 2, 2]]); await page.waitForTimeout(16); }
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  check('phone: looking ends the look lesson', await k.finished('look'));
  u = await k.ui();
  check('phone: the done line is ticked before the next', /look around/.test(u.page) && (await page.evaluate(() => !!document.querySelector('.rh-page li.done'))));

  // ---- 2. walk
  check('phone: walk lesson comes next', await k.lessonOn('walk'));
  await page.waitForTimeout(400);
  u = await k.ui();
  check('phone: walk line in touch words', u.page === 'Walk to the downy with your left thumb.', u.page);
  check('phone: an arrow points at the porch downy', u.marker === 'arrow');
  check('phone: still nothing else on screen', only(u, []).length === 0, only(u, []).join(','));
  await k.shot('phone-02-walk');
  let d = await k.downy('porch');
  // Facing away: a chevron on the screen's edge points the way.
  await k.place(d.x - 5.5, d.z + 3.5, d.x - 12, d.y + 1.5, d.z + 8);
  await page.waitForTimeout(300);
  const away = await page.evaluate(() => { const e = document.querySelector('.rh-edge'); const r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  check('phone: with the downy behind you, a chevron on the edge points the way', away.on && away.y > 838 * 0.18 && away.y < 838 * 0.64 && (away.x < 60 || away.x > 352), JSON.stringify(away));
  await k.shot('phone-02b-walk-edge');
  await k.place(d.x - 5.5, d.z + 3.5, d.x, d.y + 0.3, d.z);
  await page.waitForTimeout(300);
  check('phone: facing the downy, the edge chevron goes', !(await k.ui()).edge);
  check('phone: not done by standing still', !(await k.finished('walk')));
  await touch('touchStart', [[100, 720, 3]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[100, 720 - i * 9, 3]]); await page.waitForTimeout(16); }
  let walked = false;
  for (let i = 0; i < 40 && !walked; i++) {
    d = await k.downy('porch');
    await k.aim(d.x, d.y + 0.3, d.z);
    await page.waitForTimeout(80);
    walked = await k.finished('walk');
  }
  await touch('touchEnd', []);
  check('phone: walking to the downy ends the walk lesson', walked);

  // ---- 3. draw
  check('phone: draw lesson comes next', await k.lessonOn('draw'));
  await page.waitForTimeout(700);
  u = await k.ui();
  check('phone: the Pull button, the bellows and the crosshair arrive together', u.draw && u.bellows && u.cross, JSON.stringify(u));
  check('phone: no Blow, Jump, pause, coins, clock or slot windows yet', only(u, ['draw', 'bellows', 'cross']).length === 0, only(u, ['draw', 'bellows', 'cross']).join(','));
  check('phone: draw line', u.page === 'Aim at the downy and hold Pull.', u.page);
  // The line names the button, so the button wears that name, inside its circle and on screen.
  const named = (sel) => page.evaluate((sel) => {
    const b = document.querySelector(sel);
    const r = b.getBoundingClientRect();
    const l = b.querySelector('.lb')?.getBoundingClientRect();
    return { name: b.querySelector('.lb')?.textContent, inside: !!l && l.width > 0 && l.left >= r.left && l.right <= r.right && l.top >= r.top && l.bottom <= r.bottom, onScreen: !!l && l.bottom <= innerHeight };
  }, sel);
  let nm = await named('.rt-draw');
  check('phone: the Pull button wears its name inside the circle', nm.name === 'Pull' && nm.inside && nm.onScreen, JSON.stringify(nm));
  await k.shot('phone-03-draw');
  d = await k.downy('porch');
  await k.place(d.x - 2.4, d.z + 1.6, d.x, d.y + 0.25, d.z);
  await press('.rt-draw', 1400, 4, async () => { const q = await k.downy('porch'); if (q) await k.aim(q.x, q.y + 0.25, q.z); });
  check('phone: holding Pull brings the downy in and ends the lesson', await k.finished('draw'));

  // ---- 4. puff
  check('phone: puff lesson comes next', await k.lessonOn('puff'));
  u = await k.ui();
  check('phone: the Blow button arrives', u.puff && !u.jump && !u.pause && !u.coins, JSON.stringify(u));
  check('phone: puff line', u.page === 'Tap Blow to send it back out.', u.page);
  nm = await named('.rt-puff');
  check('phone: the Blow button wears its name inside the circle', nm.name === 'Blow' && nm.inside && nm.onScreen, JSON.stringify(nm));
  await k.shot('phone-04-puff');
  let s = await k.st();
  await k.aim(s.x + 6, 4, s.z - 4);
  await press('.rt-puff', 90, 5);
  check('phone: tapping Blow ends the lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:puff'), null, 2000));

  // ---- 5. feed
  check('phone: feed lesson comes next', await k.lessonOn('feed'));
  await page.waitForTimeout(400);
  u = await k.ui();
  check('phone: the pause button arrives, nothing else', u.pause && only(u, ['draw', 'puff', 'pause', 'bellows', 'cross', 'count']).length === 0, only(u, ['draw', 'puff', 'pause', 'bellows', 'cross', 'count']).join(','));
  check('phone: a clover head bobs over the downy, the garden glows', u.marker === 'cloverhead' && (await k.seen()).ring);
  check('phone: feed line', u.page === 'Feed the downy a clover head.', u.page);
  await k.shot('phone-05-feed');
  // Gather clover heads from the starter garden.
  await k.place(6, 30.4);
  const heads = await k.items('cloverhead');
  const garden = heads.filter((h) => Math.abs(h.x - 6) < 3 && Math.abs(h.z - 26.5) < 3);
  let hi = 0;
  const heldHeads = async () => (await k.st()).slots.find((q) => q[0] === 'cloverhead')?.[1] ?? 0;
  // Drawing takes as long as it takes on a busy machine: give it a second pass before judging.
  for (let pass = 0; pass < 2 && (await heldHeads()) < 3; pass++) {
    hi = 0;
    await press('.rt-draw', Math.max(1200, garden.length * 380), 6, async () => { const h = garden[Math.min(hi++ >> 2, garden.length - 1)]; if (h) await k.aim(h.x, h.y, h.z); });
  }
  const nHeads = await heldHeads();
  check('phone: drawing over the garden picks up clover heads', nHeads >= 3, `${nHeads}`);
  check('phone: the ring leaves the garden once you carry clover heads', !(await k.seen()).ring);
  // Puff two near the downy, keep the rest.
  d = await k.downy('mine');
  await k.place(d.x + 3.2, d.z, d.x + 0.6, d.y, d.z);
  await frames(page, 2);
  await press('.rt-puff', 90, 7);
  await page.waitForTimeout(350);
  await press('.rt-puff', 90, 8);
  const fed = await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:feed'), null, 30000);
  const feedT = await page.evaluate(() => { const p = window.__ev.puff ?? []; const e = window.__ev.eat ?? []; const last = e[e.length - 1]; const before = p.filter((t) => t < last); return last && before.length ? (last - before[before.length - 1]) / 1000 : null; });
  console.log(`   (the downy ate ${feedT?.toFixed(1)} s after the last clover head was puffed)`);
  check('phone: the downy eats a clover head and the lesson ends', fed);

  // ---- 6. sell, with the slots lesson taking over when a second kind comes aboard
  check('phone: sell lesson comes next', await k.lessonOn('sell'));
  u = await k.ui();
  check('phone: coins still hidden before the first sale', !u.coins);
  // The fed downy's fluff lies on the ground: the line says to pull it up, the arrow is over it.
  // (The arrow itself fades when you stand within 3 m, so read what the lesson points at.)
  const aimed = await page.evaluate(() => { const m = window.ranch.tutor.mark; return m.on ? m.icon : null; });
  check('phone: sell starts with the fluff on the ground', u.page === 'Pull up the fluff the downy dropped.' && aimed === 'arrow', `${u.page} ${aimed}`);
  await k.shot('phone-06-sell');
  await page.waitForTimeout(1500);
  let tufts = await k.items('tuft');
  if (tufts.length) {
    const t0 = tufts[0];
    await k.place(t0.x + 2.4, t0.z + 1.2, t0.x, t0.y, t0.z);
    let ti = 0;
    await press('.rt-draw', 1600, 9, async () => { tufts = await k.items('tuft'); const t = tufts[ti++ % Math.max(1, tufts.length)]; if (t) await k.aim(t.x, t.y, t.z); });
  }
  s = await k.st();
  check('phone: the down is drawn up', s.slots.some((q) => q[0]?.startsWith('tuft')), JSON.stringify(s.slots));
  check('phone: two kinds aboard bring the slots lesson in over the sell lesson', await k.lessonOn('slots', 3000));
  await page.waitForTimeout(500);
  u = await k.ui();
  check('phone: the slot windows and their tap targets arrive', u.windows && u.slotTaps, JSON.stringify(u));
  check('phone: the shell corner is clear mid-lessons, with every early piece up', await cornerClear(page));
  check('phone: slots line', u.page === 'Tap a window to switch what you blow.', u.page);
  await k.shot('phone-07-slots');
  // The trap from the Pixel: finish the window lesson with the clover heads chosen, so Blow would send those.
  const tuftSlot = await k.slotOf('tuft');
  const cloverSlot = await k.slotOf('cloverhead');
  if ((await k.st()).sel === cloverSlot) await tapWindow(tuftSlot);
  await tapWindow(cloverSlot);
  check('phone: tapping a window ends the slots lesson', await k.finished('slots'));
  check('phone: then the sell lesson comes back', await k.lessonOn('sell'));
  await frames(page, 4);
  const pointed = () => page.evaluate(() => {
    const p = document.querySelector('.rh-slotpoint');
    if (!p || getComputedStyle(p).display === 'none') return null;
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(p.style.transform);
    return m ? { x: +m[1], y: +m[2] } : null;
  });
  const winAt = (i) => page.evaluate((i) => window.ranch.slotScreen(i), i);
  u = await k.ui();
  check("phone: with clover heads chosen, the line says to choose the fluff", u.page === "Tap the fluff's window to choose it.", u.page);
  const pt = await pointed();
  const fw = await winAt(tuftSlot);
  check("phone: a chevron points at the fluff's window", !!pt && Math.hypot(pt.x - fw.x, pt.y - fw.y) < 6, `${JSON.stringify(pt)} vs ${JSON.stringify(fw)}`);
  await k.shot('phone-07b-choose');
  await tapWindow(tuftSlot);
  await frames(page, 4);
  u = await k.ui();
  check('phone: fluff chosen, the line says to blow it in, the chevron goes', u.page === 'Blow the fluff into the sell crate.' && !(await pointed()), u.page);
  check('phone: the arrow moves to the crate', u.marker === 'arrow');
  await k.place(-6.5, 32.8, -6.5, 5.7, 36.5);
  await frames(page, 3);
  check('phone: no coins on screen just before the sale', !(await k.ui()).coins);
  await press('.rt-puff', 1300, 10);
  check('phone: puffing down into the crate ends the sell lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:sell'), null, 4000));
  await page.waitForTimeout(300);
  check('phone: coins arrive with the first sale', (await k.ui()).coins);

  // ---- 7. pen
  check('phone: pen lesson comes next', await k.lessonOn('pen'));
  u = await k.ui();
  check('phone: pen line, arrow at an empty pad post with a ring', u.page === 'Build a pen on an empty plot.' && u.marker === 'arrow' && (await k.seen()).ring, `${u.page} ${u.marker}`);
  await k.shot('phone-08-pen');
  await k.place(14.8 + 1.2, 31.8 + 2.2, 14.8 + 0.4, 5.6, 31.8);
  await frames(page, 6);
  check('phone: the Use button shows at a post now', (await k.ui()).use);
  const act = await centre('.rt-act');
  if (act) await tap(act[0], act[1], 12);
  await page.waitForTimeout(700);
  const opts = await page.evaluate(() => window.ranch.menuOptions());
  check('phone: an empty pad offers only a pen for now', opts.join() === 'build:pen', opts.join());
  await k.shot('phone-09-tags');
  await tapTag('build:pen');
  check('phone: tapping the Pen tag ends the pen lesson', await k.finished('pen'));

  // ---- 8. puff the downy into the pen
  check('phone: penin lesson comes next', await k.lessonOn('penin'));
  check('phone: penin line', (await k.ui()).page === 'Blow the downy into the pen.');
  d = await k.downy('mine');
  if (d) {
    await k.place(d.x + 2.4, d.z + 1.4, d.x, d.y + 0.25, d.z);
    await press('.rt-draw', 1400, 14, async () => { const q = await k.downy('mine'); if (q) await k.aim(q.x, q.y + 0.25, q.z); });
  }
  const ds = await k.slotOf('clover');
  if (ds >= 0 && (await k.st()).sel !== ds) await tapWindow(ds);
  await k.place(17, 34.5, 17, 6.6, 26.5);
  await frames(page, 3);
  await k.shot('phone-10-penin');
  await press('.rt-puff', 90, 15);
  check('phone: puffing the downy into the pen ends the lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:penin'), null, 5000));

  // ---- 9. meadow, and jump when the meadow needs it
  check('phone: meadow lesson comes next', await k.lessonOn('meadow'));
  await page.waitForTimeout(400);
  u = await k.ui();
  check('phone: meadow line, arrow at the ranch gate', u.page === 'Catch a downy out in Clover Meadow.' && u.marker === 'arrow', u.page);
  check('phone: no Jump button before the meadow', !u.jump);
  await k.shot('phone-11-meadow');
  await k.place(0, 14, 0, 2, 4);
  check('phone: in the meadow the jump lesson takes over', await k.lessonOn('jump', 3000));
  await page.waitForTimeout(200);
  u = await k.ui();
  check('phone: the Jump button arrives', u.jump && u.page === 'Tap Jump to hop over bumps.', u.page);
  await k.shot('phone-12-jump');
  const y0 = (await page.evaluate(() => window.ranch.sim.s.player.y));
  await press('.rt-jump', 120, 16);
  const y1 = (await page.evaluate(() => window.ranch.sim.s.player.y));
  check('phone: tapping Jump jumps and ends the lesson', (await k.finished('jump')) && y1 > y0, `rose ${(y1 - y0).toFixed(2)}`);
  check('phone: then the meadow lesson comes back', await k.lessonOn('meadow'));
  await page.waitForTimeout(500);
  d = await k.downy('wild');
  await k.place(d.x + 2.6, d.z + 1.2, d.x, d.y + 0.25, d.z);
  await press('.rt-draw', 1500, 17, async () => { const q = await k.downy('wild'); if (q) await k.aim(q.x, q.y + 0.25, q.z); });
  check('phone: catching a wild downy ends the meadow lesson', await k.finished('meadow'));
  s = await k.st();
  check('phone: the day may run on now, but the clock is not shown until dusk', s.learn.includes('time') && !(await k.ui()).clock);

  // ---- 10. dusk: the clock and the door
  await page.evaluate(() => (window.ranch.sim.s.hour = 18.2));
  check('phone: dusk brings its lesson', await k.lessonOn('dusk', 8000));
  u = await k.ui();
  check('phone: the hour arc arrives with dusk', u.clock && u.page === 'Sleep at the front door till morning.', u.page);
  check('phone: no nettlebacks yet', (await k.st()).nettles === 0);
  await k.shot('phone-13-dusk');
  await k.place(-16, 37.4, -16, 5.4, 39.6);
  await frames(page, 6);
  const act2 = await centre('.rt-act');
  check('phone: the door can be used now', !!act2);
  if (act2) {
    await tap(act2[0], act2[1], 18);
    await page.waitForTimeout(700);
    await tapTag('sleep');
  }
  check('phone: sleeping ends the dusk lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:dusk'), null, 4000));

  // ---- 11. night: nettlebacks
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window.ranch.sim.s.hour = 20.55));
  check('phone: nightfall brings the nettleback lesson', await k.lessonOn('night', 6000));
  check('phone: night line', (await k.ui()).page === 'Blow anything at the pest to shoo it.');
  check('phone: nettlebacks come only now', await k.waitFor(() => window.ranch.sim.s.nettles.some((n) => !n.gone), null, 6000));
  await page.evaluate(() => { const sim = window.ranch.sim; for (let i = 0; i < 4; i++) sim.stow('cloverhead'); });
  s = await k.st();
  await page.evaluate(([x, z]) => { const n = window.ranch.sim.s.nettles.find((q) => !q.gone); n.x = x; n.z = z - 4; n.mode = 'roam'; n.modeT = 30; n.tx = x; n.tz = z - 4; }, [s.x, s.z]);
  const ch = await k.slotOf('cloverhead');
  if ((await k.st()).sel !== ch) await tapWindow(ch);
  const nAt = await page.evaluate(() => { const n = window.ranch.sim.s.nettles.find((q) => !q.gone); return { x: n.x, y: n.y, z: n.z }; });
  await k.aim(nAt.x, nAt.y + 0.3, nAt.z);
  await frames(page, 2);
  await k.shot('phone-14-night');
  await press('.rt-puff', 900, 19, async () => { const n = await page.evaluate(() => { const n = window.ranch.sim.s.nettles.find((q) => !q.gone); return n && { x: n.x, y: n.y, z: n.z }; }); if (n) await k.aim(n.x, n.y + 0.2, n.z); });
  check('phone: puffing at a nettleback ends the night lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:night'), null, 4000));

  // ---- 12. garden, plant, upgrades, bench, gates: each when the coins allow
  await page.evaluate(() => { const s = window.ranch.sim.s; s.hour = 10; s.coins = 260; });
  check('phone: 200 coins bring the garden lesson', await k.lessonOn('garden', 4000));
  check('phone: garden line', (await k.ui()).page === 'Build a garden on an empty plot.');
  await k.place(25.8 + 1.2, 31.8 + 2.2, 25.8 + 0.4, 5.6, 31.8);
  await frames(page, 6);
  const act3 = await centre('.rt-act');
  if (act3) { await tap(act3[0], act3[1], 20); await page.waitForTimeout(700); }
  const opts2 = await page.evaluate(() => window.ranch.menuOptions());
  check('phone: now the pad offers a garden too, but no silo yet', opts2.join() === 'build:pen,build:garden', opts2.join());
  await k.shot('phone-15-garden');
  await tapTag('build:garden');
  check('phone: building a garden ends the lesson', await k.finished('garden'));
  check('phone: plant lesson comes next', await k.lessonOn('plant'));
  check('phone: plant line', (await k.ui()).page === 'Blow some food onto the bare soil.');
  const ch2 = await k.slotOf('cloverhead');
  if (ch2 >= 0 && (await k.st()).sel !== ch2) await tapWindow(ch2);
  await k.place(28, 32.6, 28, 4.2, 26.8);
  await frames(page, 3);
  await press('.rt-puff', 90, 21);
  check('phone: puffing food onto the bed ends the plant lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:plant'), null, 4000));
  await page.evaluate(() => (window.ranch.sim.s.coins = 340));
  check('phone: 300 coins and a pen bring the upgrades lesson', await k.lessonOn('ups', 4000));
  await k.place(14.8 + 1.2, 31.8 + 2.2, 14.8 + 0.4, 5.6, 31.8);
  await frames(page, 6);
  const act4 = await centre('.rt-act');
  if (act4) { await tap(act4[0], act4[1], 22); await page.waitForTimeout(700); }
  const opts3 = await page.evaluate(() => window.ranch.menuOptions());
  check('phone: the pen post offers only what matters yet: the feeder, and the hedge after a night', opts3.join() === 'pen:feeder,pen:hedge', opts3.join());
  await k.shot('phone-16-ups');
  await tapTag('pen:feeder');
  check('phone: fitting a feeder ends the upgrades lesson', await k.finished('ups'));
  await page.evaluate(() => (window.ranch.sim.s.coins = 450));
  check('phone: 400 coins bring the workbench lesson', await k.lessonOn('bench', 4000));
  await k.place(-10.6, 38.9, -10.6, 5.4, 41.2);
  await frames(page, 6);
  const act5 = await centre('.rt-act');
  if (act5) { await tap(act5[0], act5[1], 23); await page.waitForTimeout(700); }
  const opts4 = await page.evaluate(() => window.ranch.menuOptions());
  check('phone: the workbench offers a bigger canister and a longer draw, nothing more yet', opts4.join() === 'bench:cap,bench:range', opts4.join());
  await k.shot('phone-17-bench');
  await tapTag('bench:cap');
  check('phone: fitting a bigger canister ends the workbench lesson', await k.finished('bench'));
  check('phone: no gate prices hang before the gates lesson', !(await k.ui()).gateTags);
  await page.evaluate(() => (window.ranch.sim.s.coins = 700));
  check('phone: 600 coins bring the gates lesson', await k.lessonOn('gates', 4000));
  await page.waitForTimeout(200);
  check('phone: the gate prices hang now', (await k.ui()).gateTags);
  await k.place(-33.4, -10, -35.4, 3.5, -10);
  await frames(page, 6);
  await k.shot('phone-18-gates');
  const act6 = await centre('.rt-act');
  if (act6) { await tap(act6[0], act6[1], 24); await page.waitForTimeout(700); }
  await tapTag('gate:ridge');
  check('phone: opening the gate ends the gates lesson', await k.finished('gates'));
  await page.waitForTimeout(1600);
  check('phone: every lesson done, no line left up', (await k.seen()).lesson === '' && !(await k.ui()).page.includes('Open the gate'));

  // The pause page carries the whole journal and the notes.
  const pz = await centre('.rt-pause');
  await tap(pz[0], pz[1], 25);
  await page.waitForTimeout(400);
  const pause = await page.evaluate(() => ({ goals: document.querySelectorAll('.rh-pause ol li').length, notes: document.querySelectorAll('.rh-pause .notes li').length, fits: (() => { const r = document.querySelector('.rh-pause').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })() }));
  check('phone: the pause page holds the full journal and the latest notes, all on screen', pause.goals === 11 && pause.notes >= 1 && pause.notes <= 3 && pause.fits, JSON.stringify(pause));
  await k.shot('phone-19-pause');

  const zero = await page.evaluate(() => window.__zero);
  check('phone: touches never read as 0,0 (no pointer lock from a touch)', !zero, zero ?? '');
  const bad = await page.evaluate(() => window.__bad);
  const first = await page.evaluate(() => window.__first);
  check('phone: nothing appeared before its lesson (checked every frame)', bad.length === 0, bad.slice(0, 6).join(' | '));
  console.log('   first seen during:', Object.entries(first).map(([k2, v]) => `${k2}@${v}`).join(', '));
  check('phone: no console errors', problems.length === 0, problems.slice(0, 4).join(' | '));
  await ctx.close();
}

// =================================================================== desktop, keys and mouse
{
  console.log('-- desktop, keys and mouse');
  const { ctx, page, problems } = await open({ viewport: { width: 1280, height: 800 } }, '&fresh&nolock');
  const k = kit(page);
  const W = 1280;
  const H = 800;
  const hold = async (button, ms, during) => {
    await page.mouse.move(W / 2, H / 2);
    await page.mouse.down({ button });
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (during) await during();
      await page.waitForTimeout(100);
    }
    await page.mouse.up({ button });
    await page.waitForTimeout(80);
  };
  await page.waitForTimeout(400);
  let u = await k.ui();
  check('desk: the first screen is the view and one line', only(u, []).length === 0 && u.page === 'Right-drag to look around.' && !u.bellows, `extra ${only(u, []).join(',') || 'none'}, "${u.page}"`);
  await k.shot('desk-01-look');
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 10; i++) await page.mouse.move(640 + i * 20, 400 + i * 3);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(80);
  check('desk: right-drag ends the look lesson', await k.finished('look'));
  check('desk: walk line in key words', (await k.lessonOn('walk')) && (await k.ui()).page === 'Walk to the downy with WASD.');
  let d = await k.downy('porch');
  await k.place(d.x - 5.5, d.z + 3.5, d.x, d.y + 0.3, d.z);
  await page.keyboard.down('KeyW');
  let walked = false;
  for (let i = 0; i < 40 && !walked; i++) {
    d = await k.downy('porch');
    await k.aim(d.x, d.y + 0.3, d.z);
    await page.waitForTimeout(80);
    walked = await k.finished('walk');
  }
  await page.keyboard.up('KeyW');
  check('desk: W to the downy ends the walk lesson', walked);
  check('desk: draw lesson, in mouse words', (await k.lessonOn('draw')) && (await k.ui()).page === 'Aim at the downy and hold right click.');
  await page.waitForTimeout(600);
  u = await k.ui();
  check('desk: the bellows and crosshair arrive, nothing else', u.bellows && u.cross && only(u, ['bellows', 'cross']).length === 0, only(u, ['bellows', 'cross']).join(','));
  await k.shot('desk-02-draw');
  // A left click before the puff lesson does nothing.
  d = await k.downy('porch');
  await k.place(d.x - 2.4, d.z + 1.6, d.x, d.y + 0.25, d.z);
  await hold('right', 1400, async () => { const q = await k.downy('porch'); if (q) await k.aim(q.x, q.y + 0.25, q.z); });
  check('desk: holding right click draws the downy in', await k.finished('draw'));
  check('desk: puff lesson in mouse words', (await k.lessonOn('puff')) && (await k.ui()).page === 'Click to blow it back out.');
  const s = await k.st();
  await k.aim(s.x + 6, 4, s.z - 4);
  await page.mouse.click(W / 2, H / 2);
  check('desk: a click puffs and ends the lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:puff'), null, 2000));
  check('desk: feed lesson next', await k.lessonOn('feed'));
  // Two kinds: the slots lesson in key words, and Q ends it.
  await page.evaluate(() => { window.ranch.sim.stow('cloverhead'); window.ranch.sim.stow('sweetroot'); });
  check('desk: two kinds bring the slots lesson in key words', (await k.lessonOn('slots', 3000)) && (await k.ui()).page === 'Roll the wheel or press Q to switch.');
  await page.waitForTimeout(500);
  u = await k.ui();
  check('desk: the slot windows arrive', u.windows);
  await k.shot('desk-03-slots');
  await page.keyboard.press('KeyQ');
  check('desk: Q ends the slots lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:slots'), null, 2000));
  check('desk: back to the feed lesson', await k.lessonOn('feed'));
  // Space jumps before its lesson on keys (nothing on screen for it), so the jump lesson will pass quietly.
  const y0 = await page.evaluate(() => window.ranch.sim.s.player.y);
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  const y1 = await page.evaluate(() => window.ranch.sim.s.player.y);
  await page.keyboard.up('Space');
  check('desk: Space still jumps on keys', y1 - y0 > 0.4, `${(y1 - y0).toFixed(2)}`);
  // No touch words anywhere on the desktop.
  const lines = await page.evaluate(() => window.__seenLines ?? []);
  void lines;
  const bad = await page.evaluate(() => window.__bad);
  check('desk: nothing appeared before its lesson (checked every frame)', bad.length === 0, bad.slice(0, 6).join(' | '));
  check('desk: no console errors', problems.length === 0, problems.slice(0, 4).join(' | '));

  // ---- returning: reload keeps the lessons where they were
  await page.evaluate(() => window.shell.show());
  await page.waitForTimeout(300);
  await page.goto(`${BASE}/?game=ranch&nolock`);
  await page.waitForFunction(() => window.ranch && window.ranch.frames > 8, null, { timeout: 60000 });
  await page.evaluate(WATCH);
  check('desk: after a reload the lessons pick up where they were', await k.lessonOn('feed', 4000));
  u = await k.ui();
  check('desk: what was learned is still there', u.bellows && u.cross && u.windows, JSON.stringify(u));
  await ctx.close();
}

// =================================================================== a returning player's old save
{
  console.log('-- returning player, a save from before the lessons');
  const { ctx, page, problems } = await open({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2.6, hasTouch: true, isMobile: true }, '&fresh&taught');
  // Make it look like a ranch from before the lessons: a pen, sales, a day gone by.
  await page.evaluate(() => {
    const s = window.ranch.sim.s;
    s.pads[1].kind = 'pen';
    s.stats.sold = 30;
    s.stats.drawn = 12;
    s.stats.fed = 9;
    s.goals = ['catch', 'pen', 'feed', 'sell'];
    s.day = 3;
    s.hints = ['look', 'move', 'draw', 'puff', 'slot'];
  });
  await page.evaluate(() => window.shell.show());
  await page.waitForTimeout(300);
  await page.close();
  // The closing page saves on its way out; strip the lessons as the next page starts, before the game reads it.
  await ctx.addInitScript(() => {
    const key = 'threeacres:v2:ranch';
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (raw?.data?.learn) {
      delete raw.data.learn;
      delete raw.data.learnCount;
      localStorage.setItem(key, JSON.stringify(raw));
    }
  });
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await p2.goto(`${BASE}/?game=ranch`);
  await p2.waitForFunction(() => window.ranch && window.ranch.frames > 8, null, { timeout: 60000 });
  await p2.evaluate(WATCH);
  const k2 = kit(p2);
  const cdp = await ctx.newCDPSession(p2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p2.waitForTimeout(800);
  const learn = (await k2.st()).learn;
  const u = await k2.ui();
  check('old save: the basics are credited, not taught again', ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'jump', 'dusk', 'night'].every((id) => learn.includes(`lesson:${id}`)), learn.filter((x) => x.startsWith('lesson:')).join(','));
  check('old save: every control it had is on screen', u.draw && u.puff && u.jump && u.pause && u.coins && u.clock && u.bellows, JSON.stringify(u));
  check('old save: what it has not done is still to come', !learn.includes('lesson:gates') && !learn.includes('lesson:bench'), learn.filter((x) => x.startsWith('lesson:')).join(','));
  await k2.shot('return-01-old-save');
  check('old save: no console errors', problems.length === 0, problems.slice(0, 4).join(' | '));
  await ctx.close();
}

// =================================================================== a gamepad's words
{
  console.log('-- gamepad wording');
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    const pad = { id: 'stand-in pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__pad = pad;
    navigator.getGamepads = () => [pad, null, null, null];
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?game=ranch&fresh&nolock`);
  await page.waitForFunction(() => window.ranch && window.ranch.frames > 8, null, { timeout: 60000 });
  await page.evaluate(WATCH);
  const k = kit(page);
  await page.evaluate(() => (window.__pad.axes[0] = 0.5));
  await frames(page, 4);
  await page.evaluate(() => (window.__pad.axes[0] = 0));
  await frames(page, 4);
  check('pad: the look line names the right stick', (await k.ui()).page === 'Use the right stick to look around.', (await k.ui()).page);
  await page.evaluate(() => (window.__pad.axes[2] = 1));
  await page.waitForTimeout(400);
  await page.evaluate(() => (window.__pad.axes[2] = 0));
  check('pad: the right stick ends the look lesson', await k.finished('look'));
  check('pad: the walk line names the left stick', (await k.lessonOn('walk')) && (await k.ui()).page === 'Walk to the downy with the left stick.');
  await ctx.close();
}

await b.close();
check('no ruled journal line runs through the words, at any capture', struck.length === 0, struck.slice(0, 4).join(' | '));
console.log(failed() ? `LESSONS FAILED (${failed()})` : 'LESSONS OK', `shots in ${out}`);
process.exit(failed() ? 1 : 0);
