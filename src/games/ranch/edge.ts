// Where the chevron on the screen's edge goes when the lesson's spot is out of
// view, and which way it points. Render-free math over a camera, so a test can
// sweep every bearing (the fifth playtest's chevron pointed the long way round
// whenever the spot was more than about 90 degrees behind you: the camera-space
// point and the projected one shared one vector, and the projection overwrote
// it before its side was read).

import type { Camera, Vector3 } from 'three';

export interface EdgeSpot {
  /** Where on screen (CSS px), and the chevron's angle (radians, 0 pointing right, screen y down). */
  x: number;
  y: number;
  angle: number;
}

/**
 * The edge chevron for a world point, or null when it is in view. tmp is a
 * scratch vector (the game passes its own, so nothing is allocated per frame);
 * out is filled and returned.
 */
export function edgeSpot(camera: Camera, wx: number, wy: number, wz: number, w: number, h: number, tmp: Vector3, out: EdgeSpot): EdgeSpot | null {
  // Camera space first (z < 0 is in front), copied out before the projection reuses the vector.
  const v = tmp.set(wx, wy, wz).applyMatrix4(camera.matrixWorldInverse);
  const cx0 = v.x;
  const cy0 = v.y;
  const behind = v.z > -0.1;
  tmp.set(wx, wy, wz).project(camera);
  const sx = ((tmp.x + 1) / 2) * w;
  const sy = ((1 - tmp.y) / 2) * h;
  // The band it may sit in: clear of the shell corner, the journal page, the stick and the buttons.
  const x0 = 26;
  const x1 = w - 26;
  const y0 = h * 0.2;
  const y1 = h * 0.62;
  if (!behind && sx > x0 && sx < x1 && sy > 8 && sy < h - 8) return null;
  // In front but off the edge: point straight at it. Behind you: point to the side you would turn towards
  // (the shorter way round), at mid height.
  let dx = behind ? (cx0 >= 0 ? 1 : -1) : cx0;
  const dy = behind ? 0 : -cy0;
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) dx = 1;
  const cx = w / 2;
  const cy = (y0 + y1) / 2;
  const k = Math.min(Math.abs(dx) > 1e-6 ? (x1 - cx) / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-6 ? (y1 - cy) / Math.abs(dy) : 1e9);
  out.x = Math.min(x1, Math.max(x0, cx + dx * k));
  out.y = Math.min(y1, Math.max(y0, cy + dy * k));
  out.angle = Math.atan2(dy, dx);
  return out;
}
