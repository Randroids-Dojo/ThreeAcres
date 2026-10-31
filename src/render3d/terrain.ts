// The chunk of earth the farm sits on: the ground tiles, the cut sides with
// their soil layers, flagstone paths, the pond and the tree belt. Static apart
// from the season, so it is merged into a handful of meshes and rebuilt only
// when the season turns.

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import type { Season, TileKind } from '../sim/types';
import { GeoBuilder, ball, blade, cone, cyl, ico } from './builder';
import type { Materials } from './materials';
import { U } from './materials';
import { SEASONS, type SeasonPalette } from './palette';
import { at, col, hash2, mixInto, noise2, rng, tone } from './util';

export const POND = { cx: 18, cz: 12.5, hx: 0.86, hz: 1.36 };

const C = {
  yard: col('#c4a679'),
  yardDark: col('#a88a60'),
  gravel: col('#b5a88f'),
  stone: col('#cdc2ac'),
  stoneDark: col('#b3a68f'),
  fieldBase: col('#6f5338'),
  turfSoil: col('#4f3a27'),
  topsoil: col('#5c4029'),
  topsoil2: col('#4a3322'),
  clay: col('#b47a46'),
  clay2: col('#9c6638'),
  sand: col('#d7b886'),
  rock: col('#8d8b86'),
  rock2: col('#76746f'),
  rockDeep: col('#626069'),
  root: col('#6b4a2e'),
  pebble: col('#bdb5a6'),
  bank: col('#6b583c'),
  bankDeep: col('#3b3a30'),
  pondBed: col('#3e4d40'),
  trunk: col('#6b4a31'),
  trunkDark: col('#4d3524'),
  reed: col('#7d9a4a'),
  cattail: col('#6b4528'),
  pad: col('#5d9a48'),
  lily: col('#f6e7f0'),
  mushroom: col('#d65a3e'),
  holly: col('#2f5a3a'),
  berry: col('#c8323a'),
};

const _k = new Color();
const _k2 = new Color();

function tileAt(tiles: readonly TileKind[], W: number, H: number, x: number, y: number): TileKind | null {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  return tiles[y * W + x];
}

export interface Terrain {
  group: Group;
  water: Mesh;
  dispose(): void;
}

export function buildTerrain(tiles: readonly TileKind[], W: number, H: number, season: Season, mats: Materials, waterMat: ShaderMaterial): Terrain {
  const pal = SEASONS[season];
  const ground = new GeoBuilder();
  const trees = new GeoBuilder();
  const grass = new GeoBuilder();

  groundTop(ground, tiles, W, H, pal);
  slabSides(ground, tiles, W, H, pal);
  paths(ground, tiles, W, H);
  const water = pond(ground, grass, season, waterMat);
  belt(trees, grass, tiles, W, H, pal, season);
  tufts(grass, tiles, W, H, pal);

  const group = new Group();
  const g = new Mesh(ground.build(), mats.ground);
  g.receiveShadow = true;
  g.name = 'ground';
  const t = new Mesh(trees.build(true), mats.tree);
  t.castShadow = true;
  t.receiveShadow = true;
  t.name = 'trees';
  const gr = new Mesh(grass.build(true), mats.grass);
  gr.receiveShadow = true;
  gr.name = 'grass';
  group.add(g, t, gr, water);
  return {
    group,
    water,
    dispose() {
      g.geometry.dispose();
      t.geometry.dispose();
      gr.geometry.dispose();
      water.geometry.dispose();
    },
  };
}

function groundColor(kind: TileKind, wx: number, wz: number, pal: SeasonPalette, out: Color): Color {
  const n = noise2(wx * 1.7, wz * 1.7, 3);
  const n2 = noise2(wx * 5.1, wz * 5.1, 9);
  switch (kind) {
    case 'grass':
      mixInto(out, pal.grassDark, pal.grass, 0.45 + n * 0.55);
      return tone(out, 0, (n2 - 0.5) * 0.04);
    case 'wood':
      mixInto(out, pal.floor, pal.grassDark, n * 0.5);
      return tone(out, 0, (n2 - 0.5) * 0.05);
    case 'yard':
      mixInto(out, C.yardDark, C.yard, 0.35 + n * 0.65);
      return tone(out, 0, (n2 - 0.5) * 0.05);
    case 'path':
      return mixInto(out, C.gravel, C.stoneDark, n2 * 0.6);
    case 'field':
      return mixInto(out, C.fieldBase, C.turfSoil, n * 0.6);
    case 'water':
      return out.copy(pal.grass);
  }
}

