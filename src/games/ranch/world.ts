// The valley: one continuous map, 160 by 120 m. North is -z. The ranch sits on
// a plateau in the south, Clover Meadow fills the middle, Ember Ridge climbs to
// the west behind a stone wall and Brook Hollow sinks to the east behind
// another. Everything here is static data: heights, zones, paths, the stream,
// landmarks and where props grow. Built once from a fixed seed.

import { clamp, fbm, lerp, noise2, rng, smoothstep } from './noise';

export const MINX = -80;
export const MAXX = 80;
export const MINZ = -60;
export const MAXZ = 60;
export const RIDGE_X = -36;
export const HOLLOW_X = 36;
export const RANCH_Z = 18;

export type Zone = 'ranch' | 'meadow' | 'ridge' | 'hollow';

export function zoneAt(x: number, z: number): Zone {
  if (x < RIDGE_X) return 'ridge';
  if (x > HOLLOW_X) return 'hollow';
  return z > RANCH_Z ? 'ranch' : 'meadow';
}

export const ZONE_NAMES: Record<Zone, string> = {
  ranch: 'The ranch',
  meadow: 'Clover Meadow',
  ridge: 'Ember Ridge',
  hollow: 'Brook Hollow',
};

export type V2 = [number, number];

// ---------------------------------------------------------------- landmarks

export const HOUSE = { x: -16, z: 43, w: 8, d: 6 };
export const DOOR = { x: -16, z: 39.6 };
export const WINDMILL = { x: -27, z: 37 };
export const EXCHANGE = { x: -6.5, z: 36.5 };
/**
 * A second sell crate in the lane between the pens (round 8: selling from the far pens was a 25 m walk to the
 * one by the house): between the middle and east columns, open to the north row as the house one is.
 */
export const LANE_CRATE = { x: 22.5, z: 35 };
/** Every sell crate: the house one first (the lessons' and the board's), then the lane one. */
export const CRATES = [EXCHANGE, LANE_CRATE];
export const BOARD = { x: -4.2, z: 37.6 };
export const WORKBENCH = { x: -10.6, z: 41.2 };
export const START = { x: -15.5, z: 37.2, yaw: -0.55 };
export const PEN_R = 4.4;
export const PADS: { x: number; z: number; px: number; pz: number }[] = [];
for (const [row, z] of [
  [0, 26.5],
  [1, 43.5],
] as const) {
  for (const x of [6, 17, 28]) {
    // The post stands at the lane side of the pad.
    const pz = row === 0 ? z + PEN_R + 0.9 : z - PEN_R - 0.9;
    PADS.push({ x, z, px: x - 2.2, pz });
  }
}
export const RANCH_GATE = { x: 0, z: RANCH_Z };
export const GATE_SIGN = { x: 2.6, z: 19.4 };
export const GATES = {
  ridge: { x: RIDGE_X, z: -10, cost: 500, name: 'Ember Ridge' },
  hollow: { x: HOLLOW_X, z: -24, cost: 1200, name: 'Brook Hollow' },
} as const;
export type GateId = keyof typeof GATES;
export const GATE_HALF = 1.7;
export const OAK = { x: 7, z: -40 };
export const FORK = { x: 0, z: -4 };
export const CRAG = { x: -64, z: -34 };
export const VENTS: V2[] = [
  [-46, -19],
  [-51, -5],
  [-58, -15],
  [-47, 8],
];
export const RIDGE_TOP = { x: -60, z: -26 };
export const POND = { x: 57, z: -6, r: 12.5, level: -0.85 };
export const DEAD_TREE = { x: 45.5, z: 7 };

// ---------------------------------------------------------------- paths and the stream

export const SPRING = { x: -17, z: -47 };
export const STREAM: V2[] = [
  [SPRING.x, SPRING.z],
  [-8, -31],
  [2, -24],
  [12, -18.5],
  [22, -15.5],
  [30, -14],
  [37, -13.5],
  [44, -12],
  [50, -9],
];

