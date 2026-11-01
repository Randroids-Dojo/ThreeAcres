// Thistledown's price board, measured on the real sim: what the morning's
// offers ask for, how often they compete, and what each way of choosing earns.
// The fourth playtest found the board only asked for what you already made
// (clover 18, then clover and ember, then ember and thistle, never the six
// brooks kept) with nothing to choose and nothing lost: "after day 4 it's only
// chores". Now the board offers two or three each morning and you take one:
// a fluff order for a day at home, live downies for a trip out, and once you
// keep two kinds a fluff order for another (prized for thistles). The fifth
// playtest's offers paid for the same chores in other sizes (360, 380, 363):
// now there are three kinds of day, a fluff order at home, a trip for downies
// caught today, and the board's rare downy, one sought-after wild one seen at a
// landmark and shy of something, paying more than the fluff order.
//
// 1. Variety: thirty mornings of offers for four ranches (the board's own
//    choice, its memory of what it asked for lately included).
// 2. Competing: a morning's offers compete when none is dominated by another,
//    that is when no offer pays a quarter more than another while asking no
//    more of you (a fluff order asks a share of what those downies make by
//    dusk; live downies ask a trip out and back with a catch for each).
// 3. Choosing: three days of the real sim per ranch with a tending hand (as in
//    ranch-balance.ts: gardens into feeders and pens, pen fluff to the crate
//    every hour and a half) under three ways of choosing: always the fluff
//    order, always the live downies (a careful trip at 8 am, the hand away
//    meanwhile), and always the one that pays most.
//   npx tsx scripts/ranch-orders.ts
import { FEEDER_CAP, HOUR, LIVE_EACH, TUFT_KIND, isFood, isTuft, type DownyKind, type Food, type Order } from '../src/games/ranch/defs';
import { rng } from '../src/games/ranch/noise';
import { Sim, GARDEN_SRC, type Aim, type Controls } from '../src/games/ranch/sim';
import { newItem } from '../src/games/ranch/state';
import { BED_HALF } from '../src/games/ranch/physics';
import { PADS, PEN_R } from '../src/games/ranch/world';
import { CARELESS, CAREFUL, catchRate, type Thumb } from './ranch-catch';

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const FAV: Record<DownyKind, Food> = { clover: 'cloverhead', ember: 'sweetroot', brook: 'dewberry', thistle: 'cloverhead' };

interface Ranch {
  name: string;
  pens: { pad: number; kind: DownyKind; n: number; ups: string[] }[];
  gardens: { pad: number; crop: Food; ups: string[] }[];
  ridge: boolean;
  hollow: boolean;
  /** Fluff sold so far by kind (the playtest's ranch sold mostly clover and ember). */
  sold?: Partial<Record<DownyKind, number>>;
}

