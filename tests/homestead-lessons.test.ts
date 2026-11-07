// Sunup's lesson lines: short, and in the same words as the buttons. The act
// button says Harvest, Water, Plant and Hoe, so a line never says pull, sow
// or till for the same thing.
import { describe, expect, it } from 'vitest';
import { allLines } from '../src/games/homestead/lessons';
import { world } from './helpers';

describe('Sunup lesson lines', () => {
  const lines = allLines(world('sunup'));

  it('are eight words or fewer, with no dashes or exclamations', () => {
    expect(lines.length).toBeGreaterThan(10);
    for (const l of lines) {
      expect(l.split(/\s+/).filter(Boolean).length, l).toBeLessThanOrEqual(8);
      expect(l, l).not.toMatch(/[!\u2013\u2014]/);
    }
  });

  it('use the words on the buttons', () => {
    for (const l of lines) expect(l, l).not.toMatch(/\b(sow|sown|till|tilled|pulls?|the hand)\b/i);
  });

  it('the board and the morning card use the button words too (Plant, never sow)', async () => {
    const fs = await import('node:fs');
    for (const f of ['src/ui/dialogs.ts', 'src/ui/hud.ts', 'src/ui/describe.ts']) {
      const text = fs.readFileSync(f, 'utf8');
      // Only strings the player reads: quoted or template text, not code names like stillToSow.
      const shown = [...text.matchAll(/(['`])((?:(?!\1)[^\n])*)\1/g)].map((m) => m[2]).filter((t) => /[a-z] [a-z]/i.test(t));
      for (const t of shown) expect(t, `${f}: ${t}`).not.toMatch(/\b(sow|sown|sowing|till|tilled)\b/i);
    }
  });
});

describe('Sunup acting where it would do something', () => {
  it('fills the can at the well whatever is in hand, once the can is yours', async () => {
    const { resolve } = await import('../src/sim/actions');
    const s = world('sunup');
    s.water = 1;
    s.learn = [];
    // Before the can lesson, hands at the well do nothing.
    expect(resolve(s, 'hands', 11, 2).verb).not.toBe('refill');
    s.learn.push('can');
    const r = resolve(s, 'hands', 11, 2);
    expect(r.verb).toBe('refill');
    expect(r.ok).toBe(true);
    // A full can says so.
    s.water = 99;
    expect(resolve(s, 'seeds', 11, 2).ok).toBe(false);
  });
});

describe('the crow lesson', () => {
  it('lets crows in quietly, and speaks only while a crow is actually on the farm', async () => {
    const { Tutor } = await import('../src/games/homestead/lessons');
    const s = world('sunup');
    for (const id of ['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'sweep', 'requests', 'deliver', 'field', 'turn', 'smith', 'wide']) s.learn.push(`lesson:${id}`);
    s.day = 5;
    const t = new Tutor();
    // Day 5, no crow: no line, but crows are let in.
    let out = t.update(s, 0.1, true);
    expect(out.line).toBe('');
    expect(out.cmds.some((c) => c.type === 'unlock' && c.what === 'pests')).toBe(true);
    s.learn.push('pests');
    out = t.update(s, 0.1, true);
    expect(out.line).toBe('');
    // A crow lands: now the line (on screen four seconds, so it counts as read; round 7).
    s.crows.push({ id: 900, x: 3, y: 5, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    for (let i = 0; i < 41; i++) out = t.update(s, 0.1, true);
    expect(out.line).toMatch(/^A crow is on your [a-z]+\. Shoo it\.$/);
    // Shooed: the crow lesson ends, and the scarecrow note follows the next morning (one new thing a day).
    t.onEvent(s, { type: 'crowScared', id: 900, x: 3, y: 5 } as never);
    s.crows[0].phase = 'flee';
    t.update(s, 0.1, true);
    out = t.update(s, 0.1, true);
    expect(s.learn).toContain('lesson:pests');
    expect(out.line).toBe('');
    s.day += 1;
    expect(t.update(s, 0.1, true).line).toBe('Build a scarecrow on bare soil.');
  });
});

describe('a crow will not wait', () => {
  it('takes the line from a calm lesson, then hands it back', async () => {
    const { Tutor } = await import('../src/games/homestead/lessons');
    const s = world('sunup');
    // (Round 9: the field lesson comes once the first pair is decided.)
    for (const id of ['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'sweep', 'requests', 'sowfor', 'deliver', 'choose', 'turn', 'smith', 'wide']) s.learn.push(`lesson:${id}`);
    s.learn.push('pests');
    s.day = 5;
    s.coins = 500;
    const t = new Tutor();
    expect(t.update(s, 0.1, true).line).toBe('Buy a second field.');
    s.crows.push({ id: 901, x: 3, y: 5, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    for (let i = 0; i < 41; i++) expect(t.update(s, 0.1, true).line).toMatch(/^A crow is on your [a-z]+\. Shoo it\.$/);
    t.onEvent(s, { type: 'crowScared', id: 901, x: 3, y: 5 } as never);
    s.crows[0].phase = 'flee';
    t.update(s, 0.1, true);
    expect(t.update(s, 0.1, true).line).toBe('Buy a second field.');
  });
});

describe('Sunup copy after the playtest', () => {
  it('says where and what: no vague lines, no lines that misfire', () => {
    const lines = allLines(world('sunup'));
    expect(lines).toContain('Read the board.');
    expect(lines).toContain('Hoe the new field.');
    expect(lines).toContain('Tap a radish to harvest it.');
    expect(lines).toContain('Fill the can at the well.');
    for (const l of lines) expect(l, l).not.toMatch(/pinned|^Grow it|Done for today|Hoe it first/);
  });

  it('never says "Build one" to a farmer who cannot pay for it (round 5: the line waits until a scarecrow can be paid for)', async () => {
    const { Tutor } = await import('../src/games/homestead/lessons');
    const s = world('sunup');
    for (const id of ['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'requests', 'deliver', 'field', 'turn', 'smith', 'pests', 'bugs', 'wide']) s.learn.push(`lesson:${id}`);
    s.learnCount['done:pests'] = s.day - 1;
    s.coins = 0;
    const t = new Tutor();
    const line = t.update(s, 0.1, true).line;
    expect(line).not.toMatch(/Build|Scarecrow|Sleep/);
    s.coins = 40;
    expect(t.update(s, 0.1, true).line).toBe('Build a scarecrow on bare soil.');
  });

  it('a milestone reads as something won, not a task', async () => {
    const { MILESTONES } = await import('../src/sim/goals');
    for (const m of MILESTONES) expect(m.done, m.done).not.toMatch(/^(Bring|Buy|Hold|Grow|Harvest|Hire|Own|Farm)\b/);
  });

  it('a refusal says where: hoe this plot', async () => {
    const { resolve } = await import('../src/sim/actions');
    const s = world('sunup');
    s.parcels[1].owned = true;
    expect(resolve(s, 'seeds', 8, 6).reason).toBe('Hoe this plot first');
    expect(resolve(s, 'can', 8, 6).reason).toBe('Hoe this plot first');
  });
});
