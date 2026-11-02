// Thistledown's economy, measured on the real sim: income per game day for a
// few typical ranches. Each ranch runs from dawn (6 am) to 9 pm, then sleeps,
// for three days. A tending "hand" stands in for the player every hour and a
// half of game time: it picks the gardens, tops up the feeders (or blows food
// into a pen without one), pulls up the fluff in the pens and sells it at the
// crate at that moment's price, so the day's saturation counts. The downies,
// hunger, eating, shedding, fences, gardens, feeders, feed runs and the price
// board's daily orders are the game's own: the hand's sales go through the
// crate's own sale (Sim.sellFluff), so they count towards the day's orders,
// and filling one pays its bonus.
//   npx tsx scripts/ranch-balance.ts
import { BUILD_COST, FEEDER_CAP, PEN_UPS, GARDEN_YIELD, GARDEN_YIELD_SOIL, GOALS, HOUR, KIND, ORDER_BY, TUFT_KIND, isFood, isTuft, type DownyKind, type Food } from '../src/games/ranch/defs';
import { Sim, GARDEN_SRC, GARDEN_TIP, SATURATION, SAT_FLOOR, type Aim, type Controls } from '../src/games/ranch/sim';
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
  /** The day's orders: posted, filled, and the bonus coins they paid. */
  orders: number;
  filled: number;
  bonus: number;
  /** Rounds of tending, and those that found no new food from the gardens. */
  rounds: number;
  bare: number;
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
    // The crate's own sale: today's price, and an order of its kind counts it (filling one pays the bonus).
    const c = sim.sellFluff(TUFT_KIND[it.type], true);
    day.sold++;
    day.coins += c;
  }
  for (const e of sim.events) if (e.t === 'order' && e.state === 'filled') day.bonus += e.bonus;
  sim.events.length = 0;
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
    const day: Day = { sold: 0, coins: 0, grown: 0, eaten: 0, feederLeft: 0, inPens: 0, firstOut: null, orders: 0, filled: 0, bonus: 0, rounds: 0, bare: 0 };
    let next = 0;
    let grown = 0;
    let grownAt = 0;
    let lastRound = -1;
    const fed0 = s.stats.fed;
    while (s.hour < 21) {
      sim.update(dt, idle, aim);
      // At 7 am the hand takes the board's fluff order (the morning's offers are a choice now; see ranch-orders.ts).
      if (s.hour >= 7 && sim.offers().length) sim.takeOrder(Math.max(0, sim.offers().findIndex((o) => !o.live)));
      // Crops, onto the gardens' beds or straight into a feeder by a feed run.
      for (const e of sim.events) if (e.t === 'crop') grown += s.pads[e.pad].ups.includes('soil') ? GARDEN_YIELD_SOIL : GARDEN_YIELD;
      for (const e of sim.events) if (e.t === 'order' && e.state === 'filled') day.bonus += e.bonus;
      sim.events.length = 0;
      t += dt;
      if (setup.every > 0 && t >= next) {
        next = t + setup.every * HOUR;
        // Each round a full interval after the last (not the one at dawn, straight after the night): did the
        // gardens grow anything since?
        if (lastRound >= 0) {
          day.rounds++;
          if (grown === grownAt) day.bare++;
        }
        lastRound = t;
        grownAt = grown;
        tend(sim, setup, day, pool);
      }
      if (day.firstOut === null && s.downies.some((d) => !d.gone && d.pen < 0)) day.firstOut = s.hour;
    }
    if (setup.every > 0) tend(sim, setup, day, pool);
    day.orders = s.orders.filter((o) => o.state !== 'offer').length;
    day.filled = s.orders.filter((o) => o.state === 'filled').length;
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
  { name: 'Starter with a feed run: the starter garden fills the pen of 6\'s feeder', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['run'] }], every: 1.5 },
  { name: 'Late ranch: clover 10, ember 10, thistle 3 (high fence), two gardens with feed runs', pens: [{ pad: 1, kind: 'clover', n: 10, ups: ['feeder'] }, { pad: 3, kind: 'ember', n: 10, ups: ['feeder'] }, { pad: 5, kind: 'thistle', n: 3, ups: ['feeder', 'high'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['run', 'sprinkler', 'soil'] }, { pad: 4, crop: 'sweetroot', ups: ['run', 'sprinkler', 'soil'] }], every: 1.5 },
  { name: 'First pen: 3 clover, hand-fed, the starter garden', pens: [{ pad: 1, kind: 'clover', n: 3, ups: [] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: [] }], every: 1.5 },
];

