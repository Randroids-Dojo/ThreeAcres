// Little sculpted crop models: eight crops at five stages each, a slumped
// grey-brown version for withered crops, and the produce that flies to the
// crate at harvest. Built once from leaves, stalks and fruit, merged per model.

import { BufferGeometry, Color, Euler, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';
import type { CropId } from '../sim/types';
import { GeoBuilder, ball, block, cone, cyl, ico, leaf } from './builder';
import { col, mixInto, rng, tone } from './util';

const K = {
  mound: col('#6a4c31'),
  stake: col('#cfae72'),
  seed: col('#efe2b8'),
  leaf: col('#5c9c3e'),
  leafDark: col('#3e7a32'),
  leafLight: col('#8cc456'),
  radish: col('#d9405c'),
  radishTip: col('#f6e7ea'),
  radishLeaf: col('#4f973c'),
  lettuceOut: col('#9fd067'),
  lettuceIn: col('#dcefa2'),
  lettuceDark: col('#79b64c'),
  frond: col('#4a9a3a'),
  frondLight: col('#79bf4e'),
  carrot: col('#ee8a2b'),
  pole: col('#c8a467'),
  beanLeaf: col('#4b9238'),
  pod: col('#86c24e'),
  flowerW: col('#f7f5ff'),
  flowerL: col('#bf9be6'),
  strawLeaf: col('#3d8a3c'),
  berry: col('#e2283c'),
  berrySeed: col('#f7e07a'),
  unripe: col('#e8eec0'),
  yellow: col('#f4d03f'),
  sunStalk: col('#6c9b3b'),
  sunLeaf: col('#4f8a33'),
  petal: col('#f6c12a'),
  petalDeep: col('#e9a81c'),
  disc: col('#5b3a1c'),
  bud: col('#6a9a3e'),
  cornStalk: col('#73a94e'),
  cornBlade: col('#6aa84f'),
  cornTip: col('#a9cf63'),
  cornGold: col('#cfc35f'),
  tassel: col('#e2c46e'),
  cob: col('#f2d454'),
  husk: col('#a9c771'),
  vine: col('#5f8f3a'),
  pumpLeaf: col('#4c8a3a'),
  pumpLeafLight: col('#6aa64a'),
  pumpFlower: col('#f4ad2f'),
  pumpkin: col('#ea7a2c'),
  pumpkinDeep: col('#cf5f1e'),
  pumpkinGreen: col('#8fb04a'),
  stem: col('#6d5a2c'),
  dead: col('#7d6a4f'),
  deadDark: col('#5e4f3c'),
};

/** Seed packet colour per crop, for the stage 0 marker. */
const TAG: Record<CropId, Color> = {
  radish: col('#d9465f'),
  lettuce: col('#8cc152'),
  carrot: col('#ee8a2b'),
  beans: col('#4f9a3a'),
  strawberry: col('#e0303f'),
  sunflower: col('#f4c22b'),
  corn: col('#f0d35a'),
  pumpkin: col('#e8772e'),
};

const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _k = new Color();

/** A transform, built fresh (models are built once, so allocation is fine here). */
function T(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx): Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

function mul(...ms: Matrix4[]): Matrix4 {
  const out = new Matrix4();
  for (const m of ms) out.multiply(m);
  return out;
}

/** Paint with a base-to-tip gradient along the part's local x (leaves) or y (stalks). */
function grad(a: Color, b: Color, len: number, axis: 'x' | 'y' = 'x'): (w: Vector3, n: Vector3, l: Vector3) => Color {
  return (_w, _n, l) => mixInto(_k, a, b, Math.min(1, Math.max(0, (axis === 'x' ? l.x : l.y) / len)));
}

/** A leaf from (x, y, z), pointing out at yaw, raised by pitch. */
function addLeaf(b: GeoBuilder, x: number, y: number, z: number, yaw: number, pitch: number, len: number, w: number, bend: number, shape: number, base: Color, tip: Color): void {
  b.add(leaf(len, w, bend, shape), T(x, y, z, yaw, 0, pitch), grad(base, tip, len));
}

function mound(b: GeoBuilder, r = 0.13): void {
  b.add(ball(1, 7, 3), T(0, 0, 0, 0, 0, 0, r, 0.045, r * 0.9), K.mound);
}

function seedStage(b: GeoBuilder, kind: CropId): void {
  mound(b);
  b.add(ball(0.025, 6, 4), T(0.02, 0.035, 0.01, 0, 0, 0, 1, 0.6, 0.8), K.seed);
  // A seed-packet marker on a little stake, in the crop's colour.
  b.add(cyl(0.008, 0.01, 0.2, 4), T(-0.2, 0, -0.16), K.stake);
  b.add(block(0.11, 0.075, 0.012, 0.006), T(-0.2, 0.17, -0.15, 0.25), TAG[kind]);
  b.add(block(0.08, 0.02, 0.014, 0.004), T(-0.2, 0.17, -0.148, 0.25), K.seed);
}

function trifoliate(b: GeoBuilder, x: number, z: number, yaw: number, stemH: number, len: number, k: Color, tip: Color): void {
  const sx = x + Math.cos(yaw) * stemH * 0.6;
  const sz = z - Math.sin(yaw) * stemH * 0.6;
  b.add(cyl(0.005, 0.007, stemH, 3), T(x, 0, z, yaw, 0, -0.6), K.leafDark);
  for (let i = -1; i <= 1; i++) addLeaf(b, sx, stemH * 0.8, sz, yaw + i * 0.75, 0.25, len, len * 0.75, 0.3, 1, k, tip);
}

function radish(b: GeoBuilder, stage: number): void {
  const spots: [number, number][] = [
    [-0.15, -0.1],
    [0.15, -0.07],
    [0.0, 0.15],
  ];
  for (const [x, z] of spots) {
    if (stage === 1) {
      addLeaf(b, x, 0.01, z, 0.3, 0.6, 0.06, 0.05, 0.2, 1, K.radishLeaf, K.leafLight);
      addLeaf(b, x, 0.01, z, 0.3 + Math.PI, 0.6, 0.06, 0.05, 0.2, 1, K.radishLeaf, K.leafLight);
      continue;
    }
    const n = stage === 2 ? 4 : 5;
    const len = stage === 2 ? 0.11 : stage === 3 ? 0.15 : 0.17;
    const top = stage === 4 ? 0.1 : 0.03;
    for (let i = 0; i < n; i++) addLeaf(b, x, top, z, (i / n) * Math.PI * 2 + x * 9, 0.75, len, len * 0.62, 0.55, 1, K.radishLeaf, K.leafLight);
    if (stage === 3) b.add(ball(0.035, 8, 5), T(x, 0.01, z), K.radish);
    if (stage === 4) {
      b.add(ball(0.078, 8, 6), T(x, 0.045, z, 0, 0, 0, 1, 0.92, 1), (_w, n2) => tone(_k.copy(K.radish), 0, n2.y * 0.05));
      b.add(cone(0.02, 0.05, 5), T(x, -0.03, z, 0, Math.PI, 0), K.radishTip);
    }
  }
}

function lettuce(b: GeoBuilder, stage: number): void {
  if (stage === 1) {
    for (let i = 0; i < 4; i++) addLeaf(b, 0, 0.01, 0, (i / 4) * Math.PI * 2, 0.55, 0.07, 0.06, 0.2, 1, K.lettuceDark, K.lettuceOut);
    return;
  }
  if (stage === 2) {
    for (let i = 0; i < 6; i++) addLeaf(b, 0, 0.01, 0, (i / 6) * Math.PI * 2 + 0.3, 0.75, 0.13, 0.11, 0.45, 1, K.lettuceDark, K.lettuceOut);
    return;
  }
  const outer = stage === 3 ? 9 : 10;
  const ol = stage === 3 ? 0.19 : 0.23;
  for (let i = 0; i < outer; i++) addLeaf(b, 0, 0.015, 0, (i / outer) * Math.PI * 2, 0.45, ol, ol * 0.8, 0.75, 1, K.lettuceDark, K.lettuceOut);
  const inner = stage === 3 ? 5 : 8;
  for (let i = 0; i < inner; i++) addLeaf(b, 0, 0.03, 0, (i / inner) * Math.PI * 2 + 0.4, 1.05, ol * 0.65, ol * 0.6, -0.5, 1, K.lettuceOut, K.lettuceIn);
  if (stage === 4) b.add(ball(0.105, 10, 7), T(0, 0.1, 0, 0, 0, 0, 1, 0.82, 1), (_w, n) => mixInto(_k, K.lettuceOut, K.lettuceIn, 0.4 + n.y * 0.6));
}

function carrot(b: GeoBuilder, stage: number): void {
  for (const x of [-0.21, 0, 0.21]) {
    const z = x === 0 ? 0.06 : -0.04;
    const n = stage === 1 ? 3 : stage === 2 ? 5 : stage === 3 ? 7 : 8;
    const len = stage === 1 ? 0.07 : stage === 2 ? 0.16 : stage === 3 ? 0.24 : 0.27;
    const w = stage === 1 ? 0.016 : stage === 2 ? 0.032 : 0.045;
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * Math.PI * 2 + x * 5;
      addLeaf(b, x, stage === 4 ? 0.05 : 0.01, z, yaw, 1.05 + ((i * 7) % 3) * 0.1, len, w, 0.6, 0, K.frond, K.frondLight);
      // Feathery side leaflets on the bigger fronds.
      if (stage >= 3) addLeaf(b, x + Math.cos(yaw) * len * 0.3, 0.01 + len * 0.42, z - Math.sin(yaw) * len * 0.3, yaw + 0.7, 0.7, len * 0.4, w * 0.8, 0.4, 0, K.frond, K.frondLight);
    }
    if (stage === 3) b.add(cyl(0.025, 0.02, 0.02, 6), T(x, 0, z), K.carrot);
    if (stage === 4) b.add(cyl(0.048, 0.022, 0.14, 7), T(x, -0.085, z), (_w, nn) => tone(_k.copy(K.carrot), 0, nn.y * 0.06));
  }
}

