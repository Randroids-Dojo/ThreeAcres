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
await b.close();
console.log(failed() ? `TAGS FAILED (${failed()})` : 'TAGS OK');
process.exit(failed() ? 1 : 0);
