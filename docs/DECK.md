# Seedbound: design

A roguelike deckbuilder about one small plot and a run of seasons. Original rules, cards and art, in the genre of deckbuilders where scoring combos is the thrill.

**The fantasy:** a seed tin of cards and a four by four plot. Each day you draw a hand, plant seeds, water, call the weather and set up companions. At the end of the day the ripe crops are harvested one by one in a cascade of coins and multipliers. Each season sets a quota. Beat it, spend your coins on new cards and almanac pages, and face a bigger quota. Miss it and the run is over. A run lasts 20 to 40 minutes.

## Run structure

- **Year:** 4 seasons of 6 days each.
- **Quotas:** coins earned within the season.
  - Year 1: spring 60, summer 130, autumn 240, winter 380.
  - Each later year multiplies by 2.4.
  - Tune these with the bot, so a decent player usually clears year 1 and rarely clears year 3.
- **Money:** coins are both score and money. They carry over between seasons and are spent in the shop.
- **Season end:** if the season's earnings reached the quota, the season is cleared and the shop opens. If not, the run ends.
- **Run end:** shows the years and seasons survived, the best single harvest, the total coins, and the new cards unlocked.
- **Meta progression (light):** a pool of cards starts locked. Each finished run unlocks 2 new cards for future shops. Keep a best record.

## A day

1. Draw up to 5 cards (hand size 5). Energy refills to 3.
2. Play cards, each costing energy. Unplayed cards are kept in hand, up to the hand size. Excess is discarded at the end of the day, oldest first.
3. Press End day. Then, in order:
   1. Weather resolves.
   2. Watered crops grow one day; dry ones do not.
   3. Pests spread.
   4. Every ripe crop is harvested in reading order, with the scoring cascade below.
   5. Perennials stay in their plot; other crops leave theirs empty.
   6. Plots dry out unless they are mulched.
4. The draw pile reshuffles from the discard pile when it runs out.

## The board

Four by four plots. A plot holds one crop or one object (a scarecrow or a beehive) and has two flags: wet, and mulched for N days. Some almanac pages add a fifth column.

## Scoring

Each harvest is scored as chips × mult.
- **Chips** start at the crop's base value, plus flat bonuses.
- **Mult** starts at 1 and gains additive bonuses, then any times-multipliers.
- **Display:** the crop pops, the chips count up, the mult ticks in, then the product flies into the season bar.
- **Pace:** each harvest takes about 0.35 s at normal speed, quicker when there are many. Pitch rises with each harvest in the chain.
- **Speed:** a setting offers fast scoring, and a tap skips the animation.

## Cards

Start deck (14 cards): Radish x5, Carrot x3, Lettuce x2, Watering Can x3, Rain x1.

### Seeds

| Card | Cost | Days | Base chips | Rule |
|---|---|---|---|---|
| Radish | 1 | 1 | 2 | +2 chips if next to a carrot |
| Carrot | 1 | 2 | 5 | +1 mult for each radish harvested earlier today |
| Lettuce | 1 | 2 | 4 | +4 chips if next to a tall crop |
| Beans | 1 | 3 | 3 | Perennial: picks again every day, 3 picks. Neighbours get +2 chips. |
| Corn (tall) | 2 | 4 | 12 | x1.5 mult if next to beans |
| Sunflower (tall) | 1 | 3 | 3 | Bees: neighbours get +1 mult when they harvest |
| Pumpkin | 2 | 5 | 30 | x2 mult if no neighbours at all |
| Strawberry | 1 | 3 | 3 | Perennial: picks every day, +1 chip per pick so far, 4 picks |
| Mint | 1 | 2 | 2 | Each night, spreads a mint sprout into one empty neighbour |
| Garlic | 1 | 2 | 3 | Neighbours are immune to pests |
| Wheat | 1 | 3 | 4 | +1 chip for each other wheat on the board |
| Chili | 1 | 2 | 6 | The next crop harvested after it gets x1.5 mult |

### Tools

