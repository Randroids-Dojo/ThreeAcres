# Seedbound: design

A roguelike deckbuilder about one small plot and a run of seasons. Original rules, cards and art, in the genre of deckbuilders where scoring combos is the thrill.

**The fantasy:** a seed tin of cards and a four by four plot. Each day you draw a hand, plant seeds, set up companions beside each other, and hurry crops along with the watering can and the weather. At the end of the day the ripe crops are harvested one by one in a cascade, each paying its yield times its bloom. Each season sets a quota. Beat it, spend your coins on new cards and almanac pages, and face a bigger quota. Miss it and the run is over. A run lasts 20 to 40 minutes.

**Show, do not tell.** Every rule a crop has is about what stands next to it, so the board can show it. Card faces carry pictures, not sentences. While a card is held the plot previews what it would do; at night each bonus flies from the crop that gave it. Notes say what to do next in eight words or fewer, never how a rule works.

**Words and pictures the player sees:** a harvest pays **yield × bloom**. Yield is a number by a wicker basket; bloom is a red number by a red flower. A night is a moon. What a card costs is printed as **seed scoops**, the same scoops that sit on the bench; a free card says Free. The word "energy" is never shown. The code keeps the names `chips`, `mult` and `energy`, and the audio cues stay `deck.chip` and `deck.mult`.

## Run structure

- **Year:** 4 seasons of 6 days each.
- **Quotas:** coins earned within the season.
  - Year 1: spring 55, summer 70, autumn 75, winter 95.
  - Each later year multiplies by 2, rounded to a 5 (under 100) or a 10.
  - The first draft (60, 130, 240, 380, times 2.4 a year) assumed much faster growth than the cards give. The next (40, 55, 65, 80, times 1.75) fitted the old rules, where seeds needed water. Once crops grew on their own the take rose and compounded faster by year, so the quotas were refitted to the same pass rates. See Balance.
- **Money:** coins are both score and money. They carry over between seasons and are spent in the shop. Spending never counts against a quota.
- **Season end:** the plot is cleared (crops and objects), every card goes back in the tin. If the season's earnings reached the quota, the season is cleared and the shop opens. If not, the run ends.
- **Run end:** an almanac entry for the run: each season's take against its quota, the best single harvest, the coins taken in all, the harvest count, and the new cards unlocked.
- **Meta progression (light):** a pool of cards starts locked. Each finished run unlocks the next 2 in a fixed order: beehive and chili, corn and wheat, pumpkin and shears, mint and trowel, then storm. The best record (most seasons, best harvest, most coins) is kept with the run in the same save.

## A day

1. Draw up to 5 cards (hand size 5). The three seed scoops on the bench refill (`energy` in the code).
2. Play cards, each costing the scoops printed on it. Unplayed cards are kept in hand. Excess over the hand size is discarded at the end of the day, oldest first.
3. Once a day you may toss a card from hand onto the spent heap and draw a fresh one. This keeps a hand of unplayable cards (a full plot, nothing affordable) from locking a run.
4. Blow out the lantern (End day). Then, in order:
   1. Weather resolves. A storm flattens one random crop.
   2. Every crop grows one night on its own, plus one for each rain, two for each storm, and one for a watering can on its plot today. Pested crops do not grow. There is no wet or dry soil.
   3. Pests: each pest patch counts down a night and has a 40% chance to spread to a neighbour; then new pests may land on a growing crop. Mint creeps into one empty neighbour.
   4. A crow may take one ripe crop that no scarecrow guards.
   5. Every ripe, clean crop is harvested in reading order (top left first) with the scoring cascade. The order only paces the show: no rule depends on it.
   6. Perennials stay in their plot for their remaining picks; other crops leave theirs empty.
5. The draw pile reshuffles from the discard pile when it runs out.

