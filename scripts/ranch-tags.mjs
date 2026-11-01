// Every hanging tag's words fit on the tag. Builds each kind of post (empty,
// pen with and without upgrades and a feeder, garden bare and growing, silo
// empty and stocked), the workbench, the door, both gates and a chute, takes
// every option the ranch would hang there, and sets its words the way the tag
// painter does, with the game's own font. Fails on any title or note that
// would run past the tag's edge.
//
// Then, played with real touch on the Pixel's viewport: a pen post's five tags
// all hang on screen, their notes at least 12 px; nothing is chosen as they
// come down and Use says "Tap a tag" (the playtest's first Buy spent 300 coins
// on a Silo that sat under the crosshair), sits clear of every tag, and spends
// nothing; a tap chooses and a second takes; a lesson chooses the tag it
// teaches. On a desktop, the view turning onto a tag chooses nothing. The
// gate's board carries words (it was blank), and the sleep tag no "Day 1".
//   node scripts/ranch-tags.mjs [base url]      (or RANCH_URL)
import { launch, openRanch, frames, checker } from './ranch-lib.mjs';

const { check, failed } = checker();
const b = await launch();
const { page } = await openRanch(b, { width: 412, height: 838, dpr: 1, touch: true, query: '&taught' });
await page.waitForFunction(() => window.ranch?.sim, null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await frames(page, 10);

const res = await page.evaluate(() => {
  const g = window.ranch;
  const sim = g.sim;
  const s = sim.s;
  s.coins = 99999;
  s.day = 99;
  const opts = [];
  const take = (it) => {
    for (const o of sim.menu(it)) opts.push({ where: it.kind, title: o.title, price: o.price, note: o.note });
  };
  const post = (id) => ({ kind: 'pad', id, label: '', x: 0, y: 0, z: 0 });
  const pad = s.pads[1];
  const set = (kind, ups = [], extra = {}) => Object.assign(pad, { kind, ups, crop: null, silo: [], feeder: { t: null, n: 0 }, ...extra });
  set('empty');
  take(post(1));
  set('pen');
  take(post(1));
  set('pen', ['feeder'], { feeder: { t: 'cloverhead', n: 12 } });
  take(post(1));
  set('pen', ['feeder', 'high', 'trough', 'hedge', 'chute']);
  take(post(1));
  set('garden');
  take(post(1));
  set('garden', [], { crop: 'dewberry' });
  take(post(1));
  set('silo');
  take({ ...post(1), kind: 'silo' });
  set('silo', [], { silo: [{ t: 'tuft-thistle', n: 50 }, { t: 'sweetroot', n: 50 }, { t: 'dewberry', n: 9 }, { t: 'tuft-brook', n: 1 }] });
  take({ ...post(1), kind: 'silo' });
  take({ kind: 'bench', id: 0, label: '', x: 0, y: 0, z: 0 });
  const up = { ...s.up };
  for (const k of Object.keys(s.up)) s.up[k] = 9;
  take({ kind: 'bench', id: 0, label: '', x: 0, y: 0, z: 0 });
  Object.assign(s.up, up);
  take({ kind: 'door', id: 0, label: '', x: 0, y: 0, z: 0 });
  for (const gate of ['ridge', 'hollow']) {
    s.gates[gate] = false;
    take({ kind: 'gate', id: gate, label: '', x: 0, y: 0, z: 0 });
  }
  return opts.map((o) => ({ ...o, lay: g.tagLayout(o.title, o.price, o.note) }));
});

const over = res.filter((o) => !o.lay.fits);
console.log(`   ${res.length} tag options set`);
for (const o of res) if (o.lay.noteLines.length > 1 || o.lay.titleSize < 40 || o.lay.noteSize < 24) console.log(`   fitted: ${o.where} "${o.title}" ${o.lay.titleSize}px / "${o.lay.noteLines.join(' | ')}" ${o.lay.noteSize}px`);
check('every tag option was found', res.length >= 20, `${res.length}`);
// The control: words that cannot fit any tag must be caught.
const control = await page.evaluate(() => window.ranch.tagLayout('A very long title that runs on', 1500, 'A note far too long to fit on a tag even on two lines at the smallest size'));
check('the check catches words that cannot fit', !control.fits, JSON.stringify(control));
check("every tag's title and note fit on the tag", over.length === 0, over.map((o) => `"${o.title}" / "${o.note}"`).join('; '));

// The workbench's tags hang facing you (they used to hang edge-on), from anywhere you can use it, up to 3.5 m off.
const bench = await page.evaluate(() => {
  const r = window.ranch;
  const s = r.sim.s;
  s.coins = 5000;
  const out = [];
  for (const [x, z] of [[-10.6, 38.0], [-8.0, 39.2], [-7.6, 41.6], [-12.4, 38.5]]) {
    if (r.menuOpen()) r.closeMenu();
    const p = s.player;
    p.x = x; p.z = z; p.y = r.sim.phys.floor(x, z);
    r.aimAt(-10.6, r.sim.phys.floor(-10.6, 41.2) + 1.4, 41.2);
    const near = r.sim.interactable(r.aim);
    const reach = Math.hypot(x + 10.6, z - 41.2);
    if (!near || near.kind !== 'bench') { out.push({ x, z, reach, near: near?.kind ?? null }); continue; }
    r.openMenu(near);
    const tags = r.tags.tags.filter((t) => t.opt);
    const facing = tags.map((t) => {
      t.pivot.updateWorldMatrix(true, false);
      const e = t.pivot.matrixWorld.elements;
      // The tag's front (+z) in the world, against the way to your eye, level.
      const fx = e[8], fz = e[10];
      const dx = p.x - t.pivot.position.x, dz = p.z - t.pivot.position.z;
      return (fx * dx + fz * dz) / (Math.hypot(fx, fz) * Math.hypot(dx, dz));
    });
    out.push({ x, z, reach, near: 'bench', n: tags.length, worst: Math.min(...facing) });
  }
  if (r.menuOpen()) r.closeMenu();
  return out;
});
for (const q of bench) console.log(`   bench from ${q.x},${q.z} (${q.reach.toFixed(1)} m): ${q.near === 'bench' ? `${q.n} tags, worst facing ${q.worst.toFixed(2)}` : `not in reach (${q.near})`}`);
check('the workbench is usable from up to about 3.5 m', bench.every((q) => q.near === 'bench'), bench.filter((q) => q.near !== 'bench').map((q) => `${q.x},${q.z}`).join(' '));
check('every workbench tag faces you (within about 30 degrees)', bench.every((q) => q.near !== 'bench' || q.worst > 0.85), bench.map((q) => (q.worst ?? 0).toFixed(2)).join(' '));

// The sleep tag says what sleeping does, not the day.
const sleepNote = await page.evaluate(() => window.ranch.sim.menu({ kind: 'door', id: 0, label: '', x: 0, y: 0, z: 0 })[0].note);
check('the sleep tag does not read "Day 1, saves the ranch"', !/Day \d/.test(sleepNote), sleepNote);

// The gates' boards carry their words: ink on the painted face (a blank board, the control, has none).
const ink = await page.evaluate(() => {
  const count = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] < 90 && d[i + 1] < 70) n++; return n; };
  const g = window.ranch.props.gates;
  const face = (k) => g[k].tag.children.find((m) => m.material?.map?.image)?.material.map.image;
  const blank = document.createElement('canvas');
  blank.width = 320; blank.height = 160;
  const bg = blank.getContext('2d'); bg.fillStyle = '#cfae7c'; bg.fillRect(0, 0, 320, 160);
  return { ridge: face('ridge') ? count(face('ridge')) : -1, hollow: face('hollow') ? count(face('hollow')) : -1, blank: count(blank) };
});
check('the check finds no words on a blank board (control)', ink.blank === 0, JSON.stringify(ink));
check("the gates' price boards carry words (the ridge gate's was blank)", ink.ridge > 400 && ink.hollow > 400, JSON.stringify(ink));
await b.close();

