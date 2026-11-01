# Thistledown: design

A first-person creature ranch, in the genre of games like Slime Rancher. Everything here is original: the creatures, the tool, the world, the names and the art. No slimes, no plorts, no vacuum gun, nothing copied.

**The fantasy:** you run a ranch for downies, round fluffy creatures like living dandelion clocks. You roam a soft, windy valley with your bellows, a hand-cranked wind tool that draws things in and puffs them out. You catch downies, carry them home, pen them and feed them. Fed downies shed down, which you sell at the Exchange. Coins buy pens, gardens, upgrades, and gates to the far meadows where rarer downies live.

The core feel is hands-on, tactile and a little chaotic. Drawing a cloud of fluff, berries and a bouncing downy into the canister, then puffing them across a field, should be a joy in itself.

## World

One continuous outdoor map, about 160 by 120 m, with gentle heightfield hills. Gates between zones open with coins.

- **The Ranch** (home, start): a plateau with the ranch house, the Exchange crate with its price board, six build pads in two rows, and one starter garden already built with clover planted. The workbench for bellows upgrades is at the house.
- **Clover Meadow** (open from the start): rolling grass, a stream, wild clover patches that regrow clover heads, and dewberry bushes. Clover downies live here.
- **Ember Ridge** (gate, 600 coins): warm rocky hills, steam vents and wild sweetroot. Ember downies live here, and thistle downies on the ridge top at dusk.
- **Brook Hollow** (gate, 1,500 coins): a marshy pond basin with reeds, lily pads and dewberry thickets. Brook downies live here.

**Days:** a day lasts 12 real minutes, with dawn, day, dusk and night. Night is darker and bluer, the downies glow faintly, and nettlebacks roam. Sleeping in the house skips to morning and saves.

## The bellows

- **Draw** (hold): pulls loose things in a cone, 7 m long with a 25-degree half angle. Pulled objects accelerate toward the muzzle and go into the canister when within about 1 m. You can draw downies, food and down tufts. Nettlebacks are too prickly and can't be drawn.
- **Canister:** 4 slots of 12 each. Each slot holds one kind of thing. A full canister refuses new kinds, with a clear "full" cue.
- **Puff** (tap): launches one of the selected slot's item at about 14 m/s on an arc. Holding puff repeats about 4 times a second.
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
| Clover | green and cream | Meadow | clover heads | any greens | 8 |
| Ember | amber, soft inner glow | Ridge | sweetroot | any roots | 14 |
| Brook | blue, glossy | Hollow | dewberries | any fruit | 18 |
| Thistle | violet, prickly tufts, rare | Ridge top at dusk | anything | anything | 40 |

**Food** comes in three types: greens (clover heads), roots (sweetroot) and fruit (dewberries).

**Behaviour:**
- **Hunger:** rises from 0 to 1 over about 3 game hours. Above 0.5 a downy looks for food within 10 m and hops to it.
- **Shedding:** eating its favourite sheds 2 down tufts; other food it eats sheds 1. It won't eat a food type it doesn't eat.
- **Moods:**
  - **Content:** recently fed.
  - **Hungry:** big eyes, a slower bounce.
  - **Frazzled:** starving, crowded (more than 10 in one pen), or a nettleback nearby. A frazzled downy hops twice as high, can clear a low fence, and doesn't shed.
- **Company:** downies of the same kind in a pen are a little happier (hunger rises 15% slower).
- **Down tufts:** drift down slowly and lie where they land until drawn up. Tufts left on the ground blow away overnight.
- **Thistle downies** hop over any fence that isn't high.
- **Active count:** keep at most about 60 simulated downies. Far-away wild ones can be despawned and respawned.

## Nettlebacks (the hazard)

Spiky, grumpy hedgehog-like creatures that roam the wilds at night and wander towards the ranch.
- They frazzle downies within 3 m and eat down tufts lying on the ground.
- Puffing anything at one sends it rolling away squeaking. It flees and comes back later.
- A pen with a hedge upgrade keeps them out.

## Build pads

Six pads at the ranch. Interact (E) with a pad's post to open its menu.

| Build | Cost | What it is |
|---|---|---|
| Pen | 250 | A round corral with a 1 m fence. Puff downies in. |
| Garden | 200 | Puff any food item into the empty garden to plant that crop. It produces 5 items every 2 game hours, which pop out and sit on the plot. |
| Silo | 300 | Puff items in, interact to choose a kind, draw them back out. Holds 4 kinds, 50 each. |

| Pen upgrade | Cost | What it does |
|---|---|---|
| High fence | 200 | Stops frazzled downies and thistles getting out |
| Feeder | 300 | Puff food into the hopper and it drops one item whenever a downy in the pen is hungry |
| Trough | 150 | Water; brook downies in this pen shed 1 extra |
| Hedge | 250 | Keeps nettlebacks out |
| Down chute | 400 | Collects shed tufts into a box at the gate; interact to empty it into the canister |

