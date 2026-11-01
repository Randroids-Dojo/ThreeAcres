// Round 5: "A pleasant routine with no tension: requests that look like
// choices but are identical, and almost no pests." The pointer stole taps and
// built five scarecrows; the pairs matched within 3% on net per plot-day;
// "Pays 1,370" was mostly market value; planting took a request nobody had
// read; a line said to sleep at 6 am with a request waiting; the turn took
// seven beans unannounced; two refusals drew over each other at no stamina;
// one crow in 22 days.
//
// These tests read the farm through the simulation's own commands and the
// lessons, so on the committed round 4 code they fail on their assertions:
// `accept` and `buildAt` were unknown commands there, requests had no kind,
// and the scarecrow line told a broke farmer to sleep.
import { describe, expect, it } from 'vitest';
import { CROPS } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import { fillRequests, offerRequests } from '../src/sim/goals';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { Order, SimEvent, WorldState } from '../src/sim/types';
import { morningNews } from '../src/ui/hud';
import { Tutor } from '../src/games/homestead/lessons';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

const ALL = [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'field', 'turn', 'smith', 'wide', 'hoe', 'stamina'];
const FEATURES = [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'pests', 'build', 'sprinkler', 'forecast', 'hoe'];

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

/** Farms of every size and purse across the year's sowing days, with nothing growing. */
function* farms(): Generator<WorldState> {
  let seed = 1;
  for (const fields of [1, 2, 3]) for (const coins of [150, 400, 1200, 3000]) for (const day of [3, 4, 6, 13, 16, 24, 26, 34]) yield farm(seed++ * 7919, { fields, coins, day });
}

/** Run the farm for a few seconds of play (the farmer walks to taps and does them). */
function run(s: WorldState, secs: number, first: Parameters<typeof step>[2] = []): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < secs * 30; i++) ev.push(...step(s, 1 / 30, i === 0 ? first : []));
  return ev;
}

const kindOf = (o: Order) => (o as Order & { kind?: string }).kind;
const gain = (o: Order) => o.reward - o.items[0].n * CROPS[o.items[0].crop].price;
const sowBy = (o: Order) => (o as Order & { sowBy?: number }).sowBy ?? o.due - CROPS[o.items[0].crop].days;
const spare = (o: Order) => o.due - sowBy(o) - CROPS[o.items[0].crop].days;
const plotDays = (o: Order) => o.items[0].n * CROPS[o.items[0].crop].days;
/**
 * What a request is worth to a typical farm: its gain, one with no day to spare counted at four in five, less its
 * soil (a plot-day worth 3 coins for rush and easy, 5 for long and quick, held longer, 2 for big and small).
 */
const SOIL: Record<string, number> = { rush: 3, easy: 3, long: 5, quick: 5, big: 2, small: 2 };
const soil = (o: Order) => SOIL[kindOf(o) ?? ''] ?? 3;
const neutral = (o: Order) => gain(o) * (spare(o) <= 0 ? 0.8 : 1) - soil(o) * plotDays(o);
/** Net over seed for each plot-day: the measure the fifth playtest found identical within 3% in every pair. */
const netPerPlotDay = (o: Order) => (o.reward - o.items[0].n * CROPS[o.items[0].crop].seed) / plotDays(o);

