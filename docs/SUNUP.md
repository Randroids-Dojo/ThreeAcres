# Sunup: design

Sunup is the homestead life sim. It runs on the farm simulation in `src/sim` under one fixed set of rules (the Sunup preset), drawn by the 3D diorama renderer. The sections below describe the simulation as first built with its switchable axes; only the Sunup values apply now, and the other axes stay in the simulation only because its tests exercise them.

Three farming games share one farm. The player can change any rule at any moment and keep playing the same farm. The point is to find out which farming game is the most fun by playing them, and the mixes between them.

## Sunup as it plays now

What follows two playtests: Spring 1 to Autumn 1 on a phone, then 31 days on a phone and a desktop (with a 6-farm, 30-day bot run each time). These rules hold only under Sunup's rules (`homestead(s)` in `src/sim/actions.ts`); the other rule sets keep the older behaviour their tests check.

**The day.** 6:00 to midnight in 120 real seconds (it was 240, then 150). Stamina is 100 and the jobs are cheap: harvest, water, plant and pick off bugs 1 each, hoe and build 2, clearing a withered crop nothing. A dry day's work on a farm of two or three fields, at a person's pace, runs to early afternoon. Sleeping before noon asks first ("Sleep now?"), except while the first lesson teaches it and when stamina is nearly gone. Day 3 is dry (the rain comes on day 4), so the seeds sown on day 2 want water.

**Soil and water.** The can wets a plot for one night; rain (or a sprinkler) soaks it for two, one in a heat wave. So dry days mean watering, and sprinklers, the copper can and quick crops are worth having. The can's water is always on the can: a level up the side of the tool on the rack, and a gauge on the act button while it is in hand. Empty, both say Empty, and the line "Can empty. Fill the can at the well." points at the well. The upgraded cans and hoes are judged by their whole reach.

**Seasons.** In the last three days of a season the seed picker also offers the next season's crops, marked "Summer crop" (and so on). Crops that would still be green at the turn and do not grow in the next season are marked "Too late". At the turn, ripe crops stay to be picked; what the turn takes is simply gone. A crop that withers (by drought, bugs, or on the night of the turn) stays on its plot one day, clears for free, and is gone the night after. If a farm ever has nothing growing, nothing in the crate and too few coins for any seed, a neighbour leaves enough for four packets of the cheapest.

**Requests** are few and they compete; choosing which to grow for is the morning's decision. The first is three radishes, pinned when the board is read. After that new ones come only with the mornings (an empty board always gets one, a second about three mornings in five), one open until the first is filled, then two at most. Each asks for a good share of the soil free to plant in the two or three days it leaves for sowing (half to most of it, a third as many of the big crops, never more than 20), and a second one is sized so that the two together want more than that soil: only one can be met, and they are due too soon to grow one after the other. A request pays what its crops fetch at market and a little over, at most a fifth more and never more than 60 coins over (`requestReward` in `src/sim/goals.ts`), plus a good word in town. Each is for a crop that can be grown and handed over in time and is never due after its crop's season ends. The crate keeps what an open request still needs overnight, while the request can still be met. A request that runs out of time says so on the morning card ("the lighthouse keeper gave up on the corn"). The smith wants reputation 2 and 8 for the hoes, 3 and 10 for the cans.

**Fields** cost 250, 800, 1,500, 2,400 and 3,500, and from the third the land agent also wants reputation 2, 4, 6 and 8 (`FIELD_REP`). The price is on the stamp ("Buy for 250", "Need 800") or, when the good word is short, "Reputation 4". Saves keep their fields; fields still for sale take the new prices on load.

**Aiming and tapping.** A faint frame always marks the plot in front; it brightens, with the verb's badge, where acting would do something. When the plot in front has nothing to do, acting snaps to the nearest useful plot in reach. The act button always says a verb, and with nothing to do it wears the tool in hand. Tapping a plot walks there and does the job; taps made while the farmer is busy wait their turn and are done in the order tapped (pushing the stick drops them). A tap takes the tool for the job when the one in hand cannot do it and a free job waits there: the hands for a ripe crop, bugs, a crow or a withered crop, the can for a thirsty one (never seeds or the hoe, which spend coins or turn meadow). A tap on the ground beside the well, or on the well's drawing, walks there and fills the can; a tap on the notice board's drawing reads it. Walking with the act button held does quick jobs on the move, a little slower, instead of stopping at every plot.

