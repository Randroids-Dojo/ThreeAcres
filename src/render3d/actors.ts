// Chunky toy figures and crows. The farmer wears a straw hat and blue
// overalls; hands wear bandanas and a shirt in one of six tints. Each figure
// is a few hinged parts: a walk cycle with a bob, a hop arc for turns mode,
// and a tool animation per verb. Crows fly in, peck and flee.

import {
  Bone,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix3,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { CROW_FLY_SECONDS } from '../sim/constants';
import type { Actor, Crow, Verb, WorldState } from '../sim/types';
import { GeoBuilder, ball, block, cone, cyl, ico } from './builder';
import type { Materials } from './materials';
import { at, clamp, col, smooth, tone } from './util';

/** Hand shirt and bandana colours by tint 0..5, the same as the 2D view's so a hand reads the same in both. */
export const HAND_TINTS = ['#c8553d', '#3f7f6e', '#d9a441', '#7a5aa6', '#4f7fbf', '#b85c8a'];
const BANDANAS = ['#e8d5a8', '#c84a3a', '#2f4f7a', '#e8d5a8', '#9a3a3a', '#3a6a4a'];
const SKINS = ['#f2c39b', '#c98f62', '#8f5b3c', '#e3ae80', '#b07850', '#f0cfae'];

const P = {
  overalls: col('#3f66ae'),
  overallsDark: col('#30528f'),
  shirt: col('#efe3c4'),
  boot: col('#5a3b26'),
  hat: col('#e9c873'),
  hatDark: col('#cfa954'),
  band: col('#b83b2e'),
  eye: col('#2a1f1a'),
  cheek: col('#f09a86'),
  trousers: col('#7c6a4c'),
  wood: col('#9b7046'),
  metal: col('#8fa0a8'),
  metalDark: col('#5f6e76'),
  can: col('#5f9a86'),
  pouch: col('#cdb07a'),
  hammer: col('#5a5d63'),
  crow: col('#23252f'),
  crowSheen: col('#323748'),
  beak: col('#d7b35a'),
};

export interface Emitter {
  water(x: number, y: number, z: number, dx: number, dz: number): void;
  seeds(x: number, y: number, z: number, dx: number, dz: number): void;
  dust(x: number, y: number, z: number): void;
}

interface Figure {
  mesh: SkinnedMesh;
  body: Bone;
  armL: Bone;
  armR: Bone;
  legL: Bone;
  legR: Bone;
  tools: Record<ToolName, Bone>;
  key: string;
  lastStrike: number;
}

type ToolName = 'hoe' | 'can' | 'pouch' | 'hammer';
const TOOL_NAMES: ToolName[] = ['hoe', 'can', 'pouch', 'hammer'];

/** Joins part geometries into one skinned geometry, each part riding one bone. */
function skinMerge(parts: { geo: BufferGeometry; bone: number; at: Matrix4 }[]): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const colr: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const v = new Vector3();
  const n = new Vector3();
  const nm = new Matrix3();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const pa = g.attributes.position;
    const na = g.attributes.normal;
    const ca = g.attributes.color;
    nm.getNormalMatrix(p.at);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(p.at);
      n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z);
      nor.push(n.x, n.y, n.z);
      colr.push(ca ? ca.getX(i) : 1, ca ? ca.getY(i) : 1, ca ? ca.getZ(i) : 1);
      si.push(p.bone, 0, 0, 0);
      sw.push(1, 0, 0, 0);
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new Float32BufferAttribute(colr, 3));
  out.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
  out.computeBoundingSphere();
  out.boundingSphere!.radius += 0.6;
  return out;
}

// Bone layout of a figure, in its own space (facing +X, feet at y = 0).
const HIP = 0.235;
const SHOULDER = 0.235;
const ARM_Z = 0.175;
const LEG_Z = 0.068;
const HAND = -0.18;

const _v = new Vector3();

