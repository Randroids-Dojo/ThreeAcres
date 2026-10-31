// Markers on tiles: the aimed tile (a frame, a fill and a floating verb
// badge, red-tinged when the action cannot happen) and queued jobs (a pennant
// on a stake coloured by verb, and a chalk mark of the verb on the ground,
// both dimmer while no one has claimed the job).

import {
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { FrameView } from '../contract';
import type { Verb, WorldState } from '../sim/types';
import { GeoBuilder, block, cyl } from './builder';
import type { Materials } from './materials';
import { at, col } from './util';

export const VERBS: Verb[] = ['till', 'water', 'plant', 'harvest', 'tend', 'clear', 'build', 'scare'];
export const VERB_COLOR: Record<Verb, string> = {
  till: '#b07a42',
  water: '#3d8fe0',
  plant: '#4fae4a',
  harvest: '#ec9a2e',
  tend: '#d65b9c',
  clear: '#8f969e',
  build: '#e6c23a',
  scare: '#4a4a5c',
};

/** Draws a verb glyph centred at (0, 0) in a 100-unit box. */
function glyph(g: CanvasRenderingContext2D, v: Verb, ink: string): void {
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  switch (v) {
    case 'till':
      g.moveTo(-28, 30);
      g.lineTo(22, -24);
      g.stroke();
      g.beginPath();
      g.moveTo(8, -36);
      g.lineTo(34, -12);
      g.lineTo(26, -4);
      g.stroke();
      break;
    case 'water':
      g.moveTo(0, -36);
      g.bezierCurveTo(16, -12, 28, 2, 28, 14);
      g.arc(0, 14, 28, 0, Math.PI, false);
      g.bezierCurveTo(-28, 2, -16, -12, 0, -36);
      g.fill();
      break;
    case 'plant':
      g.ellipse(0, 20, 14, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(0, 12);
      g.lineTo(0, -10);
      g.stroke();
      g.beginPath();
      g.ellipse(-14, -18, 15, 8, -0.5, 0, Math.PI * 2);
      g.ellipse(14, -18, 15, 8, 0.5, 0, Math.PI * 2);
      g.fill();
      break;
    case 'harvest':
      g.moveTo(-32, -2);
      g.lineTo(32, -2);
      g.lineTo(24, 30);
      g.lineTo(-24, 30);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(0, -2, 22, Math.PI, 0, false);
      g.stroke();
      break;
    case 'tend':
      g.ellipse(0, 6, 20, 25, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(0, -24, 10, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 6;
      for (const s of [-1, 1]) {
        for (const y of [-6, 8, 22]) {
          g.beginPath();
          g.moveTo(s * 16, y);
          g.lineTo(s * 32, y - 8);
          g.stroke();
        }
      }
      break;
    case 'clear':
      g.arc(4, -4, 28, Math.PI * 1.05, Math.PI * 1.85, false);
      g.stroke();
      g.beginPath();
      g.moveTo(-10, 6);
      g.lineTo(-30, 34);
      g.stroke();
      break;
    case 'build':
      g.moveTo(-26, 32);
      g.lineTo(10, -4);
      g.stroke();
      g.beginPath();
      g.moveTo(-6, -24);
      g.lineTo(20, -36);
      g.lineTo(36, -12);
      g.lineTo(14, 2);
      g.closePath();
      g.fill();
      break;
    case 'scare':
      // A crow with wings up, and motion lines.
      g.ellipse(0, 10, 18, 11, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(-6, 4);
      g.lineTo(-34, -22);
      g.lineTo(-12, -6);
      g.moveTo(6, 4);
      g.lineTo(34, -22);
      g.lineTo(12, -6);
      g.stroke();
      g.beginPath();
      g.arc(20, 2, 7, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-30, 30);
      g.lineTo(-18, 30);
      g.moveTo(18, 30);
      g.lineTo(30, 30);
      g.stroke();
      break;
  }
}

function badgeTexture(v: Verb | null, bad: boolean): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.beginPath();
  g.arc(0, 0, 56, 0, Math.PI * 2);
  g.fillStyle = bad ? '#f6dcd6' : '#fbf5e6';
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = bad ? '#c4473a' : '#5b4630';
  g.stroke();
  g.save();
  g.scale(0.78, 0.78);
  if (v) glyph(g, v, bad ? '#b33a2e' : '#4a3a28');
  g.restore();
  if (bad) {
    g.strokeStyle = '#c4473a';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(-36, 36);
    g.lineTo(36, -36);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function chalkTexture(v: Verb): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.globalAlpha = 0.9;
  glyph(g, v, '#ffffff');
  g.globalAlpha = 1;
  g.lineWidth = 6;
  g.strokeStyle = '#ffffff';
  g.setLineDash([10, 9]);
  g.beginPath();
  g.arc(0, 0, 54, 0, Math.PI * 2);
  g.stroke();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function frameGeometry(): ShapeGeometry {
  const rr = (s: Shape | import('three').Path, h: number, r: number) => {
    s.moveTo(-h + r, -h);
    s.lineTo(h - r, -h);
    s.quadraticCurveTo(h, -h, h, -h + r);
    s.lineTo(h, h - r);
    s.quadraticCurveTo(h, h, h - r, h);
    s.lineTo(-h + r, h);
    s.quadraticCurveTo(-h, h, -h, h - r);
    s.lineTo(-h, -h + r);
    s.quadraticCurveTo(-h, -h, -h + r, -h);
  };
  const outer = new Shape();
  rr(outer, 0.49, 0.12);
  const hole = new Shape();
  rr(hole, 0.41, 0.07);
  outer.holes.push(hole);
  return new ShapeGeometry(outer, 4).rotateX(-Math.PI / 2);
}

export interface Markers {
  group: Group;
  update(v: FrameView, now: number): void;
  dispose(): void;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();
const _up = new Vector3(0, 1, 0);
const GREY = new Color(0.55, 0.55, 0.55);

export function buildMarkers(mats: Materials, cap: number): Markers {
  const group = new Group();
  group.name = 'markers';
  // Highlight.
  // The frame sits in the scene so figures and tall crops stand in front of it; a faint ghost
  // of it draws on top so the aimed tile is never lost behind corn.
  const frameMat = new MeshBasicMaterial({ color: '#fff8e6', transparent: true, opacity: 0.95, depthWrite: false });
  const frame = new Mesh(frameGeometry(), frameMat);
  frame.renderOrder = 30;
  const ghostMat = new MeshBasicMaterial({ color: '#fff8e6', transparent: true, opacity: 0.3, depthTest: false, depthWrite: false });
  const ghost = new Mesh(frame.geometry, ghostMat);
  ghost.renderOrder = 31;
  frame.add(ghost);
  const fillMat = new MeshBasicMaterial({ color: '#fff8e6', transparent: true, opacity: 0.18, depthWrite: false, side: DoubleSide });
  const fill = new Mesh(new PlaneGeometry(0.86, 0.86).rotateX(-Math.PI / 2), fillMat);
  fill.renderOrder = 29;
  const badges = new Map<string, SpriteMaterial>();
  const badgeMat = (v: Verb | null, bad: boolean) => {
    const k = `${v}:${bad}`;
    let m = badges.get(k);
    if (!m) {
      m = new SpriteMaterial({ map: badgeTexture(v, bad), depthTest: false, depthWrite: false, transparent: true });
      badges.set(k, m);
    }
    return m;
  };
  const badge = new Sprite(badgeMat('till', false));
  badge.renderOrder = 31;
  badge.scale.set(0.36, 0.36, 1);
  const hl = new Group();
  hl.add(fill, frame, badge);
  hl.visible = false;
  group.add(hl);

  // Job pennants: one instanced mesh, coloured per verb.
  const pb = new GeoBuilder();
  pb.add(cyl(0.014, 0.016, 0.52, 5), at(0, 0, 0), col('#d8c9a8'));
  pb.add(block(0.014, 0.15, 0.22, 0.004), at(0, 0.43, 0.11), col('#ffffff'));
  const pennantGeo = pb.build();
  const pennants = new InstancedMesh(pennantGeo, mats.figure, cap);
  pennants.instanceMatrix.setUsage(DynamicDrawUsage);
  pennants.castShadow = true;
  pennants.frustumCulled = false;
  pennants.setColorAt(0, _c.setRGB(1, 1, 1));
  group.add(pennants);
  const chalkGeo = new PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2);
  const chalk: Record<string, InstancedMesh> = {};
  for (const v of VERBS) {
    const m = new InstancedMesh(chalkGeo, new MeshBasicMaterial({ map: chalkTexture(v), transparent: true, depthWrite: false, opacity: 0.85 }), cap);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.frustumCulled = false;
    m.renderOrder = 3;
    m.setColorAt(0, _c.setRGB(1, 1, 1));
    m.count = 0;
    chalk[v] = m;
    group.add(m);
  }
  const verbCol: Record<string, Color> = {};
  for (const v of VERBS) verbCol[v] = col(VERB_COLOR[v]);
  const counts: Record<string, number> = {};

  return {
    group,
    update(v, now) {
      const s = v.state as WorldState;
      const h = v.highlight;
      if (h && h.x >= 0 && h.y >= 0 && h.x < s.W && h.y < s.H) {
        hl.visible = true;
        const pulse = 1 + Math.sin(now * 5) * 0.02;
        hl.position.set(h.x + 0.5, 0, h.y + 0.5);
        frame.position.y = 0.1;
        frame.scale.set(pulse, 1, pulse);
        fill.position.y = 0.075;
        const bad = !h.ok;
        frameMat.color.set(bad ? '#ff8f7a' : '#fff8e6');
        ghostMat.color.copy(frameMat.color);
        fillMat.color.set(bad ? '#ff6a52' : '#fff8e6');
        fillMat.opacity = bad ? 0.26 : 0.16;
        badge.visible = h.verb !== null || bad;
        if (badge.visible) {
          badge.material = badgeMat(h.verb, bad);
          badge.position.set(0, 0.62 + Math.sin(now * 3) * 0.03, 0);
        }
      } else hl.visible = false;

      let n = 0;
      for (const vb of VERBS) counts[vb] = 0;
      for (const j of s.jobs) {
        if (n >= cap) break;
        const claimed = j.claimedBy !== null;
        _q.setFromAxisAngle(_up, -0.4);
        _p.set(j.x + 0.16, 0.02, j.y + 0.2);
        _s.set(1, 1, 1);
        _m.compose(_p, _q, _s);
        pennants.setMatrixAt(n, _m);
        _c.copy(verbCol[j.verb]);
        if (!claimed) _c.lerp(GREY, 0.55).multiplyScalar(0.85);
        pennants.setColorAt(n, _c);
        n++;
        const cm = chalk[j.verb];
        const k = counts[j.verb]++;
        _q.identity();
        _p.set(j.x + 0.5, 0.08, j.y + 0.55);
        _m.compose(_p, _q, _s);
        cm.setMatrixAt(k, _m);
        _c.setRGB(claimed ? 1 : 0.62, claimed ? 1 : 0.62, claimed ? 1 : 0.62);
        cm.setColorAt(k, _c);
      }
      pennants.count = n;
      pennants.visible = n > 0;
      pennants.instanceMatrix.needsUpdate = true;
      if (pennants.instanceColor) pennants.instanceColor.needsUpdate = true;
      for (const vb of VERBS) {
        const cm = chalk[vb];
        cm.count = counts[vb];
        cm.visible = cm.count > 0;
        if (cm.count > 0) {
          cm.instanceMatrix.needsUpdate = true;
          if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
        }
      }
    },
    dispose() {
      frame.geometry.dispose();
      fill.geometry.dispose();
      frameMat.dispose();
      ghostMat.dispose();
      fillMat.dispose();
      for (const m of badges.values()) {
        m.map?.dispose();
        m.dispose();
      }
      pennantGeo.dispose();
      chalkGeo.dispose();
      for (const m of Object.values(chalk)) {
        (m.material as MeshBasicMaterial).map?.dispose();
        (m.material as MeshBasicMaterial).dispose();
      }
    },
  };
}
