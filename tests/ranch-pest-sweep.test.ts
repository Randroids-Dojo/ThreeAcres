// The seventh playtest found a pest stuck in the ranch's north-east corner at
// (35.65, 18.35) twice: roaming at speed 0 for 40 s on night 2, and leaving
// from 20:52 until after 7 am on night 6, in daylight. The corner's two walls
// zeroed its velocity, so the stuck count (which read the speed after the
// walls) never ran, and the detour side flipped every blocked frame, turning
// it back and forth in place; leave mode had no watchdog at all.
//
// This sweeps the whole ranch rather than that one point: pests start along
// every inside and outside fence and wall, in every corner, round every pen,
// house, crate, bench and post, and at the gate posts, facing three ways, in
// roam, flee and leave modes, by day and by night, on a fresh ranch and a busy
// one with the far gates open. No pest may stay within 0.3 m of a spot for 3 s
// or more, and every leaving one must be gone within 60 s.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sim, type Aim, type Controls } from '../src/games/ranch/sim';
import type { Nettle } from '../src/games/ranch/state';
import { CRATE, PEST_HEDGE } from '../src/games/ranch/physics';
import { BOARD, GATES, GATE_HALF, GATE_SIGN, HOLLOW_X, HOUSE, MAXZ, MINZ, MAXX, MINX, PADS, PEN_R, RANCH_Z, RIDGE_X, WINDMILL, WORKBENCH } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';