/** Every tile is a 3 by 3 grid of quads with colour noise; water tiles are left for the pond. */
function groundTop(b: GeoBuilder, tiles: readonly TileKind[], W: number, H: number, pal: SeasonPalette): void {
  const S = 2;
  const p = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const k = new Color();
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const kind = tiles[ty * W + tx];
      if (kind === 'water') continue;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const x0 = tx + i / S;
          const z0 = ty + j / S;
          const x1 = tx + (i + 1) / S;
          const z1 = ty + (j + 1) / S;
          p[0].set(x0, 0, z0);
          p[1].set(x1, 0, z0);
          p[2].set(x1, 0, z1);
          p[3].set(x0, 0, z1);
          groundColor(kind, (x0 + x1) / 2, (z0 + z1) / 2, pal, k);
          b.tri(p[0], p[3], p[2], k);
          b.tri(p[0], p[2], p[1], k);
        }
      }
    }
  }
}

/** The cut sides: turf lip, dark topsoil with roots, ochre clay with pebbles, a sand seam, grey rock, a ragged underside. */
function slabSides(b: GeoBuilder, tiles: readonly TileKind[], W: number, H: number, pal: SeasonPalette): void {
  const per = 2 * (W + H);
  const step = 1 / 3;
  const cols = Math.round(per / step);
  const depths = [0, -0.07, -0.16, -0.32, -0.52, -0.74, -0.92, -1.12, -1.3, -1.42, -1.62, -1.88, -2.12, -2.4, -2.7, -2.95];
  // Edge point and outward normal at perimeter distance s.
  const edge = (s: number, out: Vector3, nrm: Vector2) => {
    s = ((s % per) + per) % per;
    if (s < W) {
      out.set(s, 0, 0);
      nrm.set(0, -1);
    } else if (s < W + H) {
      out.set(W, 0, s - W);
      nrm.set(1, 0);
    } else if (s < 2 * W + H) {
      out.set(W - (s - W - H), 0, H);
      nrm.set(0, 1);
    } else {
      out.set(0, 0, H - (s - 2 * W - H));
      nrm.set(-1, 0);
    }
  };
  const cx = W / 2;
  const cz = H / 2;
  const grid: Vector3[][] = [];
  const e = new Vector3();
  const nrm = new Vector2();
  for (let i = 0; i <= cols; i++) {
    const s = (i / cols) * per;
    edge(s, e, nrm);
    const row: Vector3[] = [];
    for (let j = 0; j < depths.length; j++) {
      const d = depths[j];
      let bulge = 0;
      if (j === 1) bulge = 0.05;
      else if (j > 1) bulge = (noise2(s * 0.9, d * 2.2, 5) - 0.5) * 0.14 + (d < -1.4 ? (hash2(Math.floor(s * 2), Math.floor(d * 3), 7) - 0.5) * 0.1 : 0);
      // Taper the bottom in towards the middle, raggedly.
      const taper = d < -2.1 ? Math.pow((-d - 2.1) / 0.85, 1.5) * (0.55 + 0.6 * noise2(s * 0.6, 1, 11)) : 0;
      const v = new Vector3(e.x + nrm.x * bulge, d, e.z + nrm.y * bulge);
      if (taper > 0) {
        v.x += (cx - v.x) * taper * 0.42;
        v.z += (cz - v.z) * taper * 0.42;
      }
      // Corners: never bulge outward past each other.
      if (i === 0 || i === cols) v.set(e.x, d, e.z);
      row.push(v);
    }
    grid.push(row);
  }
  const k = new Color();
  const lipKind = (s: number): TileKind => {
    edge(s, e, nrm);
    const tx = Math.min(W - 1, Math.max(0, Math.floor(e.x - (nrm.x > 0 ? 0.01 : 0))));
    const tz = Math.min(H - 1, Math.max(0, Math.floor(e.z - (nrm.y > 0 ? 0.01 : 0))));
    return tileAt(tiles, W, H, tx, tz) ?? 'wood';
  };
  for (let i = 0; i < cols; i++) {
    const s = ((i + 0.5) / cols) * per;
    const kind = lipKind(s);
    for (let j = 0; j < depths.length - 1; j++) {
      const a = grid[i][j];
      const bb = grid[i + 1][j];
      const c = grid[i + 1][j + 1];
      const d = grid[i][j + 1];
      const mid = (depths[j] + depths[j + 1]) / 2;
      layerColor(mid, s, kind, pal, k);
      // Outward-facing winding.
      b.tri(a, c, d, k);
      layerColor(mid - 0.01, s + 0.2, kind, pal, k);
      b.tri(a, bb, c, k);
    }
  }
  // Underside: fan to a ragged point below the middle.
  const bottom = new Vector3(cx, -3.25, cz);
  for (let i = 0; i < cols; i++) {
    const a = grid[i][depths.length - 1];
    const c = grid[i + 1][depths.length - 1];
    tone(k.copy(C.rockDeep), 0, (hash2(i, 3, 13) - 0.5) * 0.06);
    b.tri(a, c, bottom, k);
  }
  // Pebbles in the clay, roots in the topsoil.
  const r = rng(77);
  for (let n = 0; n < 70; n++) {
    const s = r() * per;
    edge(s, e, nrm);
    const d = -0.95 - r() * 0.4;
    const big = r() < 0.2;
    const rad = big ? 0.07 + r() * 0.05 : 0.03 + r() * 0.03;
    b.add(ico(1, 0), at(e.x + nrm.x * 0.03, d, e.z + nrm.y * 0.03, r() * 6, r() * 6, 0, rad * 1.3, rad, rad * 1.2), (w, nn) => tone(_k.copy(C.pebble), 0, nn.y * 0.05 + (hash2(Math.round(w.x * 50), Math.round(w.y * 50)) - 0.5) * 0.08), { flat: true });
  }
  for (let n = 0; n < 46; n++) {
    const s = r() * per;
    edge(s, e, nrm);
    const d = -0.2 - r() * 0.45;
    const len = 0.16 + r() * 0.22;
    const yaw = Math.atan2(-nrm.y, nrm.x);
    b.add(cyl(0.008, 0.016, len, 4), at(e.x + nrm.x * 0.02, d, e.z + nrm.y * 0.02, yaw + (r() - 0.5) * 0.8, 0, -1.2 - r() * 0.6), C.root);
  }
  // Big rocks jutting out of the stone layer.
  for (let n = 0; n < 26; n++) {
    const s = r() * per;
    edge(s, e, nrm);
    const d = -1.6 - r() * 0.7;
    const rad = 0.12 + r() * 0.14;
    b.add(ico(1, 0), at(e.x + nrm.x * 0.04, d, e.z + nrm.y * 0.04, r() * 6, r() * 6, r() * 6, rad * 1.4, rad, rad * 1.1), (w, nn) => tone(_k.copy(C.rock), 0, nn.y * 0.08 + (hash2(Math.round(w.x * 30), Math.round(w.z * 30)) - 0.5) * 0.06), { flat: true });
  }
}

