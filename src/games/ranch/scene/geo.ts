// Geometry helpers: paint primitives with vertex colour, place them, nudge
// their vertices for a hand-made look, and merge them into one mesh per
// material so the ranch draws in few calls.

import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from '../noise';

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

/** Moves, turns and scales a geometry in place. */
export function at(g: BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): BufferGeometry {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  return g;
}

/** Pushes vertices around by a little noise, keeping shared vertices together. */
export function jitter(g: BufferGeometry, amt: number, seed = 1): BufferGeometry {
  const p = g.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = Math.round(x * 97) * 31 + Math.round(y * 89) * 17 + Math.round(z * 83);
    p.setXYZ(i, x + (hash2(k, 1, seed) - 0.5) * amt, y + (hash2(k, 2, seed) - 0.5) * amt, z + (hash2(k, 3, seed) - 0.5) * amt);
  }
  p.needsUpdate = true;
  return g;
}

/**
 * A non-indexed copy with a colour attribute. vary adds a little per-face
 * brightness noise for a painted look. flat recomputes faceted normals.
 */
export function part(g: BufferGeometry, color: number | Color, opts: { vary?: number; flat?: boolean; top?: number | Color; topAt?: number } = {}): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g.clone();
  g.dispose();
  ng.deleteAttribute('uv');
  if (ng.getAttribute('uv1')) ng.deleteAttribute('uv1');
  if (opts.flat || !ng.getAttribute('normal')) ng.computeVertexNormals();
  const n = ng.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const base = typeof color === 'number' ? new Color(color) : color.clone();
  const top = opts.top !== undefined ? (typeof opts.top === 'number' ? new Color(opts.top) : opts.top.clone()) : null;
  const pos = ng.getAttribute('position');
  const vary = opts.vary ?? 0.06;
  for (let i = 0; i < n; i += 3) {
    const f = 1 + (hash2(i, 7, n) - 0.5) * vary * 2;
    for (let k = 0; k < 3; k++) {
      _c.copy(base);
      if (top) {
        const y = pos.getY(i + k);
        _c.lerp(top, Math.max(0, Math.min(1, (y - (opts.topAt ?? 0)) * 2)));
      }
      col[(i + k) * 3] = _c.r * f;
      col[(i + k) * 3 + 1] = _c.g * f;
      col[(i + k) * 3 + 2] = _c.b * f;
    }
  }
  ng.setAttribute('color', new BufferAttribute(col, 3));
  return ng;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('merge failed');
  g.computeBoundingSphere();
  return g;
}
