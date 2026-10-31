// Measured checks for the audio engine. Starts its own Vite on :5250, renders
// the real engine offline in headless Chrome, and checks: peak under the worst
// bursts, RMS and character of every arrangement, latency of every event and
// cue, the gap during clock switches, the step rate limit, instrument tuning,
// the realtime path (unlock, suspend, mood cost) and that nothing throws.
// Writes WAVs and a report to /tmp/acres-audio/.
//
//   node scripts/audio-check.mjs            all checks
//   node scripts/audio-check.mjs arr sfx    only some: arr burst sfx switch step tune live

import { mkdirSync, writeFileSync } from 'node:fs';
import { openPage, startServer } from './audio-lib.mjs';

const OUT = '/tmp/acres-audio';
mkdirSync(OUT, { recursive: true });
const want = new Set(process.argv.slice(2));
const run = (k) => want.size === 0 || want.has(k);

const report = { checks: [], numbers: {} };
let failed = 0;
function check(name, ok, detail) {
  report.checks.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
/** The game's default settings (src/game/save.ts). Mix levels are judged here; bursts at full volume. */
const GAME = { master: 0.8, music: 0.6, sfx: 0.8 };

const server = await startServer();
let browser;
try {
  const opened = await openPage();
  browser = opened.browser;
  const { page, errors } = opened;
  page.setDefaultTimeout(600000);

  // The page starts building the bank in a worker on load; wait for it.
  const t0 = Date.now();
  await page.waitForFunction(() => window.audioDev.bank.ready, null, { timeout: 30000 });
  const bank = await page.evaluate(() => ({ where: window.audioDev.bank.where, mainMs: window.audioDev.bank.spent, mb: window.audioDev.bank.bytes() / 1048576 }));
  report.numbers.bank = { ...bank, readyAfterMs: Date.now() - t0 };
  console.log(`bank built in a ${bank.where} thread, ready ${Date.now() - t0} ms after the page, ${bank.mainMs.toFixed(1)} ms of main-thread synthesis, ${bank.mb.toFixed(1)} MB`);
  check('the bank is built off the main thread', bank.where === 'worker' && bank.mainMs < 1, `${bank.where}, ${bank.mainMs.toFixed(1)} ms on the main thread`);

  /** Render a scenario in the page and bring back analysis and, optionally, the WAV. */
  async function scene(name, sc, analyse, wav = true) {
    const res = await page.evaluate(
      async ({ sc, analyse, wav }) => {
        const d = window.audioDev;
        const A = d.analyse;
        const mood = d.defaultMood();
        const m = sc.mood ?? {};
        const full = { ...mood, ...m, rules: { ...mood.rules, ...(m.rules ?? {}) } };
        const r = await d.render({ ...sc, mood: full });
        const b = r.buffer;
        const out = { ms: r.ms, stats: r.stats, peak: A.peakDb(b) };
        // eslint-disable-next-line no-new-func
        if (analyse) Object.assign(out, new Function('b', 'A', analyse)(b, A));
        if (wav) out.wav = A.wavBase64(b);
        return out;
      },
      { sc, analyse: analyse ?? null, wav },
    );
    if (res.wav) {
      writeFileSync(`${OUT}/${name}.wav`, Buffer.from(res.wav, 'base64'));
      delete res.wav;
    }
    return res;
  }

  // ------------------------------------------------------------ arrangements
  if (run('arr')) {
    console.log('\n# Arrangements (music only, game default volumes, 18 s each, measured from 3 s)');
    const S = ['spring', 'summer', 'autumn', 'winter'];
    const list = [];
    for (let s = 0; s < 4; s++) list.push({ name: `day-${S[s]}`, mood: { season: s, hour: 10, rules: { clock: 'day' } } });
    for (let s = 0; s < 4; s++) list.push({ name: `turns-${S[s]}`, mood: { season: s, hour: 10, rules: { clock: 'turns' } } });
    for (const sp of [0, 1, 2, 4]) list.push({ name: `flow-x${sp}-spring`, mood: { season: 0, hour: 10, speed: sp, rules: { clock: 'flow' } } });
    for (let s = 1; s < 4; s++) list.push({ name: `flow-x1-${S[s]}`, mood: { season: s, hour: 10, speed: 1, rules: { clock: 'flow' } } });
    list.push({ name: 'evening-day-spring', mood: { season: 0, hour: 20.5, rules: { clock: 'day' } } });
    list.push({ name: 'night-day-spring', mood: { season: 0, hour: 23.5, rules: { clock: 'day' } } });
    list.push({ name: 'night-turns-summer', mood: { season: 1, hour: 23.5, rules: { clock: 'turns' } } });
    list.push({ name: 'night-flow-autumn', mood: { season: 2, hour: 23.5, speed: 1, rules: { clock: 'flow' } } });
    list.push({ name: 'title', mood: { scene: 'title', season: 0, hour: 9 } });
    list.push({ name: 'menu-day-spring', mood: { scene: 'menu', season: 0, hour: 10, rules: { clock: 'day' } } });
    const rows = {};
    for (const it of list) {
      const r = await scene(`music-${it.name}`, { dur: 18, mood: it.mood, mute: ['ambience'], volumes: GAME },
        `return { rms: A.rmsDb(b, 3), peak3: A.peakDb(b, 3), ch: A.character(b, 3, 18) };`);
      rows[it.name] = { rms: r.rms, peak: r.peak, centroid: r.ch.centroid, onsets: r.ch.onsets, crest: r.ch.crest, bands: r.ch.bands, chroma: r.ch.chroma, notes: r.stats.notes, maxVoices: r.stats.maxVoices.music, renderMs: r.ms };
      console.log(`${it.name.padEnd(20)} RMS ${f1(r.rms)} dBFS  peak ${f1(r.peak)}  centroid ${Math.round(r.ch.centroid)} Hz  onsets ${f1(r.ch.onsets)}/s  notes ${r.stats.notes}  voices<=${r.stats.maxVoices.music}  bands% ${r.ch.bands.join(' ')}`);
    }
    report.numbers.arrangements = rows;
    const daytime = Object.entries(rows).filter(([k]) => !k.startsWith('night') && !k.startsWith('menu') && k !== 'flow-x0-spring' && !k.startsWith('evening'));
    for (const [k, v] of daytime) check(`arrangement ${k} RMS in -30..-18 dBFS at game volumes`, v.rms > -30 && v.rms < -18, `${f1(v.rms)} dBFS`);
    for (const [k, v] of Object.entries(rows)) check(`arrangement ${k} peak below -3 dBFS`, v.peak < -3, `${f1(v.peak)} dBFS`);
    check('paused flow is a soft pad, 4 dB or more under flow x1', rows['flow-x0-spring'].rms < rows['flow-x1-spring'].rms - 4 && rows['flow-x0-spring'].rms > -45,
      `${f1(rows['flow-x0-spring'].rms)} vs ${f1(rows['flow-x1-spring'].rms)}`);
    check('flow gets busier with speed (onsets x1 < x2 < x4)', rows['flow-x1-spring'].onsets < rows['flow-x2-spring'].onsets && rows['flow-x2-spring'].onsets < rows['flow-x4-spring'].onsets,
      `${f1(rows['flow-x1-spring'].onsets)} < ${f1(rows['flow-x2-spring'].onsets)} < ${f1(rows['flow-x4-spring'].onsets)}`);
    check('flow gets louder with speed (RMS x1 < x4)', rows['flow-x1-spring'].rms < rows['flow-x4-spring'].rms, `${f1(rows['flow-x1-spring'].rms)} < ${f1(rows['flow-x4-spring'].rms)}`);
    check('turns is sparser than day and flow', rows['turns-spring'].onsets < rows['day-spring'].onsets && rows['turns-spring'].onsets < rows['flow-x1-spring'].onsets,
      `${f1(rows['turns-spring'].onsets)} vs ${f1(rows['day-spring'].onsets)}, ${f1(rows['flow-x1-spring'].onsets)}`);
    check('night thins towards a lullaby (quieter and sparser than day)', rows['night-day-spring'].rms < rows['day-spring'].rms - 2 && rows['night-day-spring'].onsets < rows['day-spring'].onsets,
      `${f1(rows['night-day-spring'].rms)} vs ${f1(rows['day-spring'].rms)} dBFS`);
    check('winter is sparser than spring (day clock)', rows['day-winter'].onsets < rows['day-spring'].onsets, `${f1(rows['day-winter'].onsets)} vs ${f1(rows['day-spring'].onsets)} onsets/s`);
    check('menu ducks the music by 3 dB or more', rows['menu-day-spring'].rms < rows['day-spring'].rms - 3, `${f1(rows['menu-day-spring'].rms)} vs ${f1(rows['day-spring'].rms)}`);
    // Clearly different: spectral shape (band energy in dB) or busyness.
    const dist = (a, b) => {
      const x = rows[a].bands.map((v) => 10 * Math.log10(v + 0.1));
      const y = rows[b].bands.map((v) => 10 * Math.log10(v + 0.1));
      const band = x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / x.length;
      const busy = Math.max(rows[a].onsets, rows[b].onsets) / Math.max(0.1, Math.min(rows[a].onsets, rows[b].onsets));
      // Harmony: 1 minus the cosine similarity of the pitch-class profiles.
      const ca = rows[a].chroma;
      const cb = rows[b].chroma;
      const dot = ca.reduce((s2, v, i) => s2 + v * cb[i], 0);
      const chroma = 1 - dot / (Math.hypot(...ca) * Math.hypot(...cb));
      return { band, busy, centroid: Math.abs(rows[a].centroid - rows[b].centroid), chroma };
    };
    for (const [a, b] of [['day-spring', 'turns-spring'], ['day-spring', 'flow-x1-spring'], ['turns-spring', 'flow-x1-spring'], ['day-spring', 'title']]) {
      const d = dist(a, b);
      check(`${a} and ${b} are clearly different`, d.band > 1.5 || d.busy > 1.35 || d.centroid > 250, `band diff ${f1(d.band)} dB, busy x${d.busy.toFixed(2)}, centroid diff ${Math.round(d.centroid)} Hz, harmony diff ${d.chroma.toFixed(2)}`);
    }
    const seasons = ['day-spring', 'day-summer', 'day-autumn', 'day-winter'];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const d = dist(seasons[i], seasons[j]);
      check(`${seasons[i]} and ${seasons[j]} differ`, d.band > 1 || d.busy > 1.2 || d.centroid > 150 || d.chroma > 0.08,
        `band diff ${f1(d.band)} dB, busy x${d.busy.toFixed(2)}, centroid diff ${Math.round(d.centroid)} Hz, harmony diff ${d.chroma.toFixed(2)}`);
    }

    // Ambience scenes, full mix, for listening.
    console.log('\n# Ambience scenes (full mix)');
    const amb = [
      { name: 'morning-birds-spring', mood: { season: 0, hour: 6.6, weather: 'sun' } },
      { name: 'night-crickets-frogs-summer', mood: { season: 1, hour: 22, weather: 'sun' } },
      { name: 'rain-spring', mood: { season: 0, hour: 12, weather: 'rain' } },
      { name: 'storm-autumn', mood: { season: 2, hour: 14, weather: 'storm' }, actions: [{ t: 4, event: { type: 'thunder' } }] },
      { name: 'heat-cicadas-summer', mood: { season: 1, hour: 14, weather: 'heat' } },
      { name: 'wind-autumn', mood: { season: 2, hour: 12, weather: 'cloud' } },
      { name: 'winter-day', mood: { season: 3, hour: 11, weather: 'sun' } },
    ];
    const ambRows = {};
    for (const it of amb) {
      const music = await scene(`ambience-${it.name}`, { dur: 14, mood: it.mood, mute: ['music'], volumes: GAME }, `return { rms: A.rmsDb(b, 2) };`, false);
      const mixr = await scene(`mix-${it.name}`, { dur: 14, mood: it.mood, actions: it.actions, volumes: GAME }, `return { rms: A.rmsDb(b, 2) };`);
      ambRows[it.name] = { ambienceRms: music.rms, mixRms: mixr.rms, mixPeak: mixr.peak, shots: music.stats.ambienceShots, loops: music.stats.loops };
      console.log(`${it.name.padEnd(28)} ambience RMS ${f1(music.rms)} dBFS  full mix RMS ${f1(mixr.rms)} peak ${f1(mixr.peak)}  one-shots ${music.stats.ambienceShots}`);
      check(`ambience ${it.name} audible but under the music`, music.rms > -60 && music.rms < mixr.rms - 3, `${f1(music.rms)} dBFS against a full mix of ${f1(mixr.rms)}`);
      check(`mix ${it.name} peak below -1 dBFS`, mixr.peak < -1, `${f1(mixr.peak)} dBFS`);
    }
    report.numbers.ambience = ambRows;
  }

  // ------------------------------------------------------------ worst bursts
  if (run('burst')) {
    console.log('\n# Worst bursts (every volume at full)');
    const acts = [{ t: 3, event: { type: 'thunder' } }, { t: 3, event: { type: 'dawn', day: 2, weather: 'storm', season: 1 } }];
    for (let k = 0; k < 60; k++) acts.push({ t: 3, event: { type: 'grow', x: 2 + (k % 14), y: 5 + (k % 8), crop: 'carrot', stage: 2 } });
    for (let k = 0; k < 30; k++) acts.push({ t: 3, event: { type: 'sprinkle', x: 2 + (k % 14), y: 5 + (k % 8) } });
    for (let k = 0; k < 120; k++) acts.push({ t: 3 + k * 0.025, event: { type: 'harvest', x: 2 + (k % 14), y: 7, crop: 'pumpkin', quality: k % 4, by: 1 + (k % 4) } });
    for (let k = 0; k < 120; k++) acts.push({ t: 3 + k * 0.025, event: { type: k % 2 ? 'water' : 'till', x: 3 + (k % 12), y: 8, by: 1 + (k % 4) } });
    for (let k = 0; k < 40; k++) acts.push({ t: 3.5 + k * 0.05, event: { type: 'coins', amount: 50 + k * 30 } });
    for (let k = 0; k < 40; k++) acts.push({ t: 3 + k * 0.05, event: { type: 'sell', crop: 'corn', n: 3, value: 330 } });
    acts.push({ t: 3.2, event: { type: 'milestone', id: 'm' } }, { t: 3.3, event: { type: 'goal', id: 'g' } }, { t: 3.4, event: { type: 'season', season: 1, round: 2 } });
    const mood = { season: 1, hour: 9, weather: 'storm', rules: { clock: 'day', camera: 'wide' } };
    const a = await scene('burst-worst-case', { dur: 9, mood, actions: acts }, `return { rmsBurst: A.rmsDb(b, 3, 5), peakBurst: A.peakDb(b, 3, 6) };`);
    const raw = await scene('burst-worst-case-no-clipper', { dur: 9, mood, actions: acts, noClipper: true }, `return { peakBurst: A.peakDb(b, 3, 6) };`, false);
    console.log(`with clipper: peak ${f1(a.peak)} dBFS, burst RMS ${f1(a.rmsBurst)} dBFS; before the clipper: peak ${f1(raw.peak)} dBFS`);
    console.log(`plays ${JSON.stringify(a.stats.started)}\ndrops ${JSON.stringify(a.stats.dropped)}\nmax voices ${JSON.stringify(a.stats.maxVoices)}`);
    check('worst burst peak below -1 dBFS', a.peak < -1, `${f1(a.peak)} dBFS`);
    check('worst burst at full volume barely needs the clipper (peak before it below +1 dBFS)', raw.peak < 1, `${f1(raw.peak)} dBFS before the soft clipper`);
    check('burst voices stay capped (sfx 60 or fewer)', a.stats.maxVoices.sfx <= 60, `${a.stats.maxVoices.sfx} sfx voices at most`);
    check('60 grow events become a short cascade, not 60 sounds', (a.stats.started.grow ?? 0) <= 14, `${a.stats.started.grow} played, ${a.stats.dropped.grow} dropped`);
    check('30 sprinkle events aggregate to a handful', (a.stats.started.sprinkle ?? 0) <= 6, `${a.stats.started.sprinkle} played`);
    report.numbers.burst = { peak: a.peak, peakBeforeClipper: raw.peak, rmsBurst: a.rmsBurst, started: a.stats.started, dropped: a.stats.dropped, maxVoices: a.stats.maxVoices };

    // Everything at once at full volume, twice over.
    const all = await page.evaluate(() => Object.values(window.audioDev.sampleEvents()));
    const acts2 = [];
    for (const rep of [0, 1]) for (const e of all) acts2.push({ t: 2 + rep * 0.01, event: e });
    for (const c of await page.evaluate(() => window.audioDev.cues)) acts2.push({ t: 2, ui: c });
    const b2 = await scene('burst-every-event-at-once', { dur: 7, mood: { weather: 'storm', season: 2 }, actions: acts2 });
    const b2raw = await scene('burst-every-event-at-once-raw', { dur: 7, mood: { weather: 'storm', season: 2 }, actions: acts2, noClipper: true }, null, false);
    check('every event and cue at once: peak below -1 dBFS', b2.peak < -1, `${f1(b2.peak)} dBFS, ${f1(b2raw.peak)} before the clipper`);
    report.numbers.everyEventAtOnce = { peak: b2.peak, peakBeforeClipper: b2raw.peak };

    // Hands at 4x: harvest, water and steps from four hands for 6 s, with music.
    const acts3 = [];
    for (let k = 0; k < 300; k++) {
      const by = 2 + (k % 4);
      const types = ['harvest', 'water', 'step', 'plant', 'till'];
      const type = types[k % 5];
      const e = type === 'step' ? { type, by, x: 4 + by * 2, y: 7, ground: 'path' } : type === 'harvest' ? { type, x: 4 + by * 2, y: 7, crop: 'radish', quality: k % 4, by } : type === 'plant' ? { type, x: 4 + by * 2, y: 7, crop: 'radish', by } : { type, x: 4 + by * 2, y: 7, by };
      acts3.push({ t: 1 + k * 0.02, event: e });
    }
    const h = await scene('hands-4x-stream', { dur: 8, mood: { speed: 4, rules: { clock: 'flow', camera: 'wide', crew: 'crew' } }, actions: acts3 },
      `return { rmsStream: A.rmsDb(b, 1, 7) };`);
    console.log(`hands at 4x: peak ${f1(h.peak)} dBFS, RMS ${f1(h.rmsStream)}, plays ${JSON.stringify(h.stats.started)}, max sfx voices ${h.stats.maxVoices.sfx}`);
    check('hands at 4x: peak below -1 dBFS', h.peak < -1, `${f1(h.peak)} dBFS`);
    check('hands at 4x: sfx voices stay capped', h.stats.maxVoices.sfx <= 34, `${h.stats.maxVoices.sfx}`);
    report.numbers.hands4x = { peak: h.peak, rms: h.rmsStream, started: h.stats.started, dropped: h.stats.dropped, maxVoices: h.stats.maxVoices };
  }

  // ------------------------------------------------------------ latency and the effects sheet
  if (run('sfx')) {
    console.log('\n# Every event and cue: latency to sound (music and ambience muted)');
    const items = await page.evaluate(() => {
      const d = window.audioDev;
      const ev = d.sampleEvents();
      const out = [];
      for (const [k, e] of Object.entries(ev)) out.push({ name: k, event: e });
      out.push({ name: 'dawn (turns)', event: ev.dawn, clock: 'turns' });
      out.push({ name: 'dawn (flow)', event: ev.dawn, clock: 'flow' });
      out.push({ name: 'harvest (star)', event: d.sampleEvents({ quality: 3 }).harvest });
      out.push({ name: 'harvest (hand)', event: d.sampleEvents({ by: 2 }).harvest });
      out.push({ name: 'order (expired)', event: d.sampleEvents({ done: false }).order });
      out.push({ name: 'coins (900)', event: d.sampleEvents({ amount: 900 }).coins });
      for (const g of ['field', 'path', 'yard', 'wood', 'water']) out.push({ name: `step (${g})`, event: d.sampleEvents({ ground: g }).step });
      for (const s of [1, 2, 3]) out.push({ name: `season (${['', 'summer', 'autumn', 'winter'][s]})`, event: d.sampleEvents({ season: s }).season });
      out.push({ name: 'build (sprinkler)', event: d.sampleEvents({ kind: 'sprinkler' }).build });
      for (const c of d.cues) out.push({ name: `ui ${c}`, ui: c });
      return out;
    });
    const gap = 1.8;
    const acts = [];
    const index = [];
    items.forEach((it, k) => {
      const t = 0.6 + k * gap;
      acts.push({ t: t - 0.3, mood: { rules: { clock: it.clock ?? 'day' } } });
      acts.push(it.ui ? { t, ui: it.ui } : { t, event: it.event });
      index.push({ name: it.name, t });
    });
    const dur = 0.6 + items.length * gap + 1;
    const times = index.map((x) => x.t);
    const res = await scene('sfx-sheet', { dur, mood: { season: 0, hour: 12, weather: 'sun' }, actions: acts, mute: ['music', 'ambience'], volumes: GAME },
      `const t = ${JSON.stringify(times)}; return { lat: t.map((x) => A.onsetAfter(b, x, -50, 0.5)), peaks: t.map((x) => A.peakDb(b, x, x + 1.7)), base: t.map((x) => A.rmsDb(b, x - 0.25, x - 0.02)) };`);
    writeFileSync(`${OUT}/sfx-sheet.txt`, index.map((x) => `${x.t.toFixed(2)} s  ${x.name}`).join('\n') + '\n');
    const lat = {};
    let worst = 0;
    index.forEach((x, k) => {
      const l = res.lat[k];
      lat[x.name] = { latencyMs: Number.isFinite(l) ? Math.round(l * 1000) : null, peak: Number(res.peaks[k].toFixed(1)), before: Number(res.base[k].toFixed(1)) };
      if (Number.isFinite(l)) worst = Math.max(worst, l);
      console.log(`${x.name.padEnd(20)} ${Number.isFinite(l) ? `${Math.round(l * 1000)} ms`.padStart(7) : '  never'}  peak ${f1(res.peaks[k])} dBFS`);
      check(`${x.name} sounds within 100 ms`, Number.isFinite(l) && l < 0.1, Number.isFinite(l) ? `${Math.round(l * 1000)} ms` : 'silent');
      check(`${x.name} is not too loud (peak below -4 dBFS at game volumes)`, res.peaks[k] < -4, `${f1(res.peaks[k])} dBFS`);
    });
    report.numbers.latency = lat;
    report.numbers.worstLatencyMs = Math.round(worst * 1000);
    console.log(`worst latency ${Math.round(worst * 1000)} ms; sheet index in ${OUT}/sfx-sheet.txt`);
  }

  // ------------------------------------------------------------ clock switches
  if (run('switch')) {
    console.log('\n# Clock switches: longest quiet run (10 ms windows under -55 dBFS) from the switch to 3 s after');
    const results = [];
    for (const season of [0, 1, 2, 3]) {
      const seq = [
        [4.13, { rules: { clock: 'turns' } }, 'day to turns'],
        [8.71, { rules: { clock: 'flow' }, speed: 1 }, 'turns to flow'],
        [13.37, { rules: { clock: 'day' } }, 'flow to day'],
        [17.9, { rules: { clock: 'flow' }, speed: 4 }, 'day to flow x4'],
        [22.22, { rules: { clock: 'turns' } }, 'flow x4 to turns'],
        [26.6, { rules: { clock: 'flow' }, speed: 0 }, 'turns to paused flow'],
        [30.05, { speed: 2 }, 'unpause to x2'],
        [33.4, { scene: 'title' }, 'farm to title'],
        [36.8, { scene: 'farm', rules: { clock: 'day' } }, 'title to day'],
      ];
      const acts = seq.map(([t, mood]) => ({ t, mood }));
      const ts = seq.map((x) => x[0]);
      const r = await scene(`switches-${['spring', 'summer', 'autumn', 'winter'][season]}`, { dur: 40, mood: { season, hour: 10, rules: { clock: 'day' } }, actions: acts, mute: ['ambience'], volumes: GAME },
        `const ts = ${JSON.stringify(ts)}; return { quiet: ts.map((t) => A.longestQuiet(b, t, t + 3, -55)), dip: ts.map((t) => { const w = A.windows(b, 0.1, t, t + 2.5); return Math.min(...w) - A.rmsDb(b, t - 2.5, t); }), steady: A.longestQuiet(b, 1, 40, -55) };`);
      seq.forEach(([t, , name], k) => {
        results.push({ season, name, quietMs: Math.round(r.quiet[k] * 1000), dipDb: Number(r.dip[k].toFixed(1)) });
        check(`season ${season} ${name}: no silence over 150 ms`, r.quiet[k] <= 0.15, `longest quiet ${Math.round(r.quiet[k] * 1000)} ms, deepest 100 ms dip ${f1(r.dip[k])} dB`);
      });
      console.log(`season ${season}: longest quiet anywhere in 40 s: ${Math.round(r.steady * 1000)} ms`);
    }
    report.numbers.switches = results;
    report.numbers.worstSwitchGapMs = Math.max(...results.map((x) => x.quietMs));
  }

  // ------------------------------------------------------------ step rate limit
  if (run('step')) {
    console.log('\n# Step rate limit');
    const acts = [];
    for (let k = 0; k < 200; k++) acts.push({ t: 0.5 + k * 0.01, event: { type: 'step', by: 1, x: 10, y: 8, ground: 'path' } });
    for (let k = 0; k < 800; k++) acts.push({ t: 0.5 + k * 0.0025, event: { type: 'step', by: 2 + (k % 3), x: 5, y: 8, ground: 'grass' } });
    const r = await scene('steps-flood', { dur: 3, mood: {}, actions: acts, mute: ['music', 'ambience'] }, `return { onsets: A.character(b, 0.4, 2.6).onsets };`, false);
    const played = r.stats.started.step ?? 0;
    // 2 s of flooding: farmer at most every 0.1 s, all hands together at most every 0.12 s.
    const limit = Math.floor(2 / 0.1) + 1 + Math.floor(2 / 0.12) + 1;
    console.log(`1000 step events in 2 s: ${played} played, ${r.stats.dropped.step} dropped (limit ${limit})`);
    check('step flood holds the rate limit', played <= limit, `${played} played of 1000, limit ${limit}`);
    const walk = [];
    for (let k = 0; k < 23; k++) walk.push({ t: 0.5 + k * (0.55 / 4.2), event: { type: 'step', by: 1, x: 10, y: 8, ground: 'grass' } });
    const w = await scene('steps-walk', { dur: 4, mood: {}, actions: walk, mute: ['music', 'ambience'] }, null, false);
    check('a normal walk (7.6 steps a second) plays every step', (w.stats.started.step ?? 0) === 23, `${w.stats.started.step} of 23`);
    report.numbers.steps = { flood: { played, dropped: r.stats.dropped.step, limit }, walk: w.stats.started.step };
  }

  // ------------------------------------------------------------ tuning
  if (run('tune')) {
    console.log('\n# Instrument tuning (strongest partial near the target, fine DFT scan)');
    const tune = await page.evaluate(async () => {
      const bank = window.audioDev.bank;
      const out = [];
      const plan = { guitar: [40, 52, 64, 69], banjo: [62, 69, 76], bass: [33, 40, 45], fiddle: [64, 74, 81], marimba: [55, 67, 79], celesta: [72, 79, 86], musicbox: [76, 84, 91], piano: [48, 60, 72], bell: [72, 79], pad: [50, 57, 64] };
      for (const [inst, notes] of Object.entries(plan)) {
        for (const m of notes) {
          const s = bank.note(inst, m);
          const sr = 48000;
          const ctx = new OfflineAudioContext(1, sr, sr);
          const src = ctx.createBufferSource();
          src.buffer = s.buf;
          src.playbackRate.value = s.rate;
          src.loop = inst === 'pad';
          src.connect(ctx.destination);
          src.start(0);
          const b = await ctx.startRendering();
          const want = 440 * Math.pow(2, (m - 69) / 12);
          const hz = window.audioDev.analyse.pitchNear(b.getChannelData(0), sr, want, 0.2, 0.4);
          out.push({ inst, m, want, hz, cents: 1200 * Math.log2(hz / want) });
        }
      }
      return out;
    });
    let worst = 0;
    for (const t of tune) {
      worst = Math.max(worst, Math.abs(t.cents));
      check(`${t.inst} ${t.m} in tune within 5 cents`, Math.abs(t.cents) < 5, `${t.hz.toFixed(2)} Hz, want ${t.want.toFixed(2)}, ${t.cents.toFixed(1)} cents`);
    }
    report.numbers.worstTuningCents = Number(worst.toFixed(1));

    // Each instrument alone: an arpeggio for listening, and checks on every multisample.
    const sheet = await page.evaluate(async () => {
      const d = window.audioDev;
      const bank = d.bank;
      const plan = { guitar: 52, banjo: 64, bass: 36, fiddle: 69, marimba: 64, celesta: 76, musicbox: 79, piano: 57, bell: 76, pad: 57 };
      const sr = 44100;
      const names = Object.keys(plan);
      const per = 3.2;
      const ctx = new OfflineAudioContext(2, Math.round(sr * per * names.length), sr);
      const index = [];
      names.forEach((inst, k) => {
        const t0 = k * per;
        index.push({ inst, t: t0 });
        [0, 4, 7, 12, 7, 4, 0].forEach((iv, j) => {
          const s = bank.note(inst, plan[inst] + iv);
          const src = ctx.createBufferSource();
          src.buffer = s.buf;
          src.playbackRate.value = s.rate;
          src.loop = inst === 'pad';
          const g = ctx.createGain();
          const t = t0 + j * 0.3;
          const len = j === 6 ? 1.2 : 0.3;
          g.gain.setValueAtTime(0.5, t);
          g.gain.setTargetAtTime(0, t + len, 0.05);
          src.connect(g).connect(ctx.destination);
          src.start(t);
          src.stop(t + len + 0.4);
        });
      });
      const b = await ctx.startRendering();
      // Per multisample: DC offset, peak, and how long until -40 dB.
      const samples = [];
      for (const inst of names) {
        for (let m = 24; m <= 100; m++) {
          const s = bank.note(inst, m);
          if (!s || samples.some((x) => x.inst === inst && x.buf === s.buf)) continue;
          const c = s.buf.getChannelData(0);
          let sum = 0;
          let pk = 0;
          for (const v of c) {
            sum += v;
            pk = Math.max(pk, Math.abs(v));
          }
          let last = 0;
          for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) > pk * 0.01) last = i;
          samples.push({ inst, buf: s.buf, dc: sum / c.length, peak: pk, ring: last / s.buf.sampleRate, len: s.buf.duration, startAbs: Math.abs(c[0]), endAbs: Math.abs(c[c.length - 1]) });
        }
      }
      return { wav: d.analyse.wavBase64(b), index, samples: samples.map(({ buf, ...x }) => x) };
    });
    writeFileSync(`${OUT}/instruments.wav`, Buffer.from(sheet.wav, 'base64'));
    writeFileSync(`${OUT}/instruments.txt`, sheet.index.map((x) => `${x.t.toFixed(1)} s  ${x.inst}`).join('\n') + '\n');
    for (const x of sheet.samples) {
      const loop = x.inst === 'pad';
      check(`${x.inst} sample: no DC, clean edges`, Math.abs(x.dc) < 0.01 && (loop || (x.startAbs < 0.05 && x.endAbs < 0.001)),
        `dc ${x.dc.toFixed(4)}, starts at ${x.startAbs.toFixed(3)}, ends at ${x.endAbs.toFixed(4)}, rings ${x.ring.toFixed(2)} of ${x.len.toFixed(2)} s`);
    }
  }

  // ------------------------------------------------------------ realtime
  if (run('live')) {
    console.log('\n# Realtime: unlock on a click, music plays, suspend and resume, mood cost');
    const before = await page.evaluate(() => !!window.audioDev.core());
    check('no audio context before the first gesture', !before);
    await page.mouse.click(30, 30);
    await page.waitForFunction(() => window.audioDev.core()?.ctx.state === 'running', null, { timeout: 5000 });
    for (let k = 0; k < 20; k++) await page.mouse.click(40 + k, 40);
    await page.keyboard.press('Shift');
    const same = await page.evaluate(() => {
      const c = window.audioDev.core();
      window.audioDev.engine.unlock();
      window.audioDev.engine.unlock();
      return c === window.audioDev.core() && c.ctx.state;
    });
    check('unlock is idempotent (one context after many taps and keys)', same === 'running', String(same));
    const sample = async (ms) => page.evaluate(async (ms) => {
      const an = window.audioDev.core().analyser;
      const td = new Float32Array(an.fftSize);
      let peak = 0;
      let sum = 0;
      let n = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        an.getFloatTimeDomainData(td);
        for (const v of td) {
          peak = Math.max(peak, Math.abs(v));
          sum += v * v;
          n++;
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      return { peak: 20 * Math.log10(peak + 1e-9), rms: 10 * Math.log10(sum / Math.max(1, n) + 1e-18) };
    }, ms);
    const live = await sample(3000);
    console.log(`live music: RMS ${f1(live.rms)} dBFS, peak ${f1(live.peak)} dBFS`);
    check('live music is playing after unlock', live.rms > -40, `${f1(live.rms)} dBFS`);
    // Fire a live burst through the real engine.
    await page.evaluate(() => {
      const d = window.audioDev;
      for (let k = 0; k < 60; k++) d.engine.event({ type: 'grow', x: 3, y: 6, crop: 'carrot', stage: 2 }, d.state);
      for (let k = 0; k < 30; k++) d.engine.event({ type: 'sprinkle', x: 3, y: 6 }, d.state);
      d.engine.event({ type: 'thunder' }, d.state);
      for (const c of d.cues) d.engine.ui(c);
    });
    const burst = await sample(1500);
    check('live burst peak below -1 dBFS', burst.peak < -1, `${f1(burst.peak)} dBFS`);
    // Latency through the live graph: from the call to the analyser seeing it, music muted.
    const liveLat = await page.evaluate(async () => {
      const d = window.audioDev;
      d.engine.setVolumes({ master: 1, music: 0, sfx: 1 });
      d.mood.weather = 'sun';
      d.mood.hour = 12;
      d.mood.season = 3;
      await new Promise((r) => setTimeout(r, 1500));
      const an = d.core().analyser;
      const td = new Float32Array(256);
      const res = [];
      for (const c of ['tap', 'deny', 'toggle']) {
        await new Promise((r) => setTimeout(r, 600));
        const ctx = d.core().ctx;
        const t0 = ctx.currentTime;
        d.engine.ui(c);
        let seen = -1;
        const w0 = performance.now();
        while (performance.now() - w0 < 400) {
          an.getFloatTimeDomainData(td);
          let p = 0;
          for (const v of td) p = Math.max(p, Math.abs(v));
          if (p > 0.003) {
            seen = ctx.currentTime - t0;
            break;
          }
          await new Promise((r) => setTimeout(r, 2));
        }
        res.push({ cue: c, ms: seen < 0 ? null : Math.round(seen * 1000) });
      }
      d.engine.setVolumes({ master: 1, music: 1, sfx: 1 });
      return res;
    });
    for (const l of liveLat) check(`live ${l.cue} reaches the output within 100 ms of context time`, l.ms !== null && l.ms <= 100, l.ms === null ? 'never' : `${l.ms} ms`);
    report.numbers.liveLatencyMs = liveLat;
    // Suspend and resume.
    const sus = await page.evaluate(async () => {
      const d = window.audioDev;
      d.engine.suspend(true);
      await new Promise((r) => setTimeout(r, 300));
      const a = d.core().ctx.state;
      const t1 = d.core().ctx.currentTime;
      await new Promise((r) => setTimeout(r, 300));
      const t2 = d.core().ctx.currentTime;
      d.engine.event({ type: 'harvest', x: 3, y: 6, crop: 'carrot', quality: 1, by: 1 }, d.state);
      d.engine.suspend(false);
      await new Promise((r) => setTimeout(r, 400));
      return { suspended: a, frozen: t1 === t2, resumed: d.core().ctx.state };
    });
    check('suspend(true) suspends the context and freezes the clock', sus.suspended === 'suspended' && sus.frozen, JSON.stringify(sus));
    check('suspend(false) resumes', sus.resumed === 'running', sus.resumed);
    const after = await sample(1500);
    check('music plays again after resume', after.rms > -40, `${f1(after.rms)} dBFS`);
    // mood() cost.
    const cost = await page.evaluate(() => {
      const d = window.audioDev;
      const c = d.core();
      const m = { ...d.mood, rules: { ...d.mood.rules } };
      const changes0 = c.moodChanges;
      let t0 = performance.now();
      for (let k = 0; k < 100000; k++) d.engine.mood(m);
      const same = ((performance.now() - t0) / 100000) * 1000;
      const changesSame = c.moodChanges - changes0;
      // Flow at x4: the hour moves every frame.
      const fm = { ...m, rules: { ...m.rules, clock: 'flow' }, speed: 4 };
      const c1 = c.moodChanges;
      t0 = performance.now();
      for (let k = 0; k < 3600; k++) {
        fm.hour = 6 + ((k * 0.02) % 18);
        d.engine.mood(fm);
      }
      const moving = ((performance.now() - t0) / 3600) * 1000;
      return { sameUs: same, changesSame, movingUs: moving, changesMoving: c.moodChanges - c1 };
    });
    console.log(`mood(): ${cost.sameUs.toFixed(2)} us when nothing changed (${cost.changesSame} changes in 100000 calls); ${cost.movingUs.toFixed(1)} us a frame with the hour moving (${cost.changesMoving} changes in 3600 frames)`);
    check('mood() is cheap when nothing changes (under 2 us, no work done)', cost.sameUs < 2 && cost.changesSame === 0, `${cost.sameUs.toFixed(2)} us`);
    check('mood() with the hour moving every frame stays under 30 us a frame on average', cost.movingUs < 30, `${cost.movingUs.toFixed(1)} us`);
    report.numbers.moodCostUs = cost;
    // Let the live engine run under the dev page for a while: flow at x4 with hands, then check errors.
    await page.evaluate(() => {
      const d = window.audioDev;
      d.mood.rules = { ...d.mood.rules, clock: 'flow' };
      d.mood.speed = 4;
      d.mood.weather = 'rain';
    });
    await page.waitForTimeout(4000);
    const st = await page.evaluate(() => window.audioDev.core().stats());
    report.numbers.liveStats = st;
    console.log(`live stats: ${JSON.stringify({ voices: st.voices, maxVoices: st.maxVoices, notes: st.notes, errors: st.errors })}`);
    check('live engine reports no errors', st.errors === 0, st.lastError || '');
  }

  check('no page errors or console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  browser = null;
} finally {
  if (browser) await browser.close();
  server.stop();
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const total = report.checks.length;
console.log(`\n${total - failed} of ${total} checks passed. WAVs and report.json in ${OUT}`);
process.exit(failed ? 1 : 0);
