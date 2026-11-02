// How forgiving is selling with the bellows? Stands the player at a spread of
// distances and angles in front of the sell crate, aims the crosshair at the
// crate's mouth (and a little off it, as a thumb would), blows one fluff and
// counts the sales. Uses the real muzzle offsets from the phone and desktop
// views, measured in the browser.
//   npx tsx scripts/ranch-sell-aim.ts
import { Sim, type Aim, type Controls } from '../src/games/ranch/sim';
import { newItem } from '../src/games/ranch/state';
import { rng } from '../src/games/ranch/noise';
import { CRATE } from '../src/games/ranch/physics';
import { EXCHANGE } from '../src/games/ranch/world';

Math.random = rng(11);
const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
// Muzzle relative to the eye: forward, right, up (metres), from the game's viewmodel.
const MUZZLES = { phone: { f: 0.77, r: -0.09, u: -0.25 }, desk: { f: 0.85, r: 0.19, u: -0.23 } };

function aimFrom(sim: Sim, tx: number, ty: number, tz: number, m: { f: number; r: number; u: number }): Aim {
  const p = sim.s.player;
  const ex = p.x;
  const ey = p.y + 1.6;
  const ez = p.z;
  const l = Math.hypot(tx - ex, ty - ey, tz - ez);
  const dx = (tx - ex) / l;
  const dy = (ty - ey) / l;
  const dz = (tz - ez) / l;
  const hl = Math.hypot(dx, dz) || 1;
  const rx = -dz / hl;
  const rz = dx / hl;
  return { ex, ey, ez, dx, dy, dz, mx: ex + dx * m.f + rx * m.r, my: ey + dy * m.f + m.u, mz: ez + dz * m.f + rz * m.r };
}

/** One blow of one fluff from (x, z) at a crosshair point; did it sell? */
export function trySell(x: number, z: number, tx: number, ty: number, tz: number, muzzle: { f: number; r: number; u: number }): boolean {
  const sim = new Sim(null);
  const s = sim.s;
  s.learn.push('coins', 'bellows', 'draw', 'puff');
  const p = s.player;
  p.x = x;
  p.z = z;
  p.y = sim.phys.floor(x, z);
  p.vx = p.vy = p.vz = 0;
  s.slots[0].t = 'tuft-clover';
  s.slots[0].n = 1;
  s.sel = 0;
  const sold0 = s.stats.sold;
  const aim = aimFrom(sim, tx, ty, tz, muzzle);
  const said = sim.aimTarget(aim) === 'sell';
  sim.puff(aim);
  let sold = false;
  for (let t = 0; t < 4 && !sold; t += 1 / 60) {
    sim.update(1 / 60, idle, aim);
    if (s.stats.sold > sold0) sold = true;
  }
  if (said === sold) agree++;
  else if (said) {
    liedYes++;
    if (process.env.WHY) console.log(`   promised, missed: from ${x.toFixed(2)},${z.toFixed(2)} at ${tx.toFixed(2)},${ty.toFixed(2)},${tz.toFixed(2)}`);
  }
  else liedNo++;
  return sold;
}
// How often the crosshair's sell mark matched what happened: a mark that then
// missed (liedYes) is the bad kind; a sale it did not promise (liedNo) is mild.
let agree = 0;
let liedYes = 0;
let liedNo = 0;

const cx = (CRATE.x0 + CRATE.x1) / 2;
const cz = (CRATE.z0 + CRATE.z1) / 2;
const probe = new Sim(null);
const floor = probe.phys.floor(cx, cz);
// The lane is to the south (lower z) of the crate; approach from that side.
const toLane = Math.atan2(30 - EXCHANGE.z, -1 - EXCHANGE.x);
const dists = [1.6, 2.2, 3, 4, 5, 6.5, 8];
const angles = [-50, -25, 0, 25, 50].map((a) => toLane + (a * Math.PI) / 180);
// Crosshair spots: the mouth's middle, a thumb's error around it, and worse:
// a metre or more to the side, the ground short of the crate, and over it.
const errs: [number, number][] = [
  [0, 0],
  [-0.35, 0],
  [0.35, 0],
  [0, 0.35],
  [0, -0.3],
  [-0.8, 0],
  [0.8, 0],
  [-1.2, 0.2],
  [1.2, 0.2],
  [0, -0.75],
  [0, 0.9],
];

