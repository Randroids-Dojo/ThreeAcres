// A new farm, and small helpers for reading tiles. The starting farm is the
// same under every rule set: one field tilled, four radishes ready to pull and
// a row of carrots coming up, so the first minute has something to do.

import { CROP_IDS, stageOf } from './crops';
import { AP_MAX, CAN_WATER, DAYS_PER_SEASON, STAMINA_MAX, START_COINS } from './constants';
import { HOME, MAP_H, MAP_W, PARCELS, baseTiles, propAt } from './map';
import type { Actor, CropId, Plot, Rules, Season, WorldState } from './types';

export function emptyStock(): Record<CropId, number[]> {
  const out = {} as Record<CropId, number[]>;
  for (const id of CROP_IDS) out[id] = [0, 0, 0, 0];
  return out;
}

export function newFarmer(): Actor {
  return {
    id: 1,
    role: 'farmer',
    name: 'You',
    x: HOME.x + 0.5,
    y: HOME.y + 0.5,
    facing: 's',
    angle: Math.PI / 2,
    moving: false,
    walked: 0,
    task: null,
    path: [],
    job: null,
    hop: 0,
    tint: 0,
    away: false,
    aim: null,
  };
}

export function createWorld(seed: number, rules: Rules): WorldState {
  const tiles = baseTiles();
  const parcelOf = new Array<number>(MAP_W * MAP_H).fill(-1);
  const parcels = PARCELS.map((p, id) => ({ id, ...p, owned: id === 0 }));
  for (const p of parcels) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) parcelOf[y * MAP_W + x] = p.id;

  const plotList: Plot[] = tiles.map((_, i) => ({
    tilled: parcelOf[i] === 0,
    wet: false,
    moisture: 1,
    nutrient: parcelOf[i] === 0 ? 2 : 3,
    crop: null,
  }));

  const s: WorldState = {
    version: 1,
    worldSeed: seed,
    rng: seed | 0,
    nextId: 100,
    rules: { ...rules },
    W: MAP_W,
    H: MAP_H,
    tiles,
    parcelOf,
    plots: plotList,
    parcels,
    builds: [],
    actors: [newFarmer()],
    crows: [],
    jobs: [],
    day: 1,
    minute: 0,
    weather: 'sun',
    forecast: ['cloud', 'rain', 'sun'],
    stamina: STAMINA_MAX,
    staminaMax: STAMINA_MAX,
    water: CAN_WATER[0],
    tools: { can: 0, hoe: 0 },
    ap: AP_MAX,
    apMax: AP_MAX,
    speed: 1,
    tool: rules.tools === 'smart' ? 'smart' : 'hands',
    kitTool: 'hands',
    seed: 'radish',
    buildKind: 'scarecrow',
    coins: START_COINS,
    stock: emptyStock(),
    market: { demand: Object.fromEntries(CROP_IDS.map((c) => [c, 1])) as Record<CropId, number> },
    orders: [],
    rep: 0,
    almanac: {
      round: 0,
      goals: [],
      stars: 0,
      history: [],
      unlocked: ['radish', 'lettuce', 'carrot'],
      draft: null,
      harvested: 0,
      kinds: [],
      fine: 0,
      earned: 0,
      withered: 0,
    },
    milestones: {},
    stats: { harvested: Object.fromEntries(CROP_IDS.map((c) => [c, 0])) as Record<CropId, number>, earned: 0, days: 0, playtime: {} },
    report: null,
    time: 0,
    night: 0,
    turnover: -1,
    crowPlan: [],
    learn: [],
    learnCount: {},
  };

  // Four radishes ready, four thirsty carrots on their way, the rest tilled and bare.
  for (let x = 2; x < 6; x++) plant(s, x, 5, 'radish', 3);
  for (let x = 2; x < 6; x++) plant(s, x, 6, 'carrot', 2);
  for (let x = 2; x < 6; x++) {
    plots(s, x, 5).wet = true;
    plots(s, x, 5).moisture = 3;
  }
  return s;
}

/** Puts a crop down with a given age. Used by setup, fixtures and tests. */
export function plant(s: WorldState, x: number, y: number, kind: CropId, age = 0): void {
  const p = plots(s, x, y);
  p.tilled = true;
  p.crop = { id: s.nextId++, kind, age, stage: stageOf(kind, age), dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: s.day };
}

export function inMap(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

export function idx(x: number, y: number): number {
  return y * MAP_W + x;
}

export function plots(s: WorldState, x: number, y: number): Plot {
  return s.plots[idx(x, y)];
}

export function isField(s: WorldState, x: number, y: number): boolean {
  return inMap(x, y) && s.tiles[idx(x, y)] === 'field';
}

export function owned(s: WorldState, x: number, y: number): boolean {
  if (!isField(s, x, y)) return false;
  const id = s.parcelOf[idx(x, y)];
  return id >= 0 && s.parcels[id].owned;
}

export function buildAt(s: WorldState, x: number, y: number) {
  return s.builds.find((b) => b.x === x && b.y === y) ?? null;
}

/** Can an actor stand on this tile? */
export function walkable(s: WorldState, x: number, y: number): boolean {
  if (!inMap(x, y)) return false;
  const k = s.tiles[idx(x, y)];
  if (k === 'wood' || k === 'water') return false;
  if (propAt(x, y)) return false;
  return true;
}

export function season(day: number): Season {
  return (Math.floor((day - 1) / DAYS_PER_SEASON) % 4) as Season;
}

export function dayOfSeason(day: number): number {
  return ((day - 1) % DAYS_PER_SEASON) + 1;
}

export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;

/** Hour as a float, 6 to 24. */
export function hourOf(minute: number): number {
  return 6 + minute / 60;
}

/** 0 at night, 1 in the middle of the day. Dawn ramps 6 to 8, dusk 18 to 22. */
export function daylightOf(minute: number): number {
  const h = hourOf(minute);
  if (h < 8) return 0.35 + 0.65 * ((h - 6) / 2);
  if (h < 18) return 1;
  if (h < 22) return 1 - 0.8 * ((h - 18) / 4);
  return 0.2;
}
