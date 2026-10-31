# Seedbound: design

A roguelike deckbuilder about one small plot and a run of seasons. Original rules, cards and art, in the genre of deckbuilders where scoring combos is the thrill.

**The fantasy:** a seed tin of cards and a four by four plot. Each day you draw a hand, plant seeds, water, call the weather and set up companions. At the end of the day the ripe crops are harvested one by one in a cascade, each paying its yield times its bloom. Each season sets a quota. Beat it, spend your coins on new cards and almanac pages, and face a bigger quota. Miss it and the run is over. A run lasts 20 to 40 minutes.

**Words the player sees:** a harvest pays **yield × bloom** ("Lettuce: 4 yield, × 2 bloom"). Yield is what the crop is worth; bloom multiplies it. The code keeps the names `chips` and `mult`, and the audio cues stay `deck.chip` and `deck.mult`.

## Run structure

- **Year:** 4 seasons of 6 days each.
- **Quotas:** coins earned within the season.
  - Year 1: spring 40, summer 55, autumn 65, winter 80.
  - Each later year multiplies by 1.75, rounded to a 5 (under 100) or a 10.
  - The first draft (60, 130, 240, 380, times 2.4 a year) assumed much faster growth than the cards give: a bought card is played about once a season, so decks grow slowly and the bot could not clear summer. See Balance.
- **Money:** coins are both score and money. They carry over between seasons and are spent in the shop. Spending never counts against a quota.
- **Season end:** the plot is cleared (crops and objects), every card goes back in the tin. If the season's earnings reached the quota, the season is cleared and the shop opens. If not, the run ends.
- **Run end:** an almanac entry for the run: each season's take against its quota, the best single harvest, the coins taken in all, the harvest count, and the new cards unlocked.
- **Meta progression (light):** a pool of cards starts locked. Each finished run unlocks the next 2 in a fixed order: beehive and chili, corn and wheat, pumpkin and shears, mint and trowel, then storm. The best record (most seasons, best harvest, most coins) is kept with the run in the same save.

## A day

1. Draw up to 5 cards (hand size 5). Energy refills to 3 (three seed scoops on the bench).
2. Play cards, each costing energy (the seed dots printed on the card). Unplayed cards are kept in hand. Excess over the hand size is discarded at the end of the day, oldest first.
3. Once a day you may toss a card from hand onto the spent heap and draw a fresh one. This keeps a hand of unplayable cards (a full plot, no water) from locking a run.
4. Blow out the lantern (End day). Then, in order:
   1. Weather resolves. Rain and storm water every plot; a storm flattens one random crop.
   2. Watered crops grow one day (plus one per rain, plus two per storm); dry ones do not. Pested crops do not grow.
   3. Pests: each pest patch counts down a night and has a 40% chance to spread to a neighbour; then new pests may land on a growing crop. Mint creeps into one empty neighbour.
   4. A crow may take one ripe crop that no scarecrow guards.
   5. Every ripe, clean crop is harvested in reading order (top left first) with the scoring cascade.
   6. Perennials stay in their plot for their remaining picks; other crops leave theirs empty.
   7. Plots dry out unless they are mulched.
5. The draw pile reshuffles from the discard pile when it runs out.

Decisions made while building:
- **Neighbours** are the four plots sharing an edge. "The 3 by 3" (beehive, scarecrow) includes the diagonals.
- **Neighbour rules read the board as the harvest starts.** A crop pulled earlier in the cascade still counts as a neighbour for the ones after it, so what you see before the night is what scores.
- **Ripe perennials** pick every night without water. Pests on them block that night's pick.
- **Pests** stay two nights, then move on. A pested crop is neither grown nor harvested. Garlic keeps them off itself and its neighbours; Ladybirds clear them.
- **Objects** (scarecrow, beehive) stand on their plot until the season ends, then the card returns to the tin.
- **Weather stacks:** two rains are two extra days.

## The board

Four by four plots. A plot holds one crop or one object and has two flags: wet, and mulched for N nights. The Long Furrow page adds a fifth column from the next season.

## Scoring

