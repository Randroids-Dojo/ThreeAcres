// Seedbound balance: the bot plays whole runs and reports how far it gets.
// npx tsx scripts/deck-balance.ts [runs] [noise] [--meta] [--free] [--guided] [--quotas=a,b,c,d] [--year=2.4]
// --guided deals the guided first season's set hands, as a new player gets.
// --meta plays the runs in sequence with unlocks carrying over, like a player would.
// --free sets every quota to 1, to measure what the bot earns season by season.
import { playRun } from '../src/games/deck/bot';
import { newMeta, SEASON_NAMES, TUNING } from '../src/games/deck/rules';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const runs = Number(args[0] ?? 60);
const noise = Number(args[1] ?? 0);
const withMeta = process.argv.includes('--meta');
if (flag('quotas')) TUNING.quotas = flag('quotas')!.split(',').map(Number);
if (flag('year')) TUNING.yearMult = Number(flag('year'));
if (process.argv.includes('--calm')) {
  TUNING.pestChance = [0];
  TUNING.pestSpread = 0;
  TUNING.crowChance = [0];
}
if (flag('energy')) TUNING.energy = Number(flag('energy'));
if (process.argv.includes('--free')) {
  TUNING.quotas = [0.01, 0.01, 0.01, 0.01];
}
console.log(`quotas ${TUNING.quotas.join(', ')}, x${TUNING.yearMult} a year`);
const meta = withMeta ? newMeta() : null;
const t0 = performance.now();
const results = [];
const shopNoise = flag('shop') ? Number(flag('shop')) : undefined;
const guided = process.argv.includes('--guided');
for (let i = 0; i < runs; i++) results.push(playRun(1000 + i * 7919, meta, { noise, seed: 77 + i, shopNoise, guided }));
const ms = performance.now() - t0;

const reach = new Map<number, number>();
const earnedBy = new Map<number, number[]>();
for (const r of results) {
  for (const s of r.seasons) {
    const k = (s.year - 1) * 4 + s.season;
    reach.set(k, (reach.get(k) ?? 0) + 1);
    if (!earnedBy.has(k)) earnedBy.set(k, []);
    earnedBy.get(k)!.push(s.earned / s.quota);
  }
}
console.log(`${runs} runs, noise ${noise}${withMeta ? ', unlocks carry over' : ''}, ${(ms / runs).toFixed(0)} ms a run`);
console.log('season            played  cleared  pass   median earned/quota  median earned  p10 earned');
for (let k = 0; k < 16; k++) {
  const played = reach.get(k) ?? 0;
  if (!played) continue;
  const cleared = results.filter((r) => r.cleared > k).length;
  const ratios = earnedBy.get(k)!.sort((a, b) => a - b);
  const med = ratios[Math.floor(ratios.length / 2)];
  const earned = results.flatMap((r) => r.seasons.filter((s) => (s.year - 1) * 4 + s.season === k).map((s) => s.earned)).sort((a, b) => a - b);
  const medE = earned[Math.floor(earned.length / 2)];
  const p10 = earned[Math.floor(earned.length / 10)];
  const name = `year ${Math.floor(k / 4) + 1} ${SEASON_NAMES[k % 4]}`.padEnd(17);
  console.log(`${name} ${String(played).padStart(6)}  ${String(cleared).padStart(7)}  ${((cleared / played) * 100).toFixed(0).padStart(3)}%   ${process.argv.includes('--free') ? '   -' : med.toFixed(2).padStart(5)}                ${String(medE).padStart(5)}  ${String(p10).padStart(10)}`);
}
for (const y of [1, 2, 3]) {
  const n = results.filter((r) => r.cleared >= y * 4).length;
  console.log(`cleared year ${y}: ${((n / runs) * 100).toFixed(0)}% (${n}/${runs})`);
}
const best = Math.max(...results.map((r) => r.bestHarvest));
console.log(`best single harvest ${best}, median seasons cleared ${results.map((r) => r.cleared).sort((a, b) => a - b)[Math.floor(runs / 2)]}`);