// =================================================================== tags on the phone, played with real touch
{
  const b2 = await launch();
  const ctx = await b2.newContext({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true });
  const { page: ph } = await openRanch(b2, { query: '&taught', ctx });
  const cdp = await ctx.newCDPSession(ph);
  const tap = async (x, y, id = 3) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id, radiusX: 8, radiusY: 8, force: 1 }] }); await ph.waitForTimeout(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await ph.waitForTimeout(250); };
  await tap(300, 300, 1);
  await ph.waitForTimeout(400);
  const centre = (sel) => ph.evaluate((sel) => { const e = document.querySelector(sel); const r = e?.getBoundingClientRect(); return r && r.width ? [r.x + r.width / 2, r.y + r.height / 2] : null; }, sel);
  const openPost = async () => {
    await ph.evaluate(() => { const r = window.ranch; const p = r.sim.s.player; p.x = 16; p.z = 34; p.y = r.sim.phys.floor(16, 34); r.aimAt(15.2, 5.6, 31.8); });
    await frames(ph, 6);
    const act = await centre('.rt-act.show');
    if (act) await tap(act[0], act[1], 4);
    await ph.waitForTimeout(900);
  };
  // Where each tag is on screen, how big its note reads, and where the Use button sits.
  const layout = () => ph.evaluate(() => {
    const r = window.ranch;
    const tags = r.tags.tags.filter((t) => t.opt && t.gone === 0);
    const rects = tags.map((t) => {
      t.face.updateWorldMatrix(true, false);
      const e = t.face.matrixWorld.elements;
      const pts = [[-0.28, -0.14], [0.28, -0.14], [0.28, 0.14], [-0.28, 0.14]].map(([u, v]) => r.project(e[0] * u + e[4] * v + e[12], e[1] * u + e[5] * v + e[13], e[2] * u + e[6] * v + e[14]));
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      const lay = r.tagLayout(t.opt.title, t.opt.price, t.opt.note);
      const w = Math.max(...xs) - Math.min(...xs);
      return { id: t.opt.id, l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys), note: (lay.noteSize * w) / 320 };
    });
    const a = document.querySelector('.rt-act').getBoundingClientRect();
    const lb = document.querySelector('.rt-act .lb')?.getBoundingClientRect();
    const box = r.tags.screenBox(r.camera, innerWidth, innerHeight, { x0: 0, y0: 0, x1: 0, y1: 0 });
    return { rects, act: { l: a.left, t: a.top, r: a.right, b: Math.max(a.bottom, lb?.bottom ?? 0) }, box, w: innerWidth, h: innerHeight, label: document.querySelector('.rt-act').textContent, choice: r.tagChoice(), coins: r.sim.s.coins };
  });
  const hit = (a, c) => Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0;
  await ph.evaluate(() => { const r = window.ranch; const s = r.sim.s; s.coins = 3000; s.pads[1].kind = 'pen'; s.pads[1].ups = []; r.sim.phys.setPads(s.pads); r.closeMenu(); });
  await openPost();
  let L = await layout();
  console.log(`   phone pen post: ${L.rects.map((q) => `${q.id} ${Math.round(q.l)}..${Math.round(q.r)} x ${Math.round(q.t)}..${Math.round(q.b)} note ${q.note.toFixed(1)} px`).join('; ')}`);
  check('phone: all five of a pen post\'s tags hang on screen (a row of five ran off both edges)', L.rects.length === 5 && L.rects.every((q) => q.l >= 0 && q.r <= L.w && q.t >= 60 && q.b <= L.h), L.rects.map((q) => `${q.id}@${Math.round(q.l)}-${Math.round(q.r)}`).join(' '));
  check('phone: every tag note reads at 12 px or more', L.rects.every((q) => q.note >= 12), L.rects.map((q) => q.note.toFixed(1)).join(' '));
  check('phone: nothing is chosen as the tags come down, and Use says "Tap a tag"', L.choice.hot === -1 && L.label === 'Tap a tag', JSON.stringify(L.choice));
  const bar = L.box ? { l: L.box.x0, t: L.box.y0, r: L.box.x1, b: L.box.y1 } : null;
  check('phone: the Use button (and its word) sits clear of every tag and the bar they hang from', !L.rects.some((q) => hit(L.act, q)) && !(bar && hit(L.act, bar)), JSON.stringify(L.act));
  const c0 = L.coins;
  const act = await centre('.rt-act');
  await tap(act[0], act[1], 5);
  L = await layout();
  check('phone: pressing Use with nothing chosen spends nothing and leaves the tags up', L.coins === c0 && L.rects.length === 5 && (await ph.evaluate(() => window.ranch.menuOpen())), `${c0} to ${L.coins}`);
  const fence = L.rects.find((q) => q.id === 'pen:high');
  await tap((fence.l + fence.r) / 2, (fence.t + fence.b) / 2, 6);
  L = await layout();
  check('phone: a tap on a tag chooses it (Use says Buy) and spends nothing', L.coins === c0 && L.label === 'Buy' && L.choice.hot === 0, `${L.label} ${JSON.stringify(L.choice)} ${c0} to ${L.coins}`);
  await tap((fence.l + fence.r) / 2, (fence.t + fence.b) / 2, 7);
  await ph.waitForTimeout(400);
  const bought = await ph.evaluate(() => window.ranch.sim.s.pads[1].ups.includes('high'));
  check('phone: a second tap on the chosen tag buys it', bought && (await ph.evaluate(() => window.ranch.sim.s.coins)) === c0 - 200);
  await ph.screenshot({ path: '/tmp/ranch-tags-phone.png' });
  // A lesson chooses the tag it teaches: the garden lesson, at an empty plot.
  await ph.evaluate(() => { const r = window.ranch; const s = r.sim.s; r.closeMenu(); s.learn = s.learn.filter((w) => !['lesson:garden', 'lesson:plant', 'garden'].includes(w)); s.coins = 400; s.hour = 10; s.pads[1].kind = 'empty'; s.pads[1].ups = []; r.sim.phys.setPads(s.pads); });
  await ph.waitForFunction(() => window.ranch.seen().lesson === 'garden' && window.ranch.seen().line !== '', null, { timeout: 8000 });
  await openPost();
  L = await layout();
  const chosenId = L.choice.hot >= 0 ? (await ph.evaluate(() => window.ranch.menuOptions()))[L.choice.hot] : null;
  check('phone: the garden lesson\'s tags come down with Garden chosen, and Use says Buy', chosenId === 'build:garden' && L.label === 'Buy', `${chosenId} ${L.label}`);
  await ph.screenshot({ path: '/tmp/ranch-tags-lesson.png' });
  await b2.close();
}