function beans(b: GeoBuilder, stage: number): void {
  if (stage === 1) {
    b.add(cyl(0.006, 0.008, 0.07, 4), T(0, 0, 0), K.beanLeaf);
    addLeaf(b, 0, 0.07, 0, 0.2, 0.35, 0.07, 0.065, 0.3, 1, K.beanLeaf, K.leafLight);
    addLeaf(b, 0, 0.07, 0, 0.2 + Math.PI, 0.35, 0.07, 0.065, 0.3, 1, K.beanLeaf, K.leafLight);
    return;
  }
  const poleH = stage === 2 ? 0.48 : stage === 3 ? 0.95 : 1.02;
  b.add(cyl(0.014, 0.018, poleH, 5), T(0, -0.02, 0), K.pole);
  b.add(cone(0.016, 0.03, 5), T(0, poleH - 0.02, 0), K.pole);
  // A twining vine: a helix of short stems with leaves along it.
  const turns = stage === 2 ? 1.2 : 2.6;
  const segs = stage === 2 ? 8 : 16;
  const top = poleH * 0.92;
  const rad = 0.04;
  let px = rad;
  let pz = 0;
  let py = 0.0;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2;
    const nx = Math.cos(a) * rad;
    const nz = Math.sin(a) * rad;
    const ny = t * top;
    const dx = nx - px;
    const dy = ny - py;
    const dz = nz - pz;
    const len = Math.hypot(dx, dy, dz);
    const m = new Matrix4().lookAt(new Vector3(0, 0, 0), new Vector3(dx, dy, dz), new Vector3(0, 1, 0.001));
    m.multiply(new Matrix4().makeRotationX(Math.PI / 2));
    m.setPosition(px, py, pz);
    b.add(cyl(0.006, 0.006, len, 3), m, K.vine);
    if (i % 2 === 0 || stage === 2) {
      const yaw = -a;
      const ll = stage === 2 ? 0.08 : 0.105;
      addLeaf(b, nx, ny, nz, yaw, 0.2, ll, ll * 0.9, 0.45, 1, K.beanLeaf, K.leafLight);
    }
    if (stage >= 3 && i % 4 === 1) b.add(ico(0.022, 0), T(nx * 1.6, ny, nz * 1.6), i % 8 === 1 ? K.flowerL : K.flowerW, { flat: true });
    if (stage === 4 && i % 3 === 0 && i > 2) {
      const ox = Math.cos(a + 0.6) * 0.075;
      const oz = Math.sin(a + 0.6) * 0.075;
      b.add(block(0.022, 0.15, 0.028, 0.011), T(ox, ny - 0.07, oz, -a, 0, 0.15), K.pod);
    }
    px = nx;
    py = ny;
    pz = nz;
  }
}