function layerColor(d: number, s: number, kind: TileKind, pal: SeasonPalette, out: Color): Color {
  const n = noise2(s * 0.7, 0, 21) - 0.5;
  const v = (hash2(Math.floor(s * 9), Math.floor(d * 40), 23) - 0.5) * 0.05;
  if (d > -0.12) {
    if (kind === 'path') out.copy(C.gravel);
    else if (kind === 'yard') out.copy(C.yard);
    else if (kind === 'grass') out.copy(pal.grassDark);
    else out.copy(pal.floor);
    return tone(out, 0, v);
  }
  if (d > -0.8 + n * 0.16) {
    mixInto(out, C.topsoil, C.topsoil2, noise2(s * 2.3, d * 4, 31));
    return tone(out, 0, v);
  }
  if (d > -1.3 + n * 0.14) {
    mixInto(out, C.clay, C.clay2, noise2(s * 1.6, d * 3, 37));
    return tone(out, 0, v);
  }
  if (d > -1.44 + n * 0.1) return tone(out.copy(C.sand), 0, v);
  mixInto(out, C.rock, C.rock2, noise2(s * 1.2, d * 2, 41));
  return tone(out, 0, v * 1.5 + (d < -2.3 ? -0.05 : 0));
}

/** Flagstones on the gravel paths and pebbles in the yard. */
function paths(b: GeoBuilder, tiles: readonly TileKind[], W: number, H: number): void {
  const r = rng(91);
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const kind = tiles[ty * W + tx];
      if (kind === 'path') {
        // Two or three stones per tile, laid in a loose grid so the path reads as one surface.
        const n = 2 + Math.floor(hash2(tx, ty, 5) * 2);
        for (let i = 0; i < n; i++) {
          const ox = (i + 0.5) / n + (r() - 0.5) * 0.08;
          const oz = 0.5 + (r() - 0.5) * 0.3;
          const sx = 0.85 / n + r() * 0.06;
          const sz = 0.32 + r() * 0.22;
          const sides = 6 + Math.floor(r() * 3);
          b.add(cyl(0.5, 0.52, 0.035, sides), at(tx + ox, -0.01, ty + oz, r() * 3, 0, 0, sx, 1, sz * 1.2), (_w, nn) => tone(_k.copy(nn.y > 0.5 ? C.stone : C.stoneDark), 0, (hash2(tx * 7 + i, ty) - 0.5) * 0.07), { flat: true });
          if (r() < 0.5) {
            b.add(cyl(0.5, 0.52, 0.03, 6), at(tx + r(), -0.012, ty + (r() < 0.5 ? 0.1 : 0.9), r() * 3, 0, 0, 0.18, 1, 0.14), C.stoneDark, { flat: true });
          }
        }
      } else if (kind === 'yard' && hash2(tx, ty, 17) < 0.45) {
        for (let i = 0; i < 3; i++) {
          const rad = 0.025 + r() * 0.03;
          b.add(ico(1, 0), at(tx + r(), 0.005, ty + r(), r() * 6, 0, 0, rad * 1.4, rad * 0.7, rad), C.pebble, { flat: true });
        }
      }
    }
  }
}

