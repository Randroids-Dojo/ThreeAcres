// Sunup's lessons, played through on a phone-sized page: each step's line, and
// what the screen shows at that point (tools, coins, board, forecast,
// stamina). Fails if something appears before its lesson brings it in.
// node scripts/qa/lessons.mjs [base url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5247';
const out = '/tmp/acres-lessons';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 838 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
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
// The line names the button, so at a radish the button wears that word.
await p.evaluate(() => {
  const f = window.sunup.state.actors[0];
  Object.assign(f, { x: 2.5, y: 4.5, facing: 's', angle: Math.PI / 2, task: null, path: [] });
});
await frames(10);
const actWord = await p.evaluate(() => document.querySelector('.tb-act .tb-t')?.textContent ?? '');
check('at a radish the button says the word the line names', actWord !== '' && s.line.includes(`Hold ${actWord}`), `button "${actWord}", line "${s.line}"`);
for (let x = 2; x < 6; x++) await actAt(x, 4, 's');
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
check('crows and the forecast are still to come', !s.forecast && !s.tools.includes('build'));

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
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(failed ? `LESSONS FAILED (${failed})` : 'LESSONS OK', `shots in ${out}`);
process.exit(failed ? 1 : 0);
