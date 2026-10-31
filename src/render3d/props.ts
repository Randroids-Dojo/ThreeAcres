// The farm's buildings and fixtures from src/sim/map.ts: the house, the
// bunkhouse, the shipping crate and the notice board, with the lanterns, the
// road out to town and a little yard dressing. Static, merged, rebuilt with
// the season. Windows and lantern glass share one glowing material.

import { CanvasTexture, Color, Group, Mesh, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { PROPS, ROAD } from '../sim/map';
import type { Season } from '../sim/types';
import { GeoBuilder, ball, block, cone, cyl, ico } from './builder';
import type { Materials } from './materials';
import { patch } from './materials';
import { at, col, rng } from './util';

const C = {
  plinth: col('#a2998b'),
  plinthDark: col('#8a8276'),
  wall: col('#f0e4c9'),
  wallShade: col('#e2d3b2'),
  trim: col('#fbf6ea'),
  roof: col('#b4513a'),
  roofDark: col('#963f2d'),
  brick: col('#9d4b37'),
  door: col('#3f6b50'),
  shutter: col('#7f9c7a'),
  brass: col('#d6a945'),
  log: col('#8c5c3a'),
  log2: col('#7a4e31'),
  logEnd: col('#c49a6a'),
  roof2: col('#5d7766'),
  roof2Dark: col('#4b6455'),
  plank: col('#5c3d27'),
  crate: col('#cf9f62'),
  crateDark: col('#9b6a3b'),
  cork: col('#a77a4d'),
  paper: col('#f6efdc'),
  paper2: col('#efe0b8'),
  pin: col('#d0423a'),
  post: col('#7a5434'),
  metal: col('#3b3a3c'),
  hay: col('#e2c46a'),
  hayDark: col('#c9a94c'),
  stone: col('#b5ad9e'),
  water: col('#5a8fa0'),
  flowers: [col('#e5534b'), col('#f2b6c9'), col('#f7d250'), col('#ffffff')],
  leaf: col('#4f8a3c'),
  sack: col('#d8c49a'),
  sign: col('#e9d8b4'),
};

/** Where light comes from after dusk: windows and lanterns, with the size of their pool on the ground. */
export interface Lamp {
  x: number;
  y: number;
  z: number;
  /** Ground pool radius, 0 for none. */
  pool: number;
  /** Glow sprite size. */
  size: number;
}

export interface Props {
  group: Group;
  lamps: Lamp[];
  /** Top of the chimney, for morning smoke. */
  chimney: Vector3;
  /** Where harvested crops land. */
  crateMouth: Vector3;
  dispose(): void;
}

export function makeGlassMaterial(): MeshLambertMaterial {
  return patch(new MeshLambertMaterial({ color: col('#41566a'), emissive: new Color(0, 0, 0) }), { snow: 0 });
}

let signTex: CanvasTexture | null = null;
export function signTexture(): CanvasTexture {
  if (signTex) return signTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const board = (y: number, text: string) => {
    g.fillStyle = '#e8d6ae';
    g.fillRect(0, y, 256, 128);
    g.strokeStyle = 'rgba(120,80,40,.25)';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(0, y + 18 + i * 19 + Math.sin(i) * 3);
      g.bezierCurveTo(80, y + 14 + i * 19, 170, y + 24 + i * 19, 256, y + 16 + i * 19);
      g.stroke();
    }
    g.fillStyle = '#5b3418';
    g.font = 'italic 600 52px "Fraunces Variable", Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, y + 66);
    g.strokeStyle = '#7a4e2c';
    g.lineWidth = 6;
    g.strokeRect(3, y + 3, 250, 122);
  };
  board(0, 'For sale');
  board(128, 'To town');
  signTex = new CanvasTexture(c);
  signTex.colorSpace = SRGBColorSpace;
  signTex.anisotropy = 4;
  return signTex;
}

