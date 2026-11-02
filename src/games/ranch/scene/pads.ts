// What stands on the six pads: a stone ring when empty, a round corral (with
// its high fence, feeder hopper, trough, hedge and down box), a raised garden
// bed with its crop growing, or a little silo. One mesh per pad, rebuilt when
// it changes, popping up with a bounce when something new is built.

import { BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, PlaneGeometry, Quaternion, SphereGeometry, Vector3, type BufferGeometry, type CanvasTexture } from 'three';
import { PEN_MAX, type Food } from '../defs';
import { hash2 } from '../noise';
import { BED_H, BED_HALF, SILO_H, SILO_R } from '../physics';
import { padSpots } from '../sim';
import type { Pad } from '../state';
import { PADS, PEN_R, heightAt } from '../world';
import { at, jitter, merge, part } from './geo';
import { matte } from './mat';
import { canvas, paintTag, signAtlas, tex } from './paint';

const WOOD = 0x9a6c48;
const WOOD_D = 0x6f4a32;
const WOOD_L = 0xc49a6c;

type G = BufferGeometry;
const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): G {
  return part(at(new BoxGeometry(w, h, d), x, y, z, rx, ry, rz), color, { vary: 0.08 });
}

function beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: number): G {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const g = new BoxGeometry(t, len, t);
  _v.set(bx - ax, by - ay, bz - az).normalize();
  _q.setFromUnitVectors(_up, _v);
  _m.compose(_s.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, new Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  return part(g, color, { vary: 0.1 });
}

/** Builds one pad's structure in pad-local space (origin at the pad centre on the ground). */
function padGeometry(i: number, p: Pad): G[] {
  const at0 = PADS[i];
  const y0 = heightAt(at0.x, at0.z);
  const local = (x: number, z: number) => heightAt(at0.x + x, at0.z + z) - y0;
  const S: G[] = [];
  const sp = padSpots(i);
  if (p.kind === 'empty') {
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const x = Math.cos(a) * PEN_R;
      const z = Math.sin(a) * PEN_R;
      const g = jitter(new IcosahedronGeometry(0.2 + hash2(k, i) * 0.1, 0), 0.08, k);
      S.push(part(at(g, x, local(x, z) + 0.02, z, 0, 0, 0, 1, 0.6, 1), k % 3 ? 0xc0b8b0 : 0xd6ccbe, { flat: true }));
    }
    // Stakes with twine where a build would go.
    for (const a of [0.8, 2.4, 3.9, 5.5]) {
      const x = Math.cos(a) * (PEN_R - 0.6);
      const z = Math.sin(a) * (PEN_R - 0.6);
      S.push(box(0.06, 0.5, 0.06, WOOD_L, x, local(x, z) + 0.2, z));
    }
  } else if (p.kind === 'pen') {
    const high = p.ups.includes('high');
    const n = 18;
    const ph = high ? 2.15 : 1.15;
    const rails = high ? [0.4, 0.9, 1.4, 1.9] : [0.45, 0.92];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const a2 = ((k + 1) / n) * Math.PI * 2;
      const x = Math.cos(a) * PEN_R;
      const z = Math.sin(a) * PEN_R;
      const x2 = Math.cos(a2) * PEN_R;
      const z2 = Math.sin(a2) * PEN_R;
      const h = local(x, z);
      const h2 = local(x2, z2);
      S.push(box(0.15, ph, 0.15, WOOD_D, x, h + ph / 2 - 0.1, z, -a));
      for (const r of rails) S.push(beam(x, h + r, z, x2, h2 + r, z2, 0.09, k % 2 ? WOOD : 0xa77852));
    }
    if (p.ups.includes('hedge')) {
      for (let k = 0; k < 30; k++) {
        const a = (k / 30) * Math.PI * 2 + 0.05;
        const r = PEN_R + 0.55;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const g = jitter(new IcosahedronGeometry(0.62, 1), 0.2, k + i * 40);
        S.push(part(at(g, x, local(x, z) + 0.55, z, 0, 0, 0, 1, 1.05, 1), k % 2 ? 0x5e8a58 : 0x6e9a5e, { flat: true, vary: 0.12 }));
      }
    }
    if (p.ups.includes('feeder')) {
      const hx = sp.hopper.x - at0.x;
      const hz = sp.hopper.z - at0.z;
      const h = local(hx, hz);
      S.push(box(0.12, 1.2, 0.12, WOOD_D, hx, h + 0.6, hz));
      const fun = new ConeGeometry(0.5, 0.6, 4, 1, true);
      at(fun, hx, h + 1.25, hz, Math.PI, Math.PI / 4, 0);
      S.push(part(fun, 0xc9a24a, { flat: true }));
      S.push(box(0.72, 0.08, 0.72, 0xa98234, hx, h + 1.56, hz, Math.PI / 4));
      S.push(box(0.5, 0.06, 0.12, WOOD, hx + (at0.x - sp.hopper.x) * 0.1, h + 0.9, hz + (at0.z - sp.hopper.z) * 0.1));
    }
    if (p.ups.includes('trough')) {
      const tx = sp.trough.x - at0.x;
      const tz = sp.trough.z - at0.z;
      const h = local(tx, tz);
      S.push(box(1.6, 0.35, 0.6, WOOD, tx, h + 0.17, tz));
      S.push(box(1.45, 0.05, 0.45, 0x6f9ec0, tx, h + 0.3, tz));
    }
    if (p.ups.includes('chute')) {
      const cx = sp.chute.x - at0.x;
      const cz = sp.chute.z - at0.z;
      const h = local(cx, cz);
      S.push(box(0.9, 0.65, 0.7, WOOD_L, cx, h + 0.32, cz));
      S.push(box(0.98, 0.08, 0.78, WOOD_D, cx, h + 0.68, cz, 0, 0.08 * sp.ls));
      S.push(box(0.92, 0.12, 0.72, 0xe9a46e, cx, h + 0.45, cz));
      S.push(beam(cx, h + 0.7, cz - sp.ls * 0.2, cx * 0.4, h + 0.15, cz - sp.ls * 1.4, 0.2, 0xc9a24a));
    }
  } else if (p.kind === 'garden') {
    const soil = p.ups.includes('soil') ? 0x5a4030 : 0x7a5a40;
    S.push(box(BED_HALF * 2 - 0.1, BED_H, BED_HALF * 2 - 0.1, soil, 0, BED_H / 2 - 0.02, 0));
    for (const [x, z, w, d] of [
      [0, -BED_HALF, BED_HALF * 2 + 0.2, 0.2],
      [0, BED_HALF, BED_HALF * 2 + 0.2, 0.2],
      [-BED_HALF, 0, 0.2, BED_HALF * 2],
      [BED_HALF, 0, 0.2, BED_HALF * 2],
    ]) S.push(box(w, BED_H + 0.12, d, WOOD, x, (BED_H + 0.12) / 2 - 0.04, z));
    // Furrows.
    for (let k = -2; k <= 2; k++) S.push(box(BED_HALF * 2 - 0.4, 0.05, 0.16, p.ups.includes('soil') ? 0x4a3426 : 0x6a4c36, 0, BED_H, k * 0.95));
    if (p.ups.includes('soil')) for (let k = 0; k < 14; k++) S.push(box(0.4, 0.02, 0.04, 0xe8cc84, (hash2(k, i, 3) - 0.5) * 4, BED_H + 0.02, (hash2(k, i, 4) - 0.5) * 4, hash2(k, i, 5) * 3));
    if (p.ups.includes('sprinkler')) {
      S.push(box(0.08, 1.1, 0.08, 0x8a9aa8, 0, BED_H + 0.55, 0));
      S.push(part(at(new CylinderGeometry(0.16, 0.08, 0.1, 8), 0, BED_H + 1.12, 0), 0xc9a24a, { flat: true }));
      S.push(box(0.7, 0.04, 0.04, 0x8a9aa8, 0, BED_H + 1.15, 0));
    }
    // A feed run: a sloping plank trough from the bed towards each neighbour on the row.
    if (p.ups.includes('run')) {
      for (const side of [-1, 1]) {
        const j = i + side;
        if (j < 0 || j >= PADS.length || Math.floor(j / 3) !== Math.floor(i / 3)) continue;
        const x0 = side * (BED_HALF + 0.15);
        const x1 = side * (Math.abs(PADS[j].x - at0.x) - PEN_R + 0.3);
        const top = BED_H + 1.35;
        S.push(beam(x0, top, 0.9, x1, local(x1, 0.9) + 1.2, 0.9, 0.22, WOOD_L));
        S.push(box(0.12, top, 0.12, WOOD_D, x0, top / 2, 0.9));
        S.push(box(0.1, 1.2, 0.1, WOOD_D, x1, local(x1, 0.9) + 0.6, 0.9));
      }
    }
  } else if (p.kind === 'silo') {
    const body = new CylinderGeometry(SILO_R, SILO_R, SILO_H, 14, 6);
    at(body, 0, SILO_H / 2, 0);
    S.push(part(body, 0xd8d2c6, { flat: true, vary: 0.06, top: 0xe8e2d4, topAt: SILO_H - 0.6 }));
    for (const h of [0.9, 2.0, 3.1]) S.push(part(at(new CylinderGeometry(SILO_R + 0.04, SILO_R + 0.04, 0.12, 14), 0, h, 0), 0x9a8a7a, { flat: true }));
    S.push(part(at(new ConeGeometry(SILO_R + 0.25, 1.3, 14), 0, SILO_H + 0.65, 0), 0xe9a46e, { flat: true }));
    S.push(part(at(new SphereGeometry(0.18, 8, 6), 0, SILO_H + 1.35, 0), 0xc9a24a, { flat: true }));
    const ox = sp.outlet.x - at0.x;
    const oz = sp.outlet.z - at0.z;
    S.push(box(0.5, 0.4, 0.6, 0xc9a24a, ox, sp.outlet.y, oz - sp.ls * 0.1));
    S.push(box(0.36, 0.26, 0.05, 0x2a2420, ox, sp.outlet.y, oz + sp.ls * 0.2));
    // Ladder up the side.
    for (const s of [-1, 1]) S.push(box(0.06, SILO_H, 0.06, WOOD_D, SILO_R + 0.08, SILO_H / 2, s * 0.22));
    for (let k = 0; k < 9; k++) S.push(box(0.05, 0.05, 0.44, WOOD, SILO_R + 0.08, 0.3 + k * 0.45, 0));
  }
  return S;
}

