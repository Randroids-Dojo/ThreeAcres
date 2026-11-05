// Round 7: "Busy days are a sprint and quiet days are empty", "the decisions
// are thin and the same request comes back", "I would stop around Summer 5
// when I was broke." Crops sold only overnight, so a harvest could not be
// planted again the same day; four pairs in seven named one crop on both
// sides, and one came twice with the same numbers; a pair could be offered
// that the farm could take both of; an offer counted coins that seed already
// owed; one crow voided a whole request; Sleep before evening did not ask; a
// tap on a "Too late" seed said nothing; lessons ended on timers while the
// tester was busy.
//
// These read the farm through the simulation, the lessons and the UI's pure
// helpers. New helpers are reached through their modules (`?.`), so on the
// committed round 6 code the tests fail on their assertions, not on imports.
import { describe, expect, it } from 'vitest';
import * as lessons from '../src/games/homestead/lessons';
import { Tutor } from '../src/games/homestead/lessons';
import * as actions from '../src/sim/actions';
import { sowing } from '../src/sim/actions';
import { CROP_IDS, CROPS, inSeason } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import * as goals from '../src/sim/goals';
import { offerRequests, requestHave, whyNot } from '../src/sim/goals';
import { step } from '../src/sim/step';
import { plant, plots, season } from '../src/sim/world';
import type { CropId, Order, SimEvent, WorldState } from '../src/sim/types';
import * as dialogs from '../src/ui/dialogs';
import { noteText, smithLine } from '../src/ui/dialogs';
import * as describeUi from '../src/ui/describe';
import * as hud from '../src/ui/hud';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

const ALL = [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'field', 'turn', 'smith', 'wide', 'hoe', 'stamina'];
const FEATURES = [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'pests', 'build', 'sprinkler', 'forecast', 'hoe', 'smith'];

/** A farm past its first request: `fields` fields owned and hoed, `coins` in hand, an empty crate, nothing growing. */
function farm(seed: number, opts: { fields?: number; coins?: number; day?: number; lessons?: string[] } = {}): WorldState {
  const s = teach(world('sunup', seed), opts.lessons ?? ALL, FEATURES);
  s.day = opts.day ?? 6;
  s.rep = 3;
  s.requested = 1;
  s.orders = [];
  s.coins = opts.coins ?? 400;
  s.forecast = ['sun', 'sun', 'sun'];
  s.weather = 'sun';
  for (let i = 1; i < (opts.fields ?? 1); i++) {
    const p = s.parcels[i];
    p.owned = true;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plots(s, x, y).tilled = true;
  }
  for (const p of s.plots) p.crop = null;
  return s;
}

const fieldTiles = (s: WorldState) => s.plots.map((_, i) => i).filter((i) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && s.tiles[i] === 'field');
const bare = (s: WorldState) => fieldTiles(s).filter((i) => !s.plots[i].crop && s.plots[i].tilled);

/** Plant `n` of a crop for a request on bare plots, as a person would (seed paid), watered. */
function plantFor(s: WorldState, o: Order, n: number, age = 0): void {
  const tiles = bare(s);
  for (let k = 0; k < n; k++) {
    const i = tiles[k];
    plant(s, i % s.W, Math.floor(i / s.W), o.items[0].crop, age);
    s.plots[i].crop!.for = o.id;
    s.plots[i].wet = true;
    s.plots[i].moisture = 3;
  }
}

