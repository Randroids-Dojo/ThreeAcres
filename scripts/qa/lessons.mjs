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
const screen = () =>
  p.evaluate(() => {
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

// 1. Hands only, pull the radishes.
let s = await screen();
check('starts with hands only', s.tools.join() === 'hands' && !s.sleep && !s.coins && !s.board && !s.forecast && !s.stamina && s.notes === 0, JSON.stringify(s));
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
s = await screen();
check('morning: coins, seeds and stamina appear', s.coins && s.tools.includes('seeds') && s.stamina, JSON.stringify(s));
check('one line: plant seeds', /sow|seed/i.test(s.line), s.line);
check('no board or requests yet', !s.board && s.notes === 0);
await shot('4-plant');

// 4. Plant three radishes in the bare row (y=7).
await send({ type: 'seed', crop: 'radish' });
await send({ type: 'tool', tool: 'seeds' });
for (let x = 2; x < 5; x++) await actAt(x, 6, 's');
await frames(10);
s = await screen();
check('after planting, nothing new until day 3', !s.board, `line "${s.line}"`);
await shot('5-after-plant');

// 5. A dry can brings the well lesson.
await p.evaluate(() => (window.sunup.state.water = 2));
await frames(20);
s = await screen();
check('a nearly dry can brings the well', /well/i.test(s.line), s.line);
await p.evaluate(() => (window.sunup.state.water = 12));
await p.evaluate(() => (window.sunup.state.learnCount.refill = 1));
await frames(20);

// 6. Day 3: the board and its first request.
await send({ type: 'sleep' });
await p.waitForTimeout(3500);
await frames(20);
s = await screen();
check('day 3: the board appears with a request', s.board && /board/i.test(s.line), JSON.stringify(s));
const badge = await p.evaluate(() => document.querySelector('.topbtns .badge')?.textContent ?? '');
check('one request to start', badge === '1', badge);
check('requests stay off the farm (no notes)', s.notes === 0);
await shot('6-board');
await p.evaluate(() => document.querySelector('.topbtns .iconbtn').click());
await p.waitForTimeout(600);
const tabs = await p.evaluate(() => [...document.querySelectorAll('.dialog .tabs button')].map((t) => t.textContent));
check('the board opens on its requests', tabs[0] === 'Requests', tabs.join(','));
await shot('7-board-open');
await p.evaluate(() => window.sunup.dialogs.close());
await frames(20);
s = await screen();
check('after reading it, the line goes (and the reading counts)', s.line !== 'Read the board.' && (await p.evaluate(() => window.sunup.state.learn.includes('lesson:requests'))), s.line);
// The deliver line waits until it matters: nothing the request wants is ripe yet.
check('nothing it wants is ripe: no deliver line yet', !/crate|ships/i.test(s.line), s.line);
// Ripen what the request wants (as the days would): now the line names it and points at a ripe one.
const want = await p.evaluate(() => {
  const st = window.sunup.state;
  const it = st.orders[0].items[0];
  const spots = [];
  for (let i = 0; i < st.plots.length && spots.length < it.n; i++) {
    const q = st.plots[i];
    if (st.parcelOf[i] !== 0 || q.crop) continue;
    q.tilled = true;
    q.crop = { id: st.nextId++, kind: it.crop, age: 99, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
    q.crop.age = { radish: 3 }[it.crop] ?? 3;
    spots.push({ x: i % st.W, y: Math.floor(i / st.W) });
  }
  return { crop: it.crop, n: it.n, spots };
});
await frames(30);
s = await screen();
check('a crop the request wants is ripe: the line names the crop and count', /^Harvest \d+ [a-z]+\. The crate ships them\.$/.test(s.line), `${s.line} (${want.n} ${want.crop})`);
{
  const pt = await p.evaluate(() => { const e = document.querySelector('.tpoint'); const r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const near = await Promise.all(want.spots.map((t) => project(t.x + 0.5, t.y + 0.5, 0.5)));
  check('and the pointer is on a ripe one', pt.on && near.some((q) => Math.abs(q.x - pt.x) < 16), JSON.stringify({ pt, near: near.map((q) => [Math.round(q.x), Math.round(q.y)]) }));
}
await shot('6a-deliver');
await p.evaluate(() => window.sunup.hud.pickTool('hands'));
for (const t of want.spots) await actAt(t.x, t.y - 1, 's');
await frames(20);
s = await screen();
check('harvesting what it asks ends the deliver line', !/ships/.test(s.line) && (await p.evaluate(() => window.sunup.state.learn.includes('lesson:deliver'))), s.line);
check('crows and the forecast are still to come', !s.forecast && !s.tools.includes('build'));

// 6b. A field bought early, from the board, before its lesson: the hoe still comes, with a line and a pointer.
await p.evaluate(() => { window.sunup.state.coins = 320; });
await frames(10);
check('no hoe before a second field', !(await screen()).tools.includes('hoe'));
await p.evaluate(() => window.sunup.dialogs.board('fields'));
await p.waitForTimeout(500);
const tabsTop = await p.evaluate(() => [...document.querySelectorAll('.dialog .tabs button')].map((b) => Math.round(b.getBoundingClientRect().top)));
check('the board\u2019s tabs sit on one row on the phone', Math.max(...tabsTop) - Math.min(...tabsTop) < 12, tabsTop.join(','));
const fieldStamps = await p.evaluate(() => [...document.querySelectorAll('.dialog .item .btn')].map((b) => b.textContent));
// Round 3: fields 3 to 6 hid their prices behind "Reputation 4". Each card says its price once: on the stamp, or in
// its words when the stamp shows the reputation it wants.
const fieldCards = await p.evaluate(() => [...document.querySelectorAll('.dialog .list .item')].filter((e) => e.querySelector('.btn')).map((e) => e.textContent));
const prices = [250, 800, 1500, 2400, 3500].map((n) => n.toLocaleString('en-US'));
check('each field\u2019s price shows once (on its stamp, or in its words when the stamp asks for reputation)', fieldStamps[0] === 'Buy for 250' && fieldStamps.slice(1).every((t) => /^Reputation \d+$/.test(t)) && fieldCards.every((t, i) => t.split(prices[i]).length - 1 === 1), JSON.stringify(fieldCards));
await tapEl('.dialog .item .btn', 'Buy for 250');
await p.waitForTimeout(400);
const askTitle = await p.evaluate(() => document.querySelector('.dialog h2')?.textContent ?? '');
check('a 250-coin field asks before it buys', /for sale/.test(askTitle) && (await p.evaluate(() => !window.sunup.state.parcels[1].owned)), askTitle);
const askText = await p.evaluate(() => document.querySelector('.dialog p')?.textContent ?? '');
check('and says its price once (on the stamp)', !/250/.test(askText), askText);
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
await send({ type: 'tool', tool: 'hoe' });
for (const x of [7, 8]) await actAt(x, 4, 's');
await frames(20);
s = await screen();
check('hoeing two plots ends the hoe line', s.line !== 'Hoe the new field.' && (await p.evaluate(() => window.sunup.state.learn.includes('lesson:hoe'))), s.line);
await send({ type: 'tool', tool: 'hands' });

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
  const pairUp = await p.evaluate(() => window.sunup.state.orders.length);
  check('the first request filled, the next morning brings a pair with its line', pairUp === 2 && s.line === 'Two requests on the board. Plant for one.', `${pairUp} requests, line "${s.line}"`);
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
  await p.evaluate((d) => { window.sunup.state.day = d + 1; }, crowDay);
  await frames(30);
  s = await screen();
  check('the morning after the crow: the Build tool arrives, with its line, and nothing else new', s.tools.includes('build') && /^Scarecrows keep crows away\./.test(s.line) && !s.forecast, JSON.stringify(s));
  // The Build tool wears a hammer: a head across its handle, unlike the hoe beside it and the old pencil.
  const icons = await p.evaluate(() => ({ build: document.querySelector('.toolbar .tool[data-tool="build"] svg')?.innerHTML ?? '', hoe: document.querySelector('.toolbar .tool[data-tool="hoe"] svg')?.innerHTML ?? '' }));
  check('the Build tool wears a hammer, not the old pencil', icons.build && icons.build !== icons.hoe && !icons.build.includes('M12.5 7.5 5 15l4 4 7.5-7.5'), icons.build.slice(0, 80));
  await shot('8c-build-arrives');
  await p.evaluate(() => window.sunup.state.learn.push('lesson:scarecrow'));
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
check('the picker offers summer seeds, marked as next season', ['corn', 'sunflower', 'beans'].every((c) => cards[c]?.next && cards[c].wh === 'Summer crop'), JSON.stringify(cards));
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
    const g = await import('/src/sim/goals.ts');
    g.fillRequests(st, true);
  });
  await q.waitForTimeout(600);
  const qs = await q.evaluate(() => ({ line: document.querySelector('.hint.on')?.textContent ?? '', orders: window.sunup.state.orders.length, pt: (() => { const e = document.querySelector('.tpoint'); return { on: e.classList.contains('on') }; })() }));
  check('a pair of requests: the line says to plant for one, and points the way', qs.orders === 2 && qs.line === 'Two requests on the board. Plant for one.' && qs.pt.on, JSON.stringify(qs));
  // The board, opened with a real tap on its button.
  const bb = await q.evaluate(() => { const r = document.querySelector('.topbtns .iconbtn').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const qc = await ctx.newCDPSession(q);
  await qc.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb[0], y: bb[1], id: 3, radiusX: 6, radiusY: 6, force: 1 }] });
  await qc.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await q.waitForTimeout(700);
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
      })),
      W,
      H,
    };
  });
  const lines = pair.notes.map((n) => n.lines.map((l) => l.text));
  const readable = pair.n === 2 && pair.or === 'or' && pair.notes.every((n) => {
    const [name, who, need, pay] = n.lines.map((l) => l.text);
    return /^\d+ [a-z]+$/.test(name) && /^For /.test(who) && /^Sow \d+ (today|by tomorrow|by [A-Z][a-z]+ \d+), seed \d+$/.test(need) && /^Pays [\d,]+, [\d,]+ at market$/.test(pay);
  });
  check('the board shows the pair at a glance: what each needs, sow by, pays, and against what, "or" between them', readable, JSON.stringify(lines));
  const onScreen = pair.notes.every((n) => n.box.l >= 0 && n.box.r <= pair.W && n.box.t >= 0 && n.box.b <= pair.H) && pair.notes.every((n) => n.lines.every((l) => l.size >= 12 && !l.cut));
  const [A, B] = pair.notes.map((n) => n.box);
  const apart = A && B && pair.orBox && (A.b <= pair.orBox.t + 1 || A.r <= pair.orBox.l + 1) && (pair.orBox.b <= B.t + 1 || pair.orBox.r <= B.l + 1);
  check('on the phone both notes are whole on screen, in type of 12 px or more, nothing cut off, "or" clear between them', onScreen && apart, JSON.stringify({ boxes: pair.notes.map((n) => n.box), or: pair.orBox, sizes: pair.notes.map((n) => n.lines.map((l) => l.size)) }));
  // The trade-off holds on the board's own numbers: each fits the purse alone, both together do not fit the soil or the purse.
  const fits = await q.evaluate(() => {
    const st = window.sunup.state;
    const free = st.plots.filter((pl, i) => st.parcelOf[i] >= 0 && st.parcels[st.parcelOf[i]].owned && !pl.crop).length;
    const [a, b] = st.orders;
    const seed = { radish: 10, lettuce: 15, carrot: 15, beans: 30, strawberry: 45, sunflower: 30, corn: 45, pumpkin: 80 };
    const cost = (o) => o.items[0].n * seed[o.items[0].crop];
    return { alone: [a, b].every((o) => o.items[0].n <= free && cost(o) <= st.coins), both: a.items[0].n + b.items[0].n > free || cost(a) + cost(b) > st.coins, free, coins: st.coins, a: `${a.items[0].n} ${a.items[0].crop}`, b: `${b.items[0].n} ${b.items[0].crop}` };
  });
  check('each of the pair can be met alone, and the two together cannot', fits.alone && fits.both, JSON.stringify(fits));
  await q.screenshot({ path: `${out}/13-board-pair.png` });
  for (const q2 of await q.evaluate(strikeScanInPage)) check(`no ruled line through "${q2.text}"`, false);
  // Round 3: "Summer begins" hid behind the morning card. Now the new season is on the morning card itself: one card.
  await q.evaluate(() => { window.sunup.dialogs.close(true); const st = window.sunup.state; st.day = 10; st.minute = 900; window.sunup.input.push({ type: 'sleep' }); });
  await q.waitForTimeout(3300);
  const cards = await q.evaluate(() => [...document.querySelectorAll('.toasts .toast')].map((t) => t.textContent));
  check('a new season is told on the morning card, not in a toast of its own behind it', cards.length === 1 && /^Summer 1/.test(cards[0]) && /Summer begins\./.test(cards[0]), JSON.stringify(cards));
  await q.close();
}
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(failed ? `LESSONS FAILED (${failed})` : 'LESSONS OK', `shots in ${out}`);
process.exit(failed ? 1 : 0);
