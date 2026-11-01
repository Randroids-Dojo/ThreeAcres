// The crops in the ground, instanced per crop and stage, with the per-tile
// animations events trigger (a bounce when they grow, a droop when they
// wither, a shake on deny), bugs crawling on them (big enough to see on a
// phone, and the plant turns a sickly yellow), a soft gold ring on the soil
// under every ripe crop so a ready plot reads at a glance, quality pips, and
// the produce that arcs into the crate at harvest.

import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
  type Material,
} from 'three';
import { CROP_IDS } from '../sim/crops';
import type { CropId, WorldState } from '../sim/types';
import { ico } from './builder';
import { buildCropModels, pipModels, type CropModels } from './cropModels';
import { SOIL_Y } from './fields';
import type { Materials } from './materials';
import { patch } from './materials';
import { backOut, clamp, hash2 } from './util';

/** Per-tile animation start times, in renderer seconds. */
export interface TileTimers {
  bounce: Float32Array;
  droop: Float32Array;
  shake: Float32Array;
  wet: Float32Array;
  build: Float32Array;
  spray: Float32Array;
}

export function makeTimers(n: number): TileTimers {
  const f = () => new Float32Array(n).fill(-1e6);
  return { bounce: f(), droop: f(), shake: f(), wet: f(), build: f(), spray: f() };
}

interface Flyer {
  active: boolean;
  kind: CropId;
  t0: number;
  dur: number;
  from: Vector3;
  to: Vector3;
  spin: number;
}