| Garden upgrade | Cost | What it does |
|---|---|---|
| Sprinkler | 250 | 50% faster |
| Rich soil | 300 | Yield 5 to 8 |

## The Exchange

A crate with a chalk price board by the house. Puff down into the crate to sell it.
- **Prices:** each kind of down has a base price that drifts daily within plus or minus 25%.
- **Saturation:** each tuft sold today lowers that kind's price by 1.5%, recovering overnight.
- **Board:** shows today's prices with up and down arrows.
- **Feedback:** coins pop out with a chime.

## Journal goals

A short list guides the first hour. Each goal gives a small coin reward and a toast. They are shown one or two at a time.
1. Draw up a clover downy.
2. Build a pen and puff a downy in.
3. Feed a downy its favourite.
4. Sell 20 down.
5. Plant something in a garden.
6. Open Ember Ridge.
7. Catch an ember downy.
8. Build a feeder.
9. Open Brook Hollow.
10. Find a thistle downy.
11. Earn 10,000 coins in total.

## Controls

| | Desktop | Touch | Gamepad |
|---|---|---|---|
| Look | Click the view to capture the mouse (pointer lock). If pointer lock isn't available, right-drag to look. | Drag on the right half | Right stick |
| Move | WASD or arrows | Floating stick on the left half: appears under the thumb and follows a thumb that drifts past its rim | Left stick |
| Sprint | Shift | Push the stick to the rim | L3 |
| Jump | Space (hold in the air to glide once unlocked) | Jump button | A |
| Draw | Hold right mouse | Big Draw button, held | LT |
| Puff | Left mouse | Puff button, tap or hold | RT |
| Slots | 1 to 5, wheel, Q and E | Tap the slot bar | LB and RB |
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

**Menus are tags.** A pad post's arm, the workbench pegboard, the porch beam and each closed gate hang wooden tags with the options and prices. Look at a tag and press E (or click, or X on a pad), tap it on touch, or press its number key. Tags hang in a zigzag so a set stays narrow on a phone. Walking more than about 3 m away folds them up. The view turns gently to face them when they drop.

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

**Teaching: one thing at a time** (`src/games/ranch/lessons.ts`). A new ranch starts with only the view, the move stick and the look area. Each lesson brings in one control or system, shows one line on the journal page (top left on a tall phone, bottom left on a wide screen) and waits until you have done it; the line ticks, then the next one comes. Anything not yet brought in is not on screen (Draw, Puff, Jump and pause buttons, coins, the hour arc, the crosshair and count, the bellows and its slot windows) and not in the world (pad posts, the front door, the workbench, gate prices, nettlebacks, nightfall). Lines are eight words or fewer, one action, imperative, worded for the device (never key names on touch, never touch words on keys or a pad). Rules are shown in the world instead of in words: a cream chevron bobs over the spot (a downy, a post, the crate, the door, a nettleback), a soft apricot ring lies on the ground around it (a pad, the garden, the crate), and in the feeding lesson the favourite food bobs over the downy's head. The chevron shrinks away once you are within about 3 m, so it never hangs overhead. When the spot is out of view, a small chevron on the screen's edge points the way (to the side you would turn towards, if it is behind you). The pause page keeps the whole journal (done goals struck), the three most recent notes and the controls learned so far.

