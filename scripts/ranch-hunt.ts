// Thistledown: how long the rare one's hunt takes a careful player, from the
// clue to the catch (round 9: the ninth playtest's gold clover took about 4.7
// real minutes; it "heard" the tester standing still at 13.7 m as it drifted
// their way, 20 m off once spooked, each bolt cost about 40 s of waiting for
// it to drift home, and a rose ember 4 m up the crag never heard a walker at
// 11.5 m. Target: about 1.5 to 2.5 real minutes).
//
// The careful player (scripts/ranch-bot.ts, on the real sim at 60 frames a
// second) takes the hunt at the board at 8 am, follows the journal's steps as
// the lessons word them (`rareStep`): walks (running on long legs) by the lanes
// and gates to where it was seen, until it is found; fetches its favourite food
// from the nearest garden or wild patch; comes back to 13 to 16 m off it (a
// person's guess), stands still and blows food to land by it, a throw every
// 2.5 s at most, each off by up to 0.06 rad of turn and 0.05 of tilt; once it
// is lured, walks up (never
// runs) and pulls, reading the tug like a good thumb (200 to 350 ms). If it
// hears and bolts, it stands still until the rare one is back home. One hunt for
// each of the seven places it is seen, three seeds each.
//   npx tsx scripts/ranch-hunt.ts [seeds]
import { wantedFood, type Food } from '../src/games/ranch/defs';
import * as lessonsMod from '../src/games/ranch/lessons';
import { teachAll } from '../src/games/ranch/lessons';
import { rng } from '../src/games/ranch/noise';
import { Sim, rareLured } from '../src/games/ranch/sim';
import type { Downy, Item } from '../src/games/ranch/state';
import { BOARD, PADS, SIGHTINGS } from '../src/games/ranch/world';
import { Bot } from './ranch-bot';

const SEEDS = Number(process.argv[2]) || 3;
const L = lessonsMod as unknown as { rareStep: (s: unknown) => string };
const G_ITEM = 16;
/** A thumb's throw: off by up to this much either way (rad), and a throw every so many seconds (aiming, judging, blowing). */
const THROW = { yaw: 0.06, pitch: 0.05, every: 2.5 };

interface Hunt {
  spot: string;
  secs: number;
  caught: boolean;
  heard: number;
  away: number;
  lureSecs: number;
}

/** Where a blow from here would land (the item's flight, roughly as the sim flies it), for a pitch. */
function landing(b: Bot, yaw: number, pitch: number): { x: number; z: number } {
  const p = b.s.player;
  const cp = Math.cos(pitch);
  const dx = -Math.sin(yaw) * cp;
  const dy = Math.sin(pitch);
  const dz = -Math.cos(yaw) * cp;
  let x = p.x + dx * 0.9;
  let y = p.y + 1.4 + dy * 0.9;
  let z = p.z + dz * 0.9;
  let vx = dx * 14;
  let vy = dy * 14 + 1.4;
  let vz = dz * 14;
  for (let t = 0; t < 3; t += 1 / 60) {
    vy -= G_ITEM / 60;
    const k = Math.exp(-0.12 / 60);
    vx *= k;
    vz *= k;
    x += vx / 60;
    y += vy / 60;
    z += vz / 60;
    if (y <= b.sim.phys.floor(x, z)) break;
  }
  return { x, z };
}

