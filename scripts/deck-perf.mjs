// Frame times during a big scoring cascade at phone size (412 by 900, DPR 2.6
// capped to 2 by the board). Stages a full plot where all sixteen crops ripen
// with neighbour bonuses, ends the day, and records every animation frame's
// interval and the table's own frame cost until the night is over. No
// screenshots in the timed window. Runs once as is and once with the CPU
// throttled 4x as a rough stand-in for a phone.
// node scripts/deck-perf.mjs [base url]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5252';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const errs = [];

async function run(throttle) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2.6, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5);
  await p.evaluate(() => {
    const d = window.deck;
    d.seed(31337);
    const s = d.state();
    s.pages = ['bees', 'market', 'clover'];
    s.season = 2;
    s.quota = 240;
    const kinds = ['radish', 'sunflower', 'carrot', 'beans', 'radish', 'carrot', 'beans', 'corn', 'strawberry', 'lettuce', 'sunflower', 'chili', 'wheat', 'wheat', 'pumpkin', 'garlic'];
    const days = { radish: 1, carrot: 2, lettuce: 2, beans: 3, corn: 4, sunflower: 3, pumpkin: 5, strawberry: 3, mint: 2, garlic: 2, wheat: 3, chili: 2 };
    kinds.forEach((kind, i) => {
      s.plots[i].crop = { uid: 5000 + i, kind, age: days[kind] - 1, days: days[kind], up: i % 3 === 0, compost: i % 4 === 0 ? 1 : 0, rot: false, picks: 0, pest: 0, sprout: false };
      s.plots[i].wet = true;
    });
    s.tonight = ['sun'];
    d.table.syncAll();
  });
  await p.waitForTimeout(600);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const d = window.deck;
    const iv = [];
    let last = performance.now();
    let on = true;
    const tick = (now) => {
      iv.push(now - last);
      last = now;
      if (on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const ms0 = d.frameMs().length;
    const t0 = performance.now();
    d.endDay();
    const harvests = d.ruleScores().slice(-16);
    await new Promise((res) => {
      const poll = () => (d.busy() ? setTimeout(poll, 50) : res());
      poll();
    });
    on = false;
    const total = performance.now() - t0;
    const js = d.frameMs().slice(ms0);
    return { iv: iv.slice(1), js, total, harvests };
  });
  await ctx.close();
  const q = (a, k) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * k))];
  };
  const over = (a, ms) => a.filter((x) => x > ms).length;
  return {
    throttle,
    frames: r.iv.length,
    nightMs: Math.round(r.total),
    harvests: r.harvests.length,
    best: Math.max(...r.harvests),
    intervalP50: q(r.iv, 0.5).toFixed(1),
    intervalP95: q(r.iv, 0.95).toFixed(1),
    intervalMax: Math.max(...r.iv).toFixed(1),
    over20: over(r.iv, 20),
    over33: over(r.iv, 33.4),
    jsP50: q(r.js, 0.5).toFixed(2),
    jsP95: q(r.js, 0.95).toFixed(2),
    jsMax: Math.max(...r.js).toFixed(2),
  };
}

for (const t of [1, 4]) {
  const r = await run(t);
  console.log(`cpu x${r.throttle}: ${r.harvests} harvests (best ${r.best}) over ${r.nightMs} ms, ${r.frames} frames`);
  console.log(`  frame interval ms: p50 ${r.intervalP50}, p95 ${r.intervalP95}, max ${r.intervalMax}; over 20 ms: ${r.over20}, over 33 ms: ${r.over33}`);
  console.log(`  table frame cost ms (js): p50 ${r.jsP50}, p95 ${r.jsP95}, max ${r.jsMax}`);
}
console.log(errs.length ? `errors: ${errs.join(' | ')}` : 'no errors');
await b.close();
