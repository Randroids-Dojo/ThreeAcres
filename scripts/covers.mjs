// Captures the title-screen covers from the running games, so the title shows
// what each game actually looks like. Needs the dev server on :5247.
// node scripts/covers.mjs [homestead|ranch|deck ...]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = 'http://localhost:5247';
const want = process.argv.slice(2);
const games = want.length ? want : ['homestead', 'ranch', 'deck'];
const out = new URL('../public/covers/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

// Each game's best honest moment, set up through its own debug hook.
const setups = {
  homestead: async (p) => {
    await p.waitForFunction(() => window.sunup && window.sunup.frames > 30, null, { timeout: 30000 });
    await p.evaluate(() => {
      const s = window.sunup.state;
      const kinds = ['radish', 'lettuce', 'carrot', 'strawberry'];
      s.parcels[1].owned = true;
      for (const id of [0, 1]) {
        const pa = s.parcels[id];
        for (let y = pa.y; y < pa.y + pa.h; y++) {
          for (let x = pa.x; x < pa.x + pa.w; x++) {
            const pl = s.plots[y * s.W + x];
            pl.tilled = true;
            pl.wet = (x + y) % 3 !== 0;
            pl.moisture = pl.wet ? 3 : 1;
            const kind = kinds[(y - pa.y + id * 2) % 4];
            const days = { radish: 3, lettuce: 4, carrot: 5, strawberry: 6 }[kind];
            const age = Math.min(days, days * (0.55 + 0.15 * ((x * 7 + y * 3) % 4)));
            pl.crop = { id: x * 100 + y, kind, age, stage: age >= days ? 4 : age <= 0 ? 0 : Math.min(3, Math.max(1, Math.ceil((3 * age) / days))), dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: 1 };
          }
        }
      }
      const f = s.actors[0];
      f.x = 6.5;
      f.y = 6.5;
      f.facing = 'n';
      f.angle = -Math.PI / 2;
      s.minute = 800;
      s.day = 6;
      s.rules.camera = 'close';
      window.sunup['cams'].close.zoom = 0.72;
    });
  },
  ranch: async (p) => {
    await p.waitForFunction(() => window.ranch, null, { timeout: 30000 });
    await p.evaluate(() => window.ranch.cover?.());
  },
  deck: async (p) => {
    await p.waitForFunction(() => window.deck, null, { timeout: 30000 });
    // A few days of honest play so the plot has something growing.
    await p.evaluate(async () => {
      const d = window.deck;
      d.seed(20261031);
      d.fast(true);
      const wait = () => new Promise((r) => setTimeout(r, 60));
      for (let day = 0; day < 4; day++) {
        for (let tries = 0; tries < 12; tries++) {
          const hand = d.state().hand;
          let played = false;
          for (let i = 0; i < hand.length && !played; i++) for (let plot = 0; plot < 16 && !played; plot++) played = d.play(i, plot);
          if (!played) break;
          await wait();
        }
        d.endDay();
        for (let k = 0; k < 40 && d.busy(); k++) {
          d.skip();
          await wait();
        }
      }
    });
  },
};

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const id of games) {
  const p = await b.newPage({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 1.5 });
  await p.goto(`${base}/?game=${id}&fresh`);
  await setups[id](p);
  // Covers show the world, not the interface.
  await p.addStyleTag({ content: '.shellbtn, .hud, .toasts, .update { display: none !important; }' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}${id}.jpg`, type: 'jpeg', quality: 82 });
  console.log('cover', id);
  await p.close();
}
await b.close();
