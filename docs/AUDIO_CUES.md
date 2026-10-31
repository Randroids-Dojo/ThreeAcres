# Audio: games, music and cues

One shared engine (`src/audio`) serves all three games and the title. Each game sets `mood.game` every frame while it runs; the title sets `game: 'title'`.

## Music per game

| `mood.game` | Music | Notes |
|---|---|---|
| `title` | The title variant | As now. |
| `homestead` (Sunup) | Warm acoustic folk (the old "day" arrangement) | Seasons, late-hours thinning and night as now. |
| `deck` (Seedbound) | Cosy and contemplative: felt piano, celesta, soft pads (the old "turns" arrangement) | `mood.intensity` rises from 0 to 1 during a scoring cascade: lift the music a little (a pulse, a brighter voicing), then settle. |
| `ranch` (Thistledown) | New: airy and open, for wandering outdoors. Kalimba or plucked harp, a breathy flute or ocarina lead, soft pads, light hand percussion, a sense of wind and space. | Day and night variants from `mood.hour` (night is sparse and dreamy). `mood.intensity` (nettlebacks near, or a frazzled pen) adds a gentle tension layer. |

**Switching games:** the old game's music fades out over about 0.8 s and the new one fades in. Seasons (`mood.season`) colour every arrangement. `mood.weather` drives the ambience in every game.

## Named cues

Games call `audio.cue(name, opts)` and `audio.loop(name, on, opts)`.
- `opts.pan` runs from -1 to 1, `opts.gain` from 0 to 1, and `opts.pitch` is a multiplier.
- Unknown names are ignored, so games can call cues before they exist.
- Cues that pitch-step (deck.chip, deck.mult) should stay musical: follow the current chord or a pentatonic ladder.

### Seedbound (deck)

| Cue | When |
|---|---|
| `deck.draw` | A card is drawn (several in a row: a soft riffle) |
| `deck.shuffle` | The discard pile reshuffles into the draw pile |
| `deck.hover` | A card lifts under the pointer (very soft) |
| `deck.pick` | A card is picked up |
| `deck.drop` | A card is put back |
| `deck.play` | A card is played (a paper swish and thump) |
| `deck.plant` | A seed goes into soil |
| `deck.water` | Plots are watered (scale gain by plot count) |
| `deck.weather` | A weather card is set for tonight |
| `deck.grow` | Crops grow overnight (a soft shimmer, once per night) |
| `deck.harvest` | A crop is pulled (pitch rises along the chain via `opts.pitch`) |
| `deck.chip` | A chip count ticks (tiny, rapid, pitch-stepped) |
| `deck.mult` | A multiplier applies (brighter, bigger as mult grows) |
| `deck.big` | A harvest scores at least a quarter of the quota (a little fanfare) |
| `deck.quota` | The season's quota is met |
| `deck.fail` | The run ends (gentle, not harsh) |
| `deck.buy` | A shop purchase |
| `deck.page` | An almanac page is taken |
| `deck.remove` | A card is removed |
| `deck.reroll` | The shop is rerolled |
| `deck.pest` | Pests appear |
| `deck.crow` | A crow steals a crop |
| `deck.endday` | End day is pressed |
| `deck.deny` | Not enough energy, or an invalid target |

### Thistledown (ranch)

**Loops** (start and stop with `loop`):

| Loop | What |
|---|---|
| `ranch.draw` | The bellows drawing (a rushing inhale with a rhythmic creak) |
| `ranch.wind` | A gust (gain from `opts.gain`) |

**One-shots:**

| Cue | When |
|---|---|
| `ranch.suck` | Something enters the canister (pitch by size: tuft high, downy low) |
| `ranch.puff` | A shot leaves the bellows |
| `ranch.full` | The canister refuses something |
| `ranch.slot` | The selected slot changes |
| `ranch.step` | A footstep (`opts.pitch` varies; grass by default) |
| `ranch.stepstone` | A footstep on stone or a path |
| `ranch.jump` | A jump |
| `ranch.land` | A landing (gain by fall speed) |
| `ranch.glide` | Gliding starts |
| `ranch.chirp` | A downy's happy chirp (panned; pitch by kind) |
| `ranch.squeak` | A downy is drawn up (panned) |
| `ranch.boing` | A downy lands from a hop or a shot |
| `ranch.eat` | A downy eats |
| `ranch.shed` | Down tufts pop off a downy |
| `ranch.frazzle` | A downy turns frazzled (an anxious trill) |
| `ranch.sell` | Down goes into the Exchange |
| `ranch.coins` | Coins arrive (gain by amount) |
| `ranch.build` | A pad is built or upgraded |
| `ranch.gate` | A gate opens |
| `ranch.nettle` | A nettleback is near (a snuffle) |
| `ranch.nettlehit` | A nettleback is hit and rolls away |
| `ranch.splash` | Something lands in water |
| `ranch.goal` | A journal goal is done |
| `ranch.deny` | Can't afford, or not allowed |
| `ranch.sleep` | Sleep, through to morning |

Ambience for the ranch comes from `mood`:
- **Day:** wind in long grass, distant birds, meadow insects.
- **Night:** crickets and soft owls.
- **Near the Hollow:** water, as a game can request with `loop('ranch.water', on, { gain })`.
- **On the Ridge:** steam vents, with `loop('ranch.vents', on, { gain })`.