describe('P1: a crop is paid for the moment it goes into the crate', () => {
  it('a harvest pays at once, with a rise of coins at the crate, and the morning card still sums the day', () => {
    const s = farm(3, { coins: 0 });
    plant(s, 3, 6, 'radish', 3);
    stand(s, 3, 5, 's');
    s.tool = 'hands';
    const ev = step(s, 0.016, [{ type: 'act' }]);
    expect(plots(s, 3, 6).crop).toBeNull();
    // Paid now, not overnight: the coins can buy seed for the same plot today.
    expect(s.coins).toBe(CROPS.radish.price);
    expect(s.stock.radish.reduce((a, b) => a + b, 0)).toBe(0);
    expect(ev.some((e) => e.type === 'coins' && (e as { crate?: boolean }).crate && e.amount === CROPS.radish.price)).toBe(true);
    // Replanted the same day with that money.
    for (let i = 0; i < 20; i++) step(s, 1 / 30);
    s.tool = 'seeds';
    s.seed = 'radish';
    step(s, 0.016, [{ type: 'act' }]);
    for (let i = 0; i < 30; i++) step(s, 1 / 30);
    expect(plots(s, 3, 6).crop?.kind).toBe('radish');
    // Yesterday's sales stay on the morning card.
    nightfall(s, []);
    expect(s.report?.sold.reduce((a, x) => a + x.n, 0)).toBe(1);
    expect(hud.morningNews(s)).toMatch(/[Ss]old 1 for 30/);
  });

  it('a crop sown for a request is paid at market as it goes in; the request pays its gain when filled', () => {
    const s = farm(5, { coins: 0 });
    const o: Order = { id: s.nextId++, who: 'Mabel’s bakery', items: [{ crop: 'radish', n: 2 }], reward: 2 * CROPS.radish.price + 40, rep: 1, due: 9, sowBy: 6, made: 6, seen: true, kind: 'easy', taken: true, got: 0 };
    s.orders = [o];
    plantFor(s, o, 2, 3);
    stand(s, bare(s)[0] % s.W, 4, 's');
    const at = fieldTiles(s).filter((i) => s.plots[i].crop?.for === o.id);
    for (const i of at) {
      stand(s, i % s.W, Math.floor(i / s.W) - 1, 's');
      s.tool = 'hands';
      step(s, 0.016, [{ type: 'act' }]);
      for (let k = 0; k < 20; k++) step(s, 1 / 30);
    }
    // Round 9: the crate hands the request over the moment the last of it goes in, by day (no stamp, no night).
    expect(o.got).toBe(2);
    expect(s.orders.some((q) => q.id === o.id)).toBe(false);
    expect(s.coins).toBe(2 * CROPS.radish.price + 40);
    expect(s.rep).toBe(4);
  });
});

/** Farm states across the year: one to three fields, purses from 60 to 3,000, some soil sown, sometimes seed owed to a taken request. */
function* states(): Generator<WorldState> {
  let seed = 1;
  for (const fields of [1, 2, 3]) for (const coins of [60, 150, 400, 1200, 3000]) for (const day of [4, 6, 8, 13, 15, 24, 26, 34, 36]) for (const variant of [0, 1, 2]) {
    const s = farm(seed++ * 7919, { fields, coins, day });
    const kinds = CROP_IDS.filter((c) => CROPS[c].regrow === 0 && inSeason(c, season(day)));
    const tiles = fieldTiles(s);
    if (variant >= 1) tiles.slice(0, Math.floor(tiles.length / 3)).forEach((i, k) => plant(s, i % s.W, Math.floor(i / s.W), kinds[k % kinds.length], 1));
    if (variant === 2) {
      // A taken request still owes seed: twelve of the cheapest crop, none planted yet.
      const crop = kinds.reduce((a, c) => (CROPS[c].seed < CROPS[a].seed ? c : a), kinds[0]);
      if (crop && sowing(day, crop).ok) s.orders.push({ id: s.nextId++, who: 'Old Tamsin', items: [{ crop, n: 4 }], reward: 4 * CROPS[crop].price + 60, rep: 1, due: day + CROPS[crop].days + 2, sowBy: day + 1, made: day, seen: true, kind: 'easy', taken: true, got: 0 });
    }
    yield s;
  }
}

/**
 * Could the farm take both of a pair, counted here from the farm itself: soil
 * free now or freed by a one-pick crop ripe by the later sow-by day, coins in
 * hand and what the crops ripe by then fetch, less what taken requests still
 * owe. (Not the rules' own measure.)
 */
function takesBoth(s: WorldState, a: Order, b: Order): boolean {
  const by = Math.max(a.sowBy ?? a.due, b.sowBy ?? b.due);
  let room = 0;
  let coins = s.coins;
  for (const i of fieldTiles(s)) {
    if (s.builds.some((q) => q.y * s.W + q.x === i)) continue;
    const c = s.plots[i].crop;
    if (!c || c.dead) room++;
    else if (CROPS[c.kind].days - c.age <= by - s.day) {
      if (CROPS[c.kind].regrow === 0) room++;
      coins += CROPS[c.kind].price;
    }
  }
  for (const o of s.orders) {
    if (o === a || o === b || o.taken === false) continue;
    const still = o.items[0].n - requestHave(s, o);
    room -= still;
    coins -= still * CROPS[o.items[0].crop].seed;
  }
  const n = (o: Order) => o.items[0].n;
  return n(a) + n(b) <= room && n(a) * CROPS[a.items[0].crop].seed + n(b) * CROPS[b.items[0].crop].seed <= coins;
}