Each harvest is scored as yield × bloom, rounded to a whole coin.
- **Yield** starts at the crop's base value, plus flat bonuses (and the shears double it).
- **Bloom** starts at 1 and gains additive bonuses, then any times-multipliers.
- **Display:** the crop lifts and glows, a paper slip by it counts the yield up one reason at a time ("+2 next to a carrot"), the bloom ticks in beside it in red, then the slip turns into the total, which arcs onto the pegboard and moves the peg. A dashed ink line links a bonus to the crop it came from.
- **Pace:** about 0.3 to 0.7 s per harvest by how many reasons it has, compressed when there are more than six. Pitch rises along the chain on a pentatonic ladder.
- **Big harvests:** a total of a tenth of the quota gets sparks; a quarter or more gets a gilt slip, a beat more time, a short table shake and the `deck.big` cue. Small ones just pop and fly.
- **Speed:** "Harvest pace: easy or fast" in the almanac (F toggles it; fast is 2.2 times). A tap or any key skips the rest of the night; the board lands exactly where a watched night would.

## Cards

Start deck (14 cards): Radish x5, Carrot x3, Lettuce x2, Watering Can x3, Rain x1.

The player's very first day deals Carrot, Radish, Radish, Watering Can, Lettuce from that deck to teach the carrot and radish.

### Seeds

| Card | Cost | Nights | Base yield | Rule |
|---|---|---|---|---|
| Radish | 1 | 1 | 2 | +2 yield next to a carrot |
| Carrot | 1 | 2 | 5 | +1 bloom for each radish pulled before it tonight |
| Lettuce | 1 | 2 | 4 | +4 yield next to a tall crop |
| Beans | 1 | 3 | 3 | Perennial: 3 picks. Neighbours get +2 yield. |
| Corn (tall) | 2 | 4 | 12 | x1.5 bloom next to beans |
| Sunflower (tall) | 1 | 3 | 3 | Bees: neighbours get +1 bloom |
| Pumpkin | 2 | 5 | 30 | x2 bloom with nothing beside it (crop or object) |
| Strawberry | 1 | 3 | 3 | Perennial: 4 picks, +1 yield for each pick so far |
| Mint | 1 | 2 | 2 | Each night it creeps into one empty neighbour |
| Garlic | 1 | 2 | 3 | Pests keep off it and its neighbours |
| Wheat | 1 | 3 | 4 | +1 yield for every other wheat in the plot |
| Chili | 1 | 2 | 6 | The next crop pulled after it gets x1.5 bloom |

### Tools

| Card | Cost | Effect |
|---|---|---|
| Watering Can | 0 | Water a row |
| Hose | 1 | Water every plot |
| Mulch | 1 | Water a plot; it stays wet for 3 nights |
| Compost | 1 | Target crop +6 yield at harvest (every pick) |
| Fertiliser | 1 | A growing crop grows one day now |
| Trowel | 0 | Move a crop to an empty plot next to it |
| Shears | 1 | Pull a ripe crop now; double yield |
| Ladybirds | 0 | Clear every pest |
| Scarecrow | 1 | Object: crows keep off the 3 by 3 around it |
| Beehive | 2 | Object: crops in the 3 by 3 around it get +1 bloom |

### Weather

Weather cards take effect tonight.

| Card | Cost | Effect |
|---|---|---|
| Rain | 1 | Water every plot; crops grow an extra day |
| Sun | 1 | Ripe crops get +3 yield tonight |
| Storm | 2 | Water every plot; crops grow 2 extra days, but one random crop is flattened |

### Upgrades ("Select" stock)

An upgraded seed gets +50% base yield, rounded up. Upgraded tools, weather and objects cost 1 less. The three free cards gain a rule instead: Watering Can waters a row and a column, Trowel moves to any empty plot, Ladybirds also draw a card.

### Rarity

Common 15 coins: radish, carrot, lettuce, watering can, mulch, ladybirds, garlic, wheat, mint. Uncommon 28: beans, sunflower, strawberry, chili, compost, fertiliser, hose, rain, sun, trowel, scarecrow. Rare 45: corn, pumpkin, beehive, shears, storm. The shop rolls common 55%, uncommon 33%, rare 12%. Prices rise 40% a year after the first.

### Hazards

- **Pests:** from summer of year 1. Chance of new pests on a night: 20% in year 1, 40% in year 2, 55% from year 3.
- **Crows:** from autumn of year 1. Chance of a crow on a night: 15%, 30%, 45%.

## The shop (the seed merchant's stall)

