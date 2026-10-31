// The six fields: furrowed soil per tilled plot (instanced, darker and glossy
// when wet), tufted meadow on owned untilled ground, long grass behind a
// split-rail fence with a sign on unowned parcels, and the soil overlay.

import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { Parcel, Rules, WorldState } from '../sim/types';
import { GeoBuilder, block, cyl, ico } from './builder';
import type { Materials } from './materials';
import { SEASONS, type SeasonPalette } from './palette';
import { tuft } from './terrain';
import { at, col, hash2, mixInto, noise2, rng, tone } from './util';

/** Height of the soil ridges, where crops stand. */
export const SOIL_Y = 0.055;

const SOIL_DRY = col('#c39a64');
const SOIL_WET = col('#4f3826');
const SOIL_LEVELS = [col('#c39a64'), col('#9c744a'), col('#735335'), col('#4f3826')];
const RAIL = col('#9d7c57');
const RAIL_DARK = col('#7b5e40');

function soilGeometry(): BufferGeometry {
  const nx = 4;
  const nz = 15;
  const lo = 0.035;
  const hi = 0.965;
  const pos: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = lo + ((hi - lo) * i) / nx;
      const z = lo + ((hi - lo) * j) / nz;
      const ridge = 0.5 + 0.5 * Math.cos(6 * Math.PI * z - Math.PI);
      const edge = Math.min(x - lo, hi - x, z - lo, hi - z);
      const e = Math.min(1, edge / 0.07);
      const ee = e * e * (3 - 2 * e);
      const clod = (hash2(i, j, 3) - 0.5) * 0.006;
      const y = 0.004 + ee * (0.032 + ridge * 0.026 + clod);
      pos.push(x, y, z);
      const shade = 0.8 + ridge * 0.24 + (hash2(i * 3, j, 5) - 0.5) * 0.06;
      colr.push(shade, shade, shade);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Instanced soil overlay: a small plaque at the front of each tilled plot, drawn as shapes in the shader. */
function overlayMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec2 aMN;
      varying vec2 vUv;
      varying vec2 vMN;
      void main() {
        vUv = uv;
        vMN = aMN;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFade;
      varying vec2 vUv;
      varying vec2 vMN;
      float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      float sdDrop(vec2 p, float r) {
        // A teardrop: a circle with a point on top.
        float c = length(p) - r;
        vec2 q = vec2(abs(p.x), p.y - r * 0.2);
        float tri = max(q.x * 0.94 + q.y * 0.5 - r * 0.86, -q.y);
        return min(c, max(tri, -(p.y + r * 0.2)));
      }
      void main() {
        // Plaque is 2.6 wide by 1 tall in p units.
        vec2 p = (vUv - 0.5) * vec2(2.6, 1.0);
        float plate = sdBox(p, vec2(1.25, 0.45), 0.2);
        float aa = 0.025;
        float a = 1.0 - smoothstep(-aa, aa, plate);
        vec3 c = vec3(0.98, 0.95, 0.86);
        float border = smoothstep(-0.07, -0.03, plate) * a;
        c = mix(c, vec3(0.33, 0.24, 0.16), border);
        // Three drops on the left: filled blue up to the moisture level.
        for (int i = 0; i < 3; i++) {
          vec2 q = p - vec2(-0.95 + float(i) * 0.34, -0.02);
          float d = sdDrop(vec2(q.x, -q.y), 0.13);
          float fill = step(float(i) + 0.5, vMN.x);
          vec3 dc = mix(vec3(0.78, 0.8, 0.82), vec3(0.15, 0.5, 0.92), fill);
          float inside = 1.0 - smoothstep(-aa, aa, d);
          float ring = (1.0 - smoothstep(-aa, aa, abs(d) - 0.025));
          c = mix(c, dc, inside);
          c = mix(c, vec3(0.1, 0.25, 0.5), ring * 0.8);
        }
        // Three bars on the right: green up to the nutrient level.
        for (int i = 0; i < 3; i++) {
          vec2 q = p - vec2(0.3 + float(i) * 0.33, 0.0);
          float d = sdBox(q, vec2(0.12, 0.2 + float(i) * 0.04), 0.05);
          float fill = step(float(i) + 0.5, vMN.y);
          vec3 bc = mix(vec3(0.78, 0.7, 0.58), vec3(0.3, 0.7, 0.22), fill);
          float inside = 1.0 - smoothstep(-aa, aa, d);
          float ring = (1.0 - smoothstep(-aa, aa, abs(d) - 0.025));
          c = mix(c, bc, inside);
          c = mix(c, vec3(0.2, 0.3, 0.1), ring * 0.8);
        }
        gl_FragColor = vec4(c, a * 0.95 * uFade);
      }
    `,
  });
}

export interface Fields {
  group: Group;
  soil: InstancedMesh;
  overlay: InstancedMesh;
  /** Updates soil, decor and overlay from the state. Cheap when nothing changed. */
  update(s: Readonly<WorldState>, rules: Readonly<Rules>, overlay: boolean, wetFlash: Float32Array, now: number): void;
  setSeason(season: number): void;
  /** Plot index of each soil instance, for effects. */
  dispose(): void;
}

export function buildFields(s: Readonly<WorldState>, mats: Materials, signMat: MeshLambertMaterial): Fields {
  const group = new Group();
  const fieldIdx: number[] = [];
  for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i] === 'field') fieldIdx.push(i);
  const cap = Math.max(1, fieldIdx.length);

  const soilGeo = soilGeometry();
  const wet = new InstancedBufferAttribute(new Float32Array(cap), 1);
  wet.setUsage(DynamicDrawUsage);
  soilGeo.setAttribute('aWet', wet);
  const soil = new InstancedMesh(soilGeo, mats.soil, cap);
  soil.instanceMatrix.setUsage(DynamicDrawUsage);
  soil.receiveShadow = true;
  soil.count = 0;
  soil.name = 'soil';
  soil.frustumCulled = false;
  group.add(soil);

  // Overlay plaques.
  const plaque = new PlaneGeometry(0.72, 0.28);
  const mn = new InstancedBufferAttribute(new Float32Array(cap * 2), 2);
  mn.setUsage(DynamicDrawUsage);
  plaque.setAttribute('aMN', mn);
  const overlay = new InstancedMesh(plaque, overlayMaterial(), cap);
  overlay.renderOrder = 20;
  overlay.count = 0;
  overlay.frustumCulled = false;
  overlay.visible = false;
  overlay.name = 'overlay';
  group.add(overlay);

  // Per-parcel decoration, rebuilt only when that parcel changes.
  const decor: (Mesh | null)[] = s.parcels.map(() => null);
  const decorKey: string[] = s.parcels.map(() => '');
  const signs: Mesh[] = s.parcels.map((p) => {
    const g = new PlaneGeometry(0.5, 0.25);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + uv.getY(i) * 0.5);
    const m = new Mesh(g, signMat);
    m.position.set(p.x + p.w / 2, 0.42, p.y + p.h + 0.06);
    m.rotation.x = -0.12;
    m.castShadow = true;
    m.visible = false;
    group.add(m);
    return m;
  });
  let season = 0;

  const m4 = new Matrix4();
  const k = new Color();
  const last = new Int32Array(s.tiles.length).fill(-1);
  const lastMN = new Int32Array(s.tiles.length).fill(-1);
  let lastOverlay = false;

  return {
    group,
    soil,
    overlay,
    setSeason(sn) {
      if (sn === season) return;
      season = sn;
      decorKey.fill('');
    },
    update(st, rules, showOverlay, wetFlash, now) {
      // Decor per parcel.
      for (const p of st.parcels) {
        let key = p.owned ? 'o' : 'u';
        for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) key += st.plots[y * st.W + x].tilled ? '1' : '0';
        key += season;
        if (key !== decorKey[p.id]) {
          decorKey[p.id] = key;
          const old = decor[p.id];
          if (old) {
            group.remove(old);
            old.geometry.dispose();
          }
          const g = parcelDecor(st, p, SEASONS[season]);
          const mesh = g ? new Mesh(g, mats.grass) : null;
          if (mesh) {
            mesh.receiveShadow = true;
            mesh.castShadow = !p.owned;
            mesh.name = `decor${p.id}`;
            group.add(mesh);
          }
          decor[p.id] = mesh;
          signs[p.id].visible = !p.owned;
        }
      }
      // Soil instances.
      let n = 0;
      let changed = false;
      const classic = rules.growth === 'classic';
      for (const i of fieldIdx) {
        const pl = st.plots[i];
        const pid = st.parcelOf[i];
        if (!pl.tilled || pid < 0 || !st.parcels[pid].owned) continue;
        const x = i % st.W;
        const y = (i / st.W) | 0;
        let w = classic ? (pl.wet ? 1 : 0) : Math.max(0, Math.min(3, pl.moisture)) / 3;
        const flash = now - wetFlash[i];
        if (flash >= 0 && flash < 1.2) w = Math.max(w, 1 - flash / 1.2);
        const code = (x << 16) | (y << 8) | Math.round(w * 60);
        if (last[n] !== code) {
          last[n] = code;
          changed = true;
          m4.makeTranslation(x, 0, y);
          soil.setMatrixAt(n, m4);
          if (classic) mixInto(k, SOIL_DRY, SOIL_WET, w);
          else {
            const lv = w * 3;
            const a = Math.min(2, Math.floor(lv));
            mixInto(k, SOIL_LEVELS[a], SOIL_LEVELS[a + 1], lv - a);
          }
          tone(k, 0, (hash2(x, y, 41) - 0.5) * 0.025);
          soil.setColorAt(n, k);
          wet.setX(n, w);
        }
        n++;
      }
      if (n !== soil.count) changed = true;
      soil.count = n;
      if (changed) {
        soil.instanceMatrix.needsUpdate = true;
        if (soil.instanceColor) soil.instanceColor.needsUpdate = true;
        wet.needsUpdate = true;
      }
      // Overlay plaques.
      overlay.visible = showOverlay;
      if (showOverlay) {
        let m = 0;
        let ch = !lastOverlay;
        for (const i of fieldIdx) {
          const pl = st.plots[i];
          const pid = st.parcelOf[i];
          if (!pl.tilled || pid < 0 || !st.parcels[pid].owned) continue;
          const x = i % st.W;
          const y = (i / st.W) | 0;
          const mo = Math.max(0, Math.min(3, Math.round(pl.moisture)));
          const nu = Math.max(0, Math.min(3, Math.round(pl.nutrient)));
          const code = (x << 16) | (y << 8) | (mo << 4) | nu;
          if (lastMN[m] !== code) {
            lastMN[m] = code;
            ch = true;
            // Lean the plaque back towards the camera at the front of the tile.
            m4.makeRotationX(-1.05);
            m4.setPosition(x + 0.5, 0.1, y + 0.8);
            overlay.setMatrixAt(m, m4);
            mn.setXY(m, mo, nu);
          }
          m++;
        }
        if (m !== overlay.count) ch = true;
        overlay.count = m;
        if (ch) {
          overlay.instanceMatrix.needsUpdate = true;
          mn.needsUpdate = true;
        }
      }
      lastOverlay = showOverlay;
    },
    dispose() {
      soilGeo.dispose();
      plaque.dispose();
      (overlay.material as ShaderMaterial).dispose();
      for (const d of decor) d?.geometry.dispose();
      for (const sg of signs) sg.geometry.dispose();
    },
  };
}

const _k = new Color();
const MEADOW_BASE = col('#8faa55');
const CLOVER = [col('#fbf7ef'), col('#f0b8cf'), col('#f6dd5a')];
const THISTLE = col('#a77cc9');
const LONG_BASE = col('#6f8c3c');

/** Meadow, or long grass with a fence and sign, for one parcel. Null when it is all tilled soil. */
function parcelDecor(s: Readonly<WorldState>, p: Parcel, pal: SeasonPalette): BufferGeometry | null {
  const b = new GeoBuilder();
  const r = rng(1000 + p.id * 17);
  const v = new Vector3();
  const quad = (x: number, z: number, base: Color, tint: Color) => {
    const S = 2;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x0 = x + i / S;
        const z0 = z + j / S;
        const x1 = x0 + 1 / S;
        const z1 = z0 + 1 / S;
        mixInto(_k, base, tint, noise2((x0 + x1) * 0.9, (z0 + z1) * 0.9, 61) * 0.7);
        b.tri(v.set(x0, 0.004, z0).clone(), new Vector3(x0, 0.004, z1), new Vector3(x1, 0.004, z1), _k);
        b.tri(new Vector3(x0, 0.004, z0), new Vector3(x1, 0.004, z1), new Vector3(x1, 0.004, z0), _k);
      }
    }
  };
  let any = false;
  for (let y = p.y; y < p.y + p.h; y++) {
    for (let x = p.x; x < p.x + p.w; x++) {
      const pl = s.plots[y * s.W + x];
      if (p.owned && pl.tilled) continue;
      any = true;
      if (!p.owned) {
        quad(x, y, LONG_BASE, pal.longGrass);
        for (let i = 0; i < 8; i++) tuft(b, x + 0.08 + r() * 0.84, y + 0.08 + r() * 0.84, 0.27 + r() * 0.14, 6, pal.longGrass, pal.longTip, r, 0.1);
        if (!pal.bare && r() < 0.25) {
          const tx = x + 0.2 + r() * 0.6;
          const tz = y + 0.2 + r() * 0.6;
          b.add(cyl(0.005, 0.006, 0.36, 3), at(tx, 0, tz), pal.grassDark, { sway: (_w, l) => 0.08 * (l.y / 0.36) });
          b.add(ico(0.03, 0), at(tx, 0.37, tz), THISTLE, { flat: true, sway: 0.08 });
        }
      } else {
        quad(x, y, MEADOW_BASE, pal.meadow);
        for (let i = 0; i < 6; i++) tuft(b, x + 0.08 + r() * 0.84, y + 0.08 + r() * 0.84, 0.12 + r() * 0.08, 4, pal.grassDark, pal.meadowTip, r, 0.05);
        if (!pal.bare) {
          for (let i = 0; i < 3; i++) {
            if (r() < 0.45) b.add(ico(0.022, 0), at(x + 0.1 + r() * 0.8, 0.05 + r() * 0.04, y + 0.1 + r() * 0.8), CLOVER[Math.floor(r() * 3)], { flat: true, sway: 0.03 });
          }
        }
        if (r() < 0.15) b.add(ico(1, 0), at(x + r(), 0.01, y + r(), r() * 6, 0, 0, 0.06, 0.035, 0.05), col('#a59d8c'), { flat: true });
      }
    }
  }
  if (!p.owned) {
    // Split-rail fence around the parcel, with a gap-free run and a sign post on the south side.
    const posts: [number, number][] = [];
    for (let i = 0; i <= p.w; i++) posts.push([p.x + i, p.y], [p.x + i, p.y + p.h]);
    for (let j = 1; j < p.h; j++) posts.push([p.x, p.y + j], [p.x + p.w, p.y + j]);
    for (const [x, z] of posts) {
      b.add(block(0.065, 0.44, 0.065, 0.012), at(x, 0.22, z, hash2(x, z) * 0.6), RAIL_DARK);
    }
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(-(z1 - z0), x1 - x0);
      for (const h of [0.17, 0.33]) {
        const sag = (hash2(Math.round(x0 * 3), Math.round(z0 * 3), h * 10) - 0.5) * 0.04;
        b.add(block(len + 0.04, 0.04, 0.035, 0.012), at((x0 + x1) / 2, h + sag, (z0 + z1) / 2, yaw, 0, sag), RAIL);
      }
    };
    for (let i = 0; i < p.w; i++) {
      rail(p.x + i, p.y, p.x + i + 1, p.y);
      rail(p.x + i, p.y + p.h, p.x + i + 1, p.y + p.h);
    }
    for (let j = 0; j < p.h; j++) {
      rail(p.x, p.y + j, p.x, p.y + j + 1);
      rail(p.x + p.w, p.y + j, p.x + p.w, p.y + j + 1);
    }
    // Sign post, in front of the south rail.
    b.add(block(0.05, 0.42, 0.05, 0.01), at(p.x + p.w / 2, 0.21, p.y + p.h + 0.03), RAIL_DARK);
    b.add(block(0.54, 0.29, 0.03, 0.01), at(p.x + p.w / 2, 0.42, p.y + p.h + 0.04, 0, -0.12, 0), RAIL_DARK);
    any = true;
  }
  return any ? b.build(true) : null;
}