export const PATHS: V2[][] = [
  // porch to the lane between the pads, and the lane to the ranch gate
  [
    [-16, 38.6],
    [-9, 35.8],
    [0, 35],
    [34, 35],
  ],
  [
    [0, 35],
    [0, 26],
    [0, 18],
    [1, 8],
    [FORK.x, FORK.z],
  ],
  // to the ridge gate, up past the vents to the crag
  [
    [FORK.x, FORK.z],
    [-12, -8],
    [-25, -9.5],
    [RIDGE_X, -10],
    [-44, -13.5],
    [-50, -19],
    [-55, -25],
    [-60, -29],
  ],
  // to the hollow gate, over the footbridge, down to the dead tree
  [
    [FORK.x, FORK.z],
    [10, -10.5],
    [20, -16],
    [30, -22.5],
    [HOLLOW_X, -24],
    [42, -22],
    [44, -14],
    [44, -4],
    [45, 4],
  ],
  // north to the old oak
  [
    [FORK.x, FORK.z],
    [-2, -16],
    [-4, -26],
    [-1, -34],
    [OAK.x - 2, -38.5],
  ],
];

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function polyDist(px: number, pz: number, line: V2[]): number {
  let best = 1e9;
  for (let i = 0; i < line.length - 1; i++) {
    const d = segDist(px, pz, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

function pathDistRaw(x: number, z: number): number {
  let d = 1e9;
  for (const p of PATHS) d = Math.min(d, polyDist(x, z, p));
  return d;
}

/** Where paths cross the stream: footbridges. */
export function crossings(): { x: number; z: number; angle: number }[] {
  const out: { x: number; z: number; angle: number }[] = [];
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      for (let j = 0; j < STREAM.length - 1; j++) {
        const [ax, az] = p[i];
        const [bx, bz] = p[i + 1];
        const [cx, cz] = STREAM[j];
        const [dx, dz] = STREAM[j + 1];
        const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
        if (Math.abs(den) < 1e-6) continue;
        const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den;
        const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, angle: Math.atan2(bx - ax, bz - az) });
      }
    }
  }
  return out;
}

/**
 * Where the morning board's rare downy was seen: a landmark you can find
 * (the old oak, the spring, the crag, the dead tree), by kind, each name the
 * only one of its kind in the valley. It is there, a few metres from the
 * spot, from when you take the order until dusk. (The seventh playtest's "by
 * the footbridge" had two footbridges in the meadow to choose from, and the
 * first one reached was 25 m from the downy: the spring, ringed with stones
 * where the stream rises, took its place.)
 */
export const SIGHTINGS: { kind: 'clover' | 'ember' | 'brook'; name: string; x: number; z: number }[] = (() => {
  return [
    { kind: 'clover', name: 'the old oak', x: OAK.x + 4.2, z: OAK.z + 3.2 },
    { kind: 'clover', name: 'the signpost', x: FORK.x + 4.5, z: FORK.z - 5 },
    { kind: 'clover', name: 'the spring', x: SPRING.x - 3.5, z: SPRING.z + 2 },
    { kind: 'ember', name: 'the crag', x: CRAG.x + 4.5, z: CRAG.z + 3.5 },
    { kind: 'ember', name: 'the steam vents', x: VENTS[2][0] + 3.5, z: VENTS[2][1] + 3 },
    { kind: 'brook', name: 'the dead tree', x: DEAD_TREE.x + 3, z: DEAD_TREE.z + 2.5 },
    { kind: 'brook', name: 'the pond', x: POND.x - 3, z: POND.z + POND.r + 3 },
  ];
})();

// ---------------------------------------------------------------- the heightfield

const GW = MAXX - MINX + 1;
const GD = MAXZ - MINZ + 1;
const heights = new Float32Array(GW * GD);
const grassD = new Float32Array(GW * GD);
const ridgeT = new Float32Array(GW * GD);
const hollowT = new Float32Array(GW * GD);
const pathT = new Float32Array(GW * GD);
const streamBed = new Float32Array(GW * GD);

function ridged(x: number, z: number): number {
  return 1 - Math.abs(fbm(x, z, 3, 31));
}