export function buildProps(season: Season, mats: Materials, glass: MeshLambertMaterial, signMat: MeshLambertMaterial): Props {
  const b = new GeoBuilder();
  const gl = new GeoBuilder();
  const lamps: Lamp[] = [];
  const r = rng(515);
  const chimney = new Vector3();
  const crateMouth = new Vector3();
  for (const p of PROPS) {
    const cx = p.x + p.w / 2;
    const cz = p.y + p.h / 2;
    if (p.kind === 'house') house(b, gl, lamps, cx, cz, p.w, p.h, p.doorX + 0.5, season, chimney);
    else if (p.kind === 'bunkhouse') bunkhouse(b, gl, lamps, cx, cz, p.w, p.h, p.doorX + 0.5, r);
    else if (p.kind === 'crate') crate(b, cx, cz, crateMouth);
    else board(b, cx, cz, p.w);
  }
  // Lantern posts along the yard edge of the main path, and one at the road.
  for (const x of [6.12, 11.88, 18.6]) lanternPost(b, gl, lamps, x, 3.86);
  road(b);
  yard(b, season, r);

  const group = new Group();
  const m = new Mesh(b.build(), mats.stat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = 'props';
  const g = new Mesh(gl.build(), glass);
  g.name = 'glass';
  // The road sign.
  const sign = new Mesh(new PlaneGeometry(0.62, 0.3), signMat);
  const uv = sign.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.5);
  sign.position.set(ROAD.x + 0.35, 0.78, ROAD.y - 0.2);
  sign.rotation.y = -0.25;
  sign.castShadow = true;
  group.add(m, g, sign);
  return {
    group,
    lamps,
    chimney,
    crateMouth,
    dispose() {
      m.geometry.dispose();
      g.geometry.dispose();
      sign.geometry.dispose();
    },
  };
}

function gable(b: GeoBuilder, x: number, z0: number, z1: number, y0: number, y1: number, k: Color, facing: 1 | -1): void {
  const zm = (z0 + z1) / 2;
  const a = new Vector3(x, y0, z0);
  const c = new Vector3(x, y0, z1);
  const t = new Vector3(x, y1, zm);
  if (facing > 0) b.tri(a, t, c, k);
  else b.tri(a, c, t, k);
}

function roofSlopes(b: GeoBuilder, cx: number, cz: number, len: number, halfD: number, eaveY: number, pitch: number, thick: number, k: Color, kDark: Color, rows: number): number {
  const rise = Math.tan(pitch) * halfD;
  const slope = halfD / Math.cos(pitch) + 0.16;
  for (const side of [1, -1]) {
    const mz = cz + side * (halfD / 2 + 0.06);
    const my = eaveY + rise / 2 - 0.02;
    b.add(block(len, thick, slope, 0.025), at(cx, my, mz, 0, side * pitch, 0), k);
    // Shingle rows: thin steps across the slope.
    for (let i = 0; i < rows; i++) {
      const f = (i + 0.5) / rows - 0.5;
      const sz = mz + side * f * slope * Math.cos(pitch) * -1;
      const sy = my - f * slope * Math.sin(pitch) * -1 + thick / 2;
      b.add(block(len + 0.02, 0.02, 0.05, 0.008), at(cx, sy + 0.005, sz, 0, side * pitch, 0), kDark);
    }
  }
  // Ridge cap.
  b.add(block(len + 0.04, 0.07, 0.1, 0.03), at(cx, eaveY + rise + 0.03, cz), kDark);
  return rise;
}

