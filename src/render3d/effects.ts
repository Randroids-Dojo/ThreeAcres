// Turns simulation events into effects at their tiles: dirt puffs, splashes,
// seed pops, bounces, the harvest arc into the crate, scattering bugs,
// feathers, glints, dust, flashes. Cheap to call: it writes a few particles
// and timestamps and never allocates.

import { Vector3 } from 'three';
import type { SimEvent, WorldState } from '../sim/types';
import type { Emitter } from './actors';
import type { Crops, TileTimers } from './crops';
import { SOIL_Y } from './fields';
import { Kind, disp, type Particles, type TileFlashes } from './fx';

const C = {
  dirt: disp('#7d5a3a'),
  dirt2: disp('#a47a4c'),
  dust: disp('#c2a67c'),
  water: disp('#8fcdf2'),
  water2: disp('#d7f0ff'),
  seed: disp('#ead9a2'),
  green: disp('#7cc256'),
  green2: disp('#4f9a3a'),
  dead: disp('#8a6a3a'),
  dead2: disp('#6b5232'),
  feather: disp('#23252f'),
  gold: disp('#ffd45a'),
  silver: disp('#e8eef6'),
  white: disp('#fffaf0'),
  star: disp('#ffb22e'),
  bug: disp('#2b211c'),
  smoke: disp('#e9e4dc'),
  sprout: disp('#b6e07a'),
};

const QUALITY_COL = [C.white, C.silver, C.gold, C.star];

export interface Effects {
  emitter: Emitter;
  onEvent(e: SimEvent, s: Readonly<WorldState>): void;
  update(now: number, dt: number, chimney: Vector3, hour: number, wind: { x: number; y: number }): void;
  setScale(scale: number, reduced: boolean): void;
  thunderAt: number;
  dawnAt: number;
  boltX: number;
}

