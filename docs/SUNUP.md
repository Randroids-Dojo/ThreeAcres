# Sunup: design

Sunup is the homestead life sim. It runs on the farm simulation in `src/sim` under one fixed set of rules (the Sunup preset), drawn by the 3D diorama renderer. The sections below describe the simulation as first built with its switchable axes; only the Sunup values apply now, and the other axes stay in the simulation only because its tests exercise them.

Three farming games share one farm. The player can change any rule at any moment and keep playing the same farm. The point is to find out which farming game is the most fun by playing them, and the mixes between them.

## Sunup as it plays now

What follows the playtest of Spring 1 to Autumn 1 on a phone (and a 40-day bot farm). These rules hold only under Sunup's rules (`homestead(s)` in `src/sim/actions.ts`); the other rule sets keep the older behaviour their tests check.

**The day.** 6:00 to midnight in 150 real seconds (it was 240). Stamina is 100 and the jobs cost less: harvest, water, plant and pick off bugs 1 each, hoe and build 2, clearing a withered crop nothing. On a grown farm a busy day at a person's pace now runs into the afternoon or evening, and stamina runs out first on a few days a month instead of by 8 am. Sleeping before noon asks first ("Sleep now?"), except while the first lesson teaches it and when stamina is nearly gone.

**Soil and water.** A full watering keeps a plot wet for two days (one in a heat wave). The can's water is always on the can: a level up the side of the tool on the rack, and a gauge on the act button while it is in hand. Empty, both say Empty, and the line "Can empty. Fill the can at the well." points at the well. The upgraded cans and hoes are judged by their whole reach: aimed at a wet plot, the gold can still waters the dry ones around it (and wastes no water on wet ones), and the faint frames of its reach show where it will work.

**Seasons.** In the last three days of a season the seed picker also offers the next season's crops, marked "Summer crop" (and so on); they grow on and are in season when it turns. Crops that would still be green at the turn and do not grow in the next season are marked "Too late" and cannot be sown. At the turn, ripe crops stay to be picked (a regrowing one gives its last pick and is done); what the turn takes is simply gone, nothing withered to clear. Any withered crop left alone is gone the next morning. If a farm ever has nothing growing, nothing in the crate and too few coins for any seed, a neighbour leaves enough for four packets of the cheapest.

**Requests** are the backbone of a day. The first is three radishes. Each is for a crop that can be grown and handed over in time (from seed today or already in the ground), is never due after its crop's season ends, and is sized to the farm. One at a time until the first is filled, then two, then three from reputation 4; a filled one is replaced at once. What an open request still needs stays in the crate overnight instead of being sold. The board's Requests tab says how far the town's good word is from the smith's next tool ("Two more and the smith makes you a copper hoe"); the smith wants reputation 2 and 8 for the hoes, 3 and 10 for the cans. A harvest a request wants floats "2 of 3 for Mabel's bakery" where it was picked, and the morning card names who paid and what was kept.

**Aiming.** A faint frame always marks the plot in front, so you can see what you face; it brightens, with the verb's badge, where acting would do something. When the plot in front has nothing to do, acting snaps to the nearest useful plot in reach (your own and the eight around it, ties to the one most ahead), so holding Harvest along a row works every plot in turn, and the well answers from any side or corner. Facing the notice board reads it; otherwise the farm's own choice comes first and the board only when nothing else in reach is useful. Tapping a plot walks there and does the job; a quick tap on the walk stick's zone counts as a tap on the farm under it. The act button always says a verb: Harvest, Water, Plant, Hoe, Fill the can, Read, Shoo, and Pick for bugs.

**The phone camera.** A tall screen looks down at 70 degrees and fits the farm's whole depth, from the back trees to the front hedge, between the day card and the tool rack, with 10 to 12 columns (42 px tiles on a 412 by 900 phone). It slides sideways with the farmer only as far as the farm's edges and keeps still up and down; the desktop close camera keeps to the farm's edges the same way. `tests/homestead-camera.test.ts` measures it: on 412 by 838 and 900 the clear band is at least 85% farm with all fifteen rows (it was about half, and eight rows), and no sky shows below the day card. Off-screen lesson targets get the edge chevron.