The shop opens between seasons.
- **Cards:** 3 random cards from the unlocked pool, laid out larger the rarer they are, each with a price tag.
- **Almanac pages:** 2 pages pinned to the cork board, at their price (below) times the year's rise. You can keep up to 5.
- **Compost a card:** 25 coins, then 10 more each time in the same visit. The deck keeps at least 6 cards.
- **Stamp one select (upgrade):** 30 coins, then 10 more each time in the same visit.
- **Fresh stock (reroll the cards):** 5, rising by 2 each time.
- Tap a thing to lift it and read its price; tap again to buy.

### Almanac pages

| Page | Price | Effect |
|---|---|---|
| Rain Barrel | 60 | Each morning the first plot of every row is wet |
| Root Cellar | 70 | Radishes and carrots get +3 yield |
| Busy Bees | 80 | Sunflowers and beehives give +2 bloom, not +1 |
| Green Thumb | 120 | +1 energy every day |
| Big Basket | 100 | Hand size +1 |
| Crop Rotation | 70 | Sow a different crop where one was just pulled: +4 yield |
| Market Day | 90 | Every fifth harvest in a day is x2 |
| Four-Leaf Clover | 100 | One harvest in eight comes up golden, x3 |
| Long Furrow | 110 | The plot gains a fifth column |
| Cold Frame | 60 | Winter quotas are 20% lower |

## Look and feel

A card game on a warm oak table, with the plot as a painted almanac plate. Its own identity: no felt, no neon, no pixel type, no jokers. Every surface is its own material; type reads from shape and material before colour.

- **Board:** a deckled almanac page on the table with a printed double rule, a timber bed of soil squares with engraved furrows, key letters along the top, and a caption ("Plate VI. The kitchen plot in summer."). Paper and soil follow the season's palette. The eight farm crops are the almanac's own paintings from `src/render2d/crops.ts`; mint, garlic, wheat and chili are painted in the same hand with its brushes. A just-sown seed shows its packet on a stake. Wet soil darkens with a sheen, mulch is laid straw, pests are a crawl of aphids, a small moon marks every crop that will be pulled tonight.
- **Cards are things, made the way their type is made:**
  - Seeds: printed seed packets with a torn top, the crop painted in an oval vignette with its produce, a variety name ("Early Nantes"), the sowing cost as seed dots on the band, nights to ripen and base yield.
  - Tools: brown kraft luggage tags on twine, with a reinforced punched hole, a stamped name and the tool drawn in ink and wash.
  - Weather: clippings cut from an almanac page, with print showing through from the back, a "The forecast" masthead and a woodcut glyph.
  - Objects: painted wooden plaques on a stake, with nail heads and grain.
  - Rarity shows as print quality: commons are plain, uncommons get a finer second rule, rares a gold-leaf corner. Upgraded cards carry a red "Select" rubber stamp.
