// Mix balance: render each instrument of an arrangement alone and compare a
// rough loudness (band powers weighted like the ear's A curve). Prints a table
// relative to the lead, so a buried or overbearing part shows at a glance.
//
//   node scripts/audio-balance.mjs

import { openPage, startServer } from './audio-lib.mjs';

const ARR = {
  'day spring': { mood: { rules: { clock: 'day' }, season: 0 }, parts: { lead: ['fiddle', 'banjo'], guitar: ['guitar'], bass: ['bass'], drums: ['kick', 'brush', 'tap', 'shaker'] } },
  'day autumn': { mood: { rules: { clock: 'day' }, season: 2 }, parts: { lead: ['fiddle', 'banjo'], guitar: ['guitar'], bass: ['bass'], pad: ['pad'], drums: ['kick', 'brush'] } },
  'day winter': { mood: { rules: { clock: 'day' }, season: 3 }, parts: { lead: ['fiddle', 'bell'], guitar: ['guitar'], bass: ['bass'], drums: ['sleigh'] } },
  'turns spring': { mood: { rules: { clock: 'turns' }, season: 0 }, parts: { lead: ['celesta'], piano: ['piano'], pad: ['pad'], sprinkle: ['musicbox'] } },
  'flow x1': { mood: { rules: { clock: 'flow' }, speed: 1 }, parts: { lead: ['marimba'], bass: ['bass'], drums: ['kick', 'block', 'shaker'] } },
  'flow x4': { mood: { rules: { clock: 'flow' }, speed: 4 }, parts: { 'marimba (lead and ostinato)': ['marimba'], counter: ['musicbox'], banjo: ['banjo'], bass: ['bass'], drums: ['kick', 'block', 'shaker', 'tamb'] } },
  title: { mood: { scene: 'title' }, parts: { lead: ['piano', 'celesta'], guitar: ['guitar'], bass: ['bass'], pad: ['pad'] } },
  lullaby: { mood: { hour: 23.6, rules: { clock: 'day' } }, parts: { lead: ['musicbox'], arpeggio: ['guitar'], piano: ['piano'], pad: ['pad'] } },
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
