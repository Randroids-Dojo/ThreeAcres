// Thistledown's economy, measured on the real sim: income per game day for a
// few typical ranches. Each ranch runs from dawn (6 am) to 9 pm, then sleeps,
// for three days. A tending "hand" stands in for the player every hour and a
// half of game time: it picks the gardens, tops up the feeders (or blows food
// into a pen without one), pulls up the fluff in the pens and sells it at the
// crate at that moment's price, so the day's saturation counts. The downies,
// hunger, eating, shedding, fences, gardens and feeders are the game's own.
//   npx tsx scripts/ranch-balance.ts
import { FEEDER_CAP, HOUR, KIND, TUFT_KIND, isFood, isTuft, type DownyKind, type Food } from '../src/games/ranch/defs';
import { Sim, GARDEN_SRC, SATURATION, SAT_FLOOR, type Aim, type Controls } from '../src/games/ranch/sim';
import { newItem } from '../src/games/ranch/state';
import { rng } from '../src/games/ranch/noise';
import { BED_HALF } from '../src/games/ranch/physics';
import { GATES, PADS, PEN_R, zoneAt } from '../src/games/ranch/world';

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };

interface PenSpec {
  pad: number;
  kind: DownyKind;
  n: number;
  ups: string[];
}
interface GardenSpec {
  pad: number;
  crop: Food;
  ups: string[];
}
interface Setup {
  name: string;
  pens: PenSpec[];
  gardens: GardenSpec[];
  /** Game hours between the hand's rounds; 0: nobody tends the ranch. */
  every: number;
  /** Feeders start full (for the neglect run). */
  fullFeeders?: boolean;
}

const FAV: Record<DownyKind, Food> = { clover: 'cloverhead', ember: 'sweetroot', brook: 'dewberry', thistle: 'cloverhead' };

function build(setup: Setup, seed: number): Sim {
  Math.random = rng(seed);
  const sim = new Sim(null);
  const s = sim.s;
  sim.wild = false;
  s.downies = [];
  s.items = [];
  s.hour = 6;
  s.night = s.day;
  // The player waits by the house, out of the way.
  s.player.x = -15.5;
  s.player.z = 37.2;
  for (const g of setup.gardens) {
    const p = s.pads[g.pad];
    p.kind = 'garden';
    p.crop = g.crop;
    p.grow = 0;
    p.ups = [...g.ups];
  }
  for (const pen of setup.pens) {
    const p = s.pads[pen.pad];
    p.kind = 'pen';
    p.ups = [...pen.ups];
    if (setup.fullFeeders && p.ups.includes('feeder')) p.feeder = { t: FAV[pen.kind], n: FEEDER_CAP };
  }
  sim.phys.setPads(s.pads);
  for (const pen of setup.pens) {
    const at = PADS[pen.pad];
    for (let k = 0; k < pen.n; k++) {
      const a = (k / pen.n) * Math.PI * 2;
      const d = sim.spawn(pen.kind, at.x + Math.cos(a) * 2, at.z + Math.sin(a) * 2, true);
      d.hunger = 0.2 + 0.3 * Math.random();
    }
  }
  return sim;
}

interface Day {
  sold: number;
  coins: number;
  grown: number;
  eaten: number;
  feederLeft: number;
  inPens: number;
  firstOut: number | null;
}

