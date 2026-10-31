// Merges many small parts into one geometry with vertex colours and a sway
// weight, so a whole tree belt or a crop model is a single draw. Also the
// primitive shapes the diorama is built from.

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix3,
  Matrix4,
  SphereGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Paint = Color | ((world: Vector3, normal: Vector3, local: Vector3) => Color);
export type Sway = number | ((world: Vector3, local: Vector3) => number);

const _w = new Vector3();
const _l = new Vector3();
const _n = new Vector3();
const _nm = new Matrix3();

export class GeoBuilder {
  private p: number[] = [];
  private n: number[] = [];
  private c: number[] = [];
  private s: number[] = [];

  /** Adds a part. flat gives it faceted normals; sway is a weight in world units at full wind. */
  add(geo: BufferGeometry, m: Matrix4, paint: Paint, opts: { flat?: boolean; sway?: Sway } = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (opts.flat) {
      if (g === geo) g = geo.clone();
      g.computeVertexNormals();
    }
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    _nm.getNormalMatrix(m);
    const fn = typeof paint === 'function' ? paint : null;
    const sw = opts.sway;
    for (let i = 0; i < pos.count; i++) {
      _l.fromBufferAttribute(pos, i);
      _w.copy(_l).applyMatrix4(m);
      _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
      const k = fn ? fn(_w, _n, _l) : (paint as Color);
      this.p.push(_w.x, _w.y, _w.z);
      this.n.push(_n.x, _n.y, _n.z);
      this.c.push(k.r, k.g, k.b);
      this.s.push(sw === undefined ? 0 : typeof sw === 'number' ? sw : sw(_w, _l));
    }
    if (g !== geo) g.dispose();
    return this;
  }

  /** Adds raw triangles (world positions, one colour each triangle), faceted. */
  tri(a: Vector3, b: Vector3, c: Vector3, k: Color, sway: [number, number, number] = [0, 0, 0]): this {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) {
      this.n.push(nx, ny, nz);
      this.c.push(k.r, k.g, k.b);
    }
    this.s.push(sway[0], sway[1], sway[2]);
    return this;
  }

  get count(): number {
    return this.p.length / 3;
  }

  build(withSway = false): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.c, 3));
    if (withSway) g.setAttribute('aSway', new Float32BufferAttribute(this.s, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Primitives, cached by shape so building a thousand tufts does not make a thousand geometries.
const cache = new Map<string, BufferGeometry>();
function cached(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

/**
 * A bevelled toy block, centred. Small parts whose bevel would be under a
 * pixel are plain boxes; the rest get one or two bevel segments.
 */
export function block(w: number, h: number, d: number, r = 0.02, seg = 1): BufferGeometry {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  if (rr < 0.011 || Math.min(w, h, d) < 0.03) return cached(`B${w},${h},${d}`, () => new BoxGeometry(w, h, d));
  const sg = Math.min(seg, rr >= 0.05 ? 2 : 1);
  return cached(`b${w},${h},${d},${rr},${sg}`, () => new RoundedBoxGeometry(w, h, d, sg, Math.max(rr, 1e-4)));
}

/** A cylinder standing on y = 0. */
export function cyl(rTop: number, rBot: number, h: number, seg = 7, open = false): BufferGeometry {
  return cached(`c${rTop},${rBot},${h},${seg},${open}`, () => new CylinderGeometry(rTop, rBot, h, seg, 1, open).translate(0, h / 2, 0));
}

/** A cone standing on y = 0. */
export function cone(r: number, h: number, seg = 7): BufferGeometry {
  return cached(`k${r},${h},${seg}`, () => new ConeGeometry(r, h, seg, 1).translate(0, h / 2, 0));
}

/** A low-poly blob, centred. */
export function ico(r: number, detail = 0): BufferGeometry {
  return cached(`i${r},${detail}`, () => new IcosahedronGeometry(r, detail));
}

/** A smooth ball, centred. */
export function ball(r: number, w = 10, h = 7): BufferGeometry {
  return cached(`s${r},${w},${h}`, () => new SphereGeometry(r, w, h));
}

/**
 * A leaf lying along +X from the origin, facing up, with a folded midrib and
 * a tip that curls down by bend radians. shape 0 is pointed, 1 is round.
 */
export function leaf(len: number, width: number, bend = 0.4, shape = 0, segs = 4): BufferGeometry {
  return cached(`l${len},${width},${bend},${shape},${segs}`, () => {
    const pos: number[] = [];
    const mid: Vector3[] = [];
    const left: Vector3[] = [];
    const right: Vector3[] = [];
    let x = 0;
    let y = 0;
    let ang = 0.25;
    const step = len / segs;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const prof = shape === 0 ? Math.pow(Math.sin(Math.PI * t), 0.75) : Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.02)), 0.45);
      const w = (width / 2) * (i === 0 ? 0.15 : prof);
      mid.push(new Vector3(x, y, 0));
      left.push(new Vector3(x, y - w * 0.35, -w));
      right.push(new Vector3(x, y - w * 0.35, w));
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
      ang -= bend / segs;
    }
    const push = (a: Vector3, b: Vector3, c: Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < segs; i++) {
      push(mid[i], left[i + 1], left[i]);
      push(mid[i], mid[i + 1], left[i + 1]);
      push(mid[i], right[i], right[i + 1]);
      push(mid[i], right[i + 1], mid[i + 1]);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  });
}

/** A grass blade: a thin tapered triangle pair standing on y = 0, leaning towards +X. */
export function blade(h: number, w: number, lean = 0.15): BufferGeometry {
  return cached(`g${h},${w},${lean}`, () => {
    const pos = [
      -w / 2, 0, 0, w / 2, 0, 0, lean * 0.45 + w * 0.15, h * 0.55, 0,
      -w / 2, 0, 0, lean * 0.45 + w * 0.15, h * 0.55, 0, lean * 0.45 - w * 0.2, h * 0.55, 0,
      lean * 0.45 - w * 0.2, h * 0.55, 0, lean * 0.45 + w * 0.15, h * 0.55, 0, lean, h, 0,
    ];
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    // Normals point up and a little forward so blades read as lit from above.
    const n: number[] = [];
    for (let i = 0; i < 9; i++) n.push(0, 0.8, 0.6);
    g.setAttribute('normal', new Float32BufferAttribute(n, 3));
    return g;
  });
}

/** A flat polygon disc on y = 0, facing up. */
export function disc(r: number, seg = 8): BufferGeometry {
  return cached(`d${r},${seg}`, () => {
    const pos: number[] = [];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      pos.push(0, 0, 0, Math.cos(a1) * r, 0, Math.sin(a1) * r, Math.cos(a0) * r, 0, Math.sin(a0) * r);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const n: number[] = [];
    for (let i = 0; i < pos.length / 3; i++) n.push(0, 1, 0);
    g.setAttribute('normal', new Float32BufferAttribute(n, 3));
    return g;
  });
}

/** Builds a quick shape from a builder callback, for one-off parts. */
export function shape(fn: (b: GeoBuilder) => void, withSway = false): BufferGeometry {
  const b = new GeoBuilder();
  fn(b);
  return b.build(withSway);
}