function strawberry(b: GeoBuilder, stage: number): void {
  if (stage === 1) {
    for (let i = 0; i < 3; i++) trifoliate(b, 0, 0, (i / 3) * Math.PI * 2, 0.05, 0.035, K.strawLeaf, K.leafLight);
    return;
  }
  const n = stage === 2 ? 4 : 6;
  const len = stage === 2 ? 0.075 : 0.1;
  for (let i = 0; i < n; i++) trifoliate(b, 0, 0, (i / n) * Math.PI * 2 + 0.2, stage === 2 ? 0.08 : 0.11, len, K.strawLeaf, K.leafLight);
  if (stage >= 3) {
    // Runners out to baby plants.
    for (const [yaw, d] of [
      [0.6, 0.36],
      [3.6, 0.33],
    ] as const) {
      b.add(cyl(0.004, 0.004, d, 3), T(0, 0.012, 0, yaw, 0, -Math.PI / 2 + 0.03), K.leafDark);
      const bx = Math.cos(yaw) * d;
      const bz = -Math.sin(yaw) * d;
      for (let i = 0; i < 3; i++) addLeaf(b, bx, 0.01, bz, (i / 3) * Math.PI * 2, 0.5, 0.045, 0.04, 0.2, 1, K.strawLeaf, K.leafLight);
    }
  }
  const flower = (x: number, y: number, z: number) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.add(ball(0.018, 5, 3), T(x + Math.cos(a) * 0.018, y, z + Math.sin(a) * 0.018, 0, 0, 0, 1, 0.4, 1), K.flowerW);
    }
    b.add(ball(0.011, 5, 3), T(x, y + 0.006, z), K.yellow);
  };
  if (stage === 3) {
    flower(0.09, 0.13, 0.08);
    flower(-0.1, 0.12, 0.05);
    flower(0.02, 0.14, -0.1);
  }
  if (stage === 4) {
    const spots: [number, number, Color][] = [
      [0.15, 0.1, K.berry],
      [-0.14, 0.12, K.berry],
      [0.04, 0.19, K.berry],
      [-0.06, -0.16, K.berry],
      [0.18, -0.06, K.berry],
      [-0.19, -0.02, K.unripe],
    ];
    for (const [x, z, k] of spots) {
      b.add(cone(0.042, 0.08, 7), T(x, 0.085, z, 0, Math.PI, 0), (_w, nn) => tone(_k.copy(k), 0, nn.y * 0.04));
      b.add(ball(0.042, 7, 4), T(x, 0.085, z, 0, 0, 0, 1, 0.45, 1), k);
      b.add(cone(0.03, 0.02, 5), T(x, 0.088, z), K.strawLeaf, { flat: true });
      b.add(ball(0.006, 4, 3), T(x + 0.02, 0.05, z + 0.022), K.berrySeed);
    }
    flower(-0.02, 0.14, 0.02);
  }
}