/** One round of the hand: garden produce into feeders (or the pens), fluff in the pens to the crate. */
function tend(sim: Sim, setup: Setup, day: Day, pool: Record<Food, number>): void {
  const s = sim.s;
  for (const it of s.items) {
    if (it.gone || it.drawn > 0) continue;
    if (isFood(it.type) && it.src >= GARDEN_SRC) {
      const at = PADS[it.src - GARDEN_SRC];
      if (Math.abs(it.x - at.x) < BED_HALF + 1 && Math.abs(it.z - at.z) < BED_HALF + 1) {
        it.gone = true;
        pool[it.type]++;
      }
    }
  }
  // Share each food between the pens that eat it, emptiest feeder first, a few at a time.
  const order = [...setup.pens].sort((a, b) => s.pads[a.pad].feeder.n - s.pads[b.pad].feeder.n);
  for (let round = 0; round < 20; round++) {
    for (const pen of order) {
      const p = s.pads[pen.pad];
      const f = FAV[pen.kind];
      if (!p.ups.includes('feeder') || (p.feeder.t !== null && p.feeder.t !== f)) continue;
      const add = Math.min(pool[f], FEEDER_CAP - p.feeder.n, 2);
      if (add > 0) {
        p.feeder.t = f;
        p.feeder.n += add;
        pool[f] -= add;
      }
    }
  }
  for (const pen of setup.pens) {
    const p = s.pads[pen.pad];
    const f = FAV[pen.kind];
    if (p.ups.includes('feeder')) {
      if (p.feeder.t === null || p.feeder.t === f) {
        const add = Math.min(pool[f], FEEDER_CAP - p.feeder.n);
        if (add > 0) {
          p.feeder.t = f;
          p.feeder.n += add;
          pool[f] -= add;
        }
      }
    } else {
      // No feeder: blow a little food in for each hungry downy, as a player would.
      const at = PADS[pen.pad];
      const hungry = s.downies.filter((d) => !d.gone && d.pen === pen.pad && d.hunger > 0.5).length;
      for (let k = 0; k < hungry && pool[f] > 0; k++) {
        const it = newItem(s, f, at.x + (Math.random() - 0.5) * 3, 0, at.z + (Math.random() - 0.5) * 3);
        it.y = sim.phys.floor(it.x, it.z) + 0.3;
        it.blown = true;
        s.items.push(it);
        pool[f]--;
      }
    }
  }
  for (const it of s.items) {
    if (it.gone || !isTuft(it.type) || it.drawn > 0) continue;
    if (sim.phys.penAt(it.x, it.z) < 0 && !setup.pens.some((p) => Math.hypot(it.x - PADS[p.pad].x, it.z - PADS[p.pad].z) < PEN_R + 1.5)) continue;
    it.gone = true;
    const k = TUFT_KIND[it.type];
    const c = sim.price(k);
    s.market.sold[k]++;
    s.coins += c;
    day.sold++;
    day.coins += c;
  }
}

function runSetup(setup: Setup, days = 3, seed = 5): Day[] {
  const sim = build(setup, seed);
  const s = sim.s;
  const out: Day[] = [];
  const pool: Record<Food, number> = { cloverhead: 0, sweetroot: 0, dewberry: 0 };
  const aim: Aim = { ex: s.player.x, ey: s.player.y + 1.6, ez: s.player.z, dx: 0, dy: 0, dz: -1, mx: s.player.x, my: s.player.y + 1.4, mz: s.player.z - 0.6 };
  const dt = 1 / 20;
  let t = 0;
  for (let k = 0; k < days; k++) {
    const day: Day = { sold: 0, coins: 0, grown: 0, eaten: 0, feederLeft: 0, inPens: 0, firstOut: null };
    let next = 0;
    let grown = 0;
    const fed0 = s.stats.fed;
    const countGarden = () => s.items.filter((i) => !i.gone && isFood(i.type) && i.src >= GARDEN_SRC).length;
    let onBeds = countGarden();
    const crops0 = new Map<number, number>();
    void crops0;
    while (s.hour < 21) {
      sim.update(dt, idle, aim);
      sim.events.length = 0;
      t += dt;
      const nowBeds = countGarden();
      if (nowBeds > onBeds) grown += nowBeds - onBeds;
      onBeds = nowBeds;
      if (setup.every > 0 && t >= next) {
        next = t + setup.every * HOUR;
        tend(sim, setup, day, pool);
        onBeds = countGarden();
      }
      if (day.firstOut === null && s.downies.some((d) => !d.gone && d.pen < 0)) day.firstOut = s.hour;
    }
    if (setup.every > 0) tend(sim, setup, day, pool);
    day.grown = grown;
    day.eaten = s.stats.fed - fed0;
    day.feederLeft = setup.pens.reduce((a, p) => a + s.pads[p.pad].feeder.n, 0);
    day.inPens = s.downies.filter((d) => !d.gone && d.pen >= 0).length;
    out.push(day);
    sim.sleep();
    sim.events.length = 0;
  }
  return out;
}

