// Seedbound: do the hazards press, or decide? The decent bot plays the same
// seeds twice, once as shipped and once with no pests and no crows, and this
// prints the clear rates of years 1 and 2 both ways (the gap is what the
// hazards cost), the deaths that came in a season where pests landed on half
// or more of the crops sown (pests landing, counted against sowings), and the
// worst season-on-season drop in take.
// The third playtest's deaths all came after sharp drops (322 to 178 of 290;
// 346 to 252 with pests on 4 of 7 crops). It only uses the bot and the rules'
// public calls, so the same file runs on an older build.
// npx tsx scripts/deck-hazards.ts [runs]
import { botDay, botShop, Dice } from '../src/games/deck/bot';
import { newRun, TUNING } from '../src/games/deck/rules';

const runs = Number(process.argv[2] ?? 120);
const K = 8;

interface Out {
  y1: number;
  y2: number;
  deaths: number;
  pestDeaths: number;
  drops: number[];
}

function play(hazards: boolean): Out {
  const pests = TUNING.pestChance;
  const crows = TUNING.crowChance;
  if (!hazards) {
    TUNING.pestChance = [0];
    TUNING.crowChance = [0];
  }
  const o: Out = { y1: 0, y2: 0, deaths: 0, pestDeaths: 0, drops: [] };
  for (let i = 0; i < runs; i++) {
    const seed = 3000 + i * 7919;
    const opts = { noise: 0.15, seed: 77 + i };
    const { s } = newRun(seed, null);
    const dice = new Dice(opts.seed ^ seed);
    let sown = 0;
    let pested = 0;
    let last = 0;
    for (let guard = 0; guard < 800 && s.phase !== 'over'; guard++) {
      if ((s.year - 1) * 4 + s.season >= K) break;
      if (s.phase === 'shop') {
        botShop(s, opts, dice);
        continue;
      }
      for (const e of botDay(s, opts, dice)) {
        if (e.t === 'plant') sown++;
        if (e.t === 'pest') pested++;
        if (e.t === 'seasonEnd') {
          if (last > 0) o.drops.push(e.earned / last);
          last = e.earned;
          if (!e.cleared) {
            o.deaths++;
            if (pested >= sown / 2) o.pestDeaths++;
          }
          sown = 0;
          pested = 0;
        }
      }
    }
    if (s.stats.seasonsCleared >= 4) o.y1++;
    if (s.stats.seasonsCleared >= 8) o.y2++;
  }
  TUNING.pestChance = pests;
  TUNING.crowChance = crows;
  return o;
}

const pct = (n: number) => `${Math.round((n / runs) * 100)}%`;
const on = play(true);
const off = play(false);
const worst = (d: number[]) => [...d].sort((a, b) => a - b)[Math.floor(d.length * 0.05)] ?? 1;
console.log(`${runs} runs, decent bot, years 1 and 2`);
console.log(`                 clears year 1   clears year 2   worst 5% take on the season before`);
console.log(`hazards on       ${pct(on.y1).padStart(13)}   ${pct(on.y2).padStart(13)}   ${worst(on.drops).toFixed(2).padStart(10)}`);
console.log(`no pests, crows  ${pct(off.y1).padStart(13)}   ${pct(off.y2).padStart(13)}   ${worst(off.drops).toFixed(2).padStart(10)}`);
console.log(`what the hazards cost: ${Math.round(((off.y1 - on.y1) / runs) * 100)} points of year 1, ${Math.round(((off.y2 - on.y2) / runs) * 100)} points of year 2`);
console.log(`deaths in a season with pests on half the crops sown or more: ${on.pestDeaths} of ${on.deaths}`);
