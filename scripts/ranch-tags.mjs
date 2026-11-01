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
//
// From the third playtest: up close to a post at an angle (where the arrow
// leads), every tag stays fully on the phone's screen (with a control that
// hangs them the old way and must run off); a desktop's tag notes read at 12
// px or more (they were about 10); the gate's price tag can be read at night
// (frame readback of ink against plank, with a control that turns its night
// light off); a pen post's count tag and the price board's orders.
//
// From the fourth playtest: a pen post's tags at 9:40 pm and the sleep tag at
// 11:55 pm read at night (the playtest measured a plank at 3 of 255 with ink
// at 1, and 11 with 1), read back the same way with a control that turns the
// tags' night light off; so do the meadow's signpost and the ranch gate's
// sign; the board's morning offers say what they earn; a lone tag (the sleep
// tag) comes down chosen, so one tap takes it; and while tags hang the
// crosshair never covers their words (on touch it goes, with a mouse it is a
// pin-prick ring; the 14 px box read "Sleep till[]norning").
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
  // (Its feed run hangs only with a pen and feeder on the next plot of the row.)
  s.pads[2].kind = 'pen';
  s.pads[2].ups = ['feeder'];
  set('garden', [], { crop: 'dewberry' });
  take(post(1));
  s.pads[2].kind = 'empty';
  s.pads[2].ups = [];
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
  // A pen post's count tag, painted like a tag: in the pen limit, and over it.
  for (const [n, note] of [[8, 'More get frazzled'], [12, 'Too many. They hop out.']]) opts.push({ where: 'count', title: `${n} of 10`, price: null, note });
  return opts.map((o) => ({ ...o, lay: g.tagLayout(o.title, o.price, o.note) }));
});

const over = res.filter((o) => !o.lay.fits);
console.log(`   ${res.length} tag options set`);
for (const o of res) if (o.lay.noteLines.length > 1 || o.lay.titleSize < 40 || o.lay.noteSize < 24) console.log(`   fitted: ${o.where} "${o.title}" ${o.lay.titleSize}px / "${o.lay.noteLines.join(' | ')}" ${o.lay.noteSize}px`);
check('every tag option was found', res.length >= 20, `${res.length}`);
check('the garden post offers the feed run (once a feeder is known, with a pen and feeder next door)', res.some((o) => o.title === 'Feed run'), res.filter((o) => o.where === 'pad').map((o) => o.title).join(', '));
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

