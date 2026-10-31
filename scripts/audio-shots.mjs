// Screenshots of the audio workbench at desktop and phone widths, after a tap.
//   node scripts/audio-shots.mjs   (writes /tmp/acres-audio/workbench-*.png)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { URL, startServer } from './audio-lib.mjs';

mkdirSync('/tmp/acres-audio', { recursive: true });
const server = await startServer();
try {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [w, h, name] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(URL);
    await page.waitForFunction(() => window.audioDev?.bank.ready);
    await page.mouse.click(5, 5);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `/tmp/acres-audio/workbench-${name}.png`, fullPage: name === 'desktop' });
    await page.close();
  }
  await browser.close();
} finally {
  server.stop();
}
