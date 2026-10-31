// Where a season's potential goes, per season index, averaged over bot runs.
// npx tsx scripts/deck-diag.ts [runs]
import { botDay, botShop, Dice } from '../src/games/deck/bot';
import { CARDS, costOf, energyMax, newRun, TUNING } from '../src/games/deck/rules';

if (!process.argv.includes('--real')) TUNING.quotas = [0.01, 0.01, 0.01, 0.01];
const runs = Number(process.argv[2] ?? 20);
type Row = { energy: number; spent: number; harvests: number; score: number; pests: number; crows: number; deck: number; idle: number; water: number; seeds: number; n: number };
const rows: Row[] = [];
for (let r = 0; r < runs; r++) {
  const { s } = newRun(5000 + r, null);
  const dice = new Dice(r + 1);
  let k = 0;
  while (s.phase !== 'over' && k < 12) {
    if (s.phase === 'shop') { botShop(s, { noise: 0, seed: 1 }, dice); continue; }
    const row = (rows[k] ??= { energy: 0, spent: 0, harvests: 0, score: 0, pests: 0, crows: 0, deck: 0, idle: 0, water: 0, seeds: 0, n: 0 });
    if (s.day === 1) { row.n++; row.deck += s.draw.length + s.hand.length + s.discard.length; }
    row.energy += energyMax(s);
    const ev = botDay(s, { noise: 0, seed: 1 }, dice);
    let played = 0;
    for (const e of ev) {
      if (e.t === 'play') { played++; row.spent += costOf(e.card.id, e.card.up); if (CARDS[e.card.id].type === 'seed') row.seeds++; }
      if (e.t === 'water') row.water += e.plots.length;
      if (e.t === 'harvest') { row.harvests++; row.score += e.h.score; }
      if (e.t === 'pest') row.pests++;
      if (e.t === 'crow') row.crows++;
      if (e.t === 'seasonEnd') k++;
    }
    if (!played) row.idle++;
  }
}
console.log('season  deck  energy used  seeds  plots watered  harvests  avg score  season total  pests  crows  idle days');
rows.forEach((r, i) => {
  const n = r.n || 1;
  console.log(`${String(i + 1).padStart(6)}  ${(r.deck / n).toFixed(1).padStart(4)}  ${((r.spent / r.energy) * 100).toFixed(0).padStart(10)}%  ${(r.seeds / n).toFixed(1).padStart(5)}  ${(r.water / n).toFixed(1).padStart(13)}  ${(r.harvests / n).toFixed(1).padStart(8)}  ${(r.score / Math.max(1, r.harvests)).toFixed(1).padStart(9)}  ${(r.score / n).toFixed(0).padStart(12)}  ${(r.pests / n).toFixed(1).padStart(5)}  ${(r.crows / n).toFixed(1).padStart(5)}  ${(r.idle / n).toFixed(1).padStart(9)}`);
});
