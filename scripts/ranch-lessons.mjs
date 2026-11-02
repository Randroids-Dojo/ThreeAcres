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
//
// From the second playtest: the first downy's hunger waits with the held clock
// through the meadow lesson; a lesson's own tag is chosen when its post's tags
// come down (and nothing else is); a new feeder is filled in its own lesson; a
// downy that hops out of its pen brings a line and an arrow; a night lesson
// slept through comes back the next night; a gate goal counts the coins.
//
// From the third playtest: the loop lesson says to pen a fresh catch; the
// first order brings its lesson (pointing at the price board, which chalks it
// up), the journal keeps its tally, and filling it reads "Earned"; the pen
// limit is taught at eight, the post's count tag saying it in the world; a
// thistle behind a low fence brings the high fence line with its tag chosen;
// the thistle goal gives its clue by day and points at the ridge top at dusk;
// the pause page shows only the goals done and the one you are on; on keys, Q
// skips empty windows.
//
// From the fourth playtest: the pen lesson points at the plot beside the
// starter garden (where a feed run reaches); the pen-in line says to pull the
// downy in first while it is loose; the first order is on the board the moment
// the loop lesson ends, and is taken at the board with one tap (a lone tag
// comes down chosen, the sleep tag too); the pen limit line stays up until you
// have stood by the post's count; a thistle in the jar brings the high fence
// line before it is penned; and on a desktop whose browser refuses pointer
// lock, the look line falls back to right-drag after the first click.
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
      // The lesson's own line when one is up (an open order's tally sits under it, round 6), else the page's words.
      page: page.classList.contains('up') ? (page.querySelector('li.lesson-line span')?.textContent ?? page.textContent.trim()) : '',
    };
  };
  // The calm lines on the page with a lesson's line (an open order's tally, or the order leading the stray line).
  window.__calm = () => [...document.querySelectorAll('.rh-page.up li.calm span')].map((e) => e.textContent);
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
      // The edge pointer belongs to a lesson (or a journal goal with a place, a gate): never up without one.
      if (ui.edge && !r.seen().line && !r.seen().goalSpot && window.__bad.length < 20) window.__bad.push(`edge pointer with no lesson during ${lesson}`);
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
if (!process.env.EVENING) {
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
  /**
   * Hold Pull, reading the tug (round 7; round 8 the duel): when the ring shows the downy puffing up (or a pull back
   * seen without it), lift the finger a moment later, and press again once its pull back stops. Returns the pull
   * backs seen and every lesson line that came up meanwhile.
   */
  const pullReading = async (ms, id, during, until) => {
    const c = await centre('.rt-draw');
    if (!c) return { backs: 0, lines: [], warm: false };
    let down = true;
    let backs = 0;
    let warm = false;
    let sawBack = false;
    const lines = [];
    await touch('touchStart', [[c[0], c[1], id]]);
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (during) await during();
      const q = await page.evaluate(() => { const t = window.ranch.hud.tugState(); return { back: t.back, tell: t.tell, line: window.ranch.seen().line, warm: document.querySelector('.rh-cross').classList.contains('back') }; });
      if (q.line && !lines.includes(q.line)) lines.push(q.line);
      warm ||= q.warm;
      if (q.back && !sawBack) backs++;
      sawBack = q.back;
      if (down && (q.tell || q.back)) {
        await page.waitForTimeout(q.back ? 60 : 200);
        await touch('touchEnd', [[c[0], c[1], id]]);
        down = false;
      } else if (!down && !q.back && !q.tell) {
        await page.waitForTimeout(150);
        await touch('touchStart', [[c[0], c[1], id]]);
        down = true;
      }
      if (until && (await until())) break;
      await page.waitForTimeout(60);
    }
    if (down) await touch('touchEnd', [[c[0], c[1], id]]);
    await page.waitForTimeout(80);
    return { backs, lines, warm };
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
    // (A tag no lesson teaches is chosen by the first tap and taken by a second: not a miss.)
    const nowChosen = await page.evaluate((id) => { const r = window.ranch; const c = r.tagChoice(); return c.hot >= 0 && r.menuOptions()[c.hot] === id; }, id);
    if (still && !nowChosen) {
      console.log(`   (tag ${id} tap missed at ${Math.round(t.x)},${Math.round(t.y)}: ${JSON.stringify(await page.evaluate((i) => { const r = window.ranch; return { now: r.tagScreen(i), tapLog: window.__taps, look: r.input.lookId }; }, i))})`);
      await k.shot(`miss-${id.replace(':', '-')}`);
    }
    return true;
  };
  /** A tag a lesson is not teaching: the first tap chooses it, the second takes it. */
  const takeTag = async (id) => {
    await tapTag(id);
    if (await page.evaluate((id) => window.ranch.menuOptions().includes(id), id)) await tapTag(id);
  };
  /** What the tags came down with: the chosen one's id (or null) and the Use button's word. */
  const chosen = () => page.evaluate(() => { const r = window.ranch; const c = r.tagChoice(); return { id: c.hot >= 0 ? r.menuOptions()[c.hot] : null, label: document.querySelector('.rt-act').textContent }; });
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
  // (The arrow itself fades when you stand within 3 m, and the downy hops about near there: read what the lesson points at.)
  const atPorch = await page.evaluate(() => { const m = window.ranch.tutor.mark; const d = window.ranch.sim.s.downies.find((q) => q.keep && !q.gone); return m.on && m.icon === 'arrow' && Math.hypot(m.x - d.x, m.z - d.z) < 0.3; });
  check('phone: an arrow points at the porch downy', atPorch);
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
  // No clover heads aboard: the line says where they are, and an arrow and a ring mark the garden.
  check('phone: feed starts by sending you to the garden', u.page === 'Pull clover heads from the garden.', u.page);
  const toGarden = await page.evaluate(() => { const m = window.ranch.tutor.mark; return m.on && m.icon === 'arrow' && Math.abs(m.x - 6) < 0.5 && Math.abs(m.z - 26.5) < 0.5 && m.r > 0; });
  check('phone: an arrow and a ring on the garden', toGarden && (await k.seen()).ring);
  const hunger0 = await page.evaluate(() => Math.max(...window.ranch.sim.s.downies.filter((d) => !d.gone && (d.tame || d.keep)).map((d) => d.hunger)));
  check("phone: the downy's hunger waited for this lesson: hungry, not starving", hunger0 > 0.5 && hunger0 <= 0.8, hunger0.toFixed(2));
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
  await page.waitForTimeout(500);
  u = await k.ui();
  check('phone: with clover heads aboard, the line says to feed the downy, a clover head over it', u.page === 'Feed the downy a clover head.' && u.marker === 'cloverhead', `${u.page} ${u.marker}`);
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
  check('phone: the fed downy sheds fluff', await k.waitFor(() => window.ranch.sim.s.items.some((i) => !i.gone && i.type.startsWith('tuft') && i.by > 0), null, 4000));

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
  // A stepped line moves on once the new step has lasted a moment (so a one-frame step never shows).
  await page.waitForTimeout(400);
  u = await k.ui();
  check('phone: fluff chosen, the line says to blow it in, the chevron goes', u.page === 'Blow the fluff into the sell crate.' && !(await pointed()), u.page);
  const onCrate = await page.evaluate(() => { const m = window.ranch.tutor.mark; return m.on && m.icon === 'arrow' && Math.abs(m.x - -6.5) < 0.5 && Math.abs(m.z - 36.5) < 0.5; });
  check('phone: the arrow moves to the crate', onCrate);
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
  check('phone: pen line says what to tap, arrow at an empty pad post with a ring', u.page === 'Tap Post at an empty plot, then Pen.' && u.marker === 'arrow' && (await k.seen()).ring, `${u.page} ${u.marker}`);
  const penAt = await page.evaluate(() => { const m = window.ranch.tutor.mark; return { post: Math.hypot(m.x - (14.8 + 0.9), m.z - 31.8), ring: Math.hypot(m.rx - 17, m.rz - 26.5) }; });
  check('phone: the pen lesson points at the plot beside the starter garden, where a feed run reaches (it pointed across the lane)', penAt.post < 0.3 && penAt.ring < 0.1, JSON.stringify(penAt));
  await k.shot('phone-08-pen');
  await k.place(14.8 + 1.2, 31.8 + 2.2, 14.8 + 0.4, 5.6, 31.8);
  await frames(page, 6);
  check('phone: the Use button shows at a post now', (await k.ui()).use);
  // Round 7: it sits with the thumb buttons (above Jump), clear of the view's middle (it sat at y 588 over the world).
  const useAt = await page.evaluate(() => { const r = document.querySelector('.rt-act').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; });
  check('phone: the Use button sits by the thumb buttons on the right, clear of the middle of the view', useAt.l > useAt.w * 0.66 && useAt.t > useAt.h * 0.55 && useAt.r <= useAt.w, JSON.stringify(useAt));
  const act = await centre('.rt-act');
  if (act) await tap(act[0], act[1], 12);
  await page.waitForTimeout(700);
  const opts = await page.evaluate(() => window.ranch.menuOptions());
  check('phone: an empty pad offers only a pen for now', opts.join() === 'build:pen', opts.join());
  let pick = await chosen();
  check('phone: the pen lesson\'s tag comes down chosen, and Use says Buy', pick.id === 'build:pen' && pick.label === 'Buy', JSON.stringify(pick));
  await k.shot('phone-09-tags');
  await tapTag('build:pen');
  check('phone: tapping the Pen tag ends the pen lesson', await k.finished('pen'));

  // ---- 8. puff the downy into the pen
  check('phone: penin lesson comes next', await k.lessonOn('penin'));
  // With the downy in the jar, the line says to blow it into the pen; blown out beside you, loose, it says to
  // pull it in first (the fourth playtest's line skipped that step), the arrow on it.
  const pinAboard = await page.evaluate(() => window.ranch.sim.s.slots.some((q) => q.t === 'clover' && q.n > 0));
  if (pinAboard) {
    check('phone: penin line, with the downy in the jar: "Blow the downy into the pen."', (await k.ui()).page === 'Blow the downy into the pen.', (await k.ui()).page);
    const cw0 = await k.slotOf('clover');
    if ((await k.st()).sel !== cw0) await tapWindow(cw0);
    await k.place(-2, 40, -2, 4.6, 44);
    await frames(page, 3);
    await press('.rt-puff', 90, 33);
    await page.waitForTimeout(1500);
  }
  d = await k.downy('mine');
  const pinPull = await page.evaluate(() => { const r = window.ranch; const s = r.sim.s; const d = s.downies.find((q) => !q.gone && (q.tame || q.keep) && q.pen < 0); const m = r.tutor.mark; return { line: r.seen().line, at: d && m.on ? Math.hypot(m.x - d.x, m.z - d.z) : -1 }; });
  check('phone: penin line, with the downy loose: "Pull in the downy." with the arrow on it', !!d && pinPull.line === 'Pull in the downy.' && pinPull.at >= 0 && pinPull.at < 0.4, JSON.stringify(pinPull));
  if (d) {
    await k.place(d.x + 2.4, d.z + 1.4, d.x, d.y + 0.25, d.z);
    await press('.rt-draw', 1400, 14, async () => { const q = await k.downy('mine'); if (q) await k.aim(q.x, q.y + 0.25, q.z); });
  }
  await page.waitForTimeout(400);
  check('phone: pulled in, the penin line says to blow it into the pen', (await k.ui()).page === 'Blow the downy into the pen.', (await k.ui()).page);
  const ds = await k.slotOf('clover');
  if (ds >= 0 && (await k.st()).sel !== ds) await tapWindow(ds);
  await k.place(17, 34.5, 17, 6.6, 26.5);
  await frames(page, 3);
  await k.shot('phone-10-penin');
  await press('.rt-puff', 90, 15);
  check('phone: puffing the downy into the pen ends the lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:penin'), null, 5000));

  // ---- 9. meadow, and jump when the meadow needs it
  check('phone: meadow lesson comes next', await k.lessonOn('meadow'));
  // The second playtest: the clock held at half past four, but the penned downy starved and ran off.
  // Five game minutes of the held afternoon, stepped without drawing.
  await page.evaluate(() => (window.ranch.sim.s.hour = 16.5));
  const held0 = await page.evaluate(() => { const d = window.ranch.sim.s.downies.find((q) => !q.gone && q.pen >= 0); return d && { hunger: d.hunger, pen: d.pen }; });
  await page.evaluate(() => window.ranch.step(300, 1 / 20));
  const held1 = await page.evaluate(() => { const r = window.ranch; const s = r.sim.s; const d = s.downies.find((q) => !q.gone && q.tame && q.pen >= 0); return { hunger: d?.hunger ?? -1, pen: d?.pen ?? -1, hour: s.hour, lesson: r.seen().lesson, mood: d?.mood }; });
  check('phone: five minutes into the held afternoon the penned downy is no hungrier, calm and still penned', !!held0 && held1.pen === held0.pen && held1.hunger <= held0.hunger + 0.01 && held1.mood !== 'frazzled' && Math.abs(held1.hour - 16.5) < 0.01 && held1.lesson === 'meadow', `${JSON.stringify(held0)} -> ${JSON.stringify(held1)}`);
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
  nm = await named('.rt-jump');
  check('phone: the Jump button wears its name inside the circle', nm.name === 'Jump' && nm.inside && nm.onScreen, JSON.stringify(nm));
  await k.shot('phone-12-jump');
  const y0 = (await page.evaluate(() => window.ranch.sim.s.player.y));
  await press('.rt-jump', 120, 16);
  const y1 = (await page.evaluate(() => window.ranch.sim.s.player.y));
  check('phone: tapping Jump jumps and ends the lesson', (await k.finished('jump')) && y1 > y0, `rose ${(y1 - y0).toFixed(2)}`);
  check('phone: then the meadow lesson comes back', await k.lessonOn('meadow'));
  await page.waitForTimeout(500);
  // Round 5: a wild downy that has seen you brings the running line (the fifth playtest never learned to sprint:
  // walking stayed 8 m off a fleeing clover). Push the stick to its rim and you run; the line ticks.
  d = await k.downy('wild');
  await k.place(d.x + 7.5, d.z + 2.5, d.x, d.y + 0.25, d.z);
  check('phone: a wild downy that has seen you brings the running line', await k.lessonOn('run', 3000), await k.why());
  await page.waitForTimeout(300);
  u = await k.ui();
  const runMark = await page.evaluate(() => { const r = window.ranch; const m = r.tutor.mark; return m.on && r.sim.s.downies.some((q) => !q.gone && !q.tame && !q.keep && q.alert && Math.hypot(m.x - q.x, m.z - q.z) < 0.6); });
  check('phone: "Push the stick to its rim to run.", the arrow on the downy that saw you', u.page === 'Push the stick to its rim to run.' && runMark, `${u.page} ${runMark}`);
  await k.shot('phone-12r-run');
  await touch('touchStart', [[100, 720, 44]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[100, 720 - i * 8, 44]]); await page.waitForTimeout(16); }
  const ran = await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:run'), null, 4000);
  await touch('touchEnd', []);
  check('phone: running with the stick at its rim ends the running lesson', ran, await k.why());
  check('phone: then the meadow lesson comes back again', await k.lessonOn('meadow', 3000));
  await page.waitForTimeout(500);
  d = await k.downy('wild');
  await k.place(d.x + 4.6, d.z + 2.2, d.x, d.y + 0.25, d.z);
  // A wild one digs in: a short Pull does not take it, a steady one does (the crosshair's ring fills meanwhile).
  let ringSeen = false;
  await press('.rt-draw', 450, 17, async () => { const q = await k.downy('wild'); if (q) await k.aim(q.x, q.y + 0.25, q.z); ringSeen ||= await page.evaluate(() => document.querySelector('.rh-cross').classList.contains('tug')); });
  check('phone: a short Pull does not take a wild downy', !(await k.finished('meadow')));
  check('phone: the crosshair shows the tug', ringSeen);
  // It has seen you (wild downies notice you further off than Pull reaches) and hops away: close in again, then hold it.
  d = await k.downy('wild');
  const noticed = await page.evaluate(() => { const s = window.ranch.sim.s; return s.downies.some((q) => !q.gone && !q.tame && !q.keep && q.alert); });
  check('phone: the wild downy noticed you', noticed);
  await k.place(d.x + 4.2, d.z + 2, d.x, d.y + 0.25, d.z);
  // Round 7: the tug is a skill. The first time a wild one pulls back, its line comes up (in touch words, with the
  // button's word) and the ring goes warm; it waits for you to let go, then a steady Pull between its pulls brings it in.
  const meadowPull = await pullReading(12000, 17, async () => { const q = await k.downy('wild'); if (q) await k.aim(q.x, q.y + 0.25, q.z); }, () => k.finished('meadow'));
  check('phone: the first pull back brings the tug line, in touch words: "Let go of Pull when it pulls back."', meadowPull.lines.includes('Let go of Pull when it pulls back.'), JSON.stringify(meadowPull));
  check('phone: the ring goes warm while it pulls back', meadowPull.warm, JSON.stringify(meadowPull));
  // (Round 8: once the tug is learned a wild one can get away, a duel, so a thumb that lost it walks up to the
  // nearest and pulls again, as a player would; the first pull back and its line are the checks above.)
  for (let again = 0; again < 3 && !(await k.finished('meadow')); again++) {
    const q = await k.downy('wild');
    if (!q) break;
    await page.waitForTimeout(1700);
    await k.place(q.x + 4.2, q.z + 2, q.x, q.y + 0.25, q.z);
    await pullReading(12000, 17, async () => { const w = await k.downy('wild'); if (w) await k.aim(w.x, w.y + 0.25, w.z); }, () => k.finished('meadow'));
  }
  check('phone: letting go through its pull and pulling again catches the wild downy, ending the meadow lesson and the tug line', (await k.finished('meadow')) && (await k.finished('ease')), await k.why());
  s = await k.st();
  // Round 5: hunger runs again, but the afternoon stays at half past four through the loop lesson (the fifth
  // playtest's loop ran from 16:30 through the pests to 2:40 am, and the sleep line lapsed both nights).
  check('phone: after the meadow, hunger runs but the clock holds at half past four, not shown', s.learn.includes('appetite') && !s.learn.includes('time') && Math.abs(s.hour - 16.5) < 0.01 && !(await k.ui()).clock, `${s.hour} ${s.learn.includes('time')}`);

  // ---- 9b. the loop: right after the meadow, so the journal is never blank while coins build up
  check('phone: the loop lesson comes straight after the meadow', await k.lessonOn('farm', 4000));
  // The third playtest: with the fresh catch in the jar, the loop said to catch another. Now it says to pen it.
  await page.waitForTimeout(450);
  u = await k.ui();
  const penStep = await page.evaluate(() => { const m = window.ranch.tutor.mark; return m.on && Math.hypot(m.x - 17, m.z - 26.5) < 0.5; });
  check('phone: with the fresh catch aboard, the loop says to blow it into a pen, the arrow on the pen', u.page === 'Blow the downy into a pen.' && penStep, u.page);
  await k.shot('phone-12a-penit');
  const cw = await k.slotOf('clover');
  if (cw >= 0 && (await k.st()).sel !== cw) await tapWindow(cw);
  await k.place(17, 34.5, 17, 6.6, 26.5);
  await frames(page, 3);
  await press('.rt-puff', 90, 34);
  check('phone: blown into the pen, nothing is left aboard to pen', await k.waitFor(() => !window.ranch.sim.s.slots.some((q) => (q.t === 'clover') && q.n > 0) && window.ranch.sim.s.downies.filter((d) => !d.gone && d.pen === 1).length >= 2, null, 5000), await k.why());
  // A downy of yours gets hungry: it shows the food it wants, and the line says what to do about it.
  // (Fluff comes first in the loop, so clear any picked up in the meadow to look at the feeding step.)
  await page.evaluate(() => {
    const s = window.ranch.sim.s;
    for (const q of s.slots) if (q.t && q.t.startsWith('tuft-')) { q.t = null; q.n = 0; }
    for (const it of s.items) if (it.type.startsWith('tuft-')) it.gone = true;
    for (const d of s.downies) if (!d.gone && (d.tame || d.keep)) d.hunger = 0.8;
  });
  await page.waitForTimeout(450);
  u = await k.ui();
  check('phone: a hungry downy brings a feeding line', /^(Feed the hungry downy its favourite food\.|Pull up food for the hungry downy\.)$/.test(u.page), u.page);
  // Every hungry downy of yours in the open shows its food: its own sign, or the lesson's marker standing in for it.
  const want = await page.evaluate(() => {
    const r = window.ranch;
    const hungry = r.sim.s.downies.filter((d) => !d.gone && (d.tame || d.keep) && d.drawn === 0 && d.hunger > 0.5).length;
    const signs = Object.values(r.creatures.wants).reduce((a, m) => a + m.count, 0);
    const marker = r.tutor.mark.on && r.tutor.mark.icon !== 'arrow' ? 1 : 0;
    return { hungry, signs, marker };
  });
  check('phone: hungry downies show the food they want', want.hungry >= 1 && want.signs + want.marker === want.hungry, JSON.stringify(want));
  await k.shot('phone-12b-farm');

  // ---- a downy of yours over the fence: a line and an arrow on it, then back into the pen
  await page.evaluate(() => { const r = window.ranch; const s = r.sim.s; for (const d of s.downies) if (!d.gone && (d.tame || d.keep)) d.hunger = 0.1; const d = s.downies.find((q) => !q.gone && q.tame && q.pen === 1); d.x = 17 + 4.4 + 1.6; d.z = 26.5; d.y = r.sim.phys.floor(d.x, d.z); d.vx = d.vy = d.vz = 0; d.grounded = true; d.hopT = 3; });
  check('phone: a downy out of its pen brings a line', await k.lessonOn('stray', 3000));
  u = await k.ui();
  const onStray = await page.evaluate(() => { const r = window.ranch; const m = r.tutor.mark; const d = r.sim.s.downies.find((q) => !q.gone && q.strayFrom >= 0 && q.pen < 0); return !!d && m.on && m.icon === 'arrow' && Math.hypot(m.x - d.x, m.z - d.z) < 0.6; });
  check('phone: "Pull in the downy that got out.", the arrow on it', u.page === 'Pull in the downy that got out.' && onStray, u.page);
  await k.shot('phone-12c-stray');
  const sd = await page.evaluate(() => { const d = window.ranch.sim.s.downies.find((q) => !q.gone && q.strayFrom >= 0); return { x: d.x, y: d.y, z: d.z }; });
  await k.place(sd.x + 2.2, sd.z + 2.6, sd.x, sd.y + 0.25, sd.z);
  await press('.rt-draw', 1400, 31, async () => { const q = await page.evaluate(() => { const d = window.ranch.sim.s.downies.find((q) => !q.gone && q.strayFrom >= 0); return d && { x: d.x, y: d.y, z: d.z }; }); if (q) await k.aim(q.x, q.y + 0.25, q.z); });
  await page.waitForTimeout(400);
  u = await k.ui();
  check('phone: pulled in, the line says to blow it back into the pen', u.page === 'Blow the downy into the pen.', u.page);
  const cs = await k.slotOf('clover');
  if (cs >= 0 && (await k.st()).sel !== cs) await tapWindow(cs);
  await k.place(17, 34.5, 17, 6.6, 26.5);
  await frames(page, 3);
  const penMark = await page.evaluate(() => document.querySelector('.rh-cross').dataset.s);
  check('phone: aimed at the pen with a downy chosen, the crosshair shows it would land in the pen', penMark === 'pen', penMark);
  await press('.rt-puff', 90, 32);
  check('phone: blown back into its pen, the stray line ticks and goes', await k.waitFor(() => { const r = window.ranch; return r.seen().lesson !== 'stray' && r.sim.s.downies.some((d) => !d.gone && d.tame && d.pen === 1); }, null, 6000), await k.why());

  // ---- 9c. the loop's end, before dusk: three whole turns of the loop finish it (plain sales do not count), and
  // all the while the afternoon has held at half past four.
  await page.evaluate(() => { const s = window.ranch.sim.s; s.coins = 100; for (const d of s.downies) d.hunger = 0; });
  check('phone: through the loop lesson the clock still holds at half past four', await page.evaluate(() => { const r = window.ranch; return r.seen().lesson === 'farm' && Math.abs(r.sim.s.hour - 16.5) < 0.01 && r.sim.s.day === 1; }), await k.why());
  await page.evaluate(() => { const s = window.ranch.sim.s; s.learnCount.sell = (s.learnCount.sell ?? 0) + 6; s.learnCount['sell:blown'] = (s.learnCount['sell:blown'] ?? 0) + 6; });
  await page.waitForTimeout(600);
  check('phone: six plain sales do not finish the loop lesson', (await k.seen()).lesson === 'farm');
  await page.evaluate(() => { const s = window.ranch.sim.s; s.learnCount.cycle = (s.learnCount.cycle ?? 0) + 3; });
  check('phone: three turns of the loop finish it', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:farm'), null, 3000), JSON.stringify(await page.evaluate(() => { const s = window.ranch.sim.s; return { from: s.learnCount['farm:from'], cycle: s.learnCount.cycle, now: window.ranch.tutor.current }; })));
  // ---- the day's orders: the first is on the board the moment the loop lesson ends (the fourth playtest's
  // came the next dawn), and its lesson takes the page, pointing at the board: take it there.
  check('phone: the first order brings its lesson', await k.lessonOn('order', 4000));
  u = await k.ui();
  const atBoard = await page.evaluate(() => { const m = window.ranch.tutor.mark; return m.on && m.icon === 'arrow' && Math.hypot(m.x - -4.2, m.z - 37.6) < 0.3; });
  const board = await page.evaluate(() => window.ranch.boardOrders());
  const sameMorning = await page.evaluate(() => { const s = window.ranch.sim.s; return { day: s.day, hour: s.hour, posted: s.orderDay }; });
  check('phone: the first order is on the board as soon as the loop lesson ends, the same afternoon, and the clock runs on', sameMorning.posted === sameMorning.day && sameMorning.hour < 17 && (await k.st()).learn.includes('time'), JSON.stringify(sameMorning));
  check('phone: "Take an order at the price board.", the arrow on the board', u.page === 'Take an order at the price board.' && atBoard, `${u.page} ${atBoard}`);
  check('phone: the price board chalks the offer up: four clover fluff by dusk, and what it pays', board.length === 1 && /^4 clover fluff by dusk, pays [\d,]+$/.test(board[0]), JSON.stringify(board));
  await k.place(-4.2, 34.6, -4.2, 5.2, 37.6);
  await frames(page, 6);
  await k.shot('phone-14a-order');
  // At the board: Use shows (Board), its one tag comes down chosen, one tap on it takes it, and the line ticks.
  const actB = await centre('.rt-act.show');
  const actWord = await page.evaluate(() => document.querySelector('.rt-act')?.textContent ?? '');
  check('phone: at the board the Use button shows, saying Board', !!actB && /Board/.test(actWord), actWord);
  if (actB) { await tap(actB[0], actB[1], 34); await page.waitForTimeout(800); }
  pick = await chosen();
  check('phone: the board\'s one offer comes down chosen, Use saying Take', pick.id === 'order:0' && pick.label === 'Take', JSON.stringify(pick));
  await k.shot('phone-14a-ordertags');
  await tapTag('order:0');
  check('phone: one tap takes the order, and its lesson ends', await k.waitFor(() => { const s = window.ranch.sim.s; return s.learn.includes('lesson:order') && s.orders[0]?.state === 'open'; }, null, 4000), await k.why());
  // Its first fluff into the crate, blown for real.
  const want0 = await page.evaluate(() => window.ranch.sim.s.orders[0].n);
  await page.evaluate((n) => { const sim = window.ranch.sim; for (let i = 0; i < n; i++) sim.stow('tuft-clover'); }, want0 + 1);
  const fluffSlot = await k.slotOf('tuft');
  if ((await k.st()).sel !== fluffSlot) await tapWindow(fluffSlot);
  await k.place(-6.5, 32.8, -6.5, 5.7, 36.5);
  await frames(page, 3);
  await press('.rt-puff', 90, 35);
  check("phone: the order's first fluff into the crate counts", await k.waitFor(() => window.ranch.sim.s.orders[0].got >= 1, null, 4000), await k.why());
  // With no lesson up, the journal shows the order with its tally, and the next goal under it.
  await page.waitForTimeout(2000);
  const tally = await page.evaluate(() => ({ lesson: window.ranch.seen().lesson, page: [...document.querySelectorAll('.rh-page.up li span')].map((e) => e.textContent), goal: window.ranch.sim.openGoals(1)[0]?.text, o: window.ranch.sim.s.orders[0] }));
  check('phone: with no lesson up, the journal shows the order\'s tally ("Clover fluff, 1 of N.") and the next goal', tally.lesson === '' && tally.page[0] === `Clover fluff, ${tally.o.got} of ${tally.o.n}.` && tally.o.got >= 1 && tally.page.includes(tally.goal), JSON.stringify(tally));
  await k.shot('phone-14b-goal');
  // ---- Round 6: the feeder before the first night (the sixth playtest's garden lesson left 88 coins against a 300
  // feeder, and the first night woke the pen starving). At its price, 150, with a pen, its lesson comes before the
  // garden and before dusk; the open order's tally stays on the page under the lesson's line.
  await page.evaluate(() => { const s = window.ranch.sim.s; s.coins = 150; });
  check('phone: 150 coins and a pen bring the feeder lesson, before the garden and before dusk', await k.lessonOn('ups', 36000), await k.why());
  u = await k.ui();
  const feederEarly = await page.evaluate(() => ({ hour: window.ranch.sim.s.hour, o: window.ranch.sim.s.orders[0], calm: window.__calm() }));
  check('phone: "Buy a feeder at the pen post.", the order\'s tally kept under it ("Clover fluff, 1 of 4.")', u.page === 'Buy a feeder at the pen post.' && feederEarly.calm.length === 1 && feederEarly.calm[0] === `Clover fluff, ${feederEarly.o.got} of ${feederEarly.o.n}.` && feederEarly.hour < 18.3, `${u.page} ${JSON.stringify(feederEarly.calm)} ${feederEarly.hour.toFixed(2)}`);
  await k.shot('phone-14b2-feeder-tally');
  await k.place(14.8 + 1.2, 31.8 + 2.2, 14.8 + 0.4, 5.6, 31.8);
  await frames(page, 6);
  const act4 = await centre('.rt-act');
  if (act4) { await tap(act4[0], act4[1], 22); await page.waitForTimeout(700); }
  const opts3 = await page.evaluate(() => window.ranch.menuOptions());
  check('phone: the pen post offers only what matters yet: the feeder', opts3.join() === 'pen:feeder', opts3.join());
  pick = await chosen();
  check('phone: the Feeder tag comes down chosen (the lesson teaches it)', pick.id === 'pen:feeder' && pick.label === 'Buy', JSON.stringify(pick));
  await k.shot('phone-16-ups');
  await tapTag('pen:feeder');
  check('phone: fitting a feeder ends the upgrades lesson', await k.finished('ups'));
  // ---- the new feeder: filled in its own lesson, the hopper marked (the playtest's sat empty a day and a half)
  // (Round 7: on the first day a lesson comes 30 s after the one before it, the clock waiting at 6 pm meanwhile.)
  check('phone: a lesson to fill the feeder comes next', await k.lessonOn('feeder', 36000));
  await page.evaluate(() => { const sim = window.ranch.sim; for (let i = 0; i < 3; i++) sim.stow('cloverhead'); });
  const headSlot = await k.slotOf('cloverhead');
  if ((await k.st()).sel !== headSlot) {
    await page.waitForTimeout(400);
    u = await k.ui();
    check("phone: clover heads aboard but not chosen: the line says to choose the food's window", u.page === "Tap the food's window to choose it.", u.page);
    await tapWindow(headSlot);
  }
  await page.waitForTimeout(400);
  u = await k.ui();
  const hop = await page.evaluate(() => { const m = window.ranch.tutor.mark; return { on: m.on, x: m.x, y: m.y, z: m.z, r: m.r }; });
  check('phone: "Blow food into the feeder.", the arrow on the hopper', u.page === 'Blow food into the feeder.' && hop.on && Math.abs(hop.x - 20.17) < 0.2 && Math.abs(hop.z - 29.54) < 0.2, `${u.page} ${JSON.stringify(hop)}`);
  await k.place(21.2, 34, hop.x, hop.y - 0.75, hop.z);
  await frames(page, 3);
  await k.shot('phone-16b-feeder');
  await press('.rt-puff', 90, 33);
  check('phone: blowing a clover head into the hopper fills the feeder and ends the lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:feeder'), null, 4000), JSON.stringify(await page.evaluate(() => window.ranch.sim.s.pads[1].feeder)));
  check('phone: all that before dusk (the feeder is in before the first night)', await page.evaluate(() => window.ranch.sim.s.hour < 18.3 && window.ranch.sim.s.day === 1), await k.why());
  // Back at the crate with the rest of the order's fluff, the fluff window chosen.
  const fluffSlot2 = await k.slotOf('tuft');
  if ((await k.st()).sel !== fluffSlot2) await tapWindow(fluffSlot2);
  await k.place(-6.5, 32.8, -6.5, 5.7, 36.5);
  await frames(page, 3);
  // Fill it: the rest of its fluff into the crate. Filling pays the order's fluff again, and the page says "Earned".
  // (Few coins first, so no lesson comes up with them and takes the page.)
  await page.evaluate(() => (window.ranch.sim.s.coins = 10));
  await page.waitForTimeout(300);
  const c0o = (await k.st()).coins;
  await press('.rt-puff', 2400, 36);
  const filled = await k.waitFor(() => window.ranch.sim.s.orders[0].state === 'filled', null, 4000);
  // (If the order's lesson was still ticking, the page waits for it to go.)
  await k.waitFor(() => /^Earned/.test(document.querySelector('.rh-page.up h4')?.textContent ?? ''), null, 3000);
  const earned = await page.evaluate(() => document.querySelector('.rh-page.up h4')?.textContent ?? '');
  const c1o = (await k.st()).coins;
  check('phone: filling the order pays its bonus, and the page reads "Earned N coins" (it read "Paid")', filled && /^Earned [\d,]+ coins$/.test(earned) && c1o > c0o, `${earned} ${c0o} to ${c1o}`);
  await k.shot('phone-14c-filled');
  await page.evaluate(() => { const s = window.ranch.sim.s; for (const q of s.slots) if (q.t && q.t.startsWith('tuft-')) { q.t = null; q.n = 0; } s.coins = 150; });

  // ---- 10. dusk: the clock and the door
  await page.evaluate(() => (window.ranch.sim.s.hour = 18.2));
  check('phone: dusk brings its lesson', await k.lessonOn('dusk', 40000));
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
  check('phone: waking, you face the yard (the crate and the pens), not the door', await page.evaluate(() => { const p = window.ranch.sim.s.player; const fx = -Math.sin(p.yaw); const fz = -Math.cos(p.yaw); const tx = 5.25 - p.x; const tz = 31.5 - p.z; return (fx * tx + fz * tz) / Math.hypot(tx, tz) > 0.95; }));
  await page.evaluate(() => (window.ranch.sim.s.hour = 20.55));
  check('phone: nightfall brings the nettleback lesson', await k.lessonOn('night', 6000));
  check('phone: night line', (await k.ui()).page === 'Blow anything at the pest to shoo it.');
  // The second playtest: sleeping through the night lesson marked it learned, and night 2's pests came with no line.
  await k.place(-16, 37.4, -16, 5.4, 39.6);
  await frames(page, 6);
  const actN = await centre('.rt-act');
  if (actN) {
    await tap(actN[0], actN[1], 27);
    await page.waitForTimeout(700);
    pick = await chosen();
    // (Round 4: a lone tag comes down chosen, so one tap takes it; the playtest's needed two.)
    check('phone: at the door, the lone Sleep tag comes down chosen, Use saying Sleep', pick.id === 'sleep' && pick.label === 'Sleep', JSON.stringify(pick));
    await takeTag('sleep');
  }
  await page.waitForTimeout(1500);
  check('phone: slept through, the night lesson is not counted as learned', (await k.st()).day >= 3 && !(await k.finished('night')), await k.why());
  await page.evaluate(() => (window.ranch.sim.s.hour = 20.55));
  check('phone: the next night the nettleback lesson comes back', await k.lessonOn('night', 6000));
  check('phone: nettlebacks come only now', await k.waitFor(() => window.ranch.sim.s.nettles.some((n) => !n.gone), null, 10000));
  // However far off the pest is, the lesson points at it (on screen, or with the chevron on the edge).
  const farPest = await page.evaluate(() => { const r = window.ranch; const s = r.sim.s; const n = s.nettles.find((q) => !q.gone); const m = r.tutor.mark; return { on: m.on, d: Math.hypot(n.x - s.player.x, n.z - s.player.z), at: Math.hypot(m.x - n.x, m.z - n.z) }; });
  await frames(page, 3);
  check('phone: the night lesson points at the pest however far it is', farPest.on && farPest.at < 1 && ((await k.ui()).edge || (await k.ui()).marker === 'arrow'), JSON.stringify(farPest));
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
  await page.evaluate(() => { const s = window.ranch.sim.s; s.hour = 10; s.coins = 150; for (const d of s.downies) d.hunger = 0; });
  // ---- the pen limit, taught before it bites: eight in a pen bring a line, an arrow at its post, and the post's count tag.
  await page.evaluate(() => { const r = window.ranch; const n = r.sim.s.downies.filter((d) => !d.gone && d.pen === 1).length; for (let k = n; k < 8; k++) { const d = r.sim.spawn('clover', 17 + Math.cos(k) * 2, 26.5 + Math.sin(k) * 2, true); d.hunger = 0.1; d.extra = true; } });
  check('phone: eight in a pen bring the pen limit lesson', await k.lessonOn('crowd', 4000));
  u = await k.ui();
  const atPost = await page.evaluate(() => { const m = window.ranch.tutor.mark; return m.on && Math.hypot(m.x - (14.8 + 0.9), m.z - 31.8) < 0.3; });
  const count = await page.evaluate(() => window.ranch.pads.countTag(1));
  check('phone: "Keep ten or fewer downies in a pen.", the arrow at the post, whose count tag reads 8 of 10', u.page === 'Keep ten or fewer downies in a pen.' && atPost && count === '8', `${u.page} ${atPost} ${count}`);
  await k.place(15.2, 34.2, 15.0, 5.0, 31.8);
  await frames(page, 4);
  await k.shot('phone-14d-crowd');
  check('phone: by the post a moment (its count tag read), with no pen over ten, the pen limit line ticks', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:crowd'), null, 6000));
  await page.evaluate(() => { for (const d of window.ranch.sim.s.downies) if (d.extra) d.gone = true; });
  // No lesson can come yet (150 coins): the journal shows the next goal, calmly, never a blank page.
  await page.waitForTimeout(2200);
  const calm = await page.evaluate(() => ({ lesson: window.ranch.seen().lesson, page: document.querySelector('.rh-page').classList.contains('up') ? document.querySelector('.rh-page').textContent.trim() : '', goal: window.ranch.sim.openGoals(1)[0]?.text }));
  check('phone: with no lesson up, the journal shows the next goal', calm.lesson === '' && !!calm.goal && calm.page.includes(calm.goal), JSON.stringify(calm));
  await page.evaluate(() => { const s = window.ranch.sim.s; s.coins = 260; });
  check('phone: 200 coins bring the garden lesson', await k.lessonOn('garden', 4000));
  check('phone: garden line says what to tap', (await k.ui()).page === 'Tap Post at an empty plot, then Garden.', (await k.ui()).page);
  await k.place(25.8 + 1.2, 31.8 + 2.2, 25.8 + 0.4, 5.6, 31.8);
  await frames(page, 6);
  const act3 = await centre('.rt-act');
  if (act3) { await tap(act3[0], act3[1], 20); await page.waitForTimeout(700); }
  const opts2 = await page.evaluate(() => window.ranch.menuOptions());
  check('phone: now the pad offers a garden too, but no silo yet', opts2.join() === 'build:pen,build:garden', opts2.join());
  pick = await chosen();
  check('phone: the garden lesson\'s Garden tag comes down chosen, not Pen (the playtest had Pen)', pick.id === 'build:garden' && pick.label === 'Buy', JSON.stringify(pick));
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
  // ---- a gate goal counts the coins and points at the gate (it was a dead end)
  await page.evaluate(() => { const s = window.ranch.sim.s; for (const g of ['sell', 'plant', 'order']) if (!s.goals.includes(g)) s.goals.push(g); s.coins = 288; });
  // (A goal just done shows its "Earned" page first, once the feeder's line has ticked and gone.)
  await k.waitFor(() => [...document.querySelectorAll('.rh-page.up li span')].some((e) => e.textContent.startsWith('Open the Ember Ridge gate')), null, 7000);
  const gg = await page.evaluate(() => { const r = window.ranch; const m = r.tutor.mark; const pg = document.querySelector('.rh-page'); return { page: pg.classList.contains('up') ? [...pg.querySelectorAll('li span')].map((e) => e.textContent) : [], spot: r.seen().goalSpot, at: m.on ? Math.hypot(m.x - -35.4, m.z - -10) : -1 }; });
  check('phone: the gate goal reads "Open the Ember Ridge gate, 288 of 500." with an arrow on the gate', gg.page.includes('Open the Ember Ridge gate, 288 of 500.') && gg.spot && gg.at >= 0 && gg.at < 0.5, JSON.stringify(gg));
  // Round 5: 450 coins with the gate shut bring no workbench lesson (the fifth playtest's jar at 400 spent the gate's
  // savings while the journal counted towards 500): the journal keeps counting towards the gate.
  await page.evaluate(() => (window.ranch.sim.s.coins = 450));
  await page.waitForTimeout(1500);
  const noBench = await page.evaluate(() => ({ lesson: window.ranch.seen().lesson, page: [...document.querySelectorAll('.rh-page.up li span')].map((e) => e.textContent) }));
  check('phone: 450 coins and the gate shut bring no workbench lesson, the journal counting towards the gate', noBench.lesson !== 'bench' && noBench.page.includes('Open the Ember Ridge gate, 450 of 500.'), JSON.stringify(noBench));
  check('phone: no gate prices hang before the gates lesson', !(await k.ui()).gateTags);
  await page.evaluate(() => (window.ranch.sim.s.coins = 520));
  check('phone: 500 coins bring the gates lesson', await k.lessonOn('gates', 4000));
  await page.waitForTimeout(200);
  check('phone: the gate prices hang now', (await k.ui()).gateTags);
  await k.place(-33.4, -10, -35.4, 3.5, -10);
  await frames(page, 6);
  await k.shot('phone-18-gates');
  const act6 = await centre('.rt-act');
  if (act6) { await tap(act6[0], act6[1], 24); await page.waitForTimeout(700); }
  await tapTag('gate:ridge');
  check('phone: opening the gate ends the gates lesson', await k.finished('gates'));
  // The gate's goal shows done ("Earned 200 coins", struck) once the gates line has ticked, then the next goal takes the page.
  const earnedGate = await k.waitFor(() => (document.querySelector('.rh-page.up h4')?.textContent ?? '') === 'Earned 200 coins', null, 4000);
  check('phone: the opened gate\'s goal shows done with what it earned, after the lesson line', earnedGate);
  await k.waitFor(() => !document.querySelector('.rh-page.up h4'), null, 5000);
  const after = await page.evaluate(() => ({ lesson: window.ranch.seen().lesson, page: document.querySelector('.rh-page').classList.contains('up') ? document.querySelector('.rh-page').textContent.trim() : '', goal: window.ranch.sim.openGoals(1)[0]?.text }));
  check('phone: every lesson done, the journal goes on with the next goal (never blank)', after.lesson === '' && !after.page.includes('Open the gate to Ember') && !!after.goal && after.page.includes(after.goal), JSON.stringify(after));

  // The workbench lesson comes once the gate is open (and 400 coins are there).
  await page.evaluate(() => (window.ranch.sim.s.coins = 450));
  check('phone: with the ridge gate open, 400 coins bring the workbench lesson', await k.lessonOn('bench', 4000));
  await k.place(-10.6, 38.9, -10.6, 5.4, 41.2);
  await frames(page, 6);
  const act5 = await centre('.rt-act');
  if (act5) { await tap(act5[0], act5[1], 23); await page.waitForTimeout(700); }
  const opts4 = await page.evaluate(() => window.ranch.menuOptions());
  check('phone: the workbench offers a bigger canister and a longer draw, nothing more yet', opts4.join() === 'bench:cap,bench:range', opts4.join());
  pick = await chosen();
  check('phone: the Bigger jar tag comes down chosen', pick.id === 'bench:cap', JSON.stringify(pick));
  await k.shot('phone-17-bench');
  await tapTag('bench:cap');
  check('phone: fitting a bigger canister ends the workbench lesson', await k.finished('bench'));

  // ---- a thistle caught: the high fence line at once, before it is penned (the fourth playtest's left a low
  // pen in about seven seconds, before the tester reached the post)
  await page.evaluate(() => { const r = window.ranch; const s = r.sim.s; s.coins = 600; s.hour = 11; r.sim.stow('thistle'); });
  check('phone: a thistle in the jar brings the high fence line before it is penned', await k.lessonOn('high', 4000));
  const early = await page.evaluate(() => { const r = window.ranch; const m = r.tutor.mark; return { line: r.seen().line, post: m.on ? Math.hypot(m.x - (14.8 + 0.9), m.z - 31.8) : -1, penned: r.sim.s.downies.some((d) => !d.gone && d.kind === 'thistle') }; });
  check('phone: "Thistles need a high fence. Buy one." at the pen post, with the thistle still in the jar', early.line === 'Thistles need a high fence. Buy one.' && early.post >= 0 && early.post < 0.3 && !early.penned, JSON.stringify(early));
  await page.evaluate(() => { const s = window.ranch.sim.s; for (const q of s.slots) if (q.t === 'thistle') { q.t = null; q.n = 0; } });
  await k.waitFor(() => window.ranch.seen().lesson !== 'high', null, 4000);
  // ---- a thistle behind a low fence: the high fence line, pointing at the post, its tag chosen; one tap buys it
  await page.evaluate(() => { const r = window.ranch; const s = r.sim.s; s.coins = 600; s.hour = 11; const d = r.sim.spawn('thistle', 17, 26.5, true); d.hunger = 0.1; d.extra = true; });
  check('phone: a thistle in a low pen brings the high fence line', await k.lessonOn('high', 4000));
  u = await k.ui();
  const atPost2 = await page.evaluate(() => { const m = window.ranch.tutor.mark; return m.on && Math.hypot(m.x - (14.8 + 0.9), m.z - 31.8) < 0.3; });
  check('phone: "Thistles need a high fence. Buy one.", the arrow at the pen post', u.page === 'Thistles need a high fence. Buy one.' && atPost2, `${u.page} ${atPost2}`);
  await k.place(14.8 + 1.2, 31.8 + 2.2, 14.8 + 0.4, 5.6, 31.8);
  await frames(page, 6);
  const actH = await centre('.rt-act');
  if (actH) { await tap(actH[0], actH[1], 37); await page.waitForTimeout(700); }
  pick = await chosen();
  check('phone: the High fence tag comes down chosen', pick.id === 'pen:high' && pick.label === 'Buy', JSON.stringify(pick));
  await k.shot('phone-18b-high');
  await tapTag('pen:high');
  check('phone: buying the high fence ends the line', await k.waitFor(() => { const r = window.ranch; return r.sim.s.pads[1].ups.includes('high') && r.seen().lesson !== 'high'; }, null, 5000), await k.why());
  await page.evaluate(() => { for (const d of window.ranch.sim.s.downies) if (d.extra) d.gone = true; });
  // ---- the thistle hunt has a clue: by day, when they come; at dusk, where, with an arrow at the ridge top
  await page.evaluate(() => { const r = window.ranch; const s = r.sim.s; s.gates.hollow = true; r.sim.phys.gates = { ...s.gates }; for (const g of ['catch', 'pen', 'feed', 'sell', 'plant', 'order', 'ridge', 'ember', 'feeder', 'hollow']) if (!s.goals.includes(g)) s.goals.push(g); s.hour = 14; });
  await page.waitForTimeout(1500);
  const clueDay = await page.evaluate(() => [...document.querySelectorAll('.rh-page.up li span')].map((e) => e.textContent));
  check('phone: by day the thistle goal reads "Thistles visit the ridge top at dusk."', clueDay.includes('Thistles visit the ridge top at dusk.'), JSON.stringify(clueDay));
  await page.evaluate(() => (window.ranch.sim.s.hour = 18));
  await page.waitForTimeout(1500);
  const clueDusk = await page.evaluate(() => { const r = window.ranch; const m = r.tutor.mark; return { page: [...document.querySelectorAll('.rh-page.up li span')].map((e) => e.textContent), spot: r.seen().goalSpot, at: m.on ? Math.hypot(m.x - -60, m.z - -26) : -1 }; });
  check('phone: at dusk it reads "Catch a thistle on the ridge top." with an arrow there', clueDusk.page.includes('Catch a thistle on the ridge top.') && clueDusk.spot && clueDusk.at >= 0 && clueDusk.at < 0.5, JSON.stringify(clueDusk));
  await k.shot('phone-18c-thistle-clue');
  await page.evaluate(() => (window.ranch.sim.s.hour = 11));

  // ---- Round 6: the morning's rare downy is a hunt, taught the first time it is taken: its tag at the board (where it
  // was seen, what it pays, that it stays), "Find the gold clover by the old oak." with no arrow over the landmark
  // (only the way to its part of the valley), found close by, lured with its food blown near it for real, pulled in
  // for real while it is lured, then blown into a pen, where it fills the order and stays.
  // (Round 8: each offer has a deadline; the hunt here is given dusk's, so the walk through its steps cannot run past noon.)
  await page.evaluate(() => { const r = window.ranch; const s = r.sim.s; r.closeMenu(); s.hour = 8; for (const q of s.slots) { q.t = null; q.n = 0; } for (const d of s.downies) if (!d.tame && !d.keep) d.gone = true; s.orders = []; r.sim.postOrders(true); for (const o of s.orders) if (o.rare) o.by = 19; });
  await k.place(-4.2, 34.6, -4.2, 5.2, 37.6);
  await frames(page, 6);
  const actR = await centre('.rt-act.show');
  if (actR) { await tap(actR[0], actR[1], 37); await page.waitForTimeout(900); }
  const rareTag = await page.evaluate(() => { const r = window.ranch; const opts = r.sim.menu({ kind: 'board', id: 0, label: '', x: 0, y: 0, z: 0 }); const i = opts.findIndex((o) => /, by (noon|dusk)$/.test(o.title) && /^By the /.test(o.note)); const trip = r.sim.offers().find((o) => o.live && !o.rare); return i < 0 ? null : { id: opts[i].id, title: opts[i].title, note: opts[i].note, all: opts.map((o) => `${o.title}: ${o.note}`), trip: trip ? trip.n * trip.pay : 0 }; });
  const rarePay = Number((rareTag?.note.match(/Pays ([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''));
  // (Round 8: each with its condition: the fluff order and the trip due by noon, by dusk or after dark, the hunt by noon or dusk at its set place.)
  check("phone: the board's tags offer a fluff order, a trip and the rare one, which says where it was seen, what it pays and what it adds a day once penned (round 7), each with its condition (round 8)", !!rareTag && rareTag.all.length === 3 && rareTag.all.some((t) => /^(By noon|By dusk|After dark)\. Pays [\d,]+ on top of sales$/.test(t.split(': ')[1])) && rareTag.all.some((t) => /(Caught by noon|Caught by dusk|Caught today, after dark)\. Pays/.test(t)) && /^(Gold clover|Rose ember|Silver brook), by (noon|dusk)$/.test(rareTag.title) && /^By the [a-z ]+\. Pays [\d,]+, (and stays|then about [\d,]+ a day)$/.test(rareTag.note), JSON.stringify(rareTag));
  check("phone: the rare one's coins today are no more than the trip's (the playtest's 2,680 was 3.8 times it; round 8: a downy's worth, its worth is the lasting one)", !!rareTag && rarePay > 0 && rarePay <= rareTag.trip, `${rarePay} against ${rareTag?.trip}`);
  await k.shot('phone-18d-rare-tags');
  if (rareTag) await takeTag(rareTag.id);
  check('phone: taking the rare one brings its lesson', await k.lessonOn('rare', 4000), await k.why());
  u = await k.ui();
  const rareFar = await page.evaluate(() => { const r = window.ranch; const d = r.sim.rareWild(); const m = r.tutor.mark; return d && { onSpot: m.on && Math.hypot(m.x - d.homeX, m.z - d.homeZ) < 4, gate: m.on ? Math.hypot(m.x - 0, m.z - 18) : -1, kind: d.kind, far: Math.hypot(d.x - r.sim.s.player.x, d.z - r.sim.s.player.z) }; });
  check('phone: "Find the gold clover by the old oak." (its kind and where), no arrow over the landmark, only the way out of the ranch', !!rareFar && /^Find the (gold clover|rose ember|silver brook) by the [a-z ]+\.$/.test(u.page) && !rareFar.onSpot && rareFar.gate >= 0 && rareFar.gate < 1, `${u.page} ${JSON.stringify(rareFar)}`);
  const rk = rareFar?.kind ?? 'clover';
  const food = rk === 'clover' ? 'cloverhead' : rk === 'ember' ? 'sweetroot' : 'dewberry';
  const foodWord = rk === 'clover' ? 'clover heads' : rk === 'ember' ? 'sweetroots' : 'dewberries';
  // In its part of the valley, 35 m off: the clue only, no arrow at all.
  let rd = await page.evaluate(() => { const d = window.ranch.sim.rareWild(); return d && { x: d.x, y: d.y, z: d.z }; });
  await page.evaluate(() => { const s = window.ranch.sim.s; s.gates.ridge = s.gates.hollow = true; window.ranch.sim.phys.gates = { ...s.gates }; });
  const spot35 = await page.evaluate(([x, z]) => { const sim = window.ranch.sim; const { zoneAt } = { zoneAt: (px, pz) => (pz > 18 ? 'ranch' : px < -36 ? 'ridge' : px > 36 ? 'hollow' : 'meadow') }; const home = zoneAt(x, z); for (let a = 0; a < 6.28; a += 0.3) { const px = x + Math.cos(a) * 35; const pz = z + Math.sin(a) * 35; if (zoneAt(px, pz) === home && px > -76 && px < 76 && pz > -56 && pz < 56 && sim.phys.floor(px, pz) > -0.6) return [px, pz]; } return [x, z + 30]; }, [rd.x, rd.z]);
  await k.place(spot35[0], spot35[1], rd.x, rd.y + 0.25, rd.z);
  await page.waitForTimeout(600);
  u = await k.ui();
  const clueOnly = await page.evaluate(() => !window.ranch.tutor.mark.on);
  check('phone: in its own part of the valley, far off: the clue line and no arrow', /^Find the /.test(u.page) && clueOnly, `${u.page} ${clueOnly}`);
  await k.shot('phone-18e-rare-clue');
  // Close (18 m): found. With none of its food aboard, the line says to bring some.
  await k.place(rd.x + 18, rd.z, rd.x, rd.y + 0.25, rd.z);
  await page.waitForTimeout(700);
  u = await k.ui();
  check(`phone: found close by, with none of its food aboard: "Bring ${foodWord} to lure it."`, u.page === `Bring ${foodWord} to lure it.`, u.page);
  await page.evaluate((f) => { const sim = window.ranch.sim; for (let i = 0; i < 8; i++) sim.stow(f); }, food);
  const foodWin = await k.slotOf(food);
  if (foodWin >= 0 && (await k.st()).sel !== foodWin) await tapWindow(foodWin);
  await page.waitForTimeout(500);
  u = await k.ui();
  const onRare = await page.evaluate(() => { const r = window.ranch; const d = r.sim.rareWild(); const m = r.tutor.mark; return !!d && m.on && Math.hypot(m.x - d.x, m.z - d.z) < 0.6; });
  check(`phone: with ${foodWord} aboard: "Blow ${foodWord} near it.", the arrow on the downy`, u.page === `Blow ${foodWord} near it.` && onRare, `${u.page} ${onRare}`);
  await k.shot('phone-18f-rare-lure');
  // Walking straight up to it unlured sends it off: it is warier than a plain downy.
  // (Measured in the sim tests; here the lure is played for real.) Blow its food so it lands short of it, from 14 m.
  let lured = false;
  for (let tries = 0; tries < 4 && !lured; tries++) {
    rd = await page.evaluate(() => { const d = window.ranch.sim.rareWild(); return d && { x: d.x, y: d.y, z: d.z }; });
    if (!rd) break;
    await k.place(rd.x + 14, rd.z, rd.x + 5, rd.y + 3.2, rd.z);
    await frames(page, 3);
    await press('.rt-puff', 90, 40 + tries);
    lured = await k.waitFor(() => { const d = window.ranch.sim.rareWild(); return !!d && (d.calm > 0 || d.eatT > 0 || (!!d.target && !d.target.gone)); }, null, 5000);
  }
  check('phone: its food blown near it for real, it comes to eat it (lured)', lured, await k.why());
  await page.waitForTimeout(300);
  // Round 7: its fed window shows, a ring over it (the seventh playtest's ran out unseen).
  const fedRing = await page.evaluate(() => ({ share: window.ranch.hud.fedState(), on: document.querySelector('.rh-fed')?.classList.contains('on') }));
  check('phone: lured, a ring over it shows its fed window', fedRing.on && fedRing.share > 0, JSON.stringify(fedRing));
  u = await k.ui();
  check('phone: lured, the line says to walk up and hold Pull', u.page === 'Walk up and hold Pull on it.', u.page);
  let caughtRare = false;
  for (let tries = 0; tries < 4 && !caughtRare; tries++) {
    rd = await page.evaluate(() => { const d = window.ranch.sim.rareWild(); return d && { x: d.x, y: d.y, z: d.z, lured: d.calm > 0 || d.eatT > 0 }; });
    if (!rd) break;
    // Got away and no longer lured: lure it again (some food just short of it), then come in.
    if (!rd.lured) {
      await k.place(rd.x + 13, rd.z, rd.x + 4, rd.y + 3, rd.z);
      await frames(page, 3);
      await press('.rt-puff', 90, 50 + tries);
      await k.waitFor(() => { const d = window.ranch.sim.rareWild(); return !!d && (d.calm > 0 || d.eatT > 0); }, null, 5000);
      rd = await page.evaluate(() => { const d = window.ranch.sim.rareWild(); return d && { x: d.x, y: d.y, z: d.z }; });
      if (!rd) break;
    }
    await k.place(rd.x + 3.4, rd.z + 1.2, rd.x, rd.y + 0.25, rd.z);
    await pullReading(9000, 38, async () => { const q = await page.evaluate(() => { const d = window.ranch.sim.rareWild(); return d && { x: d.x, y: d.y, z: d.z }; }); if (q) await k.aim(q.x, q.y + 0.25, q.z); }, () => page.evaluate(() => window.ranch.sim.s.slots.some((q) => (q.downs ?? []).some((d) => d.rare))));
    caughtRare = await page.evaluate(() => window.ranch.sim.s.slots.some((q) => (q.downs ?? []).some((d) => d.rare)));
  }
  check('phone: pulled for real while it is lured, the rare one comes into the jar', caughtRare, await k.why());
  await page.waitForTimeout(500);
  u = await k.ui();
  const rareName = rk === 'clover' ? 'gold clover' : rk === 'ember' ? 'rose ember' : 'silver brook';
  const onPen = await page.evaluate(() => { const m = window.ranch.tutor.mark; return m.on && Math.hypot(m.x - 17, m.z - 26.5) < 0.6; });
  check(`phone: aboard, "Blow the ${rareName} into a pen.", the arrow on the pen`, u.page === `Blow the ${rareName} into a pen.` && onPen, `${u.page} ${onPen}`);
  const rs = await k.slotOf(rk);
  if (rs >= 0 && (await k.st()).sel !== rs) await tapWindow(rs);
  // (The pen has a high fence by now: aim until the crosshair says the blow would land in the pen.)
  let penAim = '';
  for (const [z, y] of [[34.5, 6.6], [35.5, 7.4], [36.5, 8.2], [37.5, 9]]) {
    await k.place(17, z, 17, y, 26.5);
    await frames(page, 4);
    penAim = await page.evaluate(() => document.querySelector('.rh-cross').dataset.s);
    if (penAim === 'pen') break;
  }
  check('phone: aimed at the pen with the rare one chosen, the crosshair says it would land in the pen', penAim === 'pen', penAim);
  const c0r = (await k.st()).coins;
  await press('.rt-puff', 90, 39);
  check('phone: blown into the pen, the rare one fills the order, and its lesson ticks', await k.waitFor(() => { const s = window.ranch.sim.s; return s.orders.some((o) => o.rare && o.state === 'filled') && s.learn.includes('lesson:rare'); }, null, 6000), await k.why());
  check('phone: it paid what its tag said', (await k.st()).coins - c0r >= rarePay, `${c0r} to ${(await k.st()).coins}`);
  const stays = await page.evaluate(() => window.ranch.sim.s.downies.some((d) => !d.gone && d.rare && d.tame && d.pen === 1));
  check('phone: and it stays, in the pen', stays);
  const earnedRare = await k.waitFor(() => { const pg = document.querySelector('.rh-page.up'); return !!pg && /^Earned/.test(pg.querySelector('h4')?.textContent ?? '') && [...pg.querySelectorAll('li.plain span')].some((e) => e.textContent === 'It stays. Its pen sheds more.'); }, null, 5000);
  check('phone: the page says what it earned, and, as news with no box to tick, "It stays. Its pen sheds more."', earnedRare, await page.evaluate(() => document.querySelector('.rh-page')?.textContent));
  await k.shot('phone-18g-rare-penned');
  await page.evaluate(() => { for (const q of window.ranch.sim.s.slots) { q.t = null; q.n = 0; } });

  // A long press on a window tips it out on the ground in front of you (real touch).
  await page.evaluate(() => { const sim = window.ranch.sim; for (let i = 0; i < 6; i++) sim.stow('sweetroot'); });
  const rootSlot = await k.slotOf('sweetroot');
  const rw = await page.evaluate((i) => window.ranch.slotScreen(i), rootSlot);
  const roots0 = (await k.items('sweetroot')).length;
  await touch('touchStart', [[rw.x, rw.y, 26]]);
  await page.waitForTimeout(250);
  const midHold = await page.evaluate((i) => window.ranch.sim.s.slots[i].n, rootSlot);
  await page.waitForTimeout(700);
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  // (At least the six tipped out: a garden may grow a sweetroot of its own meanwhile.)
  const roots1 = (await k.items('sweetroot')).length;
  const leftIn = await page.evaluate((i) => window.ranch.sim.s.slots[i].n, rootSlot);
  check('phone: a long press on a window tips it out in front of you (not a short one)', midHold === 6 && leftIn === 0 && roots1 - roots0 >= 6, `mid ${midHold}, left ${leftIn}, on the ground ${roots1 - roots0}`);

  // The pause page carries the whole journal and the notes.
  const pz = await centre('.rt-pause');
  await tap(pz[0], pz[1], 25);
  await page.waitForTimeout(400);
  const pause = await page.evaluate(() => ({ goals: document.querySelectorAll('.rh-pause ol li').length, open: document.querySelectorAll('.rh-pause ol li:not(.done)').length, done: window.ranch.sim.s.goals.length, notes: document.querySelectorAll('.rh-pause .notes li').length, fits: (() => { const r = document.querySelector('.rh-pause').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })() }));
  // Only the goals done and the one you are on (the third playtest's showed all eleven on day 1, the thistle too).
  check('phone: the pause page holds the goals done and the current one (no more), and the latest notes, all on screen', pause.goals === pause.done + 1 && pause.open === 1 && pause.notes >= 1 && pause.notes <= 3 && pause.fits, JSON.stringify(pause));
  await k.shot('phone-19-pause');

  // Round 7: every lesson line on the phone's page reads on one line, or wraps evenly onto two (the seventh
  // playtest's "...to shoo / it." and "Sleep at the front door till morning.").
  const fit = await page.evaluate(() => window.ranch.lessonFit());
  const ragged = fit.filter((q) => q.lines > 2 || (q.lines === 2 && q.last < 0.4));
  check(`phone: all ${fit.length} lesson lines in touch words read on one line or two even ones on the 412 px page`, fit.length > 40 && ragged.length === 0, ragged.slice(0, 4).map((q) => `${q.line} (${q.lines} lines, last ${q.last.toFixed(2)})`).join(' | '));
  console.log(`   lesson lines on the phone page: ${fit.filter((q) => q.lines === 1).length} on one line, ${fit.filter((q) => q.lines === 2).length} on two (the shortest last line ${Math.min(...fit.filter((q) => q.lines === 2).map((q) => q.last)).toFixed(2)} of the first)`);
  const zero = await page.evaluate(() => window.__zero);
  check('phone: touches never read as 0,0 (no pointer lock from a touch)', !zero, zero ?? '');
  const bad = await page.evaluate(() => window.__bad);
  const first = await page.evaluate(() => window.__first);
  check('phone: nothing appeared before its lesson (checked every frame)', bad.length === 0, bad.slice(0, 6).join(' | '));
  console.log('   first seen during:', Object.entries(first).map(([k2, v]) => `${k2}@${v}`).join(', '));
  check('phone: no console errors', problems.length === 0, problems.slice(0, 4).join(' | '));
  await ctx.close();
}

// =================================================================== phone: the first evening at real speed (round 7)
// The seventh playtest's first evening put six lines up in about two real minutes, mostly in the dark: the order
// at 17:36, then the feeder until dusk took over before it was filled, the night at 20:30, the garden and planting
// at 23:30. Here the loop lesson has just ended (the lessons before it learned through the hook) and an eager
// player does each thing the moment its line is up: takes the order, buys the feeder, blows food into it. Nothing
// jumps the clock. Each new lesson line is timed, in real seconds, as it comes up. Run on its own with EVENING=1.
{
  console.log('-- phone, the first evening at real speed');
  const { ctx, page, problems } = await open({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2.6, hasTouch: true, isMobile: true }, '&fresh');
  const k = kit(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  await touch('touchStart', [[300, 300, 1]]);
  await page.waitForTimeout(60);
  await touch('touchEnd', [[300, 300, 1]]);
  await page.evaluate(() => {
    const r = window.ranch;
    const sim = r.sim;
    const s = sim.s;
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'jump', 'run', 'ease', 'farm']) if (!s.learn.includes(`lesson:${id}`)) s.learn.push(`lesson:${id}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'ease', 'orders', 'time']) if (!s.learn.includes(f)) s.learn.push(f);
    s.pads[1].kind = 'pen';
    s.pads[1].ups = [];
    sim.phys.setPads(s.pads);
    for (let i = 0; i < 3; i++) sim.spawn('clover', 17 + Math.cos(i * 2) * 2, 26.5 + Math.sin(i * 2) * 2, true).hunger = 0.3;
    // Coins for the feeder and the garden both (the playtest's garden lesson came at 23:30).
    s.coins = 420;
    s.hour = 16.5;
    s.day = 1;
    s.orderDay = 0;
    const p = s.player;
    p.x = -5;
    p.z = 34;
    window.__begins = [];
    let last = '';
    const t0 = performance.now();
    const tick = () => {
      const v = r.seen();
      if (v.lesson && v.line && v.lesson !== last) {
        window.__begins.push({ id: v.lesson, t: (performance.now() - t0) / 1000, hour: s.hour, day: s.day });
        last = v.lesson;
      }
      if (!v.lesson) last = '';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  let feederTicked = -1;
  while (Date.now() - t0 < 360000) {
    const q = await page.evaluate(() => { const r = window.ranch; const s = r.sim.s; return { lesson: r.seen().lesson, line: r.seen().line, hour: s.hour, offers: r.sim.offers().length, feeder: s.pads[1].ups.includes('feeder'), filled: s.pads[1].feeder.n, done: s.learn.includes('lesson:feeder'), night: (window.__begins ?? []).some((b) => b.id === 'night') }; });
    if (q.night) break;
    if (q.done && feederTicked < 0) feederTicked = q.hour;
    if (q.lesson === 'order' && q.line && q.offers) await page.evaluate(() => window.ranch.sim.takeOrder(0));
    if (q.lesson === 'ups' && q.line && !q.feeder) await page.evaluate(() => window.ranch.sim.choose({ kind: 'pad', id: 1, label: '', x: 0, y: 0, z: 0 }, 'pen:feeder'));
    if (q.lesson === 'feeder' && q.line && q.filled === 0) {
      // Clover heads aboard and chosen, then a real Blow at the hopper, the arrow's spot.
      await page.evaluate(() => { const sim = window.ranch.sim; const s = sim.s; for (let i = 0; i < 3; i++) sim.stow('cloverhead'); s.sel = s.slots.findIndex((w) => w.t === 'cloverhead'); });
      await page.waitForTimeout(400);
      const hop = await page.evaluate(() => { const m = window.ranch.tutor.mark; return { x: m.x, y: m.y, z: m.z }; });
      await k.place(21.2, 34, hop.x, hop.y - 0.75, hop.z);
      await frames(page, 3);
      const puff = await page.evaluate(() => { const e = document.querySelector('.rt-puff').getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; });
      await touch('touchStart', [[puff[0], puff[1], 33]]);
      await page.waitForTimeout(90);
      await touch('touchEnd', [[puff[0], puff[1], 33]]);
    }
    await page.waitForTimeout(200);
  }
  const begins = await page.evaluate(() => window.__begins);
  console.log(`   the first evening: ${begins.map((b) => `${b.id} at ${b.t.toFixed(1)} s (${Math.floor(b.hour)}:${String(Math.round((b.hour % 1) * 60)).padStart(2, '0')})`).join(', ')}; the feeder lesson ticked at ${feederTicked.toFixed(2)} h`);
  const ids = begins.map((b) => b.id);
  check('evening: order, feeder, filling it, dusk, then night, in that order (no garden)', ids.join() === 'order,ups,feeder,dusk,night', ids.join());
  const gaps = begins.slice(1).map((b, i) => b.t - begins[i].t);
  check('evening: no two new lesson lines within 30 real seconds of each other', gaps.length >= 4 && gaps.every((g) => g >= 29.5), gaps.map((g) => g.toFixed(1)).join(', '));
  const late = begins.filter((b) => b.id !== 'night' && (b.hour >= 19 || b.day > 1));
  check('evening: no lesson but the night one starts after 7 pm', late.length === 0, late.map((b) => `${b.id} ${b.hour.toFixed(2)}`).join(', '));
  check('evening: the feeder is filled before dusk comes (dusk waited at 6 pm for it)', feederTicked > 0 && feederTicked < 18.3, feederTicked.toFixed(2));
  check('evening: no console errors', problems.length === 0, problems.slice(0, 4).join(' | '));
  await ctx.close();
}

// =================================================================== desktop, a browser that refuses pointer lock
// (The fourth playtest, in headless Chrome: every click asked for pointer lock again and the line stayed "Click
// the view to look around." After a refusal it falls back to right-drag, and says so.)
if (!process.env.EVENING) {
  console.log('-- desktop, pointer lock refused');
  const { ctx, page, problems } = await open({ viewport: { width: 1280, height: 800 } }, '&fresh');
  const k = kit(page);
  await page.waitForTimeout(400);
  const before = (await k.ui()).page;
  // Refused, as this headless browser does (and as a frame that forbids it would).
  await page.evaluate(() => { HTMLElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('refused', 'NotSupportedError')); });
  await page.mouse.click(640, 400);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ line: window.ranch.seen().line, avail: window.ranch.input.lockAvailable, hint: document.querySelector('.rh-click')?.classList.contains('on') ?? false }));
  check('desk, lock refused: the look line falls back to right-drag after the first click (it stayed "Click the view")', before === 'Click the view to look around.' && after.line === 'Right-drag to look around.' && !after.avail && !after.hint, `${before} -> ${JSON.stringify(after)}`);
  let asked = 0;
  await page.evaluate(() => { window.__asked = 0; HTMLElement.prototype.requestPointerLock = () => { window.__asked++; return Promise.reject(new DOMException('refused', 'NotSupportedError')); }; });
  for (let i = 0; i < 3; i++) await page.mouse.click(640 + i * 10, 400);
  await page.waitForTimeout(300);
  asked = await page.evaluate(() => window.__asked);
  check('desk, lock refused: later clicks do not ask for it again', asked === 0, `${asked} asks`);
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(640 + i * 14, 400);
    await page.waitForTimeout(16);
  }
  await page.mouse.up({ button: 'right' });
  check('desk, lock refused: right-drag looks and ends the look lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:look'), null, 3000));
  check('desk, lock refused: no console errors', problems.length === 0, problems.slice(0, 3).join(' | '));
  await ctx.close();
}

// =================================================================== desktop, keys and mouse
if (!process.env.EVENING) {
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
  const sel0 = (await k.st()).sel;
  await page.keyboard.press('KeyQ');
  check('desk: Q ends the slots lesson', await k.waitFor(() => window.ranch.sim.s.learn.includes('lesson:slots'), null, 2000));
  check('desk: a quick Q switches windows', (await k.st()).sel !== sel0);
  check('desk: back to the feed lesson', await k.lessonOn('feed'));
  // Q steps to the next window that holds something, never onto an empty one (the third playtest's stepped through them).
  await page.evaluate(() => { const s = window.ranch.sim.s; s.slots[0] = { t: 'tuft-clover', n: 3 }; s.slots[1] = { t: null, n: 0 }; s.slots[2] = { t: null, n: 0 }; s.slots[3] = { t: 'cloverhead', n: 2 }; s.sel = 0; });
  const qs = [];
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyQ'); await page.waitForTimeout(120); qs.push((await k.st()).sel); }
  check('desk: a quick Q skips empty windows (0 to 3 to 0 to 3)', qs.join() === '3,0,3', qs.join());
  // (Sweetroot first, so the window tipped out next is nothing the porch downy eats.)
  await page.evaluate(() => { const s = window.ranch.sim.s; s.slots[0] = { t: 'sweetroot', n: 1 }; s.slots[1] = { t: 'cloverhead', n: 1 }; s.slots[3] = { t: null, n: 0 }; s.sel = 0; });
  // Holding Q tips the chosen window out instead of switching.
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(150);
  const before = await k.st();
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyQ');
  await page.waitForTimeout(200);
  const afterQ = await k.st();
  // Not a quick Q (which steps back a window): the chosen window empties, and the next one that holds something is chosen.
  const nextFilled = [1, 2, 3].map((k2) => (before.sel + k2) % before.slots.length).find((i) => i !== before.sel && afterQ.slots[i][0]) ?? before.sel;
  check('desk: holding Q tips the chosen window out, and the next filled window is chosen (not a Q switch)', afterQ.sel === nextFilled && !afterQ.slots[before.sel][0] && !!before.slots[before.sel][0], `${JSON.stringify(before.slots)} sel ${before.sel} -> ${JSON.stringify(afterQ.slots)} sel ${afterQ.sel}`);
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
if (!process.env.EVENING) {
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
if (!process.env.EVENING) {
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