describe('P0: the lesson pointer builds once, after a yes, and leaves the tool in hand alone', () => {
  it('one build at most: the taps after it plant with the seeds in hand (five taps built five scarecrows and spent 200)', () => {
    const s = farm(5, { coins: 220 });
    s.tool = 'seeds';
    s.seed = 'radish';
    stand(s, 3, 4, 's');
    // The scarecrow lesson's yes: one scarecrow, on the plot it points at.
    run(s, 3, [{ type: 'buildAt', x: 3, y: 7, kind: 'scarecrow' } as never]);
    expect(s.builds.filter((b) => b.kind === 'scarecrow').map((b) => `${b.x},${b.y}`)).toEqual(['3,7']);
    expect(s.coins).toBe(180);
    // The tool in hand never left it.
    expect(s.tool).toBe('seeds');
    // Three more taps on bare soil: three radishes, no scarecrow.
    for (const [x, y] of [[2, 7], [4, 7], [5, 7]]) run(s, 2, [{ type: 'actAt', x, y }]);
    expect(s.builds.length).toBe(1);
    expect([2, 4, 5].map((x) => plots(s, x, 7).crop?.kind)).toEqual(['radish', 'radish', 'radish']);
    expect(s.coins).toBe(150);
  });

  it('with too few coins it says why and does nothing else: no tool change, no walk', () => {
    const s = farm(6, { coins: 0 });
    s.tool = 'hands';
    stand(s, 3, 4, 's');
    const ev = run(s, 2, [{ type: 'buildAt', x: 3, y: 7, kind: 'scarecrow' } as never]);
    const deny = ev.find((e) => e.type === 'deny') as { reason: string } | undefined;
    expect(deny?.reason).toMatch(/costs 40/);
    expect(s.tool).toBe('hands');
    expect(s.builds.length).toBe(0);
    expect(Math.hypot(s.actors[0].x - 3.5, s.actors[0].y - 4.5)).toBeLessThan(0.01);
  });

  it('the scarecrow lesson builds through the pointer, not by putting the Build tool in hand', () => {
    const s = farm(9, { coins: 200, lessons: [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'bugs', 'field', 'turn', 'smith', 'wide', 'stamina'] });
    s.learnCount['done:pests'] = 5;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) plant(s, x, y, 'carrot', 2);
    plots(s, 4, 7).crop = null;
    const out = new Tutor().update(s, 0.1, true) as { line: string; point: unknown; build?: string; tap?: unknown };
    expect(out.line).toBe('Build a scarecrow on bare soil.');
    expect(out.build).toBe('scarecrow');
    expect(out.tap).toBeUndefined();
  });
});

