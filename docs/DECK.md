# Seedbound: design

A roguelike deckbuilder about one small plot and a run of seasons. Original rules, cards and art, in the genre of deckbuilders where scoring combos is the thrill.

**The fantasy:** a seed tin of cards and a four by four plot. Each day you draw a hand, plant seeds, set up companions beside each other, and hurry crops along with the watering can and the weather. At the end of the day the ripe crops are harvested one by one in a cascade, each paying its yield times its bloom. Each season sets a quota. Beat it, spend your coins on new cards and almanac pages, and face a bigger quota. Miss it and the run is over. A run lasts 20 to 40 minutes.

**Show, do not tell.** Every rule a crop has is about what stands next to it, so the board can show it. Card faces carry pictures, not sentences. While a card is held the plot previews what it would do, on the night it would actually be pulled; at night each bonus flies from the crop that gave it. Notes say what to do next in eight words or fewer, never how a rule works.

**The plot persists.** The start deck's core stands for days: beans and a strawberry pick night after night, and the sunflower is the tall crop the lettuce wants. What you sow today has to fit what already stands, and when each crop will be pulled matters as much as where it goes. The plot carries over from season to season too, so a season starts on the garden the last one left, not on bare soil.

**Words and pictures the player sees:** a harvest pays **yield × bloom**. Yield is a number by a wicker basket; bloom is a red number by a red flower. A night is a moon. What a card costs is printed as **seed scoops**, the same scoops that sit on the bench; a free card says Free. Seeds cost from nothing to three scoops by how strong they are. The word "energy" is never shown.

**Every day is a budget and a placement.** The third playtest scored the game 5 of 10: past the guided season every seed cost one scoop and the can was free, so each day was "plant any three" on a plot that peaked at about 8 of 16, and the answer was always "next to the sunflower". Now seeds are priced by power (free radishes, dear corn and pumpkins), every crop pulled up puts a scoop back on the next morning's bench, and the sunflower blooms only the crop below it. A day's hand costs more than the bench holds on about 45% of dawns, the plot fills further, and roots, bloom and the bot's mixed buying each clear year 2 about 40 to 55% of the time (see Balance, round 3). The code keeps the names `chips`, `mult` and `energy`, and the audio cues stay `deck.chip` and `deck.mult`.

## Run structure

- **Year:** 4 seasons of 6 days each.
- **Quotas:** coins earned within the season.
  - Year 1: spring 170, summer 260, autumn 300, winter 350.
  - Year 2: spring 400, summer 480, autumn 540, winter 600.
  - Year 3: spring 660, summer 740, autumn 800, winter 860. Each year has its own row: with scoops coming back from pulled crops, takes rise fast through year 1 and flatten through year 3.
  - Each year after that multiplies year 3's by 1.3. Rounded to a 5 (under 100) or a 10.
  - A new player's first run (the guided one) has its own spring quota of 70, since its days are set hands, and the rest of its year 1 at 88% of the usual, because its first stall had fewer coins to spend.
  - History: the first draft (60, 130, 240, 380, times 2.4 a year) assumed faster growth than the cards gave; then 40, 55, 65, 80 times 1.75 for the watering rules; then 55, 70, 75, 95 times 2 once crops grew on their own. That last set let a decent bot clear year 1 spring every time at 1.78 times the quota on a board wiped bare most dawns. With the standing start deck the take per card rose (perennials give several harvests per card), so the quotas were refitted for tension (year 1 160, 165, 185, 220; year 2 230, 265, 340, 370; then times 1.45). The second playtest ran year 1 summer to winter at 1.4 to 1.55 times those, and the plot carrying over lifted takes by a further quarter to a third, so year 1 summer to winter rose 24 to 32% and years 2 and 3 were refitted. The third round's economy (scoops back, fuller plots) lifted year 1's takes by a quarter and flattened year 3's, so all three rows were refitted again from deck-tune: see Balance.
- **Money:** coins are both score and money. They carry over between seasons and are spent in the shop. Spending never counts against a quota.
- **Season end:** the cards come home: the hand and the spent heap go back in the tin, which is shuffled at the next dawn. The plot is not cleared: crops still growing, perennials with picks left, and scarecrows and beehives stand into the next season (their pests too), through the year's turn as well. An object's card stays out on its plot. If the season's earnings reached the quota, the season is cleared and the shop opens. If not, the run ends.
  - Why: the second playtest's biggest wish. Every season started on a bare plot, so days 1 and 2 of a season paid about 0 to 30 and the first days were spent rebuilding. Within the fiction a season's turn is a night like any other in the garden. Now a decent bot finds 3 to 5 crops standing at a season's first dawn in year 1 (none before) and takes 34 to 51 on its first night (7 to 12 before).
  - A seed sown too late to ripen this season is no longer dead: it is picked next season and counts for that season's quota. Its preview says so (see Previews are timed). That answers the playtest's "three-night seeds are dead from day 5" without sending late seeds back to the tin.
- **Run end:** an almanac entry for the run: each season's take against its quota, the best single harvest, the coins taken in all, the harvest count, and the new cards unlocked.
- **Meta progression (light):** a pool of cards starts locked. They unlock by seasons met, counted across every run, never by finishing runs: 1, 3, 5, 8 and 12 seasons met in all unlock the next pair in a fixed order (beehive and chili, corn and wheat, pumpkin and shears, mint and trowel, then storm). Six empty days unlock nothing. The run's end says how many more seasons, in any run, add to the catalogue ("Meet two more seasons, in any run, to add to it."). The best record (most seasons, best harvest, most coins) is kept with the run in the same save.
  - Why across runs: the third playtest's runs 2 to 4 each met one to four seasons and all ended "The catalogue holds nothing new", because the next pair needed five seasons met in one run. Counted across runs, a run of four seasons, then three, then three unlocks two pairs, then one, then one. A save from before counts its best run as its total.
  - The unlocks run out on purpose: after twelve seasons met a player has the whole catalogue. After that a run's growth comes from the stall: pages, page slots, scoops, improving and throwing out.

## A day