// The gate's price tag at night: read the frame back over the tag and compare its plank with its ink.
// (A control turns the tag's night light off: that must read too dark.)
await page.evaluate(() => {
  const r = window.ranch;
  r.closeMenu();
  window.__px = null;
  r.debug.afterFrame = (gl) => {
    const q = window.__want;
    if (!q) return;
    const k = gl.drawingBufferWidth / innerWidth;
    const x0 = Math.max(0, Math.round(q.x0 * k));
    const x1 = Math.min(gl.drawingBufferWidth, Math.round(q.x1 * k));
    const y0 = Math.max(0, Math.round(gl.drawingBufferHeight - q.y1 * k));
    const y1 = Math.min(gl.drawingBufferHeight, Math.round(gl.drawingBufferHeight - q.y0 * k));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 4 || h <= 4) return;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const lum = [];
    for (let i = 0; i < buf.length; i += 4) lum.push(0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]);
    lum.sort((a, b) => a - b);
    // The ink is a small share of the face: its darkest 2% against the plank's 90th percentile.
    window.__px = { p10: lum[Math.floor(lum.length * 0.02)], p90: lum[Math.floor(lum.length * 0.9)], n: lum.length };
    window.__want = null;
  };
});
const readGate = async (hour, lightOff) => {
  await page.evaluate(([hour, lightOff]) => {
    const r = window.ranch;
    const s = r.sim.s;
    s.hour = hour;
    s.gates.ridge = false;
    const p = s.player;
    p.x = -33.2; p.z = -10; p.y = r.sim.phys.floor(-33.2, -10);
    const tag = r.props.gates.ridge.tag;
    const face = tag.children.find((m) => m.material?.map?.image);
    face.material.emissive.setRGB(lightOff ? 0 : 1, lightOff ? 0 : 1, lightOff ? 0 : 1);
    tag.updateWorldMatrix(true, true);
    const e = face.matrixWorld.elements;
    r.aimAt(e[12], e[13], e[14]);
  }, [hour, lightOff]);
  await frames(page, 30);
  await page.evaluate(() => {
    const r = window.ranch;
    const face = r.props.gates.ridge.tag.children.find((m) => m.material?.map?.image);
    face.updateWorldMatrix(true, false);
    const e = face.matrixWorld.elements;
    // The face is 0.64 by 0.32, turned to face out of the gate: its corners in the world, then on screen (the middle 70%).
    const pts = [[-0.22, -0.11], [0.22, -0.11], [0.22, 0.11], [-0.22, 0.11]].map(([u, v]) => r.project(e[0] * u + e[4] * v + e[12], e[1] * u + e[5] * v + e[13], e[2] * u + e[6] * v + e[14]));
    window.__want = { x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) };
  });
  await frames(page, 3);
  return page.evaluate(() => window.__px);
};
const day = await readGate(12, false);
const night = await readGate(23, false);
const dark = await readGate(23, true);
await readGate(23, false);
const ratio = (q) => (q ? (q.p90 / 255 + 0.05) / (q.p10 / 255 + 0.05) : 0);
console.log(`   gate tag, plank (90th) and ink (2nd percentile) luminance: day ${day?.p90.toFixed(0)}/${day?.p10.toFixed(0)} (ratio ${ratio(day).toFixed(1)}), night ${night?.p90.toFixed(0)}/${night?.p10.toFixed(0)} (${ratio(night).toFixed(1)}), night with its light off ${dark?.p90.toFixed(0)}/${dark?.p10.toFixed(0)} (${ratio(dark).toFixed(1)})`);
check('the check finds the gate tag too dark to read at night with its light off (control)', !!dark && (dark.p90 < 60 || ratio(dark) < 2.5), JSON.stringify(dark));
check('the gate\'s price tag reads at night: a lit plank with dark ink on it, near its daytime look', !!night && night.p90 >= 60 && ratio(night) >= 2.5 && night.p90 >= day.p90 * 0.6, JSON.stringify(night));

