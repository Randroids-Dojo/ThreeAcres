// Menus as things in the world: wooden tags that drop on twine from a post's
// rail, the workbench pegboard, the porch beam or a gate. Look at a tag (or tap
// it) to pick it; it swings forward and its edge darkens. Bought tags flip up
// and away; the rest fold up when you walk off.

import { BoxGeometry, CanvasTexture, DoubleSide, Group, Mesh, MeshLambertMaterial, PlaneGeometry, Vector3 } from 'three';
import type { MenuOption } from '../sim';
import { canvas, paintTag, tex } from './paint';

export interface Rail {
  x: number;
  y: number;
  z: number;
  /** Direction along the rail (unit, xz). */
  ax: number;
  az: number;
  /** Yaw the tags face (their front looks along +z rotated by this). */
  ry: number;
}

const TW = 0.56;
const TH = 0.28;
const MAX = 6;

interface Tag {
  pivot: Group;
  face: Mesh;
  tex: CanvasTexture;
  ctx: CanvasRenderingContext2D;
  angle: number;
  angleV: number;
  drop: number;
  hot: boolean;
  opt: MenuOption | null;
  key: string;
  twine: number;
  gone: number;
}

const _a = new Vector3();
const _n = new Vector3();
const _p = new Vector3();
const _r = new Vector3();
const _u = new Vector3();

export class TagMenu {
  readonly group = new Group();
  private tags: Tag[] = [];
  private rail: Rail | null = null;
  opts: MenuOption[] = [];
  hot = -1;
  open = false;
  private t = 0;