const pad = (v: string | number, n: number) => String(v).padStart(n);
console.log('Thistledown balance: one game day is 6 am to 9 pm (7.5 real minutes), then sleep.');
console.log(`Prices: base ${Object.entries(KIND).map(([k, v]) => `${k} ${v.value}`).join(', ')}; each sale today takes ${(SATURATION * 100).toFixed(1)}% off, down to ${Math.round(SAT_FLOOR * 100)}%.`);
console.log(`Gates: ${GATES.ridge.name} ${GATES.ridge.cost}, ${GATES.hollow.name} ${GATES.hollow.cost}.\n`);
const avgs: { name: string; coins: number }[] = [];
const orderRows: { name: string; coins: number; bonus: number; filled: number; posted: number; bare: number; rounds: number }[] = [];
for (const setup of SETUPS) {
  const days = runSetup(setup);
  console.log(setup.name);
  console.log('   day  fluff  coins  per fluff  grown  eaten  feeder left  in pens  orders  bonus  bare rounds');
  days.forEach((d, i) => console.log(`   ${pad(i + 1, 3)}  ${pad(d.sold, 5)}  ${pad(d.coins, 5)}  ${pad((d.coins / Math.max(1, d.sold)).toFixed(1), 9)}  ${pad(d.grown, 5)}  ${pad(d.eaten, 5)}  ${pad(d.feederLeft, 11)}  ${pad(d.inPens, 7)}  ${pad(`${d.filled}/${d.orders}`, 6)}  ${pad(d.bonus, 5)}  ${pad(`${d.bare}/${d.rounds}`, 11)}${d.firstOut !== null ? `  (one out at ${d.firstOut.toFixed(1)} h)` : ''}`));
  const settled = days.slice(1);
  const coins = settled.reduce((a, d) => a + d.coins, 0) / Math.max(1, settled.length);
  const bonus = settled.reduce((a, d) => a + d.bonus, 0) / Math.max(1, settled.length);
  avgs.push({ name: setup.name, coins });
  orderRows.push({ name: setup.name, coins, bonus, filled: settled.reduce((a, d) => a + d.filled, 0), posted: settled.reduce((a, d) => a + d.orders, 0), bare: days.reduce((a, d) => a + d.bare, 0), rounds: days.reduce((a, d) => a + d.rounds, 0) });
  console.log(`   settled income: ${Math.round(coins)} coins a day, ${Math.round(bonus)} of it from orders\n`);
}

// The order economy: what the day's orders add to each ranch, and how often the gardens came up empty.
console.log('The order economy (settled days; the hand sells everything, so it fills what the ranch can make by dusk)');
console.log('   ranch                                                                     income  from orders  orders filled  bare garden rounds');
for (const r of orderRows) console.log(`   ${r.name.slice(0, 72).padEnd(72)}  ${pad(Math.round(r.coins), 6)}  ${pad(`${Math.round(r.bonus)} (${Math.round((r.bonus / Math.max(1, r.coins)) * 100)}%)`, 11)}  ${pad(`${r.filled} of ${r.posted}`, 13)}  ${pad(`${r.bare} of ${r.rounds}`, 18)}`);
console.log(`   (The hand takes the morning's fluff order at 7 am. Orders close at ${ORDER_BY}:00; an order's fluff sells at the board's price and filling it pays about that again, a prized one twice again.)\n`);

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