const CROPS: Food[] = ['cloverhead', 'sweetroot', 'dewberry'];

function cropGeometry(f: Food): G {
  const parts: G[] = [];
  if (f === 'cloverhead') {
    for (let l = 0; l < 7; l++) {
      const a = (l / 7) * Math.PI * 2;
      const g = new SphereGeometry(0.09, 5, 3);
      at(g, Math.cos(a) * 0.12, 0.12 + (l % 2) * 0.05, Math.sin(a) * 0.12, 0, 0, 0, 1, 0.3, 1);
      parts.push(part(g, l % 2 ? 0x5f9a4a : 0x78ad58, { flat: true }));
    }
    parts.push(part(at(new IcosahedronGeometry(0.07, 0), 0, 0.3, 0), 0xe9a0c4, { flat: true }));
    parts.push(part(at(new BoxGeometry(0.02, 0.2, 0.02), 0, 0.2, 0), 0x6e9a52));
  } else if (f === 'sweetroot') {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const g = new ConeGeometry(0.05, 0.45, 4);
      at(g, Math.cos(a) * 0.08, 0.22, Math.sin(a) * 0.08, Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      parts.push(part(g, k % 2 ? 0x8aa04a : 0xa0a84e, { flat: true }));
    }
    parts.push(part(at(new CylinderGeometry(0.07, 0.05, 0.08, 6), 0, 0.03, 0), 0xe08a4a, { flat: true }));
  } else {
    parts.push(part(at(jitter(new IcosahedronGeometry(0.28, 1), 0.08, 3), 0, 0.26, 0, 0, 0, 0, 1, 0.8, 1), 0x4f7458, { flat: true }));
    for (let k = 0; k < 5; k++) parts.push(part(at(new IcosahedronGeometry(0.05, 0), Math.cos(k * 1.3) * 0.22, 0.3 + (k % 2) * 0.1, Math.sin(k * 1.3) * 0.22), 0x5a62c8, { flat: true }));
  }
  return merge(parts);
}

