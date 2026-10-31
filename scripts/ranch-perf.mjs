// Frame times for Thistledown while actually playing: walking, looking and
// drawing, at phone size (412 by 900 at DPR 2.6, touch, light quality) and at
// desk size. No screenshots in the timed window: they stall frames.
//   node scripts/ranch-perf.mjs [seconds]
import { launch, openRanch, frames, touchSession } from './ranch-lib.mjs';

const secs = Number(process.argv[2]) || 8;
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];

async function run(label, opts, drive) {
  const b = await launch();
  const { ctx, page, problems } = await openRanch(b, opts);
  await page.evaluate(() => {
    const r = window.ranch;
    const p = r.sim.s.player;
    // Start at the ranch gate looking out over the meadow: the busiest view.
    p.x = 0; p.z = 22; p.y = r.sim.phys.floor(0, 22); p.yaw = 0.15; p.pitch = -0.05;
  });
  await frames(page, 60);
  await page.evaluate(() => {
    window.__ft = [];
    window.__calls = 0;
    window.__tris = 0;
    let last = performance.now();
    const tick = (t) => {
      window.__ft.push(t - last);
      last = t;
      const i = window.ranch.renderInfo();
      window.__calls = Math.max(window.__calls, i.calls);
      window.__tris = Math.max(window.__tris, i.triangles);
      if (window.__ft.length < 100000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.ranch.cpu.length = 0;
  });
  await drive(page, ctx);
  const r = await page.evaluate(() => ({ ft: window.__ft.slice(5), cpu: window.ranch.cpu.slice(5), calls: window.__calls, tris: window.__tris, info: window.ranch.renderInfo(), q: window.ranch.renderer.getPixelRatio() }));
  const ft = [...r.ft].sort((a, b) => a - b);
  const cpu = [...r.cpu].sort((a, b) => a - b);
  const over = r.ft.filter((x) => x > 20).length;
  console.log(`${label}: ${r.ft.length} frames, interval p50 ${pct(ft, 0.5).toFixed(1)} p95 ${pct(ft, 0.95).toFixed(1)} p99 ${pct(ft, 0.99).toFixed(1)} max ${ft[ft.length - 1].toFixed(1)} ms, over 20 ms ${over} (${((100 * over) / r.ft.length).toFixed(1)}%)`);
  console.log(`  cpu per frame p50 ${pct(cpu, 0.5).toFixed(2)} p95 ${pct(cpu, 0.95).toFixed(2)} ms; draw calls max ${r.calls}, triangles max ${r.tris}; pixel ratio ${r.q}`);
  if (problems.length) console.log('  problems:', problems.slice(0, 5).join(' | '));
  await b.close();
  return { ...r, over };
}

// Phone: walk with the stick while looking with the other thumb, then draw.
await run('phone 412x900 dpr 2.6', { width: 412, height: 900, dpr: 2.6, touch: true }, async (page, ctx) => {
  const t = await touchSession(ctx, page);
  await t.send('touchStart', [[100, 720, 1]]);
  await t.send('touchMove', [[100, 660, 1]]);
  await t.send('touchStart', [[100, 660, 1], [300, 400, 2]]);
  const end = Date.now() + secs * 1000 * 0.7;
  let i = 0;
  while (Date.now() < end) {
    i++;
    await t.send('touchMove', [[100 + Math.sin(i * 0.05) * 30, 660, 1], [300 + Math.sin(i * 0.08) * 40, 400, 2]]);
    await page.waitForTimeout(32);
  }
  await t.send('touchEnd', [[100, 660, 1]]);
  await t.send('touchEnd', []);
  const draw = await page.evaluate(() => { const r = document.querySelector('.rt-draw').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await t.send('touchStart', [[draw[0], draw[1], 3]]);
  await page.waitForTimeout(secs * 1000 * 0.3);
  await t.send('touchEnd', []);
});

// Desk: keys and right-drag look, then draw.
await run('desk 1280x800 dpr 1', { width: 1280, height: 800, dpr: 1, query: 'nolock' }, async (page) => {
  await page.keyboard.down('KeyW');
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: 'right' });
  const end = Date.now() + secs * 1000;
  let i = 0;
  while (Date.now() < end) {
    i++;
    await page.mouse.move(640 + Math.sin(i * 0.05) * 200, 400 + Math.sin(i * 0.03) * 40);
    await page.waitForTimeout(32);
  }
  await page.mouse.up({ button: 'right' });
  await page.keyboard.up('KeyW');
});

await run('desk 1920x1080 dpr 2', { width: 1920, height: 1080, dpr: 2, query: 'nolock' }, async (page) => {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(secs * 1000);
  await page.keyboard.up('KeyW');
});
