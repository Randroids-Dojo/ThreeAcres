// Event effects. One GPU particle system draws every puff, splash, seed,
// feather, leaf and glint: the CPU writes a particle once when it is born and
// the vertex shader moves it, so a burst costs nothing per frame. Tile
// flashes (deny, crow warning) are a small instanced pool.

import {
  BufferGeometry,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { U } from './materials';

export const Kind = { Disc: 0, Spark: 1, Chunk: 2, Puff: 3, Leaf: 4 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

const _c = new Color();

/** Display-space colour from hex, for shaders that write straight to the screen. */
export function disp(hex: string, out = new Vector3()): Vector3 {
  _c.set(hex).convertLinearToSRGB();
  return out.set(_c.r, _c.g, _c.b);
}

export interface Particles {
  points: Points;
  /** Spawns one particle. Colour is display space. */
  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number,
    r: number, g: number, b: number, a: number,
    kind: Kind, gravity?: number, drag?: number, additive?: boolean,
  ): void;
  /** Advances the shared clock and uploads what was written this frame. */
  update(now: number, pixelScale: number, light: number): void;
  readonly now: number;
  capacity: number;
  dispose(): void;
}

export function makeParticles(capacity: number): Particles {
  const g = new BufferGeometry();
  const pos = new Float32BufferAttribute(new Float32Array(capacity * 3), 3);
  const vel = new Float32BufferAttribute(new Float32Array(capacity * 3), 3);
  const tim = new Float32BufferAttribute(new Float32Array(capacity * 4).fill(-1e6), 4);
  const colr = new Float32BufferAttribute(new Float32Array(capacity * 4), 4);
  const misc = new Float32BufferAttribute(new Float32Array(capacity * 4), 4);
  for (const a of [pos, vel, tim, colr, misc]) a.setUsage(DynamicDrawUsage);
  g.setAttribute('position', pos);
  g.setAttribute('aVel', vel);
  g.setAttribute('aTime', tim);
  g.setAttribute('aCol', colr);
  g.setAttribute('aMisc', misc);
  g.boundingSphere = null;
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    uniforms: { uNow: { value: 0 }, uPx: { value: 400 }, uLight: { value: 1 }, uWind: U.uWind },
    vertexShader: /* glsl */ `
      attribute vec3 aVel;
      attribute vec4 aTime;
      attribute vec4 aCol;
      attribute vec4 aMisc;
      uniform float uNow;
      uniform float uPx;
      uniform vec2 uWind;
      varying vec4 vCol;
      varying float vKind;
      varying float vAdd;
      varying float vSpin;
      void main() {
        float age = uNow - aTime.x;
        float life = max(aTime.y, 0.001);
        if (age < 0.0 || age > life) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          vCol = vec4(0.0);
          return;
        }
        float k = aMisc.z;
        float tt = k > 0.001 ? (1.0 - exp(-k * age)) / k : age;
        vec3 p = position + aVel * tt;
        p.y -= 0.5 * aTime.w * age * age;
        float kind = aMisc.x;
        if (kind > 3.5) {
          // Leaves and feathers flutter and drift with the wind.
          p.x += sin(age * 5.0 + position.x * 7.0) * 0.12 + uWind.x * age * 0.25;
          p.z += cos(age * 4.0 + position.z * 5.0) * 0.08 + uWind.y * age * 0.25;
        }
        p.y = max(p.y, 0.015);
        float f = age / life;
        float size = aTime.z;
        if (kind > 2.5 && kind < 3.5) size *= 0.55 + f * 1.1;
        else size *= 1.0 - f * 0.35;
        float a = aCol.a * smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.55, 1.0, f));
        vCol = vec4(aCol.rgb, a);
        vKind = kind;
        vAdd = aMisc.y;
        vSpin = age * 6.0 + position.x * 13.0;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(size * uPx / max(-mv.z, 0.05), 0.0, 220.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLight;
      varying vec4 vCol;
      varying float vKind;
      varying float vAdd;
      varying float vSpin;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        float a;
        if (vKind < 0.5) a = 1.0 - smoothstep(0.65, 1.0, r);
        else if (vKind < 1.5) {
          float s = sin(vSpin) * 0.5;
          vec2 q = vec2(c.x * cos(s) - c.y * sin(s), c.x * sin(s) + c.y * cos(s));
          float cross = max(1.0 - smoothstep(0.0, 0.09, abs(q.x)) , 1.0 - smoothstep(0.0, 0.09, abs(q.y)));
          a = cross * (1.0 - smoothstep(0.3, 1.0, r)) + (1.0 - smoothstep(0.0, 0.35, r)) * 0.8;
        } else if (vKind < 2.5) a = 1.0 - smoothstep(0.55, 0.75, max(abs(c.x), abs(c.y)) * 2.0);
        else if (vKind < 3.5) { a = clamp(1.0 - r, 0.0, 1.0); a *= a * 0.9; }
        else {
          float s = vSpin;
          vec2 q = vec2(c.x * cos(s) - c.y * sin(s), c.x * sin(s) + c.y * cos(s));
          a = 1.0 - smoothstep(0.8, 1.0, length(q * vec2(2.0, 4.2)));
        }
        a = clamp(a, 0.0, 1.0) * vCol.a;
        if (a < 0.004) discard;
        vec3 col = vCol.rgb * (vAdd > 0.5 ? 1.0 : uLight);
        gl_FragColor = vec4(col * a, a * (1.0 - vAdd));
      }
    `,
  });
  const points = new Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  let head = 0;
  let lo = capacity;
  let hi = -1;
  let now = 0;
  const self: Particles = {
    points,
    capacity,
    get now() {
      return now;
    },
    spawn(x, y, z, vx, vy, vz, life, size, r, gg, b, a, kind, gravity = 0, drag = 0, additive = false) {
      const i = head;
      head = (head + 1) % capacity;
      pos.setXYZ(i, x, y, z);
      vel.setXYZ(i, vx, vy, vz);
      tim.setXYZW(i, now, life, size, gravity);
      colr.setXYZW(i, r, gg, b, a);
      misc.setXYZW(i, kind, additive ? 1 : 0, drag, 0);
      if (i < lo) lo = i;
      if (i > hi) hi = i;
    },
    update(t, px, light) {
      now = t;
      mat.uniforms.uNow.value = t;
      mat.uniforms.uPx.value = px;
      mat.uniforms.uLight.value = light;
      if (hi >= lo) {
        for (const [a, n] of [
          [pos, 3],
          [vel, 3],
          [tim, 4],
          [colr, 4],
          [misc, 4],
        ] as const) {
          a.clearUpdateRanges();
          a.addUpdateRange(lo * n, (hi - lo + 1) * n);
          a.needsUpdate = true;
        }
        lo = capacity;
        hi = -1;
      }
    },
    dispose() {
      g.dispose();
      mat.dispose();
    },
  };
  return self;
}

