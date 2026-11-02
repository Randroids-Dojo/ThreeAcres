// The farm's fixed layout. Twenty by fifteen tiles: a yard with the house,
// shipping crate, notice board and bunkhouse along the top, six fields of four
// by four below it split by paths, and a pond in the bottom right.

import type { TileKind } from './types';

export const MAP_W = 20;
export const MAP_H = 15;

// W wood (trees, blocked), . grass, y yard, = path, ~ water, F field.
const ROWS = [
  'WWWWWWWWWWWWWWWWWWWW',
  'Wyyyy..yyyy..yyyy..W',
  'Wyyyyyyyyyy..yyyy..W',
  'Wyyyyyyyyyyyyyyyyy.W',
  'W===================',
  'W.FFFF=FFFF=FFFF...W',
  'W.FFFF=FFFF=FFFF...W',
  'W.FFFF=FFFF=FFFF...W',
  'W.FFFF=FFFF=FFFF...W',
  'W.==============...W',
  'W.FFFF=FFFF=FFFF...W',
  'W.FFFF=FFFF=FFFF.~~W',
  'W.FFFF=FFFF=FFFF.~~W',
  'W.FFFF=FFFF=FFFF.~~W',
  'WWWWWWWWWWWWWWWWWWWW',
];

const KIND: Record<string, TileKind> = { W: 'wood', '.': 'grass', y: 'yard', '=': 'path', '~': 'water', F: 'field' };

export function baseTiles(): TileKind[] {
  const out: TileKind[] = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = ROWS[y];
    if (row.length !== MAP_W) throw new Error(`map row ${y} is ${row.length} wide`);
    for (let x = 0; x < MAP_W; x++) out.push(KIND[row[x]]);
  }
  return out;
}

/** Fields, in the order they are sold. The first is owned from the start. Sunup also wants reputation for the later ones (FIELD_REP). */
export const PARCELS = [
  { x: 2, y: 5, w: 4, h: 4, price: 0 },
  { x: 7, y: 5, w: 4, h: 4, price: 250 },
  { x: 2, y: 10, w: 4, h: 4, price: 800 },
  { x: 7, y: 10, w: 4, h: 4, price: 1500 },
  { x: 12, y: 5, w: 4, h: 4, price: 3000 },
  { x: 12, y: 10, w: 4, h: 4, price: 4500 },
] as const;

export type PropKind = 'house' | 'crate' | 'board' | 'bunkhouse' | 'well';

export interface Prop {
  kind: PropKind;
  /** Footprint, blocked to walking. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The tile in front of it where you stand to use it. */
  doorX: number;
  doorY: number;
}

/** Buildings. Their footprints sit on yard tiles and block walking. */
export const PROPS: readonly Prop[] = [
  { kind: 'house', x: 1, y: 1, w: 3, h: 2, doorX: 2, doorY: 3 },
  { kind: 'crate', x: 5, y: 2, w: 1, h: 1, doorX: 5, doorY: 3 },
  { kind: 'board', x: 8, y: 2, w: 2, h: 1, doorX: 8, doorY: 3 },
  { kind: 'bunkhouse', x: 13, y: 1, w: 3, h: 2, doorX: 14, doorY: 3 },
  { kind: 'well', x: 11, y: 2, w: 1, h: 1, doorX: 11, doorY: 3 },
  // Round 8: a second well where the paths between the first four fields cross, a step from each (two trips a day to
  // the yard well were a third of the watering on two fields, and from the first field a phone could not see it).
  { kind: 'well', x: 6, y: 9, w: 1, h: 1, doorX: 6, doorY: 8 },
];

/** The road off the farm leaves at the east end of the yard path. */
export const ROAD = { x: 19, y: 4 };

/** Where the farmer wakes up. */
export const HOME = { x: PROPS[0].doorX, y: PROPS[0].doorY };

/** Where hands start and go home to. */
export const BUNK = { x: PROPS[3].doorX, y: PROPS[3].doorY };

export const CRATE = { x: PROPS[1].doorX, y: PROPS[1].doorY };

export function propAt(x: number, y: number): Prop | null {
  for (const p of PROPS) if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return p;
  return null;
}
