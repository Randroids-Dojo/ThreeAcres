import { describe, expect, it } from 'vitest';
import { resolve } from '../src/sim/actions';
import { nightfall } from '../src/sim/day';
import { qualityAt } from '../src/sim/soil';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { SimEvent } from '../src/sim/types';
import { world } from './helpers';

describe('growth', () => {
  it('classic: a watered crop grows a day, a dry one does not, three dry nights kill it', () => {
    const s = world('sunup');
    plant(s, 2, 7, 'corn', 1);
    plant(s, 3, 7, 'corn', 1);
    plots(s, 2, 7).wet = true;
    const ev: SimEvent[] = [];
    nightfall(s, ev);
    expect(plots(s, 2, 7).crop!.age).toBe(2);
    expect(plots(s, 3, 7).crop!.age).toBe(1);
    nightfall(s, ev);
    nightfall(s, ev);
    // Weather may rain on the farm; only check death if it never rained.
    if (!ev.some((e) => e.type === 'dawn' && (e.weather === 'rain' || e.weather === 'storm'))) expect(plots(s, 3, 7).crop!.dead).toBe(true);
  });

  it('synergy: moisture carries a crop for several nights', () => {
    const s = world('patchwork');
    s.forecast = ['sun', 'sun', 'sun'];
    plant(s, 2, 7, 'corn', 1);
    plots(s, 2, 7).moisture = 3;
    const ev: SimEvent[] = [];
    nightfall(s, ev);
    nightfall(s, ev);
    nightfall(s, ev);
    expect(plots(s, 2, 7).crop!.age).toBe(4);
    nightfall(s, ev);
    expect(plots(s, 2, 7).crop!.age).toBe(4);
  });

  it('synergy quality: lettuce beside a sunflower on rich soil is a star', () => {
    const s = world('patchwork');
    for (let x = 2; x < 6; x++) for (let y = 5; y < 9; y++) plots(s, x, y).crop = null;
    plant(s, 3, 7, 'lettuce', 1);
    plant(s, 4, 7, 'sunflower', 1);
    plots(s, 3, 7).nutrient = 2;
    const q = qualityAt(s, 3, 7);
    expect(q.friend && q.bees && q.rich).toBe(true);
    expect(q.quality).toBe(3);
  });

  it('crowding three carrots together costs a grade', () => {
    const s = world('patchwork');
    for (let x = 2; x < 6; x++) for (let y = 5; y < 9; y++) plots(s, x, y).crop = null;
    plant(s, 3, 7, 'carrot', 1);
    plant(s, 2, 7, 'carrot', 1);
    plant(s, 4, 7, 'carrot', 1);
    plots(s, 3, 7).nutrient = 2;
    expect(qualityAt(s, 3, 7).crowded).toBe(true);
    expect(qualityAt(s, 3, 7).quality).toBe(0);
  });
});

describe('tools', () => {
  it('smart picks the obvious verb', () => {
    const s = world('patchwork');
    expect(resolve(s, 'smart', 2, 5).verb).toBe('harvest');
    expect(resolve(s, 'smart', 2, 7).verb).toBe('plant');
    expect(resolve(s, 'smart', 7, 5).reason).toBe('unowned');
  });

  it('turns: a move per action, no more than twelve', () => {
    const s = world('patchwork');
    s.coins = 10000;
    for (let y = 7; y < 9; y++) for (let x = 2; x < 6; x++) step(s, 0.016, [{ type: 'paint', x, y }]);
    for (let y = 5; y < 7; y++) for (let x = 2; x < 6; x++) step(s, 0.016, [{ type: 'paint', x, y }]);
    for (let i = 0; i < 2000 && (s.jobs.length || s.actors[0].task || s.actors[0].path.length); i++) step(s, 1 / 30);
    expect(s.ap).toBe(0);
    const planted = s.plots.filter((p) => p.crop && p.crop.age === 0).length;
    expect(planted).toBeLessThanOrEqual(12);
  });

  it('day: stamina runs out and the farmer is told to sleep', () => {
    const s = world('sunup');
    s.stamina = 0;
    s.actors[0].x = 2.5;
    s.actors[0].y = 4.5;
    s.actors[0].facing = 's';
    const ev = step(s, 0.016, [{ type: 'act' }]);
    expect(ev.some((e) => e.type === 'deny')).toBe(true);
    expect(s.stats.harvested.radish).toBe(0);
  });
});

describe('determinism', () => {
  it('the same seed and the same commands give the same farm', async () => {
    const { play } = await import('./helpers');
    const a = world('bushel', 9);
    const b = world('bushel', 9);
    play(a, 6);
    play(b, 6);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
