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
// caught today, and the board's rare downy. The sixth playtest's rare one paid
// 2,680 coins against a 700 trip and was easier than a plain catch, so the
// three were no choice: now it is a hunt (a clue, warier than any, lured with
// food) whose coins are three quarters of the trip's, and penned it stays, its
// pen shedding one more fluff a meal for good. Its worth is that lasting fluff
// while a pen of yours has no rare one, and only its coins after.
//
// 1. Variety: thirty mornings of offers for four ranches (the board's own
//    choice, its memory of what it asked for lately included).
// 2. Competing: a morning's offers compete when none is dominated by another,
//    that is when no offer pays a quarter more than another while asking no
//    more of you and lasting no less (a fluff order asks a share of what those
//    downies make by dusk; live downies ask a trip out and back with a catch
//    for each; the rare one a hunt, and penned it lasts). And a real choice:
//    every offer on the board is best at something, the most coins today, a
//    reward that lasts, or no trip out.
// 3. Choosing: five days of the real sim per ranch with a tending hand (as in
//    ranch-balance.ts: gardens into feeders and pens, pen fluff to the crate
//    every hour and a half) under six ways of choosing: always the fluff
//    order, always the live downies (a careful trip at 8 am, the hand away
//    meanwhile; and a careless one), always the rare one (lured, caught and
//    penned), the coins alone (the most pay on the tag), and a hunt while a
//    pen has no rare one, then the most pay.
//   npx tsx scripts/ranch-orders.ts
import { FEEDER_CAP, HOUR, LIVE_EACH, TUFT_KIND, isFood, isTuft, type DownyKind, type Food, type Order } from '../src/games/ranch/defs';
import { rng } from '../src/games/ranch/noise';
import { Sim, GARDEN_SRC, PEN_MEALS, orderKey, type Aim, type Controls } from '../src/games/ranch/sim';
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

const RARE_ODDS = { careful: Object.fromEntries((['clover', 'ember', 'brook'] as DownyKind[]).map((k) => [k, catchRate(k, CAREFUL, 30, 1, 'lured')])), careless: Object.fromEntries((['clover', 'ember', 'brook'] as DownyKind[]).map((k) => [k, catchRate(k, CARELESS, 30, 1, 'lured')])) } as Record<'careful' | 'careless', Partial<Record<DownyKind, { rate: number; secs: number }>>>;
/**
 * The rare one, a hunt: there and back, about 20 s finding it from the clue, 10 s luring it (its food blown near
 * it), then its fight at the lured odds (ranch-catch.ts); one that gets away bolts and is lured again (24 s a miss).
 */
function rareSecs(k: DownyKind, thumb: 'careful' | 'careless' = 'careful'): number {
  const o = RARE_ODDS[thumb][k] ?? { rate: 0.7, secs: 6 };
  return TRIP_M[k] / RUN + 20 + 10 + o.secs + ((1 - o.rate) / Math.max(0.05, o.rate)) * 24;
}

/**
 * The rare one's lasting worth: it joins your ranch (a downy of its kind, shedding two fluff a meal), and penned,
 * everyone in its pen sheds one more fluff a meal, for good. Round 8 counts what taking it today gains over taking
 * it on a later morning, which is what passing it up costs: a day of it (it is offered every morning while a pen of
 * yours has none; round 7 counted three days, and with that it was the best pick every morning it was offered).
 * The downy itself while a pen has room, and the pen of yours that would gain most and has no rare one yet.
 */
const LASTING_DAYS = 1;
function lasting(sim: Sim, o: Order): number {
  if (!o.rare) return 0;
  const s = sim.s;
  const best = sim.penRoom() > 0 ? 3 * 2 * sim.price(o.kind) * LASTING_DAYS : 0;
  let pen = 0;
  s.pads.forEach((p, i) => {
    if (p.kind !== 'pen') return;
    const here = inPen(sim, i);
    // (A pen of ten has no room for it: more than ten get frazzled and hop out.)
    if (!here.length || here.length >= 10 || here.some((d) => d.rare)) return;
    // (Round 7: 3.7 meals a day each, as measured for the tag's number), one more fluff each meal, at today's price;
    // round 10: up to five more fluff a day from the pen (the sim's own figure, where it has one).
    const daily = (sim as unknown as { rareDaily?: (i: number) => number }).rareDaily;
    const v = (daily ? daily.call(sim, i) : here.reduce((a, d) => a + PEN_MEALS * sim.price(d.kind), 0)) * LASTING_DAYS;
    pen = Math.max(pen, v);
  });
  return best + pen;
}

