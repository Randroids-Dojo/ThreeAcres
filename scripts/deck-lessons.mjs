// Seedbound's guided first season, played and measured. On a 412 by 838 phone
// with real touch (CDP Input.dispatchTouchEvent), then on a 1280 by 800 desktop
// with the mouse and keyboard, it plays the first season as a new player would
// and records exactly what is on the table at every step. It fails if:
//   - any piece of the table shows before the lesson that brings it in
//   - a lesson does not end when its action is done
//   - a note is longer than eight words, or a card face paints a sentence
//   - holding a card shows no preview where a bonus applies
//   - cost scoops on a card are under 14 CSS px, an unaffordable card is not
//     visibly darker (pixel luminance), or the scoops a held card would use do
//     not lift
//   - the lessons do not survive a reload, or a returning player gets the
//     guided season again
//   - anything but the shell's button lies in the shell's corner, at any step
//   - a radish aimed beside a fresh carrot promises the carrot bloom it won't
//     get (the night pulls the radish first), or the day 3 line does not teach
//     the timing
//   - cost is not taught a piece at a time: the scoops show before the first
//     dear seed (the beans, day 4), the beans do not print two scoops and the
//     radish Free, the two scoops a held bean card would use do not lift, no
//     scoop flies to the bench for a crop pulled up at night, or day 5's dawn
//     does not lay out the scoops put back and say why
//   - the stall's first tap buys, or does not say what the card does; the
//     purse disagrees with the rules after a purchase
//   - days 4 to 6 of the guided season bring more than one new card a day
//   - on touch, the first tap with a tool on a plot does not show what a mouse
//     hovering that plot shows (the wash, the moon +1, the +6 yield), measured
//     on the phone and the desktop and compared
//   - ending the day within a moment of a play shows the morning's board or
//     tomorrow's hand during the night (sampled 0.35 s and 0.5 s in)
//   - round 4: on touch a seed's first tap on a plot does not preview it there (or plants it), the second does not
//     plant it, or the preview differs from a mouse hovering that plot (a radish, beans); held beans mark no plot
//     where their +2 would land; the can's preview does not give the crop it brings in tonight its moon; giving up
//     from the almanac does not end the run with its entry, count its seasons and keep its best harvest
//   - round 5: guided day 6 asks to toss a card while every card in hand has a job; the spent lesson does not wait
//     for a card with no use, or stays up once there is none; the first crow asks to set out a scarecrow still in
//     the tin; the stall before year 2 does not offer two twists with its lesson line, lets the way on go with none
//     picked, or does not take a real tap (or arrows and Enter) on a twist; the season's table does not say the
//     twist; the pegboard's line is not "Fill the pegboard" (no "brass hole")
// Screens go to /tmp/deck-lessons/; the step-by-step table to steps-*.json.
// node scripts/deck-lessons.mjs [base url]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cornerScan } from './deck-checks.mjs';

const base = process.argv[2] ?? 'http://localhost:5252';
const out = '/tmp/deck-lessons';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

// Which lesson brings each piece in. A piece on the table before its lesson has come up is a failure.
const BRINGS = { lantern: 'lantern', peg: 'peg', scoops: 'scoops', coins: 'coins', tin: 'tin', spent: 'spent', tonight: 'weather', pages: 'pages', services: 'services' };
// Pieces the night may bring in itself, the moment they are first needed: the pegboard for the first harvest, coins at the season's end.
const NIGHT = { peg: 'the first harvest', coins: 'the season end' };