// Round 4: hanging tags and painted signs at night, read back the same way: the plank (90th percentile)
// against the ink (2nd), by day, at night, and at night with their glow off (the control).
const readRect = async (corners) => {
  await page.evaluate((corners) => {
    const r = window.ranch;
    const pts = corners.map(([x, y, z]) => r.project(x, y, z)).filter(Boolean);
    window.__want = { x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) };
  }, corners);
  await frames(page, 3);
  return page.evaluate(() => window.__px);
};
/** Tag 0's face on a post's (or the door's) tags, opened from where you would stand. */
const readTag = async (hour, where, off) => {
  await page.evaluate(([hour, where, off]) => {
    const r = window.ranch;
    const s = r.sim.s;
    r.closeMenu();
    s.hour = hour;
    s.nettles = [];
    const p = s.player;
    if (where === 'post') {
      s.pads[1].kind = 'pen';
      s.pads[1].ups = [];
      r.sim.phys.setPads(s.pads);
      p.x = 16; p.z = 34; p.y = r.sim.phys.floor(16, 34);
      r.aimAt(15.2, 5.6, 31.8);
    } else {
      p.x = -16; p.z = 37.4; p.y = r.sim.phys.floor(-16, 37.4);
      r.aimAt(-16, r.sim.phys.floor(-16, 39.6) + 1.4, 39.6);
    }
    const near = r.sim.interactable(r.aim);
    if (near) r.openMenu(near);
    for (const m of r.tags.faceMats) m.emissive.setRGB(off ? 0 : 1, off ? 0 : 1, off ? 0 : 1);
  }, [hour, where, off]);
  await page.waitForTimeout(900);
  await frames(page, 20);
  const corners = await page.evaluate(() => {
    const r = window.ranch;
    const t = r.tags.tags.find((q) => q.opt && q.gone === 0);
    if (!t) return null;
    t.face.updateWorldMatrix(true, false);
    const e = t.face.matrixWorld.elements;
    return [[-0.2, -0.09], [0.2, -0.09], [0.2, 0.09], [-0.2, 0.09]].map(([u, v]) => [e[0] * u + e[4] * v + e[12], e[1] * u + e[5] * v + e[13], e[2] * u + e[6] * v + e[14]]);
  });
  const px = corners ? await readRect(corners) : null;
  await page.evaluate(() => { const r = window.ranch; for (const m of r.tags.faceMats) m.emissive.setRGB(1, 1, 1); r.closeMenu(); });
  return px;
};
/** A painted sign: the meadow's signpost (its ridge board) or the ranch gate's teaching sign, from a few metres in front. */
const readSign = async (hour, which, off) => {
  const corners = await page.evaluate(([hour, which, off]) => {
    const r = window.ranch;
    const s = r.sim.s;
    r.closeMenu();
    s.hour = hour;
    s.nettles = [];
    const signs = r.scene.getObjectByName('signs');
    signs.material.emissive.setRGB(off ? 0 : 1, off ? 0 : 1, off ? 0 : 1);
    const f = r.sim.phys.floor;
    const p = s.player;
    let c;
    let hw;
    let hh;
    if (which === 'signpost') {
      const x = 1.3;
      const z = -3.4;
      const y = f.call(r.sim.phys, x, z);
      c = [x - 0.62, y + 2.55, z + 0.001];
      hw = 0.45;
      hh = 0.06;
      p.x = c[0]; p.z = z + 3.6;
    } else {
      const x = 3.6;
      const z = 19.8;
      const y = f.call(r.sim.phys, x, z);
      c = [x, y + 1.25, z + 0.02];
      hw = 0.38;
      hh = 0.26;
      p.x = x; p.z = z + 3.4;
    }
    p.y = f.call(r.sim.phys, p.x, p.z);
    r.aimAt(c[0], c[1], c[2]);
    return [[c[0] - hw, c[1] - hh, c[2]], [c[0] + hw, c[1] - hh, c[2]], [c[0] + hw, c[1] + hh, c[2]], [c[0] - hw, c[1] + hh, c[2]]];
  }, [hour, which, off]);
  await frames(page, 30);
  const px = await readRect(corners);
  await page.evaluate(() => window.ranch.scene.getObjectByName('signs').material.emissive.setRGB(1, 1, 1));
  return px;
};
// Read at night about as by day: a plank lit to most of its daytime brightness, with its ink as plain against it
// (the signpost's light letters on dark boards have less contrast by day too).
const lit = (q, dayQ) => !!q && !!dayQ && q.p90 >= 60 && q.p90 >= dayQ.p90 * 0.6 && ratio(q) >= Math.max(1.5, ratio(dayQ) * 0.85);
const show = (q) => (q ? `${q.p90.toFixed(0)}/${q.p10.toFixed(0)} (${ratio(q).toFixed(1)})` : 'none');
for (const [name, read, dayH, nightH] of [
  ['a pen post\'s tag at 9:40 pm', (h, off) => readTag(h, 'post', off), 12, 21 + 40 / 60],
  ['the sleep tag at 11:55 pm', (h, off) => readTag(h, 'door', off), 12, 23 + 55 / 60],
  ["the meadow's signpost at 11 pm", (h, off) => readSign(h, 'signpost', off), 12, 23],
  ["the ranch gate's sign at 11 pm", (h, off) => readSign(h, 'teach', off), 12, 23],
]) {
  const qd = await read(dayH, false);
  const qn = await read(nightH, false);
  const qo = await read(nightH, true);
  console.log(`   ${name}: plank/ink by day ${show(qd)}, at night ${show(qn)}, at night with its glow off ${show(qo)}`);
  check(`the check finds ${name} too dark to read with its glow off (control)`, !lit(qo, qd), show(qo));
  check(`${name} reads about as it does by day`, lit(qn, qd), `${show(qn)} against ${show(qd)}`);
}

