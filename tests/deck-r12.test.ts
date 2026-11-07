// Seedbound, round 12: a hitch that weighs against the help on both the season and the purse, a glut priced by what of its
// crop will stay planted, the spent heap only for a card the bench can never pay for, corn's real nights on its face and
// slips, a reason line that names the crop beside it pulled first and its plot, and engine lines said on a crop of their
// own. Each rules change fails on round 11 (a `git archive` copy) on an assertion.
import { describe, expect, it, onTestFinished } from 'vitest';
import * as L from '../src/games/deck/lessons';
import * as R from '../src/games/deck/rules';
import { endDay, leaveShop, newRun, previewPlay, scoreHarvest, snapshot, TUNING, type CardId, type Crop, type PageId, type RunState, type SeedId, type Twist } from '../src/games/deck/rules';
import { faceBonus } from '../src/games/deck/view/faces';

/** Round 12's calls, read loosely so this file runs (and fails on assertions) against round 11. */
type Paid = Twist & { pay?: number; worth?: number };
const X = R as unknown as {
  seedDays?: (s: Pick<RunState, 'pages' | 'twist' | 'day'>, kind: SeedId) => number;
  benchMost?: (s: Pick<RunState, 'pages' | 'scoops'>) => number;
  glutStays?: (s: RunState, k: SeedId) => number;
  chooseEngine?: (s: RunState, i: number) => unknown;
};

const crop = (uid: number, kind: Crop['kind'], age: number, days: number, extra: Partial<Crop> = {}): Crop => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false, ...extra });

const calm = () => {
  const was = [TUNING.pestChance, TUNING.crowChance] as const;
  TUNING.pestChance = [0];
  TUNING.crowChance = [0];
  onTestFinished(() => {
    [TUNING.pestChance, TUNING.crowChance] = was;
  });
};

/** A day on the table with this hand. */
function table(hand: CardId[], o: { season?: 0 | 1 | 2 | 3; year?: number; energy?: number } = {}): RunState {
  const { s } = newRun(7, null);
  s.season = o.season ?? 0;
  s.year = o.year ?? 1;
  s.draw.push(...s.hand);
  s.hand = hand.map((id) => ({ uid: s.nextUid++, id, up: false }));
  s.energy = o.energy ?? 20;
  for (const p of s.plots) p.crop = null;
  return s;
}

/** Stalls with a twist on offer: a run in year 2 whose plot pays from carrots, beans and strawberries (as round 11's). */
function stalls(n: number, each: (s: RunState, help: Paid, hitch: Paid) => void): number {
  let seen = 0;
  calm();
  for (let seed = 1; seed <= n; seed++) {
    const { s } = newRun(seed, null);
    s.year = 2;
    s.season = 0;
    s.quota = 900;
    const kinds = ['carrot', 'beans', 'strawberry'] as const;
    s.plots.forEach((p, i) => {
      p.crop = i % 4 === 3 ? null : crop(1000 + i, kinds[i % 3], 9, 2);
    });
    for (let g = 0; g < 8 && s.phase === 'day'; g++) {
      s.plots.forEach((p, i) => {
        if (!p.crop && i % 4 !== 3) p.crop = crop(2000 + i + g * 100, kinds[i % 3], 9, 2);
      });
      endDay(s);
      if (s.phase === 'day') s.earned = Math.max(s.earned, s.quota);
    }
    const tw = s.shop?.twists as Paid[] | undefined;
    if (!tw?.length) continue;
    seen++;
    each(s, tw.find((t) => R.BOONS.includes(t.id))!, tw.find((t) => R.HITCHES.includes(t.id))!);
  }
  return seen;
}