const key = (os: Order[]) => [...new Set(os.map((o) => o.items[0].crop))].sort().join('+');

describe('P1: a pair is always a choice', () => {
  it('over many farms: two different crops every time, never the same crops as the offer before, and the farm cannot take both', () => {
    let pairs = 0;
    let differ = 0;
    let oneCrop = 0;
    let compete = 0;
    let seconds = 0;
    let repeats = 0;
    const bad: string[] = [];
    for (const s of states()) {
      const first = offerRequests(s);
      if (first.length === 2) {
        pairs++;
        if (first[0].items[0].crop !== first[1].items[0].crop) differ++;
        // Round 11: two of one crop only as a rush against an easy one, the rush bigger: a choice all the same.
        else if (first.map((o) => o.kind).sort().join() === 'easy,rush' && first.find((o) => o.kind === 'rush')!.items[0].n > first.find((o) => o.kind === 'easy')!.items[0].n) oneCrop++;
        else bad.push(`${s.day}: ${first.map((o) => `${o.items[0].n} ${o.items[0].crop}`).join(' or ')}`);
        const both = [...s.orders, ...first];
        const t = { ...s, orders: both } as WorldState;
        if (!takesBoth(t, first[0], first[1])) compete++;
      }
      // The morning after, both let go: the board never offers the same crops again (round 10: unless no other pair
      // can be made: summer and winter have two crops a request can ask for, and a pair each morning beats one alone).
      if (first.length) {
        const again = offerRequests(s);
        if (again.length) {
          seconds++;
          const kinds = CROP_IDS.filter((c) => CROPS[c].regrow === 0 && sowing(s.day, c).ok && (s.rep >= 2 || c !== 'pumpkin'));
          if (key(again) === key(first) && kinds.length > 2) repeats++;
        }
      }
    }
    expect(pairs).toBeGreaterThan(150);
    expect(differ + oneCrop, bad.slice(0, 3).join('; ')).toBe(pairs);
    expect(oneCrop / pairs).toBeLessThan(0.25);
    expect(compete / pairs).toBeGreaterThanOrEqual(0.9);
    expect(seconds).toBeGreaterThan(150);
    expect(repeats).toBe(0);
  });

  it('the board says what makes them a choice, in eight words or fewer', () => {
    let said = 0;
    for (const s of states()) {
      const offer = offerRequests(s);
      if (offer.length !== 2) continue;
      s.orders.push(...offer);
      const c = (goals as { clashOf?: (s: WorldState, a: Order, b: Order) => { kind: string; need: number; have: number } | null }).clashOf?.(s, offer[0], offer[1]);
      expect(c, `${s.day}`).toBeTruthy();
      const words = (dialogs as { clashWords?: (c: unknown) => string }).clashWords?.(c) ?? '';
      // (Round 9: the coins as the coin box shows them, and what is ripe beside them.)
      expect(words).toMatch(/^Both need [\d,]+ (plots|coins)\. You have [\d,]+(, plus [\d,]+ ripe)?(, [\d,]+ owed)?\.$/);
      expect(words.split(/\s+/).length).toBeLessThanOrEqual(c?.kind === 'soil' ? 8 : 13);
      said++;
    }
    expect(said).toBeGreaterThan(150);
  });

  it('seed a taken request still owes is spoken for: an offer is never priced on it, and its stamp counts it', () => {
    // The tester's Spring 10: 270 in hand, 180 still owed for a request taken earlier.
    const s = farm(11, { coins: 270, day: 4, fields: 2 });
    const owedReq: Order = { id: s.nextId++, who: 'Fen and daughters', items: [{ crop: 'lettuce', n: 12 }], reward: 12 * CROPS.lettuce.price + 120, rep: 1, due: 10, sowBy: 5, made: 4, seen: true, kind: 'easy', taken: true, got: 0 };
    s.orders = [owedReq];
    for (let k = 0; k < 20; k++) {
      s.rng = (k * 104729) | 0;
      s.lastOffer = undefined;
      const offer = offerRequests(s);
      for (const o of offer) expect(o.items[0].n * CROPS[o.items[0].crop].seed, `${o.items[0].n} ${o.items[0].crop}`).toBeLessThanOrEqual(270 - 180);
    }
    // An offer wanting 150 of seed cannot be accepted with 90 free of what is owed.
    const offer: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'carrot', n: 10 }], reward: 10 * CROPS.carrot.price + 150, rep: 1, due: 12, sowBy: 5, made: 4, seen: false, kind: 'easy', taken: false };
    s.orders.push(offer);
    expect(whyNot(s, offer)).toBe('coins');
  });

  it('an offer counted on crops ripe today is not withdrawn at dawn while they are still there to pick', () => {
    const s = farm(13, { coins: 20, day: 3 });
    // Ten radishes ripe: 300 at the crate whenever they are picked.
    fieldTiles(s).slice(0, 10).forEach((i) => plant(s, i % s.W, Math.floor(i / s.W), 'radish', 3));
    const o: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'carrot', n: 6 }], reward: 6 * CROPS.carrot.price + 100, rep: 1, due: 11, sowBy: 4, made: 3, seen: true, kind: 'easy', taken: false };
    s.orders = [o];
    expect(whyNot(s, o)).toBe('');
    // (Round 10: every offer nobody took goes at the next dawn, for a fresh pair; what is checked here is that it is
    // not withdrawn as one that cannot be met.)
    goals.withdrawRequests(s, [], null);
    expect(s.orders.some((q) => q.id === o.id)).toBe(true);
  });
});

