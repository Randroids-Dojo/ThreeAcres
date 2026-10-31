// Sample farms for building and checking the renderers without playing.
// Each fixture is a real WorldState, built with the same helpers as the game.

import { CROP_IDS, CROPS, stageOf } from '../sim/crops';
import { HAND_NAMES } from '../sim/constants';
import { BUNK } from '../sim/map';
import { PRESETS } from '../sim/presets';
import { createWorld, idx, plant, plots } from '../sim/world';
import type { Actor, Weather, WorldState } from '../sim/types';

export const FIXTURES = ['start', 'lush', 'synergy', 'meadow', 'night', 'dusk', 'rain', 'storm', 'heat', 'autumn', 'winter'] as const;
export type FixtureId = (typeof FIXTURES)[number];

function hand(id: number, n: number, x: number, y: number): Actor {
  return {
    id,
    role: 'hand',
    name: HAND_NAMES[n],
    x,
    y,
    facing: 's',
    angle: Math.PI / 2,
    moving: false,
    walked: 0,
    task: null,
    path: [],
    job: null,
    hop: 0,
    tint: n,
    away: false,
  };
}

/** Every crop at every stage, plus the things that can go wrong with them. */
function lush(): WorldState {
  const s = createWorld(7, PRESETS.sunup.rules);
  s.day = 14;
  s.minute = 360;
  for (const p of s.parcels) p.owned = true;
  for (const p of s.parcels) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plots(s, x, y).tilled = true;

  // Parcels 0 to 3: each row of each parcel is one crop, columns step through stages.
  const rows: { x: number; y: number }[] = [];
  for (const pid of [0, 1, 2, 3]) {
    const p = s.parcels[pid];
    for (let y = p.y; y < p.y + p.h; y++) rows.push({ x: p.x, y });
  }
  CROP_IDS.forEach((kind, i) => {
    const a = rows[i * 2];
    const b = rows[i * 2 + 1];
    const d = CROPS[kind].days;
    // Row a: seed, sprout, young, grown. Row b: ripe x2, then ripe with gold and star quality.
    const ages = [0, d * 0.2, d * 0.5, d * 0.85];
    for (let k = 0; k < 4; k++) plant(s, a.x + k, a.y, kind, ages[k]);
    for (let k = 0; k < 4; k++) {
      plant(s, b.x + k, b.y, kind, d);
      plots(s, b.x + k, b.y).crop!.quality = k as 0 | 1 | 2 | 3;
    }
  });
  // Parcel 4: troubles. Dead crops, bugs, a dry patch, a bare tilled corner.
  const t = s.parcels[4];
  plant(s, t.x, t.y, 'corn', 3);
  plots(s, t.x, t.y).crop!.dead = true;
  plant(s, t.x + 1, t.y, 'lettuce', 2);
  plots(s, t.x + 1, t.y).crop!.dead = true;
  for (let k = 0; k < 4; k++) {
    plant(s, t.x + k, t.y + 1, 'carrot', 3);
    plots(s, t.x + k, t.y + 1).crop!.bugs = k;
  }
  plant(s, t.x + 2, t.y + 2, 'pumpkin', 6);
  plant(s, t.x + 3, t.y + 3, 'strawberry', 6);
  // Parcel 5: freshly bought, untilled, with a sprinkler and a scarecrow.
  const f = s.parcels[5];
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) plots(s, x, y).tilled = false;
  s.builds.push({ id: s.nextId++, kind: 'sprinkler', x: f.x + 1, y: f.y + 1 });
  s.builds.push({ id: s.nextId++, kind: 'scarecrow', x: f.x + 2, y: f.y + 2 });
  s.builds.push({ id: s.nextId++, kind: 'scarecrow', x: t.x, y: t.y + 3 });
  s.builds.push({ id: s.nextId++, kind: 'sprinkler', x: t.x + 1, y: t.y + 2 });

  // Water half of everything.
  for (let i = 0; i < s.plots.length; i++) {
    const p = s.plots[i];
    if (!p.tilled) continue;
    p.wet = i % 2 === 0;
    p.moisture = i % 4;
    p.nutrient = (i >> 2) % 4;
  }
  // Ripe crops in a sprinkler square for a nice cluster: recompute stages.
  for (const p of s.plots) if (p.crop) p.crop.stage = stageOf(p.crop.kind, p.crop.age);

  s.actors[0].x = 6.5;
  s.actors[0].y = 6.5;
  s.actors[0].facing = 'w';
  s.actors[0].angle = Math.PI;
  s.actors[0].task = { verb: 'water', x: 5, y: 6, t: 0.2, dur: 0.45 };
  s.actors.push(hand(2, 0, 11.5, 7.5), hand(3, 1, 6.5, 11.5), hand(4, 2, BUNK.x + 0.5, BUNK.y + 0.5));
  s.actors[1].task = { verb: 'harvest', x: 10, y: 7, t: 0.1, dur: 0.5 };
  s.actors[2].moving = true;
  s.crows.push({ id: 900, x: 8, y: 6, fromX: 8, fromY: -3, phase: 'peck', t: 30 });
  s.crows.push({ id: 901, x: 3, y: 11, fromX: 22, fromY: 8, phase: 'in', t: 0.8 });
  s.jobs.push({ id: 950, verb: 'water', x: 12, y: 6, claimedBy: null }, { id: 951, verb: 'plant', x: t.x + 2, y: t.y + 3, crop: 'corn', claimedBy: 2 });
  s.coins = 1840;
  return s;
}

function synergy(): WorldState {
  const s = lush();
  s.rules = { ...PRESETS.patchwork.rules };
  // A clear gradient so the overlay reads: moisture left to right, nutrient top to bottom.
  for (const p of s.parcels) {
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        const pl = plots(s, x, y);
        pl.moisture = x - p.x;
        pl.nutrient = y - p.y;
        pl.wet = pl.moisture >= 2;
      }
    }
  }
  return s;
}

function meadow(): WorldState {
  const s = createWorld(11, PRESETS.bushel.rules);
  s.parcels[1].owned = true;
  s.parcels[2].owned = true;
  s.actors.push(hand(2, 0, 9.5, 6.5));
  s.actors[1].moving = true;
  return s;
}

function withWeather(w: Weather): WorldState {
  const s = lush();
  s.weather = w;
  s.forecast = [w, 'sun', 'cloud'];
  return s;
}

export function fixture(id: FixtureId): WorldState {
  switch (id) {
    case 'start':
      return createWorld(1, PRESETS.sunup.rules);
    case 'lush':
      return lush();
    case 'synergy':
      return synergy();
    case 'meadow':
      return meadow();
    case 'night': {
      const s = lush();
      s.minute = 1000;
      return s;
    }
    case 'dusk': {
      const s = lush();
      s.minute = 760;
      return s;
    }
    case 'rain':
      return withWeather('rain');
    case 'storm':
      return withWeather('storm');
    case 'heat':
      return withWeather('heat');
    case 'autumn': {
      const s = lush();
      s.day = 24;
      return s;
    }
    case 'winter': {
      const s = lush();
      s.day = 34;
      s.weather = 'rain';
      return s;
    }
  }
}

/** Plot index helper re-exported for the harness. */
export { idx };