function rawHeight(x: number, z: number): number {
  let h = 2.2 + fbm(x * 0.024, z * 0.024, 4, 1) * 2.8 + fbm(x * 0.09, z * 0.09, 2, 5) * 0.35;
  // The old oak sits on a knoll.
  h += 2.2 * (1 - smoothstep(0, 11, Math.hypot(x - OAK.x, z - OAK.z)));
  // The ranch plateau.
  const rp = smoothstep(11, 21, z);
  h = lerp(h, 5 + fbm(x * 0.05, z * 0.05, 2, 9) * 0.22, rp);
  // Ember Ridge climbs west.
  const rt = smoothstep(-33, -45, x);
  const ridge = 4.2 + Math.max(0, -x - 40) * 0.3 + ridged(x * 0.045, z * 0.045) * (0.6 + 2.6 * smoothstep(-40, -54, x)) + fbm(x * 0.12, z * 0.12, 2, 41) * 0.6;
  const crag = 4 * (1 - smoothstep(4, 16, Math.hypot(x - CRAG.x, z - CRAG.z)));
  h = lerp(h, ridge + crag, rt);
  // Brook Hollow sinks into a pond basin.
  const ht = smoothstep(33, 44, x);
  const dp = Math.hypot(x - POND.x, (z - POND.z) * 1.1);
  const basin = 1.7 + fbm(x * 0.05, z * 0.05, 3, 51) * 0.6 - 3.7 * (1 - smoothstep(5, 22, dp));
  h = lerp(h, basin, ht);
  // Rims close the valley in.
  h += smoothstep(-44, -60, z) * (x < RIDGE_X ? 3 : 8);
  h += smoothstep(49, 60, z) * 6;
  h += smoothstep(66, 80, x) * 9;
  h += smoothstep(-70, -80, x) * 4;
  return h;
}

function streamCarve(x: number, z: number, h: number): { h: number; bed: number } {
  const ds = polyDist(x, z, STREAM);
  if (ds > 4) return { h, bed: -99 };
  const c = 1 - smoothstep(0.9, 3.4, ds);
  return { h: h - c * 1.15, bed: h - 1.15 };
}

for (let j = 0; j < GD; j++) {
  for (let i = 0; i < GW; i++) {
    const x = MINX + i;
    const z = MINZ + j;
    const k = j * GW + i;
    const raw = rawHeight(x, z);
    const s = streamCarve(x, z, raw);
    heights[k] = s.h;
    streamBed[k] = s.bed;
    const pd = pathDistRaw(x, z);
    pathT[k] = 1 - smoothstep(0.9, 2.1, pd);
    ridgeT[k] = smoothstep(-35, -40, x);
    hollowT[k] = smoothstep(35, 40, x);
  }
}

// Soften the heightfield once so slopes read as rolling, not lumpy.
{
  const copy = heights.slice();
  for (let j = 1; j < GD - 1; j++) {
    for (let i = 1; i < GW - 1; i++) {
      const k = j * GW + i;
      heights[k] = copy[k] * 0.5 + (copy[k - 1] + copy[k + 1] + copy[k - GW] + copy[k + GW]) * 0.125;
    }
  }
}