  constructor() {
    const back = new MeshLambertMaterial({ color: 0xb8956a });
    for (let i = 0; i < MAX; i++) {
      const [c, g] = canvas(320, 160);
      const t = tex(c);
      const pivot = new Group();
      const face = new Mesh(new PlaneGeometry(TW, TH), new MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.5, side: DoubleSide }));
      // Alternate tags hang low and high so a row can overlap and stay narrow.
      const twine = 0.24 + (i % 2) * 0.4;
      face.position.y = -twine - TH / 2;
      const backing = new Mesh(new BoxGeometry(TW * 0.92, TH * 0.9, 0.012), back);
      backing.position.set(0, -twine - TH / 2 - 0.005, -0.012);
      const string = new Mesh(new BoxGeometry(0.008, twine, 0.008), new MeshLambertMaterial({ color: 0x5a4430 }));
      string.position.y = -twine / 2;
      pivot.add(face, backing, string);
      pivot.visible = false;
      this.group.add(pivot);
      this.tags.push({ pivot, face, tex: t, ctx: g, angle: 0, angleV: 0, drop: 0, hot: false, opt: null, key: '', twine, gone: 0 });
    }
  }

  /** Hang a set of tags from a rail. */
  show(rail: Rail, opts: MenuOption[]): void {
    this.rail = rail;
    this.opts = opts.slice(0, MAX);
    this.open = true;
    this.hot = -1;
    this.t = 0;
    const n = this.opts.length;
    this.tags.forEach((tg, i) => {
      tg.opt = this.opts[i] ?? null;
      tg.pivot.visible = !!tg.opt;
      tg.drop = -i * 0.06;
      tg.gone = 0;
      tg.angle = 0.6;
      tg.angleV = 0;
      tg.key = '';
      if (!tg.opt) return;
      const step = TW * 0.66;
      const off = 0.4 + i * step - (rail.ax === 0 && rail.az === 0 ? ((n - 1) * step) / 2 + 0.4 : 0);
      tg.pivot.position.set(rail.x + rail.ax * off, rail.y, rail.z + rail.az * off);
      tg.pivot.rotation.set(0, rail.ry, 0, 'YXZ');
      this.paint(tg, false);
    });
  }

  /** Update the options in place (prices became affordable, counts changed). */
  refresh(opts: MenuOption[]): void {
    this.opts = opts.slice(0, MAX);
    this.tags.forEach((tg, i) => {
      const o = this.opts[i] ?? null;
      tg.opt = o;
      if (!o) {
        tg.pivot.visible = false;
        return;
      }
      this.paint(tg, tg.hot);
    });
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.hot = -1;
  }

  /** The tag picked up and away (bought). */
  take(i: number): void {
    const tg = this.tags[i];
    if (tg) tg.gone = 0.001;
  }

  /** Shake a tag (can't afford it). */
  shake(i: number): void {
    const tg = this.tags[i];
    if (tg) tg.angleV += 9;
  }

  centre(out: Vector3): Vector3 | null {
    if (!this.rail) return null;
    const vis = this.tags.filter((t) => t.opt);
    if (!vis.length) return null;
    out.set(0, 0, 0);
    for (const t of vis) out.add(t.pivot.position);
    out.multiplyScalar(1 / vis.length);
    out.y -= 0.55;
    return out;
  }

  private paint(tg: Tag, hot: boolean): void {
    const o = tg.opt;
    if (!o) return;
    const key = `${o.title}|${o.price}|${o.note}|${o.ok}|${hot}`;
    if (key === tg.key) return;
    tg.key = key;
    tg.hot = hot;
    paintTag(tg.ctx, 320, 160, o.title, o.price, o.note, o.ok, hot, this.tags.indexOf(tg) + 3);
    tg.tex.needsUpdate = true;
  }

  /** Which tag a ray hits, or -1. */
  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
    if (!this.open) return -1;
    let best = -1;
    let bd = 1e9;
    this.tags.forEach((tg, i) => {
      if (!tg.opt || tg.gone > 0 || !tg.pivot.visible) return;
      tg.face.updateWorldMatrix(true, false);
      _p.setFromMatrixPosition(tg.face.matrixWorld);
      _n.set(0, 0, 1).transformDirection(tg.face.matrixWorld);
      const den = _n.x * dx + _n.y * dy + _n.z * dz;
      if (Math.abs(den) < 1e-4) return;
      const t = ((_p.x - ox) * _n.x + (_p.y - oy) * _n.y + (_p.z - oz) * _n.z) / den;
      if (t < 0 || t > 8) return;
      _a.set(ox + dx * t - _p.x, oy + dy * t - _p.y, oz + dz * t - _p.z);
      const u = _a.dot(_r.set(1, 0, 0).transformDirection(tg.face.matrixWorld));
      const v = _a.dot(_u.set(0, 1, 0).transformDirection(tg.face.matrixWorld));
      if (Math.abs(u) < TW / 2 + 0.03 && Math.abs(v) < TH / 2 + 0.05 && t < bd) {
        bd = t;
        best = i;
      }
    });
    return best;
  }

  setHot(i: number): void {
    if (i === this.hot) return;
    if (i >= 0 && this.hot !== i) this.tags[i].angleV -= 2.5;
    this.hot = i;
  }

  update(dt: number, wind: number): void {
    this.t += dt;
    this.tags.forEach((tg, i) => {
      if (!tg.opt) return;
      if (!this.open || tg.gone > 0) {
        // Fold up (closed) or flip away (bought).
        if (tg.gone > 0) tg.gone += dt;
        tg.drop = Math.max(-0.01, tg.drop - dt * (tg.gone > 0 ? 2.5 : 4.5));
        if (tg.drop <= 0) {
          tg.pivot.visible = false;
          if (tg.gone > 0) tg.opt = null;
        }
      } else {
        tg.drop = Math.min(1, tg.drop + dt * 4);
        tg.pivot.visible = tg.drop > 0;
      }
      const hot = this.open && i === this.hot;
      this.paint(tg, hot);
      // Swing on a damped spring; the picked tag leans towards you.
      const target = (hot ? -0.28 : 0) + Math.sin(this.t * 1.7 + i) * 0.04 * wind;
      tg.angleV += ((target - tg.angle) * 60 - tg.angleV * 5) * dt;
      tg.angle += tg.angleV * dt;
      const d = Math.max(0, tg.drop);
      const ease = 1 - (1 - d) * (1 - d);
      tg.pivot.scale.set(1, ease, 1);
      tg.pivot.rotation.x = tg.angle + (tg.gone > 0 ? tg.gone * 6 : 0);
    });
  }
}