vi.setConfig({ testTimeout: 120_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(77);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const R = 0.35;
const DT = 1 / 30;

type Layout = 'fresh' | 'busy';
type Mode = 'roam' | 'flee' | 'leave';

function ranch(layout: Layout, hour: number): Sim {
  const sim = new Sim(null);
  const s = sim.s;
  sim.wild = false;
  s.downies = [];
  s.items = [];
  s.sources = [];
  s.hour = hour;
  s.night = s.day;
  s.orderDay = s.day;
  if (layout === 'busy') {
    const kinds = ['garden', 'pen', 'pen', 'silo', 'pen', 'pen'] as const;
    kinds.forEach((k, i) => {
      s.pads[i].kind = k;
      s.pads[i].ups = i === 4 ? ['hedge'] : i === 5 ? ['feeder', 'high'] : [];
    });
    s.gates.ridge = s.gates.hollow = true;
    sim.phys.gates = { ...s.gates };
    sim.phys.setPads(s.pads);
  }
  // You stand on the porch looking up the ranch towards the gate.
  const p = s.player;
  p.x = -15.5;
  p.z = 37.2;
  p.y = sim.phys.floor(p.x, p.z);
  return sim;
}

/** Spots to start a pest: along every fence and wall (both sides where a pest can be), in the corners, round everything solid. */
function spots(sim: Sim, layout: Layout): { x: number; z: number; at: string }[] {
  const out: { x: number; z: number; at: string }[] = [];
  const open = layout === 'busy';
  const add = (x: number, z: number, at: string) => out.push({ x, z, at });
  const top = MAXZ - 2;
  const bot = MINZ + 2;
  // The ranch fence, inside and out, and by its gate posts.
  for (const x of [-35.6, -30, -22, -14, -8, -4.2, -3.3, 3.3, 4.2, 8, 14, 22, 30, 35.6]) {
    add(x, RANCH_Z + R + 0.01, `ranch fence inside at x ${x}`);
    add(x, RANCH_Z - R - 0.01, `ranch fence outside at x ${x}`);
  }
  // The ridge and hollow walls, on the ranch and meadow side (and beyond, where the gates are open).
  for (const z of [top, 50, 40, 30, 22, RANCH_Z + R + 0.01, RANCH_Z - R - 0.01, 12, 4, -4, -9, -11, -16, -22, -26, -32, -40, -48, bot]) {
    add(RIDGE_X + R + 0.01, z, `ridge wall east side at z ${z}`);
    add(HOLLOW_X - R - 0.01, z, `hollow wall west side at z ${z}`);
    if (open) {
      add(RIDGE_X - R - 0.01, z, `ridge wall west side at z ${z}`);
      add(HOLLOW_X + R + 0.01, z, `hollow wall east side at z ${z}`);
    }
  }
  // The valley's edges, and their corners.
  for (const x of [-34, -24, -12, 0, 12, 24, 34]) {
    add(x, top, `south edge at x ${x}`);
    add(x, bot, `north edge at x ${x}`);
  }
  if (open) {
    for (const x of [MINX + 2, -60, -45, 45, 60, MAXX - 2]) {
      add(x, top, `far south edge at x ${x}`);
      add(x, bot, `far north edge at x ${x}`);
      add(x < 0 ? MINX + 2 : MAXX - 2, x < 0 ? -20 - x / 4 : 20 - x / 4, `far side edge`);
    }
  }
  // The ranch gate's posts and the far gates' posts, all round (the side a pest can reach).
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const sx of [-2.6, 2.6]) add(sx + Math.cos(a) * (0.3 + R + 0.02), RANCH_Z + Math.sin(a) * (0.3 + R + 0.02), `ranch gate post ${sx} at ${k * 45} degrees`);
    for (const g of Object.values(GATES)) {
      for (const sz of [-1, 1]) {
        const x = g.x + Math.cos(a) * (0.55 + R + 0.02);
        const z = g.z + sz * (GATE_HALF + 0.4) + Math.sin(a) * (0.55 + R + 0.02);
        if (!open && (g.x < 0 ? x < g.x : x > g.x)) continue;
        add(x, z, `${g.name} gate post at ${k * 45} degrees`);
      }
    }
  }
  // Round every pen (outside its fence, or its hedge's reach), the house, the crate, the bench, the windmill, the board and the posts.
  for (const ring of sim.phys.rings) {
    const r = PEN_R + R + (ring.hedge ? PEST_HEDGE : 0.1) + 0.02;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add(ring.x + Math.cos(a) * r, ring.z + Math.sin(a) * r, `round pen ${ring.pad} at ${k * 45} degrees`);
    }
  }
  const box = (x0: number, z0: number, x1: number, z1: number, name: string) => {
    const e = R + 0.02;
    for (const [x, z] of [
      [x0 - e, z0 - e],
      [x1 + e, z0 - e],
      [x0 - e, z1 + e],
      [x1 + e, z1 + e],
      [(x0 + x1) / 2, z0 - e],
      [(x0 + x1) / 2, z1 + e],
      [x0 - e, (z0 + z1) / 2],
      [x1 + e, (z0 + z1) / 2],
    ])
      add(x, z, `by the ${name}`);
  };
  box(HOUSE.x - HOUSE.w / 2, HOUSE.z - HOUSE.d / 2, HOUSE.x + HOUSE.w / 2, HOUSE.z + HOUSE.d / 2, 'house');
  box(CRATE.x0, CRATE.z0, CRATE.x1, CRATE.z1, 'sell crate');
  box(WORKBENCH.x - 0.5, WORKBENCH.z - 1, WORKBENCH.x + 0.5, WORKBENCH.z + 1, 'workbench');
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    add(WINDMILL.x + Math.cos(a) * (1.7 + R + 0.02), WINDMILL.z + Math.sin(a) * (1.7 + R + 0.02), 'by the windmill');
    add(BOARD.x + Math.cos(a) * (0.25 + R + 0.02), BOARD.z + Math.sin(a) * (0.25 + R + 0.02), 'by the price board');
    add(GATE_SIGN.x + Math.cos(a) * (0.2 + R + 0.02), GATE_SIGN.z + Math.sin(a) * (0.2 + R + 0.02), 'by the gate sign');
    for (const p of PADS) add(p.px + Math.cos(a) * (0.16 + R + 0.02), p.pz + Math.sin(a) * (0.16 + R + 0.02), 'by a plot post');
  }
  return out;
}