describe('round 12: a hitch that weighs', () => {
  it('leaves the season and the purse each about where the help would, in the numbers the clippings say', () => {
    // The twelfth playtest, at all 13 stalls: help +280 against a glut said 240, cut 270, the merchant paying 250, so
    // +30 on the season and +10 in the purse against +280 on both (harvest coins are purse coins too).
    const seen = stalls(40, (s, help, hitch) => {
      const coins = R.twistCoins(s, help);
      const cost = R.twistCoins(s, hitch);
      const margin = R.twistQuota(s, null) - R.twistQuota(s, hitch) - cost;
      const purse = (hitch.pay ?? 0) - cost;
      const near = Math.max(15, coins * 0.12);
      expect(Math.abs(margin - coins), `${hitch.id}: season ${margin} against ${help.id} ${coins}`).toBeLessThanOrEqual(near);
      expect(Math.abs(purse - coins), `${hitch.id}: purse ${purse} against ${help.id} ${coins}`).toBeLessThanOrEqual(near);
    });
    expect(seen).toBeGreaterThan(20);
  });

  it('both clippings say it in the same words: toward the season, and to spend', () => {
    let checked = 0;
    stalls(20, (s, help, hitch) => {
      const a = R.twistNote(s, help) ?? '';
      const b = R.twistNote(s, hitch) ?? '';
      const form = /^(\d+) toward (?:spring|summer|autumn|winter), (\d+) to spend\.$/;
      expect(a, help.id).toMatch(form);
      expect(b, hitch.id).toMatch(form);
      // The help's two numbers are its coins, which count toward the season and go in the purse.
      const [, am, ap] = a.match(form) ?? [];
      expect(am).toBe(ap);
      expect(Number(am)).toBe(R.twistCoins(s, help));
      checked++;
    });
    expect(checked).toBeGreaterThan(10);
  });

  it('a glut of a crop the run can plant round costs less, and cuts less, than one of the crop its engine runs on', () => {
    // The twelfth playtest's sunflower glut said 160 and cost about nothing. Played ahead (deck-twists, 400 runs), a glut
    // of the engine's own crop cost 0.92 to 0.98 of half its coins, any other 0.56 to 0.84.
    const { s } = newRun(3, null);
    s.engine = 'tall';
    s.year = 2;
    s.season = 0;
    s.phase = 'shop';
    s.quota = 1000;
    // Four corn and one sunflower in the tin, nothing in hand.
    s.draw = [...s.draw, ...s.hand, ...s.discard].filter((c) => c.id !== 'sunflower');
    s.hand = [];
    s.discard = [];
    for (const id of ['corn', 'corn', 'corn', 'corn', 'sunflower'] as CardId[]) s.draw.push({ uid: s.nextUid++, id, up: false });
    s.tally = R.newTally(s.rows);
    s.tally.take = 1200;
    s.tally.harvests = 40;
    s.tally.kinds = { corn: 400, sunflower: 400, radish: 400 };
    const aims = R.hitchAims(s);
    const corn = aims.find((a) => a.t.id === 'glut' && a.t.crop === 'corn')!;
    const sun = aims.find((a) => a.t.id === 'glut' && a.t.crop === 'sunflower')!;
    expect(corn.v).toBeCloseTo(sun.v, 6);
    expect(R.hitchCost(sun)).toBeLessThan(R.hitchCost(corn) * 0.8);
    expect(R.hitchCut(sun, 0.1)).toBeLessThan(R.hitchCut(corn, 0.1));
    // The engine's own crop is priced as staying planted, and so is one the run holds many of.
    expect(X.glutStays?.(s, 'corn')).toBe(TUNING.glutStays?.keep);
    for (let i = 0; i < 6; i++) s.draw.push({ uid: s.nextUid++, id: 'sunflower', up: false });
    s.tally.kinds = { corn: 400, sunflower: 400, radish: 400 };
    expect(R.hitchCost(R.hitchAims(s).find((a) => a.t.id === 'glut' && a.t.crop === 'sunflower')!)).toBeCloseTo(R.hitchCost(corn), 6);
    // A perennial stands and picks for days, and a pumpkin already in the ground stays: neither is dodged.
    expect(X.glutStays?.(s, 'strawberry')).toBe(TUNING.glutStays?.keep);
    expect(X.glutStays?.(s, 'pumpkin')).toBe(TUNING.glutStays?.dodge);
    s.plots[0].crop = crop(77, 'pumpkin', 1, 5);
    expect(X.glutStays?.(s, 'pumpkin')).toBe(TUNING.glutStays?.keep);
  });

  it('the merchant pays what the hitch costs and the help\'s coins, on leaving', () => {
    let checked = 0;
    stalls(12, (s, help, hitch) => {
      const owed = R.twistCoins(s, hitch) + R.twistCoins(s, help);
      expect(Math.abs((hitch.pay ?? 0) - owed)).toBeLessThanOrEqual(10);
      R.chooseTwist(s, s.shop!.twists!.findIndex((t) => t.id === hitch.id));
      const before = s.coins;
      leaveShop(s);
      expect(s.coins - before).toBe(hitch.pay);
      checked++;
    });
    expect(checked).toBeGreaterThan(5);
  });
});

