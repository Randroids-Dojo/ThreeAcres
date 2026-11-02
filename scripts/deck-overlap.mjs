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
//
// Round 6 adds: four-digit takes and quotas (1239 of 1550, 12400 of 15500) and five-digit coins on the ledger and
// purse, every digit inside its piece and clear of the other (the phone's purse covered "1239 of 15"); a radish aimed
// beside a carrot paints the carrot's new total on a dark chip inside its plot, and the night pays exactly that; kept
// pages 40 px tall on the phone stall (they were 18), and a swap by real taps; the hitch's trade line ("Spring asks
// 370, not 430.") on the hitch only, and picking it moves the stall's head; the phone stall's goods 84 px wide and up
// where the stall has room (71 to 80 before); the season's note in the lesson strip with the twist stepping aside,
// never over row 1; "the other beans", the scarecrow before the crows, the improve note counting the Root Cellar, and
// a won run's ledger saying so.
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
  engine: '.sb-enginecard',
  keptline: '.sb-keptline',
  // The run's end.
  entry: '.sb-entry > *',
};
const SAME = new Set(['card', 'scoop', 'tonight', 'entry', 'kept', 'keptline']);
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
  // Round 7: a run's first stall offers an engine; the stall states here are later stalls (a season already in the
  // log) unless `first` asks for the first one.
  const toStall = async (seed, coins, tweak, first = false) => {
    await p.evaluate(() => window.deck.skip());
    await fresh(seed);
    await p.evaluate(async ([coins, tweak, first]) => {
      const d = window.deck;
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      if (!first) d.state().stats.log.push({ year: 1, season: 0, earned: 200, quota: 170, cleared: true, carried: 0, twist: null, idle: 0 });
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
    }, [coins, tweak ? `(${tweak.toString()})(s)` : null, first]);
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
      console.log(`       ${label} bench: ${q.bench.h.toFixed(0)} px tall, labels ${q.labels.map((x) => `${x.text} ${x.size} px`).join(', ')}, heap ${q.heap.toFixed(0)} px, tin ${q.tin.toFixed(0)} px, lantern ${q.lantern.toFixed(0)} px, scoops ${q.scoop.toFixed(0)} px${label === 'desk' ? `, ${Math.round(q.bench.t - q.peg)} px between the pegboard and the bench (round 5: the lesson strip and the kept pages fill it; the longest bare stretch is measured below)` : ''}`);
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
      if (!/The run is won/.test(q.text) || !/Runs won\s*\d+ of \d+ runs?/.test(q.text) || !q.seal) extra.push(`the win page does not say so: "${q.text.slice(0, 120)}"`);
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
    // Round 5: the season's twist at the stall and on the table, frost, fresh packets that differ, the won run's own
    // page, a hand that stays still, the aim note for the first few aims, the desktop hand and side panel, the stall's
    // scroll shade, and the year's first stall with new stock and the twists on a phone.
    ['round 5: the stall offers two twists, and the way on asks for one', async () => {
      await toStall(97, 900, (s) => {
        s.season = 3;
      });
      const q = await p.evaluate(() => ({ cards: [...document.querySelectorAll('.sb-twistcard')].map((e) => e.textContent.trim()), twists: window.deck.state().shop.twists }));
      if (q.cards.length !== 2 || q.twists?.length !== 2) extra.push(`the stall before year 2 shows ${q.cards.length} twists (${JSON.stringify(q.twists)})`);
      await tapAt('.sb-signpost');
      const held = await p.evaluate(() => ({ phase: window.deck.state().phase, slip: document.querySelector('.sb-slipspot .sb-read')?.textContent ?? '' }));
      if (held.phase !== 'shop' || !/Pick one of the two for spring/.test(held.slip)) extra.push(`the way on with no twist picked: phase ${held.phase}, slip "${held.slip}"`);
      console.log(`       ${label} twists offered: ${q.cards.join(' | ')}; the way on with none picked says "${held.slip}"`);
    }],
    ['round 5: a twist picked by a tap', async () => {
      await tapAt('.sb-twistcard', 1);
      const q = await p.evaluate(() => ({ picked: window.deck.state().shop.twist, aria: [...document.querySelectorAll('.sb-twistcard')].map((e) => e.getAttribute('aria-checked')) }));
      if (q.picked !== 1 || q.aria.join() !== 'false,true') extra.push(`a tap did not pick the second twist: ${JSON.stringify(q)}`);
    }],
    ['round 5: the twist line on the table', async () => {
      const want = await p.evaluate(() => window.deck.state().shop.twists[1]);
      // The clipping's line (a hitch's trade line under it is the stall's, not the table's).
      const wantText = await p.evaluate(() => document.querySelectorAll('.sb-twistcard')[1]?.querySelector('span')?.textContent.trim());
      await tapAt('.sb-signpost');
      await settle(500);
      const q = await p.evaluate(() => ({ phase: window.deck.state().phase, twist: window.deck.state().twist, line: window.deck.twist() }));
      if (q.phase !== 'day' || JSON.stringify(q.twist) !== JSON.stringify(want)) extra.push(`the season did not take the twist picked: ${JSON.stringify(q.twist)} for ${JSON.stringify(want)}`);
      if (!q.line || q.line !== wantText) extra.push(`the table's twist line "${q.line}" is not the twist picked, "${wantText}"`);
      console.log(`       ${label} the table says "${q.line}"`);
    }],
    ['round 5: frost on the bottom row', async () => {
      await fresh(4242);
      const q = await p.evaluate(() => {
        const t = window.deck.table;
        t.run.twist = { id: 'frost' };
        t.syncAll();
        const seed = t.run.hand.find((c) => ['radish', 'carrot', 'lettuce', 'beans', 'strawberry', 'sunflower'].includes(c.id));
        t.pickUp(seed.uid);
        const valid = [...t.board.hl.valid];
        const rows = t.run.rows;
        return { valid, bottom: Array.from({ length: t.run.cols }, (_, c) => (rows - 1) * t.run.cols + c), uid: seed.uid };
      });
      if (q.valid.some((i) => q.bottom.includes(i)) || !q.valid.length) extra.push(`a held seed may go on the frosted row: ${q.valid.join(',')}`);
      // A real tap on a frosted plot plants nothing.
      const pt = await p.evaluate((i) => { const r = window.deck.rects().plots[i]; return [r.left + r.width / 2, r.top + r.height / 2]; }, q.bottom[1]);
      for (let k = 0; k < 2; k++) {
        if (touch) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt[0], y: pt[1], id: 5 }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else await p.mouse.click(pt[0], pt[1]);
        await settle(200);
      }
      const after = await p.evaluate((i) => ({ crop: window.deck.state().plots[i].crop, note: document.querySelector('.sb-note.on')?.textContent ?? '' }), q.bottom[1]);
      if (after.crop) extra.push('a seed was sown on the frosted row');
      console.log(`       ${label} frost: the held seed may go on ${q.valid.length} plots, none on the bottom row; a tap there says "${after.note}"`);
      await p.evaluate(() => window.deck.table.putDown(true));
    }],
    ['round 5: a radish and a strawberry sown today look different', async () => {
      await fresh(4242);
      const q = await p.evaluate(async () => {
        const t = window.deck.table;
        const crop = (uid, kind, days) => ({ uid, kind, age: 0, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false });
        for (const pl of t.run.plots) pl.crop = null;
        t.run.plots[5].crop = crop(9101, 'radish', 1);
        t.run.plots[6].crop = crop(9102, 'strawberry', 3);
        t.run.plots[9].crop = crop(9103, 'radish', 1);
        t.syncAll();
        await new Promise((r) => setTimeout(r, 400));
        const c = t.board.canvas;
        const g = c.getContext('2d');
        const k = c.width / c.getBoundingClientRect().width;
        // The packet stands upper right of the mound: read that corner of each plot.
        const patch = (i) => {
          const r = t.board.plotRect(i);
          const d = g.getImageData(Math.round((r.x + r.w * 0.5) * k), Math.round((r.y + r.h * 0.05) * k), Math.round(r.w * 0.45 * k), Math.round(r.h * 0.45 * k)).data;
          return d;
        };
        const diff = (a, b) => {
          let s = 0;
          for (let j = 0; j < a.length; j += 4) s += Math.abs(a[j] - b[j]) + Math.abs(a[j + 1] - b[j + 1]) + Math.abs(a[j + 2] - b[j + 2]);
          return s / (a.length / 4) / 3;
        };
        const r1 = patch(5);
        return { radishStrawberry: diff(r1, patch(6)), radishRadish: diff(r1, patch(9)) };
      });
      // Two radishes differ only by the soil under them; a radish and a strawberry must differ clearly more.
      if (q.radishStrawberry < q.radishRadish + 6) extra.push(`fresh radish and strawberry packets look alike: ${q.radishStrawberry.toFixed(1)} against ${q.radishRadish.toFixed(1)} for two radishes`);
      console.log(`       ${label} fresh packets: radish against strawberry differ by ${q.radishStrawberry.toFixed(1)} a channel, radish against radish ${q.radishRadish.toFixed(1)}`);
    }],
    ['round 5: the won run has its own page', async () => {
      await fresh(4243);
      await p.evaluate(async () => {
        const d = window.deck;
        const w = (ms) => new Promise((r) => setTimeout(r, ms));
        const t = d.table;
        const s = t.run;
        s.year = 3;
        s.season = 3;
        s.quota = 40;
        s.earned = 0;
        s.pages = ['cellar', 'bees', 'market', 'thumb'];
        s.stats.log = Array.from({ length: 11 }, (_, k) => ({ year: Math.floor(k / 4) + 1, season: k % 4, earned: 300 + k * 140, quota: 280 + k * 110, cleared: true, carried: k ? 30 : 0, twist: k >= 4 ? { id: 'buyer', crop: 'carrot' } : null }));
        s.stats.seasonsCleared = 11;
        s.stats.byKind = { carrot: 7000, radish: 3000, chili: 2000 };
        s.stats.bestHarvest = 380;
        s.stats.bestKind = 'carrot';
        s.plots[0].crop = { uid: 9201, kind: 'pumpkin', age: 5, days: 5, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false };
        t.syncAll();
        d.endDay();
        await w(60);
        d.skip();
        await w(200);
      });
      await settle(500);
      const q = await p.evaluate(() => {
        const r = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
        const b = [...document.querySelectorAll('.sb-entry button')].find((x) => /fresh page/.test(x.textContent))?.getBoundingClientRect();
        return {
          won: window.deck.state().end?.won,
          metDay: window.deck.state().end?.metDay,
          day: window.deck.state().day,
          title: document.querySelector('.sb-win-title h2')?.textContent ?? '',
          seal: r('.sb-win-top .sb-seal'),
          sum: r('.sb-win-sum'),
          best: !!document.querySelector('.sb-win-best img'),
          crops: document.querySelectorAll('.sb-win-crop').length,
          record: document.querySelector('.sb-win-record')?.textContent ?? '',
          ledger: !!document.querySelector('.sb-win-record ~ .sb-entries') || !!document.querySelector('.sb-win-head'),
          btn: b ? [b.top, b.bottom] : null,
          H: innerHeight,
        };
      });
      if (!q.won || q.title !== 'The run is won' || !q.seal) extra.push(`no won page: won ${q.won}, title "${q.title}"`);
      // The summary sits at the top, above the fold, not below the season ledger.
      if (!q.sum || q.sum.bottom > q.H * 0.5) extra.push(`the summary is not at the top (${q.sum ? Math.round(q.sum.bottom) : 'none'} of ${q.H})`);
      if (!q.best || q.crops < 1 || !/\d+ of \d+ runs?/.test(q.record) || !q.ledger) extra.push(`the won page lacks a part: best ${q.best}, crops ${q.crops}, record "${q.record}", ledger ${q.ledger}`);
      if (q.metDay !== 1 || q.day !== 1) extra.push(`the last winter did not end on the night it was met (met day ${q.metDay}, day ${q.day})`);
      if (!q.btn || q.btn[1] > q.H || q.btn[0] < 0) extra.push('"Turn to a fresh page" is off the screen on the won page');
      console.log(`       ${label} won page: summary ends at ${Math.round(q.sum?.bottom ?? 0)} of ${q.H}, ${q.crops} crops in the build, record "${q.record.replace(/\s+/g, ' ').slice(0, 60)}"`);
    }],
    ['round 5: the hand stays still after a play', async () => {
      await p.evaluate(() => window.deck.table.sheets.close());
      await fresh(4242);
      const before = await p.evaluate(() => {
        const t = window.deck.table;
        const out = {};
        for (const c of t.run.hand) {
          const r = t.handEls.get(c.uid).el.getBoundingClientRect();
          out[c.uid] = [r.left, r.top];
        }
        const i = t.run.hand.findIndex((c) => c.id === 'radish');
        return { out, i, uid: t.run.hand[i]?.uid };
      });
      const cp = await p.evaluate((uid) => { const r = window.deck.table.handEls.get(uid).el.getBoundingClientRect(); return [r.left + r.width * 0.3, r.top + r.height * 0.35]; }, before.uid);
      const pp = await p.evaluate(() => { const r = window.deck.rects().plots[5]; return [r.left + r.width / 2, r.top + r.height / 2]; });
      const tap = async ([x, y]) => {
        if (touch) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 6 }] });
          await p.waitForTimeout(40);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else await p.mouse.click(x, y);
        await settle(200);
      };
      await tap(cp);
      await tap(pp);
      if (touch) await tap(pp);
      await settle(600);
      const after = await p.evaluate(() => {
        const t = window.deck.table;
        const out = {};
        for (const c of t.run.hand) {
          const r = t.handEls.get(c.uid).el.getBoundingClientRect();
          out[c.uid] = [r.left, r.top];
        }
        return { out, planted: !!t.run.plots[5].crop };
      });
      const moved = Object.entries(after.out).map(([uid, [x, y]]) => Math.hypot(x - before.out[uid][0], y - before.out[uid][1]));
      if (!after.planted) extra.push('the radish was not planted by taps');
      if (Math.max(0, ...moved) > 1) extra.push(`cards left in the hand moved after a play by up to ${Math.max(...moved).toFixed(0)} px`);
      console.log(`       ${label} after a play the other ${moved.length} cards moved at most ${Math.max(0, ...moved).toFixed(1)} px`);
    }],
    ['round 5: the aim note shows for the first few aims, off the plot, and goes on planting', async () => {
      if (!touch) return;
      await fresh(4242);
      const seen = [];
      for (let k = 0; k < 4; k++) {
        const q = await p.evaluate((k) => {
          const t = window.deck.table;
          if (k === 0) t.tutor.learn.n.aimNote = 0;
          t.run.energy = 9;
          const seed = t.run.hand.find((c) => c.id === 'radish') ?? t.run.hand.find((c) => ['carrot', 'lettuce'].includes(c.id));
          if (!seed) t.run.hand.push({ uid: 9300 + k, id: 'radish', up: false });
          t.syncAll();
          const s2 = t.run.hand.find((c) => c.id === 'radish' || ['carrot', 'lettuce'].includes(c.id));
          const r = t.handEls.get(s2.uid).el.getBoundingClientRect();
          const plot = t.run.plots.findIndex((pl, i) => !pl.crop && !pl.obj && i < 4);
          const pr = window.deck.rects().plots[plot];
          return { card: [r.left + r.width * 0.3, r.top + r.height * 0.35], plot: [pr.left + pr.width / 2, pr.top + pr.height / 2], rect: [pr.left, pr.top, pr.right, pr.bottom], i: plot };
        }, k);
        const tap = async ([x, y]) => {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 7 }] });
          await p.waitForTimeout(40);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await settle(220);
        };
        await tap(q.card);
        await tap(q.plot);
        const aimed = await p.evaluate(() => {
          const n = document.querySelector('.sb-note');
          const on = n.classList.contains('on') && /again/.test(n.textContent);
          const r = n.getBoundingClientRect();
          return { on, box: [r.left, r.top, r.right, r.bottom] };
        });
        await tap(q.plot);
        const gone = await p.evaluate(() => !document.querySelector('.sb-note').classList.contains('on') || !/again/.test(document.querySelector('.sb-note').textContent));
        const over = aimed.on && !(aimed.box[2] <= q.rect[0] || aimed.box[0] >= q.rect[2] || aimed.box[3] <= q.rect[1] || aimed.box[1] >= q.rect[3]);
        seen.push({ k, on: aimed.on, over, gone });
      }
      if (!seen[0].on || !seen[2].on || seen[3].on) extra.push(`the aim note should show for the first three aims only: ${JSON.stringify(seen.map((x) => x.on))}`);
      if (seen.some((x) => x.over)) extra.push('the aim note covers the aimed plot');
      if (seen.some((x) => !x.gone)) extra.push('the aim note stays up after planting');
      console.log(`       ${label} aim note on aims 1 to 4: ${seen.map((x) => (x.on ? 'shown' : 'none')).join(', ')}; over the plot ${seen.filter((x) => x.over).length}; still up after planting ${seen.filter((x) => !x.gone).length}`);
    }],
    ['round 5: the desktop hand clears the screen foot; the side panel has no long bare stretch', async () => {
      if (touch) return;
      await fresh(4242);
      const q = await p.evaluate(() => {
        const cards = [...document.querySelectorAll('.sb-hand .sb-card:not(.flying)')].map((e) => e.getBoundingClientRect().bottom);
        const panel = document.querySelector('.sb-bench').getBoundingClientRect();
        const vis = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && !e.closest('.sb-off'); };
        const parts = ['.sb-ledger', '.sb-peg', '.sb-hint.on', '.sb-twist.on', '.sb-pages h4', '.sb-pages .sb-pagesheet', '.sb-pageslot', '.sb-keptline', '.sb-scoops img', '.sb-tin img', '.sb-lantern img']
          .flatMap((sel) => [...document.querySelectorAll(sel)].filter(vis).map((e) => e.getBoundingClientRect()))
          .filter((r) => r.left >= panel.left - 4 && r.width > 2)
          .sort((a, b) => a.top - b.top);
        let gap = 0;
        let bottom = parts[0]?.bottom ?? 0;
        for (const r of parts.slice(1)) {
          gap = Math.max(gap, r.top - bottom);
          bottom = Math.max(bottom, r.bottom);
        }
        return { lowest: Math.max(...cards), H: innerHeight, gap: Math.round(gap) };
      });
      if (q.lowest > q.H - 8) extra.push(`the hand reaches ${Math.round(q.lowest)} of ${q.H}: it runs off the foot`);
      if (q.gap > 150) extra.push(`the side panel has ${q.gap} px of bare table in one stretch`);
      console.log(`       ${label} the hand's lowest point ${Math.round(q.lowest)} of ${q.H}; the side panel's longest bare stretch ${q.gap} px (the round 4 build: about 320 between the pegboard and the scoops)`);
    }],
    ['round 5: the year\'s first stall: new stock, the twists and a full almanac on one screen', async () => {
      await toStall(98, 4000, (s) => {
        s.year = 2;
        s.season = 0;
        s.pages = ['barrel', 'cellar', 'bees', 'thumb'];
        s.stock = [{ card: 'corn', up: true }, { card: 'chili', up: true }];
        s.select = ['corn', 'chili'];
      });
      const q = await p.evaluate(() => ({
        stock: document.querySelector('.sb-stock')?.textContent ?? '',
        improved: [...document.querySelectorAll('.sb-good img')].filter((e) => /improved/.test(e.alt)).length,
        twists: document.querySelectorAll('.sb-twistcard').length,
        thing: [...document.querySelectorAll('.sb-thing')].map((e) => e.textContent),
        scroll: (() => { const b = document.querySelector('.sb-stall-body'); return b.scrollHeight - b.clientHeight; })(),
      }));
      if (!/New stock this year: improved corn and chili/.test(q.stock) || q.improved !== 2) extra.push(`new stock: "${q.stock}", ${q.improved} improved goods on the tray`);
      if (q.twists !== 2) extra.push(`${q.twists} twists at the year's first stall`);
      console.log(`       ${label} year's first stall: "${q.stock}", ${q.improved} improved goods, ${q.twists} twists, services ${q.thing.join(' / ')}, the body scrolls ${q.scroll} px`);
    }],
    ['round 5: a stall body that has to scroll says so', async () => {
      const q = await p.evaluate(async () => {
        const body = document.querySelector('.sb-stall-body');
        const st = document.querySelector('.sb-stall');
        st.style.height = '420px';
        body.dispatchEvent(new Event('scroll'));
        await new Promise((r) => requestAnimationFrame(() => r()));
        const can = body.scrollHeight > body.clientHeight + 2;
        const more = body.classList.contains('more');
        body.scrollTop = body.scrollHeight;
        body.dispatchEvent(new Event('scroll'));
        await new Promise((r) => setTimeout(r, 50));
        const end = body.classList.contains('more');
        st.style.height = '';
        body.scrollTop = 0;
        body.dispatchEvent(new Event('scroll'));
        return { can, more, end };
      });
      if (!q.can || !q.more || q.end) extra.push(`the scroll shade: can scroll ${q.can}, shaded ${q.more}, shaded at the end ${q.end}`);
      await p.evaluate(() => window.deck.table.sheets.stall());
    }],
    // Round 6: four-digit takes and quotas on the ledger, a neighbour's new total on its chip, kept pages that take a
    // tap on the phone, a hitch's trade line, goods that grow into the phone stall's room, notes about the whole table
    // in the strip (never over row 1), and the plain words the playtest asked for.
    ['round 6: four-digit takes and quotas on the ledger, the purse whole', async () => {
      await fresh(4242);
      const rows = [];
      for (const [earned, quota, coins] of [[1239, 1550, 1768], [1403, 1240, 3520], [12400, 15500, 12345], [99, 120, 40]]) {
        const q = await p.evaluate(([earned, quota, coins]) => {
          const t = window.deck.table;
          const s = t.run;
          s.year = 3;
          s.season = 2;
          s.earned = earned;
          s.quota = quota;
          s.coins = coins;
          t.syncAll();
          const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
          // The words themselves (a Range is not clipped by the ledger's edge, so a cut digit shows as words past it).
          const words = (e) => { const r = document.createRange(); r.selectNodeContents(e); return box(r); };
          return { led: box(document.querySelector('.sb-ledger')), tally: words(document.querySelector('.sb-led-tally')), season: words(document.querySelector('.sb-led-season')), purse: box(document.querySelector('.sb-purse')), coins: words(document.querySelector('.sb-purse b')), text: document.querySelector('.sb-led-tally').textContent, big: document.querySelector('.sb-ledger').classList.contains('big') };
        }, [earned, quota, coins]);
        const cross = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
        if (q.tally.r > q.led.r - 2 || q.tally.l < q.led.l || q.tally.b > q.led.b + 0.5) extra.push(`"${q.text}" runs past the ledger (words ${Math.round(q.tally.l)} to ${Math.round(q.tally.r)}, ledger ${Math.round(q.led.l)} to ${Math.round(q.led.r)})`);
        if (cross(q.tally, q.purse)) extra.push(`the purse covers "${q.text}"`);
        if (cross(q.tally, q.season)) extra.push(`"${q.text}" runs into the season's words`);
        if (q.coins.l < q.purse.l + 3 || q.coins.r > q.purse.r - 3) extra.push(`${coins} coins run past the purse (${Math.round(q.coins.r - q.coins.l)} px in ${Math.round(q.purse.r - q.purse.l)})`);
        rows.push(`"${q.text}"${q.big ? ' stacked' : ''} ${Math.round(q.led.r - q.tally.r)} px clear of the edge, ${coins} coins ${Math.round(q.coins.r - q.coins.l)} px in a ${Math.round(q.purse.r - q.purse.l)} px purse`);
      }
      console.log(`       ${label} ledger: ${rows.join('; ')}`);
    }],
    ['round 6: a neighbour\'s new total on its chip, and the night pays it', async () => {
      await fresh(4242);
      await p.evaluate(() => {
        const t = window.deck.table;
        const s = t.run;
        s.twist = null;
        s.crow = false;
        s.pages = ['cellar'];
        for (const q of s.plots) { q.crop = null; q.obj = null; q.boost = 0; }
        const crop = (uid, kind, age, days) => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false });
        s.plots[5].crop = crop(9301, 'carrot', 1, 2);
        s.plots[4].crop = crop(9302, 'radish', 0, 1);
        s.energy = 5;
        window.deck.hand(['radish', 'carrot']);
      });
      await settle(500);
      const rects = await p.evaluate(() => { const r = window.deck.rects(); const c = (x) => [x.left + x.width / 2, x.top + x.height / 2]; return { card: c(r.cards[0]), plot: c(r.plots[6]) }; });
      const tapOrClick = async (x, y) => {
        if (touch) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 11 }] });
          await p.waitForTimeout(40);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else await p.mouse.click(x, y);
        await settle(300);
      };
      // Take the radish up and aim it beside the carrot: a first tap on the phone, the pointer resting on the desktop.
      await tapOrClick(...rects.card);
      if (touch) await tapOrClick(...rects.plot);
      else {
        await p.mouse.move(...rects.plot, { steps: 4 });
        await settle(300);
      }
      const q = await p.evaluate(() => {
        const t = window.deck.table;
        const pv = window.deck.preview();
        const r = t.board.plotRect(5);
        return { chips: t.board.chips ?? [], mark: pv?.marks?.find((m) => m.plot === 5) ?? null, own: pv?.total ?? null, plot: r };
      });
      const tot = q.chips.filter((c) => c.kind === 'total');
      const chip = tot.find((c) => c.plot === 5);
      if (!q.mark?.total) extra.push(`the carrot's mark has no new total: ${JSON.stringify(q.mark)}`);
      else if (!chip || chip.text !== String(q.mark.total)) extra.push(`no chip on the carrot shows its new total ${q.mark.total}: ${JSON.stringify(tot)}`);
      if (chip && (chip.x < q.plot.x - 1 || chip.x + chip.w > q.plot.x + q.plot.w + 1 || chip.y < q.plot.y - 1)) extra.push(`the total chip runs out of its plot: ${JSON.stringify(chip)} in ${JSON.stringify(q.plot)}`);
      for (const c of q.chips) for (const d of q.chips) if (c !== d && Math.min(c.x + c.w, d.x + d.w) - Math.max(c.x, d.x) > 1 && Math.min(c.y + c.h, d.y + d.h) - Math.max(c.y, d.y) > 1) extra.push(`chips "${c.text}" and "${d.text}" overlap`);
      if (tot.some((c) => c.plot === 6)) extra.push('the aimed seed shows a total chip as well as its slip');
      // Plant it and play the night: the carrot pays what its chip said.
      if (touch) await tapOrClick(...rects.plot);
      else await tapOrClick(...rects.plot);
      const paid = await p.evaluate(async () => {
        const d = window.deck;
        const n = d.ruleScores().length;
        d.endDay();
        d.skip();
        await new Promise((r) => setTimeout(r, 400));
        return { planted: !!d.state().plots[6].crop || d.ruleScores().length > n, scores: d.ruleScores().slice(n) };
      });
      // Harvests in reading order: the radish on B2, the carrot on B2's right, the new radish.
      if (q.mark?.total && paid.scores[1] !== q.mark.total) extra.push(`the carrot's chip said ${q.mark.total}, the night paid ${paid.scores[1]} (${paid.scores.join(', ')})`);
      console.log(`       ${label} radish aimed beside the carrot: chips ${q.chips.map((c) => `${c.kind} ${c.text} on ${c.plot}`).join(', ')}; the radish's own slip ${q.own?.score}; the night paid ${paid.scores.join(', ')}`);
    }],
    ['round 6: kept pages take a tap on the phone; a hitch says what it takes off', async () => {
      await toStall(98, 4000, (s) => {
        s.year = 1;
        s.season = 3;
        s.pages = ['barrel', 'cellar', 'bees', 'thumb'];
      });
      const q = await p.evaluate(() => {
        const kept = [...document.querySelectorAll('.sb-keptpage')].map((e) => e.getBoundingClientRect().height);
        const cards = [...document.querySelectorAll('.sb-twistcard')].map((e) => ({ trade: e.querySelector('.sb-trade')?.textContent ?? '' }));
        const head = document.querySelector('.sb-purse-line').textContent;
        return { kept, cards, head, twists: window.deck.state().shop.twists.map((t) => t.id) };
      });
      // The phone's tap targets (the desktop's pointer is exact; its kept pages are a line of type, about 22 px).
      const want = label === 'phone' ? 40 : 20;
      if (!q.kept.length || Math.min(...q.kept) < want) extra.push(`kept pages are ${Math.round(Math.min(...q.kept))} px tall (want ${want} and up)`);
      const trades = q.cards.filter((c) => c.trade);
      const m = trades[0]?.trade.match(/^Spring asks (\d+), not (\d+)\.$/);
      const plain = Number(q.head.match(/asks (\d+)/)?.[1]);
      if (trades.length !== 1 || !m || Number(m[1]) >= Number(m[2]) || Number(m[2]) !== plain) extra.push(`the hitch's trade line: ${JSON.stringify(q.cards)}, head "${q.head}"`);
      // Pick the hitch by a real tap: the head asks the smaller quota.
      const hi = q.cards.findIndex((c) => c.trade);
      if (hi >= 0) await tapAt('.sb-twistcard', hi);
      const head2 = await p.evaluate(() => document.querySelector('.sb-purse-line').textContent);
      if (m && !head2.includes(`asks ${m[1]}.`)) extra.push(`picking the hitch left the head at "${head2}"`);
      // A swap by real taps: lift a page for sale, then tap a kept page twice.
      await tapAt('.sb-pagebtn', 0);
      await tapAt('.sb-keptpage', 0);
      await tapAt('.sb-keptpage', 0);
      const swapped = await p.evaluate(() => window.deck.state().pages.join());
      if (swapped.startsWith('barrel')) extra.push(`a swap by taps did not take: ${swapped}`);
      console.log(`       ${label} kept pages ${q.kept.map(Math.round).join('/')} px tall; ${q.twists.join(' / ')}: "${trades[0]?.trade}", head after the pick "${head2}"; pages after a swap ${swapped}`);
    }],
    ['round 6: the scoop says how many sat unused, and none is sold to a bench with scoops to spare', async () => {
      // A season of no plays leaves the bench full at every dusk: the scoop says so, and the stall sells none.
      await toStall(93, 4000, (s) => {
        s.year = 2;
        s.pages = [];
      });
      const at = await p.evaluate(() => [...document.querySelectorAll('.sb-thing')].findIndex((e) => /scoop/i.test(e.textContent)));
      await tapAt('.sb-thing', at);
      const before = await purse();
      await tapAt('.sb-thing', at);
      const spare = await p.evaluate(() => ({ slip: document.querySelector('.sb-slipspot .sb-read')?.textContent ?? '', scoops: window.deck.state().scoops }));
      const after = await purse();
      if (!/Last season \d+ scoops? a day sat unused\. You have scoops to spare\./.test(spare.slip) || spare.scoops !== 0 || after.rules !== before.rules) extra.push(`a bench with scoops to spare: "${spare.slip}", scoops ${spare.scoops}, coins ${before.rules} to ${after.rules}`);
      // A bench spent to the last scoop: for sale, two taps.
      await p.evaluate(() => {
        const s = window.deck.state();
        s.stats.log[s.stats.log.length - 1].idle = 0;
        window.deck.table.sheets.stall();
      });
      await p.keyboard.press('Escape');
      await settle(150);
      await tapAt('.sb-thing', at);
      const open = await p.evaluate(() => document.querySelector('.sb-slipspot .sb-read')?.textContent ?? '');
      await tapAt('.sb-thing', at);
      const bought = await p.evaluate(() => window.deck.state().scoops);
      if (!/again to buy/.test(open) || bought !== 1) extra.push(`a bench spent to the last scoop: "${open}", scoops ${bought}`);
      console.log(`       ${label} the scoop: "${spare.slip}" / "${open}"`);
    }],
    ['round 6: the phone stall\'s goods grow into its room', async () => {
      await toStall(91, 400, (s) => {
        s.season = 1;
        s.pages = ['cellar'];
      });
      const q = await p.evaluate(() => ({ goods: [...document.querySelectorAll('.sb-good')].map((e) => e.offsetWidth), two: document.querySelector('.sb-goods').classList.contains('two') }));
      if (label === 'phone' && Math.min(...q.goods) < 84) extra.push(`phone goods are ${Math.min(...q.goods)} px wide (they were 71 to 80)`);
      console.log(`       ${label} goods ${q.goods.join('/')} px wide${q.two ? ', two rows' : ''}`);
    }],
    ['round 6: notes about the whole table stand in the strip, never over row 1', async () => {
      await p.evaluate(() => window.deck.table.sheets.close());
      await fresh(4242);
      const q = await p.evaluate(async () => {
        const t = window.deck.table;
        const s = t.run;
        s.year = 2;
        s.season = 1;
        s.twist = { id: 'crows' };
        s.carried = 40;
        s.stats.log.push({ year: 2, season: 0, earned: 600, quota: 430, cleared: true, carried: 0, twist: null });
        t.setLine(null);
        t.syncAll();
        await new Promise((r) => setTimeout(r, 300));
        const twistOn = !!window.deck.twist();
        t.seasonStart();
        await new Promise((r) => setTimeout(r, 300));
        const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const note = box(document.querySelector('.sb-note'));
        const text = document.querySelector('.sb-note').textContent;
        const row1 = window.deck.rects().plots.slice(0, s.cols).map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
        const hb = t.hintBox;
        const tr = document.querySelector('.sb-twist').offsetParent.getBoundingClientRect();
        const strip = { l: tr.left + hb.x, t: tr.top + hb.y, r: tr.left + hb.x + hb.w, b: tr.top + hb.y + hb.h };
        const hushed = Number(getComputedStyle(document.querySelector('.sb-twist')).opacity);
        await new Promise((r) => setTimeout(r, 2600));
        const back = Number(getComputedStyle(document.querySelector('.sb-twist')).opacity);
        return { twistOn, note, text, row1, strip, hushed, back };
      });
      const cross = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
      if (!q.twistOn) extra.push('no twist line on the table to stand in front of');
      if (!/40 carried over from spring/.test(q.text)) extra.push(`the season's note reads "${q.text}"`);
      if (q.row1.some((r) => cross(q.note, r))) extra.push(`"${q.text}" covers row 1 of the plot`);
      if (!cross(q.note, q.strip)) extra.push(`"${q.text}" is not in the lesson strip (note ${Math.round(q.note.t)} to ${Math.round(q.note.b)}, strip ${Math.round(q.strip.t)} to ${Math.round(q.strip.b)})`);
      if (q.hushed > 0.1 || q.back < 0.9) extra.push(`the twist line under the note: opacity ${q.hushed} while it shows, ${q.back} after`);
      console.log(`       ${label} "${q.text}" in the strip; the twist line steps aside (opacity ${q.hushed}) and comes back (${q.back})`);
    }],
    ['round 6: plain words: the other beans, the scarecrow before the crows, the improve note with the Root Cellar, a won run\'s ledger', async () => {
      await fresh(4242);
      const q = await p.evaluate(async () => {
        const d = window.deck;
        const t = d.table;
        const s = t.run;
        const w = (ms) => new Promise((r) => setTimeout(r, ms));
        s.twist = null;
        s.crow = false;
        s.energy = 9;
        for (const pl of s.plots) { pl.crop = null; pl.obj = null; pl.boost = 0; }
        // Beans on their last pick tonight, and beans held beside them: the old beans' +2 is gone before the new ripen.
        s.plots[5].crop = { uid: 9401, kind: 'beans', age: 3, days: 3, up: false, compost: 0, rot: false, picks: 2, pest: 0, sprout: false };
        d.hand(['beans', 'scarecrow']);
        await w(200);
        t.pickUp(s.hand[0].uid);
        t.hover = 6;
        t.board.preview = null;
        t.updateHighlight?.();
        await w(250);
        const beans = d.preview()?.reason?.text ?? '';
        t.putDown(true);
        t.pickUp(s.hand[1].uid);
        t.hover = 0;
        t.updateHighlight?.();
        await w(250);
        const scarecrow = d.preview()?.none?.text ?? '';
        t.putDown(true);
        return { beans, scarecrow };
      });
      if (q.beans !== 'The other beans are pulled before these ripen.') extra.push(`two beans side by side read "${q.beans}"`);
      if (q.scarecrow !== 'Keeps crows off from now on.') extra.push(`a scarecrow before the crows reads "${q.scarecrow}"`);
      // The improve sheet with the Root Cellar kept: the carrot's basket counts its +2.
      await toStall(91, 900, (s) => {
        s.pages = ['cellar'];
      });
      await p.evaluate(() => {
        window.deck.table.tutor.unlock('services');
        window.deck.table.sheets.deck('all', 'upgrade');
      });
      await settle(200);
      const idx = await p.evaluate(() => [...document.querySelectorAll('.sb-tincard')].findIndex((b) => /Carrot/.test(b.querySelector('img').alt)));
      await tapAt('.sb-tincard', idx);
      const improve = await p.evaluate(() => document.querySelector('.sb-pickline')?.textContent ?? '');
      if (!/Carrot: basket 7 to 10\./.test(improve)) extra.push(`the improve note with the Root Cellar reads "${improve}"`);
      await p.evaluate(() => window.deck.table.sheets.close());
      // A won run's ledger.
      await fresh(4242);
      const won = await p.evaluate(async () => {
        const d = window.deck;
        const s = d.state();
        s.year = 3;
        s.season = 3;
        s.earned = 99999;
        d.endDay();
        d.skip();
        await new Promise((r) => setTimeout(r, 500));
        return { won: d.state().end?.won, ledger: document.querySelector('.sb-led-day').textContent };
      });
      if (!won.won || won.ledger !== 'Run won') extra.push(`a won run's ledger reads "${won.ledger}" (won ${won.won})`);
      console.log(`       ${label} "${q.beans}" / "${q.scarecrow}" / "${improve}" / the won run's ledger "${won.ledger}"`);
      await p.evaluate(() => window.deck.table.sheets.close());
    }],
    // Round 7: the engine at a run's first stall; the reason line clear of the chips it explains; coin totals and the
    // can's; what is still to go; the hand closing its gaps; tall crops inside their plot; one-line kept pages.
    ['round 7: the first stall offers three engines, and a tap picks one', async () => {
      await toStall(97, 120, null, true);
      const q = await p.evaluate(() => ({ n: document.querySelectorAll('.sb-enginecard').length, rules: window.deck.state().shop.engines?.length ?? 0, text: [...document.querySelectorAll('.sb-enginecard')].map((e) => e.textContent.trim()) }));
      if (q.n !== 3 || q.rules !== 3) extra.push(`the first stall shows ${q.n} engines (rules ${q.rules})`);
      // The way on asks for one first, then a real tap picks one: pinned, the others faded.
      await tapAt('.sb-signpost');
      const ask = await p.evaluate(() => ({ phase: window.deck.state().phase, slip: document.querySelector('.sb-read')?.textContent ?? '' }));
      if (ask.phase !== 'shop' || !/Pick one to take home first/.test(ask.slip)) extra.push(`the way on did not ask for an engine: ${JSON.stringify(ask)}`);
      await tapAt('.sb-enginecard', 2);
      const took = await p.evaluate(() => ({ i: window.deck.state().shop.engine, pinned: document.querySelectorAll('.sb-enginecard.picked').length }));
      if (took.i !== 2 || took.pinned !== 1) extra.push(`a tap did not pick the engine: ${JSON.stringify(took)}`);
      console.log(`       ${label} engines: ${q.text.join(' | ')}`);
    }],
    ['round 7: the reason line covers none of the chips it explains', async () => {
      await p.evaluate(() => window.deck.table.sheets.close());
      await fresh(4242);
      // The playtest's day 6: beans on C3 that are pulled before a sunflower aimed at C2 ripens. The beans gain the
      // sunflower's +2 bloom and show their new total; the reason under C2 hid both.
      await p.evaluate(() => {
        const s = window.deck.state();
        s.twist = null;
        s.crow = false;
        s.pages = [];
        s.day = 4;
        for (const q of s.plots) { q.crop = null; q.obj = null; q.boost = 0; }
        s.plots[10].crop = { uid: 9401, kind: 'beans', age: 3, days: 3, up: false, compost: 0, rot: false, picks: 1, pest: 0, sprout: false };
        s.energy = 5;
        window.deck.hand(['sunflower', 'radish']);
      });
      await settle(400);
      const r = await p.evaluate(() => { const x = window.deck.rects(); const c = (b) => [b.left + b.width / 2, b.top + b.height / 2]; return { card: c(x.cards[0]), plot: c(x.plots[6]) }; });
      const go = async ([x, y]) => {
        if (touch) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 12 }] });
          await p.waitForTimeout(40);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else await p.mouse.click(x, y);
        await settle(250);
      };
      await go(r.card);
      if (touch) await go(r.plot);
      else {
        await p.mouse.move(...r.plot, { steps: 4 });
        await settle(300);
      }
      const q = await p.evaluate(() => {
        const b = window.deck.table.board;
        return { reason: b.reasonBox, chips: b.chips, slip: b.totalSlip };
      });
      if (!q.reason) extra.push('no reason line under the aimed sunflower');
      else {
        const cross = (a, c) => Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x) > 0.5 && Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y) > 0.5;
        for (const c of q.chips) if (cross(q.reason, c)) extra.push(`the reason "${q.reason.text}" covers the chip "${c.text}" on plot ${c.plot}`);
        if (q.slip && cross(q.reason, q.slip)) extra.push(`the reason covers the aimed seed's slip`);
      }
      if (!q.chips.some((c) => c.plot === 10 && c.kind === 'total')) extra.push(`the beans show no new total: ${JSON.stringify(q.chips)}`);
      console.log(`       ${label} reason "${q.reason?.text}" at y ${Math.round(q.reason?.y ?? 0)}; chips ${q.chips.map((c) => `${c.text} on ${c.plot} at y ${Math.round(c.y)}`).join(', ')}`);
      await p.evaluate(() => window.deck.table.putDown(true));
    }],
    ['round 7: coin totals by a coin, and the can shows what it brings in tonight', async () => {
      await fresh(4242);
      await p.evaluate(() => {
        const s = window.deck.state();
        s.twist = null;
        s.crow = false;
        s.pages = [];
        for (const q of s.plots) { q.crop = null; q.obj = null; q.boost = 0; }
        const crop = (uid, kind, age, days) => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false });
        s.plots[9].crop = crop(9501, 'carrot', 0, 2);
        s.plots[8].crop = crop(9502, 'radish', 0, 1);
        s.plots[10].crop = crop(9503, 'radish', 0, 1);
        s.energy = 5;
        window.deck.hand(['can', 'radish']);
      });
      await settle(400);
      const r = await p.evaluate(() => { const x = window.deck.rects(); const c = (b) => [b.left + b.width / 2, b.top + b.height / 2]; return { card: c(x.cards[0]), plot: c(x.plots[9]) }; });
      const go = async ([x, y]) => {
        if (touch) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 13 }] });
          await p.waitForTimeout(40);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else await p.mouse.click(x, y);
        await settle(250);
      };
      await go(r.card);
      if (touch) await go(r.plot);
      else {
        await p.mouse.move(...r.plot, { steps: 4 });
        await settle(300);
      }
      const q = await p.evaluate(() => {
        const t = window.deck.table;
        const b = t.board;
        const tot = b.chips.find((c) => c.plot === 9 && c.kind === 'total');
        // The chip's icon, read from the canvas: a gold coin, not the ink basket.
        let gold = 0;
        if (tot) {
          const g = b.canvas.getContext('2d');
          const k = b.canvas.width / b.canvas.getBoundingClientRect().width;
          const d = g.getImageData(Math.round((tot.x + tot.w * 0.55) * k), Math.round(tot.y * k), Math.max(1, Math.round(tot.w * 0.45 * k)), Math.max(1, Math.round(tot.h * k))).data;
          for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] > 140 && d[i + 2] < 110) gold++;
        }
        return { tot, gold, mark: window.deck.preview()?.marks?.find((m) => m.plot === 9) ?? null };
      });
      if (!q.tot) extra.push(`the carrot the can brings in tonight shows no total: ${JSON.stringify(q.mark)}`);
      else if (q.gold < 6) extra.push(`the total chip "${q.tot.text}" has no gold coin (${q.gold} gold pixels)`);
      // Water it and play the night: the carrot pays what its chip said.
      await go(r.plot);
      const paid = await p.evaluate(async () => {
        const d = window.deck;
        const n = d.ruleScores().length;
        d.endDay();
        d.skip();
        await new Promise((res) => setTimeout(res, 400));
        return d.ruleScores().slice(n);
      });
      if (q.tot && !paid.includes(Number(q.tot.text))) extra.push(`the chip said ${q.tot.text}, the night paid ${paid.join(', ')}`);
      console.log(`       ${label} the can on row 3: carrot chip ${q.tot?.text} (${q.gold} gold pixels), the night paid ${paid.join(', ')}`);
    }],
    ['round 7: the last two days say what is still to go', async () => {
      await fresh(4242);
      const rows = [];
      for (const [day, earned] of [[4, 100], [5, 286], [6, 286], [6, 400]]) {
        const q = await p.evaluate(([day, earned]) => {
          const t = window.deck.table;
          const s = t.run;
          s.day = day;
          s.earned = earned;
          s.quota = 350;
          t.syncAll();
          const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
          const words = (e) => { const r = document.createRange(); r.selectNodeContents(e); return box(r); };
          const i = document.querySelector('.sb-led-tally i');
          return { go: window.deck.toGo(), led: box(document.querySelector('.sb-ledger')), words: i ? words(i) : null, tally: words(document.querySelector('.sb-led-tally b')) };
        }, [day, earned]);
        const want = day >= 5 && earned < 350 ? `${350 - earned} to go` : '';
        if (q.go !== want) extra.push(`day ${day} at ${earned} of 350: the ledger says "${q.go}", want "${want}"`);
        if (q.words && (q.words.r > q.led.r - 1 || q.words.b > q.led.b + 0.5 || q.words.l < q.led.l)) extra.push(`"${q.go}" runs out of the ledger`);
        rows.push(`day ${day}, ${earned}: "${q.go}"`);
      }
      console.log(`       ${label} ${rows.join('; ')}`);
    }],
    ['round 7: the hand closes its gaps once it rests', async () => {
      await fresh(4242);
      await p.evaluate(() => window.deck.hand(['radish', 'carrot', 'radish', 'lettuce', 'radish']));
      await settle(400);
      const r = await p.evaluate(() => { const x = window.deck.rects(); const c = (b) => [b.left + b.width * 0.5, b.top + b.height * 0.35]; return { card: c(x.cards[2]), plot: [x.plots[5].left + x.plots[5].width / 2, x.plots[5].top + x.plots[5].height / 2] }; });
      const go = async ([x, y]) => {
        if (touch) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 14 }] });
          await p.waitForTimeout(40);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else await p.mouse.click(x, y);
        await settle(200);
      };
      await go(r.card);
      await go(r.plot);
      if (touch) await go(r.plot);
      const soon = await p.evaluate(() => window.deck.table.handGaps);
      if (!touch) await p.mouse.move(640, 300);
      await settle(1900);
      const later = await p.evaluate(() => {
        const t = window.deck.table;
        // Centres: a tilted card's box widens about its centre.
        const xs = t.run.hand.map((c) => { const r = t.handEls.get(c.uid).el.getBoundingClientRect(); return (r.left + r.right) / 2; }).sort((a, b) => a - b);
        const steps = xs.slice(1).map((x, k) => x - xs[k]);
        return { gaps: t.handGaps, n: t.run.hand.length, spread: steps.length ? Math.max(...steps) - Math.min(...steps) : 0 };
      });
      if (soon !== 1) extra.push(`right after the play the hand should keep its gap (gaps ${soon})`);
      if (later.gaps !== 0 || later.spread > 3) extra.push(`once it rests the hand still has a gap: ${JSON.stringify(later)}`);
      console.log(`       ${label} gap right after the play ${soon}; after a rest ${later.gaps} (spacing varies ${later.spread.toFixed(1)} px over ${later.n} cards)`);
    }],
    ['round 7: tall crops stay inside their own plot', async () => {
      await fresh(4242);
      // Beans, a sunflower and corn, ripe, with the plots above them bare and the key letters above row 1.
      const grab = (fill) => p.evaluate(async (fill) => {
        const t = window.deck.table;
        const s = t.run;
        s.twist = null;
        s.crow = false;
        for (const q of s.plots) { q.crop = null; q.obj = null; q.boost = 0; }
        const crop = (uid, kind, age, days) => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false });
        if (fill) {
          s.plots[5].crop = crop(9601, 'sunflower', 3, 3);
          s.plots[6].crop = crop(9602, 'beans', 3, 3);
          s.plots[7].crop = crop(9603, 'corn', 4, 4);
          s.plots[0].crop = crop(9604, 'beans', 3, 3);
          s.plots[1].crop = crop(9605, 'sunflower', 3, 3);
        }
        t.syncAll();
        await new Promise((r) => setTimeout(r, 300));
        const b = t.board;
        const g = b.canvas.getContext('2d');
        const k = b.canvas.width / b.canvas.getBoundingClientRect().width;
        const read = (x, y, w, h) => g.getImageData(Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k)).data;
        const up = [1, 2, 3].map((i) => b.plotRect(i));
        const p0 = b.plotRect(0);
        return { plots: up.map((r) => Array.from(read(r.x + 3, r.y + 3, r.w - 6, r.h - 6))), margin: Array.from(read(p0.x, p0.y - p0.h * 0.45, p0.w * 2, p0.h * 0.42)) };
      }, fill);
      const bare = await grab(false);
      const full = await grab(true);
      const diff = (a, c) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]) > 60) n++; return n / (a.length / 4); };
      // Plots B1 to D1 hold nothing: what the crops below them paint there is overhang. (B1 holds a sunflower in row 1
      // too, so its plot is read against the bare board only for the part a crop below would reach.)
      const over = [diff(bare.plots[1], full.plots[1]), diff(bare.plots[2], full.plots[2])];
      const margin = diff(bare.margin, full.margin);
      if (Math.max(...over) > 0.01) extra.push(`a tall crop paints over the plot above it: ${over.map((v) => `${(v * 100).toFixed(1)}%`).join(', ')}`);
      if (margin > 0.01) extra.push(`a tall crop in row 1 paints over the key letters' margin: ${(margin * 100).toFixed(1)}%`);
      console.log(`       ${label} overhang into the plots above: ${over.map((v) => `${(v * 100).toFixed(2)}%`).join(', ')}; into the margin above row 1: ${(margin * 100).toFixed(2)}%`);
    }],
    ['round 7: kept pages are one line each, all in sight', async () => {
      await fresh(4242);
      await p.evaluate(() => {
        const t = window.deck.table;
        t.run.pages = ['cellar', 'coldframe', 'basket', 'bees', 'market', 'clover'];
        t.run.slots = 5;
        t.syncAll();
        t.relayout();
      });
      await settle(400);
      const q = await p.evaluate(() => {
        const panel = document.querySelector('.sb-pages');
        if (!panel || getComputedStyle(panel).display === 'none' || panel.getBoundingClientRect().height < 2) return null;
        const pr = panel.getBoundingClientRect();
        const lines = [...panel.querySelectorAll('.sb-keptline')].map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent, in: r.top >= pr.top - 0.5 && r.bottom <= pr.bottom + 0.5, h: r.height }; });
        return { lines, over: panel.scrollHeight - panel.clientHeight };
      });
      // The phone reads kept pages in the almanac; the desktop lists them in the side panel.
      if (label === 'desk') {
        if (!q) extra.push('no kept pages panel on the desktop');
        else {
          for (const l of q.lines) if (!l.in) extra.push(`kept page "${l.text}" is cut off`);
          if (q.lines.filter((l) => !/Room/.test(l.text)).length !== 6 || q.lines.filter((l) => /Room for a page/.test(l.text)).length !== 3) extra.push(`the panel lists ${q.lines.map((l) => l.text).join(', ')} for 6 pages and room for 3`);
        }
        console.log(`       ${label} kept pages: ${q?.lines.map((l) => `${l.text} ${Math.round(l.h)} px`).join(', ')}`);
      }
      await p.evaluate(() => {
        const t = window.deck.table;
        t.run.pages = [];
        t.run.slots = 0;
        t.syncAll();
        t.relayout();
      });
    }],
    ['round 7: the run\'s end with new cards says when there is more below', async () => {
      await fresh(4242);
      await p.evaluate(() => {
        const t = window.deck.table;
        const s = t.run;
        s.stats.log = Array.from({ length: 7 }, (_, k) => ({ year: Math.floor(k / 4) + 1, season: k % 4, earned: 300 + k * 90, quota: 280 + k * 80, cleared: k < 6, carried: 20 }));
        s.phase = 'over';
        s.end = { year: 2, season: 2, earned: 431, quota: 690, unlocked: ['beehive', 'chili', 'corn', 'wheat', 'pumpkin', 'shears'], recorded: true };
        t.sheets.entry();
      });
      await settle(500);
      const q = await p.evaluate(() => {
        const body = document.querySelector('.sb-entry-body');
        const imgs = [...document.querySelectorAll('.sb-new img')];
        const br = body.getBoundingClientRect();
        const cut = imgs.filter((e) => e.getBoundingClientRect().bottom > br.bottom + 1).length;
        return { more: body.classList.contains('more'), scroll: body.scrollHeight - body.clientHeight, cut, n: imgs.length };
      });
      if (q.cut && !q.more) extra.push(`${q.cut} of the ${q.n} new cards are cut off with no shade`);
      console.log(`       ${label} the run's end: ${q.n} new cards, ${q.cut} below the fold, scrolls ${q.scroll} px, shade ${q.more}`);
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
    // Round 7: nothing cut off without a sign. A panel or body whose content runs past its foot must scroll and show its
    // soft shade while there is more below; a panel that cannot scroll must hold everything (the seventh playtest's
    // desktop kept pages showed half of Big Basket, and the run's end cut off its new cards with no shade).
    for (const q of await p.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll('.sb-pages, .sb-entry-body, .sb-stall-body')) {
        const st = getComputedStyle(e);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const more = e.scrollHeight - e.clientHeight - e.scrollTop > 2;
        const scrolls = /(auto|scroll)/.test(st.overflowY);
        const name = e.className.split(' ')[0];
        if (more && !scrolls) out.push(`${name} cuts off ${Math.round(e.scrollHeight - e.clientHeight)} px of its content and cannot scroll`);
        else if (more && name !== 'sb-pages' && !e.classList.contains('more')) out.push(`${name} has ${Math.round(e.scrollHeight - e.clientHeight - e.scrollTop)} px more below and no shade`);
        else if (more && name === 'sb-pages') out.push(`the kept pages run ${Math.round(e.scrollHeight - e.clientHeight)} px past their panel`);
      }
      return out;
    })) hits.push(`clipped: ${q}`);
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
