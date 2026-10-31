// The almanac page: the farm painted into an old farmer's almanac. Warm paper,
// watercolour washes, wobbly ink and cross-hatched shadow, seen three-quarter
// top-down: tiles square on the page, crops, people and buildings upright and
// sorted down the page. See docs/ART_DIRECTION.md.
//
// A frame is: paper, the cached ground (multiplied in like a wash), ground
// effects, the sorted uprights, the cached south hedge, things in the air,
// weather, the light of the hour, then the readouts that must stay legible.

import type { FrameView, Renderer } from '../contract';
import { CROW_PECK_MINUTES, CROW_FLY_SECONDS } from '../sim/constants';
import { CROP_IDS } from '../sim/crops';
import { PROPS } from '../sim/map';
import type { SimEvent, WorldState } from '../sim/types';
import { drawActor, drawCrow, crowPose, type ActorStyle } from './actors';
import { HEIGHT_K, PageCamera, type Drawn } from './camera';
import type { RGB } from './color';
import { CROP_TOP, cropHeight } from './crops';
import { Fx } from './fx';
import { Ground, wetLevel } from './ground';
import { drawHighlight, drawJobs, drawPip, drawSoil, drawWord, type OverlayStyle } from './overlay';
import { PALETTES } from './palette';
import { makeGrain, makePaper } from './paper';
import { CHIMNEY, LIGHTS, STOVEPIPE } from './props';
import { hashf } from './rng';
import { drawWeather, glowOf, lightColor, lightCss, makeCloud, makeGlow, type SkyView } from './sky';
import { cropKey, K_BOARD, K_BUNK, K_CRATE, K_HOUSE, K_PRODUCE, K_SCARECROW, K_SPRINKLER, Sprites, type Sprite } from './sprites';

/** Where a crop stands in its tile: centre, a little below the middle. */
const CROP_BASE = 0.68;
const BUCKETS = [24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192];
const GROUND_MAX = 128;
const WIND: Record<string, number> = { sun: 1, cloud: 1.3, rain: 1.8, storm: 3.4, heat: 0.6 };

function bucketFor(devPerTile: number, cap: number): number {
  for (let i = 0; i < BUCKETS.length; i++) if (BUCKETS[i] >= devPerTile * 0.92 && BUCKETS[i] <= cap) return BUCKETS[i];
  return Math.min(cap, BUCKETS[BUCKETS.length - 1]);
}

// Kinds of upright, for the y-sorted pass.
const U_PROP = 0;
const U_CROP = 1;
const U_BUILD = 2;
const U_ACTOR = 3;
const U_CROW = 4;
const MAX_UP = 1024;

