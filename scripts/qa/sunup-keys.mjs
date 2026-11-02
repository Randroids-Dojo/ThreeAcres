// Sunup on a desktop keyboard (round 7). The seventh playtest's Tab left the
// keyboard on Sleep; walking with WASD did not take it off, and Space then put
// the farmer to bed at 3:27 pm with no question, twice. Space at the well with
// the hands did nothing, the well sat just off screen from the house, and the
// first line did not name the keys.
// Checks, at 1280 by 800 with a real keyboard and mouse:
//   - the first line names the keys (WASD and Space);
//   - Tab onto Sleep, walk with WASD: the focus leaves the button and the farmer walks;
//     Space then acts on the farm and the day goes on;
//   - Tab onto Sleep, Space straight away: the day goes on, the focus is off the button;
//   - Tab onto Sleep, Enter: the question opens ("Sleep now? It is 3:27 pm."), Escape closes it, the day goes on;
//   - a mouse click on a HUD button leaves no focus on it; Space after it acts on the farm;
//   - the sleep question is short (eleven words or fewer) and asks before evening with nothing left to do;
//     after 6 pm with nothing to do, Enter sleeps without a question;
//   - Space facing the well with the hands in hand fills the can;
//   - from the house, with the well lesson up, the well it points at is on screen.
// node scripts/qa/sunup-keys.mjs [url]
import { chromium } from 'playwright-core';

const base = process.argv[2] && /^https?:/.test(process.argv[2]) ? process.argv[2].replace(/\/$/, '') : 'http://localhost:5247';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const S = () =>
  p.evaluate(() => {
    const s = window.sunup.state;
    const f = s.actors[0];
    const a = document.activeElement;
    return {
      day: s.day,
      minute: Math.round(s.minute),
      night: s.turnover >= 0,
      x: f.x,
      y: f.y,
      water: s.water,
      harvested: Object.values(s.stats.harvested).reduce((x, y) => x + y, 0),
      dialog: document.querySelector('.dialog.on')?.dataset.kind ?? '',
      question: document.querySelector('.dialog.on .body p')?.textContent ?? '',
      focus: a && a !== document.body ? `${a.tagName}${a.className ? `.${String(a.className).split(' ').join('.')}` : ''}` : '',
      onSleep: !!a && a.matches?.('.toolbar .tool.act'),
      onHud: !!a && a.tagName === 'BUTTON' && !!a.closest?.('.hud'),
      line: document.querySelector('.hint.on')?.textContent ?? '',
    };
  });

await p.goto(`${base}/?game=homestead&fresh`);
await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 30000 });
await p.mouse.move(640, 420);
await p.keyboard.press('KeyA');
await p.waitForTimeout(400);

// The first line names the keys.
check('the first line on a desktop names the keys', (await S()).line === 'Walk with WASD. Space harvests a radish.', (await S()).line);

