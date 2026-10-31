// Weather on the diorama. Rain streaks and snowflakes, drifting leaves or
// blossom, summer fireflies, ripples in puddles and the pond, and clouds that
// only cast shadows (they live on a layer the main camera does not draw).
// Every falling thing is moved by the GPU from a fixed seed.

import {
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { Season, TileKind, Weather } from '../sim/types';
import { GeoBuilder, ico } from './builder';
import { U } from './materials';
import { POND } from './terrain';
import { at, col, rng } from './util';

export const CLOUD_LAYER = 1;

/** 0 rain, 1 snow, 2 leaves or petals, 3 fireflies. */
function precipMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Streaks are built along the fall direction, which can mirror the quad.
    side: DoubleSide,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    uniforms: {
      uTime: U.uTime,
      uWind: U.uWind,
      uMode: { value: 0 },
      uCenter: { value: new Vector3(10, 0, 7.5) },
      uBox: { value: new Vector3(12, 7, 9) },
      uColA: { value: new Vector3(0.85, 0.9, 1) },
      uColB: { value: new Vector3(0.85, 0.9, 1) },
      uAlpha: { value: 0.4 },
      uLight: { value: 1 },
      uSpeed: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute vec4 aSeed;
      uniform float uTime;
      uniform vec2 uWind;
      uniform float uMode;
      uniform vec3 uCenter;
      uniform vec3 uBox;
      uniform float uSpeed;
      varying vec2 vC;
      varying float vA;
      varying float vPick;
      void main() {
        float H = uBox.y;
        float fall = uMode < 0.5 ? mix(9.0, 12.5, aSeed.y) : uMode < 1.5 ? mix(0.7, 1.3, aSeed.y) : uMode < 2.5 ? mix(0.35, 0.7, aSeed.y) : 0.0;
        fall *= uSpeed;
        float y = H - mod(aSeed.z * H + uTime * fall, H);
        vec3 p = vec3(uCenter.x + (aSeed.x - 0.5) * 2.0 * uBox.x, y, uCenter.z + (aSeed.w - 0.5) * 2.0 * uBox.z);
        float drift = uMode < 0.5 ? 0.09 : 0.35;
        p.xz += uWind * (H - y) * drift;
        if (uMode > 0.5 && uMode < 2.5) {
          p.x += sin(uTime * 1.3 + aSeed.x * 40.0) * 0.3;
          p.z += cos(uTime * 1.1 + aSeed.w * 30.0) * 0.2;
        }
        if (uMode > 2.5) {
          // Fireflies hover low and wander.
          p.y = 0.25 + aSeed.y * 0.8 + sin(uTime * 0.9 + aSeed.z * 20.0) * 0.15;
          p.x += sin(uTime * 0.37 + aSeed.y * 30.0) * 0.6;
          p.z += cos(uTime * 0.29 + aSeed.z * 30.0) * 0.5;
        }
        vec4 mv = viewMatrix * vec4(p, 1.0);
        if (uMode < 0.5) {
          vec3 vel = vec3(uWind.x * drift * fall, -fall, uWind.y * drift * fall);
          vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
          vec2 d = vv.xy;
          float l = length(d);
          d = l > 1e-4 ? d / l : vec2(0.0, -1.0);
          vec2 n = vec2(-d.y, d.x);
          // At least a pixel and a half wide, whatever the distance.
          float wpx = max(0.02, -mv.z * 0.0022);
          mv.xy += d * (corner.y - 0.5) * 0.45 + n * corner.x * wpx;
        } else {
          float s = uMode < 1.5 ? 0.045 : uMode < 2.5 ? 0.06 : 0.035;
          mv.xy += corner * s * 2.0;
        }
        gl_Position = projectionMatrix * mv;
        vC = corner;
        float fade = smoothstep(0.0, 0.5, y) * (1.0 - smoothstep(H - 1.0, H, y));
        vA = uMode > 2.5 ? 0.5 + 0.5 * sin(uTime * 2.3 + aSeed.x * 50.0) : fade;
        vPick = aSeed.y;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uMode;
      uniform vec3 uColA;
      uniform vec3 uColB;
      uniform float uAlpha;
      uniform float uLight;
      varying vec2 vC;
      varying float vA;
      varying float vPick;
      void main() {
        float a;
        if (uMode < 0.5) a = (1.0 - smoothstep(0.25, 0.5, abs(vC.x))) * smoothstep(0.0, 0.35, vC.y);
        else if (uMode < 1.5) a = 1.0 - smoothstep(0.25, 0.5, length(vC));
        else if (uMode < 2.5) a = 1.0 - smoothstep(0.3, 0.5, length(vC * vec2(1.0, 1.8)));
        else { float r = length(vC) * 2.0; a = exp(-r * r * 6.0); }
        a = clamp(a * vA * uAlpha, 0.0, 1.0);
        if (a < 0.004) discard;
        vec3 c = mix(uColA, uColB, step(0.5, vPick));
        float add = uMode > 2.5 ? 1.0 : 0.0;
        c *= add > 0.5 ? 1.0 : mix(1.0, uLight, uMode < 0.5 ? 0.35 : 1.0);
        gl_FragColor = vec4(c * a, a * (1.0 - add));
      }
    `,
  });
}

function precipGeometry(n: number, seed: number): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setAttribute('corner', new Float32BufferAttribute([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 0, 0.5, 1, -0.5, 1], 2));
  // A dummy position attribute so three knows the vertex count.
  g.setAttribute('position', new Float32BufferAttribute(new Float32Array(18), 3));
  const r = rng(seed);
  const s = new Float32Array(n * 4);
  for (let i = 0; i < s.length; i++) s[i] = r();
  g.setAttribute('aSeed', new InstancedBufferAttribute(s, 4));
  g.instanceCount = n;
  return g;
}

export interface WeatherFx {
  group: Group;
  clouds: Group;
  update(o: {
    now: number;
    dt: number;
    weather: Weather;
    season: Season;
    hour: number;
    daylight: number;
    center: Vector3;
    halfW: number;
    halfD: number;
    high: boolean;
    reduced: boolean;
    light: number;
  }): void;
  dispose(): void;
}

export function buildWeather(tiles: readonly TileKind[], W: number, H: number): WeatherFx {
  const group = new Group();
  const MAX_FALL = 2600;
  const MAX_DRIFT = 260;
  const fallMat = precipMaterial();
  const fallGeo = precipGeometry(MAX_FALL, 17);
  const fall = new Mesh(fallGeo, fallMat);
  fall.frustumCulled = false;
  fall.renderOrder = 14;
  const driftMat = precipMaterial();
  const driftGeo = precipGeometry(MAX_DRIFT, 29);
  const drift = new Mesh(driftGeo, driftMat);
  drift.frustumCulled = false;
  drift.renderOrder = 13;
  group.add(fall, drift);

  // Ripples: rings at fixed spots on the ground and in the pond.
  const ringGeo = new PlaneGeometry(0.36, 0.36).rotateX(-Math.PI / 2);
  const ringSeed = new InstancedBufferAttribute(new Float32Array(400), 1);
  ringGeo.setAttribute('aSeed', ringSeed);
  const ringMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: U.uTime, uAmt: { value: 0 }, uLight: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAmt;
      uniform float uLight;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        float ph = fract(uTime * (0.9 + vSeed * 0.6) + vSeed * 7.0);
        float r = length(vUv - 0.5) * 2.0;
        float ring = 1.0 - smoothstep(0.0, 0.09, abs(r - ph));
        float a = ring * (1.0 - ph) * uAmt;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vec3(0.86, 0.92, 1.0) * uLight, a * 0.7);
      }
    `,
  });
  const rings = new InstancedMesh(ringGeo, ringMat, 400);
  rings.frustumCulled = false;
  rings.renderOrder = 6;
  {
    const r = rng(71);
    const m = new Matrix4();
    let k = 0;
    for (let i = 0; i < 340 && k < 400; i++) {
      const x = r() * W;
      const z = r() * H;
      const t = tiles[Math.floor(z) * W + Math.floor(x)];
      if (t === 'wood' || t === 'water') continue;
      m.makeTranslation(x, t === 'field' ? 0.07 : 0.03, z);
      rings.setMatrixAt(k, m);
      ringSeed.setX(k, r());
      k++;
    }
    for (let i = 0; i < 26 && k < 400; i++) {
      const x = POND.cx + (r() - 0.5) * POND.hx * 1.5;
      const z = POND.cz + (r() - 0.5) * POND.hz * 1.5;
      m.makeScale(1.6, 1, 1.6).setPosition(x, -0.06, z);
      rings.setMatrixAt(k, m);
      ringSeed.setX(k, r());
      k++;
    }
    rings.count = k;
  }
  group.add(rings);

  // Shadow-only clouds.
  const clouds = new Group();
  const cb = new GeoBuilder();
  const cr = rng(5);
  const span = W + 24;
  for (let i = 0; i < 9; i++) {
    const cx = (i + cr() * 0.6) * (span / 9);
    const cz = cr() * (H + 10) - 5;
    const n = 4 + Math.floor(cr() * 4);
    for (let k = 0; k < n; k++) {
      const rad = 0.9 + cr() * 1.3;
      cb.add(ico(1, 1), at(cx + (cr() - 0.5) * 3.2, 5.5 + cr() * 0.8, cz + (cr() - 0.5) * 2.2, 0, 0, 0, rad, rad * 0.45, rad * 0.8), col('#ffffff'));
    }
  }
  const cloudMat = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const cloudGeo = cb.build();
  // Two copies a span apart, so the field wraps without a jump.
  const cloudMesh = new Group();
  for (const off of [0, -span]) {
    const m = new Mesh(cloudGeo, cloudMat);
    m.castShadow = true;
    m.layers.set(CLOUD_LAYER);
    m.frustumCulled = false;
    m.position.x = off;
    cloudMesh.add(m);
  }
  clouds.add(cloudMesh);
  let cloudX = 0;

  return {
    group,
    clouds,
    update(o) {
      const { now, weather, season } = o;
      const wet = weather === 'rain' || weather === 'storm';
      const winter = season === 3;
      // Falling: rain or snow.
      const box = fallMat.uniforms.uBox.value as Vector3;
      box.set(o.halfW + 1.5, weather === 'storm' ? 7 : 6, o.halfD + 2.5);
      (fallMat.uniforms.uCenter.value as Vector3).copy(o.center);
      if (wet) {
        const area = box.x * box.z * 4;
        const density = (winter ? 2.2 : weather === 'storm' ? 4.6 : 2.6) * (o.high ? 1 : 0.55) * (o.reduced ? 0.6 : 1);
        fallGeo.instanceCount = Math.min(MAX_FALL, Math.round(area * density));
        fallMat.uniforms.uMode.value = winter ? 1 : 0;
        fallMat.uniforms.uAlpha.value = winter ? 0.95 : weather === 'storm' ? 0.5 : 0.4;
        (fallMat.uniforms.uColA.value as Vector3).set(0.86, 0.9, 0.98);
        (fallMat.uniforms.uColB.value as Vector3).set(winter ? 1 : 0.78, winter ? 1 : 0.84, winter ? 1 : 0.95);
        fallMat.uniforms.uLight.value = o.light;
        fallMat.uniforms.uSpeed.value = o.reduced ? 0.7 : 1;
        fall.visible = true;
      } else fall.visible = false;

      // Drifting: blossom in spring, leaves in autumn, fireflies on summer nights.
      const dbox = driftMat.uniforms.uBox.value as Vector3;
      dbox.set(o.halfW + 1, 3.2, o.halfD + 1.5);
      (driftMat.uniforms.uCenter.value as Vector3).copy(o.center);
      driftMat.uniforms.uLight.value = o.light;
      const night = o.daylight < 0.45;
      if (o.high && (season === 0 || season === 2) && !(wet && season === 0) && o.daylight > 0.3) {
        driftMat.uniforms.uMode.value = 2;
        driftGeo.instanceCount = Math.round((season === 2 ? 90 : 50) * (o.reduced ? 0.5 : 1));
        driftMat.uniforms.uAlpha.value = 0.95;
        const a = driftMat.uniforms.uColA.value as Vector3;
        const b = driftMat.uniforms.uColB.value as Vector3;
        if (season === 2) {
          a.set(0.86, 0.5, 0.17);
          b.set(0.77, 0.32, 0.18);
        } else {
          a.set(0.97, 0.78, 0.84);
          b.set(1, 0.95, 0.96);
        }
        drift.visible = true;
      } else if (o.high && night && (season === 1 || season === 0) && !wet) {
        driftMat.uniforms.uMode.value = 3;
        driftGeo.instanceCount = 70;
        driftMat.uniforms.uAlpha.value = 0.9 * Math.min(1, (0.45 - o.daylight) * 6);
        (driftMat.uniforms.uColA.value as Vector3).set(0.95, 0.95, 0.45);
        (driftMat.uniforms.uColB.value as Vector3).set(0.75, 1, 0.45);
        drift.visible = true;
      } else drift.visible = false;

      // Ripples while it rains (not snow).
      const amt = wet && !winter ? (weather === 'storm' ? 1 : 0.75) : 0;
      ringMat.uniforms.uAmt.value = amt;
      ringMat.uniforms.uLight.value = o.light;
      rings.visible = amt > 0;

      // Clouds drift with the wind and wrap round; how many depends on the weather.
      cloudX = (cloudX + o.dt * (weather === 'storm' ? 1.4 : 0.45)) % span;
      cloudMesh.position.x = cloudX - 12;
      cloudMesh.position.z = Math.sin(now * 0.01) * 2;
      cloudMesh.visible = weather === 'cloud' || weather === 'sun' || (o.high && wet);
      cloudMesh.scale.set(1, 1, weather === 'sun' ? 0.6 : 1);
    },
    dispose() {
      fallGeo.dispose();
      fallMat.dispose();
      driftGeo.dispose();
      driftMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
    },
  };
}

