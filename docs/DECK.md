# Seedbound: design

A roguelike deckbuilder about one small plot and a run of seasons. Original rules, cards and art, in the genre of deckbuilders where scoring combos is the thrill.

**The fantasy:** a seed tin of cards and a four by four plot. Each day you draw a hand, plant seeds, set up companions beside each other, and hurry crops along with the watering can and the weather. At the end of the day the ripe crops are harvested one by one in a cascade, each paying its yield times its bloom. Each season sets a quota. Beat it, spend your coins on new cards and almanac pages, and face a bigger quota. Miss it and the run is over; meet every quota to the third winter and the run is won.

**Show, do not tell.** Every rule a crop has is about what stands next to it, so the board can show it. Card faces carry pictures, not sentences. While a card is held the plot previews what it would do, on the night it would actually be pulled; at night each bonus flies from the crop that gave it. Notes say what to do next in eight words or fewer, never how a rule works.

**The plot persists.** The start deck's core stands for days: beans and a strawberry pick night after night, and the sunflower is the tall crop the lettuce wants. What you sow today has to fit what already stands, and when each crop will be pulled matters as much as where it goes. The plot carries over from season to season too, so a season starts on the garden the last one left, not on bare soil.

**Words and pictures the player sees:** a harvest pays **yield × bloom**. Yield is a number by a wicker basket; bloom is a red number by a red flower. A night is a moon. What a card costs is printed as **seed scoops**, the same scoops that sit on the bench; a free card says Free. Seeds cost from nothing to three scoops by how strong they are. The word "energy" is never shown.

**Every day is a budget and a placement.** The third playtest scored the game 5 of 10: past the guided season every seed cost one scoop and the can was free, so each day was "plant any three" on a plot that peaked at about 8 of 16, and the answer was always "next to the sunflower". Now seeds are priced by power (free radishes, dear corn and pumpkins), every crop pulled up puts a scoop back on the next morning's bench, and the sunflower blooms only the crop below it. A day's hand costs more than the bench holds on about 45% of dawns, the plot fills further, and roots, bloom and the bot's mixed buying each clear year 2 about 40 to 55% of the time (see Balance, round 3). The code keeps the names `chips`, `mult` and `energy`, and the audio cues stay `deck.chip` and `deck.mult`.

**A run has a finish line.** The fourth playtest scored the first quarter hour 7 of 10 and the game 6: year 1 had become a real puzzle, but strong runs never ended (a roots run was at 1.5 times the quota in year 4 summer with 5,113 coins it could not spend) and giving up erased them. Now a run is three years: meet the last winter and the run is won, with its own page and a count of wins. Years 2 and 3 are set against the strong builds, so a run that clears year 2 no longer all but surely clears year 3; the Root Cellar pairs radishes with carrots instead of counting every root, and Busy Bees is a x1.5. Giving up ends the run the way a missed quota does. See Balance, round 4.

**Every season a twist, every surplus a buffer, every win its own page.** The fifth playtest scored the first quarter hour 7 of 10 and the game 6: "Year 1 is a real puzzle. Year 2 is a coin flip on the draw. Year 3 is a victory lap, run after run on the same 23 cards." Every day came down to one improved carrot ringed by radishes with a sunflower above it and chilies beside it. Now from year 2 each stall offers two twists for the season ahead (frost on the bottom row, a buyer for one crop, sunflowers facing up, crows twice as often...), and the one picked holds all season, on the board and in the previews. A quarter of each season's surplus carries into the next one. Year 3 asks at least 0.95 times what the run itself took in year 2 autumn and winter, and the run ends the night its last quota is met, on a page of its own. See Balance, round 5.

**Every twist a trade, every quota fixed.** The sixth playtest scored the first quarter hour 7 of 10 and the game 6: "I would start another run for year 1, not for years 2 and 3... the middle has no tension and the end comes down to luck." Every hitch gave nothing back, so the help was picked nine times of nine; year 3 was set from the run's own year 2, so a strong year 2 pushed every year 3 quota to a flat 1,550 and holding back paid; the guided run's summer asked 230 after a spring of 70 and ended the run in its first season on its own. Now a hitch takes its share off the season's quota ("Summer asks 590, not 660."), so which twist is worth more depends on the deck and the plot; year 3 is a fixed row that grows through the year and nothing the run earns raises a quota; the guided summer asks 180; and the stall sells a scoop only to a bench that ran short. See Balance, round 6.

**An engine for every run, twists aimed at it.** The seventh playtest scored the first quarter hour 7 of 10 and the game 5: "Year 2 is either a walkover (with beehives) or a wall (without them). There's one way to win, and the twists don't change play. I'd start another run only to chase beehives." With beehives and Busy Bees nights paid 150 to 320, without them 60 to 110, and the beehive was a rare roll at the stall; the twists were coupons ("sunflowers face up" with no sunflower planted, crows with a scarecrow standing, each 60 to 70 off the quota for free). Now every run's first stall offers three of four engines, each a card and the page that multiplies it, free (a beehive and Busy Bees, two chilies and Hot Beds, beans and Trellis, two corn and Tall Rows), and the stall keeps the engine's cards in stock; the beehive's pull is cut (one hive's bloom at most, Busy Bees x1.3 and only near a hive). Each twist is aimed at what the season just played relied on (a glut of its top crop, frost on the row it sowed most, the page that added most resting) and says so ("Your carrots sell for half.", "Frost on your carrots' row."); a hitch takes off what it would cost this run, one that would miss the build is never offered, and the help beside it is priced from the plot and paired by worth. See Balance, round 7.

**Engines that grow, a year 1 that starts fair, twists you can weigh.** The eighth playtest scored the first quarter hour 7 of 10 and the game 5: "Each engine gives a run one season of character. After that every board is carrot, radish and beans around the engine piece." Every run died with 1,979 to 5,711 coins unspent (the scoop refused, the page slot at 4,000, year 3 takes flat while the quotas climbed); with an engine year 1 was free (the bees took 721 against 320) and then one bad season ended the run; the help showed no number beside the hitch's; the spent heap never came to a returning player's table. Now the engine's page levels up at the stall from year 2 (Busy Bees II and III, Hot Beds II, Trellis II, Tall Rows II), each level said in the page's own words ("Crops near a beehive get x1.6 bloom, not x1.2."); year 1 asks more from summer and the engines start gentler (Busy Bees x1.2, one corn with Tall Rows; Hot Beds, the slow starter, comes with four chilies); years 2 and 3 climb to meet the levels. Both twists say in coins what they would do ("About 320 more coins.", "About 300 fewer coins."), and a hitch takes off what it would cost a careful player plus what the help beside it would bring, so the two weigh the same by the rules' estimate. Nothing the last stall offered is aimed the same way again, a page rests only if it is the run's own engine's, and a scarecrow in the tin keeps crows off the offer. A returning player has the whole table from the first dawn, the spent heap is also taught on a hand stuck with cards too dear today, and the first stall shows only its three engines, large, under "Pick one to take home, free." See Balance, round 8.

**Four engines on offer, none that decides the run, and a first quarter hour with a real choice.** The ninth playtest scored the first quarter hour 7 of 10 (engagement 6: "spring is set hands, so there are no real decisions until summer") and the game 5. The engine a run was handed decided it: the tall run took 618 against 360 in year 1 summer and won with 8,908 coins unspent, corn making 71% of the take; the hot run's best harvest was 42 and it died in year 1 autumn; two of the runs were never offered the bees. A run died on the draw before any engine (no carrot in the first two hands); the crow lesson said "Your scarecrow keeps watch." while the carrot on D4 sat outside it; the reason line named crops the aimed seed had nothing to do with. Now the first stall offers all four engines; Hot Beds gives a chili's neighbours x1.6 bloom from level I and its levels raise that, not its picks; Tall Rows brings two corn and climbs gently (+1.5, +1.8, +2.1); every engine page has a level IV for the late coins. A run's first hand is dealt a carrot and a radish, and the first spring asks 160. The guided day 3 deals a radish or a carrot, one of the two, and the previews show the trade. The crow lesson names the ripe crops outside the scarecrow's ground and the plate washes that ground while a crow is about; previews grey a bonus from a crop the crow may take first; the reason line speaks only for the aimed plot. A hitch's cut is never clipped, a help is worth 8% or more, and a hitch is seldom aimed as either of the last two stalls aimed one. See Balance, round 9.

**Each engine its own garden, twists that cost what they cut, a climb with no wall.** The tenth playtest found no P0 or P1 for the first time and scored the first quarter hour 7 of 10 and the game 5.5: "I'd start another run for year 1. I wouldn't play a full three years twice: every board is the same carrot ring, the twists are free discounts, and year 3 comes down to the draw." The beans run took its coins from radishes (3,349) and carrots (3,303), not beans (1,064); the hitch was the pick at all nine stalls ("Frost on your radishes' row. About 110 fewer coins." cut a summer from 1,030 to 750 and cost nothing); year 2 ran at 1.3 to 2.1 times its quotas and year 3 autumn was the wall. Now no engine page works on radishes and carrots, so each engine wants its own layout and its own crops take the most in nearly every season (see Engines); the tall engine brings three corn. A hitch is never aimed at a free crop, frost is priced by the room the rest of the plot has, the quota comes down by what a hitch costs and a little more, and both twists are said in coins of the take the run is making. Years 2 and 3 are refitted so each season asks about the same share of its take. A seed that ripens next season says so first, on a pale slip. The ledger says what is still to go from day 4, and the first spring asks 150. See Balance, round 10.

## Run structure

- **Run:** three years, twelve seasons. The last winter (year 3) is the finish line: meet it and the run is won (`TUNING.years`), **the night it is met**: the days left are not played (the playtest's winning run stood at 959 of 960 after day 4, and days 5 and 6 were busywork). The stall before it points "On to the last winter", the almanac says "Season 7 of 12", and a note at its first dawn says "The last winter: meet it to win."
  - Why three: on the committed round 3 build the strong builds' engines were built by the end of year 3 (pages full, three or four scoops bought) and took about the same from then on (a roots build took a median 1,393 a season in year 3, 1,384 in year 4, 1,394 in year 5) while their unspent coins doubled every year (3,183, 6,530, 11,748).
- **Year:** 4 seasons of 6 days each.
- **Quotas:** coins earned within the season.
  - Year 1: spring 150, summer 410, autumn 540, winter 680 (160, 380, 500, 640 before round 10; 170, 360, 480, 590 before round 9; 320, 400, 470 before round 8; 260, 300, 350 before round 7).
  - Year 2: spring 880, summer 1,090, autumn 1,250, winter 1,540 (840, 1,030, 1,200, 1,370 before round 10; 730, 920, 1,080, 1,220 before round 9; 540, 860, 1,060, 1,200 before round 8; 430, 620, 740, 830 before round 7; 600, 710, 790 from summer before round 6).
  - Year 3: spring 1,700, summer 1,860, autumn 2,020, winter 2,250 (1,560, 1,760, 1,940, 2,000 before round 10; 1,440, 1,640, 1,820, 2,000 before round 9; 1,250, 1,350, 1,450, 1,550 before round 8; 900, 980, 1,060, 1,140 before round 7). **Round 9: no engine runs away.** Every engine is on offer and their starts are evened, so year 1 from summer and years 2 and 3 rise until no engine's median season runs past about 1.6 times its quota, and year 2 spring asks up to a third more than year 1 winter (a quarter before: the stall before it brings the engine's level II and the first twist, and every bot took 1.55 to 1.76 times it). See Balance, round 9. **Round 8: a curve that rises with the run.** With an engine year 1 was a walkover (the bot took a median 1.62 times its quotas with bees, 1.65 with corn) and year 2 spring asked less than year 1 winter's take (1.85 times), then year 2 summer to winter were the wall (the decent bot met them 87, 78 and 82% of the time) and year 3 eased. Now year 1 asks more from summer, the engines start gentler, year 2 spring asks a quarter more than year 1 winter (the most a year's turn steps), and years 2 and 3 climb a step each season to meet the engine page's levels (priced with deck-fit against the four engines and the bots; see Balance, round 8). Round 7 raised every row from summer of year 1, since every run now takes an engine at its first stall: priced with deck-fit against the four engines, each wins 31 to 40% at these rows (see Balance, round 7). **A fixed row, the same for every run: nothing the run earns moves a quota.** Round 5 set year 3 at least 0.95 times the run's own year 2 autumn and winter: the sixth playtest's year 2 took 1,064, 1,788 and 2,311 and every year 3 quota went to a flat 1,550 ("Spring asks 1550", up from 630, with no reason given), and every extra coin in year 2 raised next year's quotas, so holding back paid. Each year has its own row: with scoops coming back from pulled crops, takes rise fast through year 1 and flatten through year 3. Rounded to a 5 (under 100) or a 10.
  - **A hitch takes its share off its season's quota** (see The season's twist); Cold Frame takes a fifth off a winter.
  - **Round 9: the guided year without a walkover in it.** Its spring asks 75 (90 before), since day 3 deals a radish or a carrot, not both (see Teaching); its summer 330 (240: the ninth playtest took 457 of 240 and met it on night 3, and the careful line took a median 1.82 times it); its autumn and winter 0.88 of the raised row, 440 and 560 (420 and 520). Tighter, at 340 and 0.92, every season fell to 1.27 to 1.42 times its quota for the bots but the guided bot cleared year 1 only 76% of the time. See Balance, round 9.
  - A new player's first run (the guided one) has its own spring quota of 90 (`TUNING.guidedQuota`; 70 until round 7, met on day 5 every time, so day 6 did nothing: the bot took 85 to 89 by day 5, the seventh playtest 88; at 90 the careful line, 89 by day 5, meets it on the last night with day 6's second radish), since its days are set hands, **its own summer of 240** (`TUNING.guidedSummer`; 180 in round 6, raised in round 7 since the guided run now takes an engine at its first stall and the bot took a median 2.3 times 180), and the rest of its year 1 at 88% of the usual, because its first stall had fewer coins to spend. The summer was 230 (88% of 260): a cliff from 70 with set hands, the tightest season of year 1 for the guided bot (a median take of 1.19 times it, against 1.40 to 1.59 for the rest), and the sixth playtest missed it by 5 playing carefully with every preview. Its year 2 asks 93% of the usual (`TUNING.guidedYear2`: 680, 860, 1,000, 1,130 since round 8; 400, 580, 690, 770 at first, about round 5's row): at round 6's raised row the guided bot cleared year 2 22% of the time against the decent bot's 30%. (Its year 2 was at 88% until round 5, then at the full rate.)
  - **The first run after the guided one** has a softer first spring, 120 (`TUNING.softSpring`): the same start deck went from a quota of 70 to 170, and three of the playtester's springs outside the guided run took 225, 151 (dead) and 178.
  - Round 6 raised year 2 from summer and fixed year 3 (see Balance, round 6). Round 5 raised years 2 and 3 by about a fifth: the twists (a boon is usually picked) and the carry lifted every player's clear rates (decent bot, year 2: 26% to 63% at the old row).
  - Round 4: years 2 and 3 were 400 to 600 and 600 to 740, and the strong builds took 1.8 to 2.5 times them; they are now set against those builds (see Balance, round 4).
  - History: the first draft (60, 130, 240, 380, times 2.4 a year) assumed faster growth than the cards gave; then 40, 55, 65, 80 times 1.75 for the watering rules; then 55, 70, 75, 95 times 2 once crops grew on their own. That last set let a decent bot clear year 1 spring every time at 1.78 times the quota on a board wiped bare most dawns. With the standing start deck the take per card rose (perennials give several harvests per card), so the quotas were refitted for tension (year 1 160, 165, 185, 220; year 2 230, 265, 340, 370; then times 1.45). The second playtest ran year 1 summer to winter at 1.4 to 1.55 times those, and the plot carrying over lifted takes by a further quarter to a third, so year 1 summer to winter rose 24 to 32% and years 2 and 3 were refitted. The third round's economy (scoops back, fuller plots) lifted year 1's takes by a quarter and flattened year 3's, so all three rows were refitted again from deck-tune: see Balance.
- **Money:** coins are both score and money. They carry over between seasons and are spent in the shop. Spending never counts against a quota.
- **Carry:** a quarter of the surplus of a season met is carried into the next season's take (`TUNING.carryShare`), at most a quarter of the next quota (`carryCap`). The next season's pegboard starts there and its ledger counts it; it is credit against the quota, not coins. The stall says "Winter: 412 of 350. Spring starts with 16." (round 7; it said "16 carries over.", never explained) and the next dawn "16 carried over from winter." Why: runs died from the draw, not decisions (817 of 440, then 463 of 510; 700 of 420, then 460 of 500), and a big surplus counted for nothing. Both of those now clear. Priced without the carry, the strong builds win about half as often.
- **Season end:** the cards come home: the hand and the spent heap go back in the tin, which is shuffled at the next dawn. The plot is not cleared: crops still growing, perennials with picks left, and scarecrows and beehives stand into the next season (their pests too), through the year's turn as well. An object's card stays out on its plot. If the season's earnings reached the quota, the season is cleared and the shop opens. If not, the run ends.
  - Why: the second playtest's biggest wish. Every season started on a bare plot, so days 1 and 2 of a season paid about 0 to 30 and the first days were spent rebuilding. Within the fiction a season's turn is a night like any other in the garden. Now a decent bot finds 3 to 5 crops standing at a season's first dawn in year 1 (none before) and takes 34 to 51 on its first night (7 to 12 before).
  - A seed sown too late to ripen this season is no longer dead: it is picked next season and counts for that season's quota. Its preview says so (see Previews are timed). That answers the playtest's "three-night seeds are dead from day 5" without sending late seeds back to the tin.
- **Run end:** an almanac entry for the run: each season's take against its quota, the best single harvest, the coins taken in all, the harvest count, and the new cards unlocked. A run ends three ways, and each is recorded the same way (its seasons count for the catalogue, its best harvest and coins for the record):
  - **Won:** the last winter met. A won run has its own page, not the loss ledger with a seal: at the top the red wax seal and "The run is won", "Three years on the kitchen plot, every quota met. The last winter was met on day 5.", and three numbers (coins in all, seasons met, harvests); then the best harvest with its card; "The build that won": the three crops that took the most with their share (`stats.byKind`) and the pages kept; "Runs won": wins of runs finished and the most a won run took, with the last few wins listed (`meta.winLog`: "Run 4: 18,400 coins, carrots and radishes."); then the season by season account with each season's twist. It used to be the loss ledger plus a seal, the summary below the fold. The almanac's foot lists runs won with runs finished.
  - **A season missed:** "Short by 40. The run ends here." Round 8: each season's line in the loss ledger ends with its twist ("Met. Your carrots sell for half."), as the won page lists them.
  - **Given up** (from the almanac, two taps): the season so far goes in the log, "Given up on day 3." (or "Given up at the stall."). Giving up used to start a new run and record nothing: two runs of 13 and 8 seasons left the count of seasons at 4, unlocked nothing, showed no entry and kept a best harvest of 108 although one run had 180.
- **Meta progression (light):** a pool of cards starts locked. They unlock by seasons met, counted across every run, never by finishing runs: 1, 3, 5, 8 and 12 seasons met in all unlock the next pair in a fixed order (beehive and chili, corn and wheat, pumpkin and shears, mint and trowel, then storm). Six empty days unlock nothing. The run's end says how many more seasons, in any run, add to the catalogue ("Meet two more seasons, in any run, to add to it."). The best record (most seasons, best harvest, most coins) is kept with the run in the same save.
  - Why across runs: the third playtest's runs 2 to 4 each met one to four seasons and all ended "The catalogue holds nothing new", because the next pair needed five seasons met in one run. Counted across runs, a run of four seasons, then three, then three unlocks two pairs, then one, then one. A save from before counts its best run as its total.
  - The unlocks run out on purpose: after twelve seasons met a player has the whole catalogue. After that a run's growth comes from the stall: pages, page slots, scoops, improving and throwing out.

## A day

1. Draw up to 5 cards (hand size 5). A run's first hand is dealt a carrot and a radish from the tin first (round 9, `TUNING.firstHand`; not the guided run, whose days are set): the ninth playtest's run 4 drew no carrot in its first two hands and its spring ended at 146 of 170. Round 10: the first spring asks 150 (160), since the tenth playtest's no-engine run ended it 158 of 160 before making a choice. The three seed scoops on the bench refill (`energy` in the code), and the bench holds one more for each crop pulled up in the night, two at most (`saved`, then `bench` for the day's total).
2. Play cards, each costing the scoops printed on it: nothing to three. Unplayed cards are kept in hand. Excess over the hand size is discarded at the end of the day, oldest first.
3. Once a day you may toss a card from hand onto the spent heap and draw a fresh one. This keeps a hand of unplayable cards (a full plot, nothing affordable) from locking a run.
4. Blow out the lantern (End day). Then, in order:
   1. Weather resolves. A storm flattens one random crop.
   2. Every crop grows one night on its own, plus one for each rain, two for each storm, and one for a watering can on its plot today. Pests no longer stop a crop growing. There is no wet or dry soil.
   3. If a crow sat on the bed at dawn, it takes one ripe crop that no scarecrow guards. A perennial loses that night's pick: nothing is paid for it that night (round 7; it used to use up a later pick and let that night's pay in full).
   4. Every ripe crop is harvested in reading order (top left first) with the scoring cascade; a crop with pests on it pays half. The order paces the show; only Market Day reads it, and its stamp shows which crop it doubles. Perennials stay in their plot for their remaining picks; other crops leave theirs empty, and each crop pulled up puts a scoop back for the morning (two a night at most; a strawberry puts one back with every pick). A crop a crow takes or a storm flattens puts none back.
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
- **Market Day shows.** With Market Day kept, tonight's fifth (tenth, fifteenth) crop in reading order wears a red-ringed ×2 stamp by its moon, and the previews and readings count it, on whatever night a crop is pulled (`harvestIndex` in `preview.ts`). While a card is aimed, the stamp shows where it would fall after the play, so a radish that would come in first moves it; neighbours' chips never show a ×2 or ×0.5 for the move. It used to depend on reading order nobody could see: a plot read "pays 18" and paid 36.
- **The last winter** carries nothing over: a seed that would ripen after its last night previews no slip, only "Too late to ripen before the end.", and its reading says "too late to ripen".
- **Previews are timed.** A bonus only counts if the crop giving it still stands on the night the other is pulled. The forecast (`forecast` in `board.ts`) runs calm nights forward, past the season's end since the plot carries over: each crop's next pick, and the night it leaves. A radish beside a carrot that ripens tomorrow shows its own +2 (the carrot stands tonight) and the carrot's +1 bloom greyed and struck, with "The radish is pulled before the carrot ripens." A seed that ripens after the season's last night previews what it will pay then on a pale slip with a dashed edge and grey ink, with "Ripens next season." (it counts toward next season's quota). Round 10: that line comes first, before any lost bonus (the tenth playtest's corn on autumn day 6 previewed "12 x 3.2 = 38" with "The beans are pulled before the corn ripens.", and the run ended that night without it), and the slip is pale, not a shade off tonight's dark one (deck-overlap reads its luminance against the same corn on day 1). The old struck "too late" preview went with the cleared plot.
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
| Mint | 1 | 2 | 2 | Free crops: each night it spreads to a bare plot beside it (its card gave no reason to want it) |
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
| Beehive | 2 | Object: crops in the 3 by 3 around it get +1 bloom (from one hive at most, `TUNING.hiveCap`: round 7, hives stacked without end) |

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

