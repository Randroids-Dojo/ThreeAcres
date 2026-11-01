// The rest of Thistledown played with real keys and mouse: the gates, ember
// and brook downies, the workbench, glide, a silo, pen upgrades, nettlebacks
// at night, a thistle at dusk and sleeping. Setup gives coins and places the
// player; every action is real input.
//   node scripts/ranch-valley.mjs [shotsDir]
import fs from 'node:fs';
import { launch, openRanch, frames, checker, S } from './ranch-lib.mjs';

const shots = process.argv[2] || '/tmp/ranch/valley';
fs.mkdirSync(shots, { recursive: true });
const { check, failed } = checker();
const b = await launch();
const { page, problems } = await openRanch(b, { width: 1280, height: 800, query: 'nolock' });
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png` });
const place = (x, z, ax, ay, az) => page.evaluate(([x, z, ax, ay, az]) => {
  const r = window.ranch;
  const p = r.sim.s.player;
  p.x = x; p.z = z; p.y = r.sim.phys.floor(x, z); p.vx = p.vz = p.vy = 0;
  if (ax !== undefined) r.aimAt(ax, ay ?? p.y + 1.6, az);
}, [x, z, ax, ay, az]);
const floor = (x, z) => page.evaluate(([x, z]) => window.ranch.sim.phys.floor(x, z), [x, z]);
const useTag = async (key) => {
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  const opts = await page.evaluate(() => window.ranch.menuOptions());
  if (key) {
    await page.keyboard.press(key);
    await page.waitForTimeout(700);
  }
  return opts;
};
const audio = await page.evaluate(() => {
  window.__cues = [];
  window.__loops = {};
  const a = window.shell.audio;
  const cue = a.cue.bind(a);
  const loop = a.loop.bind(a);
  a.cue = (n, o) => { window.__cues.push(n); cue(n, o); };
  a.loop = (n, on, o) => { window.__loops[n] = on; loop(n, on, o); };
  return true;
});
await page.evaluate(() => { window.ranch.sim.s.coins = 6000; });

// ---- Ember Ridge's gate
await place(-33.2, -10, -36, (await floor(-36, -10)) + 1.4, -10);
await frames(page, 4);
let opts = await useTag('Digit1');
check('the ridge gate hangs its price tag', opts.includes('gate:ridge'), opts.join(','));
let s = await S(page);
// The gate's price (500) less, the goal's reward (100) back.
check('buying it opens the gate', await page.evaluate(() => window.ranch.sim.s.gates.ridge) && s.coins === 6000 - 500 + 100 && s.goals.includes('ridge'), `coins ${s.coins}`);
await page.waitForTimeout(1200);
await shot('01-gate-open');
await page.keyboard.down('KeyW');
await page.waitForTimeout(1600);
await page.keyboard.up('KeyW');
s = await S(page);
check('you can walk through onto the ridge', s.x < -37.5, `x ${s.x.toFixed(1)}`);
check('a first visit names the zone', await page.evaluate(() => window.ranch.sim.s.zones.includes('ridge') && document.querySelector('.rh-zone').classList.contains('on')));
await shot('02-ridge');

// ---- catch an ember downy
/**
 * Wild downies hop away when you come close and dig in against the pull for
 * about a second: hold right click and keep the crosshair on the nearest one
 * of a kind, as a player would, until it comes in (or three seconds pass).
 */
const catchWild = async (kind) => {
  const at = () => page.evaluate((kind) => { const s = window.ranch.sim.s; const p = s.player; const ds = s.downies.filter((q) => !q.gone && !q.tame && q.kind === kind).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)); return ds[0] && { x: ds[0].x, y: ds[0].y, z: ds[0].z }; }, kind);
  const d0 = await at();
  await place(d0.x + 3.6, d0.z + 2.2, d0.x, d0.y + 0.25, d0.z);
  await frames(page, 2);
  await page.mouse.down({ button: 'right' });
  const t0 = Date.now();
  while (Date.now() - t0 < 3000 && !(await page.evaluate((kind) => window.ranch.sim.s.slots.some((q) => q.t === kind), kind))) {
    const d = await at();
    if (d) await page.evaluate(([x, y, z]) => window.ranch.aimAt(x, y, z), [d.x, d.y + 0.25, d.z]);
    await page.waitForTimeout(80);
  }
  await page.mouse.up({ button: 'right' });
};
await catchWild('ember');
s = await S(page);
check('drawing catches an ember downy', s.slots.some((q) => q[0] === 'ember') && s.goals.includes('ember'), JSON.stringify(s.slots));
await page.waitForTimeout(200);
await shot('03-first-ember');

// ---- the workbench: glide vanes and a bigger canister
await place(-9.2, 41.2, -10.6, (await floor(-10.6, 41.2)) + 1.6, 41.2);
await frames(page, 4);
opts = await useTag(null);
check('the workbench hangs its upgrades', opts.includes('bench:glide') && opts.includes('bench:cap'), opts.join(','));
await shot('04-bench');
await page.keyboard.press(`Digit${opts.indexOf('bench:glide') + 1}`);
await page.waitForTimeout(800);
opts = await useTag(null);
await page.keyboard.press(`Digit${opts.indexOf('bench:cap') + 1}`);
await page.waitForTimeout(800);
s = await page.evaluate(() => ({ ...window.ranch.sim.s.up }));
check('glide and capacity bought', s.glide === 1 && s.cap === 1, JSON.stringify(s));

// ---- glide: hold jump in the air off the windmill's hill
await place(-30, 52, -30, 6, 40);
await page.evaluate(() => { const p = window.ranch.sim.s.player; p.y += 8; p.grounded = false; p.vy = 0; });
await page.waitForTimeout(400);
await page.keyboard.down('Space');
await page.waitForTimeout(500);
const g1 = await page.evaluate(() => ({ vy: window.ranch.sim.s.player.vy, gliding: window.ranch.sim.s.player.gliding }));
await page.keyboard.up('Space');
check('holding jump in the air glides', g1.gliding && g1.vy > -2, `vy ${g1.vy.toFixed(2)}`);

// ---- a silo: build, puff roots in, choose them, draw them back out
await place(25.8, 33.4, 25.8, (await floor(25.8, 31.8)) + 1.2, 31.8);
await frames(page, 4);
opts = await useTag('Digit3');
s = await S(page);
check('the third tag builds a silo', s.pads[2] === 'silo', s.pads.join(','));
await page.evaluate(() => { const sim = window.ranch.sim; for (let i = 0; i < 6; i++) sim.stow('sweetroot'); window.ranch.selectSlot(sim.s.slots.findIndex((q) => q.t === 'sweetroot')); });
await place(28, 34.5, 28, (await floor(28, 26.5)) + 2.5, 26.5);
await frames(page, 3);
await page.mouse.down({ button: 'left' });
await page.waitForTimeout(1600);
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(800);
const silo = await page.evaluate(() => window.ranch.sim.s.pads[2].silo);
check('puffing at the silo stores the roots', silo.length === 1 && silo[0].t === 'sweetroot' && silo[0].n >= 6, JSON.stringify(silo));
await place(25.8, 33.4, 25.8, (await floor(25.8, 31.8)) + 1.2, 31.8);
await frames(page, 4);
opts = await useTag('Digit1');
check('the silo post lists what it holds', opts[0] === 'silo:0', opts.join(','));
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const out = await page.evaluate(() => { const o = { x: 28, z: 26.5 + 1.85 }; return o; });
await place(28, 33.2, out.x, (await floor(out.x, out.z)) + 0.7, out.z);
await frames(page, 3);
await page.mouse.down({ button: 'right' });
await page.waitForTimeout(2200);
await page.mouse.up({ button: 'right' });
s = await S(page);
check('drawing at the outlet takes them back', (s.slots.find((q) => q[0] === 'sweetroot') ?? [0, 0])[1] >= 4, JSON.stringify(s.slots));
await shot('05-silo');

// ---- a pen with a feeder
await place(4.2, 39.4, 3.8, (await floor(3.8, 38.2)) + 1.2, 38.2);
await frames(page, 4);
opts = await useTag('Digit1');
s = await S(page);
check('a pen on the south row', s.pads[3] === 'pen', s.pads.join(','));
await page.waitForTimeout(400);
opts = await useTag(null);
check('the pen post offers its upgrades', ['pen:high', 'pen:feeder', 'pen:trough', 'pen:hedge', 'pen:chute'].every((k) => opts.includes(k)), opts.join(','));
await shot('06-pen-tags');
await page.keyboard.press(`Digit${opts.indexOf('pen:feeder') + 1}`);
await page.waitForTimeout(800);
s = await S(page);
check('buying a feeder finishes the goal', s.goals.includes('feeder'));

// ---- Brook Hollow and a brook downy
await place(33.2, -24, 36, (await floor(36, -24)) + 1.4, -24);
await frames(page, 4);
opts = await useTag('Digit1');
check('the hollow gate opens', await page.evaluate(() => window.ranch.sim.s.gates.hollow));
await catchWild('brook');
s = await S(page);
check('a brook downy comes in', s.slots.some((q) => q[0] === 'brook'), JSON.stringify(s.slots));
await shot('07-hollow');

// ---- night: a nettleback, sent rolling with a puff
await page.evaluate(() => { const r = window.ranch; const s = r.sim.s; s.hour = 22.2; s.nettles.push({ id: 999, x: 0, y: r.sim.phys.floor(0, 12), z: 12, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: 0, mode: 'roam', modeT: 99, tx: 0, tz: 14, bristle: 0, roll: 0, gone: false, snuffT: 2 }); });
await place(0, 16.5, 0, (await floor(0, 12.6)) + 0.25, 12.6);
await frames(page, 6);
await shot('08-nettle');
const nx = await page.evaluate(() => { const r = window.ranch; const n = r.sim.s.nettles.find((q) => q.id === 999); const p = r.sim.s.player; return { cross: document.querySelector('.rh-cross').dataset.s, n: n && [+n.x.toFixed(1), +n.y.toFixed(2), +n.z.toFixed(1), n.mode], p: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1), +p.yaw.toFixed(2), +p.pitch.toFixed(2)], aim: r.aim, range: r.sim.range, t: r.sim.aimTarget(r.aim), menu: r.menuOpen(), paused: r.paused }; });
check('the crosshair says it is too prickly to draw', nx.cross === 'prickly', JSON.stringify(nx));
// It snuffles about for a moment first.
await page.waitForTimeout(2300);
await page.evaluate(() => { const r = window.ranch; const sim = r.sim; sim.stow('cloverhead'); r.selectSlot(sim.s.slots.findIndex((q) => q.t === 'cloverhead')); const n = sim.s.nettles.find((q) => q.id === 999); r.aimAt(n.x, n.y + 0.25, n.z); });
await page.mouse.click(640, 400);
await page.waitForTimeout(500);
const nm = await page.evaluate(() => window.ranch.sim.s.nettles.find((n) => n.id === 999)?.mode);
check('a puff sends it rolling', nm === 'roll' || nm === 'flee', nm);

// ---- a thistle at dusk on the ridge top
await page.evaluate(() => { const s = window.ranch.sim.s; s.hour = 18.2; });
await place(-48, -12);
await page.waitForTimeout(2600);
const th = await page.evaluate(() => { const d = window.ranch.sim.s.downies.find((q) => !q.gone && q.kind === 'thistle'); return d && { x: d.x, y: d.y, z: d.z }; });
check('thistles turn up on the ridge top at dusk', !!th);
if (th) {
  await place(th.x + 6, th.z + 3, th.x, th.y + 0.25, th.z);
  await page.waitForTimeout(2400);
  check('getting close counts as finding one', (await S(page)).goals.includes('thistle'));
  await shot('09-thistle');
}

// ---- sleep through to morning
await place(-16, 37.6, -16, (await floor(-16, 39.6)) + 1.6, 39.6);
await frames(page, 4);
const day0 = (await S(page)).day;
opts = await useTag('Digit1');
await page.waitForTimeout(600);
s = await S(page);
check('the door offers sleep, and sleeping brings morning', opts.includes('sleep') && s.day === day0 + 1 && Math.abs(s.hour - 6) < 0.1, `day ${day0} to ${s.day}, hour ${s.hour.toFixed(2)}`);

// ---- sell a little so the coins chime
await page.evaluate(() => { const sim = window.ranch.sim; sim.s.slots[0] = { t: 'tuft-ember', n: 3 }; sim.s.sel = 0; sim.s.hour = 10; });
await place(-6.5, 32.6, -6.5, (await floor(-6.5, 36.5)) + 0.7, 36.5);
await frames(page, 3);
await page.mouse.down({ button: 'left' });
await page.waitForTimeout(900);
await page.mouse.up({ button: 'left' });
await page.waitForTimeout(1200);

// ---- sound: the cues each action asked for
const cues = await page.evaluate(() => window.__cues);
const want = ['ranch.gate', 'ranch.suck', 'ranch.squeak', 'ranch.build', 'ranch.puff', 'ranch.goal', 'ranch.stepstone', 'ranch.nettlehit', 'ranch.sleep', 'ranch.slot', 'ranch.glide', 'ranch.nettle', 'ranch.coins'];
const counts = Object.fromEntries(want.map((n) => [n, cues.filter((c) => c === n).length]));
check('every action asked for its sound', want.every((n) => counts[n] > 0), JSON.stringify(counts));
await page.evaluate(() => window.shell.show());
await page.waitForTimeout(200);
const loops = await page.evaluate(() => window.__loops);
check('pausing stops every held sound', Object.values(loops).every((on) => !on), JSON.stringify(loops));
await page.evaluate(() => window.shell.hide());

check('no console errors', problems.length === 0, problems.slice(0, 4).join(' | '));
await b.close();
console.log(failed() ? `VALLEY FAILED (${failed()})` : 'VALLEY OK');
process.exit(failed() ? 1 : 0);
