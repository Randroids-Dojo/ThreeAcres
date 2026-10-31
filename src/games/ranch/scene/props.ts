// The valley's fixed things. Landmarks you can steer by: the lilac-roofed
// house and its windmill, the Exchange and its chalk board, the ranch gate
// with its painted signs, the old oak on its knoll, the footbridges, the crag
// and steam vents up on the ridge, the dead tree by the pond. Almost all of it
// merges into one vertex-coloured mesh; trees, rocks and plants are instanced.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, rng } from '../noise';
import { BED_H, CRATE, PORCH } from '../physics';
import {
  BERRY_BUSHES,
  BOARD,
  CLOVER_PATCHES,
  CRAG,
  DEAD_TREE,
  DOOR,
  EXCHANGE,
  FLOWERS,
  FORK,
  GATES,
  GATE_HALF,
  GATE_SIGN,
  HOLLOW_X,
  HOUSE,
  LILIES,
  MAXZ,
  MINZ,
  OAK,
  PADS,
  PINES,
  POND,
  RANCH_Z,
  REEDS,
  RIDGE_X,
  ROCKS,
  ROOT_PATCHES,
  TREES,
  VENTS,
  WILLOWS,
  WINDMILL,
  WORKBENCH,
  crossings,
  heightAt,
  zoneAt,
  type GateId,
  type Placed,
} from '../world';
import { at, jitter, merge, part } from './geo';
import { U, matte } from './mat';
import { signAtlas } from './paint';

const WOOD = 0x9a6c48;
const WOOD_D = 0x6f4a32;
const WOOD_L = 0xc49a6c;
const STONE = 0xb4aca6;
const STONE_W = 0xc9b7a2;
const CREAM = 0xf2e6cc;
const LILAC_ROOF = 0x9d88c2;

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _c = new Color();
const _up = new Vector3(0, 1, 0);

type G = BufferGeometry;

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, opts: Parameters<typeof part>[2] = {}): G {
  return part(at(new BoxGeometry(w, h, d), x, y, z, rx, ry, rz), color, opts);
}

