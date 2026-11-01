# Thistledown: design

A first-person creature ranch, in the genre of games like Slime Rancher. Everything here is original: the creatures, the tool, the world, the names and the art. No slimes, no plorts, no vacuum gun, nothing copied.

**The fantasy:** you run a ranch for downies, round fluffy creatures like living dandelion clocks. You roam a soft, windy valley with your bellows, a hand-cranked wind tool that draws things in and puffs them out. You catch downies, carry them home, pen them and feed them. Fed downies shed down, which you sell at the Exchange. Coins buy pens, gardens, upgrades, and gates to the far meadows where rarer downies live.

The core feel is hands-on, tactile and a little chaotic. Drawing a cloud of fluff, berries and a bouncing downy into the canister, then puffing them across a field, should be a joy in itself.

## World

One continuous outdoor map, about 160 by 120 m, with gentle heightfield hills. Gates between zones open with coins.

- **The Ranch** (home, start): a plateau with the ranch house, the Exchange crate with its price board, six build pads in two rows, and one starter garden already built with clover planted. The workbench for bellows upgrades is at the house.
- **Clover Meadow** (open from the start): rolling grass, a stream, wild clover patches that regrow clover heads, and dewberry bushes. Clover downies live here.
- **Ember Ridge** (gate, 500 coins): warm rocky hills, steam vents and wild sweetroot. Ember downies live here, and thistle downies on the ridge top at dusk.
- **Brook Hollow** (gate, 1,200 coins): a marshy pond basin with reeds, lily pads and dewberry thickets. Brook downies live here.

**Days:** a day lasts 12 real minutes, with dawn, day, dusk and night. Night is darker and bluer, the downies glow faintly, and nettlebacks roam. Sleeping in the house skips to morning and saves.

## The bellows

