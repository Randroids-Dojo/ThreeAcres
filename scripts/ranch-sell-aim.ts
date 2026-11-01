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