export class PadView {
  readonly group = new Group();
  private meshes: (Mesh | null)[] = PADS.map(() => null);
  private keys: string[] = PADS.map(() => '');
  private pop: number[] = PADS.map(() => 0);
  private crops: Record<Food, InstancedMesh>;
  private plates: Mesh;
  private plateMat: MeshLambertMaterial;
  private mat = matte();
  /** A pen post's count tag ("8 of 10"), once the pen limit has been taught: the limit, in the world. */
  private counts: { mesh: Mesh; ctx: CanvasRenderingContext2D; tex: CanvasTexture; key: string; mat: MeshLambertMaterial }[] = [];

  constructor() {
    this.crops = {} as Record<Food, InstancedMesh>;
    for (const f of CROPS) {
      const m = new InstancedMesh(cropGeometry(f), matte({ flat: true }), PADS.length * 16);
      m.count = 0;
      m.frustumCulled = false;
      m.visible = false;
      m.name = `crop-${f}`;
      this.crops[f] = m;
      this.group.add(m);
    }
    // Plates on the posts saying what each pad is; rebuilt with the pads.
    // (Round 9: lit from within at night like the other painted signs: the pen's "Pen" plate was unlit and dark.)
    this.plateMat = new MeshLambertMaterial({ map: signAtlas().tex, emissiveMap: signAtlas().tex, emissive: new Color(0xffffff), emissiveIntensity: 0.06 });
    this.plates = new Mesh(new PlaneGeometry(1, 1), this.plateMat);
    this.plates.name = 'plates';
    this.group.add(this.plates);
    PADS.forEach((_, i) => {
      const [c, g] = canvas(320, 160);
      const t = tex(c);
      const mat = new MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.5, emissiveMap: t, emissive: new Color(0xffffff), emissiveIntensity: 0 });
      const mesh = new Mesh(new PlaneGeometry(0.5, 0.25), mat);
      const sp = padSpots(i);
      mesh.position.set(sp.post.x, heightAt(sp.post.x, sp.post.z) + 1.02, sp.post.z + sp.ls * 0.11);
      mesh.rotation.y = sp.ls > 0 ? 0 : Math.PI;
      mesh.visible = false;
      mesh.name = `count-${i}`;
      this.group.add(mesh);
      this.counts.push({ mesh, ctx: g, tex: t, key: '', mat });
    });
  }

  /** Each pen post's count tag: how many are in the pen, of ten (on: the pen limit has been taught; night lights it to read in the dark). */
  setCounts(pads: Pad[], counts: number[], on: boolean, night: number): void {
    this.plateMat.emissiveIntensity = 0.06 + night * 0.42;
    this.counts.forEach((c, i) => {
      const show = on && pads[i]?.kind === 'pen';
      c.mesh.visible = show;
      if (!show) return;
      const n = counts[i] ?? 0;
      const key = `${n}`;
      c.mat.emissiveIntensity = 0.12 + night * 0.55;
      if (key === c.key) return;
      c.key = key;
      paintTag(c.ctx, 320, 160, `${n} of ${PEN_MAX}`, null, n > PEN_MAX ? 'Too many. They hop out.' : 'More get frazzled', n <= PEN_MAX, false, 30 + i);
      c.tex.needsUpdate = true;
    });
  }

  /** For checks: what a pen post's count tag says ('' if it is not up). */
  countTag(i: number): string {
    const c = this.counts[i];
    return c && c.mesh.visible ? c.key : '';
  }

  /** Rebuild any pad whose build or upgrades changed. justBuilt pops it up. */
  sync(pads: Pad[], justBuilt = -1): void {
    let platesDirty = false;
    pads.forEach((p, i) => {
      const key = `${p.kind}:${[...p.ups].sort().join(',')}`;
      if (key === this.keys[i]) return;
      this.keys[i] = key;
      platesDirty = true;
      const old = this.meshes[i];
      if (old) {
        this.group.remove(old);
        old.geometry.dispose();
      }
      const S = padGeometry(i, p);
      const at0 = PADS[i];
      const m = new Mesh(merge(S), this.mat);
      m.position.set(at0.x, heightAt(at0.x, at0.z), at0.z);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = `pad-${i}`;
      this.meshes[i] = m;
      this.group.add(m);
      if (i === justBuilt) this.pop[i] = 0.001;
    });
    if (platesDirty) this.buildPlates(pads);
  }

  private buildPlates(pads: Pad[]): void {
    const uv = signAtlas().uv;
    const parts: G[] = [];
    pads.forEach((p, i) => {
      const sp = padSpots(i);
      const y = heightAt(sp.post.x, sp.post.z);
      const g = new PlaneGeometry(0.62, 0.16);
      const r = uv[`plate-${p.kind}`];
      const a = g.getAttribute('uv') as BufferAttribute;
      for (let k = 0; k < a.count; k++) a.setXY(k, r[0] + a.getX(k) * r[2], r[1] + a.getY(k) * r[3]);
      // Face the lane.
      at(g, sp.post.x, y + 1.35, sp.post.z + sp.ls * 0.11, 0, sp.ls > 0 ? 0 : Math.PI, 0);
      parts.push(g);
    });
    const old = this.plates.geometry;
    this.plates.geometry = merge(parts);
    old.dispose();
  }

  update(dt: number, pads: Pad[]): void {
    // Pop-up bounce for new builds.
    this.meshes.forEach((m, i) => {
      if (!m || this.pop[i] <= 0) return;
      this.pop[i] += dt;
      const t = this.pop[i] / 0.55;
      if (t >= 1) {
        this.pop[i] = 0;
        m.scale.set(1, 1, 1);
        return;
      }
      const s = 1 + Math.sin(t * Math.PI * 2.5) * (1 - t) * 0.18;
      m.scale.set(1 / Math.sqrt(s), Math.min(1, t * 3) * s, 1 / Math.sqrt(s));
    });
    // Crops: a grid of plants growing towards the next pick.
    const counts: Record<Food, number> = { cloverhead: 0, sweetroot: 0, dewberry: 0 };
    pads.forEach((p, i) => {
      if (p.kind !== 'garden' || !p.crop) return;
      const at0 = PADS[i];
      const y = heightAt(at0.x, at0.z) + BED_H;
      const m = this.crops[p.crop];
      const s = 0.35 + p.grow * 0.75;
      for (let gx = 0; gx < 4; gx++) {
        for (let gz = 0; gz < 4; gz++) {
          const x = at0.x - 1.8 + gx * 1.2 + (hash2(gx, gz, i) - 0.5) * 0.3;
          const z = at0.z - 1.8 + gz * 1.2 + (hash2(gz, gx, i) - 0.5) * 0.3;
          _q.setFromAxisAngle(_up, hash2(gx + 7, gz, i) * 6.28);
          _m.compose(_v.set(x, y, z), _q, _s.set(s, s, s));
          m.setMatrixAt(counts[p.crop]++, _m);
        }
      }
    });
    for (const f of CROPS) {
      const m = this.crops[f];
      m.count = counts[f];
      m.visible = counts[f] > 0;
      m.instanceMatrix.needsUpdate = true;
    }
  }
}
