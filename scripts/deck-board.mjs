// Seedbound: does the plot fill and persist, and does cost bind? The bot plays
// whole runs and this counts, per season of years 1 and 2:
//   - crops standing at every dawn from day 2, and how often the plot is bare;
//   - plots filled at dusk (crops and objects, after the day's plays, before the
//     night), as a count and a share of the plot, and the season's fullest dusk;
//   - scoops on the bench at dawn; the share of dawns the hand costs more than
//     the bench (a choice forced); and the share of days the budget bound: the
//     day ended with a card in hand that had somewhere to go but cost more than
//     the scoops left (the third playtest weighed cost once in about 100 days);
//   - how many nights a crop stands, and what share of year 1 sowings go beside
//     a crop that was already standing that morning.
// It only uses the bot and the rules' public calls, so the same file runs on an
// older build (copy it into a `git archive` of the commit).
// npx tsx scripts/deck-board.mjs [runs] [noise] [--guided]
import { Dice, botDay, botShop } from '../src/games/deck/bot.ts';
import { CARDS, costOf, neighbours, newRun, SEASON_NAMES } from '../src/games/deck/rules/index.ts';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 120);
const noise = Number(args[1] ?? 0.15);
const guided = process.argv.includes('--guided');
const K = 8;

const list = () => Array.from({ length: K }, () => []);
const dawnCrops = list();
const duskFilled = list();
const duskShare = list();
const peak = list();
const bench = list();
const bound = list();
const over = list();
const bare = Array.from({ length: K }, () => [0, 0]);
const played = new Array(K).fill(0);
const cleared = new Array(K).fill(0);
const ratio = list();
const stays = [];
let sown = 0;
let besideOld = 0;

for (let i = 0; i < runs; i++) {
  const seed = 1000 + i * 7919;
  const o = { noise, seed: 77 + i, guided };
  const { s } = newRun(seed, null, guided);
  const dice = new Dice(o.seed ^ seed);
  const born = new Map();
  let fullest = 0;
  for (let guard = 0; guard < 400 && s.phase !== 'over'; guard++) {
    const k = (s.year - 1) * 4 + s.season;
    if (k >= K) break;
    if (s.phase === 'shop') {
      botShop(s, o, dice);
      continue;
    }
    const day = s.day;
    if (day === 1) fullest = 0;
    bench[k].push(s.energy);
    const standing = new Set(s.plots.map((p, j) => (p.crop ? j : -1)).filter((j) => j >= 0));
    // The board at dusk, read from the day's events (so this runs on an older bot too):
    // what stood at dawn, plus sowings and objects set out, less crops the shears pulled up.
    const filledDawn = s.plots.filter((p) => p.crop || p.obj).length;
    // A choice forced at dawn: what the hand could sow or play costs more than the bench holds.
    const emptyDawn = s.plots.length - filledDawn;
    const want = s.hand.filter((c) => CARDS[c.id].type === 'tool' || CARDS[c.id].type === 'weather' || emptyDawn > 0).reduce((a, c) => a + costOf(c.id, c.up), 0);
    over[k].push(want > s.energy ? 1 : 0);
    const handDawn = [...s.hand];
    const energyDawn = s.energy;
    const ev = botDay(s, o, dice);
    let filled = filledDawn;
    let left = energyDawn;
    const hand = new Map(handDawn.map((c) => [c.uid, c]));
    for (const e of ev) {
      if (e.t === 'dusk') break;
      if (e.t === 'plant' || e.t === 'object') filled++;
      if (e.t === 'harvest' && e.h.leaves) filled--;
      if (e.t === 'harvest' && e.h.scoops) left += e.h.scoops;
      if (e.t === 'play') {
        left -= costOf(e.card.id, e.card.up);
        hand.delete(e.card.uid);
      }
      if (e.t === 'toss') hand.delete(e.card.uid);
      if (e.t === 'draw') hand.set(e.card.uid, e.card);
    }
    const empty = s.plots.length - filled;
    const placeable = (c) => (CARDS[c.id].type === 'seed' || CARDS[c.id].type === 'object' ? empty > 0 : true);
    const tight = [...hand.values()].some((c) => costOf(c.id, c.up) > left && placeable(c));
    duskFilled[k].push(filled);
    duskShare[k].push(filled / s.plots.length);
    fullest = Math.max(fullest, filled);
    bound[k].push(tight ? 1 : 0);
    let night = false;
    for (const e of ev) {
      if (e.t === 'dusk') night = true;
      if (e.t === 'plant' && !night && k < 4) {
        sown++;
        if (neighbours(s, e.plot).some((j) => standing.has(j))) besideOld++;
      }
      if (e.t === 'plant') born.set(e.uid, day);
      if (e.t === 'seasonEnd') {
        played[k]++;
        if (e.cleared) cleared[k]++;
        ratio[k].push(e.earned / e.quota);
        peak[k].push(fullest);
      }
    }
    // Crops gone since this morning (pulled, taken or cleared): how long each stood.
    const now = new Set(s.plots.map((p) => p.crop?.uid).filter(Boolean));
    for (const [uid, d] of born) {
      if (now.has(uid) && s.phase === 'day' && (s.year - 1) * 4 + s.season === k) continue;
      stays.push(day - d + 1);
      born.delete(uid);
    }
    if (s.phase === 'day' && (s.year - 1) * 4 + s.season === k) {
      const n = s.plots.filter((p) => p.crop).length;
      dawnCrops[k].push(n);
      bare[k][1]++;
      if (n === 0) bare[k][0]++;
    }
  }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = (a) => {
  const t = [...a].sort((x, y) => x - y);
  return t.length ? t[Math.floor(t.length / 2)] : 0;
};
const pct = (v) => `${(v * 100).toFixed(0)}%`;
console.log(`${runs} runs, noise ${noise}${guided ? ', guided first season' : ''}`);
console.log('season            crops at dawn  filled at dusk  share  fullest dusk  bench at dawn  hand over bench  budget bound  bare dawns  played  pass  earned/quota');
for (let k = 0; k < K; k++) {
  if (!played[k]) continue;
  const name = `year ${Math.floor(k / 4) + 1} ${SEASON_NAMES[k % 4]}`.padEnd(17);
  const b = bare[k][1] ? pct(bare[k][0] / bare[k][1]) : '-';
  console.log(
    `${name} ${mean(dawnCrops[k]).toFixed(1).padStart(13)}  ${mean(duskFilled[k]).toFixed(1).padStart(14)}  ${pct(mean(duskShare[k])).padStart(5)}  ${mean(peak[k]).toFixed(1).padStart(12)}  ${mean(bench[k]).toFixed(1).padStart(13)}  ${pct(mean(over[k])).padStart(15)}  ${pct(mean(bound[k])).padStart(12)}  ${b.padStart(10)}  ${String(played[k]).padStart(6)}  ${pct(cleared[k] / played[k]).padStart(4)}  ${med(ratio[k]).toFixed(2).padStart(12)}`,
  );
}
const all = (a) => a.flat();
console.log(`all seasons: filled at dusk ${mean(all(duskFilled)).toFixed(1)} (${pct(mean(all(duskShare)))} of the plot), fullest dusk ${mean(all(peak)).toFixed(1)}, hand over the bench at ${pct(mean(all(over)))} of dawns, budget bound on ${pct(mean(all(bound)))} of days`);
console.log(`nights a crop stands, sown to gone: mean ${mean(stays).toFixed(2)}, median ${med(stays)}`);
console.log(`year 1 sowings beside a crop standing since the morning: ${pct(besideOld / Math.max(1, sown))} (${besideOld}/${sown})`);
