// Sunup's lessons, played through on a phone-sized page: each step's line, and
// what the screen shows at that point (tools, coins, board, forecast,
// stamina). Fails if something appears before its lesson brings it in.
// Also, with real touch events: the first lesson's tap on a radish (one under
// the walk stick's zone too), a field bought early from the board bringing the
// hoe and its line and pointer, next season's seeds in the picker near the
// turn, the bug lesson and its pointer, and the camera keeping the farm in view.
// Round 2: the deliver line waits for a ripe crop the request wants; a crow
// that lands and is slept through does not tick off its lesson (nor eat); a
// crow takes the line from the bugs, which come back after; the bug line says
// to take the hands; after its lesson the pointer still finds bugs; the
// chevron sits just over its target; a 6 am storm is as easy to read as a
// sunny 6 am.
// Round 3: the crow, the Build tool and the forecast come one a day, each with
// its own line; the forecast wears a word under each picture; the Build tool
// wears a hammer, not a pencil; a field that wants reputation still shows its
// price; the first pair of requests gets its line and pointer, and the board
// shows the two readably on the phone (needs, sow-by day, pay against market,
// "or" between them, nothing cut off or overlapping); after the crow lesson
// the pointer finds crows; young crops are a size up and bugged crops wear a
// ring that changes the soil plainly.
// Round 4: the clock waits at 6:00 until the first tap; the View button comes
// with its own line after the first seeds, and a real tap on it shows every
// plot of the fields it owns between the day card and the controls; the board
// names the smith only after his lesson; the scarecrow lesson points at bare
// soil in the middle of a field, offers only the scarecrow, does not tick
// itself off on a timer, and a real tap on its pointer builds one there; the
// sprinkler comes after it with a line of its own; each note of a pair says
// "Ripe in N days, due X"; seed sown for one of a pair withdraws the other at
// once; the morning card says three clauses at most.
// Round 5: the second morning brings coins and seeds, and stamina comes later
// with a line of its own; the View button waits for the second field; the
// board's Fields tab waits for its lesson (a field bought by tapping it brings
// it), and buying the field says what it leaves for seed; the pair's line
// says Accept; a tap on the plot under the scarecrow lesson's chevron does
// that plot's own job (the chevron stole it, took the Build tool and built
// with every tap after), and a tap inside the target tile asks before it
// builds one, once, with the tool in hand left alone (the sprinkler too); the
// board headlines each offer's gain over market with an Accept stamp, sowing
// alone takes neither, a real tap on Accept takes one and lets the other go,
// and the board's badge counts only new notes.
// Round 6: after reading the board, a line says to plant for the request
// (only crops sown for it count), pointing at bare soil; the View line waits
// until the new field is hoed and stays up past 10 seconds; with every plot
// sown, the scarecrow lesson's pointer finds a bug but carries no build, and a
// real tap on the bugged crop picks the bugs off (it asked to build a
// scarecrow); a plot cleared brings the line and its build there; the turn
// line waits for bare soil and points at it.
// Round 7: every lesson line stays on screen at least four seconds (the
// tutor's own count when it finishes, and the words in the page, frame by
// frame); a passive line (the View line here) is not used up while the
// farmer is busy; at 10 pm in a storm or rain a hoed field reads (frame luma).
// Round 10: the plant line asks for eight seeds and counts down, leaving soil
// bare; and no tool, nor Sleep, moves on the rack once it has arrived (Hoe
// moved into Seeds' old place when Build came), measured at every step.
// node scripts/qa/lessons.mjs [base url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { strikeScan } from './strike.mjs';

const strikeScanInPage = strikeScan;

