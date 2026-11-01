// Every hanging tag's words fit on the tag. Builds each kind of post (empty,
// pen with and without upgrades and a feeder, garden bare and growing, silo
// empty and stocked), the workbench, the door, both gates and a chute, takes
// every option the ranch would hang there, and sets its words the way the tag
// painter does, with the game's own font. Fails on any title or note that
// would run past the tag's edge.
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
await b.close();
console.log(failed() ? `TAGS FAILED (${failed()})` : 'TAGS OK');
process.exit(failed() ? 1 : 0);
