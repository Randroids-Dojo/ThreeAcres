// Thistledown, round 10: the pen's P1s and Pull's sorting with real touch on the
// phone, the whole way through the game's input and view. The tests drive the
// sim's controls; this presses the real buttons and aims the real camera.
//   A clover pen with a feeder of sweetroots (the tenth playtest's, stuck for two
//     and a half days): its tag says how to empty it, the crosshair shows a Pull
//     at the hopper, a held Pull takes all 12 into the jar and no clover with them.
//   A feeder holding sweetroots takes clover heads with a real Blow.
//   First embers blown into a clover pen: the sack lies on the pen floor, away from
//     the fluff by the gate, and never goes into the clover pen's feeder.
//   The playtest's day 2 (435 coins, 3 embers aboard, a clover pen of six), lessons
//     on: the page says "Build a pen for your embers." with the arrow on a plot,
//     not the jar; Use there buys the pen with the Pen tag chosen for you; blown
//     in, they get their own feeder and sack, and the line goes.
//   Pull at a mixed pen: two embers, aimed at one at a time, and nothing else.
//   An empty Blow at a pest: 5.3 m off it goes rolling with no note, 9 m off it says
//     "Get closer.", and with no pest in front "Nothing in the jar."
//   RANCH_URL=http://localhost:5247 node scripts/ranch-pen-real.mjs
import { launch, openRanch, frames, touchSession, checker } from './ranch-lib.mjs';

const { check, failed } = checker();
const b = await launch();
const VIEW = { width: 412, height: 915, dpr: 2.6, touch: true };

/** Clean ranch: a clover pen on pad 1 at 10 am, nothing about, the jar empty. */
const SETUP = ({ clovers = 6, feeder = null, ups = ['feeder'] }) => {
  const r = window.ranch;
  const sim = r.sim;
  const s = sim.s;
  r.closeMenu();
  s.hour = 10;
  s.nettles = [];
  for (const d of s.downies) d.gone = true;
  for (const it of s.items) it.gone = true;
  for (const q of s.slots) { q.t = null; q.n = 0; delete q.downs; delete q.mix; }
  s.pads[1].kind = 'pen';
  s.pads[1].ups = ups;
  s.pads[1].feeder = feeder ?? { t: null, n: 0 };
  sim.phys.setPads(s.pads);
  for (let i = 0; i < clovers; i++) {
    const d = sim.spawn('clover', 17 + Math.cos(i) * 2, 26.5 + Math.sin(i) * 2, true);
    d.pen = 1;
    d.hunger = 0.1;
  }
};

const JAR = () => {
  const s = window.ranch.sim.s;
  const n = (t) => s.slots.reduce((a, q) => a + (q.t === t ? q.n : 0), 0);
  return { root: n('sweetroot'), head: n('cloverhead'), clover: n('clover'), ember: n('ember'), fluff: s.slots.reduce((a, q) => a + (q.t && q.t.startsWith('tuft') ? q.n : 0), 0) };
};
const HOPPER = { x: 17 + 4.4 * 0.72, z: 26.5 + 4.4 * 0.69 };

async function kit(page, ctx) {
  const t = await touchSession(ctx, page);
  const centre = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.x + r.width / 2, r.y + r.height / 2] : null; }, sel);
  const hold = async (sel, ms, during) => {
    const c = await centre(sel);
    if (!c) return false;
    await t.send('touchStart', [[c[0], c[1], 21]]);
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (during && (await during())) break;
      await page.waitForTimeout(80);
    }
    await t.send('touchEnd', []);
    await page.waitForTimeout(80);
    return true;
  };
  const waitFor = async (fn, arg, ms = 6000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await page.evaluate(fn, arg)) return true;
      await page.waitForTimeout(80);
    }
    return false;
  };
  const place = (x, z, ax, ay, az) => page.evaluate(([x, z, ax, ay, az]) => {
    const r = window.ranch;
    const p = r.sim.s.player;
    p.x = x; p.z = z; p.y = r.sim.phys.floor(x, z); p.vx = p.vz = p.vy = 0;
    r.aimAt(ax, ay < 0 ? r.sim.phys.floor(ax, az) - ay : ay, az);
  }, [x, z, ax, ay, az]);
  return { hold, centre, waitFor, place, t };
}