function sunflowerHead(b: GeoBuilder, base: Matrix4, r: number): void {
  // base faces local +Y; the disc sits on it.
  b.add(cyl(r * 0.95, r * 0.8, 0.035, 12), base, K.bud);
  b.add(cyl(r, r, 0.04, 14), mul(base, T(0, 0.03, 0)), (_w, nn) => tone(_k.copy(K.disc), 0, nn.y > 0.9 ? 0.02 : -0.04));
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = mul(base, T(0, 0.045, 0, a), T(r * 0.85, 0, 0, 0, 0, 0.1));
    b.add(leaf(r * 0.95, r * 0.5, -0.2, 0, 3), m, i % 2 ? K.petal : K.petalDeep);
  }
  b.add(ball(r * 0.55, 8, 4), mul(base, T(0, 0.055, 0, 0, 0, 0, 1, 0.25, 1)), col('#7a4b22'));
}

function sunflower(b: GeoBuilder, stage: number): void {
  if (stage === 1) {
    b.add(cyl(0.006, 0.008, 0.08, 4), T(0, 0, 0), K.sunStalk);
    addLeaf(b, 0, 0.08, 0, 0, 0.3, 0.075, 0.05, 0.2, 0, K.sunLeaf, K.leafLight);
    addLeaf(b, 0, 0.08, 0, Math.PI, 0.3, 0.075, 0.05, 0.2, 0, K.sunLeaf, K.leafLight);
    return;
  }
  const h = stage === 2 ? 0.42 : stage === 3 ? 1.08 : 1.5;
  const r0 = stage === 2 ? 0.016 : stage === 3 ? 0.026 : 0.032;
  b.add(cyl(r0 * 0.75, r0, h, 6), T(0, 0, 0), grad(K.sunStalk, K.leafLight, h * 2, 'y'));
  const n = stage === 2 ? 4 : stage === 3 ? 8 : 9;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.6) / (n + 0.5);
    const y = t * h * 0.88;
    const len = (stage === 2 ? 0.15 : 0.24) * (1.15 - t * 0.5);
    addLeaf(b, 0, y, 0, i * 2.4 + 0.5, 0.15, len, len * 0.75, 0.7, 1, K.sunLeaf, K.leafLight);
  }
  if (stage === 3) {
    b.add(ico(0.07, 1), T(0, h + 0.03, 0.01, 0, 0, 0, 1, 0.8, 1), K.bud, { flat: true });
    for (let i = 0; i < 6; i++) addLeaf(b, 0, h, 0, (i / 6) * Math.PI * 2, 1.0, 0.06, 0.035, -0.4, 0, K.bud, K.leafLight);
  }
  if (stage === 4) {
    // The head faces the camera (south) and a little up.
    const tilt = Math.PI / 2 - 0.62;
    const base = T(0, h, 0.05, 0, tilt, 0);
    sunflowerHead(b, base, 0.13);
    b.add(cyl(0.022, 0.026, 0.12, 5), T(0, h - 0.1, 0, 0, 0.5, 0), K.sunStalk);
  }
}