describe('P2: one loss no longer voids a request', () => {
  /** Fifteen sunflowers for a request, sown on its sow-by day with no day to spare (a rush). */
  function sunflowers(): { s: WorldState; o: Order } {
    const s = farm(17, { coins: 0, day: 13, fields: 2 });
    s.learn.push('lesson:pests');
    const o: Order = { id: s.nextId++, who: 'Pell’s pickles', items: [{ crop: 'sunflower', n: 15 }], reward: 15 * CROPS.sunflower.price + 305, rep: 1, due: 19, sowBy: 13, made: 13, seen: true, kind: 'rush', taken: true, got: 0 };
    s.orders = [o];
    plantFor(s, o, 15, 1);
    s.day = 14;
    return { s, o };
  }

  it('a crow takes one of fifteen with no day to replant: the request stays, says what can still come, and pays for it', () => {
    const { s, o } = sunflowers();
    const victim = fieldTiles(s).find((i) => s.plots[i].crop?.for === o.id)!;
    stand(s, 18, 3, 's');
    s.minute = 400;
    s.crows.push({ id: s.nextId++, x: victim % s.W, y: Math.floor(victim / s.W), fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    for (let i = 0; i < 30 * 20 && s.plots[victim].crop; i++) step(s, 1 / 30);
    expect(s.plots[victim].crop).toBeNull();
    expect(s.orders.some((q) => q.id === o.id)).toBe(true);
    expect(requestHave(s, o)).toBe(14);
    expect((goals as { isShort?: (s: WorldState, o: Order) => boolean }).isShort?.(s, o)).toBe(true);
    // The note says so as soon as it happens. (Round 10: and the figure in all is what the fourteen bring, not "pays
    // 285" beside a whole "+1,505 in all", which read as a loss.)
    expect(noteText(s, o).lines.join(' ')).toMatch(/14 of 15 can come/);
    expect(noteText(s, o).lines.join(' ')).not.toMatch(/pays/);
    // The morning after, it is still there.
    nightfall(s, []);
    expect(s.orders.some((q) => q.id === o.id)).toBe(true);
    // The fourteen ripen and are picked: paid that night for fourteen (the gain in part), no reputation.
    for (const i of fieldTiles(s)) if (s.plots[i].crop?.for === o.id) s.plots[i].crop = null;
    o.got = 14;
    const coins = s.coins;
    const rep = s.rep;
    nightfall(s, []);
    expect(s.orders.some((q) => q.id === o.id)).toBe(false);
    expect(s.report?.filled?.[0]).toMatchObject({ reward: 285, got: 14, of: 15 });
    expect(s.coins - coins).toBe(285);
    expect(s.rep).toBe(rep);
    expect(hud.morningNews(s)).toMatch(/paid [\d,]+ in all for 14 of 15/);
  });

  it('a loss with days to spare can be planted again: the request still wants one more, by its last day', () => {
    const s = farm(19, { coins: 100, day: 6 });
    const o: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'lettuce', n: 4 }], reward: 4 * CROPS.lettuce.price + 60, rep: 1, due: 12, sowBy: 6, made: 6, seen: true, kind: 'easy', taken: true, got: 0 };
    s.orders = [o];
    plantFor(s, o, 4, 0);
    s.day = 7;
    const one = fieldTiles(s).find((i) => s.plots[i].crop?.for === o.id)!;
    s.plots[one].crop = null;
    // Past its sow-by day, but lettuce sown today is still ripe by its due day.
    expect(whyNot(s, o)).toBe('');
    expect(noteText(s, o).lines.join(' ')).toMatch(/Plant 1 more by (tomorrow|Spring 8)/);
  });

  it('a request left with nothing coming and no time is lost there and then, by day, with its cause', () => {
    const s = farm(23, { coins: 0, day: 6 });
    s.learn.push('lesson:pests');
    const o: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'carrot', n: 3 }], reward: 3 * CROPS.carrot.price + 60, rep: 1, due: 10, sowBy: 5, made: 5, seen: true, kind: 'rush', taken: true, got: 0 };
    s.orders = [o];
    plantFor(s, o, 1, 1);
    const at = fieldTiles(s).find((i) => s.plots[i].crop?.for === o.id)!;
    stand(s, 18, 3, 's');
    s.minute = 400;
    s.crows.push({ id: s.nextId++, x: at % s.W, y: Math.floor(at / s.W), fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    const ev: SimEvent[] = [];
    for (let i = 0; i < 30 * 20 && s.plots[at].crop; i++) ev.push(...step(s, 1 / 30));
    expect(s.plots[at].crop).toBeNull();
    // Gone the moment it could no longer be met, not at dawn.
    expect(s.orders.some((q) => q.id === o.id)).toBe(false);
    expect(ev.some((e) => e.type === 'request' && e.id === o.id && !e.done && (e as { why?: string }).why === 'crows')).toBe(true);
    // The morning card says it once: crows ate one, and the request went (not "(crows ate 1)" again).
    nightfall(s, []);
    const news = hud.morningNews(s);
    expect(news).toMatch(/Crows ate 1/);
    expect(news).toMatch(/Old Tamsin found carrots elsewhere/);
    expect(news).not.toMatch(/\(crows ate 1\)/);
  });
});

