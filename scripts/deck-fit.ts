// Seedbound's quota fit against every kind of player at once. `play` runs one
// player through all twelve seasons whatever it takes (a missed season still
// opens the stall: TUNING.noEnd) and writes each run's take per season; `fit`
// then reads those takes and says, for a row of quotas, what share of each
// player's runs meets each season and wins. A take barely depends on the quota
// (only the bot's worth of a scoop reads it), so one play prices nearby rows. Players: the stall policies of the
// strategy table (whole catalogue), and the decent, strict and guided bots of
// deck-seasons (the catalogue a new player has).
// npx tsx scripts/deck-fit.ts play <player> [runs] [--cellarYield=2] [--cellarCap=2] [--newStock=2] [--bees=2] [--tag=-name]
// npx tsx scripts/deck-fit.ts fit [y2 quotas a,b,c,d] [y3 quotas a,b,c,d] [--y1=a,b,c,d] [--tag=-name]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { botDay, botShop, Dice } from '../src/games/deck/bot';
import { newMeta, newRun, TUNING } from '../src/games/deck/rules';
import { ALL, POL } from './deck-policies';

const dir = '/tmp/deck-fit';
mkdirSync(dir, { recursive: true });
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const BOTS: Record<string, { noise: number; guided: boolean }> = { decent: { noise: 0.15, guided: false }, strict: { noise: 0, guided: false }, guided: { noise: 0.15, guided: true } };

interface Run {
  take: number[];
  /** Cold Frame kept at each winter: its quota is 20% lower. */
  cold: boolean[];
}

if (args[0] === 'play') {
  const who = args[1];
  const runs = Number(args[2] ?? 120);
  if (flag('cellarYield')) TUNING.cellarYield = Number(flag('cellarYield'));
  if (flag('cellarCap')) TUNING.cellarCap = Number(flag('cellarCap'));
  if (flag('newStock')) TUNING.newStock = Number(flag('newStock'));
  if (flag('bees')) TUNING.beesTimes = Number(flag('bees'));
  const tag = flag('tag') ?? '';
  // The real quotas stay in play (the bot's worth of a scoop reads them); a missed season just goes on.
  TUNING.noEnd = true;
  const out: Run[] = [];
  for (let i = 0; i < runs; i++) {
    const bot = BOTS[who];
    let s;
    let dice: Dice;
    let shop: (s: Parameters<typeof botShop>[0], d: Dice) => void;
    let o: { noise: number; seed: number; guided: boolean };
    if (bot) {
      const seed = 1000 + i * 7919;
      o = { noise: bot.noise, seed: 77 + i, guided: bot.guided };
      s = newRun(seed, null, bot.guided).s;
      dice = new Dice(o.seed ^ seed);
      shop = (x, d) => botShop(x, o, d);
    } else {
      const meta = newMeta();
      meta.unlocked = [...ALL];
      const seed = 9000 + i * 7919;
      o = { noise: 0.15, seed: 0, guided: false };
      s = newRun(seed, meta, false).s;
      dice = new Dice((131 + i) ^ seed);
      shop = POL[who];
    }
    const r: Run = { take: [], cold: [] };
    for (let g = 0; g < 3000 && s.phase !== 'over'; g++) {
      if ((s.year - 1) * 4 + s.season >= 12) break;
      if (s.phase === 'shop') shop(s, dice);
      else {
        const ev = botDay(s, o, dice);
        const end = ev.find((e) => e.t === 'seasonEnd');
        if (end && end.t === 'seasonEnd') {
          r.take.push(end.earned);
          r.cold.push(s.pages.includes('coldframe'));
        }
      }
    }
    out.push(r);
  }
  writeFileSync(`${dir}/${who}${tag}.json`, JSON.stringify(out));
  console.log(`${who}${tag}: ${runs} runs written`);
} else {
  const row = (s: string | undefined, d: number[]) => (s ? s.split(',').map(Number) : d);
  const q1 = row(flag('y1'), TUNING.quotas);
  const q2 = row(args[1], TUNING.quotas2);
  const q3 = row(args[2], TUNING.quotas3);
  const nice = (q: number) => (q < 100 ? Math.round(q / 5) * 5 : Math.round(q / 10) * 10);
  const tag = flag('tag') ?? '';
  console.log(`quotas: year 1 ${q1.join(', ')}; year 2 ${q2.join(', ')}; year 3 ${q3.join(', ')}`);
  const files = readdirSync(dir).filter((f) => f.endsWith(`${tag}.json`) && (tag || !/-/.test(f)));
  for (const f of files.sort()) {
    const who = f.replace(/\.json$/, '');
    const runs: Run[] = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    const guided = who.startsWith('guided');
    const quota = (k: number, cold: boolean) => {
      const y = Math.floor(k / 4);
      const sea = k % 4;
      let q = [q1, q2, q3][y][sea];
      if (y === 0 && guided) q = sea === 0 ? TUNING.guidedQuota : q * TUNING.firstYear;
      if (y === 1 && guided) q *= TUNING.firstYear;
      if (sea === 3 && cold) q *= 0.8;
      return nice(q);
    };
    const played = new Array(12).fill(0);
    const met = new Array(12).fill(0);
    let wins = 0;
    const years = [0, 0, 0];
    for (const r of runs) {
      let k = 0;
      for (; k < 12 && k < r.take.length; k++) {
        played[k]++;
        if (r.take[k] < quota(k, r.cold[k])) break;
        met[k]++;
      }
      for (const y of [1, 2, 3]) if (k >= y * 4) years[y - 1]++;
      if (k >= 12) wins++;
    }
    const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 0}%`.padStart(4);
    console.log(`${who.padEnd(18)} Y1 ${pct(years[0], runs.length)}  Y2 ${pct(years[1], runs.length)}  wins ${pct(wins, runs.length)}   per season ${played.map((p, k) => pct(met[k], p)).join(' ')}`);
  }
}