// A farm past its first lessons, at 3:27 pm, with Sleep on the rack and a ripe radish row to work.
const setup = (minute) =>
  p.evaluate((minute) => {
    const s = window.sunup.state;
    s.held = false;
    for (const id of ['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'stamina']) if (!s.learn.includes(`lesson:${id}`)) s.learn.push(`lesson:${id}`);
    for (const f of ['can', 'sleep', 'coins', 'seeds', 'stamina']) if (!s.learn.includes(f)) s.learn.push(f);
    s.minute = minute;
    s.stats.days = Math.max(1, s.stats.days);
    const f = s.actors[0];
    f.x = 7.5;
    f.y = 3.5;
    f.facing = 's';
    f.angle = Math.PI / 2;
    f.path = [];
    f.task = null;
    f.aim = null;
    s.tool = 'hands';
    document.activeElement?.blur?.();
  }, minute);
const tabToSleep = async () => {
  for (let i = 0; i < 30; i++) {
    await p.keyboard.press('Tab');
    if ((await S()).onSleep) return true;
  }
  return false;
};
// The clock's minute moves on; hold the day at 3:27 pm for each part.
const at327 = async () => {
  await setup(9 * 60 + 27);
  await p.waitForTimeout(250);
};

await at327();
const day0 = (await S()).day;
check('Tab reaches the Sleep button', await tabToSleep(), (await S()).focus);
// Walk with WASD while the focus is on Sleep.
const w0 = await S();
await p.keyboard.down('KeyD');
await p.waitForTimeout(400);
await p.keyboard.up('KeyD');
const w1 = await S();
check('WASD walks the farmer with the focus on Sleep', w1.x > w0.x + 0.5, `x ${w0.x.toFixed(2)} to ${w1.x.toFixed(2)}`);
check('walking takes the focus off the Sleep button', !w1.onHud, w1.focus);
await p.keyboard.press('Space');
await p.waitForTimeout(600);
let s = await S();
check('Space then acts on the farm: the day does not end', !s.night && s.day === day0 && !s.dialog, JSON.stringify({ night: s.night, day: s.day, dialog: s.dialog }));

// Space straight away on a focused Sleep button.
await at327();
check('Tab reaches the Sleep button again', await tabToSleep());
await p.keyboard.press('Space');
await p.waitForTimeout(600);
s = await S();
check('Space on a focused Sleep button acts on the farm, not the button: the day goes on', !s.night && s.day === day0 && !s.dialog, JSON.stringify({ night: s.night, day: s.day, dialog: s.dialog, focus: s.focus }));
check('and the focus is off the button', !s.onHud, s.focus);

// Space on a focused button harvests what is in front (it acts on the farm).
await at327();
await p.evaluate(() => {
  const s = window.sunup.state;
  const q = s.plots[5 * s.W + 7];
  q.tilled = true;
  s.parcels[1].owned = true;
  q.crop = { id: s.nextId++, kind: 'radish', age: 3, stage: 4, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: s.day };
  const f = s.actors[0];
  f.x = 7.5;
  f.y = 4.5;
  f.facing = 's';
});
await tabToSleep();
const h0 = (await S()).harvested;
await p.keyboard.press('Space');
await p.waitForTimeout(500);
s = await S();
check('Space with the focus on Sleep harvests the radish in front', s.harvested === h0 + 1 && !s.night, `harvested ${s.harvested - h0}`);

// Enter on a focused Sleep button before evening asks first.
await at327();
await tabToSleep();
await p.keyboard.press('Enter');
await p.waitForTimeout(400);
s = await S();
check('Enter on a focused Sleep button before evening asks first', s.dialog === 'sleep' && !s.night, s.question);
check('the question says the hour: "It is 3:27 pm."', /^It is 3:\d\d pm\./.test(s.question), s.question);
check('the question is short: eleven words or fewer', s.question.split(/\s+/).length <= 11, `${s.question.split(/\s+/).length} words`);
await p.keyboard.press('Escape');
await p.waitForTimeout(400);
s = await S();
check('Escape closes it and the day goes on', !s.dialog && !s.night && s.day === day0, JSON.stringify(s));

// A mouse click on a HUD button keeps no focus; Space after it acts on the farm.
await at327();
const canBtn = await p.evaluate(() => {
  const r = document.querySelector('.toolbar .tool[data-tool="can"]').getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});
await p.mouse.click(canBtn[0], canBtn[1]);
await p.waitForTimeout(200);
s = await S();
check('a mouse click on a tool leaves no focus on it', !s.onHud, s.focus);
const sleepBtn = await p.evaluate(() => {
  const r = document.querySelector('.toolbar .tool.act').getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});
await p.mouse.click(sleepBtn[0], sleepBtn[1]);
await p.waitForTimeout(400);
s = await S();
check('a mouse click on Sleep before evening asks first', s.dialog === 'sleep' && !s.night, s.question);
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
s = await S();
check('after the click and Escape, no focus is left on a HUD button', !s.onHud && !s.dialog, s.focus);
await p.keyboard.press('Space');
await p.waitForTimeout(500);
s = await S();
check('Space after it does not sleep', !s.night && !s.dialog && s.day === day0);

// After 6 pm with nothing on the farm to do, Enter sleeps without a question.
await setup(13 * 60);
await p.evaluate(() => {
  const s = window.sunup.state;
  for (const q of s.plots) q.crop = null;
  s.crows = [];
});
await p.waitForTimeout(200);
await p.keyboard.press('Enter');
await p.waitForTimeout(600);
s = await S();
check('after 6 pm with nothing to do, Enter sleeps without a question', s.night || s.day === day0 + 1, JSON.stringify({ night: s.night, day: s.day, dialog: s.dialog }));
await p.waitForFunction(() => window.sunup.state.turnover < 0, null, { timeout: 10000 });
await p.waitForTimeout(500);

// Space facing the well with the hands in hand fills the can.
await p.evaluate(() => {
  const s = window.sunup.state;
  s.water = 0;
  s.tool = 'hands';
  const f = s.actors[0];
  f.x = 11.5;
  f.y = 3.5;
  f.facing = 'n';
  f.angle = -Math.PI / 2;
  f.path = [];
  f.task = null;
  f.aim = null;
  document.activeElement?.blur?.();
});
await p.waitForTimeout(200);
const info = await p.evaluate(() => document.querySelector('.info')?.textContent ?? '');
await p.keyboard.press('Space');
await p.waitForTimeout(900);
s = await S();
check('Space at the well with the hands fills the can', s.water > 0, `water ${s.water}, info "${info}"`);
// And from its side, facing it.
await p.evaluate(() => {
  const s = window.sunup.state;
  s.water = 0;
  const f = s.actors[0];
  f.x = 12.5;
  f.y = 2.5;
  f.facing = 'w';
  f.angle = Math.PI;
});
await p.waitForTimeout(200);
await p.keyboard.press('Space');
await p.waitForTimeout(900);
check('Space beside the well, facing it, fills the can too', (await S()).water > 0, `water ${(await S()).water}`);

// From the house with the well lesson up, the well is on screen.
await p.goto(`${base}/?game=homestead&fresh`);
await p.waitForFunction(() => window.sunup && window.sunup.frames > 20, null, { timeout: 30000 });
await p.keyboard.press('KeyA');
await p.evaluate(() => {
  const s = window.sunup.state;
  for (const id of ['pull', 'water']) s.learn.push(`lesson:${id}`);
  s.learn.push('can');
  s.water = 0;
  s.held = false;
  const f = s.actors[0];
  f.x = 2.5;
  f.y = 3.5;
});
await p.waitForTimeout(2500);
// (Round 8: there are two wells; the check reads the one the line points at, from the house the yard well.)
const well = await p.evaluate(() => { const t = window.sunup.hud['pointAt']; return { t, at: t ? window.sunup.r3d.project(t.x, t.y, 0.6) : null, line: document.querySelector('.hint.on')?.textContent ?? '', w: innerWidth, h: innerHeight }; });
const isWell = !!well.t && ((Math.floor(well.t.x) === 11 && Math.floor(well.t.y) === 2) || (Math.floor(well.t.x) === 6 && Math.floor(well.t.y) === 9));
check('from the house, with "Fill the can at the well." up, the well it points at is on screen', well.line === 'Fill the can at the well.' && isWell && well.at.x > 40 && well.at.x < well.w - 40 && well.at.y > 60 && well.at.y < well.h - 120, JSON.stringify(well));
await p.screenshot({ path: '/tmp/acres-sunup-keys-well.png' });

console.log(errs.length ? `FAIL page errors: ${errs.join(' | ')}` : 'ok   no page errors');
await b.close();
if (failed || errs.length) {
  console.log(`SUNUP KEYS FAILED: ${failed} checks`);
  process.exit(1);
}
console.log('SUNUP KEYS OK');
