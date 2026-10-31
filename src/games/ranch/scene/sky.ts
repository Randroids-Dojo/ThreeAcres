// The big sky: a gradient dome with painted drifting clouds, a sun and a moon
// and stars at night, and the day's light. Everything is keyed off the hour:
// soft periwinkle days, apricot dawns and dusks, deep blue nights.

import { BackSide, Color, DirectionalLight, Fog, HemisphereLight, Mesh, ShaderMaterial, SphereGeometry, Vector3, type Scene } from 'three';
import { U } from './mat';

interface Key {
  h: number;
  top: number;
  hor: number;
  fog: number;
  sun: number;
  sunI: number;
  hemiS: number;
  hemiG: number;
  hemiI: number;
}

const KEYS: Key[] = [
  { h: 0, top: 0x121838, hor: 0x2d3566, fog: 0x2a3262, sun: 0x9fb0ff, sunI: 0.37, hemiS: 0x46529a, hemiG: 0x1e2636, hemiI: 1.16 },
  { h: 4.3, top: 0x1b2250, hor: 0x464a7e, fog: 0x42467a, sun: 0xa4b2f0, sunI: 0.33, hemiS: 0x4e5690, hemiG: 0x262a38, hemiI: 1.16 },
  { h: 5.8, top: 0x5d74b8, hor: 0xf2b29a, fog: 0xdcaab0, sun: 0xffbf96, sunI: 0.7, hemiS: 0x9ea6d8, hemiG: 0x6a5e58, hemiI: 1.79 },
  { h: 7.3, top: 0x7f9be0, hor: 0xf1dfe2, fog: 0xe4d8e8, sun: 0xfff0d8, sunI: 1.61, hemiS: 0xc2ccf0, hemiG: 0x8c9a72, hemiI: 2.17 },
  { h: 12, top: 0x7898e2, hor: 0xe7e2f2, fog: 0xdfdcef, sun: 0xfff6ea, sunI: 1.88, hemiS: 0xcad4f4, hemiG: 0x90a27a, hemiI: 2.27 },
  { h: 16.6, top: 0x7f97dc, hor: 0xf0dad6, fog: 0xe8d6dc, sun: 0xffe8cc, sunI: 1.67, hemiS: 0xc8ccec, hemiG: 0x8e9480, hemiI: 2.17 },
  { h: 18.4, top: 0x6a6cb6, hor: 0xf4aa8c, fog: 0xd6a6b2, sun: 0xffae80, sunI: 1.1, hemiS: 0xb0a6d8, hemiG: 0x7e7088, hemiI: 2.03 },
  { h: 19.8, top: 0x34387a, hor: 0x93729f, fog: 0x76648f, sun: 0xc8a8dc, sunI: 0.5, hemiS: 0x6e6cac, hemiG: 0x3e3c56, hemiI: 1.32 },
  { h: 21.3, top: 0x121838, hor: 0x2d3566, fog: 0x2a3262, sun: 0x9fb0ff, sunI: 0.37, hemiS: 0x46529a, hemiG: 0x1e2636, hemiI: 1.16 },
  { h: 24, top: 0x121838, hor: 0x2d3566, fog: 0x2a3262, sun: 0x9fb0ff, sunI: 0.37, hemiS: 0x46529a, hemiG: 0x1e2636, hemiI: 1.16 },
];

const _a = new Color();
const _b = new Color();

function mixKey(h: number, f: keyof Omit<Key, 'h' | 'sunI' | 'hemiI'>, out: Color): Color {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const k0 = KEYS[i];
  const k1 = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (h - k0.h) / (k1.h - k0.h)));
  _a.setHex(k0[f]);
  _b.setHex(k1[f]);
  return out.copy(_a).lerp(_b, t * t * (3 - 2 * t));
}

function mixNum(h: number, f: 'sunI' | 'hemiI'): number {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const k0 = KEYS[i];
  const k1 = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (h - k0.h) / (k1.h - k0.h)));
  return k0[f] + (k1[f] - k0[f]) * t;
}

/** Sun direction for an hour: up from the east at six, down behind the ridge in the west at half past six. */
export function sunDir(h: number, out: Vector3): Vector3 {
  const th = ((h - 6) / 12.6) * Math.PI;
  return out.set(Math.cos(th), Math.sin(th) * 0.82, -0.42).normalize();
}

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHor;
uniform vec3 uBelow;
uniform vec3 uSunD;
uniform vec3 uMoonD;
uniform vec3 uSunC;
uniform float uNightK;
uniform float uT;
uniform float uCloudK;
varying vec3 vDir;

