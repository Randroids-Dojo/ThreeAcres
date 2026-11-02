// Thistledown: catches in the real game, with real CDP touch on the Pixel's
// viewport, the way the fourth playtest chased downies: start 12 m off (16 m
// from a thistle at dusk) on a dry side, walk in with the stick to 5.5 m
// (again once it is out of Pull's reach, past 7 m), hold Pull within 7.6 m, and steer with a look finger
// that moves every 40 ms, sees the downy `lag` ms late, moves `gain` of the
// way (60 px at most) and wobbles; at the edge of the look side the finger
// lifts and comes down in the middle again. A cross-check of
// scripts/ranch-catch.ts, which plays the same thumb on the sim alone.
//
// Three faults in the playtest's chase are put right here, as each skews the
// count: CDP's touchEnd lifts the points it lists, and the chase listed the
// ones to keep (stopping at 5.5 m it let go of Pull and the look finger and
// went on walking); the stick floats, so a thumb walking again must come down
// before it pushes (the chase came down already pushed and stood still); and
// its look finger never lifted, clamped at the screen's edge, so a thumb that
// tracked well ran out of room to turn. Its look moves also came every 67 ms,
// not 40: paced to 40 here.
//   RANCH_URL=http://localhost:5247 node scripts/ranch-catch-real.mjs [tries] [kinds]
import { launch, openRanch, touchSession } from './ranch-lib.mjs';

const tries = Number(process.argv[2]) || 6;
// rare-clover, rare-ember, rare-brook: the board's rare one, lured (it has just eaten the food you blew near it,
// so it lets you walk in to 4 m; the fight is what is measured).
const kinds = (process.argv[3] || 'clover,ember,brook,thistle,rare-clover,rare-ember').split(',');
// react: reading the tug (round 8, the duel), it lets go of Pull a reaction after the downy puffs up (the tell,
// shown on the ring: it swells, gold on its dark track) and pulls again a reaction after its pull back stops, each drawn evenly
// from this range in ms (the eighth playtest's thumbs: a good one 200 to 350, a slow one 450 to 650; as
// scripts/ranch-catch.ts). The ring is read through the hook (window.ranch.hud.tugState()), as a player sees it.
// holds: never reads it (holds Pull all the way: the seventh playtest's way, a control).
// fooled (round 9, fake puffs): the share of fake puffs it takes for a real tell and lets go on, pressing again a
// reaction after (the ring stays pale on a fake one and shivers; a real tell turns it gold): as ranch-catch.ts.
const THUMBS = {
  careless: { lag: 180, gain: 0.55, wobble: 6, run: false, react: [450, 650], fooled: 0.6 },
  careful: { lag: 70, gain: 0.8, wobble: 1.5, run: true, react: [200, 350], fooled: 0.2 },
  ...(process.env.CONTROL ? { holds: { lag: 70, gain: 0.8, wobble: 1.5, run: true, react: null, fooled: 0 } } : {}),
};
const SENS = 0.0062;
const wrap = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

const browser = await launch();
const { ctx, page } = await openRanch(browser, { width: 412, height: 915, dpr: 2, touch: true, query: 'touch' });
const t = await touchSession(ctx, page);
// Tap once so the game takes touch as the device.
await t.send('touchStart', [[300, 300, 1]]);
await page.waitForTimeout(60);
await t.send('touchEnd', []);
await page.waitForTimeout(300);
const draw = await page.evaluate(() => {
  const e = document.querySelector('.rt-draw');
  const r = e.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});