**The keyboard.** Every button shows its key while a mouse or keyboard is in use: the tools 1 to 5, Enter on Sleep, B on the board, C on the view button, and a number on each card in the seed and build pickers. While a picker is open the arrow keys choose in it (they never walk the farmer; WASD still do), a number picks that card, and Enter or Escape closes it; Escape never reaches the game switcher while a picker is open. A button reached with Tab takes Enter and Space itself; a button clicked with the mouse gives the keyboard straight back to the farm. With a mouse, the view button (top right, desktop only) switches between close up and the whole farm, like C.

**The cameras.** A tall phone screen looks down at 70 degrees and fits the farm's whole depth between the day card and the tool rack (`tests/homestead-camera.test.ts`). A wide screen's close camera looks 1.4 tiles south of the farmer and leans towards what a lesson points at, so the rack and the lesson line never cover the crops being taught (`scripts/qa/overlap.mjs` measures it). Rain and storms darken the day but much less at first light: a 6 am storm reads as well as a sunny 6 am (mean light over the clear band 52 sunny, 35 storm before, 54 after; `scripts/qa/lessons.mjs`).

**The board and the HUD.** Stamps are sentence case; what you cannot afford is a dashed "Need 400". A field or a smith's tool asks before it buys, with its price once, on the stamp. One field bought makes one toast. The morning card is one sentence with a capital at its start only ("Old Tamsin paid 145, sold 8 for 340."), and town names read as names inside it ("for the lighthouse keeper"). Harvest words over a plot are short ("2 of 3 radishes", "3 radishes ready") and wrap rather than run across the screen. A request handed over by day says who took the crops.

## The lessons now

One line at a time, eight words or fewer, in the words on the buttons. Lines about a place point at it: a cream chevron just over the top of the thing (aimed half a tile up), or, while it is out of view, an arrow on a dark disc at the screen's edge, turned towards it.

A lesson counts as done only once its line has been on screen (`Tutor.update` in `src/games/homestead/lessons.ts` counts the seconds it was visible: not while asleep, nor under the board or a picker). A calm lesson ends when the farmer has done what it says after seeing it. An urgent one ends when the farmer dealt with the trouble, or when the trouble went away after the line had been up 1.5 seconds; one whose trouble went away unseen is not done and waits for the next time. Urgent lessons have an order: the crow over the scarecrow note and the bugs, and those over the new field; the one taken over from comes back after.

| Lesson | Line | Points at |
| --- | --- | --- |
| pull | Tap a radish to harvest it. (keys: Walk to a radish. Space harvests it.) | the nearest ripe radish |
| water | Take the can. Water the carrots. | a thirsty carrot |
| well | Fill the can at the well. | the well |
| sleep | Crops grow overnight. Sleep. | |
| broke | No coins left. Sleep to sell the crate. | |
| plant | Plant seeds in the bare soil. | the nearest bare plot |
| wide (keys only) | Press C to see the whole farm. | |
| hoe (urgent) | Hoe the new field. | the new field's nearest meadow |
| requests | Read the board. | the notice board |
| deliver | Harvest 3 radishes. The crate ships them. (once a crop it wants is ripe, or from day 7) | a ripe one, else the crate |
| field | Buy a second field. | the field for sale |
| pests (urgent, first) | A crow is on your carrots. Shoo it. | the crow |
| scarecrow (urgent) | Scarecrows keep crows away. Build one. (They cost 40, when you cannot pay.) | |
| bugs (urgent) | Bugs on your carrots. Pick them off. (another tool in hand: Take the hands. Pick bugs off the carrots.) | the bugged crop |
| turn | Spring ends soon. Plant summer seeds. | |
| smith | The smith has better tools now. | |

