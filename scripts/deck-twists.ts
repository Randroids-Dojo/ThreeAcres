// Seedbound, round 7: are the season's twists priced right? From the stalls the decent bot reaches in years 2 and 3,
// each twist on offer is played ahead on a copy of the run against the same season with no twist, the same dice and
// the same bot, and its played cost (a hitch) or gain (a help) as a share of the take is set against what the rules
// expected when they offered it (`hitchAims`, `boonAims`). A hitch's quota cut is its expected cost; a hitch whose
// played cost is far under its cut is a coupon. Also: hitches offered that would cost under `minHit` (miss the build).
// Round 8: what the stall says each would do (`worth`), and per stall the help's played gain against the hitch's played
// net (its cut less its cost): a fair pair is close, and each is the better about half the time.
// Round 10: the share of stalls where the policy picked the hitch, each hitch's played cost against its quota cut in
// coins (a fair trade is near 1), what each twist's clipping says in coins against what it played, and hitches aimed
// at a free crop (radishes: frost on their row, a glut of them). --depth=2 plays ahead with the run's own bot (two
// plays deep): one play deep (the default, faster) takes about a third less than the run does, and a hitch's coins
// with it. --json=path writes the raw offers instead of the report; --merge=a.json,b.json reports several chunks
// (--first=n) as one. --buys plays each season ahead after the policy's shopping at that stall, as the run will.
// Round 11: the merchant pays a hitch in coins. Each pair's margin, said (the cut, less what the clipping says it costs, and
// the merchant's coins) and played (the same with what it cost played ahead), against the help's coins said and played:
// the eleventh playtest's help said about 4 times the hitch's margin (+310 against 490 less 410).
// Round 12: --player=greedy plays the run and every season ahead with the greedy preview player (deck-players.ts), its
// stalls shopped as it shops and its twist picked by its own play-ahead, beside the decent bot. Both twists are weighed
// on the two things a season leaves: how far the take ends past the quota (the margin) and the coins in the purse. A
// help's coins count on both; a hitch's margin is its cut less what it costs, its purse the merchant's coins less what it
// costs. The round 12 playtest's help beat the hitch on both at all 13 stalls (+280 on both against +30 and +10). Each
// hitch's played cost over what its clipping says, median by hitch, and a glut's by what of its crop stood at the stall.
// npx tsx scripts/deck-twists.ts [runs] [--policy=name] [--player=bot|greedy] [--first=n] [--tune=key:value] [--depth=2] [--buys] [--json=path]
// npx tsx scripts/deck-twists.ts --merge=a.json,b.json
import { readFileSync, writeFileSync } from 'node:fs';
import { botDay, Dice } from '../src/games/deck/bot';
import * as R from '../src/games/deck/rules';
import { ALL, POL } from './deck-policies';
import { GREEDY, readerBuys, readerDay, readerShop } from './deck-players';