function windowAt(b: GeoBuilder, gl: GeoBuilder, lamps: Lamp[], x: number, y: number, z: number, w: number, h: number, face: 'z' | 'x', out: number, shutters: boolean, box: boolean, season: Season): void {
  const rot = face === 'z' ? 0 : Math.PI / 2;
  const ox = face === 'x' ? out * 0.012 : 0;
  const oz = face === 'z' ? out * 0.012 : 0;
  gl.add(block(w, h, 0.03, 0.005), at(x + ox * 0.5, y, z + oz * 0.5, rot), col('#ffffff'));
  // Frame and cross bars.
  const fx = (dx: number, dy: number, ww: number, hh: number) => {
    const px = face === 'z' ? x + dx : x + ox * 1.5;
    const pz = face === 'z' ? z + oz * 1.5 : z + dx;
    b.add(block(ww, hh, 0.04, 0.01), at(px, y + dy, pz, rot), C.trim);
  };
  fx(0, h / 2 + 0.025, w + 0.1, 0.05);
  fx(0, -h / 2 - 0.025, w + 0.14, 0.05);
  fx(-w / 2 - 0.025, 0, 0.05, h + 0.08);
  fx(w / 2 + 0.025, 0, 0.05, h + 0.08);
  fx(0, 0, 0.025, h);
  fx(0, 0, w, 0.025);
  if (shutters) {
    for (const s of [-1, 1]) {
      const d = s * (w / 2 + 0.12);
      const px = face === 'z' ? x + d : x + ox * 1.2;
      const pz = face === 'z' ? z + oz * 1.2 : z + d;
      b.add(block(0.15, h + 0.06, 0.03, 0.01), at(px, y, pz, rot), C.shutter);
    }
  }
  if (box && season !== 3) {
    const px = face === 'z' ? x : x + ox * 4;
    const pz = face === 'z' ? z + oz * 4 : z;
    b.add(block(w + 0.08, 0.08, 0.1, 0.015), at(px, y - h / 2 - 0.09, pz, rot), C.log);
    for (let i = 0; i < 5; i++) {
      const d = (i / 4 - 0.5) * w;
      const fx2 = face === 'z' ? px + d : px;
      const fz2 = face === 'z' ? pz : pz + d;
      b.add(ico(0.035, 0), at(fx2, y - h / 2 - 0.03, fz2), season === 2 ? C.flowers[2] : C.flowers[i % C.flowers.length], { flat: true });
      b.add(ico(0.03, 0), at(fx2 + 0.03, y - h / 2 - 0.045, fz2 + 0.01), C.leaf, { flat: true });
    }
  }
  lamps.push({ x: x + ox * 6, y, z: z + oz * 6, pool: face === 'z' ? 0.9 : 0.6, size: 0.75 });
}

