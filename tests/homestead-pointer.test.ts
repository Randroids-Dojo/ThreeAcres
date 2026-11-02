// Round 5, P0: the lesson pointer stole taps. Its chevron, drawn half a tile
// above its target, covered the plot to the north, and a tap on that plot
// counted as a tap on the pointer: it took the Build tool without a word,
// walked there, and every tap after built a scarecrow (five of them, 220
// coins down to 20). Now a tap counts as a tap on the pointer only inside its
// target tile (or on its edge arrow); a pointer that builds asks first; and
// with too few coins it says so and does nothing else.
import { describe, expect, it } from 'vitest';
import { Tutor } from '../src/games/homestead/lessons';
import { pointerTap } from '../src/games/homestead/pointer';
import { plant, plots } from '../src/sim/world';
import { EARLY, EARLY_FEATURES, teach, world } from './helpers';

/** The scarecrow lesson's morning: carrots in the first field, one bare plot in its middle. */
function scarecrowMorning(coins: number) {
  const s = teach(world('sunup', 9), [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'bugs', 'field', 'turn', 'smith', 'wide', 'stamina'], [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'pests']);
  s.learnCount['done:pests'] = 5;
  s.day = 6;
  s.coins = coins;
  for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) plant(s, x, y, 'carrot', 2);
  plots(s, 4, 7).crop = null;
  // The plot to the north, under the chevron, has a ripe radish on it.
  plant(s, 4, 6, 'radish', 3);
  s.tool = 'seeds';
  s.seed = 'radish';
  const out = new Tutor().update(s, 0.1, true);
  return { s, out };
}

describe('only a tap inside the target tile is a tap on the pointer', () => {
  it('the plot under the chevron (the one to the north) does its own job', () => {
    const { s, out } = scarecrowMorning(220);
    expect(out.point).toEqual({ x: 4.5, y: 7.5 });
    expect(out.build).toBe('scarecrow');
    // The chevron is drawn over the tile to the north: a tap there is that plot's, not the pointer's.
    expect(pointerTap(s, out.point, out.build, { x: 4, y: 6 })).toBeNull();
    for (const [x, y] of [[3, 7], [5, 7], [4, 8], [3, 6]]) expect(pointerTap(s, out.point, out.build, { x, y }), `${x},${y}`).toBeNull();
  });

  it('a tap inside the target tile asks before it builds (it never just builds, or takes the Build tool)', () => {
    const { s, out } = scarecrowMorning(220);
    // (Round 8: with the hands in hand; a tap with the seeds or the can is the plot's own job.)
    s.tool = 'hands';
    expect(pointerTap(s, out.point, out.build, { x: 4, y: 7 })).toEqual({ do: 'ask', build: 'scarecrow', x: 4, y: 7, cost: 40 });
    // The edge arrow, when the target is off screen, is the pointer itself: it asks too.
    expect(pointerTap(s, out.point, out.build, null)).toEqual({ do: 'ask', build: 'scarecrow', x: 4, y: 7, cost: 40 });
  });

  it('with no coins, a tap on the pointer says what it costs and does nothing else', () => {
    const { s } = scarecrowMorning(220);
    s.tool = 'hands';
    s.coins = 0;
    const t = pointerTap(s, { x: 4.5, y: 7.5 }, 'scarecrow', { x: 4, y: 7 });
    expect(t).toEqual({ do: 'refuse', text: 'A scarecrow costs 40. You have 0.' });
  });

  it('a pointer that builds nothing leaves a tap on its target to that plot (the tool for the job does it)', () => {
    const s = world('sunup');
    expect(pointerTap(s, { x: 2.5, y: 5.5 }, undefined, { x: 2, y: 5 })).toBeNull();
    // Its edge arrow walks there and does the job.
    expect(pointerTap(s, { x: 2.5, y: 5.5 }, undefined, null)).toEqual({ do: 'act', x: 2, y: 5 });
  });

  it('with the Build tool and a scarecrow already in hand, a tap on the target is the player’s own build', () => {
    const { s, out } = scarecrowMorning(220);
    s.tool = 'build';
    s.buildKind = 'scarecrow';
    expect(pointerTap(s, out.point, out.build, { x: 4, y: 7 })).toBeNull();
  });
});