const RANCHES: Ranch[] = [
  { name: 'Starter: clover pen of 6, the meadow only', pens: [{ pad: 1, kind: 'clover', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler'] }], ridge: false, hollow: false },
  { name: 'Ridge open: clover 8, ember 6', pens: [{ pad: 1, kind: 'clover', n: 8, ups: ['feeder'] }, { pad: 4, kind: 'ember', n: 6, ups: ['feeder'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler'] }, { pad: 3, crop: 'sweetroot', ups: ['sprinkler'] }], ridge: true, hollow: false },
  {
    name: "The playtest's: clover 10, ember 10, brook 6 (brook sold little)",
    pens: [{ pad: 1, kind: 'clover', n: 10, ups: ['feeder'] }, { pad: 4, kind: 'ember', n: 10, ups: ['feeder'] }, { pad: 2, kind: 'brook', n: 6, ups: ['feeder', 'trough'] }],
    gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler', 'run'] }, { pad: 3, crop: 'sweetroot', ups: ['sprinkler', 'run'] }, { pad: 5, crop: 'dewberry', ups: ['sprinkler'] }],
    ridge: true,
    hollow: true,
    sold: { clover: 420, ember: 260, brook: 8 },
  },
  {
    name: 'Late: clover 10, ember 8, brook 6, thistle 3',
    pens: [{ pad: 1, kind: 'clover', n: 10, ups: ['feeder'] }, { pad: 4, kind: 'ember', n: 8, ups: ['feeder'] }, { pad: 2, kind: 'brook', n: 6, ups: ['feeder', 'trough'] }, { pad: 5, kind: 'thistle', n: 3, ups: ['feeder', 'high'] }],
    gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler', 'soil', 'run'] }, { pad: 3, crop: 'sweetroot', ups: ['sprinkler', 'soil', 'run'] }],
    ridge: true,
    hollow: true,
  },
];

function build(r: Ranch, seed: number): Sim {
  Math.random = rng(seed);
  const sim = new Sim(null);
  const s = sim.s;
  sim.wild = false;
  s.downies = [];
  s.items = [];
  s.hour = 6;
  s.night = s.day;
  s.player.x = -15.5;
  s.player.z = 37.2;
  s.gates.ridge = r.ridge;
  s.gates.hollow = r.hollow;
  sim.phys.gates = { ...s.gates };
  s.stats.kinds = { ...(r.sold ?? {}) };
  for (const g of r.gardens) {
    const p = s.pads[g.pad];
    p.kind = 'garden';
    p.crop = g.crop;
    p.ups = [...g.ups];
  }
  for (const pen of r.pens) {
    const p = s.pads[pen.pad];
    p.kind = 'pen';
    p.ups = [...pen.ups];
  }
  sim.phys.setPads(s.pads);
  for (const pen of r.pens) {
    const at = PADS[pen.pad];
    for (let k = 0; k < pen.n; k++) {
      const a = (k / pen.n) * Math.PI * 2;
      sim.spawn(pen.kind, at.x + Math.cos(a) * 2, at.z + Math.sin(a) * 2, true).hunger = 0.2 + 0.3 * Math.random();
    }
  }
  // The board is in play (the lessons are done).
  s.learn.push('orders');
  return sim;
}

// ---------------------------------------------------------------- the cost of a trip

/** Metres from the crate to each kind's home ground and back, by the lanes and gates. */
const TRIP_M: Record<DownyKind, number> = { clover: 2 * 51, ember: 2 * 78, brook: 2 * 112, thistle: 2 * 140 };
const RUN = 7.4;
const oddsFor = (t: Thumb): Partial<Record<DownyKind, { rate: number; secs: number }>> => Object.fromEntries((['clover', 'ember', 'brook'] as DownyKind[]).map((k) => [k, catchRate(k, t, 30)]));
const ODDS = { careful: oddsFor(CAREFUL), careless: oddsFor(CARELESS) };
/** Real seconds out for n downies of a kind: there and back running, and about 6 s finding each plus its catch (a miss costs a try of 14 s). */
function tripSecs(k: DownyKind, n: number, thumb: 'careful' | 'careless' = 'careful'): number {
  const o = ODDS[thumb][k] ?? { rate: 0.9, secs: 6 };
  const per = 6 + o.secs + ((1 - o.rate) / Math.max(0.05, o.rate)) * 14;
  return TRIP_M[k] / RUN + n * per;
}

/** The rare one: a trip for one catch, with the hunt for it (the spot, and creeping in the way it allows) a quarter longer. */
const rareSecs = (k: DownyKind, thumb: 'careful' | 'careless' = 'careful') => tripSecs(k, 1, thumb) * 1.25;

/** What an offer asks of you: a fluff order the share of those downies' fluff by dusk it needs; live downies a trip (real seconds). */
function ask(sim: Sim, o: Order): { share: number; trip: number } {
  if (o.rare) return { share: 0, trip: rareSecs(o.kind) };
  if (o.live) return { share: 0, trip: tripSecs(o.kind, o.n) };
  return { share: o.n / Math.max(1, sim.makes(o.kind, 6) * 0.9), trip: 0 };
}
/** What filling it adds to the day, over selling the fluff you would sell anyway. */
const worth = (o: Order) => (o.live ? o.n * o.pay : o.pay);

/**
 * Is any offer dominated by another: does another pay a quarter more while asking no more of you (no longer a
 * trip, no larger share of its kind's day)? A fluff order and a trip ask different things, so neither dominates
 * the other; two fluff orders compete on pay against share.
 */
function dominated(sim: Sim, offers: Order[]): boolean {
  return offers.some((b) =>
    offers.some((a) => {
      if (a === b) return false;
      const qa = ask(sim, a);
      const qb = ask(sim, b);
      return worth(a) >= worth(b) * 1.25 && qa.trip <= qb.trip && qa.share <= qb.share + 0.05;
    }),
  );
}

// ---------------------------------------------------------------- 1 and 2: thirty mornings

const pct = (v: number) => `${Math.round(v * 100)}%`;
console.log('Thistledown price board: the morning offers, and what choosing earns\n');
console.log('1 and 2. Thirty mornings of offers per ranch (6 am, the board choosing as in the game)');
console.log('   ranch                                                     offers  a trip  kinds asked (share of mornings)                 same first   compete');
for (const r of RANCHES) {
  const sim = build(r, 3);
  const s = sim.s;
  let offers = 0;
  let trips = 0;
  let same = 0;
  let compete = 0;
  let prev = '';
  const asked: Record<string, number> = {};
  const ratios: number[] = [];
  const rares: number[] = [];
  const DAYS = 30;
  for (let d = 2; d < 2 + DAYS; d++) {
    s.day = d;
    s.hour = 6;
    sim.postOrders(true);
    const os = sim.offers();
    offers += os.length;
    if (os.some((o) => o.live)) trips++;
    for (const k of new Set(os.map((o) => o.kind))) asked[k] = (asked[k] ?? 0) + 1;
    const first = `${os[0]?.kind}`;
    if (first === prev) same++;
    prev = first;
    if (!dominated(sim, os)) compete++;
    const f = os.find((o) => !o.live);
    const l = os.find((o) => o.live && !o.rare);
    if (f && l) ratios.push(worth(l) / (f.pay / (f.mult - 1)));
    const rr = os.find((o) => o.rare);
    if (rr && f) rares.push(worth(rr) / f.pay);
  }
  const kinds = Object.entries(asked)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${pct(n / DAYS)}`)
    .join(', ');
  console.log(`   ${r.name.slice(0, 56).padEnd(56)}  ${(offers / DAYS).toFixed(1).padStart(6)}  ${pct(trips / DAYS).padStart(6)}  ${kinds.padEnd(48)}  ${String(same).padStart(4)} of ${DAYS}  ${pct(compete / DAYS).padStart(7)}`);
  if (ratios.length) {
    ratios.sort((a, b) => a - b);
    console.log(`      a trip's worth against a plain fluff order's: ${ratios[0].toFixed(2)} to ${ratios[ratios.length - 1].toFixed(2)}, middle ${ratios[Math.floor(ratios.length / 2)].toFixed(2)}`);
  }
  if (rares.length) {
    rares.sort((a, b) => a - b);
    console.log(`      the rare one's pay against the fluff order's: ${rares[0].toFixed(2)} to ${rares[rares.length - 1].toFixed(2)}, middle ${rares[Math.floor(rares.length / 2)].toFixed(2)}`);
  }
}
console.log(`   (A trip costs a careful catcher, running: clover ${Math.round(tripSecs('clover', 3))} s for 3, ember ${Math.round(tripSecs('ember', 3))} s for 3, brook ${Math.round(tripSecs('brook', 3))} s for 3. Live downies pay ${Object.entries(LIVE_EACH).map(([k, v]) => `${k} ${v}`).join(', ')} each.)\n`);

// ---------------------------------------------------------------- 3: three ways of choosing

/** The hand's round: garden food into the feeders (or the pens), pen fluff sold at the crate. */
function tend(sim: Sim, r: Ranch, pool: Record<Food, number>): number {
  const s = sim.s;
  let coins = 0;
  for (const it of s.items) {
    if (it.gone || it.drawn > 0 || !isFood(it.type) || it.src < GARDEN_SRC) continue;
    const at = PADS[it.src - GARDEN_SRC];
    if (Math.abs(it.x - at.x) < BED_HALF + 1 && Math.abs(it.z - at.z) < BED_HALF + 1) {
      it.gone = true;
      pool[it.type]++;
    }
  }
  for (const pen of r.pens) {
    const p = s.pads[pen.pad];
    const f = FAV[pen.kind];
    if (p.ups.includes('feeder') && (p.feeder.t === null || p.feeder.t === f)) {
      const add = Math.min(pool[f], FEEDER_CAP - p.feeder.n);
      if (add > 0) {
        p.feeder.t = f;
        p.feeder.n += add;
        pool[f] -= add;
      }
    } else if (!p.ups.includes('feeder')) {
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
    if (sim.phys.penAt(it.x, it.z) < 0 && !r.pens.some((p) => Math.hypot(it.x - PADS[p.pad].x, it.z - PADS[p.pad].z) < PEN_R + 1.5)) continue;
    it.gone = true;
    coins += sim.sellFluff(TUFT_KIND[it.type], true);
  }
  return coins;
}

type Way = 'fluff' | 'live' | 'most' | 'careless' | 'rare';
function play(r: Ranch, way: Way, days = 3): { coins: number; filled: number; taken: number; away: number } {
  const thumb = way === 'careless' ? 'careless' : 'careful';
  const sim = build(r, 11);
  const s = sim.s;
  const aim: Aim = { ex: s.player.x, ey: s.player.y + 1.6, ez: s.player.z, dx: 0, dy: 0, dz: -1, mx: s.player.x, my: s.player.y + 1.4, mz: s.player.z - 0.6 };
  const pool: Record<Food, number> = { cloverhead: 0, sweetroot: 0, dewberry: 0 };
  let coins = 0;
  let filled = 0;
  let taken = 0;
  let away = 0;
  const dt = 1 / 20;
  for (let d = 0; d < days; d++) {
    const c0 = s.coins;
    let next = 0;
    let t = 0;
    let trip: { kind: DownyKind; n: number; back: number; rare: boolean } | null = null;
    while (s.hour < 21) {
      sim.update(dt, idle, aim);
      sim.events.length = 0;
      t += dt;
      // At 7 am, at the board: take an offer.
      if (s.hour >= 7 && sim.offers().length) {
        const os = sim.offers();
        const pick =
          way === 'fluff' ? os.findIndex((o) => !o.live) : way === 'live' || way === 'careless' ? os.findIndex((o) => o.live && !o.rare) : way === 'rare' ? os.findIndex((o) => o.rare) : os.indexOf([...os].sort((a, b) => worth(b) - worth(a))[0]);
        const i = pick >= 0 ? pick : 0;
        const o = os[i];
        sim.takeOrder(i);
        taken++;
        // A live order (or the rare one): out at 8 am, away for the trip; the hand tends nothing meanwhile.
        if (o.live) trip = { kind: o.kind, n: o.n, back: -1, rare: !!o.rare };
      }
      const secs = (q: NonNullable<typeof trip>) => (q.rare ? rareSecs(q.kind, thumb) : tripSecs(q.kind, q.n, thumb));
      if (trip && trip.back < 0 && s.hour >= 8) trip.back = t + secs(trip);
      if (trip && trip.back >= 0 && t >= trip.back) {
        away += secs(trip);
        // Caught today (and for the rare order, the rare one): the crate takes them.
        for (let k = 0; k < trip.n; k++) sim.sellDowny(trip.kind, undefined, undefined, undefined, s.day, trip.rare);
        trip = null;
      }
      const out = !!trip && trip.back >= 0;
      if (!out && t >= next) {
        next = t + 1.5 * HOUR;
        tend(sim, r, pool);
      }
    }
    tend(sim, r, pool);
    filled += s.orders.filter((o) => o.state === 'filled').length;
    sim.sleep();
    sim.events.length = 0;
    // The first day settles the ranch; count the rest.
    if (d > 0) coins += s.coins - c0;
  }
  return { coins: coins / (days - 1), filled, taken, away: away / days };
}

console.log('3. Three ways of choosing, three days of the real sim each (coins a day over days 2 and 3, the order pays included)');
console.log('   ranch                                     the fluff order          live downies, careful          live downies, careless         the rare one, careful          the most pay');
for (const r of RANCHES) {
  const a = play(r, 'fluff');
  const b = play(r, 'live');
  const b2 = play(r, 'careless');
  const b3 = play(r, 'rare');
  const c = play(r, 'most');
  const f = (x: { coins: number; filled: number; taken: number; away: number }) => `${String(Math.round(x.coins)).padStart(5)} (${x.filled} of ${x.taken}${x.away ? `, ${Math.round(x.away)} s out` : ''})`;
  console.log(`   ${r.name.slice(0, 40).padEnd(40)}  ${f(a).padEnd(24)} ${f(b).padEnd(30)} ${f(b2).padEnd(30)} ${f(b3).padEnd(30)} ${f(c)}`);
}
console.log(`   (n of m: orders filled of taken; s out: real seconds a day on the trip. Careless trips take longer: clover ${Math.round(tripSecs('clover', 3, 'careless'))} s, ember ${Math.round(tripSecs('ember', 3, 'careless'))} s, brook ${Math.round(tripSecs('brook', 3, 'careless'))} s for 3.)`);