function sample(arr: Float32Array, x: number, z: number): number {
  const fx = clamp(x - MINX, 0, GW - 1.001);
  const fz = clamp(z - MINZ, 0, GD - 1.001);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const k = j * GW + i;
  const a = arr[k];
  const b = arr[k + 1];
  const c = arr[k + GW];
  const d = arr[k + GW + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

export function heightAt(x: number, z: number): number {
  return sample(heights, x, z);
}

export function pathAt(x: number, z: number): number {
  return sample(pathT, x, z);
}

export function normalY(x: number, z: number): number {
  const hx = heightAt(x + 0.5, z) - heightAt(x - 0.5, z);
  const hz = heightAt(x, z + 0.5) - heightAt(x, z - 0.5);
  return 1 / Math.hypot(hx, 1, hz);
}

/** The water surface at a point, or -99 if dry. */
export function waterAt(x: number, z: number): number {
  const dp = Math.hypot(x - POND.x, (z - POND.z) * 1.1);
  if (dp < POND.r + 6 && heightAt(x, z) < POND.level) return POND.level;
  const ds = polyDist(x, z, STREAM);
  if (ds < 1.7) {
    const bed = sample(streamBed, x, z);
    if (bed > -90) return bed + 0.55;
  }
  return -99;
}

export function streamSurface(x: number, z: number): number {
  return sample(streamBed, x, z) + 0.55;
}

export const GRID = { w: GW, d: GD, heights, grassD, ridgeT, hollowT, pathT };

// ---------------------------------------------------------------- what grows where

export interface Placed {
  x: number;
  z: number;
  s: number;
  r: number;
  /** A small variety index. */
  v: number;
}

const R = rng(20261030);
const rr = (a: number, b: number) => a + R() * (b - a);

function clearOf(x: number, z: number, keep: number): boolean {
  if (pathAt(x, z) > 0.05) return false;
  if (polyDist(x, z, STREAM) < 2.6 + keep) return false;
  if (waterAt(x, z) > -90) return false;
  if (Math.abs(x - RIDGE_X) < 2.5 + keep || Math.abs(x - HOLLOW_X) < 2.5 + keep) return false;
  if (Math.abs(z - RANCH_Z) < 2 + keep && x > RIDGE_X && x < HOLLOW_X) return false;
  if (x < MINX + 3 || x > MAXX - 3 || z < MINZ + 3 || z > MAXZ - 3) return false;
  return true;
}

function ranchFree(x: number, z: number, keep: number): boolean {
  if (z < RANCH_Z || x < RIDGE_X || x > HOLLOW_X) return true;
  if (Math.abs(x - HOUSE.x) < HOUSE.w / 2 + 3 + keep && Math.abs(z - HOUSE.z) < HOUSE.d / 2 + 4 + keep) return false;
  if (Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 4 + keep) return false;
  if (Math.hypot(x - EXCHANGE.x, z - EXCHANGE.z) < 4 + keep) return false;
  for (const p of PADS) if (Math.hypot(x - p.x, z - p.z) < PEN_R + 2.5 + keep) return false;
  return true;
}

function scatterCluster(out: Placed[], cx: number, cz: number, rad: number, n: number, smin: number, smax: number, keep: number, zone?: Zone): void {
  for (let i = 0, tries = 0; i < n && tries < n * 12; tries++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * rad;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    if (!clearOf(x, z, keep) || !ranchFree(x, z, keep)) continue;
    if (zone && zoneAt(x, z) !== zone) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (o.s + smin) * keep * 1.2 + 0.6)) continue;
    out.push({ x, z, s: rr(smin, smax), r: R() * Math.PI * 2, v: Math.floor(R() * 4) });
    i++;
  }
}

/** Broadleaf trees: groves and hedgerows, never an even scatter. */
export const TREES: Placed[] = [];
/** Pines and junipers up on the ridge. */
export const PINES: Placed[] = [];
/** Willows around the pond. */
export const WILLOWS: Placed[] = [];
export const ROCKS: Placed[] = [];
export const CLOVER_PATCHES: Placed[] = [];
export const BERRY_BUSHES: Placed[] = [];
export const ROOT_PATCHES: Placed[] = [];
export const REEDS: Placed[] = [];
export const LILIES: Placed[] = [];
export const FLOWERS: Placed[] = [];

