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
//
// Round 2 adds: the bench with 3 to 8 scoops (and two weather clippings) on
// both screens, where every piece must stay whole, inside the bench and the
// screen, with the lantern and the heap at full width and their labels apart;
// in every stall state, every control inside the screen without scrolling,
// the signpost included; and between the first and second tap on every good,
// page, service and the page slot, nothing on the stall moving by more than a
// pixel and the second tap landing on the same thing.
//
// Round 3 adds: the bench sized to be found (desktop labels 14 px and up, the
// tin labelled, the spent heap 80 px and scoops 60 px wide, the bench 250 px
// tall; the bare table above it is reported); a card taken up by keys keeps
// its key number off the plate's caption; a harvest of seven bonuses wraps its
// chips onto a second line and no flying bonus lands on a chip already there;
// with a tall first row (beans, the scarecrow, corn) on the Long Furrow's five
// columns, no key letter changes by more than 15% of its pixels, and no note
// (the quota, a first-row plot, a crow) covers a key letter or number;
// reading a plot says what it pays; an improved crop's Select stake is 14 px
// or more across.
//
// Round 4 adds: on boards with tall crops under other crops (bean poles, corn,
// sunflowers, wheat, a scarecrow), no crop's pixels inside its own plot are
// changed by a neighbour's (on the round 3 build up to 22% of a crop was
// covered: beans under wheat, a carrot under a bean pole); Market Day's stamp on tonight's fifth crop and the
// readings counting its x2; readings name a plot only where the plate shows
// row numbers, say "tomorrow night", and the beans' grammar; no reason under a
// taken plot; the quota note off the plate's caption; on the desktop, a lifted
// card off the caption and the close-up off the scoops, bench, plate, ledger and
// hand; garlic and ladybirds picture a pest; the win page; desktop goods 115 px
// wide and up. ONLY=text runs just the states whose name holds it.
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
  slipspot: '.sb-slipspot > *',
  slot: '.sb-slot',
  kept: '.sb-keptpage',
  // The run's end.
  entry: '.sb-entry > *',
};
const SAME = new Set(['card', 'scoop', 'tonight', 'entry', 'kept']);
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
  const toStall = async (seed, coins, tweak) => {
    await p.evaluate(() => window.deck.skip());
    await fresh(seed);
    await p.evaluate(async ([coins, tweak]) => {
      const d = window.deck;
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      if (tweak) new Function('s', tweak)(d.state());
      d.state().earned = 99999;
      d.state().coins = coins;
      while (d.state().phase === 'day') {
        d.state().earned = 99999;
        d.endDay();
        d.skip();
        await w(30);
      }
      d.state().coins = coins;
      d.table.syncPurse();
      d.table.sheets.stall();
    }, [coins, tweak ? `(${tweak.toString()})(s)` : null]);
    await settle(600);
  };
  const perStall = { moves: [] };
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
    ...[3, 4, 5, 6, 7, 8].map((n) => [`the bench with ${n} scoops`, async () => {
      const q = await p.evaluate((n) => {
        const t = window.deck.table;
        t.run.scoops = n - 3;
        t.run.energy = n;
        t.run.bench = n;
        t.run.tonight = ['rain', 'sun'];
        t.syncAll();
        const box = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
        const bench = document.querySelector('.sb-bench').getBoundingClientRect();
        return { bench: { l: bench.left, r: bench.right }, scoops: box('.sb-scoops img').map((r) => ({ w: r.width, h: r.height, l: r.left, r: r.right, t: r.top, b: r.bottom })), parts: ['.sb-tin', '.sb-heap', '.sb-lantern', '.sb-tonight img', '.sb-label', '.sb-scoops img'].flatMap((sel) => box(sel).map((r) => ({ sel, l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }))), labels: box('.sb-label').map((r) => ({ l: r.left, r: r.right })), W: innerWidth, H: innerHeight };
      }, n);
      await settle(150);
      if (q.scoops.length !== n) extra.push(`${q.scoops.length} scoops on the bench, not ${n}`);
      const minW = Math.min(...q.scoops.map((x) => x.w));
      if (minW < 24) extra.push(`a scoop is only ${minW.toFixed(0)} px wide`);
      const lantern = q.parts.find((x) => x.sel === '.sb-lantern');
      const heap = q.parts.find((x) => x.sel === '.sb-heap');
      if (lantern.w < (label === 'phone' ? 60 : 80)) extra.push(`the lantern is squeezed to ${lantern.w.toFixed(0)} px`);
      if (heap.w < 50) extra.push(`the spent heap is squeezed to ${heap.w.toFixed(0)} px`);
      for (const x of q.parts) if (x.l < q.bench.l - 1 || x.r > q.bench.r + 1 || x.l < 0 || x.r > q.W || x.t < 0 || x.b > q.H) extra.push(`${x.sel} runs off the bench or the screen (${Math.round(x.l)} to ${Math.round(x.r)})`);
      const [a, c] = q.labels.sort((x, y) => x.l - y.l);
      if (a && c && c.l - a.r < 6) extra.push(`"Spent" and "End day" run together (${(c.l - a.r).toFixed(0)} px apart)`);
      console.log(`       ${label} ${n} scoops: ${minW.toFixed(0)} px each, ${new Set(q.scoops.map((x) => Math.round(x.t))).size} row(s), lantern ${lantern.w.toFixed(0)} px, heap ${heap.w.toFixed(0)} px`);
      if (n === 8) {
        await p.evaluate(() => {
          const t = window.deck.table;
          t.run.scoops = 0;
          t.run.energy = 3;
          t.run.bench = 3;
          t.run.tonight = [];
          t.syncAll();
        });
      }
    }]),
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
    // Round 3: the bench sized to be found, a lifted card's number, a slip of many bonuses, the key letters, the Select stake.
    ['the bench sized to be found', async () => {
      await p.evaluate(() => window.deck.skip());
      await fresh(4242);
      const q = await p.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        const labels = [...document.querySelectorAll('.sb-label')].map((e) => ({ text: e.textContent, size: parseFloat(getComputedStyle(e).fontSize) }));
        return { labels, heap: r('.sb-heap').width, tin: r('.sb-tin img').width, lantern: r('.sb-lantern').height, scoop: r('.sb-scoops img').width, bench: { t: r('.sb-bench').top, h: r('.sb-bench').height }, peg: r('.sb-peg').bottom };
      });
      const want = label === 'desk' ? { label: 14, heap: 80, scoop: 60, bench: 250 } : { label: 11, heap: 50, scoop: 40, bench: 70 };
      const small = q.labels.filter((x) => x.size < want.label);
      if (small.length) extra.push(`bench labels under ${want.label} px: ${small.map((x) => `${x.text} ${x.size}`).join(', ')}`);
      if (!q.labels.some((x) => x.text === 'Seed tin')) extra.push('the tin has no label you can read');
      if (q.heap < want.heap) extra.push(`the spent heap is ${q.heap.toFixed(0)} px wide`);
      if (q.scoop < want.scoop) extra.push(`a scoop is ${q.scoop.toFixed(0)} px wide`);
      if (q.bench.h < want.bench) extra.push(`the bench is ${q.bench.h.toFixed(0)} px tall`);
      console.log(`       ${label} bench: ${q.bench.h.toFixed(0)} px tall, labels ${q.labels.map((x) => `${x.text} ${x.size} px`).join(', ')}, heap ${q.heap.toFixed(0)} px, tin ${q.tin.toFixed(0)} px, lantern ${q.lantern.toFixed(0)} px, scoops ${q.scoop.toFixed(0)} px${label === 'desk' ? `, bare table between the pegboard and the bench ${Math.round(q.bench.t - q.peg)} px (52 of it the lesson strip)` : ''}`);
    }],
    ['a card taken up by keys: its number stays off the plate caption', async () => {
      if (label !== 'desk') return;
      await p.keyboard.press('Digit1');
      await settle(350);
      const q = await p.evaluate(() => {
        const t = window.deck.table;
        const br = t.board.canvas.getBoundingClientRect();
        const c = t.board.captionBox();
        const cap = { l: br.left + c.x, t: br.top + c.y, r: br.left + c.x + c.w, b: br.top + c.y + c.h };
        const device = document.querySelector('#app')?.dataset.device;
        const hits = [];
        let shown = 0;
        for (const el of document.querySelectorAll('.sb-hand .sb-card:not(.flying)')) {
          const st = getComputedStyle(el, '::before');
          if (device !== 'key' || st.content === 'none' || st.visibility === 'hidden') continue;
          shown++;
          const r = el.getBoundingClientRect();
          const n = { l: r.left + r.width / 2 - 9, r: r.left + r.width / 2 + 9, t: r.top - 18, b: r.top - 2 };
          const w = Math.min(n.r, cap.r) - Math.max(n.l, cap.l);
          const h = Math.min(n.b, cap.b) - Math.max(n.t, cap.t);
          if (w > 1 && h > 1) hits.push(`card ${el.dataset.key} (${el.classList.contains('held') ? 'held' : 'in the fan'}) ${Math.round(w)}x${Math.round(h)}`);
        }
        return { device, held: !!t.held, shown, hits };
      });
      if (q.device !== 'key' || !q.held) extra.push(`no card taken up by keys (${q.device}, held ${q.held})`);
      for (const h of q.hits) extra.push(`key number over the plate caption: ${h}`);
      console.log(`       ${label} key numbers: ${q.shown} shown with a card held, ${q.hits.length} over the caption`);
      await p.keyboard.press('Escape');
      await settle(150);
    }],
    ['a harvest of many bonuses: chips wrap, none under another', async () => {
      await fresh(77);
      await p.evaluate(() => {
        const d = window.deck;
        const s = d.state();
        for (const q of s.plots) {
          q.crop = null;
          q.obj = null;
        }
        const crop = (uid, kind, age, days) => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false });
        // Corn on B2: beans either side, a sunflower above, a chili below and a beehive by it, Busy Bees kept: seven bonuses fly in.
        s.plots[5].crop = crop(9601, 'corn', 4, 4);
        s.plots[4].crop = crop(9602, 'beans', 0, 3);
        s.plots[6].crop = crop(9603, 'beans', 0, 3);
        s.plots[1].crop = crop(9604, 'sunflower', 0, 3);
        s.plots[9].crop = crop(9605, 'chili', 0, 2);
        s.plots[0].obj = 'beehive';
        s.pages = ['bees'];
        d.fast(false);
        d.table.syncAll();
        d.endDay();
      });
      let most = 0;
      let lines = 0;
      const seen = new Set();
      let before = [];
      for (let k = 0; k < 160 && (await p.evaluate(() => window.deck.busy())); k++) {
        const q = await p.evaluate((before) => {
          const box = (e) => e.getBoundingClientRect();
          const chips = [...document.querySelectorAll('.sb-slip:not(.total) .sb-chip:not(.waiting)')].map((e) => ({ r: box(e), slip: box(e.closest('.sb-slip')) }));
          const arcs = [...document.querySelectorAll('.sb-arc')].filter((e) => Number(e.style.opacity || 1) > 0.5).map(box);
          const out = [];
          const over = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
          for (let i = 0; i < chips.length; i++) {
            const c = chips[i];
            if (c.r.left < c.slip.left - 1 || c.r.right > c.slip.right + 1 || c.r.bottom > c.slip.bottom + 1) out.push('a chip runs off its slip');
            for (let j = i + 1; j < chips.length; j++) if (over(c.r, chips[j].r)) out.push('two chips overlap');
            // A bonus passing over the slip in flight is fine; one that settles on a chip already there hides it.
            for (const a of arcs) if (over(c.r, a) && before.some((b) => Math.abs(b.x - a.left) < 4 && Math.abs(b.y - a.top) < 4)) out.push('a landing bonus settles over a chip already on the slip');
          }
          // Lines of chips, allowing for the slip's slight tilt.
          const tops = chips.map((c) => c.r.top).sort((a, b) => a - b);
          let lines = tops.length ? 1 : 0;
          for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > 8) lines++;
          return { n: chips.length, lines, out, arcs: arcs.map((a) => ({ x: a.left, y: a.top })) };
        }, before);
        before = q.arcs;
        most = Math.max(most, q.n);
        lines = Math.max(lines, q.lines);
        for (const o of q.out) seen.add(o);
        await p.waitForTimeout(25);
      }
      for (const o of seen) extra.push(o);
      if (most < 6) extra.push(`only ${most} chips seen on the corn's slip`);
      if (lines < 2) extra.push(`the chips stayed on ${lines} line`);
      console.log(`       ${label} slip: up to ${most} chips on ${lines} lines, ${seen.size ? [...seen].join('; ') : 'none covered'}`);
    }],
    ['the key letters over a tall first row, and notes kept off them', async () => {
      await p.evaluate(() => window.deck.skip());
      await fresh(4242);
      const q = await p.evaluate(() => {
        const t = window.deck.table;
        const s = t.run;
        const b = t.board;
        // The Long Furrow's five columns: beans in bloom on B1, the scarecrow on C1, corn on D1, a crow about.
        s.cols = 5;
        s.plots = Array.from({ length: 20 }, () => ({ crop: null, obj: null, boost: 0, last: null }));
        s.plots[1].crop = { uid: 9801, kind: 'beans', age: 3, days: 3, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false };
        s.plots[2].obj = 'scarecrow';
        s.plots[3].crop = { uid: 9802, kind: 'corn', age: 4, days: 4, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false };
        s.crow = true;
        t.syncAll();
        const keys = b.keyBoxes().filter((k) => /[A-E]/.test(k.text));
        const read = () => {
          b.draw(t.shown, 0);
          const g = b.canvas.getContext('2d');
          return keys.map((k) => g.getImageData(Math.round(k.x * b.dpr), Math.round(k.y * b.dpr), Math.max(1, Math.round(k.w * b.dpr)), Math.max(1, Math.round(k.h * b.dpr))).data);
        };
        const tall = read();
        const keep = t.shown;
        t.shown = keep.map((p, i) => (i < 5 ? { ...p, crop: null, obj: null } : p));
        const bare = read();
        t.shown = keep;
        // The share of each letter's chip that a tall crop changes: drawn over the crops, close to none.
        const changed = keys.map((k, i) => {
          let n = 0;
          for (let j = 0; j < tall[i].length; j += 4) if (Math.max(Math.abs(tall[i][j] - bare[i][j]), Math.abs(tall[i][j + 1] - bare[i][j + 1]), Math.abs(tall[i][j + 2] - bare[i][j + 2])) > 48) n++;
          return { key: k.text, share: n / (tall[i].length / 4) };
        });
        // Notes: the quota note and a note about a first-row plot, against the letters' boxes.
        const br = b.canvas.getBoundingClientRect();
        const kb = keys.map((k) => ({ l: br.left + k.x, t: br.top + k.y, r: br.left + k.x + k.w, b: br.top + k.y + k.h, text: k.text }));
        const sideKeys = b.keyBoxes().filter((k) => /\d/.test(k.text)).map((k) => ({ l: br.left + k.x, t: br.top + k.y, r: br.left + k.x + k.w, b: br.top + k.y + k.h, text: k.text }));
        const noteHits = [];
        for (const [text, plot] of [['Quota met.', null], [t.plotLine(1), 1], [t.plotLine(0), 0], ['A crow took one.', 3]]) {
          t.say(text, plot);
          const n = document.querySelector('.sb-note').getBoundingClientRect();
          for (const k of [...kb, ...sideKeys]) if (Math.min(n.right, k.r) - Math.max(n.left, k.l) > 1 && Math.min(n.bottom, k.b) - Math.max(n.top, k.t) > 1) noteHits.push(`"${text}" covers ${k.text}`);
        }
        return { changed, noteHits, line: t.plotLine(1) };
      });
      for (const c of q.changed) if (c.share > 0.15) extra.push(`a tall first-row crop covers the key letter ${c.key} (${Math.round(c.share * 100)}% of it changed)`);
      for (const h of q.noteHits) extra.push(h);
      if (!/pays \d+/.test(q.line)) extra.push(`reading a plot does not say what it pays: "${q.line}"`);
      console.log(`       ${label} key letters with a tall first row: ${q.changed.map((c) => `${c.key} ${Math.round(c.share * 100)}%`).join(', ')} changed; notes over letters: ${q.noteHits.length}; "${q.line}"`);
    }],
    ['an improved crop wears a stake you can read', async () => {
      await fresh(4242);
      const st = await p.evaluate(async () => {
        const t = window.deck.table;
        t.run.plots[10].crop = { uid: 9901, kind: 'carrot', age: 1, days: 2, up: true, compost: 0, rot: false, picks: 0, pest: 0, sprout: false };
        t.syncAll();
        await new Promise((r) => setTimeout(r, 120));
        return t.board.stakes.map((b) => +b.w.toFixed(1));
      });
      if (st.length !== 1 || st[0] < 14) extra.push(`the Select stake: ${JSON.stringify(st)} px`);
      console.log(`       ${label} Select stake: ${st.join(', ')} px across`);
    }],
    // Round 4: tall crops kept in their plots, Market Day's stamp, readings that name rows only with numbers, the beans
    // and the sunflower's grammar, the quota note off the caption, the desktop's lifted card and close-up, the win page.
    ['round 4: no crop covers a neighbouring plot\'s crop', async () => {
      await p.evaluate(() => window.deck.skip());
      await fresh(4242);
      const q = await p.evaluate(() => {
        const t = window.deck.table;
        const s = t.run;
        const b = t.board;
        const C = (uid, kind, age, days) => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false });
        // The fourth playtest's boards: bean poles under a carrot and a young sunflower, a ripe sunflower under a
        // strawberry, corn under lettuce, wheat under beans, a scarecrow under a radish.
        for (const q of s.plots) { q.crop = null; q.obj = null; }
        const put = { 13: C(9701, 'beans', 3, 3), 9: C(9702, 'carrot', 1, 2), 14: C(9703, 'beans', 3, 3), 10: C(9704, 'sunflower', 1, 3), 15: C(9705, 'sunflower', 3, 3), 11: C(9706, 'strawberry', 3, 3), 6: C(9707, 'corn', 4, 4), 2: C(9708, 'lettuce', 2, 2), 4: C(9709, 'wheat', 3, 3), 0: C(9710, 'beans', 3, 3), 8: C(9711, 'radish', 1, 1), 5: C(9712, 'pumpkin', 5, 5), 1: C(9713, 'chili', 2, 2) };
        for (const [i, c] of Object.entries(put)) s.plots[i].crop = c;
        s.plots[12].obj = 'scarecrow';
        t.syncAll();
        const g = b.canvas.getContext('2d');
        const T = b.T;
        const rectOf = (i) => ({ x: b.bx + (i % b.cols) * T, y: b.by + Math.floor(i / b.cols) * T, w: T, h: T });
        const grab = (r) => g.getImageData(Math.round(r.x * b.dpr), Math.round(r.y * b.dpr), Math.round(r.w * b.dpr), Math.round(r.h * b.dpr)).data;
        const full = t.shown;
        const empty = full.map((p) => ({ ...p, crop: null, obj: null }));
        const draw = (plots) => b.draw(plots, 0);
        const out = [];
        for (let i = 0; i < full.length; i++) {
          if (!full[i].crop && !full[i].obj) continue;
          const r = rectOf(i);
          draw(empty);
          const bare = grab(r);
          draw(full.map((p, j) => (j === i ? p : { ...p, crop: null, obj: null })));
          const solo = grab(r);
          draw(full);
          const all = grab(r);
          let own = 0;
          let covered = 0;
          const d = (a, c, k) => Math.max(Math.abs(a[k] - c[k]), Math.abs(a[k + 1] - c[k + 1]), Math.abs(a[k + 2] - c[k + 2]));
          for (let k = 0; k < solo.length; k += 4) {
            if (d(solo, bare, k) < 40) continue;
            own++;
            if (d(all, solo, k) > 40) covered++;
          }
          out.push({ plot: i, kind: full[i].crop?.kind ?? full[i].obj, own, share: own ? covered / own : 0 });
        }
        return out;
      });
      const worst = q.reduce((a, c) => (c.share > a.share ? c : a), { share: 0 });
      for (const c of q) if (c.share > 0.02) extra.push(`${c.kind} on plot ${c.plot}: ${Math.round(c.share * 100)}% of it covered by a neighbour`);
      console.log(`       ${label} crops in their own plots: ${q.length} crops, the most covered ${worst.kind ?? 'none'} at ${(worst.share * 100).toFixed(1)}%`);
    }],
    ['round 4: Market Day stamps tonight\'s fifth crop and the readings count it', async () => {
      await fresh(4242);
      const q = await p.evaluate(async () => {
        const t = window.deck.table;
        const s = t.run;
        for (const q of s.plots) { q.crop = null; q.obj = null; }
        s.pages = ['market'];
        for (const [i, uid] of [[0, 1], [2, 2], [8, 3], [10, 4], [15, 5]]) s.plots[i].crop = { uid: 9300 + uid, kind: 'lettuce', age: 2, days: 2, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false };
        t.syncAll();
        await new Promise((r) => setTimeout(r, 120));
        const br = t.board.canvas.getBoundingClientRect();
        return { stamps: (t.board.stamps ?? []).map((st) => ({ l: br.left + st.x, t: br.top + st.y, r: br.left + st.x + st.w, b: br.top + st.y + st.h })), fifth: t.plotLine(15), fourth: t.plotLine(10), plot15: (() => { const c = t.board.centre(15); return { l: br.left + c.x - t.board.T / 2, r: br.left + c.x + t.board.T / 2, t: br.top + c.y - t.board.T / 2, b: br.top + c.y + t.board.T / 2 }; })() };
      });
      if (q.stamps.length !== 1) extra.push(`${q.stamps.length} market stamps, not one`);
      else if (q.stamps[0].l < q.plot15.l || q.stamps[0].r > q.plot15.r || q.stamps[0].t < q.plot15.t || q.stamps[0].b > q.plot15.b) extra.push('the market stamp is not on the fifth crop\'s plot');
      if (!/pays 8 tonight/.test(q.fifth) || !/pays 4 tonight/.test(q.fourth)) extra.push(`readings ignore Market Day: "${q.fourth}" / "${q.fifth}"`);
      console.log(`       ${label} Market Day: ${q.stamps.length} stamp(s); "${q.fourth}" / "${q.fifth}"`);
    }],
    ['round 4: readings name a row only where the plate shows row numbers; plain grammar', async () => {
      await fresh(4242);
      const q = await p.evaluate(() => {
        const t = window.deck.table;
        const s = t.run;
        for (const q of s.plots) { q.crop = null; q.obj = null; }
        // Beans on their last pick tonight beside a carrot to come: the beans leave first.
        s.plots[5].crop = { uid: 9401, kind: 'beans', age: 3, days: 3, up: false, compost: 0, rot: false, picks: 2, pest: 0, sprout: false };
        s.plots[9].crop = { uid: 9402, kind: 'radish', age: 0, days: 1, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false };
        s.plots[10].crop = { uid: 9403, kind: 'carrot', age: 0, days: 2, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false };
        s.energy = 5;
        window.deck.hand(['carrot', 'radish']);
        const numbers = t.board.keyBoxes().filter((k) => /\d/.test(k.text)).length;
        const reading = t.plotLine(10);
        const tonight = t.plotLine(9);
        // Hold the carrot and aim beside the beans: why the beans' +2 will not pay.
        t.pickUp(t.run.hand[0].uid);
        t.cursor = 6;
        const device = window.deck.table['ctx'].device();
        t['hover'] = 6;
        t.updateHighlight();
        const why = window.deck.preview()?.reason?.text ?? '';
        // Aimed at the beans' own plot (taken): no reason at all.
        t['hover'] = 5;
        t.updateHighlight();
        const taken = window.deck.preview()?.reason?.text ?? '';
        t['hover'] = null;
        t.putDown(true);
        return { numbers, reading, tonight, why, taken, device };
      });
      const named = /^[A-E]\d: /.test(q.reading);
      if (named !== q.numbers > 0) extra.push(`a reading ${named ? 'names' : 'does not name'} its plot with ${q.numbers} row numbers on the plate: "${q.reading}"`);
      if (!/tomorrow night/.test(q.reading)) extra.push(`a crop ripe in one night reads "${q.reading}"`);
      if (q.why !== 'The beans are pulled before the carrot ripens.') extra.push(`the reason reads "${q.why}"`);
      if (q.taken) extra.push(`a taken plot shows a reason: "${q.taken}"`);
      console.log(`       ${label} readings: ${q.numbers} row numbers, "${q.reading}", "${q.tonight}"; why: "${q.why}"; on a taken plot: "${q.taken || 'nothing'}"`);
    }],
    ['round 4: the quota note sits off the caption', async () => {
      await fresh(4242);
      const q = await p.evaluate(() => {
        const t = window.deck.table;
        t.setLine(null);
        t.say('Quota met.', null);
        const n = document.querySelector('.sb-note').getBoundingClientRect();
        const br = t.board.canvas.getBoundingClientRect();
        const c = t.board.captionBox();
        const cap = { l: br.left + c.x, t: br.top + c.y, r: br.left + c.x + c.w, b: br.top + c.y + c.h };
        const w = Math.min(n.right, cap.r) - Math.max(n.left, cap.l);
        const h = Math.min(n.bottom, cap.b) - Math.max(n.top, cap.t);
        return { over: w > 1 && h > 1, note: [n.left, n.top, n.right, n.bottom].map(Math.round) };
      });
      if (q.over) extra.push(`"Quota met." covers the plate caption at ${q.note.join(',')}`);
      await settle(2400);
    }],
    ['round 4: on the desktop a lifted card stays off the caption and the close-up off the scoops', async () => {
      if (label !== 'desk') return;
      await fresh(4242);
      const held = await p.evaluate(async () => {
        const t = window.deck.table;
        const br = t.board.canvas.getBoundingClientRect();
        const c = t.board.captionBox();
        const cap = { l: br.left + c.x, t: br.top + c.y, r: br.left + c.x + c.w, b: br.top + c.y + c.h };
        const hits = [];
        for (const card of t.run.hand) {
          t.pickUp(card.uid);
          await new Promise((r) => setTimeout(r, 380));
          const r = t.handEls.get(card.uid).el.getBoundingClientRect();
          const w = Math.min(r.right, cap.r) - Math.max(r.left, cap.l);
          const h = Math.min(r.bottom, cap.b) - Math.max(r.top, cap.t);
          if (w > 1 && h > 1) hits.push(`${card.id} ${Math.round(w)}x${Math.round(h)}`);
          t.putDown(true);
        }
        return hits;
      });
      for (const h of held) extra.push(`a lifted card covers the plate caption: ${h}`);
      // Rest the mouse on a card until its close-up comes, then measure it against the bench and the plate.
      const pt = await p.evaluate(() => { const t = window.deck.table; const r = t.handEls.get(t.run.hand[2].uid).el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.6]; });
      await p.mouse.move(pt[0], pt[1]);
      await settle(700);
      const q = await p.evaluate(() => {
        const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const d = document.querySelector('.sb-detail.on.hover');
        if (!d) return null;
        const t = window.deck.table;
        const br = t.board.canvas.getBoundingClientRect();
        const plate = { l: br.left + t.board.px0, t: br.top + t.board.py0, r: br.left + t.board.px0 + t.board.pw, b: br.top + t.board.py0 + t.board.ph };
        const parts = [...d.querySelectorAll('img, .sb-detail-notes')].map(box);
        const against = [['the scoops', [...document.querySelectorAll('.sb-scoops img')].map(box)], ['the bench', [box(document.querySelector('.sb-bench'))]], ['the plate', [plate]], ['the ledger', [box(document.querySelector('.sb-ledger'))]], ['the hand', [...document.querySelectorAll('.sb-hand .sb-card')].map(box)]];
        const hits = [];
        for (const a of parts) for (const [name, list] of against) for (const c of list) if (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 1 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 1) hits.push(name);
        return { hits: [...new Set(hits)], img: box(d.querySelector('img')) };
      });
      if (!q) extra.push('no close-up came under the resting pointer');
      else for (const h of q.hits) extra.push(`the close-up covers ${h}`);
      console.log(`       ${label} lifted cards over the caption: ${held.length}; close-up ${q ? `${Math.round(q.img.r - q.img.l)} px wide at ${Math.round(q.img.l)},${Math.round(q.img.t)}, covering ${q.hits.join(', ') || 'nothing'}` : 'missing'}`);
      await p.mouse.move(640, 20);
      await settle(200);
    }],
    ['round 4: garlic and ladybirds picture a pest kept off', async () => {
      if (label !== 'phone') return;
      const q = await p.evaluate(async () => {
        const out = {};
        const faceUrl = (id, up) => window.deck.faceUrl(id, up);
        for (const id of ['garlic', 'ladybirds', 'scarecrow']) {
          const img = new Image();
          img.src = faceUrl(id, false);
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          // The rule line sits in the bottom quarter of the face.
          const d = g.getImageData(0, Math.round(img.height * 0.74), img.width, Math.round(img.height * 0.24)).data;
          let bug = 0;
          for (let k = 0; k < d.length; k += 4) if (Math.abs(d[k] - 0xa8) < 26 && Math.abs(d[k + 1] - 0xc8) < 26 && Math.abs(d[k + 2] - 0x32) < 40) bug++;
          out[id] = bug;
        }
        return out;
      });
      for (const id of ['garlic', 'ladybirds']) if (q[id] < 20) extra.push(`the ${id}'s rule picture shows no pest (${q[id]} bug-green pixels)`);
      console.log(`       ${label} bug-green pixels on the rule line: garlic ${q.garlic}, ladybirds ${q.ladybirds}, scarecrow ${q.scarecrow}`);
    }],
    ['round 4: the win page', async () => {
      await fresh(4242);
      await p.evaluate(async () => {
        const d = window.deck;
        const w = (ms) => new Promise((r) => setTimeout(r, ms));
        const s = d.state();
        s.year = 3;
        s.season = 3;
        s.stats.log = Array.from({ length: 11 }, (_, k) => ({ year: Math.floor(k / 4) + 1, season: k % 4, earned: 300 + k * 90, quota: 280 + k * 80, cleared: true }));
        s.stats.seasonsCleared = 11;
        while (d.state().phase === 'day') {
          d.state().earned = 99999;
          d.endDay();
          d.skip();
          await w(30);
        }
      });
      await settle(600);
      const q = await p.evaluate(() => {
        const e = document.querySelector('.sb-entry');
        const b = [...document.querySelectorAll('.sb-entry button')].find((x) => /fresh page/.test(x.textContent));
        const r = b?.getBoundingClientRect();
        return { won: window.deck.state().end?.won, wins: window.deck.table.meta.wins, text: e?.textContent ?? '', seal: !!document.querySelector('.sb-seal'), btn: r ? [r.top, r.bottom] : null, H: innerHeight, kind: window.deck.table.sheets.kind };
      });
      if (!q.won || q.kind !== 'entry') extra.push(`no win page: won ${q.won}, sheet ${q.kind}`);
      if (!/The run is won/.test(q.text) || !/Runs won: \d/.test(q.text) || !q.seal) extra.push(`the win page does not say so: "${q.text.slice(0, 120)}"`);
      if (!q.btn || q.btn[1] > q.H || q.btn[0] < 0) extra.push('"Turn to a fresh page" is off the screen on the win page');
      console.log(`       ${label} win page: won ${q.won}, runs won ${q.wins}, seal ${q.seal}`);
    }],
    ['round 4: the desktop stall reads from arm\'s length', async () => {
      await toStall(91, 400);
      const q = await p.evaluate(() => {
        const goods = [...document.querySelectorAll('.sb-good')].map((e) => e.getBoundingClientRect().width);
        const st = document.querySelector('.sb-stall').getBoundingClientRect();
        return { goods: Math.min(...goods), stall: st.width, W: innerWidth };
      });
      if (label === 'desk' && q.goods < 115) extra.push(`desktop goods are ${q.goods.toFixed(0)} px wide`);
      console.log(`       ${label} stall: goods ${q.goods.toFixed(0)} px and up, the stall ${Math.round((q.stall / q.W) * 100)}% of the screen's width`);
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
    ['stall, nothing moves between the two taps', async () => {
      await p.evaluate(() => {
        window.deck.table.tutor.unlock('services');
        window.deck.table.tutor.unlock('pages');
        window.deck.state().coins = 5000;
        window.deck.table.sheets.stall();
      });
      await p.keyboard.press('Escape');
      await settle(200);
      // Measured flat: a lifted thing rises by a transform, which a tap still lands on; only layout moves count.
      const layout = () =>
        p.evaluate(() => {
          const flat = document.createElement('style');
          flat.textContent = '* { transform: none !important; transition: none !important; animation: none !important; }';
          document.head.append(flat);
          const out = [...document.querySelectorAll('.sb-sheets.on button')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), e.textContent.trim().slice(0, 16) || e.querySelector('img')?.alt || e.className]; });
          flat.remove();
          return out;
        });
      for (const sel of ['.sb-good', '.sb-pagebtn', '.sb-thing']) {
        const n = await p.evaluate((sel) => document.querySelectorAll(sel).length, sel);
        for (let i = 0; i < n; i++) {
          const pt = await p.evaluate(([sel, i]) => { const e = document.querySelectorAll(sel)[i]; if (e.disabled) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.6]; }, [sel, i]);
          if (!pt) continue;
          const before = await layout();
          if (touch) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt[0], y: pt[1], id: 5 }] });
            await p.waitForTimeout(40);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } else await p.mouse.click(pt[0], pt[1]);
          await settle(200);
          const after = await layout();
          const moved = after.length !== before.length ? [`${before.length} buttons, then ${after.length}`] : after.map((q, k) => ({ q, d: Math.max(Math.abs(q[0] - before[k][0]), Math.abs(q[1] - before[k][1])) })).filter((x) => x.d > 1).map((x) => `${x.q[2]} by ${x.d} px`);
          const same = await p.evaluate(([sel, i, x, y]) => document.elementFromPoint(x, y)?.closest('button') === document.querySelectorAll(sel)[i], [sel, i, ...pt]);
          const slip = await p.evaluate(() => document.querySelector('.sb-slipspot .sb-read')?.textContent ?? '');
          if (moved.length) extra.push(`first tap on ${sel} ${i}: ${moved.slice(0, 3).join(', ')}`);
          if (!same) extra.push(`second tap on ${sel} ${i} would miss it`);
          if (!slip) extra.push(`first tap on ${sel} ${i} put up no slip`);
          perStall.moves.push(moved.length ? Math.max(...after.map((q, k) => Math.max(Math.abs(q[0] - (before[k]?.[0] ?? 0)), Math.abs(q[1] - (before[k]?.[1] ?? 0))))) : 0);
          await p.keyboard.press('Escape');
          await settle(120);
        }
      }
      console.log(`       ${label} stall: ${perStall.moves.length} first taps, the most anything moved: ${Math.max(0, ...perStall.moves)} px`);
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
    ['stall in year 2, the almanac full', async () => {
      await p.evaluate(() => window.deck.table.sheets.back());
      await toStall(95, 4000, (s) => {
        s.year = 2;
        s.pages = ['barrel', 'cellar', 'bees', 'thumb'];
      });
      const q = await p.evaluate(() => ({ slot: !!document.querySelector('.sb-slot'), scoop: [...document.querySelectorAll('.sb-thing')].some((b) => /scoop/.test(b.textContent)), goods: document.querySelectorAll('.sb-good').length }));
      if (!q.slot || !q.scoop || q.goods !== 4) extra.push(`year 2 stall: slot ${q.slot}, scoop ${q.scoop}, ${q.goods} goods`);
    }],
    ...[['a good lifted', '.sb-good', 0], ['a page lifted', '.sb-pagebtn', 1], ['the scoop lifted', '.sb-thing', 3], ['the page slot lifted', '.sb-slot', 0]].map(([what, sel, i]) => [`stall in year 2, ${what}`, async () => {
      await p.keyboard.press('Escape');
      await settle(100);
      await tapAt(sel, i);
      const slip = await p.evaluate(() => document.querySelector('.sb-slipspot .sb-read')?.textContent ?? '');
      if (!slip) extra.push(`no slip for ${what}`);
    }]),
    ['stall in year 2, the page slot bought', async () => {
      const before = await p.evaluate(() => window.deck.state().slots);
      await tapAt('.sb-slot', 0);
      const q = await p.evaluate(() => ({ slots: window.deck.state().slots, done: document.querySelector('.sb-slipspot .sb-done')?.textContent ?? '' }));
      if (q.slots !== before + 1 || !/5 pages/.test(q.done)) extra.push(`the page slot: slots ${before} to ${q.slots}, note "${q.done}"`);
      const pq = await purse();
      if (!purseOk(pq)) extra.push(`purse wrong after the page slot: table ${pq.table}, stall ${pq.line}, rules ${pq.rules}`);
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
    ['run end after a long run', async () => {
      // Twelve seasons and five new cards: the account scrolls, the way on stays on the screen.
      const q = await p.evaluate(() => {
        const t = window.deck.table;
        const s = t.run;
        s.stats.log = Array.from({ length: 12 }, (_, k) => ({ year: Math.floor(k / 4) + 1, season: k % 4, earned: 300 + k * 90, quota: 280 + k * 80, cleared: k < 11 }));
        s.end.unlocked = ['pumpkin', 'shears', 'mint', 'trowel', 'storm'];
        t.sheets.entry();
        const b = [...document.querySelectorAll('.sb-entry button')].find((x) => /fresh page/.test(x.textContent));
        const r = b.getBoundingClientRect();
        const line = [...document.querySelectorAll('.sb-entry p')].map((x) => x.textContent).find((x) => /catalogue/.test(x)) ?? '';
        return { top: r.top, bottom: r.bottom, H: innerHeight, line };
      });
      await settle(200);
      if (q.bottom > q.H || q.top < 0) extra.push(`"Turn to a fresh page" is off the screen (${Math.round(q.top)} to ${Math.round(q.bottom)} of ${q.H})`);
      if (!/pumpkin, shears, mint, trowel and storm/.test(q.line)) extra.push(`the new cards are not a plain list: "${q.line}"`);
    }],
  ];
  for (const [name, setup] of states) {
    // ONLY=text runs just the states whose name holds it (the round 4 states set themselves up).
    if (process.env.ONLY && !name.includes(process.env.ONLY)) continue;
    extra.length = 0;
    await setup();
    await settle(250);
    const bx = await boxes();
    const hits = [...extra];
    // The shell's corner stays clear, on the table and on every sheet.
    for (const q of await p.evaluate(cornerScan)) hits.push(`in the shell's corner: ${q}`);
    // At the stall, every control is on the screen without scrolling, the way out included.
    for (const q of await p.evaluate(() => {
      if (!document.querySelector('.sb-sheets.on[data-kind="stall"]')) return [];
      const body = document.querySelector('.sb-stall-body')?.getBoundingClientRect();
      const out = [];
      if (!document.querySelector('.sb-signpost')) out.push('no signpost');
      for (const e of document.querySelectorAll('.sb-sheets.on button')) {
        const r = e.getBoundingClientRect();
        const name = e.textContent.trim().slice(0, 18) || e.querySelector('img')?.alt || e.className;
        if (r.top < 0 || r.left < 0 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5) out.push(`${name} is off the screen (${Math.round(r.top)} to ${Math.round(r.bottom)} of ${innerHeight})`);
        else if (body && e.closest('.sb-stall-body') && (r.top < body.top - 0.5 || r.bottom > body.bottom + 0.5)) out.push(`${name} needs a scroll (${Math.round(r.bottom)} under ${Math.round(body.bottom)})`);
      }
      return out;
    })) hits.push(`stall: ${q}`);
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
        const sc = b.closest('.sb-stall-body, .sb-tinview, .sb-book-page, .sb-entry-body');
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
