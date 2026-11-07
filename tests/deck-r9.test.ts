// Seedbound, round 9: all four engines at the pick, Hot Beds and Tall Rows retuned, a dealt first hand, the crow lesson
// naming the ripe crops outside the scarecrow's ground, a real choice in the guided spring, the reason line only for the
// aimed plot, previews that know the crow, twists whose cut is never clipped with helps worth having and no hitch twice
// in two seasons, a level IV after III, lessons that wait behind a note, and the year's new stock at its first stall.
// Each test fails on round 8 (a `git archive` copy) on an assertion.
import { describe, expect, it, onTestFinished } from 'vitest';
import { botDay, botShop, Dice } from '../src/games/deck/bot';
import * as L from '../src/games/deck/lessons';
import * as R from '../src/games/deck/rules';
import { endDay, leaveShop, newMeta, newRun, playCard, previewPlay, TUNING, type CardId, type Crop, type Harvest, type PageId, type RunState, type Twist } from '../src/games/deck/rules';

/** Round 9's calls, read loosely so this file runs (and fails on assertions) against round 8. */
const X = R as unknown as {
  chooseEngine: (s: RunState, i: number) => unknown;
  previewReason?: (s: RunState, p: R.Preview, aim: number, seed: R.SeedId | null) => string | null;
  crowReach?: (s: RunState) => number[];
  hitchAims: (s: RunState) => { t: Twist; v: number }[];
  hitchCost: (a: { t: Twist; v: number }) => number;
  buyLevel: (s: RunState) => unknown;
  levelPrice: (to: number) => number;
  engineNum: (s: Partial<Pick<RunState, 'levels'>>, id: PageId) => number;
  sameAim: (a: Twist, b: Twist) => boolean;
};
type Pair = { either?: [number, number] };
type LevelOffer = { page: PageId; to: number; price: number; sold: boolean };
const shopLevel = (s: RunState) => (s.shop as (R.Shop & { level?: LevelOffer }) | null)?.level;
const crop = (uid: number, kind: Crop['kind'], age: number, days: number, extra: Partial<Crop> = {}): Crop => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false, ...extra });
const harvests = (ev: R.Ev[]): Harvest[] => ev.filter((e): e is Extract<R.Ev, { t: 'harvest' }> => e.t === 'harvest').map((e) => e.h);

function table(hand: CardId[], opts: { season?: 0 | 1 | 2 | 3; year?: number; energy?: number; seed?: number } = {}): RunState {
  const { s } = newRun(opts.seed ?? 7, null);
  s.season = opts.season ?? 0;
  s.year = opts.year ?? 1;
  s.draw.push(...s.hand);
  s.hand = hand.map((id) => ({ uid: s.nextUid++, id, up: false }));
  s.energy = opts.energy ?? 20;
  for (const p of s.plots) p.crop = null;
  return s;
}

const calm = () => {
  const was = [TUNING.pestChance, TUNING.crowChance] as const;
  TUNING.pestChance = [0];
  TUNING.crowChance = [0];
  onTestFinished(() => {
    [TUNING.pestChance, TUNING.crowChance] = was;
  });
};

/** Meet the season on its last night without playing (the stall opens). */
function toStall(s: RunState): void {
  for (let g = 0; g < 10 && s.phase === 'day'; g++) {
    if (s.day === TUNING.days) s.earned = Math.max(s.earned, s.quota);
    endDay(s);
  }
}

/** A run that took this engine at its first stall, at the stall before `year`, `season`. */
function engineRun(engine: R.EngineId, year: number, season: 0 | 1 | 2 | 3, seed = 3): RunState {
  const tune = TUNING as typeof TUNING & { engineChoices: number };
  const was = tune.engineChoices;
  tune.engineChoices = 4;
  const { s } = newRun(seed, null);
  toStall(s);
  X.chooseEngine(s, (s.shop as R.Shop & { engines?: string[] }).engines!.indexOf(engine));
  tune.engineChoices = was;
  for (let g = 0; g < 20 && !(s.phase === 'shop' && R.nextSeason(s).year === year && R.nextSeason(s).season === season); g++) {
    if (s.phase === 'shop') leaveShop(s);
    toStall(s);
  }
  return s;
}

