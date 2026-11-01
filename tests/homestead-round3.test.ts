// Round 3, P2 and P3: the copper can and hoe ran their reach away from the
// farmer (one tap watered a plot and the path, another bare soil, and bare
// soil lit "Water"); the thirteenth quick tap was dropped without a word;
// crops the season's turn would take got no warning; crows after their
// lesson came unannounced; "Press C" stayed up after C; the board promised a
// copper hoe before the hoe existed; and holding Space while walking sowed a
// 45-coin strawberry on a plot behind the farmer.
import { describe, expect, it } from 'vitest';
import { Tutor } from '../src/games/homestead/lessons';
import { resolve } from '../src/sim/actions';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { Command } from '../src/sim/commands';
import type { WorldState } from '../src/sim/types';
import { brief } from '../src/ui/describe';
import { smithLine } from '../src/ui/dialogs';
import { morningNews } from '../src/ui/hud';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

function farm(seed = 42): WorldState {
  const s = teach(world('sunup', seed), [...EARLY, 'requests', 'deliver', 'pests', 'scarecrow', 'forecast', 'bugs', 'field', 'turn', 'smith', 'wide', 'choose', 'hoe'], [...EARLY_FEATURES, 'board', 'requests', 'pests', 'build', 'forecast', 'hoe']);
  s.orders = [];
  s.day = 6;
  for (const p of s.plots) p.crop = null;
  return s;
}

function run(s: WorldState, seconds: number, first: Command[] = []): string[] {
  const out: string[] = [];
  for (let t = 0, i = 0; t < seconds; t += 1 / 60, i++) for (const e of step(s, 1 / 60, i === 0 ? first : [])) out.push(`${e.type}:${'x' in e ? `${e.x},${e.y}` : ''}`);
  return out;
}

describe('the copper can and hoe work along the row, inside the field', () => {
  it('a tap at the field’s edge waters that row’s plots, never the path or the next field, and skips bare soil', () => {
    const s = farm();
    s.tools.can = 1;
    s.parcels[1].owned = true;
    for (let x = 7; x < 11; x++) plots(s, x, 6).tilled = true;
    for (const x of [2, 4, 5]) plant(s, x, 6, 'carrot', 1);
    // 3,6 is bare: the can passes it by.
    s.tool = 'can';
    stand(s, 6, 6, 'w');
    const ev = run(s, 0.1, [{ type: 'act' }]);
    const watered = ev.filter((e) => e.startsWith('water:')).map((e) => e.slice(6)).sort();
    expect(watered).toEqual(['4,6', '5,6']);
    expect(plots(s, 7, 6).wet).toBe(false);
    expect(plots(s, 3, 6).wet).toBe(false);
  });

  it('wherever the farmer stands, the reach is the aimed plot and its neighbours in the row', () => {
    const s = farm();
    s.tools.can = 1;
    for (let x = 2; x < 6; x++) for (let y = 5; y < 9; y++) plant(s, x, y, 'carrot', 1);
    s.tool = 'can';
    for (const [fx, fy, facing, ax, ay] of [[3, 4, 's', 3, 5], [3, 9, 'n', 3, 8], [1, 7, 'e', 2, 7]] as const) {
      for (const p of s.plots) p.wet = false;
      s.water = 12;
      stand(s, fx, fy, facing);
      s.actors[0].task = null;
      const ev = run(s, 0.1, [{ type: 'actAt', x: ax, y: ay }]);
      const rows = new Set(ev.filter((e) => e.startsWith('water:')).map((e) => e.split(',')[1]));
      expect([...rows], `from ${fx},${fy}`).toEqual([String(ay)]);
      expect(ev.filter((e) => e.startsWith('water:')).length).toBe(3);
    }
  });

  it('bare hoed soil does not light Water: the can is for crops', () => {
    const s = farm();
    expect(resolve(s, 'can', 3, 6)).toMatchObject({ verb: 'water', ok: false, reason: 'Nothing growing here' });
    s.tools.can = 2;
    expect(resolve(s, 'can', 3, 6).ok).toBe(false);
  });

  it('the copper hoe turns three of the new field’s row, never the path', () => {
    const s = farm();
    s.tools.hoe = 1;
    s.parcels[1].owned = true;
    s.tool = 'hoe';
    stand(s, 6, 6, 'e');
    const ev = run(s, 0.1, [{ type: 'act' }]);
    expect(ev.filter((e) => e.startsWith('till:')).map((e) => e.slice(5)).sort()).toEqual(['7,6', '8,6', '9,6']);
  });
});