/** A beam from a to b with a square section. */
function beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: number, opts: Parameters<typeof part>[2] = {}): G {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const g = new BoxGeometry(t, len, t);
  _v.set(bx - ax, by - ay, bz - az).normalize();
  _q.setFromUnitVectors(_up, _v);
  _m.compose(_s.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, new Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return part(g, color, opts);
}

/** A tapered limb from a to b (cylinder), for trees. */
function limb(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, color: number, seg = 6): G {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const g = new CylinderGeometry(r1, r0, len, seg, 1);
  _v.set(bx - ax, by - ay, bz - az).normalize();
  _q.setFromUnitVectors(_up, _v);
  _m.compose(_s.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, new Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return part(g, color, { flat: true, vary: 0.08 });
}

function blob(r: number, color: number, x: number, y: number, z: number, j = 0.25, seed = 1, sy = 1, detail = 1): G {
  const g = jitter(new IcosahedronGeometry(r, detail), r * j, seed);
  at(g, x, y, z, 0, 0, 0, 1, sy, 1);
  return part(g, color, { flat: true, vary: 0.1 });
}

function quadUV(w: number, h: number, uv: [number, number, number, number], x: number, y: number, z: number, ry: number, rx = 0): G {
  const g = new PlaneGeometry(w, h);
  const a = g.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * uv[2], uv[1] + a.getY(i) * uv[3]);
  at(g, x, y, z, rx, ry, 0);
  return g;
}

export interface Props {
  group: Group;
  sails: Object3D;
  gates: Record<GateId, { left: Object3D; right: Object3D; tag: Object3D }>;
  glow: MeshLambertMaterial;
  board: Mesh;
  /** Where each kind of tag menu hangs: the rail's left end, direction along it, and the way the tags face. */
  tagRails: { bench: { x: number; y: number; z: number; ax: number; az: number; ry: number } };
  update(t: number, night: number): void;
}

export function buildProps(boardMat: Material): Props {
  const group = new Group();
  const S: G[] = [];
  const GLOW: G[] = [];
  const SIGN: G[] = [];
  const atlas = signAtlas();
  let boardMesh: Mesh | null = null;

  // ------------------------------------------------------------ the house
  {
    const hx = HOUSE.x;
    const hz = HOUSE.z;
    const y0 = heightAt(hx, hz);
    const w = HOUSE.w;
    const d = HOUSE.d;
    const wallTop = y0 + 0.45 + 3;
    S.push(box(w + 0.5, 1.1, d + 0.5, STONE, hx, y0 - 0.1, hz, 0, 0, 0, { flat: true, vary: 0.12 }));
    S.push(box(w, 3, d, CREAM, hx, y0 + 0.45 + 1.5, hz, 0, 0, 0, { vary: 0.03 }));
    for (const [cx, cz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) S.push(box(0.32, 3.05, 0.32, WOOD_D, hx + (cx * w) / 2, y0 + 0.45 + 1.5, hz + (cz * d) / 2));
    S.push(box(w + 0.3, 0.26, d + 0.3, WOOD_D, hx, wallTop, hz));
    S.push(box(w + 0.1, 0.2, 0.2, WOOD_D, hx, y0 + 1.6, hz - d / 2 - 0.02));
    // Gable roof, ridge along x, with deep eaves.
    const pitch = 0.72;
    const halfD = d / 2 + 0.7;
    const slab = halfD / Math.cos(pitch);
    const rise = Math.tan(pitch) * halfD;
    for (const s of [-1, 1]) {
      S.push(box(w + 1.4, 0.26, slab, LILAC_ROOF, hx, wallTop + rise / 2 - 0.05, hz + (s * halfD) / 2, 0, s * pitch, 0, { vary: 0.08 }));
      // Shingle courses as raised strips.
      for (let k = 1; k < 5; k++) {
        const f = k / 5;
        S.push(box(w + 1.42, 0.06, 0.12, 0x8c76b4, hx, wallTop + rise * (1 - f) + 0.13 - 0.05, hz + s * halfD * f, 0, s * pitch, 0));
      }
    }
    S.push(box(w + 1.5, 0.22, 0.34, 0x7f6aa6, hx, wallTop + rise + 0.06, hz));
    // Gable ends.
    const gp: number[] = [];
    for (const s of [-1, 1]) {
      const x = hx + (s * w) / 2;
      gp.push(x, wallTop, hz - d / 2, x, wallTop, hz + d / 2, x, wallTop + rise * (d / 2 / halfD), hz);
    }
    const gg = new BufferGeometry();
    gg.setAttribute('position', new BufferAttribute(new Float32Array(gp), 3));
    gg.computeVertexNormals();
    const gable = part(gg, CREAM);
    S.push(gable);
    const gg2 = gable.clone();
    // Back faces too, so the gables are solid from either side.
    const p2 = gg2.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < p2.count; i += 3) {
      const x1 = p2.getX(i + 1);
      const y1 = p2.getY(i + 1);
      const z1 = p2.getZ(i + 1);
      p2.setXYZ(i + 1, p2.getX(i + 2), p2.getY(i + 2), p2.getZ(i + 2));
      p2.setXYZ(i + 2, x1, y1, z1);
    }
    gg2.computeVertexNormals();
    S.push(gg2);
    // Round attic windows in the gables.
    for (const s of [-1, 1]) GLOW.push(part(at(new CylinderGeometry(0.42, 0.42, 0.08, 12), hx + s * (w / 2 + 0.03), wallTop + 1.0, hz, 0, 0, Math.PI / 2), 0xffffff));
    // Chimney.
    S.push(box(0.9, 3.2, 0.9, STONE_W, hx + 2.4, wallTop + 1.6, hz + 1.2, 0, 0, 0, { flat: true, vary: 0.12 }));
    S.push(box(1.1, 0.22, 1.1, STONE, hx + 2.4, wallTop + 3.25, hz + 1.2));
    // Door, windows and window boxes.
    const fz = hz - d / 2 - 0.04;
    S.push(box(1.2, 2.2, 0.12, 0x5c6e8e, DOOR.x, y0 + 0.45 + 1.1, fz));
    S.push(box(1.45, 0.2, 0.16, WOOD_D, DOOR.x, y0 + 0.45 + 2.28, fz));
    for (const wx of [hx - 2.6, hx + 2.6]) {
      GLOW.push(part(at(new BoxGeometry(1.2, 1.1, 0.06), wx, y0 + 2.2, fz - 0.02), 0xffffff));
      S.push(box(1.45, 0.14, 0.14, WOOD_D, wx, y0 + 2.82, fz - 0.03));
      S.push(box(1.45, 0.14, 0.14, WOOD_D, wx, y0 + 1.58, fz - 0.03));
      S.push(box(0.08, 1.1, 0.1, WOOD_D, wx, y0 + 2.2, fz - 0.06));
      S.push(box(1.4, 0.3, 0.36, WOOD, wx, y0 + 1.38, fz - 0.2));
      for (let k = 0; k < 6; k++) S.push(blob(0.13, k % 2 ? 0xf3a77a : 0xc9a6e0, wx - 0.55 + k * 0.22, y0 + 1.6, fz - 0.2, 0.3, k));
    }
    for (const s of [-1, 1]) GLOW.push(part(at(new BoxGeometry(0.06, 1.1, 1.2), hx + s * (w / 2 + 0.03), y0 + 2.2, hz - 0.8), 0xffffff));
    // Porch: deck, posts and a little roof.
    const pcx = (PORCH.x0 + PORCH.x1) / 2;
    const pcz = (PORCH.z0 + PORCH.z1) / 2;
    const deckTop = heightAt(pcx, pcz) + PORCH.y;
    S.push(box(PORCH.x1 - PORCH.x0, 0.3, PORCH.z1 - PORCH.z0, WOOD_L, pcx, deckTop - 0.15, pcz));
    for (let k = 0; k < 7; k++) S.push(box(0.04, 0.02, PORCH.z1 - PORCH.z0, WOOD, PORCH.x0 + 0.5 + k * 1.05, deckTop + 0.005, pcz));
    for (const px of [PORCH.x0 + 0.2, pcx - 1.6, pcx + 1.6, PORCH.x1 - 0.2]) S.push(box(0.16, 2.4, 0.16, WOOD_D, px, deckTop + 1.2, PORCH.z0 + 0.15));
    S.push(box(PORCH.x1 - PORCH.x0 + 0.6, 0.14, 2.0, 0x8c76b4, pcx, deckTop + 2.55, pcz - 0.15, 0, -0.22));
    // A lantern by the door.
    GLOW.push(part(at(new BoxGeometry(0.22, 0.3, 0.22), DOOR.x + 1.0, y0 + 2.5, fz - 0.15), 0xffffff));
    S.push(box(0.3, 0.06, 0.3, WOOD_D, DOOR.x + 1.0, y0 + 2.68, fz - 0.15));
  }

  // ------------------------------------------------------------ the windmill
  const sails = new Group();
  {
    const x = WINDMILL.x;
    const z = WINDMILL.z;
    const y0 = heightAt(x, z) - 0.3;
    S.push(part(at(new CylinderGeometry(1.05, 1.7, 8.6, 8), x, y0 + 4.3, z), 0xe9dcc2, { flat: true, vary: 0.05, top: 0xf4ead6, topAt: y0 + 6 }));
    for (const h of [2.4, 5.2]) S.push(part(at(new CylinderGeometry(1.7 - (h / 8.6) * 0.65 + 0.06, 1.7 - (h / 8.6) * 0.65 + 0.08, 0.22, 8), x, y0 + h, z), WOOD_D, { flat: true }));
    S.push(part(at(new ConeGeometry(1.5, 2.1, 8), x, y0 + 9.6, z), LILAC_ROOF, { flat: true }));
    S.push(box(0.9, 1.7, 0.1, 0x5c6e8e, x, y0 + 0.85 + 0.3, z - 1.62, 0, -0.06));
    GLOW.push(part(at(new BoxGeometry(0.5, 0.6, 0.06), x, y0 + 4.6, z - 1.42, -0.07), 0xffffff));
    // Sails face north over the meadow.
    const hubY = y0 + 7.6;
    const hubZ = z - 1.5;
    const sg: G[] = [];
    sg.push(part(at(new CylinderGeometry(0.28, 0.28, 0.6, 8), 0, 0, 0, Math.PI / 2), WOOD_D, { flat: true }));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const spar = new BoxGeometry(0.14, 4.6, 0.1);
      at(spar, 0, 2.4, 0.1);
      at(spar, 0, 0, 0, 0, 0, a);
      sg.push(part(spar, WOOD_D));
      const sail = new BoxGeometry(0.95, 3.6, 0.04);
      at(sail, 0.56, 2.8, 0.12);
      at(sail, 0, 0, 0, 0, 0, a);
      sg.push(part(sail, k % 2 ? 0xf3ead6 : 0xf0dccb, { vary: 0.02 }));
      for (let r = 0; r < 4; r++) {
        const bar = new BoxGeometry(1.0, 0.05, 0.06);
        at(bar, 0.56, 1.3 + r * 1.0, 0.15);
        at(bar, 0, 0, 0, 0, 0, a);
        sg.push(part(bar, WOOD));
      }
    }
    const sm = new Mesh(merge(sg), matte());
    sm.castShadow = true;
    sails.add(sm);
    sails.position.set(x, hubY, hubZ);
    group.add(sails);
  }

  // ------------------------------------------------------------ the Exchange
  {
    const x = EXCHANGE.x;
    const z = EXCHANGE.z;
    const y0 = heightAt(x, z);
    const w = CRATE.x1 - CRATE.x0;
    const h = CRATE.h;
    for (const [dx, dz, ww, dd] of [
      [0, -w / 2, w, 0.1],
      [0, w / 2, w, 0.1],
      [-w / 2, 0, 0.1, w],
      [w / 2, 0, 0.1, w],
    ]) {
      for (let k = 0; k < 4; k++) S.push(box(ww + 0.02, 0.22, dd + 0.02, k === 2 ? 0xe9a46e : k % 2 ? WOOD_L : 0xb88a5e, x + dx, y0 + 0.14 + k * 0.25, z + dz, 0, 0, 0, { vary: 0.08 }));
    }
    for (const [cx, cz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) S.push(box(0.14, h + 0.12, 0.14, WOOD_D, x + (cx * w) / 2, y0 + h / 2, z + (cz * w) / 2));
    S.push(box(w - 0.1, 0.05, w - 0.1, 0x3a2e24, x, y0 + 0.35, z));
    // A plate on the side facing the lane says what the crate is for.
    SIGN.push(quadUV(1.0, 0.25, atlas.uv['plate-sell'], x, y0 + 0.62, z - w / 2 - 0.075, Math.PI));
    // The board on its easel, facing the lane.
    const bx = BOARD.x;
    const bz = BOARD.z;
    const by = heightAt(bx, bz);
    const ry = Math.atan2(-1 - bx, 30 - bz);
    const fx = Math.sin(ry);
    const fzz = Math.cos(ry);
    const rx = Math.cos(ry);
    const rz = -Math.sin(ry);
    // Easel legs outside and behind the board, so they never cover the chalk.
    for (const s of [-1, 1]) S.push(beam(bx + rx * s * 0.86 + fx * 0.2, by, bz + rz * s * 0.86 + fzz * 0.2, bx + rx * s * 0.84 - fx * 0.1, by + 2.3, bz + rz * s * 0.84 - fzz * 0.1, 0.09, WOOD_D));
    S.push(beam(bx - rx * 0.4 - fx * 0.2, by, bz - rz * 0.4 - fzz * 0.2, bx - fx * 0.1, by + 2.1, bz - fzz * 0.1, 0.08, WOOD_D));
    S.push(box(1.62, 1.2, 0.08, WOOD, bx, by + 1.62, bz, ry, -0.1));
    S.push(box(1.84, 0.1, 0.1, WOOD_D, bx - fx * 0.06, by + 2.27, bz - fzz * 0.06, ry, -0.1));
    const board = new Mesh(new PlaneGeometry(1.48, 1.08), boardMat);
    board.position.set(bx + fx * 0.06, by + 1.62, bz + fzz * 0.06);
    board.rotation.set(-0.1, ry, 0, 'YXZ');
    board.name = 'board';
    group.add(board);
    boardMesh = board;
  }

  // ------------------------------------------------------------ the workbench
  {
    const x = WORKBENCH.x;
    const z = WORKBENCH.z;
    const y0 = heightAt(x, z);
    S.push(box(1.0, 0.12, 2.1, WOOD_L, x, y0 + 0.95, z));
    for (const [dx, dz] of [
      [-0.4, -0.9],
      [0.4, -0.9],
      [-0.4, 0.9],
      [0.4, 0.9],
    ]) S.push(box(0.1, 0.95, 0.1, WOOD_D, x + dx, y0 + 0.47, z + dz));
    S.push(box(0.9, 0.06, 1.9, WOOD, x, y0 + 0.3, z));
    // Tools: a spare nozzle, a mallet, a coil of leather.
    S.push(part(at(new ConeGeometry(0.1, 0.4, 8), x, y0 + 1.05, z - 0.5, 0, 0, Math.PI / 2), 0xc9a24a, { flat: true }));
    S.push(box(0.08, 0.08, 0.4, WOOD_D, x + 0.1, y0 + 1.05, z + 0.3));
    S.push(box(0.16, 0.12, 0.12, 0x8a8076, x + 0.1, y0 + 1.07, z + 0.52));
    S.push(part(at(new CylinderGeometry(0.16, 0.16, 0.12, 10), x - 0.15, y0 + 1.07, z + 0.1), 0x8a5a3c, { flat: true }));
    // Pegboard on the wall.
    const wallX = HOUSE.x + HOUSE.w / 2;
    S.push(box(0.06, 1.3, 2.2, 0xd8bf94, wallX + 0.04, y0 + 2.0, z));
    S.push(box(0.12, 0.12, 2.4, WOOD_D, wallX + 0.1, y0 + 2.7, z));
    SIGN.push(quadUV(0.9, 0.23, atlas.uv['plate-bench'], wallX + 0.09, y0 + 1.55, z, Math.PI / 2));
  }
  const benchRail = { x: HOUSE.x + HOUSE.w / 2 + 0.25, y: heightAt(WORKBENCH.x, WORKBENCH.z) + 2.62, z: WORKBENCH.z - 1.0, ax: 0, az: 1, ry: Math.PI / 2 };

  // ------------------------------------------------------------ pad posts
  for (const p of PADS) {
    const y0 = heightAt(p.px, p.pz);
    S.push(box(0.2, 2.3, 0.2, WOOD_D, p.px, y0 + 1.1, p.pz));
    S.push(box(3.6, 0.13, 0.13, WOOD, p.px + 1.7, y0 + 2.2, p.pz));
    S.push(beam(p.px, y0 + 1.6, p.pz, p.px + 0.6, y0 + 2.2, p.pz, 0.08, WOOD));
    S.push(box(0.12, 0.25, 0.12, WOOD_D, p.px + 3.5, y0 + 2.2, p.pz));
  }

  // ------------------------------------------------------------ fences and the ranch gate
  {
    const fence = (x0: number, x1: number) => {
      const n = Math.max(1, Math.round((x1 - x0) / 2.6));
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n;
        const y = heightAt(x, RANCH_Z);
        S.push(box(0.16, 1.2, 0.16, WOOD_D, x, y + 0.45, RANCH_Z, hash2(k, 3) * 0.2));
        if (k < n) {
          const xn = x0 + ((x1 - x0) * (k + 1)) / n;
          const yn = heightAt(xn, RANCH_Z);
          for (const h of [0.42, 0.88]) S.push(beam(x, y + h, RANCH_Z + 0.06, xn, yn + h, RANCH_Z + 0.06, 0.1, WOOD, { vary: 0.1 }));
        }
      }
    };
    fence(RIDGE_X + 1.5, -2.6);
    fence(2.6, HOLLOW_X - 1.5);
    const gy = heightAt(0, RANCH_Z);
    for (const s of [-1, 1]) S.push(box(0.32, 3.8, 0.32, WOOD_D, s * 2.6, gy + 1.7, RANCH_Z));
    S.push(box(6.2, 0.32, 0.36, WOOD_D, 0, gy + 3.6, RANCH_Z));
    for (const s of [-1, 1]) S.push(beam(s * 2.6, gy + 2.8, RANCH_Z, s * 1.8, gy + 3.6, RANCH_Z, 0.12, WOOD));
    for (const s of [-1, 1]) {
      S.push(beam(s * 1.4, gy + 3.45, RANCH_Z, s * 1.4, gy + 3.05, RANCH_Z, 0.03, 0x4a3828));
      SIGN.push(quadUV(3.2, 0.56, atlas.uv['arch'], 0, gy + 2.8, RANCH_Z + s * 0.03, s > 0 ? 0 : Math.PI));
    }
    S.push(box(3.3, 0.62, 0.04, WOOD_D, 0, gy + 2.8, RANCH_Z));
    // The teaching sign, facing anyone leaving the ranch.
    const sx = GATE_SIGN.x + 1.0;
    const sz = GATE_SIGN.z + 0.4;
    const sy = heightAt(sx, sz);
    S.push(box(0.14, 1.6, 0.14, WOOD_D, sx - 0.45, sy + 0.8, sz));
    S.push(box(0.14, 1.6, 0.14, WOOD_D, sx + 0.45, sy + 0.8, sz));
    S.push(box(1.12, 0.86, 0.06, WOOD_D, sx, sy + 1.25, sz - 0.02, 0, -0.08));
    SIGN.push(quadUV(1.04, 0.78, atlas.uv['teach'], sx, sy + 1.25, sz + 0.02, 0, -0.08));
  }

  // ------------------------------------------------------------ the fork signpost
  {
    const x = FORK.x + 1.3;
    const z = FORK.z + 0.6;
    const y = heightAt(x, z);
    S.push(box(0.16, 3.0, 0.16, WOOD_D, x, y + 1.4, z));
    const arrows: [string][] = [['ridge'], ['hollow'], ['oak'], ['ranch']];
    arrows.forEach(([k], i) => {
      // Each board points along the way it names; the lettering faces south.
      const dir = k === 'ridge' || k === 'ranch' ? -1 : 1;
      const len = 1.24;
      const h = y + 2.55 - i * 0.32;
      const cx = x + dir * len * 0.5;
      S.push(box(len, 0.2, 0.05, WOOD, cx, h, z - 0.04));
      SIGN.push(quadUV(len, 0.2, atlas.uv[k], cx, h, z + 0.001, 0));
    });
  }

  // ------------------------------------------------------------ zone walls and gates
  const gateObjs = {} as Props['gates'];
  {
    const R = rng(77);
    const wall = (x: number, zone: 'ridge' | 'hollow') => {
      const gz = GATES[zone].z;
      const segs: [number, number][] = [
        [MINZ + 1, gz - GATE_HALF - 0.9],
        [gz + GATE_HALF + 0.9, MAXZ - 1],
      ];
      for (const [z0, z1] of segs) {
        const n = Math.round((z1 - z0) / 1.6);
        for (let k = 0; k < n; k++) {
          const za = z0 + ((z1 - z0) * k) / n;
          const zb = z0 + ((z1 - z0) * (k + 1)) / n;
          const zc = (za + zb) / 2;
          const y = Math.min(heightAt(x, za), heightAt(x, zb));
          const hh = 1.9 + R() * 0.25;
          const tone = R() < 0.5 ? STONE : zone === 'ridge' ? 0xc6a892 : 0xa7aeb0;
          S.push(part(jitter(new BoxGeometry(1.0, hh, zb - za + 0.1, 1, 2, 1), 0.12, k), tone, { flat: true, vary: 0.14 }));
          at(S[S.length - 1], x + (R() - 0.5) * 0.12, y + hh / 2 - 0.35, zc, 0, (R() - 0.5) * 0.04);
          S.push(blob(0.38 + R() * 0.12, R() < 0.7 ? 0x9aa48a : STONE_W, x + (R() - 0.5) * 0.2, y + hh - 0.3, zc, 0.35, k + 9, 0.7, 0));
        }
      }
      // Pillars.
      const py = heightAt(x, gz);
      for (const s of [-1, 1]) {
        S.push(box(1.0, 2.9, 1.0, STONE_W, x, py + 1.2, gz + s * (GATE_HALF + 0.4), 0, 0, 0, { flat: true, vary: 0.15 }));
        S.push(box(1.2, 0.25, 1.2, STONE, x, py + 2.75, gz + s * (GATE_HALF + 0.4)));
      }
      // Two wooden leaves, hinged at the pillars.
      const leaf = (s: number) => {
        const o = new Group();
        const lg: G[] = [];
        const len = GATE_HALF - 0.05;
        for (const h of [0.35, 0.85, 1.35]) lg.push(box(0.08, 0.14, len, WOOD, 0, h, (-s * len) / 2));
        for (let k = 0; k <= 3; k++) lg.push(box(0.1, 1.6, 0.1, WOOD_D, 0, 0.85, (-s * len * k) / 3));
        lg.push(beam(0, 0.3, 0, 0, 1.4, -s * len, 0.08, WOOD_D));
        const m = new Mesh(merge(lg), matte());
        m.castShadow = true;
        o.add(m);
        o.position.set(x, py, gz + s * GATE_HALF);
        group.add(o);
        return o;
      };
      // A price tag hangs on the closed gate.
      const tag = new Group();
      const tg = merge([box(0.05, 0.36, 0.6, 0xd8bc8a, 0, 0, 0), beam(0, 0.18, 0, 0, 0.5, 0, 0.02, 0x4a3828)]);
      tag.add(new Mesh(tg, matte()));
      tag.position.set(x + (zone === 'ridge' ? 0.12 : -0.12), py + 1.05, gz);
      group.add(tag);
      gateObjs[zone] = { left: leaf(-1), right: leaf(1), tag };
    };
    wall(RIDGE_X, 'ridge');
    wall(HOLLOW_X, 'hollow');
  }

  // ------------------------------------------------------------ footbridges
  for (const c of crossings()) {
    const top = Math.max(heightAt(c.x + Math.sin(c.angle) * 3, c.z + Math.cos(c.angle) * 3), heightAt(c.x - Math.sin(c.angle) * 3, c.z - Math.cos(c.angle) * 3)) + 0.05;
    const parts: G[] = [];
    for (let k = 0; k < 6; k++) parts.push(box(0.29, 0.1, 6.2, k % 2 ? WOOD_L : 0xb08660, -0.75 + k * 0.3, top - 0.05, 0, 0, 0, 0, { vary: 0.1 }));
    for (const s of [-1, 1]) {
      for (const pz of [-2.8, 0, 2.8]) parts.push(box(0.12, 1.0, 0.12, WOOD_D, s * 0.95, top + 0.45, pz));
      parts.push(box(0.1, 0.1, 6.0, WOOD, s * 0.95, top + 0.92, 0));
    }
    for (const g of parts) {
      at(g, 0, 0, 0, 0, c.angle, 0);
      at(g, c.x, 0, c.z);
      S.push(g);
    }
  }

  // ------------------------------------------------------------ landmarks: oak, dead tree, crag, vents
  {
    const y = heightAt(OAK.x, OAK.z);
    const R = rng(5);
    S.push(limb(OAK.x, y - 0.5, OAK.z, OAK.x + 0.3, y + 4.2, OAK.z - 0.2, 1.15, 0.75, 0x7a6058, 8));
    const crown: [number, number, number][] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + R();
      const ex = OAK.x + Math.cos(a) * 3.6;
      const ez = OAK.z + Math.sin(a) * 3.6;
      const ey = y + 5.4 + R() * 1.2;
      S.push(limb(OAK.x + 0.2, y + 3.6, OAK.z, ex, ey, ez, 0.5, 0.2, 0x7a6058));
      crown.push([ex, ey + 0.8, ez]);
    }
    crown.push([OAK.x, y + 7.6, OAK.z]);
    crown.forEach(([cx, cy, cz], k) => S.push(blob(2.4 + R() * 0.8, k % 2 ? 0x86a868 : 0x93b06c, cx, cy, cz, 0.3, k + 40)));
    for (let k = 0; k < 5; k++) S.push(blob(1.7, 0x9cb874, OAK.x + (R() - 0.5) * 5, y + 8 + R() * 1.5, OAK.z + (R() - 0.5) * 5, 0.3, k + 60));
  }
  {
    const x = DEAD_TREE.x;
    const z = DEAD_TREE.z;
    const y = heightAt(x, z);
    const R = rng(9);
    const bone = 0xe6e0dc;
    S.push(limb(x, y - 0.4, z, x + 0.5, y + 4.8, z + 0.3, 0.55, 0.3, bone, 7));
    const grow = (ax: number, ay: number, az: number, a: number, len: number, r: number, depth: number) => {
      const bx = ax + Math.cos(a) * len * 0.7;
      const bz = az + Math.sin(a) * len * 0.7;
      const by = ay + len * (0.6 + R() * 0.4);
      S.push(limb(ax, ay, az, bx, by, bz, r, r * 0.6, bone, 5));
      if (depth > 0) for (let k = 0; k < 2; k++) grow(bx, by, bz, a + (R() - 0.5) * 1.8, len * 0.65, r * 0.6, depth - 1);
    };
    for (let k = 0; k < 4; k++) grow(x + 0.4, y + 3.6 + k * 0.4, z + 0.25, (k / 4) * Math.PI * 2 + R(), 2.6, 0.22, 2);
  }
  {
    const y = heightAt(CRAG.x, CRAG.z);
    const tiers = [
      [3.6, 3.0, 4.5],
      [3.0, 2.4, 4],
      [2.4, 1.6, 4],
      [1.6, 0.7, 3.5],
    ];
    let h = y - 1.2;
    tiers.forEach(([r0, r1, th], k) => {
      const g = jitter(new CylinderGeometry(r1, r0, th, 7, 2), 0.5, k + 3);
      at(g, CRAG.x + k * 0.35, h + th / 2, CRAG.z - k * 0.2, 0, k * 0.7, 0.04 * k);
      S.push(part(g, k % 2 ? 0xc59272 : 0xb98468, { flat: true, vary: 0.14, top: 0xd8b08a, topAt: h + th - 0.6 }));
      h += th - 0.3;
    });
    S.push(blob(1.0, 0x9a8a5e, CRAG.x + 1.2, h, CRAG.z - 0.8, 0.4, 3, 0.6, 0));
  }
  for (const [vx, vz] of VENTS) {
    const y = heightAt(vx, vz);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      S.push(blob(0.45 + hash2(k, vx) * 0.3, k % 3 ? 0xb07a62 : 0xd8a46c, vx + Math.cos(a) * 1.1, y + 0.05, vz + Math.sin(a) * 1.1, 0.4, k + 20, 0.7, 0));
    }
    S.push(part(at(new CylinderGeometry(0.75, 0.9, 0.2, 9), vx, y + 0.02, vz), 0x4a3430, { flat: true }));
    S.push(part(at(new CylinderGeometry(1.8, 2.1, 0.08, 10), vx, y - 0.02, vz), 0xe0b878, { flat: true, vary: 0.2 }));
  }

  // ------------------------------------------------------------ merge the static set
  const staticMesh = new Mesh(merge(S), matte());
  staticMesh.castShadow = true;
  staticMesh.receiveShadow = true;
  staticMesh.name = 'static';
  group.add(staticMesh);

  const glow = new MeshLambertMaterial({ vertexColors: true, emissive: 0xffc77e, emissiveIntensity: 0, color: 0x8a94a8 });
  const glowMesh = new Mesh(merge(GLOW), glow);
  glowMesh.name = 'windows';
  group.add(glowMesh);

  const signMat = new MeshLambertMaterial({ map: atlas.tex, transparent: false });
  const signGeo = mergeGeometries(SIGN, false)!;
  for (const g of SIGN) g.dispose();
  const signMesh = new Mesh(signGeo, signMat);
  signMesh.name = 'signs';
  group.add(signMesh);

  // ------------------------------------------------------------ instanced flora
  group.add(...buildFlora());

  return {
    group,
    sails,
    gates: gateObjs,
    glow,
    board: boardMesh!,
    tagRails: { bench: benchRail },
    update(t: number, night: number) {
      sails.rotation.z = -t * 0.35;
      glow.emissiveIntensity = 0.15 + night * 1.6;
    },
  };
}

