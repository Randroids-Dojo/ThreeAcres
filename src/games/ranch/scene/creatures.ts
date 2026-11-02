// Drawing downies, loose things and nettlebacks, all instanced. Each kind of
// downy has its own silhouette, not just a colour: clover downies have leaf
// ears, embers a flame tuft and a warm inner glow, brooks a droplet tail and a
// glossy coat, thistles a crown of spikes and a scowl. Every hop squashes and
// stretches; things being drawn tumble and shrink into the muzzle.

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  Vector4,
  Euler,
  BoxGeometry,
} from 'three';
import { KIND, KINDS, TUFT_KIND, isTuft, wantedFood, type DownyKind, type Food, type ItemType } from '../defs';
import { clamp, hash2 } from '../noise';
import type { Physics } from '../physics';
import type { RanchState } from '../state';
import { at, jitter, merge, part } from './geo';
import { U, fluff, matte } from './mat';

const _m = new Matrix4();
const _m2 = new Matrix4();
const _m3 = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _s = new Vector3();
const _c = new Color();

type G = BufferGeometry;

/** A tufted ball: an icosphere with its vertices pushed out in soft lumps. */
function puffBall(r: number, lump: number, seed: number, belly: number, body: number, detail = 3): G {
  const g = new IcosahedronGeometry(r, detail);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i).normalize();
    const k = Math.round(_v.x * 9) * 131 + Math.round(_v.y * 9) * 37 + Math.round(_v.z * 9) * 7;
    const n = (hash2(k, seed, 1) - 0.5) * lump;
    p.setXYZ(i, _v.x * r * (1 + n), _v.y * r * (1 + n), _v.z * r * (1 + n));
  }
  g.computeVertexNormals();
  const ng = part(g, body, { vary: 0.04 });
  // Belly: the front-low part fades to cream.
  const pos = ng.getAttribute('position');
  const col = ng.getAttribute('color');
  const bc = new Color(belly);
  const tc = new Color(body);
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).normalize();
    const t = clamp((_v.z * 0.8 - _v.y * 0.6 + 0.1) * 1.6, 0, 1);
    _c.copy(tc).lerp(bc, t);
    const top = clamp(_v.y, 0, 1) * 0.08;
    col.setXYZ(i, _c.r * (1 + top), _c.g * (1 + top), _c.b * (1 + top));
  }
  return ng;
}

function feet(color: number): G[] {
  return [-1, 1].map((s) => part(at(new SphereGeometry(0.06, 8, 5), s * 0.1, 0.03, 0.08, 0, 0, 0, 1, 0.55, 1.3), color, { vary: 0.02 }));
}

function leaf(len: number, wid: number, color: number, x: number, y: number, z: number, rx: number, ry: number, rz: number): G {
  const g = new SphereGeometry(1, 10, 6);
  at(g, 0, len, 0, 0, 0, 0, wid, len, 0.02);
  // Pointed tip.
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i);
    const t = clamp((yy - len) / len, -1, 1);
    p.setX(i, p.getX(i) * (1 - Math.max(0, t) * 0.75));
  }
  at(g, x, y, z, rx, ry, rz);
  return part(g, color, { vary: 0.05, top: 0x8cc060, topAt: y + len * 0.8 });
}