/** The pond: a grassy rim cut by a soft-cornered basin, the water surface, reeds and lily pads. */
function pond(b: GeoBuilder, grass: GeoBuilder, season: Season, waterMat: ShaderMaterial): Mesh {
  const pal = SEASONS[season];
  const N = 40;
  const outline: Vector2[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // A superellipse with a little wobble.
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 0.55);
    const ez = Math.sign(s) * Math.pow(Math.abs(s), 0.55);
    const wob = 1 + (noise2(i * 0.45, 0, 51) - 0.5) * 0.12;
    outline.push(new Vector2(POND.cx + ex * POND.hx * wob, POND.cz + ez * POND.hz * wob));
  }
  // Rim: the 2 by 3 water tiles minus the pond.
  const x0 = POND.cx - 1;
  const x1 = POND.cx + 1;
  const z0 = POND.cz - 1.5;
  const z1 = POND.cz + 1.5;
  const rim = new Shape([new Vector2(x0, -z0), new Vector2(x1, -z0), new Vector2(x1, -z1), new Vector2(x0, -z1)]);
  rim.holes.push(new Shape(outline.map((p) => new Vector2(p.x, -p.y)).reverse()));
  const rimGeo = new ShapeGeometry(rim).rotateX(-Math.PI / 2);
  b.add(rimGeo, at(0, 0, 0), (w) => mixInto(_k, pal.grassDark, pal.grass, noise2(w.x * 1.7, w.z * 1.7, 3) * 0.8 + 0.2));
  rimGeo.dispose();
  // Basin walls, sloping in.
  const depth = -0.3;
  const inner = outline.map((p) => new Vector2(POND.cx + (p.x - POND.cx) * 0.86, POND.cz + (p.y - POND.cz) * 0.88));
  const a = new Vector3();
  const bb = new Vector3();
  const c = new Vector3();
  const d = new Vector3();
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    a.set(outline[i].x, 0, outline[i].y);
    bb.set(outline[j].x, 0, outline[j].y);
    c.set(inner[j].x, depth, inner[j].y);
    d.set(inner[i].x, depth, inner[i].y);
    tone(_k2.copy(C.bank), 0, (hash2(i, 1, 61) - 0.5) * 0.05);
    b.tri(a, c, bb, _k2);
    b.tri(a, d, c, mixInto(_k, C.bank, C.bankDeep, 0.5));
  }
  const bed = new ShapeGeometry(new Shape(inner.map((p) => new Vector2(p.x, -p.y)))).rotateX(-Math.PI / 2);
  b.add(bed, at(0, depth, 0), C.pondBed);
  bed.dispose();

  // Water surface with an edge factor (0 at the rim, 1 in the middle) for the shader.
  const surf = new ShapeGeometry(new Shape(outline.map((p) => new Vector2(POND.cx + (p.x - POND.cx) * 0.97, -(POND.cz + (p.y - POND.cz) * 0.97)))), 1).rotateX(-Math.PI / 2);
  const pos = surf.attributes.position;
  const edgeAttr: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const dx = (pos.getX(i) - POND.cx) / POND.hx;
    const dz = (pos.getZ(i) - POND.cz) / POND.hz;
    edgeAttr.push(Math.min(1, Math.max(0, 1 - Math.pow(Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dz), 4), 0.25))));
  }
  // ShapeGeometry has only boundary vertices; add a centre fan so the edge factor has an inside.
  const centre = toFan(surf, POND.cx, POND.cz);
  centre.setAttribute('aEdge', new Float32BufferAttribute(fanEdge(centre), 1));
  surf.dispose();
  const water = new Mesh(centre, waterMat);
  water.position.y = -0.07;
  water.receiveShadow = false;
  water.name = 'water';
  water.renderOrder = 1;

  // Reeds and cattails at the rim, lily pads on the water, stones on the bank.
  const r = rng(131);
  for (let i = 0; i < N; i += 1) {
    if (r() < 0.45) continue;
    const p = outline[i];
    const out = new Vector2(p.x - POND.cx, p.y - POND.cz).normalize();
    const px = p.x + out.x * 0.04;
    const pz = p.y + out.y * 0.04;
    if (season === 3) {
      if (r() < 0.5) b.add(ico(1, 0), at(px, 0.01, pz, r() * 6, 0, 0, 0.08, 0.05, 0.07), C.rock, { flat: true });
      continue;
    }
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const h = 0.25 + r() * 0.3;
      grass.add(blade(h, 0.035, (r() - 0.5) * 0.12), at(px + (r() - 0.5) * 0.1, 0, pz + (r() - 0.5) * 0.1, r() * 6), (_w, _n, l) => mixInto(_k, pal.grassDark, C.reed, l.y / h), { sway: (_w, l) => 0.06 * (l.y / h) });
    }
    if (r() < 0.4 && season !== 2) {
      const h = 0.42 + r() * 0.12;
      grass.add(cyl(0.006, 0.008, h, 3), at(px, 0, pz), C.reed, { sway: (_w, l) => 0.05 * (l.y / h) });
      grass.add(cyl(0.022, 0.022, 0.09, 5), at(px, h - 0.06, pz), C.cattail, { sway: 0.05 });
    } else if (r() < 0.5) {
      b.add(ico(1, 0), at(px, 0.01, pz, r() * 6, 0, 0, 0.09, 0.05, 0.08), C.rock, { flat: true });
    }
  }
  if (season !== 3) {
    for (let i = 0; i < 6; i++) {
      const px = POND.cx + (r() - 0.5) * POND.hx * 1.1;
      const pz = POND.cz + (r() - 0.5) * POND.hz * 1.3;
      const rad = 0.07 + r() * 0.05;
      b.add(cyl(rad, rad, 0.01, 9), at(px, -0.07, pz, r() * 6), C.pad, { flat: true });
      if (season === 0 || (season === 1 && r() < 0.5)) b.add(ico(0.035, 0), at(px + 0.02, -0.05, pz, r() * 6, 0, 0, 1, 0.7, 1), C.lily, { flat: true });
    }
  }
  return water;
}

