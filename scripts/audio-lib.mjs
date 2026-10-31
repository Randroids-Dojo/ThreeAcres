// Shared helpers for the audio checks: our own Vite server on 5250 and a
// headless Chrome page on the audio workbench.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

export const PORT = 5250;
export const URL = `http://localhost:${PORT}/?dev=audio`;

export async function startServer() {
  // Its own process group, so stopping it takes down npx and the Vite under it together.
  const vite = spawn('npx', ['vite', '--config', 'scripts/audio-vite.config.ts'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const stop = () => {
    try {
      process.kill(-vite.pid, 'SIGTERM');
    } catch {
      vite.kill('SIGTERM');
    }
  };
  let log = '';
  vite.stdout.on('data', (d) => (log += d));
  vite.stderr.on('data', (d) => (log += d));
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.ok) break;
    } catch {}
    if (Date.now() - t0 > 30000) {
      stop();
      throw new Error(`vite did not start:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { stop, log: () => log };
}

export async function openPage() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && m.text().startsWith('[audio]'))) errors.push(`console.${m.type()}: ${m.text()}`);
  });
  await page.goto(URL);
  await page.waitForFunction(() => !!window.audioDev, null, { timeout: 30000 });
  return { browser, page, errors };
}