1. Draw up to 5 cards (hand size 5). The three seed scoops on the bench refill (`energy` in the code), and the bench holds one more for each crop pulled up in the night, two at most (`saved`, then `bench` for the day's total).
2. Play cards, each costing the scoops printed on it: nothing to three. Unplayed cards are kept in hand. Excess over the hand size is discarded at the end of the day, oldest first.
3. Once a day you may toss a card from hand onto the spent heap and draw a fresh one. This keeps a hand of unplayable cards (a full plot, nothing affordable) from locking a run.
4. Blow out the lantern (End day). Then, in order:
   1. Weather resolves. A storm flattens one random crop.
   2. Every crop grows one night on its own, plus one for each rain, two for each storm, and one for a watering can on its plot today. Pests no longer stop a crop growing. There is no wet or dry soil.
   3. If a crow sat on the bed at dawn, it takes one ripe crop that no scarecrow guards.
   4. Every ripe crop is harvested in reading order (top left first) with the scoring cascade; a crop with pests on it pays half. The order only paces the show: no rule depends on it. Perennials stay in their plot for their remaining picks; other crops leave theirs empty, and each crop pulled up puts a scoop back for the morning (two a night at most; a strawberry puts one back with every pick). A crop a crow takes or a storm flattens puts none back.
   5. Pests: each patch that was there at dusk counts down a night and has a 40% chance to spread to a neighbour; then new pests may land on a growing crop.
   6. Mint creeps into one empty neighbour.
5. At dawn a crow may come to the bed's corner (rolled then, shown then): it takes a crop that night. A day's notice makes the scarecrow a choice, not a tax.
5. The draw pile reshuffles from the discard pile when it runs out.

Decisions made while building:
- **Neighbours** are the four plots sharing an edge. "The 3 by 3" (beehive, scarecrow) includes the diagonals.
- **Neighbour rules read the board as the harvest starts.** A crop pulled earlier in the cascade still counts as a neighbour for the ones after it, so what you see before the night is what scores.
- **Ripe perennials** pick every night. Pests on them halve that night's pick.
- **Pests** stay two nights, then move on. The number on a pested crop's badge is exactly the nights it pays half if it is pulled: it still grows and is still picked. Pests that land or spread tonight start biting tomorrow, so the night pays what the day previewed. Garlic keeps them off itself and its neighbours; Ladybirds clear them.
  - Why half, not stopped: pests used to stop a crop growing and being picked. Perennial builds soaked up the nightly chance, and all three of the third playtest's deaths outside the guided season came at year 1 winter or year 2 spring after a sharp drop (322 to 178 of 290; 346 to 252 with pests on 4 of 7 crops). At half pay they press without deciding: see Balance, round 3. The struck moon went with the old rule; a pested crop shows its moon and its badge.
- **Scoops back:** a crop pulled up puts a scoop on the next morning's bench, two at most a night, and flies there at night once the bench has been brought in. Uncapped, the bench grew to 9 to 12 scoops and the budget bound on 5% of days; one a night left the plot nearly as bare as before. The scoops a season's last night puts back come to the next season's first dawn, like the plot. A crop cut with the shears puts its scoop on today's bench.
- **Previews are timed.** A bonus only counts if the crop giving it still stands on the night the other is pulled. The forecast (`forecast` in `board.ts`) runs calm nights forward, past the season's end since the plot carries over: each crop's next pick, and the night it leaves. A radish beside a carrot that ripens tomorrow shows its own +2 (the carrot stands tonight) and the carrot's +1 bloom greyed and struck, with "The radish is pulled before the carrot ripens." A seed that ripens after the season's last night previews what it will pay then on a grey slip, with "Ripens next season." (it counts toward next season's quota). The old struck "too late" preview went with the cleared plot.
- **Objects** (scarecrow, beehive) stand on their plot from season to season for the rest of the run; the card stays out on the plot (the tin lists it under "Out on the plot").
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

Start deck (14 cards): Radish x4, Carrot x3, Lettuce x1, Beans x2, Strawberry x1, Sunflower x1, Watering Can x2. Rain is in the stall, not the start deck.

The old start deck (five radishes, three carrots, two lettuces, three cans and a rain) was all one- and two-night crops: the bot's plot was bare at 77% of dawns and the answer was always a carrot with radishes round it. The lettuce's rule had no tall crop to read.

The guided first season deals set hands from that deck on all six days (see Teaching); from summer it draws as usual.

### Seeds

Seeds are priced by power: a free filler, everyday crops at a scoop, strong ones at two, the stars at three.

| Card | Cost | Nights | Base yield | Rule |
|---|---|---|---|---|
| Radish | Free | 1 | 2 | +2 yield next to a carrot |
| Carrot | 1 | 2 | 5 | +1 bloom for each radish next to it |
| Lettuce | 1 | 2 | 4 | +4 yield next to a tall crop |
| Beans | 2 | 3 | 3 | Perennial: 3 picks. Neighbours get +2 yield. |
| Corn (tall) | 3 | 4 | 12 | x1.5 bloom next to beans |
| Sunflower (tall) | 2 | 3 | 3 | It faces the crop below it: that crop gets +2 bloom |
| Pumpkin | 3 | 5 | 30 | x2 bloom with nothing beside it (crop or object) |
| Strawberry | 2 | 3 | 4 | Perennial: 4 picks; every pick puts a scoop back |
| Mint | 1 | 2 | 2 | Each night it creeps into one empty neighbour |
| Garlic | 1 | 2 | 3 | Pests keep off it and its neighbours |
| Wheat | 1 | 3 | 4 | +2 yield for each wheat next to it |
| Chili | 2 | 2 | 6 | Neighbours get x1.5 bloom |

- **The sunflower faces one way.** It used to give each of its four neighbours +1 bloom, so the answer to every placement was "next to the sunflower", and builds of sunflowers, beehives and Busy Bees cleared year 2 59% of the time against 35% for the bot's mixed buying. Now it blooms the crop below it (the plate's foot, where the sun is) by +2, and its other neighbours only get its height for the lettuce. Its rule picture is a little map with the plot below lit.
- **The strawberry's rule** used to print its picks a second time (a loop and ×4 on the basket row, and again as its rule); its rule is now the scoop each pick puts back.

### Tools

| Card | Cost | Effect |
|---|---|---|
| Watering Can | 1 | A row grows an extra night tonight (improved: free) |
| Compost | 1 | Target crop +6 yield at harvest (every pick) |
| Fertiliser | 1 | A growing crop grows a night now |
| Trowel | 0 | Move a crop to an empty plot next to it |
| Shears | 1 | Pull a ripe crop now; double yield |
| Ladybirds | 0 | Clear every pest |
| Scarecrow | 1 | Object: crows keep off the 3 by 3 around it |
| Beehive | 2 | Object: crops in the 3 by 3 around it get +1 bloom |

The can used to be free, which the tester named as half of "plant any three": watering now costs a scoop a seed could have had.

### Weather

Weather cards take effect tonight.

| Card | Cost | Effect |
|---|---|---|
| Rain | 1 | Every crop grows an extra night tonight |
| Sun | 1 | Crops pulled tonight get +3 yield |
| Storm | 2 | Every crop grows 2 extra nights tonight, but one random crop is flattened |

The Hose and Mulch were cut with watering. A save that holds them gets Rain for a Hose and a Watering Can for Mulch.

### Improved cards ("Select" stock)

The stall calls it improving a card. An improved seed gets +50% base yield, rounded up (the improve sheet says "basket 5 to 8"). Upgraded tools, weather and objects cost 1 less, so an improved Watering Can is free. The two free cards gain a rule instead: Trowel moves to any empty plot, Ladybirds also draw a card. On the plot an improved crop wears a plant label on a stake by it, a cream disc ringed red with a red star, 14 px or more across (it used to be a 6 by 3 px red bar that read as a glitch).

### Rarity

Common 15 coins: radish, carrot, lettuce, watering can, ladybirds, garlic, wheat, mint. Uncommon 30: beans, sunflower, strawberry, chili, compost, fertiliser, rain, sun, trowel, scarecrow. Rare 45: corn, pumpkin, beehive, shears, storm. The shop rolls common 55%, uncommon 33%, rare 12%. Prices rise 50% a year after the first. (They were 20, 40 and 65: a good card has to be worth more than its share of another page, or buying nothing wins.)

### Hazards

Both hazards ramp a step each season, not a jump at the year's turn. The old odds went by year and doubled overnight from year 1 winter to year 2 spring; with the plot wiped as well, the tester's takes fell from 231 to 161 and 340 to 174 there.

| Season | 1 sp | 1 su | 1 au | 1 wi | 2 sp | 2 su | 2 au | 2 wi | 3 sp | 3 su | 3 au | 3 wi on |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| New pests on a night | 0 | 15% | 20% | 25% | 30% | 34% | 38% | 42% | 46% | 50% | 55% | 55% |
| A crow at dawn | 0 | 0 | 12% | 16% | 20% | 23% | 26% | 29% | 32% | 36% | 40% | 45% |

- **Pests:** from summer of year 1. Pests already on a crop count down and may spread whatever the season (a pest carried over the year's turn still holds its crop back).
- **Crows:** from autumn of year 1. A crow shows on the bed's corner all day and takes a ripe, unguarded crop that night.
- **An answer in the stall, ahead of the hazard:** the stall before the first season that can bring pests stocks ladybirds or garlic, and the one before the first crow season a scarecrow; once a hazard has shown, every stall keeps stocking its answer likewise, while the deck holds fewer than two of them (`ANSWERS_HELD`). It used to stop at one, and one ladybird card in a deck of twenty seldom came to hand on the night it was needed. (The scarecrow used to come only after the first crow, which lost the tester's guided run by 9.)

## The shop (the seed merchant's stall)

The shop opens between seasons.
- **Cards:** 4 cards from the unlocked pool: always at least one seed, at least one uncommon or rare, an answer to any hazard met or coming (above), the rest at random by rarity. Laid out a little larger the rarer they are, each with a price tag; a sold card leaves a chalk "sold" the same size, so nothing beside it moves. (Three slots often offered three starter commons.)
- **Almanac pages:** 2 pages pinned to the cork board, at their price (below) times the year's rise. You keep up to 4 (it was 5: buying pages and no cards cleared year 2 more often than buying good cards); with the almanac full, a new page takes a kept page's place (lift the new page, then tap the kept one twice).
- **Room for one more page:** once the almanac is full, the cork board sells a page slot: 250 coins times the year's rise, doubling with each one bought, until all ten pages fit. It grows the run rather than swapping, and is the late use for coins the second playtest asked for (its runs ended with 2,825 and 696 coins unspent, the almanac full by year 1 winter and both scoops bought by year 2 autumn). The decent bot buys one in about half its runs.
- **Throw out a card:** 35 coins, then 15 more each time in the same visit. The deck keeps at least 6 cards. A tin bucket on the tray's lip (not the compost heap: Compost is a card).
- **Improve a card:** 40 coins, then 15 more each time in the same visit. The first tap on a card says what it would become ("Carrot: basket 5 to 8"); after it, a note shows the improved card.
- **Fresh stock (new cards on the tray):** 8, rising by 3 each time.
- **A scoop, for good:** from year 2, one more seed scoop on the bench every day. 200 coins times the year's price rise, doubling for each one after; four at most (the bench lays out any number). A late use for coins.
- Everything takes two taps. The first lifts it and a slip says, in a sentence, what it is: a card's cost, when it ripens and its rule, then "Tap again to buy, 20 coins" (or "Short 6 coins"). The second buys. The purse on the table and the purse line at the stall follow every purchase at once.
- **The slip has a place of its own,** under the goods and above the signpost, always there and always the same height: the slip for a lifted thing, else what was just bought, else the stall's lesson. Nothing on the tray reflows when it changes, so the second tap lands where the first did. (The slip used to open inside the tray and the stall re-centred: goods jumped 22 to 90 px, garlic from y 692 to 607, and second taps missed.) deck-overlap measures every good, page and service between its two taps: nothing moves.
- **The way on is always in sight.** The goods, pages and services sit in a body that scrolls only if it must; the slip's place and the signpost follow it, pinned at the bottom once the body fills the screen. On a 1280 by 800 desktop and a 412 by 838 phone every control is on the screen without scrolling in every stall state, including a full almanac with the page slot and the scoop (the desktop signpost was at 797 to 839 px, below the fold).
- The stall is its own scene, the merchant's plank wall, not the table showing through; its own small almanac (top right) opens the almanac and the rules, which list every card in words.
- The stall arrives in parts like the table: the first visit has only the goods and the signpost, the second adds the pages, the third the throw-out bucket, the stamp to improve and the bell. The head is short: the sign, "Summer's harvest is in: 171 of 150." and the purse line. ("Spring is in." read as spring starting.)

### Almanac pages

| Page | Price | Effect |
|---|---|---|
| Rain Barrel | 80 | Column A grows an extra night every night |
| Root Cellar | 100 | Radishes and carrots get +2 yield, and +1 bloom for each radish or carrot beside them |
| Busy Bees | 110 | A crop a sunflower or a beehive blooms gets x2, once |
| Green Thumb | 170 | One more seed scoop every day |
| Big Basket | 140 | Hand size +1 |
| Crop Rotation | 100 | Sow a different crop where one was just pulled: +4 yield |
| Market Day | 130 | Every fifth harvest in a day is x2 |
| Four-Leaf Clover | 140 | One harvest in eight comes up golden, x3 |
| Long Furrow | 150 | The plot gains a fifth column, and one more scoop a day |
| Cold Frame | 80 | Winter quotas are 20% lower |

- **The Root Cellar scales the root combo.** Its old +3 yield on radishes and carrots did not grow with the patch: carrots ringed with radishes and the Cellar cleared year 2 1% of the time. Now every radish or carrot beside a radish or carrot adds +1 bloom, on top of the carrot's own +1 per radish, so a patch of roots grows together (a carrot ringed by four radishes pays 7 × 9 = 63 with it, 5 × 5 = 25 without).
- **Busy Bees is one multiplier, not a doubling of every bee.** It made each sunflower and beehive give +2, which stacked without limit; now a crop any sunflower or beehive blooms gets ×2 once, however many bees.
- **The Long Furrow comes with a scoop:** it used to add only bare soil, a column the scoops could not fill.

## Look and feel

A card game on a warm oak table, with the plot as a painted almanac plate. Its own identity: no felt, no neon, no pixel type, no jokers. Every surface is its own material; type reads from shape and material before colour.

- **Board:** a deckled almanac page on the table with a printed double rule, a timber bed of soil squares with engraved furrows, key letters along the top, and a caption ("Plate VI. The kitchen plot in summer."). Paper and soil follow the season's palette. The eight farm crops are the almanac's own paintings from `src/render2d/crops.ts`; mint, garlic, wheat and chili are painted in the same hand with its brushes. A just-sown seed shows its packet on a stake. A small moon marks every crop that will be pulled tonight. Pests are fat lime aphids outlined dark over an ochre wash on the plot, with a badge in the plot's corner (a bug and the nights they stay, each paying half). A crow due tonight sits on the bed's top right corner. The key letters and numbers are painted over the crops on small paper chips, so a bean pole, a scarecrow's hat or corn in the first row passes behind them (they used to be painted first and were covered); deck-overlap reads the pixels and finds no letter more than 6% changed by a tall first row. They fade at night, so harvest slips never cover them.
- **Cards are things, made the way their type is made, and read as pictures:**
  - Every face: the cost as seed scoops on a cream chip in the top left corner (the part a fanned hand always shows), each scoop about 17 px on the Pixel; "Free" in the same spot for free cards. On a seed packet the chip is a price sticker over the torn top edge, so the name keeps the whole band: three scoops beside the name squeezed "Pumpkin" to 6 units. Then the name, the painting, and the rule as one line of pictures: a carrot and "+2" by a basket on the radish, a radish and a red "+1" by a flower on the carrot, a little cross of plots for "its neighbours", a row of plots and a moon "+1" on the watering can. No sentences: the sentence (and the variety, "Early Nantes") is in the close-up a long-press or a hover opens.
  - Seeds: printed seed packets with a torn top, the crop painted in an oval vignette with its produce, the base yield by a basket (with a looping arrow and the picks for perennials, and a tall mark for tall crops), and a moon for each night to ripen.
  - Tools: brown kraft luggage tags on twine, with a reinforced punched hole, a stamped name and the tool drawn in ink and wash.
  - Weather: clippings cut from an almanac page, with print showing through from the back, a "The forecast" masthead and a woodcut glyph.
  - Objects: painted wooden plaques on a stake, with nail heads and grain. The scarecrow's rule is a crow in a red ring and bar beside the 3 by 3 it guards (it used to be the 3 by 3 alone, which read as nothing).
  - Rarity shows as print quality: commons are plain, uncommons get a finer second rule, rares a gold-leaf corner. Improved cards carry a red "Select" rubber stamp.
  - The picture vocabulary lives in `src/games/deck/view/icons.ts` and is shared by the faces, the board's previews and the slips.
- **The table is the interface:** a ruled ledger slip names the season and day and the take against the quota (on the desktop in larger type, the take on a row of its own: season 23 px, take 27 px); a cribbage-style pegboard tallies the quota with a brass hole at the end; three wooden seed scoops show what is left to pay with today; a green seed tin is the draw pile; a heap of spent cards is the discard pile and the toss target (a red tick on it once today's toss is used; its label stays "Spent"); a brass lantern is End day (blowing it out brings the night); tonight's weather clippings lie by the lantern; the almanac (a small green book, a little faded) is the pause menu. On desktop, kept almanac pages are pinned in the side panel. Labels on the table are one or two words.
- **Page bonuses on the faces:** with Root Cellar kept, the radish and carrot print their raised basket (4 and 7) in green; with Busy Bees, the sunflower and beehive print its ×2 after their bloom.
- **A full hand stays readable:** the hand shrinks to fit so the next card covers no more than a strip at each card's right edge; every card's name and rule stay uncovered at 5, 6 and 7 cards (measured by deck-overlap: names 8.2 px and up at five cards on a 412 px phone). Tool tags with two-word names stamp them on two lines.
- **Any number of scoops fits the bench:** the bench lays out the day's scoops (the refill and those pulled crops put back). The scoops take whatever room the tin, the spent heap, the lantern and tonight's weather leave them, one row while they keep a good size and two rows past that; the tin, the heap and the lantern never shrink. On the phone, 3 scoops are 43 to 48 px, 4 to 6 sit in two rows of 37 px, 7 and 8 in two rows of 31 px; on the desktop 84 px down to two rows of 54. (With Green Thumb and a bought scoop the lantern was squeezed to 10 px and the labels ran together as "SpentEnd day".) deck-overlap checks 3 to 8 scoops on both screens.
- **The desktop bench is the desktop's controls:** it takes the side panel's lower half, 260 to 380 px tall (360 on a 1280 by 800 screen), with 84 px scoops, a 116 px tin, a 92 px spent heap, a 112 px lantern and 15 px labels. It was 200 px tall, its labels 11.5 px and its heap 54 by 58 px, with about 440 px of bare table above it; the bare table between the pegboard and the bench is now 282 px, 52 of it the lesson strip. The seed tin has a label like Spent and End day ("Seed tin"; painted on the tin it came out 5 px). A card taken up by keys hides its key number, which stood over the plate's caption.
- **Cost at a glance:** full scoops are heaped with seed; spent ones tip over, empty and pale. Taking up a card lifts and lights the scoops it would use; playing it empties them. A card the scoops cannot pay for is dimmed in the hand with its missing scoops ringed red; tapping it shakes it and flashes the missing scoops on the bench (no note, it is not taken up). At dawn the scoops refill one after another.
- **The board explains while you play:** while a card is held, every plot where a bonus would apply carries a small chip in its corner (a "+2" by a basket, a red "+1" by a flower, a "×1.5", or a moon "+1" for an extra night), and the plot under the finger, pointer or keyboard cursor shows what the seed would score there ("4", or "5 × 3 = 15") along with what its neighbours would gain. A bonus the night will not pay shows greyed, dashed and struck through, and under the aimed plot one plain line says why ("The radish is pulled before the carrot ripens.", "Too late to ripen this season."). A card that would do nothing says "No effect now." Dragged over the plot, the card shrinks above the finger and goes see-through so the preview shows. Previews come from `previewPlay` in the rules, run on a copy of the run.
- **Shop:** the seed merchant's stall, its own scene against a plank wall: a painted sign, almanac pages pinned on cork, a wooden tray of goods with kraft price tags, a tin bucket (throw out), a rubber stamp (improve), a hand bell (fresh stock) and from year 2 a scoop on the tray's lip, and a signpost on to the next season.
- **Run end:** "The almanac, year N": a ruled entry per season, then the best harvest, coins and new cards ("New in the merchant's catalogue: pumpkin, shears and mint."). The account scrolls in a long run, its ruling scrolling with it; "Turn to a fresh page" stays in sight under it.
- **Notes, not toasts:** one short ink note at a time beside the plot it concerns ("A crow took one."), gone after two seconds. Eight words at most. A note about a plot stays inside the bed's width and below its top, so it never covers a key letter or number; a note about the whole table sits on the plate's caption. Meeting the quota mid-night says "Quota met." there as the peg drops into the brass hole and gilds (it used to sit over B and C).
- **Reading a plot says what it will pay:** a tap with no card held, or Enter on the cursor, says "C4: carrot pays 15 in 2 nights.", "B2: beans, pests, pays 3 tonight." or "D1: corn pays 24 next season.", scored like the previews, on the night it is pulled.
- **The score slip wraps:** each bonus takes its place on the slip as it sets off (unseen until it lands), so its arc flies to its own place, shrinking to the chip's size as it lands, and never settles on a bonus already there; the chips wrap onto a second line past four (the second beans +2 under corn's ×1.5 was hidden). deck-overlap watches a corn with seven bonuses.
- **The shell's corner** (60 px plus the safe area, top left) stays clear on the table and on every sheet: sheets start below it, and sheets and the close-up sit under the shell's button so it always takes a tap. deck-overlap checks every state and sheet.
- **Phone portrait first** (412 by 838 to 900): ledger, coins and the almanac along the top (the shell's corner kept clear), the pegboard under them, the plate in the middle, a strip for the lesson line under the plate, the bench (scoops, weather, tin, spent heap, lantern) under that, the hand fanned along the bottom. Kept pages are read in the almanac on a phone.
- **Desktop:** the plate left of centre, a side panel with the ledger, pegboard, kept pages, the lesson line and the bench, and the hand along the bottom. A landscape phone uses the desktop layout with smaller cards.
- **The plate's caption** sits between the bed and the printed frame; the margin under the bed is sized from the caption and the frame's two rules, so the rules never strike through it at any size.

## Teaching: the guided first season

No rules wall, and nothing on the table before it is needed. A new player's first run starts with the plot, two radishes and one note. Each lesson brings in one piece of the table, shows one line (eight words at most, one action, imperative), and waits until the player has done it. The thing a lesson is about glows softly (the lantern, the scoops, the radish in the hand). The board's previews and the scoring do the explaining; notes never explain a rule. Lessons fire on what is happening, not on the day number, so a run that strays from the set hands still gets each one when it first matters. The tutor is `src/games/deck/lessons.ts`.

Every day of the guided season deals a set hand from the start deck (`GUIDED_DEALS` in the rules, deterministic; the spent pile is used if the tin runs short; never past a full hand): day 1 two radishes; day 2 a carrot and two radishes; day 3 two radishes, a carrot and a lettuce; then one new card a day: day 4 the beans, the first dear seed (with a carrot and a radish), day 5 the watering can (with a radish and a carrot, and the tin), day 6 the sunflower, the lettuce's tall crop (with the lettuce and a radish, and the spent heap).

Cost comes in a piece at a time. Radishes are free and the carrot and lettuce a scoop each, so days 1 to 3 never run the bench short and the scoops stay off the table. Day 4's beans cost two: first the new-card lesson ("Hold the new card to read it."), then the scoops and the cost printed on every card arrive with "Spend two scoops on the beans." (the two scoops they would use lift). That night each crop pulled up flies a scoop to the bench, and day 5's dawn lays out five scoops with "Crops pulled last night put scoops back." The old scoops lesson waited for a day 3 hand that cost more than three scoops, which free radishes no longer make. The strawberry first comes in summer. From summer the hand draws up to five. (Day 4 used to draw up to five, bringing the beans, the strawberry and the sunflower at once, with the tin lesson on top.)

The lessons, in the order they come in the guided season (touch wording; mouse says Click, keys name the key):

| # | When | Brings in | Line |
|---|---|---|---|
| 1 | Day 1, at once | the plot and the hand only | "Tap a radish to take it up." / "Tap a plot to plant it." / "Plant the other radish." |
| 2 | Both radishes sown | the lantern | "Blow out the lantern to end the day." (keys: "Press E to end the day.") |
| 3 | Night 1, the first harvest | the ledger and pegboard (the slip flies to it; yield only, no bloom) | at dawn: "Reach the brass hole by day six." |
| 4 | Next card taken up | | "Miss it, and the run ends." |
| 5 | Day 2, carrot and radish in hand | | "Plant the carrot first." / "Plant a radish beside the carrot." (the held radish marks +2 on every plot beside the carrot; the carrot's +1 bloom shows greyed with "The radish is pulled before the carrot ripens.") |
| 6 | Day 3, the carrot ripens tonight | bloom: the slip's × bloom part | "The carrot ripens tonight. Ring it with radishes." (the carrot shows +1 bloom per radish; that night it pays 5 × 3). This teaches the timing: on day 2 the same +1 showed greyed, because the radish was pulled first. |
| 7 | Day 4, the beans: the first card of a new kind | | "Hold the new card to read it." (nine words before; mouse: "Rest the pointer on the new card."; keys: "Take it up, then press I.") |
| 8 | Day 4, a dear seed (two scoops or more) in hand, or a hand that costs more than the scoops left | the scoops, and the cost printed on cards | "Spend two scoops on the beans." (short of scoops: "Spend your last scoop.", then "End the day. The scoops refill at dawn.") |
| 8b | Day 5's dawn, the bench holding more than its refill | | "Crops pulled last night put scoops back." (passive, five seconds or the first scoop spent) |
| 9 | Day 5 | the seed tin | "Tap the tin to see your cards." (keys: "Press D to see your cards.") |
| 9b | Day 5, a can in hand and a crop it would hurry | | "Water a row to grow it faster." (the row's crops show a moon +1) |
| 10 | A weather card in hand that would bring a crop in tonight (never one that would change nothing) | tonight's clippings by the lantern | "Drop the weather anywhere on the plot." |
| 11 | Day 6 with a hand to spare | the spent heap | "Drag a spare card to Spent." (keys: "Take a card up, then press X.") |
| 12 | The first season's end | coins (the purse) | in the stall: "Buy a seed with your coins." |
| 13 | The second stall | almanac pages on the cork board | "Pin a page to change the rules." |
| 14 | The third stall | throw out, improve and fresh stock | "Throw out or improve a card here." |
| later | First pest (summer) | | Names only a card in the hand or the tin: "Clear the pests with ladybirds." / "Garlic keeps pests off its neighbours." / "Pests halve that crop's pay for two nights." |
| later | First crow at dawn (autumn) | | "A crow is about. Set out the scarecrow." only if one is in the hand or the tin; with one already standing, "A crow is about. Your scarecrow keeps watch."; else "A crow will take a ripe crop tonight." Later crows: "A crow is about tonight." The stall before autumn stocks a scarecrow, so the first crow can be met. (It used to count every card owned, so it asked the third playtest to set out the scarecrow already standing on C2.) |

Lessons, the pieces brought in, and the card kinds met are kept in the save with the meta unlocks. A player with a finished run skips the guided season and has the whole table. A save from before the lessons loads with everything in and a refresher for the can, the weather and the scoops put back, whose rules changed. "Start over" from the shell clears the lessons too. The full rules live in the almanac's "The rules in brief".

## Controls

| Input | How |
|---|---|
| Touch | Tap a card to take it up: plots it can go on get a dashed rule, the plots it would touch are washed (a row of water, a 3 by 3), and the preview chips show what it would do. Tap a plot to plant a seed, or anywhere on the plate for weather and Ladybirds. A tool or object that goes on one plot (can, compost, fertiliser, shears, scarecrow, beehive) aims on the first tap and plays on the second, since a finger has no hover: on touch the aimed plot is the hover, so the first tap shows exactly what a mouse resting there shows (the wash, the moon +1 or +6 yield chips, "Tap again to water."). It used to show only the note: the pointerleave a finger sends after every tap cleared the hover. deck-lessons compares the first tap on the phone with a hover on the desktop. Tap the card again to put it down. A card the scoops cannot pay for only shakes. Dragging a card onto a plot also works (any card can be dragged, so one you cannot pay for can still go on the spent heap); drag it onto the spent heap to toss it. Long-press a card to hold it up close; tap to put it back. Tap a plot with no card held to read what's there. Tap anywhere during the night to skip it. Ending the day while a played card is still flying lands the card first, so the night starts from the board as the play left it. (The card's landing used to run during the night and show the morning's board and tomorrow's hand all night when End day came within about 0.3 s of a play.) |
| Mouse | Click or drag the same way. Hovering lifts a card; holding still shows it up close. Hovering a plot with a card held shows what it would score there. |
| Keyboard | 1 to 7 take up a card (again puts it down; Shift takes up one the scoops cannot pay for, to toss it), arrows move the plot cursor (the cursor's plot shows the preview), Enter or Space plays (or reads the plot), I reads the held card, E ends the day, X tosses the held card, D opens the seed tin, F toggles harvest pace, Esc puts the card down or opens the almanac. Keys for pieces not yet brought in do nothing. Any key skips the night. In the stall and the almanac, arrows move between things and Enter takes them. |
| Gamepad | Not built. |

## Save

The save is the whole run state (seeded rng and all), the meta unlocks and best record, the harvest pace, and what has been learned (lessons done, pieces of the table brought in, card kinds met). It is written after every card played, every toss, at the end of each day (before the night animates) and after every shop action. Summary example: "Year 1 summer, day 3, 210 coins".

## Balance

`npx tsx scripts/deck-balance.ts [runs] [noise] [--meta] [--free] [--calm] [--guided] [--quotas=a,b,c,d] [--year=x]` plays whole runs with the bot in `src/games/deck/bot.ts` (`--quotas` sets year 1's row; `--year` the growth after year 3). For each play it tries every legal card and target on a copy of the run, resolves tonight with sampled dice, rolls the board forward calm nights to the season's end and three past it (each worth 0.8 of the one before, so a perennial counts for every pick it will make; the nights past the season's end at half again, since they count for next season's quota), and looks two plays ahead. It shops from a preference list, and buys a page slot once its almanac is full and it has a quarter more than the price. `noise` blurs its judgements; the 0.15 bot stands in for a decent player and the strict bot (0) for a weak one. People who plan the plot a few days ahead should do better than either: the playtesters beat the bot's median by about a third.

`npx tsx scripts/deck-seasons.ts [runs] [--only=decent|strict|guided]` is the season-by-season report: for the decent, strict and guided bots side by side, each season of years 1 to 3 with its pass rate, quota, median take, crops standing at its first dawn and the take of its first two nights, then the clear rate per year, coins left on leaving the stall, and page slots bought. It uses only the bot and the rules' public calls, so the same file runs against an older build (copy it into a `git archive` of the commit).

`npx tsx scripts/deck-tune.ts [runs] [noise] [--guided]` plays with every quota at 1 and prints the take a target share of runs reaches each season: where the quotas came from.

`npx tsx scripts/deck-board.mjs [runs] [noise]` measures, per season of years 1 and 2, whether the plot fills and persists and whether cost binds: crops standing at dawn, plots filled at dusk (after the day's plays) and the season's fullest dusk, scoops on the bench at dawn, the share of dawns the hand costs more than the bench, the share of days that ended with a card that had a place but not the scoops, bare dawns, how many nights a crop stands, and the share of sowings beside a crop already standing. It reads the day from the rules' events, so it runs on an older build too.

`npx tsx scripts/deck-hazards.ts [runs]` plays the same seeds with hazards as shipped and with no pests or crows, and prints the clear rates of years 1 and 2 both ways (the gap is what the hazards cost) and the deaths that came in a season where pests landed on half the crops sown or more. Older builds too.

The tester's strategy simulation (`/tmp/playtest3/deck/sim.ts`, not in the repo) plays the bot's days with fixed stall policies and the whole catalogue unlocked: the bot's own buying, only sunflowers and beehives with Busy Bees, a wider bloom build, carrots and radishes with the Root Cellar, pages and no cards, and nothing at all.

Pass rates per season (of the runs that got there), 200 runs each, before the second playtest's changes (the plot cleared each season, hazards by year, three goods, quotas 160, 165, 185, 220, then 230, 265, 340, 370, then times 1.45) and after:

| Year 1 | spring | summer | autumn | winter | clears year 1 |
|---|---|---|---|---|---|
| Decent bot, before | 94% | 90% | 84% | 87% | 62% |
| Decent bot, after | 93% | 92% | 85% | 88% | 65% |
| Strict bot, before | 96% | 90% | 85% | 88% | 65% |
| Strict bot, after | 97% | 95% | 86% | 89% | 71% |
| Guided first run, before | 100% | 94% | 94% | 87% | 77% |
| Guided first run, after | 100% | 96% | 89% | 88% | 76% |

| Year 2 | spring | summer | autumn | winter | clears year 2 |
|---|---|---|---|---|---|
| Decent bot, before | 91% | 86% | 82% | 90% | 36% |
| Decent bot, after | 91% | 79% | 86% | 91% | 37% |
| Strict bot, before | 88% | 88% | 72% | 93% | 33% |
| Strict bot, after | 92% | 85% | 86% | 94% | 45% |
| Guided first run, before | 68% | 81% | 71% | 80% | 24% |
| Guided first run, after | 83% | 78% | 78% | 82% | 31% |

| Year 3 | spring | summer | autumn | winter | clears year 3 |
|---|---|---|---|---|---|
| Decent bot, before | 96% | 94% | 80% | 94% | 24% |
| Decent bot, after | 85% | 84% | 88% | 91% | 21% |
| Strict bot, before | 94% | 89% | 69% | 68% | 13% |
| Strict bot, after | 88% | 78% | 84% | 86% | 22% |
| Guided first run, before | 90% | 86% | 81% | 83% | 13% |
| Guided first run, after | 76% | 87% | 83% | 97% | 17% |

The cliff at the year's turn is gone: the guided run fell from 87% in year 1 winter to 68% in year 2 spring and now goes 88% to 83%; the year 3 rows no longer dip at spring (the old year 3 spring quota, 330, was lower than year 2 winter's 370). Year 1 summer to winter ask 24 to 32% more than before and are met about as often, because the plot carrying over lifted the takes (decent bot, median takes 207, 236, 269 before; 260, 292, 374 after).

Season starts, decent bot: crops standing at a season's first dawn rose from none to 3.3, 4.3, 4.6 in year 1 summer to winter, 4.9 to 6.8 through year 2 and 7.7 to 9.2 in year 3. The first night of a season took 7, 7, 12 in year 1 summer to winter and 7 to 13 in year 2 before; now 34, 40, 51 and 64 to 113 (year 3: 0 to 5 before, 147 to 188 now).

Coins: the decent bot leaves the stall from year 2 summer on with a median of 377 coins (367 before, though takes are about a third higher), buys a page slot in half its runs (101 of 200, up to three) and keeps up to 8 pages; the most a run ended with unspent fell from 4,076 to 3,503.

The plot within year 1 spring, decent bot (deck-board, 120 runs, from the first playtest): 3.2 crops standing at dawn (0.3 before the standing start deck), the plot bare at 2% of dawns (77%), a crop stands 2.0 nights on average (1.3), and 62% of sowings go beside a crop already standing that morning (16%).

### Round 3: cost by power, scoops back, a rebalance

The third playtest scored 5 of 10: past the guided season every seed cost a scoop and the can was free, the plot peaked around 8 of 16, the sunflower and Busy Bees beat every other build, the root combo the tutorial teaches died in year 2, and pests decided runs. Measured before (the committed build, a `git archive` copy) and after.

The tester's strategy simulation, 150 runs a policy, clear rates of year 1 and year 2:

| Strategy | Before | After |
|---|---|---|
| Only sunflowers, beehives and Busy Bees | 90%, 59% | 60%, 39% |
| The bot's mixed buying | 64%, 35% | 81%, 49% |
| A wider bloom build (sunflowers, beehives, chili, perennials) | 72%, 65% | 61%, 49% |
| Carrots and radishes with the Root Cellar | 68%, 1% | 73%, 53% |
| Pages, no cards | 79%, 40% | 92%, 40% |
| Only Green Thumb and Big Basket | 24%, 0% | 9%, 0% |
| Nothing at all | 1%, 0% | 0%, 0% |

Roots, bloom and the bot's buying each clear year 2 49 to 53%; the build of only sunflowers is no longer the best (a sunflower blooms one crop now); buying good cards beats buying none (49% against 40%). The bloom builds lose more in year 1 because their shopping throws out radishes, which are now free and put scoops back.

What got there, in order (each step measured with the simulation at 30 to 80 runs; scripts in /tmp, not shipped):
- Costs by power and a scoop back for every crop pulled up, uncapped: the bot rose to 77% in year 2 but the bench grew to 9 to 12 scoops and the budget bound on 5% of days. Capped at two a night and the can at a scoop: the budget binds on 42 to 45%.
- The sunflower facing one way and Busy Bees as one multiplier took the bloom builds from about 60% to 40%. The Root Cellar's bloom for every root beside a root took roots from 3% to 40 to 57%.
- With quotas refit, roots and bloom sat under pages-only (32 and 22% against 36%). The Cellar's +2 yield, Busy Bees at x2, the beehive back at two scoops and cheaper cards (15, 30, 45) brought them to 42 to 48%, but pages-only rose to 59 to 60%. It ends runs with 1,400 to 2,000 coins it cannot spend, so dearer pages did not touch it; four page slots instead of five did (59% to 38 to 40%), since the other builds keep four pages or fewer.

Pass rates per season, 200 runs, decent bot, before and after:

| Decent bot | spring | summer | autumn | winter | clears the year |
|---|---|---|---|---|---|
| Year 1, before (160, 210, 240, 290) | 93% | 92% | 85% | 88% | 65% |
| Year 1, after (170, 260, 300, 350) | 96% | 97% | 90% | 96% | 81% |
| Year 2, before (320, 420, 510, 650) | 91% | 79% | 86% | 91% | 37% |
| Year 2, after (400, 480, 540, 600) | 94% | 84% | 72% | 79% | 37% |
| Year 3, before (780, 920, 1000, 1080) | 85% | 84% | 88% | 91% | 21% |
| Year 3, after (600, 660, 700, 740) | 85% | 84% | 90% | 91% | 22% |

The strict bot (a weaker player) clears years 1 to 3 at 68%, 29% and 12% (71%, 45% and 22% before); the guided first run at 77%, 28% and 9% (76%, 31% and 17%), so a new player's first year is as gentle as it was.

Takes rise faster through year 1 and flatten through year 3 (decent bot, median year 3 takes 725 to 808 against 1,028 to 1,338 before), so year 3's quotas came down a quarter: the late engine was stacked bloom from sunflowers and Busy Bees.

The plot and the budget (deck-board, 120 runs, decent bot, years 1 and 2):

| | Before | After |
|---|---|---|
| Crops standing at dawn, year 1 spring to winter | 3.3, 4.5, 4.8, 5.3 | 3.5, 5.3, 5.0, 5.4 |
| Plots filled at dusk, year 1 spring to winter | 5.7, 7.4, 8.1, 9.1 | 6.6, 9.1, 9.4, 10.3 |
| Fullest dusk of the season, year 1 | 8.0, 9.1, 9.9, 10.9 | 9.6, 10.9, 11.5, 12.3 |
| Plots filled at dusk, years 1 and 2 | 8.8 (50% of the plot) | 9.9 (56%) |
| Scoops on the bench at dawn | 3.0 to 4.8 | 4.5 to 7.7 |
| Dawns where the hand costs more than the bench | 76%, every card one scoop | 42%, cards of 0 to 3 |

Before, the budget always bound but every card cost the same, so the choice was "any three". Now it binds on 42% of days with prices that differ, and the plot holds one to two more crops at dusk.

Hazards (deck-hazards, 120 runs, decent bot): before, pests and crows cost 22 points of the year 1 clear rate and 24 of year 2 (59% and 40% with them, 81% and 64% without), and 3 of 72 deaths came in a season where pests landed on half the crops sown. After, they cost 7 and 13 points (83% and 50% with them, 89% and 63% without), and none of 60 deaths came in such a season.

How the numbers were set: free quotas first, then the take a target share of runs reaches each season (about 95 to 88% per season in year 1, 90 to 86% in year 2, 85 to 70% in year 3), then checked with deck-seasons and nudged where a year's turn dipped.

What the bot showed along the way:
- With the first quotas the bot cleared spring and never summer. With quotas off, its take per season stayed flat (about 80): hazards ate 25 to 40% of it and bought cards each play about once a season.
- Pests that never left and spread every night locked boards up; they now stay two nights and spread on a 40% chance.
- Repeat upgrades and removals in one visit at a rising price give coins a way to turn into growth.
- A three-night carrot added little persistence (3.6 crops at dawn against 3.2) and would have broken the guided season's third day, so the carrot stays at two nights; the standing crops do the work.
- A single year multiplier made year 2 spring a wall and year 2 winter easy; year 2 has its own row. With the plot carrying over, year 3's takes climbed and then flattened, so year 3 has its own row too.
- The guided first run takes about 80 coins less in spring than a normal one (its six set hands are small); without its own gentler first year it cleared year 1 only 32% of the time.
- Counting the nights past the season's end at full weight made the bot sow for next season while behind on this one: its year 1 spring pass rate fell to 86%. At half weight it is back to 93%.
- With two bought scoops at most, coins piled up; four, each twice the last, and the page slot hold the idle purse level although takes rose by a third.

## Checks

With a dev server running (`npx vite --config scripts/deck-vite.config.ts` on 5252, or the lead server on 5247; each script takes a base url as its first argument):

```bash
npx vitest run tests/deck                # rules: the day, growth, scoring, hazards (pests at half pay, the dawn crow, odds by season), the shop (four
                                         #   goods with a seed and an uncommon, hazard answers ahead of the hazard, page swaps and slots, four
                                         #   scoops), meta (unlocks by seasons met), saves, determinism, timed previews (next season too), the
                                         #   forecast, the plot carrying over (crops, objects, the Long Furrow), quotas, the guided deals; round 3:
                                         #   seed costs, scoops back (two a night, the strawberry, shears, crows), the sunflower and Busy Bees,
                                         #   the Root Cellar, answers kept in stock, the Long Furrow's scoop, unlocks across runs, the crow
                                         #   lesson's scarecrow check, cost taught a piece at a time
npx tsx scripts/deck-balance.ts 200 0.15 # pass rates by season and year (--guided for the first run's set hands)
npx tsx scripts/deck-seasons.ts 200      # years 1 to 3 season by season for the decent, strict and guided bots: pass rates, crops at a
                                         #   season's first dawn, first-night takes, coins left at the stall, page slots bought
npx tsx scripts/deck-board.mjs 120 0.15  # does the plot fill and persist, does cost bind: crops at dawn, plots filled at dusk, fullest
                                         #   dusk, the bench at dawn, hands over the bench, days the budget bound, sowings beside standing crops
npx tsx scripts/deck-hazards.ts 120      # what pests and crows cost: clear rates of years 1 and 2 with hazards and without, same seeds
node scripts/deck-lessons.mjs            # the guided first season, phone (real touch) and desktop (mouse and keys): nothing before its lesson,
                                         #   each lesson ends on its action, notes of eight words at most, no sentences on faces, previews while
                                         #   held (the day 2 carrot's bloom greyed with why, the day 3 line on timing), cost scoops of 14 px or
                                         #   more, unaffordable cards darker by pixel luminance, scoops lift through touch, the shell's corner
                                         #   clear at every step, the first stall stocks a seed, its first tap reads the card out and buys
                                         #   nothing, the purse follows the purchase, lessons survive a reload, returning players skip it;
                                         #   days 4 to 6 bring one new card each; a tool's first tap on touch shows the same preview as a
                                         #   hover on the desktop (can and compost); End day right after a play keeps the dusk board and
                                         #   hand through the night (P1_ONLY=1 runs just these last checks); round 3: no scoops before the beans,
                                         #   "Spend two scoops on the beans." brings them, the beans print two scoops and the radish Free, the two
                                         #   scoops lift from their places, a pulled crop's scoop flies to the bench, day 5's dawn lays out five
                                         #   and says "Crops pulled last night put scoops back."
node scripts/deck-overlap.mjs            # no two labels, buttons, cards or slips overlap, in every state on a phone and a desktop; nothing
                                         #   in the shell's corner on the table or any sheet (almanac, rules, tin, spent, close-up, stall,
                                         #   throw out, improve, run end); the purse agrees with the rules after every stall action; every
                                         #   card's name and rule uncovered in hands of 5, 6 and 7; the stall's first tap and two-tap fresh stock;
                                         #   the bench at 3 to 8 scoops (lantern and heap full width, labels apart, all on the bench); every
                                         #   stall control on the screen without scrolling in every state; nothing on the stall moving between
                                         #   the two taps on any good, page or service; the page slot; a long run's entry keeps its button in view;
                                         #   round 3: the desktop bench (15 px labels, the tin labelled, an 80 px heap, 250 px tall), a lifted
                                         #   card's key number off the caption, a slip of seven bonuses wrapping with none covered, key letters
                                         #   over a tall first row and no note on them, reading a plot says what it pays, the Select stake 14 px
node scripts/deck-caption.mjs            # the plate's caption against the printed frame at eight sizes, by pixel readback
node scripts/deck-play.mjs               # phone, real touch: 14 days from the guided start, totals vs rules, stall, reload, pause, cues, mood
node scripts/deck-desktop.mjs            # desktop: mouse and keyboard days on a returning player's table, the stall by keyboard
node scripts/deck-perf.mjs               # frame times through a 16-harvest cascade, normal and 4x CPU throttle
node scripts/deck-shots.mjs              # contact sheets in /tmp/deck/
node scripts/deck-beforeafter.mjs a b    # crops of two builds side by side (first screen, faces, a note, a held card, cost)
```

`scripts/deck-checks.mjs` holds the page checks the two browser scripts share (the corner scan, the hand scan).

The debug hook `window.deck` seeds a run (guided or not), brings every piece in (`learnAll`), reads state, the lesson on screen, the pieces brought in, a face's painted text, a card's sentence, the purse and the board's preview, deals a chosen hand, plays a card through the UI path, ends the day, skips, suggests the bot's play and exposes screen rects for scripted taps. `?game=deck&deckart` shows every card face.

## Priorities

1. The rules engine (deterministic, seeded, unit tested), the start deck, the board, a day, the scoring cascade, and quotas. Built.
2. The shop, almanac pages, hazards, the full card list, meta unlocks, a balance bot. Built.
3. Juice, animation, sound cues and polish. Built; gamepad not.
4. Teach one thing at a time, show rules instead of telling them, and make cost obvious: the guided first season, picture faces, previews, arcs, scoops. Built.
