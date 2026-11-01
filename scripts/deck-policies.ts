// Seedbound's stall policies for the strategy table and the quota fit: the
// fourth playtest's simulation, where the balance bot plays every day and only
// the stall changes. It uses only the bot and the rules' public calls, so it
// runs against an older build too.
import { botShop, Dice } from '../src/games/deck/bot';
import {
  allCards,
  buyCard,
  buyPage,
  buyScoop,
  buySlot,
  canBuyScoop,
  canBuySlot,
  canRemove,
  canUpgrade,
  leaveShop,
  maxPages,
  removeCard,
  reroll,
  scoopPrice,
  slotOnSale,
  slotPrice,
  upgradeCard,
  type CardId,
  type PageId,
  type RunState,
} from '../src/games/deck/rules';

export const ALL = ['beehive', 'chili', 'corn', 'wheat', 'pumpkin', 'shears', 'mint', 'trowel', 'storm'] as CardId[];
export type Shop = (s: RunState, dice: Dice) => void;
export const o = { noise: 0.15, seed: 0, guided: false };

function prefShop(cardsWant: CardId[], pagesWant: PageId[], improve: CardId[], throwOut: CardId[], minDeck = 8, rerolls = 0, slots = false): Shop {
  return (s) => {
    const sh = s.shop!;
    let rr = 0;
    for (let g = 0; g < 40; g++) {
      let did = false;
      for (const pid of pagesWant) {
        const i = sh.pages.findIndex((p) => !p.sold && p.page === pid);
        if (i >= 0 && sh.pages[i].price <= s.coins && s.pages.length < maxPages(s) && buyPage(s, i)) {
          did = true;
          break;
        }
      }
      if (!did && slots && slotOnSale(s) && canBuySlot(s) && s.coins >= slotPrice(s) * 1.25 && buySlot(s)) did = true;
      if (!did && canBuyScoop(s) && s.coins >= scoopPrice(s) && buyScoop(s)) did = true;
      if (!did) {
        for (const id of cardsWant) {
          const i = sh.cards.findIndex((c) => !c.sold && c.card === id && c.price <= s.coins);
          if (i >= 0 && buyCard(s, i)) {
            did = true;
            break;
          }
        }
      }
      if (!did && canUpgrade(s)) {
        const c = allCards(s).find((c) => !c.up && improve.includes(c.id) && s.draw.includes(c));
        if (c && upgradeCard(s, c.uid)) did = true;
      }
      if (!did && canRemove(s) && allCards(s).length > minDeck) {
        const c = s.draw.find((c) => throwOut.includes(c.id));
        if (c && removeCard(s, c.uid)) did = true;
      }
      if (!did && rr < rerolls && s.coins > 60 && reroll(s)) {
        rr++;
        did = true;
      }
      if (!did) break;
    }
    leaveShop(s);
  };
}
const C = (...a: string[]) => a as CardId[];
const Pg = (...a: string[]) => a as PageId[];
export const POL: Record<string, Shop> = {
  bot: (s, d) => botShop(s, o, d),
  none: (s) => leaveShop(s),
  roots: prefShop(C('carrot', 'radish'), Pg('cellar', 'thumb', 'rotation', 'basket'), C('carrot', 'radish'), C('lettuce', 'garlic', 'strawberry', 'beans', 'sunflower')),
  rootsplus: prefShop(C('carrot', 'radish'), Pg('cellar', 'barrel', 'thumb', 'basket', 'market', 'rotation'), C('carrot', 'radish'), C('lettuce', 'sunflower', 'strawberry', 'can'), 8, 3, true),
  bloom: prefShop(C('sunflower', 'beehive', 'chili', 'strawberry', 'beans', 'ladybirds', 'scarecrow'), Pg('bees', 'thumb', 'basket', 'market'), C('strawberry', 'beans', 'sunflower'), C('radish', 'lettuce')),
  perennial: prefShop(C('beans', 'strawberry', 'corn', 'sunflower', 'chili'), Pg('barrel', 'thumb', 'basket', 'bees', 'market'), C('beans', 'strawberry', 'corn'), C('radish', 'lettuce', 'carrot'), 8, 2, true),
  rootsNoBarrel: prefShop(C('carrot', 'radish'), Pg('cellar', 'thumb', 'basket', 'market', 'rotation'), C('carrot', 'radish'), C('lettuce', 'sunflower', 'strawberry', 'can'), 8, 3, true),
  rootsBarrel: prefShop(C('carrot', 'radish'), Pg('cellar', 'barrel', 'thumb', 'rotation', 'basket'), C('carrot', 'radish'), C('lettuce', 'garlic', 'strawberry', 'beans', 'sunflower')),
  rootsNoCellar: prefShop(C('carrot', 'radish'), Pg('barrel', 'thumb', 'basket', 'market', 'rotation'), C('carrot', 'radish'), C('lettuce', 'sunflower', 'strawberry', 'can'), 8, 3, true),
  bloomplus: prefShop(C('sunflower', 'beehive', 'chili', 'strawberry', 'beans'), Pg('bees', 'barrel', 'thumb', 'basket', 'market'), C('strawberry', 'beans', 'sunflower'), C('radish', 'lettuce', 'can'), 8, 3, true),
  pagesonly: prefShop([], Pg('thumb', 'basket', 'cellar', 'market', 'clover', 'furrow', 'rotation', 'bees', 'barrel', 'coldframe'), [], []),
  // Round 4: the bloom and perennial builds without the page each leans on, to see whether one page decides them.
  bloomNoBees: prefShop(C('sunflower', 'beehive', 'chili', 'strawberry', 'beans'), Pg('barrel', 'thumb', 'basket', 'market', 'clover'), C('strawberry', 'beans', 'sunflower'), C('radish', 'lettuce', 'can'), 8, 3, true),
  perennialNoBarrel: prefShop(C('beans', 'strawberry', 'corn', 'sunflower', 'chili'), Pg('thumb', 'basket', 'bees', 'market', 'clover'), C('beans', 'strawberry', 'corn'), C('radish', 'lettuce', 'carrot'), 8, 2, true),
};