/** What an offer asks of you: a fluff order the share of those downies' fluff by dusk it needs; live downies a trip (real seconds). */
function ask(sim: Sim, o: Order, thumb: 'careful' | 'careless' = 'careful'): { share: number; trip: number } {
  if (o.rare) return { share: 0, trip: rareSecs(o.kind, thumb) };
  if (o.live) return { share: 0, trip: tripSecs(o.kind, o.n, thumb) };
  return { share: o.n / Math.max(1, sim.makes(o.kind, 6) * 0.9), trip: 0 };
}

/**
 * Round 7: the best pick for a catcher, now that catching takes skill (the seventh playtest took the biggest
 * number every morning). Each offer's coins today and lasting worth, less its time out at what the ranch makes
 * meanwhile (its downies' fluff, 3.7 meals a day each, two fluff a meal, over a game day of 720 real seconds).
 */
function pick(sim: Sim, os: Order[], thumb: 'careful' | 'careless'): Order | undefined {
  const kept = sim.kept();
  const perSec = (Object.keys(kept) as DownyKind[]).reduce((a, k) => a + kept[k] * 3.7 * 2 * sim.price(k), 0) / 720;
  const value = (o: Order) => fills(sim, o, thumb) * (worth(o) + lasting(sim, o)) - ask(sim, o, thumb).trip * perSec;
  return [...os].sort((a, b) => value(b) - value(a))[0];
}

/**
 * Round 8: the chance of filling an offer before its deadline. A trip or a hunt leaves at 8 am: due by noon it has
 * 4 game hours (120 real s), by dusk 11 (330 s); one that takes longer than that, at the catcher's odds, fills that
 * share of the time. A fluff order fills (the board asks only for what the ranch can make by then).
 */
function fills(sim: Sim, o: Order, thumb: 'careful' | 'careless'): number {
  if (!o.live) return 1;
  const window = ((o.by ?? 19) - 8) * 30;
  const secs = ask(sim, o, thumb).trip;
  return secs <= window ? 1 : window / secs;
}
/** What filling it adds to the day, over selling the fluff you would sell anyway (the rare one's coins only). */
const worth = (o: Order) => (o.live ? o.n * o.pay : o.pay);
/** A pen of yours with downies in it and no rare one yet (where a rare one's pen bonus would go). */
const inPen = (sim: Sim, i: number) => sim.s.downies.filter((d) => !d.gone && d.pen === i);
const bonusPen = (sim: Sim) => sim.s.pads.some((p, i) => p.kind === 'pen' && inPen(sim, i).length > 0 && inPen(sim, i).length < 10 && !inPen(sim, i).some((d) => d.rare));

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
      return worth(a) >= worth(b) * 1.25 && lasting(sim, a) >= lasting(sim, b) && qa.trip <= qb.trip && qa.share <= qb.share + 0.05;
    }),
  );
}

// ---------------------------------------------------------------- 1 and 2: thirty mornings