// Meadow groves: a big one in the north-east, birches along the west wall, a
// line of trees shading the south edge under the plateau.
scatterCluster(TREES, 26, -44, 12, 11, 0.9, 1.3, 1.6, 'meadow');
scatterCluster(TREES, -28, -42, 8, 6, 0.8, 1.15, 1.6, 'meadow');
scatterCluster(TREES, -30, -20, 6, 4, 0.8, 1.1, 1.6, 'meadow');
scatterCluster(TREES, 29, 4, 6, 4, 0.85, 1.2, 1.6, 'meadow');
scatterCluster(TREES, -24, 8, 5, 3, 0.8, 1.0, 1.6, 'meadow');
// The ranch: shade trees behind the house and along the south rim.
scatterCluster(TREES, -26, 50, 7, 4, 0.9, 1.2, 1.6, 'ranch');
scatterCluster(TREES, 10, 54, 14, 6, 0.9, 1.25, 1.6, 'ranch');
scatterCluster(TREES, -32, 24, 4, 2, 0.8, 1.0, 1.6, 'ranch');
// Hollow: willows ring the pond; a thicket in the far corner.
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2 + rr(-0.2, 0.2);
  const d = POND.r + rr(3.5, 7);
  const x = POND.x + Math.cos(a) * d;
  const z = POND.z + Math.sin(a) * d / 1.1;
  if (clearOf(x, z, 1) && x > HOLLOW_X + 3 && Math.hypot(x - DEAD_TREE.x, z - DEAD_TREE.z) > 7) WILLOWS.push({ x, z, s: rr(0.9, 1.25), r: R() * 6.28, v: 0 });
}
scatterCluster(TREES, 66, 34, 8, 5, 0.9, 1.2, 1.6, 'hollow');
scatterCluster(TREES, 62, -40, 8, 5, 0.9, 1.2, 1.6, 'hollow');
// Ridge: a few gnarled pines, more near the top.
scatterCluster(PINES, -66, -12, 10, 6, 0.8, 1.2, 1.4, 'ridge');
scatterCluster(PINES, -56, 22, 12, 6, 0.8, 1.2, 1.4, 'ridge');
scatterCluster(PINES, -70, -44, 8, 4, 0.8, 1.1, 1.4, 'ridge');
scatterCluster(PINES, -60, 46, 8, 4, 0.8, 1.1, 1.4, 'ridge');

// Rocks: boulder fields on the ridge, a few in the meadow, stones by the stream.
scatterCluster(ROCKS, -52, -30, 12, 16, 0.5, 1.6, 1, 'ridge');
scatterCluster(ROCKS, -62, 6, 12, 14, 0.5, 1.5, 1, 'ridge');
scatterCluster(ROCKS, -48, 36, 10, 10, 0.4, 1.3, 1, 'ridge');
scatterCluster(ROCKS, CRAG.x, CRAG.z, 9, 10, 0.8, 1.9, 1, 'ridge');
scatterCluster(ROCKS, -14, -50, 8, 5, 0.3, 0.9, 1, 'meadow');
scatterCluster(ROCKS, 18, -30, 5, 3, 0.3, 0.8, 1, 'meadow');
scatterCluster(ROCKS, 60, -30, 8, 5, 0.3, 0.9, 1, 'hollow');

// Food sources. Clover in the meadow, sweetroot by the vents, dewberries by
// the stream and around the pond.
for (const [cx, cz, n] of [
  [-18, -6, 3],
  [14, -2, 3],
  [-10, -46, 3],
  [22, -34, 3],
  [-24, -30, 2],
  [12, 8, 2],
  [-16, 4, 2],
] as const) {
  scatterCluster(CLOVER_PATCHES, cx, cz, 5, n, 1, 1, 2, 'meadow');
}
for (const [cx, cz] of [
  [-10, -36],
  [6, -27],
  [26, -10],
]) {
  scatterCluster(BERRY_BUSHES, cx, cz, 4, 2, 0.9, 1.1, 2, 'meadow');
}
for (const [cx, cz] of [
  [64, 18],
  [46, -32],
  [68, -24],
  [52, 22],
]) {
  scatterCluster(BERRY_BUSHES, cx, cz, 5, 3, 0.9, 1.15, 2, 'hollow');
}
for (const [vx, vz] of VENTS) scatterCluster(ROOT_PATCHES, vx + 3, vz + 2, 5, 3, 1, 1, 2, 'ridge');