describe('round 9: every engine on offer, and none that decides the run', () => {
  it('a run\'s first stall offers all four engines, the guided run\'s too', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const guided of [false, true]) {
        const { s } = newRun(seed, null, guided);
        toStall(s);
        const offer = (s.shop as R.Shop & { engines?: string[] }).engines ?? [];
        // The ninth playtest's runs 2 and 3 were never offered the bees.
        expect([...offer].sort(), `seed ${seed}${guided ? ', guided' : ''}`).toEqual(['bees', 'hot', 'tall', 'vines']);
      }
    }
  });

  it('Hot Beds gives a chili\'s neighbours more than x1.5 from level I, and its levels raise that', () => {
    calm();
    const night = (pages: PageId[], levels: Partial<Record<PageId, number>> = {}) => {
      const s = table(['radish'], { year: 2 });
      s.pages = pages;
      s.levels = levels;
      s.plots[5].crop = crop(901, 'lettuce', 2, 2, { compost: 2 });
      s.plots[6].crop = crop(902, 'chili', 0, 2);
      return harvests(endDay(s)).find((h) => h.kind === 'lettuce')!;
    };
    const plain = night([]);
    const one = night(['hot'], { hot: 1 });
    const two = night(['hot'], { hot: 2 });
    const step = (h: Harvest) => h.mult.find((st) => st.icon === 'chili')!.v;
    expect(step(plain)).toBe(1.5);
    // The ninth playtest's hot run: x1.5 on a bloom of 1 or 2 never got going, and its best harvest was 42.
    expect(step(one)).toBeGreaterThan(1.5);
    expect(step(two)).toBeGreaterThan(step(one));
    expect(one.score).toBeGreaterThan(plain.score);
  });

  it('Tall Rows climbs gently (II at most +1.5, III at most +2) and the tall engine brings two corn', () => {
    expect(X.engineNum({ levels: { tall: 2 } }, 'tall')).toBeLessThanOrEqual(1.5);
    expect(X.engineNum({ levels: { tall: 3 } }, 'tall')).toBeLessThanOrEqual(2);
    expect(X.engineNum({ levels: { tall: 2 } }, 'tall')).toBeGreaterThan(X.engineNum({ levels: { tall: 1 } }, 'tall'));
    // One corn (round 8) cleared year 1 69% of the time with the tall engine, the least of the four.
    // Round 10: three (the tenth playtest's corn came once in autumn, too late to ripen, and the run ended).
    expect(R.ENGINES.tall.gift.filter((c) => c === 'corn').length).toBeGreaterThanOrEqual(2);
  });

  it('the tall engine clears year 1 most of the time against round 8\'s row (a decent bot committed to it, 30 runs)', () => {
    const tune = TUNING as typeof TUNING & { engineChoices: number };
    const was = tune.engineChoices;
    const row = TUNING.quotas;
    tune.engineChoices = 4;
    // The same row of quotas for both builds, so only the engine's start differs.
    TUNING.quotas = [170, 360, 480, 590];
    onTestFinished(() => {
      tune.engineChoices = was;
      TUNING.quotas = row;
    });
    let cleared = 0;
    const runs = 30;
    for (let i = 0; i < runs; i++) {
      const seed = 9000 + i * 7919;
      const meta = newMeta();
      meta.unlocked = ['beehive', 'chili', 'corn', 'wheat', 'pumpkin', 'shears', 'mint', 'trowel', 'storm'];
      const { s } = newRun(seed, meta, false);
      const dice = new Dice((131 + i) ^ seed);
      const o = { noise: 0.15, seed: 0, engine: 'tall' as const };
      for (let g = 0; g < 200 && s.phase !== 'over' && s.year === 1; g++) {
        if (s.phase === 'shop') botShop(s, o, dice);
        else botDay(s, o, dice);
      }
      if (s.stats.seasonsCleared >= 4) cleared++;
    }
    // Round 8: 69% over 200 runs (deck-strategies), 77% on these 30.
    expect(cleared / runs).toBeGreaterThanOrEqual(0.85);
  }, 120000);
});

