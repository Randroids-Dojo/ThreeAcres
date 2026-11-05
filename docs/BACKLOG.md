# Backlog

What the round 12 playtests found and left open. None of it is game-breaking or major: all three testers said a typical new player meets no major problem and the first 15 minutes feel good.

| Game | First 15 minutes | Whole game |
|---|---|---|
| Thistledown | 8 | 6.5 |
| Sunup | 8 | 6.5 |
| Seedbound | 8 | 7 |

All three games are thin late on, so the top item for each is the tester's biggest fun change. Every play was scripted in headless Chrome. No person has played these builds on a phone, pointer lock is unchecked, and sound was not judged.

## Bugs and misleading lines, fix these first

**Thistledown**
- Feed runs starve mixed pens. The hunt's arrow sent a gold clover into the ember pen, and `runTarget` then skips an empty feeder if anyone in the pen won't eat the crop. Five of seven embers starved. Send the crop to a pen where most eat it.
- "It got away." came before any tell on three of four getaways, cause unknown. Say why, or give more grace.
- With seven embers filling the jar, "Catch more" stayed up and pointed at a wild clover, because the gold clover's pen counts as holding clover.
- A tug can start on a downy hidden behind a bush. Refuse the first press without a line of sight.

**Sunup**
- The drag fights the walk stick in close view with field 3 owned. Rows 12 and 13 sit under the drawn stick; pushing north planted beans there, which cost 60 coins and can't be removed. Inside the stick's ring, the stick should always win.
- A row tap on a nearly empty can drops the rest of the row with no word. Refill first, or requeue the rest.
- "In time for the fair" contradicts "Plant by tomorrow": `forFair` only checks `s.day + days`, not whether there is soil today.
- "Fair Autumn 10: 1 of 5 taken this season, in full." counts filled requests, and runs to 10 words. Try "Fair Autumn 10: 1 of 5 filled."
- Sleep's crow question gives no size, and the card never names crows. It cost 7 crops once and 2 another time.

**Seedbound**
- Hitch numbers don't weigh. At all 13 hand-played stalls the help beat the hitch on both margin and purse, and a glut you can dodge cost far less than it said (said 320, cost about 80).
- "Drag a card too dear today to Spent." fired for a can and rain that were fine tomorrow. Limit it to cards above the bench's size.
- Corn's face prints 4 moons under Tall Rows, but it ripens in 2.
- "Its neighbour is pulled first." doesn't say which neighbour, and reason lines can cover column letters.

## Fun and depth

**Thistledown**
- Make a hunt losable: spook it twice and it moves to a new landmark with a new clue; a getaway in the fight ends it for the day. 49 of 49 catches landed, and hunts took 40 to 71 s.
- Coins stop mattering by about day 5; one 22 s sale paid 2,063. Add a late sink that changes play, and trim fluff order pay or goal rewards.
- Days empty out with little at stake: six unattended days lost nobody. A downy left out over a second night could go wild.
- Show "Catch more" under the sell goal too: about 77 s had nothing to act on.

**Sunup**
- Give each fair one named showpiece request, set at the season's start ("8 pumpkins by Autumn 10"), so soil is reserved for it and pairs compete against it.
- Coins stop mattering: 4,920 and reputation 18 on Winter 1, and a lost autumn ribbon cost nothing felt.
- Pairs mostly collapse to the bigger number, and rushes carry no real risk. Narrow the headlines, and give the safe side something real.
- The fair's wants run flat then jump (3, 2, 5, 5). Summer wants more.
- From Summer 4 it is a tidy chore loop: a simple script did the chores from Summer 7 and lost nothing but one early Sleep's crops.

**Seedbound**
- Make engine levels change the garden's shape, not add a small percentage (Bees II reaches 5 by 5, Hot Beds II counts diagonals), and raise year 3 to match. Levels now read "19, not 18" for 800 coins, and runs end with 12,000 coins unspent.
- Off-engine pages decide runs: Trellis costs 110, and with it year 2 went 1566/770 up to 2961/1140. Price other engines' pages higher, or halve their effect.
- Trellis alone is the weak engine (best harvest 100 against corn's 441 and Hot's 570), yet it prints the biggest number at the pick.
- Year 3 doesn't fight strong boards, and from year 2 the scoop budget stops mattering.

## Polish

**Thistledown**
- Paying for the ridge gate drops the page to the sell goal; show "Catch an ember downy." first.
- "Sleep at the front door" took the page with two embers aboard, just after the ember pen was bought.
- "Earned" pages flashed for 0.5 s and under 0.1 s here.
- With roots chosen, aiming at a hopper from 6 m shows the pull mark and the blow falls short.
- Three goals take about 115 px of the phone's page.
- On desktop, "Click to look around" covers the Garden tag's note.

**Sunup**
- A toast covers the board's Close on the phone.
- Desktop says "Tap Hands." where it should say "Press 1."
- The crow line stays about 10 s after the crow has gone.
- "Picks again" never says the plot stays all season.
- Close view cuts field 2's right column.

**Seedbound**
- The aimed slip can cover a neighbour's chip.
- "A 10 coin crop" has no referent, since start crops pay 2 to 5, and "Crops beside it add 10 coins" reads as neighbours gaining coins.
- The hive's permanence isn't stated when you place it.
- The hand shows faintly through the tin sheet's foot.