describe('P1 and P2: the sleep question', () => {
  const sleepAsk = (s: WorldState, o: { teaching?: boolean; flock?: boolean; owedToday?: number }) =>
    (actions as { sleepAsk?: (s: WorldState, o: { teaching: boolean; flock: boolean; owedToday: number }) => { ask: boolean } }).sleepAsk?.(s, { teaching: false, flock: false, owedToday: 0, ...o })?.ask;

  it('before evening it asks while a job is left (round 11: never with none left); after 6 pm only when the night costs something', () => {
    const s = farm(29, { coins: 0 });
    s.minute = 9 * 60 + 27; // 3:27 pm
    expect(sleepAsk(s, {})).toBe(false);
    plant(s, 2, 5, 'radish', 3);
    expect(sleepAsk(s, {})).toBe(true);
    plots(s, 2, 5).crop = null;
    s.minute = 13 * 60; // 7 pm
    expect(sleepAsk(s, {})).toBe(false);
    // Never while the first lesson teaches sleep.
    s.minute = 120;
    expect(sleepAsk(s, { teaching: true })).toBe(false);
  });

  it('asks at any hour while a request still needs planting today, on its last day for it, and says so in a few words', () => {
    const s = farm(31, { coins: 200, day: 6 });
    const o: Order = { id: s.nextId++, who: 'Mabel’s bakery', items: [{ crop: 'radish', n: 9 }], reward: 9 * CROPS.radish.price + 80, rep: 1, due: 9, sowBy: 6, made: 6, seen: true, kind: 'rush', taken: true, got: 0 };
    s.orders = [o];
    plantFor(s, o, 8, 0);
    s.minute = 15 * 60; // 9 pm
    const owed = (goals as { owedToday?: (s: WorldState) => { n: number }[] }).owedToday?.(s) ?? [];
    expect(owed.map((x) => x.n)).toEqual([1]);
    expect(sleepAsk(s, { owedToday: 1 })).toBe(true);
    const text = (dialogs as { sleepText?: (m: number, w: unknown) => string }).sleepText?.(s.minute, { owed: 1 }) ?? '';
    expect(text).toBe('It is 9:00 pm. A request needs 1 more planted today.');
  });

  it('the question is short: the hour and the one thing most at stake, two sentences, eleven words at most', () => {
    const sleepText = (dialogs as { sleepText?: (m: number, w: unknown) => string }).sleepText;
    expect(sleepText).toBeTypeOf('function');
    for (const why of [{}, { ripe: 6 }, { thirsty: 1 }, { bugs: 3 }, { crows: 1 }, { crows: 2 }, { flock: true }, { owed: 2 }, { ripe: 2, thirsty: 3, bugs: 1, crows: 1 }]) {
      const t = sleepText!(9 * 60 + 27, why);
      expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(11);
      expect(t.split('. ').length, t).toBeLessThanOrEqual(2);
      expect(t).toMatch(/^It is 3:27 pm\./);
    }
  });
});