function figureGeos(role: 'farmer' | 'hand', tint: number, skinIdx: number): { torso: BufferGeometry; arm: BufferGeometry; leg: BufferGeometry } {
  const skin = col(SKINS[skinIdx % SKINS.length]);
  const shirt = role === 'farmer' ? P.shirt : col(HAND_TINTS[tint % 6]);
  const pants = role === 'farmer' ? P.overalls : P.trousers;
  const t = new GeoBuilder();
  // Torso, built around the hips at y = 0.
  t.add(block(0.2, 0.27, 0.28, 0.06, 3), at(0, 0.135, 0), (_w, _n, l) => (role === 'farmer' && l.y < 0.0 ? P.overalls : shirt));
  if (role === 'farmer') {
    t.add(block(0.205, 0.1, 0.285, 0.04, 2), at(0, 0.05, 0), P.overalls);
    t.add(block(0.04, 0.12, 0.18, 0.015), at(0.095, 0.15, 0), P.overalls);
    for (const s of [-1, 1]) t.add(block(0.03, 0.16, 0.035, 0.01), at(0.09, 0.19, s * 0.08, 0, 0, 0.15), P.overallsDark);
    for (const s of [-1, 1]) t.add(ball(0.012, 5, 3), at(0.115, 0.2, s * 0.07), col('#e6c25a'));
  } else {
    t.add(block(0.205, 0.04, 0.285, 0.015), at(0, 0.02, 0), col('#4a3a2a'));
  }
  // Head.
  t.add(block(0.2, 0.2, 0.22, 0.08, 3), at(0.005, 0.38, 0), skin);
  for (const s of [-1, 1]) {
    t.add(ball(0.016, 6, 4), at(0.104, 0.395, s * 0.048), P.eye);
    t.add(ball(0.02, 6, 4), at(0.098, 0.35, s * 0.07, 0, 0, 0, 0.4, 0.7, 1), P.cheek);
  }
  t.add(ball(0.022, 6, 4), at(0.112, 0.365, 0), tone(col(SKINS[skinIdx % SKINS.length]), 0.05, -0.05));
  if (role === 'farmer') {
    // Straw hat: a wide brim, a crown, a red band.
    t.add(cyl(0.2, 0.2, 0.022, 14), at(0, 0.475, 0, 0, 0, 0.04), (_w, n) => (n.y > 0.5 ? P.hat : P.hatDark));
    t.add(cyl(0.1, 0.112, 0.1, 12), at(0, 0.49, 0), P.hat);
    t.add(cyl(0.114, 0.114, 0.026, 12), at(0, 0.495, 0), P.band);
  } else {
    // Bandana tied over the head, knot at the back.
    const bd = col(BANDANAS[tint % 6]);
    t.add(ball(0.118, 12, 7, ), at(-0.005, 0.43, 0, 0, 0, 0.18, 1, 0.62, 1.04), bd);
    t.add(ico(0.035, 0), at(-0.115, 0.42, 0.02), bd, { flat: true });
    t.add(block(0.015, 0.07, 0.04, 0.008), at(-0.13, 0.37, 0.03, 0, 0.3, 0.3), bd);
  }
  const a = new GeoBuilder();
  a.add(block(0.072, 0.17, 0.072, 0.03, 2), at(0, -0.075, 0), shirt);
  a.add(ball(0.04, 7, 5), at(0, -0.18, 0), skin);
  const l = new GeoBuilder();
  l.add(block(0.088, 0.19, 0.095, 0.03, 2), at(0, -0.095, 0), pants);
  l.add(block(0.115, 0.06, 0.1, 0.025, 2), at(0.012, -0.21, 0), P.boot);
  return { torso: t.build(), arm: a.build(), leg: l.build() };
}