const pct = (v: number) => `${Math.round(v * 100)}%`;
console.log('Thistledown price board: the morning offers, and what choosing earns\n');
console.log('1 and 2. Thirty mornings of offers per ranch (6 am, the board choosing as in the game)');
console.log('   ranch                                                     offers  a trip  kinds asked (share of mornings)                 same first   compete');
const allPicks = { careful: { fluff: 0, trip: 0, hunt: 0 }, careless: { fluff: 0, trip: 0, hunt: 0 } };
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
  const rareTrip: number[] = [];
  const best = { fluff: 0, trip: 0, hunt: 0 };
  const picks = { careful: { fluff: 0, trip: 0, hunt: 0 }, careless: { fluff: 0, trip: 0, hunt: 0 } };
  let rarePay = 0;
  let real = 0;
  let lastingDays = 0;
  // Round 8: offers that repeat one of yesterday's (sort, kind and deadline), mornings with three to choose from, and the conditions.
  let repeats = 0;
  let three = 0;
  let prevKeys = new Set<string>();
  const conds: Record<string, number> = { noon: 0, dusk: 0, 'after dark': 0, 'set place': 0 };
  // Round 9: a prized order's pay against the day's plain fluff order by dusk, and offers of a sort and kind back within
  // two mornings (and of those, how many the board could have avoided with another kind of that sort).
  let prized = 0;
  let prizedMost = 0;
  let back2 = 0;
  let avoidable = 0;
  const seen2: Set<string>[] = [];
  let rareNote = '';
  // Round 10: the rare one's figure on its tag (its lasting worth: to the week's end before, five days now) against the
  // trip beside it that morning (the tenth playtest's day 2: "then 1,550 more by day 7" beside a trip of 400).
  const figTrip: number[] = [];
  const DAYS = 30;
  for (let d = 2; d < 2 + DAYS; d++) {
    s.day = d;
    s.hour = 6;
    // From the eleventh morning, every pen holds a rare one already (hunted earlier): its lasting worth is gone.
    if (d === 12) for (const pen of r.pens) {
      const one = s.downies.find((q) => !q.gone && q.pen === pen.pad);
      if (one) one.rare = true;
    }
    sim.postOrders(true);
    const os = sim.offers();
    offers += os.length;
    const keys = os.map(orderKey);
    repeats += keys.filter((k) => prevKeys.has(k)).length;
    prevKeys = new Set(keys);
    if (os.length >= 3) three++;
    for (const o of os) conds[o.from !== undefined ? 'after dark' : o.by === 12 ? 'noon' : 'dusk']++;
    for (const o of os) if (o.rare) conds['set place']++;
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
    if (rr && l) rareTrip.push(worth(rr) / worth(l));
    if (rr && l) {
      const wk = (sim as unknown as { rareWeek?: () => { coins: number } }).rareWeek?.();
      if (wk && wk.coins > 0) figTrip.push(wk.coins / worth(l));
    }
    if (rr) rarePay = Math.max(rarePay, rr.pay);
    // What each offer is best at: the most coins today, a reward that lasts, or no trip out at all. A real choice
    // when every offer on the board is best at something (the sixth playtest's rare one paid most for least work).
    const most = [...os].sort((a, b) => worth(b) - worth(a))[0];
    if (most) best[most.rare ? 'hunt' : most.live ? 'trip' : 'fluff']++;
    const lastBest = [...os].sort((a, b) => lasting(sim, b) - lasting(sim, a))[0];
    const stay = [...os].sort((a, b) => ask(sim, a).trip - ask(sim, b).trip)[0];
    if (os.every((o) => o === most || (o === lastBest && lasting(sim, o) > 0) || (o === stay && ask(sim, o).trip === 0))) real++;
    for (const th of ['careful', 'careless'] as const) {
      const p = pick(sim, os, th);
      if (p) picks[th][p.rare ? 'hunt' : p.live ? 'trip' : 'fluff']++;
    }
    if (rr && bonusPen(sim)) lastingDays++;
    const plains = sim.orderChoices(6).filter((c) => c.kind !== 'thistle');
    const plainDay = Math.max(0, ...plains.map((c) => c.n * sim.price(c.kind)));
    for (const o of os) {
      if (o.mult > 2 && plainDay > 0) {
        prized++;
        prizedMost = Math.max(prizedMost, o.pay / plainDay);
      }
    }
    const sortOf = (o: Order) => (o.rare ? 'rare' : o.live ? 'live' : 'fluff');
    for (const o of os) {
      const k = `${sortOf(o)}:${o.kind}`;
      if (!seen2.slice(-2).some((q) => q.has(k))) continue;
      back2++;
      const pool = sortOf(o) === 'fluff' ? sim.orderChoices(6).map((c) => c.kind) : sim.liveKinds();
      if (pool.some((q) => !seen2.slice(-2).some((z) => z.has(`${sortOf(o)}:${q}`)) && !os.some((z) => sortOf(z) === sortOf(o) && z.kind === q))) avoidable++;
    }
    seen2.push(new Set(os.map((o) => `${sortOf(o)}:${o.kind}`)));
    if (rr && !rareNote) rareNote = `day ${d}: "${sim.offerTag(rr).note}"`;
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
    console.log(`      the rare one's coins against the fluff order's: ${rares[0].toFixed(2)} to ${rares[rares.length - 1].toFixed(2)}, middle ${rares[Math.floor(rares.length / 2)].toFixed(2)}`);
  }
  if (rareTrip.length) {
    rareTrip.sort((a, b) => a - b);
    console.log(`      the rare one's coins against the trip's: ${rareTrip[0].toFixed(2)} to ${rareTrip[rareTrip.length - 1].toFixed(2)} (most it paid: ${rarePay}; the playtest's 2,680 was 3.8 times its trip)`);
  }
  if (figTrip.length) {
    figTrip.sort((a, b) => a - b);
    console.log(`      round 10: the rare one's tag figure against the trip beside it: ${figTrip[0].toFixed(2)} to ${figTrip[figTrip.length - 1].toFixed(2)}, middle ${figTrip[Math.floor(figTrip.length / 2)].toFixed(2)} (${figTrip.length} mornings)`);
  }
  console.log(`      most coins today: fluff order ${best.fluff}, trip ${best.trip}, hunt ${best.hunt} of ${DAYS}; its pen bonus lasts (a pen with no rare one yet; every pen holds one from morning 11) on ${lastingDays}`);
  console.log(`      a real choice, every offer best at something (most coins today, a reward that lasts, no trip out): ${real} of ${DAYS}`);
  console.log(`      round 8: three offers on ${three} of ${DAYS} mornings; offers repeating one of yesterday's (sort, kind and deadline): ${repeats}; conditions: ${Object.entries(conds).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`      round 9: prized offers ${prized}, the most one paid ${prizedMost.toFixed(2)} times the day's plain fluff order (capped at 1.5); a sort and kind back within two mornings ${back2} times, ${avoidable} of them avoidable; the rare one's tag, ${rareNote || 'none offered'}`);
  console.log(`      the best pick, time out charged at what the ranch makes meanwhile: careful catcher fluff order ${picks.careful.fluff}, trip ${picks.careful.trip}, hunt ${picks.careful.hunt}; careless fluff order ${picks.careless.fluff}, trip ${picks.careless.trip}, hunt ${picks.careless.hunt} of ${DAYS}`);
  allPicks.careful.fluff += picks.careful.fluff;
  allPicks.careful.trip += picks.careful.trip;
  allPicks.careful.hunt += picks.careful.hunt;
  allPicks.careless.fluff += picks.careless.fluff;
  allPicks.careless.trip += picks.careless.trip;
  allPicks.careless.hunt += picks.careless.hunt;
}
// Round 10: small thistle ranches (the tenth playtest's one thistle's prized order paid 922 in one sale, more than its
// pen of eight clovers made in a day): the most a thistle fluff order paid on top, against what that clover pen makes
// in a day (eight clovers, 3.7 meals each, two fluff a meal, at the day's price).
for (const th of [1, 2, 3]) {
  const sim = build({ name: '', pens: [{ pad: 1, kind: 'clover', n: 8, ups: ['feeder'] }, { pad: 2, kind: 'thistle', n: th, ups: ['feeder', 'high'] }], gardens: [{ pad: 0, crop: 'cloverhead', ups: ['sprinkler'] }], ridge: true, hollow: false }, 7);
  const s = sim.s;
  let most = 0;
  let mostDay = 0;
  let prizedN = 0;
  let thN = 0;
  for (let d = 2; d < 32; d++) {
    s.day = d;
    s.hour = 6;
    sim.postOrders(true);
    for (const o of sim.offers()) {
      if (o.kind !== 'thistle' || o.live) continue;
      thN++;
      if (o.mult > 2) prizedN++;
      const pen = 8 * 3.7 * 2 * sim.price('clover');
      if (o.pay / pen > most) {
        most = o.pay / pen;
        mostDay = o.pay;
      }
    }
  }
  console.log(`   Small thistle ranch (clover 8, thistle ${th}): ${thN} thistle fluff orders in thirty mornings, ${prizedN} prized; the most one paid on top ${mostDay}, ${most.toFixed(2)} times the clover pen's day of fluff`);
}
console.log(`   Over all four ranches, the best pick: careful fluff order ${allPicks.careful.fluff}, trip ${allPicks.careful.trip}, hunt ${allPicks.careful.hunt}; careless fluff order ${allPicks.careless.fluff}, trip ${allPicks.careless.trip}, hunt ${allPicks.careless.hunt} (each kind of offer the best pick on some mornings: ${(['fluff', 'trip', 'hunt'] as const).every((k) => allPicks.careful[k] + allPicks.careless[k] > 0) ? 'yes' : 'no'})`);
console.log(`   (A trip costs a careful catcher, running: clover ${Math.round(tripSecs('clover', 3))} s for 3, careless ${Math.round(tripSecs('clover', 3, 'careless'))} s; ember ${Math.round(tripSecs('ember', 3))} s for 3, brook ${Math.round(tripSecs('brook', 3))} s for 3. Live downies pay ${Object.entries(LIVE_EACH).map(([k, v]) => `${k} ${v}`).join(', ')} each.)\n`);

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
  // (Round 8: an order for after dark: the hand banks that kind's fluff in the jar until 9 pm, then sells it.)
  const night = s.orders.find((o) => o.state === 'open' && !o.live && o.from !== undefined);
  for (const it of s.items) {
    if (it.gone || !isTuft(it.type) || it.drawn > 0) continue;
    if (sim.phys.penAt(it.x, it.z) < 0 && !r.pens.some((p) => Math.hypot(it.x - PADS[p.pad].x, it.z - PADS[p.pad].z) < PEN_R + 1.5)) continue;
    it.gone = true;
    const k = TUFT_KIND[it.type];
    if (night && night.kind === k && s.hour < night.from!) bank[k]++;
    else coins += sim.sellFluff(k, true);
  }
  if (night && s.hour >= night.from!) {
    for (; bank[night.kind] > 0; bank[night.kind]--) coins += sim.sellFluff(night.kind, true);
  }
  return coins;
}
const bank: Record<DownyKind, number> = { clover: 0, ember: 0, brook: 0, thistle: 0 };

