// The plate's caption against the printed frame, measured. At each size it
// repaints the frame's rules in magenta, reads the board canvas back, and
// counts rule pixels inside the caption's glyph box (from measureText at the
// caption's own font and baseline). It also reports the gap between the
// caption's lowest ink and the hairline. Any rule pixel in the box fails.
// node scripts/deck-caption.mjs [base url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5252';
const out = '/tmp/deck-lessons/caption';
mkdirSync(out, { recursive: true });
const SIZES = [
  ['pixel', 412, 838, true],
  ['phone-900', 412, 900, true],
  ['small-phone', 360, 740, true],
  ['tablet', 820, 1180, true],
  ['desktop', 1280, 800, false],
  ['wide', 1440, 900, false],
  ['short', 1024, 600, false],
  ['landscape-phone', 915, 412, true],
];
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
let failed = 0;
for (const [name, w, h, touch] of SIZES) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  await p.evaluate(() => {
    const bd = window.deck.table.board;
    bd.ruleInk = '#ff00ff';
    bd.repaint();
  });
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => {
    const bd = window.deck.table.board;
    const c = bd.canvas;
    const g = c.getContext('2d');
    const cap = Math.round(Math.max(11, bd.T * 0.16));
    g.save();
    g.font = `italic 500 ${cap}px 'Fraunces Variable', Georgia, serif`;
    g.textAlign = 'center';
    const m = g.measureText(bd.caption);
    g.restore();
    const cx = bd.px0 + bd.pw / 2;
    const base = bd.captionBaseline;
    const box = { l: cx - m.actualBoundingBoxLeft, r: cx + m.actualBoundingBoxRight, t: base - m.actualBoundingBoxAscent, b: base + m.actualBoundingBoxDescent };
    // Read back the board (device pixels) over the caption box, one pixel wider all round.
    const k = c.width / bd.w;
    const x0 = Math.floor((box.l - 1) * k);
    const y0 = Math.floor((box.t - 1) * k);
    const x1 = Math.ceil((box.r + 1) * k);
    const y1 = Math.ceil((box.b + 1) * k);
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let rule = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 110 && d[i + 2] > 180) rule++;
    // And the rule is really there: magenta along the hairline under the caption.
    const hy = Math.round(bd.frameRules.hair * k);
    const line = g.getImageData(Math.round(cx * k) - 20, hy - 2, 40, 4).data;
    let onLine = 0;
    for (let i = 0; i < line.length; i += 4) if (line[i] > 180 && line[i + 1] < 110 && line[i + 2] > 180) onLine++;
    return { T: bd.T, botM: bd.botM, cap, box, hair: bd.frameRules.hair, heavy: bd.frameRules.heavy, gap: bd.frameRules.hair - 0.3 - box.b, rule, onLine, layout: window.deck.table.layout };
  });
  const ok = r.rule === 0 && r.onLine > 0 && r.gap > 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${w}x${h} (${r.layout}): T ${r.T}, margin ${r.botM}, caption ink ${r.box.t.toFixed(1)} to ${r.box.b.toFixed(1)}, hairline ${r.hair.toFixed(1)}, gap ${r.gap.toFixed(1)} px, rule pixels in the caption box ${r.rule}${r.onLine ? '' : ' (no rule found: check broken)'}`);
  // A crop of the caption as drawn (rules in their own ink).
  await p.evaluate(() => {
    const bd = window.deck.table.board;
    bd.ruleInk = null;
    bd.repaint();
  });
  await p.waitForTimeout(200);
  const br = await p.evaluate(() => { const bd = window.deck.table.board; const c = bd.canvas.getBoundingClientRect(); return { x: c.left + bd.px0, y: c.top + bd.by + bd.T * bd.rows - 6, w: bd.pw, h: bd.py0 + bd.ph - (bd.by + bd.T * bd.rows) + 12 }; });
  await p.screenshot({ path: `${out}/after-${name}.png`, clip: { x: br.x, y: br.y, width: br.w, height: br.h } });
  await p.close();
}
await b.close();
console.log(failed ? `CAPTION FAILED (${failed})` : 'CAPTION OK', `crops in ${out}`);
process.exit(failed ? 1 : 0);