describe('round 9: a run can not die on the draw before any engine', () => {
  it('a run\'s first hand is dealt a carrot and a radish, then draws up; the guided run keeps its set hands', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { s } = newRun(seed, null);
      const ids = s.hand.map((c) => c.id);
      // The ninth playtest's run 4: no carrot in its first two hands, and spring ended at 146 of 170.
      expect(ids, `seed ${seed}`).toContain('carrot');
      expect(ids, `seed ${seed}`).toContain('radish');
      expect(ids).toHaveLength(TUNING.handSize);
    }
    expect(newRun(5, null, true).s.hand.map((c) => c.id)).toEqual(R.GUIDED_DEALS[0]);
  });
});

describe('round 9: the crow lesson tells the truth', () => {
  const learn = () => {
    const l = L.newLearn();
    l.done = ['sow', 'lantern', 'peg', 'stakes', 'companion', 'either', 'bloom', 'newcard', 'scoops', 'saved', 'tin', 'can', 'weather', 'spent', 'pests', 'pestfix'];
    return l;
  };
  const crowDay = (carrotAt: number) => {
    const s = table(['radish'], { season: 2 });
    s.plots[0].obj = 'scarecrow';
    s.plots[carrotAt].crop = crop(950, 'carrot', 2, 2);
    s.crow = true;
    return s;
  };
  it('names the ripe crop outside the scarecrow\'s 3 by 3, and says it keeps watch only when there is none', () => {
    // D4, outside the scarecrow's ground on A1: the ninth playtest was told "Your scarecrow keeps watch." and the crow
    // took the carrot there.
    const out = new L.Tutor(learn()).update(crowDay(15), 'touch', null, 0.1, false).line!;
    expect(out.id).toBe('crows');
    expect(out.text).toBe('The crow can reach your carrot.');
    expect(L.words(out.text)).toBeLessThanOrEqual(8);
    expect(X.crowReach?.(crowDay(15))).toEqual([15]);
    // B2, inside it: it keeps watch.
    const inside = new L.Tutor(learn()).update(crowDay(5), 'touch', null, 0.1, false).line!;
    expect(inside.text).toBe('A crow is about. Your scarecrow keeps watch.');
  });
});

describe('round 9: a real choice in the guided spring', () => {
  /** Play the guided spring to day 3's dawn the way the lessons ask. */
  const day3 = () => {
    const { s } = newRun(1, null, true);
    for (const i of [5, 6]) playCard(s, 0, i);
    endDay(s);
    playCard(s, 0, 5);
    playCard(s, 0, 6);
    playCard(s, 0, 15);
    endDay(s);
    return s;
  };
  it('day 3 deals a radish or a carrot: plant one and the other goes back in the tin', () => {
    const s = day3();
    const pair = (s as RunState & Pair).either;
    expect(pair, 'day 3 deals a pair').toBeDefined();
    const kinds = pair!.map((u) => s.hand.find((c) => c.uid === u)!.id).sort();
    expect(kinds).toEqual(['carrot', 'radish']);
    // The lesson asks for the choice, in plain words, before the bloom lesson.
    const l = L.newLearn();
    l.done = ['sow', 'lantern', 'peg', 'stakes', 'companion'];
    const line = new L.Tutor(l).update(s, 'touch', null, 0.1, false).line!;
    expect(line.id).toBe('either');
    expect(line.text).toBe('Plant a radish or a carrot, not both.');
    // The previews show the trade: the radish beside the ripening carrot pays tonight; the carrot pays in two nights.
    const r = s.hand.findIndex((c) => c.uid === pair![0]);
    const k = s.hand.findIndex((c) => c.uid === pair![1]);
    const now = previewPlay(s, r, 4)!;
    expect(now.marks.find((m) => m.plot === 5)?.total).toBeGreaterThan(5);
    const later = previewPlay(s, k, 9)!;
    expect(later.harvest?.score).toBeGreaterThanOrEqual(5);
    // Plant the carrot: the radish of the pair goes back in the tin; the other radish stays in hand.
    const tin = s.draw.length;
    const ev = playCard(s, k, 9)!;
    expect(ev.some((e) => (e as { t: string }).t === 'putBack')).toBe(true);
    expect(s.draw.length).toBe(tin + 1);
    expect(s.hand.map((c) => c.id).sort()).toEqual(['lettuce', 'radish']);
    expect((s as RunState & Pair).either).toBeUndefined();
  });

  it('either way the careful line meets the guided spring on one of its last two nights, not before', () => {
    // The strict bot (the careful line) takes the radish and meets it on day 6; made to take the carrot, on day 5 or 6.
    for (const take of ['radish', 'carrot']) {
      const { s } = newRun(11, null, true);
      const dice = new Dice(77);
      let met = 0;
      let paired = false;
      for (let d = 1; d <= TUNING.days && s.phase === 'day'; d++) {
        const pair = (s as RunState & Pair).either;
        if (pair) paired = true;
        if (take === 'carrot' && pair) {
          const k = s.hand.findIndex((c) => c.uid === pair[1]);
          playCard(s, k, R.targetsFor(s, k)[0]);
        }
        botDay(s, { noise: 0, seed: 3 }, dice);
        const earned = s.stats.log.length ? s.stats.log[0].earned : s.earned;
        if (!met && earned >= (s.stats.log[0]?.quota ?? s.quota)) met = d;
      }
      expect(paired, 'the guided spring deals a pair').toBe(true);
      expect(met, `taking the ${take}`).toBeGreaterThanOrEqual(TUNING.days - 1);
      if (take === 'radish') expect(met).toBe(TUNING.days);
    }
  });
});

