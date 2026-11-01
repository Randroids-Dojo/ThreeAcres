import { botCommands, newBot } from '../src/sim/bot';
import type { Command } from '../src/sim/commands';
import { DAY_MINUTES } from '../src/sim/constants';
import { CROPS, stageOf } from '../src/sim/crops';
import { PRESETS, type PresetId } from '../src/sim/presets';
import { step } from '../src/sim/step';
import { createWorld, walkable } from '../src/sim/world';
import type { Rules, SimEvent, WorldState } from '../src/sim/types';

export function world(rules: Rules | PresetId, seed = 42): WorldState {
  return createWorld(seed, typeof rules === 'string' ? PRESETS[rules].rules : rules);
}

/** Things that must hold after every step under any mix. */
export function invariants(s: WorldState): string[] {
  const bad: string[] = [];
  const f = s.actors[0];
  if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) bad.push('farmer position not finite');
  for (const a of s.actors) {
    if (a.away) continue;
    if (!walkable(s, Math.floor(a.x), Math.floor(a.y))) bad.push(`${a.name} stands on a blocked tile ${a.x.toFixed(2)},${a.y.toFixed(2)}`);
  }
  if (s.ap < 0 || s.ap > s.apMax) bad.push(`ap ${s.ap}`);
  if (s.stamina < 0 || s.stamina > s.staminaMax) bad.push(`stamina ${s.stamina}`);
  if (s.minute < 0 || s.minute > DAY_MINUTES) bad.push(`minute ${s.minute}`);
  if (s.coins < 0 || !Number.isFinite(s.coins)) bad.push(`coins ${s.coins}`);
  for (const j of s.jobs) {
    if (j.claimedBy !== null) {
      const a = s.actors.find((o) => o.id === j.claimedBy);
      if (!a) bad.push(`job ${j.id} claimed by nobody`);
      else if (a.away) bad.push(`job ${j.id} claimed by ${a.name} who is away`);
    }
  }
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c) continue;
    if (s.tiles[i] !== 'field') bad.push(`crop off the field at ${i}`);
    if (!c.dead && c.stage !== stageOf(c.kind, c.age)) bad.push(`${c.kind} at ${i} stage ${c.stage} age ${c.age}`);
    if (c.age > CROPS[c.kind].days + 0.001) bad.push(`${c.kind} overgrown`);
  }
  for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) if (s.stock[k].some((n) => n < 0)) bad.push(`negative stock ${k}`);
  return bad;
}

export interface RunResult {
  events: SimEvent[];
  steps: number;
  problems: string[];
}

/** Play with the bot until `days` have passed (or a step cap), checking invariants. */
export function play(
  s: WorldState,
  days: number,
  opts: { dt?: number; maxSteps?: number; pace?: number; each?: (s: WorldState, i: number) => Command[]; after?: (s: WorldState, ev: SimEvent[]) => void } = {},
): RunResult {
  const bot = newBot(opts.pace);
  const dt = opts.dt ?? 1 / 30;
  const target = s.day + days;
  const max = opts.maxSteps ?? 400000;
  const events: SimEvent[] = [];
  const problems: string[] = [];
  let i = 0;
  for (; i < max && s.day < target; i++) {
    const cmds = [...(opts.each?.(s, i) ?? []), ...botCommands(s, bot, dt)];
    const ev = step(s, dt, cmds);
    opts.after?.(s, ev);
    for (const e of ev) events.push(e);
    const bad = invariants(s);
    if (bad.length) {
      problems.push(`day ${s.day} step ${i}: ${bad.join('; ')}`);
      if (problems.length > 5) break;
    }
  }
  return { events, steps: i, problems };
}

/** Sunup: mark lessons finished and the features they bring in, as if the farm had been taught them. */
export function teach(s: WorldState, lessons: string[], features: string[] = []): WorldState {
  for (const id of lessons) if (!s.learn.includes(`lesson:${id}`)) s.learn.push(`lesson:${id}`);
  for (const f of features) if (!s.learn.includes(f)) s.learn.push(f);
  return s;
}

/** Sunup's lessons in order up to the requests, with what they bring in. */
export const EARLY = ['pull', 'water', 'well', 'sleep', 'broke', 'plant'];
export const EARLY_FEATURES = ['can', 'sleep', 'coins', 'seeds', 'stamina'];

/** Stand the farmer on a tile, facing a way, idle. */
export function stand(s: WorldState, x: number, y: number, facing: 'n' | 'e' | 's' | 'w'): void {
  const f = s.actors[0];
  f.x = x + 0.5;
  f.y = y + 0.5;
  f.facing = facing;
  f.angle = { n: -Math.PI / 2, s: Math.PI / 2, e: 0, w: Math.PI }[facing];
  f.task = null;
  f.path = [];
  f.aim = null;
}
