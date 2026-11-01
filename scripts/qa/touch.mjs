// Touch controls, driven with real touch events through the DevTools protocol.
// node scripts/qa/touch.mjs [base url]
// Checks: controls show on touch and hide on a key press; the floating stick
// walks the farmer; walking and acting at once (two fingers); hold-to-repeat;
// the act button lights with its word wherever acting would do something; the
// can's water gauge on the rack and the act button (full, half, empty); a
// faint cursor on the plot in front even when nothing can be done there (read
// back from the frame); the well answers from its side and corner, not only
// its door; sleeping before noon asks first; a tap picks every seed.
// Round 2: three quick real taps on ripe radishes harvest all three, in order;
// a tap on a ripe crop with the can in hand takes the hands and harvests it; a
// tap on the ground in front of the well, or on the well's drawing, fills the
// can; with nothing to do, the act button wears the tool in hand; walking with
// the stick while holding Harvest works the row without stopping at each plot.
// Round 3: sleeping before noon asks only when something on the farm still
// wants doing; a tap on the lesson pointer's edge arrow walks to what it points
// at and does the job (it used to walk to the ground behind the arrow); the
// copper can's taps water along the row and skip bare soil and the path, and
// bare soil never lights Water; fourteen quick real taps are all done; the
// coin stays a coin whatever seed is picked, and a seed the purse cannot pay
// for looks it.
// Round 4: the View button shows the whole farm with a real tap (a bugged crop
// in the first field's left column, off screen from the second field, comes
// into view) and a second tap comes back; a tap on a "Too late" seed closes the
// picker and puts the seed away, so the next plot tap plants nothing; a tap
// with the can on a dry, bugged crop picks the bugs off and waters nothing; a
// refusal over a plot at the screen's edge ("Already watered") stays whole on
// screen; every tool on the rack wears its name.
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5247';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const cdp = await ctx.newCDPSession(p);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const S = () => p.evaluate(() => {
  const s = window.sunup.state;
  const f = s.actors[0];
  return { x: f.x, y: f.y, harvested: Object.values(s.stats.harvested).reduce((a, b) => a + b, 0), jobs: s.jobs.length, stamina: s.stamina, tool: s.tool, zoom: window.sunup['cams'][s.rules.camera].zoom };
});
const visible = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0; }, sel);