export interface Crops {
  group: Group;
  models: CropModels;
  update(s: Readonly<WorldState>, now: number, timers: TileTimers, showQuality: boolean): void;
  /** Top of the crop on a plot (0 if none). */
  heightAt(s: Readonly<WorldState>, i: number): number;
  flyer(kind: CropId, x: number, y: number, to: Vector3, now: number): boolean;
  /** Called when a flyer lands, with its position. */
  onLand: ((x: number, y: number, z: number) => void) | null;
  dispose(): void;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _ax = new Vector3();
const _q2 = new Quaternion();
const _c = new Color();

export function buildCrops(s: Readonly<WorldState>, mats: Materials): Crops {
  const group = new Group();
  group.name = 'crops';
  const models = buildCropModels(CROP_IDS);
  let fieldCount = 0;
  for (const k of s.tiles) if (k === 'field') fieldCount++;
  const cap = Math.max(1, fieldCount);

  const make = (geo: BufferGeometry, mat: Material, n: number, shadow = true) => {
    const m = new InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.castShadow = shadow;
    m.receiveShadow = true;
    m.count = 0;
    m.frustumCulled = false;
    group.add(m);
    return m;
  };
  const meshes: Record<CropId, InstancedMesh[]> = {} as Record<CropId, InstancedMesh[]>;
  const deadMesh: Record<CropId, InstancedMesh> = {} as Record<CropId, InstancedMesh>;
  const produce: Record<CropId, InstancedMesh> = {} as Record<CropId, InstancedMesh>;
  for (const id of CROP_IDS) {
    // Seeds and sprouts are too small for a visible shadow, so they skip the shadow pass.
    meshes[id] = models.stages[id].map((g, st) => make(g, st === 4 ? mats.cropRipe : mats.cropGrow, cap, st >= 2));
    deadMesh[id] = make(models.dead[id], mats.cropDead, cap);
    produce[id] = make(models.produce[id], mats.figure, 12);
  }
  // Instance colour buffers so every crop varies a little.
  for (const id of CROP_IDS) {
    for (const m of [...meshes[id], deadMesh[id]]) {
      m.setColorAt(0, _c.setRGB(1, 1, 1));
      m.instanceColor!.setUsage(DynamicDrawUsage);
    }
  }

  const bugMat = patch(new MeshLambertMaterial({ color: '#2a1d16', emissive: '#1c0c06' }), { snow: 0 });
  const bugs = make(ico(1, 0), bugMat, cap * 12, false);
  // Ripe: a soft gold ring on the soil around the plant.
  const ringGeo = new RingGeometry(0.33, 0.45, 28, 1).rotateX(-Math.PI / 2);
  const ringMat = new MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.6, depthWrite: false });
  const rings = make(ringGeo, ringMat, cap, false);
  rings.name = 'ripe-rings';
  rings.receiveShadow = false;
  rings.renderOrder = 2;
  const pipMat = patch(new MeshLambertMaterial({ vertexColors: true, emissive: '#3a3020' }), { snow: 0 });
  const pipGeos = pipModels();
  const pips = [null, make(pipGeos[1], pipMat, cap, false), make(pipGeos[2], pipMat, cap, false), make(pipGeos[3], pipMat, cap, false)];

  const flyers: Flyer[] = [];
  for (let i = 0; i < 16; i++) flyers.push({ active: false, kind: 'radish', t0: 0, dur: 1, from: new Vector3(), to: new Vector3(), spin: 0 });
  const counts: Record<CropId, number[]> = {} as Record<CropId, number[]>;
  for (const id of CROP_IDS) counts[id] = [0, 0, 0, 0, 0, 0];

  const self: Crops = {
    group,
    models,
    onLand: null,
    heightAt(st, i) {
      const c = st.plots[i]?.crop;
      if (!c) return 0;
      return c.dead ? models.height[c.kind][3] * 0.5 : models.height[c.kind][c.stage];
    },
    flyer(kind, x, y, to, now) {
      const f = flyers.find((ff) => !ff.active);
      if (!f) return false;
      f.active = true;
      f.kind = kind;
      f.t0 = now;
      f.from.set(x + 0.5, SOIL_Y + 0.15, y + 0.5);
      f.to.copy(to);
      f.dur = 0.75 + Math.min(0.6, f.from.distanceTo(to) * 0.05);
      f.spin = (hash2(x, y, Math.floor(now * 10)) - 0.5) * 8;
      return true;
    },
    update(st, now, timers, showQuality) {
      for (const id of CROP_IDS) {
        const c = counts[id];
        for (let k = 0; k < 6; k++) c[k] = 0;
      }
      let bugN = 0;
      let ringN = 0;
      const pipN = [0, 0, 0, 0];
      const W = st.W;
      for (let i = 0; i < st.plots.length; i++) {
        const crop = st.plots[i].crop;
        if (!crop || st.tiles[i] !== 'field') continue;
        const x = i % W;
        const y = (i / W) | 0;
        const kind = crop.kind;
        const slot = crop.dead ? 5 : crop.stage;
        const mesh = crop.dead ? deadMesh[kind] : meshes[kind][crop.stage];
        const n = counts[kind][slot]++;
        if (n >= cap) continue;
        // Base pose: a fixed small turn and size per tile so rows are not stamped copies.
        const h = hash2(x, y, 7);
        const yaw = (h - 0.5) * (kind === 'sunflower' ? 0.3 : 1.0);
        let sy = 0.94 + hash2(x, y, 8) * 0.12;
        let sxz = sy;
        let ox = 0;
        let lean = 0;
        // Grow and plant: squash and stretch.
        const tb = now - timers.bounce[i];
        if (tb >= 0 && tb < 0.7) {
          const e = Math.exp(-5 * tb) * Math.sin(tb * 18);
          sy *= 1 + 0.28 * e;
          sxz *= 1 - 0.14 * e;
          if (tb < 0.12) {
            const g = backOut(tb / 0.12);
            sy *= 0.4 + 0.6 * g;
          }
        }
        // Wither: starts upright and slumps.
        const td = now - timers.droop[i];
        if (crop.dead && td >= 0 && td < 0.9) {
          const e = clamp(td / 0.9, 0, 1);
          sy *= 1 + (1 - e * e) * 0.9;
          lean = -(1 - e) * 0.2;
        }
        // Deny: a quick side to side shake.
        const ts = now - timers.shake[i];
        if (ts >= 0 && ts < 0.45) ox = Math.sin(ts * 50) * 0.05 * (1 - ts / 0.45);
        // Dead crops shrink with the stage they died at.
        if (crop.dead) {
          const f = 0.5 + 0.5 * Math.min(1, crop.stage / 3);
          sy *= f;
          sxz *= f;
        }
        _q.setFromAxisAngle(_up, yaw);
        if (lean !== 0) _q.multiply(_q2.setFromAxisAngle(_ax.set(0, 0, 1), lean));
        _p.set(x + 0.5 + ox, SOIL_Y, y + 0.5);
        _s.set(sxz, sy, sxz);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(n, _m);
        const tone = 0.93 + hash2(x, y, 9) * 0.12;
        // A bugged plant yellows, so the trouble shows from across the field.
        // (Instance colours multiply the leaf colour, so red is pushed up to turn green leaves a sickly olive.)
        if (crop.bugs > 0 && !crop.dead) mesh.setColorAt(n, _c.setRGB(tone * 1.9, tone * 0.95, tone * 0.35));
        else mesh.setColorAt(n, _c.setRGB(tone, tone, tone * 0.98));

        // Ripe: the gold ring, breathing a little.
        if (crop.stage === 4 && !crop.dead) {
          const k = 1 + Math.sin(now * 2.4 + h * 6) * 0.04;
          _q.identity();
          _p.set(x + 0.5, SOIL_Y + 0.012, y + 0.5);
          _s.set(k, 1, k);
          _m.compose(_p, _q, _s);
          rings.setMatrixAt(ringN++, _m);
        }

        // Bugs: crawlers on the plant and gnats circling above it, more as the count rises.
        if (crop.bugs > 0 && !crop.dead) {
          const top = Math.max(0.16, models.height[kind][crop.stage]);
          const nb = Math.min(3, crop.bugs);
          for (let b = 0; b < nb * 2; b++) {
            const ph = now * (0.7 + b * 0.13) + b * 2.1 + h * 6;
            const rr = 0.12 + (b % 3) * 0.06;
            _p.set(x + 0.5 + Math.cos(ph) * rr, SOIL_Y + 0.05 + ((b * 0.37) % 1) * top * 0.7, y + 0.5 + Math.sin(ph) * rr * 0.8);
            _q.identity();
            _s.set(0.058, 0.044, 0.05);
            _m.compose(_p, _q, _s);
            bugs.setMatrixAt(bugN++, _m);
            const gp = now * (3.2 + b * 0.5) + b * 1.7;
            _p.set(x + 0.5 + Math.cos(gp) * 0.2, SOIL_Y + top + 0.14 + Math.sin(gp * 1.7) * 0.07, y + 0.5 + Math.sin(gp) * 0.16);
            _s.set(0.03, 0.03, 0.03);
            _m.compose(_p, _q, _s);
            bugs.setMatrixAt(bugN++, _m);
          }
        }
        // Quality pips: a prize rosette on a stake at the tile's front corner, leaning back to face the camera.
        if (showQuality && crop.quality > 0 && !crop.dead) {
          const pm = pips[crop.quality]!;
          _q.setFromAxisAngle(_up, Math.sin(now * 1.3 + h * 6) * 0.25);
          _q.multiply(_q2.setFromAxisAngle(_ax.set(1, 0, 0), -0.55));
          _p.set(x + 0.8, SOIL_Y + 0.24, y + 0.82);
          _s.set(1, 1, 1);
          _m.compose(_p, _q, _s);
          pm.setMatrixAt(pipN[crop.quality]++, _m);
        }
      }
      for (const id of CROP_IDS) {
        meshes[id].forEach((m, st2) => commit(m, Math.min(cap, counts[id][st2])));
        commit(deadMesh[id], Math.min(cap, counts[id][5]));
      }
      commit(bugs, bugN, false);
      commit(rings, ringN, false);
      for (let q = 1; q <= 3; q++) commit(pips[q]!, pipN[q], false);

      // Flyers: an arc from the plot into the crate, spinning.
      const fc: Record<string, number> = flyCount;
      for (const id of CROP_IDS) fc[id] = 0;
      for (const f of flyers) {
        if (!f.active) continue;
        const t = (now - f.t0) / f.dur;
        if (t >= 1) {
          f.active = false;
          self.onLand?.(f.to.x, f.to.y, f.to.z);
          continue;
        }
        if (t < 0) continue;
        const e = t;
        _p.lerpVectors(f.from, f.to, e);
        _p.y += Math.sin(Math.PI * e) * (1.2 + f.from.distanceTo(f.to) * 0.08) + (t < 0.15 ? 0 : 0);
        _q.setFromAxisAngle(_ax.set(0.3, 1, 0.2).normalize(), f.spin * t);
        const pop = t < 0.15 ? backOut(t / 0.15) : 1 - Math.max(0, t - 0.85) * 2;
        _s.setScalar(1.1 * pop);
        _m.compose(_p, _q, _s);
        const pm = produce[f.kind];
        pm.setMatrixAt(fc[f.kind]++, _m);
      }
      for (const id of CROP_IDS) commit(produce[id], fc[id], false);
    },
    dispose() {
      for (const id of CROP_IDS) {
        for (const g of models.stages[id]) g.dispose();
        models.dead[id].dispose();
        models.produce[id].dispose();
      }
      for (const g of pipGeos) g.dispose();
      bugMat.dispose();
      pipMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
  return self;
}

const flyCount: Record<string, number> = {};

function commit(m: InstancedMesh, n: number, colors = true): void {
  m.count = n;
  m.visible = n > 0;
  if (n > 0) {
    m.instanceMatrix.clearUpdateRanges();
    m.instanceMatrix.addUpdateRange(0, n * 16);
    m.instanceMatrix.needsUpdate = true;
    if (colors && m.instanceColor) {
      m.instanceColor.clearUpdateRanges();
      m.instanceColor.addUpdateRange(0, n * 3);
      m.instanceColor.needsUpdate = true;
    }
  }
}