describe('round 9: the reason line only for the aimed plot, and previews that know the crow', () => {
  it('a greyed bonus elsewhere on the plot gives the aimed seed no reason line; one the aimed seed gives names it', () => {
    calm();
    const reason = X.previewReason;
    expect(typeof reason).toBe('function');
    // Tall Rows: corn on C2 ripens in two nights beside corn on B2 that ripens tomorrow (pulled first: lost already).
    const s = table(['radish', 'carrot']);
    s.pages = ['tall'];
    s.plots[5].crop = crop(961, 'corn', 1, 2);
    s.plots[6].crop = crop(962, 'corn', 0, 2);
    // A radish on D2 beside the second corn: it is pulled tonight, so the corn's +1 from it is lost too. The line names
    // the radish, the aimed seed, not the other corn (the ninth playtest: "The other corn is pulled before this one ripens.").
    const near = previewPlay(s, 0, 7)!;
    expect(reason!(s, near, 7, 'radish')).toBe('The radish is pulled before the corn ripens.');
    // A carrot on D4, far from both: the corn's old loss is not its business, so no line.
    const far = previewPlay(s, 1, 15)!;
    expect(reason!(s, far, 15, 'carrot')).toBeNull();
  });

  it('with a crow about, a bonus from a ripe crop no scarecrow guards is flagged, and the line says so', () => {
    calm();
    const s = table(['radish']);
    s.plots[5].crop = crop(971, 'carrot', 1, 2);
    s.crow = true;
    const p = previewPlay(s, 0, 6)!;
    // The ninth playtest's corn previewed 252; the crow took the sunflower beside it first and the night paid ~50 less.
    const carrot = p.marks.find((m) => m.plot === 5) as R.Mark & { risk?: { bloom: number; from: number } };
    expect(carrot.risk, 'the carrot\'s bloom from a radish the crow may take').toBeDefined();
    expect(carrot.risk!.bloom).toBe(1);
    expect(carrot.risk!.from).toBe(6);
    const own = p.marks.find((m) => m.plot === 6) as R.Mark & { risk?: { yield: number; from: number } };
    expect(own.risk?.yield).toBe(2);
    expect(X.previewReason?.(s, p, 6, 'radish')).toBe('The crow may take the carrot first.');
    // A scarecrow over both: nothing at risk.
    s.plots[1].obj = 'scarecrow';
    const safe = previewPlay(s, 0, 6)!;
    expect(safe.marks.some((m) => (m as R.Mark & { risk?: unknown }).risk)).toBe(false);
  });
});

