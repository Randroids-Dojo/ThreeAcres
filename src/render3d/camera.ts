// The camera: always looking north so the screen agrees with the 2D page.
// Close follows the farmer at a three-quarter angle, about nine tiles across
// the short side. Wide frames the farm from higher up, with pan and zoom.
// pick and project use a copy of the matrices last drawn.

import { Matrix4, PerspectiveCamera, Vector3, Vector4 } from 'three';
import type { CameraIntent } from '../contract';
import { clamp, lerp } from './util';

const FOV = 30;
const PITCH_CLOSE = (48 * Math.PI) / 180;
const PITCH_WIDE = (60 * Math.PI) / 180;
/** Phones in portrait look a little more from above, so tiles are less foreshortened and easier to tap. */
const PITCH_WIDE_TALL = (66 * Math.PI) / 180;
const CLOSE_TILES = 9;
const SCREEN_CORNERS: readonly (readonly [number, number])[] = [
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

  const closeGoal = (intent: CameraIntent) => {
    const zoom = clamp(intent.zoom || 1, 0.6, 2.5);
    const t = Math.tan((FOV * Math.PI) / 360);
    const aspect = w / h;
    // Nine tiles across the short side at the farmer.
    const dist = aspect < 1 ? CLOSE_TILES / (2 * t * aspect) : (CLOSE_TILES * Math.sin(PITCH_CLOSE)) / (2 * t);
    goal.pitch = PITCH_CLOSE;
    goal.dist = dist / zoom;
    goal.tx = intent.focusX;
    goal.tz = intent.focusY;
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
      else closeGoal(intent);
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
