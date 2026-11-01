// The bellows in your hands, drawn in its own pass over the world. Two
// carved boards hinged at a brass nozzle with pleated leather between, a crank
// on the side, a glass canister on top showing what the chosen slot holds, a
// brass dial with a needle for the count, and a row of little windows on the
// gauge plate, one per slot, each filled to its level. It bobs as you walk,
// pumps as you draw, kicks when you puff.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Shape,
  ExtrudeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  CircleGeometry,
  DoubleSide,
} from 'three';
import { KIND, isDowny, isTuft, thingColor, TUFT_KIND, type DownyKind, type Thing } from '../defs';
import { clamp, damp } from '../noise';
import type { Slot } from '../state';
import { at, merge, part } from './geo';
import { canvas, tex, SERIF } from './paint';
import { CreatureView } from './creatures';

const BRASS = 0xc9a24a;
const WOOD = 0x8a5a3a;
const LEATHER = 0x7a4a3a;

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _c = new Color();

/** The pear-shaped board outline, nozzle end at -z. */
function pear(): Shape {
  const s = new Shape();
  const pts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    // Wide at the back, narrowing to the hinge.
    const r = 0.085 + 0.035 * Math.cos(a);
    const x = Math.sin(a) * r * (0.9 + 0.3 * Math.cos(a));
    const z = Math.cos(a) * 0.12 + 0.02;
    pts.push([x, z]);
  }
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, z] of pts.slice(1)) s.lineTo(x, z);
  return s;
}

function outline(): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 0.085 + 0.035 * Math.cos(a);
    out.push([Math.sin(a) * r * (0.9 + 0.3 * Math.cos(a)) * 0.94, (Math.cos(a) * 0.12 + 0.02) * 0.94]);
  }
  return out;
}

