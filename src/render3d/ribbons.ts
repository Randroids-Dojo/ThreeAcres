// Round 9: the season's fair gives a ribbon, and the ribbons hang on the
// house's front, beside the door: a blue rosette with two tails for each fair
// won (up to six shown), so the farm itself says how it has done.

import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { PROPS } from '../sim/map';
import { col } from './util';

export interface Ribbons {
  group: Group;
  /** Show this many ribbons (rebuilds only when the count changes). */
  set(n: number): void;
  dispose(): void;
}

const MOST = 6;

export function buildRibbons(): Ribbons {
  const group = new Group();
  group.name = 'ribbons';
  const disc = new CylinderGeometry(0.085, 0.085, 0.025, 14);
  disc.rotateX(Math.PI / 2);
  const boss = new CylinderGeometry(0.04, 0.04, 0.03, 10);
  boss.rotateX(Math.PI / 2);
  const tail = new BoxGeometry(0.035, 0.12, 0.01);
  const blue = new MeshLambertMaterial({ color: col('#2f5fae') });
  const gold = new MeshLambertMaterial({ color: col('#e8bb3a') });
  const red = new MeshLambertMaterial({ color: col('#b8382e') });
  const house = PROPS.find((p) => p.kind === 'house') as { x: number; y: number; w: number; h: number; doorX?: number };
  // The house's front wall (as props.ts builds it): its depth is the prop's less 0.36, its walls stand on a 0.12 plinth.
  const front = house.y + house.h / 2 + (house.h - 0.36) / 2 + 0.035;
  const doorX = (house.doorX ?? house.x + 1) + 0.5;
  let shown = 0;
  return {
    group,
    set(n: number) {
      const k = Math.max(0, Math.min(MOST, Math.floor(n)));
      if (k === shown) return;
      shown = k;
      for (const c of [...group.children]) group.remove(c);
      for (let i = 0; i < k; i++) {
        // Three on each side of the door, from the door outwards, at waist height (under the eaves they hid).
        const side = i % 2 === 0 ? 1 : -1;
        const x = doorX + side * (0.48 + Math.floor(i / 2) * 0.24);
        const y = 0.12 + 0.5;
        const r = new Group();
        const d = new Mesh(disc, i % 3 === 2 ? red : blue);
        const b = new Mesh(boss, gold);
        b.position.z = 0.012;
        r.add(d, b);
        for (const s of [-1, 1]) {
          const t = new Mesh(tail, i % 3 === 2 ? red : blue);
          t.position.set(s * 0.03, -0.1, -0.004);
          t.rotation.z = s * 0.25;
          r.add(t);
        }
        r.position.set(x, y, front);
        r.traverse((o) => (o.castShadow = false));
        group.add(r);
      }
    },
    dispose() {
      disc.dispose();
      boss.dispose();
      tail.dispose();
      blue.dispose();
      gold.dispose();
      red.dispose();
    },
  };
}
