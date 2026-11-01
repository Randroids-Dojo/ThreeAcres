// Pests find their way round the ranch's low fence. On the Pixel a pest
// leaving by day pushed into the fence beside the gate post and stayed there:
// leaving and fleeing pests never turned aside, and the fence opens only at
// the gate. They now head for the gate when the fence is between them and
// where they are going, and step sideways along anything in the way.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Sim, type Aim, type Controls } from '../src/games/ranch/sim';
import { RANCH_Z } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(5);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };

/** A ranch at an hour, one pest at (x, z) in a mode, and the player stood near it (so it cannot just slip away unseen). */
function withPest(hour: number, x: number, z: number, mode: 'leave' | 'roam') {
  const sim = new Sim(null);
  const s = sim.s;
  s.hour = hour;
  s.player.x = x + 2;
  s.player.z = z + 4;
  s.player.y = sim.phys.floor(s.player.x, s.player.z);
  s.nettles.push({ id: 7, x, y: sim.phys.floor(x, z), z, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: Math.PI, mode, modeT: 0, tx: 0, tz: 0, bristle: 0, roll: 0, gone: false, snuffT: 9 });
  const aim: Aim = { ex: s.player.x, ey: s.player.y + 1.6, ez: s.player.z, dx: 0, dy: 0, dz: 1, mx: s.player.x, my: s.player.y + 1.4, mz: s.player.z + 0.6 };
  return { sim, s, aim, n: s.nettles[0] };
}

describe('pests and the ranch fence', () => {
  it('a pest leaving by day from beside the gate post gets out through the gate (the Pixel spot)', () => {
    for (const x of [4.5, -4.5, 12, -15]) {
      const { sim, s, aim, n } = withPest(12, x, RANCH_Z + 1.6, 'leave');
      let out = false;
      for (let t = 0; t < 40 && !out; t += 1 / 30) {
        s.player.x = n.x + 2;
        s.player.z = n.z + 4;
        sim.update(1 / 30, idle, aim);
        if (n.z < RANCH_Z - 1) out = true;
      }
      expect(out, `from x ${x}`).toBe(true);
    }
  });

  it('a pest roaming in at night comes through the gate instead of pressing on the fence', () => {
    for (const x of [8, -10]) {
      const { sim, aim, n } = withPest(22, x, RANCH_Z - 6, 'roam');
      let inside = false;
      for (let t = 0; t < 40 && !inside; t += 1 / 30) {
        sim.update(1 / 30, idle, aim);
        if (n.z > RANCH_Z + 1) inside = true;
      }
      expect(inside, `from x ${x}`).toBe(true);
    }
  });

  it('a pest never stays pressed on one spot for long', () => {
    const { sim, aim, n } = withPest(12, 6, RANCH_Z + 0.9, 'leave');
    let still = 0;
    let worst = 0;
    let lx = n.x;
    let lz = n.z;
    for (let t = 0; t < 30 && !n.gone; t += 1 / 30) {
      sim.update(1 / 30, idle, aim);
      if (Math.hypot(n.x - lx, n.z - lz) < 0.004) still += 1 / 30;
      else still = 0;
      worst = Math.max(worst, still);
      lx = n.x;
      lz = n.z;
    }
    expect(worst).toBeLessThan(2);
  });
});
