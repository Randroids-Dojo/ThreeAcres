// Grass and fluff: the valley's signature. Grass is one instanced draw: a
// fixed tile of blades that wraps around the player, each blade placed on the
// heightfield from a texture, thinned by a density map, swayed by rolling gusts
// and leaning into the bellows' draw. Seed fluff is one point cloud drifting on
// the wind, also wrapped around the player.

import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DataUtils,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  NormalBlending,
  Points,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import { GRID, MINX, MINZ } from '../world';
import { FOG_GLSL, U } from './mat';

/** Heights, density and zone tints in one texture the grass samples. */
export class GroundTex {
  readonly tex: DataTexture;
  private data: Uint16Array;

  constructor() {
    const { w, d } = GRID;
    this.data = new Uint16Array(w * d * 4);
    this.tex = new DataTexture(this.data, w, d, RGBAFormat, HalfFloatType);
    this.tex.magFilter = LinearFilter;
    this.tex.minFilter = LinearFilter;
    this.refresh();
  }

  refresh(): void {
    const { w, d, heights, grassD, ridgeT, hollowT } = GRID;
    for (let k = 0; k < w * d; k++) {
      this.data[k * 4] = DataUtils.toHalfFloat(heights[k]);
      this.data[k * 4 + 1] = DataUtils.toHalfFloat(grassD[k]);
      this.data[k * 4 + 2] = DataUtils.toHalfFloat(ridgeT[k]);
      this.data[k * 4 + 3] = DataUtils.toHalfFloat(hollowT[k]);
    }
    this.tex.needsUpdate = true;
  }
}