type Way = 'fluff' | 'live' | 'most' | 'careless' | 'rare' | 'mix';
function play(r: Ranch, way: Way, days = 5): { coins: number; filled: number; taken: number; away: number } {
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
    const pendingLive: DownyKind[] = [];
    for (const k of Object.keys(bank) as DownyKind[]) bank[k] = 0;
    // (Up till midnight with an order for after dark open.)
    while (s.hour < 21 || (s.hour < 23.9 && s.orders.some((o) => o.state === 'open' && o.from !== undefined))) {
      sim.update(dt, idle, aim);
      sim.events.length = 0;
      t += dt;
      // At 7 am, at the board: take an offer.
      if (s.hour >= 7 && sim.offers().length) {
        const os = sim.offers();
        // The mix: a hunt while a pen of yours has no rare one in it, then the most pay.
        const hunt = way === 'rare' || (way === 'mix' && bonusPen(sim) && os.some((o) => o.rare));
        const pick =
          way === 'fluff' ? os.findIndex((o) => !o.live) : way === 'live' || way === 'careless' ? os.findIndex((o) => o.live && !o.rare) : hunt ? os.findIndex((o) => o.rare) : os.indexOf([...os].sort((a, b) => worth(b) - worth(a))[0]);
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
        if (trip.rare) {
          // The rare one, caught today, blown into a pen of yours with room, one with no rare one first, where it stays.
          const room = r.pens.filter((p) => inPen(sim, p.pad).length < 10);
          const pens = room.filter((p) => !inPen(sim, p.pad).some((d) => d.rare));
          const at = PADS[(pens[0] ?? room[0] ?? r.pens[0]).pad];
          const d = sim.spawn(trip.kind, at.x, at.z, true);
          d.rare = true;
          d.caught = s.day;
          d.pen = -1;
        } else {
          // Caught today: the crate takes them.
          // (An order for after dark takes them from 9 pm: the hand waits with them in the jar.)
          for (let k = 0; k < trip.n; k++) pendingLive.push(trip.kind);
        }
        trip = null;
      }
      if (pendingLive.length && sim.wantsDowny(pendingLive[0], s.day)) for (const k of pendingLive.splice(0)) sim.sellDowny(k, undefined, undefined, undefined, s.day, false);
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

console.log('3. Six ways of choosing, five days of the real sim each (coins a day over days 2 to 5, the order pays included)');
console.log('   ranch                                     the fluff order          live downies, careful          live downies, careless         the rare one, careful          the most pay (coins)           hunt, then the most pay');
for (const r of RANCHES) {
  const a = play(r, 'fluff');
  const b = play(r, 'live');
  const b2 = play(r, 'careless');
  const b3 = play(r, 'rare');
  const c = play(r, 'most');
  const m = play(r, 'mix');
  const f = (x: { coins: number; filled: number; taken: number; away: number }) => `${String(Math.round(x.coins)).padStart(5)} (${x.filled} of ${x.taken}${x.away ? `, ${Math.round(x.away)} s out` : ''})`;
  console.log(`   ${r.name.slice(0, 40).padEnd(40)}  ${f(a).padEnd(24)} ${f(b).padEnd(30)} ${f(b2).padEnd(30)} ${f(b3).padEnd(30)} ${f(c).padEnd(30)} ${f(m)}`);
}
console.log(`   (A hunt costs a careful catcher: clover ${Math.round(rareSecs('clover'))} s, ember ${Math.round(rareSecs('ember'))} s, brook ${Math.round(rareSecs('brook'))} s; careless ${Math.round(rareSecs('clover', 'careless'))}, ${Math.round(rareSecs('ember', 'careless'))}, ${Math.round(rareSecs('brook', 'careless'))} s.)`);
console.log(`   (n of m: orders filled of taken; s out: real seconds a day on the trip. Careless trips take longer: clover ${Math.round(tripSecs('clover', 3, 'careless'))} s, ember ${Math.round(tripSecs('ember', 3, 'careless'))} s, brook ${Math.round(tripSecs('brook', 3, 'careless'))} s for 3.)`);
