// Sunup's tap queue on a phone, with real touch through the DevTools protocol
// (round 8). The eighth playtest found four bugs in it: a seed picked while
// taps waited changed what they planted; a second trip to the well in one
// queue was merged away and the can ran dry; the scarecrow lesson's question
// took over a planting tap and the taps after it were lost; a crow tapped
// during a long watering pass waited at the back. And: request chips stacked
// over the field, the pair sat below the fold on the board, the well was off
// screen from the first field, and seed prices wore no coin.
// Checks: four quick carrot taps, then Radish picked in the picker, plant four
// carrots, and the taps after plant radishes; two fields watered in one queue
// with two trips to the well, both made; a crow tapped behind a dozen
// waiting taps is shooed in under four seconds; quick seed taps across the
// scarecrow lesson's target open no question and all plant; a run of picks
// for one request shows one chip, never two over each other; the pair and its
// clash line are on the board's first screen; from the first field the well
// beside it is on screen; every seed price wears the coin.
// node scripts/qa/sunup-queue.mjs [base url]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5247';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const cdp = await ctx.newCDPSession(p);
let tid = 100;
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
const tapAt = async (x, y) => {
  const id = tid++;
  await touch('touchStart', [[x, y, id]]);
  await p.waitForTimeout(40);
  await touch('touchEnd', []);
};
const tapTile = async (x, y) => {
  const pt = await p.evaluate(([x, y]) => window.sunup.r3d.project(x + 0.5, y + 0.5, 0), [x, y]);
  await tapAt(pt.x, pt.y);
};
const tapEl = async (sel) => {
  const r = await p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  if (r) await tapAt(r[0], r[1]);
  return !!r;
};
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
/** Wait until the farmer has nothing left to do, or the time runs out. */
const settle = async (ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const busy = await p.evaluate(() => { const s = window.sunup.state; const f = s.actors[0]; return !!(f.task || f.aim || f.path.length || (s.taps ?? []).length); });
    if (!busy) return;
    await p.waitForTimeout(100);
  }
};

await p.goto(`${base}/?game=homestead&fresh&touch`);
await p.waitForFunction(() => window.sunup && window.sunup.frames > 10);
// A farm past its lessons, two fields owned (the second came with the copper can), at mid-morning.
await p.evaluate(() => {
  const st = window.sunup.state;
  const lessons = ['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'hoe', 'requests', 'sowfor', 'deliver', 'choose', 'field', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'turn', 'smith', 'wide', 'stamina'];
  for (const what of ['can', 'sleep', 'coins', 'seeds', 'stamina', 'board', 'requests', 'pests', 'hoe', 'build', 'forecast', 'wide', ...lessons.map((l) => `lesson:${l}`)]) if (!st.learn.includes(what)) st.learn.push(what);
  st.held = false;
  st.minute = 120;
  // (Spring 3: carrots sown today ripen well before the turn, so the picker has nothing to warn of.)
  st.day = 3;
  st.coins = 2000;
  st.rep = 3;
  st.requested = 1;
  st.orders = [];
  st.crowPlan = [];
  st.weather = 'sun';
  st.forecast = ['sun', 'sun', 'sun'];
  st.parcels[1].owned = true;
  st.tools.can = 1;
  for (const pc of [st.parcels[0], st.parcels[1]]) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) { const q = st.plots[y * st.W + x]; q.tilled = true; q.crop = null; q.wet = false; q.moisture = 0; }
  Object.assign(st.actors[0], { x: 6.5, y: 4.5, facing: 's', task: null, path: [], aim: null });
  window.sunup.hud.pickTool('hands');
  // Every event the farm sends, kept for the checks (the director keeps the first 5,000; this keeps the rest).
  window.__ev = [];
  const d = window.sunup;
  const orig = d.events.push.bind(d.events);
  d.events.push = (e) => { window.__ev.push({ ...e, at: performance.now() }); return orig(e); };
});
await p.waitForTimeout(800);