- **The table is the interface:** a ruled ledger slip names the season and day and the take against the quota; a cribbage-style pegboard tallies the quota with a brass hole at the end; three wooden seed scoops show energy (spent ones tip empty); a green seed tin is the draw pile; a heap of spent cards is the discard pile and the toss target; a brass lantern is End day (blowing it out brings the night); tonight's weather clippings lie by the lantern; the almanac (a small green book) is the pause menu. On desktop, kept almanac pages are pinned in the side panel.
- **Shop:** the seed merchant's stall: a painted sign, almanac pages pinned on cork, a wooden tray of goods with kraft price tags, a compost bucket, a rubber stamp and a hand bell on the tray's lip, and a signpost on to the next season.
- **Run end:** "The almanac, year N": a ruled entry per season, then the best harvest, coins and new cards.
- **Notes, not toasts:** one short ink note at a time beside the plot it concerns ("A crow took one."), gone after two seconds.
- **Teaching:** no rules wall. The first run deals a set hand and shows one pinned note at a time, by the thing it means, until it is done: take up the carrot, sow it, sow a radish beside it, water the row, blow out the lantern; next morning, the carrot's bloom from radishes pulled before it, then the pegboard. The full rules live in the almanac.
- **Phone portrait first** (412 by 900): ledger, coins and the almanac along the top (the shell's corner kept clear), the pegboard under them, the plate in the middle, the bench (scoops, weather, tin, spent heap, lantern) under it, the hand fanned along the bottom.
- **Desktop:** the plate left of centre, a side panel with the ledger, pegboard, kept pages and the bench, and the hand along the bottom. A landscape phone uses the desktop layout with smaller cards.

## Controls

| Input | How |
|---|---|
| Touch | Tap a card to take it up: plots it can go on get a dashed rule, and the plots it would touch are washed (a row of water, a 3 by 3). Tap a plot to play it, or anywhere on the plate for weather, Hose and Ladybirds. Tap the card again to put it down. Dragging a card onto a plot also works; drag it onto the spent heap to toss it. Long-press a card to hold it up close; tap to put it back. Tap a plot with no card held to read what's there. Tap anywhere during the night to skip it. |
| Mouse | Click or drag the same way. Hovering lifts a card; holding still shows it up close. |
| Keyboard | 1 to 7 take up a card (again puts it down), arrows move the plot cursor, Enter or Space plays (or reads the plot), E ends the day, X tosses the held card, D opens the seed tin, F toggles harvest pace, Esc puts the card down or opens the almanac. Any key skips the night. In the stall and the almanac, arrows move between things and Enter takes them. |
| Gamepad | Not built. |

## Save

The save is the whole run state (seeded rng and all), the meta unlocks and best record, the harvest pace and the lessons done. It is written after every card played, every toss, at the end of each day (before the night animates) and after every shop action. Summary example: "Year 1 summer, day 3, 210 coins".

## Balance

`npx tsx scripts/deck-balance.ts [runs] [noise] [--meta] [--free] [--calm] [--quotas=a,b,c,d] [--year=x]` plays whole runs with the bot in `src/games/deck/bot.ts`. For each play it tries every legal card and target on a copy of the run, resolves tonight with sampled dice, rolls the board forward three calm watered nights, and looks two plays ahead. It shops from a preference list. `noise` blurs its judgements. At 0 it always takes the first of several equal plays, and measured, it plays worse than at 0.15 (the gain is all in play, not in the shop), so the 0.15 bot stands in for a decent player and the strict bot for a weak one. People who plan carrot and radish rows and bloom engines should do better than either.

Pass rates at the shipped numbers, 200 runs each:

| | Decent bot (noise 0.15) | Strict bot (noise 0) | Decent, unlocks carry over |
|---|---|---|---|
| Clears year 1 | 84% | 56% | 86% |
| Clears year 2 | 51% | 18% | 44% |
| Clears year 3 | 6% | 1% | 4% |

Per season, decent bot: spring 100%, summer 96%, autumn 93%, winter 94% in year 1; 94, 91, 90, 78% in year 2; 85, 70, 59, 33% in year 3. A median run clears 8 seasons (about 48 days). Its median take grows from 122 in year 1 spring to about 200 by year 2 autumn.

What the bot showed along the way:
- With the first quotas the bot cleared spring and never summer. With quotas off, its take per season stayed flat (about 80): hazards ate 25 to 40% of it and bought cards each play about once a season.
- Pests that never left and spread every night locked boards up; they now stay two nights and spread on a 40% chance, and both hazards ramp by year.
- Repeat upgrades and removals in one visit at a rising price give coins a way to turn into growth.

## Checks

With the dev server on 5252 (`npx vite --config scripts/deck-vite.config.ts`):

```bash
npx vitest run tests/deck                # rules: the day, scoring, hazards, shop, meta, saves, determinism, the bot
npx tsx scripts/deck-balance.ts 200 0.15 # pass rates by season and year
node scripts/deck-play.mjs               # phone, real touch: 14 days, totals vs rules, stall, reload, pause, cues, mood
node scripts/deck-desktop.mjs            # desktop: mouse and keyboard days, the stall by keyboard
node scripts/deck-perf.mjs               # frame times through a 16-harvest cascade, normal and 4x CPU throttle
node scripts/deck-shots.mjs              # contact sheets in /tmp/deck/
```

The debug hook `window.deck` seeds a run, reads state, plays a card through the UI path, ends the day, skips, suggests the bot's play and exposes screen rects for scripted taps. `?game=deck&deckart` shows every card face.

## Priorities

1. The rules engine (deterministic, seeded, unit tested), the start deck, the board, a day, the scoring cascade, and quotas. Built.
2. The shop, almanac pages, hazards, the full card list, meta unlocks, a balance bot. Built.
3. Juice, animation, sound cues and polish. Built; gamepad not.
