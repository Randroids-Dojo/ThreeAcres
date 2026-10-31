// Overlapping pieces on Seedbound's table, measured. Puts the game in each
// state (the guided first day, a fresh day, a card held, a card tossed, the
// scoring cascade, the stall, the run's end) on a 412 by 838 phone and a
// 1280 by 800 desktop, collects the boxes of every visible label, button,
// card and slip, and fails on any pair that overlaps by more than 2 px.
// Cards in the fanned hand overlap each other by design, so card pairs are
// skipped; a card against anything else still counts. It also fails on a
// ruled line running through the middle of any words (scripts/qa/strike.mjs).
// node scripts/deck-overlap.mjs [base url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { strikeScan } from './qa/strike.mjs';

const base = process.argv[2] ?? 'http://localhost:5252';
const out = '/tmp/deck-lessons/overlap';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
let failed = 0;

// Pieces that must never cover each other, by selector. Groups listed in SAME may overlap within themselves.
const PIECES = {
  shell: '.shellbtn',
  ledger: '.sb-ledger',
  coins: '.sb-purse',
  book: '.sb-book',
  peg: '.sb-peg',
  scoop: '.sb-scoops img',
  tonight: '.sb-tonight img',
  tin: '.sb-tin img',
  count: '.sb-count',
  heap: '.sb-heap-pile',
  label: '.sb-label',
  lantern: '.sb-lantern img',
  pages: '.sb-pages .sb-pagesheet',
  line: '.sb-hint.on',
  card: '.sb-hand .sb-card:not(.flying)',
  slip: '.sb-slip:not(.fly)',
  // The stall.
  sign: '.sb-sign',
  closed: '.sb-closed',
  purse: '.sb-purse-line',
  page: '.sb-pagebtn',
  good: '.sb-good',
  ask: '.sb-ask',
  thing: '.sb-thing',
  signpost: '.sb-signpost',
  stallnote: '.sb-stall-note',
  // The run's end.
  entry: '.sb-entry > *',
};
const SAME = new Set(['card', 'scoop', 'tonight', 'entry']);
// Text needs air around it, not just no overlap: labels get this much clearance (CSS px).
const PAD = { label: 3, count: 1, line: 2 };
// A piece inside another piece is part of it (a count on its tin, an ask on its good).
const INSIDE = [
  ['count', 'tin'],
  ['count', 'heap'],
  ['ask', 'good'],
  ['ask', 'page'],
];