// 1. Seeds changed while taps wait: Carrot picked, four plots tapped, then Radish picked in the picker.
{
  await tapEl('.toolbar .tool[data-tool="seeds"]');
  await p.waitForTimeout(300);
  await tapEl('.seedbar .seed[data-crop="carrot"]');
  await p.waitForTimeout(300);
  for (const x of [2, 3, 4, 5]) {
    await tapTile(x, 5);
    await p.waitForTimeout(110);
  }
  const waiting = await p.evaluate(() => (window.sunup.state.taps ?? []).length);
  await tapEl('.toolbar .tool[data-tool="seeds"]');
  await p.waitForTimeout(250);
  await tapEl('.seedbar .seed[data-crop="radish"]');
  await p.waitForTimeout(150);
  const seedNow = await p.evaluate(() => window.sunup.state.seed);
  for (const x of [2, 3]) {
    await tapTile(x, 6);
    await p.waitForTimeout(110);
  }
  await settle();
  const row = await p.evaluate(() => { const st = window.sunup.state; return { five: [2, 3, 4, 5].map((x) => st.plots[5 * st.W + x].crop?.kind ?? '-'), six: [2, 3].map((x) => st.plots[6 * st.W + x].crop?.kind ?? '-') }; });
  check('four quick carrot taps, then Radish picked while they wait: four carrots go in, and the next taps plant radishes', waiting >= 2 && seedNow === 'radish' && row.five.join() === 'carrot,carrot,carrot,carrot' && row.six.join() === 'radish,radish', JSON.stringify({ waiting, seedNow, ...row }));
}

// 2. Two fields watered in one queue, with two trips to the well beside them.
{
  await p.evaluate(() => {
    const st = window.sunup.state;
    for (const pc of [st.parcels[0], st.parcels[1]]) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) {
      const q = st.plots[y * st.W + x];
      q.crop = { id: st.nextId++, kind: 'carrot', age: 1, stage: 1, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
      q.wet = false;
      q.moisture = 0;
    }
    st.water = 4;
    st.stamina = 100;
    window.__ev = [];
    window.sunup.hud.pickTool('can');
    Object.assign(st.actors[0], { x: 6.5, y: 4.5, facing: 's', task: null, path: [], aim: null });
  });
  await p.waitForTimeout(400);
  const well = { x: 6, y: 9 };
  const plan = [[2, 5], well, [2, 6], [2, 7], [2, 8], [7, 5], [7, 6], [7, 7], well, [7, 8]];
  let most = 0;
  for (const t of plan) {
    await tapTile(Array.isArray(t) ? t[0] : t.x, Array.isArray(t) ? t[1] : t.y);
    await p.waitForTimeout(120);
    most = Math.max(most, await p.evaluate(() => { const s = window.sunup.state; const f = s.actors[0]; return (s.taps ?? []).filter((q) => q.x === 6 && q.y === 9).length + (f.aim && f.aim.x === 6 && f.aim.y === 9 ? 1 : 0); }));
  }
  await settle(30000);
  const out = await p.evaluate(() => {
    const st = window.sunup.state;
    const dry = [];
    for (const pc of [st.parcels[0], st.parcels[1]]) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) if (!st.plots[y * st.W + x].wet) dry.push(`${x},${y}`);
    return { dry, refills: window.__ev.filter((e) => e.type === 'refill').length, empty: window.__ev.filter((e) => e.type === 'deny' && /empty/i.test(e.reason)).length, waters: window.__ev.filter((e) => e.type === 'water').length };
  });
  check('two fields in one queue with two trips to the well: both trips are made and every crop is watered (the second was merged away)', most === 2 && out.refills === 2 && out.dry.length === 0 && out.empty === 0, JSON.stringify({ wellTripsWaiting: most, ...out }));
}

