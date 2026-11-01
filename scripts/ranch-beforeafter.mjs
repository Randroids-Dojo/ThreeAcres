// Before and after captures for the UI changes. "Before" for the whole game
// is the placeholder it replaced. For layout fixes made during review, the
// old values are restored in the page (labelled as restored).
//   node scripts/ranch-beforeafter.mjs [outdir]
import fs from 'node:fs';
import { launch, openRanch, frames, touchSession, BASE } from './ranch-lib.mjs';

// A URL is not a folder: the base comes from RANCH_URL (ranch-lib.mjs).
const out = process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : '/tmp/ranch/before-after';
fs.mkdirSync(out, { recursive: true });
const b = await launch();

// 1. The placeholder this replaced, as it rendered (markup from the last commit, with the app's styles).
{
  const page = await b.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/?dev=none`);
  await page.waitForFunction(() => window.shell);
  await page.waitForTimeout(500);
  // The app's fonts and styles are loaded now; show the old placeholder in place of everything.
  await page.evaluate(() => {
    document.getElementById('app').innerHTML = '<div class="gameroot" data-game="ranch"><div class="soon"><b>Thistledown</b><span>Being built.</span></div></div>';
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/1-before-placeholder.png` });
  await page.close();
}
const phone = await openRanch(b, { width: 412, height: 900, dpr: 2.6, touch: true });
const t = await touchSession(phone.ctx, phone.page);
await t.send('touchStart', [[300, 300, 1]]);
await t.send('touchEnd', []);
await frames(phone.page, 20);
await phone.page.screenshot({ path: `${out}/1-after-start.png` });

// 2. Phone layout: the bellows as first built (full size, under the buttons) against now.
await phone.page.evaluate(() => {
  const r = window.ranch;
  const sim = r.sim;
  for (let i = 0; i < 5; i++) sim.stow('cloverhead');
  sim.stow('tuft-clover');
  sim.s.hints.push('look', 'move', 'draw', 'puff', 'slot');
  const p = sim.s.player;
  p.x = 1; p.z = 30; p.y = sim.phys.floor(1, 30);
  r.aimAt(6, sim.phys.floor(6, 26.5) + 0.5, 26.5);
});
await frames(phone.page, 10);
const restoreOld = () => phone.page.evaluate(() => {
  const vm = window.ranch.vm;
  vm.scale = 0.86;
  vm.baseX = 0.2 * 0.42;
  vm.baseY = -0.27;
  vm.rig.scale.setScalar(0.86);
  const st = document.createElement('style');
  st.id = 'old';
  st.textContent = `.rt-draw { right: 18px !important; bottom: 118px !important; width: 88px !important; height: 88px !important; }
  .rt-puff { right: 116px !important; bottom: 176px !important; width: 66px !important; height: 66px !important; }
  .rt-jump { right: 28px !important; bottom: 220px !important; width: 58px !important; height: 58px !important; }
  .rh.rh-touch .rh-prompt { display: flex !important; }`;
  document.head.append(st);
});
const restoreNew = () => phone.page.evaluate(() => {
  document.getElementById('old')?.remove();
  const r = window.ranch;
  r.vm.resize(innerWidth / innerHeight, 72, true);
});
await restoreOld();
await frames(phone.page, 8);
await phone.page.screenshot({ path: `${out}/2-before-phone-bellows-restored.png` });
await restoreNew();
await frames(phone.page, 8);
await phone.page.screenshot({ path: `${out}/2-after-phone-bellows.png` });

// 3. Phone tags: the middle prompt sat over the picked tag; now the Use button carries the label.
await phone.page.evaluate(() => { const r = window.ranch; const p = r.sim.s.player; p.x = 26; p.z = 34.2; p.y = r.sim.phys.floor(26, 34.2); r.aimAt(25.8, r.sim.phys.floor(25.8, 31.8) + 1.4, 31.8); });
await frames(phone.page, 5);
const act = await phone.page.evaluate(() => { const r = document.querySelector('.rt-act').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await t.send('touchStart', [[act[0], act[1], 2]]);
await t.send('touchEnd', []);
await phone.page.waitForTimeout(900);
await restoreOld();
await phone.page.evaluate(() => window.ranch.tags.setHot(1));
await frames(phone.page, 6);
await phone.page.screenshot({ path: `${out}/3-before-phone-tags-restored.png` });
await restoreNew();
await frames(phone.page, 6);
await phone.page.screenshot({ path: `${out}/3-after-phone-tags.png` });
await b.close();