// A pen post's count tag: up once the pen limit is taught, counting the pen; and the price board's orders.
const counted = await page.evaluate(() => {
  const r = window.ranch;
  const s = r.sim.s;
  s.hour = 10;
  s.pads[1].kind = 'pen';
  s.pads[1].ups = [];
  r.sim.phys.setPads(s.pads);
  s.downies = s.downies.filter((d) => d.keep);
  for (let k = 0; k < 8; k++) r.sim.spawn('clover', 17 + Math.cos(k) * 2, 26.5 + Math.sin(k) * 2, true);
  r.sim.postOrders(true);
  return null;
});
void counted;
await frames(page, 6);
const tagSays = await page.evaluate(() => ({ count: window.ranch.pads.countTag(1), board: window.ranch.boardOrders() }));
check('a pen post\'s count tag says how many are in it, of ten', tagSays.count === '8', JSON.stringify(tagSays));
check('the price board chalks up the morning\'s offers: what, by dusk, and what each earns', tagSays.board.length >= 2 && tagSays.board.every((t) => /^\d+ clover (fluff|downies) by dusk, earns [\d,]+$/.test(t)), JSON.stringify(tagSays.board));
// The board's tags: one per offer, its note saying what it earns, fitting the tag.
const boardTags = await page.evaluate(() => {
  const r = window.ranch;
  const opts = r.sim.menu({ kind: 'board', id: 0, label: '', x: 0, y: 0, z: 0 });
  return opts.map((o) => ({ id: o.id, title: o.title, note: o.note, fit: r.tagLayout(o.title, o.price, o.note).fits }));
});
check("the board's tags: one per offer, saying what it earns, every word on the tag", boardTags.length >= 2 && boardTags.every((t) => /^Earns [\d,]+ (more )?by dusk$/.test(t.note) && t.fit !== false), JSON.stringify(boardTags));
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
  // Up close to the post at an angle, where the arrow leads: every tag stays fully on screen (the third playtest's ran off).
  const angled = [];
  for (const [dist, ang] of [[1.0, 0], [1.2, -55], [1.2, 55], [1.6, -75], [1.6, 75], [2.2, -35], [0.9, 40]]) {
    await ph.evaluate(([dist, ang]) => {
      const r = window.ranch;
      const s = r.sim.s;
      r.closeMenu();
      s.pads[1].ups = [];
      const px = 14.8 + 1.0;
      const pz = 31.8;
      const a = (ang * Math.PI) / 180;
      const p = s.player;
      p.x = px + Math.sin(a) * dist; p.z = pz + Math.cos(a) * dist; p.y = r.sim.phys.floor(p.x, p.z);
      r.aimAt(px, r.sim.phys.floor(px, pz) + 1.6, pz);
      const near = r.sim.interactable(r.aim);
      if (near) r.openMenu(near);
    }, [dist, ang]);
    await ph.waitForTimeout(800);
    const q = await layout();
    angled.push({ dist, ang, n: q.rects.length, out: q.rects.filter((t) => t.l < 0 || t.r > q.w || t.t < 60 || t.b > q.h).map((t) => `${t.id} ${Math.round(t.l)}..${Math.round(t.r)}x${Math.round(t.t)}..${Math.round(t.b)}`), note: Math.min(...q.rects.map((t) => t.note)) });
    if (dist === 1.2 && ang === 55) await ph.screenshot({ path: '/tmp/ranch-tags-angled.png' });
  }
  for (const q of angled) console.log(`   phone at ${q.dist} m, ${q.ang} deg: ${q.n} tags, smallest note ${q.note.toFixed(1)} px${q.out.length ? `, off screen: ${q.out.join('; ')}` : ''}`);
  check('phone: up close to a post at an angle, every tag hangs fully on screen', angled.every((q) => q.n === 5 && !q.out.length), angled.filter((q) => q.out.length || q.n !== 5).map((q) => `${q.dist}m ${q.ang}deg`).join(' '));
  check('phone: up close, notes still read at 12 px or more', angled.every((q) => q.note >= 12), angled.map((q) => q.note.toFixed(1)).join(' '));
  // The control: the same tags hung the old way (as near as 1.2 m, full size) from up close run off the screen.
  const ctl = await ph.evaluate(() => {
    const r = window.ranch;
    const s = r.sim.s;
    r.closeMenu();
    const p = s.player;
    p.x = 15.8; p.z = 33.0; p.y = r.sim.phys.floor(15.8, 33.0);
    r.aimAt(15.8, r.sim.phys.floor(15.8, 31.8) + 1.6, 31.8);
    r.openMenu(r.sim.interactable(r.aim));
    const m = r.menu;
    const e = r.eye;
    const dx = m.rail.x - e.x;
    const dz = m.rail.z - e.z;
    const l = Math.hypot(dx, dz);
    const D = Math.max(1.2, Math.min(1.8, l));
    const rail = { ...m.rail, x: e.x + (dx / l) * D, z: e.z + (dz / l) * D, y: e.y + 0.24 };
    r.tags.show(rail, r.tags.opts, true, 2, 1);
    return D;
  });
  await ph.waitForTimeout(800);
  const cq = await layout();
  const cOut = cq.rects.filter((t) => t.l < 0 || t.r > cq.w || t.t < 60 || t.b > cq.h).length;
  check('phone: the check catches tags hung full size up close running off the screen (control)', cOut > 0, `${cOut} of ${cq.rects.length} off at ${ctl.toFixed(2)} m`);
  await ph.evaluate(() => window.ranch.closeMenu());
  // A lesson chooses the tag it teaches: the garden lesson, at an empty plot.
  await ph.evaluate(() => { const r = window.ranch; const s = r.sim.s; r.closeMenu(); s.learn = s.learn.filter((w) => !['lesson:garden', 'lesson:plant', 'garden'].includes(w)); s.coins = 400; s.hour = 10; s.pads[1].kind = 'empty'; s.pads[1].ups = []; r.sim.phys.setPads(s.pads); });
  await ph.waitForFunction(() => window.ranch.seen().lesson === 'garden' && window.ranch.seen().line !== '', null, { timeout: 8000 });
  await openPost();
  L = await layout();
  const chosenId = L.choice.hot >= 0 ? (await ph.evaluate(() => window.ranch.menuOptions()))[L.choice.hot] : null;
  check('phone: the garden lesson\'s tags come down with Garden chosen, and Use says Buy', chosenId === 'build:garden' && L.label === 'Buy', `${chosenId} ${L.label}`);
  await ph.screenshot({ path: '/tmp/ranch-tags-lesson.png' });
  // A lone tag comes down chosen: the sleep tag, one tap on Use and you sleep (it took two). The crosshair is gone
  // while the tags hang on touch (a tap chooses), so it never sits on their words.
  await ph.evaluate(() => { const r = window.ranch; r.closeMenu(); const s = r.sim.s; s.hour = 21; s.nettles = []; const p = s.player; p.x = -16; p.z = 37.4; p.y = r.sim.phys.floor(-16, 37.4); r.aimAt(-16, r.sim.phys.floor(-16, 39.6) + 1.4, 39.6); });
  await frames(ph, 6);
  const door = await centre('.rt-act.show');
  if (door) await tap(door[0], door[1], 8);
  await ph.waitForTimeout(900);
  L = await layout();
  const crossShown = await ph.evaluate(() => { const c = document.querySelector('.rh-cross'); return getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().width > 0; });
  check('phone: the sleep tag, alone, comes down chosen and Use says Sleep', L.choice.hot === 0 && L.label === 'Sleep', `${JSON.stringify(L.choice)} ${L.label}`);
  check('phone: no crosshair over the tags while they hang (a tap chooses)', !crossShown);
  const day0 = await ph.evaluate(() => window.ranch.sim.s.day);
  const act2 = await centre('.rt-act');
  await tap(act2[0], act2[1], 9);
  await ph.waitForTimeout(600);
  check('phone: one tap on Use sleeps till morning', (await ph.evaluate(() => window.ranch.sim.s.day)) === day0 + 1);
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
  // A desktop's tag notes read at 12 px or more (they were about 10 on the posts' rails), and every tag is on screen.
  await dk.evaluate(() => { const r = window.ranch; r.closeMenu(); const s = r.sim.s; s.pads[1].kind = 'pen'; s.pads[1].ups = []; r.sim.phys.setPads(s.pads); const p = s.player; p.x = 16; p.z = 34; p.y = r.sim.phys.floor(16, 34); r.aimAt(15.2, 5.6, 31.8); });
  await frames(dk, 4);
  await dk.keyboard.press('KeyE');
  await dk.waitForTimeout(900);
  const dn = await dk.evaluate(() => {
    const r = window.ranch;
    return r.tags.tags.filter((t) => t.opt && t.gone === 0).map((t) => {
      t.face.updateWorldMatrix(true, false);
      const e = t.face.matrixWorld.elements;
      const pts = [[-0.28, -0.14], [0.28, -0.14], [0.28, 0.14], [-0.28, 0.14]].map(([u, v]) => r.project(e[0] * u + e[4] * v + e[12], e[1] * u + e[5] * v + e[13], e[2] * u + e[6] * v + e[14]));
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      const w = Math.max(...xs) - Math.min(...xs);
      const lay = r.tagLayout(t.opt.title, t.opt.price, t.opt.note);
      return { id: t.opt.id, note: (lay.noteSize * w) / 320, on: Math.min(...xs) >= 0 && Math.max(...xs) <= innerWidth && Math.min(...ys) >= 0 && Math.max(...ys) <= innerHeight };
    });
  });
  console.log(`   desk pen post notes: ${dn.map((q) => `${q.id} ${q.note.toFixed(1)} px`).join(', ')}`);
  check('desk: every tag note reads at 12 px or more (they were about 10)', dn.length === 5 && dn.every((q) => q.note >= 12), dn.map((q) => q.note.toFixed(1)).join(' '));
  check('desk: every tag is on screen', dn.every((q) => q.on));
  const pr = await dk.evaluate(() => {
    const r = window.ranch;
    const p = document.querySelector('.rh-prompt').getBoundingClientRect();
    const box = r.tags.screenBox(r.camera, innerWidth, innerHeight, { x0: 0, y0: 0, x1: 0, y1: 0 });
    return { p: { l: p.left, t: p.top, r: p.right, b: p.bottom }, box };
  });
  check('desk: the use prompt sits clear of the tags (it lay over their words)', !!pr.box && !(Math.min(pr.p.r, pr.box.x1) > Math.max(pr.p.l, pr.box.x0) && Math.min(pr.p.b, pr.box.y1) > Math.max(pr.p.t, pr.box.y0)), JSON.stringify(pr));
  // While the tags hang, the crosshair is a pin-prick ring, far smaller than a letter (the 14 px box covered one).
  const cr = await dk.evaluate(() => {
    const c = document.querySelector('.rh-cross');
    const g = c.querySelector(`.x-${c.dataset.s}`);
    const b = g ? g.getBoundingClientRect() : null;
    return { s: c.dataset.s, w: b ? b.width : 0, h: b ? b.height : 0 };
  });
  check('desk: while tags hang the crosshair is a ring of 5 px or less, smaller than the words on a tag', cr.s === 'tag' && cr.w > 0 && cr.w <= 5 && cr.h <= 5, JSON.stringify(cr));
  await dk.screenshot({ path: '/tmp/ranch-tags-desk.png' });
  await b3.close();
}
console.log(failed() ? `TAGS FAILED (${failed()})` : 'TAGS OK');
process.exit(failed() ? 1 : 0);