| Card | Cost | Effect |
|---|---|---|
| Watering Can | 0 | Water a row |
| Hose | 1 | Water every plot |
| Mulch | 1 | A plot stays wet for 3 days |
| Compost | 1 | Target crop +6 chips at harvest |
| Fertiliser | 1 | Target crop grows one day now |
| Trowel | 0 | Move a crop to an empty neighbouring plot |
| Shears | 1 | Harvest a ripe crop now; it scores twice its chips |
| Ladybirds | 0 | Clear all pests |
| Scarecrow | 1 | Object: crows can't land in the 3 by 3 around it |
| Beehive | 2 | Object: every crop in the 3 by 3 gets +1 mult |

### Weather

Weather cards take effect tonight.

| Card | Cost | Effect |
|---|---|---|
| Rain | 1 | Water every plot, and crops grow an extra day |
| Sun | 1 | Ripe crops +3 chips tonight |
| Storm | 2 | Every crop grows 2 days, but one random crop is flattened |

### Hazards

From summer of year 1 onward:
- **Pests:** appear on a random growing crop most nights. A pested crop doesn't grow, and the pests spread to one neighbour each night.
- **Crows:** from autumn, may take one ripe crop that isn't guarded.

## The shop

The shop opens between seasons.
- **Cards:** 3 random cards from the unlocked pool, 15 to 45 coins depending on rarity (common, uncommon, rare).
- **Almanac pages:** 2 pages at 60 to 120 coins. You can hold up to 5.
- **Removal:** remove a card for 25.
- **Upgrade:** upgrade a card for 30. An upgraded seed gets +50% base chips, an upgraded tool costs 1 less.
- **Reroll:** 5, rising by 2 each time it is used.

### Almanac pages

Passive rules:

| Page | Effect |
|---|---|
| Rain Barrel | Start each day with the first plot of each row wet |
| Root Cellar | Radish and carrot get +3 chips |
| Busy Bees | Sunflowers and beehives give +2 mult instead of +1 |
| Green Thumb | +1 energy per day |
| Big Basket | Hand size +1 |
| Crop Rotation | A crop planted where a different crop was harvested today gets +4 chips |
| Market Day | Every fifth harvest in a day is x2 |
| Four-Leaf Clover | Each harvest has a 1 in 8 chance to be golden, x3 |
| Long Furrow | The board gains a fifth column |
| Cold Frame | Winter quota -20% |

## Look and feel

Distinct from Sunup's 3D diorama and Thistledown's first-person valley. It should feel like a card game on a warm wooden table, with the plot as a painted almanac plate.
- **Board:** reuse the almanac crop drawings from `src/render2d` (`paintCrop`, `paintProduce`, the palettes and paper) at a larger scale, so crops are recognisably the same painted plants, framed as a garden bed on paper.
- **Cards:** paper cards with a painted illustration (seeds draw their crop and produce), a cost pip, the name, short rule text, and a coloured edge by type (seed green, tool brass, weather blue, object terracotta). Draw icons for tools and weather in the same ink-and-wash style.
- **Juice:** cards fan and lift on hover or touch. Playing arcs a card to its plot. Scoring pops, sparkles and fly-ups. A short shake on big multipliers. The season bar fills.
- **Phone portrait first** (about 412 by 900):
  - quota and season bar along the top (leaving the shell's top-left corner clear)
  - the board in the middle
  - the hand fanned along the bottom
  - the energy pips and End day button between them
- **Desktop:** the board centre left, a side panel for the deck, discard pile and almanac pages, and the hand along the bottom.

## Controls

| Input | How |
|---|---|
| Touch | Tap a card to pick it up: valid plots light up. Tap a plot to play it. Tap the card again to put it down. Dragging a card onto a plot also works. Long-press a card for its details. |
| Mouse | Click or drag the same way; hover shows details. |
| Keyboard | 1 to 7 pick a card, arrows move the plot cursor, Enter or Space plays, E ends the day, Esc puts the card down or opens the pause menu. |
| Gamepad | Optional. |

## Save

Save after every card played, at the end of each day and in the shop. The save is a full deterministic run state (seeded RNG) plus the meta unlocks and best record. Summary example: "Year 1 summer, day 3, 210 coins".

## Priorities

1. The rules engine (deterministic, seeded, unit tested), the start deck, the board, a day, the scoring cascade, and quotas.
2. The shop, almanac pages, hazards, the full card list, meta unlocks, a balance bot.
3. Juice, animation, sound cues and polish.