function house(b: GeoBuilder, gl: GeoBuilder, lamps: Lamp[], cx: number, cz: number, w: number, h: number, doorX: number, season: Season, chimney: Vector3): void {
  const ww = w - 0.3;
  const dd = h - 0.36;
  const wallH = 1.02;
  const base = 0.12;
  b.add(block(ww + 0.12, base, dd + 0.12, 0.03), at(cx, base / 2, cz), C.plinth);
  b.add(block(ww, wallH, dd, 0.02), at(cx, base + wallH / 2, cz), (_w, n) => (Math.abs(n.x) > 0.5 ? C.wallShade : C.wall));
  // Board lines on the front.
  for (let i = 1; i < 11; i++) {
    const x = cx - ww / 2 + (i / 11) * ww;
    b.add(block(0.012, wallH - 0.04, 0.01, 0.004), at(x, base + wallH / 2, cz + dd / 2 + 0.004), C.wallShade);
  }
  // Corner posts.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(block(0.08, wallH, 0.08, 0.015), at(cx + sx * ww / 2, base + wallH / 2, cz + sz * dd / 2), C.trim);
  const eave = base + wallH;
  const halfD = dd / 2 + 0.12;
  const pitch = 0.62;
  gable(b, cx - ww / 2, cz - dd / 2, cz + dd / 2, eave, eave + Math.tan(pitch) * (dd / 2), C.wall, -1);
  gable(b, cx + ww / 2, cz - dd / 2, cz + dd / 2, eave, eave + Math.tan(pitch) * (dd / 2), C.wallShade, 1);
  roofSlopes(b, cx, cz, ww + 0.34, halfD, eave - 0.06, pitch, 0.07, C.roof, C.roofDark, 5);
  // Chimney on the east end.
  const chx = cx + ww / 2 - 0.42;
  const chz = cz - 0.3;
  b.add(block(0.3, 1.05, 0.3, 0.02), at(chx, eave + 0.5, chz), C.brick);
  b.add(block(0.36, 0.08, 0.36, 0.02), at(chx, eave + 1.05, chz), C.plinthDark);
  chimney.set(chx, eave + 1.12, chz);
  // Door with a little porch roof and a step.
  const front = cz + dd / 2;
  b.add(block(0.44, 0.78, 0.05, 0.015), at(doorX, base + 0.39, front + 0.01), C.door);
  b.add(block(0.54, 0.05, 0.06, 0.01), at(doorX, base + 0.8, front + 0.02), C.trim);
  b.add(block(0.05, 0.8, 0.06, 0.01), at(doorX - 0.25, base + 0.4, front + 0.02), C.trim);
  b.add(block(0.05, 0.8, 0.06, 0.01), at(doorX + 0.25, base + 0.4, front + 0.02), C.trim);
  b.add(ball(0.022, 6, 4), at(doorX + 0.14, base + 0.38, front + 0.05), C.brass);
  b.add(block(0.8, 0.05, 0.4, 0.015), at(doorX, base + 0.95, front + 0.18, 0, 0.25, 0), C.roofDark);
  b.add(block(0.62, 0.06, 0.24, 0.02), at(doorX, 0.03, front + 0.2), C.plinth);
  // Wall lantern by the door.
  wallLantern(b, gl, lamps, doorX - 0.4, base + 0.72, front + 0.05);
  // Windows either side of the door, and one on each end wall.
  windowAt(b, gl, lamps, cx - 0.82, base + 0.55, front + 0.005, 0.38, 0.34, 'z', 1, true, true, season);
  windowAt(b, gl, lamps, cx + 0.82, base + 0.55, front + 0.005, 0.38, 0.34, 'z', 1, true, true, season);
  windowAt(b, gl, lamps, cx + ww / 2 + 0.005, base + 0.58, cz, 0.3, 0.3, 'x', 1, false, false, season);
  windowAt(b, gl, lamps, cx - ww / 2 - 0.005, base + 0.58, cz, 0.3, 0.3, 'x', -1, false, false, season);
  // Attic window in the gable.
  gl.add(block(0.03, 0.16, 0.16, 0.005), at(cx + ww / 2 + 0.01, eave + 0.22, cz, 0, Math.PI / 4), col('#ffffff'));
  // A water butt at the west corner.
  b.add(cyl(0.13, 0.12, 0.3, 9), at(cx - ww / 2 - 0.02, 0, front - 0.02), C.log, { flat: true });
  b.add(cyl(0.12, 0.12, 0.01, 9), at(cx - ww / 2 - 0.02, 0.29, front - 0.02), C.water);
}

function wallLantern(b: GeoBuilder, gl: GeoBuilder, lamps: Lamp[], x: number, y: number, z: number): void {
  b.add(block(0.03, 0.03, 0.1, 0.008), at(x, y + 0.08, z + 0.04), C.metal);
  b.add(block(0.1, 0.03, 0.1, 0.01), at(x, y + 0.07, z + 0.09), C.metal);
  gl.add(block(0.07, 0.1, 0.07, 0.01), at(x, y, z + 0.09), col('#ffffff'));
  b.add(block(0.09, 0.02, 0.09, 0.008), at(x, y - 0.06, z + 0.09), C.metal);
  lamps.push({ x, y, z: z + 0.14, pool: 1.3, size: 0.6 });
}

