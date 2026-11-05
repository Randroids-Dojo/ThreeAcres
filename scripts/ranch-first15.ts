// Thistledown's first fifteen minutes, measured (round 9: the ninth playtest
// scored them 6 of 10, clear 8 but smooth 6, "lots of walking back and forth,
// and feeder aiming", engaging 5). An eager phone player (scripts/ranch-bot.ts)
// plays a fresh game for 900 real seconds on the real sim and tutor: it walks
// at the stick's speeds by the lanes and the gates, does what the journal says
// the moment it is up, reads the tug like a good thumb and takes a second for
// each tap on a tag. Every frame is recorded as walking, acting (aiming,
// pulling, blowing, at a tag) or idle (nothing it can do), and every new thing
// (a lesson line or its next step, a page of something done, a catch, a sale,
// a build, a meal given, an order, a sleep) is time-stamped. Reported:
//   dead walking: seconds of walking more than 4 s after anything new happened
//   idle: seconds with nothing to do (waiting on fluff, a downy, the clock)
//   lesson gaps: seconds with no lesson line up, and the longest such stretch
//   the longest stretch with nothing new, and where the game had got to
//   (round 10) seconds with the clock held (the late afternoon, the first dusk) and no line on the page
//   (round 10) trips out of the ranch and back, by what the page said as it left, and the repeats: trips
//     for the same line again (the tenth playtest was asked to catch another clover five times, the same
//     23 s round trip each time)
// over several seeds, and the walks that cost most, by lesson.
//   npx tsx scripts/ranch-first15.ts [seeds] [seconds]
import { rng } from '../src/games/ranch/noise';
import { eager, freshGame, type Bot } from './ranch-bot';

const SEEDS = Number(process.argv[2]) || 3;
const SECS = Number(process.argv[3]) || 900;
const DEAD = 4;

interface Run {
  seed: number;
  walk: number;
  dead: number;
  idle: number;
  /** The same, only while a lesson line is up (the guided part, which the game decides; with no lesson, the player's choices do). */
  lessonDead: number;
  lessonIdle: number;
  lessonWalk: number;
  noLesson: number;
  longestGap: number;
  longestQuiet: number;
  quietAt: string;
  news: number;
  learned: string[];
  day: number;
  hour: number;
  coins: number;
  byLesson: Map<string, { walk: number; dead: number; idle: number; act: number }>;
  gaps: { from: number; to: number }[];
  /** Seconds the clock was held with no line up, and with the clock held at all. */
  heldNoLine: number;
  held: number;
  /** Idle seconds with no lesson up, by the journal goal on the page. */
  idleBy: Map<string, number>;
  /** Trips out of the ranch and back: what the page said as it left, and how long each took. */
  trips: { why: string; secs: number; catches: number }[];
}