const base = process.argv[2] ?? 'http://localhost:5247';
const out = '/tmp/acres-lessons';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const tap = async (x, y, id = 1) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id, radiusX: 6, radiusY: 6, force: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const tapEl = async (sel, text) => {
  const at = await p.evaluate(([sel, text]) => {
    const e = [...document.querySelectorAll(sel)].find((q) => !text || q.textContent.trim() === text);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, [sel, text]);
  if (at) await tap(at[0], at[1], 5);
  return !!at;
};
const project = (x, y, h = 0) => p.evaluate(([x, y, h]) => window.sunup.r3d.project(x, y, h), [x, y, h]);
// Mean colour of a small block of the drawn frame around a point on the farm, read back from WebGL.
const blockColour = (x, y, h = 0, n = 14) => p.evaluate(([x, y, h, n]) => new Promise((done) => {
  const d = window.sunup.r3d.debug;
  const pt = window.sunup.r3d.project(x, y, h);
  d.afterFrame = (gl) => {
    d.afterFrame = null;
    const k = gl.drawingBufferWidth / innerWidth;
    const px = new Uint8Array(n * n * 4);
    gl.readPixels(Math.round(pt.x * k - n / 2), Math.round(gl.drawingBufferHeight - pt.y * k - n / 2), n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const c = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) for (let j = 0; j < 3; j++) c[j] += px[i + j];
    done(c.map((v) => v / (n * n)));
  };
}), [x, y, h, n]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${base}/?game=homestead&fresh`);
await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 30000 });
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
// Round 10: where each tool (and Sleep) sits on the rack when first seen, and every move after (Hoe moved into
// Seeds' old place when Build arrived, and 31 planting taps hoed).
const rackAt = new Map();
const rackMoves = [];
const screen = async () => {
  const v = await screen0();
  for (const [t, x] of Object.entries(v.rack)) {
    if (!rackAt.has(t)) rackAt.set(t, { x, line: v.line });
    else if (Math.abs(rackAt.get(t).x - x) > 1.5) rackMoves.push(`${t} ${Math.round(rackAt.get(t).x)} to ${Math.round(x)} at "${v.line}"`);
  }
  return v;
};
const screen0 = () =>
  p.evaluate(() => {
    const rack = {};
    for (const t of document.querySelectorAll('.toolbar .tool[data-tool], .toolbar .tool.act')) {
      const r = t.getBoundingClientRect();
      if (r.width > 0) rack[t.dataset.tool ?? 'sleep'] = r.left + r.width / 2;
    }
    const vis = (sel) => {
      const e = document.querySelector(sel);
      return !!e && getComputedStyle(e).display !== 'none' && !e.closest('.gone') && e.getBoundingClientRect().width > 0;
    };
    return {
      line: document.querySelector('.hint.on')?.textContent ?? '',
      tools: [...document.querySelectorAll('.toolbar .tool[data-tool]')].map((t) => t.dataset.tool),
      sleep: vis('.toolbar .tool.act'),
      coins: vis('.coins'),
      board: vis('.topbtns .iconbtn'),
      forecast: vis('.daycard .fc'),
      stamina: vis('.daycard .meter'),
      notes: document.querySelectorAll('.goals .slip').length,
      info: vis('.info:not(.empty):not(.quiet)'),
      view: vis('.topbtns .viewbtn'),
      rack,
    };
  });
const send = (c) => p.evaluate((c) => window.sunup.input.push(c), c);
const frames = (n) => p.waitForTimeout(n * 17);
// Stand the farmer on tile (x, y) facing a direction and act once.
const actAt = async (x, y, facing) => {
  await p.evaluate(([x, y, facing]) => {
    const f = window.sunup.state.actors[0];
    f.x = x + 0.5;
    f.y = y + 0.5;
    f.facing = facing;
    f.angle = { n: -Math.PI / 2, s: Math.PI / 2, e: 0, w: Math.PI }[facing];
    f.task = null;
    f.path = [];
  }, [x, y, facing]);
  await send({ type: 'act' });
  await p.waitForTimeout(650);
};
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
// Round 7: every lesson line stays on screen at least four seconds. Wait for the line on screen to change from `prev`.
const lineAfter = async (prev, ms = 7000) => {
  const t0 = Date.now();
  let l = prev;
  while (Date.now() - t0 < ms) {
    l = await p.evaluate(() => document.querySelector('.hint.on')?.textContent ?? '');
    if (l !== prev) return l;
    await p.waitForTimeout(100);
  }
  return l;
};
// Round 7: how long each lesson's line was on screen when it finished (the tutor's own count of the seconds it could be
// seen), and how long its words stayed in the page (every frame), read through the game's hook.
await p.evaluate(() => {
  const d = window.sunup;
  const t = d.tutor;
  const update = t.update.bind(t);
  window.__lessonEnds = [];
  const words = {};
  t.update = (s, dt, touch, visible) => {
    const id0 = t.current;
    const overOn = id0 ? s.learnCount[`over:${id0}`] ?? null : null;
    const out = update(s, dt, touch, visible);
    if (t.current && out.line) words[t.current] = out.line;
    for (const c of out.cmds) if (c.type === 'unlock' && c.what.startsWith('lesson:')) {
      const id = c.what.slice(7);
      window.__lessonEnds.push({ id, text: words[id] ?? '', seen: s.learnCount[`seen:${id}`] ?? 0, day: s.day, overOn: id === id0 ? overOn : null });
    }
    return out;
  };
  window.__spans = [];
  let cur = null;
  const watch = () => {
    const l = document.querySelector('.hint.on')?.textContent ?? '';
    const now = performance.now();
    if (!cur || cur.text !== l) {
      if (cur && cur.text) window.__spans.push({ text: cur.text, ms: Math.round(now - cur.from) });
      cur = { text: l, from: now };
    }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
});

// 1. Hands only, pull the radishes.
let s = await screen();
check('starts with hands only', s.tools.join() === 'hands' && !s.sleep && !s.coins && !s.board && !s.forecast && !s.stamina && !s.view && s.notes === 0, JSON.stringify(s));
// Round 4: the clock ran while the first line was read (7:22 before the first tap). It waits at 6:00 until the farmer acts.
await p.waitForTimeout(2500);
{
  const m = await p.evaluate(() => window.sunup.state.minute);
  check('the clock waits at 6:00 until the first tap', m === 0, `minute ${m} after 2.5 s`);
}
check('one line: pull the radishes', /radish/i.test(s.line), s.line);
await shot('1-pull');
// The line points at a radish: the chevron sits just over the nearest one.
let pt0 = await p.evaluate(() => { const e = document.querySelector('.tpoint'); const r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), over: e.classList.contains('over'), x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const radishNear = await project(2.5, 5.5, 0.9);
check('the first line points at a radish', pt0.on && pt0.over && Math.abs(pt0.x - radishNear.x) < 14, JSON.stringify({ pt0, radishNear }));
// The chevron's tip (7 px below its middle, turned down) sits just over the radish: below the top of a tile-tall
// thing standing on it, above the soil, and not on the tile behind.
{
  const ground = await project(2.5, 5.5, 0);
  const tall = await project(2.5, 5.5, 1);
  const behind = await project(2.5, 4.5, 0);
  const tip = pt0.y + 7;
  check('the chevron sits just over its target, not on the tile above', tip > tall.y - 4 && tip < ground.y && tip > (behind.y + ground.y) / 2, JSON.stringify({ tip, tall: tall.y, ground: ground.y, behind: behind.y }));
}
// Ripe crops read at a glance: a gold ring on the soil. Measured on the ring's edge with it drawn and hidden.
const ringOn = await blockColour(3.5 + 0.39, 5.5, 0.05, 6);
await p.evaluate(() => { window.sunup.r3d.debug.scene.getObjectByName('ripe-rings').material.visible = false; });
const ringOff = await blockColour(3.5 + 0.39, 5.5, 0.05, 6);
await p.evaluate(() => { window.sunup.r3d.debug.scene.getObjectByName('ripe-rings').material.visible = true; });
check('a ripe radish stands out: its gold ring changes the soil around it plainly', dist(ringOn, ringOff) > 40 && ringOn[0] > ringOff[0] && ringOn[1] > ringOff[1], `${ringOn.map(Math.round)} with, ${ringOff.map(Math.round)} without`);
// The line names the button, so at a radish the button wears that word.
await p.evaluate(() => {
  const f = window.sunup.state.actors[0];
  Object.assign(f, { x: 2.5, y: 4.5, facing: 's', angle: Math.PI / 2, task: null, path: [] });
});
await frames(10);
const actWord = await p.evaluate(() => document.querySelector('.tb-act .tb-t')?.textContent ?? '');
check('at a radish the button says the word the line names', actWord !== '' && s.line.toLowerCase().includes(actWord.toLowerCase()), `button "${actWord}", line "${s.line}"`);
// The line says to tap: a real tap on a radish walks there and harvests it. The farmer starts at the house.
const harvested = () => p.evaluate(() => window.sunup.state.stats.harvested.radish);
await p.evaluate(() => { const f = window.sunup.state.actors[0]; Object.assign(f, { x: 2.5, y: 3.5, facing: 's', task: null, path: [] }); window.sunup.walkAim = null; });
await frames(30);
let rp = await project(4.5, 5.5);
await tap(rp.x, rp.y);
await p.waitForTimeout(1600);
check('a real tap on a radish walks there and harvests it', (await harvested()) === 1, `${await harvested()} pulled`);
// The leftmost radish lies under the walk stick's capture zone on a phone: a quick tap there still reaches the farm.
rp = await project(2.5, 5.5);
const inZone = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains('ts-zone') ?? false, [rp.x, rp.y]);
await tap(rp.x, rp.y);
await p.waitForTimeout(1600);
check('a tap on a radish under the stick zone harvests it too', inZone && (await harvested()) === 2, `in zone ${inZone}, ${await harvested()} pulled`);
for (let x = 3; x < 6; x++) await actAt(x, 4, 's');
await frames(10);
s = await screen();
check('the can arrives after the radishes', s.tools.join() === 'hands,can', s.tools.join());
check('one line: water the carrots', /water/i.test(s.line), s.line);
check('lines stay short', s.line.split(/\s+/).length <= 8, s.line);
await shot('2-water');

// 2. Water the carrots (row y=6), standing on the row above.
await send({ type: 'tool', tool: 'can' });
for (let x = 2; x < 6; x++) await actAt(x, 5, 's');
await frames(10);
s = await screen();
check('sleep arrives after watering', s.sleep, JSON.stringify(s));
check('one line: sleep', /sleep/i.test(s.line), s.line);
check('still no coins, board, forecast or stamina', !s.coins && !s.board && !s.forecast && !s.stamina);
await shot('3-sleep');

// 3. Sleep. Morning brings coins, seeds and stamina.
await send({ type: 'sleep' });
await p.waitForTimeout(3500);
await frames(10);
await lineAfter('Crops grow overnight. Sleep.');
s = await screen();
check('morning: coins and seeds appear (stamina waits for a line of its own)', s.coins && s.tools.includes('seeds') && !s.stamina && !s.view, JSON.stringify(s));
check('one line: plant seeds', /sow|seed/i.test(s.line), s.line);
check('no board or requests yet', !s.board && s.notes === 0);
await shot('4-plant');

// 4. Round 10: the line asks for eight seeds and counts down ("Plant seeds in the bare soil." sowed all sixteen plots,
// and the first pair had no soil). Plant three radishes in the bare row (y=7): it says five more; then five more.
check('round 10: the plant line asks for eight seeds', s.line === 'Plant 8 seeds in the bare soil.', s.line);
await send({ type: 'seed', crop: 'radish' });
await send({ type: 'tool', tool: 'seeds' });
for (let x = 2; x < 5; x++) await actAt(x, 6, 's');
await frames(10);
s = await screen();
check('round 10: after three, it counts down: "Plant 5 more seeds in the bare soil."', s.line === 'Plant 5 more seeds in the bare soil.', s.line);
await actAt(5, 6, 's');
for (let x = 2; x < 6; x++) await actAt(x, 7, 's');
await frames(10);
const left = await p.evaluate(() => { const st = window.sunup.state; let n = 0; for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) if (!st.plots[y * st.W + x].crop) n++; return n; });
await lineAfter('Plant 1 more seed in the bare soil.');
s = await screen();
check('round 10: at eight the plant line goes, and soil stays bare for the first pair', !/^Plant/.test(s.line) && left >= 4, `line "${s.line}", ${left} bare`);
check('after planting, nothing new until day 3', !s.board, `line "${s.line}"`);
await shot('5-after-plant');

// 4b. Round 5: with one field the whole farm is on screen already, so the View button waits for the second field.
check('after the first seeds, no View button yet: the one field is all on screen', !s.view && s.line !== 'Tap View to see the whole farm.', JSON.stringify(s));

// 5. A dry can brings the well lesson.
await p.evaluate(() => (window.sunup.state.water = 2));
await frames(20);
s = await screen();
check('a nearly dry can brings the well', /well/i.test(s.line), s.line);
await p.evaluate(() => (window.sunup.state.water = 12));
await p.evaluate(() => (window.sunup.state.learnCount.refill = 1));
await frames(20);
await lineAfter('Fill the can at the well.');

// 5b. Round 5: day 2 brought coins, stamina and seeds at once. Stamina comes once the work has worn it down, with its
// own line, on a day nothing else new came.
await p.evaluate(() => (window.sunup.state.stamina = 60));
await frames(20);
s = await screen();
check('stamina worn down: the stamina bar arrives with its own line', s.stamina && s.line === 'Watch your stamina. Each job uses some.', JSON.stringify(s));
// (Round 7: a passive line goes once it has been read for its seconds while the farmer stood idle: here, four.)
await p.evaluate(() => { window.sunup.state.stamina = 100; });
await lineAfter('Watch your stamina. Each job uses some.');
await frames(10);

// 6. Day 3: the board and its first request.
await send({ type: 'sleep' });
await p.waitForTimeout(3500);
await frames(20);
s = await screen();
check('day 3: the board appears with a request', s.board && /board/i.test(s.line), JSON.stringify(s));
const badge = await p.evaluate(() => document.querySelector('.topbtns .badge')?.textContent ?? '');
// Round 9: the first offer is a small pair, a choice on Spring 3 (it was three radishes, taken at once).
check('round 9: a small pair to start, a choice on Spring 3', badge === '2', badge);
check('requests stay off the farm (no notes)', s.notes === 0);
await shot('6-board');
await p.evaluate(() => document.querySelector('.topbtns .iconbtn').click());
await p.waitForTimeout(600);
const tabs = await p.evaluate(() => [...document.querySelectorAll('.dialog .tabs button')].map((t) => t.textContent));
check('the board opens on its requests', tabs[0] === 'Requests', tabs.join(','));
// Round 4: on Spring 3 the board promised "Three more and the smith makes you a copper can", long before the smith's lesson.
{
  const words = await p.evaluate(() => document.querySelector('.dialog .body')?.textContent ?? '');
  check('the board does not name the smith before his lesson, and has no Smith tab', !/smith/i.test(words) && !tabs.includes('Smith'), words.slice(0, 120));
}
await shot('7-board-open');
await p.evaluate(() => window.sunup.dialogs.close());
await frames(20);
await lineAfter('Read the board.');
s = await screen();
check('after reading it, the line goes (and the reading counts)', s.line !== 'Read the board.' && (await p.evaluate(() => window.sunup.state.learn.includes('lesson:requests'))), s.line);
// Round 9: closed without choosing, the line says to accept one of the two, and points at the board.
check('round 9: the next line says to accept one of the two', s.line === 'Two requests on the board. Accept one.', s.line);
// A real tap on the board, and on the first note's Accept: the line to choose goes at once.
await p.evaluate(() => document.querySelector('.topbtns .iconbtn').click());
await p.waitForTimeout(600);
{
  const r = await p.evaluate(() => { const b = document.querySelector('.dialog.on .item.req.offer button.accept:not(:disabled)'); const q = b?.getBoundingClientRect(); return q ? [q.x + q.width / 2, q.y + q.height / 2] : null; });
  check('round 9: the first pair has an Accept stamp to tap', !!r);
  if (r) await tap(r[0], r[1]);
  await p.waitForTimeout(400);
}
await p.evaluate(() => window.sunup.dialogs.close());
await frames(20);
s = await screen();
check('round 9: once one is taken the line to choose has gone', s.line !== 'Two requests on the board. Accept one.' && (await p.evaluate(() => window.sunup.state.orders.filter((o) => o.taken !== false).length === 1)), s.line);
// The deliver line waits until it matters: nothing the request wants is ripe yet.
check('nothing it wants is ripe: no deliver line yet', !/crate|ships/i.test(s.line), s.line);
// Round 6: a request counts only what is sown for it (the radishes already growing do not), so the next line says to
// sow for it, with the pointer on bare soil.
{
  const sow = await p.evaluate(() => { const e = document.querySelector('.tpoint'); const t = window.sunup.hud['pointAt']; const st = window.sunup.state; const i = t ? Math.floor(t.y) * st.W + Math.floor(t.x) : -1; return { line: document.querySelector('.hint.on')?.textContent ?? '', on: e.classList.contains('on'), bare: i >= 0 && !st.plots[i].crop && st.plots[i].tilled }; });
  check('round 6: the next line says to plant for the request, and points at bare soil', /^Plant \d [a-z]+ for the request\.$/.test(sow.line) && sow.on && sow.bare, JSON.stringify(sow));
}
const sowLine = (await screen()).line;
// Ripen what the request wants (as the days would): now the line names it and points at a ripe one.
const want = await p.evaluate(() => {
  const st = window.sunup.state;
  const o = st.orders.find((q) => q.taken !== false);
  const it = o.items[0];
  const spots = [];
  // (Round 10: the plant lesson sows eight, so a request for five may find fewer bare plots in the first field: then
  // crops sown for market there make way, as a harvest would.)
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < st.plots.length && spots.length < it.n; i++) {
    const q = st.plots[i];
    if (st.parcelOf[i] !== 0 || st.tiles[i] !== 'field' || spots.some((t) => t.y * st.W + t.x === i)) continue;
    if (q.crop && (pass === 0 || q.crop.for !== undefined)) continue;
    q.tilled = true;
    // (Round 6: sown for the request, as only crops sown for it count.)
    q.crop = { id: st.nextId++, kind: it.crop, age: 99, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day, for: o.id };
    q.crop.age = { radish: 3, lettuce: 4, carrot: 5 }[it.crop] ?? 3;
    spots.push({ x: i % st.W, y: Math.floor(i / st.W) });
  }
  return { crop: it.crop, n: it.n, spots };
});
await frames(30);
// (Round 9: the line to plant for it goes the moment its count is met.)
await lineAfter(sowLine);
s = await screen();
check('a crop the request wants is ripe: the line names the crop and count', /^Harvest \d+ [a-z]+\. The crate ships them\.$/.test(s.line), `${s.line} (${want.n} ${want.crop})`);
{
  const pt = await p.evaluate(() => { const e = document.querySelector('.tpoint'); const r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const near = await Promise.all(want.spots.map((t) => project(t.x + 0.5, t.y + 0.5, 0.5)));
  check('and the pointer is on a ripe one', pt.on && near.some((q) => Math.abs(q.x - pt.x) < 16), JSON.stringify({ pt, near: near.map((q) => [Math.round(q.x), Math.round(q.y)]) }));
}
await shot('6a-deliver');
// (Round 9: the crate hands the request over as its last crop goes in, by day: a purse kept small here, so the field
// lesson, which waits for 400 coins, is not brought in by its pay before the checks below.)
await p.evaluate(() => { window.sunup.state.coins = 0; window.sunup.hud.pickTool('hands'); });
for (const t of want.spots) await actAt(t.x, t.y - 1, 's');
await frames(20);
s = await screen();
await lineAfter(s.line);
s = await screen();
check('harvesting what it asks ends the deliver line', !/ships/.test(s.line) && (await p.evaluate(() => window.sunup.state.learn.includes('lesson:deliver'))), s.line);
check('crows and the forecast are still to come', !s.forecast && !s.tools.includes('build'));

// 6b. A field bought early, before its lesson, by tapping the field itself: the hoe still comes, with a line and a
// pointer. Round 5: the board has no Fields tab before the field lesson (nothing on the board before its lesson), and
// the field says what buying it leaves for seed (the fifth playtest spent 250 of 270 and sat broke for five days).
await p.evaluate(() => { window.sunup.state.coins = 320; window.sunup.state.stamina = 100; });
await frames(10);
check('no hoe before a second field', !(await screen()).tools.includes('hoe'));
await p.evaluate(() => window.sunup.dialogs.board());
await p.waitForTimeout(500);
{
  const early = await p.evaluate(() => [...document.querySelectorAll('.dialog .tabs button')].map((t) => t.textContent));
  check('before the field lesson the board has no Fields or Seeds tab', !early.includes('Fields') && !early.includes('Seeds'), early.join(','));
}
await p.evaluate(() => window.sunup.dialogs.close(true));
await frames(10);
{
  // A real tap on the field for sale.
  await p.evaluate(() => { const f = window.sunup.state.actors[0]; Object.assign(f, { x: 6.5, y: 4.5, task: null, path: [] }); window.sunup.walkAim = null; });
  await p.waitForTimeout(900);
  const fp = await project(8.5, 6.5, 0);
  await tap(fp.x, fp.y, 6);
  await p.waitForTimeout(500);
}
const askTitle = await p.evaluate(() => document.querySelector('.dialog h2')?.textContent ?? '');
check('a 250-coin field asks before it buys', /for sale/.test(askTitle) && (await p.evaluate(() => !window.sunup.state.parcels[1].owned)), askTitle);
const askText = await p.evaluate(() => document.querySelector('.dialog p')?.textContent ?? '');
check('and says its price once (on the stamp)', !/250/.test(askText), askText);
check('and says what buying it leaves for seed', /That leaves 70 for seed\./.test(askText), askText);
await tapEl('.dialog .ask .btn.primary');
await p.waitForTimeout(500);
const fieldToasts = await p.evaluate(() => [...document.querySelectorAll('.toasts .toast')].map((t) => t.textContent).filter((t) => /field/i.test(t)));
check('one field bought, one toast', fieldToasts.length === 1, fieldToasts.join(' | '));
await p.evaluate(() => window.sunup.dialogs.close(true));
await frames(30);
s = await screen();
check('the field bought early brings the hoe to the rack', s.tools.includes('hoe') && (await p.evaluate(() => window.sunup.state.parcels[1].owned)), s.tools.join());
check('and the line says to hoe the new field', s.line === 'Hoe the new field.', s.line);
await shot('6b-new-field');
// The pointer is on the new field, or at the screen's edge turned towards it.
const fieldPt = await p.evaluate(() => { const e = document.querySelector('.tpoint'); const r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), over: e.classList.contains('over'), x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const fieldAt = await project(9, 7, 0.9);
const fieldOk = fieldPt.on && (fieldPt.over ? Math.abs(fieldPt.x - fieldAt.x) < 90 && fieldAt.y - fieldPt.y < 140 : Math.sign(fieldAt.x - 206) === Math.sign(fieldPt.x - 206));
check('the pointer is on the new field', fieldOk, JSON.stringify({ fieldPt, fieldAt }));
// With a second field the board's Fields tab is there: each card that is still for sale says its price once.
await p.evaluate(() => window.sunup.dialogs.board('fields'));
await p.waitForTimeout(500);
const tabsTop = await p.evaluate(() => [...document.querySelectorAll('.dialog .tabs button')].map((b) => Math.round(b.getBoundingClientRect().top)));
check('the board\u2019s tabs sit on one row on the phone', Math.max(...tabsTop) - Math.min(...tabsTop) < 12, tabsTop.join(','));
const fieldStamps = await p.evaluate(() => [...document.querySelectorAll('.dialog .item .btn')].map((b) => b.textContent));
// Round 3: fields 3 to 6 hid their prices behind "Reputation 4". Each card says its price once: on the stamp, or in
// its words when the stamp shows the reputation it wants.
const fieldCards = await p.evaluate(() => [...document.querySelectorAll('.dialog .list .item')].filter((e) => e.querySelector('.btn')).map((e) => e.textContent));
// (Round 9: the fifth and sixth fields cost 3,000 and 4,500. Round 10: 1,200, 2,200, 3,600 and 5,000.)
const prices = [1200, 2200, 3600, 5000].map((n) => n.toLocaleString('en-US'));
check('each field\u2019s price shows once (on its stamp, or in its words when the stamp asks for reputation)', fieldStamps.length === 4 && fieldStamps.every((t) => /^Reputation \d+$/.test(t)) && fieldCards.every((t, i) => t.split(prices[i]).length - 1 === 1), JSON.stringify(fieldCards));
await p.evaluate(() => window.sunup.dialogs.close(true));
await frames(10);
await send({ type: 'tool', tool: 'hoe' });
for (const x of [7, 8]) await actAt(x, 4, 's');
await frames(20);
await lineAfter('Hoe the new field.');
s = await screen();
check('hoeing two plots ends the hoe line', s.line !== 'Hoe the new field.' && (await p.evaluate(() => window.sunup.state.learn.includes('lesson:hoe'))), s.line);
await send({ type: 'tool', tool: 'hands' });

// 6c. Round 4, moved in round 5: close up, a phone sees about two fields, so a crow or bugs in the first field could
// hide off screen. With the second field the View button arrives with its own line; a real tap on it shows the
// whole farm. Round 6: the line came for 7 seconds while the tester was still hoeing, and went unseen. It waits until
// the new field is hoed, and stays up long enough to read.
await frames(20);
s = await screen();
check('round 6: while the new field is still being hoed, no View line yet', !s.view && s.line !== 'Tap View to see the whole farm.', JSON.stringify(s));
await p.evaluate(() => { const st = window.sunup.state; const pc = st.parcels[1]; for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) st.plots[y * st.W + x].tilled = true; });
await frames(20);
s = await screen();
check('with the second field hoed, the View button arrives with its own line', s.view && s.line === 'Tap View to see the whole farm.', JSON.stringify(s));
// Round 7: never on a timer alone: while the farmer is busy the line stays (twelve seconds of walking); read while idle,
// or acted on, it goes.
await p.evaluate(() => { const f = window.sunup.state.actors[0]; f.task = { verb: 'till', x: Math.floor(f.x), y: Math.floor(f.y) + 1, t: 0, dur: 999 }; });
await p.waitForTimeout(12000);
s = await screen();
await p.evaluate(() => { window.sunup.state.actors[0].task = null; });
check('round 6, 7: the View line is still up after 12 busy seconds (it went after 7 while the tester hoed)', s.line === 'Tap View to see the whole farm.', s.line);
await tapEl('.topbtns .viewbtn');
await p.waitForTimeout(1400);
{
  const fv = await p.evaluate(() => {
    const st = window.sunup.state;
    const W = innerWidth;
    const top = document.querySelector('.daycard').getBoundingClientRect().bottom;
    const bottom = Math.min(document.querySelector('.toolbar').getBoundingClientRect().top, document.querySelector('.tb-act').getBoundingClientRect().top, document.querySelector('.ts-base').getBoundingClientRect().top);
    let inside = 0;
    let n = 0;
    const out = [];
    // (Round 9: the fields the farm owns, framed to fill the band; plots a tap can hit, 34 px or more across.)
    let size = 99;
    for (const pc of st.parcels.filter((q) => q.owned)) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) {
      n++;
      const q = window.sunup.r3d.project(x + 0.5, y + 0.5, 0.3);
      const r = window.sunup.r3d.project(x + 1.5, y + 0.5, 0.3);
      if (q && r) size = Math.min(size, Math.hypot(r.x - q.x, r.y - q.y));
      if (q && q.x > 4 && q.x < W - 4 && q.y > top && q.y < bottom) inside++;
      else if (out.length < 4) out.push([x, y, Math.round(q?.x ?? -1), Math.round(q?.y ?? -1)]);
    }
    return { camera: st.rules.camera, inside, n, size: Math.round(size), top: Math.round(top), bottom: Math.round(bottom), out, line: document.querySelector('.hint.on')?.textContent ?? '' };
  });
  check('a real tap on View shows the whole farm: every plot of every field it owns between the day card and the controls, 34 px or more across (they were 25)', fv.camera === 'wide' && fv.inside === fv.n && fv.n >= 32 && fv.size >= 34, JSON.stringify(fv));
  check('and the View line goes once it has been done', fv.line !== 'Tap View to see the whole farm.', fv.line);
  await shot('5b-farm-view');
  await tapEl('.topbtns .viewbtn');
  await p.waitForTimeout(900);
  check('a second tap on View comes back close up', (await p.evaluate(() => window.sunup.state.rules.camera)) === 'close');
}


// 7. Crows come in quietly from day 5; the crow line shows only while a crow is really on the farm.
await p.evaluate(() => { const st = window.sunup.state; for (const id of ['requests', 'deliver']) if (!st.learn.includes(`lesson:${id}`)) st.learn.push(`lesson:${id}`); st.day = 5; });
await frames(20);
s = await screen();
check('day 5 with no crow about: no crow line', !/crow/i.test(s.line), `line "${s.line}"`);
check('crows are let onto the farm quietly', await p.evaluate(() => window.sunup.state.learn.includes('pests')));
// 7a. A crow lands and the farmer goes straight to bed: the lesson is not ticked off, and the crow takes nothing.
const slept = await p.evaluate(() => {
  const st = window.sunup.state;
  const i = st.plots.findIndex((q, k) => q.crop && !q.crop.dead && q.crop.stage >= 1 && st.parcelOf[k] >= 0 && st.parcels[st.parcelOf[k]].owned);
  st.crows.push({ id: st.nextId++, x: i % st.W, y: Math.floor(i / st.W), fromX: -3, fromY: 4, phase: 'peck', t: 0 });
  return { i, id: st.plots[i].crop.id, day: st.day };
});
await frames(2);
await send({ type: 'sleep' });
await p.waitForTimeout(3600);
await frames(20);
s = await screen();
const after = await p.evaluate((sl) => ({ done: window.sunup.state.learn.includes('lesson:pests'), crop: window.sunup.state.plots[sl.i].crop?.id ?? null, day: window.sunup.state.day }), slept);
check('a crow slept through does not tick off its lesson', after.day === slept.day + 1 && !after.done, JSON.stringify(after));
check('nor does it eat while the farmer sleeps', after.crop === slept.id, JSON.stringify(after));
check('and the morning has no scarecrow line out of nowhere', !/Scarecrow/.test(s.line), s.line);
// The first request was filled overnight: this morning brings a pair, and its line (checked closely on its own page,
// step 12). Its lesson is set aside here so the lines after it can be read.
{
  // (Bugs land at random now and then; an urgent bug line would take the slot, so the morning's bugs are cleared, and
  // the bug line's time on screen with them: the bug lesson is taught below, with bugs put down on purpose.)
  await p.evaluate(() => { const st = window.sunup.state; for (const q of st.plots) if (q.crop) q.crop.bugs = 0; if (!st.learn.includes('lesson:bugs')) st.learnCount['seen:bugs'] = 0; });
  await frames(20);
  s = await screen();
  const pairUp = await p.evaluate(() => window.sunup.state.orders.filter((o) => o.taken === false).length);
  // (Round 9: the line to accept one came with the first pair, on Spring 3; this pair needs no line of its own.)
  check('the first request filled, the next morning brings new requests', pairUp >= 1 && s.line !== 'Two requests on the board. Accept one.', `${pairUp} offers, line "${s.line}"`);
  await p.evaluate(() => window.sunup.state.learn.push('lesson:choose'));
}
await p.evaluate(() => { window.sunup.state.crows = []; window.sunup.state.crowPlan = []; window.sunup.hud.pickTool('hands'); });
await frames(10);

// 7b. Bugs first, then a crow: the crow takes the line from the bugs.
const firstBug = await p.evaluate(() => {
  const st = window.sunup.state;
  const i = st.plots.findIndex((q, k) => q.crop && !q.crop.dead && q.crop.stage >= 1 && q.crop.stage < 4 && st.parcelOf[k] >= 0 && st.parcels[st.parcelOf[k]].owned);
  st.plots[i].crop.bugs = 1;
  return { x: i % st.W, y: Math.floor(i / st.W) };
});
await frames(20);
s = await screen();
check('bugs land: the bug line', /^Bugs on your [a-z]+\. Pick them off\.$/.test(s.line), s.line);
await p.evaluate(() => window.sunup.hud.pickTool('can'));
await frames(10);
s = await screen();
check('with the can in hand, the bug line says to take the hands', /^Take the hands\. Pick bugs off the [a-z]+\.$/.test(s.line), s.line);
await p.evaluate(() => window.sunup.hud.pickTool('hands'));
await frames(10);

// A crow comes for the carrots.
// (It goes for a real growing crop, as crows do.)
const target = await p.evaluate(() => {
  const st = window.sunup.state;
  const i = st.plots.findIndex((q, k) => q.crop && !q.crop.dead && q.crop.stage >= 1 && st.parcelOf[k] >= 0);
  const x = i % st.W;
  const y = Math.floor(i / st.W);
  const f = st.actors[0];
  Object.assign(f, { x: 12.5, y: 3.5, task: null, path: [] });
  st.crows.push({ id: st.nextId++, x, y, fromX: -3, fromY: 4, phase: 'in', t: 0 });
  return { x, y };
});
await frames(40);
s = await screen();
check('a crow lands while the bug line is up: the crow line takes over, naming it and the crop it is on', /^A crow is on your [a-z]+\. Shoo it\.$/.test(s.line), s.line);
// It is pecking out of view: a chevron on the screen's edge points the way.
const pointer = () => p.evaluate(() => {
  const e = document.querySelector('.tpoint');
  const r = e.getBoundingClientRect();
  return { on: e.classList.contains('on'), over: e.classList.contains('over'), x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const crowAt = () => p.evaluate(() => { const c = window.sunup.state.crows.find((q) => q.phase === 'in' || q.phase === 'peck'); return c ? window.sunup.r3d.project(c.x + 0.5, c.y + 0.5, 0.9) : null; });
let pt = await pointer();
let ca = await crowAt();
const towards = ca && Math.sign(ca.x - 206) === Math.sign(pt.x - 206);
check('the crow out of view: a chevron at the edge points towards it', pt.on && !pt.over && towards, JSON.stringify({ pt, ca }));
await shot('8-crow');
// Walk closer, not yet at it: the chevron moves over the crow.
await p.evaluate((t) => { const f = window.sunup.state.actors[0]; Object.assign(f, { x: t.x + 3.5, y: t.y - 0.5, task: null, path: [] }); }, target);
// The camera eases after the farmer: wait until it has the crow well in view.
for (let i = 0; i < 40; i++) {
  await frames(5);
  const c = await crowAt();
  if (c && c.x > 60 && c.x < 352) break;
}
await frames(5);
pt = await pointer();
ca = await crowAt();
{
  // The tip (7 px below the chevron's middle) between the top of a tile-tall thing on the crow's plot and the soil.
  const c = await p.evaluate(() => { const q = window.sunup.state.crows.find((k) => k.phase === 'in' || k.phase === 'peck'); return q ? { g: window.sunup.r3d.project(q.x + 0.5, q.y + 0.5, 0), t: window.sunup.r3d.project(q.x + 0.5, q.y + 0.5, 1) } : null; });
  const tip = pt.y + 7;
  check('the crow in view: the chevron bobs just over it', pt.on && pt.over && ca && c && Math.abs(pt.x - ca.x) < 12 && tip > c.t.y - 4 && tip < c.g.y, JSON.stringify({ pt, tip, top: c?.t.y, ground: c?.g.y }));
}
await shot('8b-crow-near');
// Walk at it.
await p.evaluate((t) => { const f = window.sunup.state.actors[0]; Object.assign(f, { x: t.x + 0.5, y: t.y - 0.5, task: null, path: [] }); }, target);
await frames(20);
check('walking at the crow shoos it and ends the crow lesson', await p.evaluate(() => window.sunup.state.learn.includes('lesson:pests')));
s = await screen();
// Round 3: on Spring 10 the forecast, the Build tool and the crow line came together. Now the crow brings only its line.
check('the crow brings nothing else onto the screen: no Build tool, no forecast, no scarecrow line that day', !s.tools.includes('build') && !s.forecast && !/Scarecrow/.test(s.line), JSON.stringify(s));

// 8. The scarecrow note goes, and the bug line comes back: the bugs were never picked. It names the crop and points
// at it; the button says Pick.
await p.evaluate(() => { const st = window.sunup.state; window.sunup.hud.pickTool('hands'); const f = st.actors[0]; Object.assign(f, { x: 12.5, y: 3.5, task: null, path: [] }); });
await frames(40);
const bug = { ...firstBug, kind: await p.evaluate((b) => window.sunup.state.plots[b.y * window.sunup.state.W + b.x].crop.kind, firstBug) };
s = await screen();
check('after the crow, the bug line comes back, naming the crop', /^Bugs on your [a-z]+\. Pick them off\.$/.test(s.line) && !(await p.evaluate(() => window.sunup.state.learn.includes('lesson:bugs'))), s.line);
const bugPt = await p.evaluate(() => { const e = document.querySelector('.tpoint'); const r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), over: e.classList.contains('over'), x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const bugAt = await project(bug.x + 0.5, bug.y + 0.5, 0.9);
const bugOk = bugPt.on && (bugPt.over ? Math.abs(bugPt.x - bugAt.x) < 14 && bugAt.y - bugPt.y > 10 && bugAt.y - bugPt.y < 50 : Math.sign(bugAt.x - 206) === Math.sign(bugPt.x - 206));
check('the pointer is on the bugged crop', bugOk, JSON.stringify({ bugPt, bugAt }));
await shot('9-bugs');
await p.evaluate((b) => { window.sunup.walkAim = null; const f = window.sunup.state.actors[0]; Object.assign(f, { x: b.x + 0.5, y: b.y - 0.5, facing: 's', angle: Math.PI / 2, task: null, path: [] }); }, bug);
// Nothing else in reach for the hands, so the button reads the bugged plot.
await p.evaluate((b) => { const st = window.sunup.state; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = st.plots[(b.y - 1 + dy) * st.W + b.x + dx]; if (q?.crop && q.crop.stage === 4 && !(dx === 0 && dy === 1)) q.crop = null; } }, bug);
await frames(10);
const pickWord = await p.evaluate(() => document.querySelector('.tb-act .tb-t')?.textContent ?? '');
check('facing the bugs, the button says Pick', pickWord === 'Pick', pickWord);
await send({ type: 'act' });
await p.waitForTimeout(500);
await lineAfter((await screen()).line);
s = await screen();
check('picking them ends the bug lesson', (await p.evaluate(() => window.sunup.state.learn.includes('lesson:bugs'))) && !/Bugs/.test(s.line), s.line);
// The bugs show on the crop: the plant yellows and the bugs are big enough to see. Measured over the plant, bugs on
// and off (after the lesson, so taking them away does not end it).
await p.evaluate((b) => { window.sunup.state.plots[b.y * window.sunup.state.W + b.x].crop.bugs = 1; const f = window.sunup.state.actors[0]; Object.assign(f, { x: b.x + 2.5, y: b.y - 1.5, task: null, path: [] }); }, bug);
await p.waitForTimeout(1500);
const bugsOn = await blockColour(bug.x + 0.5, bug.y + 0.5, 0.12, 12);
await p.evaluate((b) => { window.sunup.state.plots[b.y * window.sunup.state.W + b.x].crop.bugs = 0; }, bug);
const bugsOff = await blockColour(bug.x + 0.5, bug.y + 0.5, 0.12, 12);
check('the bugs can be seen on the crop', dist(bugsOn, bugsOff) > 12, `${bugsOn.map(Math.round)} with bugs, ${bugsOff.map(Math.round)} without`);
// After the lesson, bugs still come: no line, but the pointer finds them. (Only this one: others that spread or
// landed overnight are cleared, so the pointer has one to find.)
await p.evaluate((b) => { const st = window.sunup.state; for (const q of st.plots) if (q.crop) q.crop.bugs = 0; st.plots[b.y * st.W + b.x].crop.bugs = 1; }, bug);
await frames(20);
{
  const pt = await p.evaluate(() => { const e = document.querySelector('.tpoint'); const r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), over: e.classList.contains('over'), x: r.x + r.width / 2 }; });
  const at = await project(bug.x + 0.5, bug.y + 0.5, 0.5);
  s = await screen();
  check('after the bug lesson, new bugs get the pointer and no line', pt.on && !/Bugs/.test(s.line) && (pt.over ? Math.abs(pt.x - at.x) < 16 : Math.sign(at.x - 206) === Math.sign(pt.x - 206)), JSON.stringify({ pt, at, line: s.line }));
}
await p.evaluate((b) => { window.sunup.state.plots[b.y * window.sunup.state.W + b.x].crop.bugs = 0; }, bug);

// After the crow lesson, crows still come now and then: no line, but the pointer finds them.
{
  const at = await p.evaluate(() => {
    const st = window.sunup.state;
    const i = st.plots.findIndex((q, k) => q.crop && !q.crop.dead && q.crop.stage >= 1 && q.crop.stage < 4 && st.parcelOf[k] === 0);
    st.crows.push({ id: st.nextId++, x: i % st.W, y: Math.floor(i / st.W), fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    Object.assign(st.actors[0], { x: 12.5, y: 3.5, task: null, path: [] });
    return { x: i % st.W, y: Math.floor(i / st.W) };
  });
  await frames(20);
  const pt = await p.evaluate(() => { const e = document.querySelector('.tpoint'); const r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), over: e.classList.contains('over'), x: r.x + r.width / 2 }; });
  const cp = await project(at.x + 0.5, at.y + 0.5, 0.5);
  s = await screen();
  check('after the crow lesson, a new crow gets the pointer and no line', pt.on && !/crow/i.test(s.line) && (pt.over ? Math.abs(pt.x - cp.x) < 16 : Math.sign(cp.x - 206) === Math.sign(pt.x - 206)), JSON.stringify({ pt, cp, line: s.line }));
  await p.evaluate(() => { window.sunup.state.crows = []; });
}

// 8b. One new thing a day: the Build tool the morning after the crow, with its own line; the forecast the morning
// after that, with its own line and a word under each day's picture.
{
  const crowDay = await p.evaluate(() => window.sunup.state.learnCount['done:pests']);
  // (Round 9: a paid lesson waits until the requests' seed money is safe, and the scarecrow's for a bare plot in the
  // middle of a field: this farm has both.)
  await p.evaluate((d) => {
    const st = window.sunup.state;
    st.day = d + 1;
    st.coins = Math.max(st.coins, 900);
    st.plots[6 * st.W + 3].crop = null;
    st.plots[6 * st.W + 3].tilled = true;
  }, crowDay);
  await frames(30);
  s = await screen();
  check('the morning after the crow: the Build tool arrives, with its line, and nothing else new', s.tools.includes('build') && s.line === 'Build a scarecrow on bare soil.' && !s.forecast, JSON.stringify(s));
  // The Build tool wears a hammer: a head across its handle, unlike the hoe beside it and the old pencil.
  const icons = await p.evaluate(() => ({ build: document.querySelector('.toolbar .tool[data-tool="build"] svg')?.innerHTML ?? '', hoe: document.querySelector('.toolbar .tool[data-tool="hoe"] svg')?.innerHTML ?? '' }));
  check('the Build tool wears a hammer, not the old pencil', icons.build && icons.build !== icons.hoe && !icons.build.includes('M12.5 7.5 5 15l4 4 7.5-7.5'), icons.build.slice(0, 80));
  await shot('8c-build-arrives');
  // Round 4: the line pointed at a growing crop (building goes on bare soil only), a tap on the pointer harvested a
  // radish and a second watered a carrot, and after 12 s the lesson ticked itself off with no scarecrow built.
  {
    await p.evaluate(() => {
      const st = window.sunup.state;
      st.coins = Math.max(st.coins, 120);
      // A field of growing crops, two of its middle plots bare.
      for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) {
        const q = st.plots[y * st.W + x];
        q.tilled = true;
        q.wet = true;
        q.crop = (x === 3 && y === 7) || (x === 4 && y === 6) ? null : { id: st.nextId++, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
      }
      Object.assign(st.actors[0], { x: 7.5, y: 3.5, task: null, path: [] });
      window.sunup.walkAim = null;
      window.sunup.hud.pickTool('hands');
    });
    await p.waitForTimeout(1200);
    const at = await p.evaluate(() => {
      const st = window.sunup.state;
      const t = window.sunup.hud['pointAt'];
      const e = document.querySelector('.tpoint');
      const r = e.getBoundingClientRect();
      const x = Math.floor(t.x);
      const y = Math.floor(t.y);
      const q = st.plots[y * st.W + x];
      const pc = st.parcels[st.parcelOf[y * st.W + x]];
      return { x, y, bare: !q.crop && q.tilled, mid: !!pc && x > pc.x && x < pc.x + pc.w - 1 && y > pc.y && y < pc.y + pc.h - 1, on: e.classList.contains('on'), px: r.x + r.width / 2, py: r.y + r.height / 2 };
    });
    check('the scarecrow line points at bare soil in the middle of a field, never a crop', at.on && at.bare && at.mid, JSON.stringify(at));
    await tapEl('.toolbar .tool[data-tool="build"]');
    await p.waitForTimeout(400);
    const kinds = await p.evaluate(() => [...document.querySelectorAll('.buildbar .seed')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.dataset.kind));
    check('during the scarecrow lesson the build picker offers only the scarecrow (no sprinkler before its lesson)', kinds.join() === 'scarecrow', kinds.join());
    await p.evaluate(() => { window.sunup.hud.closePicker(); window.sunup.hud.pickTool('hands'); });
    // Thirteen seconds of its line seen: still up, it waits for a scarecrow.
    await p.evaluate(() => { window.sunup.state.learnCount['seen:scarecrow'] = 13; });
    await frames(20);
    s = await screen();
    check('it has no timer: after 13 s of its line it is still up', s.line === 'Build a scarecrow on bare soil.' && !(await p.evaluate(() => window.sunup.state.learn.includes('lesson:scarecrow'))), s.line);
    // Round 5, P0: the chevron is drawn over the plot to the north of its target, and a tap there counted as a tap on
    // the pointer: it took the Build tool without a word, and every tap after built a scarecrow. Now a tap on the plot
    // under the chevron's drawn position does that plot's own job (a ripe radish there is harvested), with seeds in
    // hand, and nothing is built.
    await p.evaluate((t) => {
      const st = window.sunup.state;
      const q = st.plots[(t.y - 1) * st.W + t.x];
      q.tilled = true;
      q.crop = { id: st.nextId++, kind: 'radish', age: 3, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
      window.sunup.input.push({ type: 'seed', crop: 'radish' });
      window.sunup.input.push({ type: 'tool', tool: 'seeds' });
    }, at);
    await frames(10);
    const before = await p.evaluate(() => ({ coins: window.sunup.state.coins, harvested: Object.values(window.sunup.state.stats.harvested).reduce((a, b) => a + b, 0) }));
    await p.evaluate(() => { window.__water = 0; const d = window.sunup; const orig = d.events.push.bind(d.events); d.events.push = (e) => { if (e.type === 'water') window.__water++; return orig(e); }; });
    const chev = await p.evaluate(() => { const r = document.querySelector('.tpoint').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, over: document.querySelector('.tpoint').classList.contains('over') }; });
    const under = await p.evaluate((c) => window.sunup.r3d.pick(c.x, c.y), chev);
    await tap(chev.x, chev.y, 7);
    await p.waitForTimeout(1800);
    const stolen = await p.evaluate((b) => ({ builds: window.sunup.state.builds.length, tool: window.sunup.state.tool, harvested: Object.values(window.sunup.state.stats.harvested).reduce((a, c) => a + c, 0) - b.harvested, dialog: window.sunup.dialogs.open, spent: b.coins - window.sunup.state.coins }), before);
    // (Round 8: with the seeds in hand the tap picks the radish, paid 30 at the crate, and sows a radish there for 10.)
    check('a tap on the plot under the chevron does that plot\u2019s own job (its radish is harvested): no Build tool, no scarecrow, no question', chev.over && !!under && under.x === at.x && under.y === at.y - 1 && stolen.builds === 0 && stolen.tool !== 'build' && stolen.harvested === 1 && !stolen.dialog && stolen.spent === -20, JSON.stringify({ chev, under, at, stolen }));
    // (The hands in hand: round 8, a tap with the seeds or the can is the plot's own job, never the pointer's question.)
    await p.evaluate(() => window.sunup.input.push({ type: 'tool', tool: 'hands' }));
    await frames(5);
    // A real tap inside the target tile asks before it builds.
    const tp = await project(at.x + 0.5, at.y + 0.5, 0);
    await tap(tp.x, tp.y, 8);
    await p.waitForTimeout(500);
    const asked = await p.evaluate(() => ({ open: window.sunup.dialogs.open, title: document.querySelector('.dialog h2')?.textContent ?? '', text: document.querySelector('.dialog p')?.textContent ?? '', yes: document.querySelector('.dialog .ask .btn.primary')?.textContent ?? '', builds: window.sunup.state.builds.length }));
    check('a tap inside the target tile asks first: "Build a scarecrow?", its cost and what it does', asked.open && asked.title === 'Build a scarecrow?' && /^40 coins\. /.test(asked.text) && asked.yes === 'Build for 40' && asked.builds === 0, JSON.stringify(asked));
    await tapEl('.dialog .ask .btn.primary');
    for (let i = 0; i < 40 && !(await p.evaluate(() => window.sunup.state.builds.length)); i++) await p.waitForTimeout(100);
    await p.waitForTimeout(400);
    const built = await p.evaluate((b) => ({ builds: window.sunup.state.builds.map((x) => `${x.kind}@${x.x},${x.y}`), spent: b.coins - window.sunup.state.coins, watered: window.__water, done: window.sunup.state.learn.includes('lesson:scarecrow'), tool: window.sunup.state.tool }), before);
    check('yes builds one scarecrow there (40 coins, nothing watered), the tool in hand stays in hand, and the lesson ends', built.builds.join() === `scarecrow@${at.x},${at.y}` && built.spent === stolen.spent + 40 && built.watered === 0 && built.done && built.tool === 'hands', JSON.stringify(built));
    // Never a chain: the next taps on bare soil, seeds in hand, plant; they build nothing.
    await p.evaluate(() => window.sunup.input.push({ type: 'tool', tool: 'seeds' }));
    await frames(5);
    const other = await p.evaluate(() => { const st = window.sunup.state; const i = st.plots.findIndex((q, k) => !q.crop && q.tilled && st.parcelOf[k] === 0 && !st.builds.some((b) => b.y * st.W + b.x === k)); return i < 0 ? null : { x: i % st.W, y: Math.floor(i / st.W) }; });
    if (other) {
      const op = await project(other.x + 0.5, other.y + 0.5, 0);
      await tap(op.x, op.y, 9);
      await p.waitForTimeout(1800);
    }
    const chain = await p.evaluate((o) => ({ builds: window.sunup.state.builds.length, planted: o ? window.sunup.state.plots[o.y * window.sunup.state.W + o.x].crop?.kind ?? null : 'none' }), other);
    check('the next tap on bare soil plants with the seeds in hand: one tap, one build at most', chain.builds === 1 && (chain.planted === 'radish' || chain.planted === 'none'), JSON.stringify({ other, chain }));
    await shot('8c2-scarecrow-built');
  }
  await frames(10);
  s = await screen();
  check('and the forecast still waits for its own day', !s.forecast && !/forecast/i.test(s.line), JSON.stringify(s));
  await p.evaluate((d) => { const st = window.sunup.state; st.day = d + 2; st.forecast = ['rain', 'heat', 'cloud']; }, crowDay);
  await frames(30);
  s = await screen();
  const fc = await p.evaluate(() => [...document.querySelectorAll('.daycard .fc .fd')].map((e) => { const l = e.querySelector('.fl'); const r = l?.getBoundingClientRect(); return { word: l?.textContent ?? '', h: r ? r.height : 0, size: l ? parseFloat(getComputedStyle(l).fontSize) : 0 }; }));
  check('the morning after: the forecast arrives with its line', s.forecast && s.line === 'Check the forecast for rain and heat.', JSON.stringify(s));
  check('each day of the forecast wears its word under its picture', fc.map((f) => f.word).join() === 'Rain,Heat,Cloud' && fc.every((f) => f.h > 6 && f.size >= 9), JSON.stringify(fc));
  await shot('8d-forecast-arrives');
  await p.evaluate(() => window.sunup.state.learn.push('lesson:forecast'));
  await frames(10);
}

// 8e. Seeds and sprouts are drawn a size up, and bugs ring the soil: measured on the frame, ring drawn and hidden.
{
  const at = await p.evaluate(() => {
    const st = window.sunup.state;
    const i = st.plots.findIndex((q, k) => q.crop && !q.crop.dead && q.crop.stage >= 1 && q.crop.stage < 4 && st.parcelOf[k] === 0);
    st.plots[i].crop.bugs = 1;
    const x = i % st.W;
    const y = Math.floor(i / st.W);
    Object.assign(st.actors[0], { x: x + 2.5, y: y - 1.5, task: null, path: [] });
    return { x, y };
  });
  await p.waitForTimeout(1200);
  const on = await blockColour(at.x + 0.5 + 0.38, at.y + 0.5, 0.05, 6);
  await p.evaluate(() => { window.sunup.r3d.debug.scene.getObjectByName('bug-rings').material.visible = false; });
  const off = await blockColour(at.x + 0.5 + 0.38, at.y + 0.5, 0.05, 6);
  await p.evaluate(() => { window.sunup.r3d.debug.scene.getObjectByName('bug-rings').material.visible = true; });
  check('a bugged crop wears a rust ring that changes the soil around it plainly', dist(on, off) > 40 && on[0] > off[0], `${on.map(Math.round)} with, ${off.map(Math.round)} without`);
  await p.evaluate((a) => { window.sunup.state.plots[a.y * window.sunup.state.W + a.x].crop.bugs = 0; }, at);
}


// 9. The last days of a season: the picker offers next season's seeds, marked, and marks what is too late.
// (The first pair of requests has its own check below, on a page of its own.)
await p.evaluate(() => { const st = window.sunup.state; st.day = 8; st.coins = 400; });
await frames(30);
s = await screen();
check('near the turn the line says to plant the next season\u2019s seeds', s.line === 'Spring ends soon. Plant summer seeds.', s.line);
await tapEl('.toolbar .tool[data-tool="seeds"]');
await p.waitForTimeout(400);
const cards = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.seedbar .seed')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => [e.dataset.crop, { next: e.classList.contains('next'), locked: e.classList.contains('locked'), pr: e.querySelector('.pr').textContent, wh: e.querySelector('.wh').textContent }])));
// (Round 9: with their days, as the other cards show them: "Summer crop" hid them.)
check('the picker offers summer seeds, marked as next season, with their days', ['corn', 'sunflower', 'beans'].every((c) => cards[c]?.next && /^Summer, \d+ days$/.test(cards[c].wh)), JSON.stringify(cards));
check('the picker marks carrots and lettuce as too late', ['carrot', 'lettuce'].every((c) => cards[c]?.locked && cards[c].wh === 'Too late'), JSON.stringify({ carrot: cards.carrot, lettuce: cards.lettuce }));
check('each seed shows its price and what it sells for', Object.values(cards).every((c) => /^\d+ \u00b7 sells \d+$/.test(c.pr)), JSON.stringify(Object.values(cards).map((c) => c.pr)));
const cornBox = await p.evaluate(() => { const r = document.querySelector('.seedbar .seed[data-crop="corn"]').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
check('every seed card is on screen (none scrolled out of reach)', cornBox.l >= 0 && cornBox.r <= 412 && cornBox.t >= 0 && cornBox.b <= 838, JSON.stringify(cornBox));
await tapEl('.seedbar .seed[data-crop="corn"]');
await p.waitForTimeout(300);
check('a tap picks corn', (await p.evaluate(() => window.sunup.state.seed)) === 'corn');
const bare = await p.evaluate(() => { const st = window.sunup.state; const i = st.plots.findIndex((q, k) => !q.crop && q.tilled && st.parcelOf[k] >= 0 && st.parcels[st.parcelOf[k]].owned && !st.builds.some((b) => b.y * st.W + b.x === k)); return { x: i % st.W, y: Math.floor(i / st.W) }; });
const cornBefore = await p.evaluate(() => window.sunup.state.plots.filter((q) => q.crop?.kind === 'corn').length);
await actAt(bare.x, bare.y - 1, 's');
check('and corn goes into spring soil three days before summer', (await p.evaluate(() => window.sunup.state.plots.filter((q) => q.crop?.kind === 'corn').length)) === cornBefore + 1);
await shot('10-next-season');
await p.evaluate(() => window.sunup.hud.pickTool('hands'));
// (Round 7: the summer seed that went in is the turn line's own act; the line stays its four seconds, then goes.)
await lineAfter('Spring ends soon. Plant summer seeds.');

// 9b. Round 4: the sprinkler sat in the build picker from the start. It comes after the scarecrow and the forecast, on a
// day of its own, with its own line and pointer (two fields, and the coins for one).
// (The season's-end line has been read by now; the sprinkler's day is a summer one.)
await p.evaluate(() => { const st = window.sunup.state; st.learnCount['seen:turn'] = 20; st.learnCount['done:forecast'] = 9; st.day = 12; st.coins = 400; Object.assign(st.actors[0], { x: 7.5, y: 3.5, task: null, path: [] }); window.sunup.hud.pickTool('hands'); });
await frames(40);
s = await screen();
check('on a day of its own, after the scarecrow and the forecast, the sprinkler arrives with its own line', s.line === 'Build a sprinkler to water around it.', s.line);
{
  await tapEl('.toolbar .tool[data-tool="build"]');
  await p.waitForTimeout(400);
  const kinds = await p.evaluate(() => [...document.querySelectorAll('.buildbar .seed')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.dataset.kind));
  check('and only now the build picker offers it', kinds.join() === 'scarecrow,sprinkler', kinds.join());
  await p.evaluate(() => { window.sunup.hud.closePicker(); window.sunup.hud.pickTool('hands'); });
  await frames(5);
  // Round 5: a tap inside its target tile asks first, then builds one, once (a tap on a bean under its chevron built a
  // 200-coin sprinkler with no question asked).
  const sat = await p.evaluate(() => { const t = window.sunup.hud['pointAt']; return { x: Math.floor(t.x), y: Math.floor(t.y) }; });
  const sp3 = await project(sat.x + 0.5, sat.y + 0.5, 0);
  await tap(sp3.x, sp3.y, 8);
  await p.waitForTimeout(500);
  const sAsk = await p.evaluate(() => ({ title: document.querySelector('.dialog h2')?.textContent ?? '', builds: window.sunup.state.builds.filter((b) => b.kind === 'sprinkler').length }));
  check('a tap inside the sprinkler pointer\u2019s target tile asks first', sAsk.title === 'Build a sprinkler?' && sAsk.builds === 0, JSON.stringify(sAsk));
  await tapEl('.dialog .ask .btn.primary');
  for (let i = 0; i < 40 && !(await p.evaluate(() => window.sunup.state.builds.some((b) => b.kind === 'sprinkler'))); i++) await p.waitForTimeout(100);
  await p.waitForTimeout(300);
  await lineAfter('Build a sprinkler to water around it.');
  const sp = await p.evaluate(() => ({ s: window.sunup.state.builds.filter((b) => b.kind === 'sprinkler').length, coins: window.sunup.state.coins, done: window.sunup.state.learn.includes('lesson:sprinkler'), tool: window.sunup.state.tool }));
  check('yes builds one sprinkler (200 coins), the hands stay in hand, and the lesson ends', sp.s === 1 && sp.coins === 200 && sp.done && sp.tool === 'hands', JSON.stringify(sp));
  await shot('10b-sprinkler');
  await p.evaluate(() => { const st = window.sunup.state; st.builds = st.builds.filter((b) => b.kind !== 'sprinkler'); });
}

// 10. The camera keeps the farm in view: the clear band between the day card and the tool rack is farm, all fifteen rows, wherever the farmer stands.
const band = async () => p.evaluate(() => {
  const H = innerHeight;
  const W = innerWidth;
  let on = 0;
  let n = 0;
  const rows = new Set();
  for (let j = 0; j < 30; j++) for (let i = 0; i < 16; i++) {
    n++;
    const t = window.sunup.r3d.pick(((i + 0.5) / 16) * W, 100 + ((j + 0.5) / 30) * (H - 212));
    if (t) { on++; rows.add(t.y); }
  }
  return { cover: on / n, rows: rows.size };
});
const camOk = [];
for (const [x, y] of [[2.5, 3.5], [16.5, 12.5], [9.5, 9.5], [1.5, 13.5]]) {
  await p.evaluate(([x, y]) => { const f = window.sunup.state.actors[0]; Object.assign(f, { x, y, task: null, path: [] }); }, [x, y]);
  await p.waitForTimeout(1200);
  const b2 = await band();
  camOk.push(`${x},${y}: ${b2.cover.toFixed(2)} ${b2.rows} rows`);
  if (b2.cover < 0.85 || b2.rows < 15) camOk.push('LOW');
}
check('the camera keeps the farm in view (85% of the clear band, all 15 rows)', !camOk.includes('LOW'), camOk.join(' | '));
await shot('11-camera-corner');

// 11. A 6 am storm: the crops read as well as on a sunny 6 am (mean light over the clear band, read back from WebGL).
const bandLight = () => p.evaluate(() => new Promise((done) => {
  const d = window.sunup.r3d.debug;
  d.afterFrame = (gl) => {
    d.afterFrame = null;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0;
    let n = 0;
    for (let y = Math.round(h * 0.15); y < Math.round(h * 0.85); y += 3) for (let x = 0; x < w; x += 3) { const i = (y * w + x) * 4; sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; n++; }
    done(sum / n);
  };
}));
const dawnLight = {};
for (const w of ['sun', 'storm']) {
  await p.evaluate((w) => { const st = window.sunup.state; st.weather = w; st.minute = 0; window.sunup['daylight'] = 0.35; window.sunup['hour'] = 6; const f = st.actors[0]; Object.assign(f, { x: 2.5, y: 3.5, task: null, path: [] }); }, w);
  await p.waitForTimeout(900);
  await p.evaluate((w) => { window.sunup.state.weather = w; window.sunup.state.minute = 0; }, w);
  dawnLight[w] = Math.round(await bandLight());
}
await shot('12-storm-dawn');
check('a 6 am storm is as easy to read as a sunny 6 am', dawnLight.storm >= dawnLight.sun * 0.9, JSON.stringify(dawnLight));

// 12. The first pair of requests, on a page of its own: the line and the pointer, then the board showing the two
// readably on the phone. Round 3: requests never competed; now a morning offers two, and only one can be met.
{
  const q = await ctx.newPage();
  q.on('pageerror', (e) => errs.push(e.message));
  await q.goto(`${base}/?game=homestead&fresh`);
  await q.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 30000 });
  await q.evaluate(async () => {
    const st = window.sunup.state;
    for (const w of ['can', 'sleep', 'coins', 'seeds', 'stamina', 'board', 'requests', 'pests', 'build', 'forecast']) if (!st.learn.includes(w)) st.learn.push(w);
    for (const l of ['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'requests', 'deliver', 'pests', 'scarecrow', 'forecast', 'bugs', 'turn', 'field', 'smith']) st.learn.push(`lesson:${l}`);
    st.day = 6;
    st.rep = 1;
    st.requested = 1;
    st.orders = [];
    st.coins = 260;
    for (const pl of st.plots) pl.crop = null;
    // The same as a morning: a pair is pinned.
    window.sunup.pinRequests();
  });
  await q.waitForTimeout(600);
  const qs = await q.evaluate(() => ({ line: document.querySelector('.hint.on')?.textContent ?? '', orders: window.sunup.state.orders.length, pt: (() => { const e = document.querySelector('.tpoint'); return { on: e.classList.contains('on') }; })() }));
  check('a pair of requests: the line says to accept one, and points the way', qs.orders === 2 && qs.line === 'Two requests on the board. Accept one.' && qs.pt.on, JSON.stringify(qs));
  // Round 5: the badge counted every open note, read or not. It counts new ones: two, until the board is read.
  const badge0 = await q.evaluate(() => document.querySelector('.topbtns .badge')?.textContent ?? '');
  // The board, opened with a real tap on its button.
  const bb = await q.evaluate(() => { const r = document.querySelector('.topbtns .iconbtn').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const qc = await ctx.newCDPSession(q);
  await qc.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb[0], y: bb[1], id: 3, radiusX: 6, radiusY: 6, force: 1 }] });
  await qc.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await q.waitForTimeout(700);
  const badge1 = await q.evaluate(() => document.querySelector('.topbtns .badge')?.textContent ?? '');
  check('the board\u2019s badge counts new notes: 2 when the pair is pinned, none once the board is open', badge0 === '2' && badge1 === '', JSON.stringify({ badge0, badge1 }));
  const pair = await q.evaluate(() => {
    const notes = [...document.querySelectorAll('.dialog .pair .item.req')];
    const or = document.querySelector('.dialog .pair .or');
    const W = innerWidth;
    const H = innerHeight;
    const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    return {
      n: notes.length,
      or: or ? or.textContent : '',
      orBox: or ? box(or) : null,
      notes: notes.map((e) => ({
        box: box(e),
        lines: [...e.querySelectorAll('.tx > *')].map((c) => ({ text: c.textContent, size: parseFloat(getComputedStyle(c).fontSize), cut: c.scrollWidth > c.clientWidth + 1 })),
        stamp: e.querySelector('.btn')?.textContent ?? '',
      })),
      W,
      H,
    };
  });
  const lines = pair.notes.map((n) => n.lines.map((l) => l.text));
  // Round 5: "Pays 1,370" beside "Pays 525" misled (most of it was market value for carrots already growing). Round 9:
  // each offer headlines what it clears in all, then its plots and days (the trade at a glance), what it wants,
  // sowing, and due with its days to spare.
  const readable = pair.n === 2 && pair.or === 'or' && pair.notes.every((n) => {
    const [gain, trade, what, need, when] = n.lines.map((l) => l.text);
    return /^\+[\d,]+$/.test(gain) && /^for \d+ plots?, \d+ days?$/.test(trade) && /^\d+ [a-z]+ for /.test(what) && /^Plant (today|by tomorrow|by [A-Z][a-z]+ \d+), seed \d+$/.test(need) && /^Due (tomorrow|[A-Z][a-z]+ \d+), (no day|a day|\d days) to spare$/.test(when) && n.stamp === 'Accept' && !n.lines.some((l) => /Pays|over market/.test(l.text));
  });
  check('the board shows the pair at a glance: what each clears first, its plots and days, what it wants, sow by, due with days to spare, an Accept stamp, "or" between them', readable, JSON.stringify(pair.notes.map((n) => [...n.lines.map((l) => l.text), n.stamp])));
  const onScreen = pair.notes.every((n) => n.box.l >= 0 && n.box.r <= pair.W && n.box.t >= 0 && n.box.b <= pair.H) && pair.notes.every((n) => n.lines.every((l) => l.size >= 12 && !l.cut));
  const [A, B] = pair.notes.map((n) => n.box);
  const apart = A && B && pair.orBox && (A.b <= pair.orBox.t + 1 || A.r <= pair.orBox.l + 1) && (pair.orBox.b <= B.t + 1 || pair.orBox.r <= B.l + 1);
  check('on the phone both notes are whole on screen, in type of 12 px or more, nothing cut off, "or" clear between them', onScreen && apart, JSON.stringify({ boxes: pair.notes.map((n) => n.box), or: pair.orBox, sizes: pair.notes.map((n) => n.lines.map((l) => l.size)) }));
  // Round 4: each fits the farm alone. Round 5: the two differ in kind (rush or easy, long or quick, big or small), and
  // the bold one offers clearly more gain (they matched within 3% on net per plot-day, so the pick was no decision).
  const fits = await q.evaluate(() => {
    const st = window.sunup.state;
    const free = st.plots.filter((pl, i) => st.parcelOf[i] >= 0 && st.parcels[st.parcelOf[i]].owned && !pl.crop).length;
    const [a, b] = st.orders;
    const seed = { radish: 10, lettuce: 15, carrot: 15, beans: 30, strawberry: 45, sunflower: 30, corn: 45, pumpkin: 80 };
    const price = { radish: 30, lettuce: 45, carrot: 55, beans: 30, strawberry: 40, sunflower: 80, corn: 110, pumpkin: 220 };
    const cost = (o) => o.items[0].n * seed[o.items[0].crop];
    const gain = (o) => o.reward - o.items[0].n * price[o.items[0].crop];
    const bold = [a, b].find((o) => ['rush', 'long', 'big'].includes(o.kind));
    const safe = [a, b].find((o) => o !== bold);
    const kinds = [a.kind, b.kind].sort().join('/');
    return { alone: [a, b].every((o) => o.items[0].n <= free && cost(o) <= st.coins), kinds, contrast: ['easy/rush', 'long/quick', 'big/small'].includes(kinds), more: !!bold && !!safe && gain(bold) >= 1.2 * gain(safe), gains: [a, b].map(gain), free, coins: st.coins, a: `${a.items[0].n} ${a.items[0].crop}`, b: `${b.items[0].n} ${b.items[0].crop}` };
  });
  check('each of the pair fits the farm alone; the two differ in kind, the bold one offering clearly more gain', fits.alone && fits.contrast && fits.more, JSON.stringify(fits));
  {
    // Sowing alone takes neither (the fifth playtest's market planting took a request nobody had read).
    await q.evaluate(() => window.sunup.dialogs.close(true));
    const chosen = await q.evaluate(() => {
      const st = window.sunup.state;
      const [a, b] = st.orders;
      const i = st.plots.findIndex((pl, k) => st.parcelOf[k] === 0 && pl.tilled && !pl.crop);
      Object.assign(st.actors[0], { x: (i % st.W) + 0.5, y: Math.floor(i / st.W) - 0.5, facing: 's', angle: Math.PI / 2, task: null, path: [] });
      window.sunup.input.push({ type: 'seed', crop: a.items[0].crop });
      window.sunup.input.push({ type: 'tool', tool: 'seeds' });
      window.sunup.input.push({ type: 'actAt', x: i % st.W, y: Math.floor(i / st.W) });
      return { a: a.id, b: b.id, crop: b.items[0].crop };
    });
    await q.waitForTimeout(900);
    const sown = await q.evaluate(() => ({ ids: window.sunup.state.orders.map((o) => o.id), offers: window.sunup.state.orders.filter((o) => o.taken === false).length }));
    check('seed sown for one of a pair takes neither: both stay on offer', sown.ids.length === 2 && sown.offers === 2, JSON.stringify(sown));
    // A real tap on the board's Accept takes one: the other goes at once, with a word, and the note says it is taken.
    await qc.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb[0], y: bb[1], id: 4, radiusX: 6, radiusY: 6, force: 1 }] });
    await qc.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await q.waitForTimeout(700);
    const acc = await q.evaluate((id) => { const b = document.querySelector(`.dialog .item.req[data-id="${id}"] .btn`); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, chosen.a);
    if (acc) {
      await qc.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: acc[0], y: acc[1], id: 5, radiusX: 6, radiusY: 6, force: 1 }] });
      await qc.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await q.waitForTimeout(700);
    const after = await q.evaluate((id) => ({ ids: window.sunup.state.orders.map((o) => o.id), taken: window.sunup.state.orders.find((o) => o.id === id)?.taken, toasts: [...document.querySelectorAll('.toasts .toast')].map((t) => t.textContent), note: document.querySelector(`.dialog .item.req[data-id="${id}"]`)?.textContent ?? '' }), chosen.a);
    // (Round 9: and the seed sown before Accept does not count for it: its note still asks for all of it.)
    check('a real tap on Accept takes one: the other goes at once, with a word, and its note counts nothing sown before Accept', !!acc && after.ids.join() === String(chosen.a) && after.taken === true && after.toasts.some((t) => /will find [a-z]+ elsewhere\.$/.test(t)) && !/1 growing/.test(after.note) && /Plant \d+/.test(after.note), JSON.stringify({ chosen, after }));
    await q.screenshot({ path: `${out}/13a-board-taken.png` });
  }
  await q.screenshot({ path: `${out}/13-board-pair.png` });
  for (const q2 of await q.evaluate(strikeScanInPage)) check(`no ruled line through "${q2.text}"`, false);
  // Round 3: "Summer begins" hid behind the morning card. Now the new season is on the morning card itself: one card.
  await q.evaluate(() => { window.sunup.dialogs.close(true); const st = window.sunup.state; st.day = 10; st.minute = 900; window.sunup.input.push({ type: 'sleep' }); });
  await q.waitForTimeout(3300);
  const cards = await q.evaluate(() => [...document.querySelectorAll('.toasts .toast')].map((t) => t.textContent));
  check('a new season is told on the morning card, not in a toast of its own behind it', cards.length === 1 && /^Summer 1/.test(cards[0]) && /Summer begins\./.test(cards[0]), JSON.stringify(cards));
  // Round 4: the morning card ran to four clauses. Three at most, "Summer begins." counted among them.
  {
    const body = await q.evaluate(() => { const t = document.querySelector('.toasts .toast'); return t ? t.innerHTML.split('<br>')[1] ?? '' : ''; });
    const clauses = body.replace(/<[^>]+>/g, '').split(/[.,]\s*/).filter((x) => x.trim()).length;
    check('the morning card says three clauses at most', clauses <= 3, `${clauses}: ${body}`);
  }
  await q.close();
}
// 13. Round 6, on a page of its own: the tester's farm, every plot sown, bugs on a carrot, and the scarecrow lesson due.
// Its pointer fell back to the bug and still carried the build, so a real tap on the bugged crop asked "Build a
// scarecrow?" and "Build for 40" built nothing. Then the turn line, which said to plant with its chevron on a bug.
{
  const q = await ctx.newPage();
  q.on('pageerror', (e) => errs.push(e.message));
  const qc = await ctx.newCDPSession(q);
  const qtap = async (x, y, id = 21) => {
    await qc.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id, radiusX: 8, radiusY: 8, force: 1 }] });
    await q.waitForTimeout(50);
    await qc.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await q.goto(`${base}/?game=homestead&fresh&touch`);
  await q.waitForFunction(() => window.sunup && window.sunup.frames > 10, null, { timeout: 30000 });
  await q.evaluate(() => {
    const st = window.sunup.state;
    st.learn = ['lesson:pull', 'can', 'lesson:water', 'sleep', 'lesson:sleep', 'coins', 'seeds', 'lesson:plant', 'lesson:well', 'board', 'requests', 'lesson:requests', 'lesson:sowfor', 'stamina', 'lesson:stamina', 'lesson:deliver', 'pests', 'lesson:bugs', 'lesson:choose', 'fields', 'hoe', 'lesson:field', 'lesson:hoe', 'wide', 'lesson:wide', 'seedtab', 'lesson:pests', 'lesson:turn', 'lesson:broke'];
    Object.assign(st.learnCount, { 'done:pests': 8 });
    Object.assign(st, { day: 9, held: false, coins: 180, weather: 'rain', orders: [], crows: [], crowPlan: [] });
    let id = 90000;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) {
      const pl = st.plots[y * st.W + x];
      pl.tilled = true;
      pl.wet = true;
      pl.crop = { id: id++, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: x === 3 && y === 6 ? 1 : 0, quality: 0, picks: 0, parched: false, planted: 7 };
    }
  });
  await q.waitForTimeout(1500);
  const before = await q.evaluate(() => ({ line: document.querySelector('.hint.on')?.textContent ?? '', target: window.sunup['lessonTarget'], on: document.querySelector('.tpoint').classList.contains('on') }));
  check('round 6: every plot sown, no scarecrow line, and the pointer that finds the bugs carries no build', before.line !== 'Build a scarecrow on bare soil.' && !before.target.build && before.on && before.target.point?.x === 3.5 && before.target.point?.y === 6.5, JSON.stringify(before));
  const bug = await q.evaluate(() => window.sunup.r3d.project(3.5, 6.5, 0));
  await qtap(bug.x, bug.y);
  await q.waitForTimeout(1800);
  const after = await q.evaluate(() => { const st = window.sunup.state; return { dialog: window.sunup.dialogs.open, title: document.querySelector('.dialog h2')?.textContent ?? '', bugs: st.plots[6 * st.W + 3].crop?.bugs, coins: st.coins, builds: st.builds.length }; });
  check('round 6: a real tap on the bugged crop picks the bugs off: no "Build a scarecrow?", nothing spent or built', !after.dialog && after.bugs === 0 && after.coins === 180 && after.builds === 0, JSON.stringify(after));
  await q.evaluate(() => { const st = window.sunup.state; st.plots[7 * st.W + 4].crop = null; });
  await q.waitForTimeout(900);
  const bare = await q.evaluate(() => ({ line: document.querySelector('.hint.on')?.textContent ?? '', target: window.sunup['lessonTarget'] }));
  check('round 6: a plot cleared, the scarecrow line comes, pointing at it, with its build', bare.line === 'Build a scarecrow on bare soil.' && bare.target.build === 'scarecrow' && bare.target.point?.x === 4.5 && bare.target.point?.y === 7.5, JSON.stringify(bare));
  // The turn: three nights left in spring, every plot sown, a bug on a carrot. No line telling the farmer to plant;
  // then a plot comes free and the line comes, its chevron on that plot.
  await q.evaluate(() => {
    const st = window.sunup.state;
    for (const l of ['scarecrow', 'forecast', 'sprinkler']) st.learn.push(`lesson:${l}`);
    st.learn = st.learn.filter((w) => w !== 'lesson:turn' && w !== 'seedtab');
    st.day = 8;
    st.plots[7 * st.W + 4].crop = { id: 95000, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: 7 };
    st.plots[5 * st.W + 2].crop.bugs = 1;
  });
  await q.waitForTimeout(1200);
  const full = await q.evaluate(() => ({ line: document.querySelector('.hint.on')?.textContent ?? '', seedtab: window.sunup.state.learn.includes('seedtab') }));
  check('round 6: the turn line waits while every plot is sown (it said to plant with its chevron on a bug)', !/ends soon/.test(full.line) && !full.seedtab, JSON.stringify(full));
  await q.evaluate(() => { const st = window.sunup.state; st.plots[8 * st.W + 5].crop = null; });
  await q.waitForTimeout(900);
  const turn = await q.evaluate(() => ({ line: document.querySelector('.hint.on')?.textContent ?? '', target: window.sunup['lessonTarget'] }));
  check('round 6: a plot comes free, and the turn line comes with its chevron on it', turn.line === 'Spring ends soon. Plant summer seeds.' && turn.target.point?.x === 5.5 && turn.target.point?.y === 8.5, JSON.stringify(turn));
  await q.screenshot({ path: `${out}/14-turn-bare.png` });
  await q.close();
}
// 14. Round 7: lessons end on an action, or once read while the farmer stands idle, never on a timer alone, and every
// line stays on screen at least four seconds (the seventh playtest never saw the turn, bugs, forecast or sprinkler
// lines, yet all four were marked learned). Read from the main page: each lesson the tutor finished, the seconds its
// line could be seen by then (its own count), and how long its words stayed in the page, frame by frame. (The sleep
// line is done by sleeping and goes with its night.)
{
  const ends = await p.evaluate(() => window.__lessonEnds);
  const spans = await p.evaluate(() => window.__spans);
  const shown = ends.filter((e) => e.seen > 0);
  const night = (e) => e.overOn !== null && e.day > e.overOn;
  // (Round 9: the line to choose goes with its Accept, and a count line the moment its count is met. Round 10: the
  // plant line counts down too, its words changing with each seed.)
  const early = (e) => e.id === 'choose' || e.id === 'sowfor' || e.id === 'plant';
  const short = shown.filter((e) => e.seen < 3.95 && !night(e) && !early(e));
  const onPage = (text) => spans.filter((x) => x.text === text).reduce((a, x) => a + x.ms, 0);
  console.log(`     lesson lines when finished (seconds seen by the tutor; ms in the page): ${shown.map((e) => `${e.id} ${e.seen.toFixed(1)} s, ${onPage(e.text)} ms`).join('; ')}`);
  check('round 7: every lesson line finished on screen stayed up four seconds or more', shown.length >= 8 && short.length === 0, JSON.stringify(short));
  const pageShort = shown.filter((e) => !night(e) && !early(e) && e.text && onPage(e.text) < 3800);
  check('round 7: and its words stayed in the page four seconds or more, frame by frame', pageShort.length === 0, JSON.stringify(pageShort.map((e) => [e.id, onPage(e.text)])));
  for (const id of ['bugs', 'forecast', 'sprinkler', 'scarecrow', 'pests']) {
    const e = ends.find((x) => x.id === id);
    if (e) check(`round 7: the ${id} line was on screen ${e.seen.toFixed(1)} s before it was marked learned`, e.seen >= 3.95, JSON.stringify(e));
  }
}

// 15. Round 7: at 10 pm in a storm the farm was nearly black and a freshly hoed field could barely be seen (phone-095).
// Worked soil keeps a cool sheen at night: read back from the frame over a hoed field, the meadow beside it and the
// path, at 10 pm in a storm and in rain, against noon.
{
  const q = await ctx.newPage();
  q.on('pageerror', (e) => errs.push(e.message));
  await q.goto(`${base}/?game=homestead&fresh&touch`);
  await q.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 30000 });
  const luma = (x, y, n = 16) => q.evaluate(([x, y, n]) => new Promise((done) => {
    const d = window.sunup.r3d.debug;
    const pt = window.sunup.r3d.project(x, y, 0);
    d.afterFrame = (gl) => {
      d.afterFrame = null;
      const k = gl.drawingBufferWidth / innerWidth;
      const px = new Uint8Array(n * n * 4);
      gl.readPixels(Math.round(pt.x * k - n / 2), Math.round(gl.drawingBufferHeight - pt.y * k - n / 2), n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const v = [];
      for (let i = 0; i < px.length; i += 4) v.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
      v.sort((a, b) => a - b);
      done(Math.round(v[Math.floor(v.length / 2)]));
    };
  }), [x, y, n]);
  const at = async (weather, minute) => {
    await q.evaluate(([weather, minute]) => {
      const s = window.sunup.state;
      s.held = false;
      for (const id of ['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'requests', 'deliver', 'stamina', 'hoe', 'wide', 'field', 'choose', 'sowfor']) if (!s.learn.includes(`lesson:${id}`)) s.learn.push(`lesson:${id}`);
      for (const f of ['can', 'sleep', 'coins', 'seeds', 'stamina', 'hoe']) if (!s.learn.includes(f)) s.learn.push(f);
      s.parcels[2].owned = true;
      for (let y = 10; y < 14; y++) for (let x = 2; x < 6; x++) { const p2 = s.plots[y * s.W + x]; p2.tilled = true; p2.crop = null; }
      Object.assign(s, { weather, minute, day: 23, orders: [], crows: [], crowPlan: [] });
      Object.assign(s.actors[0], { x: 6.5, y: 9.5, path: [], task: null, aim: null });
    }, [weather, minute]);
    await q.waitForTimeout(1800);
    // The median of three reads, so a lightning flash does not decide it.
    const read = async (x, y) => { const v = [await luma(x, y), await luma(x, y), await luma(x, y)].sort((a, b) => a - b); return v[1]; };
    return { soil: await read(3.5, 11.5), meadow: await read(8.5, 11.5), path: await read(6.5, 10.5) };
  };
  const noon = await at('sun', 360);
  const storm = await at('storm', 960);
  await q.screenshot({ path: `${out}/15-storm-10pm.png` });
  const rain = await at('rain', 960);
  console.log(`     worked soil, meadow and path (frame luma of 255): noon ${JSON.stringify(noon)}, 10 pm storm ${JSON.stringify(storm)}, 10 pm rain ${JSON.stringify(rain)}`);
  for (const [w, v] of [['storm', storm], ['rain', rain]]) check(`round 7: at 10 pm in ${w === 'storm' ? 'a storm' : 'rain'} a hoed field reads: soil luma 30 or more, and plainly lighter than the meadow beside it`, v.soil >= 30 && v.soil >= v.meadow * 1.4, JSON.stringify(v));
  check('round 7: and it is still night: the soil far darker than at noon', storm.soil < noon.soil * 0.5, JSON.stringify({ noon, storm }));
  await q.close();
}
// Round 10: no tool, nor Sleep, moves on the rack once it is there (the rack grew from its middle as tools came).
check(`round 10: every tool and Sleep keep their place on the rack from the morning they arrive (${[...rackAt.keys()].join(', ')})`, rackAt.size >= 6 && rackMoves.length === 0, rackMoves.slice(0, 4).join('; '));
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(failed ? `LESSONS FAILED (${failed})` : 'LESSONS OK', `shots in ${out}`);
process.exit(failed ? 1 : 0);
