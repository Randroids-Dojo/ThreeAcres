// The camera: always looking north so the screen agrees with the 2D page.
// Close follows the farmer at a three-quarter angle, about nine tiles across
// the short side; on a tall phone screen it looks down more steeply and fits
// the whole depth of the farm between the day card and the tool rack. Either
// way it stays inside the farm: it slides with the farmer only as far as the
// farm's edges, so the view is farm, not sky or the soil under the diorama.
// Wide frames the farm from higher up, with pan and zoom. pick and project
// use a copy of the matrices last drawn.

import { Matrix4, PerspectiveCamera, Vector3, Vector4 } from 'three';
import type { CameraIntent } from '../contract';
import { clamp, lerp } from './util';

const FOV = 30;
const PITCH_CLOSE = (48 * Math.PI) / 180;
const PITCH_WIDE = (60 * Math.PI) / 180;
/** Phones in portrait look a little more from above, so tiles are less foreshortened and easier to tap. */
const PITCH_WIDE_TALL = (66 * Math.PI) / 180;
const CLOSE_TILES = 9;
/** Tall screens: steeper, a little wider, and kept inside the farm. */
export const TALL = { pitch: (70 * Math.PI) / 180, minTiles: 9.8, maxTiles: 12, bandTop: 100, bandBottom: 112 };
/** Ground the close camera on a tall screen keeps to: the farm, its back row of trees, not the void past its edges. */
const BOUNDS = { x0: 0.02, x1: 19.98, z1: 15.25 };
/** The back row of trees, roughly: how high their crowns reach and how far in they stand. */
const TREE_TOP = { y: 1.75, z: 0.5 };const SCREEN_CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

interface Pose {
  tx: number;
  tz: number;
  dist: number;
  pitch: number;
}

export interface Rig {
  camera: PerspectiveCamera;
  /** Moves the camera towards the intent. snap jumps straight there. */
  update(intent: CameraIntent, W: number, H: number, dt: number, snap: boolean): void;
  /** Call after drawing: keeps the matrices pick and project use. */
  commit(): void;
  resize(w: number, h: number): void;
  pick(px: number, py: number, W: number, H: number): { x: number; y: number } | null;
  project(x: number, y: number, h: number): { x: number; y: number } | null;
  /** Where the camera looks on the ground, and how much ground it sees around that point. */
  target: Vector3;
  span: { halfW: number; halfD: number };
  /** Pixels per world unit at unit distance, for point sprites. */
  pixelScale(): number;
  /** Ground rect the camera can see: [minX, minZ, maxX, maxZ]. */
  ground: Float32Array;
}

/**
 * Where a tall screen's close camera looks across the farm. A phone sees
 * about ten and a half tiles across, just the width of the first two fields
 * and the well. Anywhere on the west side (the first field, the path between
 * the fields, the second field) it holds still on the middle of that, so the
 * first field's left column and the well both stay in view; going east it
 * slides on to follow the farmer, and it always keeps the farmer well inside
 * the screen.
 */
export function tallX(fx: number, tiles: number): number {
  const WEST = 6.8;
  const room = fx <= 9 ? WEST : fx >= 13 ? fx : WEST + (fx - 9) * ((13 - WEST) / 4);
  const keep = Math.max(0, tiles / 2 - 0.6);
  return clamp(room, fx - keep, fx + keep);
}

