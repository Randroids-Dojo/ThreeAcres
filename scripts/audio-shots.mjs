// The audio workbench at desktop and phone widths, after a tap: screenshots,
// then every game, cue button and loop toggle pressed through the real page,
// checking that each one is there, makes the engine play, and throws nothing.
//   node scripts/audio-shots.mjs   (writes /tmp/acres-audio-2/workbench-*.png)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { URL, startServer } from './audio-lib.mjs';

const OUT = process.env.ACRES_AUDIO_OUT ?? '/tmp/acres-audio-2';
mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const server = await startServer();
try {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [w, h, name] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(URL);
    await page.waitForFunction(() => window.audioDev?.bank.ready);
    await page.mouse.click(5, 5);
    await page.waitForFunction(() => window.audioDev.core()?.ctx.state === 'running');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/workbench-${name}.png`, fullPage: name === 'desktop' });
    if (name === 'desktop') {
      const lists = await page.evaluate(() => ({ deck: [...window.audioDev.deckCues], ranch: [...window.audioDev.ranchCues], loops: [...window.audioDev.loops] }));
      // The game selector and the intensity slider drive the mood.
      for (const g of ['ranch', 'deck', 'homestead', 'title']) {
        await page.selectOption('label:has-text("Game") select', g);
        await page.waitForTimeout(150);
        const seen = await page.evaluate(() => window.audioDev.mood.game);
        check(`game selector sets ${g}`, seen === g, seen);
      }
      await page.locator('label:has-text("Intensity") input').fill('0.7');
      check('intensity slider sets the mood', (await page.evaluate(() => window.audioDev.mood.intensity)) === 0.7);
      // Every cue button: present, and pressing it starts that cue.
      const cards = { deck: 'Seedbound cues', ranch: 'Thistledown cues' };
      for (const [game, names] of [['deck', lists.deck], ['ranch', lists.ranch]]) {
        let missing = 0;
        let silent = [];
        for (const n of names) {
          const label = n.slice(n.indexOf('.') + 1);
          const btn = page.locator('.card', { hasText: cards[game] }).getByRole('button', { name: label, exact: true });
          if ((await btn.count()) !== 1) {
            missing++;
            continue;
          }
          // Let the last cue's voices drain first: pressing two dozen fanfares at once is the voice cap's job to refuse.
          await page.waitForFunction(() => window.audioDev.core().sfxVoices.live < 6, null, { timeout: 8000 });
          const before = await page.evaluate((n) => window.audioDev.core().stats().started[n] ?? 0, n);
          await btn.click();
          await page.waitForTimeout(60);
          const after = await page.evaluate((n) => window.audioDev.core().stats().started[n] ?? 0, n);
          if (after <= before) silent.push(n);
        }
        check(`a button for every ${game} cue (${names.length})`, missing === 0, `${missing} missing`);
        check(`every ${game} cue button plays its cue`, silent.length === 0, silent.join(', '));
      }
      // Every loop toggle: on, then off.
      for (const l of lists.loops) {
        const btn = page.locator('.card', { hasText: 'Thistledown cues' }).getByRole('button', { name: l.slice(6), exact: true });
        await btn.click();
        await page.waitForTimeout(300);
        const on = await page.evaluate((l) => window.audioDev.core().stats().heldLoops[l], l);
        await btn.click();
        await page.waitForTimeout(100);
        const off = await page.evaluate((l) => window.audioDev.core().stats().heldLoops[l], l);
        check(`loop toggle ${l} turns it on and off`, on?.sounding === true && off?.on === false, `${JSON.stringify(on)} then ${JSON.stringify(off)}`);
      }
      // The scenario buttons run without errors.
      for (const b of ['Cascade: 8 harvests, 40 chips a second', 'Draw 3 s, 30 sucks a second', 'Walk 3 s on grass', 'Nettleback near']) {
        await page.getByRole('button', { name: b }).click();
        await page.waitForTimeout(b.startsWith('Nettle') ? 800 : 3600);
      }
      const st = await page.evaluate(() => window.audioDev.core().stats());
      check('scenario buttons played chips, sucks and steps', (st.started['deck.chip'] ?? 0) > 30 && (st.started['ranch.suck'] ?? 0) > 60 && (st.started['ranch.step'] ?? 0) > 15,
        `chips ${st.started['deck.chip']}, sucks ${st.started['ranch.suck']}, steps ${st.started['ranch.step']}`);
      check('the engine reports no errors', st.errors === 0, st.lastError);
      await page.screenshot({ path: `${OUT}/workbench-desktop-after.png`, fullPage: true });
    }
    check(`${name}: no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.close();
  }
  await browser.close();
} finally {
  server.stop();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
