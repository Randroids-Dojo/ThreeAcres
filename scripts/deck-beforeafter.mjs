// Before and after crops for a review: the committed build (served from a
// git archive export) against the working copy, on the 412 by 838 phone.
// Crops: the first screen, a card face (carrot and radish), a teaching note,
// a held card over a carrot, and what a card costs (the card's corner and the
// scoops on the bench). Writes /tmp/deck-lessons/ba/{before,after}-*.png.
// node scripts/deck-beforeafter.mjs [before url] [after url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const before = process.argv[2] ?? 'http://localhost:5255';
const after = process.argv[3] ?? 'http://localhost:5252';
const out = '/tmp/deck-lessons/ba';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });

async function page(base, q = 'game=deck&fresh', vp = { width: 412, height: 838 }) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(`${base}/?${q}`);
  if (q.includes('deckart')) await p.waitForTimeout(2500);
  else await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  await p.waitForTimeout(500);
  return { p, ctx };
}
const rect = (p, sel, pad = 4) => p.evaluate(([sel, pad]) => { const e = typeof sel === 'string' ? document.querySelector(sel) : null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad), width: r.width + pad * 2, height: Math.min(r.height + pad * 2, innerHeight - Math.max(0, r.top - pad)) }; }, [sel, pad]);
const settle = (p, ms = 700) => p.waitForTimeout(ms);
const night = async (p) => {
  await p.evaluate(() => window.deck.endDay());
  await settle(p, 200);
  await p.evaluate(() => window.deck.skip());
  await settle(p, 900);
};
const idx = (p, id) => p.evaluate((id) => window.deck.state().hand.findIndex((c) => c.id === id), id);

for (const [tag, base] of [['before', before], ['after', after]]) {
  // 1. The first screen.
  {
    const { p, ctx } = await page(base);
    await p.screenshot({ path: `${out}/${tag}-first.png` });
    await ctx.close();
  }
  // 2. Card faces, from the card sheet.
  {
    const { p, ctx } = await page(base, 'game=deck&deckart', { width: 412, height: 900 });
    for (const name of ['Carrot', 'Radish', 'Watering Can']) {
      const r = await p.evaluate((n) => { const e = document.querySelector(`img[alt="${n}"]`); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left, y: q.top, width: q.width, height: q.height }; }, name);
      await p.screenshot({ path: `${out}/${tag}-face-${name.toLowerCase().replace(' ', '-')}.png`, clip: r });
    }
    await ctx.close();
  }
  // 3. A teaching note about bloom, a held radish over a carrot, and cost.
  {
    const { p, ctx } = await page(base);
    if (tag === 'before') {
      // The old first day: carrot, radish beside it, water the row, end the day; day 2 explains bloom.
      await p.evaluate(() => window.deck.play(0, 5));
      await settle(p);
      // Held radish over the plot next to the carrot: what the old board showed.
      await p.evaluate(() => { const t = window.deck.table; t.pickUp(t.run.hand.find((c) => c.id === 'radish').uid); });
      await settle(p, 300);
      await p.screenshot({ path: `${out}/${tag}-held.png`, clip: await rect(p, '.sb-boardwrap', 0) });
      await p.screenshot({ path: `${out}/${tag}-cost.png`, clip: { x: 0, y: 600, width: 412, height: 238 } });
      await p.evaluate(() => window.deck.table.putDown(true));
      await p.evaluate(() => window.deck.play(window.deck.state().hand.findIndex((c) => c.id === 'radish'), 6));
      await settle(p);
      await p.evaluate(() => window.deck.play(window.deck.state().hand.findIndex((c) => c.id === 'can'), 5));
      await settle(p);
      await night(p);
    } else {
      await p.evaluate(() => window.deck.play(0, 5));
      await settle(p);
      await p.evaluate(() => window.deck.play(0, 10));
      await settle(p);
      await night(p);
      await p.evaluate(() => window.deck.play(0, 5));
      await settle(p);
      // Held radish next to the carrot: the plots beside it show +2.
      await p.evaluate(() => { const t = window.deck.table; t.pickUp(t.run.hand.find((c) => c.id === 'radish').uid); });
      await settle(p, 300);
      await p.screenshot({ path: `${out}/${tag}-held.png`, clip: await rect(p, '.sb-boardwrap', 0) });
      await p.evaluate(() => window.deck.table.putDown(true));
      await p.evaluate(() => window.deck.play(window.deck.state().hand.findIndex((c) => c.id === 'radish'), 6));
      await settle(p);
      await p.evaluate(() => window.deck.play(0, 15));
      await settle(p);
      await night(p);
      await settle(p, 400);
    }
    await p.screenshot({ path: `${out}/${tag}-note-screen.png` });
    await p.screenshot({ path: `${out}/${tag}-note.png`, clip: await rect(p, '.sb-hint', 10) });
    if (tag === 'after') {
      // Cost: plant two radishes round the carrot; the scoops arrive, then take up the carrot.
      await p.evaluate(() => window.deck.play(window.deck.state().hand.findIndex((c) => c.id === 'radish'), 4));
      await settle(p);
      await p.evaluate(() => window.deck.play(window.deck.state().hand.findIndex((c) => c.id === 'radish'), 1));
      await settle(p, 900);
      await p.evaluate(() => { const t = window.deck.table; t.pickUp(t.run.hand.find((c) => c.id === 'carrot').uid); });
      await settle(p, 500);
      await p.screenshot({ path: `${out}/${tag}-cost.png`, clip: { x: 0, y: 600, width: 412, height: 238 } });
      await p.evaluate(() => window.deck.play(window.deck.state().hand.findIndex((c) => c.id === 'carrot'), 13));
      await settle(p, 700);
      await p.screenshot({ path: `${out}/${tag}-cost-dear.png`, clip: { x: 0, y: 600, width: 412, height: 238 } });
    }
    await ctx.close();
  }
}
await b.close();
console.log(`crops in ${out}`);