export function makeRig(): Rig {
  const camera = new PerspectiveCamera(FOV, 1, 0.5, 200);
  let w = 1;
  let h = 1;
  const cur: Pose = { tx: 10, tz: 7.5, dist: 30, pitch: PITCH_WIDE };
  const goal: Pose = { tx: 10, tz: 7.5, dist: 30, pitch: PITCH_WIDE };
  const drawnVP = new Matrix4();
  const drawnInv = new Matrix4();
  const drawnPos = new Vector3();
  let drawn = false;
  const v4 = new Vector4();
  const a = new Vector3();
  const b = new Vector3();
  const target = new Vector3();
  const span = { halfW: 10, halfD: 8 };
  const ground = new Float32Array(4);
  // Wide fit cache.
  let fitKey = '';
  const fit: Pose = { tx: 10, tz: 7.5, dist: 30, pitch: PITCH_WIDE };
  const tmpCam = new PerspectiveCamera(FOV, 1, 0.5, 400);

  const place = (cam: PerspectiveCamera, p: Pose) => {
    cam.position.set(p.tx, Math.sin(p.pitch) * p.dist, p.tz + Math.cos(p.pitch) * p.dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(p.tx, 0, p.tz);
    cam.near = Math.max(0.2, p.dist * 0.12);
    cam.far = p.dist * 2.2 + 40;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  };

  /** Fits a ground box into the view: binary search on distance, then centre it vertically. */
  const fitBox = (x0: number, z0: number, x1: number, z1: number, pitch: number, margin: number, out: Pose, depth = 0) => {
    tmpCam.aspect = w / h;
    out.pitch = pitch;
    out.tx = (x0 + x1) / 2;
    out.tz = (z0 + z1) / 2;
    const corners = [
      [x0, 0, z0],
      [x1, 0, z0],
      [x0, 0, z1],
      [x1, 0, z1],
      // Allow for the back trees and the house roof.
      [x0, 1.4, z0],
      [x1, 1.4, z0],
      // And, when asked, the cut soil layers below the front edge.
      [x0, -depth, z1],
      [x1, -depth, z1],
    ];
    const lim = 1 - margin;
    for (let pass = 0; pass < 3; pass++) {
      let lo = 2;
      let hi = 400;
      for (let it = 0; it < 30; it++) {
        const mid = (lo + hi) / 2;
        out.dist = mid;
        place(tmpCam, out);
        let ok = true;
        for (const c of corners) {
          a.set(c[0], c[1], c[2]).project(tmpCam);
          if (Math.abs(a.x) > lim || Math.abs(a.y) > lim) {
            ok = false;
            break;
          }
        }
        if (ok) hi = mid;
        else lo = mid;
      }
      out.dist = hi;
      place(tmpCam, out);
      // Centre vertically: shift the target so the box sits mid screen.
      let ymin = 1;
      let ymax = -1;
      for (const c of corners) {
        a.set(c[0], c[1], c[2]).project(tmpCam);
        ymin = Math.min(ymin, a.y);
        ymax = Math.max(ymax, a.y);
      }
      const off = (ymin + ymax) / 2;
      // Moving the target by dz shifts ndc y by about dz * (dy/dz) at the centre.
      a.set(out.tx, 0, out.tz).project(tmpCam);
      b.set(out.tx, 0, out.tz + 1).project(tmpCam);
      const k = b.y - a.y;
      if (Math.abs(k) > 1e-6) out.tz += off / k;
    }
  };

  const wideGoal = (intent: CameraIntent, W: number, H: number) => {
    const portrait = w / h < 1;
    const key = `${w}x${h}:${W}x${H}`;
    if (key !== fitKey) {
      fitKey = key;
      // Portrait frames the six fields (columns 1.5 to 16.5), panning reaches the rest; landscape shows the whole slab.
      if (portrait) fitBox(1.5, 1, 16.5, H - 1, PITCH_WIDE_TALL, 0.012, fit);
      else fitBox(-0.2, -0.2, W + 0.2, H + 0.2, PITCH_WIDE, 0.05, fit, 2.2);
    }
    const zoom = clamp(intent.zoom || 1, 0.6, 2.5);
    goal.pitch = fit.pitch + (zoom - 1) * -0.05;
    goal.dist = fit.dist / zoom;
    goal.tx = clamp(fit.tx + intent.panX, 0, W);
    goal.tz = clamp(fit.tz + intent.panY, 0, H);
  };

  /** Where a screen point (NDC) meets the ground, for a camera placed at a pose. Rays above the horizon count as very far. */
  const groundHit = (cam: PerspectiveCamera, nx: number, ny: number, out: Vector3) => {
    a.set(nx, ny, -1).unproject(cam);
    b.set(nx, ny, 1).unproject(cam);
    const dy = b.y - a.y;
    if (dy > -1e-6) return out.set(a.x + (b.x - a.x) * 1e3, 0, a.z + (b.z - a.z) * 1e3);
    const tt = -a.y / dy;
    return out.set(a.x + (b.x - a.x) * tt, 0, a.z + (b.z - a.z) * tt);
  };
  const hitL = new Vector3();
  const hitR = new Vector3();

  /** Screen y in px of a point, for a camera placed at a pose. */
  const screenY = (cam: PerspectiveCamera, x: number, y: number, z: number) => {
    a.set(x, y, z).project(cam);
    return ((1 - a.y) / 2) * h;
  };
  let zKey = '';
  const zRange = { lo: 0, hi: 0 };
  /** The target z at which a point sits at screen y `py`: moving the camera south lifts everything on screen. */
  const solveZ = (p: Pose, x: number, y: number, z: number, py: number) => {
    const q: Pose = { ...p };
    let lo = -40;
    let hi = 60;
    for (let it = 0; it < 32; it++) {
      q.tz = (lo + hi) / 2;
      place(tmpCam, q);
      if (screenY(tmpCam, x, y, z) > py) lo = q.tz;
      else hi = q.tz;
    }
    return (lo + hi) / 2;
  };

  /**
   * Slides a pose so the clear band of the screen (below the day card, above
   * the tool rack) shows farm. Sliding the target moves the view without
   * turning it, so a ground measurement is exact. Across, the farm is wider
   * than the view: it slides with the farmer and stops at the edges. Up and
   * down, the back trees' tops never drop below the top of the band (no sky
   * in it) and the front edge never rises above its bottom (no void in it).
   * A tall phone sees more rows than the farm has: then the trees sit at the
   * top of the band and the farm keeps still, its spare depth at the bottom
   * behind the controls.
   */
  const keepInside = (p: Pose, W: number, H: number) => {
    tmpCam.aspect = w / h;
    const top = Math.min(h * 0.3, TALL.bandTop);
    const bot = h - Math.min(h * 0.3, TALL.bandBottom);
    const nyTop = 1 - (2 * top) / h;
    const x0 = BOUNDS.x0;
    const x1 = W + (BOUNDS.x1 - 20);
    const slide = (lo: number, hi: number, min: number, max: number) => {
      if (hi - lo >= max - min) return (min + max) / 2 - (lo + hi) / 2;
      if (lo < min) return min - lo;
      if (hi > max) return max - hi;
      return 0;
    };
    place(tmpCam, p);
    // Across, on a tall screen the far edge of the band is the widest row in view: keep that one inside, and every
    // nearer row is too. A wide screen fans out much more towards the back, so it keeps the middle of the band
    // inside (the side belts of trees fill its far corners) and the farmer stays nearer the middle.
    const nyRow = w / h < 1 ? nyTop : (nyTop + 1 - (2 * bot) / h) / 2;
    groundHit(tmpCam, -1, nyRow, hitL);
    groundHit(tmpCam, 1, nyRow, hitR);
    p.tx += slide(hitL.x, hitR.x, x0, x1);
    // Up and down: the limits depend only on the screen and the pose's tilt and distance, so solve them once per size.
    const key = `${w}x${h}:${p.pitch.toFixed(4)}:${p.dist.toFixed(3)}:${top}:${bot}:${W}x${H}`;
    if (key !== zKey) {
      zKey = key;
      const back = solveZ(p, W / 2, TREE_TOP.y, TREE_TOP.z, top);
      const front = solveZ(p, W / 2, 0, H + (BOUNDS.z1 - 15), bot);
      zRange.lo = back;
      zRange.hi = Math.max(back, front);
    }
    p.tz = clamp(p.tz, zRange.lo, zRange.hi);
  };

  let tilesKey = '';
  let tallTiles = 11;
  /**
   * Tiles across a tall screen: as many as lets the whole farm, from the back
   * trees to the front hedge, run from the top of the clear band down to the
   * tool rack, between 10 and 12. A taller phone gets slightly bigger tiles
   * rather than empty space under the farm. Solved once per screen size.
   */
  const tilesForTall = (W: number, H: number) => {
    const key = `${w}x${h}:${W}x${H}`;
    if (key === tilesKey) return tallTiles;
    tilesKey = key;
    const t = Math.tan((FOV * Math.PI) / 360);
    const top = Math.min(h * 0.3, TALL.bandTop);
    const bot = h - Math.min(h * 0.3, TALL.bandBottom);
    const frontAt = (tiles: number) => {
      const q: Pose = { tx: W / 2, tz: H / 2, dist: tiles / (2 * t * (w / h)), pitch: TALL.pitch };
      q.tz = solveZ(q, W / 2, TREE_TOP.y, TREE_TOP.z, top);
      place(tmpCam, q);
      return screenY(tmpCam, W / 2, 0, H + (BOUNDS.z1 - 15));
    };
    let lo = TALL.minTiles;
    let hi = TALL.maxTiles;
    // More tiles, smaller farm, front edge higher on screen.
    if (frontAt(lo) <= bot) tallTiles = lo;
    else if (frontAt(hi) >= bot) tallTiles = hi;
    else {
      for (let it = 0; it < 24; it++) {
        const mid = (lo + hi) / 2;
        if (frontAt(mid) > bot) lo = mid;
        else hi = mid;
      }
      tallTiles = hi;
    }
    return tallTiles;
  };

  const closeGoal = (intent: CameraIntent, W: number, H: number) => {
    const zoom = clamp(intent.zoom || 1, 0.6, 2.5);
    const t = Math.tan((FOV * Math.PI) / 360);
    const aspect = w / h;
    const tall = aspect < 1;
    // Nine tiles across the short side at the farmer; ten to twelve on a tall screen, looking down more steeply.
    const dist = tall ? tilesForTall(W, H) / (2 * t * aspect) : (CLOSE_TILES * Math.sin(PITCH_CLOSE)) / (2 * t);
    goal.pitch = tall ? TALL.pitch : PITCH_CLOSE;
    goal.dist = dist / zoom;
    goal.tx = tall ? tallX(intent.focusX, tilesForTall(W, H) / zoom) : intent.focusX;
    goal.tz = intent.focusY;
    // Both shapes keep to the farm: no void past its edges, no sky below the top of the clear band.
    keepInside(goal, W, H);
  };

  const updateSpan = () => {
    target.set(cur.tx, 0, cur.tz);
    // Visible ground rect from the four screen corners.
    let minX = 1e9;
    let minZ = 1e9;
    let maxX = -1e9;
    let maxZ = -1e9;
    for (const [nx, ny] of SCREEN_CORNERS) {
      a.set(nx, ny, -1).unproject(camera);
      b.set(nx, ny, 1).unproject(camera);
      const dy = b.y - a.y;
      let tt = dy < -1e-6 ? -a.y / dy : 1;
      tt = clamp(tt, 0, 1);
      const gx = a.x + (b.x - a.x) * tt;
      const gz = a.z + (b.z - a.z) * tt;
      minX = Math.min(minX, gx);
      maxX = Math.max(maxX, gx);
      minZ = Math.min(minZ, gz);
      maxZ = Math.max(maxZ, gz);
    }
    ground[0] = minX;
    ground[1] = minZ;
    ground[2] = maxX;
    ground[3] = maxZ;
    span.halfW = Math.min(14, (maxX - minX) / 2);
    span.halfD = Math.min(11, (maxZ - minZ) / 2);
    target.set(clamp((minX + maxX) / 2, -2, 22), 0, clamp((minZ + maxZ) / 2, -2, 17));
  };

  const commit = () => {
    drawnVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    drawnInv.copy(drawnVP).invert();
    drawnPos.copy(camera.position);
    drawn = true;
  };

  return {
    camera,
    target,
    span,
    ground,
    update(intent, W, H, dt, snap) {
      if (intent.mode === 'wide') wideGoal(intent, W, H);
      else closeGoal(intent, W, H);
      if (snap) Object.assign(cur, goal);
      else {
        const k = 1 - Math.exp(-dt * (intent.mode === 'wide' ? 9 : 6));
        cur.tx = lerp(cur.tx, goal.tx, k);
        cur.tz = lerp(cur.tz, goal.tz, k);
        // Distance eases in log space so zooming feels even.
        cur.dist = Math.exp(lerp(Math.log(cur.dist), Math.log(goal.dist), k));
        cur.pitch = lerp(cur.pitch, goal.pitch, k);
      }
      camera.aspect = w / h;
      place(camera, cur);
      updateSpan();
      if (snap || !drawn) commit();
    },
    commit,
    resize(cw, ch) {
      w = Math.max(1, cw);
      h = Math.max(1, ch);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fitKey = '';
      tilesKey = '';
      zKey = '';
    },
    pick(px, py, W, H) {
      if (!drawn) return null;
      const nx = (px / w) * 2 - 1;
      const ny = 1 - (py / h) * 2;
      v4.set(nx, ny, -1, 1).applyMatrix4(drawnInv);
      if (v4.w === 0) return null;
      a.set(v4.x / v4.w, v4.y / v4.w, v4.z / v4.w);
      v4.set(nx, ny, 1, 1).applyMatrix4(drawnInv);
      if (v4.w === 0) return null;
      b.set(v4.x / v4.w, v4.y / v4.w, v4.z / v4.w);
      const dy = b.y - a.y;
      if (Math.abs(dy) < 1e-9) return null;
      const t = -a.y / dy;
      if (!(t >= 0)) return null;
      const gx = a.x + (b.x - a.x) * t;
      const gz = a.z + (b.z - a.z) * t;
      const tx = Math.floor(gx);
      const ty = Math.floor(gz);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
      return { x: tx, y: ty };
    },
    project(x, y, hh) {
      if (!drawn) return null;
      v4.set(x, hh, y, 1).applyMatrix4(drawnVP);
      if (v4.w <= 1e-6) return null;
      return { x: ((v4.x / v4.w + 1) / 2) * w, y: ((1 - v4.y / v4.w) / 2) * h };
    },
    pixelScale() {
      return h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
  };
}
