// Mix balance: render each instrument of an arrangement alone and compare a
// rough loudness (band powers weighted like the ear's A curve). Prints a table
// relative to the lead, so a buried or overbearing part shows at a glance.
//
//   node scripts/audio-balance.mjs

import { openPage, startServer } from './audio-lib.mjs';

const ARR = {
  'homestead spring': { mood: { game: 'homestead', season: 0 }, parts: { lead: ['fiddle', 'banjo'], guitar: ['guitar'], bass: ['bass'], drums: ['kick', 'brush', 'tap', 'shaker'] } },
  'homestead autumn': { mood: { game: 'homestead', season: 2 }, parts: { lead: ['fiddle', 'banjo'], guitar: ['guitar'], bass: ['bass'], pad: ['pad'], drums: ['kick', 'brush'] } },
  'homestead winter': { mood: { game: 'homestead', season: 3 }, parts: { lead: ['fiddle', 'bell'], guitar: ['guitar'], bass: ['bass'], drums: ['sleigh'] } },
  'deck spring': { mood: { game: 'deck', season: 0 }, parts: { lead: ['celesta'], piano: ['piano'], pad: ['pad'], sprinkle: ['musicbox'] } },
  'deck scoring (intensity 1)': { mood: { game: 'deck', season: 0, intensity: 1 }, parts: { 'lead and lift': ['celesta'], piano: ['piano'], pad: ['pad'], 'pod and frame': ['pod', 'frame'] } },
  'ranch spring': { mood: { game: 'ranch', season: 0, hour: 11 }, parts: { 'flute lead': ['flute'], kalimba: ['kalimba'], harp: ['harp'], pad: ['pad'], drums: ['frame', 'tap', 'pod'] } },
  'ranch night': { mood: { game: 'ranch', season: 0, hour: 23 }, parts: { ocarina: ['flute'], harp: ['harp'], 'kalimba stars': ['kalimba'], pad: ['pad'] } },
  'ranch tension (intensity 1)': { mood: { game: 'ranch', season: 0, hour: 11, intensity: 1 }, parts: { 'flute lead': ['flute'], kalimba: ['kalimba'], harp: ['harp'], pad: ['pad'], drums: ['frame', 'tap', 'pod'] } },
  title: { mood: { game: 'title', scene: 'title' }, parts: { lead: ['piano', 'celesta'], guitar: ['guitar'], bass: ['bass'], pad: ['pad'] } },
  lullaby: { mood: { game: 'homestead', hour: 23.6 }, parts: { lead: ['musicbox'], arpeggio: ['guitar'], piano: ['piano'], pad: ['pad'] } },
};

const server = await startServer();
try {
  const { browser, page } = await openPage();
  await page.evaluate(() => window.audioDev.bank.finish());
  for (const [name, a] of Object.entries(ARR)) {
    const rows = await page.evaluate(async ({ a }) => {
      const d = window.audioDev;
      const base = d.defaultMood();
      const mood = { ...base, ...a.mood, rules: { ...base.rules, ...(a.mood.rules ?? {}) } };
      const W = [-16, -6, -1, 1, 1, -2];
      const loud = (b) => {
        const ch = d.analyse.character(b, 3, 30);
        const rms = d.analyse.rmsDb(b, 3, 30);
        // Band shares to dB, weighted, summed back in power.
        const p = ch.bands.reduce((s, v, i) => s + (v / 100) * Math.pow(10, W[i] / 10), 0);
        return rms + 10 * Math.log10(p + 1e-9);
      };
      const out = {};
      for (const [part, solo] of Object.entries(a.parts)) {
        const r = await d.render({ dur: 30, mood, mute: ['ambience'], solo });
        out[part] = { loud: loud(r.buffer), rms: d.analyse.rmsDb(r.buffer, 3, 30) };
      }
      const all = await d.render({ dur: 30, mood, mute: ['ambience'] });
      out.all = { loud: loud(all.buffer), rms: d.analyse.rmsDb(all.buffer, 3, 30) };
      return out;
    }, { a });
    const ref = Object.values(rows)[0].loud;
    console.log(`\n${name}`);
    for (const [part, v] of Object.entries(rows)) console.log(`  ${part.padEnd(28)} ${(v.loud - ref).toFixed(1).padStart(6)} dB vs lead   (RMS ${v.rms.toFixed(1)} dBFS)`);
  }
  await browser.close();
} finally {
  server.stop();
}