async function chase(which, thumb, seed) {
  // A note left from the try before (a brook slipping into the water) must not count against this one.
  for (let i = 0; i < 40 && (await page.evaluate(() => !!document.querySelector('.rh-say.on'))); i++) await page.waitForTimeout(100);
  const rare = which.startsWith('rare-');
  const kind = rare ? which.slice(5) : which;
  // A fresh wild downy of the kind at one of its homes, 12 m off on a dry side (a lured rare one 8 m); nothing else wild.
  const setup = await page.evaluate(([kind, seed, rare]) => {
    const r = window.ranch;
    const sim = r.sim;
    const s = sim.s;
    sim.wild = false;
    s.downies = s.downies.filter((d) => d.tame || d.keep);
    s.hour = kind === 'thistle' ? 18.6 : 10;
    s.gates.ridge = s.gates.hollow = true;
    sim.phys.gates = { ...s.gates };
    for (const q of s.slots) {
      q.t = null;
      q.n = 0;
    }
    const homes = { clover: [[-16, -9], [14, -4], [-8, -44], [20, -32]], ember: [[-45, -19], [-55, -1], [-47, 4]], brook: [[43, 4], [65, 9], [53, -22]], thistle: [[-60, -26]] };
    const H = homes[kind][seed % homes[kind].length];
    // (Not with the crag between: the scripted thumb walks straight at it, and a real one would go round.)
    const seg = (px, pz, ax, az, bx, bz) => {
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(px - ax - dx * t, pz - az - dz * t);
    };
    const d = sim.spawn(kind, H[0], H[1], false);
    d.hunger = 0.2;
    if (rare) {
      d.rare = true;
      d.calm = 9;
    }
    const p = s.player;
    let a = seed * 2.399;
    const start = rare ? 8 : kind === 'thistle' ? 16 : 12;
    for (let k = 0; k < 40; k++, a += 0.77) {
      p.x = H[0] + Math.cos(a) * start;
      p.z = H[1] + Math.sin(a) * start;
      const fl = sim.phys.floor(p.x, p.z);
      // (On the downy's own side of the valley's walls, as the sim harness asks: a start at x 32 for a brook by the
      // dead tree stood on the meadow side of the hollow's wall, and no thumb could reach it.)
      const side = H[0] > 36 ? p.x > 37 : H[0] < -36 ? p.x < -37 : p.x > -35 && p.x < 35 && p.z < 17;
      if (p.x > -76 && p.x < 76 && p.z > -56 && p.z < 56 && fl > -0.6 && side && (seg(-64, -34, p.x, p.z, H[0], H[1]) > 5 || k > 34)) break;
    }
    p.y = sim.phys.floor(p.x, p.z);
    p.vx = p.vz = p.vy = 0;
    r.aimAt(d.x, d.y + 0.25, d.z);
    return { id: d.id };
  }, [kind, seed, rare]);
  let lx = 300;
  let ly = 430;
  let fid = 41;
  let walking = true;
  let pulling = false;
  // A careful thumb runs at a thistle: the stick pushed to its rim.
  const push = thumb.run && kind === 'thistle' ? 52 : 38;
  // The stick floats: it centres where the thumb comes down, so a thumb walking again comes down, then pushes
  // (the playtest's chase came down already pushed and never walked again).
  let walkTicks = 1;
  const stick = () => (walking ? [[100, walkTicks === 0 ? 760 : 760 - push, 39]] : []);
  const btn = () => (pulling ? [[draw[0], draw[1], 40]] : []);
  await t.send('touchStart', [[100, 760, 39]]);
  await page.waitForTimeout(16);
  await t.send('touchMove', [[100, 741, 39]]);
  await page.waitForTimeout(16);
  await t.send('touchMove', stick());
  await t.send('touchStart', [...stick(), [lx, ly, 41]]);
  let prev = [...stick(), [lx, ly, 41]];
  const hist = [];
  const t0 = Date.now();
  let result = 'timeout';
  let food = 0;
  let ticks = 0;
  const f0 = await page.evaluate(() => window.ranch.frames);
  // Reading the tug off the ring: let go a reaction after it shows the tell, press again a reaction after its pull back stops.
  const react = () => (thumb.react ? thumb.react[0] + Math.random() * (thumb.react[1] - thumb.react[0]) : 0);
  let wasBack = false;
  let wasTell = false;
  let wasFeint = false;
  let feints = 0;
  let letGo = false;
  let releaseAt = -1;
  let pressAt = -1;
  let backs = 0;
  let slips = 0;
  let escapes = 0;
  let fightAt = -1;
  let lastSay = '';
  let caughtAt = 0;
  // (Round 9: a fight is two to five beats, 4 to 10 s, so a try runs to 20 s; it was 14.)
  while (Date.now() - t0 < 20000) {
    const now = Date.now() - t0;
    const tick0 = Date.now();
    const o = await page.evaluate((id) => {
      const s = window.ranch.sim.s;
      const p = s.player;
      const d = s.downies.find((q) => q.id === id);
      const ring = window.ranch.hud.tugState();
      // The note under the crosshair, as on screen: a slip ("It slipped free...") or a getaway.
      const say = document.querySelector('.rh-say.on')?.textContent ?? '';
      return { ring, say, p: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch }, d: d && { x: d.x, y: d.y + 0.25, z: d.z, gone: d.gone }, caught: s.slots.some((q) => q.t === window.ranch.sim.s.downies.find((x) => x.id === id)?.kind && q.n > 0), food: s.slots.reduce((a, q) => a + (q.t && !['clover', 'ember', 'brook', 'thistle'].includes(q.t) ? q.n : 0), 0), kind: d?.kind, aboard: s.slots.reduce((a, q) => a + (['clover', 'ember', 'brook', 'thistle'].includes(q.t) ? q.n : 0), 0) };
    }, setup.id);
    food = o.food;
    if (o.say !== lastSay) {
      if (/slipped free/.test(o.say)) slips++;
      if (/got away|into the water/.test(o.say)) escapes++;
      lastSay = o.say;
    }
    if (o.aboard > 0) {
      result = 'caught';
      caughtAt = now;
      break;
    }
    if (!o.d || o.d.gone) {
      result = 'gone';
      break;
    }
    const dist = Math.hypot(o.d.x - o.p.x, o.d.z - o.p.z);
    hist.push({ now, t: o.d });
    let seen = hist[0].t;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i].now <= now - thumb.lag) {
        seen = hist[i].t;
        break;
      }
    }
    const dx = seen.x - o.p.x;
    const dz = seen.z - o.p.z;
    const dy = seen.y - (o.p.y + 1.6);
    const dyaw = wrap(Math.atan2(-dx, -dz) - o.p.yaw);
    const dp = Math.atan2(dy, Math.hypot(dx, dz)) - o.p.pitch;
    const mx = Math.max(-60, Math.min(60, (-dyaw / SENS) * thumb.gain + (Math.random() - 0.5) * 2 * thumb.wobble));
    const my = Math.max(-40, Math.min(40, (-dp / SENS) * thumb.gain + (Math.random() - 0.5) * 2 * thumb.wobble));
    // At the edge of the look side the finger lifts and comes down in the middle again, as a thumb does. (The
    // playtest's chase kept it down and clamped it at the screen's edge, so a thumb that tracked well ran out
    // of room to turn after about 0.7 rad and lost the downy: an artifact, not the game.)
    lx += mx;
    ly += my;
    if (lx < 214 || lx > 404 || ly < 80 || ly > 860) {
      lx = 310;
      ly = 450;
      fid++;
    }
    if (walking && dist < (rare ? 4 : 5.5)) walking = false;
    else if (!walking && dist > 7) {
      walking = true;
      walkTicks = 0;
    } else if (walking) walkTicks++;
    // The ring shows a pull back: let go of Pull (a reaction late), and press again (a reaction after it stops).
    const back = !!o.ring.back;
    const tell = !!o.ring.tell;
    const feint = !!o.ring.feint;
    if (back && !wasBack) backs++;
    if (fightAt < 0 && o.ring.tug > 0) fightAt = now;
    if (thumb.react) {
      // The tell (or a pull back seen without one, a read falling between): let go a reaction later.
      if ((tell && !wasTell) || (back && !wasBack && !wasTell && releaseAt < 0 && !letGo)) {
        releaseAt = now + react();
        pressAt = -1;
      }
      if (!back && wasBack) {
        releaseAt = -1;
        if (letGo) pressAt = now + react();
      }
      // A fake puff (the ring shivers, stays pale): now and then taken for a tell, let go on, and pulled again after.
      if (feint && !wasFeint) {
        feints++;
        if (!letGo && releaseAt < 0 && Math.random() < thumb.fooled) {
          releaseAt = now + react();
          pressAt = releaseAt + react();
        }
      }
      if (letGo && back && pressAt >= 0 && !wasBack) pressAt = -1;
      if (releaseAt >= 0 && now >= releaseAt) {
        letGo = true;
        releaseAt = -1;
      }
      if (pressAt >= 0 && now >= pressAt) {
        letGo = false;
        pressAt = -1;
      }
    }
    wasBack = back;
    wasTell = tell;
    wasFeint = feint;
    // A slip or a getaway ends the fight: the ring goes, and the thumb presses again when it next comes in reach.
    if (o.ring.tug <= 0 && !back) letGo = false;
    pulling = dist < 7.6 && !letGo;
    const next = [...stick(), ...btn(), [lx, ly, fid]];
    // CDP's touchEnd releases the points it lists (the playtest's chase listed the ones to keep, so when it
    // stopped walking it let go of Pull and the look finger and kept walking): list only those to lift.
    const removed = prev.filter((q) => !next.some((n) => n[2] === q[2]));
    const added = next.filter((q) => !prev.some((n) => n[2] === q[2]));
    if (removed.length) await t.send('touchEnd', removed);
    if (added.length) await t.send('touchStart', next);
    else await t.send('touchMove', next);
    prev = next;
    ticks++;
    // A look move every 40 ms, the harness's own time included (a fixed 40 ms wait made it 67 ms, and a careful
    // thumb correcting 80% a move that late overshoots and swings: the harness, not the game).
    await page.waitForTimeout(Math.max(1, 40 - (Date.now() - tick0)));
  }
  const secs = (Date.now() - t0) / 1000;
  const fps = ((await page.evaluate(() => window.ranch.frames)) - f0) / secs;
  await t.send('touchEnd', []);
  await page.waitForTimeout(250);
  const first = result === 'caught' && slips === 0 && escapes === 0;
  return { result, secs, food, tickMs: (secs * 1000) / Math.max(1, ticks), fps, first, fight: first && fightAt >= 0 ? (caughtAt - fightAt) / 1000 : 0, backs, slips, feints };
}