float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float vn( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + vec2( 1, 1 ) ), f.x ), f.y );
}
float fbm( vec2 p ) { float s = 0.0; float a = 0.5; for ( int i = 0; i < 4; i++ ) { s += vn( p ) * a; p = p * 2.03 + 7.1; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize( vDir );
  float y = d.y;
  // Gradient: haze at the horizon, colour overhead, soft below.
  float up = pow( clamp( y, 0.0, 1.0 ), 0.55 );
  vec3 c = mix( uHor, uTop, up );
  c = mix( c, uBelow, smoothstep( 0.0, -0.25, y ) );
  // Sun glow and disc.
  float sd = max( dot( d, uSunD ), 0.0 );
  c += uSunC * ( pow( sd, 8.0 ) * 0.25 + pow( sd, 64.0 ) * 0.35 ) * ( 1.0 - uNightK );
  c = mix( c, vec3( 1.0, 0.97, 0.88 ), smoothstep( 0.9985, 0.9993, sd ) * ( 1.0 - uNightK * 0.9 ) );
  // Moon: a pale disc with a soft halo.
  float md = max( dot( d, uMoonD ), 0.0 );
  c += vec3( 0.55, 0.6, 0.8 ) * pow( md, 120.0 ) * 0.5 * uNightK;
  c = mix( c, vec3( 0.93, 0.93, 1.0 ), smoothstep( 0.9990, 0.9995, md ) * uNightK );
  // Stars.
  if ( uNightK > 0.01 && y > 0.0 ) {
    vec2 sp = d.xz / ( y + 0.35 ) * 90.0;
    vec2 cell = floor( sp );
    float r = h21( cell );
    vec2 off = vec2( h21( cell + 3.1 ), h21( cell + 7.7 ) ) - 0.5;
    float s = smoothstep( 0.14, 0.0, length( fract( sp ) - 0.5 - off * 0.6 ) ) * step( 0.93, r );
    float tw = 0.65 + 0.35 * sin( uT * ( 1.0 + r * 3.0 ) + r * 40.0 );
    c += vec3( 0.95, 0.95, 1.0 ) * s * tw * uNightK * smoothstep( 0.0, 0.25, y );
  }
  // Painted clouds on a dome: soft lumps drifting west to east.
  if ( y > 0.0 ) {
    vec2 cp = d.xz / ( y + 0.18 ) * 1.6 + vec2( uT * 0.012, uT * 0.004 );
    float n = fbm( cp );
    float cl = smoothstep( 0.52 - uCloudK * 0.1, 0.78, n ) * smoothstep( 0.0, 0.22, y );
    float lit = smoothstep( 0.45, 0.85, fbm( cp + uSunD.xz * 0.15 ) );
    vec3 cc = mix( mix( uHor, vec3( 1.0 ), 0.55 ), uSunC * 0.9 + uHor * 0.25, lit * 0.6 );
    cc = mix( cc, uTop * 1.25, uNightK * 0.75 );
    c = mix( c, cc, cl * 0.85 );
  }
  gl_FragColor = vec4( max( c, vec3( 0.0 ) ), 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  readonly dome: Mesh;
  readonly hemi = new HemisphereLight(0xc8d4f4, 0x90a27a, 1.2);
  readonly sun = new DirectionalLight(0xfff6ea, 2.6);
  readonly fog = new Fog(0xdfdcef, 30, 170);
  private mat: ShaderMaterial;
  private dir = new Vector3();
  private moon = new Vector3();
  night = 0;

  constructor(scene: Scene, shadows: boolean) {
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTop: { value: new Color() },
        uHor: { value: new Color() },
        uBelow: { value: new Color(0x8a9a78) },
        uSunD: { value: new Vector3() },
        uMoonD: { value: new Vector3() },
        uSunC: { value: new Color() },
        uNightK: { value: 0 },
        uT: { value: 0 },
        uCloudK: { value: 0 },
      },
      side: BackSide,
      depthWrite: false,
    });
    this.dome = new Mesh(new SphereGeometry(400, 32, 16), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome, this.hemi, this.sun, this.sun.target);
    scene.fog = this.fog;
    if (shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -26;
      c.right = c.top = 26;
      c.near = 1;
      c.far = 140;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.04;
    }
  }

  update(hour: number, t: number, cx: number, cy: number, cz: number): void {
    const u = this.mat.uniforms;
    mixKey(hour, 'top', u.uTop.value);
    mixKey(hour, 'hor', u.uHor.value);
    mixKey(hour, 'sun', u.uSunC.value);
    sunDir(hour, this.dir);
    sunDir(hour + 12, this.moon);
    u.uSunD.value.copy(this.dir);
    u.uMoonD.value.copy(this.moon);
    const night = hour >= 21 || hour < 4.3 ? 1 : hour >= 18.6 ? (hour - 18.6) / 2.4 : hour < 6.2 ? 1 - (hour - 4.3) / 1.9 : 0;
    this.night = night;
    u.uNightK.value = night;
    u.uT.value = t;
    u.uBelow.value.copy(u.uHor.value).multiplyScalar(0.8);
    this.dome.position.set(cx, cy, cz);

    mixKey(hour, 'fog', this.fog.color);
    U.uFogColor.value.copy(this.fog.color);
    U.uFogNear.value = this.fog.near;
    U.uFogFar.value = this.fog.far;
    // The light comes from the sun by day and the moon by night.
    const lightDir = this.dir.y > -0.05 ? this.dir : this.moon;
    U.uSunDir.value.copy(lightDir);
    this.sun.color.copy(u.uSunC.value);
    this.sun.intensity = mixNum(hour, 'sunI') * Math.min(1, Math.max(0.25, lightDir.y * 3));
    this.sun.position.set(cx + lightDir.x * 60, cy + Math.max(0.15, lightDir.y) * 60, cz + lightDir.z * 60);
    this.sun.target.position.set(cx, cy - 1.6, cz);
    mixKey(hour, 'hemiS', this.hemi.color);
    mixKey(hour, 'hemiG', this.hemi.groundColor);
    this.hemi.intensity = mixNum(hour, 'hemiI');
    U.uSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity / Math.PI);
    U.uSkyColor.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity);
    U.uGroundColor.value.copy(this.hemi.groundColor).multiplyScalar(this.hemi.intensity);
    U.uNight.value = night;
    // Rim light: warm by day, cool by night.
    U.uRim.value.set(this.sun.color.r * 0.7 + 0.3, this.sun.color.g * 0.7 + 0.3, this.sun.color.b * 0.7 + 0.3, 0.32 + night * 0.12);
  }
}