/** Turns a boundary-only ShapeGeometry into a centre fan with a ring, so the surface has interior vertices. */
function toFan(src: BufferGeometry, cx: number, cz: number): BufferGeometry {
  // Recover the boundary order from the shape: ShapeGeometry keeps contour order for the first points.
  const pos = src.attributes.position;
  const ring: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) ring.push(new Vector3(pos.getX(i), 0, pos.getZ(i)));
  ring.sort((a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx));
  const out: number[] = [];
  const mid: Vector3[] = ring.map((p) => new Vector3(cx + (p.x - cx) * 0.55, 0, cz + (p.z - cz) * 0.55));
  const push = (p: Vector3) => out.push(p.x, 0, p.z);
  const c = new Vector3(cx, 0, cz);
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    push(ring[i]);
    push(mid[i]);
    push(ring[j]);
    push(ring[j]);
    push(mid[i]);
    push(mid[j]);
    push(mid[i]);
    push(c);
    push(mid[j]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(out, 3));
  const n: number[] = [];
  for (let i = 0; i < out.length / 3; i++) n.push(0, 1, 0);
  g.setAttribute('normal', new Float32BufferAttribute(n, 3));
  g.computeBoundingSphere();
  return g;
}

function fanEdge(g: BufferGeometry): number[] {
  const pos = g.attributes.position;
  const e: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const dx = (pos.getX(i) - POND.cx) / POND.hx;
    const dz = (pos.getZ(i) - POND.cz) / POND.hz;
    const rr = Math.pow(Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dz), 4), 0.25);
    e.push(Math.min(1, Math.max(0, 1 - rr)));
  }
  return e;
}