const GRASS_VERT = /* glsl */ `
uniform sampler2D uGround;
uniform vec2 uGridMin;
uniform vec2 uGridSize;
uniform vec2 uCam;
uniform float uTile;
uniform float uTime;
uniform vec3 uWind;
uniform vec4 uDraw;
uniform vec3 uDrawDir;
attribute vec2 aOff;
attribute vec3 aRnd;
varying float vH;
varying vec3 vTint;
varying float vDepth;
varying float vLight;
varying float vFade;

void main() {
  // Wrap this blade's slot to the copy nearest the camera.
  vec2 w = uCam + mod( aOff - uCam + uTile * 0.5, uTile ) - uTile * 0.5;
  vec2 uv = ( w - uGridMin + 0.5 ) / uGridSize;
  vec4 g = texture2D( uGround, uv );
  float dist = length( w - uCam );
  float fade = 1.0 - smoothstep( uTile * 0.3, uTile * 0.48, dist );
  float keep = step( aRnd.x, g.g ) * fade;
  float hgt = ( 0.15 + aRnd.y * 0.27 ) * mix( 1.0, 0.75, g.b ) * mix( 1.0, 1.15, g.a ) * keep;
  // Shorter right at your feet, so the view is never a wall of blades.
  hgt *= 0.45 + 0.55 * smoothstep( 0.5, 3.0, dist );
  vec3 p = position;
  float t = p.y;
  // Turn the blade, then sway: a slow lean plus gusts rolling across the valley.
  float a = aRnd.z * 6.2831;
  float ca = cos( a );
  float sa = sin( a );
  p.xz = vec2( p.x * ca - p.z * sa, p.x * sa + p.z * ca ) * ( 0.8 + aRnd.y * 0.5 );
  p.y *= hgt;
  float gust = sin( dot( w, uWind.xy ) * 0.12 - uTime * 1.9 ) * 0.5 + 0.5;
  gust = gust * gust;
  float sway = ( sin( uTime * 1.7 + w.x * 0.35 + w.y * 0.27 + aRnd.z * 4.0 ) * 0.12 + gust * 0.38 ) * uWind.z;
  vec2 bend = uWind.xy * sway;
  // Lean towards the bellows when drawing nearby.
  vec3 toM = uDraw.xyz - vec3( w.x, g.r, w.y );
  float dm = length( toM );
  float inCone = smoothstep( 0.82, 0.95, dot( -toM / max( dm, 0.001 ), uDrawDir ) ) * ( 1.0 - smoothstep( 2.0, 9.0, dm ) );
  bend += normalize( toM.xz + vec2( 0.0001 ) ) * inCone * uDraw.w * ( 0.55 + 0.25 * sin( uTime * 30.0 + aRnd.z * 9.0 ) );
  p.xz += bend * t * t * hgt * 1.4;
  p.y -= length( bend ) * t * t * hgt * 0.35;
  vec3 world = vec3( w.x + p.x, g.r + p.y - 0.02, w.y + p.z );
  vH = t;
  vTint = vec3( g.b, g.a, aRnd.y );
  vFade = keep;
  vLight = 0.85 + gust * 0.25;
  vec4 mv = viewMatrix * vec4( world, 1.0 );
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const GRASS_FRAG = /* glsl */ `
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform float uNight;
varying float vH;
varying vec3 vTint;
varying float vDepth;
varying float vLight;
varying float vFade;
${FOG_GLSL}
void main() {
  if ( vFade < 0.01 ) discard;
  // Linear colours: sage at the root, pale green-gold at the tip.
  vec3 meadowBase = vec3( 0.075, 0.15, 0.05 );
  vec3 meadowTip = vec3( 0.36, 0.5, 0.17 );
  vec3 ridgeBase = vec3( 0.26, 0.17, 0.07 );
  vec3 ridgeTip = vec3( 0.72, 0.55, 0.26 );
  vec3 hollowBase = vec3( 0.04, 0.13, 0.09 );
  vec3 hollowTip = vec3( 0.2, 0.4, 0.26 );
  vec3 base = mix( mix( meadowBase, ridgeBase, vTint.x ), hollowBase, vTint.y );
  vec3 tip = mix( mix( meadowTip, ridgeTip, vTint.x ), hollowTip, vTint.y );
  tip = mix( tip, tip * vec3( 1.08, 1.0, 0.86 ), vTint.z );
  vec3 c = mix( base, tip, smoothstep( 0.0, 1.0, vH ) );
  vec3 light = uSkyColor * 0.36 + uSunColor * 0.78 * vLight + uGroundColor * 0.08;
  c *= light;
  // Back-lit tips catch the low sun.
  c += uSunColor * vH * vH * 0.05;
  c = applyFog( max( c, vec3( 0.0 ) ), vDepth );
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildGrass(ground: Texture, count: number, tile: number): { mesh: Mesh; cam: Vector2 } {
  const g = new InstancedBufferGeometry();
  // A tapered blade: two quads and a tip, 5 triangles.
  const wdt = 0.036;
  const pos = new Float32Array([
    -wdt, 0, 0, wdt, 0, 0, -wdt * 0.7, 0.45, 0.02, wdt * 0.7, 0.45, 0.02, -wdt * 0.35, 0.8, 0.06, wdt * 0.35, 0.8, 0.06, 0, 1, 0.1,
  ]);
  const idx = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6];
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(idx);
  const off = new Float32Array(count * 2);
  const rnd = new Float32Array(count * 3);
  // Jittered grid so blades never clump or leave holes.
  const side = Math.ceil(Math.sqrt(count));
  const cell = tile / side;
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const gx = i % side;
    const gz = Math.floor(i / side);
    off[i * 2] = (gx + r()) * cell;
    off[i * 2 + 1] = (gz + r()) * cell;
    rnd[i * 3] = r();
    rnd[i * 3 + 1] = r();
    rnd[i * 3 + 2] = r();
  }
  g.setAttribute('aOff', new InstancedBufferAttribute(off, 2));
  g.setAttribute('aRnd', new InstancedBufferAttribute(rnd, 3));
  g.instanceCount = count;
  const cam = new Vector2();
  const mat = new ShaderMaterial({
    vertexShader: GRASS_VERT,
    fragmentShader: GRASS_FRAG,
    uniforms: {
      uGround: { value: ground },
      uGridMin: { value: new Vector2(MINX, MINZ) },
      uGridSize: { value: new Vector2(GRID.w, GRID.d) },
      uCam: { value: cam },
      uTile: { value: tile },
      uTime: U.uTime,
      uWind: U.uWind,
      uDraw: U.uDraw,
      uDrawDir: U.uDrawDir,
      uSunColor: U.uSunColor,
      uSkyColor: U.uSkyColor,
      uGroundColor: U.uGroundColor,
      uNight: U.uNight,
      uFogColor: U.uFogColor,
      uFogNear: U.uFogNear,
      uFogFar: U.uFogFar,
    },
    side: 2,
  });
  const mesh = new Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.name = 'grass';
  return { mesh, cam };
}

