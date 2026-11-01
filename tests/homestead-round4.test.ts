// Round 4, P1 and P2: "After Spring 10 the routine is tap, tap, sleep, with
// nothing at stake." A request for a crop already growing paid its premium on
// all of it (31 corn, 28 of them growing for market, paid 5,230); a pair was
// rarely a real choice (7 corn beat 9 sunflowers on every count); one 1,020
// request on Spring 10 made money stop mattering; two scarecrows ended the
// crows for good and two 120-coin sprinklers ended watering; the day ran
// 120 seconds for 15 to 40 seconds of work; requests dried up when the soil
// was full; and a tap with the can on a dry, bugged crop watered it and left
// the bugs.
//
// These tests read the farm only through what the committed rules had too
// (offerRequests, fillRequests, the orders, nightfall, step, tapTool), so on
// the old code they fail on their assertions, not on a missing name.
import { describe, expect, it } from 'vitest';
import { tapTool } from '../src/sim/actors';
import { CROPS } from '../src/sim/crops';
import { crowTarget, nightfall } from '../src/sim/day';
import { fillRequests, offerRequests, requestHave } from '../src/sim/goals';
import { step } from '../src/sim/step';
import { plant, plots, season } from '../src/sim/world';
import type { CropId, Order, WorldState } from '../src/sim/types';
import { morningNews } from '../src/ui/hud';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

const ALL = [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'field', 'turn', 'smith', 'wide', 'hoe'];
const FEATURES = [...EARLY_FEATURES, 'board', 'requests', 'pests', 'build', 'sprinkler', 'forecast', 'hoe'];

/** A farm past its first request: `fields` fields owned and hoed, `coins` in hand, an empty crate, nothing growing. */
function farm(seed: number, opts: { fields?: number; coins?: number; day?: number } = {}): WorldState {
  const s = teach(world('sunup', seed), ALL, FEATURES);
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

/** Owned field plots, with nothing built on them. */
function fieldTiles(s: WorldState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < s.plots.length; i++) {
    if (s.parcelOf[i] < 0 || !s.parcels[s.parcelOf[i]].owned || s.tiles[i] !== 'field') continue;
    if (s.builds.some((b) => b.y * s.W + b.x === i)) continue;
    out.push({ x: i % s.W, y: Math.floor(i / s.W) });
  }
  return out;
}

/** Crops in the crate or growing on owned land that will be ripe by a request's due day: what it does not need sown. */
function baseOf(s: WorldState, o: Order): number {
  const it = o.items[0];
  let n = s.stock[it.crop].reduce((a, b) => a + b, 0);
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.dead || c.kind !== it.crop || s.parcelOf[i] < 0 || !s.parcels[s.parcelOf[i]].owned) continue;
    if (CROPS[c.kind].days - c.age <= o.due - s.day) n++;
  }
  return Math.min(n, it.n);
}

/** What a request earns over the seed it has you buy, for each plot and day its fresh sowing takes. */
function perPlotDay(s: WorldState, o: Order): number {
  const it = o.items[0];
  const d = CROPS[it.crop];
  const base = baseOf(s, o);
  const fresh = Math.max(1, it.n - base);
  return (o.reward - base * d.price - fresh * d.seed) / (fresh * d.days);
}

/** Farms of every size and purse across the year's sowing days, with nothing growing. */
function* farms(): Generator<WorldState> {
  let seed = 1;
  for (const fields of [1, 2, 3]) for (const coins of [150, 400, 1200, 3000]) for (const day of [4, 6, 13, 16, 24, 26, 34]) yield farm(seed++ * 7919, { fields, coins, day });
}

