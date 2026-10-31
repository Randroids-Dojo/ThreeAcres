// After dusk: warm glows at every window and lantern, pools of lamplight on
// the ground beneath them, and soft wisps of mist drifting around the base of
// the slab at any hour.

import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Points,
  ShaderMaterial,
} from 'three';
import { U } from './materials';
import type { Lamp } from './props';
import { rng } from './util';

export interface Glow {
  group: Group;
  update(now: number, glow: number, pixelScale: number, mistLight: number): void;
  dispose(): void;
}

export function buildGlow(lamps: Lamp[], W: number, H: number, wisps: boolean): Glow {
  const group = new Group();
  // Glow sprites.
  const pg = new BufferGeometry();
  const pos: number[] = [];
  const size: number[] = [];
  for (const l of lamps) {
    pos.push(l.x, l.y, l.z);
    size.push(l.size);
  }
  pg.setAttribute('position', new Float32BufferAttribute(pos, 3));
  pg.setAttribute('aSize', new Float32BufferAttribute(size, 1));
  const pMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uGlow: { value: 0 }, uPx: { value: 400 }, uTime: U.uTime },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uPx;
      uniform float uTime;
      varying float vF;
      void main() {
        vec4 mv = viewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vF = 0.9 + 0.1 * sin(uTime * 7.0 + position.x * 13.0) * sin(uTime * 3.1 + position.z * 7.0);
        gl_PointSize = clamp(aSize * uPx / max(-mv.z, 0.05), 0.0, 240.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      varying float vF;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-r * r * 5.0) * 0.9 + exp(-r * r * 40.0) * 0.6;
        a *= (1.0 - smoothstep(0.85, 1.0, r));
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.36) * a * uGlow * vF, 1.0);
      }
    `,
  });
  const sprites = new Points(pg, pMat);
  sprites.frustumCulled = false;
  sprites.renderOrder = 12;
  group.add(sprites);

  // Ground pools.
  const qp: number[] = [];
  const quv: number[] = [];
  for (const l of lamps) {
    if (l.pool <= 0) continue;
    const r = l.pool;
    const x0 = l.x - r;
    const x1 = l.x + r;
    const z0 = l.z - r;
    const z1 = l.z + r;
    const y = 0.07;
    qp.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    quv.push(-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1);
  }
  const qg = new BufferGeometry();
  qg.setAttribute('position', new Float32BufferAttribute(qp, 3));
  qg.setAttribute('uv', new Float32BufferAttribute(quv, 2));
  const qMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uGlow: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      varying vec2 vUv;
      void main() {
        float r2 = dot(vUv, vUv);
        float a = clamp(1.0 - r2, 0.0, 1.0);
        a = a * a * a;
        gl_FragColor = vec4(vec3(1.0, 0.66, 0.3) * a * 0.42 * uGlow, 1.0);
      }
    `,
  });
  const pools = new Mesh(qg, qMat);
  pools.frustumCulled = false;
  pools.renderOrder = 11;
  group.add(pools);

  // Mist wisps around the slab: camera-facing soft blobs below the rim.
  let wispMesh: Mesh | null = null;
  let wMat: ShaderMaterial | null = null;
  if (wisps) {
    const r = rng(303);
    const n = 14;
    const base = new BufferGeometry();
    base.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    const ig = new InstancedBufferGeometry();
    ig.setAttribute('position', base.getAttribute('position'));
    const off: number[] = [];
    const per = 2 * (W + H);
    for (let i = 0; i < n; i++) {
      // Around the perimeter, a little outside it.
      const s = (i / n) * per + r() * 2;
      let x: number;
      let z: number;
      if (s < W) {
        x = s;
        z = -0.6;
      } else if (s < W + H) {
        x = W + 0.6;
        z = s - W;
      } else if (s < 2 * W + H) {
        x = W - (s - W - H);
        z = H + 0.7;
      } else {
        x = -0.6;
        z = H - (s - 2 * W - H);
      }
      off.push(x, -1.2 - r() * 1.6, z, 2.2 + r() * 2.2);
    }
    ig.setAttribute('aOff', new InstancedBufferAttribute(new Float32Array(off), 4));
    ig.instanceCount = n;
    wMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: U.uTime, uMistColor: U.uMistColor, uLight: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec4 aOff;
        uniform float uTime;
        varying vec2 vP;
        varying float vSeed;
        void main() {
          vP = position.xy;
          vSeed = aOff.x * 0.37 + aOff.z * 0.61;
          vec3 c = aOff.xyz + vec3(sin(uTime * 0.07 + vSeed) * 0.8, sin(uTime * 0.11 + vSeed * 2.0) * 0.15, 0.0);
          vec4 mv = viewMatrix * vec4(c, 1.0);
          mv.xy += position.xy * aOff.w * vec2(1.6, 0.7);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uMistColor;
        uniform float uLight;
        varying vec2 vP;
        varying float vSeed;
        void main() {
          float r2 = dot(vP, vP);
          float a = clamp(1.0 - r2, 0.0, 1.0);
          a = a * a * (0.75 + 0.25 * sin(vP.x * 3.0 + vSeed * 5.0));
          gl_FragColor = vec4(mix(uMistColor, vec3(1.0), 0.18 * uLight), a * 0.55);
        }
      `,
    });
    wispMesh = new Mesh(ig, wMat);
    wispMesh.frustumCulled = false;
    wispMesh.renderOrder = 5;
    group.add(wispMesh);
  }

  return {
    group,
    update(_now, glow, px, mistLight) {
      pMat.uniforms.uGlow.value = glow;
      pMat.uniforms.uPx.value = px;
      qMat.uniforms.uGlow.value = glow;
      sprites.visible = pools.visible = glow > 0.01;
      if (wMat) wMat.uniforms.uLight.value = mistLight;
    },
    dispose() {
      pg.dispose();
      pMat.dispose();
      qg.dispose();
      qMat.dispose();
      wispMesh?.geometry.dispose();
      wMat?.dispose();
    },
  };
}