let shadowTex: CanvasTexture | null = null;
function blobShadow(): CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(20,16,30,0.55)');
  gr.addColorStop(0.6, 'rgba(20,16,30,0.25)');
  gr.addColorStop(1, 'rgba(20,16,30,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}

function toolGeos(): Record<'hoe' | 'can' | 'pouch' | 'hammer', BufferGeometry> {
  const hoe = new GeoBuilder();
  // Held at the hand (origin), handle running forward along +X, blade at the far end pointing down.
  hoe.add(cyl(0.012, 0.014, 0.62, 5), at(-0.12, 0, 0, 0, 0, -Math.PI / 2), P.wood);
  hoe.add(block(0.03, 0.1, 0.13, 0.008), at(0.5, -0.04, 0), P.metalDark);
  const can = new GeoBuilder();
  can.add(cyl(0.06, 0.065, 0.12, 9), at(0.05, -0.09, 0), P.can, { flat: true });
  can.add(cyl(0.012, 0.014, 0.16, 5), at(0.1, -0.05, 0, 0, 0, -1.0), P.can);
  can.add(cone(0.025, 0.03, 6), at(0.24, 0.035, 0, 0, 0, -1.0), P.metal, { flat: true });
  can.add(block(0.09, 0.015, 0.015, 0.006), at(0.03, 0.035, 0), P.metalDark);
  const pouch = new GeoBuilder();
  pouch.add(ico(0.055, 1), at(0.0, -0.03, 0, 0, 0, 0, 1, 0.9, 0.8), P.pouch, { flat: true });
  pouch.add(cyl(0.02, 0.03, 0.03, 6), at(0, 0.02, 0), col('#a88a55'));
  const hammer = new GeoBuilder();
  hammer.add(cyl(0.01, 0.012, 0.26, 5), at(0, 0, 0, 0, 0, -Math.PI / 2), P.wood);
  hammer.add(block(0.05, 0.11, 0.05, 0.01), at(0.26, 0.0, 0), P.hammer);
  return { hoe: hoe.build(), can: can.build(), pouch: pouch.build(), hammer: hammer.build() };
}

export interface Actors {
  group: Group;
  update(s: Readonly<WorldState>, now: number, dt: number, emit: Emitter, reducedMotion: boolean, perch: (x: number, y: number) => number): void;
  /** World position of the farmer's head, for the close camera. */
  dispose(): void;
}

export function buildActors(mats: Materials): Actors {
  const group = new Group();
  group.name = 'actors';
  const tools = toolGeos();
  const shadowMat = new MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false });
  const shadowGeo = new PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2);
  // Soft blob shadows under every figure and crow, one draw.
  const blobs = new InstancedMesh(shadowGeo, shadowMat, 32);
  blobs.instanceMatrix.setUsage(DynamicDrawUsage);
  blobs.frustumCulled = false;
  blobs.renderOrder = 2;
  blobs.count = 0;
  group.add(blobs);
  let blobN = 0;
  const blobM = new Matrix4();
  const blob = (x: number, z: number, s: number) => {
    if (blobN >= 32) return;
    blobM.makeScale(s, 1, s).setPosition(x, 0.012, z);
    blobs.setMatrixAt(blobN++, blobM);
  };
  const figures = new Map<number, Figure>();
  const geoCache = new Map<string, BufferGeometry>();

  const makeFigure = (a: Actor): Figure => {
    const skinIdx = a.role === 'farmer' ? 0 : (a.id * 7 + a.tint) % SKINS.length;
    const key = `${a.role}:${a.tint}:${skinIdx}`;
    let geo = geoCache.get(key);
    if (!geo) {
      const g = figureGeos(a.role, a.tint, skinIdx);
      const m = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
      geo = skinMerge([
        { geo: g.torso, bone: 1, at: m(0, HIP, 0) },
        { geo: g.arm, bone: 2, at: m(0, HIP + SHOULDER, -ARM_Z) },
        { geo: g.arm, bone: 3, at: m(0, HIP + SHOULDER, ARM_Z) },
        { geo: g.leg, bone: 4, at: m(0, HIP, -LEG_Z) },
        { geo: g.leg, bone: 5, at: m(0, HIP, LEG_Z) },
        ...TOOL_NAMES.map((t, i) => ({ geo: tools[t], bone: 6 + i, at: m(0, HIP + SHOULDER + HAND, ARM_Z) })),
      ]);
      g.torso.dispose();
      g.arm.dispose();
      g.leg.dispose();
      geoCache.set(key, geo);
    }
    const bone = (x: number, y: number, z: number, parent?: Bone) => {
      const b = new Bone();
      b.position.set(x, y, z);
      parent?.add(b);
      return b;
    };
    const root = bone(0, 0, 0);
    const body = bone(0, HIP, 0, root);
    const armL = bone(0, SHOULDER, -ARM_Z, body);
    const armR = bone(0, SHOULDER, ARM_Z, body);
    const legL = bone(0, HIP, -LEG_Z, root);
    const legR = bone(0, HIP, LEG_Z, root);
    const toolBones = TOOL_NAMES.map(() => bone(0, HAND, 0, armR));
    const mesh = new SkinnedMesh(geo, mats.figure);
    mesh.add(root);
    mesh.bind(new Skeleton([root, body, armL, armR, legL, legR, ...toolBones]));
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'figure';
    group.add(mesh);
    const tb = {} as Record<ToolName, Bone>;
    TOOL_NAMES.forEach((t, i) => (tb[t] = toolBones[i]));
    return { mesh, body, armL, armR, legL, legR, tools: tb, key, lastStrike: 0 };
  };

  // Crows: a body bone that dips to peck and two wing bones, one draw each.
  const crowBody = new GeoBuilder();
  crowBody.add(ico(1, 1), at(0, 0.09, 0, 0, 0, 0.15, 0.13, 0.085, 0.085), (_w, n) => (n.y > 0.3 ? P.crowSheen : P.crow), { flat: true });
  crowBody.add(ico(0.06, 1), at(0.11, 0.16, 0), P.crow, { flat: true });
  crowBody.add(cone(0.022, 0.07, 5), at(0.16, 0.155, 0, 0, 0, -Math.PI / 2), P.beak, { flat: true });
  crowBody.add(block(0.12, 0.015, 0.07, 0.006), at(-0.15, 0.1, 0, 0, 0, 0.25), P.crow);
  for (const s of [-1, 1]) crowBody.add(ball(0.012, 5, 3), at(0.145, 0.175, s * 0.03), col('#f4e6c0'));
  for (const s of [-1, 1]) crowBody.add(cyl(0.006, 0.006, 0.06, 3), at(0.0, 0.0, s * 0.03), P.beak);
  const wingB = (side: number) => {
    const b = new GeoBuilder();
    b.add(block(0.12, 0.012, 0.16, 0.006), at(-0.01, 0, side * 0.08), P.crowSheen);
    b.add(block(0.08, 0.01, 0.08, 0.004), at(-0.04, 0, side * 0.18), P.crow);
    return b.build();
  };
  const cb = crowBody.build();
  const wl = wingB(-1);
  const wr = wingB(1);
  const crowGeo = skinMerge([
    { geo: cb, bone: 1, at: new Matrix4() },
    { geo: wl, bone: 2, at: new Matrix4().makeTranslation(0, 0.12, -0.06) },
    { geo: wr, bone: 3, at: new Matrix4().makeTranslation(0, 0.12, 0.06) },
  ]);
  cb.dispose();
  wl.dispose();
  wr.dispose();
  interface CrowView {
    mesh: SkinnedMesh;
    head: Bone;
    wingL: Bone;
    wingR: Bone;
  }
  const crows: CrowView[] = [];
  const makeCrow = (): CrowView => {
    const root = new Bone();
    const head = new Bone();
    const wingL = new Bone();
    const wingR = new Bone();
    wingL.position.set(0, 0.12, -0.06);
    wingR.position.set(0, 0.12, 0.06);
    root.add(head, wingL, wingR);
    const mesh = new SkinnedMesh(crowGeo, mats.figure);
    mesh.add(root);
    mesh.bind(new Skeleton([root, head, wingL, wingR]));
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.name = 'crow';
    group.add(mesh);
    return { mesh, head, wingL, wingR };
  };

  const seen = new Set<number>();
  const hideUnseen = (f: Figure, id: number) => {
    if (!seen.has(id)) f.mesh.visible = false;
  };

  return {
    group,
    update(s, now, dt, emit, reducedMotion, perch) {
      seen.clear();
      blobN = 0;
      for (const a of s.actors) {
        if (a.away) continue;
        seen.add(a.id);
        let f = figures.get(a.id);
        const skinIdx = a.role === 'farmer' ? 0 : (a.id * 7 + a.tint) % SKINS.length;
        if (f && f.key !== `${a.role}:${a.tint}:${skinIdx}`) {
          group.remove(f.mesh);
          f.mesh.skeleton.dispose();
          figures.delete(a.id);
          f = undefined;
        }
        if (!f) {
          f = makeFigure(a);
          figures.set(a.id, f);
        }
        f.mesh.visible = true;
        pose(f, a, now, dt, emit, reducedMotion);
      }
      figures.forEach(hideUnseen);
      // Crows.
      let n = 0;
      for (const c of s.crows) {
        if (c.phase === 'gone') continue;
        if (n >= crows.length) crows.push(makeCrow());
        const v = crows[n++];
        v.mesh.visible = true;
        poseCrow(v, c, now, perch(c.x, c.y));
      }
      for (let i = n; i < crows.length; i++) crows[i].mesh.visible = false;
      blobs.count = blobN;
      blobs.visible = blobN > 0;
      blobs.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const g of geoCache.values()) g.dispose();
      for (const f of figures.values()) f.mesh.skeleton.dispose();
      for (const c of crows) c.mesh.skeleton.dispose();
      for (const g of Object.values(tools)) g.dispose();
      crowGeo.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
    },
  };

  function poseCrow(v: { mesh: SkinnedMesh; head: Bone; wingL: Bone; wingR: Bone }, c: Crow, now: number, top: number): void {
    const tx = c.x + 0.5 + 0.12;
    const tz = c.y + 0.5 + 0.05;
    const fx = c.fromX;
    const fz = c.fromY;
    const perchY = Math.min(1.1, Math.max(0.06, top * 0.85));
    let x = tx;
    let y = perchY;
    let z = tz;
    let flying = false;
    let heading = Math.atan2(tz - fz, tx - fx);
    if (c.phase === 'in') {
      const e = clamp(c.t / CROW_FLY_SECONDS, 0, 1);
      const ee = 1 - (1 - e) * (1 - e);
      x = fx + (tx - fx) * ee;
      z = fz + (tz - fz) * ee;
      y = perchY + (1 - ee) * 3.2 + Math.sin(Math.PI * e) * 0.4;
      flying = e < 0.97;
    } else if (c.phase === 'flee') {
      const e = clamp(c.t / CROW_FLY_SECONDS, 0, 1);
      const ee = e * e;
      x = tx + (fx - tx) * ee;
      z = tz + (fz - tz) * ee;
      y = perchY + ee * 4 + Math.sin(Math.PI * e) * 0.6;
      flying = true;
      heading = Math.atan2(fz - tz, fx - tx);
      if (e >= 1) v.mesh.visible = false;
    } else {
      heading = Math.atan2(c.y + 0.5 - tz, c.x + 0.5 - tx) + Math.sin(now * 0.7 + c.id) * 0.4;
    }
    v.mesh.position.set(x, y, z);
    v.mesh.rotation.y = -heading;
    if (v.mesh.visible) blob(x, z, flying ? Math.max(0.25, 0.7 - (y - perchY) * 0.15) : 0.55);
    if (flying) {
      const flap = Math.sin(now * 22 + c.id) * 0.9;
      v.wingL.rotation.x = -flap - 0.2;
      v.wingR.rotation.x = flap + 0.2;
      v.head.rotation.z = 0.1;
    } else {
      // Pecking: the body dips forward in quick pecks, the wings fold.
      const pk = Math.max(0, Math.sin(now * 7 + c.id * 3));
      v.head.rotation.z = -pk * pk * 0.55;
      v.wingL.rotation.x = -0.05;
      v.wingR.rotation.x = 0.05;
    }
  }

  function pose(f: Figure, a: Actor, now: number, dt: number, emit: Emitter, reduced: boolean): void {
    const hop = a.hop > 0 ? Math.sin(Math.PI * clamp(a.hop, 0, 1)) * 0.32 : 0;
    f.mesh.position.set(a.x, hop, a.y);
    f.mesh.rotation.y = -a.angle;
    blob(a.x, a.y, 1 - hop * 0.8);
    // Defaults: standing.
    let bodyY = 0.235;
    let lean = 0;
    let armLz = 0;
    let armRz = 0;
    let armLx = -0.08;
    let armRx = 0.08;
    let legLz = 0;
    let legRz = 0;
    let twist = 0;
    let tool: ToolName | null = null;
    let toolRot = 0;
    const task = a.task;
    let spout = false;
    let seeds = false;
    if (a.moving && !task) {
      const ph = a.walked * ((Math.PI * 2) / 0.95);
      const sw = Math.sin(ph);
      legLz = sw * 0.6;
      legRz = -sw * 0.6;
      armLz = -sw * 0.5;
      armRz = sw * 0.5;
      bodyY += Math.abs(Math.cos(ph)) * 0.035;
      lean = -0.08;
      twist = sw * 0.08;
    } else if (!task) {
      const br = Math.sin(now * 2.2 + a.id);
      bodyY += br * 0.004;
      armLz = br * 0.03;
      armRz = -br * 0.03;
    }
    if (task) {
      const p = clamp(task.dur > 0 ? task.t / task.dur : 0, 0, 1);
      const fx = Math.cos(a.angle);
      const fz = Math.sin(a.angle);
      const verb: Verb = task.verb;
      switch (verb) {
        case 'till': {
          tool = 'hoe';
          // Raise overhead, swing down into the soil, recover.
          const up = smooth(0, 0.35, p);
          const down = smooth(0.35, 0.55, p);
          const sw = up * 2.5 - down * 2.0 - smooth(0.7, 1, p) * 0.3;
          armRz = sw + 0.2;
          armLz = sw + 0.2;
          armLx = 0.25;
          armRx = -0.1;
          lean = -down * 0.35 + smooth(0.7, 1, p) * 0.3;
          toolRot = -1.1 + down * 0.3;
          if (p > 0.53 && f.lastStrike < task.t - 0.2) {
            f.lastStrike = task.t;
            emit.dust(a.x + fx * 0.55, 0.05, a.y + fz * 0.55);
          }
          if (p < 0.1) f.lastStrike = -1;
          break;
        }
        case 'water': {
          tool = 'can';
          const tip = smooth(0.1, 0.35, p) * (1 - smooth(0.85, 1, p));
          armRz = 1.0 + tip * 0.25;
          armRx = 0.15;
          toolRot = -1.0 - tip * 0.7;
          armLz = 0.3;
          lean = -0.1;
          if (tip > 0.6 && (!reduced || Math.random() < 0.5)) spout = true;
          break;
        }
        case 'plant': {
          const sw = Math.sin(p * Math.PI * 2);
          armRz = 0.9 + sw * 0.25;
          armRx = 0.2 + sw * 0.6;
          armLz = 0.6;
          armLx = -0.3;
          tool = 'pouch';
          lean = -0.25;
          bodyY -= 0.03;
          if (p > 0.25 && p < 0.75) seeds = true;
          break;
        }
        case 'harvest':
        case 'clear': {
          // Crouch and pull, then stand and lift.
          const pull = smooth(0, 0.35, p) * (1 - smooth(0.45, 0.75, p));
          const lift = smooth(0.45, 0.8, p) * (1 - smooth(0.9, 1, p));
          bodyY -= pull * 0.1;
          lean = -pull * 0.55;
          armLz = armRz = pull * 0.9 + lift * (verb === 'harvest' ? 2.6 : 1.4);
          armLx = -0.15 - lift * 0.1;
          armRx = 0.15 + lift * 0.1;
          legLz = pull * 0.35;
          legRz = -pull * 0.15;
          if (verb === 'clear') twist = lift * 0.6;
          break;
        }
        case 'tend': {
          const c = smooth(0, 0.2, p) * (1 - smooth(0.85, 1, p));
          bodyY -= c * 0.12;
          lean = -c * 0.5;
          legLz = c * 0.5;
          legRz = -c * 0.2;
          const jig = Math.sin(now * 22) * 0.18 * c;
          armLz = c * 1.0 + jig;
          armRz = c * 1.0 - jig;
          break;
        }
        case 'scare': {
          const w = Math.sin(now * 14);
          armLx = -2.5 - w * 0.4;
          armRx = 2.5 + w * 0.4;
          armLz = armRz = 0.2;
          bodyY += Math.abs(Math.sin(p * Math.PI * 2)) * 0.06;
          break;
        }
        case 'build': {
          tool = 'hammer';
          // Two strikes per action.
          const q = (p * 2) % 1;
          const raise = smooth(0, 0.5, q);
          const hit = smooth(0.55, 0.7, q);
          armRz = 0.4 + raise * 1.9 - hit * 1.9;
          armLz = 0.7;
          armLx = -0.2;
          lean = -0.2 - hit * 0.15;
          bodyY -= 0.05;
          toolRot = -0.9;
          if (hit > 0.95 && q < 0.8 && now - f.lastStrike > 0.15) {
            f.lastStrike = now;
            emit.dust(a.x + fx * 0.45, 0.05, a.y + fz * 0.45);
          }
          break;
        }
      }
    }
    f.body.position.y = bodyY;
    f.body.rotation.set(0, twist, lean);
    f.armL.rotation.set(armLx, 0, armLz);
    f.armR.rotation.set(armRx, 0, armRz);
    f.legL.rotation.set(0, 0, legLz);
    f.legR.rotation.set(0, 0, legRz);
    // Legs stay planted under the body when it crouches.
    const drop = HIP - bodyY;
    f.legL.position.y = HIP - Math.max(0, drop) * 0.5;
    f.legR.position.y = HIP - Math.max(0, drop) * 0.5;
    for (const t of TOOL_NAMES) {
      const b = f.tools[t];
      b.scale.setScalar(t === tool ? 1 : 0);
      b.rotation.set(0, 0, t === tool ? toolRot : 0);
    }
    if (spout || seeds) {
      f.mesh.updateMatrixWorld(true);
      if (spout) {
        _v.set(0.26, 0.04, 0).applyMatrix4(f.tools.can.matrixWorld);
        emit.water(_v.x, _v.y, _v.z, Math.cos(a.angle), Math.sin(a.angle));
      } else {
        _v.set(0, 0, 0).applyMatrix4(f.tools.pouch.matrixWorld);
        emit.seeds(_v.x, _v.y, _v.z, Math.cos(a.angle), Math.sin(a.angle));
      }
    }
    void dt;
  }
}

export function tintColor(t: number): Color {
  return col(HAND_TINTS[t % 6]);
}
