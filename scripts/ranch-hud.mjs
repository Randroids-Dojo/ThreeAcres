// The HUD on a desk screen and a phone, in the states a player meets: the
// first moments, carrying things, a post's tags, the journal page, the pause
// page, the Exchange board up close, and night.
//   node scripts/ranch-hud.mjs [outdir]
import fs from 'node:fs';
import { launch, openRanch, frames, touchSession } from './ranch-lib.mjs';

// A URL is not a folder: the base comes from RANCH_URL (ranch-lib.mjs).
const out = process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : '/tmp/ranch/hud';
fs.mkdirSync(out, { recursive: true });
const b = await launch();
for (const [dev, w, h, dpr, touch] of [['desk', 1280, 800, 1, false], ['phone', 412, 900, 2.6, true]]) {
  const { ctx, page } = await openRanch(b, { width: w, height: h, dpr, touch, query: touch ? '' : 'nolock' });
  const shot = (n) => page.screenshot({ path: `${out}/${dev}-${n}.png` });
  if (touch) {
    const t = await touchSession(ctx, page);
    await t.send('touchStart', [[300, 300, 1]]);
    await t.send('touchEnd', []);
  }
  await frames(page, 20);
  await shot('1-start');
  await page.evaluate(() => {
    const r = window.ranch;
    const sim = r.sim;
    sim.s.hints.push('look', 'move', 'draw', 'puff');
    for (let i = 0; i < 7; i++) sim.stow('cloverhead');
    sim.stow('clover');
    sim.stow('tuft-clover');
    sim.stow('tuft-clover');
    sim.s.journal = true;
    const p = sim.s.player;
    p.x = 1; p.z = 30; p.y = sim.phys.floor(1, 30);
    r.aimAt(6, sim.phys.floor(6, 26.5) + 0.5, 26.5);
  });
  await page.waitForTimeout(900);
  await shot('2-carrying');
  await page.evaluate(() => { const r = window.ranch; const p = r.sim.s.player; p.x = 26; p.z = 34.2; p.y = r.sim.phys.floor(26, 34.2); r.aimAt(25.8, r.sim.phys.floor(25.8, 31.8) + 1.4, 31.8); });
  await frames(page, 5);
  if (touch) {
    const act = await page.evaluate(() => { const r = document.querySelector('.rt-act').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    const t = await touchSession(ctx, page);
    await t.send('touchStart', [[act[0], act[1], 2]]);
    await t.send('touchEnd', []);
  } else await page.keyboard.press('KeyE');
  await page.waitForTimeout(900);
  await shot('3-tags');
  // Walk off to fold the tags (no keys on the phone: a key switches the HUD to keyboard).
  await page.evaluate(() => { const r = window.ranch; const p = r.sim.s.player; p.x = 26; p.z = 38; });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const r = window.ranch; const p = r.sim.s.player; p.x = -3.2; p.z = 34.6; p.y = r.sim.phys.floor(-3.2, 34.6); r.aimAt(-4.2, r.sim.phys.floor(-4.2, 37.6) + 1.62, 37.6); });
  await page.waitForTimeout(500);
  await shot('4-board');
  await page.evaluate(() => { window.ranch.sim.complete('pen'); });
  await page.waitForTimeout(1400);
  await shot('5-journal');
  const pauseIt = async () => {
    if (!touch) return page.keyboard.press('Escape');
    const t = await touchSession(ctx, page);
    const c = await page.evaluate(() => { const e = document.querySelector('.rh-pause.on [data-act=resume]') ?? document.querySelector('.rt-pause'); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await t.send('touchStart', [[c[0], c[1], 7]]);
    await t.send('touchEnd', []);
  };
  await pauseIt();
  await page.waitForTimeout(400);
  await shot('6-pause');
  await pauseIt();
  await page.evaluate(() => { const r = window.ranch; r.sim.s.hour = 22.4; const p = r.sim.s.player; p.x = 10; p.z = 33; p.y = r.sim.phys.floor(10, 33); p.yaw = 1.9; p.pitch = 0.02; });
  await page.waitForTimeout(600);
  await shot('7-night');
  await page.close();
}
await b.close();