// =================================================================== a desktop: the view turning onto a tag chooses nothing
{
  const b3 = await launch();
  const { page: dk } = await openRanch(b3, { width: 1280, height: 800, query: '&taught&nolock' });
  await dk.evaluate(() => { const r = window.ranch; const s = r.sim.s; s.coins = 3000; const p = s.player; p.x = 16; p.z = 34; p.y = r.sim.phys.floor(16, 34); r.aimAt(15.2, 5.6, 31.8); });
  await frames(dk, 6);
  await dk.keyboard.press('KeyE');
  await dk.waitForTimeout(900);
  // The view turns onto a tag by itself (as the turn towards the tags may land): that is not a choice.
  await dk.evaluate(() => { const r = window.ranch; const t = r.tags.tags[0]; t.face.updateWorldMatrix(true, false); const e = t.face.matrixWorld.elements; r.aimAt(e[12], e[13], e[14]); });
  await frames(dk, 3);
  const d0 = await dk.evaluate(() => { const r = window.ranch; const a = r.aim; return { open: r.menuOpen(), under: r.tags.pick(a.ex, a.ey, a.ez, a.dx, a.dy, a.dz), choice: r.tagChoice(), coins: r.sim.s.coins }; });
  check('desk: the tags come down with the crosshair on one, and nothing is chosen', d0.open && d0.under >= 0 && d0.choice.hot === -1 && d0.choice.label === 'Look at a tag', JSON.stringify(d0));
  await dk.keyboard.press('KeyE');
  await dk.waitForTimeout(500);
  const d1 = await dk.evaluate(() => ({ open: window.ranch.menuOpen(), coins: window.ranch.sim.s.coins, pads: window.ranch.sim.s.pads[1].kind }));
  check('desk: E straight away spends nothing (the tags fold up)', !d1.open && d1.coins === d0.coins && d1.pads === 'empty', JSON.stringify(d1));
  // Looking about yourself chooses what the crosshair is on, and E takes it.
  await dk.keyboard.press('KeyE');
  await dk.waitForTimeout(900);
  await dk.mouse.move(640, 400);
  await dk.mouse.down({ button: 'right' });
  for (let i = 1; i <= 4; i++) await dk.mouse.move(640 + i * 2, 400);
  await dk.mouse.up({ button: 'right' });
  await frames(dk, 3);
  const d2 = await dk.evaluate(() => { const r = window.ranch; const a = r.aim; return { under: r.tags.pick(a.ex, a.ey, a.ez, a.dx, a.dy, a.dz), choice: r.tagChoice() }; });
  check('desk: once you look about, the tag under the crosshair is chosen', d2.under >= 0 && d2.choice.hot === d2.under && d2.choice.label === 'Buy', JSON.stringify(d2));
  await b3.close();
}
console.log(failed() ? `TAGS FAILED (${failed()})` : 'TAGS OK');
process.exit(failed() ? 1 : 0);