describe('P2: a seed that cannot go in says so, and a crop that only just ripens is warned of', () => {
  it('a "Too late" carrot keeps the picker open and says why in the crop’s words', () => {
    const s = farm(37, { day: 7 });
    const seedTap = (hud as { seedTap?: (s: WorldState, c: CropId) => { ok: boolean; word: string } }).seedTap;
    expect(seedTap?.(s, 'carrot')).toEqual({ ok: false, word: 'Carrots won’t ripen before summer.' });
  });

  it('lettuce on Spring 7 only just ripens: its card says so, and choosing it warns to water every night', () => {
    const s = farm(41, { day: 7 });
    expect((actions as { justInTime?: (d: number, c: CropId) => boolean }).justInTime?.(7, 'lettuce')).toBe(true);
    expect(describeUi.seedNote(s, 'lettuce').when).toBe('Just in time');
    const seedTap = (hud as { seedTap?: (s: WorldState, c: CropId) => { ok: boolean; word: string } }).seedTap;
    expect(seedTap?.(s, 'lettuce')).toEqual({ ok: true, word: 'Lettuces ripen just before summer. Water every night.' });
    // A day earlier there is a night to spare: no warning.
    s.day = 6;
    expect(seedTap?.(s, 'lettuce')).toEqual({ ok: true, word: '' });
  });
});

describe('P2: lessons end on an action, or once read while idle, and every line stays four seconds', () => {
  const MIN = (lessons as { MIN_SHOW?: number }).MIN_SHOW ?? 0;

  it('bugs picked at once: the line still stays its four seconds, then goes', () => {
    const s = farm(43, { lessons: ALL.filter((l) => l !== 'bugs') });
    plant(s, 4, 6, 'carrot', 2);
    plots(s, 4, 6).crop!.bugs = 1;
    const t = new Tutor();
    expect(t.update(s, 0.1, true).line).toMatch(/Bugs on your carrots/);
    plots(s, 4, 6).crop!.bugs = 0;
    t.onEvent(s, { type: 'tend', x: 4, y: 6, by: 1 });
    let shown = 0.1;
    while (t.update(s, 0.1, true).line.match(/Bugs/) && shown < 10) shown += 0.1;
    expect(MIN).toBe(4);
    expect(shown).toBeGreaterThanOrEqual(MIN - 0.05);
    expect(shown).toBeLessThan(MIN + 0.5);
    expect(s.learn).toContain('lesson:bugs');
  });

  it('the forecast line is not used up while the farmer is busy: twenty busy seconds, still up; four idle, done', () => {
    const s = farm(47, { lessons: ALL.filter((l) => l !== 'forecast') });
    s.learnCount['done:scarecrow'] = 5;
    const t = new Tutor();
    s.actors[0].moving = true;
    for (let i = 0; i < 200; i++) expect(t.update(s, 0.1, true).line).toBe('Check the forecast for rain and heat.');
    expect(s.learn).not.toContain('lesson:forecast');
    s.actors[0].moving = false;
    for (let i = 0; i < 45; i++) t.update(s, 0.1, true);
    expect(s.learn).toContain('lesson:forecast');
  });

  it('the sprinkler line waits for its sprinkler (or an idle read), not a ten-second timer', () => {
    const s = farm(53, { fields: 2, coins: 500, lessons: ALL.filter((l) => l !== 'sprinkler') });
    s.learnCount['done:forecast'] = 5;
    const t = new Tutor();
    s.actors[0].task = { verb: 'water', x: 3, y: 6, t: 0, dur: 99 };
    for (let i = 0; i < 200; i++) t.update(s, 0.1, true);
    expect(s.learn).not.toContain('lesson:sprinkler');
    t.onEvent(s, { type: 'build', x: 3, y: 6, kind: 'sprinkler', by: 1 });
    t.update(s, 0.1, true);
    expect(s.learn).toContain('lesson:sprinkler');
  });

  it('every line names its keys and stays eight words or fewer (the first one names WASD and Space on a desktop)', () => {
    const s = farm(59);
    const desk = new Tutor().update(teach(world('sunup', 59), [], []), 0.1, false).line;
    expect(desk).toBe('Walk with WASD. Space harvests a radish.');
    for (const line of lessons.allLines(s)) expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(8);
  });
});