**The farm.** Solo, so the old crew mode's bunkhouse is not built (its ground is open yard) and only the working well is drawn. Ripe crops sit in a soft gold ring on the soil. Bugged crops yellow and their bugs are big enough to see on a phone.

**The board and the HUD.** Stamps are sentence case (Buy, Use, In hand); what you cannot afford is a dashed, upright "Need 400". A field or a smith's tool asks before it buys. The board hangs from a fixed top so its tabs never move, and they stay on one row on a phone. Toasts show over an open board, just under it. The seed picker shows each seed's price, what it sells for, and its days (or its season, or Too late), wraps onto two rows rather than scrolling seeds away, and opens up top when the plot being worked is low on the screen. The stamina bar is labelled, and the forecast reads "Sunny then" followed by the next three days.

## The lessons now

One line at a time, eight words or fewer, in the words on the buttons. Lines about a place point at it.

| Lesson | Line | Points at |
| --- | --- | --- |
| pull | Tap a radish to harvest it. (keys: Walk to a radish. Space harvests it.) | the nearest ripe radish |
| water | Take the can. Water the carrots. | a thirsty carrot |
| well | Fill the can at the well. | the well |
| sleep | Crops grow overnight. Sleep. | |
| broke | No coins yet. Sleep to sell the crate. | |
| plant | Plant seeds in the bare soil. | the nearest bare plot |
| hoe (cuts in) | Hoe the new field. | the new field's nearest meadow |
| requests | Read the board. | the notice board |
| deliver | Harvest 3 radishes. The crate ships them. | the crate |
| field | Buy a second field. | the field for sale |
| pests (cuts in) | A crow is on your carrots. Shoo it. | the crow |
| scarecrow | Scarecrows keep crows away. Build one. (They cost 40, when you cannot pay.) | |
| bugs (cuts in) | Bugs on your carrots. Pick them off. | the bugged crop |
| turn | Spring ends soon. Plant summer seeds. | |
| smith | The smith has better tools now. | |

Owning a second field always brings the hoe and its line, however the field was bought (the board, or tapping the field); an old save with two fields gets the hoe when it loads. Bugs, like crows, come quietly from day 5 and the bug line shows only while a bug is really there. `scripts/qa/lessons.mjs` plays all of it on a phone with real touch.

## Balance

`npx tsx scripts/balance.ts` plays six farms for thirty days with the quick bot and again at a person's pace (about one action every 1.3 seconds). Before the playtest fixes, then after (person's pace in brackets):

| | Before | After |
| --- | --- | --- |
| Waterings per harvest | 6.73 | 2.24 (2.09) |
| Nights with no income, of 30 | 14.8 | 6.5 (6.2), mostly nights 2 and 3 |
| Coins by day 31 | 989 | 7,891 (8,598) |
| Crops lost to drought, bugs or the turn | 46.3 | 8.3 (8.7) |
| Requests filled | 3.2 | 28.8 (27.7) |
| Day ends, median | 7:49 | 9:06 (10:10), busy days to 15:42 (17:30) |
| Days stamina ran out first | 10.5 | 3.7 (4.5) |

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

## Crows and bugs in the lessons

Crows are let onto the farm quietly from day 5, once delivering requests is known; they come on a dry day when something is growing. The crow lesson waits for a real crow: it takes the line from whatever calm lesson is up (a crow will not wait), says "A crow is on your carrots. Shoo it." (naming the crop it is on), and points at it, with a cream chevron bobbing over the crow or sitting on the screen's edge, turned towards it, while it is out of view. It ends when the crow is shooed or flies off, then "Scarecrows keep crows away. Build one." shows for a few seconds (or "They cost 40." to a farmer who cannot pay) and the calm lesson comes back. Bugs work the same way: "Bugs on your carrots. Pick them off." while bugs are really on a crop, with the chevron on it, until they are picked (the act button says Pick). `scripts/qa/lessons.mjs` checks all of it with a crow and bugs on real crops.

## Crop art

Each crop has its own small drawing (`src/ui/crops-art.ts`): brown ink outlines, flat fills, one highlight and a darker line for the detail, on a 32 grid so it reads at 16 px and stays crisp at 44. It stands in everywhere a crop is named in the interface: the seed picker, the chosen seed on the Seeds tool, request notes, the board's Seeds tab, the stock list and draft cards. No crop is a coloured dot any more.