// 3. A crow tapped behind a dozen waiting taps is shooed first.
{
  await p.evaluate(() => {
    const st = window.sunup.state;
    for (const pc of [st.parcels[0], st.parcels[1]]) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) { const q = st.plots[y * st.W + x]; q.wet = false; q.moisture = 0; }
    st.tools.can = 0;
    st.water = 12;
    st.stamina = 100;
    window.__ev = [];
    window.sunup.hud.pickTool('can');
    Object.assign(st.actors[0], { x: 6.5, y: 4.5, facing: 's', task: null, path: [], aim: null });
  });
  await p.waitForTimeout(300);
  for (let y = 5; y < 8; y++) for (let x = 7; x < 11; x++) {
    await tapTile(x, y);
    await p.waitForTimeout(60);
  }
  const id = await p.evaluate(() => { const st = window.sunup.state; const id = st.nextId++; st.crows.push({ id, x: 3, y: 8, fromX: -3, fromY: 4, phase: 'peck', t: 0 }); return id; });
  await p.waitForTimeout(200);
  const waiting = await p.evaluate(() => (window.sunup.state.taps ?? []).length);
  const t0 = await p.evaluate(() => performance.now());
  await tapTile(3, 8);
  const t1 = Date.now();
  let gone = null;
  while (Date.now() - t1 < 12000 && !gone) {
    gone = await p.evaluate((id) => window.__ev.find((e) => e.type === 'crowScared' && e.id === id)?.at ?? null, id);
    if (!gone) await p.waitForTimeout(80);
  }
  const secs = gone ? (gone - t0) / 1000 : null;
  check('a crow tapped behind a dozen waiting taps is shooed in under four seconds (it waited at the back)', waiting >= 8 && secs !== null && secs < 4, JSON.stringify({ waiting, secs: secs?.toFixed(2) }));
  await settle(40000);
}

// 4. The scarecrow lesson: quick seed taps across its target open no question, and every one plants.
{
  await p.evaluate(() => {
    const st = window.sunup.state;
    st.learn = st.learn.filter((l) => l !== 'lesson:scarecrow' && l !== 'build');
    st.builds = [];
    st.learnCount['done:pests'] = st.day - 1;
    st.day += 0;
    for (const pc of [st.parcels[0]]) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) {
      const q = st.plots[y * st.W + x];
      q.crop = y === 7 || y === 8 ? null : { id: st.nextId++, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
      q.wet = true;
    }
    for (const pc of [st.parcels[1]]) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) { const q = st.plots[y * st.W + x]; q.crop = { id: st.nextId++, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day }; q.wet = true; }
    st.coins = 400;
    st.stamina = 100;
    window.sunup.hud.pickTool('hands');
    Object.assign(st.actors[0], { x: 1.5, y: 7.5, facing: 'e', task: null, path: [], aim: null });
  });
  // Wait for the scarecrow line and its target.
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await p.waitForTimeout(100);
    target = await p.evaluate(() => (window.sunup.tutor.current === 'scarecrow' && window.sunup['lessonTarget']?.build === 'scarecrow' ? window.sunup['lessonTarget'].point : null));
  }
  const tx = target ? Math.floor(target.x) : -1;
  const ty = target ? Math.floor(target.y) : -1;
  await tapEl('.toolbar .tool[data-tool="seeds"]');
  await p.waitForTimeout(300);
  await tapEl('.seedbar .seed[data-crop="radish"]');
  await p.waitForTimeout(300);
  // Seven seed taps along the bare rows, the target fourth (as the tester's fourth sunflower landed on it).
  const row = [[2, 7], [3, 7], [5, 8], [tx, ty], [2, 8], [3, 8], [4, 8]].filter(([x, y], i, a) => a.findIndex(([u, v]) => u === x && v === y) === i);
  let asked = false;
  for (const [x, y] of row) {
    await tapTile(x, y);
    await p.waitForTimeout(120);
    asked ||= await p.evaluate(() => window.sunup.dialogs.open);
  }
  await settle();
  const planted = await p.evaluate((row) => row.map(([x, y]) => window.sunup.state.plots[y * window.sunup.state.W + x].crop?.kind ?? '-'), row);
  check('quick seed taps across the scarecrow lesson’s target: no question opens and every one plants', !!target && !asked && planted.every((k) => k === 'radish'), JSON.stringify({ target, asked, planted }));
  await p.evaluate(() => { window.sunup.dialogs.close(true); const st = window.sunup.state; if (!st.learn.includes('lesson:scarecrow')) st.learn.push('lesson:scarecrow', 'build'); });
}