Decisions made while building:
- **Neighbours** are the four plots sharing an edge. "The 3 by 3" (beehive, scarecrow) includes the diagonals.
- **Neighbour rules read the board as the harvest starts.** A crop pulled earlier in the cascade still counts as a neighbour for the ones after it, so what you see before the night is what scores.
- **Ripe perennials** pick every night. Pests on them block that night's pick.
- **Pests** stay two nights, then move on. A pested crop is neither grown nor harvested. Garlic keeps them off itself and its neighbours; Ladybirds clear them.
- **Objects** (scarecrow, beehive) stand on their plot until the season ends, then the card returns to the tin.
- **Weather stacks:** two rains are two extra nights.
- **No order rules.** The old carrot ("+1 bloom for each radish pulled before it tonight") and chili ("the next crop pulled after it") depended on reading order, which nobody could see. Both are now neighbour rules. The old wheat counted every wheat on the plot; it now counts the wheat beside it.
- **Water is a boost, not a chore.** With one watering can that waters one row, a second row of seed could never grow. Crops now grow on their own; the can and rain hurry them. If dryness comes back as tension it will be its own hazard (cracked soil you can see), with its own lesson.

## The board

Four by four plots. A plot holds one crop or one object, and a count of extra nights it grows tonight (from the can or the Rain Barrel), shown as a blue drop in its corner. The Long Furrow page adds a fifth column from the next season.

## Scoring

Each harvest is scored as yield × bloom, rounded to a whole coin.
- **Yield** starts at the crop's base value, plus flat bonuses (and the shears double it).
- **Bloom** starts at 1 and gains additive bonuses, then any times-multipliers.
- **Display:** the crop lifts and glows, and a paper slip by it shows the arithmetic as pictures: the yield by its basket, then (once bloom has been met) × the bloom by its red flower. Each bonus flies in on an arc from the crop that gave it, a small "+2" by a basket or "+1" by a flower, and leaves its picture on the slip (a carrot and +2). No words. Then the slip turns into the total, which arcs onto the pegboard and moves the peg.
- **Pace:** about 0.45 to 0.9 s per harvest by how many bonuses fly in, compressed when there are more than five harvests (a full sixteen-crop plot takes about 8 s at the easy pace, under 4 s fast). Pitch rises along the chain on a pentatonic ladder.
- **Big harvests:** a total of a tenth of the quota gets sparks; a quarter or more gets a gilt slip, a beat more time, a short table shake and the `deck.big` cue. Small ones just pop and fly.
- **Speed:** "Harvest pace: easy or fast" in the almanac (F toggles it; fast is 2.2 times). A tap or any key skips the rest of the night; the board lands exactly where a watched night would.

## Cards

Start deck (14 cards): Radish x5, Carrot x3, Lettuce x2, Watering Can x3, Rain x1.

The guided first season deals set hands from that deck on its first three days (see Teaching); from day 4 it draws as usual.

### Seeds

| Card | Cost | Nights | Base yield | Rule |
|---|---|---|---|---|
| Radish | 1 | 1 | 2 | +2 yield next to a carrot |
| Carrot | 1 | 2 | 5 | +1 bloom for each radish next to it |
| Lettuce | 1 | 2 | 4 | +4 yield next to a tall crop |
| Beans | 1 | 3 | 3 | Perennial: 3 picks. Neighbours get +2 yield. |
| Corn (tall) | 2 | 4 | 12 | x1.5 bloom next to beans |
| Sunflower (tall) | 1 | 3 | 3 | Bees: neighbours get +1 bloom |
| Pumpkin | 2 | 5 | 30 | x2 bloom with nothing beside it (crop or object) |
| Strawberry | 1 | 3 | 4 | Perennial: 4 picks |
| Mint | 1 | 2 | 2 | Each night it creeps into one empty neighbour |
| Garlic | 1 | 2 | 3 | Pests keep off it and its neighbours |
| Wheat | 1 | 3 | 4 | +2 yield for each wheat next to it |
| Chili | 1 | 2 | 6 | Neighbours get x1.5 bloom |

### Tools

| Card | Cost | Effect |
|---|---|---|
| Watering Can | 0 | A row grows an extra night tonight |
| Compost | 1 | Target crop +6 yield at harvest (every pick) |
| Fertiliser | 1 | A growing crop grows a night now |
| Trowel | 0 | Move a crop to an empty plot next to it |
| Shears | 1 | Pull a ripe crop now; double yield |
| Ladybirds | 0 | Clear every pest |
| Scarecrow | 1 | Object: crows keep off the 3 by 3 around it |
| Beehive | 2 | Object: crops in the 3 by 3 around it get +1 bloom |

### Weather

Weather cards take effect tonight.

| Card | Cost | Effect |
|---|---|---|
| Rain | 1 | Every crop grows an extra night tonight |
| Sun | 1 | Crops pulled tonight get +3 yield |
| Storm | 2 | Every crop grows 2 extra nights tonight, but one random crop is flattened |