/** Run every spot at once (pests do not bump each other), recording where each is every 0.1 s. */
function sweep(layout: Layout, hour: number, mode: Mode, secs: number) {
  const sim = ranch(layout, hour);
  const s = sim.s;
  const list = spots(sim, layout);
  const pests: { n: Nettle; at: string; track: [number, number, number][] }[] = [];
  let id = 1;
  for (const sp of list) {
    for (const yaw of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const n: Nettle = { id: id++, x: sp.x, y: sim.phys.floor(sp.x, sp.z), z: sp.z, vx: 0, vy: 0, vz: 0, r: R, grounded: true, yaw, mode, modeT: mode === 'flee' ? 20 : 0, tx: sp.x, tz: sp.z, bristle: 0, roll: 0, gone: false, snuffT: 99 };
      // Settle it where the colliders put it (a spot inside something moves to its edge).
      sim.phys.collide(n, n.x, n.z, 'nettle');
      s.nettles.push(n);
      pests.push({ n, at: `${sp.at} (${sp.x.toFixed(2)}, ${sp.z.toFixed(2)}), facing ${yaw.toFixed(1)}`, track: [] });
    }
  }
  const p = s.player;
  const aim: Aim = { ex: p.x, ey: p.y + 1.6, ez: p.z, dx: 0, dy: 0, dz: -1, mx: p.x, my: p.y + 1.4, mz: p.z - 0.6 };
  let f = 0;
  for (let t = 0; t < secs; t += DT, f++) {
    sim.update(DT, idle, aim);
    sim.events.length = 0;
    if (f % 3 === 0) for (const q of pests) if (!q.n.gone) q.track.push([t, q.n.x, q.n.z]);
  }
  // Still: within 0.3 m of where it was for 3 s or more.
  const still: string[] = [];
  for (const q of pests) {
    const tr = q.track;
    for (let i = 0; i < tr.length; i++) {
      let j = i;
      let far = false;
      while (j < tr.length && tr[j][0] - tr[i][0] < 3) {
        if (Math.hypot(tr[j][1] - tr[i][1], tr[j][2] - tr[i][2]) >= 0.3) {
          far = true;
          break;
        }
        j++;
      }
      if (!far && j < tr.length) {
        still.push(`${q.at}: still from ${tr[i][0].toFixed(1)} s at (${tr[i][1].toFixed(2)}, ${tr[i][2].toFixed(2)}), ${q.n.mode}`);
        break;
      }
    }
  }
  const stayed = pests.filter((q) => !q.n.gone).map((q) => `${q.at}: still here at (${q.n.x.toFixed(2)}, ${q.n.z.toFixed(2)}), ${q.n.mode}`);
  return { n: pests.length, still, stayed };
}

describe('pests never sit still anywhere on the ranch (the seventh playtest: stuck in the north-east corner)', () => {
  it('the playtest spot: a pest in the north-east corner at (35.65, 18.35) gets out, roaming, fleeing or leaving', () => {
    for (const [mode, hour] of [
      ['roam', 23],
      ['flee', 23],
      ['leave', 23],
      ['leave', 12],
    ] as [Mode, number][]) {
      const sim = ranch('fresh', hour);
      const n: Nettle = { id: 3, x: 35.65, y: sim.phys.floor(35.65, 18.35), z: 18.35, vx: 0, vy: 0, vz: 0, r: R, grounded: true, yaw: Math.PI * 0.75, mode, modeT: mode === 'flee' ? 20 : 0, tx: 0, tz: 0, bristle: 0, roll: 0, gone: false, snuffT: 99 };
      sim.s.nettles.push(n);
      const p = sim.s.player;
      const aim: Aim = { ex: p.x, ey: p.y + 1.6, ez: p.z, dx: 0, dy: 0, dz: -1, mx: p.x, my: p.y + 1.4, mz: p.z - 0.6 };
      for (let t = 0; t < 3; t += DT) sim.update(DT, idle, aim);
      expect(n.gone || Math.hypot(n.x - 35.65, n.z - 18.35) > 1, `${mode} at ${hour}:00: still at (${n.x.toFixed(2)}, ${n.z.toFixed(2)})`).toBe(true);
    }
  });

  for (const layout of ['fresh', 'busy'] as Layout[]) {
    for (const [mode, hour] of [
      ['roam', 23],
      ['flee', 23],
      ['leave', 23],
      ['leave', 12],
      ['roam', 12],
    ] as [Mode, number][]) {
      it(`${layout} ranch, ${mode} at ${hour}:00: no pest still for 3 s${mode === 'leave' || hour === 12 ? ', and every one gone within 60 s' : ''}`, () => {
        const r = sweep(layout, hour, mode, mode === 'leave' || hour === 12 ? 60 : 40);
        expect(r.n).toBeGreaterThan(400);
        expect(r.still.slice(0, 8), `${r.still.length} of ${r.n} still`).toEqual([]);
        if (mode === 'leave' || hour === 12) expect(r.stayed.slice(0, 8), `${r.stayed.length} of ${r.n} not gone`).toEqual([]);
      });
    }
  }
});