// 5. A run of picks for one request: one chip, updated in place, never two over each other.
{
  await p.evaluate(() => {
    const st = window.sunup.state;
    const o = { id: st.nextId++, who: 'Old Tamsin', items: [{ crop: 'radish', n: 8 }], reward: 8 * 30 + 120, rep: 1, due: st.day + 2, sowBy: st.day, made: st.day - 3, seen: true, kind: 'easy', taken: true, got: 0 };
    st.orders = [o];
    for (let x = 2; x < 6; x++) for (const y of [5, 6]) {
      const q = st.plots[y * st.W + x];
      q.crop = { id: st.nextId++, kind: 'radish', age: 3, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day - 3, for: o.id };
    }
    st.stamina = 100;
    window.sunup.hud.pickTool('hands');
    Object.assign(st.actors[0], { x: 1.5, y: 5.5, facing: 'e', task: null, path: [], aim: null });
    window.__chips = { most: 0, overlap: 0, texts: new Set() };
    window.__chipProbe = setInterval(() => {
      const els = [...document.querySelectorAll('.floaters .floater:not(.no):not(.coin)')].filter((e) => getComputedStyle(e).opacity > 0.05);
      window.__chips.most = Math.max(window.__chips.most, els.length);
      for (const e of els) window.__chips.texts.add(e.textContent);
      const rs = els.map((e) => e.getBoundingClientRect());
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (rs[i].left < rs[j].right && rs[j].left < rs[i].right && rs[i].top < rs[j].bottom && rs[j].top < rs[i].bottom) window.__chips.overlap++;
    }, 40);
  });
  await p.waitForTimeout(300);
  for (const y of [5, 6]) for (let x = 2; x < 6; x++) {
    await tapTile(x, y);
    await p.waitForTimeout(90);
  }
  await settle();
  await p.waitForTimeout(400);
  const chips = await p.evaluate(() => { clearInterval(window.__chipProbe); return { most: window.__chips.most, overlap: window.__chips.overlap, texts: [...window.__chips.texts] }; });
  check('eight quick picks for one request: one chip at a time, updated in place, never two over each other', chips.most === 1 && chips.overlap === 0 && chips.texts.includes('8 radishes ready'), JSON.stringify(chips));
}

// 6. The board on a phone: the pair and its clash line on the first screen, above the requests already taken.
{
  await p.evaluate(async () => {
    const st = window.sunup.state;
    Object.assign(st, { day: 4, rep: 3, requested: 3, orders: [], coins: 300 });
    for (const pc of [st.parcels[0], st.parcels[1]]) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) { const q = st.plots[y * st.W + x]; q.tilled = true; q.crop = null; }
    const price = { carrot: 55, radish: 30, lettuce: 45 };
    const tiles = [];
    for (const pc of [st.parcels[0], st.parcels[1]]) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) tiles.push([x, y]);
    let tile = 0;
    for (const r of [{ who: 'The lighthouse keeper', crop: 'carrot', n: 6, gain: 150, due: 12 }, { who: 'The Hollow Bend inn', crop: 'radish', n: 9, gain: 170, due: 9 }, { who: 'Old Tamsin', crop: 'lettuce', n: 4, gain: 60, due: 10 }]) {
      const o = { id: st.nextId++, who: r.who, items: [{ crop: r.crop, n: r.n }], reward: r.n * price[r.crop] + r.gain, rep: 1, due: r.due, sowBy: 5, made: 4, seen: true, kind: 'easy', taken: true, got: 0 };
      st.orders.push(o);
      for (let k = 0; k < r.n; k++) { const [x, y] = tiles[tile++]; st.plots[y * st.W + x].crop = { id: st.nextId++, kind: r.crop, age: 1, stage: 1, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: 4, for: o.id }; }
    }
    window.sunup.pinRequests();
    window.sunup.dialogs.board('requests');
    await new Promise((r) => setTimeout(r, 400));
  });
  const q = await p.evaluate(() => {
    const body = document.querySelector('.dialog.on .body');
    const br = body.getBoundingClientRect();
    const bottom = Math.min(br.bottom, innerHeight);
    const pair = body.querySelector('.pair');
    const clash = body.querySelector('.clash');
    const firstTaken = body.querySelector('.item.req.taken');
    return {
      pair: !!pair,
      clash: clash?.textContent ?? '',
      clashInView: !!clash && clash.getBoundingClientRect().bottom <= bottom + 1 && clash.getBoundingClientRect().top >= br.top - 1,
      before: !!pair && !!firstTaken && (pair.compareDocumentPosition(firstTaken) & Node.DOCUMENT_POSITION_FOLLOWING) > 0,
      top: Math.round(body.scrollTop),
    };
  });
  check('the board on a phone: the pair and its clash line on the first screen, before the requests taken', q.pair && q.clashInView && q.before && q.top === 0 && /^Both need/.test(q.clash), JSON.stringify(q));
  await p.screenshot({ path: '/tmp/acres-queue-board.png' });
  await p.evaluate(() => window.sunup.dialogs.close(true));
  await p.waitForTimeout(300);
}

