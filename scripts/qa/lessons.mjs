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
check('one line: sow seeds', /sow|seed/i.test(s.line), s.line);
check('no board or requests yet', !s.board && s.notes === 0);
await shot('4-plant');

// 4. Sow three radishes in the bare row (y=7).
await send({ type: 'seed', crop: 'radish' });
await send({ type: 'tool', tool: 'seeds' });
for (let x = 2; x < 5; x++) await actAt(x, 6, 's');
await frames(10);
s = await screen();
check('after sowing, nothing new until day 3', !s.board, `line "${s.line}"`);
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
check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
await b.close();
console.log(failed ? `LESSONS FAILED (${failed})` : 'LESSONS OK', `shots in ${out}`);
process.exit(failed ? 1 : 0);