async function session(label, viewport, touch) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errs.push(`console ${m.text()}`));
  const cdp = await ctx.newCDPSession(p);
  const wait = (ms) => p.waitForTimeout(ms);
  const touchEv = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) });
  async function tap(x, y, hold = 50) {
    if (touch) {
      await touchEv('touchStart', [[x, y, 1]]);
      await wait(hold);
      await touchEv('touchEnd', []);
    } else await p.mouse.click(x, y);
    await wait(90);
  }
  /** Drag from a to b; `mid` runs with the finger (or button) still down over b. */
  async function drag(x0, y0, x1, y1, mid) {
    if (touch) {
      await touchEv('touchStart', [[x0, y0, 2]]);
      for (let i = 1; i <= 12; i++) {
        await touchEv('touchMove', [[x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12, 2]]);
        await wait(16);
      }
      await wait(60);
      if (mid) await mid();
      await touchEv('touchEnd', []);
    } else {
      await p.mouse.move(x0, y0);
      await p.mouse.down();
      for (let i = 1; i <= 12; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12);
      await wait(60);
      if (mid) await mid();
      await p.mouse.up();
    }
    await wait(120);
  }
  const cardPoint = (i) =>
    p.evaluate((i) => {
      const t = window.deck.table;
      const c = t.run.hand[i];
      const el = c && t.handEls.get(c.uid)?.el;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      for (const fy of [0.35, 0.5, 0.2, 0.7]) {
        for (const fx of [0.3, 0.15, 0.45, 0.6, 0.8]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          if (y > innerHeight - 4) continue;
          if (document.elementFromPoint(x, y)?.closest('.sb-card') === el) return [x, y];
        }
      }
      return null;
    }, i);
  const handIndex = (id) => p.evaluate((id) => window.deck.state().hand.findIndex((c) => c.id === id), id);
  const plotPoint = (i) => p.evaluate((i) => { const r = window.deck.rects().plots[i]; return [r.left + r.width / 2, r.top + r.height * 0.6]; }, i);
  /** Sow the held seed on a plot: a click on the desktop; on touch the first tap aims (round 4) and the second plants. */
  const sow = async (i) => {
    await tap(...(await plotPoint(i)));
    if (touch) await tap(...(await plotPoint(i)));
  };
  const center = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const idle = () => p.waitForFunction(() => !window.deck.busy(), null, { timeout: 30000 });
  /** Mean luminance of the middle of a hand card's face, from a screenshot: an unaffordable card is dimmed. */
  const lum = async (uid) => {
    const r = await p.evaluate((uid) => { const e = window.deck.table.handEls.get(uid).el.querySelector('img').getBoundingClientRect(); return { x: e.left, y: e.top, w: e.width, h: Math.min(e.height, innerHeight - e.top) }; }, uid);
    const png = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x + r.w * 0.15, y: r.y + r.h * 0.3, width: r.w * 0.7, height: r.h * 0.4, scale: 1 } });
    return p.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    }, png.data);
  };

  const frames = (n = 6) => wait(n * 17);

  /** Exactly what is on the table right now. */
  const table = () =>
    p.evaluate(() => {
      const vis = (e) => {
        if (!e) return false;
        for (let a = e; a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
        }
        const r = e.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      };
      const q = (s) => document.querySelector(s);
      const d = window.deck;
      const sheet = q('.sb-sheets.on');
      return {
        day: d.state().day,
        season: d.state().season,
        phase: d.state().phase,
        hand: d.state().hand.map((c) => c.id),
        pieces: {
          lantern: vis(q('.sb-lantern')),
          peg: vis(q('.sb-peg')) || vis(q('.sb-ledger')),
          scoops: vis(q('.sb-scoops')),
          coins: vis(q('.sb-purse')),
          tin: vis(q('.sb-tin')),
          spent: vis(q('.sb-heap')),
          tonight: vis(q('.sb-tonight')) && !!q('.sb-tonight img'),
          pages: vis(q('.sb-pages')) || vis(q('.sb-cork')),
          services: vis(q('.sb-lip')),
        },
        cost: [...document.querySelectorAll('.sb-hand .sb-card .sb-cost i')].filter(vis).length,
        book: vis(q('.sb-book')),
        line: vis(q('.sb-hint.on')) ? q('.sb-hint').textContent : vis(q('.sb-stall-lesson')) ? q('.sb-stall-lesson').textContent : '',
        lesson: d.lesson()?.id ?? null,
        sheet: sheet ? sheet.dataset.kind : null,
        done: d.table.tutor.learn.done.slice(),
      };
    });

  // Every lesson that has come up so far (finished or on screen): the pieces it brings may show.
  const started = new Set();
  const nightBrought = new Set();
  const steps = [];
  const lines = new Set();
  async function step(name, extra = {}) {
    await frames(4);
    const t = await table();
    for (const id of t.done) started.add(id);
    if (t.lesson) started.add(t.lesson);
    if (t.line) lines.add(t.line);
    const early = Object.entries(t.pieces).filter(([k, on]) => on && !started.has(BRINGS[k]) && !nightBrought.has(k));
    steps.push({ step: name, ...t, ...extra });
    const corner = await p.evaluate(cornerScan);
    if (corner.length) check(`${label}: ${name}: the shell's corner is clear`, false, corner.slice(0, 3).join(' | '));
    check(`${label}: ${name}: nothing before its lesson`, early.length === 0, early.length ? `early: ${early.map(([k]) => k).join(', ')}` : `on: ${Object.entries(t.pieces).filter(([, v]) => v).map(([k]) => k).join(', ') || 'plot and hand only'}${t.line ? `; "${t.line}"` : ''}`);
    return t;
  }
  const shot = (name) => p.screenshot({ path: `${out}/${label}-${name}.png` });
  const words = (s) => s.split(/\s+/).filter(Boolean).length;

  // Notes too, as they come and go.
  await p.addInitScript(() => {
    window.__notes = [];
    new MutationObserver(() => {
      const n = document.querySelector('.sb-note.on');
      if (n && window.__notes.at(-1) !== n.textContent) window.__notes.push(n.textContent);
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });

  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  await wait(400);
  if (touch) {
    // Tell the shell this is a finger (touching bare table changes nothing).
    await touchEv('touchStart', [[200, 40, 9]]);
    await touchEv('touchEnd', []);
    await wait(100);
  }

  // ---------------------------------------------------------------- day 1: two radishes, the plot, one note
  let t = await step('day 1, first screen');
  await shot('1-first');
  check(`${label}: the first hand is two radishes`, t.hand.join() === 'radish,radish', t.hand.join());
  check(`${label}: no cost printed yet`, t.cost === 0);
  check(`${label}: the almanac stays, quietly`, t.book);
  check(`${label}: one line, about the radish`, /radish/i.test(t.line), t.line);
  if (!touch) {
    // Keyboard: take the first radish up and sow it with the arrows and Enter.
    await p.keyboard.press('Digit1');
    await frames(4);
    t = await step('day 1, radish taken up by key');
    check(`${label}: the line follows the keyboard`, /arrows|Enter/.test(t.line), t.line);
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Enter');
    await wait(500);
  } else {
    await tap(...(await cardPoint(0)));
    t = await step('day 1, radish taken up');
    check(`${label}: the line moves on to the plot`, /plot/i.test(t.line), t.line);
    await shot('2-held');
    // Round 4: on touch a seed aims on the first tap and shows what it would pay there; the second tap plants it.
    await tap(...(await plotPoint(5)));
    const aim = await p.evaluate(() => ({ pv: window.deck.preview(), hand: window.deck.state().hand.length, crop: !!window.deck.state().plots[5].crop }));
    t = await step('day 1, radish aimed');
    await shot('2b-aimed');
    check(`${label}: the first tap on a plot previews the seed there and plants nothing`, aim.pv?.total?.plot === 5 && aim.pv.total.score === 2 && aim.hand === 2 && !aim.crop, JSON.stringify({ total: aim.pv?.total, hand: aim.hand, crop: aim.crop }));
    check(`${label}: and the line says to tap again`, /again/i.test(t.line), t.line);
    await tap(...(await plotPoint(5)));
    await wait(500);
  }
  t = await step('day 1, one radish sown');
  check(`${label}: one action, then the next`, /other radish/i.test(t.line), t.line);
  // The second radish by drag: while it is over a plot the board shows what it would score there.
  {
    const cp = await cardPoint(0);
    const pp = await plotPoint(10);
    let pv = null;
    await drag(...cp, ...pp, async () => {
      pv = await p.evaluate(() => window.deck.preview());
      await shot('3-drag-preview');
    });
    check(`${label}: dragging over a plot previews its score`, !!pv?.total && pv.total.plot === 10 && pv.total.score === 2, JSON.stringify(pv?.total));
  }
  await wait(500);
  t = await step('day 1, both sown');
  check(`${label}: the lantern comes in once it is needed`, t.pieces.lantern && /lantern|Press E/.test(t.line), t.line);
  await shot('4-lantern');
  // End the day: the first harvest brings the pegboard. Yield only on the slip.
  nightBrought.add('peg');
  if (touch) await tap(...(await center('.sb-lantern')));
  else await p.keyboard.press('KeyE');
  await wait(1300);
  const slip1 = await p.evaluate(() => ({ slips: document.querySelectorAll('.sb-slip').length, bloom: document.querySelectorAll('.sb-slip .m').length }));
  await shot('5-first-harvest');
  check(`${label}: the first harvest shows yield only`, slip1.bloom === 0, JSON.stringify(slip1));
  await idle();
  await wait(300);

  // ---------------------------------------------------------------- day 2: the pegboard, then a carrot to plant beside
  t = await step('day 2, dawn');
  check(`${label}: day 2 deals a carrot and two radishes`, t.hand.join() === 'carrot,radish,radish', t.hand.join());
  check(`${label}: the pegboard came for the first harvest, in plain words`, t.pieces.peg && /Fill the pegboard/.test(t.line) && !/brass/i.test(t.line), t.line);
  await shot('6-peg');
  // Taking a card up ends the passive pegboard note; the stakes note follows.
  await tap(...(await cardPoint(await handIndex('carrot'))));
  t = await step('day 2, carrot taken up');
  check(`${label}: the next note says what missing it means`, /run ends/i.test(t.line), t.line);
  await sow(5);
  await wait(500);
  await tap(...(await cardPoint(await handIndex('radish'))));
  t = await step('day 2, radish taken up');
  check(`${label}: the companion lesson: one action`, /beside the carrot/i.test(t.line), t.line);
  let pv = await p.evaluate(() => window.deck.preview());
  const nextTo = [1, 4, 6, 9];
  if (touch) {
    // Aim the radish beside the carrot by drag: the radish's +2 pays tonight; the carrot's +1 bloom is greyed with the reason.
    await p.evaluate(() => window.deck.table.putDown(true));
    const [x0, y0] = await cardPoint(await handIndex('radish'));
    const [x1, y1] = await plotPoint(6);
    await touchEv('touchStart', [[x0, y0, 3]]);
    for (let i = 1; i <= 12; i++) {
      await touchEv('touchMove', [[x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12, 3]]);
      await wait(16);
    }
    await wait(80);
    const aimed = await p.evaluate(() => window.deck.preview());
    await shot('7a-timing-greyed');
    // Slide back to the hand before lifting the finger: nothing is planted.
    for (let i = 11; i >= 0; i--) {
      await touchEv('touchMove', [[x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12, 3]]);
      await wait(12);
    }
    await touchEv('touchEnd', []);
    await wait(150);
    check(`${label}: a radish aimed beside a fresh carrot: +2 pays, the carrot's +1 bloom is greyed with why`, aimed?.total?.score === 4 && aimed.marks.some((m) => m.plot === 5 && m.lost?.bloom === 1) && /The radish is pulled before the carrot ripens/.test(aimed.reason?.text ?? ''), JSON.stringify({ marks: aimed?.marks, reason: aimed?.reason }));
    await tap(...(await cardPoint(await handIndex('radish'))));
    pv = await p.evaluate(() => window.deck.preview());
  }
  const marked = (pv?.marks ?? []).filter((m) => m.yield === 2).map((m) => m.plot).sort();
  check(`${label}: a held radish marks +2 on every plot beside the carrot`, JSON.stringify(marked) === JSON.stringify(nextTo), JSON.stringify(pv?.marks));
  await shot('7-companion-preview');
  if (!touch) {
    // Hover a plot beside the carrot: the total, and the carrot's own gain.
    await p.mouse.move(...(await plotPoint(6)));
    await frames(6);
    pv = await p.evaluate(() => window.deck.preview());
    // The carrot ripens tomorrow and the radish is pulled tonight: its +1 bloom is shown greyed, with why, never as a promise.
    check(`${label}: hovering shows the total, and the carrot's +1 bloom greyed: the radish goes first`, pv?.total?.score === 4 && pv.marks.some((m) => m.plot === 5 && m.bloom === 0 && m.lost?.bloom === 1 && m.lost?.why === 'gone') && /pulled before the carrot ripens/.test(pv.reason?.text ?? ''), JSON.stringify(pv));
    await shot('7b-hover-preview');
    await p.mouse.click(...(await plotPoint(6)));
  } else await sow(6);
  await wait(500);
  t = await step('day 2, radish beside the carrot');
  check(`${label}: the companion lesson ends when the radish is beside it`, t.done.includes('companion'), t.done.join());
  await tap(...(await cardPoint(0)));
  await sow(15);
  await wait(500);
  if (touch) await tap(...(await center('.sb-lantern')));
  else await p.mouse.click(...(await center('.sb-lantern')));
  // The radish beside the carrot gets its +2 on an arc from the carrot.
  let arcs = 0;
  for (let k = 0; k < 40 && (await p.evaluate(() => window.deck.busy())); k++) {
    arcs = Math.max(arcs, await p.evaluate(() => document.querySelectorAll('.sb-arc.y').length));
    if (arcs) break;
    await wait(60);
  }
  check(`${label}: the +2 flies in from the carrot`, arcs > 0);
  await idle();
  await wait(300);

  // ---------------------------------------------------------------- day 3: bloom; quick crops never run the bench short
  t = await step('day 3, dawn');
  check(`${label}: day 3 deals two radishes, a carrot and the lettuce`, t.hand.join() === 'radish,radish,carrot,lettuce', t.hand.join());
  check(`${label}: the bloom lesson teaches the timing: the carrot ripens tonight`, /ripens tonight/i.test(t.line), t.line);
  check(`${label}: still no scoops`, !t.pieces.scoops && t.cost === 0);
  await shot('8-bloom');
  // Drag a radish beside the carrot: the carrot's +1 bloom shows while it is over the plot.
  {
    const cp = await cardPoint(await handIndex('radish'));
    const pp = await plotPoint(4);
    let mid = null;
    await drag(...cp, ...pp, async () => {
      mid = await p.evaluate(() => window.deck.preview());
      await shot('9-bloom-preview');
    });
    check(`${label}: over a plot, the carrot shows +1 bloom and the radish its total`, mid?.marks?.some((m) => m.plot === 5 && m.bloom === 1) && mid?.total?.score === 4, JSON.stringify(mid));
  }
  await wait(500);
  if (touch) {
    await tap(...(await cardPoint(await handIndex('radish'))));
    await sow(1);
  } else {
    await p.keyboard.press(`Digit${(await handIndex('radish')) + 1}`);
    for (const k of ['ArrowUp']) await p.keyboard.press(k);
    await p.evaluate(() => (window.deck.table.cursor = 1));
    await p.keyboard.press('Enter');
  }
  await wait(600);
  t = await step('day 3, two radishes round the carrot');
  check(`${label}: the bloom lesson ends`, t.done.includes('bloom'), t.done.join());
  // The radishes are free and the carrot and lettuce a scoop each: the bench never runs short, so the scoops stay off the table.
  check(`${label}: no scoops while nothing costs more than the bench holds`, !t.pieces.scoops && t.cost === 0 && !/scoop/i.test(t.line), t.line);
  for (const id of ['carrot', 'lettuce']) {
    const hi = await handIndex(id);
    if (hi < 0) continue;
    const plot = await p.evaluate(() => window.deck.state().plots.findIndex((q, i) => i > 8 && !q.crop && !q.obj));
    if (touch) {
      await tap(...(await cardPoint(hi)));
      await sow(plot);
    } else {
      await p.keyboard.press(`Digit${hi + 1}`);
      await p.evaluate((plot) => (window.deck.table.cursor = plot), plot);
      await p.keyboard.press('Enter');
    }
    await wait(500);
  }
  // End the day: the carrot blooms ×3 with arcs from both radishes.
  if (touch) await tap(...(await center('.sb-lantern')));
  else await p.keyboard.press('KeyE');
  let bloomSeen = { arcs: 0, slip: 0 };
  for (let k = 0; k < 80 && (await p.evaluate(() => window.deck.busy())); k++) {
    const now = await p.evaluate(() => ({ arcs: document.querySelectorAll('.sb-arc.m').length, slip: document.querySelectorAll('.sb-slip .m').length }));
    bloomSeen = { arcs: Math.max(bloomSeen.arcs, now.arcs), slip: Math.max(bloomSeen.slip, now.slip) };
    if (now.arcs && !(await p.evaluate(() => document.querySelector('.sb-fx .sb-arc.m') === null))) await shot('13-bloom-arc');
    await wait(40);
  }
  await idle();
  await wait(200);
  const scores = await p.evaluate(() => window.deck.shownScores());
  check(`${label}: bloom flies in from each radish and shows on the slip`, bloomSeen.arcs > 0 && bloomSeen.slip > 0, JSON.stringify(bloomSeen));
  check(`${label}: the carrot paid 5 × 3`, scores.includes(15), scores.join(','));

  // ---------------------------------------------------------------- day 4: the beans, a dear seed: the scoops and the cost arrive
  t = await step('day 4, dawn');
  check(`${label}: day 4 deals the beans with a carrot and a radish`, t.hand.join() === 'beans,carrot,radish', t.hand.join());
  check(`${label}: first the new card: read it`, t.lesson === 'newcard', `${t.lesson}: "${t.line}"`);
  check(`${label}: still no scoops before the dear seed's lesson`, !t.pieces.scoops && t.cost === 0);
  {
    const bi = await handIndex('beans');
    const [x, y] = await cardPoint(bi);
    if (touch) {
      await touchEv('touchStart', [[x, y, 6]]);
      await wait(650);
      await touchEv('touchEnd', []);
    } else {
      await p.mouse.move(x, y);
      await wait(700);
    }
    await wait(200);
    await shot('10a-beans-read');
    if (touch) await tap(20, 300);
    else await p.mouse.move(640, 20);
    await wait(250);
    await p.evaluate(() => window.deck.table.sheets.closeDetail());
    await wait(150);
  }
  t = await step('day 4, the beans read');
  check(`${label}: the new-card lesson ends once it is read`, t.done.includes('newcard'), t.done.join());
  check(`${label}: then the scoops arrive with the dear seed: "Spend two scoops on the beans."`, t.pieces.scoops && t.lesson === 'scoops' && t.line === 'Spend two scoops on the beans.', `${t.lesson}: "${t.line}"`);
  check(`${label}: and every card shows its cost`, t.cost >= 3, `${t.cost} cost marks`);
  const bench4 = await p.evaluate(() => ({ shown: document.querySelectorAll('.sb-scoops img').length, full: document.querySelectorAll('.sb-scoops img:not(.empty)').length, bench: window.deck.state().bench }));
  check(`${label}: the bench lays out the day's scoops, the two put back included`, bench4.shown === bench4.bench && bench4.full === bench4.bench && bench4.bench === 5, JSON.stringify(bench4));
  await shot('10-scoops');
  // Cost glyph size, measured; and a free card says Free (no scoops to mark).
  const glyph = await p.evaluate(() => {
    const t = window.deck.table;
    const sizes = [];
    for (const c of t.run.hand) for (const i of t.handEls.get(c.uid).el.querySelectorAll('.sb-cost i')) sizes.push(i.getBoundingClientRect().width);
    return { sizes, radish: t.handEls.get(t.run.hand.find((c) => c.id === 'radish').uid).el.querySelectorAll('.sb-cost i').length, beans: t.handEls.get(t.run.hand.find((c) => c.id === 'beans').uid).el.querySelectorAll('.sb-cost i').length };
  });
  check(`${label}: cost scoops on cards are at least 14 px; the beans print two, the radish none (Free)`, glyph.sizes.length > 0 && Math.min(...glyph.sizes) >= 14 && glyph.beans === 2 && glyph.radish === 0, JSON.stringify(glyph));
  // Take up the beans: the two scoops they would use lift, each from its own place (five scoops sit in two rows).
  const restTops = await p.evaluate(() => [...document.querySelectorAll('.sb-scoops img')].map((i) => i.getBoundingClientRect().top));
  if (touch) await tap(...(await cardPoint(await handIndex('beans'))));
  else await p.keyboard.press(`Digit${(await handIndex('beans')) + 1}`);
  await wait(350);
  const scoopsHeld = await p.evaluate(() => [...document.querySelectorAll('.sb-scoops img')].map((i) => ({ use: i.classList.contains('use'), empty: i.classList.contains('empty'), top: i.getBoundingClientRect().top })));
  await shot('11-scoop-lifts');
  const used = scoopsHeld.filter((s) => s.use);
  const lifted = scoopsHeld.map((s, k) => +(restTops[k] - s.top).toFixed(1));
  check(`${label}: the two scoops the beans would use lift, the rest stay`, used.length === 2 && scoopsHeld.every((s, k) => (s.use ? lifted[k] > 4 : Math.abs(lifted[k]) < 1)), `lifted by ${lifted.join(', ')} px`);
  {
    const plot = await p.evaluate(() => window.deck.state().plots.findIndex((q) => !q.crop && !q.obj));
    if (touch) await sow(plot);
    else {
      await p.evaluate((plot) => (window.deck.table.cursor = plot), plot);
      await p.keyboard.press('Enter');
    }
  }
  await wait(600);
  const emptyNow = await p.evaluate(() => document.querySelectorAll('.sb-scoops img.empty').length);
  check(`${label}: after the play two scoops are visibly empty`, emptyNow === 2, `${emptyNow} empty`);
  t = await step('day 4, beans sown');
  check(`${label}: the scoops lesson ends when the dear seed is sown`, t.done.includes('scoops'), t.done.join());
  // Spend the rest (checks only): the carrot now costs more than is left: dimmed, and a tap only shakes it.
  const carrotUid = await p.evaluate(() => window.deck.state().hand.find((c) => c.id === 'carrot').uid);
  const lumBefore = await lum(carrotUid);
  await p.evaluate(() => {
    window.deck.state().energy = 0;
    window.deck.table.renderAll();
  });
  await wait(350);
  const lumAfter = await lum(carrotUid);
  check(`${label}: an unaffordable card is visibly darker`, lumAfter < lumBefore * 0.8, `luminance ${lumBefore.toFixed(0)} to ${lumAfter.toFixed(0)}`);
  const notesBefore = await p.evaluate(() => window.__notes.length);
  if (touch) await tap(...(await cardPoint(await handIndex('carrot'))));
  else await p.keyboard.press(`Digit${(await handIndex('carrot')) + 1}`);
  await wait(120);
  const nope = await p.evaluate((uid) => ({ held: !!window.deck.table.held, shake: window.deck.table.handEls.get(uid).el.classList.contains('nope'), flash: document.querySelectorAll('.sb-scoops img.flash').length, notes: window.__notes.slice() }), carrotUid);
  await shot('12-unaffordable');
  check(`${label}: tapping it shakes it, flashes the missing scoop, and takes nothing up`, !nope.held && nope.shake && nope.flash === 1, JSON.stringify({ ...nope, notes: undefined }));
  check(`${label}: and no note about energy`, nope.notes.length === notesBefore && !nope.notes.some((n) => /energy/i.test(n)), nope.notes.slice(notesBefore).join(' | '));
  await wait(400);
  // End the day: crops pulled up fly a scoop each to the bench, two at most.
  if (touch) await tap(...(await center('.sb-lantern')));
  else await p.keyboard.press('KeyE');
  let flew = 0;
  for (let k = 0; k < 120 && (await p.evaluate(() => window.deck.busy())); k++) {
    flew = Math.max(flew, await p.evaluate(() => document.querySelectorAll('.sb-flyscoop').length));
    if (flew) await shot('12b-scoop-back');
    await wait(30);
  }
  await idle();
  await wait(200);
  const saved = await p.evaluate(() => ({ bench: window.deck.state().bench, refill: document.querySelectorAll('.sb-scoops img.refill').length, shown: document.querySelectorAll('.sb-scoops img').length }));
  check(`${label}: at night a pulled crop's scoop flies to the bench`, flew > 0, `${flew} in flight at once`);
  t = await step('day 5, dawn');
  check(`${label}: dawn refills the bench one scoop after another, the two put back too`, saved.refill === saved.bench && saved.shown === saved.bench && saved.bench === 5, JSON.stringify(saved));
  check(`${label}: and the next lesson says why: "Crops pulled last night put scoops back."`, t.lesson === 'saved' && t.line === 'Crops pulled last night put scoops back.', `${t.lesson}: "${t.line}"`);
  await shot('12c-saved');

  // ---------------------------------------------------------------- days 4 to 6: the rest as each first matters
  // One new card a day: the beans (day 4, above), then the can, then the sunflower, never all at once.
  const met = new Set(['radish', 'carrot', 'lettuce', 'beans']);
  const newByDay = {};
  const day6Spent = [];
  for (let guard = 0; guard < 40; guard++) {
    const st = await p.evaluate(() => ({ phase: window.deck.state().phase, day: window.deck.state().day }));
    if (st.phase !== 'day') break;
    t = await step(`day ${st.day}`);
    if (!(st.day in newByDay)) {
      newByDay[st.day] = [...new Set(t.hand.filter((id) => !met.has(id)))];
      for (const id of t.hand) met.add(id);
      check(`${label}: day ${st.day} brings one new card at most`, newByDay[st.day].length <= 1, `new: ${newByDay[st.day].join(', ') || 'none'}; hand ${t.hand.join(', ')}`);
    }
    const l = t.lesson;
    // Round 5: day 6 deals the sunflower, the lettuce and a radish, each with a job: no "Drag a spare card to Spent."
    if (st.day === 6 && l === 'spent') day6Spent.push(t.hand.join(', '));
    if (l === 'tin') {
      await shot(`14-tin-day${st.day}`);
      if (touch || guard % 2) await tap(...(await center('.sb-tin')));
      else await p.keyboard.press('KeyD');
      await wait(300);
      check(`${label}: the tin opens to show the cards`, (await p.evaluate(() => window.deck.table.sheets.kind)) === 'deck');
      await p.keyboard.press('Escape').catch(() => {});
      await p.evaluate(() => window.deck.table.sheets.back());
      await wait(200);
      t = await step(`day ${st.day}, tin seen`);
      check(`${label}: the tin lesson ends once the tin is opened`, t.done.includes('tin'));
      continue;
    }
    if (l === 'spent') {
      await shot(`15-spent-day${st.day}`);
      const before = await p.evaluate(() => ({ uid: window.deck.state().hand[0].uid, hand: window.deck.state().hand.length }));
      const cp = await cardPoint(0);
      if (touch) await drag(...cp, ...(await center('.sb-heap')));
      else {
        await p.keyboard.press('Shift+Digit1');
        await p.keyboard.press('KeyX');
      }
      await wait(400);
      // The tossed card leaves the hand for the spent heap (or, if the tin was empty, straight back into the reshuffled tin) and a fresh one is drawn.
      const after = await p.evaluate((uid) => { const s = window.deck.state(); return { tossed: s.tossed, gone: !s.hand.some((c) => c.uid === uid), kept: [...s.discard, ...s.draw].some((c) => c.uid === uid), hand: s.hand.length }; }, before.uid);
      // With the tin empty, the heap is shuffled back in and the tossed card can come straight back: the toss is used and the hand keeps its size either way.
      check(`${label}: a card tossed onto Spent`, after.tossed && after.hand === before.hand && (after.gone ? after.kept : true), JSON.stringify({ ...after, before: before.hand }));
      t = await step(`day ${st.day}, tossed`);
      check(`${label}: the spent lesson ends with the toss`, t.done.includes('spent'));
      await shot(`16-tossed-day${st.day}`);
      continue;
    }
    if (l === 'can') {
      const ci = await handIndex('can');
      const target = await p.evaluate(() => window.deck.state().plots.findIndex((q) => q.crop && q.crop.age < q.crop.days - 1));
      if (ci >= 0 && target >= 0) {
        await tap(...(await cardPoint(ci)));
        await wait(150);
        pv = await p.evaluate(() => window.deck.preview());
        if (touch) {
          let mid = null;
          await p.evaluate(() => window.deck.table.putDown(true));
          await drag(...(await cardPoint(await handIndex('can'))), ...(await plotPoint(target)), async () => {
            mid = await p.evaluate(() => window.deck.preview());
            await shot('17-can-preview');
          });
          check(`${label}: a can over a row marks +1 night on its crops`, mid?.marks?.some((m) => m.nights >= 1), JSON.stringify(mid?.marks));
        } else {
          await p.mouse.move(...(await plotPoint(target)));
          await frames(5);
          const hov = await p.evaluate(() => window.deck.preview());
          check(`${label}: a can over a row marks +1 night on its crops`, hov?.marks?.some((m) => m.nights >= 1), JSON.stringify(hov?.marks));
          await p.mouse.click(...(await plotPoint(target)));
        }
        await wait(500);
        t = await step(`day ${st.day}, watered`);
        check(`${label}: the can lesson ends when a row is watered`, t.done.includes('can'));
        continue;
      }
    }
    if (l === 'weather') {
      const wi = await p.evaluate(() => window.deck.state().hand.findIndex((c) => c.id === 'rain' || c.id === 'sun' || c.id === 'storm'));
      await tap(...(await cardPoint(wi)));
      await wait(150);
      pv = await p.evaluate(() => window.deck.preview());
      await shot('18-weather-preview');
      await tap(...(await plotPoint(6)));
      await wait(500);
      t = await step(`day ${st.day}, weather played`);
      check(`${label}: the weather lesson ends when it is played; the clipping lies by the lantern`, t.done.includes('weather') && t.pieces.tonight, JSON.stringify(pv?.marks?.length));
      continue;
    }
    // Nothing to learn this moment: play the bot's choices, by touch or mouse, then the lantern.
    for (let k = 0; k < 8; k++) {
      const sug = await p.evaluate(() => window.deck.suggest());
      if (!sug) break;
      const uid = await p.evaluate((h) => window.deck.state().hand[h].uid, sug.h);
      const cp = await cardPoint(sug.h);
      if (!cp) break;
      await tap(...cp);
      if (sug.plot === null) await tap(...(await plotPoint(6)));
      else {
        await tap(...(await plotPoint(sug.plot)));
        // A finger aims a seed, a tool or an object on one plot with the first tap and plays it with the second.
        const aimed = touch && (await p.evaluate((uid) => { const c = window.deck.state().hand.find((x) => x.uid === uid); return !!c && !['rain', 'sun', 'storm', 'ladybirds', 'trowel'].includes(c.id); }, uid));
        if (aimed) await tap(...(await plotPoint(sug.plot)));
        if (sug.to !== undefined && sug.to !== null) await tap(...(await plotPoint(sug.to)));
      }
      await wait(500);
      if (await p.evaluate((uid) => window.deck.state().hand.some((c) => c.uid === uid), uid)) {
        await p.evaluate(() => window.deck.table.putDown(true));
        break;
      }
      const now = await table();
      if (now.lesson && now.lesson !== l) break;
    }
    const again = await table();
    if (again.lesson && again.lesson !== l && !again.done.includes(again.lesson)) continue;
    if (touch) await tap(...(await center('.sb-lantern')));
    else await p.keyboard.press('KeyE');
    await wait(300);
    await idle();
    await wait(200);
  }
  nightBrought.add('coins');
  check(`${label}: guided day 6 does not ask to toss a card while every card has a job`, day6Spent.length === 0, day6Spent.length ? `with ${day6Spent[0]}` : 'no spent lesson on day 6');
  await wait(400);

  // ---------------------------------------------------------------- the season's end: coins and the stall
  t = await step('season end');
  const cleared = t.phase === 'shop';
  check(`${label}: the guided season can be met`, cleared, `${t.phase}, ${await p.evaluate(() => window.deck.tally())}`);
  if (cleared) {
    await wait(300);
    t = await step('the stall');
    await shot('19-stall');
    check(`${label}: the stall's lesson: buy a seed`, /coins/i.test(t.line), t.line);
    check(`${label}: the first stall shows only the goods`, !t.pieces.pages && !t.pieces.services);
    const before = await p.evaluate(() => window.deck.state().coins);
    const idx = await p.evaluate(() => window.deck.state().shop.cards.findIndex((c) => c.price <= window.deck.state().coins));
    check(`${label}: the first stall stocks a seed`, await p.evaluate(() => window.deck.state().shop.cards.some((c) => ['radish', 'carrot', 'lettuce', 'beans', 'corn', 'sunflower', 'pumpkin', 'strawberry', 'mint', 'garlic', 'wheat', 'chili'].includes(c.card))));
    if (touch) {
      const sel = `.sb-good:nth-child(${idx + 1})`;
      await tap(...(await center(sel)));
      // The first tap says what the card does and how to buy it; it buys nothing.
      const read = await p.evaluate((i) => ({ slip: document.querySelector('.sb-read')?.textContent ?? '', sentence: window.deck.cardText(window.deck.state().shop.cards[i].card), coins: window.deck.state().coins }), idx);
      await shot('19b-stall-first-tap');
      check(`${label}: the stall's first tap reads the card out, and buys nothing`, read.slip.includes(read.sentence) && /Tap again to buy/.test(read.slip) && read.coins === before, JSON.stringify(read));
      await tap(...(await center(sel)));
    } else {
      for (let k = 0; k < 20; k++) {
        if (await p.evaluate((idx) => document.activeElement === document.querySelectorAll('.sb-good')[idx], idx)) break;
        await p.keyboard.press('ArrowDown');
      }
      await p.keyboard.press('Enter');
      await p.keyboard.press('Enter');
    }
    await wait(300);
    const after = await p.evaluate(() => window.deck.state().coins);
    t = await step('the stall, bought');
    check(`${label}: bought a seed; the lesson ends`, after < before && t.done.includes('coins'), `${before} to ${after}`);
    const purse = await p.evaluate(() => ({ table: Number(window.deck.purse()), line: Number(document.querySelector('.sb-purse-line b')?.textContent), rules: window.deck.state().coins }));
    check(`${label}: the purse follows the purchase at once`, purse.table === purse.rules && purse.line === purse.rules, JSON.stringify(purse));
    await p.evaluate(() => document.querySelector('.sb-signpost').scrollIntoView({ block: 'center' }));
    if (touch) await tap(...(await center('.sb-signpost')));
    else await p.mouse.click(...(await center('.sb-signpost')));
    await wait(400);
    t = await step('summer, day 1');
    check(`${label}: on to summer`, t.phase === 'day' && t.season === 1);
    await shot('20-summer');
    // Reload mid-season: the lessons and pieces come back as they were.
    const was = await p.evaluate(() => ({ done: window.deck.table.tutor.learn.done.join(), seen: window.deck.pieces().sort().join() }));
    await p.evaluate(() => window.deck.table.save());
    await p.goto(`${base}/?game=deck`);
    await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
    await wait(400);
    const now = await p.evaluate(() => ({ done: window.deck.table.tutor.learn.done.join(), seen: window.deck.pieces().sort().join() }));
    check(`${label}: lessons survive a reload`, JSON.stringify(was) === JSON.stringify(now), now.seen);
    // The second and third stalls bring the pages, then the services.
    for (const [n, want] of [[2, 'pages'], [3, 'services']]) {
      await p.evaluate(async () => {
        const d = window.deck;
        const w = (ms) => new Promise((r) => setTimeout(r, ms));
        d.state().earned = 999;
        d.state().coins = 400;
        while (d.state().phase === 'day') {
          d.endDay();
          d.skip();
          await w(40);
        }
      });
      await wait(500);
      t = await step(`stall ${n}`);
      await shot(`21-stall-${n}`);
      check(`${label}: stall ${n} brings the ${want}, with its line`, t.pieces[want] && t.lesson === want && t.line.length > 0, `${t.line}`);
      if (n === 2) check(`${label}: still no services at stall 2`, !t.pieces.services);
      await p.evaluate(() => window.deck.shop.leave());
      await wait(300);
    }
  }

  // ---------------------------------------------------------------- words and faces
  const notes = await p.evaluate(() => window.__notes);
  const long = [...lines, ...notes].filter((s) => words(s) > 8);
  check(`${label}: every note is one short line (eight words at most)`, long.length === 0, long.length ? long.join(' | ') : `${lines.size} lesson lines, ${notes.length} notes`);
  if (label === 'phone') {
    const faces = await p.evaluate(() => {
      const ids = ['radish', 'carrot', 'lettuce', 'beans', 'corn', 'sunflower', 'pumpkin', 'strawberry', 'mint', 'garlic', 'wheat', 'chili', 'can', 'compost', 'fertiliser', 'trowel', 'shears', 'ladybirds', 'scarecrow', 'beehive', 'rain', 'sun', 'storm'];
      const o = {};
      for (const id of ids) for (const up of [false, true]) o[`${id}${up ? '+' : ''}`] = window.deck.faceText(id, up);
      return o;
    });
    // Allowed: the name, numbers and signs, Free, the Select stamp, the forecast masthead.
    const sentences = [];
    for (const [k, texts] of Object.entries(faces)) for (const s of texts) if (/[a-z]{2,}.*\s.*[a-z]{2,}/i.test(s) && !/^(THE FORECAST|WATERING CAN)$/i.test(s) && !/^Watering Can$/.test(s)) sentences.push(`${k}: "${s}"`);
    check('card faces carry no sentences, only a name, numbers and pictures', sentences.length === 0, sentences.length ? sentences.slice(0, 4).join(', ') : `${Object.keys(faces).length} faces, e.g. radish: ${faces.radish.join(' | ')}`);
  }
  check(`${label}: no page errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  writeFileSync(`${out}/steps-${label}.json`, JSON.stringify(steps, null, 1));
  await ctx.close();
}

/**
 * Round 2's P1 checks on a returning player's table, by real touch on the phone and the mouse on the desktop:
 * a tool aims on the first tap with the same preview a hover shows, and a play followed at once by End day
 * lands before the night, so the night never shows the morning's board or tomorrow's hand.
 */
const aimSeen = {};
async function p1(label, viewport, touch) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  const wait = (ms) => p.waitForTimeout(ms);
  const tap = async (x, y) => {
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 7, radiusX: 6, radiusY: 6, force: 1 }] });
      await wait(45);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await p.mouse.click(x, y);
    await wait(120);
  };
  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  await wait(300);
  if (touch) await tap(200, 40);
  const setup = (hand) =>
    p.evaluate((hand) => {
      const d = window.deck;
      d.seed(4242);
      d.learnAll();
      const s = d.state();
      for (const q of s.plots) q.crop = null;
      s.plots[5].crop = { uid: 8001, kind: 'carrot', age: 0, days: 2, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false };
      s.plots[6].crop = { uid: 8002, kind: 'beans', age: 0, days: 3, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false };
      s.energy = 3;
      d.hand(hand);
    }, hand);
  const cardAt = (id) =>
    p.evaluate((id) => {
      const t = window.deck.table;
      const c = t.run.hand.find((x) => x.id === id);
      const r = t.handEls.get(c.uid).el.getBoundingClientRect();
      return [r.left + r.width * 0.3, r.top + r.height * 0.35];
    }, id);
  const plotAt = (i) => p.evaluate((i) => { const r = window.deck.rects().plots[i]; return [r.left + r.width / 2, r.top + r.height * 0.55]; }, i);
  const look = () => p.evaluate(() => { const t = window.deck.table; const pv = window.deck.preview(); return { marks: pv?.marks ?? null, total: pv?.total ?? null, tonight: pv?.tonight ?? null, area: [...t.board.hl.area].sort((a, b) => a - b), water: t.board.hl.water, hover: t.board.hl.hover, hand: t.run.hand.map((c) => c.id) }; });
  // Round 4: seeds aim then plant on touch like the tools (a radish beside the carrot, beans above it); the can's
  // preview gives the carrot it brings in tonight its moon; held beans mark the plots where their +2 would land.
  for (const [tool, plot] of [['can', 5], ['compost', 6], ['radish', 4], ['beans', 1]]) {
    await setup([tool, 'radish']);
    await wait(300);
    await tap(...(await cardAt(tool)));
    if (tool === 'beans') {
      const held = await look();
      check(`${label}: beans in hand mark the plots where their +2 would land`, !!held.marks?.some((m) => [1, 4, 9].includes(m.plot) && m.yield >= 2), JSON.stringify(held.marks));
    }
    const count = (h) => h.filter((x) => x === tool).length;
    if (touch) await tap(...(await plotAt(plot)));
    else {
      await p.mouse.move(...(await plotAt(plot)));
      await wait(150);
    }
    const seen = await look();
    await p.screenshot({ path: `${out}/p1-${label}-${tool}-aimed.png` });
    aimSeen[`${tool}:${label}`] = JSON.stringify({ marks: seen.marks, total: seen.total, tonight: seen.tonight, area: seen.area, water: seen.water });
    const want =
      tool === 'can' ? seen.marks?.some((m) => m.plot === 5 && m.nights >= 1) && seen.area.join() === '4,5,6,7' && seen.water && seen.tonight?.includes(5)
      : tool === 'compost' ? seen.marks?.some((m) => m.plot === 6 && m.yield === 6)
      : tool === 'radish' ? seen.total?.plot === 4 && seen.total.score > 0
      : seen.total?.plot === 1 && seen.marks?.some((m) => m.plot === 5 && m.yield === 2);
    check(`${label}: a ${tool} ${touch ? 'tapped once on' : 'hovered over'} a plot shows its preview there${touch ? ' and is not played yet' : ''}`, !!want && seen.hover === plot && seen.hand.includes(tool), JSON.stringify(seen));
    if (touch) {
      await tap(...(await plotAt(plot)));
      const after = await look();
      check(`${label}: the second tap plays the ${tool}`, count(after.hand) === count(seen.hand) - 1, after.hand.join());
    }
  }
  // Play, then end the day at once: the night must show the board and hand as they were at dusk.
  await setup(['radish', 'radish', 'carrot']);
  await wait(300);
  await tap(...(await cardAt('radish')));
  await tap(...(await plotAt(10)));
  if (touch) await tap(...(await plotAt(10)));
  const dusk = await p.evaluate(() => {
    const t = window.deck.table;
    const plots = t.run.plots.map((q) => q.crop?.uid ?? 0);
    const hand = t.run.hand.map((c) => c.uid);
    const flying = t.inFlight;
    t.endDay();
    return { plots, hand, flying };
  });
  const samples = [];
  for (const ms of [350, 150]) {
    await wait(ms);
    samples.push(await p.evaluate(() => { const t = window.deck.table; return { busy: t.busy, plots: t.shown.map((q) => q.crop?.uid ?? 0), hand: t.handShown.map((c) => c.uid), cards: document.querySelectorAll('.sb-hand .sb-card:not(.flying)').length }; }));
  }
  await p.screenshot({ path: `${out}/p1-${label}-quick-night.png` });
  const bad = samples.filter((q) => !q.busy || q.plots.join() !== dusk.plots.join() || q.hand.join() !== dusk.hand.join() || q.cards !== dusk.hand.length);
  check(`${label}: End day ${dusk.flying ? 'with the card still in flight' : 'right after a play'}: the night shows the dusk board and hand`, dusk.plots[10] > 0 && bad.length === 0, JSON.stringify({ dusk, samples }));
  await p.evaluate(() => window.deck.skip());
  check(`${label}: P1 checks without page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/** A returning player (a finished run, from a save made before the lessons) gets the whole table and no guided deals. */
async function returning() {
  const ctx = await b.newContext({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  // Finish a run: miss the quota.
  await p.evaluate(async () => {
    const d = window.deck;
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    d.learnAll();
    d.table.tutor.learn.done = d.table.tutor.learn.done.filter((x) => x !== 'can');
    while (d.state().phase === 'day') {
      d.state().earned = 0;
      d.endDay();
      d.skip();
      await w(30);
    }
  });
  await p.waitForTimeout(400);
  const runs = await p.evaluate(() => window.deck.table.meta.runs);
  await p.evaluate(() => document.querySelector('.sb-entry .sb-plain').click());
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => ({ hand: window.deck.state().hand.length, script: window.deck.state().script.length, seen: window.deck.pieces().length }));
  check('returning player: a finished run skips the guided season', runs === 1 && s.hand === 5 && s.script === 0, JSON.stringify(s));
  check('returning player: the whole table is there', s.seen >= 9, `${s.seen} pieces`);
  await p.screenshot({ path: `${out}/returning-first.png` });
  // An older save (no lessons recorded) loads with everything in, and a refresher for the can.
  await p.evaluate(() => {
    const t = window.deck.table;
    const data = t.saveData();
    delete data.learn;
    data.taught = 6;
    localStorage.setItem('__deck_old', JSON.stringify(data));
  });
  const legacy = await p.evaluate(() => {
    const t = window.deck.table;
    const data = JSON.parse(localStorage.getItem('__deck_old'));
    t.load(data);
    return { seen: window.deck.pieces().length, done: t.tutor.learn.done.includes('can'), refresh: !t.tutor.learn.done.includes('can') && !t.tutor.learn.done.includes('weather') };
  });
  check('an older save: everything on the table, a refresher for the can and the weather', legacy.seen >= 9 && legacy.refresh, JSON.stringify(legacy));
  await ctx.close();
}

/**
 * Round 5, on the phone with real touch and on the desktop with the mouse and keys: the season's twist at the stall
 * (its lesson line, the way on asking for a pick, a real tap or arrows and Enter picking one, the table saying it),
 * the spent lesson waiting for a card with no use and going away once there is none, and the first crow naming the
 * scarecrow only once it is in the hand.
 */
async function round5(label, viewport, touch) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  const wait = (ms) => p.waitForTimeout(ms);
  const tap = async (x, y) => {
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 9, radiusX: 6, radiusY: 6, force: 1 }] });
      await wait(45);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await p.mouse.click(x, y);
    await wait(300);
  };
  const at = (sel, n = 0) => p.evaluate(([sel, n]) => { const e = document.querySelectorAll(sel)[n]; if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, [sel, n]);
  const lesson = () => p.evaluate(() => ({ id: window.deck.lesson()?.id ?? null, text: window.deck.lesson()?.text ?? '' }));
  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  if (touch) await tap(200, 40);
  // A returning player who has not yet met a twist: year 1 winter met, at the stall before year 2.
  await p.evaluate(async () => {
    const d = window.deck;
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    d.seed(616);
    d.learnAll();
    const t = d.table;
    t.tutor.learn.done = t.tutor.learn.done.filter((x) => x !== 'twist' && x !== 'spent' && x !== 'crows');
    t.tutor.drop();
    d.state().season = 3;
    while (d.state().phase === 'day') {
      d.state().earned = 99999;
      d.endDay();
      d.skip();
      await w(30);
    }
  });
  await wait(500);
  const l1 = await lesson();
  const twists = await p.evaluate(() => [...document.querySelectorAll('.sb-twistcard')].map((e) => e.textContent.trim()));
  await p.screenshot({ path: `${out}/${label}-r5-twists.png` });
  check(`${label}: the stall before year 2 offers two twists, with its lesson line`, twists.length === 2 && l1.id === 'twist' && /Pick one of the two for spring/.test(l1.text), `${twists.join(' | ')}; "${l1.text}"`);
  // The way on asks for a pick first.
  await tap(...(await at('.sb-signpost')));
  const held = await p.evaluate(() => ({ phase: window.deck.state().phase, slip: document.querySelector('.sb-slipspot .sb-read')?.textContent ?? '' }));
  check(`${label}: the way on with no twist picked stays at the stall and asks for one`, held.phase === 'shop' && /Pick one/.test(held.slip), JSON.stringify(held));
  // Pick the second by a real tap, or on the desktop by arrows and Enter.
  if (touch) await tap(...(await at('.sb-twistcard', 1)));
  else {
    for (let k = 0; k < 30; k++) {
      if (await p.evaluate(() => document.activeElement === document.querySelectorAll('.sb-twistcard')[1])) break;
      await p.keyboard.press('ArrowRight');
    }
    await p.keyboard.press('Enter');
    await wait(300);
  }
  const picked = await p.evaluate(() => ({ i: window.deck.state().shop.twist, tw: window.deck.state().shop.twists[1], text: document.querySelectorAll('.sb-twistcard')[1]?.textContent.trim(), done: window.deck.table.tutor.learn.done.includes('twist') }));
  check(`${label}: a ${touch ? 'tap' : 'keypress'} picks a twist, and its lesson ends`, picked.i === 1 && picked.done, JSON.stringify(picked));
  await tap(...(await at('.sb-signpost')));
  await wait(400);
  const line = await p.evaluate(() => ({ phase: window.deck.state().phase, twist: window.deck.state().twist, text: window.deck.twist() }));
  await p.screenshot({ path: `${out}/${label}-r5-twist-line.png` });
  check(`${label}: the season takes the twist picked and the table says it`, line.phase === 'day' && JSON.stringify(line.twist) === JSON.stringify(picked.tw) && line.text === picked.text, `"${line.text}"`);
  // The spent lesson: not while every card has a job; up with a card the scoops cannot pay for; away once none is left.
  const spent = await p.evaluate(async () => {
    const d = window.deck;
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = d.state();
    s.twist = null;
    s.crow = false;
    for (const pl of s.plots) pl.crop = null;
    d.hand(['sunflower', 'lettuce', 'radish']);
    s.energy = 5;
    s.tossed = false;
    await w(200);
    const jobs = d.lesson()?.id ?? null;
    s.energy = 1;
    d.table.renderAll();
    await w(200);
    const spare = d.lesson()?.id ?? null;
    const text = d.lesson()?.text ?? '';
    d.hand([]);
    await w(200);
    const empty = d.lesson()?.id ?? null;
    return { jobs, spare, text, empty, done: d.table.tutor.learn.done.includes('spent') };
  });
  check(`${label}: the spent lesson waits for a card with no use, and goes away when the hand is empty`, spent.jobs !== 'spent' && spent.spare === 'spent' && spent.empty !== 'spent' && !spent.done, JSON.stringify(spent));
  // Then a real toss of a spare card ends it.
  await p.evaluate(async () => {
    const d = window.deck;
    d.hand(['pumpkin', 'radish', 'lettuce']);
    d.state().energy = 1;
    d.table.renderAll();
    await new Promise((r) => setTimeout(r, 250));
  });
  const before = await lesson();
  const cp = await p.evaluate(() => { const t = window.deck.table; const el = t.handEls.get(t.run.hand[0].uid).el; const r = el.getBoundingClientRect(); return [r.left + r.width * 0.3, r.top + r.height * 0.35]; });
  const heap = await at('.sb-heap');
  if (touch) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cp[0], y: cp[1], id: 10 }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cp[0] + ((heap[0] - cp[0]) * i) / 12, y: cp[1] + ((heap[1] - cp[1]) * i) / 12, id: 10 }] });
      await wait(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await p.keyboard.press('Shift+Digit1');
    await p.keyboard.press('KeyX');
  }
  await wait(400);
  const after = await p.evaluate(() => ({ tossed: window.deck.state().tossed, done: window.deck.table.tutor.learn.done.includes('spent') }));
  check(`${label}: with a spare card the line asks for a toss, and a real toss ends it`, before.id === 'spent' && after.tossed && after.done, JSON.stringify({ before, after }));
  // The first crow names the scarecrow only once it is in the hand.
  const crow = await p.evaluate(async () => {
    const d = window.deck;
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = d.state();
    s.crow = true;
    s.draw = s.draw.filter((c) => c.id !== 'scarecrow');
    s.draw.push({ uid: 9901, id: 'scarecrow', up: false });
    d.hand(['radish', 'carrot']);
    await w(250);
    const tin = d.lesson()?.text ?? '';
    d.table.tutor.drop();
    d.table.tutor.learn.done = d.table.tutor.learn.done.filter((x) => x !== 'crows');
    s.draw = s.draw.filter((c) => c.id !== 'scarecrow');
    d.hand(['scarecrow', 'radish']);
    await w(250);
    return { tin, hand: d.lesson()?.text ?? '' };
  });
  check(`${label}: the first crow does not ask to set out a scarecrow still in the tin, and does once it is in hand`, /crow/i.test(crow.tin) && !/Set out/i.test(crow.tin) && /Set out the scarecrow/.test(crow.hand), JSON.stringify(crow));
  check(`${label}: round 5 without page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/**
 * Round 4: giving up from the almanac, by real touch, ends the run the way a missed quota does: the entry follows,
 * the seasons met count for the catalogue and the best harvest is kept (it used to start a new run, recording nothing).
 */
async function giveUpFlow() {
  const ctx = await b.newContext({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 8, radiusX: 6, radiusY: 6, force: 1 }] });
    await p.waitForTimeout(45);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(250);
  };
  const at = (sel, text) => p.evaluate(([sel, text]) => { const e = [...document.querySelectorAll(sel)].find((x) => !text || x.textContent.includes(text)); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, [sel, text]);
  await p.goto(`${base}/?game=deck&fresh`);
  await p.waitForFunction(() => window.deck && window.deck.frames() > 5, null, { timeout: 20000 });
  await tap(200, 40);
  // Two seasons met with a good harvest, then two days into the third.
  const before = await p.evaluate(async () => {
    const d = window.deck;
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    d.seed(515);
    d.learnAll();
    for (let k = 0; k < 2; k++) {
      while (d.state().phase === 'day') {
        d.state().earned = 99999;
        d.endDay();
        d.skip();
        await w(30);
      }
      d.shop.leave();
      await w(60);
    }
    d.state().stats.bestHarvest = 180;
    d.state().stats.bestKind = 'carrot';
    d.endDay();
    d.skip();
    await w(60);
    const m = d.table.meta;
    return { runs: m.runs, seasons: m.seasons ?? 0, best: m.best.harvest, met: d.state().stats.seasonsCleared, day: d.state().day };
  });
  await tap(...(await at('.sb-book')));
  await tap(...(await at('.sb-toc-row', 'Give up')));
  const armed = await p.evaluate(() => [...document.querySelectorAll('.sb-toc-row')].map((x) => x.textContent).find((x) => /Give up/.test(x)) ?? '');
  await tap(...(await at('.sb-toc-row', 'Give up')));
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => {
    const m = window.deck.table.meta;
    return { kind: window.deck.table.sheets.kind, phase: window.deck.state().phase, runs: m.runs, seasons: m.seasons ?? 0, best: m.best.harvest, text: document.querySelector('.sb-entry')?.textContent ?? '' };
  });
  await p.screenshot({ path: `${out}/give-up-entry.png` });
  check('giving up asks for a second tap first', /tap again/.test(armed), armed);
  check('giving up ends the run with its entry, saying so', after.kind === 'entry' && after.phase === 'over' && new RegExp(`Given up on day ${before.day}`).test(after.text), `${after.kind}, ${after.phase}: "${after.text.slice(0, 160)}"`);
  check('a given-up run is recorded: its seasons count and its best harvest is kept', after.runs === before.runs + 1 && after.seasons === before.seasons + before.met && after.best >= 180, JSON.stringify({ before, after: { ...after, text: undefined } }));
  await ctx.close();
}

if (!process.env.P1_ONLY) {
  await session('phone', { width: 412, height: 838 }, true);
  await session('desk', { width: 1280, height: 800 }, false);
}
await p1('phone', { width: 412, height: 838 }, true);
await p1('desk', { width: 1280, height: 800 }, false);
await round5('phone', { width: 412, height: 838 }, true);
await round5('desk', { width: 1280, height: 800 }, false);
for (const tool of ['can', 'compost', 'radish', 'beans']) check(`a first tap with the ${tool} on touch shows the same preview as a hover on the desktop`, !!aimSeen[`${tool}:phone`] && aimSeen[`${tool}:phone`] === aimSeen[`${tool}:desk`], `${aimSeen[`${tool}:phone`]} vs ${aimSeen[`${tool}:desk`]}`);
if (!process.env.P1_ONLY) {
  await returning();
  await giveUpFlow();
}
await b.close();
console.log(failed ? `LESSONS FAILED (${failed})` : 'LESSONS OK', `shots in ${out}`);
process.exit(failed ? 1 : 0);
