# Three Acres: art direction

Two views of the same farm. They must look like two different, finished games, each handsome on its own, and they must agree on every fact: the same crops at the same stages in the same tiles, the same actors in the same places doing the same thing, the same weather and time of day. The 2D view is never the 3D scene seen flat (a rejected approach on a sibling project), and the 3D view is never 2D sprites on cards.

## 2D: the almanac page

A farm drawn into an old farmer's almanac or seed catalogue. Warm paper ground showing through, gouache and watercolour flats, confident ink linework with slight wobble, cross-hatched shadow, hand-lettered feel. Three-quarter top-down (oblique): tiles are square on the page, things with height (crops, people, buildings, trees, scarecrows) are drawn upright and overlap the tile above, sorted by y. Think botanical plate meets board game.

- Crops are botanical drawings, readable at 24 px per tile: each crop has a distinct silhouette and colour at every stage. Radish (red bulb shoulders, round leaves), lettuce (pale green rosette), carrot (feathery fronds, orange shoulder), beans (pole with twining vine, pods), strawberry (low runners, white flowers then red berries), sunflower (tall stalk, big yellow head), corn (tall blades, tassel, cobs), pumpkin (sprawling vine, big leaves, orange fruit).
- Soil: dry tilled soil is a light ochre with drawn furrows; wet soil is a darker umber wash with a sheen; untilled field is a rough meadow with tufts; unowned fields are tall grass behind a split-rail fence with a small hand-lettered "for sale" tag.
- Ink colour and paper tone shift with the season and the light. Night is a deep indigo wash with the house windows and lanterns glowing through.

## 3D: the toy diorama

A tabletop diorama of a farm on a chunk of earth, cut out of the ground so the soil layers show at the edges, sitting in soft mist. Low-poly but rich: bevelled toy shapes, matte painted materials, soft warm key light with real shadows, a cool sky fill, a gentle tilt-shift depth of field in the wide view only if it costs little. Day and night with a moving sun, warm window and lantern light after dusk.

- Crops are little sculpted models per stage, instanced. Tall crops are properly tall. Ripe crops have a small idle sway. Withered crops slump and go grey-brown.
- Wet soil is darker and slightly glossy. Furrows are modelled. Meadow is tufted. Unowned fields are long grass behind a fence with a sign.
- People are chunky toy figures: the farmer in a straw hat and blue overalls, hands in bandanas with shirts by tint (six tints). Walk cycle with bob, tool animations per verb (hoe swing, can tip with water arc, seed scatter, pull and lift, crouch to tend, wave arms to scare, hammer to build).

## Everything both views must show

- Ground: grass, yard (packed earth), path (gravel or flagstones), water (the pond, animated), wood (the tree belt around the farm, can be dense trees), field.
- Props from `src/sim/map.ts`: house (door south, windows lit at night, chimney smoke in the morning), shipping crate, notice board, bunkhouse. The road leaving east from the yard path.
- Plots: untilled, tilled dry, tilled wet (classic `wet`) or moisture 0 to 3 (synergy), crops at stages 0 to 4, dead, bugs (1 to 3, more bugs as the number rises), quality pips 0 to 3 when `showQuality` (silver, gold, star; draw nothing for 0).
- Soil overlay when `soilOverlay`: moisture as blue drops or fill (0 to 3) and nutrient as a green or brown bar or dots (0 to 3), legible without hiding the crops.
- Builds: sprinkler, scarecrow.
- Actors: farmer and hands (skip `away`), facing by `angle`, walking (`moving`, phase from `walked`), task animation from `task.verb`, `task.t`, `task.dur`, hop arc from `hop` (turns mode jumps).
- Crows: flying in from (`fromX`, `fromY`) to the target over `CROW_FLY_SECONDS` while `phase === 'in'` (t is seconds), pecking (`peck`), fleeing back (`flee`), hidden (`gone`).
- Jobs: queued markers on tiles (a small flag or chalk mark per verb), dimmer when unclaimed.
- Highlight: the aimed tile with the verb it will do (icon or tint), red-tinged when `ok` is false.
- Weather: sun, cloud (dimmer, cloud shadows), rain (streaks, puddle ripples, darker), storm (heavier rain, wind, lightning flash on `thunder`), heat (warm haze, shimmer). Winter rain falls as snow and the ground is frosted.
- Seasons: 0 spring (fresh greens, blossom), 1 summer (deep green, gold), 2 autumn (ochre, rust, falling leaves), 3 winter (pale, frosted, bare trees). Fields keep growing in every season.
- Day and night from `hour` and `daylight`; the `night` transition darkens the whole view fully at its peak.

## Event effects

Every event in `SimEvent` that has a tile gets an effect at that tile: till (dirt puff), water (splash and droplets, soil darkens), plant (seed pop), grow (a little bounce of the plant), harvest (the crop pops up and arcs towards the shipping crate, with a quality sparkle), tend (bugs scatter), clear (debris), build and unbuild (dust and a bounce), wither (droop and a few dead leaves), bugs (a few specks appear), sprinkle (spray ring), crowIn, crowEat (feathers and the crop is gone), crowScared (feathers, flap away), deny (a small shake or red flash), coins (gold glints rising), thunder (screen flash), dawn (a soft brightening). Effects never block reading the farm.

## Camera

`CameraIntent` from `src/contract.ts`. Close: centred on (focusX, focusY), about 9 tiles across on the short side of the screen, gently smoothed. Wide: the whole map fits with a small margin, centred on the map centre plus (panX, panY), with zoom as a multiplier; clamp so the farm cannot leave the screen. Portrait phones (412 by 900 CSS px) are a first-class layout: the wide view should frame the fields (columns 1 to 18) rather than the tree border so tiles stay big enough to tap. `pick` and `project` must use exactly the camera last drawn. `snap` jumps to the target framing with no glide.

## Performance

60 fps on a Pixel 8 Pro (Mali-G715, DPR about 2.6, 412 CSS px wide) and on a laptop. Cap DPR at 2. Cache what does not change (2D: ground layer to an offscreen canvas, redrawn only when plots change; 3D: instanced crops, merged static geometry, one shadow-casting light, small shadow map on low quality). No allocation per frame in hot paths.
