// The lit 3D diorama: the farm on a chunk of earth cut out of the ground,
// soil layers at its edges, sitting in soft mist. Low-poly toy shapes, matte
// painted materials, a warm key light with real shadows, a cool sky fill, a
// sun that moves across the day and lamplight after dusk.
//
// three.js is imported only inside src/render3d, so the game can lazy-load it.

import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  MeshLambertMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { FrameView, Renderer } from '../contract';
import type { Season, SimEvent, Weather, WorldState } from '../sim/types';
import { buildActors, type Actors } from './actors';
import { buildBuilds, type Builds } from './builds';
import { makeRig } from './camera';
import { buildCrops, makeTimers, type Crops, type TileTimers } from './crops';
import { makeEffects, type Effects } from './effects';
import { buildFields, type Fields } from './fields';
import { makeParticles, makeTileFlashes } from './fx';
import { buildGlow, type Glow } from './glow';
import { buildMarkers, type Markers } from './markers';
import { U, armNaNWatch, makeMaterials, patch } from './materials';
import { computeSky, makeSky, SEASONS, stormDawn } from './palette';
import { buildProps, makeGlassMaterial, signTexture, type Props } from './props';
import { makeScreen } from './screen';
import { buildTerrain, makeWaterMaterial, type Terrain } from './terrain';
import { clamp, col, lerp, smooth } from './util';
import { CLOUD_LAYER, buildWeather, type WeatherFx } from './weather';

const WIND: Record<Weather, number> = { sun: 0.6, cloud: 0.85, rain: 1.1, storm: 2.3, heat: 0.3 };

/** Debug hooks for the workbench scripts. Not part of the Renderer contract. */
export interface Renderer3DDebug {
  renderer: WebGLRenderer;
  scene: Scene;
  /** Called straight after each frame is drawn, while the drawing buffer is still readable. */
  afterFrame: ((gl: WebGL2RenderingContext) => void) | null;
  /** Set to an object to accumulate milliseconds per section of frame(). */
  profile: Record<string, number> | null;
  /** Plants a real NaN in a small disc mid screen, in opaque or blended materials, to prove a flash scan can see one. */
  injectNaN(on: boolean, kind?: 'opaque' | 'blended'): void;
  /** Turns the NaN sentinel on: any non-finite shader output is painted magenta. */
  watchNaN(on: boolean): void;
  stats(): { calls: number; triangles: number; points: number; programs: number; textures: number; geometries: number };
}