/** Flat coloured flashes on tiles: deny, crow warning, landing. */
export interface TileFlashes {
  mesh: InstancedMesh;
  flash(x: number, y: number, hex: string, dur: number, strength: number): void;
  update(now: number): void;
}

export function makeTileFlashes(n: number): TileFlashes {
  const geo = new PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
  const col = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
  col.setUsage(DynamicDrawUsage);
  geo.setAttribute('aCol', col);
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      attribute vec4 aCol;
      varying vec4 vCol;
      varying vec2 vUv;
      void main() {
        vCol = aCol;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec4 vCol;
      varying vec2 vUv;
      void main() {
        vec2 q = abs(vUv - 0.5) * 2.0;
        float edge = max(q.x, q.y);
        float a = vCol.a * (0.45 + 0.55 * smoothstep(0.55, 0.95, edge)) * (1.0 - smoothstep(0.96, 1.0, edge));
        gl_FragColor = vec4(vCol.rgb, a);
      }
    `,
  });
  const mesh = new InstancedMesh(geo, mat, n);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 28;
  mesh.count = 0;
  const slots: { x: number; y: number; t0: number; dur: number; r: number; g: number; b: number; s: number }[] = [];
  for (let i = 0; i < n; i++) slots.push({ x: 0, y: 0, t0: -1e6, dur: 0, r: 0, g: 0, b: 0, s: 0 });
  let nowT = 0;
  let next = 0;
  const m = new Matrix4();
  const v = new Vector3();
  return {
    mesh,
    flash(x, y, hex, dur, strength) {
      const s = slots[next];
      next = (next + 1) % n;
      disp(hex, v);
      s.x = x;
      s.y = y;
      s.t0 = nowT;
      s.dur = dur;
      s.r = v.x;
      s.g = v.y;
      s.b = v.z;
      s.s = strength;
    },
    update(now) {
      nowT = now;
      let k = 0;
      for (const s of slots) {
        const t = (now - s.t0) / s.dur;
        if (t < 0 || t >= 1) continue;
        m.makeTranslation(s.x + 0.5, 0.09, s.y + 0.5);
        mesh.setMatrixAt(k, m);
        // Two quick pulses.
        const a = s.s * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2.5)), 0.6) * (1 - t);
        col.setXYZW(k, s.r, s.g, s.b, a);
        k++;
      }
      mesh.count = k;
      mesh.visible = k > 0;
      if (k > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        col.needsUpdate = true;
      }
    },
  };
}

