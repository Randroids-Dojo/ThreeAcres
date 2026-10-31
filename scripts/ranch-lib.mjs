// Shared helpers for Thistledown's scripted checks: launch Chrome with a real
// GPU, open the ranch at a size, wait for frames, collect console problems,
// and drive real input (keys, mouse, CDP touch).
import { chromium } from 'playwright-core';

export const BASE = process.env.RANCH_URL || 'http://localhost:5251';

export async function launch() {
  return chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
}

/**
 * Opens the ranch. opts: width, height, dpr, touch, query (extra URL flags), fresh,
 * lessons (false: everything already taught, for checks of single features).
 */
export async function openRanch(browser, { width = 1280, height = 800, dpr = 1, touch = false, query = '', fresh = true, lessons = false, ctx: existing } = {}) {
  const ctx = existing ?? (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch }));
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|Automatic fallback|DevTools/.test(t))) problems.push(`[${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto(`${BASE}/?game=ranch${fresh ? '&fresh' : ''}${lessons ? '' : '&taught'}${query ? `&${query}` : ''}`);
  await page.waitForFunction(() => window.ranch && window.ranch.frames > 8, null, { timeout: 60000 });
  return { ctx, page, problems };
}

export async function frames(page, n) {
  await page.evaluate((k) => new Promise((res) => { let i = 0; const step = () => (++i >= k ? res() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
}

export function touchSession(ctx, page) {
  return ctx.newCDPSession(page).then((cdp) => ({
    send: (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) }),
  }));
}

export function checker() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  };
  return { results, check, failed: () => results.filter((r) => !r.ok).length };
}

export const S = (page) => page.evaluate(() => {
  const r = window.ranch;
  const s = r.sim.s;
  const p = s.player;
  return {
    x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, coins: s.coins, day: s.day, hour: s.hour,
    slots: s.slots.map((q) => [q.t, q.n]), sel: s.sel,
    downies: s.downies.filter((d) => !d.gone).length,
    penned: s.downies.filter((d) => !d.gone && d.pen >= 0).length,
    items: s.items.filter((i) => !i.gone).length,
    tufts: s.items.filter((i) => !i.gone && i.type.startsWith('tuft')).length,
    pads: s.pads.map((q) => q.kind), goals: [...s.goals], sold: s.stats.sold, fed: s.stats.fed,
    menu: r.menuOpen(), paused: r.paused, running: r.isRunning, frames: r.frames, held: r.anyHeld(),
  };
});