function lanternPost(b: GeoBuilder, gl: GeoBuilder, lamps: Lamp[], x: number, z: number): void {
  b.add(block(0.07, 0.95, 0.07, 0.015), at(x, 0.475, z), C.post);
  b.add(block(0.22, 0.04, 0.04, 0.01), at(x + 0.08, 0.93, z), C.post);
  b.add(cyl(0.002, 0.002, 0.08, 3), at(x + 0.16, 0.82, z), C.metal);
  b.add(cone(0.065, 0.05, 6), at(x + 0.16, 0.8, z), C.metal, { flat: true });
  gl.add(cyl(0.045, 0.045, 0.09, 6), at(x + 0.16, 0.71, z), col('#ffffff'));
  b.add(cyl(0.05, 0.05, 0.015, 6), at(x + 0.16, 0.7, z), C.metal);
  b.add(block(0.14, 0.04, 0.14, 0.01), at(x, 0.02, z), C.stone);
  lamps.push({ x: x + 0.16, y: 0.75, z, pool: 1.6, size: 0.7 });
}

function bunkhouse(b: GeoBuilder, gl: GeoBuilder, lamps: Lamp[], cx: number, cz: number, w: number, h: number, doorX: number, r: () => number): void {
  const ww = w - 0.3;
  const dd = h - 0.4;
  const base = 0.1;
  const logs = 7;
  const lr = 0.07;
  b.add(block(ww + 0.1, base, dd + 0.1, 0.03), at(cx, base / 2, cz), C.plinthDark);
  // Solid core so gaps between logs never show light.
  b.add(block(ww - 0.06, logs * lr * 2 - 0.02, dd - 0.06, 0.01), at(cx, base + logs * lr, cz), C.log2);
  for (let i = 0; i < logs; i++) {
    const y = base + lr + i * lr * 2;
    const k = i % 2 ? C.log : C.log2;
    for (const s of [-1, 1]) {
      b.add(cyl(lr, lr, ww + 0.16, 7), at(cx - (ww + 0.16) / 2, y, cz + s * dd / 2, 0, 0, -Math.PI / 2), k, { flat: true });
      b.add(cyl(lr * 0.95, lr * 0.95, dd + 0.16, 7), at(cx + s * ww / 2, y + lr * 0.5, cz - (dd + 0.16) / 2, 0, Math.PI / 2, 0), k, { flat: true });
    }
  }
  // Log ends at the corners.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < logs; i += 2) b.add(cyl(lr * 0.8, lr * 0.8, 0.01, 7), at(cx + sx * (ww / 2 + 0.08), base + lr + i * lr * 2, cz + sz * dd / 2, 0, 0, -Math.PI / 2), C.logEnd);
  const eave = base + logs * lr * 2;
  const pitch = 0.5;
  const halfD = dd / 2 + 0.14;
  gable(b, cx - ww / 2, cz - dd / 2, cz + dd / 2, eave, eave + Math.tan(pitch) * (dd / 2), C.log2, -1);
  gable(b, cx + ww / 2, cz - dd / 2, cz + dd / 2, eave, eave + Math.tan(pitch) * (dd / 2), C.log2, 1);
  roofSlopes(b, cx, cz, ww + 0.4, halfD, eave - 0.05, pitch, 0.07, C.roof2, C.roof2Dark, 4);
  // Stovepipe.
  b.add(cyl(0.05, 0.05, 0.55, 7), at(cx - ww / 2 + 0.5, eave + 0.2, cz - 0.15), C.metal, { flat: true });
  b.add(cone(0.09, 0.07, 7), at(cx - ww / 2 + 0.5, eave + 0.75, cz - 0.15), C.metal, { flat: true });
  const front = cz + dd / 2 + lr;
  b.add(block(0.42, 0.76, 0.05, 0.01), at(doorX, base + 0.38, front), C.plank);
  for (let i = -1; i <= 1; i++) b.add(block(0.012, 0.74, 0.01, 0.004), at(doorX + i * 0.12, base + 0.38, front + 0.03), C.log2);
  b.add(ball(0.02, 6, 4), at(doorX + 0.14, base + 0.38, front + 0.04), C.brass);
  // Porch: boards, two posts, a roof and a bench.
  b.add(block(1.5, 0.05, 0.3, 0.01), at(doorX, 0.06, front + 0.13), C.log);
  for (const s of [-1, 1]) b.add(block(0.06, 0.9, 0.06, 0.01), at(doorX + s * 0.7, 0.45, front + 0.24), C.log2);
  b.add(block(1.62, 0.05, 0.42, 0.015), at(doorX, 0.93, front + 0.16, 0, 0.2, 0), C.roof2Dark);
  b.add(block(0.5, 0.04, 0.14, 0.01), at(doorX + 0.5, 0.2, front + 0.1), C.log);
  for (const s of [-1, 1]) b.add(block(0.04, 0.18, 0.12, 0.005), at(doorX + 0.5 + s * 0.2, 0.09, front + 0.1), C.log2);
  windowAt(b, gl, lamps, doorX - 0.75, base + 0.52, front + 0.01, 0.34, 0.3, 'z', 1, false, false, 0);
  windowAt(b, gl, lamps, doorX + 0.95, base + 0.52, front + 0.01, 0.34, 0.3, 'z', 1, false, false, 0);
  wallLantern(b, gl, lamps, doorX - 0.36, base + 0.72, front + 0.01);
  // Wood pile on the west end.
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3);
    const col2 = i % 3;
    b.add(cyl(0.055, 0.055, 0.42, 6), at(cx - ww / 2 - 0.16, 0.06 + row * 0.1, cz - 0.2 + col2 * 0.12 + row * 0.05, 0, Math.PI / 2, 0), r() < 0.5 ? C.log : C.log2, { flat: true });
  }
}