| # | Lesson | Brings in | Ends when | Touch | Mouse and keys | Pad |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | look | (the view, the stick) | looked about 0.6 rad | Drag on the right to look around. | Click the view to look around. (Move the mouse to look around. once captured; Right-drag to look around. with no pointer lock) | Use the right stick to look around. |
| 2 | walk | arrow on the porch downy | walked, and within 3.4 m of it | Walk to the downy with your left thumb. | Walk to the downy with WASD. | Walk to the downy with the left stick. |
| 3 | draw | the bellows, crosshair and count, Draw | a downy is drawn in | Aim at the downy and hold Pull. | Aim at the downy and hold right click. | Aim at the downy and hold LT. |
| 4 | puff | Puff | something is puffed out | Tap Blow to send it back out. | Click to blow it back out. | Press RT to blow it back out. |
| 5 | feed | the pause button; a clover head over the downy, the garden's ring | one of your downies eats its favourite | Feed the downy a clover head. | same | same |
| 6 | sell | arrow on the fluff (or the downy about to drop it), a chevron over the fluff's window if another kind is chosen, then the crate; coins after the sale | fluff sold at the sell crate | In steps: Pull up the fluff the downy dropped. / Tap the fluff's window to choose it. / Blow the fluff into the sell crate. (Feed the downy again for more fluff. if there is none anywhere, and the downy gets hungry enough to eat at once.) | Press Q until the fluff is chosen. for the choosing step | Press LB or RB to choose the fluff. for the choosing step |
| 7 | pen | pad posts (Pen only), arrow and ring on the nearest empty pad | a pen is built | Build a pen on an empty plot. | same | same |
| 8 | penin | ring on the pen | a downy is in a pen | Blow the downy into the pen. | same | same |
| 9 | meadow | arrow at the ranch gate, then a wild downy | a wild downy is caught; then the day may run on | Catch a downy out in Clover Meadow. | same | same |
| 10 | dusk | the hour arc, the front door | morning (sleep, or the night passes) | Sleep at the front door till morning. | same | same |
| 11 | night | nettlebacks, the hedge tag | a nettleback is sent rolling (or dawn) | Blow anything at the pest to shoo it. | same | same |
| 12 | garden | the Garden tag | a garden is built | Build a garden on an empty plot. | same | same |
| 13 | plant | ring on the bare bed | food is planted | Blow some food onto the bare soil. | same | same |
| 14 | ups | the Feeder tag on pen posts | any upgrade is bought | Buy a feeder at the pen post. | same | same |
| 15 | bench | the workbench (Bigger canister, Longer draw) | a bench upgrade is fitted | Buy a bigger jar at the workbench. | same | same |
| 16 | gates | gate prices, the gates | the ridge gate is open | Open the gate to Ember Ridge. | same | same |
| any time after 4 | slots | the slot windows and their tap targets | a slot is picked | Tap a window to switch what you blow. | Roll the wheel or press Q to switch. | Press LB or RB to switch kinds. |
| any time after 8 | jump | Jump | a jump | Tap Jump to hop over bumps. | Press Space to jump. | Press A to jump. |

Order and timing:
- **Lessons 1 to 9 run in order.** Lessons 10 to 16 come when they matter: dusk and night when the clock gets there, the garden at 200 coins, the feeder at 300 coins with a pen, the workbench at 400 after the feeder, the gates at 600 (only once you can pay).
- **Two lessons take over the one on screen when they become ready, then hand back.** Slots comes when two kinds are first aboard (after Puff); jump comes when you step into the meadow, or push against something for more than a second (after the pen). Dusk and night are urgent too, and dusk lapses quietly at nightfall if you stay up.
- **A lesson already done when it comes up passes quietly**, with no line. On keys and pads Space and A always jump (nothing on screen depends on it), so the jump lesson usually passes quietly there.
- **Selling comes before the pen** (the brief had them the other way). The fed downy's down is lying right there to sell, coins arrive with that first sale counting up from before it, and you never spend coins you cannot see.
- **The clock holds at half past four in the afternoon** until the meadow lesson is done, so the first evening never lands in the middle of the basics. Nettlebacks stay away until the night lesson.
- **Other tags hang quietly when they matter** (no line): the high fence after the first night or a thistle, a trough once a brook downy is caught, a down chute after 20 down sold, garden upgrades after planting, the silo when the canister is full or refuses a kind, a fifth slot once four kinds are aboard, glide vanes once a gate is open.

Save and returning players: lessons and their counts persist in the save (`learn`, `learnCount`). A save from before the lessons is credited with what it has clearly done (looked and walked, drawn, puffed, fed, sold, a pen, a penned downy, switched slots, a day gone by, a second garden or a planting, upgrades, gates), along with every lesson those come after, so a returning player is not taught again. `&taught` in the URL teaches everything (a sandbox, and what the single-feature checks use).

The journal page shows one goal at a time: the lesson while one is up; between lessons, a goal just done ("Paid 40 coins") and then the next one for a few seconds. First-kind notes and the gate page wait while a lesson has the page.

Fixes found while measuring the lessons:
- **A touch in the gap between the stick and the look side** (or above the stick) landed on the canvas; Chrome's compatibility mousedown then asked for pointer lock, and after that every touch read as 0,0, so tags could not be tapped. Touch-born mouse events are now ignored, and the view takes touch taps itself.
- **Food puffed onto a slope used to skid on** (14 m in the sim test), because each dip counted as airborne and lost its ground friction. Rolling things now hug the ground. Feeding a downy went from 15 to 30 s to about 2 s.
- **A hungry downy that has spotted food now hurries to it.** It still bounces slowly while it is only hungry.
- **The feed goal counts only your own downies.** Wild ones foraging used to tick it.

**Keys.** E uses whatever is in reach; with nothing in reach it moves to the next slot (the table gives E to both). Q is the previous slot; the wheel and 1 to 5 also work; F also draws, for trackpads. Esc or P pauses. J brings up the next goal when no lesson has the page. With no pointer lock (or `&nolock`), right-drag looks.