export function makeEffects(p: Particles, flashes: TileFlashes, timers: TileTimers, crops: Crops, crateMouth: Vector3): Effects {
  let scale = 1;
  let reduced = false;
  let smokeT = 0;
  const rnd = Math.random;
  const n = (k: number) => Math.max(1, Math.round(k * scale));
  const spd = () => (reduced ? 0.6 : 1);

  const burst = (
    x: number, y: number, z: number, count: number,
    col: Vector3, col2: Vector3 | null, kind: Kind,
    speed: number, up: number, life: number, size: number, gravity: number, drag = 0, additive = false, alpha = 1,
  ) => {
    const s = spd();
    for (let i = 0; i < n(count); i++) {
      const a = rnd() * Math.PI * 2;
      const r = (0.4 + rnd() * 0.6) * speed * s;
      const c = col2 && rnd() < 0.5 ? col2 : col;
      p.spawn(
        x + (rnd() - 0.5) * 0.1, y, z + (rnd() - 0.5) * 0.1,
        Math.cos(a) * r, (up * (0.6 + rnd() * 0.6)) * s, Math.sin(a) * r,
        life * (0.7 + rnd() * 0.5), size * (0.7 + rnd() * 0.6),
        c.x, c.y, c.z, alpha, kind, gravity, drag, additive,
      );
    }
  };

  const top = (s: Readonly<WorldState>, x: number, y: number) => crops.heightAt(s, y * s.W + x);

  crops.onLand = (x, y, z) => {
    burst(x, y + 0.05, z, 4, C.dust, null, Kind.Puff, 0.5, 0.3, 0.6, 0.22, 0, 2);
    burst(x, y + 0.15, z, 5, C.gold, C.white, Kind.Spark, 0.6, 1.2, 0.6, 0.1, 1, 1, true);
  };

  const self: Effects = {
    thunderAt: -1e6,
    dawnAt: -1e6,
    boltX: 0.5,
    setScale(sc, red) {
      scale = sc * (red ? 0.5 : 1);
      reduced = red;
    },
    emitter: {
      water(x, y, z, dx, dz) {
        // A short arc of drops from the spout.
        for (let i = 0; i < n(2); i++) {
          p.spawn(x, y, z, dx * 1.1 + (rnd() - 0.5) * 0.25, 0.4 + rnd() * 0.3, dz * 1.1 + (rnd() - 0.5) * 0.25, 0.42, 0.045, C.water.x, C.water.y, C.water.z, 0.9, Kind.Disc, 7);
        }
      },
      seeds(x, y, z, dx, dz) {
        if (rnd() < 0.5) return;
        p.spawn(x, y, z, dx * 0.7 + (rnd() - 0.5) * 0.8, 0.6 + rnd() * 0.5, dz * 0.7 + (rnd() - 0.5) * 0.8, 0.5, 0.035, C.seed.x, C.seed.y, C.seed.z, 1, Kind.Chunk, 6);
      },
      dust(x, y, z) {
        burst(x, y, z, 5, C.dirt, C.dust, Kind.Chunk, 0.8, 1.4, 0.45, 0.05, 6);
        burst(x, y, z, 2, C.dust, null, Kind.Puff, 0.3, 0.3, 0.6, 0.25, 0, 2, false, 0.6);
      },
    },
    onEvent(e, s) {
      if (!('x' in e) || e.x === undefined || e.y === undefined) {
        if (e.type === 'thunder') {
          self.thunderAt = p.now;
          self.boltX = 0.15 + rnd() * 0.7;
        } else if (e.type === 'dawn') self.dawnAt = p.now;
        else if (e.type === 'coins') {
          const cx = crateMouth.x;
          const cz = crateMouth.z;
          burst(cx, crateMouth.y + 0.2, cz, 12, C.gold, C.white, Kind.Spark, 0.45, 1.6, 1.2, 0.17, -0.6, 1, true);
        }
        return;
      }
      if (e.type === 'step') {
        if (e.ground === 'path' || e.ground === 'yard' || e.ground === 'field') {
          const px = Number.isInteger(e.x) ? e.x + 0.5 : e.x;
          const pz = Number.isInteger(e.y) ? e.y + 0.5 : e.y;
          if (rnd() < 0.6) burst(px, 0.04, pz, 1, C.dust, null, Kind.Puff, 0.15, 0.15, 0.5, 0.14, 0, 2, false, 0.45);
        }
        return;
      }
      const x = Math.floor(e.x);
      const y = Math.floor(e.y);
      if (x < 0 || y < 0 || x >= s.W || y >= s.H) return;
      const i = y * s.W + x;
      const cx = x + 0.5;
      const cz = y + 0.5;
      const now = p.now;
      switch (e.type) {
        case 'till':
          burst(cx, SOIL_Y + 0.02, cz, 20, C.dirt, C.dirt2, Kind.Chunk, 1.2, 2.4, 0.7, 0.09, 7);
          burst(cx, SOIL_Y + 0.05, cz, 6, C.dust, null, Kind.Puff, 0.45, 0.45, 1.0, 0.6, 0, 2, false, 0.8);
          timers.wet[i] = -1e6;
          break;
        case 'water':
          burst(cx, SOIL_Y + 0.25, cz, 18, C.water, C.water2, Kind.Disc, 1.0, 2.0, 0.6, 0.075, 7);
          burst(cx, SOIL_Y + 0.03, cz, 12, C.water2, null, Kind.Disc, 1.5, 0.7, 0.4, 0.06, 4);
          timers.wet[i] = now;
          break;
        case 'plant':
          burst(cx, SOIL_Y + 0.05, cz, 10, C.seed, C.dirt2, Kind.Chunk, 0.7, 2.0, 0.6, 0.065, 7);
          burst(cx, SOIL_Y + 0.12, cz, 6, C.sprout, null, Kind.Spark, 0.35, 0.9, 0.6, 0.16, 0, 1, true, 0.9);
          timers.bounce[i] = now;
          break;
        case 'grow':
          timers.bounce[i] = now + (rnd() * 0.25);
          burst(cx, SOIL_Y + top(s, x, y) * 0.6 + 0.05, cz, 2, C.sprout, null, Kind.Spark, 0.2, 0.6, 0.6, 0.13, 0, 1, true, 0.8);
          break;
        case 'harvest': {
          crops.flyer(e.crop, x, y, crateMouth, now);
          const q = Math.max(0, Math.min(3, e.quality | 0));
          burst(cx, SOIL_Y + 0.3, cz, 5 + q * 5, QUALITY_COL[q], q === 3 ? C.gold : C.white, Kind.Spark, 0.8 + q * 0.15, 1.5, 0.8 + q * 0.1, 0.16 + q * 0.03, 1, 1.5, true);
          burst(cx, SOIL_Y + 0.05, cz, 10, C.green, C.dirt2, Kind.Chunk, 0.9, 1.8, 0.6, 0.07, 7);
          break;
        }
        case 'tend':
          // Bugs scatter: dark specks flying out.
          burst(cx, SOIL_Y + Math.max(0.15, top(s, x, y) * 0.6), cz, 14, C.bug, null, Kind.Disc, 1.8, 1.0, 0.8, 0.05, 0.5, 1);
          burst(cx, SOIL_Y + 0.2, cz, 5, C.sprout, null, Kind.Spark, 0.35, 0.9, 0.6, 0.14, 0, 1, true, 0.9);
          break;
        case 'clear':
          burst(cx, SOIL_Y + 0.1, cz, 16, C.dead, C.green2, Kind.Chunk, 1.1, 2.2, 0.8, 0.085, 6);
          burst(cx, SOIL_Y + 0.1, cz, 7, C.dead2, null, Kind.Leaf, 0.7, 1.4, 1.5, 0.13, 1.2, 1.5);
          break;
        case 'build':
        case 'unbuild':
          timers.build[i] = e.type === 'build' ? now : -1e6;
          for (let k = 0; k < n(14); k++) {
            const a = (k / 14) * Math.PI * 2;
            p.spawn(cx + Math.cos(a) * 0.3, 0.05, cz + Math.sin(a) * 0.3, Math.cos(a) * 1.0 * spd(), 0.2, Math.sin(a) * 1.0 * spd(), 0.9, 0.42, C.dust.x, C.dust.y, C.dust.z, 0.75, Kind.Puff, 0, 3);
          }
          if (e.type === 'unbuild') burst(cx, 0.2, cz, 10, C.dirt2, C.dead, Kind.Chunk, 1, 2, 0.6, 0.05, 7);
          break;
        case 'wither':
          timers.droop[i] = now;
          burst(cx, SOIL_Y + Math.max(0.2, top(s, x, y)), cz, 9, C.dead, C.dead2, Kind.Leaf, 0.45, 0.25, 2.0, 0.13, 0.7, 1.2);
          break;
        case 'bugs':
          burst(cx, SOIL_Y + 0.25, cz, 8, C.bug, null, Kind.Disc, 0.5, 0.5, 0.8, 0.055, 0, 2);
          break;
        case 'sprinkle':
          timers.spray[i] = now;
          for (let k = 0; k < n(36); k++) {
            const a = (k / 36) * Math.PI * 2 + rnd() * 0.2;
            const sp = (1.3 + rnd() * 0.5) * spd();
            p.spawn(cx, 0.4, cz, Math.cos(a) * sp, 1.6 + rnd() * 0.6, Math.sin(a) * sp, 0.8, 0.065, C.water.x, C.water.y, C.water.z, 0.9, Kind.Disc, 6);
          }
          break;
        case 'crowIn':
          flashes.flash(x, y, '#3a3550', 1.2, 0.25);
          break;
        case 'crowEat':
          burst(cx, SOIL_Y + 0.25, cz, 12, C.feather, null, Kind.Leaf, 1.0, 1.3, 1.8, 0.14, 0.8, 1.2);
          burst(cx, SOIL_Y + 0.08, cz, 12, C.green, C.green2, Kind.Chunk, 1.1, 2.0, 0.7, 0.07, 7);
          break;
        case 'crowScared':
          burst(cx + 0.12, SOIL_Y + Math.min(1.1, Math.max(0.1, top(s, x, y) * 0.85)) + 0.1, cz, 16, C.feather, null, Kind.Leaf, 1.4, 1.7, 1.8, 0.14, 0.8, 1.4);
          break;
        case 'deny':
          timers.shake[i] = now;
          flashes.flash(x, y, '#ff5040', 0.5, 0.55);
          break;
        case 'coins':
          burst(cx, 0.4, cz, 12, C.gold, C.white, Kind.Spark, 0.45, 1.6, 1.2, 0.17, -0.6, 1, true);
          break;
        default:
          break;
      }
    },
    update(now, dt, chimney, hour, wind) {
      // Morning chimney smoke.
      const morning = hour < 10.5 ? 1 : hour < 11.5 ? 11.5 - hour : 0;
      if (morning > 0) {
        smokeT -= dt;
        if (smokeT <= 0) {
          smokeT = 0.32 / Math.max(0.3, morning * scale);
          p.spawn(chimney.x + (rnd() - 0.5) * 0.06, chimney.y, chimney.z, wind.x * 0.25 + (rnd() - 0.5) * 0.05, 0.42 + rnd() * 0.1, wind.y * 0.25, 4.2, 0.32, C.smoke.x, C.smoke.y, C.smoke.z, 0.55 * morning, Kind.Puff, -0.02, 0.15);
        }
      }
      void now;
    },
  };
  return self;
}