describe('a request pays its premium only on what it has you sow', () => {
  // Round 6: crops already growing never count at all (the sixth playtest was paid 240 over market for ten lettuces
  // already growing): every request is all fresh sowing, and its gain is what that sowing earns.
  it('crops already growing never count: all of it is sown fresh, and the gain is for that sowing (31 corn, 28 growing, paid 5,230)', () => {
    let n = 0;
    for (let seed = 1; seed <= 25; seed++) {
      // Summer: the only crops a request can ask for are sunflowers and corn, and both are growing for market.
      const s = farm(seed * 101, { fields: 3, coins: 1500, day: 12 + (seed % 3) });
      const tiles = fieldTiles(s);
      let k = 0;
      for (const [crop, count] of [['corn', 18], ['sunflower', 14]] as [CropId, number][]) for (let j = 0; j < count; j++, k++) plant(s, tiles[k].x, tiles[k].y, crop, 1);
      for (const o of offerRequests(s)) {
        const it = o.items[0];
        const d = CROPS[it.crop];
        n++;
        expect(requestHave(s, { ...o, taken: true }), `${it.n} ${it.crop}`).toBe(0);
        expect(it.n).toBeGreaterThanOrEqual(3);
        // What it pays over market is no more than the most a request pays for its own sowing (1.8 times market).
        expect(o.reward, `${it.n} ${it.crop}, pays ${o.reward}`).toBeLessThanOrEqual(it.n * d.price * 1.8 + 5);
      }
    }
    expect(n).toBeGreaterThan(15);
  });
});

describe('the two of a pair are a real choice', () => {
  // Round 5 replaced this rule: pairs priced to earn the same for each plot and day read as identical (the fifth
  // playtest's corn and sunflowers both cleared 675 over 42 plot-days). `homestead-round5.test.ts` checks the pairs
  // that differ in kind. What stays from round 4: neither of a pair is a poor deal on what it earns over its seed.
  it('neither earns less than half of the other over its seed for each plot and day (7 corn beat 9 sunflowers on every count)', () => {
    let pairs = 0;
    const gaps: string[] = [];
    for (const s of farms()) {
      const offer = offerRequests(s);
      if (offer.length !== 2) continue;
      pairs++;
      const [a, b] = offer.map((o) => perPlotDay(s, o));
      if (Math.min(a, b) < 0.5 * Math.max(a, b)) gaps.push(`${offer.map((o) => `${o.items[0].n} ${o.items[0].crop} for ${o.reward}`).join(' or ')}: ${a.toFixed(1)} and ${b.toFixed(1)}`);
    }
    expect(pairs).toBeGreaterThan(50);
    expect(gaps, gaps.slice(0, 3).join('; ')).toEqual([]);
  });
});

describe('requests are sized to the farm, and capped', () => {
  it('what a request gains over market is at most 14 coins a plot of owned field (a 1,020 request on two fields)', () => {
    // (Round 5: the cap is on the gain over market, which the board now headlines; it was 30 a plot on all of the pay
    // for what a request has you sow, market value included.)
    let n = 0;
    for (const s of farms()) {
      const plotsOwned = fieldTiles(s).length;
      for (const o of offerRequests(s)) {
        n++;
        const gain = o.reward - o.items[0].n * CROPS[o.items[0].crop].price;
        expect(gain, `${o.items[0].n} ${o.items[0].crop} on ${plotsOwned} plots`).toBeLessThanOrEqual(14 * plotsOwned);
        expect(gain).toBeGreaterThan(0);
      }
    }
    expect(n).toBeGreaterThan(100);
  });
});

describe('requests keep coming', () => {
  it('a farm whose soil is full still gets requests, to be sown when plots come free', () => {
    let offered = 0;
    let n = 0;
    // Early and mid season, and its last days (when next season's seed can go in), in spring, summer and autumn.
    for (const day of [2, 3, 4, 8, 9, 12, 13, 18, 22, 23]) {
      for (let seed = 1; seed <= 4; seed++) {
        const s = farm(seed * 37 + day, { fields: 2, coins: 600, day });
        // Every plot growing a crop of the season that is three days from ripe.
        const crop: CropId = season(day) === 1 ? (seed % 2 ? 'sunflower' : 'corn') : seed % 2 ? 'carrot' : 'lettuce';
        for (const t of fieldTiles(s)) plant(s, t.x, t.y, crop, CROPS[crop].days - 3);
        n++;
        fillRequests(s, true);
        if (s.orders.length) offered++;
        // Sown when plots come free, so ripe no sooner than that.
        for (const o of s.orders) expect(o.due, `day ${day}: ${o.items[0].n} ${o.items[0].crop}`).toBeGreaterThanOrEqual(s.day + 3 + CROPS[o.items[0].crop].days);
      }
    }
    expect(offered).toBe(n);
  });

  it('in summer, with both summer crops under way and fully sown, a new request still comes', () => {
    let offered = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = farm(seed * 59, { fields: 3, coins: 900, day: 12 });
      const tiles = fieldTiles(s);
      // Two requests under way, their seed all in.
      s.orders = [
        { id: 900, who: 'Old Tamsin', items: [{ crop: 'corn', n: 6 }], reward: 900, rep: 1, due: 20, sowBy: 12, made: 11 },
        { id: 901, who: 'Pell’s pickles', items: [{ crop: 'sunflower', n: 6 }], reward: 700, rep: 1, due: 19, sowBy: 12, made: 11 },
      ];
      for (let k = 0; k < 6; k++) plant(s, tiles[k].x, tiles[k].y, 'corn', 1);
      for (let k = 6; k < 12; k++) plant(s, tiles[k].x, tiles[k].y, 'sunflower', 1);
      // (Round 6: sown for them.)
      for (const c of s.plots) if (c.crop) c.crop.planted = 11;
      for (const c of s.plots) if (c.crop) c.crop.for = c.crop.kind === 'corn' ? 900 : 901;
      fillRequests(s, true);
      if (s.orders.length > 2) offered++;
    }
    expect(offered).toBeGreaterThanOrEqual(18);
  });
});

