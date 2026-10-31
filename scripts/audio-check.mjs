// Measured checks for the audio engine. Starts its own Vite on :5250, renders
// the real engine offline in headless Chrome, and checks: each game's music
// (level, character, how different the four games are, day and night,
// intensity), ambience in every game, the 0.8 s game switches, every Sunup
// event and interface cue, every named cue and loop of Thistledown and
// Seedbound (latency, level, pan, gain, pitch, musical pitch steps, rate
// limits, clean loop starts and stops), the peak under the worst bursts, the
// deck cascade and the ranch's drawing, instrument tuning, the realtime path
// (unlock, suspend, mood cost) and that nothing throws.
// Writes WAVs and a report to /tmp/acres-audio-2/ (or $ACRES_AUDIO_OUT).
//
//   node scripts/audio-check.mjs            all checks
//   node scripts/audio-check.mjs arr cues   only some: arr burst sfx switch step tune cues stepped cascade draw rate loops listen live

import { mkdirSync, writeFileSync } from 'node:fs';
import { openPage, startServer } from './audio-lib.mjs';

const OUT = process.env.ACRES_AUDIO_OUT ?? '/tmp/acres-audio-2';
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
        const out = { ms: r.ms, stats: r.stats, probes: r.probes, peak: A.peakDb(b) };
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

  // ------------------------------------------------------------ music per game
  if (run('arr')) {
    console.log('\n# Music per game (music only, game default volumes, 18 s each, measured from 3 s)');
    const S = ['spring', 'summer', 'autumn', 'winter'];
    const list = [];
    for (let s = 0; s < 4; s++) list.push({ name: `homestead-${S[s]}`, mood: { game: 'homestead', season: s, hour: 10 } });
    for (let s = 0; s < 4; s++) list.push({ name: `deck-${S[s]}`, mood: { game: 'deck', season: s, hour: 12 } });
    for (let s = 0; s < 4; s++) list.push({ name: `ranch-${S[s]}`, mood: { game: 'ranch', season: s, hour: 11 } });
    for (let s = 0; s < 4; s++) list.push({ name: `ranch-night-${S[s]}`, mood: { game: 'ranch', season: s, hour: 23 } });
    list.push({ name: 'deck-lift', mood: { game: 'deck', season: 0, hour: 12, intensity: 1 } });
    list.push({ name: 'ranch-tension', mood: { game: 'ranch', season: 0, hour: 11, intensity: 1 } });
    list.push({ name: 'ranch-night-tension', mood: { game: 'ranch', season: 0, hour: 23, intensity: 1 } });
    list.push({ name: 'evening-homestead-spring', mood: { game: 'homestead', season: 0, hour: 20.5 } });
    list.push({ name: 'night-homestead-spring', mood: { game: 'homestead', season: 0, hour: 23.5 } });
    list.push({ name: 'deck-late', mood: { game: 'deck', season: 0, hour: 23.5 } });
    list.push({ name: 'title', mood: { game: 'title', scene: 'title', season: 0, hour: 9 } });
    list.push({ name: 'menu-homestead-spring', mood: { game: 'homestead', scene: 'menu', season: 0, hour: 10 } });
    list.push({ name: 'menu-ranch-spring', mood: { game: 'ranch', scene: 'menu', season: 0, hour: 11 } });
    const rows = {};
    for (const it of list) {
      const r = await scene(`music-${it.name}`, { dur: 18, mood: it.mood, mute: ['ambience'], volumes: GAME },
        `return { rms: A.rmsDb(b, 3), peak3: A.peakDb(b, 3), ch: A.character(b, 3, 18) };`, false);
      rows[it.name] = { rms: r.rms, peak: r.peak, centroid: r.ch.centroid, onsets: r.ch.onsets, crest: r.ch.crest, bands: r.ch.bands, chroma: r.ch.chroma, notes: r.stats.notes, maxVoices: r.stats.maxVoices.music, renderMs: r.ms };
      console.log(`${it.name.padEnd(26)} RMS ${f1(r.rms)} dBFS  peak ${f1(r.peak)}  centroid ${Math.round(r.ch.centroid)} Hz  onsets ${f1(r.ch.onsets)}/s  notes ${r.stats.notes}  voices<=${r.stats.maxVoices.music}  bands% ${r.ch.bands.join(' ')}`);
    }
    report.numbers.arrangements = rows;
    const daytime = Object.entries(rows).filter(([k]) => !k.includes('night') && !k.startsWith('menu') && !k.startsWith('evening') && k !== 'deck-late');
    for (const [k, v] of daytime) check(`music ${k} RMS in -30..-18 dBFS at game volumes`, v.rms > -30 && v.rms < -18, `${f1(v.rms)} dBFS`);
    for (const [k, v] of Object.entries(rows).filter(([k]) => k.startsWith('ranch-night'))) check(`music ${k} RMS in -40..-26 dBFS (quiet, not gone)`, v.rms > -40 && v.rms < -26, `${f1(v.rms)} dBFS`);
    for (const [k, v] of Object.entries(rows)) check(`music ${k} peak below -3 dBFS`, v.peak < -3, `${f1(v.peak)} dBFS`);
    const R = (k) => rows[k];
    check('deck is sparser than homestead', R('deck-spring').onsets < R('homestead-spring').onsets, `${f1(R('deck-spring').onsets)} vs ${f1(R('homestead-spring').onsets)} onsets/s`);
    check('deck intensity lifts the music (1 dB or more louder and busier)', R('deck-lift').rms > R('deck-spring').rms + 1 && R('deck-lift').onsets > R('deck-spring').onsets * 1.3,
      `${f1(R('deck-lift').rms)} vs ${f1(R('deck-spring').rms)} dBFS, ${f1(R('deck-lift').onsets)} vs ${f1(R('deck-spring').onsets)} onsets/s`);
    check('ranch intensity adds tension (louder, more low end under 400 Hz)', R('ranch-tension').rms > R('ranch-spring').rms + 0.5 && R('ranch-tension').bands[0] + R('ranch-tension').bands[1] > R('ranch-spring').bands[0] + R('ranch-spring').bands[1] + 3,
      `${f1(R('ranch-tension').rms)} vs ${f1(R('ranch-spring').rms)} dBFS, low share ${f1(R('ranch-tension').bands[0] + R('ranch-tension').bands[1])}% vs ${f1(R('ranch-spring').bands[0] + R('ranch-spring').bands[1])}%`);
    check('ranch tension also works at night', R('ranch-night-tension').rms > R('ranch-night-spring').rms + 2, `${f1(R('ranch-night-tension').rms)} vs ${f1(R('ranch-night-spring').rms)} dBFS`);
    for (const s of S) check(`ranch night is sparse and quiet (${s}: 3 dB or more under the day, under 70% of its notes)`, R(`ranch-night-${s}`).rms < R(`ranch-${s}`).rms - 3 && R(`ranch-night-${s}`).notes < R(`ranch-${s}`).notes * 0.7,
      `${f1(R(`ranch-night-${s}`).rms)} vs ${f1(R(`ranch-${s}`).rms)} dBFS, ${R(`ranch-night-${s}`).notes} vs ${R(`ranch-${s}`).notes} notes`);
    check('homestead night thins towards a lullaby (quieter and sparser than day)', R('night-homestead-spring').rms < R('homestead-spring').rms - 2 && R('night-homestead-spring').onsets < R('homestead-spring').onsets,
      `${f1(R('night-homestead-spring').rms)} vs ${f1(R('homestead-spring').rms)} dBFS`);
    check('deck has no late-hours thinning (its own pacing)', Math.abs(R('deck-late').rms - R('deck-spring').rms) < 1.5, `${f1(R('deck-late').rms)} vs ${f1(R('deck-spring').rms)} dBFS`);
    check('homestead winter is sparser than spring', R('homestead-winter').onsets < R('homestead-spring').onsets, `${f1(R('homestead-winter').onsets)} vs ${f1(R('homestead-spring').onsets)} onsets/s`);
    check('ranch winter is sparser than spring', R('ranch-winter').notes < R('ranch-spring').notes, `${R('ranch-winter').notes} vs ${R('ranch-spring').notes} notes`);
    check('menu ducks the homestead music by 3 dB or more', R('menu-homestead-spring').rms < R('homestead-spring').rms - 3, `${f1(R('menu-homestead-spring').rms)} vs ${f1(R('homestead-spring').rms)}`);
    check('menu ducks the ranch music by 3 dB or more', R('menu-ranch-spring').rms < R('ranch-spring').rms - 3, `${f1(R('menu-ranch-spring').rms)} vs ${f1(R('ranch-spring').rms)}`);
    // Clearly different: spectral shape (band energy in dB), busyness, brightness.
    const dist = (a, b) => {
      const x = rows[a].bands.map((v) => 10 * Math.log10(v + 0.1));
      const y = rows[b].bands.map((v) => 10 * Math.log10(v + 0.1));
      const band = x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / x.length;
      const busy = Math.max(rows[a].onsets, rows[b].onsets) / Math.max(0.1, Math.min(rows[a].onsets, rows[b].onsets));
      const ca = rows[a].chroma;
      const cb = rows[b].chroma;
      const dot = ca.reduce((s2, v, i) => s2 + v * cb[i], 0);
      const chroma = 1 - dot / (Math.hypot(...ca) * Math.hypot(...cb));
      return { band, busy, centroid: Math.abs(rows[a].centroid - rows[b].centroid), chroma };
    };
    const games = ['homestead-spring', 'deck-spring', 'ranch-spring', 'title'];
    const pairs = [];
    for (let i = 0; i < games.length; i++) for (let j = i + 1; j < games.length; j++) pairs.push([games[i], games[j]]);
    pairs.push(['ranch-spring', 'ranch-night-spring'], ['deck-spring', 'deck-lift']);
    const distances = {};
    for (const [a, b] of pairs) {
      const d = dist(a, b);
      distances[`${a} / ${b}`] = { bandDb: Number(d.band.toFixed(2)), busy: Number(d.busy.toFixed(2)), centroidHz: Math.round(d.centroid), harmony: Number(d.chroma.toFixed(3)) };
      check(`${a} and ${b} are clearly different`, d.band > 1.5 || d.busy > 1.35 || d.centroid > 250, `band diff ${f1(d.band)} dB, busy x${d.busy.toFixed(2)}, centroid diff ${Math.round(d.centroid)} Hz, harmony diff ${d.chroma.toFixed(2)}`);
    }
    report.numbers.gameDistances = distances;
    for (const g of ['homestead', 'ranch']) {
      const seasons = S.map((s) => `${g}-${s}`);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const d = dist(seasons[i], seasons[j]);
        check(`${seasons[i]} and ${seasons[j]} differ`, d.band > 1 || d.busy > 1.2 || d.centroid > 150 || d.chroma > 0.08,
          `band diff ${f1(d.band)} dB, busy x${d.busy.toFixed(2)}, centroid diff ${Math.round(d.centroid)} Hz, harmony diff ${d.chroma.toFixed(2)}`);
      }
    }

    // Ambience scenes, ambience alone and in the full mix.
    console.log('\n# Ambience scenes (full mix)');
    const amb = [
      { name: 'homestead-morning-birds-spring', mood: { game: 'homestead', season: 0, hour: 6.6, weather: 'sun' } },
      { name: 'homestead-night-crickets-frogs-summer', mood: { game: 'homestead', season: 1, hour: 22, weather: 'sun' } },
      { name: 'homestead-rain-spring', mood: { game: 'homestead', season: 0, hour: 12, weather: 'rain' } },
      { name: 'homestead-storm-autumn', mood: { game: 'homestead', season: 2, hour: 14, weather: 'storm' }, actions: [{ t: 4, event: { type: 'thunder' } }] },
      { name: 'homestead-heat-cicadas-summer', mood: { game: 'homestead', season: 1, hour: 14, weather: 'heat' } },
      { name: 'homestead-wind-autumn', mood: { game: 'homestead', season: 2, hour: 12, weather: 'cloud' } },
      { name: 'ranch-meadow-day-spring', mood: { game: 'ranch', season: 0, hour: 11, weather: 'sun' } },
      { name: 'ranch-meadow-day-summer', mood: { game: 'ranch', season: 1, hour: 14, weather: 'sun' } },
      { name: 'ranch-night-owls-summer', mood: { game: 'ranch', season: 1, hour: 23, weather: 'sun' } },
      { name: 'ranch-rain-autumn', mood: { game: 'ranch', season: 2, hour: 12, weather: 'rain' } },
      { name: 'ranch-storm-spring', mood: { game: 'ranch', season: 0, hour: 15, weather: 'storm' } },
      { name: 'deck-rain-spring', mood: { game: 'deck', season: 0, hour: 12, weather: 'rain' } },
      { name: 'deck-night-summer', mood: { game: 'deck', season: 1, hour: 22, weather: 'sun' } },
    ];
    const ambRows = {};
    for (const it of amb) {
      const alone = await scene(`ambience-${it.name}`, { dur: 14, mood: it.mood, mute: ['music'], volumes: GAME },
        `return { rms: A.rmsDb(b, 2), ch: A.character(b, 2, 14) };`, false);
      const mixr = await scene(`mix-${it.name}`, { dur: 14, mood: it.mood, actions: it.actions, volumes: GAME }, `return { rms: A.rmsDb(b, 2) };`, false);
      ambRows[it.name] = { ambienceRms: alone.rms, centroid: Math.round(alone.ch.centroid), mixRms: mixr.rms, mixPeak: mixr.peak, shots: alone.stats.ambienceShots, loops: alone.stats.loops };
      console.log(`${it.name.padEnd(38)} ambience RMS ${f1(alone.rms)} dBFS centroid ${Math.round(alone.ch.centroid)} Hz  full mix RMS ${f1(mixr.rms)} peak ${f1(mixr.peak)}  one-shots ${alone.stats.ambienceShots}  loops ${JSON.stringify(alone.stats.loops)}`);
      check(`ambience ${it.name} audible but under the music`, alone.rms > -60 && alone.rms < mixr.rms - 3, `${f1(alone.rms)} dBFS against a full mix of ${f1(mixr.rms)}`);
      check(`mix ${it.name} peak below -1 dBFS`, mixr.peak < -1, `${f1(mixr.peak)} dBFS`);
    }
    const L = (k) => ambRows[k].loops;
    check('ranch by day has long grass and meadow insects', L('ranch-meadow-day-summer').grass > 0.02 && L('ranch-meadow-day-summer').insects > 0.02, JSON.stringify(L('ranch-meadow-day-summer')));
    check('ranch at night has crickets and owls, no insects', L('ranch-night-owls-summer').crickets > 0.03 && L('ranch-night-owls-summer').insects < 0.005 && ambRows['ranch-night-owls-summer'].shots >= 1,
      `${JSON.stringify(L('ranch-night-owls-summer'))}, ${ambRows['ranch-night-owls-summer'].shots} one-shots`);
    check('weather sounds in every game (rain loop on in homestead, ranch and deck)', L('homestead-rain-spring').rain > 0.05 && L('ranch-rain-autumn').rain > 0.05 && L('deck-rain-spring').rain > 0.05,
      `${L('homestead-rain-spring').rain}, ${L('ranch-rain-autumn').rain}, ${L('deck-rain-spring').rain}`);
    check('night ambience in every game (crickets in homestead, ranch and deck)', L('homestead-night-crickets-frogs-summer').crickets > 0.02 && L('ranch-night-owls-summer').crickets > 0.02 && L('deck-night-summer').crickets > 0.02,
      `${L('homestead-night-crickets-frogs-summer').crickets}, ${L('ranch-night-owls-summer').crickets}, ${L('deck-night-summer').crickets}`);
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
    const h = await scene('hands-4x-stream', { dur: 8, mood: { game: 'homestead', speed: 4, rules: { clock: 'flow', camera: 'wide', crew: 'crew' } }, actions: acts3 },
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

  // ------------------------------------------------------------ game switches
  if (run('switch')) {
    console.log('\n# Game switches: longest quiet run (10 ms windows under -55 dBFS) from the switch to 3 s after, and the bus fade');
    const results = [];
    const fades = [];
    const BUS = { homestead: 'day', deck: 'turns', ranch: 'ranch', ranchNight: 'ranchNight', title: 'title' };
    for (const season of [0, 1, 2, 3]) {
      const seq = [
        [4.13, { game: 'deck', scene: 'farm', hour: 12 }, 'title to deck', 'title', 'deck'],
        [8.71, { game: 'ranch', hour: 11 }, 'deck to ranch', 'deck', 'ranch'],
        [13.37, { game: 'homestead', hour: 10 }, 'ranch to homestead', 'ranch', 'homestead'],
        [17.9, { game: 'ranch', hour: 23 }, 'homestead to ranch at night', 'homestead', 'ranchNight'],
        [22.22, { game: 'deck', hour: 12, intensity: 0.8 }, 'ranch at night to deck scoring', 'ranchNight', 'deck'],
        [26.6, { game: 'title', scene: 'title', intensity: 0 }, 'deck to title', 'deck', 'title'],
        [30.05, { game: 'homestead', scene: 'farm', hour: 10 }, 'title to homestead', 'title', 'homestead'],
        [33.4, { game: 'deck', hour: 12 }, 'homestead to deck', 'homestead', 'deck'],
        [36.8, { game: 'ranch', hour: 11, intensity: 0.7 }, 'deck to ranch with tension', 'deck', 'ranch'],
      ];
      const acts = seq.map(([t, mood]) => ({ t, mood }));
      const ts = seq.map((x) => x[0]);
      const probe = [];
      for (const t of ts) for (const dt of [-0.05, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2]) probe.push(t + dt);
      const r = await scene(`switches-${['spring', 'summer', 'autumn', 'winter'][season]}`, { dur: 40, mood: { game: 'title', scene: 'title', season, hour: 10 }, actions: acts, mute: ['ambience'], volumes: GAME, probe },
        `const ts = ${JSON.stringify(ts)}; return { quiet: ts.map((t) => A.longestQuiet(b, t, t + 3, -55)), dip: ts.map((t) => { const w = A.windows(b, 0.1, t, t + 2.5); return Math.min(...w) - A.rmsDb(b, t - 2.5, t); }), steady: A.longestQuiet(b, 1, 40, -55) };`, season === 0);
      const at = (t) => r.probes.reduce((a, p) => (Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a), r.probes[0]).levels;
      seq.forEach(([t, , name, from, to], k) => {
        const fb = BUS[from];
        const tb = BUS[to];
        const before = at(t - 0.05)[fb];
        const half = { out: at(t + 0.4)[fb], in: at(t + 0.4)[tb] };
        const done = { out: at(t + 0.8)[fb], in: at(t + 0.8)[tb] };
        // Sum of the two buses through the fade: it must not sag.
        const sag = Math.min(...[0.2, 0.4, 0.6, 0.8, 1.0].map((dt) => at(t + dt)[fb] + at(t + dt)[tb]));
        results.push({ season, name, quietMs: Math.round(r.quiet[k] * 1000), dipDb: Number(r.dip[k].toFixed(1)) });
        fades.push({ season, name, outAt800: Number(done.out.toFixed(3)), inAt800: Number(done.in.toFixed(3)), outAt400: Number(half.out.toFixed(3)), inAt400: Number(half.in.toFixed(3)), minSum: Number(sag.toFixed(3)), before: Number(before.toFixed(3)) });
        check(`season ${season} ${name}: no silence over 150 ms`, r.quiet[k] <= 0.15, `longest quiet ${Math.round(r.quiet[k] * 1000)} ms, deepest 100 ms dip ${f1(r.dip[k])} dB`);
        if (season === 0) {
          check(`${name}: the old music is out and the new one in by 0.8 s`, done.out < 0.1 * Math.max(0.05, before) + 0.02 && done.in > 0.85, `old bus ${before.toFixed(2)} to ${done.out.toFixed(3)}, new bus ${done.in.toFixed(2)} at 0.8 s (${half.out.toFixed(2)} and ${half.in.toFixed(2)} at 0.4 s)`);
          check(`${name}: the crossfade does not sag (sum of buses stays over 0.8)`, sag > 0.8, `lowest sum ${sag.toFixed(2)}`);
        }
      });
      console.log(`season ${season}: longest quiet anywhere in 40 s: ${Math.round(r.steady * 1000)} ms`);
    }
    report.numbers.switches = results;
    report.numbers.switchFades = fades;
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
      const plan = { guitar: [40, 52, 64, 69], banjo: [62, 69, 76], bass: [33, 40, 45], fiddle: [64, 74, 81], marimba: [55, 67, 79], celesta: [72, 79, 86], musicbox: [76, 84, 91], piano: [48, 60, 72], bell: [72, 79], pad: [50, 57, 64], kalimba: [64, 72, 83], harp: [43, 55, 67, 79], flute: [69, 76, 86] };
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
      const plan = { guitar: 52, banjo: 64, bass: 36, fiddle: 69, marimba: 64, celesta: 76, musicbox: 79, piano: 57, bell: 76, pad: 57, kalimba: 72, harp: 55, flute: 74, chip: 86 };
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

  // ------------------------------------------------------------ named cues: latency, level, the sheet
  if (run('cues')) {
    console.log('\n# Every named cue: latency to sound (music and ambience muted, game volumes)');
    const names = await page.evaluate(() => ({ deck: [...window.audioDev.deckCues], ranch: [...window.audioDev.ranchCues] }));
    const LONG = new Set(['deck.quota', 'deck.fail', 'deck.grow', 'deck.big', 'deck.shuffle', 'deck.weather', 'ranch.sleep', 'ranch.gate', 'ranch.goal', 'ranch.coins', 'deck.endday', 'ranch.nettle', 'ranch.nettlehit', 'ranch.build', 'ranch.sell', 'deck.buy', 'deck.mult', 'deck.page', 'deck.remove', 'deck.reroll', 'ranch.glide', 'ranch.shed']);
    const items = [...names.deck.map((n) => ({ name: n, game: 'deck' })), ...names.ranch.map((n) => ({ name: n, game: 'ranch' }))];
    items.push({ name: 'ranch.coins', game: 'ranch', label: 'ranch.coins (gain 1)', opts: { gain: 1 } });
    items.push({ name: 'ranch.coins', game: 'ranch', label: 'ranch.coins (gain 0.1)', opts: { gain: 0.1 } });
    items.push({ name: 'deck.water', game: 'deck', label: 'deck.water (1 plot, gain 0.06)', opts: { gain: 1 / 16 } });
    items.push({ name: 'ranch.land', game: 'ranch', label: 'ranch.land (soft, gain 0.2)', opts: { gain: 0.2 } });
    items.push({ name: 'ranch.suck', game: 'ranch', label: 'ranch.suck (downy, pitch 0.6)', opts: { pitch: 0.6 } });
    items.push({ name: 'ranch.suck', game: 'ranch', label: 'ranch.suck (tuft, pitch 1.5)', opts: { pitch: 1.5 } });
    const acts = [];
    const index = [];
    let t = 0.6;
    for (const it of items) {
      acts.push({ t: t - 0.3, mood: { game: it.game } });
      acts.push({ t, cue: it.name, opts: it.opts });
      index.push({ name: it.label ?? it.name, t });
      t += LONG.has(it.name) ? 5 : 2.2;
    }
    const dur = t + 1;
    const times = index.map((x) => x.t);
    const res = await scene('cue-sheet', { dur, mood: { game: 'deck', season: 0, hour: 12, weather: 'sun' }, actions: acts, mute: ['music', 'ambience'], volumes: GAME },
      `const t = ${JSON.stringify(times)}; return { lat: t.map((x) => A.onsetAfter(b, x, -50, 0.5)), peaks: t.map((x, i) => A.peakDb(b, x, (t[i + 1] ?? x + 2) - 0.05)), base: t.map((x) => A.rmsDb(b, x - 0.25, x - 0.02)) };`);
    writeFileSync(`${OUT}/cue-sheet.txt`, index.map((x) => `${x.t.toFixed(2)} s  ${x.name}`).join('\n') + '\n');
    const lat = {};
    let worst = 0;
    index.forEach((x, k) => {
      const l = res.lat[k];
      lat[x.name] = { at: Number(x.t.toFixed(2)), latencyMs: Number.isFinite(l) ? Math.round(l * 1000) : null, peak: Number(res.peaks[k].toFixed(1)), before: Number(res.base[k].toFixed(1)) };
      if (Number.isFinite(l)) worst = Math.max(worst, l);
      console.log(`${x.name.padEnd(32)} ${Number.isFinite(l) ? `${Math.round(l * 1000)} ms`.padStart(7) : '  never'}  peak ${f1(res.peaks[k])} dBFS  (before ${f1(res.base[k])})`);
      check(`${x.name} sounds within 100 ms (from silence)`, Number.isFinite(l) && l < 0.1 && res.base[k] < -60, Number.isFinite(l) ? `${Math.round(l * 1000)} ms, ${f1(res.base[k])} dBFS before` : 'silent');
      check(`${x.name} level: peak between -40 and -4 dBFS at game volumes`, res.peaks[k] < -4 && res.peaks[k] > -40, `${f1(res.peaks[k])} dBFS`);
    });
    report.numbers.cueLatency = lat;
    report.numbers.worstCueLatencyMs = Math.round(worst * 1000);
    check('no cue on the sheet was dropped', Object.values(res.stats.dropped).every((v) => !v), JSON.stringify(res.stats.dropped));
    console.log(`worst cue latency ${Math.round(worst * 1000)} ms; sheet index in ${OUT}/cue-sheet.txt`);

    // Unknown names make no sound and throw nothing.
    const unk = await scene('unknown-cues', {
      dur: 3, mood: { game: 'ranch', hour: 11 }, mute: ['music', 'ambience'], actions: [
        { t: 0.5, cue: 'deck.nope' }, { t: 0.6, cue: 'ranch.flarp', opts: { pan: 1, gain: 1, pitch: 2 } }, { t: 0.7, cue: '' },
        { t: 0.8, loop: 'ranch.nothing', on: true }, { t: 0.9, loop: 'deck.draw', on: true }, { t: 1, cue: 'ranch.draw' },
      ],
    }, `return {};`, false);
    check('unknown cue and loop names stay silent', unk.peak < -90 && unk.stats.unknownCues === 6 && unk.stats.errors === 0, `peak ${f1(unk.peak)} dBFS, ${unk.stats.unknownCues} unknown, ${unk.stats.errors} errors`);

    // Pan, gain and pitch are honoured. Master turned down so the compressor stays out of the way.
    const opts = await scene('cue-opts', {
      dur: 11, mood: { game: 'ranch', hour: 11 }, mute: ['music', 'ambience'], volumes: { master: 0.2, music: 1, sfx: 1 }, actions: [
        { t: 0.5, cue: 'ranch.chirp', opts: { pan: -1 } }, { t: 1.5, cue: 'ranch.chirp', opts: { pan: 1 } },
        { t: 2.5, cue: 'deck.play', opts: { gain: 1 } }, { t: 3.5, cue: 'deck.play', opts: { gain: 0.25 } },
        { t: 4.5, cue: 'ranch.suck', opts: { pitch: 0.5 } }, { t: 5.5, cue: 'ranch.suck', opts: { pitch: 2 } },
        { t: 9.5, cue: 'ranch.puff', opts: { pan: 0.5, gain: 0 } },
      ],
    }, `return { l: A.sidesDb(b, 0.5, 1.4), r: A.sidesDb(b, 1.5, 2.4), g1: A.rmsDb(b, 2.5, 3.2), g2: A.rmsDb(b, 3.5, 4.2), p1: A.character(b, 4.5, 4.8).centroid, p2: A.character(b, 5.5, 5.8).centroid, z: A.peakDb(b, 9.5, 10.5), floor: A.peakDb(b, 8.4, 9.4) };`, false);
    check('pan -1 puts a cue on the left', opts.l.left - opts.l.right > 15, `left ${f1(opts.l.left)} vs right ${f1(opts.l.right)} dB`);
    check('pan 1 puts a cue on the right', opts.r.right - opts.r.left > 15, `right ${f1(opts.r.right)} vs left ${f1(opts.r.left)} dB`);
    check('gain 0.25 is 12 dB down (within 1.5 dB)', Math.abs(opts.g1 - opts.g2 - 12) < 1.5, `${f1(opts.g1 - opts.g2)} dB`);
    check('pitch 2 against pitch 0.5 lifts the spectrum by 3x or more', opts.p2 / opts.p1 > 3, `centroid ${Math.round(opts.p1)} to ${Math.round(opts.p2)} Hz`);
    check('gain 0 adds nothing (no louder than the room tail before it)', opts.z <= opts.floor, `${f1(opts.z)} dBFS against ${f1(opts.floor)} before`);
    report.numbers.cueOpts = opts;
  }

  // ------------------------------------------------------------ pitch-stepped cues stay musical
  if (run('stepped')) {
    console.log('\n# Pitch-stepped cues: notes against the key and the chord');
    const acts = [];
    // A harvest chain whose pitch rises a semitone a step, with chips rising inside each harvest and a mult after it.
    for (let h = 0; h < 12; h++) {
      const t0 = 1 + h * 0.42;
      acts.push({ t: t0, cue: 'deck.harvest', opts: { pitch: Math.pow(2, h / 12) } });
      for (let c = 0; c < 8; c++) acts.push({ t: t0 + 0.05 + c * 0.03, cue: 'deck.chip', opts: { pitch: 1 + c * 0.05 } });
      acts.push({ t: t0 + 0.32, cue: 'deck.mult', opts: { pitch: 1 + h * 0.1 } });
    }
    // Then the same with no pitch at all: the cues climb by themselves.
    for (let h = 0; h < 8; h++) {
      acts.push({ t: 8 + h * 0.3, cue: 'deck.harvest' });
      acts.push({ t: 8 + h * 0.3 + 0.1, cue: 'deck.chip' });
    }
    const r = await scene('stepped-chain', { dur: 12, mood: { game: 'deck', season: 0, hour: 12 }, actions: acts, mute: ['ambience'], volumes: GAME }, `return {};`, false);
    const notes = r.stats.cueNotes;
    const PENTA = [0, 2, 4, 7, 9];
    const inKey = (n) => PENTA.includes((((n.midi - n.key) % 12) + 12) % 12);
    const inChord = (n) => n.chord.includes(((n.midi % 12) + 12) % 12);
    const by = (name, from, to) => notes.filter((n, i) => n.name === name && i >= from && i < to);
    const firstAuto = notes.findIndex((n, i) => i > 0 && n.name === 'deck.harvest' && notes.slice(0, i).filter((x) => x.name === 'deck.harvest').length === 12);
    const harv = by('deck.harvest', 0, firstAuto < 0 ? notes.length : firstAuto).map((n) => n.midi);
    const autoHarv = by('deck.harvest', firstAuto < 0 ? notes.length : firstAuto, notes.length).map((n) => n.midi);
    const chips = notes.filter((n) => n.name === 'deck.chip');
    const mults = notes.filter((n) => n.name === 'deck.mult').map((n) => n.midi);
    const rising = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
    const climbing = (a) => a.every((v, i) => i === 0 || v >= a[i - 1]);
    console.log(`harvests ${harv.join(' ')}\nauto harvests ${autoHarv.join(' ')}\nmults ${mults.join(' ')}\nchips ${chips.slice(0, 24).map((n) => n.midi).join(' ')} ...`);
    check('harvest chain: 12 notes, every one on the pentatonic ladder of the key', harv.length === 12 && notes.filter((n) => n.name === 'deck.harvest').every(inKey), `${harv.length} notes`);
    check('harvest chain rises with every harvest (no repeats, no falls)', rising(harv), harv.join(' '));
    check('harvests without a pitch climb by themselves', autoHarv.length === 8 && rising(autoHarv), autoHarv.join(' '));
    check('every chip is a tone of the chord sounding when it plays', chips.length > 50 && chips.every(inChord), `${chips.length} chips, ${chips.filter((n) => !inChord(n)).length} off the chord`);
    check('mults are on the pentatonic ladder and climb with the mult', mults.length === 12 && notes.filter((n) => n.name === 'deck.mult').every(inKey) && climbing(mults), mults.join(' '));
    report.numbers.stepped = { harvests: harv, autoHarvests: autoHarv, mults, chips: chips.map((n) => n.midi) };
  }

  // ------------------------------------------------------------ deck cascade over music
  if (run('cascade')) {
    console.log('\n# Seedbound cascade: 40 chips a second for 4 s over the music, every volume at full');
    const acts = [{ t: 0.5, mood: { intensity: 0.3 } }];
    for (let k = 0; k < 160; k++) acts.push({ t: 1 + k * 0.025, cue: 'deck.chip', opts: { pitch: 1 + (k % 10) * 0.05 } });
    for (let h = 0; h < 10; h++) {
      acts.push({ t: 1 + h * 0.4, cue: 'deck.harvest', opts: { pitch: Math.pow(2, h / 12) } });
      acts.push({ t: 1.3 + h * 0.4, cue: 'deck.mult', opts: { pitch: 1 + h * 0.15 } });
      acts.push({ t: 1 + h * 0.4, mood: { intensity: Math.min(1, 0.3 + h * 0.08) } });
    }
    acts.push({ t: 2.4, cue: 'deck.big' }, { t: 4.2, cue: 'deck.big' }, { t: 5.1, cue: 'deck.quota' }, { t: 7, mood: { intensity: 0 } });
    for (let k = 0; k < 6; k++) acts.push({ t: 1 + k * 0.6, cue: 'deck.draw' }, { t: 1.2 + k * 0.6, cue: 'deck.water', opts: { gain: 1 } });
    const mood = { game: 'deck', season: 1, hour: 12, weather: 'storm' };
    const a = await scene('deck-cascade', { dur: 10, mood, actions: acts }, `return { rms: A.rmsDb(b, 1, 5), peakRun: A.peakDb(b, 1, 6) };`);
    const raw = await scene('deck-cascade-no-clipper', { dur: 10, mood, actions: acts, noClipper: true }, `return {};`, false);
    console.log(`with clipper: peak ${f1(a.peak)} dBFS, cascade RMS ${f1(a.rms)}; before the clipper ${f1(raw.peak)} dBFS; chips ${a.stats.started['deck.chip']} played, ${a.stats.dropped['deck.chip'] ?? 0} dropped; max voices ${JSON.stringify(a.stats.maxVoices)}`);
    check('deck cascade: peak below -1 dBFS', a.peak < -1, `${f1(a.peak)} dBFS`);
    check('deck cascade barely needs the clipper (peak before it below +1 dBFS)', raw.peak < 1, `${f1(raw.peak)} dBFS before the soft clipper`);
    check('deck cascade: 40 chips a second are rate-limited to 30 or fewer a second, and still tick at 20 or more', (a.stats.started['deck.chip'] ?? 0) <= 4 * 30 && (a.stats.started['deck.chip'] ?? 0) >= 4 * 20, `${a.stats.started['deck.chip']} of 160 in 4 s`);
    check('deck cascade: effect voices stay capped (40 or fewer)', a.stats.maxVoices.sfx <= 40, `${a.stats.maxVoices.sfx}`);
    report.numbers.deckCascade = { peak: a.peak, peakBeforeClipper: raw.peak, rms: a.rms, started: a.stats.started, dropped: a.stats.dropped, maxVoices: a.stats.maxVoices };
  }

  // ------------------------------------------------------------ ranch drawing over music and wind
  if (run('draw')) {
    console.log('\n# Thistledown drawing: the bellows held 4 s, 30 sucks a second, steps, chirps, over music, wind and a gust; every volume at full');
    const acts = [{ t: 0.5, loop: 'ranch.wind', on: true, opts: { gain: 1 } }, { t: 1, loop: 'ranch.draw', on: true }, { t: 5, loop: 'ranch.draw', on: false }];
    for (let k = 0; k < 120; k++) acts.push({ t: 1.05 + k / 30, cue: 'ranch.suck', opts: { pitch: k % 6 === 0 ? 0.6 : 1.2 + (k % 4) * 0.1, pan: ((k % 5) - 2) * 0.15 } });
    for (let k = 0; k < 40; k++) acts.push({ t: 0.5 + k * 0.14, cue: k % 3 ? 'ranch.step' : 'ranch.stepstone', opts: { pitch: 0.95 + (k % 3) * 0.04 } });
    for (let k = 0; k < 12; k++) acts.push({ t: 1.2 + k * 0.33, cue: k % 2 ? 'ranch.chirp' : 'ranch.squeak', opts: { pan: (k % 3) - 1 } });
    for (let k = 0; k < 8; k++) acts.push({ t: 5.2 + k * 0.25, cue: 'ranch.puff' });
    acts.push({ t: 5.5, cue: 'ranch.full' }, { t: 6, cue: 'ranch.coins', opts: { gain: 1 } }, { t: 6.2, cue: 'ranch.goal' });
    const mood = { game: 'ranch', season: 2, hour: 15, weather: 'storm', intensity: 0.6 };
    const a = await scene('ranch-drawing', { dur: 9, mood, actions: acts }, `return { rms: A.rmsDb(b, 1, 5), peakRun: A.peakDb(b, 1, 7) };`);
    const raw = await scene('ranch-drawing-no-clipper', { dur: 9, mood, actions: acts, noClipper: true }, `return {};`, false);
    console.log(`with clipper: peak ${f1(a.peak)} dBFS, drawing RMS ${f1(a.rms)}; before the clipper ${f1(raw.peak)} dBFS; sucks ${a.stats.started['ranch.suck']} played, ${a.stats.dropped['ranch.suck'] ?? 0} dropped; steps ${(a.stats.started['ranch.step'] ?? 0) + (a.stats.started['ranch.stepstone'] ?? 0)}; max voices ${JSON.stringify(a.stats.maxVoices)}`);
    check('ranch drawing: peak below -1 dBFS', a.peak < -1, `${f1(a.peak)} dBFS`);
    check('ranch drawing barely needs the clipper (peak before it below +1 dBFS)', raw.peak < 1, `${f1(raw.peak)} dBFS before the soft clipper`);
    check('ranch drawing: 30 sucks a second all play', (a.stats.started['ranch.suck'] ?? 0) >= 115, `${a.stats.started['ranch.suck']} of 120`);
    check('ranch drawing: effect voices stay capped (40 or fewer)', a.stats.maxVoices.sfx <= 40, `${a.stats.maxVoices.sfx}`);
    report.numbers.ranchDrawing = { peak: a.peak, peakBeforeClipper: raw.peak, rms: a.rms, started: a.stats.started, dropped: a.stats.dropped, maxVoices: a.stats.maxVoices };
  }

  // ------------------------------------------------------------ rate limits on the busy cues
  if (run('rate')) {
    console.log('\n# Rate limits: chips, steps, sucks and hovers flooded');
    const acts = [];
    for (let k = 0; k < 200; k++) acts.push({ t: 0.5 + k * 0.01, cue: 'deck.chip' });
    for (let k = 0; k < 200; k++) acts.push({ t: 0.5 + k * 0.01, cue: 'deck.hover' });
    const d = await scene('rate-deck', { dur: 3, mood: { game: 'deck' }, actions: acts, mute: ['music', 'ambience'] }, `return {};`, false);
    const acts2 = [];
    for (let k = 0; k < 200; k++) acts2.push({ t: 0.5 + k * 0.01, cue: k % 2 ? 'ranch.step' : 'ranch.stepstone' });
    for (let k = 0; k < 200; k++) acts2.push({ t: 0.5 + k * 0.01, cue: 'ranch.suck' });
    const rr = await scene('rate-ranch', { dur: 3, mood: { game: 'ranch' }, actions: acts2, mute: ['music', 'ambience'] }, `return {};`, false);
    const S = { ...d.stats.started, ...rr.stats.started };
    const steps = (S['ranch.step'] ?? 0) + (S['ranch.stepstone'] ?? 0);
    console.log(`2 s at 100 a second: chips ${S['deck.chip']}, hovers ${S['deck.hover']}, steps ${steps}, sucks ${S['ranch.suck']}; voices deck ${JSON.stringify(d.stats.maxVoices)}, ranch ${JSON.stringify(rr.stats.maxVoices)}`);
    check('chip flood holds the limit (30 a second or fewer)', S['deck.chip'] <= 60, `${S['deck.chip']} in 2 s`);
    check('hover flood holds the limit (20 a second or fewer)', S['deck.hover'] <= 41, `${S['deck.hover']} in 2 s`);
    check('step flood holds the limit (12 a second or fewer, both grounds together)', steps <= 25, `${steps} in 2 s`);
    check('suck flood holds the limit (36 a second or fewer)', S['ranch.suck'] <= 72, `${S['ranch.suck']} in 2 s`);
    const walk = [];
    for (let k = 0; k < 21; k++) walk.push({ t: 0.5 + k / 7, cue: 'ranch.step' });
    const w = await scene('rate-walk', { dur: 4, mood: { game: 'ranch' }, actions: walk, mute: ['music', 'ambience'] }, `return {};`, false);
    check('a ranch walk (7 steps a second) plays every step', (w.stats.started['ranch.step'] ?? 0) === 21, `${w.stats.started['ranch.step']} of 21`);
    report.numbers.rateLimits = { chips: S['deck.chip'], hovers: S['deck.hover'], steps, sucks: S['ranch.suck'], walk: w.stats.started['ranch.step'] };
  }

  // ------------------------------------------------------------ loops: clean starts and stops
  if (run('loops')) {
    console.log('\n# Loops: sample discontinuity at every start, stop and change, against the loop\'s own steady sound');
    // First prove the detector: a constant started and stopped hard, as a loop with no fades would be.
    const control = await page.evaluate(async () => {
      const A = window.audioDev.analyse;
      const ctx = new OfflineAudioContext(2, 44100 * 3, 44100);
      const one = ctx.createConstantSource();
      const g = ctx.createGain();
      g.gain.value = 0.2;
      one.connect(g).connect(ctx.destination);
      one.start(1);
      one.stop(2.2);
      const b = await ctx.startRendering();
      return { rel: A.maxStep(b, 0.5, 2.9) / 0.2 };
    });
    check('the envelope check catches a hard start and stop (control reads a 100% step)', control.rel > 0.9, `${(control.rel * 100).toFixed(1)}%`);
    const loops = await page.evaluate(() => [...window.audioDev.loops]);
    const rows = {};
    for (const name of loops) {
      // On, a long steady hold, off, a rapid off-on-off-on, a gain change, a pitch, pan and gain change, off,
      // and a trip to another game and back while on.
      const toggles = [
        [0.5, true, {}], [5, false, {}], [5.3, true, {}], [5.34, false, {}], [5.38, true, {}], [7, true, { gain: 0.3 }], [7.6, true, { gain: 0.6, pitch: 0.9, pan: -0.3 }], [8.5, false, {}], [9, true, {}],
      ];
      const acts = toggles.map(([t, on, opts]) => ({ t, loop: name, on, opts }));
      acts.push({ t: 11, mood: { game: 'deck' } }, { t: 12.5, mood: { game: 'ranch' } }, { t: 14, loop: name, on: false });
      const ts = [...toggles.map((x) => x[0]), 11, 12.5, 14];
      // 1. The envelope itself: the loop's buffer replaced by a constant 1. A hard start or stop is a jump of the
      // whole level in one sample; a fade moves a few ten-thousandths. Every change must be smooth.
      const envR = await scene(`loop-envelope-${name.replace('.', '-')}`, { dur: 22, mood: { game: 'ranch', hour: 11 }, actions: acts, mute: ['music', 'ambience'], loopEnvelopes: true, volumes: { master: 0.3, music: 1, sfx: 1 } },
        `const ts = ${JSON.stringify(ts)}; return { level: A.peakDb(b, 3, 4.9), steps: ts.map((t) => A.maxStep(b, t - 0.003, t + 0.3)), whole: A.maxStep(b, 0.01, 21.9), tail: A.peakDb(b, 21, 22) };`, false);
      const lvl = Math.pow(10, envR.level / 20);
      const env = { level: lvl, worstStep: envR.whole, rel: envR.whole / lvl, steps: envR.steps.map((x) => Number((x / lvl).toFixed(5))) };
      // 2. The real sound: no step at an edge much bigger than the loop's own biggest while held steady for 4 s.
      // A quick off and on overlaps a fading voice with a new one, which may sum a little higher, so 1.5x.
      const r = await scene(`loop-${name.replace('.', '-')}`, { dur: 22, mood: { game: 'ranch', hour: 11 }, actions: acts, mute: ['music', 'ambience'] },
        `const ts = ${JSON.stringify(ts)}; return { steadyStep: A.maxStep(b, 0.9, 4.95), steps: ts.map((t) => A.maxStep(b, t - 0.003, t + 0.3)), tail: A.peakDb(b, 21, 22), level: A.rmsDb(b, 1.5, 4.9), away: A.rmsDb(b, 12.1, 12.45) };`, false);
      const worstStep = Math.max(...r.steps);
      rows[name] = { rmsDb: r.level, envelope: env, steadyStep: r.steadyStep, worstEdgeStep: worstStep, edgeSteps: r.steps.map((x) => Number(x.toFixed(4))), tailDb: r.tail, awayDb: r.away };
      console.log(`${name.padEnd(12)} RMS ${f1(r.level)} dBFS; envelope: biggest one-sample step ${(env.rel * 100).toFixed(3)}% of its level; sound: biggest step at an edge ${worstStep.toFixed(4)} vs ${r.steadyStep.toFixed(4)} held steady; in another game ${f1(r.away)} dBFS; after the stop ${f1(r.tail)} dBFS`);
      check(`${name}: the envelope never jumps (largest one-sample step under 0.5% of its level)`, env.rel < 0.005, `${(env.rel * 100).toFixed(3)}%`);
      check(`${name}: no step at a start, stop or change much bigger than the held sound's own (1.5x)`, worstStep <= r.steadyStep * 1.5, `x${(worstStep / r.steadyStep).toFixed(2)}`);
      check(`${name}: fades out with its game (under -60 dBFS from 1.1 s after switching to the deck)`, r.away < -60, `${f1(r.away)} dBFS`);
      check(`${name}: silent once stopped`, r.tail < -80, `${f1(r.tail)} dBFS`);
    }
    // The loop buffers themselves wrap without a seam.
    const seams = await page.evaluate((loops) => {
      const fx = { 'ranch.draw': 'bellows', 'ranch.wind': 'gust', 'ranch.water': 'brook', 'ranch.vents': 'vents' };
      const out = {};
      for (const n of loops) {
        const b = window.audioDev.bank.get(fx[n], 0);
        let worst = 0;
        let seam = 0;
        for (let c = 0; c < b.numberOfChannels; c++) {
          const d = b.getChannelData(c);
          for (let i = 1; i < d.length; i++) worst = Math.max(worst, Math.abs(d[i] - d[i - 1]));
          seam = Math.max(seam, Math.abs(d[0] - d[d.length - 1]));
        }
        out[n] = { seam, worst };
      }
      return out;
    }, loops);
    for (const [n, s] of Object.entries(seams)) check(`${n}: the loop buffer wraps without a seam`, s.seam <= s.worst, `seam step ${s.seam.toFixed(4)}, biggest step inside ${s.worst.toFixed(4)}`);
    report.numbers.loops = { rows, seams, control };
  }

  // ------------------------------------------------------------ listening files
  if (run('listen')) {
    console.log('\n# Listening files (game volumes, full mix)');
    const L = [
      ['music-homestead-day', { game: 'homestead', season: 0, hour: 10 }],
      ['music-homestead-night', { game: 'homestead', season: 0, hour: 23.4 }],
      ['music-deck-day', { game: 'deck', season: 0, hour: 12 }],
      ['music-deck-night', { game: 'deck', season: 1, hour: 22 }],
      ['music-ranch-day', { game: 'ranch', season: 0, hour: 11 }],
      ['music-ranch-night', { game: 'ranch', season: 1, hour: 23 }],
      ['music-ranch-day-autumn', { game: 'ranch', season: 2, hour: 15, weather: 'cloud' }],
      ['music-ranch-tension', { game: 'ranch', season: 0, hour: 18, intensity: 0.9 }],
      ['music-title', { game: 'title', scene: 'title', season: 0, hour: 9 }],
    ];
    for (const [name, mood] of L) {
      const r = await scene(name, { dur: 30, mood, volumes: GAME }, `return { rms: A.rmsDb(b, 2) };`);
      console.log(`${name.padEnd(26)} RMS ${f1(r.rms)} dBFS, peak ${f1(r.peak)}`);
    }
    // A ranch session: walk out, draw up a downy and tufts, puff them, chirps and boings, sell, a nettleback.
    const acts = [];
    let t = 0.5;
    for (let k = 0; k < 20; k++) acts.push({ t: t + k / 7, cue: 'ranch.step', opts: { pitch: 0.95 + (k % 3) * 0.04 } });
    t += 3;
    acts.push({ t, loop: 'ranch.draw', on: true }, { t: t + 0.3, cue: 'ranch.squeak', opts: { pan: 0.3 } });
    for (let k = 0; k < 40; k++) acts.push({ t: t + 0.4 + k * 0.06, cue: 'ranch.suck', opts: { pitch: k === 0 ? 0.6 : 1.3 + (k % 4) * 0.1 } });
    acts.push({ t: t + 3, loop: 'ranch.draw', on: false });
    t += 3.5;
    for (let k = 0; k < 4; k++) acts.push({ t: t + k * 0.5, cue: 'ranch.puff' }, { t: t + k * 0.5 + 0.35, cue: k % 2 ? 'ranch.boing' : 'ranch.chirp', opts: { pan: k % 2 ? -0.4 : 0.5 } });
    t += 2.5;
    acts.push({ t, cue: 'ranch.slot', opts: { pitch: 1 } }, { t: t + 0.3, cue: 'ranch.slot', opts: { pitch: 1.12 } }, { t: t + 0.8, cue: 'ranch.jump' }, { t: t + 1.4, cue: 'ranch.land', opts: { gain: 0.6 } });
    acts.push({ t: t + 2, cue: 'ranch.glide' }, { t: t + 3, cue: 'ranch.eat', opts: { pan: -0.3 } }, { t: t + 3.6, cue: 'ranch.shed', opts: { pan: -0.3 } }, { t: t + 4.2, cue: 'ranch.chirp', opts: { pan: 0.6, pitch: 1.2 } });
    t += 5;
    acts.push({ t, loop: 'ranch.wind', on: true, opts: { gain: 0.8 } }, { t: t + 3, loop: 'ranch.wind', on: false });
    acts.push({ t: t + 0.5, cue: 'ranch.sell' }, { t: t + 1.2, cue: 'ranch.coins', opts: { gain: 0.7 } }, { t: t + 2.2, cue: 'ranch.build' });
    t += 3.5;
    acts.push({ t, mood: { intensity: 0.8 } }, { t: t + 0.2, cue: 'ranch.nettle', opts: { pan: -0.6 } }, { t: t + 1.2, cue: 'ranch.frazzle', opts: { pan: 0.2 } }, { t: t + 2.2, cue: 'ranch.puff' }, { t: t + 2.45, cue: 'ranch.nettlehit', opts: { pan: -0.5 } });
    acts.push({ t: t + 4, mood: { intensity: 0 } });
    t += 5;
    acts.push({ t, loop: 'ranch.water', on: true, opts: { gain: 0.8 } }, { t: t + 1, cue: 'ranch.splash', opts: { pan: 0.4 } }, { t: t + 2.5, cue: 'ranch.gate' }, { t: t + 4, cue: 'ranch.goal' }, { t: t + 5.5, loop: 'ranch.water', on: false });
    t += 6;
    acts.push({ t, loop: 'ranch.vents', on: true, opts: { gain: 0.8 } }, { t: t + 3, loop: 'ranch.vents', on: false }, { t: t + 3.5, cue: 'ranch.sleep' });
    const s = await scene('ranch-session', { dur: t + 6, mood: { game: 'ranch', season: 0, hour: 16 }, actions: acts, volumes: GAME }, `return { rms: A.rmsDb(b, 1) };`);
    console.log(`ranch-session (${Math.round(t + 6)} s) RMS ${f1(s.rms)} dBFS, peak ${f1(s.peak)}`);
    check('ranch session peak below -1 dBFS', s.peak < -1, `${f1(s.peak)} dBFS`);
    // A deck turn at game volumes, for listening: draw, play, end the day, the cascade.
    const d = [];
    for (let k = 0; k < 5; k++) d.push({ t: 0.5, cue: 'deck.draw' });
    d.push({ t: 1.5, cue: 'deck.hover' }, { t: 1.8, cue: 'deck.hover' }, { t: 2.1, cue: 'deck.pick' }, { t: 2.6, cue: 'deck.play' }, { t: 2.9, cue: 'deck.plant' });
    d.push({ t: 3.6, cue: 'deck.pick' }, { t: 4, cue: 'deck.drop' }, { t: 4.5, cue: 'deck.pick' }, { t: 4.9, cue: 'deck.play' }, { t: 5.2, cue: 'deck.water', opts: { gain: 0.25 } });
    d.push({ t: 6, cue: 'deck.deny' }, { t: 6.6, cue: 'deck.pick' }, { t: 7, cue: 'deck.play' }, { t: 7.3, cue: 'deck.weather' }, { t: 8.5, cue: 'deck.endday' }, { t: 9.5, cue: 'deck.grow' });
    let c = 11;
    for (let h = 0; h < 8; h++) {
      d.push({ t: c, cue: 'deck.harvest', opts: { pitch: Math.pow(2, h / 12) } }, { t: c, mood: { intensity: Math.min(1, 0.2 + h * 0.11) } });
      for (let k = 0; k < 8; k++) d.push({ t: c + 0.06 + k * 0.025, cue: 'deck.chip', opts: { pitch: 1 + k * 0.05 } });
      d.push({ t: c + 0.32, cue: 'deck.mult', opts: { pitch: 1 + h * 0.15 } });
      c += 0.42;
    }
    d.push({ t: c + 0.1, cue: 'deck.big' }, { t: c + 1.5, cue: 'deck.quota' }, { t: c + 3, mood: { intensity: 0 } });
    d.push({ t: c + 4.5, cue: 'deck.buy' }, { t: c + 5.2, cue: 'deck.page' }, { t: c + 6, cue: 'deck.reroll' }, { t: c + 7, cue: 'deck.remove' }, { t: c + 8, cue: 'deck.shuffle' });
    d.push({ t: c + 9.5, cue: 'deck.pest' }, { t: c + 10.5, cue: 'deck.crow' }, { t: c + 12, cue: 'deck.fail' });
    const dk = await scene('deck-session', { dur: c + 16, mood: { game: 'deck', season: 0, hour: 12 }, actions: d, volumes: GAME }, `return { rms: A.rmsDb(b, 1) };`);
    console.log(`deck-session (${Math.round(c + 16)} s) RMS ${f1(dk.rms)} dBFS, peak ${f1(dk.peak)}`);
    check('deck session peak below -1 dBFS', dk.peak < -1, `${f1(dk.peak)} dBFS`);
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
      for (const c of ['tap', 'deny', 'toggle', 'deck.play', 'deck.chip', 'ranch.puff', 'ranch.step']) {
        await new Promise((r) => setTimeout(r, 600));
        const ctx = d.core().ctx;
        const t0 = ctx.currentTime;
        if (c.includes('.')) d.engine.cue(c);
        else d.engine.ui(c);
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
    // A loop through the live engine: the bellows, with music muted, then off again.
    const liveLoop = await page.evaluate(async () => {
      const d = window.audioDev;
      d.engine.setVolumes({ master: 1, music: 0, sfx: 1 });
      d.mood.game = 'ranch';
      d.mood.hour = 23.5;
      d.mood.season = 3;
      d.mood.weather = 'sun';
      await new Promise((r) => setTimeout(r, 2500));
      const an = d.core().analyser;
      const td = new Float32Array(an.fftSize);
      const level = async (ms) => {
        let s = 0;
        let n = 0;
        const w0 = performance.now();
        while (performance.now() - w0 < ms) {
          an.getFloatTimeDomainData(td);
          for (const v of td) s += v * v;
          n += td.length;
          await new Promise((r) => setTimeout(r, 30));
        }
        return 10 * Math.log10(s / Math.max(1, n) + 1e-18);
      };
      const before = await level(500);
      d.engine.loop('ranch.draw', true);
      for (let k = 0; k < 10; k++) d.engine.loop('ranch.draw', true);
      await new Promise((r) => setTimeout(r, 200));
      const on = await level(600);
      d.engine.loop('ranch.draw', false);
      await new Promise((r) => setTimeout(r, 600));
      const off = await level(500);
      const st = d.core().stats().heldLoops['ranch.draw'];
      d.engine.setVolumes({ master: 1, music: 1, sfx: 1 });
      return { before, on, off, starts: st.starts };
    });
    check('live: ranch.draw starts, holds and stops through the real engine over the night ambience (6 dB or more each way, one start for repeated calls)', liveLoop.on > liveLoop.before + 6 && liveLoop.off < liveLoop.on - 6 && liveLoop.starts === 1,
      `${f1(liveLoop.before)} dB before, ${f1(liveLoop.on)} on, ${f1(liveLoop.off)} after, ${liveLoop.starts} start`);
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
      // The ranch with the hour and the intensity moving every frame: the worst case for change detection.
      const fm = { ...m, game: 'ranch' };
      const c1 = c.moodChanges;
      t0 = performance.now();
      for (let k = 0; k < 3600; k++) {
        fm.hour = (k * 0.02) % 24;
        fm.intensity = 0.5 + 0.5 * Math.sin(k * 0.05);
        d.engine.mood(fm);
      }
      const moving = ((performance.now() - t0) / 3600) * 1000;
      return { sameUs: same, changesSame, movingUs: moving, changesMoving: c.moodChanges - c1 };
    });
    console.log(`mood(): ${cost.sameUs.toFixed(2)} us when nothing changed (${cost.changesSame} changes in 100000 calls); ${cost.movingUs.toFixed(1)} us a frame with the hour and intensity moving (${cost.changesMoving} changes in 3600 frames)`);
    check('mood() is cheap when nothing changes (under 2 us, no work done)', cost.sameUs < 2 && cost.changesSame === 0, `${cost.sameUs.toFixed(2)} us`);
    check('mood() with the hour and intensity moving every frame stays under 30 us a frame on average', cost.movingUs < 30, `${cost.movingUs.toFixed(1)} us`);
    report.numbers.moodCostUs = cost;
    // Let the live engine run for a while through every game, with cues and loops, then check errors.
    await page.evaluate(async () => {
      const d = window.audioDev;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      d.mood.weather = 'rain';
      for (const g of ['deck', 'ranch', 'homestead', 'title', 'ranch']) {
        d.mood.game = g;
        d.mood.scene = g === 'title' ? 'title' : 'farm';
        d.mood.hour = 12;
        if (g === 'ranch') d.engine.loop('ranch.water', true, { gain: 0.7 });
        for (let k = 0; k < 20; k++) d.engine.cue(k % 2 ? 'deck.chip' : 'ranch.suck', { pitch: 1 + k * 0.03 });
        await wait(900);
      }
      d.engine.loop('ranch.water', false);
    });
    await page.waitForTimeout(1000);
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
