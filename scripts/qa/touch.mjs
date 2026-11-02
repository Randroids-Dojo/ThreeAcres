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
// Round 5: a real tap on the plot under the scarecrow lesson's chevron (drawn
// half a tile above its target) does that plot's own job: no Build tool, no
// scarecrow, no question; a tap inside the target tile asks first, Not now
// does nothing, yes builds one, once, and the tool in hand stays; five taps
// after it plant five seeds and build nothing; with no coins a tap on the
// pointer says what a scarecrow costs and nothing else happens (no tool
// change, no walk), and the line steps aside until one can be paid for; from
// the second field and the well's front the first field's left column is on
// screen and a real tap there works; at no stamina one refusal shows and the
// act button is dim.
// Round 6: the seed picker open, a real tap on a thirsty crop takes the can
// and closes the picker for good, so the lesson pointer comes back (it stayed
// hidden until Escape, which a phone has not); the words over a harvested
// crop a request wants sit on a paper chip that reads on dark soil (contrast
// measured) and stay up past 1.5 s; Sleep after noon asks while bugs are on
// the farm and says they spread tonight; a crow that takes a crop by day says
// so in a toast.
// Round 7: Sleep before evening always asks (with only the hour when nothing
// waits) and after 6 pm with nothing to do sleeps at once; a tap on a "Too
// late" seed says why in the open picker and keeps the seed in hand; the day
// card says the season's length; a real tap on a ripe crop pays at once with
// a rise of coins over the crate; a toast of the day is gone by nightfall.
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
// Round 7: before evening Sleep always asks, even with nothing left to do (a stray press put the farmer to bed at 3:27
// pm), and says only the hour. After 6 pm with nothing ripe, thirsty, bugged or pecked at, Sleep sleeps at once.
await p.evaluate(() => {
  const st = window.sunup.state;
  for (const q of st.plots) if (q.crop) { q.crop = null; }
  st.crows = [];
  st.minute = 150;
});
await p.waitForTimeout(150);
await tapSleep();
const quiet = await p.evaluate(() => ({ open: window.sunup.dialogs.open, night: window.sunup.state.turnover >= 0, text: document.querySelector('.dialog.on p')?.textContent ?? '' }));
check('round 7: at 8:30 am with nothing left to do, Sleep still asks, with only the hour', quiet.open && !quiet.night && /^It is 8:\d\d am\.$/.test(quiet.text), JSON.stringify(quiet));
const notNow2 = await p.evaluate(() => { const b = [...document.querySelectorAll('.dialog .ask .btn')].find((e) => e.textContent === 'Not now'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await touch('touchStart', [[notNow2[0], notNow2[1], 13]]);
await touch('touchEnd', []);
await p.waitForTimeout(400);
await p.evaluate(() => { window.sunup.state.minute = 13 * 60 + 10; window.sunup.state.stamina = 80; });
await p.waitForTimeout(150);
await tapSleep();
check('after 6 pm with nothing left to do, Sleep sleeps at once', await p.evaluate(() => !window.sunup.dialogs.open && window.sunup.state.turnover >= 0));
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
    for (const what of ['can', 'pests', 'hoe', ...['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'hoe', 'requests', 'sowfor', 'deliver', 'choose', 'field', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'turn', 'smith', 'wide'].map((l) => `lesson:${l}`)]) if (!st.learn.includes(what)) st.learn.push(what);
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

  // The View button: standing in the far east field, a bugged crop in the first field's left column is off screen; a
  // real tap on View shows it, and a second tap comes back close up. (Round 5: from the second field it is on screen.)
  await p.evaluate(() => {
    const st = window.sunup.state;
    st.parcels[1].owned = true;
    for (let y = 5; y < 9; y++) for (let x = 7; x < 11; x++) st.plots[y * st.W + x].tilled = true;
    const q = st.plots[6 * st.W + 2];
    q.tilled = true;
    q.wet = true;
    q.crop = { id: st.nextId++, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: 1, quality: 0, picks: 0, parched: false, planted: st.day };
    st.rules.camera = 'close';
    Object.assign(st.actors[0], { x: 14.5, y: 6.5, task: null, path: [] });
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
  check('from the far east field a bugged crop in the first field’s left column is off screen; a real tap on View shows it, a second comes back', !closeUp.on && whole.on && whole.camera === 'wide' && back.camera === 'close', JSON.stringify({ closeUp, whole, back }));

  // Round 7: a tap on a "Too late" seed says why in the picker itself, which stays open, and the seed in hand stays (the
  // sixth round closed the picker and put the hands in hand with no word the tester saw).
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
  const late = await p.evaluate(() => {
    const m = document.querySelector('.seedbar .pickmsg');
    const r = m?.getBoundingClientRect();
    const bar = document.querySelector('.seedbar').getBoundingClientRect();
    return { picker: !document.querySelector('.seedbar').classList.contains('hidden'), tool: window.sunup.state.tool, seed: window.sunup.state.seed, word: m?.classList.contains('on') ? m.textContent : '', inBar: !!r && r.width > 0 && r.top >= bar.top - 1 && r.bottom <= bar.bottom + 1, day: document.querySelector('.daycard .date')?.textContent ?? '' };
  });
  check('round 7: a tap on a "Too late" seed says why in the open picker ("Carrots won’t ripen before summer."), and keeps the seed in hand', late.picker && late.tool === 'seeds' && late.seed === 'radish' && late.word === 'Carrots won’t ripen before summer.' && late.inBar, JSON.stringify(late));
  check('round 7: the day card gives the season’s length ("Spring 8 of 10")', late.day === 'Spring 8 of 10', late.day);
  await p.evaluate(() => window.sunup.hud.closePicker());

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

// ---- round 5
{
  const tapAt = async (x, y, id) => { await touch('touchStart', [[x, y, id]]); await p.waitForTimeout(40); await touch('touchEnd', []); };
  const centre = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  const tilePt = (x, y) => p.evaluate(([x, y]) => window.sunup.r3d.project(x + 0.5, y + 0.5, 0), [x, y]);
  // The scarecrow lesson's morning: field 1 growing carrots, its plot (3,7) bare, a ripe radish just north of it on
  // (3,6), where the chevron is drawn; field 2 bare for sowing. Seeds in hand, as the tester had.
  const scarecrowMorning = (coins) => p.evaluate((coins) => {
    const st = window.sunup.state;
    const lessons = ['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'stamina', 'hoe', 'requests', 'sowfor', 'deliver', 'choose', 'field', 'pests', 'bugs', 'turn', 'smith', 'wide'];
    for (const l of lessons) if (!st.learn.includes(`lesson:${l}`)) st.learn.push(`lesson:${l}`);
    for (const w of ['can', 'seeds', 'coins', 'stamina', 'sleep', 'board', 'requests', 'pests', 'hoe', 'wide']) if (!st.learn.includes(w)) st.learn.push(w);
    st.learn = st.learn.filter((w) => w !== 'lesson:scarecrow' && w !== 'lesson:forecast' && w !== 'lesson:sprinkler' && w !== 'build' && w !== 'sprinkler');
    st.day = 7;
    st.learnCount['done:pests'] = 6;
    // (A second run of the lesson on the same page: its counts start again.)
    for (const k of ['build', 'build:scarecrow', 'seen:scarecrow', 'seenOn:scarecrow']) delete st.learnCount[k];
    st.coins = coins;
    st.stamina = 100;
    st.minute = 60;
    st.weather = 'sun';
    st.orders = [];
    st.crows = [];
    st.crowPlan = [];
    st.builds = [];
    st.parcels[1].owned = true;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 11; x++) {
      const q = st.plots[y * st.W + x];
      if (st.tiles[y * st.W + x] !== 'field') continue;
      q.tilled = true;
      q.wet = true;
      q.moisture = 2;
      q.crop = x <= 5 ? { id: st.nextId++, kind: 'carrot', age: 2, stage: 2, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day } : null;
    }
    st.plots[7 * st.W + 3].crop = null;
    st.plots[6 * st.W + 3].crop = { id: st.nextId++, kind: 'radish', age: 3, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
    st.seed = 'radish';
    st.tool = 'seeds';
    st.rules.camera = 'close';
    Object.assign(st.actors[0], { x: 3.5, y: 3.5, facing: 's', task: null, path: [] });
    window.sunup.walkAim = null;
    window.sunup.dialogs.close(true);
  }, coins);
  const where = () => p.evaluate(() => {
    const st = window.sunup.state;
    const e = document.querySelector('.tpoint');
    const r = e.getBoundingClientRect();
    const t = window.sunup.hud['pointAt'];
    return { line: document.querySelector('.hint.on')?.textContent ?? '', on: e.classList.contains('on'), over: e.classList.contains('over'), x: r.x + r.width / 2, y: r.y + r.height / 2, target: t ? [Math.floor(t.x), Math.floor(t.y)] : null, tool: st.tool, builds: st.builds.map((b) => `${b.kind}@${b.x},${b.y}`), coins: st.coins, dialog: window.sunup.dialogs.open, farmer: [+st.actors[0].x.toFixed(2), +st.actors[0].y.toFixed(2)], radishes: st.stats.harvested.radish };
  });
  await scarecrowMorning(220);
  await p.waitForTimeout(1200);
  let w0 = await where();
  // The plot under the chevron's drawn position: the one north of the target.
  const under = await p.evaluate(([x, y]) => window.sunup.r3d.pick(x, y), [w0.x, w0.y]);
  check('the scarecrow lesson points at bare soil (3,7) with its chevron drawn over the plot to the north (3,6)', w0.line === 'Build a scarecrow on bare soil.' && w0.on && w0.over && w0.target?.join() === '3,7' && under?.x === 3 && under?.y === 6, JSON.stringify({ w0, under }));
  await tapAt(w0.x, w0.y, 90);
  await p.waitForTimeout(2200);
  let w1 = await where();
  // (Round 7: the radish is paid for as it goes into the crate.)
  check('P0: a real tap on the plot under the chevron does that plot’s own job: its radish is harvested, no Build tool, no scarecrow, no question', w1.radishes === w0.radishes + 1 && w1.builds.length === 0 && w1.tool !== 'build' && !w1.dialog && w1.coins === w0.coins + 30, JSON.stringify({ before: w0, after: w1 }));
  await p.screenshot({ path: '/tmp/acres-touch-r5-under-chevron.png' });
  // A real tap inside the target tile asks first; Not now does nothing at all. (With the radish picked, its plot is the
  // nearest bare soil in the field's middle, so the pointer may have moved there: tap wherever it points now.)
  await p.evaluate(() => window.sunup.input.push({ type: 'tool', tool: 'seeds' }));
  await p.waitForTimeout(400);
  const aim = (await where()).target;
  const tgt = await tilePt(aim[0], aim[1]);
  const toolBefore = (await where()).tool;
  const posBefore = (await where()).farmer;
  await tapAt(tgt.x, tgt.y, 91);
  await p.waitForTimeout(500);
  let w2 = await where();
  const ask = await p.evaluate(() => ({ title: document.querySelector('.dialog.on h2')?.textContent ?? '', text: document.querySelector('.dialog.on p')?.textContent ?? '' }));
  check('a real tap inside the target tile asks before it builds ("Build a scarecrow?", 40 coins, what it does)', w2.dialog && ask.title === 'Build a scarecrow?' && /^40 coins\. .+You have 250\.$/.test(ask.text) && w2.builds.length === 0, JSON.stringify({ ask, w2 }));
  await p.screenshot({ path: '/tmp/acres-touch-r5-ask.png' });
  const no = await p.evaluate(() => { const b = [...document.querySelectorAll('.dialog.on .ask .btn')].find((e) => e.textContent === 'Not now'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  if (no) await tapAt(no[0], no[1], 92);
  await p.waitForTimeout(900);
  let w3 = await where();
  check('Not now does nothing: no scarecrow, no walk, the same tool in hand', !w3.dialog && w3.builds.length === 0 && w3.tool === toolBefore && Math.hypot(w3.farmer[0] - posBefore[0], w3.farmer[1] - posBefore[1]) < 0.05, JSON.stringify({ w3, posBefore, toolBefore }));
  // Yes builds one, once, and the tool in hand stays in hand.
  await tapAt(tgt.x, tgt.y, 93);
  await p.waitForTimeout(500);
  const yes = await centre('.dialog.on .ask .btn.primary');
  if (yes) await tapAt(yes[0], yes[1], 94);
  for (let i = 0; i < 40 && !(await p.evaluate(() => window.sunup.state.builds.length)); i++) await p.waitForTimeout(100);
  await p.waitForTimeout(500);
  let w4 = await where();
  check('yes builds one scarecrow on the target (40 coins), the seeds stay in hand, and the lesson ends', w4.builds.join() === `scarecrow@${aim[0]},${aim[1]}` && w4.coins === w0.coins + 30 - 40 && w4.tool === 'seeds' && (await p.evaluate(() => window.sunup.state.learn.includes('lesson:scarecrow'))), JSON.stringify({ w4, aim }));
  // Never a chain: five more taps on bare soil plant five radishes and build nothing (five taps built five scarecrows).
  for (const [x, y, id] of [[7, 6, 95], [8, 6, 96], [9, 6, 97], [10, 6, 98], [7, 7, 99]]) {
    const q = await tilePt(x, y);
    await tapAt(q.x, q.y, id);
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(4500);
  const chain = await p.evaluate(() => { const st = window.sunup.state; return { builds: st.builds.length, sown: [[7, 6], [8, 6], [9, 6], [10, 6], [7, 7]].filter(([x, y]) => st.plots[y * st.W + x].crop?.kind === 'radish').length, coins: st.coins, tool: st.tool }; });
  check('five taps on bare soil after it sow five radishes (50 coins) and build nothing', chain.builds === 1 && chain.sown === 5 && chain.coins === w4.coins - 50 && chain.tool === 'seeds', JSON.stringify(chain));
  await p.screenshot({ path: '/tmp/acres-touch-r5-after.png' });

  // With no coins, a tap on the pointer says what a scarecrow costs, and nothing else happens: no tool change, no walk.
  await scarecrowMorning(220);
  await p.waitForTimeout(1200);
  w0 = await where();
  const tp = await tilePt(3, 7);
  // (The coins go and the tap lands in the same moment, before the line can step aside.)
  await p.evaluate(([x, y]) => { window.sunup.state.coins = 0; window.sunup.input.tapScreen(x, y); }, [tp.x, tp.y]);
  await p.waitForTimeout(800);
  w1 = await where();
  const said = await p.evaluate(() => [...document.querySelectorAll('.toasts .toast')].map((t) => t.textContent));
  check('a pointer tap with no coins says "A scarecrow costs 40. You have 0." and does nothing else', said.some((t) => t === 'A scarecrow costs 40. You have 0.') && w1.tool === w0.tool && w1.builds.length === 0 && !w1.dialog && Math.hypot(w1.farmer[0] - w0.farmer[0], w1.farmer[1] - w0.farmer[1]) < 0.05, JSON.stringify({ said, w0, w1 }));
  check('and with no coins the scarecrow line and its pointer step aside (no "Sleep to sell the crate")', !/[Ss]carecrow|Sleep/.test(w1.line) && !(w1.on && w1.target?.join() === '3,7'), JSON.stringify(w1));
  // The edge arrow is the pointer itself: with no coins, a tap on it says so too.
  await p.evaluate(() => { const st = window.sunup.state; st.coins = 220; Object.assign(st.actors[0], { x: 17.5, y: 3.5, task: null, path: [] }); });
  await p.waitForTimeout(1500);
  const edge = await where();
  await p.evaluate(() => { window.sunup.state.coins = 0; document.querySelector('.tpoint').click(); });
  await p.waitForTimeout(500);
  const edgeAfter = await where();
  const said2 = await p.evaluate(() => [...document.querySelectorAll('.toasts .toast')].map((t) => t.textContent));
  check('the edge arrow with no coins says what it costs too, and nothing walks or changes tools', edge.on && !edge.over && said2.filter((t) => t === 'A scarecrow costs 40. You have 0.').length >= 1 && edgeAfter.tool === edge.tool && !edgeAfter.dialog && Math.hypot(edgeAfter.farmer[0] - edge.farmer[0], edgeAfter.farmer[1] - edge.farmer[1]) < 0.05, JSON.stringify({ edge, edgeAfter, said2 }));

  // P3: from the second field and from the well's front, the first field's left column is on screen and a real tap
  // there works (a ripe radish on it is harvested).
  for (const [fx, fy, label] of [[10.5, 6.5, 'the second field'], [11.5, 3.5, 'the well’s front']]) {
    await p.evaluate(([fx, fy]) => {
      const st = window.sunup.state;
      st.coins = 200;
      st.stamina = 100;
      const q = st.plots[7 * st.W + 2];
      q.tilled = true;
      q.crop = { id: st.nextId++, kind: 'radish', age: 3, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
      st.rules.camera = 'close';
      window.sunup.input.push({ type: 'tool', tool: 'hands' });
      Object.assign(st.actors[0], { x: fx, y: fy, task: null, path: [] });
      window.sunup.walkAim = null;
    }, [fx, fy]);
    await p.waitForTimeout(1500);
    const q = await tilePt(2, 7);
    const r0 = await p.evaluate(() => window.sunup.state.stats.harvested.radish);
    await tapAt(q.x, q.y, 100);
    await p.waitForTimeout(3500);
    const r1 = await p.evaluate(() => window.sunup.state.stats.harvested.radish);
    check(`from ${label}, the first field’s left column is on screen and a real tap there harvests`, q.x > 8 && r1 === r0 + 1, JSON.stringify({ at: [Math.round(q.x), Math.round(q.y)], r0, r1 }));
  }

  // P2: at no stamina, one refusal shows, and the act button is dim and wordless (it stayed lit with Water).
  await p.evaluate(() => {
    const st = window.sunup.state;
    for (let x = 2; x < 6; x++) { const q = st.plots[6 * st.W + x]; q.tilled = true; q.wet = false; q.moisture = 0; q.crop = { id: st.nextId++, kind: 'carrot', age: 1, stage: 1, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day }; }
    st.water = 12;
    st.stamina = 0;
    window.sunup.input.push({ type: 'tool', tool: 'can' });
    Object.assign(st.actors[0], { x: 3.5, y: 5.5, facing: 's', task: null, path: [] });
    window.sunup.walkAim = null;
  });
  await p.waitForTimeout(500);
  const dim = await actButton();
  for (const [x, id] of [[2, 101], [3, 102], [4, 103], [5, 104]]) {
    const q = await tilePt(x, 6);
    await tapAt(q.x, q.y, id);
    await p.waitForTimeout(60);
  }
  await p.waitForTimeout(300);
  const refusals = await p.evaluate(() => [...document.querySelectorAll('.floaters .floater.no')].map((f) => f.textContent));
  check('at no stamina: one refusal on screen, and the act button is dim and wordless over a thirsty crop', refusals.length === 1 && /Too tired/.test(refusals[0]) && !dim.lit && dim.word === '', JSON.stringify({ refusals, dim }));
  await p.evaluate(() => { window.sunup.state.stamina = 100; window.sunup.input.push({ type: 'tool', tool: 'hands' }); });
}

// ---- round 6
{
  const tapAt = async (x, y, id) => { await touch('touchStart', [[x, y, id]]); await p.waitForTimeout(40); await touch('touchEnd', []); };
  const centre = (sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  const tilePt = (x, y) => p.evaluate(([x, y]) => window.sunup.r3d.project(x + 0.5, y + 0.5, 0), [x, y]);
  // The water lesson's morning: the can and the seeds on the rack, carrots thirsty in row 6, the line pointing at one.
  await p.evaluate(() => {
    const st = window.sunup.state;
    // (Lessons later than the water lesson count as done, so the water lesson is the one up.)
    st.learn = ['lesson:pull', 'can', 'seeds', 'coins', 'sleep', ...['scarecrow', 'forecast', 'sprinkler', 'pests', 'bugs', 'turn', 'smith', 'wide', 'field', 'choose', 'deliver', 'sowfor', 'requests', 'hoe', 'stamina'].map((l) => `lesson:${l}`)];
    st.learnCount = {};
    Object.assign(st, { day: 2, minute: 60, coins: 100, stamina: 100, water: 12, weather: 'sun', orders: [], crows: [], crowPlan: [], builds: [] });
    st.parcels.forEach((pc, i) => (pc.owned = i === 0));
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) {
      const q = st.plots[y * st.W + x];
      q.tilled = true;
      q.wet = false;
      q.moisture = 0;
      q.crop = y === 6 ? { id: st.nextId++, kind: 'carrot', age: 1, stage: 1, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: 1 } : null;
    }
    st.tool = 'hands';
    st.rules.camera = 'close';
    Object.assign(st.actors[0], { x: 3.5, y: 4.5, facing: 's', task: null, path: [] });
    window.sunup.walkAim = null;
    window.sunup.dialogs.close(true);
  });
  await p.waitForTimeout(1200);
  const pickerState = () => p.evaluate(() => ({ line: document.querySelector('.hint.on')?.textContent ?? '', picking: window.sunup.hud.picking, open: window.sunup.hud['seedOpen'], bar: !document.querySelector('.seedbar').classList.contains('hidden'), pointer: document.querySelector('.tpoint').classList.contains('on'), tool: window.sunup.state.tool, watered: window.sunup.state.plots.filter((q) => q.crop && q.wet).length }));
  const st0 = await pickerState();
  const seedsBtn = await centre('.toolbar .tool[data-tool="seeds"]');
  await tapAt(seedsBtn[0], seedsBtn[1], 120);
  await p.waitForTimeout(400);
  const st1 = await pickerState();
  const carrot = await tilePt(4, 6);
  await tapAt(carrot.x, carrot.y, 121);
  await p.waitForTimeout(1800);
  const st2 = await pickerState();
  check('round 6: Seeds open, a real tap on a thirsty carrot takes the can, waters it, and closes the picker for good: the pointer is back', st0.pointer && st1.bar && !st1.pointer && st2.tool === 'can' && st2.watered >= 1 && !st2.bar && !st2.open && !st2.picking && st2.pointer && /water/i.test(st2.line), JSON.stringify({ st0, st1, st2 }));

  // A crop sown for a request the player took, ripe: a real tap harvests it, and the words over it sit on a chip.
  const rid = await p.evaluate(() => {
    const st = window.sunup.state;
    const id = st.nextId++;
    st.orders = [{ id, who: 'Old Tamsin', items: [{ crop: 'radish', n: 3 }], reward: 135, rep: 1, due: st.day + 3, sowBy: st.day, made: st.day, seen: true, kind: 'easy', got: 0 }];
    for (const x of [2, 3, 4]) st.plots[7 * st.W + x].crop = { id: st.nextId++, kind: 'radish', age: 3, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day - 3, for: id };
    st.tool = 'hands';
    Object.assign(st.actors[0], { x: 3.5, y: 4.5, facing: 's', task: null, path: [] });
    return id;
  });
  await p.waitForTimeout(300);
  const rad = await tilePt(2, 7);
  await tapAt(rad.x, rad.y, 122);
  let chip = null;
  for (let k = 0; k < 40 && !chip; k++) {
    await p.waitForTimeout(60);
    chip = await p.evaluate(() => {
      const f = [...document.querySelectorAll('.floaters .floater:not(.no)')].find((e) => /radish/.test(e.textContent));
      if (!f) return null;
      const cs = getComputedStyle(f);
      return { text: f.textContent, color: cs.color, bg: cs.backgroundColor, born: performance.now() };
    });
  }
  await p.waitForTimeout(1500);
  const still = await p.evaluate(() => { const f = [...document.querySelectorAll('.floaters .floater:not(.no)')].find((e) => /radish/.test(e.textContent)); return f ? Number(getComputedStyle(f).opacity) : 0; });
  // WCAG contrast of the words against the chip they sit on (the chip is near opaque, so the soil under it does not matter).
  const rgb = (c) => (c?.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const fg = rgb(chip?.color);
  const bg = rgb(chip?.bg);
  const ratio = chip ? (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05) : 0;
  check('round 6: "1 of 3 radishes" over a harvested crop sits on a paper chip: contrast 7 or more, chip near opaque, still up after 1.5 s', !!chip && /^1 of 3 radishes$/.test(chip.text) && ratio >= 7 && (bg[3] ?? 1) >= 0.9 && still >= 0.9, JSON.stringify({ chip, ratio: +ratio.toFixed(1), still, rid }));

  // After noon with bugs on a crop: Sleep asks, and says they spread tonight (the tester slept early and lost crops).
  await p.evaluate(() => {
    const st = window.sunup.state;
    st.learn.push('lesson:water', 'lesson:sleep', 'lesson:well', 'lesson:plant', 'pests', 'lesson:bugs');
    st.orders = [];
    st.minute = 700;
    st.stamina = 60;
    for (const q of st.plots) if (q.crop && q.crop.stage < 4) q.wet = true;
    st.plots[6 * st.W + 2].crop.bugs = 1;
    window.sunup.dialogs.close(true);
  });
  await p.waitForTimeout(300);
  const sleepBtn = await centre('.toolbar .tool.act');
  await tapAt(sleepBtn[0], sleepBtn[1], 123);
  await p.waitForTimeout(500);
  const ask = await p.evaluate(() => ({ open: window.sunup.dialogs.open, title: document.querySelector('.dialog h2')?.textContent ?? '', text: document.querySelector('.dialog p')?.textContent ?? '', turnover: window.sunup.state.turnover }));
  check('round 6: Sleep at 5:40 pm with bugs on the farm asks first, and says bugs spread tonight', ask.open && ask.title === 'Sleep now?' && /Bugs left on crops spread tonight\./.test(ask.text) && !/only/.test(ask.text) && ask.turnover < 0, JSON.stringify(ask));
  const notNow = await p.evaluate(() => { const b = [...document.querySelectorAll('.dialog .ask .btn')].find((e) => e.textContent === 'Not now'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await tapAt(notNow[0], notNow[1], 124);
  await p.waitForTimeout(400);
  // A crow that eats by day, far from the farmer: a toast says so.
  await p.evaluate(() => {
    const st = window.sunup.state;
    st.plots[6 * st.W + 2].crop.bugs = 0;
    st.learn.push('lesson:pests');
    Object.assign(st.actors[0], { x: 17.5, y: 3.5, task: null, path: [] });
    st.crows.push({ id: st.nextId++, x: 5, y: 6, fromX: -3, fromY: 4, phase: 'peck', t: 9999 });
  });
  await p.waitForTimeout(700);
  const crowToast = await p.evaluate(() => ({ toasts: [...document.querySelectorAll('.toasts .toast')].map((t) => t.textContent), eaten: window.sunup.state.eatenToday ?? 0 }));
  check('round 6: a crow that takes a crop by day says so, and it is counted for the morning card', crowToast.toasts.includes('A crow took a carrot.') && crowToast.eaten === 1, JSON.stringify(crowToast));
  await p.evaluate(() => { window.sunup.state.minute = 60; window.sunup.input.push({ type: 'tool', tool: 'hands' }); });

  // Round 7: a crop is paid for the moment it goes into the crate. A real tap on a ripe radish by the yard: the coins
  // count at once, and a small rise of coins shows over the crate as the crop lands.
  await p.evaluate(() => {
    const st = window.sunup.state;
    window.sunup.dialogs.close(true);
    st.rules.camera = 'close';
    for (const x of [2, 3, 4, 5]) {
      const q = st.plots[5 * st.W + x];
      q.tilled = true;
      q.crop = { id: st.nextId++, kind: 'radish', age: 3, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: st.day };
    }
    Object.assign(st.actors[0], { x: 4.5, y: 3.5, facing: 's', task: null, path: [] });
    st.crows = [];
  });
  await p.waitForTimeout(900);
  const pay0 = await p.evaluate(() => window.sunup.state.coins);
  const ripe7 = await tilePt(4, 5);
  await tapAt(ripe7.x, ripe7.y, 125);
  let paidAt = -1;
  const tapT = Date.now();
  for (let i = 0; i < 30 && paidAt < 0; i++) {
    if ((await p.evaluate(() => window.sunup.state.coins)) > pay0) paidAt = Date.now() - tapT;
    else await p.waitForTimeout(50);
  }
  let rise = null;
  for (let i = 0; i < 30 && !rise; i++) {
    rise = await p.evaluate(() => {
      const f = document.querySelector('.floaters .floater.coin');
      if (!f) return null;
      const r = f.getBoundingClientRect();
      const c = window.sunup.r3d.project(5.5, 2.5, 0.9);
      return { text: f.textContent, x: r.x + r.width / 2, y: r.y + r.height, crate: c, box: document.querySelector('.coins .num')?.textContent };
    });
    if (!rise) await p.waitForTimeout(60);
  }
  const pay1 = await p.evaluate(() => window.sunup.state.coins);
  check('round 7: a real tap on a ripe radish pays at once (30 coins, counted on the coin box)', pay1 === pay0 + 30 && paidAt >= 0 && paidAt < 1200, JSON.stringify({ pay0, pay1, paidAt }));
  check('round 7: a small rise of coins (+30) shows over the crate as the crop lands', !!rise && rise.text === '+30' && Math.abs(rise.x - rise.crate.x) < 40 && Math.abs(rise.y - rise.crate.y) < 70, JSON.stringify(rise));

  // Round 7: words of the day go with it: a let-go note does not stay up through the night onto the morning card.
  await p.evaluate(() => { window.sunup.hud.toast('Old Tamsin will find lettuces elsewhere.', '', 2800); window.sunup.state.minute = 13 * 60 + 30; window.sunup.input.push({ type: 'sleep' }); });
  await p.waitForTimeout(300);
  const overnight = await p.evaluate(() => [...document.querySelectorAll('.toasts .toast')].map((t) => t.textContent));
  check('round 7: a toast of the day is gone once night falls', !overnight.some((t) => /elsewhere/.test(t)), JSON.stringify(overnight));
  await p.waitForFunction(() => window.sunup.state.turnover < 0, null, { timeout: 10000 });
  await p.waitForTimeout(400);
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