describe('crows go for the edges of a watched field', () => {
  /** Two fields growing carrots, a scarecrow in the middle of each. */
  function watched(seed: number): WorldState {
    const s = farm(seed, { fields: 2 });
    for (const t of fieldTiles(s)) plant(s, t.x, t.y, 'carrot', 2);
    for (const [x, y] of [[3, 6], [8, 6]]) {
      plots(s, x, y).crop = null;
      s.builds.push({ id: s.nextId++, kind: 'scarecrow', x, y });
    }
    return s;
  }

  it('a crow still comes now and then, and only ever for a plot at the edge of the scarecrow’s watch', () => {
    const s = watched(7);
    let mornings = 0;
    let crows = 0;
    for (let k = 0; k < 60; k++) {
      s.day = 6;
      s.weather = 'sun';
      s.forecast = ['sun', 'sun', 'sun'];
      // (The day played out: the crows that came were shooed, none is still to come. Round 5's flock days let crows
      // still to come at bedtime take a crop each.)
      s.crowPlan = [];
      nightfall(s, []);
      for (const p of s.plots) if (p.crop) Object.assign(p.crop, { age: 2, stage: 2, dry: 0, bugs: 0 });
      if (['rain', 'storm'].includes(s.weather)) continue;
      mornings++;
      if (s.crowPlan.length) crows++;
    }
    // Some dry mornings bring one, most do not.
    expect(crows).toBeGreaterThan(mornings * 0.2);
    expect(crows).toBeLessThan(mornings * 0.75);
    for (let k = 0; k < 60; k++) {
      const t = crowTarget(s);
      expect(t).not.toBeNull();
      // Never right beside a scarecrow: always on the far row or column of its field.
      const d = Math.min(...s.builds.map((b) => Math.max(Math.abs(b.x - t!.x), Math.abs(b.y - t!.y))));
      expect(d, `${t!.x},${t!.y}`).toBe(2);
    }
  });
});

describe('sprinklers are a real cost', () => {
  it('cost more than 120 and wear out after a season, with a word on the morning card', () => {
    const s = farm(3, { coins: 1000 });
    plant(s, 4, 7, 'carrot', 1);
    s.buildKind = 'sprinkler';
    s.tool = 'build';
    stand(s, 3, 4, 's');
    step(s, 0.016, [{ type: 'act' }]);
    expect(s.builds.filter((b) => b.kind === 'sprinkler').length).toBe(1);
    expect(1000 - s.coins).toBeGreaterThanOrEqual(200);
    let worn = '';
    for (let k = 0; k < 12 && s.builds.length; k++) {
      s.weather = 'sun';
      s.forecast = ['sun', 'sun', 'sun'];
      nightfall(s, []);
      if (!s.builds.length) worn = morningNews(s);
    }
    expect(s.builds.length).toBe(0);
    expect(s.day).toBeLessThanOrEqual(6 + 10);
    expect(worn).toMatch(/sprinkler wore out/);
  });
});

