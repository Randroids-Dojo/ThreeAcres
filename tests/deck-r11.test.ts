// Seedbound, round 11: the guided summer's first hand holds the engine's card and asks less, Hot Beds' stack is capped at
// two chilies, a hitch pays in coins so its margin reads beside the help's, Tall Rows brings a scoop, a run's first hand
// differs from run to run, and the lines around them say what they do. Each rules change has tests that fail on round 10
// (a `git archive` copy) on an assertion; the few that also pass there guard what must not change with it (a later guided
// season draws as usual, the guided run keeps its set hands, a corn puts one scoop back, an old save's hitch pays nothing).
import { describe, expect, it, onTestFinished } from 'vitest';
import * as L from '../src/games/deck/lessons';
import * as R from '../src/games/deck/rules';
import { chooseEngine, endDay, energyMax, leaveShop, newMeta, newRun, previewPlay, quotaFor, TUNING, type CardId, type Crop, type EngineId, type Harvest, type RunState, type Twist } from '../src/games/deck/rules';

/** Round 11's calls, read loosely so this file runs (and fails on assertions) against round 10. */
type Paid = Twist & { pay?: number; worth?: number };
const X = R as unknown as {
  hitchPay?: (s: RunState, help: Twist, hitch: Twist) => number;
  cardLine?: (id: CardId, up: boolean, s: Partial<RunState>) => string;
  ENGINES: Record<string, { gift: CardId[]; plant?: string }>;
};

const crop = (uid: number, kind: Crop['kind'], age: number, days: number, extra: Partial<Crop> = {}): Crop => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false, ...extra });
const harvests = (ev: R.Ev[]): Harvest[] => ev.filter((e): e is Extract<R.Ev, { t: 'harvest' }> => e.t === 'harvest').map((e) => e.h);

const calm = () => {
  const was = [TUNING.pestChance, TUNING.crowChance] as const;
  TUNING.pestChance = [0];
  TUNING.crowChance = [0];
  onTestFinished(() => {
    [TUNING.pestChance, TUNING.crowChance] = was;
  });
};

/** Meet every day of the season without playing (the stall opens). */
function toStall(s: RunState): void {
  for (let g = 0; g < 10 && s.phase === 'day'; g++) {
    s.earned = Math.max(s.earned, s.quota);
    endDay(s);
  }
}

/** A guided run at its first stall with this engine picked. */
function guidedAtStall(engine: EngineId, seed: number): RunState {
  const { s } = newRun(seed, null, true);
  toStall(s);
  const i = s.shop!.engines!.indexOf(engine);
  expect(i).toBeGreaterThanOrEqual(0);
  chooseEngine(s, i);
  return s;
}

describe('round 11: the first free season', () => {
  it('the guided summer deals the engine\'s card in its first hand, whichever engine and whatever the shuffle', () => {
    // The eleventh playtest followed every lesson and every preview: the hive first came to hand on day 3 and the season
    // ended 259 of 330 with 309 coins unspent.
    for (const engine of ['bees', 'hot', 'vines', 'tall'] as EngineId[]) {
      for (let seed = 1; seed <= 30; seed++) {
        const s = guidedAtStall(engine, seed);
        leaveShop(s);
        expect(s.season).toBe(1);
        expect(s.day).toBe(1);
        expect(s.hand.map((c) => c.id), `${engine}, seed ${seed}`).toContain(X.ENGINES[engine].gift[0]);
        expect(s.hand.length).toBe(TUNING.handSize);
      }
    }
  });

  it('asks about 260 in the guided summer, and less of the guided autumn, winter and year 2 than before', () => {
    expect(TUNING.guidedSummer).toBeGreaterThanOrEqual(250);
    expect(TUNING.guidedSummer).toBeLessThanOrEqual(290);
    expect(quotaFor(1, 1, [], true)).toBe(TUNING.guidedSummer);
    expect(quotaFor(1, 2, [], true)).toBeLessThan(480);
    expect(quotaFor(1, 3, [], true)).toBeLessThan(600);
    // A run that is not a guided one asks what it did.
    expect(quotaFor(1, 1, [], false)).toBe(TUNING.quotas[1]);
  });

  it('a later season of the guided run draws as usual (only the first free season is dealt)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = guidedAtStall('tall', seed);
      leaveShop(s);
      toStall(s);
      leaveShop(s);
      expect(s.season).toBe(2);
      if (s.hand.some((c) => c.id === 'corn')) seen++;
    }
    // Corn comes in some autumn hands by the draw and not in every one.
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThan(40);
  });
});