**Touch.** Tapping the bellows' body flicks to the next slot that holds something; tapping one of its windows picks that slot. On a tall phone the bellows shrinks and tucks in low, and the Draw, Puff and Jump buttons sit above it. A quick tap anywhere that is not a button counts as a tap on what is under it (tags, windows).

**The canister.** One slot per kind: a full slot refuses more of its kind, and a full canister refuses a new kind (the "full" cue and a short note under the crosshair).

**Pens.** Food and down in flight slip between the rails, so you can puff food into a pen at the floor; rolling on the ground, the fence stops them. Downies need about 1.05 m to clear a low fence: calm hops are 0.4 to 0.6 m, frazzled ones about 1.3 m, thistles 1.6 m. A thistle in a low pen backs off from the rails and hops so the top of its hop is over them. The high fence is 2 m.

**Food groups.** Each group has one food (clover heads, sweetroot, dewberries), so clover, ember and brook downies only eat their own group, always their favourite (2 down). Thistles eat anything for 2 down. A trough gives brook downies a third.

**Wild downies** get hungry at half the rate and never past 0.7, and forage the wild food. Groups refill one at a time, out of sight (over 30 m away); thistles come to the ridge top from half past five to half past eight in the evening and leave after dark if not caught. Wild spawning stops at 56 downies.

**Nettlebacks** come in from the north edge of the meadow after half past eight at night (two at first, up to four), head for the ranch gate, then wander between pens without hedges, eating down on the ground and frightening downies within 3 m. A hedge keeps them out and keeps its pen calm. Anything puffed, in the air or skidding fast, sends one rolling; it flees for 20 s and comes back. At dawn they leave.

**Gardens** grow 5 (8 with rich soil) every 2 game hours (1.33 with a sprinkler), and stop when twice a crop is lying on the bed. "Pull the crop" empties a bed so something new can be puffed in; this is how the planting goal is met with the starter garden.

**Money.** You start with 300 coins (enough for the first pen). Journal rewards are 20 to 500.

**Light.** A pastel day leans on a strong soft sky light and a gentler sun, so slopes facing away from the low sun stay apricot and lilac instead of going brown. Nothing in the scene is pure black: the darkest colours are lifted so the flash scan can treat any pure black pixel as a fault.

**Checks.** Dev server: `npx vite --config scripts/ranch-vite.config.ts` (port 5251, no hot reload; `scripts/ranch-lessons-vite.config.ts` serves 5253). The scripts read `RANCH_URL`. URL flags: `&fresh`, `&taught` (every lesson done), `&nolock`, `&touch`, `&freeze` (no updates), `&slow` (fifth speed), `&hour=19`. `window.ranch` is the debug hook (sim, renderInfo, aimAt, step, watchNaN, injectNaN, tagScreen, slotScreen, seen, tutor). The single-feature scripts below open a taught ranch; `ranch-lessons.mjs` plays a fresh one.

| Script | What it checks |
| --- | --- |
| `node scripts/ranch-lessons.mjs [url]` | Every lesson played for real on a 412 by 838 phone at DPR 2.6 with CDP touch, then the start on a desktop with keys and the mouse, a stand-in pad's wording and a returning player's old save. A watcher checks every frame that nothing (buttons, coins, the clock, crosshair, bellows, slot windows, Use, gate prices, the edge chevron) is on screen before its lesson, and records when each first appeared. Shots in `/tmp/ranch-lessons` |
| `node scripts/ranch-play.mjs` | Desktop play with real keys and mouse: walk, look, draw, build through tags, puff into a pen, feed, collect, sell, shell pause and resume, Esc pause, save and reload |
| `node scripts/ranch-touch.mjs` | The same on a 412 by 900 phone at DPR 2.6 with CDP touch, plus the floating stick, two thumbs at once, slot taps, and the controls hiding on a key press |
| `node scripts/ranch-valley.mjs` | Gates, ember and brook downies, the workbench, glide, a silo, a feeder, nettlebacks, a thistle at dusk, sleep, cues and held sounds |
| `node scripts/ranch-pad.mjs` | Every action on a gamepad (a stand-in pad) |
| `node scripts/ranch-feel.mjs` | Head bob, roll, field of view, landing dip, draw times, puff speed, squash and stretch, pumping |
| `node scripts/ranch-perf.mjs` | Frame times, draw calls and triangles while playing, phone and desk |
| `node scripts/ranch-flash.mjs` | Frame readback for black or NaN pixels, after proving it catches a planted NaN; includes the lessons' marks by day and at dusk |
| `node scripts/ranch-shots.mjs`, `ranch-hud.mjs`, `ranch-kinds.mjs`, `ranch-drawseq.mjs` | Screenshots and contact sheets |
| `npx vitest run tests/ranch` | The rules and the lessons, without rendering: order, gating, urgent lessons, marks, quiet tags, line length and wording, credited saves, food on slopes |
