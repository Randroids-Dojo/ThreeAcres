// Ground and collision for everything that moves: the player, downies, loose
// items and nettlebacks. Static colliders are circles and boxes in plan view
// with a height; walls are straight lines with gate gaps; pens are rings that
// keep a body on the side it was on unless it clears the fence.

import { PEN_R, PADS, HOUSE, WINDMILL, CRATES, BOARD, WORKBENCH, GATE_SIGN, GATES, GATE_HALF, RIDGE_X, HOLLOW_X, RANCH_Z, MINX, MAXX, MINZ, MAXZ, TREES, PINES, WILLOWS, ROCKS, OAK, DEAD_TREE, CRAG, heightAt, waterAt, crossings, type GateId } from './world';
import type { Body, Pad } from './state';

export interface Circ {
  x: number;
  z: number;
  r: number;
  /** Top above the floor; bodies above it pass over. */
  h: number;
}

export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
}

/** A raised walkable floor: garden beds, the porch, footbridges. */
export interface Floor {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Height above the terrain at its centre. */
  y: number;
  /** Rotation of the rectangle around its centre (footbridges). */
  a: number;
  cx: number;
  cz: number;
}

export interface Ring {
  pad: number;
  x: number;
  z: number;
  top: number;
  hedge: boolean;
}

interface Wall {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  gap0: number;
  gap1: number;
  gate: GateId | null;
  h: number;
}

export type BodyKind = 'player' | 'downy' | 'item' | 'nettle';

const CELL = 8;
const NO_RINGS: Ring[] = [];
const INF = 1e9;

/** How far a hedge keeps a pest's edge from the rails (its leaves reach about 1.2 m out; the plot's post stands inside it). */
export const PEST_HEDGE = 1.1;
export const BED_HALF = 2.6;
export const BED_H = 0.38;
export const SILO_R = 1.5;
export const SILO_H = 4.2;
/** Each sell crate's box (the house one first, then the lane one): 1.4 m square, 1 m tall, its backboard on the +z side. */
export const CRATE_BOXES = CRATES.map((c) => ({ x0: c.x - 0.7, z0: c.z - 0.7, x1: c.x + 0.7, z1: c.z + 0.7, h: 1.0 }));
export const CRATE = CRATE_BOXES[0];
export const PORCH = { x0: HOUSE.x - 3.6, z0: HOUSE.z - HOUSE.d / 2 - 1.5, x1: HOUSE.x + 3.6, z1: HOUSE.z - HOUSE.d / 2, y: 0.32 };

export class Physics {
  private grid = new Map<number, Circ[]>();
  private statics: Circ[] = [];
  private padCircs: Circ[] = [];
  boxes: Box[] = [];
  floors: Floor[] = [];
  rings: Ring[] = [];
  gates: Record<GateId, boolean> = { ridge: false, hollow: false };
  private walls: Wall[] = [
    { axis: 'x', at: RIDGE_X, from: MINZ, to: MAXZ, gap0: GATES.ridge.z - GATE_HALF, gap1: GATES.ridge.z + GATE_HALF, gate: 'ridge', h: INF },
    { axis: 'x', at: HOLLOW_X, from: MINZ, to: MAXZ, gap0: GATES.hollow.z - GATE_HALF, gap1: GATES.hollow.z + GATE_HALF, gate: 'hollow', h: INF },
    { axis: 'z', at: RANCH_Z, from: RIDGE_X, to: HOLLOW_X, gap0: -2.2, gap1: 2.2, gate: null, h: 1.0 },
  ];

  constructor() {
    for (const t of TREES) this.statics.push({ x: t.x, z: t.z, r: 0.42 * t.s, h: INF });
    for (const t of PINES) this.statics.push({ x: t.x, z: t.z, r: 0.35 * t.s, h: INF });
    for (const t of WILLOWS) this.statics.push({ x: t.x, z: t.z, r: 0.5 * t.s, h: INF });
    for (const r of ROCKS) this.statics.push({ x: r.x, z: r.z, r: 0.85 * r.s, h: 0.9 * r.s });
    this.statics.push({ x: OAK.x, z: OAK.z, r: 1.1, h: INF });
    this.statics.push({ x: DEAD_TREE.x, z: DEAD_TREE.z, r: 0.6, h: INF });
    this.statics.push({ x: CRAG.x, z: CRAG.z, r: 3.4, h: INF });
    this.statics.push({ x: WINDMILL.x, z: WINDMILL.z, r: 1.7, h: INF });
    this.statics.push({ x: BOARD.x, z: BOARD.z, r: 0.25, h: INF });
    this.statics.push({ x: GATE_SIGN.x, z: GATE_SIGN.z, r: 0.2, h: INF });
    for (const g of Object.values(GATES)) {
      this.statics.push({ x: g.x, z: g.z - GATE_HALF - 0.4, r: 0.55, h: INF });
      this.statics.push({ x: g.x, z: g.z + GATE_HALF + 0.4, r: 0.55, h: INF });
    }
    for (const sx of [-2.6, 2.6]) this.statics.push({ x: sx, z: RANCH_Z, r: 0.3, h: INF });
    this.boxes.push({ x0: HOUSE.x - HOUSE.w / 2, z0: HOUSE.z - HOUSE.d / 2, x1: HOUSE.x + HOUSE.w / 2, z1: HOUSE.z + HOUSE.d / 2, h: INF });
    for (const c of CRATE_BOXES) this.boxes.push(c);
    this.boxes.push({ x0: WORKBENCH.x - 0.5, z0: WORKBENCH.z - 1, x1: WORKBENCH.x + 0.5, z1: WORKBENCH.z + 1, h: 1.0 });
    this.floors.push({ ...PORCH, a: 0, cx: (PORCH.x0 + PORCH.x1) / 2, cz: (PORCH.z0 + PORCH.z1) / 2 });
    for (const c of crossings()) {
      // Footbridge decks: 1.8 wide, 6 long, along the path.
      this.floors.push({ x0: -0.9, x1: 0.9, z0: -3, z1: 3, y: 0, a: c.angle, cx: c.x, cz: c.z });
    }
    this.rebuildGrid();
  }

