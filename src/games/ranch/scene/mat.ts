// Shared uniforms, the downy rim-light patch and the debug NaN sentinel.
// Every material in the ranch is matte vertex colour (Lambert) except the
// sky, grass and fluff, which are small custom shaders.

import { Color, MeshLambertMaterial, Vector3, Vector4, type Material, type Object3D, type ShaderMaterial } from 'three';

export const U = {
  uTime: { value: 0 },
  /** Wind direction (xz) and strength. */
  uWind: { value: new Vector3(0.8, 0.45, 1) },
  /** 0 day to 1 night: downies glow faintly. */
  uNight: { value: 0 },
  uFogColor: { value: new Color(0.9, 0.86, 0.94) },
  uFogNear: { value: 30 },
  uFogFar: { value: 170 },
  uSunDir: { value: new Vector3(0.5, 0.7, -0.4) },
  uSunColor: { value: new Color(1, 0.95, 0.85) },
  uSkyColor: { value: new Color(0.7, 0.75, 0.95) },
  uGroundColor: { value: new Color(0.45, 0.5, 0.35) },
  /** Rim light colour for downies (rgb) and strength (w). */
  uRim: { value: new Vector4(1, 0.95, 0.85, 0.6) },
  /** The bellows' draw: muzzle position (xyz) and strength (w), so grass leans in. */
  uDraw: { value: new Vector4(0, -100, 0, 0) },
  uDrawDir: { value: new Vector3(0, 0, -1) },
  /** Debug only: paint non-finite output magenta. */
  uNaNWatch: { value: 0 },
  /** Debug only: plant a NaN at (x, y) px within radius z. */
  uNaNPlant: { value: new Vector4(0, 0, 0, 0) },
};

const NAN_TAIL = /* glsl */ `
  if ( uNaNPlant.z > 0.0 && distance( gl_FragCoord.xy, uNaNPlant.xy ) < uNaNPlant.z ) {
    gl_FragColor = vec4( uintBitsToFloat( uint( uNaNPlant.z > 0.0 ) * 0x7fc00000u ) );
  }
  if ( uNaNWatch > 0.5 ) {
    // A bit test, not isnan(): fast-math compilers may assume NaN never happens.
    uvec4 rBits = floatBitsToUint( gl_FragColor ) & 0x7f800000u;
    if ( any( equal( rBits, uvec4( 0x7f800000u ) ) ) ) gl_FragColor = vec4( 1.0, 0.0, 1.0, 1.0 );
  }
`;

function nanSource(src: string): string {
  return `uniform float uNaNWatch;\nuniform vec4 uNaNPlant;\n${src.replace(/}\s*$/, `${NAN_TAIL}\n}`)}`;
}

/** Debug only: adds the NaN sentinel to every material under root. Costs nothing until called. */
export function armNaNWatch(root: Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mm = (o as unknown as { material?: Material | Material[] }).material;
    if (!mm) return;
    for (const m of Array.isArray(mm) ? mm : [mm]) {
      if (m.userData.nanArmed) continue;
      m.userData.nanArmed = true;
      n++;
      if ((m as ShaderMaterial).isShaderMaterial) {
        const sm = m as ShaderMaterial;
        sm.uniforms.uNaNWatch = U.uNaNWatch;
        sm.uniforms.uNaNPlant = U.uNaNPlant;
        sm.fragmentShader = nanSource(sm.fragmentShader);
      } else {
        const prev = m.onBeforeCompile.bind(m);
        const prevKey = m.customProgramCacheKey.bind(m);
        m.onBeforeCompile = (sh, r) => {
          prev(sh, r);
          sh.uniforms.uNaNWatch = U.uNaNWatch;
          sh.uniforms.uNaNPlant = U.uNaNPlant;
          sh.fragmentShader = nanSource(sh.fragmentShader);
        };
        m.customProgramCacheKey = () => `${prevKey()}:nan`;
      }
      m.needsUpdate = true;
    }
  });
  return n;
}

/** Plain matte vertex colour. */
export function matte(opts: { flat?: boolean; side?: 0 | 1 | 2; emissive?: number } = {}): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true, flatShading: !!opts.flat, side: opts.side ?? 0 });
  if (opts.emissive) m.emissive.setHex(opts.emissive);
  return m;
}

/**
 * Downy fluff: matte with a soft back-lit rim (fresnel), a faint glow at
 * night, and per-instance colour. glow is extra self-light for embers.
 */
export function fluff(opts: { gloss?: number; glow?: number; rim?: number } = {}): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  const gloss = opts.gloss ?? 0;
  const glow = opts.glow ?? 0;
  const rim = opts.rim ?? 1;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = U.uRim;
    sh.uniforms.uNight = U.uNight;
    sh.uniforms.uSunDir = U.uSunDir;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uRim;\nuniform float uNight;\nuniform vec3 uSunDir;`)
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 rn = normalize( normal );
          vec3 rv = normalize( vViewPosition );
          float f = clamp( 1.0 - max( dot( rn, rv ), 0.0 ), 0.0, 1.0 );
          float rim = f * f * ( 0.6 + 0.4 * f );
          outgoingLight += uRim.rgb * rim * uRim.w * ${rim.toFixed(2)} * diffuseColor.rgb * 1.2;
          outgoingLight += diffuseColor.rgb * ( uNight * 0.15 + ${glow.toFixed(2)} * ( 0.35 + 0.65 * uNight ) );
          ${gloss > 0 ? `vec3 h = normalize( rv + normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz ) );
          outgoingLight += vec3( pow( max( dot( rn, h ), 0.0 ), 40.0 ) * ${gloss.toFixed(2)} ) * ( 1.0 - uNight * 0.7 );` : ''}
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `fluff:${gloss}:${glow}:${rim}`;
  return m;
}

/** Fog for custom shaders, matching the scene's linear fog. */
export const FOG_GLSL = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
vec3 applyFog( vec3 c, float depth ) {
  float f = smoothstep( uFogNear, uFogFar, depth );
  return mix( c, uFogColor, f );
}
`;