The Hose and Mulch were cut with watering. A save that holds them gets Rain for a Hose and a Watering Can for Mulch.

### Upgrades ("Select" stock)

An upgraded seed gets +50% base yield, rounded up. Upgraded tools, weather and objects cost 1 less. The three free cards gain a rule instead: the Watering Can reaches a row and a column, Trowel moves to any empty plot, Ladybirds also draw a card.

### Rarity

Common 15 coins: radish, carrot, lettuce, watering can, ladybirds, garlic, wheat, mint. Uncommon 28: beans, sunflower, strawberry, chili, compost, fertiliser, rain, sun, trowel, scarecrow. Rare 45: corn, pumpkin, beehive, shears, storm. The shop rolls common 55%, uncommon 33%, rare 12%. Prices rise 40% a year after the first.

### Hazards

- **Pests:** from summer of year 1. Chance of new pests on a night: 20% in year 1, 40% in year 2, 55% from year 3.
- **Crows:** from autumn of year 1. Chance of a crow on a night: 15%, 30%, 45%.

## The shop (the seed merchant's stall)

The shop opens between seasons.
- **Cards:** 3 random cards from the unlocked pool, laid out larger the rarer they are, each with a price tag.
- **Almanac pages:** 2 pages pinned to the cork board, at their price (below) times the year's rise. You can keep up to 5.
- **Compost (remove a card):** 25 coins, then 10 more each time in the same visit. The deck keeps at least 6 cards.
- **Stamp (upgrade one card to select):** 30 coins, then 10 more each time in the same visit.
- **Fresh stock (reroll the cards):** 5, rising by 2 each time.
- Tap a thing to lift it ("Tap to buy", or "Short 6" when you cannot pay); tap again to buy.
- The stall arrives in parts like the table: the first visit has only the goods and the signpost, the second adds the pages, the third the compost, stamp and bell.

### Almanac pages

| Page | Price | Effect |
|---|---|---|
| Rain Barrel | 60 | Column A grows an extra night every night |
| Root Cellar | 70 | Radishes and carrots get +3 yield |
| Busy Bees | 80 | Sunflowers and beehives give +2 bloom, not +1 |
| Green Thumb | 120 | A fourth seed scoop every day |
| Big Basket | 100 | Hand size +1 |
| Crop Rotation | 70 | Sow a different crop where one was just pulled: +4 yield |
| Market Day | 90 | Every fifth harvest in a day is x2 |
| Four-Leaf Clover | 100 | One harvest in eight comes up golden, x3 |
| Long Furrow | 110 | The plot gains a fifth column |
| Cold Frame | 60 | Winter quotas are 20% lower |

## Look and feel

A card game on a warm oak table, with the plot as a painted almanac plate. Its own identity: no felt, no neon, no pixel type, no jokers. Every surface is its own material; type reads from shape and material before colour.

- **Board:** a deckled almanac page on the table with a printed double rule, a timber bed of soil squares with engraved furrows, key letters along the top, and a caption ("Plate VI. The kitchen plot in summer."). Paper and soil follow the season's palette. The eight farm crops are the almanac's own paintings from `src/render2d/crops.ts`; mint, garlic, wheat and chili are painted in the same hand with its brushes. A just-sown seed shows its packet on a stake. Wet soil darkens with a sheen, mulch is laid straw, pests are a crawl of aphids, a small moon marks every crop that will be pulled tonight.
- **Cards are things, made the way their type is made, and read as pictures:**
  - Every face: the cost as seed scoops on a cream chip in the top left corner (the part a fanned hand always shows), each scoop about 17 px on the Pixel; "Free" in the same spot for free cards. Then the name, the painting, and the rule as one line of pictures: a carrot and "+2" by a basket on the radish, a radish and a red "+1" by a flower on the carrot, a little cross of plots for "its neighbours", a row of plots and a moon "+1" on the watering can. No sentences: the sentence (and the variety, "Early Nantes") is in the close-up a long-press or a hover opens.
  - Seeds: printed seed packets with a torn top, the crop painted in an oval vignette with its produce, the base yield by a basket (with a looping arrow and the picks for perennials, and a tall mark for tall crops), and a moon for each night to ripen.
  - Tools: brown kraft luggage tags on twine, with a reinforced punched hole, a stamped name and the tool drawn in ink and wash.
  - Weather: clippings cut from an almanac page, with print showing through from the back, a "The forecast" masthead and a woodcut glyph.
  - Objects: painted wooden plaques on a stake, with nail heads and grain.
  - Rarity shows as print quality: commons are plain, uncommons get a finer second rule, rares a gold-leaf corner. Upgraded cards carry a red "Select" rubber stamp.
  - The picture vocabulary lives in `src/games/deck/view/icons.ts` and is shared by the faces, the board's previews and the slips.