export async function createRenderer3D(): Promise<Renderer & { debug: Renderer3DDebug }> {
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(new Color('#e8e6dc'), 1);
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());

  const scene = new Scene();
  const rig = makeRig();
  const camera = rig.camera;
  const mats = makeMaterials();
  const waterMat = makeWaterMaterial();
  const glass = makeGlassMaterial();
  const signMat = patch(new MeshLambertMaterial({ map: signTexture() }), { snow: 0 });

  const key = new DirectionalLight('#fff5e6', 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 3;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 140;
  key.shadow.camera.layers.enable(CLOUD_LAYER);
  const hemi = new HemisphereLight('#cfe1ff', '#a07c52', 1.2);
  scene.add(key, key.target, hemi);

  const screen = makeScreen();
  scene.add(screen.backdrop, screen.overlay);

  const particles = makeParticles(3200);
  const flashes = makeTileFlashes(24);
  scene.add(particles.points, flashes.mesh);

  const sky = makeSky();
  let w = 1;
  let h = 1;
  let dpr = 1;
  let clock = 0;
  let lastWall = -1e9;
  let quality: 'low' | 'high' | null = null;

  // World-dependent parts, built on the first frame and whenever the state object changes.
  let world: Readonly<WorldState> | null = null;
  let season: Season | -1 = -1;
  let terrain: Terrain | null = null;
  let props: Props | null = null;
  let fields: Fields | null = null;
  let crops: Crops | null = null;
  let builds: Builds | null = null;
  let markers: Markers | null = null;
  let actors: Actors | null = null;
  let weather: WeatherFx | null = null;
  let glow: Glow | null = null;
  let effects: Effects | null = null;
  let timers: TileTimers = makeTimers(1);
  let glowWisps = true;
  let W = 20;
  let H = 15;

  const disposeWorld = () => {
    for (const part of [fields, crops, builds, markers, actors, weather]) {
      if (!part) continue;
      scene.remove(part.group);
      part.dispose();
    }
    if (weather) scene.remove(weather.clouds);
    fields = crops = null;
    builds = null;
    markers = null;
    actors = null;
    weather = null;
    effects = null;
  };

  const buildSeason = (s: Readonly<WorldState>, sn: Season) => {
    if (terrain) {
      scene.remove(terrain.group);
      terrain.dispose();
    }
    if (props) {
      scene.remove(props.group);
      props.dispose();
    }
    if (glow) {
      scene.remove(glow.group);
      glow.dispose();
    }
    terrain = buildTerrain(s.tiles, s.W, s.H, sn, mats, waterMat);
    props = buildProps(sn, mats, glass, signMat);
    glow = buildGlow(props.lamps, s.W, s.H, glowWisps);
    scene.add(terrain.group, props.group, glow.group);
    season = sn;
    fields?.setSeason(sn);
  };

  const buildWorld = (s: Readonly<WorldState>, sn: Season) => {
    disposeWorld();
    world = s;
    W = s.W;
    H = s.H;
    timers = makeTimers(s.W * s.H);
    let fieldCount = 0;
    for (const t of s.tiles) if (t === 'field') fieldCount++;
    if (season !== sn || !terrain) buildSeason(s, sn);
    fields = buildFields(s, mats, signMat);
    fields.setSeason(sn);
    crops = buildCrops(s, mats);
    builds = buildBuilds(mats, Math.max(8, fieldCount));
    markers = buildMarkers(mats, Math.max(16, fieldCount));
    actors = buildActors(mats);
    weather = buildWeather(s.tiles, s.W, s.H);
    effects = makeEffects(particles, flashes, timers, crops, props!.crateMouth);
    scene.add(fields.group, crops.group, builds.group, markers.group, actors.group, weather.group, weather.clouds);
  };

  const setQuality = (q: 'low' | 'high') => {
    if (q === quality) return;
    quality = q;
    const size = q === 'high' ? 2048 : 1024;
    key.shadow.mapSize.set(size, size);
    key.shadow.radius = q === 'high' ? 3 : 1.5;
    if (key.shadow.map) {
      key.shadow.map.dispose();
      key.shadow.map = null;
    }
    const wantWisps = q === 'high';
    if (wantWisps !== glowWisps) {
      glowWisps = wantWisps;
      if (world && props) {
        if (glow) {
          scene.remove(glow.group);
          glow.dispose();
        }
        glow = buildGlow(props.lamps, world.W, world.H, glowWisps);
        scene.add(glow.group);
      }
    }
  };

  // Scratch, reused every frame.
  const anchor = new Vector3();
  const lightView = new Matrix4();
  const tmp = new Vector3();
  const upView = new Vector3();
  const glowCol = col('#ffbe6a');
  const glassDay = col('#41566a');
  const glassNight = col('#ffd27e');
  const boltLight = new Color(0.85, 0.9, 1);
  const tintHeat = new Vector3(1, 0.72, 0.4);
  const tintStorm = new Vector3(0.2, 0.26, 0.38);
  const tintNight = new Vector3(0.06, 0.09, 0.24);
  const dawnCol = new Vector3(1, 0.86, 0.66);
  const boltCol = new Vector3(0.85, 0.9, 1);
  const deepWater = new Vector3();
  const shallowWater = new Vector3();
  const wind = { x: 0.8, y: 0.35 };
  const perch = (x: number, y: number) => (crops && world ? crops.heightAt(world, y * world.W + x) : 0);

  /** Fits the shadow camera to the ground the camera can see, snapped to texels so shadows do not swim. */
  const fitShadow = () => {
    anchor.set(W / 2, 0, H / 2);
    key.position.copy(anchor).addScaledVector(sky.keyDir, 60);
    key.target.position.copy(anchor);
    key.updateMatrixWorld();
    key.target.updateMatrixWorld();
    lightView.lookAt(key.position, anchor, tmp.set(0, 1, 0));
    lightView.setPosition(key.position);
    lightView.invert();
    const g = rig.ground;
    const x0 = clamp(g[0], -0.8, W + 0.8);
    const x1 = clamp(g[2], -0.8, W + 0.8);
    const z0 = clamp(g[1], -0.8, H + 0.8);
    const z1 = clamp(g[3], -0.8, H + 0.8);
    let minX = 1e9;
    let maxX = -1e9;
    let minY = 1e9;
    let maxY = -1e9;
    for (let i = 0; i < 8; i++) {
      tmp.set(i & 1 ? x1 : x0, i & 4 ? 2.6 : -0.3, i & 2 ? z1 : z0).applyMatrix4(lightView);
      minX = Math.min(minX, tmp.x);
      maxX = Math.max(maxX, tmp.x);
      minY = Math.min(minY, tmp.y);
      maxY = Math.max(maxY, tmp.y);
    }
    // Coarse extents so the texel grid rarely changes, then snap the edges to it.
    const size = Math.max(4, Math.ceil(Math.max(maxX - minX, maxY - minY) / 2) * 2 + 2);
    const texel = size / key.shadow.mapSize.x;
    const cx = Math.round((minX + maxX) / 2 / texel) * texel;
    const cy = Math.round((minY + maxY) / 2 / texel) * texel;
    const cam = key.shadow.camera;
    if (cam.left !== cx - size / 2 || cam.right !== cx + size / 2 || cam.bottom !== cy - size / 2 || cam.top !== cy + size / 2) {
      cam.left = cx - size / 2;
      cam.right = cx + size / 2;
      cam.bottom = cy - size / 2;
      cam.top = cy + size / 2;
      cam.updateProjectionMatrix();
    }
  };

  let nanArmed = false;
  const arm = () => {
    armNaNWatch(scene);
    nanArmed = true;
  };
  const debug: Renderer3DDebug = {
    renderer,
    scene,
    afterFrame: null,
    profile: null,
    injectNaN(on, kind = 'opaque') {
      if (!nanArmed) arm();
      const bw = renderer.domElement.width;
      const bh = renderer.domElement.height;
      U.uNaNPlant.value.set(bw / 2, bh / 2, on ? 8 * Math.min(dpr, 2) : 0, kind === 'opaque' ? 1 : 2);
    },
    watchNaN(on) {
      if (on) arm();
      U.uNaNWatch.value = on ? 1 : 0;
    },
    stats() {
      const i = renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, programs: i.programs?.length ?? 0, textures: i.memory.textures, geometries: i.memory.geometries };
    },
  };

  let lap = 0;
  const mark = (name: string) => {
    const p = debug.profile;
    if (!p) return;
    const t = performance.now();
    if (lap) p[name] = (p[name] ?? 0) + t - lap;
    lap = t;
  };

  const frameImpl = (v: FrameView, snap: boolean) => {
    lap = 0;
    mark('');
    const s = v.state;
    const sn = v.season;
    if (s !== world) buildWorld(s, sn);
    else if (sn !== season) {
      buildSeason(s, sn);
    }
    setQuality(v.quality);
    const dt = snap ? 0 : clamp(v.dt, 0, 0.1);
    clock += dt;
    const now = clock;
    const high = v.quality === 'high';
    const weatherNow = s.weather;
    const winter = sn === 3;
    const wet = weatherNow === 'rain' || weatherNow === 'storm';

    // Wind.
    const ws = WIND[weatherNow];
    const dir = Math.sin(now * 0.05) * 0.3;
    wind.x = Math.cos(0.4 + dir) * ws;
    wind.y = Math.sin(0.4 + dir) * ws * 0.6;
    U.uWind.value.set(wind.x, wind.y);
    U.uGust.value = weatherNow === 'storm' ? 0.4 + Math.sin(now * 0.9) * 0.3 + Math.sin(now * 2.3) * 0.2 : Math.sin(now * 0.4) * 0.15;
    // Wrapped, so periodic shader animation never feeds sin() huge arguments in a long session.
    U.uTime.value = (v.reducedMotion ? now * 0.6 : now) % 600;

    // Sky, light and mist.
    computeSky(v.hour, v.daylight, weatherNow, sn, sky);
    const tFlash = now - (effects?.thunderAt ?? -1e6);
    const flash = tFlash >= 0 && tFlash < 0.9 ? Math.max(0, Math.sin(tFlash * 22)) * Math.exp(-tFlash * 5) + (tFlash > 0.18 && tFlash < 0.5 ? 0.6 * Math.exp(-(tFlash - 0.18) * 8) : 0) : 0;
    const flashK = v.reducedMotion ? 0.35 : 1;
    rig.update(v.camera, W, H, dt, snap);
    fitShadow();
    key.color.copy(sky.keyColor);
    key.intensity = sky.keyI + flash * 3.5 * flashK;
    if (flash > 0.05) key.color.lerp(boltLight, Math.min(1, flash));
    hemi.color.copy(sky.hemiSky);
    hemi.groundColor.copy(sky.hemiGround);
    hemi.intensity = sky.hemiI + flash * 1.5 * flashK;
    U.uMistColor.value.copy(sky.bgBottom);
    U.uMist.value.set(-0.35, -3.2, weatherNow === 'heat' ? 1 : 0.95, 0);
    const frost = SEASONS[sn].frost;
    U.uSnow.value = winter ? frost + (wet ? 0.4 : 0) : 0;
    upView.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    U.uUpView.value.copy(upView);

    // Screen layers.
    const bw = renderer.domElement.width;
    const bh = renderer.domElement.height;
    screen.bu.uRes.value.set(bw, bh);
    screen.ou.uRes.value.set(bw, bh);
    screen.bu.uTop.value.copy(sky.bgTop);
    screen.bu.uBottom.value.copy(sky.bgBottom);
    screen.bu.uTime.value = now % 600;
    screen.bu.uBolt.value = weatherNow === 'storm' || tFlash < 0.9 ? flash * flashK : 0;
    screen.bu.uBoltX.value = effects?.boltX ?? 0.5;
    screen.bu.uSeed.value = Math.floor((effects?.thunderAt ?? 0) * 10) % 97;
    const night = clamp(v.night, 0, 1);
    screen.ou.uNight.value = smooth(0, 1, night);
    const tDawn = now - (effects?.dawnAt ?? -1e6);
    const dawn = tDawn >= 0 && tDawn < 1.8 ? Math.sin((tDawn / 1.8) * Math.PI) * 0.22 : 0;
    const fv = screen.ou.uFlash.value;
    if (flash > 0.01) fv.set(boltCol.x, boltCol.y, boltCol.z, flash * 0.55 * flashK);
    else fv.set(dawnCol.x, dawnCol.y, dawnCol.z, dawn);
    const tv = screen.ou.uTint.value;
    if (weatherNow === 'heat') tv.set(tintHeat.x, tintHeat.y, tintHeat.z, 0.08 * v.daylight);
    // A wet dawn keeps less of the grey grade, so the crops can be read at 6 am.
    else if (weatherNow === 'storm') tv.set(tintStorm.x, tintStorm.y, tintStorm.z, 0.24 * (1 - 0.6 * stormDawn(v.daylight)));
    else if (weatherNow === 'rain') tv.set(tintStorm.x, tintStorm.y, tintStorm.z, 0.12 * (1 - 0.6 * stormDawn(v.daylight)));
    else tv.set(0, 0, 0, 0);
    // Moonlight grade: a cool wash after dusk that keeps the lamps warm by contrast.
    if (sky.glow > 0.01) {
      const na = 0.13 * sky.glow * (v.hour > 12 ? 1 : 0.25);
      const ta = tv.w;
      const sum = ta + na;
      tv.set((tv.x * ta + tintNight.x * na) / sum, (tv.y * ta + tintNight.y * na) / sum, (tv.z * ta + tintNight.z * na) / sum, Math.min(0.5, sum));
    }
    screen.ou.uVig.value = 0.18 + (1 - v.daylight) * 0.12;
    screen.ou.uHeat.value = weatherNow === 'heat' ? v.daylight : 0;
    screen.ou.uTime.value = now % 600;

    // Windows and lanterns.
    glass.color.copy(glassDay).lerp(glassNight, sky.glow * 0.6);
    glass.emissive.copy(glowCol).multiplyScalar(sky.glow * 1.25);
    const wl = 0.15 + 0.85 * Math.pow(clamp(v.daylight, 0, 1), 1.5);
    waterMat.uniforms.uLight.value = wl;
    (waterMat.uniforms.uSky.value as Vector3).copy(sky.bgTop);
    waterMat.uniforms.uIce.value = winter ? 0.75 : 0;
    deepWater.set(0.16, 0.38, 0.46);
    shallowWater.set(0.42, 0.66, 0.66);
    if (wet) {
      deepWater.multiplyScalar(0.8);
      shallowWater.lerp(sky.bgBottom, 0.3);
    }
    (waterMat.uniforms.uDeep.value as Vector3).copy(deepWater);
    (waterMat.uniforms.uShallow.value as Vector3).copy(shallowWater);

    mark('sky, camera, shadow fit');
    // The farm.
    const light = lerp(0.35, 1, v.daylight) * (wet ? 0.85 : 1);
    fields!.update(s, v.rules, v.soilOverlay, timers.wet, now);
    mark('fields');
    crops!.update(s, now, timers, v.showQuality);
    mark('crops');
    builds!.update(s, now, timers);
    markers!.update(v, now);
    mark('builds, markers');
    effects!.setScale(high ? 1 : 0.6, v.reducedMotion);
    actors!.update(s, now, dt, effects!.emitter, v.reducedMotion, perch);
    mark('actors');
    effects!.update(now, dt, props!.chimney, v.hour, wind);
    flashes.update(now);
    const px = rig.pixelScale() * Math.min(dpr, 2);
    particles.update(now, px, light);
    weather!.update({ now, dt, weather: weatherNow, season: sn, hour: v.hour, daylight: v.daylight, center: rig.target, halfW: rig.span.halfW, halfD: rig.span.halfD, high, reduced: v.reducedMotion, light });
    weather!.clouds.visible = high || weatherNow === 'cloud';
    glow!.update(now, sky.glow, px, v.daylight);
    mark('effects, weather, glow');

    // Materials made after the sentinel was armed (badges, rebuilt seasons) get it too.
    if (nanArmed && Math.floor(now * 2) !== Math.floor((now - dt) * 2)) armNaNWatch(scene);
    renderer.render(scene, camera);
    mark('render (three)');
    rig.commit();
    if (debug.afterFrame) debug.afterFrame(renderer.getContext() as WebGL2RenderingContext);
  };

  const self: Renderer & { debug: Renderer3DDebug } = {
    kind: '3d',
    canvas,
    debug,
    resize(cw, ch, r) {
      w = Math.max(1, cw);
      h = Math.max(1, ch);
      dpr = Math.min(Math.max(0.5, r || 1), 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      rig.resize(w, h);
    },
    frame(v) {
      lastWall = performance.now();
      frameImpl(v, false);
    },
    onEvent(e: SimEvent, state: Readonly<WorldState>) {
      // Hidden or not built yet: effects would only play late, so skip them.
      if (!effects || state !== world || performance.now() - lastWall > 250) return;
      effects.onEvent(e, state);
    },
    pick(px, py) {
      return rig.pick(px, py, W, H);
    },
    project(x, y, height = 0) {
      return rig.project(x, y, height);
    },
    snap(v) {
      if (v.state !== world) buildWorld(v.state, v.season);
      W = v.state.W;
      H = v.state.H;
      rig.update(v.camera, W, H, 0, true);
    },
    dispose() {
      disposeWorld();
      terrain?.dispose();
      props?.dispose();
      glow?.dispose();
      screen.dispose();
      particles.dispose();
      for (const m of Object.values(mats)) m.dispose();
      waterMat.dispose();
      glass.dispose();
      signMat.map?.dispose();
      signMat.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
    },
  };
  return self;
}