const SETUPS: Setup[] = [
  { name: 'Starter: pen of 6 clover with a feeder, the starter garden', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: [] }], every: 1.5 },
  { name: 'Starter, garden with a sprinkler', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler'] }], every: 1.5 },
  { name: 'Full clover pen (10), garden with both upgrades', pens: [{ pad: 1, kind: 'clover', n: 10, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler', 'soil'] }], every: 1.5 },
  { name: 'Two clover pens of 8, two sprinkler gardens', pens: [{ pad: 1, kind: 'clover', n: 8, ups: ['feeder'] }, { pad: 2, kind: 'clover', n: 8, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler'] }, { pad: 3, crop: 'cloverhead', ups: ['sprinkler'] }], every: 1.5 },
  { name: 'Ember pen of 6 and clover pen of 6, a garden each with a sprinkler', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }, { pad: 2, kind: 'ember', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler'] }, { pad: 3, crop: 'sweetroot', ups: ['sprinkler'] }], every: 1.5 },
  { name: 'Brook pen of 6 with a trough and ember pen of 6, a garden each with a sprinkler', pens: [{ pad: 1, kind: 'brook', n: 6, ups: ['feeder', 'trough'] }, { pad: 2, kind: 'ember', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'dewberry', ups: ['sprinkler'] }, { pad: 3, crop: 'sweetroot', ups: ['sprinkler'] }], every: 1.5 },
  { name: 'Hand-fed: pen of 6 clover, no feeder, the starter garden', pens: [{ pad: 1, kind: 'clover', n: 6, ups: [] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: [] }], every: 1.5 },
  { name: 'First pen: 3 clover, hand-fed, the starter garden', pens: [{ pad: 1, kind: 'clover', n: 3, ups: [] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: [] }], every: 1.5 },
];

const pad = (v: string | number, n: number) => String(v).padStart(n);
console.log('Thistledown balance: one game day is 6 am to 9 pm (7.5 real minutes), then sleep.');
console.log(`Prices: base ${Object.entries(KIND).map(([k, v]) => `${k} ${v.value}`).join(', ')}; each sale today takes ${(SATURATION * 100).toFixed(1)}% off, down to ${Math.round(SAT_FLOOR * 100)}%.`);
console.log(`Gates: ${GATES.ridge.name} ${GATES.ridge.cost}, ${GATES.hollow.name} ${GATES.hollow.cost}.\n`);
const avgs: { name: string; coins: number }[] = [];
for (const setup of SETUPS) {
  const days = runSetup(setup);
  console.log(setup.name);
  console.log('   day  fluff  coins  per fluff  grown  eaten  feeder left  in pens');
  days.forEach((d, i) => console.log(`   ${pad(i + 1, 3)}  ${pad(d.sold, 5)}  ${pad(d.coins, 5)}  ${pad((d.coins / Math.max(1, d.sold)).toFixed(1), 9)}  ${pad(d.grown, 5)}  ${pad(d.eaten, 5)}  ${pad(d.feederLeft, 11)}  ${pad(d.inPens, 7)}${d.firstOut !== null ? `  (one out at ${d.firstOut.toFixed(1)} h)` : ''}`));
  const coins = days.slice(1).reduce((a, d) => a + d.coins, 0) / Math.max(1, days.length - 1);
  avgs.push({ name: setup.name, coins });
  console.log(`   settled income: ${Math.round(coins)} coins a day\n`);
}

// Sweeping the meadow instead of ranching: the real valley, wild downies foraging the wild food, and a
// hand that walks the meadow every hour and a half picking up every piece of fluff lying outside the ranch
// and selling it (the playtest swept up +122 coins in 23 s and +180 in 34 s, about 8 times ranching).
{
  Math.random = rng(13);
  const sim = new Sim(null);
  const s = sim.s;
  s.hour = 6;
  s.night = s.day;
  s.player.x = -15.5;
  s.player.z = 37.2;
  const aim: Aim = { ex: s.player.x, ey: s.player.y + 1.6, ez: s.player.z, dx: 0, dy: 0, dz: -1, mx: s.player.x, my: s.player.y + 1.4, mz: s.player.z - 0.6 };
  const days: { coins: number; fluff: number; peak: number; meals: number }[] = [];
  let t = 0;
  for (let k = 0; k < 3; k++) {
    const day = { coins: 0, fluff: 0, peak: 0, meals: 0 };
    const fed0 = s.stats.fed;
    let next = 0;
    while (s.hour < 21) {
      sim.update(1 / 20, idle, aim);
      sim.events.length = 0;
      t += 1 / 20;
      if (t >= next) {
        next = t + 1.5 * HOUR;
        let lying = 0;
        for (const it of s.items) {
          if (it.gone || !isTuft(it.type) || zoneAt(it.x, it.z) === 'ranch') continue;
          lying++;
          it.gone = true;
          const kd = TUFT_KIND[it.type];
          const c = sim.price(kd);
          s.market.sold[kd]++;
          day.coins += c;
          day.fluff++;
        }
        day.peak = Math.max(day.peak, lying);
      }
    }
    day.meals = s.stats.fed - fed0;
    days.push(day);
    sim.sleep();
    sim.events.length = 0;
  }
  console.log('Sweeping the meadow: wild downies forage on their own; every 1.5 game hours a hand picks up all fluff outside the ranch and sells it');
  console.log('   day  wild meals  fluff swept  most lying at once  coins');
  days.forEach((d, i) => console.log(`   ${pad(i + 1, 3)}  ${pad(d.meals, 10)}  ${pad(d.fluff, 11)}  ${pad(d.peak, 18)}  ${pad(d.coins, 5)}`));
  const sweep = days.slice(1).reduce((a, d) => a + d.coins, 0) / 2;
  const pen3 = avgs.find((a) => a.name.startsWith('First pen'))!.coins;
  console.log(`   settled: ${Math.round(sweep)} coins a day sweeping, against ${Math.round(pen3)} for a first pen of three and ${Math.round(avgs[0].coins)} for the starter pen of six\n`);
}

// Neglect: a pen of 6 with a full feeder and nobody tending it.
{
  const setup: Setup = { name: 'Neglect', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [], every: 0, fullFeeders: true };
  const sim = build(setup, 9);
  const s = sim.s;
  const aim: Aim = { ex: s.player.x, ey: s.player.y + 1.6, ez: s.player.z, dx: 0, dy: 0, dz: -1, mx: s.player.x, my: s.player.y + 1.4, mz: s.player.z - 0.6 };
  let t = 0;
  let empty: number | null = null;
  let first: number | null = null;
  let all: number | null = null;
  for (; t < 60 * 60 && all === null; t += 1 / 20) {
    sim.update(1 / 20, idle, aim);
    sim.events.length = 0;
    if (empty === null && s.pads[1].feeder.n === 0) empty = t;
    const out = s.downies.filter((d) => !d.gone && d.pen < 0).length;
    if (first === null && out > 0) first = t;
    if (out === 6) all = t;
  }
  const m = (v: number | null) => (v === null ? 'never (an hour)' : `${(v / 60).toFixed(1)} min`);
  console.log('Neglect: a pen of 6 clover, the feeder filled once (40), nobody tending it');
  console.log(`   feeder empty after ${m(empty)}, first downy out after ${m(first)}, all out after ${m(all)}\n`);
}

// From the end of the lessons to the gates, on the starter income, then the next step up.
{
  const start = 180;
  const a = avgs[0].coins;
  const b = avgs[1].coins;
  const toRidge = (GATES.ridge.cost + 300 + 250 - start) / a;
  console.log(`Gates: with about ${start} coins after the lessons, the feeder (300) and a sprinkler (250) bought on the way,`);
  console.log(`   Ember Ridge (${GATES.ridge.cost}) takes about ${toRidge.toFixed(1)} days on the starter pen; Brook Hollow (${GATES.hollow.cost}) about ${(GATES.hollow.cost / ((b + avgs[4].coins) / 2)).toFixed(1)} more days between the sprinkler and the ember setups.`);
}