export class Viewmodel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(72, 1, 0.01, 10);
  private rig = new Group();
  private body = new Group();
  private top = new Group();
  private crank = new Group();
  private needle: Mesh;
  private leather: Mesh;
  private leatherPos: BufferAttribute;
  private ring: [number, number][] = outline();
  private hemi = new HemisphereLight(0xffffff, 0x666666, 1.2);
  private sun = new DirectionalLight(0xffffff, 2);
  private windows: InstancedMesh;
  private windowSpots: Vector3[] = [];
  /** Window radius in the bellows' own units: small on a desk, a thumb's width apart on a phone. */
  private windowR = 0.0125;
  /** Two rows of windows (a tall phone): the chosen one wears a bigger, brighter rim instead of the pointer. */
  private grid = false;
  private rimSel = -1;
  private plate: Mesh;
  private pointer: Mesh;
  private rims: InstancedMesh;
  private contents: Record<string, InstancedMesh> = {};
  private dialTex: CanvasTexture;
  private dialCtx: CanvasRenderingContext2D;
  private dialCap = -1;
  private muzzleLocal = new Vector3(0, 0, -0.29);
  private glass: Mesh;
  // Motion state.
  private pump = 0;
  private open = 0.12;
  private kick = 0;
  private kickV = 0;
  private swayX = 0;
  private swayY = 0;
  private jiggle = 0;
  private shown = 0;
  private needleAngle = 0;
  private selX = 0;
  private selY = -0.012;
  baseX = 0.27;
  private scale = 0.86;
  baseY = -0.27;
  baseZ = -0.6;

  constructor(geos: CreatureView['geos']) {
    this.scene.add(this.hemi, this.sun, this.rig);
    this.rig.add(this.body);
    this.body.rotation.set(0.04, 0.14, 0);
    const wood = new MeshLambertMaterial({ vertexColors: true });
    const brass = new MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x8a7650 });
    // Boards: bottom is fixed, top swings on the hinge at the nozzle end.
    const pg = new ExtrudeGeometry(pear(), { depth: 0.014, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, curveSegments: 4 });
    pg.rotateX(Math.PI / 2);
    const boardGeo = part(pg, WOOD, { vary: 0.03 });
    const studs: BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      studs.push(part(at(new SphereGeometry(0.006, 6, 4), Math.sin(a) * 0.075, 0.004, 0.04 + Math.cos(a) * 0.06), BRASS));
    }
    // A carved inlay on the top board: a little seed-head emblem.
    const inlay = part(at(new CircleGeometry(0.022, 12), 0, 0.0045, 0.05, -Math.PI / 2), 0xe0c890);
    const topBoard = new Mesh(merge([boardGeo.clone(), ...studs, inlay]), wood);
    const botBoard = new Mesh(boardGeo, wood);
    botBoard.position.y = -0.03;
    this.top.add(topBoard);
    this.top.position.set(0, 0, -0.1);
    topBoard.position.set(0, 0, 0.1);
    this.body.add(this.top, botBoard);
    // Handles at the back of each board.
    const handle = (y: number, parent: Object3D, off: number) => {
      const h = new Mesh(merge([part(at(new CylinderGeometry(0.012, 0.014, 0.12, 8), 0, y, 0.19 + off, Math.PI / 2), 0x6a4430), part(at(new SphereGeometry(0.018, 8, 6), 0, y, 0.255 + off), 0x6a4430)]), wood);
      parent.add(h);
      this.grips.push(h);
    };
    handle(0.01, topBoard, 0);
    handle(-0.035, botBoard, 0.03);
    // Leather between, rebuilt each frame as the top board opens.
    const n = this.ring.length;
    const lp = new Float32Array(n * 3 * 6 * 3);
    const lg = new BufferGeometry();
    this.leatherPos = new BufferAttribute(lp, 3);
    lg.setAttribute('position', this.leatherPos);
    const lc = new Float32Array(lp.length);
    for (let i = 0; i < lc.length; i += 3) {
      const f = 0.85 + ((i / 3) % 6 < 3 ? 0.15 : 0);
      _c.setHex(LEATHER).multiplyScalar(f);
      lc[i] = _c.r;
      lc[i + 1] = _c.g;
      lc[i + 2] = _c.b;
    }
    lg.setAttribute('color', new BufferAttribute(lc, 3));
    this.leather = new Mesh(lg, new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
    this.leather.frustumCulled = false;
    this.body.add(this.leather);
    // Nozzle.
    const noz = new Mesh(
      merge([
        part(at(new CylinderGeometry(0.014, 0.034, 0.2, 12), 0, -0.012, -0.19, -Math.PI / 2), BRASS, { vary: 0.02 }),
        part(at(new TorusGeometry(0.03, 0.006, 6, 14), 0, -0.012, -0.11), 0xa88232),
        part(at(new TorusGeometry(0.016, 0.004, 6, 12), 0, -0.012, -0.285), 0xa88232),
      ]),
      brass,
    );
    this.body.add(noz);
    // Crank on the right.
    const crankGeo = merge([
      part(at(new CylinderGeometry(0.035, 0.035, 0.008, 14), 0, 0, 0, 0, 0, Math.PI / 2), BRASS),
      part(at(new BoxGeometry(0.006, 0.05, 0.01), 0.006, 0.02, 0), 0xa88232),
      part(at(new CylinderGeometry(0.006, 0.006, 0.03, 6), 0.02, 0.042, 0, 0, 0, Math.PI / 2), 0x6a4430),
    ]);
    const crankMesh = new Mesh(crankGeo, brass);
    this.crank.add(crankMesh);
    this.crank.position.set(0.11, -0.012, 0.04);
    this.body.add(this.crank);
    // Canister: glass jar with brass caps on top of the top board.
    const can = new Group();
    can.position.set(0, 0.012, 0.045);
    topBoard.add(can);
    const caps = new Mesh(
      merge([
        part(at(new CylinderGeometry(0.05, 0.054, 0.016, 16), 0, 0.008, 0), BRASS),
        part(at(new CylinderGeometry(0.052, 0.048, 0.014, 16), 0, 0.137, 0), BRASS),
        part(at(new SphereGeometry(0.012, 8, 6), 0, 0.15, 0), 0xa88232),
        ...[0, 1, 2, 3].map((k) => part(at(new BoxGeometry(0.004, 0.12, 0.004), Math.cos(k * 1.571 + 0.785) * 0.048, 0.072, Math.sin(k * 1.571 + 0.785) * 0.048), 0xa88232)),
      ]),
      brass,
    );
    can.add(caps);
    this.glass = new Mesh(new CylinderGeometry(0.046, 0.046, 0.115, 18, 1, true), new MeshPhongMaterial({ color: 0xdfeaf2, transparent: true, opacity: 0.22, shininess: 120, specular: 0xffffff, depthWrite: false, side: DoubleSide }));
    this.glass.position.y = 0.073;
    this.glass.renderOrder = 2;
    can.add(this.glass);
    // Tiny contents: one instanced mesh per kind of thing, up to 12 shown.
    const mini = (g: BufferGeometry, mat: MeshLambertMaterial) => {
      const m = new InstancedMesh(g, mat, 12);
      m.count = 0;
      m.visible = false;
      m.frustumCulled = false;
      can.add(m);
      return m;
    };
    const fl = new MeshLambertMaterial({ vertexColors: true });
    for (const k of Object.keys(geos.body) as DownyKind[]) this.contents[k] = mini(geos.body[k], fl);
    for (const k of Object.keys(geos.item) as (keyof typeof geos.item)[]) this.contents[k] = mini(geos.item[k], fl);
    // Dial on the back cap, facing the player.
    const [dc, dg] = canvas(128, 128);
    this.dialCtx = dg;
    this.dialTex = tex(dc);
    const dial = new Mesh(new CircleGeometry(0.03, 24), new MeshLambertMaterial({ map: this.dialTex }));
    dial.position.set(0, 0.04, 0.12);
    dial.rotation.x = -0.35;
    const bezel = new Mesh(part(at(new TorusGeometry(0.031, 0.004, 6, 20), 0, 0.04, 0.12, -0.35), BRASS), brass);
    const dialPost = new Mesh(part(at(new BoxGeometry(0.02, 0.04, 0.02), 0, 0.02, 0.11), BRASS), brass);
    topBoard.add(dial, bezel, dialPost);
    this.needle = new Mesh(part(at(new BoxGeometry(0.0035, 0.024, 0.002), 0, 0.011, 0), 0x8e3a26), new MeshLambertMaterial({ vertexColors: true }));
    const needlePivot = new Group();
    needlePivot.position.set(0, 0.04, 0.1215);
    needlePivot.rotation.x = -0.35;
    needlePivot.add(this.needle);
    topBoard.add(needlePivot);
    // Gauge plate: a brass strip across the back of the bottom board with one window per slot
    // (laid out by layoutWindows: a row on a desk, spread to a thumb's width on a touch screen).
    this.plate = new Mesh(part(new BoxGeometry(1, 1, 0.006), 0xb08a3a), brass);
    this.plate.rotation.x = -0.2;
    botBoard.add(this.plate);
    this.windows = new InstancedMesh(new CircleGeometry(1, 16), new MeshLambertMaterial({ color: 0xffffff, emissive: 0x24201c }), 5);
    this.windows.frustumCulled = false;
    botBoard.add(this.windows);
    for (let i = 0; i < 5; i++) this.windows.setColorAt(i, _c.setRGB(1, 1, 1));
    for (let i = 0; i < 5; i++) this.windowSpots.push(new Vector3((i - 2) * 0.031, -0.012, 0.1755));
    this.rims = new InstancedMesh(part(new TorusGeometry(1, 0.19, 5, 16), 0x8a6a28), brass, 5);
    this.rims.frustumCulled = false;
    botBoard.add(this.rims);
    this.layoutWindows(0.031, false);
    this.pointer = new Mesh(part(at(new BoxGeometry(0.008, 0.012, 0.004), 0, 0.012, 0), 0x6a3a1e), new MeshLambertMaterial({ vertexColors: true, emissive: 0x2a1408 }));
    this.pointer.position.set(0, 0.0, 0.176);
    this.pointer.rotation.x = -0.2;
    botBoard.add(this.pointer);
    this.rig.position.set(this.baseX, this.baseY, this.baseZ);
    this.rig.scale.setScalar(this.scale);
  }

  /**
   * Places the slot windows. spacing: centre to centre in the bellows' units.
   * grid: two rows (a tall phone), else one row. The plate grows to hold them.
   */
  private layoutWindows(spacing: number, grid: boolean): void {
    const r = grid || spacing > 0.04 ? spacing * 0.36 : 0.0125;
    this.windowR = r;
    this.grid = grid;
    this.rimSel = -1;
    const y0 = -0.012;
    // On a tall phone: two rows of two, between the stick and the Blow button (the grips
    // move over to the right so they never cross a window); a fifth window sits above them. Rows are spaced a little wider than columns because
    // the tilted plate foreshortens them on screen.
    const row = 1.0;
    const gx = -0.03;
    const z0 = 0.1755;
    for (const g of this.grips) g.position.x = grid ? Viewmodel.GRIP_X : 0;
    const spots = grid
      ? [
          [gx - 0.5, 0.5 * row],
          [gx + 0.5, 0.5 * row],
          [gx - 0.5, -0.5 * row],
          [gx + 0.5, -0.5 * row],
          [gx, 1.5 * row],
        ]
      : [0, 1, 2, 3, 4].map((i) => [i - 2, 0]);
    spots.forEach(([cx, cy], i) => {
      // Rows step down the tilted plate.
      this.windowSpots[i].set(cx * spacing, y0 + cy * spacing * Math.cos(0.2), z0 - cy * spacing * Math.sin(0.2));
      this.placeRim(i, false);
    });
    const w = grid ? spacing + 2.5 * r : 4 * spacing + 2.6 * r;
    const h = grid ? row * spacing + 2.5 * r : 0.034 + Math.max(0, 2.6 * r - 0.034);
    this.plate.scale.set(w, h, 1);
    this.plate.position.set(grid ? gx * spacing : 0, y0, z0 - 0.0035);
  }

  /** Where the grips sit across the back of the boards with two rows of windows: right of them. */
  static readonly GRIP_X = 0.08;
  private grips: Mesh[] = [];

  private placeRim(i: number, chosen: boolean): void {
    _q.setFromAxisAngle(_v.set(1, 0, 0), -0.2);
    _m.compose(this.windowSpots[i], _q, _s.setScalar(this.windowR * (chosen ? 1.22 : 1.08)));
    this.rims.setMatrixAt(i, _m);
    this.rims.setColorAt(i, _c.setRGB(chosen ? 1.5 : 1, chosen ? 1.35 : 1, chosen ? 0.9 : 1));
    this.rims.instanceMatrix.needsUpdate = true;
    if (this.rims.instanceColor) this.rims.instanceColor.needsUpdate = true;
  }

  /** Fit the bellows to the screen: on narrow screens it tucks in. hCss: the view's height in CSS px. */
  resize(aspect: number, fov: number, touch: boolean, hCss = 800): void {
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    const halfW = Math.tan(((fov / 2) * Math.PI) / 180) * aspect * 0.6;
    const portrait = aspect < 0.85;
    // On a tall phone the bellows shrinks and tucks in low. Under touch it sits
    // at bottom centre, between the stick and the buttons in the right corner,
    // so the thumb has the whole middle of the right side to look with.
    this.scale = portrait ? 0.6 : 0.86;
    this.baseX = touch ? (portrait ? -halfW * 0.08 : 0) : portrait ? halfW * 0.25 : Math.min(0.27, halfW * 0.62);
    this.baseY = portrait ? -0.255 : -0.235;
    this.baseZ = -0.6;
    this.rig.scale.setScalar(this.scale);
    // Under touch every window must take a thumb: spread them at least 48 px apart on screen
    // (two rows on a tall phone, where a row of four that wide would run under the buttons).
    const depth = -this.baseZ - 0.17 * this.scale;
    const pxPerUnit = (this.scale * (hCss / 2)) / Math.tan(((fov / 2) * Math.PI) / 180) / depth;
    const spacing = touch ? Math.max(0.031, 48 / pxPerUnit) : 0.031;
    this.layoutWindows(spacing, touch && portrait);
  }

  private paintDial(cap: number): void {
    const g = this.dialCtx;
    // Fill every pixel: the disc's edge samples the corners, and transparent black there shows as a black rim.
    g.fillStyle = '#b08a3a';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#efe4c6';
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3b2814';
    g.lineCap = 'round';
    for (let i = 0; i <= cap; i++) {
      const a = -Math.PI * 0.75 + (i / cap) * Math.PI * 1.5;
      const major = i % (cap >= 20 ? 5 : 4) === 0 || i === cap;
      g.lineWidth = major ? 4 : 2;
      g.beginPath();
      g.moveTo(64 + Math.sin(a) * (major ? 40 : 46), 64 - Math.cos(a) * (major ? 40 : 46));
      g.lineTo(64 + Math.sin(a) * 54, 64 - Math.cos(a) * 54);
      g.stroke();
    }
    g.fillStyle = '#3b2814';
    g.font = `600 22px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(cap), 64 + Math.sin(Math.PI * 0.75) * 30, 64 - Math.cos(Math.PI * 0.75) * 30);
    g.fillText('0', 64 - Math.sin(Math.PI * 0.75) * 30, 64 - Math.cos(Math.PI * 0.75) * 30);
    this.dialTex.needsUpdate = true;
    this.dialCap = cap;
  }

  /** How far the bellows is raised into view, 0 to 1 (for checks). */
  get raised(): number {
    return this.rig.visible ? this.shown : 0;
  }

  get windowsShown(): boolean {
    return this.rig.visible && this.windows.visible;
  }

  /** Something went in: the jar jiggles. */
  gulp(): void {
    this.jiggle = 1;
  }

  /** A shot left: the boards slam and the bellows kicks back. */
  puffKick(strong: boolean): void {
    this.open = 0.02;
    this.kickV += strong ? 0.9 : 0.5;
  }

  /**
   * Once a frame. bob: walk phase and amount; look: this frame's turn in
   * radians (for sway); draw: 0..1 drawing power.
   */
  update(dt: number, t: number, o: { phase: number; walk: number; dyaw: number; dpitch: number; draw: number; slots: Slot[]; sel: number; cap: number; land: number; reduced: boolean; sunDir: Vector3; sunColor: Color; skyColor: Color; groundColor: Color; hidden: boolean; windows: boolean }): void {
    // Raised into view when it first arrives, a little slower than the pause dip.
    this.shown = damp(this.shown, o.hidden ? 0 : 1, this.shown < 0.5 && !o.hidden ? 5 : 10, dt);
    this.rig.visible = this.shown > 0.01;
    // The slot windows arrive with the lesson that needs them.
    this.windows.visible = this.rims.visible = this.pointer.visible = this.plate.visible = o.windows;
    // Sway: the bellows lags behind your look a little.
    const sw = o.reduced ? 0.4 : 1;
    this.swayX = damp(this.swayX - o.dyaw * 0.16 * sw, 0, 9, dt);
    this.swayY = damp(this.swayY + o.dpitch * 0.12 * sw, 0, 9, dt);
    this.swayX = clamp(this.swayX, -0.05, 0.05);
    this.swayY = clamp(this.swayY, -0.04, 0.04);
    const bobAmt = o.reduced ? 0.3 : 1;
    const bx = Math.sin(o.phase) * 0.007 * o.walk * bobAmt;
    const by = -Math.abs(Math.cos(o.phase)) * 0.009 * o.walk * bobAmt - o.land * 0.03;
    // Kick spring.
    this.kickV += (-this.kick * 220 - this.kickV * 18) * dt;
    this.kick += this.kickV * dt;
    const hide = (1 - this.shown) * 0.35;
    this.rig.position.set(this.baseX + this.swayX + bx, this.baseY + this.swayY + by - hide, this.baseZ + this.kick * 0.06);
    this.rig.rotation.set(-this.kick * 0.2 + o.draw * 0.04, 0, -this.swayX * 1.5);
    // Pumping while drawing; settles half-open otherwise.
    this.pump += dt * (8 + o.draw * 6) * o.draw;
    const target = 0.1 + Math.sin(this.pump) * 0.09 * o.draw;
    this.open = damp(this.open, target, o.draw > 0.1 ? 30 : 6, dt);
    this.top.rotation.x = -this.open;
    this.crank.rotation.x -= dt * 14 * o.draw;
    this.writeLeather();
    // Jar contents.
    this.jiggle = damp(this.jiggle, 0, 6, dt);
    const slot = o.slots[o.sel];
    for (const key in this.contents) this.contents[key].visible = false;
    if (slot && slot.t) {
      const key = isDowny(slot.t) ? slot.t : isTuft(slot.t) ? 'tuft' : slot.t;
      const m = this.contents[key];
      const shown = Math.min(slot.n, 12);
      const sc = isDowny(slot.t) ? 0.13 : 0.22;
      for (let i = 0; i < shown; i++) {
        const layer = Math.floor(i / 3);
        const a = (i % 3) * 2.1 + layer * 0.9 + t * (isTuft(slot.t) ? 0.6 : 0.15);
        const r = shown === 1 ? 0 : 0.024;
        const jig = Math.sin(t * 30 + i) * this.jiggle * 0.006;
        _q.setFromAxisAngle(_v.set(0, 1, 0), a + Math.PI);
        _m.compose(_v.set(Math.cos(a) * r, 0.022 + layer * 0.027 + jig, Math.sin(a) * r), _q, _s.set(sc, sc, sc));
        m.setMatrixAt(i, _m);
        if (isTuft(slot.t)) m.setColorAt?.(i, _c.setHex(KIND[TUFT_KIND[slot.t]].body));
      }
      m.count = shown;
      m.visible = shown > 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.glass.scale.setScalar(1 + this.jiggle * 0.04);
    // Dial needle.
    if (o.cap !== this.dialCap) this.paintDial(o.cap);
    const frac = slot && slot.t ? slot.n / o.cap : 0;
    this.needleAngle = damp(this.needleAngle, -Math.PI * 0.75 + frac * Math.PI * 1.5, 12, dt);
    this.needle.rotation.z = -this.needleAngle;
    // Slot windows: each filled with its kind's colour to its level.
    for (let i = 0; i < 5; i++) {
      const s = o.slots[i];
      const p = this.windowSpots[i];
      if (!s) {
        _m.makeScale(0.0001, 0.0001, 0.0001);
        this.windows.setMatrixAt(i, _m);
        continue;
      }
      _q.setFromAxisAngle(_v.set(1, 0, 0), -0.2);
      _m.compose(p, _q, _s.setScalar(this.windowR));
      this.windows.setMatrixAt(i, _m);
      if (s.t) {
        const lvl = 0.35 + 0.65 * (s.n / o.cap);
        _c.setHex(thingColor(s.t)).multiplyScalar(lvl);
      } else _c.setRGB(0.12, 0.13, 0.17);
      this.windows.setColorAt(i, _c);
    }
    this.windows.count = this.rims.count = Math.max(4, o.slots.length);
    this.windows.instanceMatrix.needsUpdate = true;
    if (this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
    const sp = this.windowSpots[o.sel] ?? this.windowSpots[0];
    this.selX = damp(this.selX, sp.x, 18, dt);
    this.selY = damp(this.selY, sp.y, 18, dt);
    this.pointer.position.x = this.selX;
    this.pointer.position.y = this.selY + this.windowR + 0.006 + Math.sin(t * 4) * 0.0008;
    this.pointer.position.z = sp.z + 0.0005;
    if (this.grid) {
      this.pointer.visible = false;
      if (this.rimSel !== o.sel) {
        if (this.rimSel >= 0) this.placeRim(this.rimSel, false);
        this.placeRim(o.sel, true);
        this.rimSel = o.sel;
      }
    }
    // Light the bellows like the world around it.
    this.sun.position.copy(o.sunDir);
    this.sun.color.copy(o.sunColor);
    this.sun.intensity = 2.2;
    this.hemi.color.copy(o.skyColor);
    this.hemi.groundColor.copy(o.groundColor);
    this.hemi.intensity = 1.3;
    // Once a frame: the screen queries below read these matrices.
    this.rig.updateMatrixWorld(true);
  }

  private writeLeather(): void {
    // Pleated band between the boards following the board outline; the top
    // edge swings with the top board around the hinge.
    const n = this.ring.length;
    const p = this.leatherPos;
    const ang = this.open;
    const hingeZ = -0.1;
    const yTop = (z: number) => -0.004 + Math.sin(ang) * (z - hingeZ) * 0.98 + (1 - Math.cos(ang)) * 0;
    let k = 0;
    const set = (x: number, y: number, z: number) => p.setXYZ(k++, x, y, z);
    for (let i = 0; i < n; i++) {
      const [x0, z0] = this.ring[i];
      const [x1, z1] = this.ring[(i + 1) % n];
      const yb = -0.016;
      const t0 = yTop(z0);
      const t1 = yTop(z1);
      const m0 = (yb + t0) / 2;
      const m1 = (yb + t1) / 2;
      // Pleat: the middle pulls in when closed, out when open.
      const fold = 0.9 - Math.min(0.12, (t0 - yb) * 0.6);
      const xm0 = x0 * fold;
      const zm0 = (z0 - 0.02) * fold + 0.02;
      const xm1 = x1 * fold;
      const zm1 = (z1 - 0.02) * fold + 0.02;
      // Lower half.
      set(x0, yb, z0);
      set(x1, yb, z1);
      set(xm1, m1, zm1);
      set(x0, yb, z0);
      set(xm1, m1, zm1);
      set(xm0, m0, zm0);
      // Upper half.
      set(xm0, m0, zm0);
      set(xm1, m1, zm1);
      set(x1, t1, z1);
      set(xm0, m0, zm0);
      set(x1, t1, z1);
      set(x0, t0, z0);
      // Skip the remaining 6 verts of the slot (kept degenerate).
      for (let r = 0; r < 6; r++) set(x0, yb, z0);
    }
    p.needsUpdate = true;
    this.leather.geometry.computeVertexNormals();
  }

  /** The muzzle in camera space (for drawing things in and puffing them out). */
  muzzle(out: Vector3): Vector3 {
    this.rig.updateMatrixWorld(true);
    return out.copy(this.muzzleLocal).applyMatrix4(this.body.matrixWorld);
  }

  /** The bellows' lower body on screen (0..1 from top left): tapping it flicks the slot selector. */
  bodyBox(out = { x0: 0, y0: 0, x1: 0, y1: 0 }): { x0: number; y0: number; x1: number; y1: number } {
    let x0 = 1;
    let y0 = 1;
    let x1 = 0;
    let y1 = 0;
    for (const x of [-0.12, 0.12]) {
      for (const y of [-0.05, 0.03]) {
        for (const z of [-0.02, 0.2]) {
          _v.set(x, y, z).applyMatrix4(this.body.matrixWorld).project(this.camera);
          const sx = (_v.x + 1) / 2;
          const sy = (1 - _v.y) / 2;
          x0 = Math.min(x0, sx);
          x1 = Math.max(x1, sx);
          y0 = Math.min(y0, sy);
          y1 = Math.max(y1, sy);
        }
      }
    }
    out.x0 = x0;
    out.y0 = y0;
    out.x1 = x1;
    out.y1 = y1;
    return out;
  }

  /** Screen positions (0..1 from top left) of each slot window, for tapping. */
  windowScreen(i: number, out: Vector3): Vector3 | null {
    const p = this.windowSpots[i];
    if (!p) return null;
    const parent = this.windows.parent!;
    out.copy(p).applyMatrix4(parent.matrixWorld).project(this.camera);
    out.set((out.x + 1) / 2, (1 - out.y) / 2, out.z);
    return out;
  }
}

export function thingKey(t: Thing): string {
  return isDowny(t) ? t : isTuft(t) ? 'tuft' : t;
}