// ---------------------------------------------------------------- the feeder
{
  const { ctx, page, problems } = await openRanch(b, VIEW);
  const k = await kit(page, ctx);
  await page.evaluate(SETUP, { feeder: { t: 'sweetroot', n: 12 } });
  await k.place(HOPPER.x + 1.2, HOPPER.z + 1.2, HOPPER.x, -1.55, HOPPER.z);
  await frames(page, 4);
  const look = await page.evaluate(() => {
    const r = window.ranch;
    return { cross: document.querySelector('.rh-cross').dataset.s, note: r.sim.menu({ kind: 'pad', id: 1, label: '', x: 0, y: 0, z: 0 }).find((o) => o.id === 'info')?.note };
  });
  check('a clover pen\'s feeder of sweetroots: its tag says how to empty it', look.note === 'Pull at the top to empty it', JSON.stringify(look));
  check('the crosshair shows a Pull at the hopper', look.cross === 'target', JSON.stringify(look));
  await k.hold('.rt-draw', 6000, () => page.evaluate(() => { const f = window.ranch.sim.s.pads[1].feeder; return f.n + (f.n2 ?? 0) === 0 && window.ranch.sim.s.slots.reduce((a, q) => a + (q.t === 'sweetroot' ? q.n : 0), 0) >= 12; }));
  const got = await page.evaluate(JAR);
  const left = await page.evaluate(() => { const s = window.ranch.sim.s; return { feeder: s.pads[1].feeder.n + (s.pads[1].feeder.n2 ?? 0), penned: s.downies.filter((d) => !d.gone && d.pen === 1).length }; });
  check('a real Pull at the hopper empties it: 12 sweetroots in the jar, no clover', left.feeder === 0 && got.root === 12 && got.clover === 0 && left.penned === 6, JSON.stringify({ got, left }));

  // A real Blow of clover heads at a feeder holding sweetroots: in they go, as a second food.
  await page.evaluate(SETUP, { feeder: { t: 'sweetroot', n: 5 } });
  await page.evaluate(() => { const sim = window.ranch.sim; const s = sim.s; for (let i = 0; i < 3; i++) sim.stow('cloverhead'); s.sel = s.slots.findIndex((q) => q.t === 'cloverhead'); });
  const up = await page.evaluate(({ x, z }) => {
    const r = window.ranch;
    const sim = r.sim;
    const pl = sim.s.player;
    pl.x = x + 1; pl.z = z + 4.6; pl.y = sim.phys.floor(pl.x, pl.z);
    const hy = sim.phys.floor(x, z) + 1.55;
    for (let up = -0.4; up <= 1.6; up += 0.05) {
      r.aimAt(x, hy + up, z);
      if (sim.aimTarget(r.aim) === 'feeder') return up;
    }
    return null;
  }, HOPPER);
  check('with clover heads chosen the crosshair marks the feeder that holds sweetroots', up !== null, String(up));
  await frames(page, 3);
  await k.hold('.rt-puff', 90);
  const both = await k.waitFor(() => { const f = window.ranch.sim.s.pads[1].feeder; return f.t === 'sweetroot' && f.t2 === 'cloverhead' && f.n2 >= 1; }, null, 3000);
  check('a real Blow puts clover heads in beside the sweetroots', both, JSON.stringify(await page.evaluate(() => window.ranch.sim.s.pads[1].feeder)));

  // First embers blown into the clover pen, whose feeder is empty: the tester's P1.
  await page.evaluate(SETUP, {});
  await page.evaluate(() => { const s = window.ranch.sim.s; s.slots[0] = { t: 'ember', n: 2, downs: [{ h: 0.3, c: s.day }, { h: 0.3, c: s.day }] }; s.sel = 0; });
  await k.place(17, 34.5, 17, 6.6, 26.5);
  await frames(page, 4);
  for (let i = 0; i < 3 && (await page.evaluate(() => window.ranch.sim.s.slots.some((q) => q.t === 'ember' && q.n > 0))); i++) {
    await k.hold('.rt-puff', 90);
    await page.waitForTimeout(500);
  }
  await k.waitFor(() => window.ranch.sim.s.downies.filter((d) => !d.gone && d.kind === 'ember' && d.pen === 1).length >= 1, null, 5000);
  const sack = await page.evaluate(() => {
    const s = window.ranch.sim.s;
    const roots = s.items.filter((it) => !it.gone && it.type === 'sweetroot' && window.ranch.sim.phys.penAt(it.x, it.z) === 1);
    return { feeder: s.pads[1].feeder, n: roots.length, zMax: Math.max(...roots.map((it) => it.z)), say: document.querySelector('.rh-say')?.textContent ?? '' };
  });
  check('first embers in the clover pen: 12 sweetroots on its floor, on the far side from the gate, none in its feeder', sack.n === 12 && !sack.feeder.t && sack.zMax < 28, JSON.stringify(sack));
  check('no console problems (feeder)', problems.length === 0, problems.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- the jar waits, the pen line first (lessons on)
{
  const { ctx, page, problems } = await openRanch(b, { ...VIEW, lessons: true });
  const k = await kit(page, ctx);
  await page.evaluate(SETUP, { feeder: { t: 'cloverhead', n: 20 } });
  await page.evaluate(() => {
    const r = window.ranch;
    const s = r.sim.s;
    s.day = 2;
    s.night = 2;
    s.orderDay = 2;
    s.hour = 14;
    s.orders = [];
    s.gates.ridge = true;
    r.sim.phys.gates = { ...s.gates };
    for (const l of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'jump', 'run', 'ease', 'farm', 'order', 'dusk', 'night', 'ups', 'feeder', 'garden', 'plant', 'gates']) if (!s.learn.includes(`lesson:${l}`)) s.learn.push(`lesson:${l}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'ease', 'orders', 'time', 'evening', 'clock', 'sleep', 'nettles', 'up:hedge', 'up:feeder', 'garden', 'gates']) if (!s.learn.includes(f)) s.learn.push(f);
    s.coins = 435;
    s.slots[1] = { t: 'ember', n: 3, downs: [0, 1, 2].map(() => ({ h: 0.3, c: 2 })) };
    s.sel = 1;
    const p = s.player;
    p.x = 4; p.z = 34; p.y = r.sim.phys.floor(4, 34);
  });
  const lined = await k.waitFor(() => window.ranch.seen().line === 'Build a pen for your embers.', null, 4000);
  const page1 = await page.evaluate(() => ({ line: window.ranch.seen().line, page: document.querySelector('.rh-page.up')?.textContent ?? '', mark: window.ranch.tutor.mark.on, x: window.ranch.tutor.mark.x, z: window.ranch.tutor.mark.z, tag: window.ranch.tutor.tag }));
  check('435 coins, 3 embers aboard: the page says "Build a pen for your embers.", with the arrow, not the jar', lined && page1.page.includes('Build a pen for your embers.') && page1.mark && !/bigger jar/.test(page1.page), JSON.stringify(page1));
  check('the pen line chooses the Pen tag', page1.tag === 'build:pen', String(page1.tag));
  // Where the arrow is: which plot, then real taps on Use and the chosen tag's Buy.
  const plot = await page.evaluate(({ x, z }) => {
    const s = window.ranch.sim.s;
    const pads = [[6, 26.5], [17, 26.5], [28, 26.5], [6, 43.5], [17, 43.5], [28, 43.5]];
    let best = -1;
    let bd = 1e9;
    pads.forEach(([px, pz], i) => {
      const postZ = i < 3 ? pz + 5.3 : pz - 5.3;
      const d = Math.hypot(px - 2.2 - x, postZ - z);
      if (d < bd) { bd = d; best = i; }
    });
    return { i: best, kind: s.pads[best].kind, bd };
  }, page1);
  check('the arrow stands on an empty plot', plot.kind === 'empty' && plot.bd < 2, JSON.stringify(plot));
  const pads = [[6, 26.5], [17, 26.5], [28, 26.5], [6, 43.5], [17, 43.5], [28, 43.5]];
  const [px, pz] = pads[plot.i];
  const postZ = plot.i < 3 ? pz + 5.3 : pz - 5.3;
  const standZ = plot.i < 3 ? postZ + 2 : postZ - 2;
  await k.place(px - 1.4, standZ, px - 2.2 + 0.6, -1.6, postZ);
  await frames(page, 5);
  const opened = await k.centre('.rt-act.show');
  check('Use shows at the plot\'s post', !!opened, String(opened));
  if (opened) {
    await k.t.send('touchStart', [[opened[0], opened[1], 22]]);
    await page.waitForTimeout(60);
    await k.t.send('touchEnd', []);
  }
  await k.waitFor(() => window.ranch.menuOpen(), null, 3000);
  await page.waitForTimeout(700);
  const buy = await k.centre('.rt-act.show');
  const label = await page.evaluate(() => document.querySelector('.rt-act.show .lb')?.textContent ?? '');
  check('the tags come down with Pen chosen: Use says Buy', /Buy/.test(label), label);
  if (buy) {
    await k.t.send('touchStart', [[buy[0], buy[1], 23]]);
    await page.waitForTimeout(60);
    await k.t.send('touchEnd', []);
  }
  const built = await k.waitFor((i) => window.ranch.sim.s.pads[i].kind === 'pen', plot.i, 3000);
  check('a real Buy builds the pen', built, await page.evaluate((i) => window.ranch.sim.s.pads[i].kind, plot.i));
  await page.evaluate(() => { const r = window.ranch; r.closeMenu(); });
  // Blown in: their own feeder and sack, and the line goes.
  const laneZ = plot.i < 3 ? pz + 8 : pz - 8;
  await k.place(px, laneZ, px, 6.6, pz);
  await frames(page, 4);
  for (let i = 0; i < 5 && (await page.evaluate(() => window.ranch.sim.s.slots.some((q) => q.t === 'ember' && q.n > 0))); i++) {
    await k.hold('.rt-puff', 90);
    await page.waitForTimeout(500);
  }
  await k.waitFor((i) => window.ranch.sim.s.downies.filter((d) => !d.gone && d.pen === i && d.kind === 'ember').length >= 3, plot.i, 6000);
  const home = await page.evaluate((i) => { const r = window.ranch; const s = r.sim.s; return { embers: s.downies.filter((d) => !d.gone && d.pen === i && d.kind === 'ember').length, feeder: s.pads[i].feeder, ups: s.pads[i].ups, line: r.seen().line, coins: s.coins }; }, plot.i);
  check('blown in: three embers in their own pen, their own feeder with the sack in it', home.embers === 3 && home.feeder.t === 'sweetroot' && home.feeder.n === 12 && home.ups.includes('feeder'), JSON.stringify(home));
  check('the pen line has gone, and short of the jar\'s price no jar line', home.coins < 400 && !/pen for your|jar/.test(home.line), JSON.stringify(home));
  check('no console problems (pen line)', problems.length === 0, problems.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- Pull at a mixed pen
{
  const { ctx, page, problems } = await openRanch(b, VIEW);
  const k = await kit(page, ctx);
  await page.evaluate(SETUP, { clovers: 4, ups: [] });
  await page.evaluate(() => {
    const r = window.ranch;
    const sim = r.sim;
    const s = sim.s;
    const es = [];
    for (let i = 0; i < 3; i++) {
      const d = sim.spawn('ember', 17 + Math.cos(i * 2.1 + 1) * 1.6, 28 + Math.sin(i * 2.1 + 1) * 0.8, true);
      d.pen = 1;
      d.hunger = 0.1;
      es.push(d);
    }
    // Fluff and a root lying among them, as a fed pen leaves it.
    for (let k = 0; k < 9; k++) {
      const e = es[k % 3];
      sim.drop('tuft-clover', e.x + Math.cos(k * 2.1) * 0.9, e.z + Math.sin(k * 2.1) * 0.9);
    }
    sim.drop('sweetroot', es[1].x + 0.6, es[1].z - 0.5);
    window.__lying = s.items.filter((it) => !it.gone).length;
  });
  await k.place(17, 26.5 + 4.4 + 1.2, 17, -0.3, 27);
  await frames(page, 4);
  const results = [];
  let tries = 0;
  while (tries < 6 && (await page.evaluate(JAR)).ember < 2) {
    tries++;
    const aimNext = () => page.evaluate(() => {
      const r = window.ranch;
      const s = r.sim.s;
      const p = s.player;
      const e = s.downies.filter((d) => !d.gone && d.kind === 'ember' && d.pen === 1).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (e) r.aimAt(e.x, e.y + 0.25, e.z);
      return !!e;
    });
    if (!(await aimNext())) break;
    await page.waitForTimeout(300); // Settled on it: a press mid-swing is a sweep.
    await aimNext();
    const start = (await page.evaluate(JAR)).ember;
    await k.hold('.rt-draw', 2500, async () => {
      await aimNext();
      return (await page.evaluate(JAR)).ember > start;
    });
    results.push((await page.evaluate(JAR)).ember);
    await page.waitForTimeout(250);
  }
  const jar = await page.evaluate(JAR);
  console.log(`   Pull at a mixed pen: ${tries} tries, embers after each ${results.join(', ')}`);
  check('two embers aimed at in a mixed pen, in three tries or fewer', jar.ember >= 2 && tries <= 3, JSON.stringify({ jar, tries }));
  check('nothing else came with them: no clover, no fluff, no root', jar.clover === 0 && jar.fluff === 0 && jar.root === 0, JSON.stringify(jar));
  check('no console problems (sort)', problems.length === 0, problems.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- an empty Blow at a pest
{
  const { ctx, page, problems } = await openRanch(b, VIEW);
  const k = await kit(page, ctx);
  const blowAt = async (dist) => {
    await page.evaluate(SETUP, { clovers: 0, ups: [] });
    await page.evaluate((dist) => {
      const r = window.ranch;
      const s = r.sim.s;
      s.hour = 22;
      const sayEl = document.querySelector('.rh-say');
      sayEl.classList.remove('on');
      sayEl.textContent = '';
      const p = s.player;
      p.x = 6; p.z = 36; p.y = r.sim.phys.floor(6, 36); p.vx = p.vz = p.vy = 0;
      if (dist === null) {
        s.nettles = [];
        r.aimAt(6, r.sim.phys.floor(6, 30) + 0.3, 30);
        return;
      }
      const z = 36 - dist;
      const y = r.sim.phys.floor(6, z);
      s.nettles = [{ id: 9001, x: 6, y, z, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: 0, mode: 'roam', modeT: 99, tx: 6, tz: z, bristle: 0, roll: 0, gone: false, snuffT: 99 }];
      r.aimAt(6, y + 0.3, z);
    }, dist);
    await frames(page, 3);
    await k.hold('.rt-puff', 90);
    await page.waitForTimeout(150);
    return page.evaluate(() => {
      const e = document.querySelector('.rh-say');
      return { say: e.classList.contains('on') ? e.textContent : '', mode: window.ranch.sim.s.nettles[0]?.mode ?? '' };
    });
  };
  const near = await blowAt(5.3);
  check('a real empty Blow at a pest 5.3 m off sends it rolling and says nothing', near.mode === 'roll' && near.say === '', JSON.stringify(near));
  const far = await blowAt(9);
  check('at 9 m it says "Get closer."', far.say === 'Get closer.' && far.mode !== 'roll', JSON.stringify(far));
  const none = await blowAt(null);
  check('with no pest in front it says "Nothing in the jar."', none.say === 'Nothing in the jar.', JSON.stringify(none));
  check('no console problems (pest)', problems.length === 0, problems.slice(0, 3).join(' | '));
  await ctx.close();
}

await b.close();
console.log(failed() ? `PEN REAL FAILED (${failed()})` : 'PEN REAL OK');
process.exit(failed() ? 1 : 0);