describe('round 12: the spent heap only for a card that can never be paid for', () => {
  it('a can and rain left after spending the day\'s scoops bring no spent lesson', () => {
    // The tester spent their scoops on purpose and was told "Drag a card too dear today to Spent." for a can and rain that
    // were fine the next morning.
    const s = table(['can', 'rain'], { season: 1, energy: 0 });
    s.plots[0].crop = crop(1, 'carrot', 0, 2);
    expect(L.dearCard(s)).toBeUndefined();
    const tutor = new L.Tutor(L.learnedAll());
    tutor.learn.done = tutor.learn.done.filter((id) => id !== 'spent');
    const { line } = tutor.update(s, 'touch', null, 0.1, false);
    expect(line?.id).not.toBe('spent');
    // Nor three-scoop corn with one scoop left: the bench holds three every morning.
    const t = table(['corn', 'corn', 'corn'], { season: 1, energy: 1 });
    expect(L.dearCard(t)).toBeUndefined();
  });

  it('a card dearer than the bench can ever hold brings it, even beside one that can be played', () => {
    const was = R.CARDS.pumpkin.cost;
    (R.CARDS.pumpkin as { cost: number }).cost = 9;
    onTestFinished(() => {
      (R.CARDS.pumpkin as { cost: number }).cost = was;
    });
    const s = table(['pumpkin', 'radish'], { season: 1, energy: 3 });
    expect(R.energyMax(s) + TUNING.scoopCap).toBeLessThan(9);
    expect(L.dearCard(s)?.id).toBe('pumpkin');
    const tutor = new L.Tutor(L.learnedAll());
    tutor.learn.done = tutor.learn.done.filter((id) => id !== 'spent');
    const { line } = tutor.update(s, 'touch', null, 0.1, false);
    expect(line?.id).toBe('spent');
    expect(L.words(line!.text)).toBeLessThanOrEqual(8);
    expect(line!.text).not.toMatch(/today/);
  });
});

describe('round 12: corn\'s nights with Tall Rows', () => {
  it('the face and the slips print the nights it really needs: two, not four', () => {
    const s = table(['corn'], { year: 2 });
    s.pages = ['tall'];
    // Sown, it ripens in two (as before).
    R.playCard(s, 0, 5);
    expect(s.plots[5].crop?.days).toBe(R.SEEDS.corn.days - Number(TUNING.tallFast));
    // What the face prints: its moons.
    const days = X.seedDays?.(s, 'corn') ?? R.SEEDS.corn.days;
    expect(days).toBe(2);
    expect(faceBonus('corn', s.pages, s.levels, days)?.days ?? R.SEEDS.corn.days).toBe(2);
    // Without the page, the card's own four, and no bonus to print.
    expect(X.seedDays?.({ ...s, pages: [] }, 'corn')).toBe(4);
    expect(faceBonus('corn', [], {}, 4)).toBeNull();
  });
});