describe('P3: the small things', () => {
  it('the smith line counts the gold tools: reputation 3 is three short of a gold hoe, not "anything"', () => {
    const s = farm(61);
    // The tester's farm: no copper tools yet (both within reach), so the next the smith wants more for is gold.
    // (Round 8: the gold can wants reputation 4, so it is the next; it wanted 8.)
    s.rep = 3;
    s.tools = { can: 0, hoe: 0 };
    expect(smithLine(s)).toBe('Reputation 3. One more for a gold can.');
    s.rep = 4;
    s.tools = { can: 1, hoe: 1 };
    expect(smithLine(s)).toBe('Reputation 4. Two more for a gold hoe.');
    s.rep = 8;
    s.tools = { can: 1, hoe: 2 };
    expect(smithLine(s)).toBe('Reputation 8. The smith will make anything.');
  });

  it('a wet morning says what you plant needs no water only with bare soil and the coins for a seed', () => {
    const s = farm(67, { coins: 0 });
    s.weather = 'rain';
    s.report = { day: s.day - 1, sold: [], wages: 0, grew: 0, withered: 0, eaten: 0, crewWork: 0, income: 0 };
    expect(hud.morningNews(s)).not.toMatch(/needs no water/);
    s.coins = 100;
    expect(hud.morningNews(s)).toMatch(/needs no water/);
    for (const i of fieldTiles(s)) plant(s, i % s.W, Math.floor(i / s.W), 'radish', 1);
    expect(hud.morningNews(s)).not.toMatch(/needs no water/);
  });

  // Round 9: an offer counts nothing planted before Accept (the ninth playtest's "18 radishes, 16 planted" were market
  // radishes); once taken, what is planted for it counts, and the line says "more".
  it('an offer counts nothing planted before Accept; once taken, the line says "more"', () => {
    const s = farm(71, { coins: 900, day: 13, fields: 2 });
    const o: Order = { id: s.nextId++, who: 'Pell’s pickles', items: [{ crop: 'sunflower', n: 15 }], reward: 15 * CROPS.sunflower.price + 305, rep: 1, due: 20, sowBy: 13, made: 13, seen: true, kind: 'rush', taken: false };
    s.orders = [o];
    fieldTiles(s).slice(0, 6).forEach((i) => plant(s, i % s.W, Math.floor(i / s.W), 'sunflower', 0));
    expect(noteText(s, o).lines.join(' ')).not.toMatch(/planted/);
    expect(goals.requestHave(s, o)).toBe(0);
    for (const p of s.plots) if (p.crop?.kind === 'sunflower') p.crop = null;
    expect(step(s, 0.016, [{ type: 'accept', id: o.id }])).toBeTruthy();
    fieldTiles(s).filter((i) => !s.plots[i].crop).slice(0, 6).forEach((i) => plant(s, i % s.W, Math.floor(i / s.W), 'sunflower', 0));
    goals.claimCrops(s);
    const line = new Tutor().update(teach(s, ALL.filter((l) => l !== 'sowfor'), FEATURES), 0.1, true).line;
    expect(line).toBe('Plant 9 more sunflowers for the request.');
  });
});