for (const [name, m] of Object.entries(MUZZLES)) {
  const row: string[] = [];
  let all = 0;
  let hit = 0;
  for (const d of dists) {
    let n = 0;
    let ok = 0;
    for (const a of angles) {
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      // Sideways in the view: perpendicular to the line of sight.
      const lx = -(cz - z) / d;
      const lz = (cx - x) / d;
      for (const [side, up] of errs) {
        n++;
        if (trySell(x, z, cx + lx * side, floor + 0.75 + up, cz + lz * side, m)) ok++;
        else if (process.env.WHY) console.log(`   missed: ${name} ${d} m, crosshair ${side} m to the side, ${up} m up`);
      }
    }
    all += n;
    hit += ok;
    row.push(`${d} m ${Math.round((ok / n) * 100)}%`);
  }
  console.log(`${name.padEnd(5)} ${row.join('  ')}   overall ${Math.round((hit / all) * 100)}%`);
}
console.log(`crosshair: matched ${agree}, promised a sale that missed ${liedYes}, sold unpromised ${liedNo}`);

// Fluff lying on the ground near the crate (dropped short, or shed there): does it ever sell?
function lyingSells(x: number, z: number): boolean {
  const sim = new Sim(null);
  const s = sim.s;
  s.learn.push('coins');
  s.player.x = cx + 9;
  s.player.z = cz - 9;
  s.player.y = sim.phys.floor(s.player.x, s.player.z);
  const it = newItem(s, 'tuft-clover', x, sim.phys.floor(x, z) + 0.1, z);
  it.grounded = true;
  it.flyT = -1;
  s.items.push(it);
  const aim = aimFrom(sim, cx + 20, 6, cz, MUZZLES.phone);
  for (let t = 0; t < 5; t += 1 / 60) {
    sim.update(1 / 60, idle, aim);
    if (s.stats.sold > 0) return true;
  }
  return false;
}
const lying = [1.2, 1.8, 2.3, 3.5].map((d) => {
  let ok = 0;
  for (const a of angles) if (lyingSells(cx + Math.cos(a) * d, cz + Math.sin(a) * d)) ok++;
  return `${d} m ${ok}/${angles.length}`;
});
console.log(`lying fluff sells from: ${lying.join('  ')}`);

// Blown downies into a pen (the second playtest: they fell short, against the
// fence). From the lane side of pad 1's pen, 1 to 8 m back from the fence and
// at angles across it, the crosshair on the pen floor (its middle, and off it
// as a thumb would be), one downy blown: does it come down in the pen? With the
// pen's help (a blown downy is steered in and lifted over the rail, then
// settles) and without it, and whether the crosshair's pen mark told the truth.
import { PADS, PEN_R } from '../src/games/ranch/world';
let penAgree = 0;
let penLiedYes = 0;
let penLiedNo = 0;
let highSaid = 0;
function tryPen(x: number, z: number, tx: number, tz: number, m: { f: number; r: number; u: number }, assist: boolean, high = false): boolean {
  const sim = new Sim(null);
  const s = sim.s;
  sim.wild = false;
  s.downies = [];
  s.items = [];
  sim.penAssist = assist;
  s.pads[1].kind = 'pen';
  if (high) s.pads[1].ups = ['high'];
  sim.phys.setPads(s.pads);
  const p = s.player;
  p.x = x;
  p.z = z;
  p.y = sim.phys.floor(x, z);
  p.vx = p.vy = p.vz = 0;
  s.slots[0] = { t: high ? 'thistle' : 'clover', n: 1 };
  s.sel = 0;
  const aim = aimFrom(sim, tx, sim.phys.floor(tx, tz), tz, m);
  const said = sim.aimTarget(aim) === 'pen';
  if (high) highSaid += said ? 1 : 0;
  sim.puff(aim);
  const d = s.downies[s.downies.length - 1];
  for (let t = 0; t < 3 && !(d.grounded && d.flyT < 0); t += 1 / 60) sim.update(1 / 60, idle, aim);
  const ok = sim.phys.penAt(d.x, d.z) === 1;
  if (assist) {
    if (said === ok) penAgree++;
    else if (said) penLiedYes++;
    else penLiedNo++;
  }
  return ok;
}
{
  const at = PADS[1];
  const backs = [1, 2, 4, 6, 8];
  const across = [-40, -20, 0, 20, 40].map((a) => (a * Math.PI) / 180);
  // Crosshair spots on the pen floor: its middle, a metre or two either way, and the near half.
  const spots: [number, number][] = [
    [0, 0],
    [-1.5, 0],
    [1.5, 0],
    [0, 1.8],
    [0, -1.8],
  ];
  for (const assist of [false, true]) {
    const row: string[] = [];
    let all = 0;
    let hit = 0;
    for (const back of backs) {
      let n = 0;
      let ok = 0;
      for (const a of across) {
        const r = PEN_R + back;
        const x = at.x + Math.sin(a) * r;
        const z = at.z + Math.cos(a) * r;
        for (const [sx, sz] of spots) {
          n++;
          if (tryPen(x, z, at.x + sx, at.z + sz, MUZZLES.phone, assist)) ok++;
        }
      }
      all += n;
      hit += ok;
      row.push(`${back} m ${Math.round((ok / n) * 100)}%`);
    }
    console.log(`pen, ${assist ? 'with the pen’s help'.replace('’', "'") : 'without help'}: ${row.join('  ')}   overall ${Math.round((hit / all) * 100)}% (back from the fence)`);
  }
  console.log(`pen mark: matched ${penAgree}, promised a landing that missed ${penLiedYes}, landed unpromised ${penLiedNo}`);
  // Round 7: a thistle blown at a high-fence pen's floor (the seventh playtest's showed no pen mark and landed
  // outside; the mark came up only aiming 2 m higher). The same spread, with the pen's help.
  penAgree = penLiedYes = penLiedNo = 0;
  const row: string[] = [];
  let all = 0;
  let hit = 0;
  for (const back of backs) {
    let n = 0;
    let ok = 0;
    for (const a of across) {
      const r = PEN_R + back;
      const x = at.x + Math.sin(a) * r;
      const z = at.z + Math.cos(a) * r;
      for (const [sx, sz] of spots) {
        n++;
        if (tryPen(x, z, at.x + sx, at.z + sz, MUZZLES.phone, true, true)) ok++;
      }
    }
    all += n;
    hit += ok;
    row.push(`${back} m ${Math.round((ok / n) * 100)}%`);
  }
  console.log(`high-fence pen, a thistle aimed at its floor: ${row.join('  ')}   overall ${Math.round((hit / all) * 100)}%; the pen mark up from the floor aim on ${highSaid} of ${all}`);
  console.log(`high-fence pen mark: matched ${penAgree}, promised a landing that missed ${penLiedYes}, landed unpromised ${penLiedNo}`);
}

