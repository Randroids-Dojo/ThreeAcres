// Seedbound, season by season: the bot plays whole runs and this reports, for
// each season of years 1 to 3, the share of runs that met it (of those that
// got there), the crops standing at its first dawn, what its first two nights
// took, and how many coins the runs ended with unspent. It runs the decent bot
// (noise 0.15), the strict bot (0) and the guided first run side by side, so a
// change to the rules reads against all three at once. It only uses the bot
// and the rules' public calls, so the same file runs against an older build.
// Round 5 adds the second run: the decent bot on the first run after the
// guided one (a record of one run finished), whose first spring is softer.
// Round 6: the quota column is the median a season asked (a hitch, Cold Frame
// and the old year 3 scaling move it), and the share of twists the bot took
// as the hitch.
// Round 9: the careful bot (the guided first run played with no noise: the careful line through the guided year), the
// loose bot (a weak player: noise 0.4 and one play deep), and --upto=n to stop after n seasons (--upto=1 for a cheap
// spring clear rate over many seeds).
// Round 11: the novice (deck-players.ts): a careful first-timer on the guided year, reading the previews with no look-ahead
// over days, some weaker placements, the cheapest useful thing at the stall. The eleventh playtest followed every lesson
// and preview and died in the guided summer, 259 of 330, while the bots cleared it. --engine=bees|hot|vines|tall fixes its
// pick. A line of the guided year's clears by engine follows its table.
// npx tsx scripts/deck-seasons.ts [runs] [--only=decent|strict|guided|careful|loose|second|novice|greedy] [--upto=n] [--engine=id]
import { botDay, botShop, Dice } from '../src/games/deck/bot';
import { BOONS, newMeta, newRun, SEASON_NAMES, TUNING, type EngineId } from '../src/games/deck/rules';
import { GREEDY, NOVICE, readerDay, readerShop, type Reader } from './deck-players';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 200);
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const K = Number(process.argv.find((a) => a.startsWith('--upto='))?.split('=')[1] ?? 12);
// --tune=key:value plays any TUNING number; a value in brackets or braces is read as JSON (round 11).
for (const a of process.argv.filter((x) => x.startsWith('--tune='))) {
  const at = a.indexOf(':');
  const v = a.slice(at + 1);
  (TUNING as unknown as Record<string, unknown>)[a.slice(7, at)] = /^[[{]/.test(v) ? JSON.parse(v) : Number(v);
}
const pickEngine = process.argv.find((a) => a.startsWith('--engine='))?.split('=')[1] as EngineId | undefined;
const READ: Record<string, Reader> = { novice: { ...NOVICE, engine: pickEngine ?? 'any' }, greedy: { ...GREEDY, engine: pickEngine ?? 'any' } };

interface Tally {
  played: number[];
  cleared: number[];
  dawn: number[][];
  night1: number[][];
  night2: number[][];
  unspent: number[];
  ratio: number[][];
  take: number[][];
  quota: number[][];
  /** Stalls offering two twists, and those where the bot took the hitch. */
  twists: number;
  hitches: number;
  /** Round 7: seasons played after a hitch and after a help, and those met. */
  after: { hitch: [number, number]; boon: [number, number] };
  slots: number[];
  pages: number[];
  kept: number[];
  /** Different cards the stalls' first trays offered in a run, and tray slots that repeat the stall before. */
  offered: number[];
  repeats: number;
  traySlots: number;
  /** Round 11: by the engine taken, [runs, met the first free season, met the year]. */
  byEngine: Record<string, [number, number, number]>;
}

function play(noise: number, guided: boolean, second = false, depth = 2, reader?: Reader): Tally {
  const t: Tally = {
    played: new Array(K).fill(0),
    cleared: new Array(K).fill(0),
    dawn: Array.from({ length: K }, () => []),
    night1: Array.from({ length: K }, () => []),
    night2: Array.from({ length: K }, () => []),
    unspent: [],
    ratio: Array.from({ length: K }, () => []),
    take: Array.from({ length: K }, () => []),
    quota: Array.from({ length: K }, () => []),
    twists: 0,
    hitches: 0,
    after: { hitch: [0, 0], boon: [0, 0] },
    slots: [],
    pages: [],
    kept: [],
    offered: [],
    repeats: 0,
    traySlots: 0,
    byEngine: {},
  };
  for (let i = 0; i < runs; i++) {
    const seed = 1000 + i * 7919;
    const o = { noise, seed: 77 + i, guided, depth };
    const meta = second ? { ...newMeta(), runs: 1 } : null;
    const { s } = newRun(seed, meta, guided);
    const dice = new Dice(o.seed ^ seed);
    const offered = new Set<string>();
    let last: string[] = [];
    const tray = () => {
      const now = (s.shop?.cards ?? []).map((c) => c.card);
      for (const c of now) offered.add(c);
      t.repeats += now.filter((c) => last.includes(c)).length;
      t.traySlots += now.length;
      last = now;
    };
    for (let guard = 0; guard < 800 && s.phase !== 'over'; guard++) {
      const k = (s.year - 1) * 4 + s.season;
      if (k >= K) break;
      if (s.phase === 'shop') {
        tray();
        const offer = s.shop?.twists ?? [];
        if (reader) readerShop(s, reader, dice);
        else botShop(s, o, dice);
        if (offer.length === 2 && s.twist) {
          t.twists++;
          if (!(BOONS as readonly string[]).includes(s.twist.id)) t.hitches++;
        }
        // Coins left in the purse on leaving the stall that opens year 2 summer and later: what found no use.
        if (k >= 5) t.kept.push(s.coins);
        continue;
      }
      if (s.day === 1) t.dawn[k].push(s.plots.filter((p) => p.crop).length);
      const day = s.day;
      const before = s.earned;
      const ev = reader ? readerDay(s, reader, dice) : botDay(s, o, dice);
      const end = ev.find((e) => e.t === 'seasonEnd');
      const took = end && end.t === 'seasonEnd' ? end.earned - before : s.earned - before;
      if (day === 1) t.night1[k].push(took);
      if (day === 2) t.night2[k].push(took);
      if (end && end.t === 'seasonEnd') {
        t.played[k]++;
        if (end.cleared) t.cleared[k]++;
        t.ratio[k].push(end.earned / end.quota);
        const tw = s.stats.log[s.stats.log.length - 1]?.twist;
        if (tw) {
          const a = t.after[(BOONS as readonly string[]).includes(tw.id) ? 'boon' : 'hitch'];
          a[0]++;
          if (end.cleared) a[1]++;
        }
        t.take[k].push(end.earned);
        t.quota[k].push(end.quota);
      }
    }
    const eng = (s as { engine?: string | null }).engine ?? 'none';
    const be = (t.byEngine[eng] ??= [0, 0, 0]);
    be[0]++;
    if (s.stats.seasonsCleared >= 2) be[1]++;
    if (s.stats.seasonsCleared >= 4) be[2]++;
    t.offered.push(offered.size);
    t.unspent.push(s.coins);
    t.slots.push((s as { slots?: number }).slots ?? 0);
    t.pages.push(s.pages.length);
  }
  return t;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const bots: [string, number, boolean, boolean, number][] = [
  ['novice', 0, true, false, 2],
  ['greedy', 0, false, false, 2],
  ['decent', 0.15, false, false, 2],
  ['strict', 0, false, false, 2],
  ['guided', 0.15, true, false, 2],
  ['careful', 0, true, false, 2],
  ['loose', 0.4, false, false, 1],
  ['second', 0.15, false, true, 2],
];
for (const [name, noise, guided, second, depth] of bots) {
  if (only ? only !== name : name === 'careful' || name === 'loose' || name === 'greedy') continue;
  const t0 = performance.now();
  const reader = READ[name];
  const t = play(noise, guided, second, depth, reader);
  console.log(reader ? `\n${name} player (reads the previews${guided ? ', guided first run' : ''}${pickEngine ? `, ${pickEngine}` : ''}), ${runs} runs, ${((performance.now() - t0) / runs).toFixed(0)} ms a run` : `\n${name} bot (noise ${noise}${depth !== 2 ? `, ${depth} play deep` : ''}${guided ? ', guided first run' : ''}${second ? ', the first run after the guided one' : ''}), ${runs} runs, ${((performance.now() - t0) / runs).toFixed(0)} ms a run`);
  console.log('season            played  pass  quota  median take  earned/quota  crops at first dawn  night 1  night 2');
  for (let k = 0; k < K; k++) {
    if (!t.played[k]) continue;
    const label = `year ${Math.floor(k / 4) + 1} ${SEASON_NAMES[k % 4]}`.padEnd(17);
    console.log(
      `${label} ${String(t.played[k]).padStart(6)}  ${((t.cleared[k] / t.played[k]) * 100).toFixed(0).padStart(3)}%  ${String(med(t.quota[k])).padStart(5)}  ${String(med(t.take[k])).padStart(11)}  ${med(t.ratio[k]).toFixed(2).padStart(12)}  ${mean(t.dawn[k]).toFixed(1).padStart(19)}  ${med(t.night1[k]).toFixed(0).padStart(7)}  ${med(t.night2[k]).toFixed(0).padStart(7)}`,
    );
  }
  for (const y of [1, 2, 3].filter((y) => y * 4 <= K)) {
    const n = t.played[y * 4 - 1] ? t.cleared[y * 4 - 1] : 0;
    console.log(`cleared year ${y}: ${((n / runs) * 100).toFixed(0)}%`);
  }
  const bye = Object.entries(t.byEngine).sort().map(([k, [n, a, b]]) => `${k} ${n} runs: first free season ${Math.round((a / n) * 100)}%, year 1 ${Math.round((b / n) * 100)}%`).join('; ');
  console.log(`by engine: ${bye}`);
  console.log(`coins unspent when the run ends: median ${med(t.unspent)}, mean ${mean(t.unspent).toFixed(0)}, max ${Math.max(...t.unspent)}`);
  console.log(`coins left on leaving a stall from year 2 summer on: median ${med(t.kept)}, p90 ${[...t.kept].sort((a, b) => a - b)[Math.floor(t.kept.length * 0.9)] ?? 0}`);
  console.log(`pages kept at the end: mean ${mean(t.pages).toFixed(1)}, max ${Math.max(...t.pages)}; page slots bought: ${t.slots.filter((n) => n > 0).length} runs, max ${Math.max(...t.slots)}`);
  const pc = ([n, m]: [number, number]) => `${n ? Math.round((m / n) * 100) : 0}% of ${n}`;
  console.log(`twists: the hitch picked at ${t.twists ? Math.round((t.hitches / t.twists) * 100) : 0}% of ${t.twists} stalls; seasons met after the hitch ${pc(t.after.hitch)}, after the help ${pc(t.after.boon)}`);
  console.log(`stall variety: ${mean(t.offered).toFixed(1)} different cards on the stalls' trays in a run (median ${med(t.offered)}); ${((t.repeats / Math.max(1, t.traySlots)) * 100).toFixed(0)}% of tray slots repeat the stall before`);
}