function hunt(spot: number, seed: number): Hunt {
  Math.random = rng(seed);
  const sim = new Sim(null);
  sim.teaching = true;
  teachAll(sim.s);
  const s = sim.s;
  s.day = 2;
  s.night = 2;
  s.hour = 8;
  s.orderDay = 2;
  s.gates.ridge = s.gates.hollow = true;
  sim.phys.gates = { ...s.gates };
  // A clover pen of four with a feeder and the starter garden: a pen with room and no rare one.
  s.pads[1].kind = 'pen';
  s.pads[1].ups = ['feeder'];
  sim.phys.setPads(s.pads);
  for (let k = 0; k < 4; k++) sim.spawn('clover', PADS[1].x + Math.cos(k) * 2, PADS[1].z + Math.sin(k) * 2, true).hunger = 0.2;
  const kind = SIGHTINGS[spot].kind;
  s.orders = [{ kind, n: 1, got: 0, paid: 0, mult: 2, pay: 100, state: 'offer', rare: { spot }, by: 19 }];
  sim.takeOrder(0);
  sim.events.length = 0;
  const b = new Bot(sim, Math.random);
  const p = s.player;
  p.x = BOARD.x;
  p.z = BOARD.z + 2;
  p.y = sim.phys.floor(p.x, p.z);
  const f: Food = wantedFood(kind);
  let heard = 0;
  let away = 0;
  let lureSecs = 0;
  let waitHome = false;
  let caught = false;
  // A person's guess at how far off to stand, and their throws: off by a little each time, one every 2.5 s at most.
  const standOff = 13 + Math.random() * 3;
  let nextThrow = 0;
  let thrownAt = -9;
  let throwErr = { yaw: 0, pitch: 0 };
  const rare = (): Downy | null => s.downies.find((d) => !d.gone && d.rare && !d.tame) ?? null;
  for (let i = 0; i < 6 * 60 * 60 && !caught; i++) {
    const d = rare();
    if (!d) break;
    const step = L.rareStep(s);
    const dist = Math.hypot(d.x - p.x, d.z - p.z);
    if (waitHome) {
      // Spooked: stand still until it is back where it was seen and settled.
      if (d.bolt <= 0 && Math.hypot(d.x - d.homeX, d.z - d.homeZ) < 5) waitHome = false;
      b.lookAt(d.x, d.y + 0.25, d.z);
    } else if (step === 'find') {
      // (Running there, walking the last 30 m: a careful player does not run up to a clue.)
      const sp = SIGHTINGS[spot];
      b.goTo(sp.x, sp.z, 18, Math.hypot(sp.x - p.x, sp.z - p.z) > 30);
    } else if (step === 'fetch') {
      // Its favourite, from what is nearest: a garden growing it or a wild patch.
      const food = s.items.filter((it: Item) => !it.gone && it.type === f && it.drawn === 0 && b.canTry(it));
      let best: Item | null = null;
      let bd = 1e9;
      for (const it of food) {
        const dd = Math.hypot(it.x - p.x, it.z - p.z);
        if (dd < bd) {
          bd = dd;
          best = it;
        }
      }
      if (best) b.pullItem(best);
    } else if (step === 'lure') {
      // Off it by a person's guess (13 to 16 m), still, food blown to land by it.
      if (dist > standOff + 0.5) b.goTo(d.x, d.z, standOff, dist > 30);
      else {
        lureSecs += 1 / 60;
        b.choose((t) => t === f);
        // The pitch whose blow lands nearest it, as a thumb judges it: off by a little each throw.
        if (b.t >= nextThrow) {
          throwErr = { yaw: (Math.random() - 0.5) * 2 * THROW.yaw, pitch: (Math.random() - 0.5) * 2 * THROW.pitch };
          nextThrow = b.t + THROW.every;
        }
        const yaw = Math.atan2(-(d.x - p.x), -(d.z - p.z)) + throwErr.yaw;
        let bestPitch = 0;
        let bestMiss = 1e9;
        for (let k = -10; k <= 30; k++) {
          const pitch = k * 0.02;
          const l = landing(b, yaw, pitch);
          const miss = Math.hypot(l.x - d.x, l.z - d.z);
          if (miss < bestMiss) {
            bestMiss = miss;
            bestPitch = pitch;
          }
        }
        // (Aim the view where that pitch points, then blow, once a blow has not already gone its way lately.)
        bestPitch += throwErr.pitch;
        const ex = p.x - Math.sin(yaw) * 10;
        const ez = p.z - Math.cos(yaw) * 10;
        b.lookAt(ex, p.y + 1.6 + Math.tan(bestPitch) * 10, ez);
        const blownNear = s.items.some((it) => !it.gone && it.type === f && it.blown && Math.hypot(it.x - d.x, it.z - d.z) < 11);
        if (!blownNear && thrownAt < nextThrow - THROW.every && Math.abs(s.player.pitch - bestPitch) < 0.03 && Math.hypot(p.vx, p.vz) < 0.3) {
          b.pressPuff();
          thrownAt = b.t;
        }
      }
    } else if (step === 'pull') {
      // Lured: walk up and pull (never run: a runner is heard from further).
      if (rareLured(d) || d.strain > 0 || d.back > 0 || d.tell > 0 || d.easeT > 0) b.pullDowny(d, 4);
    }
    b.frame();
    // (The bot's frame takes the events; what matters is read from the state.)
    if (s.slots.some((q) => q.t === kind && (q.downs ?? []).some((r) => r.rare))) caught = true;
    if (d.bolt > 0 && !waitHome && d.strain <= 0) {
      if (d.wary > 0) away++;
      else heard++;
      waitHome = true;
    }
  }
  return { spot: SIGHTINGS[spot].name, secs: b.t, caught, heard, away, lureSecs };
}

console.log(`Thistledown, the rare one's hunt for a careful player (from the clue to the catch), ${SEEDS} seeds a place:`);
const all: Hunt[] = [];
for (let spot = 0; spot < SIGHTINGS.length; spot++) {
  const rows: Hunt[] = [];
  for (let k = 0; k < SEEDS; k++) rows.push(hunt(spot, 11 + k * 7919 + spot * 31));
  all.push(...rows);
  const ok = rows.filter((r) => r.caught);
  const secs = ok.map((r) => r.secs).sort((a, b) => a - b);
  console.log(`   ${SIGHTINGS[spot].kind.padEnd(7)} by ${rows[0].spot.padEnd(16)} caught ${ok.length} of ${rows.length}, ${secs.map((v) => `${(v / 60).toFixed(1)}`).join(', ')} min; spooked ${rows.reduce((a, r) => a + r.heard, 0)}, got away ${rows.reduce((a, r) => a + r.away, 0)}`);
}
const ok = all.filter((r) => r.caught).map((r) => r.secs).sort((a, b) => a - b);
console.log(`   all: caught ${ok.length} of ${all.length}; middle ${(ok[Math.floor(ok.length / 2)] / 60).toFixed(1)} min, the middle half ${(ok[Math.floor(ok.length / 4)] / 60).toFixed(1)} to ${(ok[Math.floor((ok.length * 3) / 4)] / 60).toFixed(1)} min; spooked ${all.reduce((a, r) => a + r.heard, 0)} times in ${all.length} hunts`);
