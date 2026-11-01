// Words for the tile you are aiming at: what is there and what the tool will
// do. Under synergy soil it also explains the crop's quality, which is most
// of the puzzle.

import { fieldRep, homestead, sowing, type Resolved } from '../sim/actions';
import { BUILD_COST, CAN_WATER, STAMINA_COST } from '../sim/constants';
import { CROPS, QUALITY_NAME } from '../sim/crops';
import { qualityAt } from '../sim/soil';
import { buildAt, isField, owned, plots, season, SEASON_NAMES } from '../sim/world';
import type { CropId, Verb, WorldState } from '../sim/types';
import { esc } from './dom';

export const VERB_NAMES: Record<Verb, string> = {
  till: 'Hoe',
  water: 'Water',
  plant: 'Plant',
  harvest: 'Harvest',
  tend: 'Pick off the bugs',
  clear: 'Clear',
  build: 'Build',
  scare: 'Shoo the crow',
  refill: 'Fill the can',
};

/** A townsperson's name inside a sentence: "the lighthouse keeper", never "The lighthouse keeper" after "for". */
export function townName(who: string): string {
  return who.replace(/^The /, 'the ');
}

/** A sentence from parts: the first starts with a capital, the rest run on in lower case ("Sold 4 for 120, 2 grew"). */
export function sentence(parts: string[]): string {
  const s = parts.join(', ');
  return s ? `${s[0].toUpperCase()}${s.slice(1)}.` : '';
}

export function denyText(reason: string): string {
  if (reason === 'unowned') return 'This field is for sale';
  return reason;
}

function cost(s: WorldState, verb: Verb, r: Resolved): string {
  const bits: string[] = [];
  if (s.rules.clock === 'day' && STAMINA_COST[verb]) bits.push(`${STAMINA_COST[verb]} stamina`);
  if (s.rules.clock === 'turns') bits.push('1 move');
  if (verb === 'plant') bits.push(`${CROPS[r.crop ?? s.seed].seed} coins`);
  if (verb === 'build') bits.push(`${BUILD_COST[r.build ?? s.buildKind]} coins`);
  return bits.length ? ` <span class="why">(${bits.join(', ')})</span>` : '';
}

/** HTML for the info line. Empty string hides it. */
export function describe(s: WorldState, x: number, y: number, r: Resolved): string {
  if (!isField(s, x, y)) return '';
  if (!owned(s, x, y)) {
    const p = s.parcels[s.parcelOf[y * s.W + x]];
    return `<b>For sale</b> <span class="why">${p.price} coins. Tap to buy, or use the board</span>`;
  }
  const plot = plots(s, x, y);
  const parts: string[] = [];
  const b = buildAt(s, x, y);
  const synergy = s.rules.growth === 'synergy';
  if (b) parts.push(`<b>${b.kind === 'sprinkler' ? 'Sprinkler' : 'Scarecrow'}</b> <span class="why">${b.kind === 'sprinkler' ? 'waters the nine plots around it each morning' : 'keeps crows off within three plots'}</span>`);
  const c = plot.crop;
  if (c) {
    const d = CROPS[c.kind];
    let state: string;
    if (c.dead) state = 'withered';
    else if (c.stage === 4) state = 'ripe';
    else if (c.age === 0) state = 'planted today';
    else state = `day ${Math.floor(c.age)} of ${d.days}`;
    let line = `<b>${d.name}</b> <span class="why">${state}`;
    if (!c.dead && c.stage < 4) {
      line += synergy ? `, moisture ${plot.moisture} of 3` : plot.wet ? ', watered' : ', dry';
      if (c.bugs) line += ', bugs';
    }
    line += '</span>';
    parts.push(line);
    if (synergy && !c.dead) {
      const q = qualityAt(s, x, y);
      const why: string[] = [];
      if (q.friend) why.push(c.kind === 'pumpkin' ? 'room to sprawl' : 'a friend next door');
      if (q.bees) why.push('bees');
      if (q.rich) why.push('rich soil');
      if (q.spent) why.push('spent soil');
      if (q.crowded) why.push('crowded');
      if (q.parched) why.push('went thirsty');
      parts.push(`<span class="q">${QUALITY_NAME[q.quality]}</span>${why.length ? ` <span class="why">${why.join(', ')}</span>` : ''}`);
    }
  } else if (!b) {
    if (!plot.tilled) parts.push('<b>Meadow</b> <span class="why">hoe it to plant</span>');
    else {
      let line = '<b>Bare soil</b>';
      if (synergy) line += ` <span class="why">moisture ${plot.moisture}, nutrients ${Math.floor(plot.nutrient)} of 3</span>`;
      parts.push(line);
      if (synergy && r.verb === 'plant' && r.crop) {
        const q = qualityAt(s, x, y, r.crop);
        parts.push(`<span class="why">${esc(CROPS[r.crop].name)} here would be</span> <span class="q">${QUALITY_NAME[q.quality]}</span>`);
      }
    }
  }
  let head = '';
  if (r.verb && r.ok) {
    const what = r.verb === 'plant' ? `Plant ${CROPS[r.crop ?? s.seed].name.toLowerCase()}` : r.verb === 'build' ? `Build a ${r.build ?? s.buildKind}` : VERB_NAMES[r.verb];
    head = `${what}${cost(s, r.verb, r)}: `;
  } else if (r.reason && r.reason !== 'Growing') head = `<span class="why">${esc(denyText(r.reason))}.</span> `;
  return head + parts.join(' &middot; ');
}