describe('P1: the two of a pair differ in kind, with similar expected value', () => {
  it('each pair is a bold request against a safe one (rush or easy, long or quick, big or small), and differs that way', () => {
    let pairs = 0;
    const kinds = new Map<string, number>();
    const bad: string[] = [];
    for (const s of farms()) {
      const offer = offerRequests(s);
      if (offer.length !== 2) continue;
      pairs++;
      const ks = offer.map(kindOf).sort().join('/');
      kinds.set(ks, (kinds.get(ks) ?? 0) + 1);
      const by = (k: string) => offer.find((o) => kindOf(o) === k)!;
      const show = offer.map((o) => `${kindOf(o)} ${o.items[0].n} ${o.items[0].crop} +${gain(o)}`).join(' or ');
      if (ks === 'easy/rush') {
        // No day to spare against at least one; sown today (or, the soil full, no later than the other).
        if (spare(by('rush')) !== 0 || spare(by('easy')) < 1 || sowBy(by('rush')) > sowBy(by('easy'))) bad.push(`risk: ${show}`);
      } else if (ks === 'long/quick') {
        if (CROPS[by('long').items[0].crop].days < CROPS[by('quick').items[0].crop].days + 2) bad.push(`time: ${show}`);
      } else if (ks === 'big/small') {
        if (by('big').items[0].n < 1.5 * by('small').items[0].n || CROPS[by('big').items[0].crop].seed >= CROPS[by('small').items[0].crop].seed) bad.push(`size: ${show}`);
      } else bad.push(`not a contrast: ${ks}`);
    }
    expect(pairs).toBeGreaterThan(60);
    expect(bad, bad.slice(0, 3).join('; ')).toEqual([]);
    // All three sorts come up.
    expect([...kinds.keys()].sort()).toEqual(['big/small', 'easy/rush', 'long/quick']);
  });

  it('the bold one offers clearly more gain, and the two come out alike for a typical farm (within 15% of the gain)', () => {
    let pairs = 0;
    const off: string[] = [];
    let unlike = 0;
    let same = 0;
    for (const s of farms()) {
      const offer = offerRequests(s);
      if (offer.length !== 2) continue;
      pairs++;
      const bold = offer.find((o) => ['rush', 'long', 'big'].includes(kindOf(o) ?? ''))!;
      const safe = offer.find((o) => o !== bold)!;
      expect(gain(bold), `${kindOf(bold)} +${gain(bold)} against ${kindOf(safe)} +${gain(safe)}`).toBeGreaterThanOrEqual(1.2 * gain(safe));
      if (Math.abs(neutral(bold) - neutral(safe)) > 0.15 * gain(bold)) off.push(`${kindOf(bold)} ${neutral(bold)} and ${kindOf(safe)} ${neutral(safe)}`);
      // Not identical on the round 4 measure: the fifth playtest's pairs matched within 3% on net per plot-day.
      const [a, b] = offer.map(netPerPlotDay);
      if (Math.abs(a - b) > 0.1 * Math.max(a, b)) unlike++;
      if (Math.abs(a - b) <= 0.03 * Math.max(a, b)) same++;
    }
    expect(pairs).toBeGreaterThan(60);
    expect(off, off.slice(0, 3).join('; ')).toEqual([]);
    expect(unlike / pairs).toBeGreaterThan(0.5);
    expect(same / pairs).toBeLessThan(0.25);
  });

  it('a morning offers a different sort of pair from the one before', () => {
    const s = farm(77, { fields: 2, coins: 1500, day: 22 });
    const seen: string[] = [];
    for (let k = 0; k < 6; k++) {
      s.orders = [];
      const offer = offerRequests(s);
      if (offer.length === 2) seen.push(offer.map(kindOf).sort().join('/'));
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i], seen.join(', ')).not.toBe(seen[i - 1]);
  });
});

describe('P1: a request is taken only when the player accepts it on the board', () => {
  it('planting its crop takes nothing; Accept takes it and lets the other of the pair go, with a word', () => {
    const s = farm(13, { fields: 2, coins: 900, day: 4 });
    fillRequests(s, true);
    expect(s.orders.length).toBe(2);
    const [a, b] = s.orders;
    // Planting the crop of one (for market, say) leaves both on offer.
    stand(s, 3, 4, 's');
    s.tool = 'seeds';
    s.seed = a.items[0].crop;
    run(s, 2, [{ type: 'actAt', x: 3, y: 5 }]);
    expect(plots(s, 3, 5).crop?.kind).toBe(a.items[0].crop);
    expect(s.orders.map((o) => o.id)).toEqual([a.id, b.id]);
    expect(s.orders.every((o) => (o as Order & { taken?: boolean }).taken === false)).toBe(true);
    const ev = step(s, 0.016, [{ type: 'accept', id: b.id } as never]);
    expect(s.orders.map((o) => o.id)).toEqual([b.id]);
    expect(ev.some((e) => e.type === 'request' && e.id === a.id && !e.done)).toBe(true);
  });

  it('an offer is never filled from the crate by accident: its crops sell at market', () => {
    const s = farm(17, { fields: 2, coins: 900, day: 4 });
    fillRequests(s, true);
    const [a] = s.orders;
    s.stock[a.items[0].crop][0] = a.items[0].n;
    const coins = s.coins;
    nightfall(s, []);
    expect(s.report?.filled ?? []).toEqual([]);
    expect(s.coins - coins).toBe(a.items[0].n * CROPS[a.items[0].crop].price);
  });

  it('the board badge counts new notes only: a pinned pair is new until the board is read', () => {
    const s = farm(19, { fields: 2, coins: 900, day: 4 });
    fillRequests(s, true);
    const isNew = () => s.orders.filter((o) => (o as Order & { seen?: boolean }).seen === false).length;
    expect(isNew()).toBe(2);
    step(s, 0.016, [{ type: 'readBoard' } as never]);
    expect(isNew()).toBe(0);
  });

  it('the morning card never names a request the player did not take', () => {
    const s = farm(23, { fields: 2, coins: 900, day: 4 });
    fillRequests(s, true);
    for (let k = 0; k < 4; k++) nightfall(s, []);
    expect(morningNews(s)).not.toMatch(/elsewhere|gave up/);
  });
});