The stall calls it improving a card. An improved seed gets +50% base yield, rounded up (the improve sheet says "basket 5 to 8", and with the Root Cellar kept "basket 7 to 10" for a carrot, as its face prints the +2). Upgraded tools, weather and objects cost 1 less, so an improved Watering Can is free. The two free cards gain a rule instead: Trowel moves to any empty plot, Ladybirds also draw a card. On the plot an improved crop wears a plant label on a stake by it, a cream disc ringed red with a red star, 14 px or more across (it used to be a 6 by 3 px red bar that read as a glitch).

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
- **Twists move them:** a season of crows doubles the crow's chance (at most 90%); a calm season brings no new pests and lets none spread (those already on a crop count down as usual).
- **An answer in the stall, ahead of the hazard, one slot at most:** the stall before the first season that can bring pests stocks ladybirds or garlic, and the one before the first crow season a scarecrow; once a hazard has shown, a stall's first tray keeps stocking an answer while the deck holds too few (`ANSWERS_HELD`: one scarecrow, since it stands for the rest of the run; two cards for pests). With both hazards short, a hazard coming for the first time takes the slot, else one already met at random; fresh stock never forces one. The fourth playtest found a scarecrow at all four stalls of a run and on five of five fresh stock rolls, since each hazard took a slot of its own until two scarecrows were owned. (The scarecrow used to come only after the first crow, which lost the third playtest's guided run by 9.)

## The season's twist

From year 2 spring (`TUNING.twistFrom`), each stall offers two twists for the season ahead, one that helps and one that gets in the way, in a random order; pick one and it holds all season. Neither repeats the season just played.

**Round 7: both are aimed at this run and priced for it.** The rules keep a tally of each season as it is played (`Tally`: coins by crop, by the row a sown crop was pulled from, what each bonus added, what pests took, what good company and one more pick would have added), and the stall reads the season just played:

- **A hitch** is aimed at what the run relies on, and costs what it would cost this run if it played the season as it played the last (`hitchAims`). It takes exactly that share off the quota (`twistEase`, rounded to a whole percent, 5 to 35%, 45% since round 10; the clipping says "Summer asks 590, not 660."). A hitch that would cost under 6% (`minHit`) is never offered, nor one heavier than the most a quota is cut. The seventh playtest took "sunflowers face up" with no sunflower planted and crows with a scarecrow standing: each knocked 60 to 70 off for free.
- **A help** is priced from what the plot and the tin already hold (`boonAims`, scaled to what it brought when played ahead: `worthTimes`, from deck-twists). A help under 4% (`minWorth`) is not offered: the playtest's "buyer for sunflowers (yield 3) is close to worthless next to 60 off".
- **Paired by worth.** A careful player plays round part of a hitch (sows elsewhere under frost, grows another crop in a glut; `adapt`, measured: the decent bot pays about half of frost's expected cost, 60% of a glut's, nearly all of a page at rest). What is left of the cut is the hitch's worth, and the help offered beside it is the one nearest that worth (any within 3 points, at random), so which is better depends on the plot.

**Round 8: the two weigh the same, and both say so in coins.** The eighth playtest called the pick blind: the hitch said "Winter asks 730, not 1120." and the help said nothing, and the same save and dice went 534 of 730 with Trellis resting, 1,093 of 1,120 with the carrot buyer, 769 with no twist. Now:

- **Each says what it would do, the same short line on both clippings,** under its own line: "About 320 more coins." on the help, "About 300 fewer coins." on the hitch, above its trade line ("Winter asks 700, not 1120."). The number is the share the rules priced it by (`worth`, kept on the twist) times the season's quota, rounded (`twistCoins`, `twistNote`): for a help its estimate from the plot (`boonAims`), for a hitch what it would still cost a careful player (`hitchCost`: its expected cost times `adapt`).
- **A hitch takes off what it costs plus what the help would bring** (`hitchCut`): the help is drawn first (a kind at random, then one of that kind, among those worth `minWorth` or more and keeping the cut under `easeMax`), then the hitch's cut is its careful cost and the help's worth. By the rules' estimate the two are worth the same, so which is better depends on how the plot is played. Round 7 took a hitch's whole expected cost off: frost cut 25% and cost 10.5% played (deck-twists), a free cut.
- **Priced as they play** (deck-twists, round 7's build): frost's careful cost is 0.42 of its estimate (0.6), a page at rest 0.95 (0.85); a buyer brings 0.78 of its estimate (0.5), good company 1.35 (1.05), long picks 2 (1.4), sunflowers all round 0.19 (0.45: played they added 2.9% against 7% expected, so they are seldom offered now).
- **Never aimed the same way twice in a row** (`lastTwists`, `sameAim`): nothing the last stall offered comes again on the same crop, row or page, and a glut and a buyer never bounce on one crop (the playtest's carrots went glut, buyer, glut, buyer, and "Trellis rests" came up 6 times in 15 stalls).
- **A page rests only if it is the run's own engine's**, or a page no engine owns (Trellis rested in bee and corn runs that had bought it). **A scarecrow in the tin counts:** crows are not offered to a run that owns one, standing or not (the playtest was offered a crow every morning with one in the tin, and took 1,223 against 460).

**Round 9: the promise holds, the help is worth having, and a hitch seldom comes back.** The ninth playtest's corn run read "About 220 more coins" beside "About 320 fewer coins. Summer asks 600, not 920.": the cut had hit its cap (35%) and covered the hitch's cost but not the help's worth. Its hitches were frost on the corn row three times and a corn glut twice, and its helps coupons (buyers of sunflowers for 35 coins, lettuce for 50, radishes for 65). Now:

- **Only a pair whose cut fits** (`offerTwists`): a hitch is offered only with a help that keeps its cut (careful cost and the help's worth) within `easeMax`, so the cut is never clipped. If none fits, a help of the kind just played aimed elsewhere (a buyer of another crop) may stand in; if still none, the lightest hitch and the lightest help are offered with the cut in full, up to `easeHard` (70%; 2 of 109 stalls in a bot run, a tall run's Tall Rows resting).
- **Lighter hitches to choose from:** a glut can fall on the run's second or third crop and frost on its second or third row, not only the top one.
- **A help is worth 8% or more** (`minWorth`, 4% before).
- **No hitch aimed as either of the last two stalls aimed one** where any other pair can be weighed (`pastTwists`); frost on the same crop's row is the same hitch whichever row it is. The stall before last's may come back only when nothing else can (7 of 98 stalls in a bot run, against 15 of 102 before); never the last stall's (round 8).

**Round 10: a hitch costs about what it cuts.** The tenth playtest took the hitch at all nine stalls and the bots at 58 to 69%: "Frost on your radishes' row. About 110 fewer coins." cut a summer by 280 and cost nothing, since radishes are free and go anywhere (the beans run's hitches aimed at radishes at 5 of 7 stalls); deck-twists had frost cutting 348 coins and costing 158, a glut cutting 399 and costing 211. Now:

- **No hitch on a free crop** (`freeCrop`, `hitchAims`): no glut of radishes, no frost on a row that took half its coins or more from radishes; a frost names the row's paid crop.
- **Frost is priced by the room left** (`frostShare`): the plots left bare at dusk on the other rows (`Tally.empty`, `dusks`). With none, every sowing on the frosted row is lost and it costs about all its coins; with five or more bare plots about half. It was 0.42 of the row's coins, whatever the plot.
- **The cut is the cost and a little more** (`hitchCut`): what the hitch still costs a careful player and a quarter of the help's worth (`helpShare`; round 8 added all of it, so the cut ran about twice the cost).
- **Both said in coins of the take** (`takeRatio`, the last season's take over its quota, 1 to 1.6): a run taking 1.45 times its quota read "About 112 fewer coins." for a frost that cost 167. The hitch's and helps' multipliers (`adapt`, `worthTimes`) were set again against play ahead as the run plays (two plays deep, after the stall's shopping): what the clipping says is now within about a tenth of what it plays.
- **Paired to weigh the same** (`pairWorth`): with the cut near the cost, a big help beside a light hitch was the better pick every time, so a hitch too light for any help worth 8% stays off the offer if another can be weighed (`pairSpread`), and the help is one within `pairNear` of the worth that gives the same take over quota. If nothing fits, the lightest hitch by cost; a hitch fresh for two stalls unless its cut cannot be covered (Tall Rows resting, 65% of a season, asked a cut of 80%), and a help worth 8% even if the last stall offered it. The usual most a quota is cut is 45% (35%), since a cut is in coins of a take that can be 1.6 times its quota.

| Twist | Kind | Aimed at, and priced by | Line |
|---|---|---|---|
| Glut | in the way | the crop that took the most; half its coins | "Your carrots sell for half." (x0.5 bloom) |
| Frost | in the way | the row whose sown crops paid most, if not half in radishes (round 10); their coins, by the room elsewhere | "Frost on your carrots' row." (no sowing there; the clipping's little map and the board show the row) |
| Crows | in the way | only while the run owns no scarecrow (round 8: in the tin too); the extra crows (one every morning), each taking a crop of the mean pay | "A crow comes every morning." |
| Rest | in the way | the page whose bonuses added the most, the run's own engine page or one no engine owns (round 8); what it added | "Busy Bees rests this season." (the page does nothing) |
| Buyer | helps | any crop but the top one; double its coins | "A buyer pays double for your beans." (x2 bloom) |
| Good company | helps | a yield for each crop beside each harvest | "Crops get +1 yield for each crop beside them." |
| Calm | helps | what pests took (they press less than they seem) | "No new pests." (none land, none spread) |
| Long picks | helps | each perennial's last pick, once more | "Your beans and strawberries pick one more time." |
| Sunflowers all round | helps | what the sunflowers' bloom added | "Your sunflowers bloom every crop beside them." (+1 to each, the crop below still +2) |

- **Sunflowers facing up are no longer offered** (a save holding one plays it as before): played ahead they cost nothing, since the next sunflower is sown above instead (deck-twists: 17% expected, -3% played).
- **Crows come every morning** in a season of crows (round 6: twice as often, which cost the run a few coins and took 12% off).
- Each twist's picture: the glut's and buyer's crop and coin, frost on its own row of the little map with the crop beside it, a crow and a moon x6, a resting page crossed out.

Rounds 5 and 6 (before the aim): a buyer was for a crop owned but not leaned on, a glut the run's top crop, frost always the bottom row, a hitch took a fixed share off (frost and glut 15%, crows 12%, sunflowers up 10%).

- **At the stall** the two clippings sit under the stall's head, each its picture, its one line and (round 8) what it would do in coins, and the hitch a red line under it with the quota it would ask ("Summer asks 590, not 660."). On the phone the coins line is one line ("About 65 more coins."); a longer "Your carrots would pay about 320 more." took two and pushed the year's first stall into a scroll. A tap picks one (it is pinned, the other fades) and the head's "Summer asks" follows it; it can be changed until the stall is left. The way on asks for a pick first ("Pick one of the two for spring first."). The first time, the stall's lesson line says "Pick one of the two for spring."
- **On the table** the twist stays in the lesson strip all season whenever no lesson is up: its picture and "Summer: crows come twice as often." Frost paints the bottom row icy with rime, and a held seed's dashed plots leave it out; a tap there says "Frost: nothing grows there now." A buyer's crops wear a gold coin marked 2, a glut's a grey one marked ½. The almanac lists it under the season line, and the run's account by season.
- **In the previews** the rules score the twist, so every chip, total and reading counts it: a buyer's carrot previews double, good company shows +1 on each neighbour pulled the same night, frost plots are never offered. A pick that falls next season leaves this season's twist out (next season's is not chosen yet). A buyer's and a glut's multiplier count as part of the crop, like the Root Cellar's yield, not as a bonus from the plot aimed at.
- **The twists push away from the run's own solve:** a glut hits the crop that took the most last season, frost the row it sowed most, a rest the page that added most; a buyer pays for another crop the run grows.
- Why: the playtester's top fun change: it breaks the one solve, makes each run different, and gives year 3 a fight. Measured honestly it moves win rates far more than it moves the bot's patterns: the best harvest's recipe changes from one season to the next 3 to 9 points more often with twists than without for most builds (roots builds that own only carrots and radishes cannot change their top crop at all), while the strong builds win 1 to 47% without twists (most under 20%) and 12 to 56% with them (see Balance, round 5).
- The balance bot picks by playing the coming season ahead on a copy of the run with each twist (`twistWorth` in `bot.ts`: a one-play-deep bot, two samples, the same dice for both twists) and taking the one whose take over its quota is higher, capped at 1.6 times (a bigger surplus carries no more). Round 5 scored every help above every hitch with a rough worth to its deck. Its days play to the twist on their own, since every play is scored by the rules.

## The shop (the seed merchant's stall)

The shop opens between seasons.
- **Cards:** 4 cards from the run's pool: always at least one seed, at least one uncommon or rare, one slot at most for a hazard's answer (above), the rest at random by rarity, and cards the last tray showed only when nothing else is left (one tray in eight repeated the one before by chance; now about one in twenty). Laid out a little larger the rarer they are, each with a price tag; a sold card leaves a chalk "sold" the same size, so nothing beside it moves. (Three slots often offered three starter commons.)
- **New stock each year:** at each new year of a run the merchant brings two cards the catalogue does not hold yet, drawn at random, for that run only (`TUNING.newStock`); the year's first stall says so ("New stock this year: pumpkin and mint.") and lays them on its tray. Round 9: that is the stall after winter, which opens the year (`s.stockYear`); the stock came on leaving it, so the line and the cards first showed at the year's second stall. **It never runs dry:** once the catalogue holds every card, the merchant brings improved stock instead, uncommon and rare cards first (`s.select`): those cards come improved on every tray for the rest of the run, at 25 coins more (times the year's rise), with the Select stamp ("New stock this year: improved corn and improved chili."). By a fourth run the stall used to say "New stock this year: storm." and in year 3 nothing. A first run's stalls drew from the same fourteen cards from summer of year 1 to the end. The first version brought the next two in the unlock order (the beehive and chili, then corn and wheat): the bot's year 3 takes nearly tripled, since those are the strongest locked cards; drawn at random they add about a tenth. Unlocks by seasons met stay the catalogue for good.
- **Almanac pages:** 2 pages pinned to the cork board, at their price (below) times the year's rise. You keep up to 4 (it was 5: buying pages and no cards cleared year 2 more often than buying good cards); with the almanac full, a new page takes a kept page's place (lift the new page, then tap the kept one twice).
- **The engine page's next level** (round 8): from year 2 the cork board pins the run's engine page at its next level beside room for one more page, both on one row on the phone ("Busy Bees II, 800 coins"); two taps like everything here. See Engines.
- **Level IV** (round 9): after III the cork board pins the engine page at IV, 3,600 coins (`levelPrice`), "Busy Bees IV". The ninth playtest's coins piled up after III (4,736, 7,040, 8,908).
- **The first stall pins none of the engines' pages** (round 9, `rollPages`): its cork board sold Trellis beside the free "Beans and Trellis".
- **Room for one more page:** once the almanac is full, the cork board sells a page slot: 250 coins times the year's rise, doubling with each one bought, until all ten pages fit. It grows the run rather than swapping, and is the late use for coins the second playtest asked for (its runs ended with 2,825 and 696 coins unspent, the almanac full by year 1 winter and both scoops bought by year 2 autumn). The decent bot buys one in about half its runs.
- **What carries over is said as where the next season starts** (round 7): "Spring: 101 of 70. Summer starts with 8." ("8 carries over" was never explained.)
- **Plain words** (round 7): a plural card reads as one ("The beans go in your tin.", "The ladybirds go", not "goes"); the improve and throw-out sheets say Click on the desktop, not Tap.
- **Throw out a card:** 35 coins, then 15 more each time in the same visit. The deck keeps at least 6 cards. A tin bucket on the tray's lip (not the compost heap: Compost is a card).
- **Improve a card:** 40 coins, then 15 more each time in the same visit. The first tap on a card says what it would become ("Carrot: basket 5 to 8"); after it, a note shows the improved card.
- **Fresh stock (new cards on the tray):** 8, rising by 3 each time.
- **A scoop, for good:** from year 2, one more seed scoop on the bench every day. Round 9: days played after the season's quota was met leave nothing idle (the ninth playtest's scoop was refused for "1 scoop a day sat unused", the scoops of days after the quota fell), and a scoop not sold says "Not now" on the services strip, not its price. 200 coins times the year's price rise, doubling for each one after; four at most (the bench lays out any number). A late use for coins. **Sold only to a bench that ran short:** if a scoop a day or more sat unused at dusk last season (`TUNING.scoopIdle`, kept in the season's log as `idle`), the stall sells none and its slip says why: "One more seed scoop on the bench every day, for good. Last season 3 scoops a day sat unused. You have scoops to spare." In a deck of free radishes and one-scoop carrots the hand, not the scoops, limits a day: the sixth playtest bought a 3,200-coin scoop, then left 3 to 6 unspent most days, and won with 3,520 coins unspent. Two other fixes were measured and dropped (`deck-fit play` with each, 80 to 150 runs a build): a scoop that comes with a card lifted the roots builds' year 3 takes by 37% and their wins at the trial rows from 0 to 78% (they use every card) while the dear builds' moved 2 points; a cap at a scoop for each card in hand cut the dear builds' year 3 takes by 2 to 12%, since a hand of two-scoop seeds runs short of scoops, not cards.
- Everything takes two taps. The first lifts it and a slip says, in a sentence, what it is: a card's cost, when it ripens and its rule, then "Tap again to buy, 20 coins" (or "Short 6 coins"); the scoop for good says its price the same way (round 8: it said "Tap again to buy it."). The second buys. The purse on the table and the purse line at the stall follow every purchase at once.
- **The slip has a place of its own,** under the goods and above the signpost, always there and always the same height: the slip for a lifted thing, else what was just bought, else the stall's lesson. Nothing on the tray reflows when it changes, so the second tap lands where the first did. (The slip used to open inside the tray and the stall re-centred: goods jumped 22 to 90 px, garlic from y 692 to 607, and second taps missed.) deck-overlap measures every good, page and service between its two taps: nothing moves.
- **The way on is always in sight.** The goods, pages and services sit in a body that scrolls only if it must; the slip's place and the signpost follow it, pinned at the bottom once the body fills the screen. On a 1280 by 800 desktop and a 412 by 838 phone every control is on the screen without scrolling in every stall state, including a full almanac with the page slot and the scoop (the desktop signpost was at 797 to 839 px, below the fold).
- **On a wide screen** the cork board of pages stands left of the tray, side by side, so the goods can grow: 143 to 166 px wide on a 1280 by 800 screen (about 90 to 112 before, with their rule pictures about 10 px and over half the screen bare), as large as the screen's height lets every stall state fit (`--sbk`, 1.45 at 800 px).
- The stall is its own scene, the merchant's plank wall, not the table showing through; its own small almanac (top right) opens the almanac and the rules, which list every card in words.
- The stall arrives in parts like the table: a run's first stall shows only its engines (round 9: all four) until one is picked (round 8), then the goods and the signpost, the second adds the pages, the third the throw-out bucket, the stamp to improve and the bell, and from year 2 the twists. The head is short: the sign, "Summer: 171 of 150. Autumn starts with 5." and "You have 412 coins. Autumn asks 300." ("Spring is in." read as spring starting.)
- **On the phone the goods grow into the room the stall has** (`fitGoods` in `sheets.ts`): one row as wide as the tray allows, or two rows of two when the screen's free height grows them clearly more. Measured at their plain size on every render, so the same stall lays out the same way between a first tap and a second. They were 71 to 80 px wide with their rule pictures about 10 px and the bottom of the screen bare; with the narrower margin and lip they are 87 to 93 px in a year 1 stall, and stay at 71 to 80 in the fullest year's first stall (twists, new stock, a full almanac, the page slot), where every control still fits a 412 by 838 screen.
- **Kept pages are tap targets on the phone:** 40 px tall, always (they were 18), small slips even when they cannot be tapped, four to a row; a swap arms them without moving anything.
- **On the phone it fits with the twists:** the services lip is tighter (it was 92 px tall, its prices cut off at the foot), the kept pages sit on one line, a page's price is pencilled on its title line, and the Root Cellar's page reads in 11 words (it was 27, with a parenthetical). If the body must ever scroll, a soft shade at its foot says so (it scrolled 16 px with no sign).

### Almanac pages

| Page | Price | Effect |
|---|---|---|
| Rain Barrel | 80 | Column A grows an extra night every night |
| Root Cellar | 100 | Radishes and carrots get +2 yield, and +1 bloom beside each other |
| Busy Bees | 110 | Crops near a beehive get x1.5 bloom, not radishes or carrots (the bee engine's page; II x1.7, III x2, IV x2.3) |
| Hot Beds | 110 | Chilies pick for 3 nights; their neighbours get x1.7 bloom, radishes and carrots the chili's own x1.5 (the hot engine's page; II x1.8, III x1.9, IV x2) |
| Trellis | 110 | Beans and strawberries give neighbours +1.25 bloom, each other too, not radishes or carrots (once; the vines engine's page; II +1.45, III +1.7, IV +1.9) |
| Tall Rows | 110 | Corn ripens two nights sooner; tall crops (corn and sunflowers) get +1 bloom for each neighbour (the tall engine's page; II +1.5, III +1.8, IV +2.1) |
| Green Thumb | 170 | One more seed scoop every day (pinned only for a bench that ran short last season) |
| Big Basket | 140 | Hand size +1 |
| Crop Rotation | 100 | Sow a different crop where one was just pulled: +4 yield |
| Market Day | 130 | Every fifth harvest in a day is x2 |
| Four-Leaf Clover | 140 | One harvest in eight comes up golden, x3 |
| Long Furrow | 150 | The plot gains a fifth column, and one more scoop a day |
| Cold Frame | 80 | Winter quotas are 20% lower |

- **The Root Cellar pairs the roots.** Round 3 made every radish or carrot beside a radish or carrot add +1 bloom, uncapped, and it decided the run: the same shopping cleared year 3 76% of the time with it and 0% without, and the winning board was a carrot ringed by radishes on a bare plot (514 of 260 in year 1 summer with one to four crops standing at dawn). Now a radish gets +1 bloom if a carrot stands beside it and a carrot +1 if a radish does, once (`TUNING.cellarCap`); radishes beside radishes give each other nothing. A carrot ringed by four radishes pays 7 × 6 = 42 with it (63 before, 25 without). Capped at +2 instead, a roots build still took about 1,200 a season in year 3 against about 1,000 for the others.
- **Busy Bees is one multiplier, not a doubling of every bee**, and since round 4 a ×1.5. At ×2 the bloom build took about 1,600 a season in year 3, half again as much as any other strong build once the quotas were set against them, and the same build without it won 42 points less often; at ×1.5 the gap is 11 points.
- **The Long Furrow comes with a scoop:** it used to add only bare soil, a column the scoops could not fill.
- **Green Thumb only for a bench that ran short** (round 7, `pageOnSale`): like the scoop for good, it is not pinned when a scoop a day or more sat unused at dusk last season. The seventh playtest's guided summer stall sold it for 170 coins; afterwards 2.5 scoops a day sat idle and autumn was missed by 39.
- **Busy Bees is x1.2 at level I** (round 8; x1.6 and x2.1 at levels II and III, bought at the stall). **Only near a beehive** (round 7). Every run now takes an engine at its first stall; with Busy Bees at x1.5 over the sunflower's crop too and hives stacking, the bee engine took 2.4 to 2.5 times its year 2 quotas against 1.8 to 1.9 for the other engines (deck-strategies, the old quotas).

### Engines

Round 7. A run's first stall (the guided run's after its guided spring, any other run's after its first spring) offers the engines (round 9: all four, `TUNING.engineChoices`; three at random before, and the ninth playtest's runs 2 and 3 were never offered the bees), each a card and the page that multiplies it, free (`ENGINES` in `cards.ts`, `chooseEngine`, taken home on leaving). The way on asks for a pick first ("Pick one to take home first."); a tap pins one and it can be changed until the stall is left. The engine's cards join the run's stock even if the catalogue holds them locked, and from then on every stall's first tray keeps one slot for them (after the year's new stock and a hazard's answer).

| Engine | Takes home | Its page (level I) | Level II, level III | The stall keeps |
|---|---|---|---|---|
| Bees | a beehive | Busy Bees: crops near a beehive get x1.5 bloom, not radishes or carrots | x1.7, x2, x2.3 | beehives, sunflowers |
| Hot | four chilies | Hot Beds: chilies pick for 3 nights; neighbours get x1.7 bloom, radishes and carrots x1.5 | x1.8, x1.9, x2 | chilies |
| Vines | beans | Trellis: beans and strawberries give neighbours +1.25 bloom, not radishes or carrots | +1.45, +1.7, +1.9 | beans, strawberries |
| Tall | three corn | Tall Rows: corn ripens two nights sooner; tall crops get +1 bloom for each neighbour | +1.5, +1.8, +2.1 | corn, sunflowers |

**Round 10: each engine a different way to play.** The tester's biggest fun change: "every board is the same carrot ring". No engine page's bonus lands on a radish or a carrot (`isRoot`, `TUNING.engineRoots`; they keep what their own cards and the Root Cellar give, a chili's own x1.5 and a beehive's +1 bloom), so each engine pays only on its own crops and needs its own layout:

- **Busy Bees:** set the beehive in the middle of your dear crops (strawberries, beans, a pumpkin) and grow any radish and carrot ring outside its 3 by 3.
- **Hot Beds:** plant chilies side by side, each blooming the others, with beans and strawberries round the block; a chili stands three nights, so sow its neighbours to ripen beside it.
- **Trellis:** grow beans and strawberries in one bed: they bloom each other (`vinesSelf`, round 10; not before) and any crop beside them but a root.
- **Tall Rows:** sow corn where crops stand on all four sides, beans among them for its x1.5; any crop counts as a neighbour, radishes too, since the bonus is the corn's. Three corn to take home (`ENGINES`; two before), so a season seldom goes without one.

**Round 8: the engine page levels up at the stall.** From the stall that opens year 2 (`TUNING.levelFrom`), the cork board pins the run's engine page at its next level, one level a stall, beside room for one more page: "Busy Bees II, 800 coins", then III at 1,800 (`levelPrice`, the same in every year; `levelDue`, `buyLevel`, `s.levels`). Its first tap says what the level does in the page's own words, against what it does now ("Busy Bees II. Crops near a beehive get x1.6 bloom, not x1.2. Tap again to buy, 800 coins."; `levelChange`); the second buys it, and the page reads "Busy Bees II" in the kept pages, the side panel, the won page and on the beehive's face (its x1.6). The level stays with the page; tearing the page out loses it.
- Why: the eighth playtest's top fun change. Every run died with 1,979 to 5,711 coins unspent: the scoop was refused, the page slot doubled to 4,000, improving added a few coins, and year 3 takes stayed flat (957, 1,454, 1,019, 1,227) while the quotas climbed. The decent bot bought level II in nearly every run that reached year 2 and level III in most that reached year 3 (see Balance, round 8).
- **The engines start gentler, and the slow one faster** (round 8): Busy Bees is x1.2 at level I (x1.3), Tall Rows comes with one corn (two), Hot Beds with four chilies (two). With an engine the bot took a median 1.62 times its year 1 quotas with bees and 1.65 with corn; the hot engine met year 1 summer and autumn 93% of the time against 99 to 100% for the others (deck-strategies, round 7's build).
- **The first stall shows only its engines until one is picked** (round 8): one line over them, "Pick one to take home, free.", and the cards large enough to read (round 9: four, two by two on a 412 px phone with faces 93 px wide, four in a row at 171 px on the desktop; round 8's three were 108 px side by side on the phone; they were about 30 and 54 px), each with a "x4" on the face for four chilies. No tray, cork board or services until a pick, and that stall's tray and fresh stock sell none of the engines' cards (`rollCards`; the playtest's desktop stall sold a beehive for 45 coins beside the free one). Once picked, they sit small above the stall (two by two on the phone), where the pick can still be changed. Later runs said neither "pick one" nor "free": the line came only with the first run's lesson.

**Round 9: all four on offer, none that decides the run.** The ninth playtest's tall run took 618 against 360 in year 1 summer, then 1,318 of 730, 2,274 of 920 and 1,543 of 790 under a glut, and won with 8,908 coins unspent (single corn harvests of 288 to 594, corn 71% of the take); its hot run met year 1 summer by 6 and died in autumn with a best harvest of 42 (x1.5 on a bloom of 1 or 2, and levels only from year 2); the bees were offered in neither. Now:
- **All four engines at the pick** (`engineChoices: 4`): two by two on the phone, four in a row on the desktop.
- **Hot Beds raises the chili's bloom, not its picks** (`hotTimes`: x1.6 at level I, then x1.75, x1.9, x2; a chili stays and picks for 3 nights at every level). Its face prints the page's bloom at the run's level. Its picks at 4 and 6 nights added length, not pay; at x2 from level I with chilies stacking the hot bot won 98% (deck-strategies, 150 runs), at x1.55 29%: the most sensitive number of the four.
- **Tall Rows climbs gently and brings two corn** (II +1.5, III +1.8, IV +2.1; two corn, one in round 8): with one corn the tall engine cleared year 1 69% of the time, with II at +2 its median season reached 1.9 times the quota.
- **Busy Bees starts at x1.3 and Trellis at +2.5** (x1.2 and +2 before), so their year 1 holds at the raised row; their later levels are flatter (x1.5, x1.8, x2; +3.5, +4.5, +5; round 8's x2.1 and +6 ran away in year 3).
- **Level IV** (3,600 coins, `maxLevel: 4`): the late use for coins after III (the playtest's won run had 4,736 coins after III, then 7,040, then 8,908).

- Why: the seventh playtest's biggest fun change, "a guaranteed choice of engine at each run's first stall". With beehives and Busy Bees nights paid 150 to 320, without them 60 to 110, perennials topped out at 36, and the beehive was a rare stall roll.
- The stall's clipping says the gift and the page in words: "A beehive and Busy Bees. Crops near a beehive get x1.2 bloom." ("Four chilies and Hot Beds.", "Corn and Tall Rows."). Once one is picked, three small clippings side by side on the desktop, one under another on the phone, each with the card's face.
- The Root Cellar stays a page on the cork board: the start deck is the roots build. Round 10: an engine is no longer played on top of it, since no engine page lands on a root.

## Look and feel

A card game on a warm oak table, with the plot as a painted almanac plate. Its own identity: no felt, no neon, no pixel type, no jokers. Every surface is its own material; type reads from shape and material before colour.

- **Board:** a deckled almanac page on the table with a printed double rule, a timber bed of soil squares with engraved furrows, key letters along the top, and a caption ("Plate VI. The kitchen plot in summer."). Paper and soil follow the season's palette. The eight farm crops are the almanac's own paintings from `src/render2d/crops.ts`; mint, garlic, wheat and chili are painted in the same hand with its brushes. A just-sown seed shows its packet on a stake with the crop painted on it, so a radish sown today and a strawberry sown today no longer show the same red packet (deck-overlap compares their pixels). A small moon marks every crop that will be pulled tonight. Pests are fat lime aphids outlined dark over an ochre wash on the plot, with a badge in the plot's corner (a bug and the nights they stay, each paying half). A crow due tonight sits on the bed's top right corner. **Each crop stays in its own plot.** A crop is drawn clipped to its plot; what a tall one reaches above it (a bean pole, a sunflower, corn, wheat, a scarecrow's hat) is drawn first, behind everything, and faded to 28% where the plot above holds a crop or an object, so the crop above is always on top (a crop being scored, taken by a crow or flattened is drawn whole on top). Round 7: a crop is fitted inside its own plot, scaled down if it would reach above it (its highest painted pixel measured once per picture), so a bean pole, a sunflower or corn never reaches over the plot above or the key letters (the seventh playtest's bean pole on D1 stood over the letter D); only an object's top (a scarecrow's hat) reaches above its plot. Tall crops used to be painted over the row above: a young sunflower vanished behind a bean pole, a strawberry was swallowed, carrots and lettuce seemed to sit on the pole, and a column read as one vine; deck-overlap measured up to 22% of a crop covered by its neighbour and now finds none. The key letters and numbers are painted over the crops on small paper chips, so a bean pole, a scarecrow's hat or corn in the first row passes behind them (they used to be painted first and were covered); deck-overlap reads the pixels and finds no letter more than 6% changed by a tall first row. They fade at night, so harvest slips never cover them.
- **Cards are things, made the way their type is made, and read as pictures:**
  - Every face: the cost as seed scoops on a cream chip in the top left corner (the part a fanned hand always shows), each scoop about 17 px on the Pixel; "Free" in the same spot for free cards. On a seed packet the chip is a price sticker over the torn top edge, so the name keeps the whole band: three scoops beside the name squeezed "Pumpkin" to 6 units. Then the name, the painting, and the rule as one line of pictures: a carrot and "+2" by a basket on the radish, a radish and a red "+1" by a flower on the carrot, a little cross of plots for "its neighbours", a row of plots and a moon "+1" on the watering can. No sentences: the sentence (and the variety, "Early Nantes") is in the close-up a long-press or a hover opens.
  - Seeds: printed seed packets with a torn top, the crop painted in an oval vignette with its produce, the base yield by a basket (with a looping arrow and the picks for perennials, and a tall mark for tall crops), and a moon for each night to ripen.
  - Tools: brown kraft luggage tags on twine, with a reinforced punched hole, a stamped name and the tool drawn in ink and wash.
  - Weather: clippings cut from an almanac page, with print showing through from the back, a "The forecast" masthead and a woodcut glyph.
  - Objects: painted wooden plaques on a stake, with nail heads and grain. The scarecrow's rule is a crow in a red ring and bar beside the 3 by 3 it guards (it used to be the 3 by 3 alone, which read as nothing). Garlic's rule is an aphid in the same red ring and bar beside the cross of plots it keeps clean, and the ladybirds' beside the whole plot (both were a cross of plots alone).
  - Rarity shows as print quality: commons are plain, uncommons get a finer second rule, rares a gold-leaf corner. Improved cards carry a red "Select" rubber stamp.
  - The picture vocabulary lives in `src/games/deck/view/icons.ts` and is shared by the faces, the board's previews and the slips.
- **The table is the interface:** a ruled ledger slip names the season and day and the take against the quota (on the desktop in larger type, the take on a row of its own: season 23 px, take 27 px; on the phone a four-digit take or quota stacks the take over "of 1550", since the purse covered the last digit: "1239 of 15"; five-digit coins print smaller in the purse; a won run's ledger says "Run won"); a cribbage-style pegboard tallies the quota with a brass hole at the end; three wooden seed scoops show what is left to pay with today; a green seed tin is the draw pile; a heap of spent cards is the discard pile and the toss target (a red tick on it once today's toss is used; its label stays "Spent"); a brass lantern is End day (blowing it out brings the night); tonight's weather clippings lie by the lantern; the almanac (a small green book, a little faded) is the pause menu. On desktop, kept almanac pages are listed in the side panel, one line each and a dashed line for each page more it keeps ("Room for a page"), in two columns past six lines (round 7: they were pinned slips, and the seventh playtest's panel showed half of Big Basket and hid two more); a page's rule shows on hover and in the almanac. Labels on the table are one or two words.
- **Page bonuses on the faces:** with Root Cellar kept, the radish and carrot print their raised basket (4 and 7) in green; with Busy Bees, the sunflower and beehive print its ×2 after their bloom.
- **A full hand stays readable:** the hand shrinks to fit so the next card covers no more than a strip at each card's right edge; every card's name and rule stay uncovered at 5, 6 and 7 cards (measured by deck-overlap: names 8.2 px and up at five cards on a 412 px phone). Tool tags with two-word names stamp them on two lines.
- **Any number of scoops fits the bench:** the bench lays out the day's scoops (the refill and those pulled crops put back). The scoops take whatever room the tin, the spent heap, the lantern and tonight's weather leave them, one row while they keep a good size and two rows past that; the tin, the heap and the lantern never shrink. On the phone, 3 scoops are 43 to 48 px, 4 to 6 sit in two rows of 37 px, 7 and 8 in two rows of 31 px; on the desktop 84 px down to two rows of 54. (With Green Thumb and a bought scoop the lantern was squeezed to 10 px and the labels ran together as "SpentEnd day".) deck-overlap checks 3 to 8 scoops on both screens.
- **The desktop bench is the desktop's controls:** it takes the side panel's lower half, 260 to 380 px tall (344 on a 1280 by 800 screen, 24 px clear of the screen's foot: round 9, its "End day" label sat at y 785 of 800), with 84 px scoops, a 116 px tin, a 92 px spent heap, a 112 px lantern and 15 px labels. It was 200 px tall, its labels 11.5 px and its heap 54 by 58 px, with about 440 px of bare table above it; the bare table between the pegboard and the bench is now 282 px, 52 of it the lesson strip. The seed tin has a label like Spent and End day ("Seed tin"; painted on the tin it came out 5 px). A card taken up by keys hides its key number, which stood over the plate's caption.
- **Cost at a glance:** full scoops are heaped with seed; spent ones tip over, empty and pale. Taking up a card lifts and lights the scoops it would use; playing it empties them. A card the scoops cannot pay for is dimmed in the hand with its missing scoops ringed red; tapping it shakes it and flashes the missing scoops on the bench (no note, it is not taken up). At dawn the scoops refill one after another.
- **Coins by a coin (round 7):** a preview's totals (a neighbour's new total on its dark chip, the aimed seed's slip) show the coins they pay by a gold coin; the basket means yield everywhere else (the seventh playtest read "14 basket" as yield). The aimed seed's slip keeps the basket on its yield when it shows the arithmetic: "basket 5 × 3 = coin 15".
- **A crop the can brings in tonight shows what it will pay** (round 7): its moon +1 and its total on the dark chip (the seventh playtest watered a carrot that then paid 21 and saw only "+1 moon"). Rain and storms, which touch every crop, still show chips without totals.
- **The reason line covers no chip** (round 7): under the aimed seed's slip if that is clear, else just above the aimed plot, else under the bed or above it, wherever it covers none of the chips it explains (the seventh playtest's "The beans are pulled before the sunflower ripens." hid the beans' +2 bloom and their new total of 9).
- **From day 4 the ledger says what is still to go** (round 7, days 5 and 6; round 10 from day 4, `toGo`, `TUNING.toGoFrom`): "286 of 350" with "64 to go" under it on the phone and beside it on the desktop, until the quota is met (the seventh playtest's last day read only "286 of 350", and runs died with hundreds of coins unspent; the tenth playtest's no-engine run ended its first spring 158 of 160 before the ledger had said anything).
- **The board explains while you play:** while a card is held, every plot where a bonus would apply carries a small chip in its corner (a "+2" by a basket, a red "+1" by a flower, a "×1.5", or a moon "+1" for an extra night), and the plot under the finger, pointer or keyboard cursor shows what the seed would score there ("4", or "5 × 3 = 15") along with what its neighbours would gain. A crop already standing whose pay the play changes also shows **its new total on a dark chip** under its gains, like the aimed seed's own slip (a radish aimed beside a carrot: the radish's "4" and, on the carrot, "+1" and "36"; the sixth playtest saw the carrot's 36 only by tapping its plot); weather, which touches every crop, shows its chips without totals. A bonus the night will not pay shows greyed, dashed and struck through, and under the aimed plot one plain line says why ("The radish is pulled before the carrot ripens.", "The other beans are pulled before these ripen.", "Too late to ripen this season."). A card that would do nothing says "No effect now."; a scarecrow before the crows come says "Keeps crows off from now on." and a beehive with nothing round it "Blooms crops around it from now on.", since both stand for the rest of the run. Dragged over the plot, the card shrinks above the finger and goes see-through so the preview shows. Previews come from `previewPlay` in the rules, run on a copy of the run.
- **Shop:** the seed merchant's stall, its own scene against a plank wall: a painted sign, almanac pages pinned on cork, a wooden tray of goods with kraft price tags, a tin bucket (throw out), a rubber stamp (improve), a hand bell (fresh stock) and from year 2 a scoop on the tray's lip, and a signpost on to the next season.
- **Run end:** the account scrolls with a soft shade at its foot while there is more below (round 7: the desktop's row of new cards was cut off with no sign). "The almanac, year N": a ruled entry per season, then the best harvest, coins, seasons met of twelve and new cards ("New in the merchant's catalogue: pumpkin, shears and mint."). A won run has its own page instead (see Run structure). The account scrolls in a long run, its ruling scrolling with it; "Turn to a fresh page" stays in sight under it, with the wax seal beside it for a won run.
- **The desktop's held card and close-up:** a card taken up on the desktop lifts only as far as the plate's caption (it used to cover it), and the close-up a resting pointer brings stands in the bare table right of the plate, clear of the scoops and the bench (it stood over the scoops).
- **The hand stays still through the day, then closes up:** a card played leaves a gap and the rest stay where they were, so a second tap lands on the card that was there (the fan re-centred after every play, and a tap at the old spot missed twice); a card drawn in the day takes the first gap. Round 7: once the hand has rested 1.4 s (no card held, no pointer on the hand) the fan closes its gaps, keeping its order (the seventh playtest's hand kept a gap in the middle all day); it closes at dawn too.
- **"Tap again to plant it."** shows for the first three aims with no lesson up, in the lesson strip rather than over the plot (it showed on every play forever, over the aimed plot's bonus chip on the top row), and goes the moment the card is played.
- **A note keeps the width it was measured at** (round 8): measured from the table's left edge and then held there, so it cannot wrap again where it goes. The eighth playtest's "Strawberry pays 16 tomorrow night." from C1 measured one line at the left edge, wrapped to two by the right one, and, hanging upward from its foot, rose over the column letters B, C and D. deck-overlap reads every first-row plot in four columns.
- **Notes, not toasts:** one short ink note at a time beside the plot it concerns ("A crow took one."), gone after two seconds. Eight words at most. A note about a plot stays inside the bed's width and below its top, so it never covers a key letter or number; a note about the whole table ("Quota met." as the peg drops into the brass hole and gilds, "40 carried over from winter.", "The last winter: meet it to win.", "Tap again to plant it.") always sits in the lesson strip, and the lesson or the season's twist there steps aside while it shows. It used to sit on the plate's caption, whose words showed round it in pieces, and then, whenever a lesson or the twist held the strip (all season from year 2), just inside the bed's top edge, over row 1 of the plot. "Tap again to plant it." never shows while a lesson is up.
- **Reading a plot says what it will pay:** a tap with no card held, or Enter on the cursor, says "C4: carrot pays 15 in 2 nights.", "B2: beans, pests, pays 3 tonight.", "A3: radish pays 6 tomorrow night." or "D1: corn pays 24 next season.", scored like the previews (Market Day too), on the night it is pulled. It names the plot only where the plate shows its row numbers: the phone's plate has the letters alone (its margin has no room for numbers), so there it says "Carrot pays 15 in 2 nights." by the plot.
- **The score slip wraps:** each bonus takes its place on the slip as it sets off (unseen until it lands), so its arc flies to its own place, shrinking to the chip's size as it lands, and never settles on a bonus already there; the chips wrap onto a second line past four (the second beans +2 under corn's ×1.5 was hidden). deck-overlap watches a corn with seven bonuses.
- **The shell's corner** (60 px plus the safe area, top left) stays clear on the table and on every sheet: sheets start below it, and sheets and the close-up sit under the shell's button so it always takes a tap. deck-overlap checks every state and sheet.
- **Phone portrait first** (412 by 838 to 900): ledger, coins and the almanac along the top (the shell's corner kept clear), the pegboard under them, the plate in the middle, a strip for the lesson line under the plate, the bench (scoops, weather, tin, spent heap, lantern) under that, the hand fanned along the bottom. Kept pages are read in the almanac on a phone.
- **Desktop:** the plate left of centre, a side panel with the ledger, pegboard, the lesson line (and the season's twist) right under the pegboard, the kept pages with the room left shown as empty leaves ("Room for a page"), and the bench at the foot; the hand along the bottom, clear of the screen's foot (it ran off the bottom edge). The playtest found about 330 px of bare table between the pegboard and the scoops; the longest bare stretch is now under 150. A landscape phone uses the desktop layout with smaller cards.
- **Round 9: a crow on the bed shows its reach.** While a crow is about, the plots a standing scarecrow keeps are washed in straw with a dashed edge round its ground, so a ripe crop outside it reads at a glance; the previews grey (dashed, not struck) any bonus tonight's pay counts from a ripe crop no scarecrow guards, since the crow takes one such crop before the harvest, and the reason line says "The crow may take the sunflower first." (the playtest's corn previewed 252 and paid about 50 less).
- **Round 9: the reason line speaks for the aimed plot only** (`previewReason`): a greyed bonus the aimed seed takes or gives, else no line. The ninth playtest's radish over B4 said "The other corn is pulled before this one ripens.", a corn's loss that was there before the radish. It also keeps off the plate's caption.
- **Round 9: a harvest's slip in three lines** under the sum: the yield's bonuses, the bloom added, then the multipliers; bonuses of one kind from one source share a chip whose number grows (Tall Rows +4, not four +1s), and a page's bonus names the page ("Busy Bees ×1.3"). A big corn's slip had nine bonus icons and an unnamed "x1.2" beside a bloom of 7.2.
- **Round 9: the stall's head keeps each sentence on one line** ("Autumn starts with 54." wrapped "54." onto a line of its own).
- **Round 10: a pegboard you can read at arm's length.** On the desktop it is 46 px tall (32), its pegs and holes grow with it. The side panel's bareness in the guided season stays: the bench and the kept pages come with their lessons, and a returning table's longest bare stretch is 76 px.
- **Round 10: a seed tin with more below says so.** The improve and throw-out sheets cut off their last row (the cans and the compost) at the screen's foot with no sign; a soft shade at the tin's foot now shows while there is more to scroll (`.sb-tinview.more`), and deck-overlap's scroll check covers it.
- **The plate's caption** sits between the bed and the printed frame; the margin under the bed is sized from the caption and the frame's two rules, so the rules never strike through it at any size.

## Teaching: the guided first season

No rules wall, and nothing on the table before it is needed. A new player's first run starts with the plot, two radishes and one note. Each lesson brings in one piece of the table, shows one line (eight words at most, one action, imperative), and waits until the player has done it. The thing a lesson is about glows softly (the lantern, the scoops, the radish in the hand). The board's previews and the scoring do the explaining; notes never explain a rule. Lessons fire on what is happening, not on the day number, so a run that strays from the set hands still gets each one when it first matters. The tutor is `src/games/deck/lessons.ts`.

Every day of the guided season deals a set hand from the start deck (`GUIDED_DEALS` in the rules, deterministic; the spent pile is used if the tin runs short; never past a full hand): day 1 two radishes; day 2 a carrot and two radishes; day 3 a radish, the lettuce, and a radish or a carrot, one of the two (round 9, below); then one new card a day: day 4 the beans, the first dear seed (with a carrot and a radish), day 5 the watering can (with a radish and a carrot, and the tin), day 6 the sunflower, the lettuce's tall crop (with the lettuce and two radishes to ring the carrot that ripens that night; round 7, for the spring's raised quota of 90).

Cost comes in a piece at a time. Radishes are free and the carrot and lettuce a scoop each, so days 1 to 3 never run the bench short and the scoops stay off the table. Day 4's beans cost two: first the new-card lesson ("Hold the new card to read it."), then the scoops and the cost printed on every card arrive with "Spend two scoops on the beans." (the two scoops they would use lift). That night each crop pulled up flies a scoop to the bench, and day 5's dawn lays out four or five scoops (round 9: four if day 3's pair kept the radish) with "Crops pulled last night put scoops back." The old scoops lesson waited for a day 3 hand that cost more than three scoops, which free radishes no longer make. The strawberry first comes in summer. From summer the hand draws up to five. (Day 4 used to draw up to five, bringing the beans, the strawberry and the sunflower at once, with the tin lesson on top.)

The lessons, in the order they come in the guided season (touch wording; mouse says Click, keys name the key):

| # | When | Brings in | Line |
|---|---|---|---|
| 1 | Day 1, at once | the plot and the hand only | "Tap a radish to take it up." / "Tap a plot to plant it." / on touch, once a plot is aimed and shows what the radish pays there, "Tap the plot again to plant." / "Plant the other radish." |
| 2 | Both radishes sown | the lantern | "Blow out the lantern to end the day." (keys: "Press E to end the day.") |
| 3 | Night 1, the first harvest | the ledger and pegboard (the slip flies to it; yield only, no bloom) | at dawn: "Fill the pegboard by day six." ("the brass hole" was jargon) |
| 4 | Next card taken up | | "Miss it, and the run ends." |
| 5 | Day 2, carrot and radish in hand | | "Plant the carrot first." / "Plant a radish beside the carrot." (the held radish marks +2 on every plot beside the carrot; the carrot's +1 bloom shows greyed with "The radish is pulled before the carrot ripens.") |
| 5b | Day 3, a radish or a carrot dealt (round 9) | | "Plant a radish or a carrot, not both." The two are ringed in the hand with "or" on a tag between them; plant one and the other flies back to the tin. The previews show the trade: the radish beside the carrot sown on day 2 raises its pay tonight (10 to 15), the carrot pays 5 in two nights and more once radishes ring it. The careful line (the strict bot) takes the radish and meets the spring on day 6 (84 of 75); made to take the carrot, it has 83 by day 5 and 94 by day 6. |
| 6 | Day 3, the carrot ripens tonight | bloom: the slip's × bloom part | "The carrot ripens tonight. Ring it with radishes." (the carrot shows +1 bloom per radish; that night it pays 5 × 3). This teaches the timing: on day 2 the same +1 showed greyed, because the radish was pulled first. |
| 7 | Day 4, the beans: the first card of a new kind | | "Hold the new card to read it." (nine words before; mouse: "Rest the pointer on the new card."; keys: "Take it up, then press I.") |
| 8 | Day 4, a dear seed (two scoops or more) in hand, or a hand that costs more than the scoops left | the scoops, and the cost printed on cards | "Spend two scoops on the beans." (short of scoops: "Spend your last scoop.", then "End the day. The scoops refill at dawn.") |
| 8b | Day 5's dawn, the bench holding more than its refill | | "Crops pulled last night put scoops back." (passive, five seconds or the first scoop spent) |
| 9 | Day 5 | the seed tin | "Tap the tin to see your cards." (keys: "Press D to see your cards.") |
| 9b | Day 5, a can in hand and a crop it would hurry | | "Water a row to grow it faster." (the row's crops show a moon +1) |
| 10 | A weather card in hand that would bring a crop in tonight (never one that would change nothing) | tonight's clippings by the lantern | "Drop the weather anywhere on the plot." |
| 11 | From day 6, a card in hand with nowhere to go (no plot it can be played on), or (round 8) a hand stuck with cards the scoops cannot pay for today: nothing else in it can be played (`dearCard`) | the spent heap | "Drag a spare card to Spent." / "Drag a card too dear today to Spent." (keys: "Take a card up, then press X." / "Press Shift 2, then X.") Put away unfinished, to come back, once no spare or stuck card is left. Guided day 6 used to say it with all three cards needed, and kept it up with the hand empty; it now comes in summer. Round 7: not for a card that is only dear while another can still be played (the seventh playtest was told to toss a strawberry the bench could not pay for that day, and threw out a good card). Round 8: the eighth playtest's corn runs ended days with three to five three-scoop corn cards in hand and never met the heap. |
| 12a | The first season's end | the engine (round 7) | in the stall: "Pick one to take home, free." (round 8: the stall's own line over the engines, every run, so it is not said twice; large cards (round 9: four, two by two on the phone), each a card and its page, free; the way on asks for a pick first) |
| 12 | The first season's end, once the engine is picked | coins (the purse) | in the stall: "Buy a seed with your coins." |
| 13 | The second stall | almanac pages on the cork board | "Pin a page to change the rules." |
| 14 | The third stall | throw out, improve and fresh stock | "Throw out or improve a card here." |
| 15 | The first stall with twists (year 2) | the two twists | "Pick one of the two for spring." Done once one is picked. |
| later | First pest (summer) | | First what pests cost: "Pests halve that crop's pay for two nights." (five seconds); then, only if one is in the hand or the tin, the answer: "Clear the pests with ladybirds." / "Garlic keeps pests off its neighbours." (It used to name garlic before saying what pests cost.) |
| later | First crow at dawn (autumn) | | "A crow is about. Set out the scarecrow." only if one is in the hand (round 5: not the tin, from which it cannot be set out today; the pests' answer likewise); with one standing, round 9: the ripe crops outside its 3 by 3 by name ("The crow can reach your carrot.", "... your carrot and beans.", "... three ripe crops.", `crowLine`, `crowReach`), and "A crow is about. Your scarecrow keeps watch." only when there are none (the ninth playtest was told it kept watch while the carrot on D4 sat outside it, and the crow took it); else "A crow will take a ripe crop tonight." Later crows: the same line with a scarecrow standing, else "A crow is about tonight." While a crow is about the plate washes the scarecrow's ground in straw with a dashed edge. The stall before autumn stocks a scarecrow, so the first crow can be met. (It used to count every card owned, so it asked the third playtest to set out the scarecrow already standing on C2.) |

**Round 9: a lesson waits behind a note.** A note about the whole table ("54 carried over from summer.") stands in the lesson strip in front of the lesson; the lesson's time now starts only once it shows (`Tutor.update`'s `hidden`), so a passive one has its full five or six seconds (the ninth playtest's pest lesson came up behind that note and was gone three seconds after it). A lesson already done as it comes (the player did it unasked) is marked done and never shown, and the bloom lesson also comes once its day has gone by, so the day 3 pair can take the radish it waits for without the lessons after it stalling.

Lessons, the pieces brought in, and the card kinds met are kept in the save with the meta unlocks. A player with a finished run skips the guided season and has the whole table: round 8 brings every piece a lesson brings in onto the table from the first dawn of any run after the first one finishes, and on loading such a save (`earnTable`), whatever the first run reached. The eighth playtest's guided run ended after 42 days without the spent heap or the weather, and runs 2 to 4 never had the heap, since the pieces came only with their lessons. A lesson not yet given still comes when it first matters. deck-returning checks it in the browser. A save from before the lessons loads with everything in and a refresher for the can, the weather and the scoops put back, whose rules changed. "Start over" from the shell clears the lessons too. The full rules live in the almanac's "The rules in brief".

## Controls

| Input | How |
|---|---|
| Touch | Tap a card to take it up: plots it can go on get a dashed rule, the plots it would touch are washed (a row of water, a 3 by 3), and the preview chips show what it would do (a seed that gives to its neighbours, like the beans, marks each plot with what they would gain there, added up; beans used to mark nothing). Tap anywhere on the plate for weather and Ladybirds. A seed, tool or object that goes on one plot aims on the first tap and plays on the second, since a finger has no hover (seeds planted on the first tap until round 4, so a finger never saw a seed's score before it was sown): on touch the aimed plot is the hover, so the first tap shows exactly what a mouse resting there shows (the wash, the moon +1 or +6 yield chips, "Tap again to water."). It used to show only the note: the pointerleave a finger sends after every tap cleared the hover. deck-lessons compares the first tap on the phone with a hover on the desktop. Tap the card again to put it down. A card the scoops cannot pay for only shakes. Dragging a card onto a plot also works (any card can be dragged, so one you cannot pay for can still go on the spent heap); drag it onto the spent heap to toss it. Long-press a card to hold it up close; tap to put it back. Tap a plot with no card held to read what's there. Tap anywhere during the night to skip it (round 9: a tap or Enter within 0.45 s of the night's end reads nothing; a late skip read "Bare soil." or "Beehive." on most nights). Ending the day while a played card is still flying lands the card first, so the night starts from the board as the play left it. (The card's landing used to run during the night and show the morning's board and tomorrow's hand all night when End day came within about 0.3 s of a play.) |
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

The tester's strategy simulation plays the bot's days with fixed stall policies and the whole catalogue unlocked: the bot's own buying, only sunflowers and beehives with Busy Bees, a wider bloom build, carrots and radishes with the Root Cellar, pages and no cards, and nothing at all. Since round 4 it is in the repo: `npx tsx scripts/deck-strategies.ts [runs] [policy...] [--seasons]` (policies in `scripts/deck-policies.ts`, with two more: the bloom build without Busy Bees and the perennial build without the Rain Barrel, to see whether one page decides a build). It runs against an older build too.

`npx tsx scripts/deck-fit.ts play <player> [runs]` plays one player (a stall policy, or the decent, strict or guided bot) through all twelve seasons, a missed season going on to the stall (`TUNING.noEnd`, checks only), and writes each run's take per season to /tmp/deck-fit; `npx tsx scripts/deck-fit.ts fit [year 2 row] [year 3 row]` then prices any row of quotas against every player at once: per-season pass rates, year clears and wins. A take barely depends on the quota (only the bot's worth of a scoop reads it), so one play prices nearby rows; it agreed with full runs within a few points.

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

### Round 4: a finish line, years 2 and 3 against the strong builds, the Cellar paired

The fourth playtest scored 6 of 10 (up from 5): year 1 a real puzzle, but strong runs never ended, the take ran at 1.8 to 2.5 times the quota once a build was focused, players who cleared year 2 almost all cleared year 3, and the Root Cellar decided the run. Measured before (the committed round 3 build, a `git archive` copy) and after, 200 runs each.

The strategy table (`scripts/deck-strategies.ts`, whole catalogue unlocked), clears of years 1, 2 and 3; clearing year 3 is a win (before, it was year 3 of an endless run):

| Strategy | Before | After |
|---|---|---|
| Bloom with Busy Bees, rerolls and page slots | 89%, 77%, 76% | 83%, 63%, 46% |
| Roots with the Cellar, the Barrel, rerolls and slots | 88%, 84%, 80% | 89%, 81%, 37% |
| The same bloom build without Busy Bees | 80%, 64%, 54% | 79%, 58%, 35% |
| Roots with the Cellar, no Barrel | 88%, 82%, 80% | 87%, 76%, 31% |
| Perennials, no Barrel, rerolls and slots | 88%, 65%, 63% | 82%, 47%, 19% |
| The bot's mixed buying | 78%, 48%, 33% | 84%, 35%, 18% |
| Bloom, plain | 67%, 42%, 35% | 62%, 31%, 10% |
| Perennials with the Barrel | 83%, 60%, 56% | 76%, 31%, 3% |
| Roots, plain, with the Cellar | 68%, 52%, 36% | 75%, 22%, 0% |
| Roots with the Cellar and the Barrel | 73%, 50%, 25% | 78%, 26%, 0% |
| Roots, the same shopping without the Cellar | 77%, 40%, 0% | 79%, 31%, 0% |
| Pages, no cards | 90%, 40%, 7% | 89%, 18%, 0% |
| Nothing at all | 0%, 0%, 0% | 1%, 0%, 0% |

- Four builds now win within 15 points of each other (31 to 46%) and none above half; before, three won 76 to 80%. Year 3 is a filter: of the strong builds' runs that clear year 2, 40 to 73% win (84 to 99% before).
- Busy Bees no longer decides the bloom build (46% with it, 35% without; 76% and 54% before). The Root Cellar no longer makes roots the best build (37% with the shopping that won 80%), but a deck of radishes and carrots alone still cannot win without it: a plain carrot ringed by radishes tops out at 25, and the deck has no other multiplier. Left for a later round (a card-level change to the roots, which would also move year 1).
- The roots builds stand on a fuller plot at dawn: 2.8 and 2.5 crops for the plain ones (2.2 and 2.0 before).

Pass rates per season, decent bot (the bot's own buying, a new player's catalogue), before and after:

| Decent bot | spring | summer | autumn | winter | clears the year |
|---|---|---|---|---|---|
| Year 1, before (170, 260, 300, 350) | 96% | 97% | 90% | 96% | 81% |
| Year 1, after (the same) | 96% | 97% | 91% | 96% | 82% |
| Year 2, before (400, 480, 540, 600) | 94% | 84% | 72% | 79% | 37% |
| Year 2, after (420, 500, 580, 650) | 88% | 77% | 64% | 74% | 26% |
| Year 3, before (600, 660, 700, 740) | 85% | 84% | 90% | 91% | 22% |
| Year 3, after (740, 820, 900, 960) | 44% | 57% | 77% | 100% | 5% (won) |

The strict bot clears years 1 to 3 at 77%, 23% and 11% (68%, 29% and 12% before); the guided first run at 85%, 39% and 8% (77%, 28% and 9%), its year 2 at 88% of the usual. Year 1 is as it was or a little kinder (the stall's one answer slot leaves room for a seed). Year 3 spring is where unfocused buying stops: the bots that get past it have found a combo (their year 3 autumn median takes are 1,594 to 1,933 against 715 to 909 in spring).

How the quotas were set: `scripts/deck-fit.ts` played every player through all twelve seasons, then rows were priced against all of them at once; years 2 and 3 were raised until the strong builds' wins came to about 40 to 50%, with year 2 spring and year 3 spring held to a fifth over the winter before (440 and 780 first; 420 and 740 shipped, which moved no build by more than a few points). The Cellar was tried capped at +2 (roots won 65%), at +1 bloom with +1 yield (20%), at no yield (32%) and at +1 bloom with +2 yield (47%, shipped); Busy Bees at ×2 left the bloom build at 74% against 47% for roots.

Variety (deck-seasons): a run's stalls show 12.2 different cards on their trays (10.1 before), and 5% of tray slots repeat the stall before (38%).

Run length: on the committed build the strong builds' engines were done by the end of year 3: roots took a median 1,393 a season in year 3, 1,384 in year 4 and 1,394 in year 5, with five or six pages kept and all four scoops bought, while unspent coins went 3,183, 6,530, 11,748; perennials 1,137, 1,247, 1,275.

### Round 5: twists, carry, year 3 against the run's own year 2, a run that ends on its last quota

The fifth playtest scored the first quarter hour 7 of 10 and the game 6: year 2 a coin flip on the draw, year 3 a victory lap (the winning run took 1.54 to 1.95 times its year 3 quotas, and stood at 959 of 960 after day 4 of the last winter), every day the same improved carrot star, and four ways to win that were really one. Measured before (the committed round 4 build, a `git archive` copy) and after, 200 runs each.

The strategy table (`scripts/deck-strategies.ts`, whole catalogue unlocked): clears of years 1 and 2, and wins; after, and after without the twists (`--noTwists`, the same quotas):

| Strategy | Before | After | After, no twists |
|---|---|---|---|
| Bloom with Busy Bees, the Barrel, fresh stock and slots | 83%, 63%, 46% | 88%, 74%, 56% | 88%, 60%, 47% |
| The same bloom build without Busy Bees | 79%, 58%, 35% | 87%, 66%, 38% | 87%, 41%, 19% |
| Perennials without the Barrel, fresh stock and slots | 82%, 47%, 19% | 88%, 64%, 31% | 88%, 34%, 7% |
| Bloom, no fresh stock or slots | 83%, 66%, 28% | 87%, 71%, 28% | 87%, 51%, 18% |
| Perennials, no fresh stock or slots | 85%, 61%, 26% | 90%, 72%, 27% | 90%, 49%, 11% |
| The bot's mixed buying | 84%, 35%, 18% | 89%, 40%, 24% | 89%, 29%, 12% |
| Roots with the Cellar, the Barrel, fresh stock and slots | 89%, 81%, 37% | 92%, 85%, 20% | 92%, 75%, 7% |
| Roots with the Cellar, no Barrel | 87%, 76%, 31% | 91%, 80%, 16% | 91%, 72%, 5% |
| Perennials with the Barrel | 76%, 31%, 3% | 83%, 45%, 12% | 83%, 22%, 1% |
| Bloom, plain | 62%, 31%, 10% | 72%, 37%, 12% | 72%, 26%, 8% |
| Roots, no fresh stock or slots | 89%, 68%, 7% | 92%, 68%, 2% | 92%, 59%, 1% |
| Roots, plain, with the Cellar | 75%, 22%, 0% | 82%, 32%, 1% | 82%, 5%, 0% |
| Pages, no cards | 89%, 18%, 0% | 91%, 20%, 0% | 91%, 6%, 0% |
| Nothing at all | 1%, 0%, 0% | 1%, 0%, 0% | 1%, 0%, 0% |

- **Year 3 is a fight again:** the strong builds' median take in year 3 fell from 1.19 to 1.49 times the quota to 1.09 to 1.27 (bloom with Busy Bees 1.49 to 1.27, the bot 1.41 to 1.31), and the last winter ends the night it is met.
- **More paths:** perennials win 12 to 31% (3 to 26% before), and the builds that buy no fresh stock and no page slots win 27 to 28% for bloom and perennials. The tester's 0 to 5% for "the same builds without that" compared policies with different page lists; with the same lists the plain builds won 7 to 28% before. Roots fell, 16 to 20% for its best builds (31 to 37%): they stop growing after year 2 (year 3 takes about 1.0 times their year 2 autumn and winter, against 1.15 to 1.25 for bloom and perennials), which a quota scaled to the run's own year 2 shows. Bloom with Busy Bees, the Barrel, fresh stock and slots is the strongest build at 56%; Busy Bees at x1.4 cut the perennial builds that keep it (31% to 21%) more than it (56% to 52%), so it stays at x1.5.
- **The twists** are what most of the gain comes from: without them the same quotas leave the strong builds at 1 to 47%, most under 20%. They change the best pattern less than the win rates: the best harvest's recipe (its crop and where its bonuses came from) changes from one season to the next in years 2 and 3 for 29% of roots seasons (20% without twists, 15% before), 83 to 88% of bloom and perennial seasons (79 to 81% without), 91% for the bot (91%); the crop that took the most changes in 42 to 51% of bloom and perennial seasons (36 to 44% without).
- **The carry** is the other half: priced without it (`deck-fit`), the strong builds win about half as often.

Pass rates per season, decent bot (the bot's own buying, a new player's catalogue):

| Decent bot | spring | summer | autumn | winter | clears the year |
|---|---|---|---|---|---|
| Year 1, before (170, 260, 300, 350) | 96% | 97% | 91% | 96% | 82% |
| Year 1, after (the same, with carry) | 96% | 98% | 94% | 98% | 87% |
| Year 2, before (420, 500, 580, 650) | 88% | 77% | 64% | 74% | 26% |
| Year 2, after (430, 600, 710, 790) | 94% | 74% | 69% | 81% | 34% |
| Year 3, before (740, 820, 900, 960) | 44% | 57% | 77% | 100% | 5% (won) |
| Year 3, after (850, 940, 1,040, 1,100, or 0.95 of its own year 2 autumn and winter) | 76% | 80% | 85% | 100% | 18% (won) |

The strict bot clears years 1 to 3 at 85%, 30% and 14% (77%, 23% and 11% before); the guided first run at 91%, 28% and 13% (85%, 39% and 8%), its year 2 now at the full rate. The first run after the guided one meets its first spring every time at 120 (96% at 170 before) and clears years 1 to 3 at 90%, 35% and 19%.

How the numbers were set: every player was played through all twelve seasons with a missed season going on, recording each season's own take (carried coins left out); then rows were priced with the carry and the year 3 scaling, as `deck-fit` now does, over a grid of year 2 rows, year 3 rows and multipliers on year 2 (the whole year, or its autumn and winter). The aim: the decent and guided bots clearing year 2 about 35 to 40% of the time and winning 10 to 20%, the strong builds about 30% each. Year 3 scaled to the whole of year 2 at 1.1 to 1.4 left the roots builds at 0 to 10%; to autumn and winter at 0.95, 16 to 20%. Year 2 spring was held to 430 so the year's turn is no cliff (500 was 1.43 times year 1 winter). Sunflowers all round at +2 to every neighbour lifted bloom with Busy Bees; it gives +1 to the side and upper neighbours now.

### Round 6: twists that trade, fixed quotas, a gentler guided summer, scoops only for a bench that runs short

The sixth playtest scored the first quarter hour 7 of 10 and the game 6: the help was the twist nine times of nine, year 2 a walkover once a build existed, year 3 set from the run's own year 2 (a flat 1,550 after a strong year 2) and decided by spike nights, the guided summer a cliff. Measured before (the committed round 5 build, a `git archive` copy) and after, 200 runs each.

**The twists are a choice now.** The share of stalls where each policy took the hitch, and which hitch (`deck-strategies.ts`, whole catalogue):

| Policy | Before | After | Frost | Glut | Crows | Sunflowers face up |
|---|---|---|---|---|---|---|
| The bot's own buying | 0% of 817 | 49% of 776 | 60% | 39% | 47% | 53% |
| Bloom with Busy Bees, the Barrel, fresh stock and slots | 0% of 1,170 | 32% of 1,173 | 30% | 18% | 43% | 40% |
| Perennials without the Barrel | 0% of 1,022 | 31% of 976 | 36% | 18% | 32% | 40% |
| Bloom, plain | 0% of 1,077 | 29% of 1,076 | 20% | 16% | 46% | 38% |
| Roots with the Cellar, the Barrel, fresh stock and slots | 0% of 1,209 | 32% of 1,296 | 63% | 5% | 32% | 55% |
| Roots, plain, with the Cellar | 0% of 999 | 32% of 1,039 | 52% | 8% | 39% | 50% |
| Pages, no cards | 0% of 601 | 42% of 542 | 49% | 31% | 43% | 45% |

The pick follows the deck: the roots builds, which own one crop worth a glut, take frost two to three times as often as a bloom build and a glut of their carrots one time in twenty; the bot, whose top crop changes, takes a glut two times in five. Every kind of pair seen four times or more was picked both ways by most policies (19 of 20 for the strong bloom build, 11 to 14 of 15 to 18 for roots; none before).

**Win rates with and without twists** (clears of years 1 and 2, and wins):

| Strategy | Before | After | After, no twists |
|---|---|---|---|
| Bloom with Busy Bees, the Barrel, fresh stock and slots | 88%, 74%, 56% | 88%, 69%, 60% | 88%, 55%, 44% |
| Bloom, plain | 87%, 71%, 28% | 87%, 66%, 41% | 87%, 45%, 19% |
| Roots with the Cellar, the Barrel, fresh stock and slots | 92%, 85%, 20% | 92%, 81%, 38% | 92%, 73%, 10% |
| The same bloom build without Busy Bees | 87%, 66%, 38% | 87%, 57%, 38% | 87%, 36%, 19% |
| Perennials, plain | 90%, 72%, 27% | 90%, 70%, 36% | 90%, 43%, 10% |
| Perennials without the Barrel | 88%, 64%, 31% | 88%, 56%, 32% | 88%, 27%, 9% |
| The bot's mixed buying | 89%, 40%, 24% | 89%, 36%, 21% | 89%, 24%, 13% |
| Roots with the Cellar, no Barrel | 91%, 80%, 16% | 91%, 79%, 22% | 91%, 64%, 2% |
| Bloom, no fresh stock or slots | 72%, 37%, 12% | 72%, 33%, 16% | 72%, 23%, 7% |
| Perennials with the Barrel | 83%, 45%, 12% | 83%, 34%, 9% | 83%, 13%, 0% |
| Roots, plain | 92%, 68%, 2% | 92%, 67%, 5% | 92%, 53%, 1% |
| Roots, no fresh stock or slots | 82%, 32%, 1% | 82%, 26%, 0% | 82%, 2%, 0% |
| Pages, no cards | 91%, 20%, 0% | 91%, 10%, 0% | 91%, 4%, 0% |
| Nothing at all | 1%, 0%, 0% | 1%, 0%, 0% | |

- **Year 2 has more tension:** every strong build clears it less often (bloom with Busy Bees 74% to 69%, roots 85% to 81%, perennials 64% to 56%) and takes less over its quotas (median 1.61 to 1.56, 1.82 to 1.74, 1.50 to 1.42).
- **Year 3 no longer punishes a strong year 2:** five builds win 32 to 41% (four won 27 to 38% before), among them roots with the Cellar at 38% (20%), and the strong builds take 1.17 to 1.45 times their year 3 quotas (1.09 to 1.27), so a season is met by the engine, not one spike night. Bloom with Busy Bees and every page slot is still the strongest build, 60% (56%).
- **The twists are worth 16 to 28 points of wins** to every strong build (9 to 24 at round 5's rows), 8 to the bot's own buying.
- **Scoops:** the roots builds' days with three or more scoops above the usual refill fell from about 4,600 of 12,000 to about 530, and their scoops left at dusk from 2.6 to 1.7 a day (rootsplus), with about 1,900 more coins unspent at the end; the bloom builds, which spend their scoops, buy as many as before and leave 1.2 a day on the days they have three or more extra (1.4).

Pass rates per season, decent bot (a new player's catalogue), before and after; the quota is the median a season asked (a hitch takes its share off, Cold Frame a fifth off winter):

| Decent bot | spring | summer | autumn | winter | clears the year |
|---|---|---|---|---|---|
| Year 1, before and after (170, 260, 300, 350) | 96% | 98% | 94% | 98% | 87% |
| Year 2, before (430, 600, 710, 790) | 94% | 74% | 69% | 81% | 34% |
| Year 2, after (430, 620, 740, 830) | 95% | 75% | 65% | 73% | 29% |
| Year 3, before (median 900, 960, 1,040, 1,100: at least 0.95 of its own year 2) | 76% | 80% | 85% | 100% | 18% (won) |
| Year 3, after (900, 980, 1,060, 1,140) | 71% | 90% | 97% | 97% | 18% (won) |

The guided first run clears years 1 to 3 at 96%, 28% and 14% (91%, 28% and 13% before): its summer, asking 180, is met every time at a median 1.52 times the quota (94% at 1.19, asking 230). The strict bot clears them at 85%, 23% and 15% (85%, 30%, 14%); the first run after the guided one at 90%, 28% and 21% (90%, 35%, 19%). The decent bot takes the hitch at 43% of its stalls (0% before).

How the numbers were set: every player was played through all twelve seasons with a missed season going on (`deck-fit play`, 150 runs, the final rules), then rows were priced together, a season with a hitch at its share less. Year 2 summer to winter were raised until the strong builds cleared year 2 1 to 9 points less often, holding the decent bot near 30%; year 3 was held a step over year 2 winter (900 against 830) and grown 80 a season, which keeps the roots builds, whose takes stop growing after year 2 (about 1,050 to 1,100 a season), in the race into winter. A row growing to 1,400 left every roots build at 0%. The hitch shares were left at 15, 15, 12 and 10% once the hitch was taken at about a third to a half of the stalls.

### Round 7: an engine for every run, twists aimed at it

The seventh playtest scored the first quarter hour 7 of 10 and the game 5: one engine decided the run (beehives with Busy Bees), and the twists were coupons. Measured before (the committed round 6 build, a `git archive` copy) and after, 200 runs each.

**The engine table** (`deck-strategies.ts`, whole catalogue): a decent bot committed to each engine (it takes its engine at the first stall where the build offers one, all four on offer here, then pins the engine's page and buys its cards first, else shops as the bot does). Before, the same commitment with the cards and pages that build had. Clears of year 2, and wins:

| Engine | Before | After |
|---|---|---|
| Bees (beehives, sunflowers, Busy Bees) | 56%, 42% | 61%, 34% |
| Tall (corn, sunflowers; Tall Rows after) | 42%, 32% | 59%, 41% |
| Hot (chilies; Hot Beds after) | 35%, 19% | 50%, 39% |
| Vines (beans, strawberries; Trellis after) | 36%, 23% | 51%, 27% |
| The bot's own buying (a random engine after) | 36%, 21% | 57%, 37% |
| No engine at all (the pick left alone) | 36%, 21% (no pick then) | 2%, 1% |

- Before, the bees won 42% and the others 19 to 32%, with the beehive a rare roll; after, every engine clears year 2 50 to 61% of the time and wins 27 to 41%, the bees no longer first. A run that turns the engine down cannot win (the stall asks for a pick before the way on opens, so a player always has one).
- Takes over quota (median, years 2 and 3): bees 1.53 and 1.25, tall 1.54 and 1.46, hot 1.53 and 1.44, vines 1.42 and 1.26. The hot engine starts slowest (year 1 cleared 82%, against 94 to 96% for the others): its chilies are sown, not stood.
- How the pages were set (deck-strategies at the old quotas, 60 runs a variant, then deck-fit): with Busy Bees at x1.5 and hives stacking the bees took 2.5 times their year 2 quotas against 1.8 to 1.9 for the others; one hive's bloom at most moved them little (2.47), Busy Bees only near a hive (not the sunflower's crop) little more; x1.25 brought them to 2.04. Trellis at +1 to every crop beside beans and strawberries, themselves too, took 2.1 times year 2; without the beans blooming each other 1.5; at +2 to the other crops 1.97. Hot Beds at four picks took 2.4, at three 1.9. Tall Rows at +2 a neighbour took 2.7, at +1 1.8; corn a night sooner 1.9. Priced at round 7's rows (deck-fit, 100 runs), Busy Bees won 30% at x1.25, 54% at x1.35 and 77% at x1.5 (x1.3 shipped), and corn two nights sooner 43% against 24% for one. Trellis is the most sensitive: at +2 from one bean or strawberry it won 30%, from two 77%, at +3 from one 73%, so the vines engine ships at the low end (27% in the table above, the widest gap to the best, 14 points).

**The twists** (deck-strategies, deck-seasons, deck-twists):

| | Before | After |
|---|---|---|
| Hitches offered that miss the build (under 5% of last season's take), engine policies | 22 to 28% (crows 53 to 73%, frost 16 to 25%, sunflowers up 1 to 23%) | 0% of 931 to 1,097 a policy |
| Decent bot (a new player's catalogue): the hitch picked | 43% of 714 stalls | 44% of 961 |
| Decent bot: seasons met after the hitch, after the help | 80%, 81% | 87%, 85% |
| Strict bot: the same | 76%, 79% | 87%, 85% |
| Engine policies: seasons met after the hitch, after the help | bees 90, 91; tall 85, 88; hot 83, 81; vines 81, 86 | bees 89, 88; tall 92, 88; hot 89, 92; vines 88, 84 |

- The round 6 bot already met its seasons about as often after either pick, since it picks by playing the season ahead; what changed is what it is offered. A quarter of round 6's hitches would have cost the build under 5% of a season (crows with a scarecrow standing above all) and took 10 to 15% off; now none is offered under 6% (`minHit`), and each takes off what it would cost (deck-twists, the bot's own buying: a glut expected 25% of the take and cost 19% played; frost 25% and 11%, since the bot sows elsewhere; a page at rest 28% and 26%). The help beside it is paired by worth.
- Unit test (`tests/deck-r7.test.ts`): over bot-played runs to the stalls of years 2 and 3, every hitch offered costs at least `minHit` of the season just played, its quota cut is that cost, no crows come with a scarecrow standing and no sunflowers face up; it fails on round 6.

Pass rates per season, decent bot (a new player's catalogue, a random engine at the first stall; the quota is the median a season asked):

| Decent bot | spring | summer | autumn | winter | clears the year |
|---|---|---|---|---|---|
| Year 1, before (170, 260, 300, 350) | 96% | 98% | 94% | 98% | 87% |
| Year 1, after (170, 320, 400, 470) | 96% | 99% | 98% | 99% | 93% |
| Year 2, before (430, 620, 740, 830) | 95% | 75% | 65% | 73% | 29% |
| Year 2, after (540, 860, 1,060, 1,200) | 99% | 87% | 78% | 82% | 52% |
| Year 3, before (900, 980, 1,060, 1,140) | 71% | 90% | 97% | 97% | 18% (won) |
| Year 3, after (1,250, 1,350, 1,450, 1,550) | 81% | 82% | 78% | 89% | 24% (won) |

The strict bot clears years 1 to 3 at 93%, 54% and 25% (85%, 23%, 15% before); the first run after the guided one at 99%, 52% and 23% (90%, 28%, 21%). Year 1 is a little kinder than before (the hot engine, the slowest start, needs it: at 340, 430, 500 it cleared year 1 79% of the time). Coins left when a run ends rose (median 1,732 against 703), and 15% of tray slots repeat the stall before (7%), since the engine's cards keep a slot.

How the rows were set: every player played all twelve seasons with a missed season going on and the last winter played out (`deck-fit play`, 100 runs, the shipped rules), then rows were priced together: years 2 and 3 were raised until the four engines won about a third of the time within 10 points of each other (bees 31%, hot 37%, tall 40%, vines 34%; at 520 to 1,150 and 1,200 to 1,500 they won 45 to 48% bar the vines at 40%), year 1 from summer until the decent bot cleared it about 94%.

The guided spring asks 90 (70): the bot met 70 on day 5 every time (85 to 89 by then); at 90 with day 6's second radish the careful line (the strict bot) meets it on day 6 every time (89 by day 5, 106 by day 6), the decent bot on day 5 in 15% of runs and misses in 2.5%. Its summer asks 240 (180): with an engine from its first stall the guided bot took a median 2.3 times 180.

### Round 8: engine pages that level up, a curve that rises, twists you can weigh

The eighth playtest scored the first quarter hour 7 of 10 and the game 5, 0 wins in 4 runs, every run dead with 1,979 to 5,711 coins unspent. Measured before (the committed round 7 build, a `git archive` copy) and after, 200 runs each.

**The engine table** (`deck-strategies.ts`, whole catalogue, all four engines on offer to the policy committed to one): clears of years 1 and 2, wins, the median take over quota in year 1, and the coins left when a run that reached year 3 was lost:

| Engine | Before | After | Year 1 take/quota, before and after | Coins left, a lost year 3 run |
|---|---|---|---|---|
| Bees | 96%, 61%, 34% | 82%, 54%, 41% | 1.62, 1.28 | 2,441, then 2,030 |
| Hot | 82%, 50%, 39% | 73%, 52%, 37% | 1.31, 1.25 | 2,238, then 2,090 |
| Vines | 94%, 51%, 27% | 83%, 47%, 34% | 1.55, 1.34 | 2,102, then 1,618 |
| Tall | 96%, 59%, 41% | 69%, 50%, 42% | 1.65, 1.28 | 2,267, then 1,911 |
| The bot's own buying (a random engine) | 93%, 57%, 37% | 80%, 52%, 41% | 1.57, 1.32 | 2,451, then 2,463 |
| No engine | 22%, 2%, 1% | 3%, 1%, 0% | 1.13, 1.06 | |

- **The engines win 34 to 42%,** 8 points apart (27 to 41% before, 14 apart; the tester's 40-run sim had the bees at 60%). Year 1 is no longer free: the median take over quota from summer to winter is 1.24 to 1.50 for every engine (1.57 to 2.00 for bees, tall and vines before), and the hot engine's first summer is met 95% of the time (93%).
- **Levels are bought:** of the runs that reached year 3, every one had its page at II and 77 to 98% at III (800 and 1,800 coins). The coins left when such a run is lost fell for every engine but the bot's own buying (about 1,600 to 2,100, from 2,100 to 2,450); a won run still ends with coins, since nothing is left to buy.
- **The take over quota by season** (the bees, before then after): 1.22, 1.57, 1.85, 2.00, 1.99, 1.48, 1.31, 1.40, 1.32, 1.33, 1.29, 1.08 against 1.22, 1.29, 1.31, 1.43, 1.53, 1.46, 1.47, 1.68, 1.69, 1.56, 1.51, 1.12. The walkover from year 1 summer to year 2 spring is gone, and so is the wall after it.

**The curve** (`deck-seasons.ts`, the decent bot with a new player's catalogue and a random engine): per-season pass rates; the quota is the median a season asked (a hitch takes its share off):

| Decent bot | spring | summer | autumn | winter | clears the year |
|---|---|---|---|---|---|
| Year 1, before (170, 320, 400, 470) | 96% | 99% | 98% | 99% | 93% |
| Year 1, after (170, 360, 480, 590) | 96% | 96% | 93% | 92% | 79% |
| Year 2, before (540, 860, 1,060, 1,200) | 99% | 87% | 78% | 82% | 52% |
| Year 2, after (730, 920, 1,080, 1,220; asked 570, 720, 890, 920) | 89% | 87% | 87% | 94% | 50% |
| Year 3, before (1,250, 1,350, 1,450, 1,550) | 81% | 82% | 78% | 89% | 24% (won) |
| Year 3, after (1,440, 1,640, 1,820, 2,000; asked 1,140, 1,260, 1,440, 1,600) | 90% | 92% | 88% | 93% | 34% (won) |

No season is met less than 87% of the time by the decent bot (78% before), 81% by the strict bot, 82% by the guided run. The strict bot clears years 1 to 3 at 79%, 44% and 28% (93%, 54%, 25% before); the guided run at 90%, 55% and 35% (96%, 53%, 27%); the first run after it at 86%, 54% and 35% (99%, 52%, 23%). Coins left when a decent bot's run ends: median 1,188 (1,732).

**The twists** (`deck-twists.ts`, the bot's own buying, 30 runs; shares of a season's take; "said" is what the stall says in coins):

| Twist | Before: expected, played, cut | After: expected, played, cut, said |
|---|---|---|
| Frost | 25.3%, 10.5%, 25.3% | 36.1%, 15.5%, 26.5%, 15.2% |
| Glut | 24.5%, 19.4%, 24.1% | 27.3%, 21.4%, 31.7%, 24.6% |
| A page at rest | 27.6%, 26.1%, 27.1% | 23.6%, 24.7%, 28.1%, 19.0% |
| A buyer | 10.7%, 16.8% | 9.0%, 8.2%, said 9.0% |
| Good company | 18.0%, 23.1% | 24.4%, 16.4%, said 24.5% |
| Long picks | 8.7%, 12.7% | 10.3%, 17.7%, said 10.4% |
| Sunflowers all round | 7.0%, 2.9% | 5.7%, 13.7%, said 5.9% (18 offers) |

- A hitch's cut is now its careful cost and the help's worth: frost says 15.2% and costs 15.5% played. Per stall the help played +11.5% and the hitch +9.5% (its cut less its cost), and the hitch was the better pick at 46% of 117 stalls; the bot took the hitch at 54 to 72% of stalls (43 to 53% before) and met the season after either about as often (89% and 90%, decent bot).
- Stalls offering a twist aimed as the stall before: 0% for every policy (18 to 29% before); the most one hitch came in a run: 3 or 4 (4 to 7).
- The helps on few offers (long picks, sunflowers all round, good company) still swing between runs of this script; the buyer, the commonest, is said within a point of what it plays.

How the numbers were set: `deck-fit.ts play` (120 runs, every player, the round's rules) and then `fit` over rows of quotas, then `deck-strategies` at 120 and 200 runs for the engine levels. Year 1 from summer was raised until every engine's year 1 take fell under 1.5 times its quotas; the gentler starts came from `/tmp` year 1 runs (Busy Bees x1.2, one corn: the tall engine with two corn took 1.53 times year 1 and met 99 to 100% of its seasons; Hot Beds with four chilies met year 1 summer 96% against 83% with two). Years 2 and 3 were fitted so the decent bot's per-season rate falls gently through the run, year 2 spring held under a quarter above year 1 winter (the year's turn test). The levels were the most sensitive numbers: Tall Rows at +2 and +3 won 90% at the old rows, Busy Bees II and III at x1.45 and x1.75 won 29%, at x1.5 and x1.85 54%, at nearly the same rows; the shipped levels are the ones that brought the four within 10 points.

### Round 9: every engine on offer and none that runs away, a dealt first hand, a guided spring with a choice

The ninth playtest scored the first quarter hour 7 of 10 (engagement 6) and the game 5: the engine a run was handed decided it (tall won with 8,908 coins unspent; hot died in year 1 autumn), a run died on the draw in its first spring, and the crow lesson lied. Measured before (the committed round 8 build, a `git archive` copy, with this round's scripts) and after, 200 runs each unless said.

**The engine table** (`deck-strategies.ts`, whole catalogue, all four engines on offer to the policy committed to one): clears of years 1 and 2, wins; the most any season's median take over its quota reached (the snowball measure, read before the last winter, which ends the night it is met); the median of each year 2 season's best harvest; coins a won run ends with:

| Engine | Before: Y1, Y2, wins | After | Most a season's median reached, before and after | Best harvest of a year 2 season, median | Coins at the end of a won run |
|---|---|---|---|---|---|
| Bees | 82%, 54%, 41% | 87%, 58%, 34% | 1.69, 1.57 | 154, 180 | 3,767, 3,236 |
| Hot | 73%, 52%, 37% | 87%, 67%, 40% | 1.63, 1.61 | 108, 165 | 3,883, 3,203 |
| Vines | 83%, 47%, 34% | 87%, 52%, 34% | 1.70, 1.63 | 140, 189 | 3,604, 2,998 |
| Tall | 69%, 50%, 42% | 86%, 59%, 36% | 1.90, 1.61 | 300, 282 | 3,970, 3,284 |

- **Every engine clears year 1 86 to 87% of the time** (69 to 83% before) and wins 34 to 40% (34 to 42%), 6 points apart. No engine's median season runs past 1.63 times its quota (tall reached 1.90 in year 2 winter). A single year 2 harvest has a median of 10 to 24 coins with every engine (the same before); the best harvest of a year 2 season has a median of 165 to 282 (108 to 300 before: the corn's lead over the chili fell from 2.8 times to 1.7).
- **Coins after level III:** level IV is bought in 28% of the tall runs (the other engines alike); a won run ends with 2,998 to 3,284 coins, down from 3,604 to 3,970; the tenth of runs with the most end with 3,699 to 4,545 (4,296 to 4,932). The decent bot's runs end with a median of 1,849 coins (1,188), since they last longer.
- How the numbers were set: `deck-fit play` for each engine and bot (150 runs) and an in-process grid over rows, then `deck-strategies` at 150 and 200 runs for the engine numbers. Hot Beds is the most sensitive number of the four: x1.55 at level I won 29%, x1.6 43%, x1.75 92%, x2 98% (each chili's bloom stacks). Tall Rows III at +2 reached 1.70 in year 3 spring; at +1.8 1.61.

**The first spring** (`deck-seasons.ts --upto=1`, 500 seeds): with a dealt carrot and radish and a quota of 160, the decent bot meets it 98% of the time (95% before), the strict bot 98% (95%), and a weak one (`--only=loose`: noise 0.4, one play deep) 80% (59%). The dealt hand alone took the weak bot to 67%, a quota of 150 to 91%.

**The curve** (`deck-seasons.ts`, the decent bot with a new player's catalogue and a random engine; the quota is the median a season asked):

| Decent bot | spring | summer | autumn | winter | clears the year |
|---|---|---|---|---|---|
| Year 1, before (170, 360, 480, 590) | 96% | 96% | 93% | 92% | 79% |
| Year 1, after (160, 380, 500, 640) | 99% | 99% | 97% | 95% | 90% |
| Year 2, before (asked 570, 720, 890, 920) | 89% | 87% | 87% | 94% | 50% |
| Year 2, after (840, 1,030, 1,200, 1,370; asked 660, 770, 960, 1,010) | 93% | 86% | 85% | 93% | 57% |
| Year 3, before (asked 1,140, 1,260, 1,440, 1,600) | 90% | 92% | 88% | 93% | 34% (won) |
| Year 3, after (1,560, 1,760, 1,940, 2,000; asked 1,260, 1,340, 1,510, 1,600) | 89% | 92% | 79% | 95% | 35% (won) |

The decent bot's most a season's median reached is 1.52 (1.60 before). The strict bot clears years 1 to 3 at 83%, 46% and 30% (79%, 44%, 28%).

**The guided year** (`deck-seasons.ts --only=careful` and `--only=guided`: the guided run with no noise, the careful line, and with the decent bot's): median take over quota per season, and the share of runs meeting it:

| Guided year | spring | summer | autumn | winter | clears year 1 |
|---|---|---|---|---|---|
| Careful line, before (90, 240, 420, 520) | 1.18, 100% | 1.82, 100% | 1.40, 95% | 1.37, 91% | 87% |
| Careful line, after (75, 330, 440, 560) | 1.12, 100% | 1.45, 99% | 1.43, 96% | 1.39, 93% | 89% |
| Decent bot, before | 1.13, 98% | 1.65, 100% | 1.39, 97% | 1.45, 95% | 90% |
| Decent bot, after | 1.20, 100% | 1.31, 93% | 1.41, 94% | 1.52, 98% | 86% |

The summer walkover is gone (1.82 to 1.45 for the careful line, 1.65 to 1.31 for the decent bot) and the spring is met on its last nights; autumn and winter stay at 1.39 to 1.52 for the bots. Brought under 1.3 (summer 340, autumn and winter 0.92 of the row) they asked 1.27 to 1.42 and the decent bot cleared year 1 76% of the time: the bots' takes vary too much from run to run for every season to sit near its last day and still be met. A person plays below the bot (the ninth playtest took 441 against the bot's median of 730 in winter, misled by the crow lesson), so the gap left there is kept.

**The guided spring's choice:** the careful line takes the radish (it pays tonight) and has 73 by day 5 and 84 by day 6; made to take the carrot it has 83 and 94; the decent bot's median is 90 and 91 either way. So the two are close and which is better depends on the board: a real choice, and the quota (75) is met on day 6 by the radish's line, on day 5 or 6 by the carrot's.

**The twists** (`deck-twists.ts`, the bot's own buying, 30 runs; and 20 bot runs read stall by stall):

| | Before | After |
|---|---|---|
| Per stall: the help played, the hitch played (its cut less its cost); the hitch the better | +11.5%, +9.5%; 46% of 117 | +15.9%, +13.7%; 51% of 156 |
| Hitches whose cut was clipped (cut under its careful cost and the help's worth) | 10 of 102 stalls | 0 of 98 (the full cut past 35%: 2 of 109) |
| A hitch aimed as the one two stalls back | 15 of 102 (the same row) | 7 of 98 (frost on the same crop's row counts); the tall engine's runs 13% |
| A help under 8% | buyers of 4 to 8% | none |

- What the stall says against what the twist played (after): a buyer 13.7% said and 15.0% played, good company 21.9% and 18.6%, long picks 15.4% and 17.4%, a glut 14.5% and 12.4%, a page at rest 26.9% and 32.0%; frost is said at 7.6% and costs 12.0% played (its careful share, `adapt.frost` 0.42, is low).

### Round 10: each engine on its own crops, hitches priced by what they cost, a level climb

The tenth playtest found no P0 or P1 and scored the first quarter hour 7 of 10 and the game 5.5. Measured before (the committed round 9 build, a `git archive` copy, with this round's scripts) and after, 200 runs each unless said.

**The engine table** (`deck-strategies.ts` and the new `deck-crops.ts`, whole catalogue, all four on offer to the policy committed to one): clears of years 1 and 2, wins; the share of seasons (from year 1 summer) the engine's own crops took the most, the median share of a season's take from them, from radishes and carrots, and from its page's bonus on those:

| Engine | Before: Y1, Y2, wins | After | Own crops top, before and after | Own crops' share | Radishes and carrots' share | Bonus on them |
|---|---|---|---|---|---|---|
| Bees | 87%, 58%, 34% | 87%, 53%, 32% | 87%, 93% | 78%, 86% | 19%, 11% | 16%, 0% |
| Hot | 87%, 67%, 40% | 87%, 59%, 37% | 98%, 98% | 81%, 84% | 9%, 7% | 5%, 3% (the chili's own x1.5) |
| Vines | 87%, 52%, 34% | 87%, 63%, 37% | 48%, 100% | 64%, 93% | 36%, 6% | 35%, 0% |
| Tall | 86%, 59%, 36% | 82%, 50%, 34% | 97%, 97% | 72%, 76% | 6%, 5% | 0%, 0% |
| The bot's own buying (a random engine) | 90%, 66%, 42% | 90%, 61%, 33% | | | | |
| No engine | 3%, 0%, 0% | 1%, 0%, 0% | | | | |

- **Every engine's own crops top the season 93 to 100% of the time; the engines win 32 to 37%,** 5 points apart, and clear year 1 82 to 87%. A season's top crop: bees strawberries, beans and pumpkins (40, 35, 16%), hot chilies (81%), vines beans and strawberries (52, 43%), tall corn (97%).
- **Busy Bees' top crop still changes most** (68% of the seasons in years 2 and 3), Tall Rows' least (9%). A crop near a hive is the bees' own, whichever crop.
- How the numbers were set: `deck-crops` at 100 runs per trial and `deck-fit play` for all nine players (150 and 200 runs), then `fit` over rows. Year 1: three corn took the tall engine's median take to 1.59 times round 9's row, past the round 8 test's 1.5; +0.9 bloom or a cap of three neighbours brought it down only with year 1 clears of 78 to 81% (its low tail sits at the quota), so the row rose instead (summer 410, autumn 540, winter 680). Tall Rows' levels are round 9's (+1.3, +1.55, +1.8 won 25%); Trellis at +1.2 won 38% and at +1.3 45%, so +1.25; Hot Beds x1.65, then x1.7 and x1.8 at I and II.

**Corn, feast or famine** (`deck-crops`, tall engine, before and after): a season's biggest harvest is a median 26% of it and p90 40% (the same), and a corn came once or not at all in 1% of seasons (the same). The bot plays its corn better than the tester did: the third corn gives a person more chances of one in hand, and the bot's figures do not move. This is a change for a person's draws, not one the sims can show.

**The first summers** (`deck-crops`): the tenth playtest's Hot Beds run missed by 1 with a carrot at 8 and a strawberry at 10. Hot Beds now takes a median of 537 in year 1 summer (505 before), its crops 76% (72%), its best harvest 56 (49).

**The curve** (`deck-seasons.ts`, the decent bot with a new player's catalogue and a random engine): pass rate and median take over quota per season, and the clear rates:

| Decent bot | spring | summer | autumn | winter | clears the year |
|---|---|---|---|---|---|
| Year 1, before (160, 380, 500, 640) | 99%, 1.36 | 99%, 1.47 | 97%, 1.46 | 95%, 1.47 | 90% |
| Year 1, after (150, 410, 540, 680) | 100%, 1.44 | 100%, 1.35 | 95%, 1.40 | 93%, 1.40 | 88% |
| Year 2, before (840, 1,030, 1,200, 1,370) | 93%, 1.52 | 86%, 1.44 | 85%, 1.37 | 93%, 1.48 | 57% |
| Year 2, after (900, 1,090, 1,250, 1,540) | 87%, 1.43 | 90%, 1.40 | 89%, 1.42 | 94%, 1.44 | 57% |
| Year 3, before (1,560, 1,760, 1,940, 2,000) | 89%, 1.37 | 91%, 1.51 | 78%, 1.26 | 95%, 1.12 | 35% (won) |
| Year 3, after (1,700, 1,860, 2,020, 2,250) | 86%, 1.35 | 85%, 1.35 | 88%, 1.48 | 89%, 1.12 | 33% (won) |

- **The wall is gone:** year 3 autumn is met 88% of the time (78%), and no season's pass falls below 85%. From year 1 summer to year 3 autumn the medians run 1.35 to 1.48 (1.26 to 1.52). The last winter ends the night it is met, so its take stops at the quota.
- **Above the round's aim of 1.1 to 1.4, on purpose:** a row raised far enough to bring every median under 1.4 took the wins under 30%: the takes spread too widely from run to run for every season to sit that close to its quota. The most any engine's median season reached before the last winter: bees 1.48, hot 1.55, vines 1.43, tall 1.66 (1.57, 1.61, 1.63, 1.61 before); the tall engine's spread is the widest.
- The strict bot clears years 1 to 3 at 83%, 44% and 27% (83%, 46%, 28%); the guided run at 83%, 53% and 28% (86%, 54%, 25%); the careful line at 88%, 44% and 24%.

**The twists** (`deck-twists.ts --depth=2 --buys`, the bot's own buying, 200 runs before and 400 after, played ahead as the run plays): in coins, what the clipping says, what it played, the quota cut:

| | Before | After |
|---|---|---|
| The bot took the hitch | 62% of 991 stalls | 45% of 1,935 |
| Frost: said, played, cut; played over cut | 113, 158, 348; 0.45 | 262, 245, 334; 0.77 |
| A glut | 197, 211, 399; 0.48 | 341, 323, 414; 0.78 |
| A page at rest | 328, 430, 509; 0.78 | 425, 426, 491; 0.84 |
| Every hitch, the sum of costs over the sum of cuts | 0.52 | 0.78 |
| Hitches aimed at a free crop | 24 of 991 | 0 of 1,935 |
| A buyer: said, played | 186, 199 | 243, 255 |
| Good company | 292, 263 | 357, 346 |
| Long picks | 221, 263 | 298, 293 |
| Per stall: the help played, the hitch played (its cut less its cost); the hitch the better | +15.5%, +16.5%; 53% | +18.2%, +9.7%; 31% |

- By the decent bot's own stalls (`deck-seasons`, a new player's catalogue) the hitch is picked 41% of the time (61%), the strict bot's 40% (62%), the guided run's 43% (68%). The engines differ: vines 33%, hot 41%, bees 47%, tall 51%. A season is met after the hitch 92% of the time and after the help 87%.
- **A person weighs it otherwise than the bot:** at a cut near its cost a hitch leaves about the same coins over the quota as no twist, and a help adds to them, so the coins over the quota favour the help. The bot, reading take over quota, sees a smaller quota with less at risk. The tester's "the hitch is always right" is answered; whether a person now always takes the help is for the next playtest.
- How the numbers were set: `adapt` and `worthTimes` against said and played; `helpShare` 0.1 to 0.25 and `pairNear`, `pairSpread` for the pick rate. A twist judged two plays deep instead of one left the pick at 40% (no change kept: the bot's own depth is not what favoured the help); a pair chosen to weigh the same, then the share of the help left out of the parity, moved it from 34 to 45%.
- A hitch aimed as the one two stalls back comes at 5% of stalls (3% before), at 25% for the tall engine (13%), whose season has little but corn to aim at. Stalls with no help worth 8%: 0.8%, a season with nearly all its coins in one crop.

**The first spring** (`deck-strategies`): the ledger says what is still to go from day 4, and it asks 150 (160). No-engine runs meet it 100% of the time, and clear year 1 1% (3%): the engine is still what makes year 1.

**The guided spring** (`deck-guided-days.ts`, 100 and 200 runs, by night): kept at 75. The careful line has 73 by night 5 and 84 by night 6 with the day 3 radish, 80 and 97 with the carrot, the line the tenth playtest took. Asked 80, with a third radish on day 6, the decent bot met it on night 6 in 94 to 98% of runs, but deck-lessons' line by the notes ended its desktop spring at 75 of 80; asked 85, the decent bot missed it in 11% of its runs. Deferred: stakes on day 6 are not worth a first season lost by following the notes.

## Checks

With a dev server running (`npx vite --config scripts/deck-vite.config.ts` on 5252, or the lead server on 5247; each script takes a base url as its first argument):

```bash
npx vitest run tests/deck                # rules: the day, growth, scoring, hazards (pests at half pay, the dawn crow, odds by season), the shop (four
                                         #   goods with a seed and an uncommon, hazard answers ahead of the hazard, page swaps and slots, four
                                         #   scoops), meta (unlocks by seasons met), saves, determinism, timed previews (next season too), the
                                         #   forecast, the plot carrying over (crops, objects, the Long Furrow), quotas, the guided deals; round 3:
                                         #   seed costs, scoops back (two a night, the strawberry, shears, crows), the sunflower and Busy Bees,
                                         #   the Root Cellar, answers kept in stock, the Long Furrow's scoop, unlocks across runs, the crow
                                         #   lesson's scarecrow check, cost taught a piece at a time; round 4: giving up recorded like a missed
                                         #   quota (mid-season and at the stall), the finish line and wins, the last winter's too-late seeds,
                                         #   the Root Cellar paired, Market Day in previews and readings, one answer slot (none on fresh
                                         #   stock, none once enough), new stock each year, trays that do not repeat; each fails on round 3;
                                         #   round 5: the last winter ends the night it is met, year 3 against the run's own year 2 autumn
                                         #   and winter, the carry (the playtest's 817 then 463 of 510), the softer second spring, two
                                         #   twists a stall from year 2 (one of each kind, picked, held all season, logged, not repeated),
                                         #   each twist's effect and its previews, calm and crow seasons, stock that never runs dry
                                         #   (improved, on the year's first tray), the spent and crow lessons, the record of wins and the
                                         #   plain copy; each of the ten fails on round 4 (a `git archive` copy); round 6: a hitch takes its
                                         #   share off the quota and the stall knows what each twist would ask, the bot takes a hitch at
                                         #   some stalls and a help at others, the guided summer asks 180, year 3 the same fixed row
                                         #   whatever year 2 took (round 5 gave 1,510 to a strong year 2), a scoop sold only to a bench
                                         #   that ran short, a neighbour's new total on its mark and the improve note counting the Root
                                         #   Cellar; each of the six fails on round 5 on an assertion (a `git archive` copy)
npx vitest run tests/deck-r7.test.ts     # round 7: a run's first stall offers three engines (guided too), taken home free, its
                                         #   cards in stock after; each engine's page (Busy Bees and one hive's bloom, Hot Beds'
                                         #   picks, Trellis once, Tall Rows per crop); over bot-played runs no hitch that misses
                                         #   the build, its quota cut its expected cost, no crows with a scarecrow standing, the
                                         #   glut and frost aimed and named; a buyer only for a crop the run grows; a crow every
                                         #   morning; Green Thumb only for a bench that ran short; the toss lesson only for a card
                                         #   with nowhere to go; the can's crop shows tonight's pay; the guided spring's last
                                         #   night; a crow takes a perennial's pick; the engines said plainly. Each fails on round
                                         #   6 on an assertion (a `git archive` copy)
npx vitest run tests/deck-r8.test.ts     # round 8: both twists carry a number from the estimate they were priced by, the help
                                         #   "About N more coins.", the hitch "About N fewer coins.", its cut its careful cost and
                                         #   the help's worth; the engine page pinned at its next level from year 2, priced, paying
                                         #   at that level, said in its own words, two more levels for every engine; the decent bot
                                         #   buying a level by year 3; year 1 under 1.5 times its quotas with every engine; year 2
                                         #   spring no walkover; a new run after a finished one with every piece; the spent lesson
                                         #   on a stuck hand; no twist aimed as the stall before, no glut and buyer see-saw, no rest
                                         #   of another engine's page, crows kept off by a scarecrow in the tin; frost and
                                         #   sunflowers all round priced as they play; no engine card on the engine stall's tray.
                                         #   Each of the 13 fails on round 7 on an assertion (a `git archive` copy)
npx vitest run tests/deck-r9.test.ts     # round 9: all four engines at the pick (guided too); Hot Beds above x1.5 from level I and
                                         #   rising with its level; Tall Rows II at most +1.5, III at most +2, two corn; the tall
                                         #   engine clearing year 1 at round 8's row; a dealt carrot and radish in every first
                                         #   hand; the crow lesson naming the ripe crop outside the scarecrow's ground; the guided
                                         #   day 3 pair, its lesson, the previews of the trade, the other back in the tin, and the
                                         #   careful line meeting the spring on its last nights either way; the reason line only
                                         #   for the aimed plot; a bonus the crow may take flagged, and its line; over bot runs no
                                         #   clipped cut, no help under 8%, a hitch seldom aimed as two stalls back; level IV after
                                         #   III; no idle scoops after the quota is met; a lesson waiting behind a note; no engine
                                         #   page on the engine stall's cork board; the year's stock at the stall after winter.
                                         #   Each of the 16 fails on round 8 on an assertion (a `git archive` copy)
npx vitest run tests/deck-r10.test.ts    # round 10: Busy Bees, Hot Beds and Trellis on their own crops and not on radishes and carrots; three corn; no
                                         #   hitch on a free crop; frost dearer with no room elsewhere; the cut the hitch's cost and a small share of
                                         #   the help; "Ripens next season." first; "to go" from day 4 and a first spring of 150; a cut in coins of the
                                         #   take; a help that weighs the same with every kind still offered. Each of the 8 fails on round 9 on an
                                         #   assertion (a `git archive` copy)
npx tsx scripts/deck-crops.ts 200 [policy]   # round 10: for each engine, the share of the take from its own crops and how often they top a season, the
                                         #   share from radishes and carrots and its bonus on them, the top crop by season, the biggest harvest's
                                         #   share (feast), seasons its own crop came once or not at all (famine), and year 1 summer; --tune=key:value
npx tsx scripts/deck-guided-days.ts 200 [--pair=radish|carrot] [--quota=n] [--deal=6:a,b,c]
                                         # round 10: the guided spring's take by night, careful line and decent bot, and the night the quota is met
node scripts/deck-returning.mjs          # round 8: a returning player's second run, phone (real touch) and desktop (mouse): the
                                         #   guided run ended, the loss ledger lists each season's twist, a fresh page by a real
                                         #   tap, every piece of the table there from the first dawn (the spent heap and the
                                         #   weather too), the first stall's line "Pick one to take home, free." with three cards
                                         #   large enough to read, no tray and no engine card for sale until a pick, a real tap
                                         #   picking one, the spent lesson on a hand stuck with three-scoop corn
npx tsx scripts/deck-twists.ts 30 [--policy=name]
                                         # round 7: each twist offered at the bot's stalls played ahead against no twist (same
                                         #   dice and bot): its expected cost or worth when offered against its played one, and
                                         #   the quota cut; hitches offered that would cost under `minHit`; round 8: what the
                                         #   stall says each would do, and per stall the help's played gain against the hitch's
                                         #   played net (its cut less its cost) and how often the hitch was the better;
                                         #   round 10: the share of stalls taking the hitch, each hitch's played cost over its quota cut in coins,
                                         #   said against played against cut in coins, hitches at a free crop; --depth=2 --buys plays ahead as the
                                         #   run plays (two plays deep, after the stall's shopping); --json=path, --first=n and --merge=a,b for
                                         #   chunks run side by side; --tune=key:value
npx tsx scripts/deck-strategies.ts 200 [policy...] --seasons [--noTwists]
                                         # round 9: the most a season's median take over quota reached (the snowball), the
                                         #   median single harvest and best harvest of year 2's seasons, coins at the end of a
                                         #   won run, runs at level IV, and hitches aimed as the one two stalls back
                                         # the tester's strategy table: stall policies on the bot's days, clears of years 1 to 3 and wins;
                                         #   round 6: which twist each policy took (the hitch's share, by hitch, crows with a scarecrow
                                         #   standing or not, a glut of the crop the run leans on or not, pairs picked both ways), and
                                         #   the scoops and cards left at dusk by scoops bought and by scoops above the usual three;
                                         #   round 7: the engine policies (eBees, eHot, eVines, eTall, and eNone that takes none;
                                         #   the first stall offers all four here), seasons met after the hitch and after the help,
                                         #   and hitches offered that miss the build (under 5% of last season's take, read from
                                         #   its harvests, so it runs on older builds); --tune=key:value plays any TUNING number;
                                         #   round 5: how often the best pattern changes between seasons in years 2 and 3 (the top crop, and
                                         #   the best harvest's recipe), with the twists or without, and the plain builds (no fresh stock,
                                         #   no page slots); round 8: the engine page's level when the run ends (and of the runs
                                         #   that reached year 3, with the coins left when one of those was lost), twists aimed as
                                         #   the stall before, and with --seasons the take over quota season by season (the curve);
                                         #   --tune=key:[json] for rows and levels
npx tsx scripts/deck-fit.ts play <player> 150, then fit [y2] [y3]
                                         # round 9: the careful player (the guided run with no noise), --guidedQuota= and
                                         #   --firstYear= to price the guided year, and the snowball (each season's median take
                                         #   over quota and the most of them) on every row
                                         # quota fit: each player's take per season with a missed season going on (TUNING.noEnd), then
                                         #   any row of quotas priced against all of them at once; round 6: a season with a hitch priced at
                                         #   its share less, year 3 a fixed row (--y3scale prices round 5's), --tune=key:value plays any
                                         #   other TUNING number (--tune=scoopIdle:99 for scoops sold as before); round 8:
                                         #   --set=key:JSON for rows and levels (--set=levelUp:{"tall":[2,2.5]})
npx tsx scripts/deck-balance.ts 200 0.15 # pass rates by season and year (--guided for the first run's set hands)
npx tsx scripts/deck-seasons.ts 200      # round 9: --only=careful (the guided run with no noise), --only=loose (a weak player:
                                         #   noise 0.4, one play deep), --upto=1 for the first spring over many seeds
npx tsx scripts/deck-seasons.ts 200      # years 1 to 3 season by season for the decent, strict and guided bots (round 5: and the second
                                         #   run, the first after the guided one, with its softer spring): pass rates, crops at a
                                         #   season's first dawn, first-night takes, coins left at the stall, page slots bought, stall variety;
                                         #   round 6: the median quota a season asked, and the share of twists taken as the hitch;
                                         #   round 7: seasons met after the hitch and after the help
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
                                         #   and says "Crops pulled last night put scoops back."; round 4: on touch a seed's first tap previews it
                                         #   and plants nothing, the second plants, the same preview a mouse hover shows (radish, beans); held
                                         #   beans mark where their +2 lands; the can's preview moons the crop it brings in; giving up from the
                                         #   almanac ends the run with its entry, its seasons and best harvest recorded; round 5: guided day 6
                                         #   asks no toss while every card has a job, the spent lesson waits for a spare card and goes away
                                         #   once there is none (then a real toss ends it), the first crow does not ask for a scarecrow in
                                         #   the tin, "Fill the pegboard", and at the stall before year 2 the two twists with their lesson,
                                         #   the way on asking for a pick, a real tap (phone) or arrows and Enter (desktop) picking one,
                                         #   and the table saying it; round 6 (R6_ONLY=1 runs just these): the guided run's first stall says
                                         #   summer asks 180, the hitch's trade line and a real tap on it moving the stall's head and the
                                         #   ledger, "carried over" and "Tap again to plant it." in the lesson strip with the twist stepping
                                         #   aside, never over row 1, a radish aimed by touch or pointer painting the carrot's new total;
                                         #   round 7: the first stall's three engines and their lesson, the way on asking for one, a
                                         #   tap (or arrows and Enter) pinning it, then the purse's lesson, the engine home with the
                                         #   run; the spent lesson not for a card only dear today
node scripts/deck-overlap.mjs            # no two labels, buttons, cards or slips overlap, in every state on a phone and a desktop; nothing
                                         #   in the shell's corner on the table or any sheet (almanac, rules, tin, spent, close-up, stall,
                                         #   throw out, improve, run end); the purse agrees with the rules after every stall action; every
                                         #   card's name and rule uncovered in hands of 5, 6 and 7; the stall's first tap and two-tap fresh stock;
                                         #   the bench at 3 to 8 scoops (lantern and heap full width, labels apart, all on the bench); every
                                         #   stall control on the screen without scrolling in every state; nothing on the stall moving between
                                         #   the two taps on any good, page or service; the page slot; a long run's entry keeps its button in view;
                                         #   round 3: the desktop bench (15 px labels, the tin labelled, an 80 px heap, 250 px tall), a lifted
                                         #   card's key number off the caption, a slip of seven bonuses wrapping with none covered, key letters
                                         #   over a tall first row and no note on them, reading a plot says what it pays, the Select stake 14 px;
                                         #   round 4: no crop's pixels in its plot covered by a neighbour (round 3: up to 22%), Market Day's
                                         #   stamp and readings, readings name rows only beside row numbers and say "tomorrow night", the beans'
                                         #   grammar, no reason under a taken plot, the quota note off the caption, the desktop's lifted card
                                         #   and close-up, garlic and ladybirds picture a pest, the win page, desktop goods 115 px and up;
                                         #   round 5: the twists at the stall (the way on asks, a tap picks, the table says it), frost on the
                                         #   bottom row (no plot offered, a tap plants nothing), a fresh radish and strawberry differ by pixel,
                                         #   the won run's own page (summary in the top half, best harvest, build, record, the run ended the
                                         #   night it was met), the hand still after a play (by real taps), the aim note for three aims only,
                                         #   off the plot and gone on planting, the desktop hand clear of the foot and no bare stretch over
                                         #   150 px in the side panel, the year's first stall with new stock, twists and a full almanac on
                                         #   one phone screen, and the scroll shade (ONLY=text runs just the states named so); round 6:
                                         #   takes and quotas of four and five digits and five-digit coins inside the ledger and purse
                                         #   (round 5: "1239 of 1550" ran 21 px past the ledger, under the purse), the carrot's new total on
                                         #   a dark chip inside its plot and the night paying it, kept pages 40 px tall on the phone (18
                                         #   before) and a swap by taps, the hitch's trade line, the scoop's slip (scoops to spare, none
                                         #   sold), phone goods 84 px and up where there is room, the season's note in the strip, "the other
                                         #   beans", the scarecrow before the crows, the improve note with the Root Cellar, "Run won";
                                         #   round 7: the first stall's engines and a tap picking one, the reason line clear of
                                         #   every chip and the slip (the playtest's beans case), coin totals by a gold coin (read
                                         #   from the canvas) and the can's crop showing tonight's pay (and the night paying it),
                                         #   "64 to go" from day 4 (round 10) inside the ledger, the hand closing its gaps after a rest,
                                         #   tall crops painting nothing over the plot above or the key letters' margin, one-line
                                         #   kept pages all in sight at 1280 by 800, and in every state no panel or body cutting
                                         #   off content without scrolling and its shade (the run's end with six new cards);
                                         #   round 8 (ONLY="round 8"): every first-row plot's note clear of the column letters in
                                         #   four columns, the twists' coins lines, the engine page's next level by two taps in its
                                         #   own words (nothing moving between them), the scoop's price, the engine pick large and
                                         #   alone, the almanac's word inside its book on the table and the stall
                                         # round 9 (ONLY="round 9"): a crow about washes the scarecrow's ground, greys a bonus
                                         #   from a crop it may take with "The crow may take the carrot first." off the caption;
                                         #   a big corn's slip in three lines with Busy Bees and Tall Rows named and Tall Rows'
                                         #   neighbours on one chip; the "End day" label clear of the screen's foot; four engines;
                                         #   a refused scoop saying "Not now"; the year's stock at the stall after winter
                                         # round 10 (ONLY="round 10"): a seed that ripens next season says so first, on a slip
                                         #   paler by pixel luminance than the same seed's on day 1; the throw-out and improve
                                         #   sheets with a full tin scroll and shade while more is below (`.sb-tinview`)
                                         # deck-lessons, round 9: guided day 3's pair ringed with "or", its line, the previews of
                                         #   the trade, the other back in the tin; deck-returning: four engines at the pick
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