/** The tree belt: tall trees along the back, medium down the sides, low bushes along the front so they never hide a field. */
function belt(trees: GeoBuilder, grass: GeoBuilder, tiles: readonly TileKind[], W: number, H: number, pal: SeasonPalette, season: Season): void {
  const r = rng(4242 + season);
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      if (tiles[ty * W + tx] !== 'wood') continue;
      const back = ty === 0;
      const front = ty === H - 1;
      if (front) {
        const n = 2;
        for (let i = 0; i < n; i++) bush(trees, tx + (i + 0.5) / n + (r() - 0.5) * 0.15, ty + 0.55 + (r() - 0.5) * 0.2, 0.75 + r() * 0.4, pal, r);
        if (r() < 0.3) floorBits(grass, trees, tx, ty, pal, r);
        continue;
      }
      // Beside the road out: low bushes so the gate and the sign stay clear.
      if (tileAt(tiles, W, H, tx, ty - 1) === 'path' || tileAt(tiles, W, H, tx, ty + 1) === 'path') {
        bush(trees, tx + 0.55, ty + 0.5 + (tileAt(tiles, W, H, tx, ty - 1) === 'path' ? 0.2 : -0.1), 0.8, pal, r);
        continue;
      }
      const n = back ? 2 + (r() < 0.4 ? 1 : 0) : 1 + (r() < 0.55 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        let px: number;
        let pz: number;
        if (back) {
          px = tx + (i + 0.5) / n + (r() - 0.5) * 0.2;
          pz = ty + 0.3 + r() * 0.45;
        } else {
          // Side columns: keep the canopy inside the column.
          px = tx + 0.5 + (tx === 0 ? -0.08 : 0.08) + (r() - 0.5) * 0.12;
          pz = ty + (i + 0.5) / n + (r() - 0.5) * 0.2;
        }
        const scale = back ? 1.05 + r() * 0.55 : 0.8 + r() * 0.35;
        if (r() < 0.45) pine(trees, px, pz, scale, pal, r);
        else broadleaf(trees, px, pz, scale * (back ? 1 : 0.85), pal, season, r);
      }
      if (r() < 0.5) floorBits(grass, trees, tx, ty, pal, r);
    }
  }
}

function pine(b: GeoBuilder, x: number, z: number, s: number, pal: SeasonPalette, r: () => number): void {
  const h = 1.5 * s;
  b.add(cyl(0.045 * s, 0.07 * s, 0.32 * s, 5), at(x, 0, z), C.trunkDark, { flat: true, sway: (w) => 0.02 * (w.y / h) });
  const tiers = 3;
  let y = 0.22 * s;
  const yaw = r() * 6;
  for (let i = 0; i < tiers; i++) {
    const rad = (0.44 - i * 0.11) * s;
    const th = (0.62 - i * 0.08) * s;
    const shade = 0.03 * i + (r() - 0.5) * 0.03;
    b.add(cone(rad, th, 7), at(x, y, z, yaw + i * 0.4), (_w, n) => tone(_k.copy(pal.pine), 0.02, shade + n.y * 0.04 - (n.y < 0 ? 0.06 : 0)), {
      flat: true,
      sway: (w) => 0.07 * Math.pow(Math.max(0, w.y) / h, 2),
    });
    y += th * 0.52;
  }
}