function crate(b: GeoBuilder, cx: number, cz: number, mouth: Vector3): void {
  const w = 0.78;
  const d = 0.62;
  const h = 0.48;
  b.add(block(w - 0.04, 0.04, d - 0.04, 0.01), at(cx, 0.04, cz), C.crateDark);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(block(0.06, h, 0.06, 0.012), at(cx + sx * (w / 2 - 0.03), h / 2, cz + sz * (d / 2 - 0.03)), C.crateDark);
  for (let i = 0; i < 3; i++) {
    const y = 0.09 + i * 0.15;
    for (const s of [-1, 1]) {
      b.add(block(w - 0.06, 0.1, 0.025, 0.01), at(cx, y, cz + s * (d / 2 - 0.02)), C.crate);
      b.add(block(0.025, 0.1, d - 0.06, 0.01), at(cx + s * (w / 2 - 0.02), y, cz), C.crate);
    }
  }
  // A painted stripe and a little hand-cart handle.
  b.add(block(0.3, 0.05, 0.01, 0.005), at(cx, 0.24, cz + d / 2 + 0.002), col('#c84b3a'));
  // Burlap sack leaning on it.
  b.add(ico(1, 1), at(cx + 0.5, 0.14, cz + 0.18, 0.4, 0, 0.2, 0.13, 0.16, 0.12), C.sack, { flat: true });
  b.add(cyl(0.035, 0.05, 0.06, 6), at(cx + 0.52, 0.28, cz + 0.18), C.sack, { flat: true });
  mouth.set(cx, h - 0.05, cz);
}

function board(b: GeoBuilder, cx: number, cz: number, w: number): void {
  const bw = w - 0.5;
  const z = cz + 0.1;
  for (const s of [-1, 1]) b.add(block(0.08, 1.25, 0.08, 0.015), at(cx + s * (bw / 2 + 0.02), 0.625, z), C.post);
  b.add(block(bw + 0.1, 0.72, 0.07, 0.015), at(cx, 0.82, z), C.crateDark);
  b.add(block(bw - 0.02, 0.62, 0.075, 0.01), at(cx, 0.82, z + 0.004), C.cork);
  const r = rng(99);
  for (let i = 0; i < 6; i++) {
    const px = cx - bw / 2 + 0.18 + (i % 3) * ((bw - 0.36) / 2) + (r() - 0.5) * 0.06;
    const py = 0.98 - Math.floor(i / 3) * 0.3 + (r() - 0.5) * 0.04;
    b.add(block(0.2, 0.22, 0.008, 0.002), at(px, py, z + 0.045, 0, 0, (r() - 0.5) * 0.2), i % 2 ? C.paper : C.paper2);
    b.add(ball(0.014, 5, 3), at(px, py + 0.09, z + 0.052), C.pin);
  }
  // Little roof.
  b.add(block(bw + 0.35, 0.04, 0.24, 0.01), at(cx, 1.25, z - 0.06, 0, -0.35, 0), C.roof2);
  b.add(block(bw + 0.35, 0.04, 0.24, 0.01), at(cx, 1.25, z + 0.14, 0, 0.35, 0), C.roof2Dark);
}