/** Body geometry per kind, centred on x and z, feet at y = 0, facing +z. */
function bodyGeometry(k: DownyKind): G {
  const info = KIND[k];
  const parts: G[] = [];
  if (k === 'clover') {
    parts.push(at(puffBall(0.26, 0.16, 1, info.belly, info.body), 0, 0.27, 0, 0, 0, 0, 1, 0.93, 1));
    // Two leaf ears, splayed.
    parts.push(leaf(0.15, 0.085, info.accent, -0.1, 0.44, -0.02, 0.15, 0, 0.55));
    parts.push(leaf(0.15, 0.085, info.accent, 0.1, 0.44, -0.02, 0.15, 0, -0.55));
    parts.push(part(at(new CylinderGeometry(0.012, 0.016, 0.1, 5), 0, 0.53, 0, 0.2, 0, 0), 0x5a8a3e));
  } else if (k === 'ember') {
    parts.push(at(puffBall(0.25, 0.12, 2, info.belly, info.body), 0, 0.26, 0, 0, 0, 0, 1, 0.98, 1));
    // A flame tuft: three curling licks, tallest in the middle.
    for (const [x, h, lean, col] of [
      [0, 0.34, 0.25, 0xf28a3a],
      [-0.07, 0.2, 0.55, 0xf5a24c],
      [0.07, 0.22, -0.5, 0xf7b85a],
    ] as const) {
      const g = new ConeGeometry(0.075, h, 7, 3);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + h / 2) / h;
        p.setZ(i, p.getZ(i) - t * t * 0.12);
      }
      at(g, x, 0.48 + h * 0.4, -0.03, -0.25, 0, lean);
      parts.push(part(g, col, { vary: 0.04, top: 0xffe08a, topAt: 0.62 }));
    }
  } else if (k === 'brook') {
    parts.push(at(puffBall(0.26, 0.05, 3, info.belly, info.body), 0, 0.26, 0, 0, 0, 0, 1.02, 0.9, 1.08));
    // A droplet tail curling up behind.
    const tail = new SphereGeometry(0.11, 12, 8);
    const p = tail.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = clamp((y + 0.11) / 0.22, 0, 1);
      const s = 1 - t * t * 0.85;
      p.setXYZ(i, p.getX(i) * s, y * 2.2, p.getZ(i) * s);
    }
    at(tail, 0, 0.36, -0.3, -0.85, 0, 0);
    parts.push(part(tail, info.accent, { vary: 0.03, top: 0xa8c8f0, topAt: 0.45 }));
    parts.push(part(at(new SphereGeometry(0.07, 8, 6), 0, 0.2, -0.25), info.body));
  } else {
    parts.push(at(puffBall(0.22, 0.22, 4, info.belly, info.body, 2), 0, 0.23, 0));
    // Spikes over the crown and back.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 * 2.618;
      const el = 0.25 + (i / 16) * 1.1;
      const dir = new Vector3(Math.sin(a) * Math.sin(el), Math.cos(el), -Math.abs(Math.cos(a)) * Math.sin(el) * 0.6 - 0.2).normalize();
      if (dir.z > 0.35) continue;
      const len = 0.16 + hash2(i, 9) * 0.08;
      const g = new ConeGeometry(0.035, len, 5);
      at(g, 0, len / 2, 0);
      _q.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      g.applyQuaternion(_q);
      at(g, dir.x * 0.18, 0.23 + dir.y * 0.18, dir.z * 0.18);
      parts.push(part(g, info.accent, { vary: 0.05, top: 0xe6dcf2, topAt: 0.5 }));
    }
  }
  parts.push(...feet(k === 'brook' ? 0x6d8fc4 : k === 'ember' ? 0xd88a52 : k === 'thistle' ? 0x8e72b4 : 0x9cb67a));
  return merge(parts);
}

/** Two big friendly eyes with highlights; the thistle's get brows in a scowl. */
function eyeGeometry(scowl: boolean): G {
  const parts: G[] = [];
  for (const s of [-1, 1]) {
    const x = s * 0.085;
    parts.push(part(at(new SphereGeometry(0.055, 10, 6), x, 0, 0, 0, 0, 0, scowl ? 0.85 : 1, scowl ? 0.75 : 1.25, 0.5), 0x2b2236, { vary: 0 }));
    parts.push(part(at(new SphereGeometry(0.018, 6, 4), x + 0.016, 0.022, 0.026), 0xffffff, { vary: 0 }));
    if (scowl) {
      const b = new BoxGeometry(0.085, 0.022, 0.02);
      at(b, x - s * 0.005, 0.06, 0.01, 0, 0, s * 0.45);
      parts.push(part(b, 0x3a2848, { vary: 0 }));
    }
  }
  // A small smile line under the eyes (a frown for thistles).
  const mouth = new CylinderGeometry(0.004, 0.004, 0.05, 4);
  at(mouth, 0, scowl ? -0.07 : -0.065, 0.012, 0, 0, Math.PI / 2);
  parts.push(part(mouth, 0x3a2848, { vary: 0 }));
  return merge(parts);
}