function corn(b: GeoBuilder, stage: number): void {
  const stalks: [number, number][] = [
    [-0.12, -0.06],
    [0.12, 0.07],
  ];
  stalks.forEach(([x, z], si) => {
    if (stage === 1) {
      addLeaf(b, x, 0, z, si * 2 + 0.4, 1.35, 0.11, 0.026, 0.4, 0, K.cornBlade, K.cornTip);
      addLeaf(b, x, 0, z, si * 2 + 3.4, 1.3, 0.08, 0.022, 0.4, 0, K.cornBlade, K.cornTip);
      return;
    }
    const h = stage === 2 ? 0.16 : stage === 3 ? 0.95 : 1.38;
    const tip = stage === 4 ? K.cornGold : K.cornTip;
    b.add(cyl(0.017, 0.028, h, 6), T(x, 0, z), grad(K.cornStalk, K.cornTip, h * 2, 'y'));
    const n = stage === 2 ? 4 : stage === 3 ? 8 : 9;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const y = stage === 2 ? 0.05 + t * 0.1 : 0.06 + t * h * 0.82;
      const len = stage === 2 ? 0.3 : (0.5 - t * 0.18) * (stage === 3 ? 0.9 : 1);
      addLeaf(b, x, y, z, i * 2.6 + si, 0.95 - t * 0.2, len, stage === 2 ? 0.05 : 0.065, 1.1, 0, K.cornBlade, tip);
    }
    if (stage >= 3) {
      // Tassel.
      const spikes = stage === 4 ? 6 : 3;
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2;
        b.add(cyl(0.004, 0.007, stage === 4 ? 0.17 : 0.08, 3), T(x, h - 0.01, z, a, 0, stage === 4 ? -0.45 : -0.2), K.tassel);
      }
    }
    if (stage === 4) {
      const a = si * 3 + 0.8;
      const cy = h * 0.45;
      const m = T(x + Math.cos(a) * 0.03, cy, z - Math.sin(a) * 0.03, a, 0, -0.45);
      b.add(cyl(0.035, 0.045, 0.2, 8), m, (_w, nn) => tone(_k.copy(K.cob), 0, nn.y * 0.04));
      b.add(leaf(0.2, 0.06, 0.3, 0, 3), mul(m, T(0, 0.0, 0, 0.4, 0, Math.PI / 2 - 0.15)), K.husk);
      b.add(leaf(0.19, 0.06, 0.3, 0, 3), mul(m, T(0, 0.0, 0, 2.6, 0, Math.PI / 2 - 0.2)), K.husk);
      b.add(cyl(0.003, 0.01, 0.06, 3), mul(m, T(0, 0.2, 0)), col('#b58a3a'));
    }
  });
}

