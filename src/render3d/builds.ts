// Things the player builds on a plot: sprinklers (a brass riser with a head
// that spins when it sprays) and scarecrows (straw, a patched shirt, a hat).

import { DynamicDrawUsage, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import type { BuildKind, WorldState } from '../sim/types';
import { GeoBuilder, ball, block, cone, cyl, ico } from './builder';
import type { TileTimers } from './crops';
import type { Materials } from './materials';
import { at, backOut, col, hash2 } from './util';

const K = {
  pad: col('#a9a397'),
  brass: col('#c8913f'),
  brassDark: col('#9a6a2c'),
  pipe: col('#6f7a80'),
  wood: col('#8a643f'),
  straw: col('#e6c56a'),
  strawDark: col('#c9a548'),
  shirt: col('#b84f3a'),
  patch: col('#4f7fb0'),
  patch2: col('#e2b648'),
  sack: col('#d9c08a'),
  stitch: col('#3a2a1e'),
  hat: col('#6e5236'),
  band: col('#3d6b4a'),
};

function sprinklerBase(): BufferGeometry {
  const b = new GeoBuilder();
  b.add(block(0.24, 0.05, 0.24, 0.02), at(0, 0.025, 0), K.pad);
  b.add(cyl(0.022, 0.028, 0.3, 7), at(0, 0.04, 0), K.brass, { flat: true });
  b.add(cyl(0.035, 0.035, 0.03, 8), at(0, 0.12, 0), K.brassDark, { flat: true });
  // Pipe running to the edge of the tile.
  b.add(cyl(0.014, 0.014, 0.4, 5), at(0, 0.03, 0, 0, Math.PI / 2, 0), K.pipe);
  return b.build();
}

function sprinklerHead(): BufferGeometry {
  const b = new GeoBuilder();
  b.add(cyl(0.035, 0.03, 0.05, 8), at(0, 0, 0), K.brassDark, { flat: true });
  for (const s of [-1, 1]) {
    b.add(cyl(0.01, 0.01, 0.13, 5), at(0, 0.035, 0, 0, 0, s * (Math.PI / 2 - 0.15)), K.brass);
    b.add(cone(0.018, 0.04, 6), at(s * 0.13, 0.05, 0, 0, 0, s * -0.6), K.brassDark, { flat: true });
  }
  b.add(ball(0.02, 6, 4), at(0, 0.06, 0), K.brass);
  return b.build();
}

function scarecrow(): BufferGeometry {
  const b = new GeoBuilder();
  b.add(block(0.055, 1.0, 0.055, 0.01), at(0, 0.5, 0), K.wood);
  b.add(block(0.045, 0.045, 0.66, 0.01), at(0, 0.72, 0), K.wood);
  // Shirt on the crossbar, with patches.
  b.add(block(0.16, 0.3, 0.26, 0.05, 2), at(0.01, 0.62, 0), K.shirt);
  b.add(block(0.012, 0.07, 0.07, 0.01), at(0.095, 0.58, 0.06), K.patch);
  b.add(block(0.012, 0.06, 0.06, 0.01), at(0.095, 0.68, -0.07, 0, 0.3, 0), K.patch2);
  for (const s of [-1, 1]) {
    b.add(block(0.1, 0.1, 0.24, 0.035, 2), at(0.01, 0.72, s * 0.22), K.shirt);
    // Straw poking out of the sleeves and the hem.
    for (let i = 0; i < 4; i++) b.add(cone(0.018, 0.09, 4), at(0, 0.72 + (i - 1.5) * 0.02, s * 0.36, 0, s * (Math.PI / 2 + (i - 1.5) * 0.25), 0), i % 2 ? K.straw : K.strawDark, { flat: true });
  }
  for (let i = 0; i < 7; i++) b.add(cone(0.018, 0.1, 4), at(0.01 + (hash2(i, 1) - 0.5) * 0.06, 0.48, (i / 6 - 0.5) * 0.22, 0, Math.PI, 0), i % 2 ? K.straw : K.strawDark, { flat: true });
  // Sack head with a stitched face, and a hat.
  b.add(ico(0.1, 1), at(0.01, 0.88, 0, 0, 0, 0, 1, 1.05, 1), K.sack, { flat: true });
  for (const s of [-1, 1]) b.add(block(0.01, 0.025, 0.025, 0.004), at(0.1, 0.9, s * 0.04, 0, 0.78, 0), K.stitch);
  b.add(block(0.01, 0.012, 0.08, 0.004), at(0.098, 0.84, 0), K.stitch);
  b.add(cyl(0.17, 0.17, 0.02, 12), at(0.0, 0.95, 0, 0, 0, 0.1), K.hat);
  b.add(cone(0.1, 0.16, 9), at(0.0, 0.955, 0), K.hat, { flat: true });
  b.add(cyl(0.098, 0.1, 0.03, 9), at(0.0, 0.96, 0), K.band);
  return b.build();
}

export interface Builds {
  group: Group;
  update(s: Readonly<WorldState>, now: number, timers: TileTimers): void;
  dispose(): void;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

export function buildBuilds(mats: Materials, cap: number): Builds {
  const group = new Group();
  group.name = 'builds';
  const geos = { base: sprinklerBase(), head: sprinklerHead(), crow: scarecrow() };
  const mk = (g: BufferGeometry, mat = mats.stat) => {
    const m = new InstancedMesh(g, mat, cap);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    group.add(m);
    return m;
  };
  const base = mk(geos.base);
  const head = mk(geos.head);
  const crow = mk(geos.crow, mats.cropGrow);
  const spin = new Float32Array(4096);
  let last = 0;
  return {
    group,
    update(s, now, timers) {
      const dt = Math.min(0.1, Math.max(0, now - last));
      last = now;
      const n: Record<BuildKind, number> = { sprinkler: 0, scarecrow: 0 };
      for (const b of s.builds) {
        const i = b.y * s.W + b.x;
        const tb = now - timers.build[i];
        let sy = 1;
        let sxz = 1;
        if (tb >= 0 && tb < 0.6) {
          const g = tb < 0.15 ? backOut(tb / 0.15) : 1;
          const e = Math.exp(-6 * tb) * Math.sin(tb * 20);
          sy = g * (1 + 0.25 * e);
          sxz = g * (1 - 0.1 * e);
        }
        const ts = now - timers.shake[i];
        const ox = ts >= 0 && ts < 0.45 ? Math.sin(ts * 50) * 0.04 * (1 - ts / 0.45) : 0;
        const yaw = b.kind === 'scarecrow' ? -Math.PI / 2 + (hash2(b.x, b.y, 3) - 0.5) * 0.6 : hash2(b.x, b.y, 4) * 3;
        _q.setFromAxisAngle(_up, yaw);
        _p.set(b.x + 0.5 + ox, 0.02, b.y + 0.5);
        _s.set(sxz, sy, sxz);
        _m.compose(_p, _q, _s);
        if (b.kind === 'sprinkler') {
          const k = n.sprinkler++;
          if (k >= cap) continue;
          base.setMatrixAt(k, _m);
          const tsp = now - timers.spray[i];
          const speed = tsp >= 0 && tsp < 2.2 ? 14 * (1 - tsp / 2.2) + 1 : 0.4;
          const si = i % spin.length;
          spin[si] += speed * dt;
          _q.setFromAxisAngle(_up, spin[si]);
          _p.set(b.x + 0.5 + ox, 0.02 + 0.33 * sy, b.y + 0.5);
          _m.compose(_p, _q, _s);
          head.setMatrixAt(k, _m);
        } else {
          const k = n.scarecrow++;
          if (k >= cap) continue;
          crow.setMatrixAt(k, _m);
        }
      }
      base.count = head.count = Math.min(cap, n.sprinkler);
      crow.count = Math.min(cap, n.scarecrow);
      for (const m of [base, head, crow]) {
        m.visible = m.count > 0;
        m.instanceMatrix.needsUpdate = m.count > 0;
      }
    },
    dispose() {
      geos.base.dispose();
      geos.head.dispose();
      geos.crow.dispose();
    },
  };
}