// ---------------------------------------------------------------- items

function itemGeometry(t: 'cloverhead' | 'sweetroot' | 'dewberry' | 'tuft'): G {
  const parts: G[] = [];
  if (t === 'cloverhead') {
    parts.push(part(jitter(new IcosahedronGeometry(0.085, 1), 0.03, 4), 0xe58fbe, { flat: true, vary: 0.12, top: 0xf6c6dc, topAt: 0.05 }));
    parts.push(part(at(new CylinderGeometry(0.01, 0.012, 0.12, 4), 0, -0.1, 0), 0x6e9a52));
    for (let l = 0; l < 3; l++) {
      const a = (l / 3) * Math.PI * 2;
      parts.push(part(at(new SphereGeometry(0.045, 6, 3), Math.cos(a) * 0.05, -0.13, Math.sin(a) * 0.05, 0, 0, 0, 1, 0.3, 1), 0x6aa04e, { flat: true }));
    }
  } else if (t === 'sweetroot') {
    const g = new ConeGeometry(0.06, 0.24, 7, 2);
    at(g, 0, -0.04, 0, Math.PI, 0, 0);
    parts.push(part(jitter(g, 0.012, 3), 0xe2853f, { flat: true, vary: 0.1 }));
    for (let k = 0; k < 3; k++) parts.push(part(at(new ConeGeometry(0.02, 0.14, 4), Math.cos(k * 2.1) * 0.02, 0.13, Math.sin(k * 2.1) * 0.02, Math.cos(k * 2.1) * 0.4, 0, Math.sin(k * 2.1) * 0.4), 0x8aa84a, { flat: true }));
  } else if (t === 'dewberry') {
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4;
      const y = (k / 9 - 0.5) * 0.12;
      const r = Math.sqrt(1 - (y / 0.08) ** 2) * 0.05 || 0.02;
      parts.push(part(at(new IcosahedronGeometry(0.042, 0), Math.cos(a) * r, y, Math.sin(a) * r), k % 2 ? 0x5862c8 : 0x6c74d8, { flat: true, vary: 0.05 }));
    }
    parts.push(part(at(new ConeGeometry(0.04, 0.03, 5), 0, 0.08, 0, Math.PI, 0, 0), 0x5e8a46, { flat: true }));
  } else {
    // A seed-head puff: a soft core and fine filaments.
    parts.push(part(new IcosahedronGeometry(0.06, 1), 0xffffff, { vary: 0.03 }));
    for (let k = 0; k < 14; k++) {
      const dir = new Vector3(hash2(k, 1) - 0.5, hash2(k, 2) - 0.3, hash2(k, 3) - 0.5).normalize();
      const g = new ConeGeometry(0.03, 0.11, 4);
      at(g, 0, 0.07, 0);
      _q.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      g.applyQuaternion(_q);
      parts.push(part(g, 0xffffff, { vary: 0.05 }));
    }
  }
  return merge(parts);
}

// ---------------------------------------------------------------- nettlebacks