describe('round 11: Hot Beds is capped', () => {
  const stacked = (chilies: number, page: boolean): Harvest => {
    calm();
    const { s } = newRun(7, null);
    s.year = 2;
    s.pages = page ? ['hot'] : [];
    s.levels = page ? { hot: 4 } : {};
    s.plots.forEach((p) => {
      p.crop = null;
    });
    // A lettuce on B2 ripens tonight, with chilies on its neighbours (they ripen next week).
    s.plots[5].crop = crop(1, 'lettuce', 2, 2);
    [1, 4, 6, 9].slice(0, chilies).forEach((i, k) => {
      s.plots[i].crop = crop(10 + k, 'chili', 0, 9);
    });
    return harvests(endDay(s)).find((h) => h.kind === 'lettuce')!;
  };

  it('a crop takes bloom from two chilies at most, at every level', () => {
    // Its x1.7 to x2 per chili stacked with no cap: harvests of 257 and 347 in year 2 and a night of 668.
    expect(TUNING.chiliCap).toBe(2);
    const n = (h: Harvest) => h.mult.filter((st) => st.icon === 'chili').length;
    expect(n(stacked(1, true))).toBe(1);
    expect(n(stacked(2, true))).toBe(2);
    expect(n(stacked(4, true))).toBe(2);
    expect(stacked(4, true).score).toBe(stacked(2, true).score);
    expect(stacked(2, true).score).toBeGreaterThan(stacked(1, true).score);
  });

  it('the cap holds without the page too, so chilies never stack higher with no Hot Beds', () => {
    const n = (h: Harvest) => h.mult.filter((st) => st.icon === 'chili').length;
    expect(n(stacked(3, false))).toBe(2);
  });

  it('the preview pays what the night pays: a third chili beside a crop adds nothing', () => {
    calm();
    const { s } = newRun(7, null);
    s.year = 2;
    s.pages = ['hot'];
    s.plots.forEach((p) => {
      p.crop = null;
    });
    s.plots[5].crop = crop(1, 'beans', 0, 3);
    s.plots[1].crop = crop(2, 'chili', 0, 9);
    s.plots[4].crop = crop(3, 'chili', 0, 9);
    s.hand = [{ uid: 90, id: 'chili', up: false }];
    s.energy = 9;
    const pv = previewPlay(s, 0, 6);
    expect(pv?.marks.find((m) => m.plot === 5)?.times ?? 1).toBe(1);
  });
});

describe('round 11: a hitch pays in coins', () => {
  /** Bot-free stalls with a twist on offer: a run with every season met and some coins from a harvest on the plot. */
  function stalls(n: number, each: (s: RunState, help: Paid, hitch: Paid) => void): number {
    let seen = 0;
    calm();
    for (let seed = 1; seed <= n; seed++) {
      const { s } = newRun(seed, null);
      s.year = 2;
      s.season = 0;
      s.quota = 900;
      s.plots.forEach((p, i) => {
        p.crop = i % 4 === 3 ? null : crop(1000 + i, (['carrot', 'beans', 'strawberry'] as const)[i % 3], 9, 2, { picks: 0 });
      });
      for (let g = 0; g < 8 && s.phase === 'day'; g++) {
        s.plots.forEach((p, i) => {
          if (!p.crop && i % 4 !== 3) p.crop = crop(2000 + i + g * 100, (['carrot', 'beans', 'strawberry'] as const)[i % 3], 9, 2);
        });
        endDay(s);
        if (s.phase === 'day') s.earned = Math.max(s.earned, s.quota);
      }
      const tw = s.shop?.twists as Paid[] | undefined;
      if (!tw?.length) continue;
      const help = tw.find((t) => R.BOONS.includes(t.id))!;
      const hitch = tw.find((t) => R.HITCHES.includes(t.id))!;
      seen++;
      each(s, help, hitch);
    }
    return seen;
  }

  it('its margin (the cut, less what it costs, and the merchant\'s coins) comes to the help\'s coins, in the numbers on the clippings', () => {
    // The eleventh playtest: +310 against 490 less 410, +910 against 450 less 220. The help won all ten stalls.
    const seen = stalls(40, (s, help, hitch) => {
      const cut = R.twistQuota(s, null) - R.twistQuota(s, hitch);
      const margin = cut - R.twistCoins(s, hitch) + (hitch.pay ?? 0);
      const coins = R.twistCoins(s, help);
      expect(hitch.pay ?? 0, `${hitch.id} pays`).toBeGreaterThan(0);
      // Within a rounding of the numbers said (each to a 5 or a 10).
      expect(Math.abs(margin - coins), `${hitch.id} margin ${margin} against ${help.id} ${coins}`).toBeLessThanOrEqual(Math.max(10, coins * 0.1));
    });
    expect(seen).toBeGreaterThan(20);
  });

  it('pays on leaving the stall, once and only for the hitch picked, and into the purse, not the take', () => {
    let checked = 0;
    stalls(30, (s, help, hitch) => {
      const pick = (t: Paid) => {
        const c = R.cloneRun(s);
        const before = c.coins;
        const totalBefore = c.stats.totalEarned;
        R.chooseTwist(c, c.shop!.twists!.findIndex((x) => x.id === t.id));
        // Changing a pick pays nothing; only leaving does.
        expect(c.coins).toBe(before);
        const ev = leaveShop(c)!;
        return { gain: c.coins - before, earned: c.earned, carried: c.carried ?? 0, total: c.stats.totalEarned - totalBefore, ev };
      };
      const h = pick(hitch);
      const a = pick(help);
      expect(hitch.pay ?? 0).toBeGreaterThan(0);
      expect(h.gain).toBe(hitch.pay);
      expect(h.ev.some((e) => e.t === 'paid')).toBe(true);
      expect(a.gain).toBe(0);
      // The ledger and the record are harvest coins: the merchant's are neither.
      expect(h.earned).toBe(h.carried);
      expect(h.total).toBe(0);
      checked++;
    });
    expect(checked).toBeGreaterThan(10);
  });

  it('a save from before this round (a hitch with no pay) leaves the stall paying nothing', () => {
    let checked = 0;
    stalls(10, (s, _help, hitch) => {
      const i = s.shop!.twists!.findIndex((x) => x.id === hitch.id);
      delete (s.shop!.twists![i] as Paid).pay;
      R.chooseTwist(s, i);
      const before = s.coins;
      leaveShop(s);
      expect(s.coins).toBe(before);
      checked++;
    });
    expect(checked).toBeGreaterThan(3);
  });
});