/** Sunup's caption: the thing and its state in a few words. The act button shows the verb. */
export function brief(s: WorldState, x: number, y: number): string {
  if (!isField(s, x, y)) return '';
  if (!owned(s, x, y)) {
    const p = s.parcels[s.parcelOf[y * s.W + x]];
    const rep = fieldRep(s, p.id);
    return `<b>For sale</b> <span class="why">${s.rep < rep ? `to farmers with reputation ${rep}` : `${p.price} coins`}</span>`;
  }
  const b = buildAt(s, x, y);
  if (b) return `<b>${b.kind === 'sprinkler' ? 'Sprinkler' : 'Scarecrow'}</b>`;
  const plot = plots(s, x, y);
  const c = plot.crop;
  if (!c) return plot.tilled ? `<b>Bare soil</b>${plot.wet ? ' <span class="why">watered</span>' : ''}` : '<b>Meadow</b> <span class="why">hoe this plot to plant it</span>';
  const d = CROPS[c.kind];
  let state: string;
  if (c.dead) state = 'withered';
  else if (c.stage === 4) state = 'ripe';
  else if (c.bugs) state = 'bugs, pick them off';
  else if (!plot.wet) state = 'thirsty';
  else {
    // Sunup's soil holds a full watering for two days: say when it is wet for tomorrow too.
    const left = Math.max(1, Math.ceil(d.days - c.age));
    state = `${left} day${left === 1 ? '' : 's'} to go${plot.moisture >= 3 && s.weather !== 'heat' ? ', wet till tomorrow' : ''}`;
  }
  return `<b>${d.name}</b> <span class="why">${state}</span>`;
}

/** The can's water for the meters: how full, and whether it is empty. Null before the can is yours. */
export function canLevel(s: WorldState): { frac: number; left: number; max: number; empty: boolean; low: boolean } | null {
  if (homestead(s) && !s.learn.includes('can')) return null;
  const max = CAN_WATER[s.tools.can] ?? CAN_WATER[0];
  const left = Math.max(0, Math.min(max, s.water));
  return { frac: left / max, left, max, empty: left <= 0, low: left <= Math.max(2, Math.round(max * 0.2)) };
}

/** The seed picker's two small lines for a crop today: price and sale, and when it is ready or why not. */
export function seedNote(s: WorldState, c: CropId): { price: string; when: string; state: 'now' | 'next' | 'late' | 'off' } {
  const d = CROPS[c];
  const price = `${d.seed} \u00b7 sells ${d.price}`;
  if (!homestead(s)) return { price, when: `${d.days} days`, state: 'now' };
  const sw = sowing(s.day, c);
  if (sw.next) return { price, when: `${SEASON_NAMES[(season(s.day) + 1) % 4]} crop`, state: 'next' };
  if (sw.late) return { price, when: 'Too late', state: 'late' };
  if (!sw.ok) return { price, when: d.seasons.map((n) => SEASON_NAMES[n]).join(', '), state: 'off' };
  return { price, when: `${d.days} days${d.regrow ? `, then ${d.regrow}` : ''}`, state: 'now' };
}