function play(seed: number): Run {
  const b: Bot = freshGame(seed, rng);
  const frames = Math.round(SECS * 60);
  for (let i = 0; i < frames; i++) {
    eager(b);
    b.frame();
  }
  const news = b.news.map((n) => n.t);
  let k = 0;
  let last = 0;
  let walk = 0;
  let dead = 0;
  let idle = 0;
  let noLesson = 0;
  let lessonDead = 0;
  let lessonIdle = 0;
  let lessonWalk = 0;
  let gapStart = -1;
  let longestGap = 0;
  let longestQuiet = 0;
  let quietAt = '';
  const gaps: { from: number; to: number }[] = [];
  let heldNoLine = 0;
  let held = 0;
  const idleBy = new Map<string, number>();
  const trips: { why: string; secs: number; catches: number }[] = [];
  let tripFrom = -1;
  let tripWhy = '';
  let lastLine = '';
  const catches = b.news.filter((n) => n.what === 'catch').map((n) => n.t);
  const byLesson = new Map<string, { walk: number; dead: number; idle: number; act: number }>();
  for (const f of b.frames) {
    while (k < news.length && news[k] <= f.t) last = news[k++];
    const quiet = f.t - last;
    if (quiet > longestQuiet) {
      longestQuiet = quiet;
      quietAt = `${f.lesson || '(no lesson)'} at ${f.t.toFixed(0)} s`;
    }
    const key = f.lesson || (f.page ? '(page)' : '(journal)');
    const row = byLesson.get(key) ?? { walk: 0, dead: 0, idle: 0, act: 0 };
    const dt = 1 / 60;
    if (f.doing === 'walk') {
      walk += dt;
      row.walk += dt;
      if (f.lesson) lessonWalk += dt;
      if (quiet > DEAD) {
        dead += dt;
        row.dead += dt;
        if (f.lesson) lessonDead += dt;
      }
    } else if (f.doing === 'idle') {
      idle += dt;
      row.idle += dt;
      if (f.lesson) lessonIdle += dt;
    } else row.act += dt;
    byLesson.set(key, row);
    if (!f.lesson && f.doing === 'idle') idleBy.set(f.goal || '(none)', (idleBy.get(f.goal || '(none)') ?? 0) + dt);
    if (f.held) {
      held += dt;
      if (!f.line) heldNoLine += dt;
    }
    if (f.line) lastLine = f.line;
    // A trip: out of the ranch and back in. What the page said as it left (a lesson's line, else the journal's goal).
    if (f.zone !== 'ranch' && tripFrom < 0) {
      tripFrom = f.t;
      // (With no lesson up, the journal's goal: two trips for different goals are not the same trip.)
      tripWhy = f.line || (f.lesson ? lastLine : `(journal: ${f.goal || 'none'})`);
    } else if (f.zone === 'ranch' && tripFrom >= 0) {
      trips.push({ why: tripWhy, secs: f.t - tripFrom, catches: catches.filter((c) => c >= tripFrom && c <= f.t).length });
      tripFrom = -1;
    }
    const lessonUp = !!f.lesson;
    if (!lessonUp) {
      noLesson += dt;
      if (gapStart < 0) gapStart = f.t;
    } else if (gapStart >= 0) {
      gaps.push({ from: gapStart, to: f.t });
      longestGap = Math.max(longestGap, f.t - gapStart);
      gapStart = -1;
    }
  }
  if (gapStart >= 0) {
    gaps.push({ from: gapStart, to: SECS });
    longestGap = Math.max(longestGap, SECS - gapStart);
  }
  const s = b.s;
  return {
    seed,
    walk,
    dead,
    idle,
    lessonDead,
    lessonIdle,
    lessonWalk,
    noLesson,
    longestGap,
    longestQuiet,
    quietAt,
    news: news.length,
    learned: s.learn.filter((w) => w.startsWith('lesson:')).map((w) => w.slice(7)),
    day: s.day,
    hour: s.hour,
    coins: s.coins,
    byLesson,
    gaps,
    heldNoLine,
    held,
    trips,
    idleBy,
  };
}

/** Trips for a line already gone out for once: the repeats, and their seconds. */
function repeats(r: Run): { n: number; secs: number; lines: string[] } {
  const seen = new Map<string, number>();
  let n = 0;
  let secs = 0;
  const lines: string[] = [];
  for (const t of r.trips) {
    const k = seen.get(t.why) ?? 0;
    if (k > 0) {
      n++;
      secs += t.secs;
      if (!lines.includes(t.why)) lines.push(t.why);
    }
    seen.set(t.why, k + 1);
  }
  return { n, secs, lines };
}

