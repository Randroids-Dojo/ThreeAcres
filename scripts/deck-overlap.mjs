// Overlapping pieces on Seedbound's table, measured. Puts the game in each
// state (the guided first day, a fresh day, a card held, a card tossed, the
// scoring cascade, the stall, the run's end) on a 412 by 838 phone and a
// 1280 by 800 desktop, collects the boxes of every visible label, button,
// card and slip, and fails on any pair that overlaps by more than 2 px.
// Cards in the fanned hand overlap each other by design, so card pairs are
// skipped; a card against anything else still counts. It also fails on a
// ruled line running through the middle of any words (scripts/qa/strike.mjs).
//
// It also checks, in every state and on every sheet (the almanac, the rules,
// the tin, the spent heap, a card up close, the stall, its throw-out and
// improve sheets, the run's end), that nothing but the shell's own button
// lies in the shell's corner (60 px plus the safe area, top left); that the
// purse shows the coins the rules hold after every purchase at the stall; that
// in a hand of 5, 6 and 7 cards every card's name and rule are uncovered (by
// asking the browser what is on top at points across them); that the stall's
// first tap says what a card does and buys nothing, and the second buys; and
// that fresh stock takes two taps like everything else.
// node scripts/deck-overlap.mjs [base url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { strikeScan } from './qa/strike.mjs';
import { reachScan } from './qa/reach.mjs';
import { cornerScan, handScan } from './deck-checks.mjs';

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
  const cdp = touch ? await ctx.newCDPSession(p) : null;
  /** A real tap: a finger on the phone, the mouse on the desktop. */
  const tapAt = async (sel, nth = 0) => {
    const pt = await p.evaluate(
      ([sel, nth]) => {
        const e = document.querySelectorAll(sel)[nth];
        if (!e) return null;
        e.scrollIntoView({ block: 'center' });
        const r = e.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      },
      [sel, nth],
    );
    if (!pt) return false;
    await settle(120);
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt[0], y: pt[1], id: 4 }] });
      await p.waitForTimeout(40);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await p.mouse.click(pt[0], pt[1]);
    await settle(250);
    return true;
  };
  /** The purse on the table, the purse line at the stall, and the rules' coins: all three must agree. */
  const purse = () => p.evaluate(() => ({ table: Number(window.deck.purse()), line: Number(document.querySelector('.sb-purse-line b')?.textContent ?? NaN), rules: window.deck.state().coins }));
  const purseOk = (q) => q.table === q.rules && (Number.isNaN(q.line) || q.line === q.rules);
  const toStall = async (seed, coins) => {
    await p.evaluate(() => window.deck.skip());
    await fresh(seed);
    await p.evaluate(async (coins) => {
      const d = window.deck;
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      d.state().earned = 999;
      d.state().coins = coins;
      while (d.state().phase === 'day') {
        d.endDay();
        d.skip();
        await w(30);
      }
    }, coins);
    await settle(600);
  };
  const extra = [];
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
      await toStall(91, 400);
      const q = await purse();
      if (!purseOk(q)) extra.push(`purse wrong on arriving at the stall: table ${q.table}, stall ${q.line}, rules ${q.rules}`);
    }],
    ['stall, first tap on a good', async () => {
      const before = await purse();
      const want = await p.evaluate(() => {
        const s = window.deck.state();
        const i = s.shop.cards.findIndex((c) => !c.sold && c.price <= s.coins);
        return { i, sentence: window.deck.cardText(s.shop.cards[i].card), price: s.shop.cards[i].price };
      });
      await tapAt('.sb-good', want.i);
      const read = await p.evaluate(() => document.querySelector('.sb-read')?.textContent ?? '');
      const after = await purse();
      if (!read.includes(want.sentence) || !/again to buy/.test(read)) extra.push(`first tap: the slip does not say what the card does and how to buy it: "${read}"`);
      if (after.rules !== before.rules) extra.push(`first tap bought: ${before.rules} to ${after.rules}`);
      // The second tap buys; the purse follows at once.
      await tapAt('.sb-good', want.i);
      const bought = await purse();
      if (bought.rules !== before.rules - want.price) extra.push(`second tap: coins ${before.rules} to ${bought.rules}, price ${want.price}`);
      if (!purseOk(bought)) extra.push(`purse wrong after a purchase: table ${bought.table}, stall ${bought.line}, rules ${bought.rules}`);
      await tapAt('.sb-good', want.i === 0 ? 1 : 0);
    }],
    ['stall, fresh stock takes two taps', async () => {
      await p.evaluate(() => {
        window.deck.table.tutor.unlock('services');
        window.deck.table.tutor.unlock('pages');
        window.deck.table.sheets.stall();
      });
      await settle(200);
      const before = await purse();
      await tapAt('.sb-thing', 2);
      const one = await purse();
      if (one.rules !== before.rules) extra.push(`fresh stock rang on one tap: ${before.rules} to ${one.rules}`);
      await tapAt('.sb-thing', 2);
      const two = await purse();
      if (two.rules >= before.rules) extra.push(`fresh stock did not ring on the second tap: ${before.rules} to ${two.rules}`);
      if (!purseOk(two)) extra.push(`purse wrong after fresh stock: table ${two.table}, stall ${two.line}, rules ${two.rules}`);
    }],
    ['stall, a page pinned', async () => {
      const before = await purse();
      await tapAt('.sb-pagebtn', 0);
      await tapAt('.sb-pagebtn', 0);
      const q = await purse();
      if (q.rules >= before.rules) extra.push(`page not bought: ${before.rules} to ${q.rules}`);
      if (!purseOk(q)) extra.push(`purse wrong after a page: table ${q.table}, stall ${q.line}, rules ${q.rules}`);
    }],
    ['stall, the improve sheet', async () => {
      await tapAt('.sb-thing', 1);
      await tapAt('.sb-thing', 1);
      const kind = await p.evaluate(() => window.deck.table.sheets.kind);
      if (kind !== 'deck') extra.push(`improve did not open its sheet (${kind})`);
      const idx = await p.evaluate(() => [...document.querySelectorAll('.sb-tincard')].findIndex((b) => /Carrot|Radish|Beans/.test(b.querySelector('img').alt)));
      await tapAt('.sb-tincard', idx);
      const line = await p.evaluate(() => document.querySelector('.sb-pickline')?.textContent ?? '');
      if (!/basket \d+ to \d+/.test(line)) extra.push(`the improve sheet does not show the result: "${line}"`);
    }],
    ['stall, improved', async () => {
      const before = await purse();
      const idx = await p.evaluate(() => [...document.querySelectorAll('.sb-tincard')].findIndex((b) => b.classList.contains('lifted')));
      await tapAt('.sb-tincard', idx);
      const q = await purse();
      const done = await p.evaluate(() => document.querySelector('.sb-done')?.textContent ?? '');
      if (q.rules >= before.rules || !/improved/.test(done)) extra.push(`improve: coins ${before.rules} to ${q.rules}, note "${done}"`);
      if (!purseOk(q)) extra.push(`purse wrong after improving: table ${q.table}, stall ${q.line}, rules ${q.rules}`);
    }],
    ['stall, the throw-out sheet', async () => {
      await tapAt('.sb-thing', 0);
      await tapAt('.sb-thing', 0);
    }],
    ['stall, the almanac from the stall', async () => {
      await p.evaluate(() => window.deck.table.sheets.back());
      await settle(200);
      await tapAt('.sb-stall-book');
      const kind = await p.evaluate(() => window.deck.table.sheets.kind);
      if (kind !== 'menu') extra.push(`the stall's almanac did not open (${kind})`);
    }],
    ['stall, the rules in brief', async () => {
      await p.evaluate(() => window.deck.table.sheets.rules());
      await settle(200);
      const n = await p.evaluate(() => document.querySelectorAll('.sb-cardrow').length);
      if (n < 10) extra.push(`the rules list only ${n} cards`);
      await p.evaluate(() => window.deck.table.sheets.back());
    }],
    ['the tin, whole deck', async () => {
      await fresh(93);
      await p.evaluate(() => window.deck.table.sheets.deck('tin'));
      await settle(250);
      const q = await p.evaluate(() => ({ shown: document.querySelectorAll('.sb-tincard').length, owned: window.deck.state().draw.length + window.deck.state().hand.length + window.deck.state().discard.length + window.deck.state().placed.length }));
      if (q.shown !== q.owned) extra.push(`the tin shows ${q.shown} of ${q.owned} cards`);
    }],
    ['the spent heap', async () => {
      await p.evaluate(() => window.deck.table.sheets.deck('spent'));
    }],
    ['the almanac', async () => {
      await p.evaluate(() => window.deck.table.sheets.menu());
      const keys = await p.evaluate(() => !!document.querySelector('.sb-keys'));
      if (keys === (label === 'phone')) extra.push(`keys ${keys ? 'listed' : 'missing'} on the ${label}`);
    }],
    ['the rules in brief', async () => {
      await p.evaluate(() => window.deck.table.sheets.rules());
    }],
    ['a card up close', async () => {
      await p.evaluate(() => {
        const t = window.deck.table;
        t.sheets.close();
        t.sheets.detail(t.run.hand[0]);
      });
    }],
    ...[5, 6, 7].map((n) => [`a hand of ${n}`, async () => {
      await p.evaluate(() => window.deck.table.sheets.closeDetail());
      await p.evaluate((n) => window.deck.hand(['strawberry', 'can', 'sunflower', 'fertiliser', 'lettuce', 'ladybirds', 'pumpkin'].slice(0, n)), n);
      await settle(500);
      const cards = await p.evaluate(handScan);
      for (const c of cards) if (c.nameSeen < 1 || c.ruleSeen < 1) extra.push(`${c.name}: name ${Math.round(c.nameSeen * 100)}% seen, rule ${Math.round(c.ruleSeen * 100)}% seen`);
      if (cards.length !== n) extra.push(`${cards.length} cards in the hand, not ${n}`);
      const small = Math.min(...cards.map((c) => c.px));
      console.log(`       ${label} hand of ${n}: cards ${cards[0]?.w} px wide, names ${small} to ${Math.max(...cards.map((c) => c.px))} px`);
      // In an everyday hand of five, every name prints at a size a phone can read.
      if (n === 5 && small < 7) extra.push(`the smallest name in a hand of 5 is ${small} px`);
    }]),
    ['a hand of 6 radishes and friends', async () => {
      await p.evaluate(() => window.deck.hand(['radish', 'radish', 'radish', 'carrot', 'beehive', 'chili']));
      await settle(500);
      for (const c of await p.evaluate(handScan)) if (c.nameSeen < 1 || c.ruleSeen < 1) extra.push(`${c.name}: name ${Math.round(c.nameSeen * 100)}% seen, rule ${Math.round(c.ruleSeen * 100)}% seen`);
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
    extra.length = 0;
    await setup();
    await settle(250);
    const bx = await boxes();
    const hits = [...extra];
    // The shell's corner stays clear, on the table and on every sheet.
    for (const q of await p.evaluate(cornerScan)) hits.push(`in the shell's corner: ${q}`);
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
    // Every visible button must take a tap, not something lying over it. An open sheet
    // covers the table on purpose, so then only its own buttons (and the shell's) count.
    // A button half scrolled out of the stall is reached by scrolling: only those fully in their scroller's view count.
    const reachable = await p.evaluate(() => {
      document.querySelectorAll('[data-clipped]').forEach((e) => delete e.dataset.clipped);
      for (const b of document.querySelectorAll('.sb-sheets.on button')) {
        const sc = b.closest('.sb-stall, .sb-tinview, .sb-book-page, .sb-entry');
        if (!sc) continue;
        const r = b.getBoundingClientRect();
        const v = sc.getBoundingClientRect();
        if (r.top < v.top - 1 || r.bottom > v.bottom + 1) b.dataset.clipped = '1';
      }
      // A card held up close covers the table on purpose (a tap anywhere puts it back); the shell's button must still take a tap.
      if (document.querySelector('.sb-detail.on:not(.hover)')) return '.shellbtn';
      return document.querySelector('.sb-sheets.on') ? '.sb-sheets.on button:not([data-clipped]), .shellbtn' : 'button';
    });
    for (const q of await p.evaluate(reachScan, reachable)) hits.push(`${q.control} is under ${q.under} at ${q.at}`);
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