// ---- walk control
await p.goto(`${base}/?game=homestead&fresh`);
await p.waitForFunction(() => window.sunup && window.sunup.frames > 10);
await p.waitForTimeout(300);
check('touch controls show on a phone', (await visible('.tb-act')) && (await visible('.ts-zone')));
const s0 = await S();
// Stick: thumb down low on the left, push down (south) and hold.
await touch('touchStart', [[90, 700, 1]]);
for (let i = 1; i <= 6; i++) {
  await touch('touchMove', [[90, 700 + i * 12, 1]]);
  await p.waitForTimeout(16);
}
await p.waitForTimeout(250);
const s1 = await S();
await touch('touchEnd', []);
check('the stick walks the farmer', s1.y > s0.y + 0.3, `y ${s0.y.toFixed(2)} to ${s1.y.toFixed(2)}`);
await p.waitForTimeout(150);
const s2 = await S();
check('letting go stops', Math.abs(s2.y - s1.y) < 0.35, `drift ${(s2.y - s1.y).toFixed(2)}`);
// Put the farmer facing the radish row, then hold the stick and press act with a second finger.
await p.evaluate(() => { const f = window.sunup.state.actors[0]; f.x = 2.5; f.y = 4.5; f.facing = 's'; f.angle = Math.PI / 2; });
const act = await p.evaluate(() => { const r = document.querySelector('.tb-act').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
const h0 = (await S()).harvested;
await touch('touchStart', [[90, 700, 1]]);
await touch('touchStart', [[90, 700, 1], [act[0], act[1], 2]]);
await p.waitForTimeout(120);
await touch('touchEnd', [[90, 700, 1]]);
await touch('touchEnd', []);
await p.waitForTimeout(150);
check('act works while the stick is held', (await S()).harvested === h0 + 1);
// Hold-to-repeat: walk east down the radish row holding act; each plot ahead gets pulled.
await p.evaluate(() => { const f = window.sunup.state.actors[0]; f.x = 1.5; f.y = 5.5; f.facing = 'e'; f.angle = 0; });
const h1 = (await S()).harvested;
await touch('touchStart', [[act[0], act[1], 3]]);
await p.waitForTimeout(80);
await touch('touchStart', [[act[0], act[1], 3], [90, 700, 4]]);
await touch('touchMove', [[act[0], act[1], 3], [150, 700, 4]]);
await p.waitForTimeout(900);
await touch('touchEnd', [[act[0], act[1], 3]]);
await touch('touchEnd', []);
check('holding act keeps working', (await S()).harvested >= h1 + 2, `${(await S()).harvested - h1} pulled`);
// Sunup's tools live on the rack; the touch layer has no second tool button.
check('no duplicate tool button over the farm', !(await visible('.tb-tool')));
// A key press hides the touch controls.
await p.keyboard.press('KeyD');
await p.waitForTimeout(100);
check('a key press hides the touch controls', !(await visible('.tb-act')));
// (A tap on the open yard: a tap on a field for sale would offer it.)
const yard = await p.evaluate(() => window.sunup.r3d.project(12.5, 3.5, 0));
await touch('touchStart', [[yard.x, yard.y, 6]]);
await touch('touchEnd', []);
await p.waitForTimeout(100);
check('a touch brings them back', await visible('.tb-act'));
check('and a tap on the yard opens nothing', !(await p.evaluate(() => window.sunup.dialogs.open)));
// A tap on a field for sale, from across the farm, offers it (the field lesson points at it).
const forSale = await p.evaluate(() => window.sunup.r3d.project(9, 7, 0));
await touch('touchStart', [[forSale.x, forSale.y, 6]]);
await touch('touchEnd', []);
await p.waitForTimeout(400);
check('a tap on the field for sale offers it', await p.evaluate(() => window.sunup.dialogs.open && /Field 2 is for sale/.test(document.querySelector('.dialog h2').textContent)));
await p.evaluate(() => window.sunup.dialogs.close(true));
await p.waitForTimeout(300);

// The round button lights up, with the word for it, wherever acting would do
// something, and a real tap does that thing: the notice board opens, the well
// fills the can with the hands in hand. Where nothing would happen it is dim.
await p.evaluate(() => {
  for (const what of ['can', 'board', 'requests']) window.sunup.input.push({ type: 'unlock', what });
  window.sunup.hud.pickTool('hands');
});
await p.waitForTimeout(200);
// (A tap on the farm aims at that tile for a moment; clear it so the button reads the tile the farmer faces.)
const standAt = (x, y, facing) => p.evaluate(([x, y, facing]) => {
  window.sunup.walkAim = null;
  const f = window.sunup.state.actors[0];
  Object.assign(f, { x: x + 0.5, y: y + 0.5, facing, angle: { n: -Math.PI / 2, s: Math.PI / 2, e: 0, w: Math.PI }[facing], task: null, path: [], moving: false });
}, [x, y, facing]);
const actButton = () => p.evaluate(() => {
  const b = document.querySelector('.tb-act');
  return { lit: !b.classList.contains('no'), word: b.querySelector('.tb-t')?.textContent ?? '' };
});
const tapAct = async () => {
  const [x, y] = await p.evaluate(() => { const r = document.querySelector('.tb-act').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await touch('touchStart', [[x, y, 9]]);
  await touch('touchEnd', []);
  await p.waitForTimeout(400);
};
await standAt(8, 3, 'n');
await p.waitForTimeout(250);
let ab = await actButton();
check('at the notice board the button is lit and says Read', ab.lit && ab.word === 'Read', JSON.stringify(ab));
await tapAct();
check('a tap at the board opens it, and it stays open (the tap does not close it again)', await p.evaluate(() => window.sunup.dialogs.open));
// A tap on the backdrop, away from the board, still closes it.
// The middle of the larger free gap, above or below the board.
const backdrop = await p.evaluate(() => { const r = document.querySelector('.dialog').getBoundingClientRect(); const below = innerHeight - r.bottom; return [innerWidth / 2, below > r.top ? r.bottom + below / 2 : Math.max(8, r.top / 2)]; });
await touch('touchStart', [[backdrop[0], backdrop[1], 10]]);
await touch('touchEnd', []);
await p.waitForTimeout(350);
check('a tap on the backdrop closes the board', !(await p.evaluate(() => window.sunup.dialogs.open)));
await p.evaluate(() => window.sunup.dialogs.close(true));
await p.waitForTimeout(250);
await p.evaluate(() => { window.sunup.state.water = 1; });
await standAt(11, 3, 'n');
await p.waitForTimeout(250);
ab = await actButton();
check('at the well, hands in hand, the button is lit and says Fill the can', ab.lit && ab.word === 'Fill the can', JSON.stringify(ab));
await tapAct();
check('a tap at the well fills the can', (await p.evaluate(() => window.sunup.state.water)) > 1);
await standAt(6, 3, 'e');
await p.waitForTimeout(250);
ab = await actButton();
check('facing the bare yard, the button is dim and says nothing', !ab.lit && ab.word === '', JSON.stringify(ab));

// The cursor: even with nothing to do, a faint frame shows on the plot in front. Read the frame back with the
// markers drawn and hidden, at that plot.
const tileLight = (x, y) => p.evaluate(([x, y]) => new Promise((done) => {
  const d = window.sunup.r3d.debug;
  const pt = window.sunup.r3d.project(x + 0.5, y + 0.5, 0.1);
  d.afterFrame = (gl) => {
    d.afterFrame = null;
    const k = gl.drawingBufferWidth / innerWidth;
    const n = 16;
    const px = new Uint8Array(n * n * 4);
    gl.readPixels(Math.round(pt.x * k - n / 2), Math.round(gl.drawingBufferHeight - pt.y * k - n / 2), n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
    done(sum / (n * n * 3));
  };
}), [x, y]);
// The frame is drawn on the edge of the tile, so sample there: a quarter tile in from the edge nearest the farmer.
const view = await p.evaluate(() => window.sunup.view(0).highlight);
check('facing the bare yard, the cursor still marks the plot in front, faintly', !!view && view.x === 7 && view.y === 3 && !view.ok && view.verb === null, JSON.stringify(view));
const markersOn = await tileLight(6.55, 2.6);
await p.evaluate(() => { window.sunup.r3d.debug.scene.getObjectByName('markers').visible = false; });
const markersOff = await tileLight(6.55, 2.6);
await p.evaluate(() => { window.sunup.r3d.debug.scene.getObjectByName('markers').visible = true; });
check('and the faint frame is really drawn there', markersOn - markersOff > 4, `light ${markersOn.toFixed(1)} with, ${markersOff.toFixed(1)} without`);

// The can's water is always on the can: a gauge on the rack, and on the act button while the can is in hand.
await p.evaluate(() => { window.sunup.state.water = 12; window.sunup.hud.pickTool('can'); });
await standAt(3, 4, 's');
await p.waitForTimeout(250);
const gauge = () => p.evaluate(() => {
  const g = document.querySelector('.toolbar .tool[data-tool="can"] .watermeter');
  const r = g.getBoundingClientRect();
  const fill = g.firstElementChild.getBoundingClientRect();
  const a = document.querySelector('.tb-act .tb-water');
  const ar = a.getBoundingClientRect();
  const af = a.firstElementChild.getBoundingClientRect();
  const cs = getComputedStyle(g);
  // The rack's gauge is a level up the side of the can; the act button's runs across under its word.
  return { w: r.width, h: r.height, shown: cs.display !== 'none' && Number(cs.opacity) > 0.5, frac: fill.height / Math.max(1, r.height), act: { w: ar.width, h: ar.height, frac: af.width / Math.max(1, ar.width) }, label: document.querySelector('.toolbar .tool[data-tool="can"] .lbl').textContent, word: document.querySelector('.tb-act .tb-t').textContent };
});
let gg = await gauge();
check('the can shows its water on the rack (a real, visible gauge, full)', gg.shown && gg.h >= 24 && gg.w >= 4 && gg.frac > 0.95, JSON.stringify(gg));
// Nothing on the can tool or the button is struck through: the gauge sits clear of the words.
const clear = await p.evaluate(() => {
  const gap = (a, b) => { const r = a.getBoundingClientRect(); const q = b.getBoundingClientRect(); return !(r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom); };
  const tool = document.querySelector('.toolbar .tool[data-tool="can"]');
  const act = document.querySelector('.tb-act');
  return gap(tool.querySelector('.watermeter'), tool.querySelector('.lbl')) && gap(act.querySelector('.tb-water'), act.querySelector('.tb-t'));
});
check('the gauges sit clear of the words', clear);
check('and on the act button while the can is in hand', gg.act.w >= 20 && gg.act.h >= 4 && gg.act.frac > 0.95, JSON.stringify(gg.act));
await p.evaluate(() => { window.sunup.state.water = 6; });
await p.waitForTimeout(350);
gg = await gauge();
check('half a can reads half', Math.abs(gg.frac - 0.5) < 0.08 && Math.abs(gg.act.frac - 0.5) < 0.08, JSON.stringify(gg));
// Empty: the rack says Empty, so does the button, and the line points back to the well.
await p.evaluate(() => {
  const st = window.sunup.state;
  st.water = 0;
  st.learn.push('lesson:well');
  for (const q of st.plots) if (q.crop && q.crop.kind === 'carrot') { q.wet = false; q.moisture = 1; }
});
await p.waitForTimeout(350);
gg = await gauge();
const emptyLine = await p.evaluate(() => document.querySelector('.hint.on')?.textContent ?? '');
const emptyPt = await p.evaluate(() => document.querySelector('.tpoint').classList.contains('on'));
check('an empty can says Empty on the rack and on the button', gg.label === 'Empty' && gg.word === 'Empty' && gg.frac < 0.02, JSON.stringify(gg));
check('and the line points back to the well', emptyLine === 'Can empty. Fill the can at the well.' && emptyPt, `${emptyLine} pointer ${emptyPt}`);
await p.screenshot({ path: '/tmp/acres-touch-empty-can.png' });

// The well answers from any side: from beside it and from its corner, facing away from it, the button reads
// Fill the can and a tap fills it.
await p.evaluate(() => window.sunup.hud.pickTool('hands'));
for (const [x, y, facing] of [[10, 3, 'n'], [12, 2, 'e'], [12, 1, 'w']]) {
  await p.evaluate(() => { window.sunup.state.water = 1; });
  await standAt(x, y, facing);
  await p.waitForTimeout(250);
  ab = await actButton();
  const hl = await p.evaluate(() => window.sunup.view(0).highlight);
  await tapAct();
  const w = await p.evaluate(() => window.sunup.state.water);
  check(`at the well from ${x},${y} facing ${facing}: the cursor and button find the well and a tap fills the can`, ab.lit && ab.word === 'Fill the can' && hl?.x === 11 && hl?.y === 2 && hl.ok && w === 12, JSON.stringify({ ab, hl, w }));
}

// Sleeping before noon asks first while something still wants doing; Not now keeps the day.
await p.evaluate(() => {
  window.sunup.input.push({ type: 'unlock', what: 'sleep' });
  const st = window.sunup.state;
  st.learn.push('lesson:sleep');
  st.minute = 150;
  st.stamina = 80;
  // One thirsty carrot is still waiting.
  const q = st.plots.find((x) => x.crop && x.crop.kind === 'carrot' && x.crop.stage < 4);
  if (q) { q.wet = false; q.moisture = 1; }
});
await p.waitForTimeout(250);
const tapSleep = async () => {
  const [x, y] = await p.evaluate(() => { const r = document.querySelector('.toolbar .tool.act').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await touch('touchStart', [[x, y, 11]]);
  await touch('touchEnd', []);
  await p.waitForTimeout(400);
};
await tapSleep();
const asked = await p.evaluate(() => ({ open: window.sunup.dialogs.open, title: document.querySelector('.dialog h2')?.textContent ?? '', text: document.querySelector('.dialog p')?.textContent ?? '', night: window.sunup.state.turnover }));
check('Sleep at 8:30 am, with a crop still thirsty, asks first and says what waits', asked.open && asked.title === 'Sleep now?' && asked.night < 0 && /thirsty/.test(asked.text), JSON.stringify(asked));
const notNow = await p.evaluate(() => { const b = [...document.querySelectorAll('.dialog .ask .btn')].find((e) => e.textContent === 'Not now'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await touch('touchStart', [[notNow[0], notNow[1], 12]]);
await touch('touchEnd', []);
await p.waitForTimeout(400);
check('Not now keeps the day', await p.evaluate(() => !window.sunup.dialogs.open && window.sunup.state.turnover < 0 && window.sunup.state.day === 1));
// Round 3: "Sleep now?" nearly every night. With nothing ripe, thirsty, bugged or pecked at, Sleep sleeps at once.
await p.evaluate(() => {
  const st = window.sunup.state;
  for (const q of st.plots) if (q.crop) { q.crop = null; }
  st.crows = [];
  st.minute = 150;
});
await p.waitForTimeout(150);
await tapSleep();
const quiet = await p.evaluate(() => ({ open: window.sunup.dialogs.open, night: window.sunup.state.turnover >= 0 }));
check('at 8:30 am with nothing left to do, Sleep sleeps without asking', !quiet.open && quiet.night, JSON.stringify(quiet));
await p.waitForTimeout(3200);
await p.evaluate(() => { window.sunup.state.minute = 400; window.sunup.state.stamina = 80; });
// (Ripe radishes again for the after-noon check, so there is something to leave undone.)
await p.evaluate(() => { const st = window.sunup.state; const q = st.plots[5 * st.W + 2]; q.tilled = true; q.crop = { id: st.nextId++, kind: 'radish', age: 3, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day }; });
await tapSleep();
check('after noon, Sleep sleeps at once', await p.evaluate(() => !window.sunup.dialogs.open && window.sunup.state.turnover >= 0));
await p.waitForTimeout(3200);

// The seed picker opens over the left half of the screen, where the walk
// stick's capture zone is. A real tap on every seed must pick that seed.
await p.evaluate(() => {
  for (const what of ['can', 'sleep', 'coins', 'seeds']) window.sunup.input.push({ type: 'unlock', what });
});
await p.waitForTimeout(200);
const openSeeds = async () => {
  // Opening it again while it is open would close it.
  await p.evaluate(() => document.querySelector('.seedbar.hidden') && window.sunup.hud.pickTool('seeds'));
  await p.waitForTimeout(250);
  return p.evaluate(() => [...document.querySelectorAll('.seedbar .seed')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => {
    const r = e.getBoundingClientRect();
    return { crop: e.dataset.crop, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }));
};
const seeds = await openSeeds();
const picked = [];
// A pick closes the picker on a phone, so open it before each tap. Right to
// left, so every tap changes the pick (the first seed starts chosen).
for (const sd of [...seeds].reverse()) {
  await openSeeds();
  await touch('touchStart', [[sd.x, sd.y, 7]]);
  await touch('touchEnd', []);
  await p.waitForTimeout(200);
  if ((await p.evaluate(() => window.sunup.state.seed)) === sd.crop) picked.push(sd.crop);
}
check('a tap picks every seed in the picker, the stick side too', seeds.length >= 2 && picked.length === seeds.length, `${picked.length} of ${seeds.length}: ${picked.join(', ')}`);
// Round 3: "a strawberry icon once replaced the coin icon". After every pick the coin is still the coin, the seed
// chip on the Seeds tool shows the seed in hand, and no crop picture sits anywhere but the chip and the cards.
{
  const coinIcon = await p.evaluate(() => document.querySelector('.coins .ic').innerHTML);
  const marks = [];
  for (const sd of seeds) {
    await openSeeds();
    await touch('touchStart', [[sd.x, sd.y, 8]]);
    await touch('touchEnd', []);
    await p.waitForTimeout(150);
    marks.push(await p.evaluate((coin) => ({
      coin: document.querySelector('.coins .ic').innerHTML === coin,
      chip: document.querySelector('.toolbar .seedchip')?.dataset.crop === window.sunup.state.seed,
      stray: [...document.querySelectorAll('.hud svg')].filter((v) => v.closest('.seedchip, .seedbar, .blob') === null && /crop|#d9465f|#e0303f/.test(v.outerHTML)).length,
    }), coinIcon));
  }
  check('after every seed pick the coin is still the coin, and the chip shows the seed in hand', marks.every((m) => m.coin && m.chip && m.stray === 0), JSON.stringify(marks));
  // A seed the purse cannot pay for looks it.
  await p.evaluate(() => { window.sunup.state.coins = 20; });
  await openSeeds();
  await p.waitForTimeout(200);
  const poor = await p.evaluate(() => [...document.querySelectorAll('.seedbar .seed')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => ({ crop: e.dataset.crop, poor: e.classList.contains('poor'), outline: getComputedStyle(e).outlineStyle, price: getComputedStyle(e.querySelector('.pr')).color })));
  const seedCost = { radish: 10, lettuce: 15, carrot: 15, beans: 30, strawberry: 45, sunflower: 30, corn: 45, pumpkin: 80 };
  check('seed the purse cannot pay for is faded, dashed and priced in red; what it can pay for is not', poor.length > 0 && poor.every((c) => c.poor === seedCost[c.crop] > 20) && poor.filter((c) => c.poor).every((c) => c.outline === 'dashed') && new Set(poor.map((c) => c.price)).size === (poor.some((c) => c.poor) && poor.some((c) => !c.poor) ? 2 : 1), JSON.stringify(poor));
  await p.evaluate(() => { window.sunup.state.coins = 500; });
}
await p.evaluate(() => window.sunup.hud.pickTool('hands'));

// ---- round 2: taps that wait their turn, taps that take the right tool, the well, walking while acting
const ripenRow = (y, kind = 'radish', age = 3) => p.evaluate(([y, kind, age]) => {
  const st = window.sunup.state;
  for (let x = 2; x < 6; x++) {
    const q = st.plots[y * st.W + x];
    q.tilled = true;
    q.crop = { id: st.nextId++, kind, age, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
  }
}, [y, kind, age]);
const tapTile = async (x, y, id) => {
  const pt = await p.evaluate(([x, y]) => window.sunup.r3d.project(x + 0.5, y + 0.5, 0), [x, y]);
  await touch('touchStart', [[pt.x, pt.y, id]]);
  await p.waitForTimeout(40);
  await touch('touchEnd', []);
};
await p.evaluate(() => { const st = window.sunup.state; st.minute = 60; st.stamina = 100; for (const what of ['can']) if (!st.learn.includes(what)) st.learn.push(what); window.sunup.hud.pickTool('hands'); });
await ripenRow(5);
await standAt(2, 3, 's');
await p.waitForTimeout(300);
const pulled = () => p.evaluate(() => window.sunup.state.stats.harvested.radish);
let h = await pulled();
const order = [];
await p.evaluate(() => { window.__harvests = []; const d = window.sunup; const orig = d.events.push.bind(d.events); d.events.push = (e) => { if (e.type === 'harvest') window.__harvests.push(e.x); return orig(e); }; });
for (const x of [5, 4, 3]) {
  await tapTile(x, 5, 20 + x);
  await p.waitForTimeout(260);
}
await p.waitForTimeout(3000);
order.push(...(await p.evaluate(() => window.__harvests)));
check('three quick real taps on ripe radishes, 300 ms apart, harvest all three, in the order tapped', (await pulled()) - h === 3 && order.join() === '5,4,3', `${(await pulled()) - h} pulled, order ${order.join()}`);

// A ripe crop tapped with the can in hand: the tap takes the hands and harvests it.
await ripenRow(5);
await p.evaluate(() => window.sunup.hud.pickTool('can'));
await standAt(2, 3, 's');
await p.waitForTimeout(300);
h = await pulled();
await tapTile(4, 5, 30);
await p.waitForTimeout(1800);
check('a ripe radish tapped with the can in hand is harvested, and the hands come out', (await pulled()) === h + 1 && (await p.evaluate(() => window.sunup.state.tool)) === 'hands', `${(await pulled()) - h} pulled, tool ${await p.evaluate(() => window.sunup.state.tool)}`);
// With nothing to do, the act button wears the tool in hand: the can, not a hand.
await p.evaluate(() => window.sunup.hud.pickTool('can'));
await standAt(16, 3, 'e');
await p.waitForTimeout(300);
const idleIcon = await p.evaluate(() => { const b = document.querySelector('.tb-act'); return { dim: b.classList.contains('no'), html: b.querySelector('.ic').innerHTML, can: document.querySelector('.toolbar .tool[data-tool="can"] .ic').innerHTML }; });
check('with the can in hand and nothing to do, the act button shows the can', idleIcon.dim && idleIcon.html === idleIcon.can, JSON.stringify({ dim: idleIcon.dim, same: idleIcon.html === idleIcon.can }));

// The well: a tap on the ground in front of it walks there and fills the can; so does a tap on the well's drawing.
for (const [label, at] of [['the ground in front of the well', async () => p.evaluate(() => window.sunup.r3d.project(11.5, 3.5, 0))], ['the top of the well', async () => p.evaluate(() => window.sunup.r3d.project(11.5, 2.5, 1.1))]]) {
  await p.evaluate(() => { window.sunup.state.water = 0; window.sunup.hud.pickTool('can'); });
  // A few steps off, with the well on screen.
  await standAt(7, 3, 'w');
  await p.waitForTimeout(900);
  const pt = await at();
  await touch('touchStart', [[pt.x, pt.y, 40]]);
  await p.waitForTimeout(40);
  await touch('touchEnd', []);
  await p.waitForTimeout(3200);
  const w = await p.evaluate(() => window.sunup.state.water);
  check(`a tap on ${label} walks there and fills the can`, w === 12 && pt.x > 0 && pt.x < 412, `water ${w}, tapped at ${Math.round(pt.x)},${Math.round(pt.y)}`);
}

// Walking with the stick while holding Harvest: the farmer works the carrot row on the move, never standing still mid-row.
await ripenRow(6, 'carrot', 5);
await p.evaluate(() => { window.sunup.hud.pickTool('hands'); const st = window.sunup.state; for (let x = 2; x < 6; x++) st.plots[5 * st.W + x].crop = null; });
await standAt(1, 6, 'e');
await p.waitForTimeout(300);
const carrots = () => p.evaluate(() => window.sunup.state.stats.harvested.carrot);
const c0 = await carrots();
// Every 100 ms the farmer must have moved on (a stop at a plot, as before, stands still for a whole job: 350 ms).
await p.evaluate(() => { window.__still = 0; window.__last = window.sunup.state.actors[0].x; window.__probe = setInterval(() => { const f = window.sunup.state.actors[0]; if (f.x < 5.5 && f.x > 1.6 && Math.abs(f.x - window.__last) < 0.01) window.__still++; window.__last = f.x; }, 100); });
const actAt2 = await p.evaluate(() => { const r = document.querySelector('.tb-act').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await touch('touchStart', [[actAt2[0], actAt2[1], 50]]);
await p.waitForTimeout(60);
await touch('touchStart', [[actAt2[0], actAt2[1], 50], [90, 700, 51]]);
for (let i = 1; i <= 5; i++) {
  await touch('touchMove', [[actAt2[0], actAt2[1], 50], [90 + i * 12, 700, 51]]);
  await p.waitForTimeout(16);
}
for (let i = 0; i < 60 && (await p.evaluate(() => window.sunup.state.actors[0].x)) < 5.6; i++) await p.waitForTimeout(50);
await touch('touchEnd', [[actAt2[0], actAt2[1], 50]]);
await touch('touchEnd', []);
const still = await p.evaluate(() => { clearInterval(window.__probe); return window.__still; });
check('walking the row holding Harvest picks all four carrots without stopping at each one', (await carrots()) - c0 === 4 && still === 0, `${(await carrots()) - c0} picked, stood still in ${still} of the 100 ms looks`);

// ---- round 3
// The lesson pointer's edge arrow takes a tap: it walks to what it points at and does the job there (a tap there
// used to walk to the ground behind the arrow). Bugs on a crop in a far field, the farmer in the first: the pointer
// finds them with an arrow at the screen's edge.
{
  await p.evaluate(() => {
    const st = window.sunup.state;
    st.minute = 60;
    st.stamina = 100;
    st.water = 12;
    // (The far field is owned but its meadow is not the point here: the hoe's lesson is done.)
    for (const what of ['can', 'pests', 'hoe', ...['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'hoe', 'requests', 'deliver', 'choose', 'field', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'turn', 'smith', 'wide'].map((l) => `lesson:${l}`)]) if (!st.learn.includes(what)) st.learn.push(what);
    st.parcels[4].owned = true;
    const q = st.plots[6 * st.W + 14];
    q.tilled = true;
    q.wet = true;
    q.crop = { id: st.nextId++, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: 1, quality: 0, picks: 0, parched: false, planted: st.day };
    window.sunup.hud.pickTool('hands');
    window.sunup.walkAim = null;
    Object.assign(st.actors[0], { x: 2.5, y: 4.5, facing: 's', task: null, path: [] });
  });
  await p.waitForTimeout(1500);
  const arrow = await p.evaluate(() => { const e = document.querySelector('.tpoint'); const r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), over: e.classList.contains('over'), x: r.x + r.width / 2, y: r.y + r.height / 2, top: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.tpoint') !== null }; });
  // What a tap at that spot would have hit on the ground: somewhere else.
  const behind = await p.evaluate(([x, y]) => window.sunup.r3d.pick(x, y), [arrow.x, arrow.y]);
  await touch('touchStart', [[arrow.x, arrow.y, 60]]);
  await p.waitForTimeout(40);
  await touch('touchEnd', []);
  for (let i = 0; i < 80 && (await p.evaluate(() => window.sunup.state.plots[6 * 20 + 14].crop.bugs)) > 0; i++) await p.waitForTimeout(100);
  const after = await p.evaluate(() => ({ bugs: window.sunup.state.plots[6 * 20 + 14].crop.bugs, at: [window.sunup.state.actors[0].x, window.sunup.state.actors[0].y] }));
  check('bugs out of view get an edge arrow, and a tap on the arrow walks there and picks them (not to the ground behind it)', arrow.on && !arrow.over && arrow.top && (!behind || behind.x !== 14 || behind.y !== 6) && after.bugs === 0 && Math.hypot(after.at[0] - 14.5, after.at[1] - 6.5) < 1.6, JSON.stringify({ arrow, behind, after }));
  await p.screenshot({ path: '/tmp/acres-touch-edge-arrow.png' });
  await p.evaluate(() => { const st = window.sunup.state; st.parcels[4].owned = false; st.plots[6 * st.W + 14].crop = null; });
}

// The copper can, tapped: three plots along the row, inside the field; bare soil and the path are passed by, and
// bare soil never lights Water.
{
  await p.evaluate(() => {
    const st = window.sunup.state;
    st.tools.can = 1;
    st.water = 24;
    st.parcels[1].owned = true;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 11; x++) { const q = st.plots[y * st.W + x]; if (st.tiles[y * st.W + x] !== 'field') continue; q.tilled = true; q.wet = false; q.moisture = 0; q.crop = null; }
    for (const x of [3, 4, 5]) st.plots[7 * st.W + x].crop = { id: st.nextId++, kind: 'carrot', age: 1, stage: 1, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
    window.sunup.hud.pickTool('can');
    window.sunup.walkAim = null;
    Object.assign(st.actors[0], { x: 7.5, y: 4.5, facing: 's', task: null, path: [] });
    window.__water = [];
    const d = window.sunup;
    const orig = d.events.push.bind(d.events);
    d.events.push = (e) => { if (e.type === 'water') window.__water.push(`${e.x},${e.y}`); return orig(e); };
  });
  await p.waitForTimeout(900);
  await tapTile(5, 7, 61);
  await p.waitForTimeout(3000);
  const watered = await p.evaluate(() => window.__water.slice().sort());
  check('a copper can tap at the field\u2019s edge waters along the row, never the path, the next field or bare soil', watered.join(' ') === '3,7 4,7 5,7', watered.join(' '));
  await standAt(2, 4, 's');
  await p.waitForTimeout(300);
  const bareWord = await actButton();
  check('at bare soil with the can in hand the act button does not say Water', bareWord.word !== 'Water' && !bareWord.lit, JSON.stringify(bareWord));
  await p.evaluate(() => { window.sunup.state.tools.can = 0; });
}

// Fourteen quick real taps on ripe radishes, more than the old queue held: every one is harvested.
{
  await p.evaluate(() => {
    const st = window.sunup.state;
    st.stamina = 100;
    st.minute = 60;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) { const q = st.plots[y * st.W + x]; q.tilled = true; q.crop = { id: st.nextId++, kind: 'radish', age: 3, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day }; }
    window.sunup.hud.pickTool('hands');
    window.sunup.walkAim = null;
    Object.assign(st.actors[0], { x: 3.5, y: 4.5, facing: 's', task: null, path: [] });
  });
  await p.waitForTimeout(900);
  const before = await p.evaluate(() => window.sunup.state.stats.harvested.radish);
  let id = 70;
  for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) {
    if (y === 8 && x > 3) continue;
    await tapTile(x, y, id++);
    await p.waitForTimeout(60);
  }
  for (let i = 0; i < 120; i++) {
    await p.waitForTimeout(100);
    if ((await p.evaluate(() => window.sunup.state.stats.harvested.radish)) - before >= 14) break;
  }
  const got = (await p.evaluate(() => window.sunup.state.stats.harvested.radish)) - before;
  check('fourteen quick real taps are all done (the old queue dropped the thirteenth)', got === 14, `${got} of 14`);
}

// ---- round 4
{
  const tapAt = async (x, y, id) => { await touch('touchStart', [[x, y, id]]); await p.waitForTimeout(40); await touch('touchEnd', []); };
  const centre = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  // Every tool on the rack wears its name (Hoe and Build looked alike, and only the one in hand was labelled).
  await p.evaluate(() => { const st = window.sunup.state; for (const w of ['can', 'seeds', 'hoe', 'build', 'sleep', 'wide']) if (!st.learn.includes(w)) st.learn.push(w); st.learn.push('lesson:wide'); window.sunup.hud.pickTool('hands'); });
  await p.waitForTimeout(400);
  const labels = await p.evaluate(() => [...document.querySelectorAll('.toolbar .tool')].map((b) => { const l = b.querySelector('.lbl'); const r = l.getBoundingClientRect(); return { t: l.textContent, o: Number(getComputedStyle(l).opacity), w: r.width, size: parseFloat(getComputedStyle(l).fontSize), icon: b.querySelector('.ic').innerHTML }; }));
  const hoe = labels.find((l) => l.t === 'Hoe');
  const build = labels.find((l) => l.t === 'Build');
  check('every tool on the rack wears its name, and the Hoe and Build look different', labels.every((l) => l.o >= 0.8 && l.w > 10 && l.size >= 11) && !!hoe && !!build && hoe.icon !== build.icon, JSON.stringify(labels.map((l) => [l.t, l.o, Math.round(l.w)])));

  // The View button: standing in the second field, a bugged crop in the first field's left column is off screen; a real
  // tap on View shows it, and a second tap comes back close up.
  await p.evaluate(() => {
    const st = window.sunup.state;
    st.parcels[1].owned = true;
    for (let y = 5; y < 9; y++) for (let x = 7; x < 11; x++) st.plots[y * st.W + x].tilled = true;
    const q = st.plots[6 * st.W + 2];
    q.tilled = true;
    q.wet = true;
    q.crop = { id: st.nextId++, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: 1, quality: 0, picks: 0, parched: false, planted: st.day };
    st.rules.camera = 'close';
    Object.assign(st.actors[0], { x: 10.5, y: 6.5, task: null, path: [] });
    window.sunup.walkAim = null;
  });
  await p.waitForTimeout(1500);
  const seen = () => p.evaluate(() => { const q = window.sunup.r3d.project(2.5, 6.5, 0.3); return { x: Math.round(q.x), y: Math.round(q.y), on: q.x > 0 && q.x < innerWidth && q.y > 0 && q.y < innerHeight, camera: window.sunup.state.rules.camera }; });
  const closeUp = await seen();
  const vb = await centre('.topbtns .viewbtn');
  await tapAt(vb[0], vb[1], 81);
  await p.waitForTimeout(1500);
  const whole = await seen();
  await p.screenshot({ path: '/tmp/acres-touch-farm-view.png' });
  await tapAt(vb[0], vb[1], 82);
  await p.waitForTimeout(1200);
  const back = await seen();
  check('from the second field a bugged crop in the first field’s left column is off screen; a real tap on View shows it, a second comes back', !closeUp.on && whole.on && whole.camera === 'wide' && back.camera === 'close', JSON.stringify({ closeUp, whole, back }));

  // A tap on a "Too late" seed puts the seed away: the picker closes, the hands come out, and the next plot tap plants nothing.
  await p.evaluate(() => { const st = window.sunup.state; st.day = 8; st.coins = 300; st.minute = 60; st.stamina = 100; st.plots[6 * st.W + 2].crop = null; for (let x = 2; x < 6; x++) { const q = st.plots[7 * st.W + x]; q.crop = null; q.tilled = true; } window.sunup.hud.pickTool('hands'); Object.assign(st.actors[0], { x: 3.5, y: 4.5, task: null, path: [] }); window.sunup.walkAim = null; });
  await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelector('.seedbar.hidden') && window.sunup.hud.pickTool('seeds'));
  await p.waitForTimeout(300);
  let card = await centre('.seedbar .seed[data-crop="radish"]');
  await tapAt(card[0], card[1], 83);
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('.seedbar.hidden') && window.sunup.hud.pickTool('seeds'));
  await p.waitForTimeout(300);
  card = await centre('.seedbar .seed[data-crop="carrot"]');
  await tapAt(card[0], card[1], 84);
  await p.waitForTimeout(400);
  const late = await p.evaluate(() => ({ picker: !document.querySelector('.seedbar').classList.contains('hidden'), tool: window.sunup.state.tool, toast: [...document.querySelectorAll('.toasts .toast')].map((t) => t.textContent).join(' | ') }));
  const planted0 = await p.evaluate(() => window.sunup.state.plots.filter((q) => q.crop).length);
  const coins0 = await p.evaluate(() => window.sunup.state.coins);
  const plotPt = await p.evaluate(() => window.sunup.r3d.project(3.5, 7.5, 0));
  await tapAt(plotPt.x, plotPt.y, 85);
  await p.waitForTimeout(2000);
  const after = await p.evaluate(() => ({ planted: window.sunup.state.plots.filter((q) => q.crop).length, coins: window.sunup.state.coins }));
  check('a tap on a "Too late" seed closes the picker and puts the seed away: the next plot tap plants nothing', !late.picker && late.tool === 'hands' && /Too late/.test(late.toast) && after.planted === planted0 && after.coins === coins0, JSON.stringify({ late, planted0, after, coins0 }));

  // The can in hand, a dry bugged crop tapped: the bugs come off, nothing is watered.
  await p.evaluate(() => {
    const st = window.sunup.state;
    st.water = 12;
    const q = st.plots[6 * st.W + 4];
    q.tilled = true;
    q.wet = false;
    q.moisture = 0;
    q.crop = { id: st.nextId++, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: 1, quality: 0, picks: 0, parched: false, planted: st.day };
    window.sunup.hud.pickTool('can');
    Object.assign(st.actors[0], { x: 4.5, y: 4.5, task: null, path: [] });
    window.sunup.walkAim = null;
    window.__r4 = [];
    const d = window.sunup;
    const orig = d.events.push.bind(d.events);
    d.events.push = (e) => { if (e.type === 'water' || e.type === 'tend') window.__r4.push(e.type); return orig(e); };
  });
  await p.waitForTimeout(700);
  const bug = await p.evaluate(() => window.sunup.r3d.project(4.5, 6.5, 0));
  await tapAt(bug.x, bug.y, 86);
  await p.waitForTimeout(1800);
  const bugAfter = await p.evaluate(() => ({ bugs: window.sunup.state.plots[6 * window.sunup.state.W + 4].crop.bugs, events: window.__r4, tool: window.sunup.state.tool }));
  check('a tap with the can on a dry, bugged crop picks the bugs off and waters nothing', bugAfter.bugs === 0 && bugAfter.events.includes('tend') && !bugAfter.events.includes('water'), JSON.stringify(bugAfter));

  // "Already watered" over a plot at the screen's edge stays whole on screen.
  await p.evaluate(() => {
    const st = window.sunup.state;
    const q = st.plots[6 * st.W + 2];
    q.tilled = true;
    q.wet = true;
    q.moisture = 2;
    q.crop = { id: st.nextId++, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
    window.sunup.hud.pickTool('can');
    Object.assign(st.actors[0], { x: 2.5, y: 5.5, facing: 's', task: null, path: [] });
    window.sunup.walkAim = null;
  });
  await p.waitForTimeout(800);
  const edge = await p.evaluate(() => window.sunup.r3d.project(2.5, 6.5, 0));
  await tapAt(edge.x, edge.y, 87);
  await p.waitForTimeout(250);
  const fl = await p.evaluate(() => [...document.querySelectorAll('.floaters .floater')].map((f) => { const r = f.getBoundingClientRect(); return { t: f.textContent, l: Math.round(r.left), r: Math.round(r.right) }; }));
  const aw = fl.find((f) => f.t === 'Already watered');
  check('"Already watered" over a plot at the screen’s edge stays whole on screen', !!aw && aw.l >= 0 && aw.r <= 412 && edge.x < 60, JSON.stringify({ fl, at: Math.round(edge.x) }));
  await p.evaluate(() => window.sunup.hud.pickTool('hands'));
}

// A save from the old crew mode brings a farm hand along; Sunup is worked alone, so the hand has gone home on load.
await p.evaluate(() => {
  const s = window.sunup.state;
  const f = s.actors[0];
  s.actors.push({ ...f, id: 9999, role: 'hand', name: 'Ada', tint: 0, away: false, task: null, path: [], job: null });
  window.sunup.save();
});
await p.goto(`${base}/?game=homestead`);
await p.waitForFunction(() => window.sunup && window.sunup.frames > 10, null, { timeout: 30000 });
const roles = await p.evaluate(() => window.sunup.state.actors.map((a) => a.role).join(','));
check('a farm hand from an old crew save is gone after loading', roles === 'farmer', roles);
await p.screenshot({ path: '/tmp/acres-touch-walk.png' });
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `TOUCH FAILED (${failed})` : 'TOUCH OK');
process.exit(failed ? 1 : 0);