function nettleBody(): G {
  const parts: G[] = [];
  const b = new SphereGeometry(0.36, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  at(b, 0, 0.08, 0, 0, 0, 0, 1, 0.75, 1.25);
  parts.push(part(b, 0x6a5560, { vary: 0.05 }));
  parts.push(part(at(new SphereGeometry(0.3, 10, 6), 0, 0.12, 0, 0, 0, 0, 0.95, 0.4, 1.15), 0xa89080, { vary: 0.04 }));
  // Snout and nose.
  parts.push(part(at(new ConeGeometry(0.12, 0.28, 8), 0, 0.14, 0.48, Math.PI / 2, 0, 0), 0xc4ac96, { flat: true }));
  parts.push(part(at(new SphereGeometry(0.045, 8, 6), 0, 0.14, 0.62), 0x47323c));
  // Small eyes under grumpy brows.
  for (const s of [-1, 1]) {
    parts.push(part(at(new SphereGeometry(0.03, 6, 4), s * 0.09, 0.24, 0.37), 0x3c2a36, { vary: 0 }));
    parts.push(part(at(new BoxGeometry(0.08, 0.02, 0.03), s * 0.085, 0.29, 0.37, 0, 0, s * 0.5), 0x4c3a44, { vary: 0 }));
  }
  for (const [x, z] of [
    [-0.18, 0.22],
    [0.18, 0.22],
    [-0.18, -0.22],
    [0.18, -0.22],
  ]) parts.push(part(at(new CylinderGeometry(0.05, 0.05, 0.12, 6), x, 0.04, z), 0x54444a, { flat: true }));
  return merge(parts);
}

/** A nettleback's eyes, lit from within (a dark lump at 6 m at night was all the fifth playtest saw of one). */
function nettleEyes(): G {
  const parts: G[] = [];
  for (const s of [-1, 1]) parts.push(part(at(new SphereGeometry(0.042, 8, 6), s * 0.09, 0.235, 0.385), 0xffffff, { vary: 0 }));
  return merge(parts);
}

/** The moonlit rim on a nettleback at night (rgb and strength), so its outline reads against the dark grass. */
export const NETTLE_RIM = { value: new Vector4(0.66, 0.72, 1.0, 0.85) };

/** Matte vertex colour with a cool rim that comes up at night. */
function nettleMat(flat: boolean): MeshLambertMaterial {
  const m = matte({ flat });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.uNight;
    sh.uniforms.uNettleRim = NETTLE_RIM;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uNight;\nuniform vec4 uNettleRim;`)
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 rn = normalize( normal );
          vec3 rv = normalize( vViewPosition );
          float f = clamp( 1.0 - max( dot( rn, rv ), 0.0 ), 0.0, 1.0 );
          outgoingLight += uNettleRim.rgb * ( f * f ) * uNight * uNettleRim.w * 0.6;
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `nettle:${flat}`;
  return m;
}

function nettleSpikes(): G {
  const parts: G[] = [];
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996;
    const t = (i + 0.5) / 46;
    const el = Math.acos(1 - t * 0.95);
    const dir = new Vector3(Math.sin(el) * Math.cos(a), Math.cos(el), Math.sin(el) * Math.sin(a) * 1.2 - 0.15).normalize();
    if (dir.z > 0.55 && dir.y < 0.7) continue;
    const g = new ConeGeometry(0.032, 0.24 + hash2(i, 4) * 0.08, 4);
    at(g, 0, 0.12, 0);
    _q.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    g.applyQuaternion(_q);
    at(g, dir.x * 0.3, 0.1 + dir.y * 0.22, dir.z * 0.36);
    parts.push(part(g, i % 3 ? 0x4a3a44 : 0x5c4a54, { flat: true, top: 0xd8c8a8, topAt: 0.4 }));
  }
  return merge(parts);
}

// ---------------------------------------------------------------- a pest's eye glow

/**
 * A soft warm glow round a nettleback's lit eyes at night, facing the view and
 * kept about fifteen CSS px across however far off it is (`GLOW`), so a pest
 * 20 m off reads as a warm ember, not the dark speck the sixth playtest saw.
 * Up close (under about 8 m) it fades out: the lit eyes read on their own.
 * The instance matrix carries where and how big; the quad turns to the camera
 * in the vertex shader.
 */
const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
varying float vFar;
void main() {
  vUv = uv;
  vec4 c = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  float s = length( instanceMatrix[0].xyz );
  // Up close its lit eyes read on their own: the glow comes in from about 8 m out and is whole by 14.
  vFar = smoothstep( 0.19, 0.34, s );
  c.xy += position.xy * s;
  // A little towards the view (more from further off), so its own snout and a ripple of ground do not cut it.
  c.z += 0.06 + 0.012 * max( -c.z, 0.0 );
  gl_Position = projectionMatrix * c;
}
`;
const GLOW_FRAG = /* glsl */ `
uniform float uNight;
varying vec2 vUv;
varying float vFar;
void main() {
  float d = length( vUv - 0.5 ) * 2.0;
  float a = ( smoothstep( 1.0, 0.2, d ) * 0.45 + smoothstep( 0.5, 0.05, d ) * 0.9 ) * clamp( uNight, 0.0, 1.0 ) * vFar;
  if ( !( a > 0.002 ) ) discard;
  gl_FragColor = vec4( 1.0, 0.74, 0.38, a );
}
`;
/** The glow's size: this share of its distance (m), between these (m). About 15 CSS px across from 10 m out on a phone. */
export const GLOW = { per: 0.024, min: 0.18, max: 0.9 };

// ---------------------------------------------------------------- blob shadows

const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
varying float vA;
void main() {
  vUv = uv;
  vA = instanceColor.r;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
}
`;
const SHADOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vA;
void main() {
  float d = length( vUv - 0.5 ) * 2.0;
  float a = smoothstep( 1.0, 0.2, d ) * vA * 0.32;
  gl_FragColor = vec4( 0.12, 0.1, 0.18, a );
}
`;

export interface Muzzle {
  x: number;
  y: number;
  z: number;
}

const CAP = 96;
const ITEM_CAP = 320;

export class CreatureView {
  readonly root = new Object3D();
  private bodies: Record<DownyKind, InstancedMesh>;
  private eyes: InstancedMesh;
  private scowls: InstancedMesh;
  private items: Record<'cloverhead' | 'sweetroot' | 'dewberry' | 'tuft', InstancedMesh>;
  /** Over each hungry downy of yours, the food it wants, bobbing: hunger and the right food shown in the world. */
  readonly wants: Record<Food, InstancedMesh>;
  private nBody: InstancedMesh;
  private nSpikes: InstancedMesh;
  private nEyes: InstancedMesh;
  private nGlow: InstancedMesh;
  /** For checks: a nettleback's night look (its lit eyes and moonlit rim) on or off. */
  nettleGlow = true;
  private shadows: InstancedMesh;
  private shadowA: InstancedBufferAttribute;
  /** Shared geometries for the canister's tiny contents. */
  readonly geos: { body: Record<DownyKind, G>; eyes: G; scowl: G; item: Record<'cloverhead' | 'sweetroot' | 'dewberry' | 'tuft', G> };

  constructor() {
    const body = {} as Record<DownyKind, G>;
    this.bodies = {} as Record<DownyKind, InstancedMesh>;
    for (const k of KINDS) {
      body[k] = bodyGeometry(k);
      const mat = fluff({ gloss: k === 'brook' ? 0.55 : 0, glow: k === 'ember' ? 0.28 : 0, rim: k === 'brook' ? 0.7 : 1 });
      const m = new InstancedMesh(body[k], mat, CAP);
      // Per-instance colour: white for most, a tint for the board's rare one (a gold clover, a rose ember, a silver brook).
      m.setColorAt(0, _c.setRGB(1, 1, 1));
      m.count = 0;
      m.frustumCulled = false;
      m.name = `downy-${k}`;
      this.bodies[k] = m;
      this.root.add(m);
    }
    const eyes = eyeGeometry(false);
    const scowl = eyeGeometry(true);
    this.eyes = new InstancedMesh(eyes, matte(), CAP * 3);
    this.scowls = new InstancedMesh(scowl, matte(), CAP);
    for (const m of [this.eyes, this.scowls]) {
      m.count = 0;
      m.frustumCulled = false;
      this.root.add(m);
    }
    this.eyes.name = 'eyes';
    this.scowls.name = 'scowls';
    const item = {
      cloverhead: itemGeometry('cloverhead'),
      sweetroot: itemGeometry('sweetroot'),
      dewberry: itemGeometry('dewberry'),
      tuft: itemGeometry('tuft'),
    };
    this.items = {} as typeof this.items;
    for (const k of Object.keys(item) as (keyof typeof item)[]) {
      const m = new InstancedMesh(item[k], k === 'tuft' ? fluff({ rim: 1.4 }) : matte({ flat: true }), ITEM_CAP);
      m.count = 0;
      m.frustumCulled = false;
      m.name = `item-${k}`;
      if (k === 'tuft') m.setColorAt(0, _c.setRGB(1, 1, 1));
      this.items[k] = m;
      this.root.add(m);
    }
    this.wants = {} as Record<Food, InstancedMesh>;
    for (const k of ['cloverhead', 'sweetroot', 'dewberry'] as Food[]) {
      const m = new InstancedMesh(item[k], new MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2a2a }), CAP);
      m.count = 0;
      m.frustumCulled = false;
      m.name = `want-${k}`;
      this.wants[k] = m;
      this.root.add(m);
    }
    this.nBody = new InstancedMesh(nettleBody(), nettleMat(false), 8);
    this.nSpikes = new InstancedMesh(nettleSpikes(), nettleMat(true), 8);
    // Warm amber eyes, unlit so they glow in the dark (small beads by day).
    this.nEyes = new InstancedMesh(nettleEyes(), new MeshBasicMaterial({ color: 0xffc66e }), 8);
    this.nEyes.name = 'nettle-eyes';
    for (const m of [this.nBody, this.nSpikes, this.nEyes]) {
      m.count = 0;
      m.frustumCulled = false;
      this.root.add(m);
    }
    this.nBody.name = 'nettle';
    this.nSpikes.name = 'nettle-spikes';
    this.nGlow = new InstancedMesh(new PlaneGeometry(1, 1), new ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { uNight: U.uNight }, transparent: true, depthWrite: false, blending: AdditiveBlending }), 8);
    this.nGlow.count = 0;
    this.nGlow.frustumCulled = false;
    this.nGlow.renderOrder = 2;
    this.nGlow.name = 'nettle-glow';
    this.root.add(this.nGlow);
    const sg = new PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    this.shadows = new InstancedMesh(sg, new ShaderMaterial({ vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), CAP + ITEM_CAP + 8);
    this.shadows.setColorAt(0, _c.setRGB(1, 1, 1));
    this.shadowA = this.shadows.instanceColor!;
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    this.shadows.name = 'blob-shadows';
    this.root.add(this.shadows);
    this.geos = { body, eyes, scowl, item };
  }

  private shadowN = 0;

  private shadow(x: number, y: number, z: number, r: number, height: number): void {
    if (this.shadowN >= this.shadows.instanceMatrix.count) return;
    const k = clamp(1 - height / 3, 0, 1);
    if (k <= 0.02) return;
    const s = r * 2.6 * (0.6 + 0.4 * k);
    _m.makeScale(s, 1, s).setPosition(x, y + 0.03, z);
    this.shadows.setMatrixAt(this.shadowN, _m);
    this.shadowA.setXYZ(this.shadowN, k, k, k);
    this.shadowN++;
  }

  update(s: RanchState, phys: Physics, t: number, muzzle: Muzzle, skip: { x: number; z: number } | null = null, reduced = false): void {
    this.shadowN = 0;
    const wn: Record<Food, number> = { cloverhead: 0, sweetroot: 0, dewberry: 0 };
    const n: Record<DownyKind, number> = { clover: 0, ember: 0, brook: 0, thistle: 0 };
    let ne = 0;
    let ns = 0;
    for (const d of s.downies) {
      if (d.gone) continue;
      const k = d.kind;
      if (n[k] >= CAP) continue;
      // Squash and stretch, volume kept.
      let sy = d.squash;
      let sxz = 1 / Math.sqrt(Math.max(0.3, sy));
      let pitch = 0;
      let roll = 0;
      let scale = 1;
      if (d.drawn > 0) {
        const dist = Math.hypot(muzzle.x - d.x, muzzle.y - d.y, muzzle.z - d.z);
        scale = clamp((dist - 0.15) / 1.6, 0.18, 1);
        sy = 1 + (1 - scale) * 0.6;
        sxz = 1 / Math.sqrt(sy);
        pitch = d.drawn * 9;
        roll = Math.sin(d.drawn * 13) * 0.4;
      } else if (d.mood === 'frazzled') {
        roll = Math.sin(t * 40 + d.id) * 0.06;
      }
      // Puffing up to pull back (the duel's tell): it swells towards the pull, and stays a little big through it.
      if (d.tell > 0 && d.tellLen > 0) {
        const p = 1 - d.tell / d.tellLen;
        const puff = 1 + 0.34 * p * (2 - p);
        scale *= puff;
      } else if (d.feint > 0 && d.feintLen > 0) {
        // A fake puff (round 9): it puffs up only a little, shivers and sags, and does not pull.
        const p = 1 - d.feint / d.feintLen;
        scale *= 1 + 0.16 * Math.sin(Math.PI * p);
        roll += Math.sin(t * 46 + d.id) * 0.09;
      } else if (d.back > 0 && !d.tame) scale *= 1.12;
      const wob = d.mood === 'hungry' ? 0 : Math.sin(t * 2 + d.id) * 0.015;
      _e.set(pitch, d.yaw, roll + wob, 'YXZ');
      _q.setFromEuler(_e);
      // Pivot squash around the feet so landing squashes into the ground.
      _m.compose(_v.set(d.x, d.y, d.z), _q, _s.set(sxz * scale, sy * scale, sxz * scale));
      this.bodies[k].setColorAt(n[k], d.rare ? RARE_TINT[k] : WHITE);
      this.bodies[k].setMatrixAt(n[k]++, _m);
      // Eyes sit on the face; blink, and grow when hungry.
      const blink = d.blinkT < 0 ? 0.12 : 1;
      const big = d.mood === 'hungry' ? 1.22 : d.mood === 'frazzled' ? 1.1 : 1;
      const eyeY = k === 'thistle' ? 0.28 : 0.32;
      const eyeZ = k === 'thistle' ? 0.19 : k === 'brook' ? 0.255 : 0.235;
      _m2.makeScale(big, big * blink, big).setPosition(0, eyeY, eyeZ);
      _m.multiply(_m2);
      if (k === 'thistle') {
        if (ns < CAP) this.scowls.setMatrixAt(ns++, _m);
      } else if (ne < CAP * 3) this.eyes.setMatrixAt(ne++, _m);
      if (d.drawn === 0) {
        const fl = phys.rest(d.x, d.z, true);
        this.shadow(d.x, fl, d.z, d.r, d.y - fl);
      }
      // Hungry and yours: the food it wants bobs over its head (unless a lesson's marker already shows it there).
      if (d.drawn === 0 && (d.tame || d.keep) && d.hunger > 0.5 && !(skip && Math.abs(skip.x - d.x) < 0.25 && Math.abs(skip.z - d.z) < 0.25)) {
        const f = wantedFood(k);
        if (wn[f] < CAP) {
          const bob = reduced ? 0 : Math.sin(t * 2.6 + d.id) * 0.06;
          _e.set(0.35, reduced ? d.id : t * 1.1 + d.id, 0, 'YXZ');
          _q.setFromEuler(_e);
          _m.compose(_v.set(d.x, d.y + 0.8 + bob, d.z), _q, _s.setScalar(0.95));
          this.wants[f].setMatrixAt(wn[f]++, _m);
        }
      }
    }
    for (const f of ['cloverhead', 'sweetroot', 'dewberry'] as Food[]) {
      const m = this.wants[f];
      m.count = wn[f];
      m.visible = wn[f] > 0;
      m.instanceMatrix.needsUpdate = true;
    }
    for (const k of KINDS) {
      const m = this.bodies[k];
      m.count = n[k];
      m.visible = n[k] > 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.eyes.count = ne;
    this.eyes.visible = ne > 0;
    this.eyes.instanceMatrix.needsUpdate = true;
    this.scowls.count = ns;
    this.scowls.visible = ns > 0;
    this.scowls.instanceMatrix.needsUpdate = true;

    // Loose things.
    const ic = { cloverhead: 0, sweetroot: 0, dewberry: 0, tuft: 0 };
    for (const it of s.items) {
      if (it.gone) continue;
      const key = isTuft(it.type) ? 'tuft' : (it.type as 'cloverhead' | 'sweetroot' | 'dewberry');
      if (ic[key] >= ITEM_CAP) continue;
      let scale = 1;
      if (it.drawn > 0) {
        const dist = Math.hypot(muzzle.x - it.x, muzzle.y - it.y, muzzle.z - it.z);
        scale = clamp((dist - 0.1) / 1.4, 0.2, 1);
      }
      const bob = it.rest && it.src >= 0 ? Math.sin(t * 1.3 + it.id) * 0.01 : 0;
      _e.set(it.drawn > 0 ? it.spin : it.rest ? 0 : Math.sin(it.spin) * 0.4, it.spin, 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_v.set(it.x, it.y + bob, it.z), _q, _s.set(scale, scale, scale));
      const m = this.items[key];
      m.setMatrixAt(ic[key], _m);
      if (key === 'tuft') m.setColorAt(ic[key], _c.setHex(KIND[TUFT_KIND[it.type as 'tuft-clover']].body).lerp(_v2c, 0.35));
      ic[key]++;
      if (it.drawn === 0 && (!it.rest || it.src >= 1000)) {
        const fl = phys.rest(it.x, it.z, true);
        this.shadow(it.x, fl, it.z, it.r * 0.8, it.y - fl);
      }
    }
    for (const k of Object.keys(ic) as (keyof typeof ic)[]) {
      const m = this.items[k];
      m.count = ic[k];
      m.visible = ic[k] > 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // Nettlebacks.
    let nn = 0;
    for (const q of s.nettles) {
      if (q.gone || nn >= 8) continue;
      const waddle = q.mode === 'roll' ? 0 : Math.sin(t * 9 + q.id) * 0.08 * Math.min(1, Math.hypot(q.vx, q.vz));
      const rollAxis = q.mode === 'roll' ? q.roll : 0;
      _e.set(rollAxis, q.mode === 'roll' ? Math.atan2(q.vx, q.vz) : q.yaw, waddle, 'YXZ');
      _q.setFromEuler(_e);
      const lift = q.mode === 'roll' ? 0.3 : 0;
      _m.compose(_v.set(q.x, q.y + lift, q.z), _q, _s.set(1, 1, 1));
      if (q.mode === 'roll') _m.multiply(_m2.makeTranslation(0, -0.2, 0));
      this.nBody.setMatrixAt(nn, _m);
      this.nEyes.setMatrixAt(nn, _m);
      // The eyes' glow, between them, a steady size on screen however far off.
      const far = Math.hypot(q.x - muzzle.x, q.y - muzzle.y, q.z - muzzle.z);
      const g = clamp(far * GLOW.per, GLOW.min, GLOW.max);
      this.nGlow.setMatrixAt(nn, _m2.makeTranslation(0, 0.235, 0.39).premultiply(_m).multiply(_m3.makeScale(g, g, g)));
      const b = 1 + q.bristle * 0.35;
      _m.multiply(_m2.makeScale(b, b, b));
      this.nSpikes.setMatrixAt(nn, _m);
      this.shadow(q.x, q.y, q.z, 0.45, lift);
      nn++;
    }
    for (const m of [this.nBody, this.nSpikes, this.nEyes]) {
      m.count = nn;
      m.visible = nn > 0;
      m.instanceMatrix.needsUpdate = true;
    }
    this.nEyes.visible = nn > 0 && this.nettleGlow;
    this.nGlow.count = nn;
    this.nGlow.visible = nn > 0 && this.nettleGlow;
    this.nGlow.instanceMatrix.needsUpdate = true;
    NETTLE_RIM.value.w = this.nettleGlow ? 0.85 : 0;
    this.shadows.count = this.shadowN;
    this.shadows.visible = this.shadowN > 0;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.shadowA.needsUpdate = true;
  }

  /** Item geometry key for a carried thing. */
  static itemKey(t: ItemType): 'cloverhead' | 'sweetroot' | 'dewberry' | 'tuft' {
    return isTuft(t) ? 'tuft' : (t as 'cloverhead' | 'sweetroot' | 'dewberry');
  }
}

const _v2c = new Color(1, 1, 1);
const WHITE = new Color(1, 1, 1);
/** The board's rare downies, tinted over their kind's colours: gold clover, rose ember, silver brook, pale thistle. */
const RARE_TINT: Record<DownyKind, Color> = {
  clover: new Color(1.38, 1.02, 0.6),
  ember: new Color(1.02, 0.74, 1.12),
  brook: new Color(1.72, 1.34, 1.04),
  thistle: new Color(1.25, 1.2, 1.15),
};