const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 40);
const first = Number(flag('first') ?? 0);
const policy = flag('policy') ?? 'bot';
// Round 12: the greedy preview player plays the run, its stalls and every season ahead.
const player = flag('player') ?? 'bot';
const greedy = player === 'greedy';
const depth = Number(flag('depth') ?? 1);
// Round 10: --buys plays each season ahead after the policy's shopping at the stall (its cards, pages and level).
const buys = process.argv.includes('--buys');
// --tune=key:value plays any TUNING number (JSON for rows, objects merge: --tune=frostRoom:{"top":1.3}).
for (const a of process.argv.filter((x) => x.startsWith('--tune='))) {
  const at = a.indexOf(':');
  const k = a.slice(7, at);
  const v = a.slice(at + 1);
  const t = R.TUNING as unknown as Record<string, unknown>;
  const val = /^[[{]|^(true|false)$/.test(v) ? JSON.parse(v) : Number(v);
  t[k] = val && typeof val === 'object' && !Array.isArray(val) ? { ...(t[k] as object), ...val } : val;
}

/** One twist on offer at a stall, priced and played ahead. */
interface Offer {
  key: string;
  id: string;
  hitch: boolean;
  /** What the rules expected (a share of the take), the played cost or gain (a share), the quota cut (a share). */
  est: number;
  got: number;
  ease: number;
  /** What the stall says (round 8, a share), and in coins: said, played, the quota cut. */
  shown: number;
  said: number;
  coins: number;
  cut: number;
  free: boolean;
  missing: boolean;
  /** Round 12: the purse played (the take and the merchant's coins, against no twist), the merchant's coins. */
  purse?: number;
  pay?: number;
  /** Round 12, a glut or frost: its crop, how many of it stood on the plot at the stall, its cards in the tin, the crop's share of the take. */
  crop?: string;
  standing?: number;
  cards?: number;
  share?: number;
  engine?: string;
}
interface Data {
  offers: Offer[];
  pairs: { help: number; hitch: number; helpSaid?: number; marginSaid?: number; helpCoins?: number; marginPlayed?: number; pay?: number; cut?: number; costSaid?: number; costPlayed?: number; took?: number }[];
  stalls: number;
  tookHitch: number;
}

function measure(): Data {
  const shop = POL[policy];
  const play = (s: R.RunState, t: R.Twist | null, seed: number): { take: number; purse: number } => {
    const c = R.cloneRun(s);
    c.stats = { ...c.stats, log: [...s.stats.log] };
    c.rng = (Math.imul(seed, 2654435761) ^ s.rng) | 0;
    if (c.shop) {
      c.shop.twists = t ? [t] : undefined;
      c.shop.twist = t ? 0 : undefined;
    }
    // Round 10: the stall's shopping first (the same dice for every twist, so the same buys), so the season is played
    // with what the run takes home; leaving at once played it without, about a third under the run's own take.
    // Round 12: the greedy player shops as it does and leaves; the purse is counted from there, the merchant's coins in.
    let before = c.coins;
    if (buys && c.shop && greedy) {
      readerBuys(c, GREEDY, new Dice(seed ^ 0x2c1b3c6d));
      before = c.coins;
      R.leaveShop(c);
    } else if (buys && c.shop) {
      // The bot's shopping leaves the stall too: the purse is counted from what it held after the buys.
      shop(c, new Dice(seed ^ 0x2c1b3c6d));
      before = c.coins - ((c.twist as R.Twist & { pay?: number })?.pay ?? 0);
    } else R.leaveShop(c);
    const dice = new Dice(seed ^ 0x5bd1e995);
    for (let d = 0; d < R.TUNING.days && c.phase === 'day'; d++) {
      if (greedy) readerDay(c, { ...GREEDY, slip: 0 }, dice);
      else botDay(c, { noise: 0.15, seed, depth }, dice);
    }
    const l = c.stats.log[c.stats.log.length - 1];
    return { take: l ? l.earned - (l.carried ?? 0) : 0, purse: c.coins - before };
  };
  const out: Data = { offers: [], pairs: [], stalls: 0, tookHitch: 0 };
  for (let i = first; i < first + runs; i++) {
    const meta = R.newMeta();
    meta.unlocked = [...ALL];
    const seed = 5000 + i * 7919;
    const { s } = R.newRun(seed, meta, false);
    const dice = new Dice(seed ^ 77);
    for (let g = 0; g < 3000 && s.phase !== 'over'; g++) {
      if (R.seasonIndex(s) >= 11) break;
      if (s.phase === 'shop') {
        const tw = s.shop?.twists;
        if (tw?.length) {
          const aims = [...R.hitchAims(s), ...R.boonAims(s)];
          const base = [0, 1, 2].map((k) => play(s, null, seed + k));
          const b = base.reduce((a, x) => a + x.take, 0) / base.length || 1;
          const bp = base.reduce((a, x) => a + x.purse, 0) / base.length;
          const q0 = R.twistQuota(s, null);
          const pair: Data['pairs'][number] = { help: 0, hitch: 0, helpSaid: 0, marginSaid: 0, helpCoins: 0, marginPlayed: 0, pay: 0 };
          for (const t of tw) {
            const hitch = R.HITCHES.includes(t.id);
            // The aim this twist came from: the same crop, row or page (round 8: a buyer read the first crop's).
            const aim = aims.find((a) => a.t.id === t.id && a.t.crop === t.crop && a.t.page === t.page && (a.t.row ?? -1) === (t.row ?? -1)) ?? aims.find((a) => a.t.id === t.id);
            const runs3 = [0, 1, 2].map((k) => play(s, t, seed + k));
            const took = runs3.reduce((a, x) => a + x.take, 0) / 3;
            const purse = runs3.reduce((a, x) => a + x.purse, 0) / 3 - bp;
            const got = hitch ? 1 - took / b : took / b - 1;
            // Round 12: what of a glut's crop stood at the stall, and its cards in the tin.
            const crop = t.crop ?? undefined;
            const standing = crop ? s.plots.filter((p) => p.crop?.kind === crop).length : undefined;
            const cards = crop ? R.allCards(s).filter((c) => c.id === crop).length : undefined;
            const share = crop && s.tally ? (s.tally.kinds[crop as R.SeedId] ?? 0) / Math.max(1, s.tally.take) : undefined;
            out.offers.push({
              key: `${hitch ? 'hitch' : 'help'} ${t.id}`,
              id: t.id,
              hitch,
              est: aim?.v ?? 0,
              got,
              ease: R.twistEase(t),
              // Round 8: what the stall says it would do (a help's gain, a hitch's cost to a careful player), when it says.
              shown: (t as R.Twist & { worth?: number }).worth ?? aim?.v ?? 0,
              said: R.twistCoins(s, t),
              coins: hitch ? b - took : took - b,
              cut: q0 - R.twistQuota(s, t),
              free: hitch && !!t.crop && R.CARDS[t.crop].cost === 0,
              missing: hitch && (aim?.v ?? 0) < R.TUNING.minHit,
              purse,
              pay: (t as R.Twist & { pay?: number }).pay ?? 0,
              crop,
              standing,
              cards,
              share,
              engine: s.engine ?? undefined,
            });
            if (hitch) pair.hitch = R.twistEase(t) - got;
            else pair.help = got;
            const pay = (t as R.Twist & { pay?: number }).pay ?? 0;
            if (hitch) {
              pair.pay = pay;
              pair.marginSaid = q0 - R.twistQuota(s, t) - R.twistCoins(s, t) + pay;
              pair.marginPlayed = q0 - R.twistQuota(s, t) - (b - took) + pay;
              pair.cut = q0 - R.twistQuota(s, t);
              pair.costSaid = R.twistCoins(s, t);
              pair.costPlayed = b - took;
            } else {
              pair.helpSaid = R.twistCoins(s, t);
              pair.helpCoins = took - b;
            }
          }
          if (greedy) readerShop(s, GREEDY, dice);
          else shop(s, dice);
          if (tw.length === 2) out.pairs.push({ ...pair, took: s.twist && R.HITCHES.includes(s.twist.id) ? 1 : 0 });
          if (tw.length === 2 && s.twist) {
            out.stalls++;
            if (R.HITCHES.includes(s.twist.id)) out.tookHitch++;
          }
          continue;
        }
        if (greedy) readerShop(s, GREEDY, dice);
        else shop(s, dice);
      } else if (greedy) readerDay(s, GREEDY, dice);
      else botDay(s, { noise: 0.15, seed: 77 + i }, dice);
    }
  }
  return out;
}

function report(d: Data, label: string): void {
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1] ?? 0;
  const keys = [...new Set(d.offers.map((o) => o.key))].sort();
  const by = (k: string) => d.offers.filter((o) => o.key === k);
  console.log(`twists priced, ${label}: share of a season's take, expected when offered against played ahead (3 samples each, the same dice and bot with no twist)`);
  console.log("twist            offers  expected  played  quota cut   said (round 8: a help's gain, a hitch's cost to a careful player)");
  for (const k of keys) {
    const o = by(k);
    const p = (f: (x: Offer) => number) => `${(mean(o.map(f)) * 100).toFixed(1)}`;
    console.log(`${k.padEnd(16)} ${String(o.length).padStart(6)}  ${p((x) => x.est).padStart(7)}%  ${p((x) => x.got).padStart(5)}%  ${p((x) => x.ease).padStart(8)}%  ${p((x) => x.shown).padStart(7)}%`);
  }
  if (d.pairs.length) {
    const better = d.pairs.filter((p) => p.hitch > p.help).length;
    console.log(`pairs: the help played +${(mean(d.pairs.map((p) => p.help)) * 100).toFixed(1)}%, the hitch played +${(mean(d.pairs.map((p) => p.hitch)) * 100).toFixed(1)}% (its cut less its cost); the hitch the better of the two at ${Math.round((better / d.pairs.length) * 100)}% of ${d.pairs.length} stalls`);
  }
  if (d.pairs.length) {
    const m = (f: (p: Data['pairs'][number]) => number) => mean(d.pairs.map(f)).toFixed(0);
    const close = d.pairs.filter((p) => (p.helpSaid ?? 0) > 0 && Math.abs((p.marginSaid ?? 0) / (p.helpSaid ?? 1) - 1) <= 0.2).length;
    const better = d.pairs.filter((p) => (p.marginPlayed ?? 0) > (p.helpCoins ?? 0)).length;
    console.log(`round 11, in coins (means): the help says ${m((p) => p.helpSaid ?? 0)}, the hitch's margin says ${m((p) => p.marginSaid ?? 0)} (the merchant pays ${m((p) => p.pay ?? 0)}), within a fifth of each other at ${Math.round((close / d.pairs.length) * 100)}% of ${d.pairs.length} stalls; played ahead the help brought ${m((p) => p.helpCoins ?? 0)}, the hitch's margin came to ${m((p) => p.marginPlayed ?? 0)}, the better of the two at ${Math.round((better / d.pairs.length) * 100)}% of stalls`);
  }
  const hitches = d.offers.filter((o) => o.hitch);
  console.log(`hitches offered that would cost under ${R.TUNING.minHit * 100}% (miss the build): ${hitches.filter((o) => o.missing).length} of ${hitches.length}`);
  console.log(`round 10: the ${policy} policy took the hitch at ${d.stalls ? Math.round((d.tookHitch / d.stalls) * 100) : 0}% of ${d.stalls} stalls; hitches aimed at a free crop ${hitches.filter((o) => o.free).length} of ${hitches.length}`);
  const ratio = (o: Offer) => o.coins / o.cut;
  const cut = hitches.filter((o) => o.cut > 0);
  const ids = [...new Set(cut.map((o) => o.id))].sort();
  const each = ids.map((id) => {
    const a = cut.filter((o) => o.id === id).map(ratio);
    return `${id} mean ${mean(a).toFixed(2)}, median ${med(a).toFixed(2)} (${a.length})`;
  });
  console.log(`round 10: each hitch's played cost over its quota cut, in coins (a fair trade is near 1): ${each.join('; ')}`);
  const all = cut.map(ratio);
  const within = all.filter((r) => r >= 0.75 && r <= 1.25).length;
  const sums = cut.reduce((a, o) => a + o.coins, 0) / Math.max(1, cut.reduce((a, o) => a + o.cut, 0));
  console.log(`round 10: every hitch, played cost over quota cut: mean ${mean(all).toFixed(2)}, median ${med(all).toFixed(2)}; within 25% ${Math.round((within / Math.max(1, all.length)) * 100)}% of ${all.length}; the sum of costs over the sum of cuts ${sums.toFixed(2)}`);
  console.log("round 10, in coins (means): twist, offers, what the clipping says, what it played (a hitch's cost, a help's gain), the quota cut");
  for (const k of keys) {
    const o = by(k);
    const c = (f: (x: Offer) => number) => mean(o.map(f)).toFixed(0).padStart(5);
    console.log(`  ${k.padEnd(16)} ${String(o.length).padStart(5)}  said ${c((x) => x.said)}  played ${c((x) => x.coins)}  cut ${c((x) => x.cut)}`);
  }
  // Round 12: what each hitch costs played over what its clipping says, by hitch (the median of each offer's ratio; a
  // clipping that tells the truth is near 1), and the two twists weighed on margin and purse, said and played.
  console.log('round 12: each hitch\'s played cost over what its clipping says (median of each offer, mean said and played, offers within 25%)');
  for (const id of [...new Set(hitches.map((o) => o.id))].sort()) {
    const o = hitches.filter((x) => x.id === id && x.said > 0);
    const r = o.map((x) => x.coins / x.said);
    console.log(`  ${id.padEnd(6)} ${String(o.length).padStart(5)}  median ${med(r).toFixed(2)}  said ${mean(o.map((x) => x.said)).toFixed(0)}  played ${mean(o.map((x) => x.coins)).toFixed(0)}  within 25% ${Math.round((r.filter((v) => v >= 0.75 && v <= 1.25).length / Math.max(1, r.length)) * 100)}%`);
  }
  const all12 = hitches.filter((x) => x.said > 0).map((x) => x.coins / x.said);
  console.log(`  every hitch: median ${med(all12).toFixed(2)} (${all12.length})`);
  const gluts = hitches.filter((o) => o.id === 'glut' && o.said > 0 && o.standing !== undefined);
  if (gluts.length) {
    const line = (a: Offer[], label: string) => (a.length ? `${label}: ${a.length}, said ${mean(a.map((x) => x.said)).toFixed(0)}, played ${mean(a.map((x) => x.coins)).toFixed(0)}, median ratio ${med(a.map((x) => x.coins / x.said)).toFixed(2)}` : `${label}: none`);
    console.log(`  gluts by what of the crop stood at the stall: ${[line(gluts.filter((x) => (x.standing ?? 0) === 0), 'none standing'), line(gluts.filter((x) => (x.standing ?? 0) >= 1 && (x.standing ?? 0) <= 2), 'one or two'), line(gluts.filter((x) => (x.standing ?? 0) >= 3), 'three or more')].join('; ')}`);
    const crops = [...new Set(gluts.map((x) => x.crop ?? ''))].sort();
    console.log(`  gluts by crop: ${crops.map((k) => { const a = gluts.filter((x) => x.crop === k); return `${k} ${a.length} said ${mean(a.map((x) => x.said)).toFixed(0)} played ${mean(a.map((x) => x.coins)).toFixed(0)}`; }).join('; ')}`);
  }
  const both = d.pairs.filter((p) => p.cut !== undefined && p.helpSaid !== undefined);
  if (both.length) {
    const m = (f: (p: Data['pairs'][number]) => number) => mean(both.map(f)).toFixed(0);
    const margin = (p: Data['pairs'][number], cost: number) => (p.cut ?? 0) - cost;
    const purse = (p: Data['pairs'][number], cost: number) => (p.pay ?? 0) - cost;
    const sumSaid = (p: Data['pairs'][number]) => margin(p, p.costSaid ?? 0) + purse(p, p.costSaid ?? 0) - 2 * (p.helpSaid ?? 0);
    const sumPlayed = (p: Data['pairs'][number]) => margin(p, p.costPlayed ?? 0) + purse(p, p.costPlayed ?? 0) - 2 * (p.helpCoins ?? 0);
    const bothBeat = both.filter((p) => (p.helpSaid ?? 0) > margin(p, p.costSaid ?? 0) + 1 && (p.helpSaid ?? 0) > purse(p, p.costSaid ?? 0) + 1).length;
    console.log(`round 12, margin and purse (means over ${both.length} stalls): said, the help +${m((p) => p.helpSaid ?? 0)} on both, the hitch margin ${m((p) => margin(p, p.costSaid ?? 0))} and purse ${m((p) => purse(p, p.costSaid ?? 0))} (cut ${m((p) => p.cut ?? 0)}, pay ${m((p) => p.pay ?? 0)}, cost ${m((p) => p.costSaid ?? 0)}); the help ahead on both by what they say at ${Math.round((bothBeat / both.length) * 100)}% of stalls`);
    console.log(`  played, the help +${m((p) => p.helpCoins ?? 0)} on both, the hitch margin ${m((p) => margin(p, p.costPlayed ?? 0))} and purse ${m((p) => purse(p, p.costPlayed ?? 0))}; the hitch ahead on the two together at ${Math.round((both.filter((p) => sumPlayed(p) > 0).length / both.length) * 100)}% of stalls (by what they say ${Math.round((both.filter((p) => sumSaid(p) > 0).length / both.length) * 100)}%)`);
    const took = both.filter((p) => p.took !== undefined);
    if (took.length) console.log(`  the ${player === 'greedy' ? 'greedy player' : `${policy} policy`} took the hitch at ${Math.round((took.filter((p) => p.took).length / took.length) * 100)}% of ${took.length} stalls`);
  }
}

const merge = flag('merge');
if (merge) {
  const parts: Data[] = merge.split(',').map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const d: Data = { offers: parts.flatMap((p) => p.offers), pairs: parts.flatMap((p) => p.pairs), stalls: parts.reduce((a, p) => a + p.stalls, 0), tookHitch: parts.reduce((a, p) => a + p.tookHitch, 0) };
  report(d, `${greedy ? 'greedy player' : `${policy} policy`}, ${parts.length} chunks merged (whole catalogue)`);
} else {
  const d = measure();
  const json = flag('json');
  if (json) writeFileSync(json, JSON.stringify(d));
  else report(d, `${greedy ? 'greedy player' : `${policy} policy`}, ${runs} runs from ${first}${depth !== 1 ? `, played ahead ${depth} plays deep` : ''}${buys ? ' after its shopping' : ''} (whole catalogue)`);
}
