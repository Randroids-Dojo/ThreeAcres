// Seedbound: does the plot persist? The bot plays whole runs and this counts,
// at every dawn from day 2, how many crops are still standing and how often
// the plot has been wiped bare; how many nights a crop stands; and what share
// of sowings go beside a crop that was already standing that morning
// (placement building on yesterday's plot). With the year 1 and 2 clear rates
// per season, so a change to the board reads against the quotas in one run.
// npx tsx scripts/deck-board.mjs [runs] [noise] [--guided]
import { Dice, botDay, botShop } from '../src/games/deck/bot.ts';
import { neighbours, newRun, SEASON_NAMES } from '../src/games/deck/rules/index.ts';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 120);
const noise = Number(args[1] ?? 0.15);
const guided = process.argv.includes('--guided');
const K = 8;

const dawnCrops = Array.from({ length: K }, () => []);
const bare = Array.from({ length: K }, () => [0, 0]);
const played = new Array(K).fill(0);
const cleared = new Array(K).fill(0);
const ratio = Array.from({ length: K }, () => []);
const stays = [];
let sown = 0;
let besideOld = 0;

for (let i = 0; i < runs; i++) {
  const seed = 1000 + i * 7919;
  const o = { noise, seed: 77 + i };
  const { s } = newRun(seed, null, guided);
  const dice = new Dice(o.seed ^ seed);
  const born = new Map();
  for (let guard = 0; guard < 400 && s.phase !== 'over'; guard++) {
    const k = (s.year - 1) * 4 + s.season;
    if (k >= K) break;
    if (s.phase === 'shop') {
      botShop(s, o, dice);
      continue;
    }
    const day = s.day;
    const standing = new Set(s.plots.map((p, j) => (p.crop ? j : -1)).filter((j) => j >= 0));
    const ev = botDay(s, o, dice);
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
console.log(`${runs} runs, noise ${noise}${guided ? ', guided first season' : ''}`);
console.log('season            crops at dawn  bare dawns  played  pass  median earned/quota');
for (let k = 0; k < K; k++) {
  if (!played[k]) continue;
  const name = `year ${Math.floor(k / 4) + 1} ${SEASON_NAMES[k % 4]}`.padEnd(17);
  const b = bare[k][1] ? `${((bare[k][0] / bare[k][1]) * 100).toFixed(0)}%` : '-';
  console.log(`${name} ${mean(dawnCrops[k]).toFixed(1).padStart(13)}  ${b.padStart(10)}  ${String(played[k]).padStart(6)}  ${((cleared[k] / played[k]) * 100).toFixed(0).padStart(3)}%  ${med(ratio[k]).toFixed(2).padStart(6)}`);
}
console.log(`nights a crop stands, sown to gone: mean ${mean(stays).toFixed(2)}, median ${med(stays)}`);
console.log(`year 1 sowings beside a crop standing since the morning: ${((besideOld / Math.max(1, sown)) * 100).toFixed(0)}% (${besideOld}/${sown})`);