  /** Pads changed: rebuild pen rings, garden beds and silo walls. */
  setPads(pads: Pad[]): void {
    this.rings = [];
    this.padCircs = [];
    this.floors = this.floors.filter((f) => !(f as Floor & { pad?: boolean }).pad);
    pads.forEach((p, i) => {
      const at = PADS[i];
      this.padCircs.push({ x: at.px, z: at.pz, r: 0.16, h: INF });
      if (p.kind === 'pen') {
        const high = p.ups.includes('high');
        const hedge = p.ups.includes('hedge');
        this.rings.push({ pad: i, x: at.x, z: at.z, top: high ? 2.05 : hedge ? 1.3 : 1.05, hedge });
      } else if (p.kind === 'garden') {
        const f = { x0: at.x - BED_HALF, z0: at.z - BED_HALF, x1: at.x + BED_HALF, z1: at.z + BED_HALF, y: BED_H, a: 0, cx: at.x, cz: at.z, pad: true };
        this.floors.push(f);
      } else if (p.kind === 'silo') {
        this.padCircs.push({ x: at.x, z: at.z, r: SILO_R, h: SILO_H });
      }
    });
    this.rebuildGrid();
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const c of [...this.statics, ...this.padCircs]) {
      const x0 = Math.floor((c.x - c.r) / CELL);
      const x1 = Math.floor((c.x + c.r) / CELL);
      const z0 = Math.floor((c.z - c.r) / CELL);
      const z1 = Math.floor((c.z + c.r) / CELL);
      for (let i = x0; i <= x1; i++) {
        for (let j = z0; j <= z1; j++) {
          const k = i * 1000 + j;
          let a = this.grid.get(k);
          if (!a) this.grid.set(k, (a = []));
          a.push(c);
        }
      }
    }
  }

  /** The surface something stands on: terrain or a raised floor. */
  floor(x: number, z: number): number {
    const h = heightAt(x, z);
    let best = h;
    for (const f of this.floors) {
      let lx = x - f.cx;
      let lz = z - f.cz;
      if (f.a) {
        const c = Math.cos(-f.a);
        const s = Math.sin(-f.a);
        const rx = lx * c - lz * s;
        lz = lx * s + lz * c;
        lx = rx;
        if (lx < f.x0 || lx > f.x1 || lz < f.z0 || lz > f.z1) continue;
        // Bridges span the stream at the height of its banks.
        const top = Math.max(heightAt(f.cx + Math.sin(f.a) * 3, f.cz + Math.cos(f.a) * 3), heightAt(f.cx - Math.sin(f.a) * 3, f.cz - Math.cos(f.a) * 3)) + 0.05;
        if (top > best) best = top;
        continue;
      }
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      const top = heightAt(f.cx, f.cz) + f.y;
      if (top > best) best = top;
    }
    return best;
  }

  /** Where a light thing rests: the floor, or floating on water. */
  rest(x: number, z: number, floats: boolean): number {
    const f = this.floor(x, z);
    if (!floats) return f;
    const w = waterAt(x, z);
    return w > f ? w - 0.04 : f;
  }

  /**
   * Keeps a body out of solid things after it moved from (ox, oz). Returns
   * true if it hit something, so callers can bounce or turn.
   */
  collide(b: Body, ox: number, oz: number, kind: BodyKind): boolean {
    let hit = false;
    const fl = this.floor(b.x, b.z);
    const foot = b.y - fl;
    // Circles.
    const cx = Math.floor(b.x / CELL);
    const cz = Math.floor(b.z / CELL);
    const cell = this.grid.get(cx * 1000 + cz);
    if (cell) {
      for (const c of cell) {
        if (foot > c.h) continue;
        const dx = b.x - c.x;
        const dz = b.z - c.z;
        const rr = c.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        b.x = c.x + (dx / d) * rr;
        b.z = c.z + (dz / d) * rr;
        const vn = (b.vx * dx + b.vz * dz) / d;
        if (vn < 0) {
          const k = kind === 'item' ? 1.5 : 1;
          b.vx -= (dx / d) * vn * k;
          b.vz -= (dz / d) * vn * k;
        }
        hit = true;
      }
    }
    // Boxes.
    for (const q of this.boxes) {
      if (foot > q.h) continue;
      const px = Math.max(q.x0, Math.min(b.x, q.x1));
      const pz = Math.max(q.z0, Math.min(b.z, q.z1));
      const dx = b.x - px;
      const dz = b.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= b.r * b.r) continue;
      if (d2 < 1e-8) {
        // Inside: leave by the nearest face.
        const l = b.x - q.x0;
        const r = q.x1 - b.x;
        const t = b.z - q.z0;
        const bt = q.z1 - b.z;
        const m = Math.min(l, r, t, bt);
        if (m === l) b.x = q.x0 - b.r;
        else if (m === r) b.x = q.x1 + b.r;
        else if (m === t) b.z = q.z0 - b.r;
        else b.z = q.z1 + b.r;
      } else {
        const d = Math.sqrt(d2);
        b.x = px + (dx / d) * b.r;
        b.z = pz + (dz / d) * b.r;
        const vn = (b.vx * dx + b.vz * dz) / d;
        if (vn < 0) {
          b.vx -= (dx / d) * vn * (kind === 'item' ? 1.5 : 1);
          b.vz -= (dz / d) * vn * (kind === 'item' ? 1.5 : 1);
        }
      }
      hit = true;
    }
    // Walls with gate gaps.
    for (const w of this.walls) {
      if (foot > w.h) continue;
      const along = w.axis === 'x' ? b.z : b.x;
      if (along < w.from || along > w.to) continue;
      const open = w.gate === null || this.gates[w.gate];
      if (open && along > w.gap0 + b.r * 0.5 && along < w.gap1 - b.r * 0.5) continue;
      const pos = w.axis === 'x' ? b.x : b.z;
      const prev = w.axis === 'x' ? ox : oz;
      const side = prev - w.at >= 0 ? 1 : -1;
      if ((pos - w.at) * side < b.r) {
        const nv = w.at + side * b.r;
        if (w.axis === 'x') {
          b.x = nv;
          if (b.vx * side < 0) b.vx = kind === 'item' ? -b.vx * 0.4 : 0;
        } else {
          b.z = nv;
          if (b.vz * side < 0) b.vz = kind === 'item' ? -b.vz * 0.4 : 0;
        }
        hit = true;
      }
    }
    // Pen fences: stay on your side unless you clear the top. Food and down
    // in flight are small enough to slip between the rails; rolling, they stop.
    for (const ring of kind === 'item' && !b.grounded ? NO_RINGS : this.rings) {
      const dx = b.x - ring.x;
      const dz = b.z - ring.z;
      const d = Math.hypot(dx, dz);
      // A hedge keeps a pest off its leaves (about 1.2 m out from the rails), no further: a wider band (2.2 m) closed
      // the 2.2 m lane to the next pen on the row and left dead-end pockets a pest could not find its way out of.
      const band = ring.hedge ? (kind === 'nettle' ? PEST_HEDGE : 0.55) : 0.1;
      if (Math.abs(d - PEN_R) > b.r + band + 0.6) continue;
      const top = kind === 'nettle' && ring.hedge ? INF : ring.top;
      if (foot > top) continue;
      const pd = Math.hypot(ox - ring.x, oz - ring.z);
      const inside = pd < PEN_R;
      const lim = inside ? PEN_R - b.r - 0.1 : PEN_R + b.r + band;
      if ((inside && d > lim) || (!inside && d < lim)) {
        const k = (d || 1e-4);
        b.x = ring.x + (dx / k) * lim;
        b.z = ring.z + (dz / k) * lim;
        const vn = (b.vx * dx + b.vz * dz) / k;
        if ((inside && vn > 0) || (!inside && vn < 0)) {
          const bounce = kind === 'item' ? 1.4 : 1;
          b.vx -= (dx / k) * vn * bounce;
          b.vz -= (dz / k) * vn * bounce;
        }
        hit = true;
      }
    }
    // The edge of the world.
    if (b.x < MINX + 2) (b.x = MINX + 2), (b.vx = Math.abs(b.vx) * 0.3), (hit = true);
    if (b.x > MAXX - 2) (b.x = MAXX - 2), (b.vx = -Math.abs(b.vx) * 0.3), (hit = true);
    if (b.z < MINZ + 2) (b.z = MINZ + 2), (b.vz = Math.abs(b.vz) * 0.3), (hit = true);
    if (b.z > MAXZ - 2) (b.z = MAXZ - 2), (b.vz = -Math.abs(b.vz) * 0.3), (hit = true);
    return hit;
  }

  /** The pen a point is inside, or -1. */
  penAt(x: number, z: number): number {
    for (const ring of this.rings) if (Math.hypot(x - ring.x, z - ring.z) < PEN_R - 0.05) return ring.pad;
    return -1;
  }

  ring(pad: number): Ring | undefined {
    return this.rings.find((r) => r.pad === pad);
  }
}
