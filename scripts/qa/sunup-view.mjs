// Sunup's two views, measured (round 10: on a phone "the bottom 20% is a
// blank cream band; View barely zooms out, so the two views look nearly the
// same; the two-row seed picker covers a field"; on a desktop "the close
// camera at 1280x800 can't show the field and a well together").
//
// On phones of three sizes it reads, through `window.sunup` and the drawn
// frame's projection: the tiles across the screen in the close view and in
// the View (whole farm), the blank band between the farm's front edge and the
// tool rack in the close view (as a share of the screen), and how many rows
// the seed picker takes with every seed of a season's last days showing. On a
// 1280x800 desktop it stands the farmer on each plot of the first two fields
// (and the path and yard above them) and asks whether the whole field and a well are both in the clear part of
// the screen (below the day card, above the rack).
// And on a phone, the View the farm was left in comes back after a reload.
// Round 11: and on phones with five and six fields, the View's two stops (see below). On a desktop, one more: a click pass
// over a field keeps the camera still.
// node scripts/qa/sunup-view.mjs [base url]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5247';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let fails = 0;
const check = (name, ok, detail) => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

/** A farm past its first lessons, with two fields: what the View lesson comes with. */
const setup = (p) =>
  p.evaluate(() => {
    const s = window.sunup.state;
    for (const w of ['can', 'sleep', 'coins', 'seeds', 'stamina', 'board', 'requests', 'hoe', 'fields', 'wide']) if (!s.learn.includes(w)) s.learn.push(w);
    for (const l of ['pull', 'water', 'well', 'sleep', 'plant', 'stamina', 'requests', 'sowfor', 'deliver', 'choose', 'fair', 'field', 'hoe', 'wide']) s.learn.push(`lesson:${l}`);
    s.parcels[1].owned = true;
    for (const q of s.parcels.slice(0, 2)) for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) s.plots[y * s.W + x].tilled = true;
    s.coins = 900;
    s.held = false;
  });
const stand = (p, x, y) =>
  p.evaluate(([x, y]) => {
    const f = window.sunup.state.actors[0];
    Object.assign(f, { x, y, task: null, path: [], aim: null, facing: 's' });
  }, [x, y]);
const camera = (p, mode) => p.evaluate((mode) => window.sunup.input.push({ type: 'rules', patch: { camera: mode } }), mode);
/** Pixels a tile spans across the screen at a point, from the frame last drawn. */
const tilePx = (p, x, y) =>
  p.evaluate(([x, y]) => {
    const a = window.sunup.r3d.project(x, y, 0);
    const c = window.sunup.r3d.project(x + 1, y, 0);
    return a && c ? Math.hypot(c.x - a.x, c.y - a.y) : 0;
  }, [x, y]);
const rackTop = (p) => p.evaluate(() => document.querySelector('.toolbar').getBoundingClientRect().top);

for (const [w, h] of [[412, 900], [412, 838], [390, 844], [360, 740]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(`${base}/?game=homestead&fresh&touch`);
  await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 180000 });
  await setup(p);
  await camera(p, 'close');
  await stand(p, 4.5, 4.5);
  await p.waitForTimeout(1500);
  const close = w / (await tilePx(p, 4.5, 6.5));
  // The farm's front edge (the hedge row's foot) and the top of the rack.
  const front = await p.evaluate(() => {
    let most = 0;
    for (let x = 2; x <= 11; x++) {
      const q = window.sunup.r3d.project(x, 15.25, 0);
      if (q) most = Math.max(most, q.y);
    }
    return most;
  });
  const rack = await rackTop(p);
  const band = Math.max(0, rack - front) / h;
  await camera(p, 'wide');
  await p.waitForTimeout(1800);
  const wide = w / (await tilePx(p, 9, 9));
  // The smallest plot of the fields owned, across (the lessons check wants 34 px or more: round 9's were 25).
  const plot = await p.evaluate(() => {
    const st = window.sunup.state;
    let size = 99;
    for (const pc of st.parcels.filter((q) => q.owned)) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) {
      const q = window.sunup.r3d.project(x + 0.5, y + 0.5, 0.3);
      const r = window.sunup.r3d.project(x + 1.5, y + 0.5, 0.3);
      if (q && r) size = Math.min(size, Math.hypot(r.x - q.x, r.y - q.y));
    }
    return size;
  });
  await camera(p, 'close');
  // The seed picker in a season's last days (every seed of this season and the next shows).
  const rows = await p.evaluate(async () => {
    const s = window.sunup.state;
    s.day = 8;
    window.sunup.hud.pickTool('seeds');
    await new Promise((r) => setTimeout(r, 400));
    const tops = [...document.querySelectorAll('.seedbar .seed')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().top / 30));
    const r = document.querySelector('.seedbar').getBoundingClientRect();
    window.sunup.hud.pickTool('hands');
    return { rows: new Set(tops).size, cards: tops.length, height: Math.round(r.height) };
  });
  console.log(`phone ${w}x${h}: close ${close.toFixed(1)} tiles across, View ${wide.toFixed(1)} (${(wide / close).toFixed(2)} times; smallest plot ${plot.toFixed(1)} px); blank band under the farm ${(band * 100).toFixed(0)}% (front edge ${Math.round(front)}, rack ${Math.round(rack)}); seed picker ${rows.rows} rows for ${rows.cards} seeds, ${rows.height} px`);
  check(`phone ${w}x${h}: the close view fills the screen down to the rack (blank band under 5%)`, band < 0.05, `${(band * 100).toFixed(1)}%`);
  // (On a narrow phone the close view already shows both fields, 36 px a plot: View goes as far as plots of 34 px allow.)
  check(`phone ${w}x${h}: View shows clearly more of the farm (1.3 times the tiles across, or as many as plots of 34 px allow)`, wide >= close * 1.3 - 0.05 || wide >= w / 36 - 0.15, `${close.toFixed(1)} and ${wide.toFixed(1)}`);
  check(`phone ${w}x${h}: View's plots are 34 px or more across`, plot >= 33.5, `${plot.toFixed(1)} px`);
  check(`phone ${w}x${h}: the seed picker takes at most two rows`, rows.rows <= 2, `${rows.rows} rows`);
  if (w === 412) {
    // Round 10: the View the farm was left in comes back with it on a reload (a phone went back to close up).
    await camera(p, 'wide');
    await p.waitForTimeout(300);
    await p.evaluate(() => window.sunup.save());
    await p.goto(`${base}/?game=homestead&touch`);
    await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 180000 });
    const kept = await p.evaluate(() => window.sunup.state.rules.camera);
    check('phone: the whole-farm View comes back after a reload', kept === 'wide', kept);
  }
  await ctx.close();
}

