// Seedbound, round 10: the guided spring day by day. For the careful line (no noise) and the decent bot, the take by the
// end of each night and the night the quota was met; with --pair=radish|carrot the day 3 pair is forced one way. The
// tenth playtest met 75 with 80 on night 5, so day 6 had no stakes.
// npx tsx scripts/deck-guided-days.ts [runs] [--pair=radish|carrot] [--quota=n] [--deal=6:a,b,c]
import { botDay, Dice } from '../src/games/deck/bot';
import * as R from '../src/games/deck/rules';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 100);
const pair = process.argv.find((a) => a.startsWith('--pair='))?.split('=')[1];
const q = process.argv.find((a) => a.startsWith('--quota='))?.split('=')[1];
if (q) R.TUNING.guidedQuota = Number(q);
// --deal=6:a,b,c sets a day's deal (checks only).
for (const a of process.argv.filter((x) => x.startsWith('--deal='))) {
  const [d, cards] = a.slice(7).split(':');
  R.GUIDED_DEALS[Number(d) - 1] = cards.split(',') as R.CardId[];
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1] ?? 0;
for (const [name, noise] of [['careful', 0], ['decent', 0.15]] as const) {
  const byDay: number[][] = Array.from({ length: 6 }, () => []);
  const metOn: number[] = [];
  for (let i = 0; i < runs; i++) {
    const seed = 1000 + i * 7919;
    const { s } = R.newRun(seed, null, true);
    const dice = new Dice((77 + i) ^ seed);
    let met = 0;
    for (let d = 0; d < 6 && s.phase === 'day' && s.season === 0; d++) {
      if (pair && s.day === 3) {
        // Drop the other of the pair from the hand, so the bot plants the one asked for.
        const other = pair === 'radish' ? 'carrot' : 'radish';
        const ix = s.hand.map((c, k) => (c.id === other ? k : -1)).filter((k) => k >= 0).pop();
        if (ix !== undefined && (s as { either?: [number, number] }).either) s.hand.splice(ix, 1);
      }
      botDay(s, { noise, seed: 77 + i, guided: true }, dice);
      const log = s.stats.log[0];
      const e = log && s.season !== 0 ? log.earned : s.earned;
      byDay[d].push(e);
      if (!met && e >= (log?.quota ?? s.quota)) met = d + 1;
    }
    metOn.push(met);
  }
  const dist = [0, 1, 2, 3, 4, 5, 6].map((d) => `${d ? `night ${d}` : 'missed'} ${Math.round((metOn.filter((m) => m === d).length / runs) * 100)}%`).filter((x) => !x.endsWith(' 0%')).join(', ');
  console.log(`${name.padEnd(8)} quota ${R.TUNING.guidedQuota}${pair ? `, day 3 ${pair}` : ''}: median take by night ${byDay.map(med).join(', ')}; met on ${dist}`);
}