export function createRenderer2D(): Renderer {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'The farm, painted as an almanac page');
  const ctx = canvas.getContext('2d', { alpha: false })!;
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  const cam = new PageCamera();
  const drawn: Drawn = { ox: 0, oy: 0, scale: 32 };
  let mapW = 20;
  let mapH = 15;
  let snapNext = true;

  let state: Readonly<WorldState> | null = null;
  let ground: Ground | null = null;
  const sprites = new Sprites();
  const fx = new Fx();
  let lastWall = 0;
  let fontsReady = false;
  if (typeof document !== 'undefined' && document.fonts) {
    void document.fonts
      .load("italic 500 100px 'Fraunces Variable'")
      .then(() => document.fonts.load("italic 700 100px 'Fraunces Variable'"))
      .then(() => (fontsReady = true))
      .catch(() => (fontsReady = true));
  }

  // Bucket choice, debounced so a pinch does not repaint every frame.
  let gBucket = 0;
  let sBucket = 0;
  let wantG = 0;
  let wantS = 0;
  let wantSince = 0;

  // Paper per season, the glow and cloud sprites, the vignette.
  const papers: (CanvasPattern | null)[] = [null, null, null, null];
  const paperM = new DOMMatrix();
  const hatchM = new DOMMatrix();
  const glow = makeGlow();
  let grain: CanvasPattern | null = null;
  const grainM = new DOMMatrix();
  const cloud = makeCloud();
  let vignette: CanvasGradient | null = null;
  // Blue pen hatching for the soil readout, denser as the soil gets wetter.
  const wetHatch: (CanvasPattern | null)[] = [null, null, null, null];
  let wetHatchDpr = 0;
  const hatchFor = (lvl: number): CanvasPattern | null => {
    if (wetHatchDpr !== dpr) {
      wetHatch.fill(null);
      wetHatchDpr = dpr;
    }
    let p = wetHatch[lvl];
    if (!p) {
      const gap = Math.round([0, 11, 7, 4.5][lvl] * dpr);
      const c = document.createElement('canvas');
      c.width = c.height = gap;
      const g = c.getContext('2d')!;
      g.strokeStyle = lvl === 3 ? 'rgba(30,96,190,0.7)' : 'rgba(30,96,190,0.6)';
      g.lineWidth = 1.3 * dpr;
      g.beginPath();
      for (const o of [-gap, 0, gap]) {
        g.moveTo(o, gap);
        g.lineTo(o + gap, 0);
      }
      g.stroke();
      p = ctx.createPattern(c, 'repeat');
      wetHatch[lvl] = p;
    }
    return p;
  };

  // Per-farm lists.
  let puddleTiles = new Int32Array(0);
  let fieldTiles = new Int32Array(0);

  // The y-sorted list, preallocated.
  const upKey = new Float64Array(MAX_UP);
  const upKind = new Uint8Array(MAX_UP);
  const upRef = new Int32Array(MAX_UP);
  const upOrder = new Int32Array(MAX_UP);
  const pose = new Float32Array(5);
  const light: RGB = [255, 255, 255];
  const actorStyle: ActorStyle = { ink: '#3a2d20', lw: 0.02 };
  const ov: OverlayStyle = { ink: '#3a2d20', px: 0.02, t: 0, tilePx: 32, dark: 0 };
  const sky: SkyView = { w: 1, h: 1, t: 0, dpr: 1, weather: 'sun', season: 0, snow: false, reduced: false, ox: 0, oy: 0 };

  const reset = (s: Readonly<WorldState>) => {
    state = s;
    mapW = s.W;
    mapH = s.H;
    if (!ground) ground = new Ground(s.W, s.H);
    fx.reset(s);
    const pt: number[] = [];
    const ft: number[] = [];
    for (let i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] === 'path' || s.tiles[i] === 'yard') pt.push(i);
      if (s.tiles[i] === 'field') ft.push(i);
    }
    puddleTiles = new Int32Array(pt);
    fieldTiles = new Int32Array(ft);
  };

  const paperFor = (season: number): CanvasPattern => {
    let p = papers[season];
    if (!p) {
      const pal = PALETTES[season];
      p = ctx.createPattern(makePaper(pal.paper, pal.paperDeep, 17 + season), 'repeat')!;
      papers[season] = p;
    }
    return p;
  };

  const frameCamera = (v: FrameView, dt: number) => {
    cam.w = cssW;
    cam.h = cssH;
    cam.target(v.camera, v.state.W, v.state.H);
    if (snapNext) {
      cam.snap();
      snapNext = false;
    } else cam.step(dt);
    drawn.ox = cam.ox;
    drawn.oy = cam.oy;
    drawn.scale = cam.scale;
  };

  const chooseBuckets = (now: number) => {
    const dev = cam.ts * dpr;
    const g = bucketFor(dev, GROUND_MAX);
    const s = bucketFor(dev, 192);
    if (gBucket === 0) {
      gBucket = g;
      sBucket = s;
      wantG = g;
      wantS = s;
      return;
    }
    if (g !== wantG || s !== wantS) {
      wantG = g;
      wantS = s;
      wantSince = now;
    } else if ((g !== gBucket || s !== sBucket) && now - wantSince > 0.2) {
      gBucket = g;
      sBucket = s;
    }
  };

  const drawSprite = (sp: Sprite, bx: number, by: number, S: number, OX: number, OY: number, sx = 1, sy = 1, skew = 0) => {
    ctx.setTransform(S * sx, 0, skew * S, S * sy, OX + bx * S, OY + by * S);
    ctx.drawImage(sp.canvas, sp.x0, sp.y0, sp.w, sp.h);
  };

  function frame(v: FrameView): void {
    const s = v.state;
    if (s !== state) reset(s);
    const wall = performance.now();
    if (wall - lastWall > 400) {
      // Back from hidden: the page starts clean.
      fx.awake = true;
    }
    lastWall = wall;
    fx.reduced = v.reducedMotion;
    const dt = Math.min(0.1, Math.max(0, v.dt));
    const t = v.t;
    frameCamera(v, dt);
    const pal = PALETTES[v.season];
    const snow = v.season === 3 && (s.weather === 'rain' || s.weather === 'storm');
    chooseBuckets(fx.clock);
    ground!.update(s, v.rules, pal, snow, gBucket, fontsReady);
    sprites.setup(sBucket, pal, snow);
    sprites.work(3);
    fx.night = v.night;
    fx.releaseGrowth(s);
    fx.step(dt, s.weather === 'storm' ? 1.5 : 0.3);

    const W = canvas.width;
    const H = canvas.height;
    const S = cam.scale * dpr;
    const OX = cam.ox * dpr;
    const OY = cam.oy * dpr;
    const px = 1 / S;
    const ink = pal.ink;
    const wind = WIND[s.weather] ?? 1;
    // Visible tile range, with room for things that reach up the page.
    const vx0 = Math.floor(-OX / S) - 1;
    const vx1 = Math.ceil((W - OX) / S) + 1;
    const vy0 = Math.floor(-OY / S) - 1;
    const vy1 = Math.ceil((H - OY) / S) + 3;

    // 1. Paper, anchored to the page so it moves with the farm.
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const paper = paperFor(v.season);
    paperM.a = paperM.d = dpr * 1.25;
    paperM.e = OX % (256 * dpr * 1.25);
    paperM.f = OY % (256 * dpr * 1.25);
    paper.setTransform(paperM);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);

    // 2. The ground, laid in like a wash.
    const back = ground!.back;
    const front = ground!.front;
    ctx.setTransform(S, 0, 0, S, OX, OY);
    ctx.imageSmoothingQuality = 'high';
    if (back.canvas) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(back.canvas, back.b.x0, back.b.y0, back.b.x1 - back.b.x0, back.b.y1 - back.b.y0);
      ctx.globalCompositeOperation = 'source-over';
    }

    // 3. On the ground: fresh water soaking in, the soil readout wash, puddle rings, splash rings.
    for (let k = 0; k < fieldTiles.length; k++) {
      const i = fieldTiles[k];
      const e = (fx.clock - fx.wet[i]) / 0.7;
      if (e < 0 || e > 1) continue;
      const x = i % s.W;
      const y = (i - x) / s.W;
      ctx.beginPath();
      ctx.ellipse(x + 0.5, y + 0.55, 0.2 + e * 0.45, 0.14 + e * 0.38, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(70,48,30,0.4)';
      ctx.globalAlpha = 1 - e * e;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (v.soilOverlay) {
      for (let lvl = 1; lvl <= 3; lvl++) {
        ctx.beginPath();
        let any = false;
        for (let k = 0; k < fieldTiles.length; k++) {
          const i = fieldTiles[k];
          const pl = s.plots[i];
          if (!pl.tilled) continue;
          const m = v.rules.growth === 'synergy' ? Math.round(pl.moisture) : wetLevel(v.rules, s, i);
          if (Math.min(3, m) !== lvl) continue;
          const x = i % s.W;
          const y = (i - x) / s.W;
          ctx.rect(x + 0.02, y + 0.02, 0.96, 0.96);
          any = true;
        }
        const pat = any ? hatchFor(lvl) : null;
        if (pat) {
          // Undo the tile scale so the strokes keep a pen's spacing at any zoom,
          // anchored to the page so they move with it.
          hatchM.a = hatchM.d = 1 / S;
          pat.setTransform(hatchM);
          ctx.fillStyle = pat;
          ctx.fill();
        }
      }
    }
    if ((s.weather === 'rain' || s.weather === 'storm') && !snow && puddleTiles.length) {
      ctx.beginPath();
      const n = s.weather === 'storm' ? 60 : 40;
      for (let k = 0; k < n; k++) {
        const ph = t * 1.1 + hashf(k, 1);
        const cyc = Math.floor(ph);
        const e = ph - cyc;
        const i = puddleTiles[Math.floor(hashf(k, cyc, 2) * puddleTiles.length)];
        const x = (i % s.W) + 0.15 + hashf(k, cyc, 3) * 0.7;
        const y = Math.floor(i / s.W) + 0.15 + hashf(k, cyc, 4) * 0.7;
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        const r = 0.05 + e * 0.22;
        ctx.moveTo(x + r, y);
        ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
        if (e > 0.25) {
          const r2 = r * 0.55;
          ctx.moveTo(x + r2, y);
          ctx.ellipse(x, y, r2, r2 * 0.42, 0, 0, Math.PI * 2);
        }
      }
      ctx.strokeStyle = 'rgba(60,90,135,0.6)';
      ctx.lineWidth = Math.max(px * 1.4, 0.025);
      ctx.stroke();
    }
    fx.drawGround(ctx, px);
    // Crow shadows on the ground while they fly.
    for (let k = 0; k < s.crows.length; k++) {
      const c = s.crows[k];
      if (c.phase !== 'in' && c.phase !== 'flee') continue;
      if (!crowPose(c, CROW_FLY_SECONDS, 0, pose)) continue;
      const sh = Math.max(0.25, 1 - pose[2] * 0.22);
      ctx.beginPath();
      ctx.ellipse(pose[0], pose[1], 0.16 * sh, 0.05 * sh, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40,30,22,0.22)';
      ctx.fill();
    }

    // 4. Uprights, sorted down the page.
    let n = 0;
    for (let k = 0; k < PROPS.length && n < MAX_UP; k++) {
      const p = PROPS[k];
      upKey[n] = p.y + p.h - 0.001;
      upKind[n] = U_PROP;
      upRef[n++] = k;
    }
    for (let k = 0; k < fieldTiles.length && n < MAX_UP; k++) {
      const i = fieldTiles[k];
      if (!s.plots[i].crop) continue;
      const x = i % s.W;
      const y = (i - x) / s.W;
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      upKey[n] = y + CROP_BASE;
      upKind[n] = U_CROP;
      upRef[n++] = i;
    }
    for (let k = 0; k < s.builds.length && n < MAX_UP; k++) {
      upKey[n] = s.builds[k].y + 0.72;
      upKind[n] = U_BUILD;
      upRef[n++] = k;
    }
    for (let k = 0; k < s.actors.length && n < MAX_UP; k++) {
      if (s.actors[k].away) continue;
      upKey[n] = s.actors[k].y;
      upKind[n] = U_ACTOR;
      upRef[n++] = k;
    }
    for (let k = 0; k < s.crows.length && n < MAX_UP; k++) {
      if (s.crows[k].phase !== 'peck') continue;
      upKey[n] = s.crows[k].y + 0.7;
      upKind[n] = U_CROW;
      upRef[n++] = k;
    }
    for (let k = 0; k < n; k++) {
      let j = k;
      const key = upKey[k];
      while (j > 0 && upKey[upOrder[j - 1]] > key) {
        upOrder[j] = upOrder[j - 1];
        j--;
      }
      upOrder[j] = k;
    }
    actorStyle.ink = ink;
    actorStyle.lw = Math.max(px * 1.0, 0.017);
    let stockN = 0;
    for (let k = 0; k < CROP_IDS.length; k++) {
      const q = s.stock[CROP_IDS[k]];
      if (q) stockN += q[0] + q[1] + q[2] + q[3];
    }
    for (let k = 0; k < n; k++) {
      const u = upOrder[k];
      const kind = upKind[u];
      const ref = upRef[u];
      if (kind === U_PROP) {
        const p = PROPS[ref];
        const key = p.kind === 'house' ? K_HOUSE : p.kind === 'bunkhouse' ? K_BUNK : p.kind === 'crate' ? K_CRATE + (stockN === 0 ? 0 : stockN < 12 ? 1 : 2) : K_BOARD + Math.max(2, Math.min(5, s.orders.length + 2));
        drawSprite(sprites.get(key), p.x, p.y + p.h, S, OX, OY);
      } else if (kind === U_CROP) {
        const i = ref;
        const c = s.plots[i].crop!;
        const x = i % s.W;
        const y = (i - x) / s.W;
        const tall = CROP_TOP[c.kind] > 1;
        const sp = sprites.get(cropKey(c.kind, c.stage, c.dead, (x * 7 + y * 13) & 1));
        let sx = 1;
        let sy = 1;
        const b = fx.clock - fx.bounce[i];
        if (b >= 0 && b < 0.6) {
          const e = b / 0.6;
          const a = 0.24 * (1 - e) * Math.sin(e * Math.PI * 3);
          sy = 1 + a;
          sx = 1 - a * 0.5;
        }
        const wt = fx.clock - fx.wither[i];
        if (wt >= 0 && wt < 0.9) sy *= 1 - 0.16 * Math.sin((wt / 0.9) * Math.PI);
        const sway = c.dead ? 0 : Math.sin(t * (1.3 + (c.stage === 4 ? 0.5 : 0)) + x * 0.9 + y * 1.7) * (tall ? 0.04 : 0.016) * wind * (v.reducedMotion ? 0.4 : 1);
        drawSprite(sp, x + 0.5, y + CROP_BASE, S, OX, OY, sx, sy, sway);
        if (c.bugs > 0 && !c.dead) {
          // Beetles on the leaves; more as the infestation grows.
          ctx.setTransform(S, 0, 0, S, OX + (x + 0.5) * S, OY + (y + CROP_BASE) * S);
          const nb = c.bugs >= 3 ? 7 : c.bugs === 2 ? 4 : 2;
          const hh = cropHeight(c.kind, c.stage);
          ctx.beginPath();
          for (let j = 0; j < nb; j++) {
            const bx = (hashf(i, j, 1) - 0.5) * 0.5 + Math.sin(t * 1.5 + j * 2) * 0.025;
            const by = -0.04 - hashf(i, j, 2) * Math.min(0.6, hh) + Math.cos(t * 1.2 + j) * 0.015;
            ctx.moveTo(bx + 0.035, by);
            ctx.ellipse(bx, by, 0.035, 0.026, hashf(i, j, 3) * 3, 0, Math.PI * 2);
          }
          ctx.fillStyle = '#2a2420';
          ctx.fill();
          ctx.strokeStyle = '#f2e8cf';
          ctx.lineWidth = Math.max(px * 0.8, 0.008);
          ctx.stroke();
          ctx.beginPath();
          for (let j = 0; j < nb; j++) {
            const bx = (hashf(i, j, 1) - 0.5) * 0.5 + Math.sin(t * 1.5 + j * 2) * 0.025;
            const by = -0.04 - hashf(i, j, 2) * Math.min(0.6, hh) + Math.cos(t * 1.2 + j) * 0.015;
            ctx.moveTo(bx - 0.005 + 0.012, by - 0.008);
            ctx.arc(bx - 0.005, by - 0.008, 0.012, 0, Math.PI * 2);
          }
          ctx.fillStyle = '#b8432e';
          ctx.fill();
        }
      } else if (kind === U_BUILD) {
        const bd = s.builds[ref];
        const i = bd.y * s.W + bd.x;
        let sx = 1;
        let sy = 1;
        const b = fx.clock - fx.bounce[i];
        if (b >= 0 && b < 0.6) {
          const e = b / 0.6;
          const a = 0.3 * (1 - e) * Math.sin(e * Math.PI * 3);
          sy = 1 + a;
          sx = 1 - a * 0.5;
        }
        if (bd.kind === 'scarecrow') {
          const sway = Math.sin(t * 1.1 + bd.x) * 0.02 * wind * (v.reducedMotion ? 0.4 : 1);
          drawSprite(sprites.get(K_SCARECROW), bd.x + 0.5, bd.y + 0.74, S, OX, OY, sx, sy, sway);
        } else {
          drawSprite(sprites.get(K_SPRINKLER), bd.x + 0.5, bd.y + 0.66, S, OX, OY, sx, sy);
          // The spinning arm.
          ctx.setTransform(S, 0, 0, S, OX + (bd.x + 0.5) * S, OY + (bd.y + 0.66 - 0.33 * sy) * S);
          const a = t * 2.6 + bd.id;
          ctx.beginPath();
          ctx.moveTo(-Math.cos(a) * 0.12, -Math.sin(a) * 0.035);
          ctx.lineTo(Math.cos(a) * 0.12, Math.sin(a) * 0.035);
          ctx.strokeStyle = ink;
          ctx.lineWidth = Math.max(px * 2, 0.03);
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 0.12, Math.sin(a) * 0.035, 0.022, 0, Math.PI * 2);
          ctx.fillStyle = '#c8a04a';
          ctx.fill();
        }
      } else if (kind === U_ACTOR) {
        const a = s.actors[ref];
        ctx.setTransform(S, 0, 0, S, OX + a.x * S, OY + a.y * S);
        drawActor(ctx, a, t, actorStyle);
      } else {
        const c = s.crows[ref];
        const ch = s.plots[c.y * s.W + c.x]?.crop;
        if (!crowPose(c, CROW_FLY_SECONDS, 0, pose)) continue;
        ctx.setTransform(S, 0, 0, S, OX + pose[0] * S, OY + pose[1] * S);
        const rate = 5 + 7 * Math.min(1, c.t / CROW_PECK_MINUTES);
        const peck = Math.pow(Math.max(0, Math.sin(t * rate + c.id)), 3);
        drawCrow(ctx, 0, pose[3], 0, false, ch ? peck : 0, actorStyle);
      }
    }

    // 5. The hedge and trees along the south edge stand in front of everything.
    if (front.canvas) {
      ctx.setTransform(S, 0, 0, S, OX, OY);
      ctx.drawImage(front.canvas, front.b.x0, front.b.y0, front.b.x1 - front.b.x0, front.b.y1 - front.b.y0);
    }

    // 6. In the air: chimney smoke, crows on the wing, harvests flying to the crate, particles.
    ctx.setTransform(S, 0, 0, S, OX, OY);
    const smokeK = Math.max(v.hour < 9 ? 1 : v.hour < 10.5 ? (10.5 - v.hour) / 1.5 : 0, v.season === 3 ? 0.7 : 0);
    if (smokeK > 0.01) {
      const house = PROPS[0];
      const bunk = PROPS[3];
      let hands = false;
      for (let k = 0; k < s.actors.length; k++) if (s.actors[k].role === 'hand' && !s.actors[k].away) hands = true;
      for (let src = 0; src < (hands ? 2 : 1); src++) {
        const sx0 = src === 0 ? house.x + CHIMNEY.x : bunk.x + STOVEPIPE.x;
        const sy0 = src === 0 ? house.y + house.h + CHIMNEY.y : bunk.y + bunk.h + STOVEPIPE.y;
        for (let k = 0; k < 7; k++) {
          const e = (t * 0.28 + k / 7) % 1;
          const x = sx0 + e * 0.9 * wind * 0.6 + Math.sin(e * 5 + k + src) * 0.1;
          const y = sy0 - e * 1.7;
          const r = 0.07 + e * 0.24;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.globalAlpha = (1 - e) * 0.6 * smokeK * Math.min(1, e * 8);
          ctx.fillStyle = '#e9e4da';
          ctx.fill();
          ctx.lineWidth = Math.max(px, 0.015);
          ctx.strokeStyle = pal.inkSoft;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    for (let k = 0; k < s.crows.length; k++) {
      const c = s.crows[k];
      if (c.phase !== 'in' && c.phase !== 'flee') continue;
      if (!crowPose(c, CROW_FLY_SECONDS, 0, pose)) continue;
      ctx.setTransform(S, 0, 0, S, OX + pose[0] * S, OY + (pose[1] - pose[2] * HEIGHT_K) * S);
      drawCrow(ctx, 0, pose[3], t * 16 + c.id, true, 0, actorStyle);
    }
    ctx.setTransform(S, 0, 0, S, OX, OY);
    const crate = PROPS[1];
    for (let k = 0; k < 16; k++) {
      if (fx.arcT[k] < 0) continue;
      const e = (fx.clock - fx.arcT[k]) / 0.85;
      if (e >= 1) {
        fx.arcT[k] = -1;
        fx.sparkle(crate.x + 0.5, crate.y + 0.7, fx.arcQ[k]);
        continue;
      }
      if (e < 0) continue;
      const tx = crate.x + 0.5;
      const ty = crate.y + 0.75;
      const k2 = e < 0.2 ? 0 : (e - 0.2) / 0.8;
      const ease = k2 * k2 * (3 - 2 * k2);
      const x = fx.arcX[k] + (tx - fx.arcX[k]) * ease;
      const y = fx.arcY[k] + (ty - fx.arcY[k]) * ease;
      const z = fx.arcH[k] + (e < 0.2 ? (e / 0.2) * 0.5 : 0.5 + Math.sin(Math.PI * k2) * 1.4 - k2 * 0.2);
      const sp = sprites.get(K_PRODUCE + fx.arcKind[k]);
      const sc = 1.15 - k2 * 0.35;
      ctx.setTransform(S * sc, 0, 0, S * sc, OX + x * S, OY + (y - z) * S);
      ctx.rotate(e * 2.2);
      ctx.drawImage(sp.canvas, sp.x0, sp.y0, sp.w, sp.h);
      if (fx.arcQ[k] > 0 && ((t * 12) | 0) % 2 === 0) {
        ctx.setTransform(S, 0, 0, S, OX + x * S, OY + (y - z) * S);
        ctx.beginPath();
        ctx.arc(0.18, -0.18, 0.04, 0, Math.PI * 2);
        ctx.fillStyle = fx.arcQ[k] >= 2 ? '#f2c84a' : '#e8eef4';
        ctx.fill();
      }
    }
    ctx.setTransform(S, 0, 0, S, OX, OY);
    fx.drawAir(ctx, px, ink);

    // 7. Weather, in screen space.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    sky.w = W;
    sky.h = H;
    sky.t = t;
    sky.dpr = dpr;
    sky.weather = s.weather;
    sky.season = v.season;
    sky.snow = snow;
    const low = v.quality === 'low';
    sky.reduced = v.reducedMotion || low;
    sky.ox = OX;
    sky.oy = OY;
    drawWeather(ctx, sky);

    // 8. The light of the hour, over everything painted.
    lightColor(v.hour, v.daylight, s.weather, snow, light);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = lightCss(light);
    ctx.fillRect(0, 0, W, H);
    if (vignette && !low) {
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    }
    if (s.weather !== 'sun' && s.weather !== 'heat') {
      // Cloud shadows drift across the page.
      ctx.setTransform(S, 0, 0, S, OX, OY);
      const n2 = s.weather === 'cloud' ? 3 : 4;
      ctx.globalAlpha = s.weather === 'cloud' ? 0.2 : s.weather === 'storm' ? 0.34 : 0.28;
      for (let k = 0; k < n2; k++) {
        const span = mapW + 16;
        const x = (((k * 7.3 + t * 0.35 * wind) % span) + span) % span - 8;
        const y = (k * 4.1 + 1) % (mapH + 2) - 2;
        ctx.drawImage(cloud, x, y, 9, 5.6);
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    const g = glowOf(v.daylight, s.weather);
    if (g > 0.01) {
      ctx.setTransform(S, 0, 0, S, OX, OY);
      ctx.globalCompositeOperation = 'lighter';
      for (let pi = 0; pi < PROPS.length; pi++) {
        const p = PROPS[pi];
        const L = LIGHTS[p.kind];
        for (let li = 0; li < L.length; li++) {
          const lx = L[li][0];
          const ly = L[li][1];
          const lr = L[li][2];
          const lk = L[li][3];
          const x = p.x + lx;
          const y = p.y + p.h + ly;
          const flick = lk === 1 ? 0.9 + 0.1 * Math.sin(t * 9 + x * 3) : 1;
          ctx.globalAlpha = g * (lk === 1 ? 0.75 : 0.55) * flick;
          ctx.drawImage(glow, x - lr, y - lr, lr * 2, lr * 2);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      // The panes and flames themselves.
      for (let pi = 0; pi < PROPS.length; pi++) {
        const p = PROPS[pi];
        const L = LIGHTS[p.kind];
        for (let li = 0; li < L.length; li++) {
          const lx = L[li][0];
          const ly = L[li][1];
          const lk = L[li][3];
          const x = p.x + lx;
          const y = p.y + p.h + ly;
          ctx.globalAlpha = g * 0.9;
          ctx.fillStyle = lk === 1 ? '#fff2b8' : '#ffd77a';
          ctx.beginPath();
          if (lk === 1) ctx.arc(x, y + 0.01, 0.035, 0, Math.PI * 2);
          else if (p.kind === 'house' && ly < -0.9) ctx.arc(x, y, 0.1, 0, Math.PI * 2);
          else ctx.rect(x - (p.kind === 'house' ? 0.18 : 0.15), y - 0.17, p.kind === 'house' ? 0.36 : 0.3, p.kind === 'house' ? 0.36 : 0.28);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // The print grain over the gouache too.
    // The grain stays on low quality: phones run low, and the paper is the look.
    if (!grain) grain = ctx.createPattern(makeGrain(5), 'repeat');
    if (grain) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      grainM.a = grainM.d = dpr;
      grainM.e = OX % (256 * dpr);
      grainM.f = OY % (256 * dpr);
      grain.setTransform(grainM);
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (s.weather === 'heat') {
      // A bleached, hazy light.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = '#5a4a28';
      ctx.globalAlpha = 0.18 * v.daylight;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Lightning and the soft lift of dawn.
    const th = fx.clock - fx.thunderT;
    if (th >= 0 && th < 0.55) {
      const f = th < 0.08 ? 1 : th < 0.16 ? 0.35 : th < 0.24 ? 0.85 : (1 - (th - 0.24) / 0.31) * 0.7;
      ctx.fillStyle = '#fbfbff';
      ctx.globalAlpha = Math.max(0, f) * (v.reducedMotion ? 0.3 : 0.7);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    const dw = fx.clock - fx.dawnT;
    if (dw >= 0 && dw < 1.8) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = '#ffe6bf';
      ctx.globalAlpha = 0.4 * (1 - dw / 1.8);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 9. Readouts that must stay legible: soil, pips, jobs, the aimed tile, words.
    ctx.setTransform(S, 0, 0, S, OX, OY);
    ov.ink = ink;
    ov.px = px;
    ov.t = t;
    ov.tilePx = cam.scale;
    ov.dark = 1 - v.daylight;
    ctx.globalAlpha = 1;
    const readoutAlpha = 1 - Math.max(0, 0.7 - v.daylight) * 0.35;
    if (v.soilOverlay) {
      for (let k = 0; k < fieldTiles.length; k++) {
        const i = fieldTiles[k];
        const pl = s.plots[i];
        if (!pl.tilled) continue;
        const x = i % s.W;
        const y = (i - x) / s.W;
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        const m = v.rules.growth === 'synergy' ? Math.max(0, Math.min(3, Math.round(pl.moisture))) : wetLevel(v.rules, s, i);
        drawSoil(ctx, x, y, m, Math.max(0, Math.min(3, Math.round(pl.nutrient))), ov);
      }
    }
    if (v.showQuality) {
      for (let k = 0; k < fieldTiles.length; k++) {
        const i = fieldTiles[k];
        const c = s.plots[i].crop;
        if (!c || c.dead || c.quality <= 0) continue;
        const x = i % s.W;
        const y = (i - x) / s.W;
        ctx.globalAlpha = readoutAlpha;
        drawPip(ctx, x + 0.84, y + 0.22, c.quality, ov);
        ctx.globalAlpha = 1;
      }
    }
    if (s.jobs.length) drawJobs(ctx, s, ov);
    for (let k = 0; k < fieldTiles.length; k++) {
      const i = fieldTiles[k];
      const e = (fx.clock - fx.deny[i]) / 0.5;
      if (e < 0 || e > 1) continue;
      const x = i % s.W;
      const y = (i - x) / s.W;
      ctx.beginPath();
      ctx.rect(x + 0.04, y + 0.04, 0.92, 0.92);
      ctx.fillStyle = 'rgba(192,57,43,0.35)';
      ctx.globalAlpha = 1 - e;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const hl = v.highlight;
    if (hl && hl.x >= 0 && hl.y >= 0 && hl.x < s.W && hl.y < s.H) {
      const d = fx.clock - (fx.deny[hl.y * s.W + hl.x] ?? -10);
      drawHighlight(ctx, hl.x, hl.y, hl.verb, hl.ok, ov, d >= 0 && d < 0.4 && !v.reducedMotion ? 1 - d / 0.4 : 0);
    }
    // Deny elsewhere still shakes a red mark.
    for (let i = 0; i < fx.deny.length; i++) {
      const e = (fx.clock - fx.deny[i]) / 0.5;
      if (e < 0 || e > 1) continue;
      const x = i % s.W;
      const y = (i - x) / s.W;
      if (hl && hl.x === x && hl.y === y) continue;
      const sh = v.reducedMotion ? 0 : Math.sin(t * 60) * 0.04 * (1 - e);
      ctx.beginPath();
      ctx.moveTo(x + 0.3 + sh, y + 0.3);
      ctx.lineTo(x + 0.7 + sh, y + 0.7);
      ctx.moveTo(x + 0.7 + sh, y + 0.3);
      ctx.lineTo(x + 0.3 + sh, y + 0.7);
      ctx.strokeStyle = '#c0392b';
      ctx.globalAlpha = 1 - e;
      ctx.lineWidth = Math.max(px * 2.5, 0.06);
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (let k = 0; k < 8; k++) {
      if (fx.wordT[k] < 0) continue;
      const e = (fx.clock - fx.wordT[k]) / 1.3;
      if (e >= 1) {
        fx.wordT[k] = -1;
        continue;
      }
      const a = e < 0.15 ? e / 0.15 : 1 - Math.max(0, (e - 0.6) / 0.4);
      const coin = fx.wordKind[k] === 0;
      drawWord(ctx, coin ? `+${fx.wordN[k]}` : 'caw', fx.wordX[k], fx.wordY[k] - e * 0.7, coin ? 0.42 : 0.34, coin ? '#e8b030' : '#262a36', a, ink);
    }

    // 10. The night transition: full dark at its peak.
    if (v.night > 0.001) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0e1022';
      ctx.globalAlpha = Math.min(1, v.night);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  const renderer: Renderer = {
    kind: '2d',
    canvas,
    resize(w, h, r) {
      const nd = Math.min(2, Math.max(0.5, r || 1));
      if (Math.max(1, w) === cssW && Math.max(1, h) === cssH && nd === dpr && canvas.width > 1) return;
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      dpr = nd;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const R = Math.hypot(cx, cy);
      vignette = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.05);
      vignette.addColorStop(0, 'rgba(255,255,255,0)');
      vignette.addColorStop(1, 'rgba(200,180,140,0.55)');
      cam.w = cssW;
      cam.h = cssH;
    },
    frame,
    onEvent(e: SimEvent, s: Readonly<WorldState>) {
      // While hidden (no frame for a while), skip the particles entirely.
      if (performance.now() - lastWall > 400) {
        fx.awake = false;
        return;
      }
      if (s !== state) return;
      fx.event(e, s);
      if (e.type === 'harvest') fx.sparkle(e.x + 0.5, e.y + 0.5, e.quality);
    },
    pick(px, py) {
      const x = Math.floor((px - drawn.ox) / drawn.scale);
      const y = Math.floor((py - drawn.oy) / drawn.scale);
      return x >= 0 && y >= 0 && x < mapW && y < mapH ? { x, y } : null;
    },
    project(x, y, height = 0) {
      return { x: drawn.ox + x * drawn.scale, y: drawn.oy + (y - height * HEIGHT_K) * drawn.scale };
    },
    snap(v) {
      if (v.state !== state) reset(v.state);
      mapW = v.state.W;
      mapH = v.state.H;
      cam.w = cssW;
      cam.h = cssH;
      cam.target(v.camera, v.state.W, v.state.H);
      cam.snap();
      drawn.ox = cam.ox;
      drawn.oy = cam.oy;
      drawn.scale = cam.scale;
      snapNext = true;
      lastWall = performance.now();
      fx.awake = true;
    },
    dispose() {
      sprites.clear();
      if (ground) {
        if (ground.back.canvas) ground.back.canvas.width = 0;
        if (ground.front.canvas) ground.front.canvas.width = 0;
      }
      ground = null;
      state = null;
      canvas.width = 0;
      canvas.height = 0;
    },
  };
  return renderer;
}
