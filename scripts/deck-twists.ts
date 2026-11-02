// Seedbound, round 7: are the season's twists priced right? From the stalls the decent bot reaches in years 2 and 3,
// each twist on offer is played ahead on a copy of the run against the same season with no twist, the same dice and
// the same bot, and its played cost (a hitch) or gain (a help) as a share of the take is set against what the rules
// expected when they offered it (`hitchAims`, `boonAims`). A hitch's quota cut is its expected cost; a hitch whose
// played cost is far under its cut is a coupon. Also: hitches offered that would cost under `minHit` (miss the build).
// Round 8: what the stall says each would do (`worth`), and per stall the help's played gain against the hitch's played
// net (its cut less its cost): a fair pair is close, and each is the better about half the time.
// npx tsx scripts/deck-twists.ts [runs] [--policy=name]
import { botDay, Dice } from '../src/games/deck/bot';
import * as R from '../src/games/deck/rules';
import { ALL, POL } from './deck-policies';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 40);
const policy = process.argv.find((a) => a.startsWith('--policy='))?.split('=')[1] ?? 'bot';
const shop = POL[policy];
const play = (s: R.RunState, t: R.Twist | null, seed: number): number => {
  const c = R.cloneRun(s);
  c.stats = { ...c.stats, log: [...s.stats.log] };
  c.rng = (Math.imul(seed, 2654435761) ^ s.rng) | 0;
  if (c.shop) {
    c.shop.twists = t ? [t] : undefined;
    c.shop.twist = t ? 0 : undefined;
  }
  R.leaveShop(c);
  const dice = new Dice(seed ^ 0x5bd1e995);
  for (let d = 0; d < R.TUNING.days && c.phase === 'day'; d++) botDay(c, { noise: 0.15, seed, depth: 1 }, dice);
  const l = c.stats.log[c.stats.log.length - 1];
  return l ? l.earned - (l.carried ?? 0) : 0;
};
const rows = new Map<string, { n: number; est: number; got: number; ease: number; shown: number }>();
// Round 8: per stall, the help's played gain against the hitch's played net (its cut less what it cost), as shares of
// the season's take: a fair pair is close.
const pairs: { help: number; hitch: number }[] = [];
let offered = 0;
let missing = 0;
for (let i = 0; i < runs; i++) {
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
        const b = base.reduce((a, x) => a + x, 0) / base.length || 1;
        const pair = { help: 0, hitch: 0 };
        for (const t of tw) {
          const hitch = R.HITCHES.includes(t.id);
          // The aim this twist came from: the same crop, row or page (round 8: a buyer read the first crop's).
          const aim = aims.find((a) => a.t.id === t.id && a.t.crop === t.crop && a.t.page === t.page && (a.t.row ?? -1) === (t.row ?? -1)) ?? aims.find((a) => a.t.id === t.id);
          const took = [0, 1, 2].map((k) => play(s, t, seed + k)).reduce((a, x) => a + x, 0) / 3;
          const key = `${hitch ? 'hitch' : 'help'} ${t.id}`;
          const r = rows.get(key) ?? { n: 0, est: 0, got: 0, ease: 0, shown: 0 };
          r.n++;
          r.est += aim?.v ?? 0;
          r.got += hitch ? 1 - took / b : took / b - 1;
          r.ease += R.twistEase(t);
          // Round 8: what the stall says it would do (a help's gain, a hitch's cost to a careful player), when it says.
          r.shown += (t as R.Twist & { worth?: number }).worth ?? aim?.v ?? 0;
          rows.set(key, r);
          if (hitch) pair.hitch = R.twistEase(t) - (1 - took / b);
          else pair.help = took / b - 1;
          if (hitch) {
            offered++;
            if ((aim?.v ?? 0) < R.TUNING.minHit) missing++;
          }
        }
        if (tw.length === 2) pairs.push(pair);
      }
      shop(s, dice);
    } else botDay(s, { noise: 0.15, seed: 77 + i }, dice);
  }
}
console.log(`twists priced, ${policy} policy, ${runs} runs (whole catalogue): share of a season's take, expected when offered against played ahead (3 samples each, the same dice and bot with no twist)`);
console.log('twist            offers  expected  played  quota cut   said (round 8: a help\'s gain, a hitch\'s cost to a careful player)');
for (const [k, r] of [...rows.entries()].sort()) console.log(`${k.padEnd(16)} ${String(r.n).padStart(6)}  ${(r.est / r.n * 100).toFixed(1).padStart(7)}%  ${(r.got / r.n * 100).toFixed(1).padStart(5)}%  ${(r.ease / r.n * 100).toFixed(1).padStart(8)}%  ${(r.shown / r.n * 100).toFixed(1).padStart(7)}%`);
if (pairs.length) {
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const better = pairs.filter((p) => p.hitch > p.help).length;
  console.log(`pairs: the help played +${(mean(pairs.map((p) => p.help)) * 100).toFixed(1)}%, the hitch played +${(mean(pairs.map((p) => p.hitch)) * 100).toFixed(1)}% (its cut less its cost); the hitch the better of the two at ${Math.round((better / pairs.length) * 100)}% of ${pairs.length} stalls`);
}
console.log(`hitches offered that would cost under ${R.TUNING.minHit * 100}% (miss the build): ${missing} of ${offered}`);
