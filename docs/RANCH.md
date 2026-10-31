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

**Teaching.** No how-to card. A clover downy hops about the porch, the sign at the ranch gate shows the draw glyph, the first journal page slides up after the first thing is drawn, and each device hint shows only until its action is done once (saved). The pause page carries a two-line controls reminder.

**Keys.** E uses whatever is in reach; with nothing in reach it moves to the next slot (the table gives E to both). Q is the previous slot; the wheel and 1 to 5 also work; F also draws, for trackpads. Esc or P pauses. J brings the journal page back up. With no pointer lock (or `&nolock`), right-drag looks.

**Touch.** Tapping the bellows' body flicks to the next slot that holds something; tapping one of its windows picks that slot. On a tall phone the bellows shrinks and tucks in low, and the Draw, Puff and Jump buttons sit above it. A quick tap anywhere that is not a button counts as a tap on what is under it (tags, windows).

**The canister.** One slot per kind: a full slot refuses more of its kind, and a full canister refuses a new kind (the "full" cue and a short note under the crosshair).

**Pens.** Food and down in flight slip between the rails, so you can puff food into a pen at the floor; rolling on the ground, the fence stops them. Downies need about 1.05 m to clear a low fence: calm hops are 0.4 to 0.6 m, frazzled ones about 1.3 m, thistles 1.6 m. A thistle in a low pen backs off from the rails and hops so the top of its hop is over them. The high fence is 2 m.

**Food groups.** Each group has one food (clover heads, sweetroot, dewberries), so clover, ember and brook downies only eat their own group, always their favourite (2 down). Thistles eat anything for 2 down. A trough gives brook downies a third.

**Wild downies** get hungry at half the rate and never past 0.7, and forage the wild food. Groups refill one at a time, out of sight (over 30 m away); thistles come to the ridge top from half past five to half past eight in the evening and leave after dark if not caught. Wild spawning stops at 56 downies.

**Nettlebacks** come in from the north edge of the meadow after half past eight at night (two at first, up to four), head for the ranch gate, then wander between pens without hedges, eating down on the ground and frightening downies within 3 m. A hedge keeps them out and keeps its pen calm. Anything puffed, in the air or skidding fast, sends one rolling; it flees for 20 s and comes back. At dawn they leave.

**Gardens** grow 5 (8 with rich soil) every 2 game hours (1.33 with a sprinkler), and stop when twice a crop is lying on the bed. "Pull the crop" empties a bed so something new can be puffed in; this is how the planting goal is met with the starter garden.

**Money.** You start with 300 coins (enough for the first pen). Journal rewards are 20 to 500.

**Light.** A pastel day leans on a strong soft sky light and a gentler sun, so slopes facing away from the low sun stay apricot and lilac instead of going brown. Nothing in the scene is pure black: the darkest colours are lifted so the flash scan can treat any pure black pixel as a fault.

**Checks.** Dev server: `npx vite --config scripts/ranch-vite.config.ts` (port 5251, no hot reload). URL flags: `&fresh`, `&nolock`, `&touch`, `&freeze` (no updates), `&slow` (fifth speed), `&hour=19`. `window.ranch` is the debug hook (sim, renderInfo, aimAt, step, watchNaN, injectNaN, tagScreen, slotScreen).

| Script | What it checks |
| --- | --- |
| `node scripts/ranch-play.mjs` | Desktop play with real keys and mouse: walk, look, draw, build through tags, puff into a pen, feed, collect, sell, shell pause and resume, Esc pause, save and reload |
| `node scripts/ranch-touch.mjs` | The same on a 412 by 900 phone at DPR 2.6 with CDP touch, plus the floating stick, two thumbs at once, slot taps, and the controls hiding on a key press |
| `node scripts/ranch-valley.mjs` | Gates, ember and brook downies, the workbench, glide, a silo, a feeder, nettlebacks, a thistle at dusk, sleep, cues and held sounds |
| `node scripts/ranch-pad.mjs` | Every action on a gamepad (a stand-in pad) |
| `node scripts/ranch-feel.mjs` | Head bob, roll, field of view, landing dip, draw times, puff speed, squash and stretch, pumping |
| `node scripts/ranch-perf.mjs` | Frame times, draw calls and triangles while playing, phone and desk |
| `node scripts/ranch-flash.mjs` | Frame readback for black or NaN pixels, after proving it catches a planted NaN |
| `node scripts/ranch-shots.mjs`, `ranch-hud.mjs`, `ranch-kinds.mjs`, `ranch-drawseq.mjs` | Screenshots and contact sheets |
| `npx vitest run tests/ranch-sim.test.ts` | The rules, without rendering |