async function run(label, viewport, touch) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  await p.waitForTimeout(500);
  if (touch) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 260, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const boxes = () =>
    p.evaluate((pieces) => {
      const outs = [];
      // An open sheet covers the table: only what is on the sheet (and the shell's button) is in play.
      const sheet = document.querySelector('.sb-sheets.on');
      for (const [name, sel] of Object.entries(pieces)) {
        for (const e of document.querySelectorAll(sel)) {
          if (sheet && !sheet.contains(e) && name !== 'shell') continue;
          let hidden = false;
          for (let a = e; a && a !== document.body; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) hidden = true;
          }
          if (hidden) continue;
          const r = e.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
          outs.push({ name, l: r.left, t: r.top, r: r.right, b: r.bottom, text: (e.textContent ?? '').trim().slice(0, 24) });
        }
      }
      return outs;
    }, PIECES);
  const settle = (ms = 500) => p.waitForTimeout(ms);
  const fresh = async (seed) => {
    await p.evaluate((seed) => {
      window.deck.seed(seed);
      window.deck.learnAll?.();
    }, seed);
    await settle(400);
  };
  const states = [
    ['first day', async () => {}],
    ['fresh day', async () => fresh(4242)],
    ['pages kept', async () => {
      await p.evaluate(() => {
        const d = window.deck;
        d.state().pages = ['bees', 'market'];
        d.table.syncAll();
      });
      await settle(300);
    }],
    ['card held', async () => {
      await p.evaluate(() => {
        const t = window.deck.table;
        t.pickUp(t.run.hand[0].uid);
      });
    }],
    ['tossed', async () => {
      await p.evaluate(() => {
        const t = window.deck.table;
        if (!t.held) t.pickUp(t.run.hand[0].uid);
        t.tossHeld();
      });
      await settle(400);
    }],
    ['scoring', async () => {
      await fresh(77);
      await p.evaluate(() => {
        const d = window.deck;
        const s = d.state();
        const days = { radish: 1, carrot: 2, lettuce: 2 };
        // Twelve ripe crops so the cascade runs a while.
        for (let i = 0; i < 12; i++) {
          const kind = ['radish', 'carrot', 'lettuce'][i % 3];
          s.plots[i].crop = { uid: 9000 + i, kind, age: days[kind], days: days[kind], up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false };
        }
        d.table.syncAll();
        d.endDay();
      });
      await p.waitForTimeout(1500);
    }],
    ['stall', async () => {
      await p.evaluate(() => window.deck.skip());
      await fresh(91);
      await p.evaluate(async () => {
        const d = window.deck;
        const w = (ms) => new Promise((r) => setTimeout(r, ms));
        d.state().earned = 999;
        d.state().coins = 160;
        while (d.state().phase === 'day') {
          d.endDay();
          d.skip();
          await w(30);
        }
      });
      await settle(600);
    }],
    ['stall, card looked at', async () => {
      await p.evaluate(() => document.querySelector('.sb-good')?.click());
      await settle(300);
    }],
    ['run end', async () => {
      await fresh(92);
      await p.evaluate(async () => {
        const d = window.deck;
        const w = (ms) => new Promise((r) => setTimeout(r, ms));
        d.state().earned = 0;
        while (d.state().phase === 'day') {
          d.state().earned = 0;
          d.endDay();
          d.skip();
          await w(30);
        }
      });
      await settle(600);
    }],
  ];
  for (const [name, setup] of states) {
    await setup();
    await settle(250);
    const bx = await boxes();
    const hits = [];
    for (let i = 0; i < bx.length; i++) {
      for (let j = i + 1; j < bx.length; j++) {
        const A = bx[i];
        const B = bx[j];
        if (A.name === B.name && SAME.has(A.name)) continue;
        if (INSIDE.some(([a, c]) => (A.name === a && B.name === c) || (B.name === a && A.name === c))) continue;
        const pad = (PAD[A.name] ?? 0) + (PAD[B.name] ?? 0);
        const w = Math.min(A.r, B.r) - Math.max(A.l, B.l) + pad;
        const h = Math.min(A.b, B.b) - Math.max(A.t, B.t) + pad;
        if (w > 2 && h > 2) hits.push(`${A.name} "${A.text}" / ${B.name} "${B.text}" ${Math.round(w)}x${Math.round(h)}`);
      }
    }
    // A price tag hangs above its card; it must not cover the card's face (the name is at the top).
    // Measured flat: the small tilts of cards and tags only inflate their boxes.
    for (const q of await p.evaluate(() => {
      const flat = document.createElement('style');
      flat.textContent = '* { transform: none !important; transition: none !important; }';
      document.head.append(flat);
      const out = [...document.querySelectorAll('.sb-good')].map((g) => {
        const tag = g.querySelector('.sb-pricetag')?.getBoundingClientRect();
        const face = g.querySelector('img')?.getBoundingClientRect();
        return tag && face ? { name: g.querySelector('img').alt, over: Math.round(tag.bottom - face.top) } : null;
      });
      flat.remove();
      return out.filter((q) => q && q.over > 0);
    })) hits.push(`price tag covers the top of "${q.name}" by ${q.over} px`);
    // A ruled line across the middle of any words reads as struck through.
    for (const q of await p.evaluate(strikeScan)) hits.push(`rule through "${q.text}" in ${q.in} at ${q.at}% of the line`);
    const ok = hits.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} ${name} (${bx.length} pieces)${ok ? '' : `\n       ${hits.join('\n       ')}`}`);
    await p.screenshot({ path: `${out}/${label}-${name.replace(/[ ,]+/g, '-')}.png` });
  }
  if (errs.length) {
    failed++;
    console.log(`FAIL ${label} page errors: ${errs.slice(0, 2).join(' | ')}`);
  }
  await ctx.close();
}

await run('phone', { width: 412, height: 838 }, true);
await run('desk', { width: 1280, height: 800 }, false);
await b.close();
console.log(failed ? `OVERLAP FAILED (${failed})` : 'OVERLAP OK', `shots in ${out}`);
process.exit(failed ? 1 : 0);
