// Shared helpers for the 3D renderer workbench scripts: launch Chrome with a
// real WebGL2 context, open the workbench, wait for frames, collect errors.
import { chromium } from 'playwright-core';

export const BASE = process.env.ACRES_URL || 'http://localhost:5249';

export async function launch() {
  return chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader=false'],
  });
}

/** Opens /?dev=3d at a size, waits for the renderer, returns the page and a log of problems. */
export async function openBench(browser, { width = 1280, height = 800, dpr = 1, fixture = 'lush' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || m.type() === 'warning' || /GL_|WebGL|THREE/.test(t)) problems.push(`[${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto(`${BASE}/?dev=3d&fixture=${fixture}`);
  await page.waitForFunction(() => window.harness && window.harness.frames > 5, null, { timeout: 30000 });
  return { ctx, page, problems };
}

/** Waits n animation frames inside the page. */
export async function frames(page, n) {
  await page.evaluate(
    (k) =>
      new Promise((res) => {
        let i = 0;
        const step = () => (++i >= k ? res() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n,
  );
}