describe('P1: the board headlines the gain over market', () => {
  it('"+195 over market", what it needs, and the sow-by and due days (not "Pays 1,370", mostly market value)', async () => {
    const { noteText } = await import('../src/ui/dialogs');
    for (const s of [farm(29, { fields: 2, coins: 900, day: 4 }), farm(31, { fields: 3, coins: 1500, day: 23 })]) {
      fillRequests(s, true);
      for (const o of s.orders) {
        const t = noteText(s, o);
        expect(t.head).toBe(`+${gain(o).toLocaleString('en-US')} over market`);
        expect(t.lines.join(' | ')).toMatch(/^\d+ [a-z]+ for .+ \| Sow \d+ (today|by [A-Za-z]+( \d+)?), seed [\d,]+ \| Ripe in \d+ days, due [A-Za-z]+ \d+, (no day|a day|\d days) to spare$/);
        expect(t.lines.join(' ')).not.toMatch(/Pays/);
      }
    }
  });

  it('a request counting crops already growing headlines only what it adds (22 carrots: +160, not 1,370)', () => {
    let n = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = farm(seed * 53, { fields: 3, coins: 1500, day: 12 });
      const tiles = s.plots.map((_, i) => i).filter((i) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && s.tiles[i] === 'field');
      // Summer, both request crops growing for market already.
      tiles.slice(0, 18).forEach((i) => plant(s, i % s.W, Math.floor(i / s.W), 'corn', 1));
      tiles.slice(18, 32).forEach((i) => plant(s, i % s.W, Math.floor(i / s.W), 'sunflower', 1));
      for (const o of offerRequests(s)) {
        n++;
        const fresh = (o as Order & { fresh?: number }).fresh ?? o.items[0].n;
        // The gain is no more than the most a request pays for its own sowing: 14 coins a plot of the farm.
        expect(gain(o)).toBeLessThanOrEqual(14 * 48);
        expect(gain(o)).toBeLessThanOrEqual(fresh * CROPS[o.items[0].crop].days * 8.5);
      }
    }
    expect(n).toBeGreaterThan(10);
  });
});

describe('P1: no line sends the farmer to bed with work waiting', () => {
  /** A farm on the scarecrow lesson's morning, with a request waiting and dry crops. */
  function lessonFarm(coins: number): WorldState {
    const s = teach(world('sunup', 9), [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'bugs', 'field', 'turn', 'smith', 'wide', 'stamina'], [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'pests']);
    s.learnCount['done:pests'] = 6;
    s.day = 7;
    s.coins = coins;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) plant(s, x, y, 'lettuce', 2);
    plots(s, 4, 7).crop = null;
    s.stock.lettuce[0] = 4;
    return s;
  }

  it('the scarecrow line waits until a scarecrow can be paid for, then comes', () => {
    const s = lessonFarm(0);
    const t = new Tutor();
    for (let i = 0; i < 20; i++) expect(t.update(s, 0.1, true).line).not.toMatch(/[Ss]carecrow|Sleep/);
    s.coins = 40;
    expect(t.update(s, 0.1, true).line).toBe('Build a scarecrow on bare soil.');
    // Spent below it again: the line steps aside, unfinished, and comes back.
    s.coins = 10;
    expect(t.update(s, 0.1, true).line).toBe('');
    expect(s.learn).not.toContain('lesson:scarecrow');
    s.coins = 60;
    expect(t.update(s, 0.1, true).line).toBe('Build a scarecrow on bare soil.');
  });

  it('"No coins left. Sleep to sell the crate." waits while crops are thirsty, and for something to sell', () => {
    const s = teach(world('sunup', 4), ['pull', 'water', 'well', 'sleep'], ['can', 'sleep']);
    s.coins = 0;
    s.stats.days = 1;
    s.stock.radish[0] = 4;
    // The day 1 carrots are dry.
    for (const p of s.plots) if (p.crop && p.crop.stage < 4) p.wet = false;
    const t = new Tutor();
    expect(t.update(s, 0.1, true).line).not.toMatch(/Sleep/);
    for (const p of s.plots) if (p.crop) p.crop = null;
    expect(t.update(s, 0.1, true).line).toBe('No coins left. Sleep to sell the crate.');
  });
});

