// Full-screen layers: the misty backdrop behind the diorama (with lightning
// in the distance during storms) and the overlay in front of everything (the
// night transition, flashes, a soft vignette, heat shimmer).

import { BufferGeometry, CustomBlending, Float32BufferAttribute, Mesh, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';

function fullscreenTriangle(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.boundingSphere = null;
  return g;
}

export interface Screen {
  backdrop: Mesh;
  overlay: Mesh;
  bu: {
    uTop: { value: Vector3 };
    uBottom: { value: Vector3 };
    uRes: { value: Vector2 };
    uBolt: { value: number };
    uBoltX: { value: number };
    uSeed: { value: number };
    uTime: { value: number };
  };
  ou: {
    uRes: { value: Vector2 };
    uNight: { value: number };
    uFlash: { value: Vector4 };
    uTint: { value: Vector4 };
    uVig: { value: number };
    uHeat: { value: number };
    uTime: { value: number };
  };
  dispose(): void;
}

export function makeScreen(): Screen {
  const tri = fullscreenTriangle();
  const bu = {
    uTop: { value: new Vector3(0.8, 0.85, 0.9) },
    uBottom: { value: new Vector3(0.95, 0.94, 0.9) },
    uRes: { value: new Vector2(1, 1) },
    uBolt: { value: 0 },
    uBoltX: { value: 0.5 },
    uSeed: { value: 0 },
    uTime: { value: 0 },
  };
  const backMat = new ShaderMaterial({
    uniforms: bu,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      void main() { gl_Position = vec4(position.xy, 0.9999, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec2 uRes;
      uniform float uBolt;
      uniform float uBoltX;
      uniform float uSeed;
      uniform float uTime;
      float h1(float n) { vec2 p = fract(vec2(n * 0.1031, uSeed * 0.11369 + 0.3)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        float t = smoothstep(0.0, 1.0, uv.y);
        vec3 c = mix(uBottom, uTop, t * t * (3.0 - 2.0 * t));
        // A soft glow where the diorama sits, as if the mist were lit from inside.
        vec2 q = (uv - vec2(0.5, 0.46)) * vec2(uRes.x / uRes.y, 1.0);
        float glow = exp(-dot(q, q) * 2.2);
        c = mix(c, mix(uBottom, vec3(1.0), 0.35), glow * 0.45);
        // Slow drifting bands of mist.
        float band = sin(uv.y * 9.0 + sin(uv.x * 3.0 + uTime * 0.05) * 1.5 + uTime * 0.03) * 0.5 + 0.5;
        c = mix(c, uBottom, band * 0.08);
        if (uBolt > 0.001) {
          float y = uv.y * 12.0;
          float i = floor(y);
          float f = fract(y);
          float x0 = (h1(i) - 0.5) * 0.06;
          float x1 = (h1(i + 1.0) - 0.5) * 0.06;
          float bx = uBoltX + mix(x0, x1, f);
          float d = abs(uv.x - bx) * uRes.x / uRes.y;
          float core = exp(-d * 420.0) + exp(-d * 60.0) * 0.35;
          c += vec3(0.85, 0.9, 1.0) * core * uBolt * smoothstep(0.35, 0.75, uv.y);
          c += vec3(0.6, 0.65, 0.8) * uBolt * 0.25 * smoothstep(0.3, 1.0, uv.y);
        }
        // Dither so the gradient never bands (a sin-free hash, safe under fast math).
        vec3 p3 = fract(vec3(gl_FragCoord.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        float n = fract((p3.x + p3.y) * p3.z);
        c += (n - 0.5) / 255.0;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }
    `,
  });
  const backdrop = new Mesh(tri, backMat);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1000;
  backdrop.name = 'backdrop';

  const ou = {
    uRes: { value: new Vector2(1, 1) },
    uNight: { value: 0 },
    uFlash: { value: new Vector4(1, 1, 1, 0) },
    uTint: { value: new Vector4(1, 1, 1, 0) },
    uVig: { value: 0.22 },
    uHeat: { value: 0 },
    uTime: { value: 0 },
  };
  const overMat = new ShaderMaterial({
    uniforms: ou,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec2 uRes;
      uniform float uNight;
      uniform vec4 uFlash;
      uniform vec4 uTint;
      uniform float uVig;
      uniform float uHeat;
      uniform float uTime;
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 q = (uv - 0.5) * vec2(1.0, 1.1);
        float vig = smoothstep(0.42, 1.0, length(q) * 1.25) * uVig;
        float dark = clamp(uNight, 0.0, 1.0);
        float ta = clamp(uTint.a, 0.0, 1.0);
        vec3 rgb = vec3(0.008, 0.01, 0.03) * dark;
        rgb += uTint.rgb * ta * (1.0 - dark);
        float a = 1.0 - (1.0 - dark) * (1.0 - ta) * (1.0 - vig);
        rgb += vec3(0.03, 0.03, 0.06) * vig * (1.0 - dark);
        // Additive light: flashes and heat shimmer.
        rgb += uFlash.rgb * clamp(uFlash.a, 0.0, 1.0) * (1.0 - dark * 0.7);
        if (uHeat > 0.001) {
          float w = sin(uv.y * 70.0 + uTime * 2.6 + sin(uv.x * 9.0 + uTime * 1.3) * 2.0);
          rgb += vec3(1.0, 0.78, 0.45) * uHeat * (0.035 + 0.025 * w) * smoothstep(0.2, 1.0, uv.y);
        }
        gl_FragColor = vec4(rgb, a);
      }
    `,
  });
  const overlay = new Mesh(tri, overMat);
  overlay.frustumCulled = false;
  overlay.renderOrder = 10000;
  overlay.name = 'overlay';
  return {
    backdrop,
    overlay,
    bu,
    ou,
    dispose() {
      tri.dispose();
      backMat.dispose();
      overMat.dispose();
    },
  };
}