describe('round 11: Tall Rows brings a scoop', () => {
  it('one more scoop on the bench every day, and only with the page', () => {
    // Corn costs three, on some dawns the bench holds three, and the eleventh playtest's tall run paid 144 one night and
    // 14 another.
    const { s } = newRun(7, null);
    const plain = energyMax(s);
    s.pages = ['tall'];
    expect(energyMax(s)).toBe(plain + 1);
    expect(R.PAGES.tall.text).toMatch(/one more scoop/i);
    // Another engine's page brings none.
    s.pages = ['hot'];
    expect(energyMax(s)).toBe(plain);
  });

  it('corn still puts one scoop back and Tall Rows still ripens it two nights sooner', () => {
    calm();
    const { s } = newRun(7, null);
    s.pages = ['tall'];
    s.plots.forEach((p) => {
      p.crop = null;
    });
    s.plots[5].crop = crop(1, 'corn', 2, 2);
    const h = harvests(endDay(s)).find((x) => x.kind === 'corn')!;
    expect(h.scoops).toBe(1);
    expect(s.bench).toBe(energyMax(s) + 1);
    s.hand = [{ uid: 90, id: 'corn', up: false }];
    s.energy = 9;
    R.playCard(s, 0, 9);
    expect(s.plots[9].crop!.days).toBe(R.SEEDS.corn.days - 2);
  });
});

describe('round 11: first hands that differ', () => {
  const rest = (s: RunState) => {
    const ids = s.hand.map((c) => c.id as string);
    for (const id of TUNING.firstHand) ids.splice(ids.indexOf(id), 1);
    return ids.sort();
  };

  it('keeps the dealt carrot and radish, and the rest differs from run to run', () => {
    // All four of the eleventh playtest's later runs opened with the same move: carrot, radishes beside it, can.
    const hands = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const { s } = newRun(seed, null);
      expect(s.hand.map((c) => c.id)).toEqual(expect.arrayContaining(['carrot', 'radish']));
      expect(s.hand.length).toBe(TUNING.handSize);
      hands.add(rest(s).join(' '));
    }
    expect(hands.size).toBeGreaterThanOrEqual(10);
  });

  it('every first hand holds a dear seed, no spare radish and a can at most, and the dear seed changes run by run', () => {
    const meta = newMeta();
    let last = '';
    for (let runs = 1; runs <= 9; runs++) {
      meta.runs = runs;
      for (let seed = 1; seed <= 12; seed++) {
        const { s } = newRun(seed * 31 + runs, meta);
        const r = rest(s);
        const leads = (TUNING as unknown as { firstLeads?: CardId[] }).firstLeads ?? [];
        const lead = leads[runs % leads.length] ?? '';
        expect(r, `run ${runs}`).toContain(lead);
        if (seed === 1) {
          expect(lead).not.toBe(last);
          last = lead;
        }
        expect(r).not.toContain('radish');
        expect(r.filter((id) => id === 'can').length).toBeLessThanOrEqual(1);
        // One dear seed: the first day turns on it.
        expect(r.filter((id) => R.CARDS[id as CardId].cost >= 2).length).toBe(1);
        // The spare radishes wait at the bottom of the tin, and none is lost.
        expect(s.draw.length + s.hand.length).toBe(R.START_DECK.length);
      }
    }
  });

  it('the guided run keeps its set hands', () => {
    const { s } = newRun(9, null, true);
    expect(s.hand.map((c) => c.id)).toEqual(['radish', 'radish']);
  });
});