// ---------------------------------------------------------------- instanced flora

function swayMat(amount: number, flat = false): MeshLambertMaterial {
  const m = matte({ flat });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uWind = U.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3( instanceMatrix[3][0], 0.0, instanceMatrix[3][2] );
          float ph = uTime * 1.5 + ip.x * 0.3 + ip.z * 0.23;
          float gust = sin( dot( ip.xz, uWind.xy ) * 0.12 - uTime * 1.9 ) * 0.5 + 0.5;
          float k = max( transformed.y, 0.0 );
          transformed.x += ( sin( ph ) * 0.4 + gust * 0.8 ) * uWind.x * k * k * ${amount.toFixed(3)};
          transformed.z += ( cos( ph * 0.8 ) * 0.4 + gust * 0.8 ) * uWind.y * k * k * ${amount.toFixed(3)};
        }`,
      );
  };
  m.customProgramCacheKey = () => `sway:${amount}:${flat}`;
  return m;
}

function instanced(geo: BufferGeometry, mat: Material, list: { x: number; y: number; z: number; ry: number; s: number; sy?: number; color?: number }[], name: string, shadow = false): InstancedMesh {
  const m = new InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((p, i) => {
    _q.setFromAxisAngle(_up, p.ry);
    _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(p.s, p.s * (p.sy ?? 1), p.s));
    m.setMatrixAt(i, _m);
    m.setColorAt(i, _c.setHex(p.color ?? 0xffffff));
  });
  m.count = list.length;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere();
  m.castShadow = shadow;
  m.receiveShadow = false;
  m.name = name;
  return m;
}

function place(list: Placed[], lift = 0, color?: (p: Placed, i: number) => number, sy?: (p: Placed) => number) {
  return list.map((p, i) => ({ x: p.x, y: heightAt(p.x, p.z) + lift, z: p.z, ry: p.r, s: p.s, sy: sy?.(p), color: color?.(p, i) }));
}

function buildFlora(): Object3D[] {
  const out: Object3D[] = [];
  // Trunks for every broadleaf tree and willow.
  const trunk = merge([limb(0, -0.4, 0, 0.1, 3.2, 0, 0.32, 0.18, 0x846a62), limb(0.05, 2.0, 0, 0.9, 3.0, 0.3, 0.14, 0.06, 0x846a62), limb(0.05, 2.3, 0, -0.7, 3.3, -0.4, 0.12, 0.05, 0x846a62)]);
  const trunks = [...TREES, ...WILLOWS];
  out.push(instanced(trunk, matte({ flat: true }), place(trunks), 'trunks', true));
  // Broadleaf crowns: a few soft lumps, tinted per zone.
  const crown = merge([blob(1.7, 0xffffff, 0, 4.1, 0, 0.3, 1), blob(1.25, 0xf2f2f2, 1.1, 3.6, 0.4, 0.3, 2), blob(1.2, 0xf6f6f6, -0.9, 3.7, -0.5, 0.3, 3), blob(1.0, 0xe8e8e8, 0.2, 3.3, -1.0, 0.3, 4), blob(1.05, 0xfafafa, -0.3, 5.0, 0.4, 0.3, 5)]);
  const tint = (p: Placed, i: number) => {
    const z = zoneAt(p.x, p.z);
    if (z === 'ranch') return i % 3 === 0 ? 0xf2c3a6 : 0x9fbc7a;
    if (z === 'hollow') return i % 2 ? 0x7fa88e : 0x8fb496;
    return [0x8fae6e, 0x9aab62, 0x7ea383, 0xa4b878, 0xe6dcc0][i % 5];
  };
  out.push(instanced(crown, swayMat(0.012, true), place(TREES, 0, tint), 'crowns', true));
  // Willows droop.
  const willow = merge([part(at(jitter(new SphereGeometry(2.3, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.62), 0.35, 7), 0, 2.4, 0, 0, 0, 0, 1, 1.25, 1), 0xffffff, { flat: true, vary: 0.1, top: 0xf0f0f0 }), blob(1.3, 0xf4f4f4, 0, 5.0, 0, 0.3, 8)]);
  out.push(instanced(willow, swayMat(0.02, true), place(WILLOWS, 0, (_p, i) => (i % 2 ? 0x86ae86 : 0x9cbf8c)), 'willows', true));
  // Pines on the ridge.
  const pine = merge([limb(0, -0.3, 0, 0, 2.0, 0, 0.22, 0.14, 0x7a5a4c), ...[0, 1, 2, 3].map((k) => part(at(jitter(new ConeGeometry(1.5 - k * 0.32, 1.9, 7), 0.15, k), 0, 1.7 + k * 1.05, 0), 0xffffff, { flat: true, vary: 0.1 }))]);
  out.push(instanced(pine, swayMat(0.006, true), place(PINES, 0, (_p, i) => (i % 2 ? 0x6e8c6a : 0x7c9a6a)), 'pines', true));
  // Rocks.
  const rock = part(jitter(new DodecahedronGeometry(0.9, 0), 0.35, 3), 0xffffff, { flat: true, vary: 0.12 });
  at(rock, 0, 0, 0, 0, 0, 0, 1, 0.7, 1);
  out.push(
    instanced(
      rock,
      matte({ flat: true }),
      place(ROCKS, -0.15, (p, i) => {
        const z = zoneAt(p.x, p.z);
        return z === 'ridge' ? [0xd0a080, 0xc4927a, 0xdcb294][i % 3] : [0xb8b0b4, 0xa8a4ac, 0xc0b8aa][i % 3];
      }),
      'rocks',
      true,
    ),
  );
  // Clover patches: trefoils with pink heads.
  {
    const parts: G[] = [];
    const R = rng(11);
    for (let k = 0; k < 16; k++) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * 1.0;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      for (let l = 0; l < 3; l++) {
        const la = (l / 3) * Math.PI * 2 + R();
        const g = new SphereGeometry(0.075, 5, 3);
        at(g, x + Math.cos(la) * 0.07, 0.1 + R() * 0.06, z + Math.sin(la) * 0.07, 0, 0, 0, 1, 0.3, 1);
        parts.push(part(g, k % 3 ? 0x5f9a4a : 0x78ad58, { flat: true }));
      }
    }
    for (let k = 0; k < 5; k++) parts.push(blob(0.06, 0xf2b8d4, (R() - 0.5) * 1.6, 0.2, (R() - 0.5) * 1.6, 0.2, k, 1, 0));
    out.push(instanced(merge(parts), matte({ flat: true }), place(CLOVER_PATCHES), 'clover'));
  }
  // Dewberry bushes.
  {
    const g = merge([blob(0.62, 0x52745e, 0, 0.5, 0, 0.3, 1), blob(0.5, 0x5c8064, 0.45, 0.42, 0.2, 0.3, 2), blob(0.48, 0x4c6c58, -0.35, 0.44, -0.3, 0.3, 3)]);
    out.push(instanced(g, swayMat(0.01, true), place(BERRY_BUSHES), 'bushes', true));
  }
  // Sweetroot tops.
  {
    const parts: G[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const g = new ConeGeometry(0.07, 0.6, 4);
      at(g, Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      parts.push(part(g, k % 2 ? 0x8aa04a : 0xa0a84e, { flat: true }));
    }
    const g = merge(parts);
    const list = ROOT_PATCHES.flatMap((p) => [0, 1, 2].map((k) => ({ x: p.x + Math.cos(k * 2.1) * 0.6, y: heightAt(p.x, p.z), z: p.z + Math.sin(k * 2.1) * 0.6, ry: k, s: 1 })));
    out.push(instanced(g, swayMat(0.15, true), list, 'roots'));
  }
  // Reeds and cattails.
  {
    const parts: G[] = [];
    const R = rng(13);
    for (let k = 0; k < 9; k++) {
      const g = new BoxGeometry(0.035, 1.6 + R() * 0.6, 0.02);
      at(g, (R() - 0.5) * 0.6, 0.8, (R() - 0.5) * 0.6, (R() - 0.5) * 0.2, R() * 3, (R() - 0.5) * 0.25);
      parts.push(part(g, k % 2 ? 0x6e9a62 : 0x8aac6a, { top: 0xc0c486, topAt: 1.2 }));
    }
    for (let k = 0; k < 2; k++) parts.push(part(at(new CylinderGeometry(0.05, 0.05, 0.28, 6), (k - 0.5) * 0.3, 1.9 + k * 0.2, 0.1), 0x7a5640, { flat: true }));
    out.push(instanced(merge(parts), swayMat(0.08), place(REEDS, -0.1), 'reeds'));
  }
  // Lily pads, some with flowers.
  {
    const pad = new CylinderGeometry(0.42, 0.42, 0.02, 10, 1, false, 0.3, Math.PI * 1.8);
    const flower = merge([blob(0.09, 0xf6c6d8, 0.1, 0.06, 0.05, 0.2, 1, 0.6, 0), blob(0.05, 0xf8e8a0, 0.1, 0.1, 0.05, 0.1, 2, 1, 0)]);
    const g = merge([part(pad, 0x6a9e64, { flat: true }), flower]);
    const list = LILIES.map((p) => ({ x: p.x, y: POND.level + 0.02, z: p.z, ry: p.r, s: p.s }));
    out.push(instanced(g, matte({ flat: true }), list, 'lilies'));
  }
  // Wildflowers: lilac, apricot and cream drifts.
  {
    const parts: G[] = [];
    const R = rng(17);
    for (let k = 0; k < 5; k++) {
      const x = (R() - 0.5) * 0.7;
      const z = (R() - 0.5) * 0.7;
      const h = 0.3 + R() * 0.25;
      parts.push(part(at(new BoxGeometry(0.02, h, 0.02), x, h / 2, z), 0x6e9a52));
      const head = new CylinderGeometry(0.075, 0.05, 0.04, 5);
      at(head, x, h, z, 0.2, R() * 6, 0);
      parts.push(part(head, 0xffffff, { flat: true }));
    }
    const g = merge(parts);
    const cols = [0xc9a6e8, 0xf3a87e, 0xf6ead0, 0xb2a4ec, 0xf0bfd0];
    out.push(instanced(g, swayMat(0.5), place(FLOWERS, 0, (_p, i) => cols[i % cols.length]), 'flowers'));
  }
  return out;
}

/** The empty garden bed height, for the pads module. */
export const BED_TOP = BED_H;