describe('P1: the early field leaves coins to sow it', () => {
  it('"Buy a second field." waits until buying it leaves 150 for seed', () => {
    const s = teach(world('sunup', 3), [...EARLY, 'requests', 'deliver'], [...EARLY_FEATURES, 'board', 'requests']);
    s.day = 5;
    const t = new Tutor();
    s.coins = 270;
    for (let i = 0; i < 5; i++) expect(t.update(s, 0.1, true).line).not.toBe('Buy a second field.');
    s.coins = 400;
    expect(t.update(s, 0.1, true).line).toBe('Buy a second field.');
  });
});

describe('P2: the turn warning comes first on a full morning card', () => {
  it('"N green crops won’t ripen" is kept over sold, paid and ripe, on both of the last two mornings', () => {
    for (const day of [9, 10]) {
      const s = world('sunup');
      s.day = day;
      for (const p of s.plots) p.crop = null;
      // Spring's last mornings: carrots a day old do not grow in summer and will not ripen before it.
      for (let x = 2; x < 6; x++) plant(s, x, 7, 'carrot', 1);
      s.report = { day: day - 1, sold: [{ crop: 'radish', n: 8, value: 240 }], wages: 0, grew: 9, withered: 2, eaten: 1, crewWork: 0, income: 240, filled: [{ who: 'Old Tamsin', reward: 145 }], lapsed: [{ who: 'The lighthouse keeper', crop: 'corn', n: 6 }], withdrawn: [{ who: 'Pell’s pickles', crop: 'carrot', n: 5 }], kept: [{ crop: 'lettuce', n: 3 }], ripe: 6, worn: 1 };
      const news = morningNews(s);
      expect(news, `day ${day}`).toMatch(/4 green crops won’t ripen before summer/);
      expect(news.split(/[.,]\s*/).filter(Boolean).length).toBeLessThanOrEqual(3);
    }
  });
});

describe('P2: running out of stamina says so once', () => {
  it('too tired: one refusal, and the taps still waiting are dropped (two refusals drew over each other)', () => {
    const s = farm(41, { coins: 400 });
    for (let x = 2; x < 6; x++) plant(s, x, 6, 'carrot', 2);
    for (const p of s.plots) if (p.crop) p.wet = false;
    s.tool = 'can';
    s.water = 12;
    // Enough for one watering: the first tap waters, the three made while it does wait their turn.
    s.stamina = 3;
    stand(s, 3, 5, 's');
    const ev: SimEvent[] = [];
    for (let i = 0; i < 90; i++) ev.push(...step(s, 1 / 30, i < 4 ? [{ type: 'actAt', x: 2 + i, y: 6 }] : []));
    expect(ev.filter((e) => e.type === 'water').length).toBe(1);
    expect(ev.filter((e) => e.type === 'deny').length).toBe(1);
    expect(s.taps ?? []).toEqual([]);
  });
});