function broadleaf(b: GeoBuilder, x: number, z: number, s: number, pal: SeasonPalette, season: Season, r: () => number): void {
  const h = 1.6 * s;
  const trunkH = 0.62 * s;
  b.add(cyl(0.05 * s, 0.085 * s, trunkH, 6), at(x, 0, z, r() * 3), C.trunk, { flat: true, sway: (w) => 0.02 * (w.y / h) });
  if (pal.bare) {
    // Winter: bare branches.
    const n = 4 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const yaw = (i / n) * Math.PI * 2 + r() * 0.5;
      const len = (0.4 + r() * 0.25) * s;
      b.add(cyl(0.012 * s, 0.035 * s, len, 4), at(x, trunkH * (0.75 + r() * 0.2), z, yaw, 0, -0.55 - r() * 0.35), C.trunk, { flat: true, sway: (w) => 0.04 * (w.y / h) });
      const twig = len * 0.55;
      b.add(cyl(0.006 * s, 0.014 * s, twig, 3), at(x + Math.cos(yaw) * len * 0.45, trunkH + len * 0.5, z - Math.sin(yaw) * len * 0.45, yaw + 0.8, 0, -0.3), C.trunk, { flat: true, sway: 0.05 });
    }
    b.add(cyl(0.015 * s, 0.03 * s, 0.5 * s, 4), at(x, trunkH * 0.95, z, 0, 0, 0.12), C.trunk, { flat: true, sway: 0.04 });
    return;
  }
  const blossomTree = season === 0 && pal.blossom && r() < 0.35;
  const palette = blossomTree ? pal.blossom! : pal.foliage;
  const base = palette[Math.floor(r() * palette.length)];
  const blobs = 3 + Math.floor(r() * 2);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + r();
    const rad = (0.3 + r() * 0.12) * s * (i === 0 ? 1.15 : 1);
    const off = i === 0 ? 0 : 0.2 * s;
    const by = trunkH + (i === 0 ? 0.32 * s : 0.12 * s + r() * 0.2 * s);
    const shade = (r() - 0.5) * 0.06;
    b.add(ico(1, 1), at(x + Math.cos(a) * off, by, z + Math.sin(a) * off * 0.8, r() * 6, 0, 0, rad, rad * 0.9, rad), (_w, n) => tone(_k.copy(base), 0, shade + n.y * 0.08 - (n.y < -0.2 ? 0.08 : 0)), {
      flat: true,
      sway: (w) => 0.06 * Math.pow(Math.max(0, w.y) / h, 1.6),
    });
  }
  if (season === 0 && !blossomTree && pal.blossom && r() < 0.5) {
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      b.add(ico(0.045 * s, 0), at(x + Math.cos(a) * 0.3 * s, trunkH + 0.25 * s + r() * 0.35 * s, z + Math.sin(a) * 0.3 * s), pal.blossom[Math.floor(r() * pal.blossom.length)], { flat: true, sway: 0.05 });
    }
  }
  if (season === 2 && r() < 0.5) {
    // A few apples or rust berries in autumn.
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      b.add(ico(0.04 * s, 0), at(x + Math.cos(a) * 0.33 * s, trunkH + 0.15 * s + r() * 0.3 * s, z + Math.sin(a) * 0.33 * s), C.berry, { flat: true, sway: 0.05 });
    }
  }
}

function bush(b: GeoBuilder, x: number, z: number, s: number, pal: SeasonPalette, r: () => number): void {
  const n = 2 + Math.floor(r() * 2);
  const evergreen = pal.bare;
  const base = evergreen ? C.holly : pal.foliage.length ? pal.foliage[Math.floor(r() * pal.foliage.length)] : C.holly;
  for (let i = 0; i < n; i++) {
    const rad = (0.17 + r() * 0.09) * s;
    const ox = (r() - 0.5) * 0.3;
    const oz = (r() - 0.5) * 0.18;
    const shade = (r() - 0.5) * 0.06 - 0.04;
    b.add(ico(1, 1), at(x + ox, rad * 0.7, z + oz, r() * 6, 0, 0, rad, rad * 0.82, rad), (_w, nn) => tone(_k.copy(base), 0, shade + nn.y * 0.06), {
      flat: true,
      sway: (w) => 0.03 * Math.max(0, w.y) / (rad * 1.6),
    });
  }
  if (evergreen || r() < 0.3) {
    for (let i = 0; i < 4; i++) b.add(ico(0.025, 0), at(x + (r() - 0.5) * 0.4, 0.12 + r() * 0.2 * s, z + 0.12 + r() * 0.08), evergreen ? C.berry : pal.flowers[0] ?? C.berry, { flat: true });
  }
}

function floorBits(grass: GeoBuilder, b: GeoBuilder, tx: number, ty: number, pal: SeasonPalette, r: () => number): void {
  const x = tx + 0.2 + r() * 0.6;
  const z = ty + 0.2 + r() * 0.6;
  const pick = r();
  if (pick < 0.35) {
    // A fern of a few blades.
    for (let i = 0; i < 5; i++) {
      grass.add(blade(0.16, 0.05, 0.12), at(x, 0, z, (i / 5) * Math.PI * 2), (_w, _n, l) => mixInto(_k, pal.floor, pal.grassTip, l.y / 0.16), { sway: (_w, l) => 0.03 * (l.y / 0.16) });
    }
  } else if (pick < 0.55 && !pal.bare) {
    b.add(cyl(0.012, 0.015, 0.05, 5), at(x, 0, z), col('#efe6d4'));
    b.add(ball(0.03, 7, 4), at(x, 0.055, z, 0, 0, 0, 1, 0.55, 1), C.mushroom);
  } else if (pick < 0.75) {
    b.add(ico(1, 0), at(x, 0.02, z, r() * 6, 0, 0, 0.09, 0.06, 0.07), C.rock, { flat: true });
  } else {
    b.add(cyl(0.07, 0.08, 0.07, 7), at(x, 0, z), C.trunk, { flat: true });
    b.add(cyl(0.065, 0.065, 0.005, 7), at(x, 0.07, z), col('#c9a77a'), { flat: true });
  }
}