// ---------------------------------------------------------------- fluff

const FLUFF_VERT = /* glsl */ `
uniform vec3 uCam3;
uniform float uBox;
uniform float uTime;
uniform vec3 uWind;
uniform float uPx;
attribute vec4 aSeed;
varying float vA;
varying float vSpin;
void main() {
  vec3 p = position + vec3( uWind.x, 0.0, uWind.y ) * uTime * ( 0.9 + aSeed.x * 0.8 ) * uWind.z;
  p.y += sin( uTime * ( 0.4 + aSeed.y * 0.5 ) + aSeed.z * 6.28 ) * 0.6;
  p.x += sin( uTime * 0.7 + aSeed.w * 6.28 ) * 0.4;
  vec3 w = uCam3 + mod( p - uCam3 + uBox * 0.5, vec3( uBox ) ) - uBox * 0.5;
  w.y = uCam3.y + mod( p.y - uCam3.y + 6.0, 14.0 ) - 6.0;
  vec4 mv = viewMatrix * vec4( w, 1.0 );
  float d = -mv.z;
  vA = ( 1.0 - smoothstep( uBox * 0.3, uBox * 0.5, length( w.xz - uCam3.xz ) ) ) * smoothstep( 0.3, 1.2, d );
  vSpin = aSeed.w * 6.28 + uTime * ( aSeed.x - 0.5 );
  gl_PointSize = clamp( uPx * ( 0.05 + aSeed.y * 0.05 ) / max( d, 0.5 ), 1.0, 40.0 );
  gl_Position = projectionMatrix * mv;
}
`;

const FLUFF_FRAG = /* glsl */ `
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform float uNight;
varying float vA;
varying float vSpin;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length( q );
  // A dandelion seed: a soft core and fine radiating filaments.
  float ang = atan( q.y, q.x ) + vSpin;
  float rays = pow( abs( cos( ang * 4.0 ) ), 10.0 ) * smoothstep( 0.5, 0.1, r );
  float core = smoothstep( 0.14, 0.0, r );
  float halo = smoothstep( 0.5, 0.15, r ) * 0.3;
  float a = clamp( core + rays * 0.65 + halo, 0.0, 1.0 ) * vA * 0.85;
  if ( a < 0.02 ) discard;
  vec3 c = vec3( 1.0, 0.98, 0.93 ) * ( uSkyColor * 0.4 + uSunColor * 0.7 + 0.15 );
  c = mix( c, vec3( 0.75, 0.8, 1.0 ) * 0.6, uNight * 0.6 );
  gl_FragColor = vec4( c, a );
  #include <colorspace_fragment>
}
`;

export function buildFluff(count: number, box: number): { points: Points; cam: { value: Vector3 }; px: { value: number } } {
  const g = new BufferGeometry();
  const p = new Float32Array(count * 3);
  const sd = new Float32Array(count * 4);
  let s = 999;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    p[i * 3] = r() * box;
    p[i * 3 + 1] = r() * 14;
    p[i * 3 + 2] = r() * box;
    for (let k = 0; k < 4; k++) sd[i * 4 + k] = r();
  }
  g.setAttribute('position', new BufferAttribute(p, 3));
  g.setAttribute('aSeed', new BufferAttribute(sd, 4));
  const cam = { value: new Vector3() };
  const px = { value: 600 };
  const mat = new ShaderMaterial({
    vertexShader: FLUFF_VERT,
    fragmentShader: FLUFF_FRAG,
    uniforms: {
      uCam3: cam,
      uBox: { value: box },
      uTime: U.uTime,
      uWind: U.uWind,
      uPx: px,
      uSunColor: U.uSunColor,
      uSkyColor: U.uSkyColor,
      uNight: U.uNight,
    },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
  const points = new Points(g, mat);
  points.frustumCulled = false;
  points.name = 'fluff';
  return { points, cam, px };
}