- **The table is the interface:** a ruled ledger slip names the season and day and the take against the quota; a cribbage-style pegboard tallies the quota with a brass hole at the end; three wooden seed scoops show what is left to pay with today; a green seed tin is the draw pile; a heap of spent cards is the discard pile and the toss target (a red tick on it once today's toss is used; its label stays "Spent"); a brass lantern is End day (blowing it out brings the night); tonight's weather clippings lie by the lantern; the almanac (a small green book, a little faded) is the pause menu. On desktop, kept almanac pages are pinned in the side panel. Labels on the table are one or two words.
- **Cost at a glance:** full scoops are heaped with seed; spent ones tip over, empty and pale. Taking up a card lifts and lights the scoops it would use; playing it empties them. A card the scoops cannot pay for is dimmed in the hand with its missing scoops ringed red; tapping it shakes it and flashes the missing scoops on the bench (no note, it is not taken up). At dawn the scoops refill one after another.
- **The board explains while you play:** while a card is held, every plot where a bonus would apply carries a small chip in its corner (a "+2" by a basket, a red "+1" by a flower, a "×1.5", or a moon "+1" for an extra night), and the plot under the finger, pointer or keyboard cursor shows what the seed would score there ("4", or "5 × 3 = 15") along with what its neighbours would gain. Dragged over the plot, the card shrinks above the finger and goes see-through so the preview shows. Previews come from `previewPlay` in the rules, run on a copy of the run.
- **Shop:** the seed merchant's stall: a painted sign, almanac pages pinned on cork, a wooden tray of goods with kraft price tags, a compost bucket, a rubber stamp and a hand bell on the tray's lip, and a signpost on to the next season.
- **Run end:** "The almanac, year N": a ruled entry per season, then the best harvest, coins and new cards.
- **Notes, not toasts:** one short ink note at a time beside the plot it concerns ("A crow took one."), gone after two seconds. Eight words at most.
- **Phone portrait first** (412 by 838 to 900): ledger, coins and the almanac along the top (the shell's corner kept clear), the pegboard under them, the plate in the middle, a strip for the lesson line under the plate, the bench (scoops, weather, tin, spent heap, lantern) under that, the hand fanned along the bottom. Kept pages are read in the almanac on a phone.
- **Desktop:** the plate left of centre, a side panel with the ledger, pegboard, kept pages, the lesson line and the bench, and the hand along the bottom. A landscape phone uses the desktop layout with smaller cards.
- **The plate's caption** sits between the bed and the printed frame; the margin under the bed is sized from the caption and the frame's two rules, so the rules never strike through it at any size.

## Teaching: the guided first season

No rules wall, and nothing on the table before it is needed. A new player's first run starts with the plot, two radishes and one note. Each lesson brings in one piece of the table, shows one line (eight words at most, one action, imperative), and waits until the player has done it. The thing a lesson is about glows softly (the lantern, the scoops, the radish in the hand). The board's previews and the scoring do the explaining; notes never explain a rule. Lessons fire on what is happening, not on the day number, so a run that strays from the set hands still gets each one when it first matters. The tutor is `src/games/deck/lessons.ts`.

The first three days deal set hands from the start deck (`GUIDED_DEALS` in the rules, deterministic; the spent pile is used if the tin runs short): day 1 two radishes; day 2 a carrot and two radishes; day 3 two radishes, a carrot and a lettuce, more than three scoops' worth. From day 4 the hand draws up to five.

The lessons, in the order they come in the guided season (touch wording; mouse says Click, keys name the key):

| # | When | Brings in | Line |
|---|---|---|---|
| 1 | Day 1, at once | the plot and the hand only | "Tap a radish to take it up." / "Tap a plot to plant it." / "Plant the other radish." |
| 2 | Both radishes sown | the lantern | "Blow out the lantern to end the day." (keys: "Press E to end the day.") |
| 3 | Night 1, the first harvest | the ledger and pegboard (the slip flies to it; yield only, no bloom) | at dawn: "Reach the brass hole by day six." |
| 4 | Next card taken up | | "Miss it, and the run ends." |
| 5 | Day 2, carrot and radish in hand | | "Plant the carrot first." / "Plant a radish beside the carrot." (the held radish marks +2 on every plot beside the carrot) |
| 6 | Day 3, the carrot ripens tonight | bloom: the slip's × bloom part | "Plant radishes around the carrot." (the carrot shows +1 bloom per radish; that night it pays 5 × 3) |
| 7 | The hand costs more than the scoops left | the scoops, and the cost printed on cards | "Spend your last scoop.", then "End the day. The scoops refill at dawn." |
| 8 | Day 4 | the seed tin | "Tap the tin to see your cards." (keys: "Press D to see your cards.") |
| 9 | A can in hand and a crop it would hurry | | "Water a row to grow it faster." (the row's crops show a moon +1) |
| 10 | A weather card in hand | tonight's clippings by the lantern | "Drop the weather anywhere on the plot." |
| 11 | Day 5 with a hand to spare | the spent heap | "Drag a spare card to Spent." (keys: "Take a card up, then press X.") |
| 12 | The first season's end | coins (the purse) | in the stall: "Buy a seed with your coins." |
| 13 | The second stall | almanac pages on the cork board | "Pin a page to change the rules." |
| 14 | The third stall | compost, stamp and fresh stock | "Stamp or compost a card here." |
| later | First card not from the start deck | | "Hold the new card to read it." |
| later | First pest (summer) | | "Clear pests with ladybirds, or wait them out." |
| later | First crow (autumn) | | "Guard ripe crops with a scarecrow." |

Lessons, the pieces brought in, and the card kinds met are kept in the save with the meta unlocks. A player with a finished run skips the guided season and has the whole table. A save from before the lessons loads with everything in and a refresher for the can and the weather, whose rules changed. "Start over" from the shell clears the lessons too. The full rules live in the almanac's "The rules in brief".

## Controls

| Input | How |
|---|---|
| Touch | Tap a card to take it up: plots it can go on get a dashed rule, the plots it would touch are washed (a row of water, a 3 by 3), and the preview chips show what it would do. Tap a plot to play it, or anywhere on the plate for weather and Ladybirds. Tap the card again to put it down. A card the scoops cannot pay for only shakes. Dragging a card onto a plot also works (any card can be dragged, so one you cannot pay for can still go on the spent heap); drag it onto the spent heap to toss it. Long-press a card to hold it up close; tap to put it back. Tap a plot with no card held to read what's there. Tap anywhere during the night to skip it. |
| Mouse | Click or drag the same way. Hovering lifts a card; holding still shows it up close. Hovering a plot with a card held shows what it would score there. |
| Keyboard | 1 to 7 take up a card (again puts it down; Shift takes up one the scoops cannot pay for, to toss it), arrows move the plot cursor (the cursor's plot shows the preview), Enter or Space plays (or reads the plot), I reads the held card, E ends the day, X tosses the held card, D opens the seed tin, F toggles harvest pace, Esc puts the card down or opens the almanac. Keys for pieces not yet brought in do nothing. Any key skips the night. In the stall and the almanac, arrows move between things and Enter takes them. |
| Gamepad | Not built. |

## Save

The save is the whole run state (seeded rng and all), the meta unlocks and best record, the harvest pace, and what has been learned (lessons done, pieces of the table brought in, card kinds met). It is written after every card played, every toss, at the end of each day (before the night animates) and after every shop action. Summary example: "Year 1 summer, day 3, 210 coins".

## Balance

`npx tsx scripts/deck-balance.ts [runs] [noise] [--meta] [--free] [--calm] [--guided] [--quotas=a,b,c,d] [--year=x]` plays whole runs with the bot in `src/games/deck/bot.ts`. For each play it tries every legal card and target on a copy of the run, resolves tonight with sampled dice, rolls the board forward three calm nights, and looks two plays ahead. It shops from a preference list. `noise` blurs its judgements. At 0 it always takes the first of several equal plays, and measured, it plays worse than at 0.15 (the gain is all in play, not in the shop), so the 0.15 bot stands in for a decent player and the strict bot for a weak one. People who plan carrot and radish rows and bloom engines should do better than either.

Pass rates at the shipped numbers (quotas 55, 70, 75, 95, times 2 a year), 200 runs each:

| | Decent bot (noise 0.15) | Strict bot (noise 0) | Decent, unlocks carry over | Decent, guided first season |
|---|---|---|---|---|
| Clears year 1 | 88% | 57% | 87% | 84% |
| Clears year 2 | 47% | 19% | 44% | 48% |
| Clears year 3 | 10% | 3% | 5% | 10% |

Per season, decent bot: spring 100%, summer 99%, autumn 94%, winter 94% in year 1; 87, 81, 92, 83% in year 2; 82, 69, 77, 49% in year 3. A median run clears 7 seasons. Its median take grows from 98 in year 1 spring to about 235 by year 2 autumn. The guided first season's set hands take less (median 75, tenth percentile 65) and still clear the spring quota of 55 every time.

These are the shapes the old rules were tuned to (84, 51 and 6% for the decent bot), refitted after the rules changes: crops grow without water, the can and rain add a night, every companion rule is about neighbours. `npx tsx scripts/deck-tune.ts [runs] [noise]` plays runs with free quotas and prints, per season, the take a target share of runs reaches, which is how these quotas were set.

What the bot showed along the way:
- With the first quotas the bot cleared spring and never summer. With quotas off, its take per season stayed flat (about 80): hazards ate 25 to 40% of it and bought cards each play about once a season.
- Pests that never left and spread every night locked boards up; they now stay two nights and spread on a 40% chance, and both hazards ramp by year.
- Repeat upgrades and removals in one visit at a rising price give coins a way to turn into growth.

## Checks

With the dev server on 5252 (`npx vite --config scripts/deck-vite.config.ts`; each script takes a base url as its first argument):

```bash
npx vitest run tests/deck                # rules: the day, growth, scoring, hazards, shop, meta, saves, determinism, previews, the guided deals, the bot
npx tsx scripts/deck-balance.ts 200 0.15 # pass rates by season and year (--guided for the first season's set hands)
node scripts/deck-lessons.mjs            # the guided first season, phone (real touch) and desktop (mouse and keys): nothing before its lesson,
                                         #   each lesson ends on its action, notes of eight words at most, no sentences on faces, previews while
                                         #   held, cost scoops of 14 px or more, unaffordable cards darker by pixel luminance, scoops lift through
                                         #   touch, lessons survive a reload, returning players skip it (steps in /tmp/deck-lessons/steps-*.json)
node scripts/deck-overlap.mjs            # no two labels, buttons, cards or slips overlap: first day, fresh day, pages kept, card held, tossed,
                                         #   scoring, the stall, the run's end, on a phone and a desktop
node scripts/deck-caption.mjs            # the plate's caption against the printed frame at eight sizes, by pixel readback
node scripts/deck-play.mjs               # phone, real touch: 14 days from the guided start, totals vs rules, stall, reload, pause, cues, mood
node scripts/deck-desktop.mjs            # desktop: mouse and keyboard days on a returning player's table, the stall by keyboard
node scripts/deck-perf.mjs               # frame times through a 16-harvest cascade, normal and 4x CPU throttle
node scripts/deck-shots.mjs              # contact sheets in /tmp/deck/
node scripts/deck-beforeafter.mjs a b    # crops of two builds side by side (first screen, faces, a note, a held card, cost)
```

The debug hook `window.deck` seeds a run (guided or not), brings every piece in (`learnAll`), reads state, the lesson on screen, the pieces brought in, a face's painted text and the board's preview, plays a card through the UI path, ends the day, skips, suggests the bot's play and exposes screen rects for scripted taps. `?game=deck&deckart` shows every card face.

## Priorities

1. The rules engine (deterministic, seeded, unit tested), the start deck, the board, a day, the scoring cascade, and quotas. Built.
2. The shop, almanac pages, hazards, the full card list, meta unlocks, a balance bot. Built.
3. Juice, animation, sound cues and polish. Built; gamepad not.
4. Teach one thing at a time, show rules instead of telling them, and make cost obvious: the guided first season, picture faces, previews, arcs, scoops. Built.
