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
//   - from the house, with the well lesson up, the well it points at is on screen;
//   - round 10: Escape closes the board and a second Escape at once does not open the game switcher (one a moment
//     later does); walking past the board with Space held never opens it, a fresh press facing it does; Tab
//     reaches Pass on the board and Enter lets the pair go, and the next morning brings a fresh pair; the morning
//     after the fair its card says the miss and why, Enter closes it, and an Escape just after it stays in Sunup.
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

// Round 10: Escape just after a card closed opened the game switcher (and the next click went to Thistledown); held
// Space walking past the notice board popped it up mid-walk.
await p.evaluate(() => {
  const s = window.sunup.state;
  for (const w of ['board', 'requests']) if (!s.learn.includes(w)) s.learn.push(w);
  for (const id of ['requests', 'sowfor', 'deliver', 'choose']) if (!s.learn.includes(`lesson:${id}`)) s.learn.push(`lesson:${id}`);
  s.minute = 9 * 60;
  document.activeElement?.blur?.();
});
const switcher = () => p.evaluate(() => !!document.querySelector('.shellover.on'));
await p.keyboard.press('KeyB');
await p.waitForTimeout(400);
const boardOpen = (await S()).dialog === 'board';
await p.keyboard.press('Escape');
await p.waitForTimeout(120);
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
const quick = { dialog: (await S()).dialog, switcher: await switcher() };
check('round 10: Escape closes the board, and a second Escape at once does not open the game switcher', boardOpen && !quick.dialog && !quick.switcher, JSON.stringify({ boardOpen, ...quick }));
await p.waitForTimeout(600);
await p.keyboard.press('Escape');
await p.waitForTimeout(400);
const later = await switcher();
check('round 10: an Escape a moment later still opens it', later);
if (later) {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
}
check('round 10: and Escape closes it again, back in Sunup', !(await switcher()) && (await p.evaluate(() => window.sunup.running !== false)));
// Walk along the yard past the board with Space held: the board stays shut; a fresh press facing it opens it.
await p.evaluate(() => {
  const s = window.sunup.state;
  const f = s.actors[0];
  Object.assign(f, { x: 6.5, y: 3.5, facing: 'e', angle: 0, path: [], task: null, aim: null });
  s.tool = 'hands';
  s.minute = 9 * 60;
  document.activeElement?.blur?.();
});
await p.waitForTimeout(200);
await p.keyboard.down('Space');
await p.keyboard.down('KeyD');
let popped = false;
for (let k = 0; k < 14; k++) {
  await p.waitForTimeout(100);
  if ((await S()).dialog === 'board') popped = true;
}
await p.keyboard.up('KeyD');
await p.keyboard.up('Space');
const walked = (await S()).x;
check('round 10: walking past the board with Space held never opens it', !popped && walked > 9, `x ${walked.toFixed(2)}, opened ${popped}`);
await p.evaluate(() => {
  const f = window.sunup.state.actors[0];
  Object.assign(f, { x: 8.5, y: 3.5, facing: 'n', angle: -Math.PI / 2, path: [], task: null, aim: null });
});
await p.waitForTimeout(200);
await p.keyboard.press('Space');
await p.waitForTimeout(400);
check('round 10: a fresh Space facing the board opens it', (await S()).dialog === 'board', (await S()).dialog);
await p.keyboard.press('Escape');
await p.waitForTimeout(700);

// Round 10: Pass on the board from the keyboard (Tab onto it, Enter): the offer goes and the board says new ones come
// tomorrow, and they do. Then the fair's card the morning after it: it opens at dawn, says the miss and why, and Enter
// closes it (the tenth playtest's only sign of a missed fair was one clause of the morning card).
{
  await p.evaluate(() => {
    const s = window.sunup.state;
    for (const w of ['fair']) if (!s.learn.includes(w)) s.learn.push(w);
    if (!s.learn.includes('lesson:fair')) s.learn.push('lesson:fair');
    s.parcels[1].owned = true;
    for (const q of s.parcels.slice(0, 2)) for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) { const c = s.plots[y * s.W + x]; c.tilled = true; c.crop = null; }
    Object.assign(s, { coins: 900, rep: 3, requested: 2, orders: [], minute: 9 * 60 });
    s.fair = { start: 1, day: s.day + 1, want: 4, got: 0, taken: 1 };
    window.sunup.pinRequests();
    window.sunup.dialogs.board('requests');
  });
  await p.waitForTimeout(400);
  const before = await p.evaluate(() => window.sunup.state.orders.filter((o) => o.taken === false).length);
  let onPass = false;
  for (let k = 0; k < 14 && !onPass; k++) {
    await p.keyboard.press('Tab');
    onPass = await p.evaluate(() => !!document.activeElement?.matches?.('.dialog .btn.pass'));
  }
  if (onPass) await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ offers: window.sunup.state.orders.filter((o) => o.taken === false).length, words: [...document.querySelectorAll('.dialog.on .legend')].map((e) => e.textContent).join(' / ') }));
  check('round 10: Tab reaches Pass on the board and Enter lets the pair go; the board says new ones come tomorrow', before === 2 && onPass && after.offers === 0 && /New requests come tomorrow\./.test(after.words), JSON.stringify({ before, onPass, ...after }));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(700);
  // Sleep through the fair's night: the morning brings a fresh pair and the fair's card.
  const day1 = (await S()).day;
  await p.evaluate(() => {
    const s = window.sunup.state;
    s.fair.day = s.day;
    s.minute = 13 * 60;
    s.crows = [];
    document.activeElement?.blur?.();
  });
  // (Enter sleeps; with something left to do it asks first, and Enter says yes.)
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  if ((await S()).dialog === 'sleep') await p.keyboard.press('Enter');
  let card = null;
  for (let k = 0; k < 120 && !card; k++) {
    await p.waitForTimeout(200);
    card = await p.evaluate(() => (document.querySelector('.dialog.on')?.dataset.kind === 'fair' ? { title: document.querySelector('.dialog.on .title, .dialog.on h2')?.textContent ?? '', text: document.querySelector('.dialog.on .fairp')?.innerText ?? '', button: document.querySelector('.dialog.on .btn.primary')?.textContent ?? '', day: window.sunup.state.day, night: window.sunup.state.turnover >= 0, offers: window.sunup.state.orders.filter((o) => o.taken === false).length } : null));
  }
  check('round 10: the morning after the fair its card says the miss and why, in a few short lines, once the night is over', !!card && card.day === day1 + 1 && !card.night && /^No ribbon this time\./.test(card.text) && card.text.split('\n').length <= 6 && card.text.split('\n').every((l) => l.split(/\s+/).length <= 10), JSON.stringify(card));
  check('round 10: a fresh pair is on the board the morning after a Pass', !!card && card.offers === 2, JSON.stringify(card));
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  check('round 10: Enter closes the fair card', (await S()).dialog === '', (await S()).dialog);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  check('round 10: and an Escape just after it does not open the game switcher', !(await switcher()));
  await p.waitForTimeout(600);
}

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
