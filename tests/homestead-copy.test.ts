// Round 2, copy: "For The lighthouse keeper", ", Sold 4 for 120", "No coins
// yet" after earning and spending, "Order filled" when everything else says
// request, two toasts for one field, an 18-word footnote, field prices
// printed twice, and harvest words running across the whole screen.
import { describe, expect, it } from 'vitest';
import { allLines } from '../src/games/homestead/lessons';
import { deliver } from '../src/sim/goals';
import { sentence, townName } from '../src/ui/describe';
import { morningNews } from '../src/ui/hud';
import type { SimEvent } from '../src/sim/types';
import { EARLY, EARLY_FEATURES, teach, world } from './helpers';

describe('Sunup copy after the second playtest', () => {
  it('town names read as names inside a sentence', () => {
    expect(`For ${townName('The lighthouse keeper')}.`).toBe('For the lighthouse keeper.');
    expect(townName('Old Tamsin')).toBe('Old Tamsin');
  });

  it('the morning card is one sentence, a capital at its start only, and says when a request gave up', () => {
    const s = world('sunup');
    s.report = { day: 4, sold: [{ crop: 'radish', n: 4, value: 120 }], wages: 0, grew: 2, withered: 0, eaten: 0, crewWork: 0, income: 120, filled: [{ who: 'Old Tamsin', reward: 145 }], lapsed: [{ who: 'The lighthouse keeper', crop: 'corn', n: 8 }] };
    // Round 4: three clauses at most, the most pressing kept ("2 grew" counted stage changes; Sunup says what is ripe).
    expect(morningNews(s)).toBe('Yesterday you sold 4 for 120, Old Tamsin paid 145, the lighthouse keeper gave up on the corn.');
    s.report = { day: 4, sold: [{ crop: 'radish', n: 4, value: 120 }], wages: 0, grew: 0, withered: 0, eaten: 0, crewWork: 0, income: 120 };
    expect(morningNews(s)).toBe('Yesterday you sold 4 for 120.');
    expect(sentence([])).toBe('');
  });

  it('a request handed over by day is a request, not an order', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    // (Round 6: two radishes sown for it and picked.)
    s.orders = [{ id: 7, who: 'Mabel’s bakery', items: [{ crop: 'radish', n: 2 }], reward: 70, rep: 1, due: 9, got: 2 }];
    s.stock.radish[0] = 2;
    const ev: SimEvent[] = [];
    deliver(s, 7, ev);
    expect(ev.some((e) => e.type === 'order')).toBe(false);
    expect(ev.some((e) => e.type === 'request' && e.done)).toBe(true);
  });

  it('out of coins with a full crate, the line does not say "yet"', () => {
    const lines = allLines(world('sunup'));
    expect(lines).toContain('No coins left. Sleep to sell the crate.');
    for (const l of lines) expect(l, l).not.toMatch(/No coins yet/);
  });
});
