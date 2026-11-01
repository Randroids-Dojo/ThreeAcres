// Sunup's lessons, played through on a phone-sized page: each step's line, and
// what the screen shows at that point (tools, coins, board, forecast,
// stamina). Fails if something appears before its lesson brings it in.
// Also, with real touch events: the first lesson's tap on a radish (one under
// the walk stick's zone too), a field bought early from the board bringing the
// hoe and its line and pointer, next season's seeds in the picker near the
// turn, the bug lesson and its pointer, and the camera keeping the farm in view.
// node scripts/qa/lessons.mjs [base url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

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
check('after reading it, the next line explains delivery', /crate|ships/i.test(s.line), s.line);
check('the request line names the crop and count', /^Harvest \d+ [a-z]+\. The crate ships them\.$/.test(s.line), s.line);
check('crows and the forecast are still to come', !s.forecast && !s.tools.includes('build'));

// 6b. A field bought early, from the board, before its lesson: the hoe still comes, with a line and a pointer.
await p.evaluate(() => { window.sunup.state.coins = 320; });
await frames(10);
check('no hoe before a second field', !(await screen()).tools.includes('hoe'));
await p.evaluate(() => window.sunup.dialogs.board('fields'));
await p.waitForTimeout(500);
const tabsTop = await p.evaluate(() => [...document.querySelectorAll('.dialog .tabs button')].map((b) => Math.round(b.getBoundingClientRect().top)));
check('the board\u2019s tabs sit on one row on the phone', Math.max(...tabsTop) - Math.min(...tabsTop) < 12, tabsTop.join(','));
await tapEl('.dialog .item .btn', 'Buy');
await p.waitForTimeout(400);
const askTitle = await p.evaluate(() => document.querySelector('.dialog h2')?.textContent ?? '');
check('a 200-coin field asks before it buys', /for sale/.test(askTitle) && (await p.evaluate(() => !window.sunup.state.parcels[1].owned)), askTitle);
await tapEl('.dialog .ask .btn.primary');
await p.waitForTimeout(500);
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
check('a crow lands: the line names it and the crop it is on', /^A crow is on your [a-z]+\. Shoo it\.$/.test(s.line), s.line);
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
check('the crow in view: the chevron bobs just over it', pt.on && pt.over && ca && Math.abs(pt.x - ca.x) < 12 && ca.y - pt.y > 10 && ca.y - pt.y < 50, JSON.stringify({ pt, ca }));
await shot('8b-crow-near');
// Walk at it.
await p.evaluate((t) => { const f = window.sunup.state.actors[0]; Object.assign(f, { x: t.x + 0.5, y: t.y - 0.5, task: null, path: [] }); }, target);
await frames(20);
check('walking at the crow shoos it and ends the crow lesson', await p.evaluate(() => window.sunup.state.learn.includes('lesson:pests')));

// 8. Bugs come quietly with the crows. The line waits for real bugs, names the crop and points at them; the button says Pick.
await p.evaluate(() => { const st = window.sunup.state; st.learn.push('lesson:scarecrow'); window.sunup.hud.pickTool('hands'); });
await frames(20);
s = await screen();
check('no bug line while no bug is on the farm', !/Bugs/.test(s.line), s.line);
const bug = await p.evaluate(() => {
  const st = window.sunup.state;
  const i = st.plots.findIndex((q, k) => q.crop && !q.crop.dead && q.crop.stage >= 1 && q.crop.stage < 4 && st.parcelOf[k] >= 0 && st.parcels[st.parcelOf[k]].owned);
  st.plots[i].crop.bugs = 1;
  const f = st.actors[0];
  Object.assign(f, { x: 12.5, y: 3.5, task: null, path: [] });
  return { x: i % st.W, y: Math.floor(i / st.W), kind: st.plots[i].crop.kind };
});
await frames(40);
s = await screen();
check('bugs land: the line names the crop', /^Bugs on your [a-z]+\. Pick them off\.$/.test(s.line), s.line);
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


// 9. The last days of a season: the picker offers next season's seeds, marked, and marks what is too late.
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
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(failed ? `LESSONS FAILED (${failed})` : 'LESSONS OK', `shots in ${out}`);
process.exit(failed ? 1 : 0);