// Neglect: a pen of 6 left alone: with a feeder filled once, then with the starter garden's feed run
// filling it, then a pen of 8 and an ember pen of 6 with feed runs left for a ten-minute thistle trip.
// (The third playtest's five-minute trip found every pen starving, embers frazzled and downies out.)
{
  const m = (v: number | null) => (v === null ? 'never (an hour)' : `${(v / 60).toFixed(1)} min`);
  const leave = (setup: Setup, minutes: number, seed: number) => {
    const sim = build(setup, seed);
    const s = sim.s;
    // With no garden listed, no garden at all (the starter garden's full bed would tip its crop into the feeder).
    if (!setup.gardens.length) {
      s.pads[0].kind = 'empty';
      s.pads[0].crop = null;
      sim.phys.setPads(s.pads);
    }
    // No pests (this is about food: a hedge keeps them off); the clock runs (and the first day's 6 pm wait is past).
    sim.teaching = true;
    s.learn = ['time', 'evening'];
    const aim: Aim = { ex: s.player.x, ey: s.player.y + 1.6, ez: s.player.z, dx: 0, dy: 0, dz: -1, mx: s.player.x, my: s.player.y + 1.4, mz: s.player.z - 0.6 };
    let empty: number | null = null;
    let first: number | null = null;
    let all: number | null = null;
    let fraz = 0;
    let peak = 0;
    const n = setup.pens.reduce((a, p) => a + p.n, 0);
    for (let t = 0; t < minutes * 60 && all === null; t += 1 / 20) {
      sim.update(1 / 20, idle, aim);
      sim.events.length = 0;
      if (empty === null && setup.pens.every((p) => s.pads[p.pad].feeder.n === 0)) empty = t;
      const out = s.downies.filter((d) => !d.gone && d.pen < 0).length;
      if (first === null && out > 0) first = t;
      if (out === n) all = t;
      fraz = Math.max(fraz, s.downies.filter((d) => !d.gone && d.mood === 'frazzled').length);
      peak = Math.max(peak, ...s.downies.filter((d) => !d.gone).map((d) => d.hunger));
    }
    return { empty, first, all, fraz, peak };
  };
  const a = leave({ name: 'Neglect', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [], every: 0, fullFeeders: true }, 60, 9);
  console.log(`Neglect: a pen of 6 clover, the feeder filled once (${FEEDER_CAP}), nobody tending it`);
  console.log(`   feeder empty after ${m(a.empty)}, first downy out after ${m(a.first)}, all out after ${m(a.all)}`);
  // Round 6: the starter garden beside it, no feed run, the feeder filled once with a jar's worth: its full bed tips its crop in.
  const a2 = leave({ name: 'Bare', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: [] }], every: 0 }, 60, 9);
  console.log(`   the same pen beside the bare starter garden (no feed run; its full bed tips its crop into the feeder), the feeder empty at the start: first downy out after ${m(a2.first)}, most frazzled at once ${a2.fraz}, hungriest ${a2.peak.toFixed(2)}`);
  const b = leave({ name: 'Run', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['run'] }], every: 0 }, 60, 9);
  console.log(`   the same pen beside the starter garden with a feed run (feeder empty at the start): first downy out after ${m(b.first)}, most frazzled at once ${b.fraz}, hungriest ${b.peak.toFixed(2)}`);
  const c = leave({ name: 'Trip', pens: [{ pad: 1, kind: 'clover', n: 8, ups: ['feeder'] }, { pad: 4, kind: 'ember', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['run', 'sprinkler'] }, { pad: 3, crop: 'sweetroot', ups: ['run', 'sprinkler'] }], every: 0, fullFeeders: true }, 10, 4);
  const c0 = leave({ name: 'Trip, no runs', pens: [{ pad: 1, kind: 'clover', n: 8, ups: ['feeder'] }, { pad: 4, kind: 'ember', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler'] }, { pad: 3, crop: 'sweetroot', ups: ['sprinkler'] }], every: 0 }, 10, 4);
  console.log(`   a ten-minute trip from a clover pen of 8 and an ember pen of 6 with sprinkler gardens: with feed runs, first out ${m(c.first)}, most frazzled ${c.fraz}, hungriest ${c.peak.toFixed(2)};`);
  console.log(`      without them (feeders empty, as the playtest left them), first out ${m(c0.first)}, most frazzled ${c0.fraz}, hungriest ${c0.peak.toFixed(2)}\n`);
}

// Round 7: feeders beside a garden, nobody topping them up or picking the garden. The seventh playtest's clover
// feeder read 58 to 60 every day from day 2 to day 7 untouched: a full bed tipped all its crop into it. Now it
// tips a third (GARDEN_TIP), so a feeder still wants a top-up every day or two; the feed run (an upgrade) still
// sends it all. The control replays the old share (all of it).
{
  const untended = (setup: Setup, start: number, share: number, days = 5, seed = 9) => {
    const was = GARDEN_TIP.share;
    GARDEN_TIP.share = share;
    try {
      const sim = build(setup, seed);
      const s = sim.s;
      for (const p of setup.pens) s.pads[p.pad].feeder = { t: FAV[p.kind], n: start };
      // A full bed from the start (the garden has stood unpicked a while), no pests, the clock running.
      for (const g of setup.gardens) {
        const at = PADS[g.pad];
        for (let k = 0; k < 12; k++) {
          const it = newItem(s, g.crop, at.x + (k % 4) - 1.5, 0, at.z + Math.floor(k / 4) - 1, GARDEN_SRC + g.pad);
          it.y = sim.phys.floor(it.x, it.z) + it.r;
          it.rest = true;
          s.items.push(it);
        }
      }
      sim.teaching = true;
      s.learn = ['time', 'evening'];
      const aim: Aim = { ex: s.player.x, ey: s.player.y + 1.6, ez: s.player.z, dx: 0, dy: 0, dz: -1, mx: s.player.x, my: s.player.y + 1.4, mz: s.player.z - 0.6 };
      const dawn: number[] = [];
      let dry: number | null = null;
      let out: number | null = null;
      let tipped = 0;
      let lastDay = s.day;
      const pad = setup.pens[0].pad;
      for (let t = 0; t < days * 24 * HOUR; t += 1 / 20) {
        sim.update(1 / 20, idle, aim);
        for (const e of sim.events) if (e.t === 'store' && e.auto) tipped++;
        sim.events.length = 0;
        if (s.day !== lastDay) lastDay = s.day;
        if (dawn.length < days && s.hour >= 6 && s.hour < 6.1 && dawn.length < s.day - 1 + 1 && t > 1) dawn.push(s.pads[pad].feeder.n);
        if (dry === null && s.pads[pad].feeder.n === 0) dry = t / (24 * HOUR);
        if (out === null && s.downies.some((d) => !d.gone && d.pen < 0)) out = t / (24 * HOUR);
      }
      return { dawn, dry, out, tipped };
    } finally {
      GARDEN_TIP.share = was;
    }
  };
  const d = (v: number | null) => (v === null ? 'never' : `day ${(1 + v).toFixed(1)}`);
  console.log(`Feeders beside a garden, nobody topping them up or picking it (round 7: a full bed tips ${Math.round(GARDEN_TIP.share * 100)}% of its crop into the feeder next door; it tipped all of it)`);
  console.log('   ranch                                                 tip    feeder at each 6 am (from 6 am, day 1)   runs dry   first out');
  const rows: [string, Setup, number][] = [
    ['pen of 6 clover, the bare starter garden, feeder full', { name: '', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: [] }], every: 0 }, FEEDER_CAP],
    ['the same, a jar\'s worth (12) in the feeder', { name: '', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: [] }], every: 0 }, 12],
    ['pen of 6 clover, a sprinkler garden, feeder full', { name: '', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler'] }], every: 0 }, FEEDER_CAP],
    ['pen of 10 clover, sprinkler and rich soil, feeder full', { name: '', pens: [{ pad: 1, kind: 'clover', n: 10, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler', 'soil'] }], every: 0 }, FEEDER_CAP],
  ];
  for (const [name, setup, start] of rows) {
    for (const share of [GARDEN_TIP.share, 1]) {
      const r = untended(setup, start, share);
      console.log(`   ${name.padEnd(54)} ${share === 1 ? 'all ' : `${Math.round(share * 100)}% `}   ${r.dawn.map((v) => String(v).padStart(3)).join(' ').padEnd(40)} ${d(r.dry).padEnd(10)} ${d(r.out)}${share === 1 ? '   (the control: round 6)' : ''}`);
    }
  }
  console.log('');
}

// From the end of the lessons to the gates, on the starter income, then the next step up.
{
  const start = 180;
  const a = avgs[0].coins;
  const b = avgs[1].coins;
  const feederCost = PEN_UPS.find((u) => u.id === 'feeder')!.cost;
  const toRidge = (GATES.ridge.cost + feederCost + 250 - start) / a;
  const reward = GOALS.find((g) => g.id === 'ridge')!.reward;
  console.log(`Gates: with about ${start} coins after the lessons, the feeder (${feederCost}) and a sprinkler (250) bought on the way,`);
  console.log(`   Ember Ridge (${GATES.ridge.cost}) takes about ${toRidge.toFixed(1)} days on the starter pen; Brook Hollow (${GATES.hollow.cost}) about ${(GATES.hollow.cost / ((b + avgs[4].coins) / 2)).toFixed(1)} more days between the sprinkler and the ember setups.`);
  console.log(`   Opening the ridge with just the ${GATES.ridge.cost} coins leaves its reward, ${reward}, against a pen at ${BUILD_COST.pen}: the first ember pen is ${reward >= BUILD_COST.pen ? 'affordable at once' : 'not affordable'} (it was 180 against 250).`);
}