console.log(`Real-touch catches on the Pixel viewport, ${tries} tries per kind and thumb (${process.env.RANCH_URL || 'default url'})`);
for (const kind of kinds) {
  for (const [name, thumb] of Object.entries(THUMBS)) {
    let n = 0;
    let first = 0;
    let fight = 0;
    let backs = 0;
    let slipped = 0;
    let food = 0;
    let tick = 0;
    let fps = 0;
    let feints = 0;
    const fights = [];
    const out = [];
    for (let k = 0; k < tries; k++) {
      const r = await chase(kind, thumb, k + 1);
      if (r.result === 'caught') n++;
      if (r.first) {
        first++;
        fight += r.fight;
        fights.push(r.fight);
      }
      feints += r.feints;
      backs += r.backs;
      if (r.slips) slipped++;
      if (r.food > 0) food++;
      tick += r.tickMs / tries;
      fps += r.fps / tries;
      out.push(`${r.first ? 'F' : r.result[0]}${r.secs.toFixed(0)}`);
    }
    fights.sort((a, b) => a - b);
    const mid = fights.length ? fights[Math.floor(fights.length / 2)].toFixed(1) : '-';
    console.log(`   ${kind.padEnd(11)} ${name.padEnd(9)} first try ${first} of ${tries}, in 20 s ${n}; fight ${first ? (fight / first).toFixed(1) : '-'} s (middle ${mid}); ${(backs / tries).toFixed(1)} pull backs a try, ${(feints / tries).toFixed(1)} fake puffs, slipped in ${slipped}; food drawn in ${food}  [${out.join(' ')}]  (a look move every ${Math.round(tick)} ms, ${Math.round(fps)} fps)`);
  }
}
await browser.close();
