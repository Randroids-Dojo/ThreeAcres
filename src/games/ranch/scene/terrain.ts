// The ground: one heightfield mesh painted per zone (sage meadow, pale ranch,
// apricot rock on the ridge, teal marsh in the hollow, cream paths), the
// stream and pond, and layered hills on the horizon fading into lilac haze.

import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial, Vector3 } from 'three';
import { fbm, noise2, smoothstep } from '../noise';
import { GRID, MINX, MINZ, POND, STREAM, normalY, pathAt, polyDist, streamSurface, zoneAt, HOUSE, PADS, PEN_R } from '../world';
import { FOG_GLSL, U, matte } from './mat';

const C = {
  meadow: new Color(0x8fab68),
  meadow2: new Color(0x7a9a5e),
  meadowHi: new Color(0xa9bf78),
  ranch: new Color(0x9db87a),
  path: new Color(0xe3d2a8),
  path2: new Color(0xd2bd90),
  dirt: new Color(0xc9b28a),
  rock: new Color(0xe0ac88),
  rock2: new Color(0xd09a7c),
  dry: new Color(0xd8c28a),
  marsh: new Color(0x86ae8e),
  mud: new Color(0x8c8264),
  bed: new Color(0x9c9a7c),
  bank: new Color(0x7e9e68),
};

const _c = new Color();

function groundColor(x: number, z: number, h: number, out: Color): Color {
  const zone = zoneAt(x, z);
  const n = noise2(x * 0.08, z * 0.08, 3);
  const n2 = noise2(x * 0.31, z * 0.31, 4);
  const ny = normalY(x, z);
  if (zone === 'ridge') {
    out.copy(C.dry).lerp(C.rock, smoothstep(0.35, 0.65, n) * 0.8 + smoothstep(0.93, 0.8, ny));
    out.lerp(C.rock2, n2 * 0.3);
    // The ridge's first metres blend into the meadow over the wall.
    out.lerp(C.meadow2, smoothstep(-38, -35, x) * 0.6);
  } else if (zone === 'hollow') {
    out.copy(C.marsh).lerp(C.meadow, n * 0.4);
    out.lerp(C.mud, smoothstep(POND.level + 0.9, POND.level + 0.1, h));
    out.lerp(C.bed, smoothstep(POND.level, POND.level - 0.6, h));
  } else if (zone === 'ranch') {
    out.copy(C.ranch).lerp(C.meadowHi, n * 0.35);
    const yard = Math.max(0, 1 - Math.hypot((x - HOUSE.x) / 9, (z - HOUSE.z + 2) / 7));
    out.lerp(C.dirt, smoothstep(0, 0.5, yard) * 0.7);
    for (const p of PADS) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < PEN_R + 0.6) out.lerp(C.dirt, smoothstep(PEN_R + 0.6, PEN_R - 0.4, d) * 0.55);
    }
  } else {
    out.copy(C.meadow).lerp(C.meadow2, smoothstep(0.3, 0.75, n));
    out.lerp(C.meadowHi, smoothstep(3.5, 6.5, h) * 0.5);
  }
  out.multiplyScalar(0.94 + n2 * 0.12);
  // Stream banks and bed.
  const ds = polyDist(x, z, STREAM);
  if (ds < 3.5) {
    out.lerp(C.bank, smoothstep(3.5, 1.8, ds) * 0.6);
    out.lerp(C.bed, smoothstep(1.6, 0.6, ds));
  }
  const pt = pathAt(x, z);
  if (pt > 0) {
    _c.copy(C.path).lerp(C.path2, n2);
    out.lerp(_c, smoothstep(0, 0.7, pt));
  }
  return out;
}

export function buildTerrain(): Mesh {
  const { w, d, heights } = GRID;
  const g = new BufferGeometry();
  const pos = new Float32Array(w * d * 3);
  const col = new Float32Array(w * d * 3);
  const c = new Color();
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const x = MINX + i;
      const z = MINZ + j;
      const h = heights[k];
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      groundColor(x, z, h, c);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
  }
  const idx = new Uint32Array((w - 1) * (d - 1) * 6);
  let n = 0;
  for (let j = 0; j < d - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i;
      const b = a + 1;
      const cc = a + w;
      const dd = cc + 1;
      // Alternate the diagonal so slopes do not stripe.
      if ((i + j) % 2) {
        idx[n++] = a;
        idx[n++] = cc;
        idx[n++] = b;
        idx[n++] = b;
        idx[n++] = cc;
        idx[n++] = dd;
      } else {
        idx[n++] = a;
        idx[n++] = cc;
        idx[n++] = dd;
        idx[n++] = a;
        idx[n++] = dd;
        idx[n++] = b;
      }
    }
  }
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new Mesh(g, matte());
  m.receiveShadow = true;
  m.name = 'terrain';
  return m;
}