describe('round 9: twists that keep their promise', () => {
  it('a hitch\'s cut is never clipped, every help is worth 8% or more, and a hitch seldom comes twice in two seasons', () => {
    let pairs = 0;
    let again = 0;
    let stalls = 0;
    let thin = 0;
    // Round 10: 24 runs (8 before): a few runs of the tall engine, which has few things to aim at, swung this by 15 points.
    for (let i = 0; i < 24; i++) {
      const seed = 4100 + i * 7919;
      const meta = newMeta();
      meta.unlocked = ['beehive', 'chili', 'corn', 'wheat', 'pumpkin', 'shears', 'mint', 'trowel', 'storm'];
      const { s } = newRun(seed, meta, false);
      const dice = new Dice(seed ^ 77);
      const o = { noise: 0.15, seed: 77 + i };
      const offers: Twist[][] = [];
      for (let g = 0; g < 400 && s.phase !== 'over'; g++) {
        if (R.seasonIndex(s) >= 11) break;
        if (s.phase === 'shop') {
          const tw = s.shop?.twists;
          if (tw?.length) {
            const help = tw.find((t) => R.BOONS.includes(t.id)) as Twist & { worth?: number };
            const hitch = tw.find((t) => R.HITCHES.includes(t.id)) as Twist & { worth?: number };
            if (help.worth !== undefined && hitch.worth !== undefined) {
              pairs++;
              // The ninth playtest read "About 220 more coins" beside "About 320 fewer coins. Summer asks 600, not 920.":
              // the cut at its cap covered the hitch and not the help.
              // Round 10: wherever the stall has one: a season with nearly all its coins in one crop after good company
              // has none, and offers its best (the tall run's corn, 78% of 817 coins: buyers of 6% at most).
              const played = s.stats.log.at(-1)?.twist?.id;
              if (R.boonAims(s).some((a) => a.v >= 0.08 && a.t.id !== played)) expect(help.worth, `help ${help.id}`).toBeGreaterThanOrEqual(0.08 - 1e-9);
              else if (help.worth < 0.08) thin++;
              // Round 10: the cut is the hitch's cost and a share of the help's worth (`helpShare`; round 9 added all of it).
              // Round 12: all of it again; where the cut is held at its most, the merchant pays what it leaves short.
              const share = (TUNING as typeof TUNING & { helpShare?: number }).helpShare ?? 1;
              const short = hitch.worth + share * help.worth - R.twistEase(hitch);
              if (short > 0.011) expect((hitch as Twist & { pay?: number }).pay ?? 0, `${hitch.id} short ${short}`).toBeGreaterThanOrEqual(R.twistCoins(s, hitch) + R.twistCoins(s, help) + short * R.twistQuota(s, null) - Math.max(25, 0.025 * R.twistQuota(s, null)));
            }
            // Not aimed as a hitch the last stall offered, and seldom as the one before it (the tall run: frost on the
            // corn row three times, a corn glut twice): only when nothing else can be weighed against a help.
            const as = (k: number) => (offers.at(-k) ?? []).some((b) => R.HITCHES.includes(b.id) && X.sameAim(b, hitch));
            expect(as(1), `${hitch.id} ${hitch.crop ?? hitch.row ?? hitch.page}`).toBe(false);
            if (as(2)) again++;
            stalls++;
            offers.push(tw.map((t) => ({ ...t })));
          }
          botShop(s, o, dice);
        } else botDay(s, o, dice);
      }
    }
    expect(pairs).toBeGreaterThan(20);
    expect(thin / pairs, 'stalls with no help worth 8%').toBeLessThan(0.08);
    // Round 8 let a hitch come back every other stall. Round 10: 8% over 60 runs, 5% over 200 (deck-strategies), with quotas
    // cut only by what a hitch costs a cut stays in bounds less often. Round 11: 0.15 (0.12): a sample of 24 runs; over 150 a
    // run the bees, hot and vines runs come to 1 to 2%, the tall run to 16% (25% before round 11).
    expect(again / stalls).toBeLessThan(0.15);
  }, 180000);
});