console.log(`Thistledown, the first ${SECS} real seconds of a fresh phone game: an eager player, ${SEEDS} seeds (dead walking: walking over ${DEAD} s since anything new)`);
const runs: Run[] = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const r = play(seed * 101);
  runs.push(r);
  const hh = Math.floor(r.hour);
  const mm = String(Math.floor((r.hour % 1) * 60)).padStart(2, '0');
  const rep = repeats(r);
  console.log(`   seed ${r.seed}: clock held ${r.held.toFixed(0)} s, of it with no line ${r.heldNoLine.toFixed(0)} s; ${r.trips.length} trips out (${r.trips.map((t) => `${t.secs.toFixed(0)} s`).join(', ')}), ${rep.n} for a line already gone out for (${rep.secs.toFixed(0)} s: ${rep.lines.map((l) => `"${l}"`).join(', ')})`);
  console.log(`   seed ${r.seed}: under a lesson line: walking ${r.lessonWalk.toFixed(0)} s, of it dead ${r.lessonDead.toFixed(0)} s, idle ${r.lessonIdle.toFixed(0)} s; in all: walking ${r.walk.toFixed(0)} s, of it dead ${r.dead.toFixed(0)} s; idle ${r.idle.toFixed(0)} s; no lesson line ${r.noLesson.toFixed(0)} s (longest ${r.longestGap.toFixed(0)} s); longest with nothing new ${r.longestQuiet.toFixed(0)} s (${r.quietAt}); ${r.news} new things; reached day ${r.day} ${hh}:${mm}, ${r.coins} coins, ${r.learned.length} lessons (last: ${r.learned.slice(-3).join(', ')})`);
}
const mean = (f: (r: Run) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
console.log(`   mean under a lesson line: walking ${mean((r) => r.lessonWalk).toFixed(0)} s, dead walking ${mean((r) => r.lessonDead).toFixed(0)} s, idle ${mean((r) => r.lessonIdle).toFixed(0)} s`);
console.log(`   mean clock held ${mean((r) => r.held).toFixed(0)} s, with no line ${mean((r) => r.heldNoLine).toFixed(0)} s; trips out ${mean((r) => r.trips.length).toFixed(1)}, repeated trips ${mean((r) => repeats(r).n).toFixed(1)} (${mean((r) => repeats(r).secs).toFixed(0)} s)`);
console.log(`   mean in all: walking ${mean((r) => r.walk).toFixed(0)} s, dead walking ${mean((r) => r.dead).toFixed(0)} s, idle ${mean((r) => r.idle).toFixed(0)} s, no lesson line ${mean((r) => r.noLesson).toFixed(0)} s, longest gap ${mean((r) => r.longestGap).toFixed(0)} s, longest quiet ${mean((r) => r.longestQuiet).toFixed(0)} s, ${mean((r) => r.news).toFixed(0)} new things, ${mean((r) => r.learned.length).toFixed(1)} lessons`);
// With no lesson up, the idle seconds by the goal the journal showed (mean a game).
const ib = new Map<string, number>();
for (const r of runs) for (const [k, v] of r.idleBy) ib.set(k, (ib.get(k) ?? 0) + v / runs.length);
console.log(`   idle with no lesson, by the journal's goal (mean seconds a game): ${[...ib].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}`);
// Where the dead walking and the waits went, by lesson (summed over the seeds).
const all = new Map<string, { walk: number; dead: number; idle: number; act: number }>();
for (const r of runs) for (const [k, v] of r.byLesson) {
  const a = all.get(k) ?? { walk: 0, dead: 0, idle: 0, act: 0 };
  a.walk += v.walk / runs.length;
  a.dead += v.dead / runs.length;
  a.idle += v.idle / runs.length;
  a.act += v.act / runs.length;
  all.set(k, a);
}
console.log('   by lesson (mean seconds a game): walking, of it dead, idle, acting');
for (const [k, v] of [...all].sort((a, b) => b[1].dead + b[1].idle - (a[1].dead + a[1].idle))) {
  if (v.walk + v.idle + v.act < 2) continue;
  console.log(`      ${k.padEnd(12)} ${v.walk.toFixed(0).padStart(4)} ${v.dead.toFixed(0).padStart(4)} ${v.idle.toFixed(0).padStart(4)} ${v.act.toFixed(0).padStart(4)}`);
}