// ---------------------------------------------------------------- water

const WATER_VERT = /* glsl */ `
attribute float aFlow;
varying vec3 vW;
varying float vFlow;
varying float vDepth;
void main() {
  vec4 w = modelMatrix * vec4( position, 1.0 );
  vW = w.xyz;
  vFlow = aFlow;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSkyColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uNight;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uStream;
varying vec3 vW;
varying float vFlow;
varying float vDepth;
${FOG_GLSL}
float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float vn( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + vec2( 1, 1 ) ), f.x ), f.y );
}
void main() {
  vec3 v = normalize( cameraPosition - vW );
  vec2 p = vW.xz;
  float flow = uStream > 0.5 ? vFlow - uTime * 0.9 : 0.0;
  float r1 = vn( p * 0.9 + vec2( uTime * 0.21, flow ) );
  float r2 = vn( p * 2.3 - vec2( uTime * 0.17, uTime * 0.11 ) + vec2( 0.0, flow * 2.0 ) );
  vec3 n = normalize( vec3( ( r1 - 0.5 ) * 0.35 + ( r2 - 0.5 ) * 0.2, 1.0, ( r2 - 0.5 ) * 0.35 ) );
  float fres = pow( clamp( 1.0 - max( dot( n, v ), 0.0 ), 0.0, 1.0 ), 3.0 );
  vec3 c = mix( uShallow, uDeep, 0.55 );
  c *= ( 0.55 + 0.45 * ( 1.0 - uNight * 0.6 ) );
  c = mix( c, uSkyColor * 0.7, 0.12 + fres * 0.45 );
  vec3 hdir = normalize( v + uSunDir );
  c += uSunColor * pow( max( dot( n, hdir ), 0.0 ), 90.0 ) * 0.8;
  // Painted glints and streaks.
  float streak = smoothstep( 0.72, 0.8, vn( vec2( p.x * 0.6, flow * 3.0 + p.y * 0.2 ) ) );
  c += vec3( 0.9, 0.95, 1.0 ) * streak * 0.06 * uStream * ( 1.0 - uNight * 0.7 );
  c = applyFog( max( c, vec3( 0.0 ) ), vDepth );
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function waterMat(stream: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: {
      uTime: U.uTime,
      uSkyColor: U.uSkyColor,
      uSunColor: U.uSunColor,
      uSunDir: U.uSunDir,
      uNight: U.uNight,
      uFogColor: U.uFogColor,
      uFogNear: U.uFogNear,
      uFogFar: U.uFogFar,
      uDeep: { value: new Color(0x41689a) },
      uShallow: { value: new Color(0x5f94a4) },
      uStream: { value: stream ? 1 : 0 },
    },
    side: DoubleSide,
  });
}

export function buildWater(): Mesh[] {
  // The pond: a disc squashed to the basin's shape.
  const seg = 48;
  const pp: number[] = [];
  const ff: number[] = [];
  const R = POND.r + 6;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    pp.push(POND.x, POND.level, POND.z, POND.x + Math.cos(a1) * R, POND.level, POND.z + (Math.sin(a1) * R) / 1.1, POND.x + Math.cos(a0) * R, POND.level, POND.z + (Math.sin(a0) * R) / 1.1);
    ff.push(0, 0, 0);
  }
  const pg = new BufferGeometry();
  pg.setAttribute('position', new BufferAttribute(new Float32Array(pp), 3));
  pg.setAttribute('aFlow', new BufferAttribute(new Float32Array(ff), 1));
  pg.computeBoundingSphere();
  const pond = new Mesh(pg, waterMat(false));
  pond.name = 'pond';

  // The stream: a ribbon along its line at its own surface height.
  const sp: number[] = [];
  const sf: number[] = [];
  const pts: Vector3[] = [];
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [ax, az] = STREAM[i];
    const [bx, bz] = STREAM[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(l);
    for (let k = 0; k < steps; k++) pts.push(new Vector3(ax + ((bx - ax) * k) / steps, 0, az + ((bz - az) * k) / steps));
  }
  pts.push(new Vector3(STREAM[STREAM.length - 1][0], 0, STREAM[STREAM.length - 1][1]));
  let dist = 0;
  const half = 1.75;
  const rows: { lx: number; lz: number; rx: number; rz: number; y: number; f: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl;
    const nz = tx / tl;
    if (i > 0) dist += pts[i].distanceTo(pts[i - 1]);
    const p = pts[i];
    let y = streamSurface(p.x, p.z);
    if (p.x > 44) y = Math.max(y, POND.level);
    rows.push({ lx: p.x + nx * half, lz: p.z + nz * half, rx: p.x - nx * half, rz: p.z - nz * half, y, f: dist * 0.25 });
  }
  // Smooth the surface so it steps down gently.
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < rows.length - 1; i++) rows[i].y = (rows[i - 1].y + rows[i].y * 2 + rows[i + 1].y) / 4;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    sp.push(a.lx, a.y, a.lz, a.rx, a.y, a.rz, b.lx, b.y, b.lz, a.rx, a.y, a.rz, b.rx, b.y, b.rz, b.lx, b.y, b.lz);
    sf.push(a.f, a.f, b.f, a.f, b.f, b.f);
  }
  const sg = new BufferGeometry();
  sg.setAttribute('position', new BufferAttribute(new Float32Array(sp), 3));
  sg.setAttribute('aFlow', new BufferAttribute(new Float32Array(sf), 1));
  sg.computeBoundingSphere();
  const stream = new Mesh(sg, waterMat(true));
  stream.name = 'stream';
  return [pond, stream];
}

// ---------------------------------------------------------------- the horizon

const HILL_VERT = /* glsl */ `
attribute float aShade;
varying float vShade;
varying float vH;
void main() {
  vShade = aShade;
  vH = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;
const HILL_FRAG = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uSkyColor;
uniform float uNight;
uniform float uFar;
varying float vShade;
varying float vH;
void main() {
  // Flat layered silhouettes: nearer ranges darker and cooler, all in haze.
  vec3 tint = mix( vec3( 0.52, 0.5, 0.72 ), vec3( 0.36, 0.42, 0.52 ), 1.0 - uFar );
  vec3 c = mix( uFogColor * 0.82, tint * ( 1.0 - uNight * 0.55 ), 0.32 - uFar * 0.16 );
  c *= 0.94 + vShade * 0.1;
  c = mix( c, uFogColor, smoothstep( 40.0, -5.0, vH ) * 0.35 );
  gl_FragColor = vec4( c, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildHills(): Mesh[] {
  const out: Mesh[] = [];
  for (const [rad, hgt, seed, far] of [
    [300, 46, 5, 1],
    [230, 30, 9, 0],
  ] as const) {
    const seg = 96;
    const p: number[] = [];
    const s: number[] = [];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const h0 = hillH(a0, hgt, seed);
      const h1 = hillH(a1, hgt, seed);
      const x0 = Math.cos(a0) * rad;
      const z0 = Math.sin(a0) * rad * 0.8;
      const x1 = Math.cos(a1) * rad;
      const z1 = Math.sin(a1) * rad * 0.8;
      p.push(x0, -20, z0, x1, -20, z1, x1, h1, z1, x0, -20, z0, x1, h1, z1, x0, h0, z0);
      const sh = (Math.sin(a0 * 7 + seed) + 1) * 0.5;
      s.push(sh, sh, sh, sh, sh, sh);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
    g.setAttribute('aShade', new BufferAttribute(new Float32Array(s), 1));
    g.computeBoundingSphere();
    const m = new Mesh(
      g,
      new ShaderMaterial({
        vertexShader: HILL_VERT,
        fragmentShader: HILL_FRAG,
        uniforms: { uFogColor: U.uFogColor, uSkyColor: U.uSkyColor, uNight: U.uNight, uFar: { value: far } },
        side: DoubleSide,
        depthWrite: true,
      }),
    );
    m.frustumCulled = false;
    m.renderOrder = -5;
    out.push(m);
  }
  return out;
}

function hillH(a: number, hgt: number, seed: number): number {
  const x = Math.cos(a) * 3;
  const z = Math.sin(a) * 3;
  // The west (behind the ridge) rises highest; the east is a low line.
  const west = smoothstep(0.2, -0.9, Math.cos(a));
  return hgt * (0.35 + 0.65 * (0.5 + fbm(x, z, 4, seed) * 0.9)) * (0.6 + west * 0.7) + 6;
}