// Round 11: five and six fields. The View shrank every plot to 27 px, with a third of the screen empty under the farm:
// three columns of fields do not fit a phone's width at a plot a thumb can hit. Now a real tap on View goes to the fields
// the farmer is in, a second to the others, a third back to close up: at each stop plots of 33 px or more, between them
// every plot owned, and little blank under the farm.
for (const [w, h] of [[412, 838], [360, 740], [412, 900]]) {
  for (const fields of [5, 6]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    const tap = async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await p.goto(`${base}/?game=homestead&fresh&touch`);
    await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 180000 });
    await setup(p);
    await p.evaluate((n) => {
      const s = window.sunup.state;
      for (const q of s.parcels.slice(0, n)) {
        q.owned = true;
        for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) s.plots[y * s.W + x].tilled = true;
      }
    }, fields);
    await camera(p, 'close');
    await stand(p, 4.5, 4.5);
    await p.waitForTimeout(1200);
    // What the close view shows of the owned plots, for the record.
    const read = () => p.evaluate(() => {
      const r = window.sunup.r3d;
      const st = window.sunup.state;
      const top = document.querySelector('.daycard').getBoundingClientRect().bottom;
      const rack = document.querySelector('.toolbar').getBoundingClientRect().top;
      let size = 99;
      let front = 0;
      const seen = [];
      for (const pc of st.parcels.filter((q) => q.owned)) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) {
        const a = r.project(x, y + 0.5, 0);
        const c = r.project(x + 1, y + 0.5, 0);
        const m = r.project(x + 0.5, y + 0.5, 0);
        if (m.x >= 0 && m.x <= innerWidth && m.y >= top && m.y <= rack) {
          seen.push(`${x},${y}`);
          size = Math.min(size, Math.hypot(c.x - a.x, c.y - a.y));
        }
      }
      for (let x = 2; x <= 15; x++) front = Math.max(front, r.project(x, 15.25, 0).y);
      return { size, seen, front, rack };
    });
    const closeRead = await read();
    const viewAt = await p.evaluate(() => { const r = document.querySelector('.topbtns .viewbtn').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    const owned = fields * 16;
    await tap(viewAt[0], viewAt[1]);
    await p.waitForTimeout(1500);
    const one = await read();
    await tap(viewAt[0], viewAt[1]);
    await p.waitForTimeout(1500);
    const two = await read();
    const mode2 = await p.evaluate(() => window.sunup.state.rules.camera);
    await tap(viewAt[0], viewAt[1]);
    await p.waitForTimeout(1000);
    const mode3 = await p.evaluate(() => window.sunup.state.rules.camera);
    const both = new Set([...one.seen, ...two.seen]).size;
    const band = Math.max(0, one.rack - one.front) / h;
    console.log(`phone ${w}x${h}, ${fields} fields: close view shows ${closeRead.seen.length} of ${owned} plots; View stop 1 ${one.seen.length} plots at ${one.size.toFixed(1)} px, stop 2 ${two.seen.length} at ${two.size.toFixed(1)} px, together ${both} of ${owned}; blank under the farm ${(band * 100).toFixed(0)}%`);
    check(`phone ${w}x${h}, ${fields} fields: View's plots are 33 px or more across at each stop (they were 27)`, one.size >= 33 && two.size >= 33, `${one.size.toFixed(1)} and ${two.size.toFixed(1)}`);
    check(`phone ${w}x${h}, ${fields} fields: the two stops show every plot owned`, both === owned, `${both} of ${owned}`);
    check(`phone ${w}x${h}, ${fields} fields: little blank under the farm (it was a third of the screen)`, band < 0.2, `${(band * 100).toFixed(1)}%`);
    check(`phone ${w}x${h}, ${fields} fields: a real tap goes to the other stop, the next back to close up`, mode2 === 'wide' && mode3 === 'close', `${mode2}, ${mode3}`);
    await ctx.close();
  }
}