/** Grass tufts and flowers on plain grass tiles. */
function tufts(b: GeoBuilder, tiles: readonly TileKind[], W: number, H: number, pal: SeasonPalette): void {
  const r = rng(808);
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const kind = tiles[ty * W + tx];
      if (kind !== 'grass' && kind !== 'yard') continue;
      const n = kind === 'grass' ? 6 : hash2(tx, ty, 3) < 0.3 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const x = tx + 0.08 + r() * 0.84;
        const z = ty + 0.08 + r() * 0.84;
        tuft(b, x, z, 0.1 + r() * 0.07, 4, pal.grassDark, pal.grassTip, r);
      }
      if (kind === 'grass' && pal.flowers.length && hash2(tx, ty, 9) < 0.6) {
        const m = 1 + Math.floor(r() * 3);
        for (let i = 0; i < m; i++) {
          const x = tx + 0.1 + r() * 0.8;
          const z = ty + 0.1 + r() * 0.8;
          const h = 0.1 + r() * 0.06;
          b.add(cyl(0.004, 0.005, h, 3), at(x, 0, z), pal.grassDark, { sway: (_w, l) => 0.04 * (l.y / h) });
          b.add(ico(0.024, 0), at(x, h, z), pal.flowers[Math.floor(r() * pal.flowers.length)], { flat: true, sway: 0.04 });
        }
      }
    }
  }
}

export function tuft(b: GeoBuilder, x: number, z: number, h: number, blades: number, dark: Color, tip: Color, r: () => number, sway = 0.05): void {
  const yaw0 = r() * Math.PI * 2;
  for (let i = 0; i < blades; i++) {
    const bh = h * (0.7 + r() * 0.5);
    const yaw = yaw0 + (i / blades) * Math.PI * 2 + (r() - 0.5) * 0.6;
    b.add(blade(bh, 0.032, 0.05 + r() * 0.07), at(x + (r() - 0.5) * 0.05, 0, z + (r() - 0.5) * 0.05, yaw), (_w, _n, l) => mixInto(_k, dark, tip, Math.min(1, l.y / bh)), {
      sway: (_w, l) => sway * (l.y / bh),
    });
  }
}

/** The pond's water: deep in the middle, pale at the rim, rippling, with a sun glint. */
export function makeWaterMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: U.uTime,
      uDeep: { value: new Vector3(0.18, 0.42, 0.48) },
      uShallow: { value: new Vector3(0.45, 0.68, 0.66) },
      uSky: { value: new Vector3(0.8, 0.88, 0.92) },
      uLight: { value: 1 },
      uIce: { value: 0 },
      uMistColor: U.uMistColor,
      uMist: U.uMist,
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aEdge;
      varying float vEdge;
      varying vec3 vW;
      void main() {
        vEdge = aEdge;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform float uLight;
      uniform float uIce;
      varying float vEdge;
      varying vec3 vW;
      void main() {
        float t = uTime;
        float w1 = sin(vW.x * 7.0 + vW.z * 3.0 + t * 1.3);
        float w2 = sin(vW.x * -4.0 + vW.z * 8.5 - t * 1.7);
        float w3 = sin((vW.x + vW.z) * 13.0 + t * 2.1);
        float wave = (w1 + w2) * 0.5 * (1.0 - uIce * 0.8);
        float e = clamp(vEdge, 0.0, 1.0);
        vec3 c = mix(uShallow, uDeep, smoothstep(0.0, 0.7, e));
        c = mix(c, uSky, 0.18 + 0.1 * wave);
        float glint = max(0.0, w1 * w2 * w3);
        c += vec3(1.0, 0.97, 0.9) * glint * glint * 0.45 * (1.0 - uIce);
        float rim = 1.0 - smoothstep(0.0, 0.12, e);
        c = mix(c, vec3(0.92, 0.96, 0.95), rim * 0.5);
        c = mix(c, vec3(0.86, 0.92, 0.97), uIce * 0.7);
        gl_FragColor = vec4(c * uLight, mix(0.86, 0.95, e));
      }
    `,
  });
}