describe('the day fits the work', () => {
  it('a one-field farm’s day runs about a minute; it grows with the farm, never past two', () => {
    const lengths: number[] = [];
    for (const fields of [1, 2, 3, 6]) {
      const s = farm(11, { fields });
      s.minute = 0;
      let t = 0;
      while (s.turnover < 0 && t < 200) {
        step(s, 0.1);
        t += 0.1;
      }
      lengths.push(Math.round(t));
    }
    expect(lengths[0]).toBeGreaterThanOrEqual(55);
    expect(lengths[0]).toBeLessThanOrEqual(65);
    expect(lengths[1]).toBeGreaterThan(lengths[0]);
    expect(lengths[3]).toBeLessThanOrEqual(121);
    for (let i = 1; i < lengths.length; i++) expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]);
  });
});

describe('a tap picks bugs before it waters', () => {
  it('the can in hand, a dry bugged crop tapped: the hands pick the bugs off, nothing is watered', () => {
    const s = farm(5);
    plant(s, 4, 6, 'carrot', 2);
    const c = plots(s, 4, 6);
    c.wet = false;
    c.moisture = 0;
    c.crop!.bugs = 1;
    s.tool = 'can';
    s.water = 12;
    expect(tapTool(s, 'can', 4, 6)).toBe('hands');
    stand(s, 4, 5, 's');
    const ev: string[] = [];
    for (let i = 0; i < 40; i++) for (const e of step(s, 1 / 30, i === 0 ? [{ type: 'actAt', x: 4, y: 6 }] : [])) ev.push(e.type);
    expect(c.crop!.bugs).toBe(0);
    expect(ev).toContain('tend');
    expect(ev).not.toContain('water');
  });
});

describe('the lessons and the copy', () => {
  it('a new save holds the clock at 6:00 until the farmer first does something (it read 7:22 before the first tap)', () => {
    const s = world('sunup');
    s.held = true;
    for (let i = 0; i < 90; i++) step(s, 0.1, [{ type: 'move', x: 0, y: 0 }, { type: 'unlock', what: 'can' }]);
    expect(s.minute).toBe(0);
    step(s, 0.1, [{ type: 'move', x: 1, y: 0 }]);
    for (let i = 0; i < 10; i++) step(s, 0.1);
    expect(s.minute).toBeGreaterThan(0);
  });

  it('the scarecrow lesson points at bare soil in the middle of a field, never a crop, and has no timer', async () => {
    const { Tutor } = await import('../src/games/homestead/lessons');
    const s = teach(world('sunup', 9), [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'bugs', 'field', 'turn', 'smith', 'wide'], [...EARLY_FEATURES, 'board', 'requests', 'pests']);
    s.learnCount['done:pests'] = 5;
    s.day = 6;
    s.coins = 200;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) plant(s, x, y, 'carrot', 2);
    plots(s, 4, 7).crop = null;
    const t = new Tutor();
    let out = t.update(s, 0.1, true);
    for (const c of out.cmds) if (c.type === 'unlock' && !s.learn.includes(c.what)) s.learn.push(c.what);
    expect(out.line).toBe('Build a scarecrow on bare soil.');
    expect(out.point).toEqual({ x: 4.5, y: 7.5 });
    // A tap on the pointer builds a scarecrow there (round 5: it asks first, once, and leaves the tool in hand alone).
    expect(out.build).toBe('scarecrow');
    for (let i = 0; i < 300; i++) out = t.update(s, 0.1, true);
    expect(out.line).toBe('Build a scarecrow on bare soil.');
    expect(s.learn).not.toContain('lesson:scarecrow');
  });

  it('the morning card says three clauses at most, and what is ripe rather than "N grew"', () => {
    const s = world('sunup');
    s.report = { day: 9, sold: [{ crop: 'radish', n: 8, value: 240 }], wages: 0, grew: 27, withered: 2, eaten: 1, crewWork: 0, income: 240, filled: [{ who: 'Old Tamsin', reward: 145 }], lapsed: [{ who: 'The lighthouse keeper', crop: 'corn', n: 6 }], kept: [{ crop: 'lettuce', n: 3 }], ripe: 6 };
    const news = morningNews(s);
    expect(news.split(/[.,]\s*/).filter(Boolean).length, news).toBeLessThanOrEqual(3);
    expect(news).toMatch(/crows ate 1 and 2 withered/);
    expect(news).not.toMatch(/grew/);
    s.report = { day: 9, sold: [{ crop: 'radish', n: 8, value: 240 }], wages: 0, grew: 27, withered: 0, eaten: 0, crewWork: 0, income: 240, ripe: 6 };
    expect(morningNews(s)).toBe('Sold 8 for 240, 6 ripe to pick.');
  });
});