// Reeds in beds around the pond shallows and at the stream mouth.
for (let i = 0; i < 70; i++) {
  const bed = i % 3;
  const a = [0.6, 2.4, 4.4][bed] + rr(-0.5, 0.5);
  const d = POND.r + rr(-2.2, 1.4);
  const x = POND.x + Math.cos(a) * d;
  const z = POND.z + Math.sin(a) * d / 1.1;
  const h = heightAt(x, z);
  if (h > POND.level - 0.6 && h < POND.level + 0.7) REEDS.push({ x, z, s: rr(0.7, 1.3), r: R() * 6.28, v: Math.floor(R() * 3) });
}
for (let i = 0; i < 26; i++) {
  const t = R();
  const j = Math.floor(R() * (STREAM.length - 3)) + 2;
  const [ax, az] = STREAM[j];
  const [bx, bz] = STREAM[j + 1];
  const x = ax + (bx - ax) * t + rr(-1.8, 1.8);
  const z = az + (bz - az) * t + rr(-1.8, 1.8);
  if (polyDist(x, z, STREAM) > 1.1 && pathAt(x, z) < 0.05) REEDS.push({ x, z, s: rr(0.6, 1), r: R() * 6.28, v: Math.floor(R() * 3) });
}
for (let i = 0; i < 26; i++) {
  const a = R() * Math.PI * 2;
  const d = Math.sqrt(R()) * (POND.r - 2.5);
  const x = POND.x + Math.cos(a) * d;
  const z = POND.z + (Math.sin(a) * d) / 1.1;
  if (heightAt(x, z) < POND.level - 0.3) LILIES.push({ x, z, s: rr(0.5, 1.1), r: R() * 6.28, v: Math.floor(R() * 4) });
}
// Wildflower drifts: lilac and apricot, in patches rather than everywhere.
for (const [cx, cz, n, zone] of [
  [-20, -16, 26, 'meadow'],
  [18, -26, 22, 'meadow'],
  [8, 2, 18, 'meadow'],
  [-6, -52, 18, 'meadow'],
  [-28, 30, 14, 'ranch'],
  [24, 50, 12, 'ranch'],
  [62, 8, 18, 'hollow'],
  [-52, 18, 10, 'ridge'],
] as const) {
  scatterCluster(FLOWERS, cx, cz, 7, n, 0.6, 1.1, 0.3, zone);
}

// ---------------------------------------------------------------- grass density

for (let j = 0; j < GD; j++) {
  for (let i = 0; i < GW; i++) {
    const x = MINX + i;
    const z = MINZ + j;
    const k = j * GW + i;
    let d = 0.72 + noise2(x * 0.11, z * 0.11, 77) * 0.45;
    const zone = zoneAt(x, z);
    if (zone === 'ridge') d = smoothstep(0.42, 0.75, noise2(x * 0.09, z * 0.09, 81)) * 0.75 + 0.08;
    if (zone === 'hollow') d = 0.9;
    if (zone === 'ranch') d = 0.75 + noise2(x * 0.2, z * 0.2, 83) * 0.25;
    d *= 1 - pathT[k];
    const ds = polyDist(x, z, STREAM);
    d *= smoothstep(1.4, 2.4, ds);
    if (waterAt(x, z) > -90) d = 0;
    if (zone === 'hollow') d *= smoothstep(POND.level + 0.1, POND.level + 0.6, heights[k]);
    if (!ranchFree(x, z, -2.2)) d *= 0.15;
    if (Math.abs(x - RIDGE_X) < 1.2 || Math.abs(x - HOLLOW_X) < 1.2) d = 0;
    grassD[k] = clamp(d, 0, 1);
  }
}

/** Clear or restore grass in a disc (pads change what grows on them). */
export function setGrassDisc(cx: number, cz: number, r: number, amount: number): void {
  for (let j = Math.floor(cz - r - MINZ); j <= Math.ceil(cz + r - MINZ); j++) {
    for (let i = Math.floor(cx - r - MINX); i <= Math.ceil(cx + r - MINX); i++) {
      if (i < 0 || j < 0 || i >= GW || j >= GD) continue;
      const x = MINX + i;
      const z = MINZ + j;
      const d = Math.hypot(x - cx, z - cz);
      if (d > r) continue;
      grassD[j * GW + i] = amount * smoothstep(r, r - 1.2, d) + grassD[j * GW + i] * (1 - smoothstep(r, r - 1.2, d));
    }
  }
}