function road(b: GeoBuilder): void {
  // Gate posts where the yard path leaves the farm, and a signpost.
  const x = ROAD.x + 0.85;
  for (const z of [ROAD.y + 0.02, ROAD.y + 0.98]) {
    b.add(block(0.1, 0.62, 0.1, 0.02), at(x, 0.31, z), C.post);
    b.add(cone(0.075, 0.06, 4), at(x, 0.62, z, Math.PI / 4), C.post, { flat: true });
  }
  b.add(block(0.05, 0.82, 0.05, 0.01), at(ROAD.x + 0.35, 0.41, ROAD.y - 0.25), C.post);
  b.add(block(0.66, 0.34, 0.03, 0.01), at(ROAD.x + 0.35, 0.78, ROAD.y - 0.215, -0.25), C.post);
  // Wheel ruts on the road tile.
  for (const z of [ROAD.y + 0.3, ROAD.y + 0.7]) b.add(block(1, 0.004, 0.08, 0.002), at(ROAD.x + 0.5, 0.002, z), col('#9c8e74'));
}

function yard(b: GeoBuilder, season: Season, r: () => number): void {
  // Hay bales on the grass behind the board.
  const hay = (x: number, z: number, y: number, yaw: number) => {
    b.add(block(0.42, 0.26, 0.28, 0.06, 2), at(x, y + 0.13, z, yaw), (_w, n) => (n.y > 0.5 ? C.hay : C.hayDark));
    b.add(block(0.43, 0.27, 0.02, 0.01), at(x, y + 0.13, z, yaw), C.hayDark);
  };
  hay(11.5, 1.45, 0, 0.1);
  hay(12.2, 1.5, 0, -0.15);
  hay(11.85, 1.5, 0.26, 0.05);
  // A stone well in the far corner.
  const wx = 17.75;
  const wz = 1.7;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.add(block(0.14, 0.24, 0.1, 0.02), at(wx + Math.cos(a) * 0.26, 0.12, wz + Math.sin(a) * 0.26, -a), (_w, n) => (n.y > 0.5 ? C.stone : col('#a39a8a')));
  }
  b.add(cyl(0.22, 0.22, 0.01, 10), at(wx, 0.16, wz), col('#2e4a55'));
  for (const s of [-1, 1]) b.add(block(0.05, 0.7, 0.05, 0.01), at(wx + s * 0.3, 0.35, wz), C.post);
  b.add(cyl(0.03, 0.03, 0.64, 6), at(wx - 0.32, 0.6, wz, 0, 0, -Math.PI / 2), C.post);
  b.add(block(0.78, 0.04, 0.26, 0.01), at(wx, 0.78, wz - 0.1, 0, -0.5, 0), C.roof);
  b.add(block(0.78, 0.04, 0.26, 0.01), at(wx, 0.78, wz + 0.1, 0, 0.5, 0), C.roofDark);
  b.add(cyl(0.06, 0.05, 0.08, 7), at(wx + 0.05, 0.4, wz), C.log, { flat: true });
  // A bench and a few flower pots by the house, and a scatter of logs.
  if (season !== 3) {
    for (let i = 0; i < 3; i++) {
      b.add(cyl(0.05, 0.04, 0.08, 7), at(3.62 + i * 0.12, 0, 2.92), col('#b8643f'), { flat: true });
      b.add(ico(0.05, 0), at(3.62 + i * 0.12, 0.11, 2.92), i === 1 ? C.flowers[1] : C.leaf, { flat: true });
    }
  }
  void r;
}
