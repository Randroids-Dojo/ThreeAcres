
import { CROP_IDS } from '../src/sim/crops';
import { PRESET_IDS } from '../src/sim/presets';
import { play, world } from '../tests/helpers';
{
  for (const id of PRESET_IDS) {
    const s = world(id);
    const t0 = performance.now();
    const r = play(s, 30);
    const h = CROP_IDS.map((c) => `${c[0]}${c[1]}:${s.stats.harvested[c]}`).join(' ');
    const counts: Record<string, number> = {};
    for (const e of r.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    console.log(id, 'day', s.day, 'simMin', (s.time / 60).toFixed(1), 'steps', r.steps, 'ms', (performance.now() - t0).toFixed(0), 'coins', s.coins, 'earned', s.stats.earned, 'fields', s.parcels.filter((p) => p.owned).length, 'hands', s.actors.length - 1, 'rep', s.rep, 'stars', s.almanac.history.join(','), '\n  ', h, '\n  ', JSON.stringify(counts), r.problems.slice(0, 3));
  }
}