describe('round 11: words that say what they do', () => {
  it('no engine or level line says "bloom", "x1.7" or "+1.25"', () => {
    for (const id of ['bees', 'hot', 'vines', 'tall'] as const) {
      for (const lv of [1, 2, 3, 4]) {
        const t = R.levelText(id, lv) ?? '';
        expect(t, `${id} ${lv}`).not.toMatch(/bloom|x\d|\+\d/);
        expect(t).toMatch(/\d/);
      }
      expect(R.levelChange(id, 2), id).toMatch(/, not \d+\.$/);
      expect(R.levelText(id, 1), `${id} is printed as it reads at level I`).toBe(R.PAGES[id].text);
    }
    // What a 10 coin crop pays is the bloom at work.
    expect(R.levelText('bees', 1)).toContain(`pays ${Math.round(10 * TUNING.beesTimes)}`);
    expect(R.levelText('hot', 1)).toContain(`pays ${Math.round(10 * TUNING.hotTimes[0])}`);
    expect(R.levelText('hot', 1)).toContain(`${Math.round(10 * TUNING.hotTimes[0] ** 2)} beside two`);
    expect(R.levelText('vines', 1)).toContain(`pays ${Math.round(10 * (1 + TUNING.vinesBloom))}`);
    expect(R.levelText('tall', 1)).toContain(`add ${Math.round(12 * TUNING.tallBloom)} coins`);
  });

  it('every engine says what it wants planted around it, in one short line', () => {
    for (const id of ['bees', 'hot', 'vines', 'tall']) {
      const line = X.ENGINES[id].plant ?? '';
      expect(line, id).toMatch(/^Plant /);
      expect(line.split(/\s+/).length).toBeLessThanOrEqual(10);
    }
  });

  it('with Hot Beds kept a chili says the page\'s number at its level', () => {
    const line = X.cardLine?.('chili', false, { pages: ['hot'], levels: { hot: 4 } }) ?? '';
    expect(line).toContain(String(Math.round(10 * TUNING.hotTimes[3])));
    expect(X.cardLine?.('chili', false, { pages: [] })).toBe(R.CARDS.chili.text);
  });

  it('frost names the row, not a crop that may have moved on', () => {
    const t: Twist = { id: 'frost', row: 1, crop: 'chili' };
    expect(R.twistText(t)).toBe('Frost on the second row.');
    expect(R.twistText({ id: 'frost', row: 3 })).toBe('Frost on the bottom row.');
  });
});

describe('round 11: lessons that wait for the player', () => {
  const stuck = (hand: CardId[], engines = false) => {
    const { s } = newRun(7, null);
    s.season = 1;
    s.hand = hand.map((id) => ({ uid: s.nextUid++, id, up: false }));
    s.plots[5].crop = crop(981, 'carrot', 0, 2, { pest: 2 });
    return { s, engines };
  };

  it('a pest line stays past its seconds until a play has happened, then goes', () => {
    const { s } = stuck(['radish']);
    const l = L.newLearn();
    l.done = ['sow', 'lantern', 'peg', 'stakes', 'companion', 'either', 'bloom', 'newcard', 'scoops', 'saved', 'tin', 'can', 'weather', 'spent'];
    const t = new L.Tutor(l);
    expect(t.update(s, 'touch', null, 0.1, false).line?.id).toBe('pests');
    for (let k = 0; k < 200; k++) t.update(s, 'touch', null, 0.1, false);
    expect(t.lesson, 'twenty seconds and no play').toBe('pests');
    t.count('play');
    t.update(s, 'touch', null, 0.1, false);
    expect(t.lesson).not.toBe('pests');
  });

  it('a stall showing only its engines says nothing about pages or the tin', () => {
    const { s } = newRun(7, null);
    toStall(s);
    expect(s.shop?.engines?.length).toBeGreaterThan(0);
    const l = L.newLearn();
    // A returning player: it has met two stalls, and neither the pages nor the services lesson has come.
    l.done = ['coins', 'engine'];
    l.n.stall = 3;
    const t = new L.Tutor(l);
    const line = t.update(s, 'touch', null, 0.1, false).line;
    expect(line?.id ?? '').not.toBe('pages');
    expect(line?.id ?? '').not.toBe('services');
    // Once one is picked, the cork board is on screen and the page lesson may come.
    chooseEngine(s, 0);
    const after = t.update(s, 'touch', null, 0.1, false).line;
    expect(after?.id).toBe('pages');
  });
});
