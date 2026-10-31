// The lessons point at things in the world instead of describing them: a
// cream chevron bobbing over the spot (or, for the feeding lesson, the
// downy's favourite food bobbing over its head), and a soft apricot ring
// draped over the ground around it. It grows with distance so it stays
// readable across the meadow, and fades in and out instead of popping.

import { BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, SphereGeometry, Vector3 } from 'three';
import type { Food } from '../defs';
import type { Mark } from '../lessons';
import { clamp, damp } from '../noise';
import { at, merge, part } from './geo';
import type { CreatureView } from './creatures';

const SEG = 48;
const CREAM = 0xfff1c4;
const APRICOT = 0xffc98e;

export class Marker {
  readonly group = new Group();
  private arrow: Mesh;
  private ring: Mesh;
  private ringPos: BufferAttribute;
  private ringMat: MeshBasicMaterial;
  private foods: Record<Food, Mesh>;
  private iconMat: MeshLambertMaterial;
  private shown = 0;
  private last = { x: NaN, z: NaN, r: 0 };
  private at = new Vector3();
  private icon: Mark['icon'] = 'arrow';

  constructor(geos: CreatureView['geos']) {
    // A rounded chevron: two short strokes meeting at a point below.
    const stroke = (side: number) => part(at(new CylinderGeometry(0.045, 0.045, 0.34, 10), side * 0.1, 0.13, 0, 0, 0, -side * 0.62), CREAM, { vary: 0 });
    const g = merge([stroke(-1), stroke(1), part(at(new SphereGeometry(0.05, 10, 8), 0, -0.01, 0), CREAM, { vary: 0 }), part(at(new SphereGeometry(0.045, 10, 8), -0.2, 0.27, 0), CREAM, { vary: 0 }), part(at(new SphereGeometry(0.045, 10, 8), 0.2, 0.27, 0), CREAM, { vary: 0 })]);
    this.iconMat = new MeshLambertMaterial({ vertexColors: true, emissive: 0x6a5a3a });
    this.arrow = new Mesh(g, this.iconMat);
    this.arrow.name = 'lesson-arrow';
    this.foods = {
      cloverhead: new Mesh(geos.item.cloverhead, new MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2a30 })),
      sweetroot: new Mesh(geos.item.sweetroot, new MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2a20 })),
      dewberry: new Mesh(geos.item.dewberry, new MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2a3a })),
    };
    // The ring: a strip draped over the ground, rebuilt only when it moves.
    const pos = new Float32Array((SEG + 1) * 2 * 3);
    this.ringPos = new BufferAttribute(pos, 3);
    const rg = new BufferGeometry();
    rg.setAttribute('position', this.ringPos);
    const idx: number[] = [];
    for (let i = 0; i < SEG; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    rg.setIndex(idx);
    this.ringMat = new MeshBasicMaterial({ color: APRICOT, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
    this.ring = new Mesh(rg, this.ringMat);
    this.ring.frustumCulled = false;
    this.ring.renderOrder = 2;
    this.ring.name = 'lesson-ring';
    this.group.add(this.arrow, this.ring, ...Object.values(this.foods));
    this.group.visible = false;
  }

  private drape(x: number, z: number, r: number, floor: (x: number, z: number) => number): void {
    const l = this.last;
    if (Math.abs(l.x - x) < 0.03 && Math.abs(l.z - z) < 0.03 && Math.abs(l.r - r) < 0.01) return;
    l.x = x;
    l.z = z;
    l.r = r;
    const w = clamp(r * 0.07, 0.07, 0.26);
    const p = this.ringPos;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const ix = x + c * (r - w);
      const iz = z + s * (r - w);
      const ox = x + c * r;
      const oz = z + s * r;
      p.setXYZ(i * 2, ix, floor(ix, iz) + 0.07, iz);
      p.setXYZ(i * 2 + 1, ox, floor(ox, oz) + 0.07, oz);
    }
    p.needsUpdate = true;
  }

  /** What it shows now (for checks): nothing, an arrow or a food, and whether the ring is down. */
  get showing(): { icon: string | null; ring: boolean } {
    if (!this.group.visible || this.shown < 0.5) return { icon: null, ring: false };
    const o = this.icon === 'arrow' ? this.arrow : this.foods[this.icon as Food];
    return { icon: o.visible ? this.icon : null, ring: this.ring.visible };
  }

  /** Once a frame: follow the lesson's mark, or fade out. eye is the camera position. */
  update(dt: number, t: number, m: Mark, hide: boolean, eye: Vector3, floor: (x: number, z: number) => number, reduced: boolean): void {
    const want = m.on && !hide ? 1 : 0;
    this.shown = damp(this.shown, want, want ? 6 : 9, dt);
    this.group.visible = this.shown > 0.01;
    if (!this.group.visible) return;
    if (m.on) {
      this.at.set(m.x, m.y, m.z);
      this.icon = m.icon;
      if (m.r > 0) this.drape(m.rx, m.rz, m.r, floor);
      this.ring.visible = m.r > 0;
    }
    const d = Math.hypot(this.at.x - eye.x, this.at.y - eye.y, this.at.z - eye.z);
    // Keep a readable size from afar, but never loom close up. Once you are
    // there the arrow has done its job and shrinks away (the ring stays), so
    // it never hangs overhead across the top of the screen.
    const flat = Math.hypot(this.at.x - eye.x, this.at.z - eye.z);
    const here = this.icon === 'arrow' ? clamp((flat - 3) / 2, 0, 1) : 1;
    const grow = clamp(d / 9, 0.7, 3.2) * (0.6 + 0.4 * this.shown) * here;
    const bob = reduced ? 0 : Math.sin(t * 3.2) * 0.12 * grow;
    const isArrow = this.icon === 'arrow';
    this.arrow.visible = isArrow;
    for (const k of Object.keys(this.foods) as Food[]) this.foods[k].visible = this.icon === k;
    const o = isArrow ? this.arrow : this.foods[this.icon as Food];
    o.visible = grow > 0.02;
    o.position.set(this.at.x, this.at.y + bob, this.at.z);
    o.scale.setScalar(grow * (isArrow ? 1 : 2.6));
    // The chevron faces you with a gentle sway; the food turns slowly so it reads as a thing.
    const face = Math.atan2(eye.x - this.at.x, eye.z - this.at.z);
    if (isArrow) o.rotation.set(0, face + (reduced ? 0 : Math.sin(t * 1.7) * 0.35), 0);
    else o.rotation.set(0.35, reduced ? face : t * 1.3, 0);
    this.ringMat.opacity = (0.42 + (reduced ? 0 : Math.sin(t * 2.4) * 0.12)) * this.shown;
  }
}