After the bug lesson, bugs still come now and then: no line, but the pointer finds them. Owning a second field always brings the hoe and its line, however the field was bought. `scripts/qa/lessons.mjs` plays all of it on a phone with real touch.

## Crows and bugs in the lessons

Crows and bugs are let onto the farm quietly from day 5, once delivering requests is known. Until the crow lesson is done, one crow comes on a dry day with something growing, between 6:30 and 8:00, while the farmer is surely out, and a crow still pecking at nightfall takes nothing: the first crop a crow takes is one the farmer watched it go for. The crow line takes over from any other line (the bug line included), names the crop, and points at the crow. It ends when the crow is shooed, or when it has gone after its line was seen; then "Scarecrows keep crows away. Build one." shows for a few seconds, and whatever it took over from comes back. `tests/homestead-crow.test.ts` and `scripts/qa/lessons.mjs` check all of it, sleeping through a crow included.

## Balance

`npx tsx scripts/balance.ts` plays six farms for thirty days with the quick bot and again at a person's pace (about one action every 1.3 seconds). It reports morning coins on days 10, 20 and 30, the day each field is bought, waterings per harvest, nights with no income, what requests pay against the market, and the hour of the last job each day by fields owned.

After round 1 the bot farm (person's pace) bought all six fields by day 22, had 4,398 coins on day 30, filled 27 requests at 1.5 times market and was done by 9:35 on a dry day with two or three fields. Round 2, the same bot (it now spreads its planting over a few crops and no longer waters bare soil; both runs use it), person's pace:

| | Round 1 | Round 2 |
| --- | --- | --- |
| Morning coins, days 10 / 20 / 30 | 389 / 668 / 4,398 | 190 / 388 / 1,934 |
| Fields 2 to 6 bought, day | 4, 8, 13, 17, 22 | 7, 18, 27, 30 (1 farm in 6), never |
| Earned in 30 days | 22,318 | 10,645 |
| Requests filled, pay over market | 27.2, median 1.54x, max 1.83x | 7.3, median 1.13x, max 1.22x |
| Waterings per harvest | 1.89 | 3.05 |
| Nights with no income, of 30 | 6.0 | 7.7 |
| Last job, dry days, 2 to 3 fields | median 9:35, three in four by 11:39 | median 12:17, three in four by 13:40 |
| Days stamina ran out first | 3.3 | 1.3 |

Seed prices for the long crops went up (carrot 15, sunflower 30, corn 45, pumpkin 80), so every crop earns about the same per plot and day and the choice is made by the requests and the calendar.

## The three games

**Sunup: a day on the homestead.** 3D, close camera, walk the farmer, real-time day with stamina, classic water-every-day growth, a shop, wild weather, solo, a kit of tools. The fun is the routine: wake, walk the rows, water and pull, toss the crop in the crate, chase off a crow, sleep. Each day is a small run you get better at.

**Patchwork: the almanac puzzle.** 2D, wide camera, point at tiles, twelve moves a day with time frozen, synergy soil (moisture, nutrients, companions, quality), seasonal almanac goals with stars and a seed draft, wild weather with a three-day forecast, solo, one smart action. The fun is planning: where does the corn go so the beans can climb it and the lettuce gets its shade, with rain due on Thursday.

**Bushel & Co.: the farm that runs itself.** 3D, wide camera, point and drag, a continuous clock you can speed up, classic growth, town orders with deadlines and a market that moves, calm weather, a crew of farmhands, one smart action. The fun is the machine: hire hands, put down sprinklers, lay out fields to fill the orders, then speed up time and watch it work.

## Axes

Every axis is independent. A mix that matches no preset is a custom game and is just as valid.

| Axis | Options | What changes |
| --- | --- | --- |
| View | 2D, 3D | Which renderer draws. Nothing in the rules. |
| Camera | Close, Wide | Close follows the farmer. Wide frames the farm with pan and zoom. |
| Control | Walk, Point | Walk: move with keys, stick or a thumb pad, act on the tile in front. Point: tap or drag tiles to queue jobs and the farmer walks to them. |
| Clock | Day, Turns, Flow | Day: 6:00 to midnight in four real minutes, stamina, sleep to end the day. Turns: time waits, twelve moves a day, end the day when you like. Flow: a minute a day, pause and 1x, 2x, 4x, days roll on their own. |
| Soil | Classic, Synergy | Classic: watered today means it grows a day. Synergy: moisture lasts (0 to 3, minus one a night), nutrients drain and refill, neighbours set quality. |
| Goal | Market, Almanac, Orders | Market: stock sells overnight at fixed prices, buy fields and buildings, milestones. Almanac: ten-day seasons with three goals each, stars, and a pick of one new seed each season. Orders: stock is kept, town orders pay a premium before a deadline, selling floods the market and prices recover over days. |
| Weather | Calm, Wild | Calm: sun, cloud and the odd shower. Wild: a three-day forecast with rain, storms and heat, crows that eat crops, bugs that spread. |
| Crew | Solo, Crew | Crew: farmhands from the bunkhouse harvest, replant, water, pick bugs and chase crows, and take jobs you paint. Wages each night. |
| Tools | Kit, Smart | Kit: hoe, can, seeds, hands, build. Smart: one action that harvests, waters, plants, tills, tends or scares as the tile needs. |

## Shared rules

- The farm is 20 by 15 tiles. Six fields of 4 by 4. The first is owned and tilled; the rest are bought from the notice board. A new field starts as meadow and needs tilling once. Tilled soil stays tilled.
- Eight crops. Seeds are paid for when planted. Harvests go to stock, then to the crate.
- Classic growth: a crop grows one day each night it was watered that day. Three dry nights in a row and it withers. Ripe crops wait and never wither.
- Synergy growth: a crop grows if moisture at nightfall meets its thirst (1, lettuce 2). Moisture drops by one each night, two in a heat wave. Quality from 0 to 3 is shown while it grows: +1 a companion next door, +1 a sunflower next door (bees), +1 rich soil (nutrient 2 or more), minus 1 spent soil (0), minus 1 crowded by two or more of the same crop, minus 1 if it ever went thirsty. Quality multiplies the price by 1, 1.25, 1.5 or 2. Harvests use nutrient; beans put it back on their tile and the four around it; empty soil recovers slowly.
- Rain waters every plot. Sprinklers water the 3 by 3 around them each morning. Scarecrows keep crows off everything within three tiles.
- Crows land on unprotected crops. Walk near one or tap it to scare it. Left alone, it eats the crop after two game hours (turns: at nightfall).
- Bugs appear on a few growing crops each wild morning and spread to the same crop next door. Bugged crops stop growing and die after four nights. Tend to pick them off.

## Switching

A switch never loses progress, moves the farmer into a wall, or strands a job.

- Day to Turns: moves left = the smaller share of time or stamina left. Turns to Day: the clock jumps to match moves used, stamina matches moves left. Flow keeps the clock where it is.
- Classic to Synergy: watered plots read as moist. Synergy to Classic: moist plots read as watered today.
- Crew off: hands go into the bunkhouse, their jobs go back on the board, no wages. Crew on: the first time, one hand joins for free.
- Wild to Calm: crows fly off and bugs go.
- Point to Walk: the farmer drops queued jobs (hands keep theirs under Crew).
- Almanac starts at the current season the first time it is switched on, with every crop already in the ground unlocked.

## Feedback for the designer

The mixer shows how long has been spent in each option, and a notes box stamped with the current mix. This is the lab: the game exists to find the best mix.

## Crop art

Each crop has its own small drawing (`src/ui/crops-art.ts`): brown ink outlines, flat fills, one highlight and a darker line for the detail, on a 32 grid so it reads at 16 px and stays crisp at 44. It stands in everywhere a crop is named in the interface: the seed picker, the chosen seed on the Seeds tool, request notes, the board's Seeds tab, the stock list and draft cards. No crop is a coloured dot any more.

