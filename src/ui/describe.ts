// Words for the tile you are aiming at: what is there and what the tool will
// do. Under synergy soil it also explains the crop's quality, which is most
// of the puzzle.

import type { Resolved } from '../sim/actions';
import { BUILD_COST, STAMINA_COST } from '../sim/constants';
import { CROPS, QUALITY_NAME } from '../sim/crops';
import { qualityAt } from '../sim/soil';
import { buildAt, isField, owned, plots } from '../sim/world';
import type { Verb, WorldState } from '../sim/types';
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
    return `<b>For sale</b> <span class="why">${p.price} coins</span>`;
  }
  const b = buildAt(s, x, y);
  if (b) return `<b>${b.kind === 'sprinkler' ? 'Sprinkler' : 'Scarecrow'}</b>`;
  const plot = plots(s, x, y);
  const c = plot.crop;
  if (!c) return plot.tilled ? '<b>Bare soil</b>' : '<b>Meadow</b> <span class="why">hoe it first</span>';
  const d = CROPS[c.kind];
  let state: string;
  if (c.dead) state = 'withered';
  else if (c.stage === 4) state = 'ripe';
  else if (c.bugs) state = 'bugs';
  else if (!plot.wet) state = 'thirsty';
  else {
    const left = Math.max(1, Math.ceil(d.days - c.age));
    state = `${left} day${left === 1 ? '' : 's'} to go`;
  }
  return `<b>${d.name}</b> <span class="why">${state}</span>`;
}