// Blown downies into the crate for a live order (round 4): the same spread of
// distances, angles and crosshair errors, one downy blown from the jar with
// today's live order open. Does the crate take it, and did the crosshair's sell
// mark tell the truth? (Without an order the crate takes none; see the tests.)
{
  let ok = 0;
  let all = 0;
  let agreeD = 0;
  let yesD = 0;
  let noD = 0;
  const row: string[] = [];
  for (const d of dists) {
    let n = 0;
    let k = 0;
    for (const a of angles) {
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const lx = -(cz - z) / d;
      const lz = (cx - x) / d;
      for (const [side, up] of errs) {
        const sim = new Sim(null);
        const s = sim.s;
        sim.wild = false;
        s.downies = [];
        s.items = [];
        s.orders = [{ kind: 'clover', live: true, n: 99, got: 0, paid: 0, mult: 2, pay: 55, state: 'open' }];
        s.orderDay = s.day;
        const p = s.player;
        p.x = x;
        p.z = z;
        p.y = sim.phys.floor(x, z);
        p.vx = p.vy = p.vz = 0;
        // (Round 5: a live order wants a downy caught today.)
        s.slots[0] = { t: 'clover', n: 1, downs: [{ h: 0.3, c: s.day }] };
        s.sel = 0;
        const aim = aimFrom(sim, cx + lx * side, floor + 0.75 + up, cz + lz * side, MUZZLES.phone);
        const said = sim.aimTarget(aim) === 'sell';
        sim.puff(aim);
        let took = false;
        for (let t = 0; t < 4 && !took; t += 1 / 60) {
          sim.update(1 / 60, idle, aim);
          if ((s.stats.live ?? 0) > 0) took = true;
        }
        n++;
        if (took) k++;
        if (said === took) agreeD++;
        else if (said) yesD++;
        else noD++;
      }
    }
    all += n;
    ok += k;
    row.push(`${d} m ${Math.round((k / n) * 100)}%`);
  }
  console.log(`live downies into the crate: ${row.join('  ')}   overall ${Math.round((ok / all) * 100)}%`);
  console.log(`downy sell mark: matched ${agreeD}, promised a sale that missed ${yesD}, sold unpromised ${noD}`);
}