describe('round 12: a reason line names the crop beside it pulled first, and its plot', () => {
  /** A strawberry aimed at B1 in a season of good company, with a lettuce on B2 that is pulled tonight. */
  function company(): { s: RunState; pv: NonNullable<ReturnType<typeof previewPlay>> } {
    calm();
    const s = table(['strawberry']);
    s.day = 1;
    s.twist = { id: 'company' };
    s.plots[5].crop = crop(1, 'lettuce', 1, 2);
    const pv = previewPlay(s, 0, 1)!;
    return { s, pv };
  }

  it('says which crop and where, where the plate shows row numbers', () => {
    // The tester read "Its neighbour is pulled first." and could not tell which.
    const { s, pv } = company();
    const line = R.previewReason(s, pv, 1, 'strawberry', true);
    expect(line).toBe('The lettuce in B2 is pulled first.');
  });

  it('a crop brought in sooner names the crop that still stands beside it then', () => {
    // A pumpkin watered in tonight, beside a sunflower pulled tonight: it loses its room to sprawl. It said "Its
    // neighbour is pulled first.", and nothing was pulled first.
    calm();
    const s = table(['can']);
    s.day = 1;
    s.plots[0].crop = crop(1, 'sunflower', 2, 3);
    s.plots[1].crop = crop(2, 'pumpkin', 3, 5);
    const pv = previewPlay(s, 0, 1)!;
    expect(R.previewReason(s, pv, 1, null, true)).toBe('The sunflower in A1 still stands then.');
    expect(R.previewReason(s, pv, 1, null, false)).toBe('The sunflower on its left still stands then.');
  });

  it('and by where it stands where the plate shows only the column letters', () => {
    const { s, pv } = company();
    const line = R.previewReason(s, pv, 1, 'strawberry', false);
    expect(line).toBe('The lettuce below it is pulled first.');
    expect(L.words(line ?? '')).toBeLessThanOrEqual(8);
  });
});

describe('round 12: engine lines on a crop of their own', () => {
  /** What the plot pays for the crop on plot i, scored as the night would. */
  const pays = (s: RunState, i: number) => scoreHarvest(s, i, snapshot(s), { suns: 0, shears: false, roll: false }).score;

  it('no "10 coin crop", and every number is what the plot pays at that level', () => {
    // The tester: "a 10 coin crop" has no referent (start crops pay 2 to 5), and "Crops beside it add 10 coins" read as
    // the neighbours gaining coins.
    for (const id of ['bees', 'hot', 'vines', 'tall'] as PageId[]) {
      for (const lv of [1, 2, 3, 4]) {
        const s = table([]);
        s.pages = [id];
        s.levels = { [id]: lv };
        if (id === 'bees') {
          s.plots[4].obj = 'beehive';
          s.plots[5].crop = crop(1, 'strawberry', 3, 3);
        } else if (id === 'hot') {
          s.plots[4].crop = crop(1, 'chili', 0, 2);
          s.plots[5].crop = crop(2, 'chili', 2, 2);
          s.plots[6].crop = crop(3, 'chili', 0, 2);
        } else if (id === 'vines') {
          s.plots[5].crop = crop(1, 'beans', 3, 3);
          s.plots[6].crop = crop(2, 'beans', 0, 3);
        } else {
          s.plots[5].crop = crop(1, 'corn', 2, 2);
          s.plots[6].crop = crop(2, 'radish', 0, 1);
        }
        const n = pays(s, 5);
        const text = lv === 1 ? R.PAGES[id].text : (R.levelChange(id, lv) ?? '');
        expect(text, `${id} ${lv}`).not.toMatch(/10 coin|add \d+ coins/);
        expect(text, `${id} ${lv}: the plot pays ${n}`).toMatch(new RegExp(`\\b${n}\\b`));
        expect(R.levelText(id, lv), `${id} ${lv}`).toMatch(new RegExp(`\\b${n}\\b`));
      }
    }
  });

  it('a chili with Hot Beds says what it pays beside two others', () => {
    for (const lv of [1, 4]) {
      const s = table([]);
      s.pages = ['hot'];
      s.levels = { hot: lv };
      s.plots[4].crop = crop(1, 'chili', 0, 2);
      s.plots[5].crop = crop(2, 'chili', 2, 2);
      s.plots[6].crop = crop(3, 'chili', 0, 2);
      const line = R.cardLine('chili', false, s);
      expect(line).not.toMatch(/10 coin/);
      expect(line).toContain(String(pays(s, 5)));
    }
  });
});
