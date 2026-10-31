// Print one bot run day by day: npx tsx scripts/deck-trace.ts [seed] [seasons]
import { botDay, botShop, Dice } from '../src/games/deck/bot';
import { CARDS, newRun, SEASON_NAMES } from '../src/games/deck/rules';

import { TUNING } from "../src/games/deck/rules";
if (process.env.FREE) TUNING.quotas = [0.01, 0.01, 0.01, 0.01];
const seed = Number(process.argv[2] ?? 1000);
const maxSeasons = Number(process.argv[3] ?? 2);
const { s } = newRun(seed, null);
const dice = new Dice(5);
let seasons = 0;
while (s.phase !== 'over' && seasons < maxSeasons) {
  if (s.phase === 'day') {
    const hand = s.hand.map((c) => CARDS[c.id].name + (c.up ? '+' : '')).join(', ');
    const label = `y${s.year} ${SEASON_NAMES[s.season]} d${s.day} (${s.earned}/${s.quota})`;
    const ev = botDay(s, { noise: 0, seed: 1 }, dice);
    const played = ev.filter((e) => e.t === 'play').map((e) => (e.t === 'play' ? `${CARDS[e.card.id].name}@${e.plot}${e.to !== undefined ? '>' + e.to : ''}` : '')).join(' ');
    const harv = ev.filter((e) => e.t === 'harvest').map((e) => (e.t === 'harvest' ? `${e.h.kind}:${e.h.chipsTotal}x${e.h.multTotal}=${e.h.score}` : '')).join(' ');
    const haz = ev.filter((e) => e.t === 'pest' || e.t === 'crow' || e.t === 'flatten').map((e) => e.t).join(' ');
    console.log(`${label}\n  hand: ${hand}\n  play: ${played}\n  harvest: ${harv} ${haz ? ' hazards: ' + haz : ''}`);
    for (const e of ev) if (e.t === 'seasonEnd') { seasons++; console.log(`== season end ${e.cleared ? 'cleared' : 'failed'} ${e.earned}/${e.quota}`); }
  } else if (s.phase === 'shop') {
    const before = s.coins;
    console.log('shop', JSON.stringify(s.shop!.cards.map((c) => c.card + ':' + c.price)), JSON.stringify(s.shop!.pages.map((p) => p.page + ':' + p.price)), 'coins', s.coins);
    botShop(s, { noise: 0, seed: 1 }, dice);
    console.log(`  spent ${before - s.coins}, deck ${s.draw.map((c) => c.id + (c.up ? '+' : '')).join(',')} pages ${s.pages}`);
  }
}