describe('round 9: something worth buying after level III', () => {
  it('the stall pins the engine page at level IV once it is at III, dearer, and it pays more', () => {
    calm();
    const s = engineRun('bees', 3, 1);
    s.levels = { ...(s.levels ?? {}), bees: 3 };
    leaveShop(s);
    toStall(s);
    const lv = shopLevel(s);
    // The ninth playtest's won run had 4,736 coins after III, then 7,040, then 8,908, with nothing left to buy.
    expect(lv, 'level IV is pinned').toBeDefined();
    expect(lv!.to).toBe(4);
    expect(lv!.price).toBeGreaterThan(X.levelPrice(3));
    const was = X.engineNum(s, 'bees');
    s.coins = lv!.price;
    expect(X.buyLevel(s)).toBeTruthy();
    expect(X.engineNum(s, 'bees')).toBeGreaterThan(was);
    expect(R.levelName(R.PAGES.bees.name, 4)).toBe('Busy Bees IV');
  });

  it('days played after the quota is met leave no scoops idle, so the scoop is not refused for them', () => {
    calm();
    const { s } = newRun(3, null);
    s.year = 2;
    // Met on the first night (the ninth playtest's quota fell early), three scoops left each dusk after it.
    for (let g = 0; g < 10 && s.phase === 'day'; g++) {
      s.energy = s.day === 1 ? 0 : 3;
      if (s.day === 1) s.earned = s.quota;
      endDay(s);
    }
    expect(s.phase).toBe('shop');
    expect(s.stats.log.at(-1)!.idle).toBe(0);
    expect(R.scoopOnSale(s)).toBe(true);
  });
});

describe('round 9: lessons wait behind notes; the stall shows what it should', () => {
  it('a passive lesson behind a note in the strip does not count down until it shows', () => {
    const s = table(['radish'], { season: 1 });
    s.plots[5].crop = crop(981, 'carrot', 0, 2, { pest: 2 });
    const l = L.newLearn();
    l.done = ['sow', 'lantern', 'peg', 'stakes', 'companion', 'either', 'bloom', 'newcard', 'scoops', 'saved', 'tin', 'can', 'weather', 'spent'];
    const t = new L.Tutor(l);
    expect(t.update(s, 'touch', null, 0.1, false).line?.id).toBe('pests');
    // "54 carried over from summer." stands in the strip for ten seconds: the pest lesson waits behind it.
    const hidden = t as unknown as { update: (...a: unknown[]) => { line: L.Line | null } };
    for (let k = 0; k < 100; k++) hidden.update(s, 'touch', null, 0.1, false, false, true);
    expect(t.lesson, 'still waiting after the note').toBe('pests');
    // Shown, it has its five seconds.
    for (let k = 0; k < 30; k++) t.update(s, 'touch', null, 0.1, false);
    expect(t.lesson).toBe('pests');
    // Round 11: and it stays until a play has happened too.
    t.count('play');
    for (let k = 0; k < 30; k++) t.update(s, 'touch', null, 0.1, false);
    expect(t.lesson).not.toBe('pests');
  });

  it('the stall that gives the engines away pins none of their pages', () => {
    const engPages = Object.values(R.ENGINES).map((e) => e.page);
    for (let seed = 1; seed <= 60; seed++) {
      const { s } = newRun(seed, null);
      toStall(s);
      // The ninth playtest's first stall sold Trellis on the cork board beside the free "Beans and Trellis".
      expect(s.shop!.pages.map((p) => p.page).filter((p) => engPages.includes(p)), `seed ${seed}`).toEqual([]);
    }
  });

  it('the stall that opens a year lays out its new stock, and says so there', () => {
    const { s } = newRun(4, null);
    s.season = 3;
    toStall(s);
    // "New stock this year" first showed at the year's second stall: the stock came on leaving the first.
    expect(s.stock ?? [], 'the stall after winter brings it').toHaveLength(TUNING.newStock);
    for (const o of s.stock!) expect(s.shop!.cards.some((c) => c.card === o.card)).toBe(true);
  });
});