// 7. From the first field, the well beside it is on screen (the yard well sat at the right edge), and the empty-can
// line's chevron sits over it.
{
  await p.evaluate(() => {
    const st = window.sunup.state;
    st.orders = [];
    st.water = 0;
    for (let x = 2; x < 6; x++) { const q = st.plots[6 * st.W + x]; q.crop = { id: st.nextId++, kind: 'carrot', age: 1, stage: 1, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day }; q.wet = false; q.moisture = 0; }
    window.sunup.hud.pickTool('can');
    Object.assign(st.actors[0], { x: 3.5, y: 6.5, facing: 's', task: null, path: [], aim: null });
    window.sunup.walkAim = null;
  });
  await p.waitForTimeout(1500);
  const w = await p.evaluate(() => {
    const q = window.sunup.r3d.project(6.5, 9.5, 0.6);
    const pt = document.querySelector('.tpoint');
    const r = pt.getBoundingClientRect();
    return { x: Math.round(q.x), y: Math.round(q.y), W: innerWidth, H: innerHeight, line: document.querySelector('.hint.on')?.textContent ?? '', over: pt.classList.contains('over') && pt.classList.contains('on'), px: Math.round(r.x + r.width / 2), py: Math.round(r.y + r.height / 2) };
  });
  check('from the first field the well beside it is on screen, and the empty-can line points at it there', w.x > 20 && w.x < w.W - 20 && w.y > 120 && w.y < w.H - 220 && /Fill the can at the well/.test(w.line) && w.over && Math.abs(w.px - w.x) < 60, JSON.stringify(w));
  await p.screenshot({ path: '/tmp/acres-queue-well.png' });
}

// 8. Every seed price wears the coin.
{
  await p.evaluate(() => { window.sunup.state.water = 12; window.sunup.state.day = 3; });
  await tapEl('.toolbar .tool[data-tool="seeds"]');
  await p.waitForTimeout(400);
  const coins = await p.evaluate(() => [...document.querySelectorAll('.seedbar .seed')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => { const c = e.querySelector('.pr .cm svg'); const r = c?.getBoundingClientRect(); return { crop: e.dataset.crop, w: r ? Math.round(r.width) : 0, text: e.querySelector('.pr').textContent }; }));
  check('every seed price in the picker wears the coin', coins.length >= 3 && coins.every((c) => c.w >= 9 && /^\d+ · sells \d+$/.test(c.text)), JSON.stringify(coins));
  await p.screenshot({ path: '/tmp/acres-queue-seeds.png' });
}

check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
console.log(failed ? `QUEUE FAILED (${failed})` : 'QUEUE OK');
process.exit(failed ? 1 : 0);