describe('P2: some days demand attention', () => {
  it('a flock day now and then: the card says crows are about, more crows come, and those still to come at bedtime take a crop each', () => {
    let flocks = 0;
    let mornings = 0;
    let lost = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = farm(seed * 31, { fields: 2 });
      for (let i = 0; i < s.plots.length; i++) if (s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && s.tiles[i] === 'field') plant(s, i % s.W, Math.floor(i / s.W), 'carrot', 2);
      for (const p of s.plots) if (p.crop) p.wet = true;
      nightfall(s, []);
      if (['rain', 'storm'].includes(s.weather)) continue;
      mornings++;
      if (!s.report?.flock) continue;
      flocks++;
      expect(morningNews(s)).toMatch(/crows are about today/i);
      expect(s.crowPlan.length).toBeGreaterThanOrEqual(2);
      // To bed at once: every crow still to come takes a crop.
      const before = s.plots.filter((p) => p.crop).length;
      const due = s.crowPlan.length;
      nightfall(s, []);
      lost += before - s.plots.filter((p) => p.crop).length;
      expect(before - s.plots.filter((p) => p.crop).length).toBe(due);
    }
    expect(flocks).toBeGreaterThan(mornings * 0.1);
    expect(flocks).toBeLessThan(mornings * 0.4);
    expect(lost).toBeGreaterThan(0);
  });

  it('at 13:00 bugs land again, so the afternoon has a look worth taking', () => {
    let landed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = farm(seed * 17, { fields: 2 });
      for (let i = 0; i < s.plots.length; i++) if (s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && s.tiles[i] === 'field') plant(s, i % s.W, Math.floor(i / s.W), 'carrot', 2);
      s.minute = 410;
      const ev: SimEvent[] = [];
      for (let i = 0; i < 60; i++) ev.push(...step(s, 1 / 30));
      expect(s.minute).toBeGreaterThan(420);
      landed += ev.filter((e) => e.type === 'bugs').length;
    }
    expect(landed).toBeGreaterThan(5);
  });
});

describe('P3: lessons in their time', () => {
  it('the smith comes only when the farm can pay for what he makes', () => {
    const s = farm(43, { coins: 100, lessons: [...EARLY, 'requests', 'deliver', 'field', 'turn', 'wide', 'bugs', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'stamina', 'hoe'] });
    s.learn.push('hoe');
    s.rep = 5;
    const t = new Tutor();
    for (let i = 0; i < 50; i++) expect(t.update(s, 0.1, true).line).not.toMatch(/smith/);
    s.coins = 400;
    let line = '';
    for (let i = 0; i < 5; i++) line = t.update(s, 0.1, true).line;
    expect(line).toBe('The smith has better tools now.');
  });

  it('the second morning brings coins and seeds; stamina comes later, with a line of its own', () => {
    const s = teach(world('sunup', 2), ['pull', 'water', 'well', 'sleep', 'broke'], ['can', 'sleep']);
    s.stats.days = 1;
    s.day = 2;
    for (const p of s.plots) if (p.crop) p.crop = null;
    const t = new Tutor();
    const unlocked: string[] = [];
    for (let i = 0; i < 20; i++) {
      for (const c of t.update(s, 0.1, true).cmds) {
        if (c.type !== 'unlock' || s.learn.includes(c.what)) continue;
        s.learn.push(c.what);
        if (!c.what.startsWith('lesson:')) unlocked.push(c.what);
      }
    }
    expect(unlocked.sort()).toEqual(['coins', 'seeds']);
  });

  it('a passive line seen on its day does not linger into the next morning (the forecast line stayed two days)', () => {
    const s = farm(47, { lessons: [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'scarecrow', 'bugs', 'field', 'turn', 'smith', 'wide', 'hoe', 'stamina', 'sprinkler'] });
    s.learnCount['done:scarecrow'] = 5;
    const t = new Tutor();
    expect(t.update(s, 1, true).line).toBe('Check the forecast for rain and heat.');
    s.day += 1;
    t.update(s, 0.1, true);
    expect(s.learn).toContain('lesson:forecast');
  });
});
