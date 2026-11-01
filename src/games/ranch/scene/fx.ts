// Small effects, kept short and tied to meaning: puffs of air at the muzzle,
// the wind streaming into it while drawing, down popping off a downy, crumbs,
// splashes, building dust, steam on the ridge. Coins pop out of the Exchange
// crate (where coins mean something). Butterflies and birds by day.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector3,
  Euler,
  InstancedBufferAttribute,
  type Object3D,
} from 'three';
import { clamp } from '../noise';
import { FLOWERS, VENTS, heightAt } from '../world';
import { part, at } from './geo';
import { FOG_GLSL, U } from './mat';

const N = 900;

const P_VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec3 aSA;
uniform float uPx;
varying vec3 vC;
varying float vA;
varying float vK;
varying float vDepth;
void main() {
  vC = aColor;
  vA = aSA.y;
  vK = aSA.z;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vDepth = -mv.z;
  gl_PointSize = clamp( aSA.x * uPx / max( -mv.z, 0.1 ), 0.0, 220.0 );
  gl_Position = projectionMatrix * mv;
}
`;
const P_FRAG = /* glsl */ `
varying vec3 vC;
varying float vA;
varying float vK;
varying float vDepth;
${FOG_GLSL}
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length( q ) * 2.0;
  float a;
  if ( vK > 0.5 ) {
    // A seed of down: a small core and fine rays, not a glowing dot.
    float ang = atan( q.y, q.x ) + vK * 6.0;
    float rays = pow( abs( cos( ang * 3.0 ) ), 14.0 ) * smoothstep( 1.0, 0.25, d );
    a = clamp( smoothstep( 0.32, 0.12, d ) + rays * 0.7, 0.0, 1.0 ) * vA;
  } else a = smoothstep( 1.0, 0.35, d ) * vA;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( applyFog( vC, vDepth ), a );
  #include <colorspace_fragment>
}
`;

const _v = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();
const _c = new Color();

export class Fx {
  readonly points: Points;
  private pos = new Float32Array(N * 3);
  private col = new Float32Array(N * 3);
  private sa = new Float32Array(N * 3);
  private vel = new Float32Array(N * 3);
  private life = new Float32Array(N);
  private max = new Float32Array(N);
  private size0 = new Float32Array(N);
  private grow = new Float32Array(N);
  private grav = new Float32Array(N);
  private drag = new Float32Array(N);
  private alpha0 = new Float32Array(N);
  private next = 0;
  private px = { value: 600 };
  private posAttr: BufferAttribute;
  private colAttr: BufferAttribute;
  private saAttr: BufferAttribute;
  // Coins.
  readonly coins: InstancedMesh;
  private coinP = new Float32Array(32 * 3);
  private coinV = new Float32Array(32 * 3);
  private coinL = new Float32Array(32);
  private coinR = new Float32Array(32);
  // Butterflies and birds.
  readonly butterflies: InstancedMesh;
  readonly birds: InstancedMesh;
  private bfly: { x: number; y: number; z: number; hx: number; hz: number; ph: number; c: number }[] = [];
  private steamT = 0;
  reduced = false;

  constructor() {
    const g = new BufferGeometry();
    this.posAttr = new BufferAttribute(this.pos, 3);
    this.colAttr = new BufferAttribute(this.col, 3);
    this.saAttr = new BufferAttribute(this.sa, 3);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aColor', this.colAttr);
    g.setAttribute('aSA', this.saAttr);
    g.setDrawRange(0, N);
    this.points = new Points(
      g,
      new ShaderMaterial({
        vertexShader: P_VERT,
        fragmentShader: P_FRAG,
        uniforms: { uPx: this.px, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar },
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.name = 'fx';
    // Coins: little gold discs.
    const cg = part(at(new CylinderGeometry(0.07, 0.07, 0.016, 12), 0, 0, 0, Math.PI / 2), 0xe2b24a, { vary: 0.05 });
    this.coins = new InstancedMesh(cg, new MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2a08 }), 32);
    this.coins.count = 0;
    this.coins.frustumCulled = false;
    this.coins.name = 'coins';
    // Butterflies: two wings, flapping in the vertex shader.
    const wing = new BufferGeometry();
    const wp = new Float32Array([0, 0, 0, 0.09, 0.0, 0.05, 0.08, 0, -0.05, 0, 0, 0, -0.09, 0, 0.05, -0.08, 0, -0.05]);
    const ws = new Float32Array([0, 1, 1, 0, -1, -1]);
    wing.setAttribute('position', new BufferAttribute(wp, 3));
    wing.setAttribute('aSide', new BufferAttribute(ws, 1));
    const bm = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aSide;
        attribute vec3 instanceTint;
        uniform float uTime;
        varying vec3 vC;
        varying float vDepth;
        void main() {
          vC = instanceTint;
          vec3 p = position;
          float ph = instanceMatrix[3][0] * 3.1 + instanceMatrix[3][2] * 1.7;
          float flap = sin( uTime * 18.0 + ph ) * 0.9;
          p.y += abs( p.x ) * sin( flap ) * 1.2;
          p.x *= cos( flap ) * 0.6 + 0.4;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4( p, 1.0 );
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        varying float vDepth;
        ${FOG_GLSL}
        void main() {
          gl_FragColor = vec4( applyFog( vC, vDepth ), 1.0 );
          #include <colorspace_fragment>
        }`,
      uniforms: { uTime: U.uTime, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar },
      side: DoubleSide,
    });
    this.butterflies = new InstancedMesh(wing, bm, 14);
    const tints = new Float32Array(14 * 3);
    const cols = [0xf2b58a, 0xc8b0ec, 0xf6ead0, 0x9ab4ee, 0xf4c8d8];
    for (let i = 0; i < 14; i++) {
      _c.setHex(cols[i % cols.length]);
      tints.set([_c.r, _c.g, _c.b], i * 3);
      const f = FLOWERS[(i * 7) % FLOWERS.length];
      this.bfly.push({ x: f.x, y: heightAt(f.x, f.z) + 0.8, z: f.z, hx: f.x, hz: f.z, ph: i * 1.7, c: i });
    }
    wing.setAttribute('instanceTint', new InstancedBufferAttribute(tints, 3));
    this.butterflies.frustumCulled = false;
    this.butterflies.name = 'butterflies';
    // Birds: dark chevrons wheeling high over the meadow.
    const bg = new BufferGeometry();
    bg.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0.1, -0.7, 0.1, -0.2, -0.1, 0, -0.05, 0, 0, 0.1, 0.1, 0, -0.05, 0.7, 0.1, -0.2]), 3));
    bg.setAttribute('aSide', new BufferAttribute(new Float32Array([0, -1, 0, 0, 0, 1]), 1));
    const birdMat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aSide;
        uniform float uTime;
        varying float vDepth;
        void main() {
          vec3 p = position;
          float ph = instanceMatrix[3][0] * 0.7;
          p.y += abs( aSide ) * sin( uTime * 5.0 + ph ) * 0.35;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4( p, 1.0 );
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        varying float vDepth;
        void main() {
          vec3 c = mix( vec3( 0.28, 0.26, 0.36 ), uFogColor, clamp( vDepth / 220.0, 0.0, 0.7 ) );
          gl_FragColor = vec4( c, 1.0 );
          #include <colorspace_fragment>
        }`,
      uniforms: { uTime: U.uTime, uFogColor: U.uFogColor },
      side: DoubleSide,
    });
    this.birds = new InstancedMesh(bg, birdMat, 7);
    this.birds.frustumCulled = false;
    this.birds.name = 'birds';
  }

  objects(): Object3D[] {
    return [this.points, this.coins, this.butterflies, this.birds];
  }

  setPx(px: number): void {
    this.px.value = px;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, color: number | Color, alpha = 0.9, grav = 0, drag = 1.5, seed = false): void {
    const i = this.next;
    this.next = (this.next + 1) % N;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.max[i] = life;
    this.size0[i] = size;
    this.grow[i] = grow;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.alpha0[i] = alpha;
    this.sa[i * 3 + 2] = seed ? 1 + Math.random() : 0;
    if (typeof color === 'number') _c.setHex(color);
    else _c.copy(color);
    this.col[i * 3] = _c.r;
    this.col[i * 3 + 1] = _c.g;
    this.col[i * 3 + 2] = _c.b;
  }

  private rnd(a: number): number {
    return (Math.random() - 0.5) * 2 * a;
  }

  /**
   * A puff of air leaving the muzzle: a few small, faint wisps that thin out
   * fast, so the aim stays clear for the next blow (scripts/ranch-blow-cloud.mjs).
   */
  puff(x: number, y: number, z: number, dx: number, dy: number, dz: number, loaded: boolean): void {
    const n = this.reduced ? 3 : loaded ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const sp = 3 + Math.random() * (loaded ? 4 : 3);
      this.spawn(x, y, z, dx * sp + this.rnd(0.6), dy * sp + this.rnd(0.6) + 0.2, dz * sp + this.rnd(0.6), 0.22 + Math.random() * 0.16, 0.025, 0.12, 0xf8f4ec, 0.3, 0, 4.5);
    }
  }

  /** Wind streaming into the muzzle from the draw cone. */
  drawStream(dt: number, ex: number, ey: number, ez: number, dx: number, dy: number, dz: number, mx: number, my: number, mz: number, range: number): void {
    const rate = this.reduced ? 18 : 42;
    let n = rate * dt;
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n--;
      const d = 2 + Math.random() * (range - 2);
      const spread = Math.tan(0.4) * d;
      const px = ex + dx * d + this.rnd(spread);
      const py = ey + dy * d + this.rnd(spread * 0.7);
      const pz = ez + dz * d + this.rnd(spread);
      const tx = mx - px;
      const ty = my - py;
      const tz = mz - pz;
      const l = Math.hypot(tx, ty, tz) || 1;
      const sp = 9 + Math.random() * 4;
      const life = Math.min(0.9, l / sp);
      this.spawn(px, py, pz, (tx / l) * sp, (ty / l) * sp, (tz / l) * sp, life, 0.04, -0.025, 0xfffaf0, 0.65, 0, 0, true);
    }
  }

  /** Something entered the canister. */
  gulp(x: number, y: number, z: number, color: number): void {
    for (let i = 0; i < 4; i++) this.spawn(x, y, z, this.rnd(0.7), this.rnd(0.7), this.rnd(0.7), 0.3, 0.025, 0.02, i % 2 ? 0xfffaf0 : color, 0.8, 0, 3, true);
  }

  /** Down pops off a downy. */
  shed(x: number, y: number, z: number, color: number): void {
    const n = this.reduced ? 6 : 12;
    for (let i = 0; i < n; i++) this.spawn(x, y, z, this.rnd(1.6), 1 + Math.random() * 1.6, this.rnd(1.6), 0.8 + Math.random() * 0.5, 0.06, 0.02, i % 3 ? color : 0xfffaf0, 0.9, 1.0, 2.5, true);
  }

  /** Bigger moments: a first catch of a kind, a gate opening. */
  burst(x: number, y: number, z: number, color: number, n = 36, speed = 3): void {
    const k = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * 1.4;
      const sp = speed * (0.5 + Math.random());
      this.spawn(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1, Math.sin(a) * Math.cos(e) * sp, 1.2 + Math.random() * 0.9, 0.055, 0.02, i % 3 ? 0xfffaf0 : color, 0.9, 0.5, 1.4, true);
    }
  }

  crumbs(x: number, y: number, z: number, color: number): void {
    for (let i = 0; i < 6; i++) this.spawn(x, y + 0.3, z, this.rnd(1), 1 + Math.random(), this.rnd(1), 0.5, 0.035, 0, color, 0.9, 9, 0.5);
  }

  splash(x: number, y: number, z: number): void {
    const n = this.reduced ? 5 : 12;
    for (let i = 0; i < n; i++) this.spawn(x, y, z, this.rnd(1.5), 2 + Math.random() * 2, this.rnd(1.5), 0.6, 0.05, 0, 0xdcecf6, 0.8, 10, 0.3);
  }

  dust(x: number, y: number, z: number, r: number): void {
    const n = this.reduced ? 10 : 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(x + Math.cos(a) * r, y + 0.2, z + Math.sin(a) * r, Math.cos(a) * 1.5, 0.6 + Math.random() * 0.6, Math.sin(a) * 1.5, 0.9 + Math.random() * 0.4, 0.18, 0.4, 0xe6d6b4, 0.6, 0, 1.6);
    }
  }

  /**
   * A pest sent rolling: a few small, faint puffs at its feet that spread out and
   * thin fast, so it stays in sight (the sixth playtest's cream cloud, the
   * building dust, hid one after a single blow at 3.5 m).
   */
  scuff(x: number, y: number, z: number): void {
    const n = this.reduced ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.8;
      this.spawn(x + Math.cos(a) * 0.38, y + 0.05, z + Math.sin(a) * 0.38, Math.cos(a) * 1.3, 0.2 + Math.random() * 0.3, Math.sin(a) * 1.3, 0.3 + Math.random() * 0.15, 0.05, 0.1, 0xcdbf9f, 0.3, 0, 2.5);
    }
  }

  /** Coins hop out of the crate. */
  coinPop(x: number, y: number, z: number, n: number): void {
    for (let k = 0; k < n; k++) {
      let i = 0;
      for (; i < 32; i++) if (this.coinL[i] <= 0) break;
      if (i >= 32) i = Math.floor(Math.random() * 32);
      this.coinP.set([x, y + 0.2, z], i * 3);
      const a = Math.random() * Math.PI * 2;
      this.coinV.set([Math.cos(a) * 1.2, 3.6 + Math.random() * 1.4, Math.sin(a) * 1.2], i * 3);
      this.coinL[i] = 1.2;
      this.coinR[i] = Math.random() * 6;
    }
  }

  update(dt: number, t: number, cam: Vector3, night: number): void {
    // Steam plumes on the ridge.
    this.steamT -= dt;
    if (this.steamT <= 0) {
      this.steamT = this.reduced ? 0.22 : 0.09;
      for (const [vx, vz] of VENTS) {
        if (Math.hypot(vx - cam.x, vz - cam.z) > 120) continue;
        const y = heightAt(vx, vz);
        const surge = Math.sin(t * 0.7 + vx) > 0.2 ? 1.6 : 1;
        this.spawn(vx + this.rnd(0.3), y + 0.3, vz + this.rnd(0.3), U.uWind.value.x * 0.5 + this.rnd(0.2), 1.5 * surge + Math.random(), U.uWind.value.y * 0.5 + this.rnd(0.2), 2.6, 0.5, 1.4, night > 0.5 ? 0x8a8aa8 : 0xf2eee8, 0.5, -0.3, 0.6);
      }
    }
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) {
        this.sa[i * 3 + 1] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = clamp(this.life[i] / this.max[i], 0, 1);
      this.sa[i * 3] = Math.max(0, this.size0[i] + this.grow[i] * (1 - f));
      this.sa[i * 3 + 1] = this.alpha0[i] * Math.min(1, f * 3) * Math.min(1, (1 - f) * 8 + 0.2);
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.saAttr.needsUpdate = true;

    // Coins.
    let nc = 0;
    for (let i = 0; i < 32; i++) {
      if (this.coinL[i] <= 0) continue;
      this.coinL[i] -= dt;
      this.coinV[i * 3 + 1] -= 14 * dt;
      for (let a = 0; a < 3; a++) this.coinP[i * 3 + a] += this.coinV[i * 3 + a] * dt;
      const fl = heightAt(this.coinP[i * 3], this.coinP[i * 3 + 2]) + 0.05;
      if (this.coinP[i * 3 + 1] < fl) {
        this.coinP[i * 3 + 1] = fl;
        this.coinV[i * 3 + 1] = Math.abs(this.coinV[i * 3 + 1]) * 0.35;
        this.coinV[i * 3] *= 0.5;
        this.coinV[i * 3 + 2] *= 0.5;
      }
      this.coinR[i] += dt * 14;
      const s = Math.min(1, this.coinL[i] * 4);
      _e.set(0, this.coinR[i], 0.3);
      _q.setFromEuler(_e);
      _m.compose(_v.set(this.coinP[i * 3], this.coinP[i * 3 + 1], this.coinP[i * 3 + 2]), _q, _s.set(s, s, s));
      this.coins.setMatrixAt(nc++, _m);
    }
    this.coins.count = nc;
    this.coins.visible = nc > 0;
    this.coins.instanceMatrix.needsUpdate = true;

    // Butterflies flit round their flower patch by day.
    const day = night < 0.6;
    this.butterflies.visible = day;
    if (day) {
      this.bfly.forEach((b, i) => {
        const tt = t * 0.6 + b.ph;
        b.x = b.hx + Math.sin(tt * 0.9) * 2.4 + Math.sin(tt * 2.3) * 0.6;
        b.z = b.hz + Math.cos(tt * 0.7) * 2.4 + Math.cos(tt * 1.9) * 0.6;
        b.y = heightAt(b.x, b.z) + 0.6 + Math.sin(tt * 3.1) * 0.25;
        const yaw = Math.atan2(Math.cos(tt * 0.9) * 2.16, -Math.sin(tt * 0.7) * 1.68);
        _q.setFromAxisAngle(_v.set(0, 1, 0), yaw);
        _m.compose(_v.set(b.x, b.y, b.z), _q, _s.set(1.4, 1.4, 1.4));
        this.butterflies.setMatrixAt(i, _m);
      });
      this.butterflies.instanceMatrix.needsUpdate = true;
    }
    // Birds wheel in a loose flock high over the meadow.
    this.birds.visible = night < 0.7;
    if (this.birds.visible) {
      for (let i = 0; i < 7; i++) {
        const a = t * 0.08 + i * 0.35;
        const r = 40 + Math.sin(i * 2.1) * 8;
        const x = Math.cos(a) * r + Math.sin(t * 0.05) * 20;
        const z = Math.sin(a) * r * 0.7 - 15;
        const y = 38 + Math.sin(i * 1.3 + t * 0.3) * 3;
        _q.setFromAxisAngle(_v.set(0, 1, 0), -a);
        _m.compose(_v.set(x, y, z), _q, _s.set(1.6, 1.6, 1.6));
        this.birds.setMatrixAt(i, _m);
      }
      this.birds.instanceMatrix.needsUpdate = true;
    }
  }
}