{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(`${base}/?game=homestead&fresh`);
  await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 180000 });
  await setup(p);
  await camera(p, 'close');
  const top = await p.evaluate(() => document.querySelector('.daycard')?.getBoundingClientRect().bottom ?? 90);
  const rack = await rackTop(p);
  let both = 0;
  let n = 0;
  const misses = [];
  for (const [fx0, fy0] of [[2, 5], [7, 5]]) {
    // Each plot of the field, and the path and yard above it (round 10: from the yard the well sat under the rack).
    for (let y = fy0 - 2; y < fy0 + 4; y++) for (let x = fx0; x < fx0 + 4; x++) {
      await stand(p, x + 0.5, y + 0.5);
      await p.waitForTimeout(700);
      const v = await p.evaluate(([fx0, fy0]) => {
        const r = window.sunup.r3d;
        const f = window.sunup.state.actors[0];
        const corners = [[fx0, fy0], [fx0 + 4, fy0], [fx0, fy0 + 4], [fx0 + 4, fy0 + 4]].map(([x, y]) => r.project(x, y, 0));
        // Either well: the yard's (11, 2) or the one where the field paths cross (6, 9), its foot and its roof.
        void f;
        return { corners, wells: [[11, 2], [6, 9]].map((w) => [r.project(w[0] + 0.5, w[1] + 0.5, 0), r.project(w[0] + 0.5, w[1] + 0.5, 1.2)]) };
      }, [fx0, fy0]);
      const inside = (q) => q && q.x >= 0 && q.x <= 1280 && q.y >= top && q.y <= rack;
      const ok = v.corners.every(inside) && v.wells.some((w) => w.every(inside));
      n++;
      if (ok) both++;
      else misses.push(`${x},${y}`);
    }
  }
  console.log(`desktop 1280x800 close view: field and a well both in the clear area from ${both} of ${n} plots${misses.length ? ` (not from ${misses.slice(0, 8).join(' ')})` : ''}`);
  check('desktop 1280x800: from every plot of the first two fields, the whole field and a well show together', both === n, `${both} of ${n}`);
  // Round 11: a click pass over a field holds the camera still (it slid 68 px, and each click chased its plot).
  await p.evaluate(() => {
    const st = window.sunup.state;
    Object.assign(st, { day: 3, coins: 500, weather: 'sun', forecast: ['sun', 'sun', 'sun'], minute: 120, orders: [], crowPlan: [], requested: 1, water: 40 });
    st.tools.can = 0;
    const pc = st.parcels[0];
    for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) { const q = st.plots[y * st.W + x]; q.tilled = true; q.wet = false; q.moisture = 0; q.crop = { id: st.nextId++, kind: 'carrot', age: 1, stage: 1, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day }; }
    Object.assign(st.actors[0], { x: 2.5, y: 4.5, facing: 's', task: null, path: [], aim: null });
    window.sunup.hud.pickTool('can');
  });
  await p.waitForTimeout(1500);
  const proj = (x, y) => p.evaluate(([x, y]) => window.sunup.r3d.project(x + 0.5, y + 0.5, 0), [x, y]);
  const first = await proj(2, 5);
  let far = 0;
  let wet = 0;
  for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) {
    const q = await proj(x, y);
    const at = await proj(2, 5);
    far = Math.max(far, Math.hypot(at.x - first.x, at.y - first.y));
    await p.mouse.click(q.x, q.y);
    await p.waitForTimeout(280);
  }
  for (let k = 0; k < 150; k++) {
    if (!(await p.evaluate(() => { const st = window.sunup.state; const f = st.actors[0]; return !!(f.task || f.aim || f.path.length || (st.taps ?? []).length); }))) break;
    await p.waitForTimeout(100);
  }
  wet = await p.evaluate(() => { const st = window.sunup.state; const pc = st.parcels[0]; let n = 0; for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) if (st.plots[y * st.W + x].wet) n++; return n; });
  check('desktop 1280x800: a click pass over a field keeps the camera still, and every click lands', far <= 24 && wet === 16, `slid ${Math.round(far)} px (it was 68); ${wet} of 16 watered`);
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
