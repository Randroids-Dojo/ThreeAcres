// The diorama's materials. Everything is matte painted vertex colour, patched
// with three shared tricks: wind sway in the vertex shader, snow and frost on
// upward faces, and a height mist that dissolves the bottom of the slab.

import {
  Color,
  DoubleSide,
  FrontSide,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Material,
  type Object3D,
  type ShaderMaterial,
  type Side,
} from 'three';

/** Uniforms shared by every patched material. Updated once a frame. */
export const U = {
  uTime: { value: 0 },
  uWind: { value: new Vector2(0.8, 0.35) },
  uGust: { value: 0 },
  /** Mist colour in display (sRGB) space: mixed after tone mapping. */
  uMistColor: { value: new Vector3(0.9, 0.9, 0.86) },
  /** x top of the mist (world y), y bottom, z amount. */
  uMist: { value: new Vector4(-0.35, -3.4, 1, 0) },
  uSnow: { value: 0 },
  uSnowColor: { value: new Color(0.93, 0.95, 1.0) },
  /** World up in view space, for snow on upward faces. */
  uUpView: { value: new Vector3(0, 1, 0) },
  /** Soft sky rim on silhouettes, rgb and strength. */
  uRim: { value: new Vector4(0.8, 0.88, 1, 0.22) },
  /** Debug only, see armNaNWatch: paint non-finite output magenta. */
  uNaNWatch: { value: 0 },
  /** Debug only: plant a NaN at (x, y) drawing-buffer px within radius z, in opaque (w = 1) or blended (w = 2) materials. */
  uNaNPlant: { value: new Vector4(0, 0, 0, 0) },
};

const NAN_TAIL = /* glsl */ `
  if ( uNaNPlant.z > 0.0 && abs( uNaNPlant.w - ACRES_KIND ) < 0.5 && distance( gl_FragCoord.xy, uNaNPlant.xy ) < uNaNPlant.z ) {
    gl_FragColor = vec4( uintBitsToFloat( uint( uNaNPlant.z > 0.0 ) * 0x7fc00000u ) );
  }
  if ( uNaNWatch > 0.5 ) {
    // Bit test, not isnan(): fast-math compilers may assume NaN never happens.
    uvec4 acresBits = floatBitsToUint( gl_FragColor ) & 0x7f800000u;
    if ( any( equal( acresBits, uvec4( 0x7f800000u ) ) ) ) gl_FragColor = vec4( 1.0, 0.0, 1.0, 1.0 );
  }
`;

function nanSource(src: string, kind: number): string {
  const head = `uniform float uNaNWatch;\nuniform vec4 uNaNPlant;\n#define ACRES_KIND ${kind}.0\n`;
  return head + src.replace(/}\s*$/, `${NAN_TAIL}\n}`);
}

/**
 * Debug only. Adds a NaN sentinel to every material in the scene: with
 * U.uNaNWatch on, any pixel whose shader output is NaN or infinite is painted
 * magenta, opaque or blended. On some GPUs a NaN in a blended material leaves
 * the pixel unchanged, so counting black pixels alone would miss it. Never
 * called by the game; costs nothing until it is.
 */
export function armNaNWatch(root: Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mm = (o as unknown as { material?: Material | Material[] }).material;
    if (!mm) return;
    for (const m of Array.isArray(mm) ? mm : [mm]) {
      if (m.userData.nanArmed) continue;
      m.userData.nanArmed = true;
      n++;
      const kind = m.transparent ? 2 : 1;
      if ((m as ShaderMaterial).isShaderMaterial) {
        const sm = m as ShaderMaterial;
        sm.uniforms.uNaNWatch = U.uNaNWatch;
        sm.uniforms.uNaNPlant = U.uNaNPlant;
        sm.fragmentShader = nanSource(sm.fragmentShader, kind);
      } else {
        const prev = m.onBeforeCompile.bind(m);
        const prevKey = m.customProgramCacheKey.bind(m);
        m.onBeforeCompile = (sh, r) => {
          prev(sh, r);
          sh.uniforms.uNaNWatch = U.uNaNWatch;
          sh.uniforms.uNaNPlant = U.uNaNPlant;
          sh.fragmentShader = nanSource(sh.fragmentShader, kind);
        };
        m.customProgramCacheKey = () => `${prevKey()}:nan${kind}`;
      }
      m.needsUpdate = true;
    }
  });
  return n;
}