describe('quick taps', () => {
  it('twenty taps made while the farmer is busy are all done; none is dropped', () => {
    const s = farm();
    for (let x = 2; x < 6; x++) for (let y = 5; y < 10; y++) if (y < 9) plant(s, x, y, 'radish', 3);
    s.tool = 'hands';
    stand(s, 2, 4, 's');
    const taps: Command[] = [];
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) taps.push({ type: 'actAt', x, y });
    taps.push({ type: 'actAt', x: 2, y: 5 }, { type: 'actAt', x: 3, y: 5 }, { type: 'actAt', x: 4, y: 5 }, { type: 'actAt', x: 5, y: 5 });
    const before = s.stats.harvested.radish;
    run(s, 30, taps);
    expect(s.stats.harvested.radish - before).toBe(16);
  });
});

describe('a held act key never works a plot behind the farmer', () => {
  it('walking past with seeds and Space held does not sow the plot left behind; a fresh press still may', () => {
    const s = farm();
    s.coins = 500;
    s.seed = 'strawberry';
    s.tool = 'seeds';
    // Everything in reach is planted but the plot behind and to the left.
    for (let x = 2; x < 6; x++) for (let y = 5; y < 9; y++) plant(s, x, y, 'carrot', 1);
    plots(s, 3, 5).crop = null;
    stand(s, 4, 4, 'e');
    const coins = s.coins;
    run(s, 0.1, [{ type: 'act', held: true }]);
    expect(plots(s, 3, 5).crop).toBeNull();
    expect(s.coins).toBe(coins);
    stand(s, 4, 4, 'e');
    run(s, 0.1, [{ type: 'act' }]);
    expect(plots(s, 3, 5).crop?.kind).toBe('strawberry');
  });
});

describe('the season’s turn is told two days ahead', () => {
  it('the morning card and the plot’s caption say which green crops will not ripen in time', () => {
    const s = farm();
    s.day = 9;
    plant(s, 2, 5, 'carrot', 1);
    plant(s, 3, 5, 'carrot', 1);
    plant(s, 4, 5, 'radish', 2);
    plant(s, 5, 5, 'strawberry', 1);
    s.report = { day: 8, sold: [], wages: 0, grew: 0, withered: 0, eaten: 0, crewWork: 0, income: 0 };
    // Two carrots will be green on the last night; the radish ripens in time; strawberries grow on into summer.
    expect(morningNews(s)).toMatch(/2 green crops won’t ripen before summer/);
    expect(brief(s, 2, 5)).toMatch(/won’t ripen before summer/);
    expect(brief(s, 4, 5)).not.toMatch(/won’t ripen/);
    expect(brief(s, 5, 5)).not.toMatch(/won’t ripen/);
    s.day = 7;
    expect(morningNews(s)).not.toMatch(/ripen/);
  });
});

describe('lessons and lines', () => {
  it('after the crow lesson, the pointer finds a crow without a word', () => {
    const s = farm();
    plant(s, 4, 7, 'carrot', 2);
    const t = new Tutor();
    s.crows.push({ id: 5, x: 4, y: 7, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    const out = t.update(s, 0.1, true);
    expect(out.line).toBe('');
    expect(out.point).toEqual({ x: 4.5, y: 7.5 });
  });

  it('"Press C to see the whole farm." goes as soon as C is pressed', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    s.day = 2;
    const t = new Tutor();
    let out = t.update(s, 0.5, false);
    for (let i = 0; i < 3 && out.line !== 'Press C to see the whole farm.'; i++) out = t.update(s, 0.5, false);
    expect(out.line).toBe('Press C to see the whole farm.');
    t.onEvent(s, { type: 'rules', rules: { ...s.rules, camera: 'wide' }, changed: ['camera'] });
    t.update(s, 0.1, false);
    expect(s.learn).toContain('lesson:wide');
    expect(t.update(s, 0.1, false).line).not.toBe('Press C to see the whole farm.');
  });

  it('the board never promises a copper hoe before there is a hoe, and says reputation', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    s.learn.push('smith');
    expect(smithLine(s)).toBe('Reputation 0. Three more for a copper can.');
    s.learn.push('hoe');
    expect(smithLine(s)).toBe('Reputation 0. Two more for a copper hoe.');
    expect(smithLine(s)).not.toMatch(/good word/);
  });
});