- **Draw** (hold): pulls food and down tufts in a cone, 7 m long with a 25-degree half angle; they accelerate toward the muzzle and go into the canister when within about 1 m, quickly (a garden's worth in a second or two). **Downies come only when the crosshair is on them** (within reach, the aim inside their body with a little give for thumbs: `aimedDowny` in `sim.ts`), never because they stood inside the cone beside the fluff you were pulling; food or fluff nearer the crosshair wins. Your loose downies come at once; **a penned one comes only when aimed at directly** (no thumb give, fluff near the crosshair wins by a wider margin), **never while food or fluff is in the cone, nor for 0.6 s after** (`SWEPT`), and only to an aim held still on it (turning under 0.9 rad/s, `STEADY`) for 0.45 s (`PEN_TUG`). So pulling up a pen's fluff never takes a downy, even one standing in front of the fluff: the third playtest's sweeps took one in 3 of about 9 (a test aiming through a downy at the fluff behind it took 4 of 9 on that code, none now). The porch downy digs in for 0.35 s and only dodges a little. Nettlebacks are too prickly and can't be drawn.
- **Each kind fights in its own way** (`CATCH` in `sim.ts`), so going out is a skill (the third playtest's thumb with 180 ms of lag caught 8 of 8). A wild one digs in while it creeps your way and a ring round the crosshair fills; how far off its body the crosshair may be and still hold it is its kind's give (a downy already tugging has 30% more):
  - **Clover**: 0.9 s of pull, quick sideways hops (2.6 to 3.6 m/s every 0.3 to 0.55 s), 0.1 m of give.
  - **Ember**: 1.0 s, it darts: a fast low leap (5 to 6.4 m/s) every half second or so; lose it and it is off.
  - **Brook**: 1.1 s, slippery (0.085 m of give), it slips off towards the pond in quick glides, and if the pull is not done within 1.75 s it slips into the water and is gone.
  - **Thistle**: it hears you from 12 m, walking or running (and from above or below), and **bolts**: long flat leaps at about 5 m/s, faster than you walk and slower than you run, choosing the way that takes it furthest from you without climbing, then settling where it fled to. Up close it needs a quick tug: 0.8 s of pull within 1.35 s.
  - **Any kind gets away** if the pull lapses once it was a third of the way in (`SHAKE_LOOSE`): a long leap away (a brook into the pond), the bellows refused for 1.6 s (`GOT_AWAY`), and a note under the crosshair, "It got away." or "It slipped into the water.".
  - Measured by `npx tsx scripts/ranch-catch.ts` (80 tries per kind and thumb, from 6.5 m; a thistle from 16 m at dusk): a careless thumb (the playtest's: 180 ms of lag, 55% of the error corrected every 40 ms, 6 px of wobble, walking) catches clover 71%, ember 46%, brook 40%, thistle 51% (only when it corners one); a careful thumb (70 ms, 80%, 1.5 px, running at a thistle) catches all four kinds 100%. On open ground a walker never comes within reach of a bolting thistle; a runner does.
- **The crosshair marks only what is under it and within Pull's reach** (7.4 m): a downy you are aimed at, or food or fluff within about 0.45 m of the crosshair's line. It no longer shows the mark for something at the cone's edge while you aim at a downy 8 m off.
- **Canister:** 4 slots of 12 each. Each slot holds one kind of thing. A full canister refuses new kinds, with a clear "full" cue and a note saying how to make room. **A whole window tips out**, tossed 2 to 5 m ahead (it used to land within 1.7 m and the next pull swept it straight back in), and the bellows leaves what tipped out alone for 1.6 s (`TIP_IGNORE`): hold the window (touch), hold its number key, or hold Q (keys) or LB or RB (pad) for about half a second to empty the chosen one. A quick Q, R, LB or RB press (or the wheel, or E with nothing in reach) steps to the next window **that holds something, skipping empty ones** (`Sim.stepWindow`; the third playtest's Q stepped through empty windows and a Blow mid-step sent clover heads at the crate). Things tipped out are still yours: food to feed with, and fluff the sell crate takes counts as your sale.
- **Puff** (tap): launches one of the selected slot's item at about 14 m/s on an arc. Holding puff repeats about 4 times a second. **When the chosen window runs out, the next window that holds something is chosen** (and a held Blow waits for a fresh press before sending the next kind); with nothing aboard, a press of Blow says "Nothing in the jar." (the second playtest's Blow did nothing after a sale emptied the chosen window, and nothing said why).
- **Slots:** select with 1 to 4, the wheel, or Q and E.
- **Upgrades at the workbench:**

  | Upgrade | Levels | Cost |
  |---|---|---|
  | Slots | 4 to 5 | 800 |
  | Capacity | 12 to 20 to 30 | 400, 1,200 |
  | Range | 7 to 10 m | 600 |
  | Glide (hold jump in the air to drift down on the bellows' updraft) | one | 1,000 |

## Downies

Downies are round puff bodies about 0.5 m across, with a seed-head fluff shell, tiny feet and big friendly eyes. They hop, bump, squash on landing, and drift slowly when airborne (low gravity, high drag).

| Kind | Look | Home | Favourite | Also eats | Down value |
|---|---|---|---|---|---|
| Clover | green and cream | Meadow | clover heads | any greens | 12 |
| Ember | amber, soft inner glow | Ridge | sweetroot | any roots | 20 |
| Brook | blue, glossy | Hollow | dewberries | any fruit | 26 |
| Thistle | violet, prickly tufts, rare | Ridge top at dusk | anything | anything | 60 |

**Food** comes in three types: greens (clover heads), roots (sweetroot) and fruit (dewberries).

**Behaviour:**
- **Hunger:** rises from 0 to 1 over about 3 game hours in the open, and a third as fast in a pen (`PEN_HUNGER`): a penned downy is hungry about 4.5 game hours (2.25 real minutes) after a meal. Above 0.5 a downy looks for food it can see within 10 m (a penned one, inside its pen) and heads straight for it, cutting its slow hungry bounce short; a starving one (hunger 1) hurries, with quicker, longer hops. Neither ever hops away from food it has seen. Food still flying from a blow is not seen until it lands; food dropping from a feeder or a crop is.
- **Hungry downies show it:** a hungry downy of yours has its favourite food bobbing just over its head (clover for a thistle, which eats anything), so hunger and the right food are shown in the world. A lesson's marker over the same downy stands in for its sign.
- **Shedding:** eating its favourite sheds 2 down tufts; other food it eats sheds 1, however hungry it was. It won't eat a food type it doesn't eat. Only fright and a crowded pen stop it shedding. **Only downies you keep shed**: a wild downy's meal makes no fluff, so the meadow is no field of free fluff (the second playtest found 70 to 84 lying there by mid-afternoon and swept up about eight times what ranching paid).
- **Moods:**
  - **Content:** recently fed.
  - **Hungry:** big eyes, a slower bounce (starving looks the same: hunger alone never frazzles).
  - **Frazzled:** crowded (more than 10 in one pen, `PEN_MAX`; taught before it bites, see the lessons), a nettleback nearby, or long neglect (starving for 4 game hours, `NEGLECT_HOURS`). **A fright in a pen sends a downy running round inside the fence** in quick, ordinary hops; only a crowded pen or long neglect makes one hop twice as high and clear a low fence (never on its way to food). A frightened or crowded one doesn't shed. A fed, calm downy never leaves a low fence: in the tests a penned downy left with no food at all goes over after 6 to 15 minutes, not 2.5, and a fed one frightened for two minutes beside a stocked feeder stays in (the second playtest's went over with 10 food in the feeder).
- **Wild downies notice you:** within 9 m (12 m when you run, and always for a thistle; `NOTICE`, `NOTICE_RUN`), further than Pull reaches, a wild one squeaks and hops away from you (a thistle bolts), so catching is a skill: close in on one that has seen you, then hold the crosshair on it through its kind's fight (see the bellows). Yours and the porch downy stay put.
- **Company:** downies of the same kind in a pen are a little happier (hunger rises 15% slower).
- **Down tufts:** drift down slowly and lie where they land until drawn up. Tufts left on the ground blow away overnight.
- **Thistle downies** hop over any fence that isn't high (a thistle behind a low fence brings the high fence line, see the lessons).
- **Active count:** keep at most about 60 simulated downies. Far-away wild ones can be despawned and respawned.

## Nettlebacks (the hazard)

Spiky, grumpy hedgehog-like creatures that roam the wilds at night and wander towards the ranch.
- They frazzle downies within 3 m (inside a pen, the downies run about within the fence) and eat down tufts lying on the ground.
- Puffing anything at one sends it rolling away squeaking. It flees and comes back later.
- A pen with a hedge upgrade keeps them out.

## Build pads

Six pads at the ranch. Interact (E) with a pad's post to open its menu.

| Build | Cost | What it is |
|---|---|---|
| Pen | 200 | A round corral with a 1 m fence. Puff downies in. Ten to a pen: once the limit is taught its post hangs a count tag ("8 of 10", "More get frazzled"; over ten, "Too many. They hop out."), lit at night. (It was 250: after the ridge gate and its reward the third playtest had 180 coins.) |
| Garden | 200 | Puff any food item into the empty garden to plant that crop. It produces 2 items every 1.5 game hours (`GARDEN_HOURS`, `GARDEN_YIELD`), which pop out and sit on the plot, and banks up to 12 on its bed while you are away. (It was 5 every 5 hours: the third playtest found no food in 4 tending rounds of 9.) |
| Silo | 300 | Puff items in, interact to choose a kind, draw them back out. Holds 4 kinds, 50 each. |

| Pen upgrade | Cost | What it does |
|---|---|---|
| High fence | 200 | Stops frazzled downies and thistles getting out |
| Feeder | 300 | Holds 60 (`FEEDER_CAP`; it was 40). Puff food into the hopper and it drops one item whenever a downy in the pen is hungry (the post's tag reads "Feeder: 12" or "Feeder empty"). With food chosen the crosshair shows a little hopper when a blow would land in it (`wouldFeed`); food that lands in the hopper says "Feeder: 13" under the crosshair, and food it refuses bounces off and says why ("This feeder holds sweetroots." or "The feeder is full."). |
| Trough | 150 | Water; brook downies in this pen shed 1 extra |
| Hedge | 250 | Keeps nettlebacks out (the tag says "Keeps pests out") |
| Down chute | 400 | Collects shed tufts into a box at the gate; interact to empty it into the canister |

| Garden upgrade | Cost | What it does |
|---|---|---|
| Sprinkler | 250 | 50% faster |
| Rich soil | 300 | Yield 2 to 3 |
| Feed run | 300 | A plank trough to the next pen on the row: each crop goes straight into that pen's feeder while it has room and its downies eat it (`runTarget`). Its tag hangs once a feeder is known. So a ranch you have invested in can be left: a pen of 8 and an ember pen of 6 with feed-run sprinkler gardens, left for ten real minutes, had nobody out or frazzled (without the runs and with empty feeders, as the playtest left them: first out at 6.3 minutes, all 14 frazzled) |

## The Exchange

A crate with a chalk price board by the house (on screen: the sell crate, with a "Sell fluff" plate). Blow fluff into it to sell it. It is built to be easy to hit from first person with the bellows:
- **Open to the lane:** a tall backboard leaning back and low flared sides, front open, so from the lane you see into it. Fluff that reaches the backboard drops in. (A funnel with a front board read as a closed lid and hid the inside.)
- **It draws fluff in:** fluff within 2.4 m of its middle, flying or lying on the ground, is pulled over the rim (`cratePull` in `sim.ts`). A blow that would land short or a metre wide still sells, and so does fluff shed nearby. Fluff further off is left alone.
- **The crosshair says when a blow would sell:** with fluff chosen, `wouldSell` flies the fluff ahead with the real step, pull and collisions, and the crosshair turns into a small gold funnel. Measured by `npx tsx scripts/ranch-sell-aim.ts` over 770 blows from 1.6 to 8 m with up to 1.2 m of aiming error: 99% sell (80% before the pull), and the mark matched the outcome every time.
- **Prices:** each kind of down has a base price that drifts daily within plus or minus 25%.
- **Saturation:** each tuft sold today takes 0.4% off that kind's price, never below 60% of the day's price, recovering overnight (`SATURATION`, `SAT_FLOOR`). There is no cap on a day's income: more downies make more coins. (It was 1.5% a sale with no floor, which capped a day of clover at about 533 coins however many downies you kept.)
- **Only your blows count for the lessons:** fluff the crate draws in from beside it (a downy that ate and shed nearby) still sells, but the sell lesson and the loop lesson wait for fluff you blew in.
- **Board:** shows today's prices with up and down arrows, and under them the day's orders.
- **Feedback:** coins pop out with a chime.
- **Daily orders** (`postOrders`, `orderChoices`, `sellFluff` in `sim.ts`): the third playtest's top fun change, a goal every day. Each morning (from dawn to noon; a later start waits for the next morning) the board chalks up one or two, for example "6 ember fluff by dusk, pays double". They close at dusk (7 pm, `ORDER_BY`). An order's fluff sells at the board's price as usual, and filling it pays that again (a prized one twice again, "pays triple"); fluff of its kind blown or tipped into the crate counts. They only ask for what you can get by then: a kind you keep (penned, loose or in the jar), about 45% of what those downies make by dusk (a meal every four or five hours, two fluff a meal), at least 4 and only if they can make it; or, once the ridge is open, a small order of 4 for a kind you could catch today (its gate open, room in a pen) but do not keep yet, to send you out. The first order comes from what you keep (more often the kind you keep most of); a second asks for another kind. A thistle you keep makes the second a prized order; with the hollow open every third day's first is a big prized one. So orders grow with the ranch and decide what to stock and when to go out. Filling one shows "Earned N coins" over its struck tally; an order left open at dusk says "Dusk. The order went unfilled." The journal keeps the tally (see the lessons).

## Journal goals

A list guides the game, one goal at a time. Each gives a coin reward and a page ("Earned 100 coins" over the struck goal; it read "Paid"). After the gates come the long goals, so the page always has something worth chasing (the third playtest found only the 10,000 coins left after the thistle, then a blank page for good):
1. Catch a clover downy.
2. Build a pen and blow a downy in.
3. Feed a downy its favourite.
4. Sell 20 fluff at the sell crate.
5. Plant something in a garden.
6. Fill an order from the price board.
7. Open the gate to Ember Ridge (its reward, 200, pays for the first ember pen).
8. Catch an ember downy.
9. Build a feeder in a pen.
10. Open the gate to Brook Hollow.
11. Catch a thistle downy (a catch, no longer a glimpse within 9 m).
12. Fill five orders.
13. Fill a prized order.
14. to 17. Keep ten clover, ten ember, ten brook, five thistle downies in one pen (`FULL_PEN`).
18. Earn 10,000 coins in all.

## Controls

| | Desktop | Touch | Gamepad |
|---|---|---|---|
| Look | Click the view to capture the mouse (pointer lock). If pointer lock isn't available, right-drag to look. | Drag on the right half | Right stick |
| Move | WASD or arrows | Floating stick on the left half: appears under the thumb and follows a thumb that drifts past its rim | Left stick |
| Sprint | Shift | Push the stick to the rim | L3 |
| Jump | Space (hold in the air to glide once unlocked) | Jump button (wears its word, like Pull and Blow) | A |
| Draw | Hold right mouse | Big Draw button, held | LT |
| Puff | Left mouse | Puff button, tap or hold | RT |
| Slots | 1 to 5, wheel, Q and E; hold a number key, or Q, to tip a window out | Tap a window; hold it to tip it out | LB and RB; hold one to tip the chosen window out |
| Interact | E | Interact button, shown only when something is in range | X |
| Pause | Esc releases the mouse and opens a small pause menu with a Games button (`ctx.openSwitcher()`), Settings in the shell, and Resume | Pause button | Start |

**Touch details:** every button tracks its own pointer, so you can move, look, draw and puff at once. Buttons give a short `navigator.vibrate` buzz. Touch controls show only while the last device was touch: `ctx.device()`. Under touch, show the touch hints rather than key names.

## Look and feel

Distinct from Sunup's tabletop diorama and Seedbound's almanac cards. It should feel like standing in a soft, windy pastel valley under a big sky.
- **Palette:** sage, cream, apricot, periwinkle and lilac, with long views fading into soft lilac haze.
- **Rendering:** painterly low-poly with smooth gradient shading. A gradient sky dome with drifting clouds, a sun and moon, and stars at night.
- **Grass:** instanced wind-swaying grass across the meadows. Seed fluff drifts in the air everywhere: that is the world's signature.
- **Downies:** soft and lit from behind (a fresnel rim) so they read against the grass. Squash and stretch on every hop. Simple, readable eyes.
- **Viewmodel:** the bellows sits lower right, brass and leather with a glass canister that shows the selected slot's contents. It bobs with walking and pumps when drawing; the drawn objects stream into the muzzle.
- **HUD:** minimal. The slot bar is bottom centre (icon, count, selected highlight). Coins and the time of day are top right. The crosshair changes when something drawable is targeted. Interact prompts appear near the centre and journal toasts at top centre. Keep the shell's top-left corner (60 px plus the safe area) clear.

## Performance

60 fps on a Pixel 8 Pro: Mali-G715, about 412 by 915 CSS px, DPR 2.6.
- Render at most DPR 2, and lower the render scale on `ctx.quality() === 'low'`.
- Aim for under 150 draw calls. Instance grass, clover patches, rocks and downies.
- Use one shadow-casting light with a small map, or blob shadows on low.
- No allocation per frame in hot paths. Guard every shader against NaN.

## Save

Save everything through `ctx.save(data, summary)` when the player sleeps, every 30 s, and on pause.
- **What to save:** the player's position and look, the canister, coins, the day and time, gates, pads and their upgrades, garden crops, silo contents, every downy (kind, position, hunger, which pen), tufts on the ground (optional), goals and upgrades.
- **Summary** for the title card, for example "Day 4, 3 pens, 1,240 coins".

## Priorities

Build in this order. Each step should be playable before the next.
1. **Ranch and Meadow:**
   - First-person movement and look on all three input kinds.
   - Bellows draw and puff with real physics.
   - Clover downies with hunger, eating and shedding.
   - Wild clover patches.
   - Pens and gardens on pads, the Exchange with prices.
   - Day and night, save and load, the HUD, the pause menu.
2. **The rest of the valley:**
   - Gates to Ember Ridge and Brook Hollow, ember, brook and thistle downies, nettlebacks.
   - The pen and garden upgrades, the silo, bellows upgrades, journal goals.
3. **Polish:**
   - Glide.
   - Juice everywhere: squash, puffs of fluff, coins, camera feel.
   - Ambient life: butterflies, drifting fluff, birds.

## As built: decisions and notes

Recorded while building, where the design left a choice open or play showed a better answer.

**Readouts live in the world.** The canister's contents show on the bellows: the chosen slot's things sit in the glass jar, a brass dial counts them, and a row of little windows on the gauge plate shows every slot filled to its level with a pointer over the chosen one. A plain number sits beside the crosshair (with the kind's name for two seconds after it changes). Coins are plain type in the top right; the hour is a small sun-and-moon arc under them. Prices are on the Exchange's chalk board. There is no slot bar, clock card or toast stack.

**Menus are tags.** A pad post's arm, the workbench pegboard, the porch beam and each closed gate hang wooden tags with the options and prices. **They hang as a near grid** from a bar in front of you, between you and the post, turned to face you: two columns on a tall phone, three on a wide screen. However close you stand they look as big as at their reading distance (1.8 m on a phone, 1.7 m on a wide screen) and never wider than the screen: hung nearer, they are made smaller to match (`nearRail`, `TagMenu.show`'s scale). A row of five ran off both edges of a phone; the third playtest's grid still ran off up close to a post at an angle, where the arrow leads; a desktop's notes on the posts' rails were about 10 px. Now, by `ranch-tags.mjs`, every tag stays on the phone's screen from 0.9 to 2.2 m and at up to 75 degrees off the post (a control hung the old way runs 4 of 5 off), the smallest phone note reads at 12.2 px and the smallest desktop note at 12.7 px. On a desktop the use prompt sits just under the tags (it lay over their words). Walking more than about 3 m away folds them up. The view turns gently to face them when they drop.

**Nothing is chosen when tags come down** (`src/games/ranch/menu.ts`, `TagChoice`): the second playtest's first Buy spent 300 coins on a Silo that happened to sit under the crosshair after the view turned. On touch only a tap chooses: the first tap on a tag chooses it (a paler plank, a heavy inked border, a lean towards you, and Use says Buy) and a second tap on it, or Use, takes it; with nothing chosen Use says "Tap a tag" and only nudges the tags, and a tap on the view away from them puts them away. With a mouse or a pad the crosshair chooses, but only once you have looked about yourself (the view turning to face the tags does not count); E, X or Enter with nothing chosen folds them up, and a click on a tag takes it at once. A lesson chooses the tag it teaches when its post's tags come down (`Lesson.tag`: Pen, Garden, Feeder, Bigger jar, Ember Ridge, Sleep), so one tap takes it. Number keys still take a tag at once. While tags hang on a phone, Use moves off them (just under them if there is room above the bellows, else just over them, else beside them) and the count by the crosshair steps aside.

**Words on screen are plain.** The code keeps its own names; the player only ever reads everyday words, because the first playtest found "Puff the down into the Exchange crate." unreadable. A test in `tests/ranch-lessons.test.ts` keeps the code names out of every lesson line, goal and pause note.

| In the code | On screen |
| --- | --- |
| draw | Pull (the big button wears the word) |
| puff | Blow (its button wears the word) |
| down, tuft | fluff |
| the Exchange | the sell crate (a "Sell fluff" plate on it; the board reads "Fluff prices") |
| pad | plot ("Empty plot" on the post) |
| canister | jar |
| slot | window |
| nettleback | pest |

Downies keep their name: whenever a line says "downy", an arrow is over one.

**Teaching: one thing at a time** (`src/games/ranch/lessons.ts`). **A lesson counts as learned only once its line has been on screen and its action done** (or, quietly, when its action was already done as it came up). One whose moment passes (dusk at nightfall, the night at dawn) goes without being learned and comes back the next time it applies: the second playtest slept off the night lesson, it was marked learned, and night 2's pests reached the pen with no line or arrow. A stepped line moves to its next step only once that step has lasted a quarter of a second (`Tutor.STEP_HOLD`), so a step that lasts a frame never shows, and the line that ticks is always the one that was on the page. A new ranch starts with only the view, the move stick and the look area. Each lesson brings in one control or system, shows one line on the journal page (top left on a tall phone, bottom left on a wide screen) and waits until you have done it; the line ticks, then the next one comes. Anything not yet brought in is not on screen (Draw, Puff, Jump and pause buttons, coins, the hour arc, the crosshair and count, the bellows and its slot windows) and not in the world (pad posts, the front door, the workbench, gate prices, nettlebacks, nightfall). Lines are eight words or fewer, one action, imperative, worded for the device (never key names on touch, never touch words on keys or a pad). Rules are shown in the world instead of in words: a cream chevron bobs over the spot (a downy, a post, the crate, the door, a nettleback), a soft apricot ring lies on the ground around it (a pad, the garden, the crate), and in the feeding lesson the favourite food bobs over the downy's head. The chevron shrinks away once you are within about 3 m, so it never hangs overhead. When the spot is out of view, a small chevron on the screen's edge points the way (to the side you would turn towards, if it is behind you). The pause page keeps the whole journal (done goals struck), the three most recent notes and the controls learned so far.

| # | Lesson | Brings in | Ends when | Touch | Mouse and keys | Pad |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | look | (the view, the stick) | looked about 0.6 rad | Drag on the right to look around. | Click the view to look around. (Move the mouse to look around. once captured; Right-drag to look around. with no pointer lock) | Use the right stick to look around. |
| 2 | walk | arrow on the porch downy | walked, and within 3.4 m of it | Walk to the downy with your left thumb. | Walk to the downy with WASD. | Walk to the downy with the left stick. |
| 3 | draw | the bellows, crosshair and count, Draw | a downy is drawn in | Aim at the downy and hold Pull. | Aim at the downy and hold right click. | Aim at the downy and hold LT. |
| 4 | puff | Puff | something is puffed out | Tap Blow to send it back out. | Click to blow it back out. | Press RT to blow it back out. |
| 5 | feed | the pause button; an arrow and a ring on the garden, then a clover head over the downy | one of your downies eats its favourite | In steps: Pull clover heads from the garden. (until some are aboard; the bed ripens if it is bare) / Feed the downy a clover head. (Tap the clover heads' window to choose them. if another kind is chosen; Blow the downy back out. if it is in the jar) | Press Q until the clover heads are chosen. | Press LB or RB to choose clover heads. |
| 6 | sell | arrow on the fluff your downy dropped (only ever fluff on the ranch, never a wild downy's out in the meadow), or the downy about to drop it, a chevron over the fluff's window if another kind is chosen, then the crate; coins after the sale | fluff you blew in sold at the sell crate (the crate drawing in fluff that fell beside it does not count) | In steps: Pull up the fluff the downy dropped. / Tap the fluff's window to choose it. / Blow the fluff into the sell crate. (Pull clover heads from the garden. then Feed the downy again for more fluff. if there is none anywhere) | Press Q until the fluff is chosen. for the choosing step | Press LB or RB to choose the fluff. for the choosing step |
| 7 | pen | pad posts (Pen only), arrow and ring on the nearest empty pad | a pen is built | Tap Post at an empty plot, then Pen. | Press E at an empty plot, then Pen. | Press X at an empty plot, then Pen. |
| 8 | penin | ring on the pen | a downy is in a pen | Blow the downy into the pen. | same | same |
| 9 | meadow | arrow at the ranch gate, then a wild downy | a wild downy is caught; then the day may run on | Catch a downy out in Clover Meadow. | same | same |
| 9b | farm | the loop, right after the meadow: fluff on its way in first, then a downy aboard (a fresh catch: blow it into a pen with room, a chevron over its window if it is not chosen; every pen full: build another), then fluff to choose or pull up, then the hungry downy (its favourite over it, a chevron over that food's window if it is not chosen, or the garden marked if you have no food), then catch another downy (or build a pen if every pen is full). The third playtest's line said to catch another with a fresh catch in the jar | three whole turns of the loop from when it first came up: a meal you gave (food you blew or tipped out) to a downy of yours, its fluff pulled up and blown into the crate, counted once per meal (`FARM_CYCLES`; dusk taking over and handing back keeps the count). Plain sales from a full jar do not count | Blow the fluff into the sell crate. / Blow the downy into a pen. / Pull up the fluff your downies dropped. / Feed the hungry downy its favourite food. / Pull up food for the hungry downy. / Catch another downy out in Clover Meadow. / Tap Post at an empty plot, then Pen. | same | same |
| 9c | order | the day's orders begin (feature `orders`, the farm lesson's `then`); urgent when the first is posted (the morning after the loop): an arrow over the price board, a ring at the crate | its first fluff counted, or you stood by the board for a moment and read it | Fill today's order on the price board. | same | same |
| 10 | dusk | the hour arc, the front door | morning (sleep, or the night passes) | Sleep at the front door till morning. | same | same |
| 11 | night | nettlebacks, the hedge tag; an arrow on the nearest pest however far (the edge chevron when it is off screen) | a nettleback is sent rolling (dawn lets it go unlearned; it comes back the next night) | Blow anything at the pest to shoo it. | same | same |
| 12 | garden | the Garden tag | a garden is built | Tap Post at an empty plot, then Garden. | Press E at an empty plot, then Garden. | Press X at an empty plot, then Garden. |
| 13 | plant | ring on the bare bed | food is planted | Blow some food onto the bare soil. | same | same |
| 14 | ups | the Feeder tag on pen posts | any upgrade is bought | Buy a feeder at the pen post. | same | same |
| 14b | feeder | an arrow and a ring on the feeder's hopper; the garden marked if you have none of the pen's food, a chevron over its window if it is not chosen | food lands in a feeder | In steps: Pull clover heads from the garden. / Tap the food's window to choose it. / Blow food into the feeder. | Press Q until the food is chosen. for the choosing step | Press LB or RB to choose the food. |
| 15 | bench | the workbench (Bigger canister, Longer draw) | a bench upgrade is fitted | Buy a bigger jar at the workbench. | same | same |
| 16 | gates | gate prices, the gates (at 500 coins) | the ridge gate is open | Open the gate to Ember Ridge. | same | same |
| any time after 4 | slots | the slot windows and their tap targets | a slot is picked | Tap a window to switch what you blow. | Roll the wheel or press Q to switch. | Press LB or RB to switch kinds. |
| any time after 8 | jump | Jump | a jump | Tap Jump to hop over bumps. | Press Space to jump. | Press A to jump. |
| whenever one of yours hops out of a pen (after 8) | stray | an arrow on the downy that got out (the edge chevron when it is off screen), then on its pen once it is in the jar (or, its pen full, on another with room) | no stray loose, and a downy has come down in a pen since (or none is aboard, or no pen has room) | In steps: Pull in the downy that got out. / Blow the downy into the pen. (Blow the downy into another pen. when its pen is full) | same | same |
| when a pen holds eight, or five and the jar would take it past ten (after 8) | crowd | the pen posts' count tags (`crowd`); an arrow at the fullest pen's post | up 3.5 s with no pen over ten (with one over, it stays until it is not) | Keep ten or fewer downies in a pen. | same | same |
| whenever a thistle of yours is behind a low fence, in it or hopped out of it (after 8) | high | the High fence tag (`up:high`, chosen when the post's tags come down); an arrow at that pen's post | no thistle of yours in, or out of, a low pen | Thistles need a high fence. Buy one. | same | same |

Order and timing:
- **Urgent lessons, in order of precedence:** slots, jump, dusk, night, the high fence, the pen limit, stray (and the order lesson, which takes over when the first order is posted). An urgent lesson takes over a calm one and hands back; one urgent lesson never takes over another. The third playtest's crowded pen (13 in it) frazzled them all and the stray line nagged; the pen limit is now taught at eight, during the loop lesson if need be. A thistle that hops out of a low pen brings the fence line, not the stray line's nagging.
- **Lessons 1 to 9 run in order.** Lessons 10 to 16 come when they matter: dusk and night when the clock gets there (the night after the meadow, not after dusk, since staying up lets the dusk line lapse unlearned), the garden at 200 coins, the feeder at 300 coins with a pen and then filling it straight after (the second playtest's journal jumped from buying it to the gate goal, and it sat empty for a day and a half while three downies wandered off), the workbench at 400 once the feeder is filled, the gates at 500 (only once you can pay).
- **The stray line repeats** (`Lesson.repeat`): whenever a downy of yours hops out of its pen it takes the page over (like dusk), says so and points at it, and goes once it is back; it is never counted as learned. The sim marks such a downy (`strayFrom`) and emits `stray`; a downy coming down in a pen emits `penned`.
- **The porch downy's hunger waits** (held at 0.3 or below through the walk, pull and blow lessons) until the feeding lesson, which gives it an appetite (0.62); while the feeding and selling lessons lean on it, it never goes past 0.8, so it is hungry, never starving, when you come back with clover heads.
- **Two lessons take over the one on screen when they become ready, then hand back.** Slots comes when two kinds are first aboard (after Puff); jump comes when you step into the meadow, or push against something for more than a second (after the pen). Dusk and night are urgent too, and dusk lapses quietly at nightfall if you stay up.
- **A lesson already done when it comes up passes quietly**, with no line. On keys and pads Space and A always jump (nothing on screen depends on it), so the jump lesson usually passes quietly there.
- **Selling comes before the pen** (the brief had them the other way). The fed downy's down is lying right there to sell, coins arrive with that first sale counting up from before it, and you never spend coins you cannot see.
- **The clock holds at half past four in the afternoon** until the meadow lesson is done, so the first evening never lands in the middle of the basics. **While it holds, so does the hunger of every downy of yours** (penned, loose or on the porch: `Sim.clockHeld`), and until the day runs on none of yours goes past 0.8. The second playtest penned its first downy at 0.36 and found it starving at 180 s, frazzled at 300 s and over the fence at 330 s while the journal still said to catch one in the meadow. Nettlebacks stay away until the night lesson.
- **Other tags hang quietly when they matter** (no line): the high fence after the first night or a thistle, a trough once a brook downy is caught, a down chute after 20 down sold, garden upgrades after planting, the silo when the canister is full or refuses a kind, a fifth slot once four kinds are aboard, glide vanes once a gate is open.

Save and returning players: lessons and their counts persist in the save (`learn`, `learnCount`). A save from before the lessons is credited with what it has clearly done (looked and walked, drawn, puffed, fed, sold, a pen, a penned downy, switched slots, a day gone by, a second garden or a planting, upgrades, gates), along with every lesson those come after, so a returning player is not taught again. `&taught` in the URL teaches everything (a sandbox, and what the single-feature checks use).

The journal page is never blank while there is something to do: the lesson while one is up; with no lesson up, **the day's orders with their tally** ("Ember fluff, 2 of 6.", `orderLines`; once all are filled, "Orders filled. New ones come at dawn." ticked) and the next journal goal under them, calm lines in the same hand. **The thistle goal has a clue** (it had none): by day "Thistles visit the ridge top at dusk.", from half past five to half past eight "Catch a thistle on the ridge top." with an arrow over the ridge top (on the nearest thistle once you are up there). **A gate goal counts the coins towards it** ("Open the Ember Ridge gate, 288 of 500.", `goalText`) and an arrow hangs over the gate (`goalSpot`), with the edge chevron for its first 6 seconds only, so the page is not a dead end while you save up; the big total counts what you have earned ("Earn 10,000 coins in all, 2,300 so far.") (a playtest found the page blank on day 2 at 197 coins, waiting for the garden lesson at 200, and gone for good after the gates). A goal just done (or an order filled) shows struck under "Earned 40 coins" for a few seconds, then the next goal takes the page; if a lesson has the page, it waits until the lesson has ticked and gone (for up to 6 s; older than that, it is dropped). The pause page's journal shows the goals done and the one you are on, not the ones to come (the third playtest's showed all eleven on day 1, the thistle too). J puts the goal line away until the next goal or lesson. The pause page's "Now:" line shows the lesson, or else the goal. First-kind notes and the gate page wait while a lesson has the page.

Fixes found while measuring the lessons:
- **A touch in the gap between the stick and the look side** (or above the stick) landed on the canvas; Chrome's compatibility mousedown then asked for pointer lock, and after that every touch read as 0,0, so tags could not be tapped. Touch-born mouse events are now ignored, and the view takes touch taps itself.
- **Food puffed onto a slope used to skid on** (14 m in the sim test), because each dip counted as airborne and lost its ground friction. Rolling things now hug the ground. Feeding a downy went from 15 to 30 s to about 2 s.
- **A hungry downy that has spotted food now hurries to it.** It still bounces slowly while it is only hungry.
- **The feed goal counts only your own downies.** Wild ones foraging used to tick it.

**Keys.** E uses whatever is in reach; with nothing in reach it moves to the next slot that holds something (the table gives E to both). Q is the previous slot that holds something (empty windows are skipped); the wheel and 1 to 5 also work; F also draws, for trackpads. Esc or P pauses. J brings up the next goal when no lesson has the page. With no pointer lock (or `&nolock`), right-drag looks.

**Touch.** Tapping the bellows' body flicks to the next slot that holds something; tapping one of its windows picks that slot, and holding it for a little over half a second (a cream ring closes round it) tips it out. Under touch the windows spread at least 48 px apart on screen (`Viewmodel.resize`); on a tall phone they sit in two rows of two on the gauge plate (a fifth above), between the stick and the Blow button and left of the bellows' middle so every window target keeps at least 8 px from Blow (it was 2 to 3; now 11), the grips moved over to the right so they never cross a window. **The chosen window wears a cream ring on every device**, and each window carries a small icon of what it holds (a downy's face, a clover head, a sweetroot, dewberries or a wisp of fluff) wherever the windows are big enough (10 px across or more); they used to be plain coloured discs with a barely brighter rim. Each window's tap target is 45 px on the Pixel (it was 22), and none overlaps another or a button. A press that lands on a window and then moves is handed to the stick (or the look area), so a thumb that meant to walk walks and tips nothing out. On a tall phone the bellows shrinks and tucks in low, and the Pull, Blow and Jump buttons sit beside and above it. A quick tap anywhere that is not a button counts as a tap on what is under it (tags, windows).

**The puff of air** at the muzzle is a few small, faint wisps that thin out in a quarter of a second: measured on the Pixel's viewport, a blow hides at most 9% of the aim area (120 px round the crosshair), never a fifth (it was 61%, over a fifth for 0.35 s).

**Waking** after sleep turns you to face the yard (the crate and the pens) at the darkest moment of a shorter fade (1.25 s), not the front door you used.

**The workbench** can be used from 3.5 m, and its tags hang just in front of it turned to face you wherever you stand (they used to hang edge-on along the house wall).

**The gates' boards** carry the way they open and its price, painted like a tag (the ridge gate's was a blank board), lit from within at night: by frame readback the plank reads 126 with ink at 29 at 11 pm (day 119 and 28; with its night light off, 12 and 1, which is how the third playtest found it). The sleep tag's note says "Saves the ranch" (it read "Day 1, saves the ranch"). On a tall phone the zone's name comes up below the journal page, not behind it.

**The canister.** One slot per kind: a full slot refuses more of its kind, and a full canister refuses a new kind (the "full" cue and a short note under the crosshair, eight words or fewer, which once windows are known says how to make room: "No window free. Hold one to empty it." or "Window full. Hold one to empty it." on touch, "Hold Q to empty one." on keys, "Hold LB to empty one." on a pad; `fullNote`).

**Pens.** Food and down in flight slip between the rails, so you can puff food into a pen at the floor; rolling on the ground, the fence stops them. Downies need about 1.05 m to clear a low fence: calm hops are 0.4 to 0.6 m, a crowded or neglected one about 1.3 m, thistles 1.6 m. A thistle in a low pen backs off from the rails and hops so the top of its hop is over them. The high fence is 2 m.

**Blowing a downy into a pen** used to fall short: aimed at the pen floor from the lane, it met the fence below its top. Now a pen helps one blown at it from outside (`penPull`, like the sell crate's pull on fluff): within 3.2 m of the fence and heading in, it is steered towards the middle and lifted over the rail, and once inside it settles rather than sailing over the far side; one blown while you lean on the fence leaves the bellows above the rail. A blown downy remembers where you stood, so one blown inside a pen is left alone. With a downy chosen the crosshair shows a little fence when a blow would land it in a pen (`wouldPen`, which flies it ahead with the real step). Measured by `npx tsx scripts/ranch-sell-aim.ts` over 125 blows from 1 to 8 m back from the fence, across it and up to 1.8 m off its middle: 97% land in the pen (10% without the help), and the mark matched every time.

**Food groups.** Each group has one food (clover heads, sweetroot, dewberries), so clover, ember and brook downies only eat their own group, always their favourite (2 down). Thistles eat anything for 2 down. A trough gives brook downies a third.

**Wild downies** get hungry at half the rate and never past 0.7, and forage the wild food (their meals make no fluff). Groups refill one at a time, out of sight (over 30 m away); thistles come to the ridge top from half past five to half past eight in the evening and leave after dark if not caught. Wild spawning stops at 56 downies.

**Nettlebacks** come in from the north edge of the meadow after half past eight at night (two at first, up to four), head for the ranch gate, then wander between pens without hedges, eating down on the ground and frightening downies within 3 m (penned ones run about inside the fence and stop shedding). A hedge keeps them out and keeps its pen calm. Anything puffed, in the air or skidding fast, sends one rolling; it flees for 20 s and comes back. At dawn, or when you sleep, they leave; after a sleep the next night's first comes a few seconds after dark.

**Gardens** grow 2 (3 with rich soil) every 1.5 game hours (1 with a sprinkler), and stop when 12 are lying on the bed. "Pull the crop" empties a bed so something new can be puffed in; this is how the planting goal is met with the starter garden. A bare garden alone keeps a pen of six fed (20 a day against about 16 eaten); one upgrade keeps it fed with food to spare, both keep a full pen of ten. Every round of tending now finds food: by `ranch-balance.ts`, the gardens grew nothing in 0 or 1 of 27 rounds per ranch (the third playtest: 4 of 9).

**Money.** You start with 300 coins (enough for the first pen at 200). Journal rewards are 20 to 500. Numbers set with `npx tsx scripts/ranch-balance.ts`, which runs the real sim from 6 am to 9 pm for three days per ranch with a tending hand every 1.5 game hours (picking gardens, topping up feeders, pulling the fluff and selling it through the crate's own sale, so the day's orders count it and pay their bonus):

| Ranch | Coins a game day (settled) | Of it from orders |
| --- | --- | --- |
| Pen of 6 clover with a feeder, the starter garden | about 461 | 141 (30%) |
| The same, garden with a sprinkler | about 557 | 176 |
| Full clover pen (10), garden with both upgrades | about 974 | 323 |
| Two clover pens of 8, two sprinkler gardens | about 1,165 | 327 |
| Ember pen of 6 and clover pen of 6, a sprinkler garden each | about 1,375 | 444 |
| Brook pen of 6 with a trough and ember pen of 6 | about 2,429 | 648 |
| Hand-fed pen of 6 clover, no feeder | about 501 | 162 |
| Starter pen with a feed run from the starter garden | about 553 | 166 |
| Late ranch: clover 10, ember 10, thistle 3 (high fence), two gardens with feed runs | about 3,840 | 1,343 (35%) |
| First pen: 3 clover, hand-fed | about 286 | 100 |
| Sweeping the meadow (no pens; every 1.5 game hours a hand picks up all the fluff lying outside the ranch and sells it) | 0 (it was 2,166 before wild meals stopped making fluff) | |

Without the orders the starter pen makes about what it did (320 against 310); the orders add about a third for a hand that fills them, and fill 2 of 2 a day for every ranch here but the late one's prized thistle order. So Ember Ridge (500) comes about two days after the lessons on the starter pen with the feeder and a sprinkler bought on the way, its reward (200) pays for the first ember pen at once, and Brook Hollow (1,200) a day or so after an ember pen is going. A pen of six left with one full feeder (60) and nobody tending it empties the feeder after about 26 minutes; the first downy leaves after about 33 and all six after about 35. Beside a garden with a feed run, nobody leaves in an hour.

**Light.** A pastel day leans on a strong soft sky light and a gentler sun, so slopes facing away from the low sun stay apricot and lilac instead of going brown. Nothing in the scene is pure black: the darkest colours are lifted so the flash scan can treat any pure black pixel as a fault.

**Checks.** Dev server: `npx vite --config scripts/ranch-vite.config.ts` (port 5251, no hot reload; `scripts/ranch-lessons-vite.config.ts` serves 5253). The scripts read `RANCH_URL`. URL flags: `&fresh`, `&taught` (every lesson done), `&nolock`, `&touch`, `&freeze` (no updates), `&slow` (fifth speed), `&hour=19`. `window.ranch` is the debug hook (sim, renderInfo, aimAt, step, watchNaN, injectNaN, tagScreen, slotScreen, seen, tutor). The single-feature scripts below open a taught ranch; `ranch-lessons.mjs` plays a fresh one.

| Script | What it checks |
| --- | --- |
| `node scripts/ranch-lessons.mjs [url]` | Every lesson played for real on a 412 by 838 phone at DPR 2.6 with CDP touch (including five held-afternoon minutes of the meadow lesson stepped without drawing, the loop lesson saying to pen a fresh catch, each lesson's own tag coming down chosen, the feeder filled, a downy over the fence brought back, a night lesson slept through and back the next night, a gate goal's count and arrow, the first order's lesson pointing at the board that chalks it up, its tally on the journal and "Earned" when it fills, the pen limit with the post's count tag, the high fence line with its tag chosen, the thistle clue by day and its arrow at dusk, and a pause page showing only the goals done and the current one), then the start on a desktop with keys and the mouse, a stand-in pad's wording and a returning player's old save. A watcher checks every frame that nothing (buttons, coins, the clock, crosshair, bellows, slot windows, Use, gate prices, the edge chevron) is on screen before its lesson, and records when each first appeared. Shots in `/tmp/ranch-lessons` |
| `node scripts/ranch-play.mjs` | Desktop play with real keys and mouse: walk, look, draw, build through tags, puff into a pen, feed, collect, sell, shell pause and resume, Esc pause, save and reload |
| `node scripts/ranch-touch.mjs` | The same on a 412 by 900 phone at DPR 2.6 with CDP touch, plus the floating stick, two thumbs at once, slot taps, and the controls hiding on a key press |
| `node scripts/ranch-valley.mjs` | Gates, ember and brook downies, the workbench, glide, a silo, a feeder, nettlebacks, a thistle at dusk, sleep, cues and held sounds |
| `node scripts/ranch-pad.mjs` | Every action on a gamepad (a stand-in pad) |
| `node scripts/ranch-feel.mjs` | Head bob, roll, field of view, landing dip, draw times, puff speed, squash and stretch, pumping |
| `node scripts/ranch-perf.mjs` | Frame times, draw calls and triangles while playing, phone and desk |
| `node scripts/ranch-flash.mjs` | Frame readback for black or NaN pixels, after proving it catches a planted NaN; includes the lessons' marks by day and at dusk |
| `node scripts/ranch-shots.mjs`, `ranch-hud.mjs`, `ranch-kinds.mjs`, `ranch-drawseq.mjs` | Screenshots and contact sheets |
| `npx vitest run tests/ranch` | The rules and the lessons, without rendering: order, gating, urgent lessons, marks, quiet tags, line length and wording, credited saves, food on slopes; and the playtests' findings (starving downies eating and shedding, pens holding, neglect, aimed pulls, wild tugs, tipping windows out, blown sales and turns of the loop, the feeding steps, the waiting porch hunger, the ticked line). `tests/ranch-round2.test.ts` holds the second playtest's: each P0 and P1 there fails on the code that was played (proved on a `git archive` copy), plus the cheaper P2 and P3 fixes. `tests/ranch-round3.test.ts` holds the third's: orders (only kinds you can get, amounts you can make, filling and paying double, lapsing at dusk, the lesson and the tally), the pen limit lesson and the affordable pen, the thistle clue and the high fence line, catch odds per kind for a careless and a careful thumb, the bolting thistle, feed runs and gardens that keep up, the loop's pen step, pulls in a pen, stepping windows and the feeder's mark: 23 of its 24 fail on the code that was played (the 24th is a control: a penned downy still comes to a still aim) |
| `npx tsx scripts/ranch-balance.ts` | Income per game day for typical ranches, food grown and eaten, feeders, escapes, the order economy (orders filled, bonus coins and their share of income, garden rounds that found nothing), neglect runs with and without a feed run and a ten-minute trip, gate timing and whether the first ember pen is affordable, and sweeping the meadow instead of ranching |
| `npx tsx scripts/ranch-catch.ts [tries]` | Catch success per kind for a careless and a careful scripted thumb (lag, correction, wobble; walking or running at a thistle), with how long a catch takes and how often it got away |
| `npx tsx scripts/ranch-sell-aim.ts` | Share of blows that sell from 1.6 to 8 m with aiming errors, and whether the sell mark told the truth; then share of blown downies that land in a pen from 1 to 8 m back, with and without the pen's help, and whether the pen mark told the truth |
| `node scripts/ranch-blow-cloud.mjs [url]` | How much of the aim a blow's puff hides, by frame readback on the Pixel's viewport (with a control replaying the old puff) |
| `node scripts/ranch-thumbs.mjs [url]` | Thumb room on the Pixel: the journal with two orders and a goal (and the order lesson's page) clear of the stick, the zone's name, the pause button, the coins and the corner; a wild downy let go mid-tug getting away, with the note; the feeder's crosshair mark; looking, buttons, the stick over the bellows, window targets of 44 px or more with no overlaps and at least 8 px from every button (four and five windows), a tap picks and a hold tips out, a drag from a window walks; the chosen window's ring and the windows' icons; Blow moving on to the next window and saying when the jar is empty; the zone's name clear of the journal page |
| `node scripts/ranch-tags.mjs [url]` | Every tag's words fit (the feed run and the pen count tags too); up close to a post at an angle every tag stays on the phone's screen (with a control that must run off); desktop notes of 12 px or more and the prompt clear of the tags; the gate's tag read back at night (with a control); a pen post's count tag and the board's orders; the workbench is usable from 3.5 m and its tags face you; the sleep tag and the gates' boards (with a blank-board control); on the Pixel with real touch, a pen post's five tags all on screen with notes of 12 px or more, nothing chosen as they come down, Use reading "Tap a tag", clear of every tag and spending nothing, a tap choosing and a second buying, the garden lesson's tag chosen for you; on a desktop, the view turning onto a tag choosing nothing until you look about |