export interface PatchOpts {
  /** attr: per-vertex aSway weight. crop: weight from local height, scaled by uSwayAmp. */
  sway?: 'attr' | 'crop';
  /** How much snow and frost settle on this material, 0..1. */
  snow?: number;
  /** Soil: per-instance aWet makes it glossy. */
  wet?: boolean;
  swayAmp?: number;
  /** Darken towards the ground, like contact shadow in a photo of a model. */
  ao?: number;
}

const VERT_HEAD = /* glsl */ `
varying vec3 vWorldP;
uniform float uTime;
uniform vec2 uWind;
uniform float uGust;
uniform float uSwayAmp;
#ifdef SWAY_ATTR
attribute float aSway;
#endif
#ifdef SOIL_WET
attribute float aWet;
varying float vWet;
#endif
`;

const VERT_BODY = /* glsl */ `
#include <begin_vertex>
vec4 wp0 = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
wp0 = instanceMatrix * wp0;
#endif
wp0 = modelMatrix * wp0;
#if defined( SWAY_ATTR ) || defined( SWAY_CROP )
{
  #ifdef SWAY_ATTR
  float sw = aSway;
  #else
  float sw = uSwayAmp * pow( max( position.y, 0.0 ), 1.4 );
  #endif
  float ph = uTime * 1.9 + wp0.x * 0.7 + wp0.z * 0.5;
  float s = sw * ( sin( ph ) * 0.55 + sin( ph * 2.7 + 1.1 ) * 0.2 + uGust );
  transformed.x += uWind.x * s;
  transformed.z += uWind.y * s;
}
#endif
#ifdef SOIL_WET
vWet = aWet;
#endif
vWorldP = wp0.xyz;
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vWorldP;
uniform vec3 uMistColor;
uniform vec4 uMist;
uniform float uSnow;
uniform float uSnowScale;
uniform vec3 uSnowColor;
uniform vec3 uUpView;
uniform vec4 uRim;
uniform float uAo;
#ifdef SOIL_WET
varying float vWet;
#endif
// A hash without sin(): sin() of large arguments can come back NaN under fast math.
float acresHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float acresNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( acresHash( i ), acresHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( acresHash( i + vec2( 0.0, 1.0 ) ), acresHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;

const FRAG_SNOW = /* glsl */ `
#include <color_fragment>
#ifndef FLAT_SHADED
{
  vec3 nn = normalize( vNormal );
  #ifdef DOUBLE_SIDED
  nn *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
  float up = dot( nn, uUpView );
  float nse = acresNoise( vWorldP.xz * 3.1 ) * 0.65 + acresNoise( vWorldP.xz * 9.7 ) * 0.35;
  float cover = smoothstep( 0.35, 0.85, up + ( nse - 0.5 ) * 0.55 ) * uSnow * uSnowScale;
  diffuseColor.rgb = mix( diffuseColor.rgb, uSnowColor, clamp( cover, 0.0, 1.0 ) );
}
#endif
if ( uAo > 0.0 ) diffuseColor.rgb *= mix( 1.0 - uAo, 1.0, smoothstep( 0.0, 0.32, vWorldP.y ) );
`;

const FRAG_RIM = /* glsl */ `
#include <lights_fragment_end>
#ifndef FLAT_SHADED
{
  vec3 nv = normalize( vNormal );
  #ifdef DOUBLE_SIDED
  nv *= gl_FrontFacing ? 1.0 : -1.0;
  #endif
  float facing = clamp( dot( nv, normalize( vViewPosition ) ), 0.0, 1.0 );
  float rim = pow( 1.0 - facing, 3.0 ) * clamp( dot( nv, uUpView ) * 0.5 + 0.6, 0.0, 1.0 );
  reflectedLight.indirectDiffuse += diffuseColor.rgb * uRim.rgb * rim * uRim.w;
}
#endif
`;

const FRAG_MIST = /* glsl */ `
{
  float mh = clamp( ( uMist.x - vWorldP.y ) / ( uMist.x - uMist.y ), 0.0, 1.0 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, uMistColor, mh * mh * uMist.z );
}
`;

export function patch<T extends Material>(mat: T, opts: PatchOpts = {}): T {
  const snow = opts.snow ?? 1;
  const swayAmp = { value: opts.swayAmp ?? 0 };
  const snowScale = { value: snow };
  const ao = { value: opts.ao ?? 0 };
  mat.userData.swayAmp = swayAmp;
  mat.userData.snowScale = snowScale;
  const m = mat as unknown as { defines?: Record<string, string> };
  const defines: Record<string, string> = { ...(m.defines ?? {}) };
  if (opts.sway === 'attr') defines.SWAY_ATTR = '';
  if (opts.sway === 'crop') defines.SWAY_CROP = '';
  if (opts.wet) defines.SOIL_WET = '';
  m.defines = defines;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.uniforms.uSwayAmp = swayAmp;
    sh.uniforms.uSnowScale = snowScale;
    sh.uniforms.uAo = ao;
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', VERT_BODY);
    let f = FRAG_HEAD + sh.fragmentShader;
    f = f.replace('#include <color_fragment>', FRAG_SNOW);
    f = f.replace('#include <fog_fragment>', FRAG_MIST);
    f = f.replace('#include <lights_fragment_end>', FRAG_RIM);
    if (opts.wet) {
      f = f.replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.3, clamp( vWet, 0.0, 1.0 ) );',
      );
    }
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `acres:${opts.sway ?? ''}:${opts.wet ? 1 : 0}`;
  return mat;
}

export function matte(opts: PatchOpts & { side?: Side } = {}): MeshLambertMaterial {
  return patch(new MeshLambertMaterial({ vertexColors: true, side: opts.side ?? FrontSide }), opts);
}

export interface Materials {
  /** The ground and the slab. */
  ground: MeshLambertMaterial;
  /** Props and buildings. */
  stat: MeshLambertMaterial;
  /** Trees: per-vertex sway. */
  tree: MeshLambertMaterial;
  /** Grass blades and thin leaves: per-vertex sway, both sides. */
  grass: MeshLambertMaterial;
  /** Crops: sway from height. Ripe crops sway more. */
  cropRipe: MeshLambertMaterial;
  cropGrow: MeshLambertMaterial;
  cropDead: MeshLambertMaterial;
  /** Tilled soil: glossy when wet. */
  soil: MeshStandardMaterial;
  /** Figures and small props with little or no snow. */
  figure: MeshLambertMaterial;
}

export function makeMaterials(): Materials {
  return {
    ground: matte({ snow: 1 }),
    stat: matte({ snow: 1, ao: 0.28 }),
    tree: matte({ sway: 'attr', snow: 1, ao: 0.3 }),
    grass: matte({ sway: 'attr', snow: 0.8, side: DoubleSide }),
    cropRipe: matte({ sway: 'crop', snow: 0.12, swayAmp: 0.07, side: DoubleSide }),
    cropGrow: matte({ sway: 'crop', snow: 0.12, swayAmp: 0.035, side: DoubleSide }),
    cropDead: matte({ sway: 'crop', snow: 0.3, swayAmp: 0.01, side: DoubleSide }),
    soil: patch(new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }), { wet: true, snow: 0.3 }),
    figure: matte({ snow: 0, ao: 0.18 }),
  };
}