let pumpkinGeo: BufferGeometry | null = null;
function pumpkinShape(): BufferGeometry {
  if (pumpkinGeo) return pumpkinGeo;
  const g = new SphereGeometry(1, 20, 12);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const rib = 1 - 0.09 * (0.5 + 0.5 * Math.cos(a * 10));
    pos.setXYZ(i, x * rib, y * 0.72 - (Math.abs(y) > 0.9 ? Math.sign(y) * 0.06 : 0), z * rib);
  }
  g.computeVertexNormals();
  pumpkinGeo = g;
  return g;
}

function pumpkin(b: GeoBuilder, stage: number): void {
  if (stage === 1) {
    b.add(cyl(0.007, 0.009, 0.05, 4), T(0, 0, 0), K.vine);
    addLeaf(b, 0, 0.05, 0, 0.3, 0.3, 0.085, 0.075, 0.25, 1, K.pumpLeaf, K.pumpLeafLight);
    addLeaf(b, 0, 0.05, 0, 0.3 + Math.PI, 0.3, 0.085, 0.075, 0.25, 1, K.pumpLeaf, K.pumpLeafLight);
    return;
  }
  // The vine creeps across the tile.
  const vine: [number, number][] =
    stage === 2
      ? [
          [-0.05, 0.02],
          [0.12, -0.05],
          [0.22, 0.05],
        ]
      : [
          [-0.28, -0.18],
          [-0.12, -0.05],
          [0.05, -0.12],
          [0.2, 0.0],
          [0.3, 0.18],
        ];
  for (let i = 0; i < vine.length - 1; i++) {
    const [x0, z0] = vine[i];
    const [x1, z1] = vine[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    b.add(cyl(0.01, 0.012, len, 4), T(x0, 0.015, z0, Math.atan2(-(z1 - z0), x1 - x0), 0, -Math.PI / 2), K.vine);
  }
  const leaves = stage === 2 ? 3 : 6;
  const ll = stage === 2 ? 0.14 : 0.2;
  for (let i = 0; i < leaves; i++) {
    const [x, z] = vine[Math.min(vine.length - 1, Math.floor((i / leaves) * vine.length))];
    const yaw = i * 2.2 + 0.4;
    b.add(cyl(0.005, 0.007, 0.09, 3), T(x, 0.01, z, yaw, 0, -0.7), K.vine);
    addLeaf(b, x + Math.cos(yaw) * 0.05, 0.075, z - Math.sin(yaw) * 0.05, yaw, 0.25, ll, ll * 1.05, 0.55, 1, K.pumpLeaf, K.pumpLeafLight);
  }
  if (stage === 3) {
    for (const [x, z] of [
      [0.2, 0.0],
      [-0.12, -0.05],
    ] as const) {
      b.add(cone(0.035, 0.06, 6), T(x, 0.09, z, 0, Math.PI, 0), K.pumpFlower, { flat: true });
    }
    b.add(pumpkinShape(), T(0.05, 0.06, 0.12, 0, 0, 0, 0.075), K.pumpkinGreen);
  }
  if (stage === 4) {
    b.add(pumpkinShape(), T(0.03, 0.15, 0.08, 0.3, 0, 0, 0.21), (_w, nn) => mixInto(_k, K.pumpkinDeep, K.pumpkin, 0.55 + nn.y * 0.45));
    b.add(cyl(0.022, 0.03, 0.08, 5), T(0.03, 0.27, 0.08, 0, 0.2, 0.2), K.stem, { flat: true });
  }
}

const BUILD: Record<CropId, (b: GeoBuilder, stage: number) => void> = { radish, lettuce, carrot, beans, strawberry, sunflower, corn, pumpkin };

export interface CropModels {
  /** [kind][stage] */
  stages: Record<CropId, BufferGeometry[]>;
  dead: Record<CropId, BufferGeometry>;
  produce: Record<CropId, BufferGeometry>;
  /** Top of each model, [kind][stage]. */
  height: Record<CropId, number[]>;
}

export function buildCropModels(ids: readonly CropId[]): CropModels {
  const stages = {} as Record<CropId, BufferGeometry[]>;
  const dead = {} as Record<CropId, BufferGeometry>;
  const produce = {} as Record<CropId, BufferGeometry>;
  const height = {} as Record<CropId, number[]>;
  for (const id of ids) {
    stages[id] = [];
    height[id] = [];
    for (let s = 0; s <= 4; s++) {
      const b = new GeoBuilder();
      if (s === 0) seedStage(b, id);
      else BUILD[id](b, s);
      if (s > 0) mound(b, 0.09);
      const g = b.build();
      stages[id].push(g);
      height[id].push(g.boundingBox!.max.y);
    }
    dead[id] = slump(stages[id][3]);
    produce[id] = produceModel(id);
  }
  return { stages, dead, produce, height };
}

/** A withered copy: bent over to one side, squashed, and grey-brown. */
function slump(src: BufferGeometry): BufferGeometry {
  const g = src.clone();
  const pos = g.attributes.position;
  const c = g.attributes.color;
  const r = rng(5);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = Math.max(0, y);
    const bend = Math.pow(h, 1.25) * 0.75;
    pos.setXYZ(i, x + bend, y * 0.5 + 0.004, z + bend * 0.25);
    const lum = c.getX(i) * 0.3 + c.getY(i) * 0.5 + c.getZ(i) * 0.2;
    _k.setRGB(lum, lum, lum);
    mixInto(_k, _k, r() < 0.5 ? K.dead : K.deadDark, 0.78);
    c.setXYZ(i, _k.r, _k.g, _k.b);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function produceModel(id: CropId): BufferGeometry {
  const b = new GeoBuilder();
  switch (id) {
    case 'radish':
      b.add(ball(0.085, 10, 7), T(0, 0, 0), K.radish);
      b.add(cone(0.025, 0.06, 5), T(0, -0.11, 0, 0, Math.PI, 0), K.radishTip);
      for (let i = 0; i < 3; i++) addLeaf(b, 0, 0.06, 0, i * 2.1, 1.2, 0.12, 0.07, 0.4, 1, K.radishLeaf, K.leafLight);
      break;
    case 'lettuce':
      b.add(ball(0.13, 10, 7), T(0, 0, 0, 0, 0, 0, 1, 0.85, 1), K.lettuceIn);
      for (let i = 0; i < 7; i++) addLeaf(b, 0, -0.03, 0, (i / 7) * Math.PI * 2, 0.9, 0.14, 0.13, -0.3, 1, K.lettuceOut, K.lettuceIn);
      break;
    case 'carrot':
      b.add(cyl(0.05, 0.012, 0.24, 8), T(0, -0.18, 0), K.carrot);
      for (let i = 0; i < 5; i++) addLeaf(b, 0, 0.05, 0, (i / 5) * Math.PI * 2, 1.2, 0.16, 0.04, 0.4, 0, K.frond, K.frondLight);
      break;
    case 'beans':
      for (let i = 0; i < 4; i++) b.add(block(0.03, 0.2, 0.035, 0.015), T((i - 1.5) * 0.04, 0, 0, 0, 0, (i - 1.5) * 0.2), K.pod);
      break;
    case 'strawberry':
      b.add(cone(0.07, 0.12, 8), T(0, 0, 0, 0, Math.PI, 0), K.berry);
      b.add(ball(0.07, 8, 4), T(0, 0, 0, 0, 0, 0, 1, 0.45, 1), K.berry);
      b.add(cone(0.05, 0.03, 6), T(0, 0.005, 0), K.strawLeaf, { flat: true });
      break;
    case 'sunflower':
      sunflowerHead(b, T(0, 0, 0, 0, Math.PI / 2 - 0.3, 0), 0.13);
      break;
    case 'corn':
      b.add(cyl(0.045, 0.055, 0.26, 8), T(0, -0.13, 0), K.cob);
      b.add(leaf(0.24, 0.08, 0.3, 0, 3), T(0, -0.13, 0, 0.4, 0, Math.PI / 2 - 0.2), K.husk);
      b.add(leaf(0.24, 0.08, 0.3, 0, 3), T(0, -0.13, 0, 3.4, 0, Math.PI / 2 - 0.2), K.husk);
      break;
    case 'pumpkin':
      b.add(pumpkinShape(), T(0, 0, 0, 0, 0, 0, 0.2), (_w, nn) => mixInto(_k, K.pumpkinDeep, K.pumpkin, 0.55 + nn.y * 0.45));
      b.add(cyl(0.022, 0.03, 0.08, 5), T(0, 0.12, 0), K.stem, { flat: true });
      break;
  }
  return b.build();
}

/**
 * Prize rosettes for quality pips: 1 silver, 2 gold, 3 star. Each is a
 * ruffled disc with ribbon tails on a short stake, facing +Z, centred on the
 * rosette.
 */
export function pipModels(): BufferGeometry[] {
  const rosette = (ruffle: Color, rim: Color, centre: Color, ribbon: Color, star: boolean) => {
    const b = new GeoBuilder();
    const R = 0.105;
    const n = 16;
    const f = new Vector3(0, 0, 0.012);
    const bk = new Vector3(0, 0, -0.012);
    const pts: Vector3[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? R * 0.84 : R;
      pts.push(new Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const c = pts[(i + 1) % pts.length];
      b.tri(f, a, c, i % 2 ? rim : ruffle);
      b.tri(bk, c, a, rim);
    }
    // Ribbon tails.
    for (const s of [-1, 1]) b.add(block(0.045, 0.13, 0.008, 0.004), T(s * 0.035, -0.11, -0.004, 0, 0, s * 0.25), ribbon);
    // Stake down to the soil.
    b.add(cyl(0.006, 0.008, 0.2, 4), T(0, -0.21, -0.01), col('#7a5a3a'));
    if (star) {
      const sp: Vector3[] = [];
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 ? 0.032 : 0.075;
        sp.push(new Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.016));
      }
      const top = new Vector3(0, 0, 0.03);
      for (let i = 0; i < 10; i++) b.tri(top, sp[i], sp[(i + 1) % 10], i % 2 ? col('#ffd84a') : col('#ffb22e'));
    } else {
      b.add(cyl(0.055, 0.055, 0.02, 12), T(0, 0, 0.006, 0, Math.PI / 2, 0), centre);
      b.add(cyl(0.035, 0.035, 0.022, 10), T(0, 0, 0.008, 0, Math.PI / 2, 0), rim);
    }
    return b.build();
  };
  return [
    new BufferGeometry(),
    rosette(col('#e6ecf3'), col('#a3adb8'), col('#cfd7e0'), col('#7f8fa3'), false),
    rosette(col('#f8d250'), col('#d49a22'), col('#f2be3a'), col('#c8323a'), false),
    rosette(col('#3e62d8'), col('#2a46a8'), col('#ffd84a'), col('#2a46a8'), true),
  ];
}
