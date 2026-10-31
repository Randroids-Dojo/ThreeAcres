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

## What the engine does

This records how `src/audio` meets the spec above, so a game knows what to pass.

### Music

- **Picked by `mood.game`**, not by `rules.clock`. `scene: 'title'` always plays the title. Homestead plays the folk band, the deck the felt piano, the ranch its own band. The old Bushel & Co. marimba groove is gone; `rules.clock` now only picks Sunup's dawn sound.
- **Switching games** fades the old bus out (time constant 0.26 s) and the new one in (0.2 s): about 95% of the way by 0.8 s, and the sum of the two never sags under 0.8. The new arrangement sounds its chord the moment it enters.
- **Homestead:** as before, with seasons, the late-hours thinning from 17:30 and the lullaby from 21:00. Only Sunup thins and hands over to the lullaby.
- **Deck:** felt piano, celesta and pad, a touch slower than the shared tempo. `intensity` brings in a lift layer at 0.9 times its value: a soft piano pulse in eighths, celesta a register up, a seed pod and a frame drum. It comes in most of the way within a second and settles over about 2.5 s once intensity drops.
- **Ranch by day:** kalimba ostinato, harp bass and rolls, a breathy flute lead (lower in autumn and winter), open pads (root, fifth, ninth, third), and hand percussion (frame drum, finger taps, seed pod), all through a dotted-eighth echo for the valley. Winter rests the percussion and gives the lead to bells.
- **Ranch by night:** slow harp, a few kalimba (or winter bell) stars, a far ocarina in the B sections, longer echo, about 10% slower. Day and night crossfade by `mood.hour` (any hour 0 to 24): dusk from 18:30 to 20:30, dawn from 4:30 to 6:30.
- **Ranch tension:** `intensity` brings in a frame-drum heartbeat, a low harp ostinato leaning on the flat sixth, and a held suspension, at 0.85 times its value, by day or night.
- **Seasons** colour every arrangement through the shared progressions, keys and tempos.

### Ambience

Weather (rain, storm, thunder, wind) sounds in every game. The deck hears it a little further off (0.7). Night brings crickets everywhere. The ranch adds wind in long grass, meadow insects by day, far birds through a soft lowpass, and owls at night. `ranch.water` and `ranch.vents` sit with the ambience and follow its level.

### Cues and loops

- **Before the first tap**, one-shots are dropped. Loops are remembered and start once there is sound.
- **Unknown names** do nothing, for both `cue` and `loop`.
- **`pan`** is -1 to 1 for every cue and loop. **`gain`** scales every cue and loop. Cues whose gain carries an amount keep a floor so a small amount is still heard: `deck.water` (0.35), `ranch.land` (0.3), `ranch.coins` (0.6, and one to four notes by gain).
- **`pitch` on sound effects** (steps, sucks, chirps, puffs and the like) is the playback rate.
- **`pitch` on the stepped cues** picks a note:
  - `deck.harvest` uses the key's pentatonic from a fifth above the tonic, about two and a half octaves.
  - `deck.mult` uses the pentatonic an octave up. It adds an octave bell from the fifth rung and a music box from the eighth.
  - `deck.chip` uses the tones of the chord sounding right now.
  - The note is the rung nearest `pitch` semitones above the bottom. Within a chain (calls less than 0.9 s apart), a rising pitch always takes a higher rung and never repeats or falls, so pass any rising pitch, for example `2 ** (n / 12)` or `1 + n * 0.05`. Leave `pitch` out and each call in a chain takes the next rung by itself (chips wrap; harvests and mults hold at the top).
- **`pitch` on the tunes** (`deck.big`, `deck.quota`, `deck.fail`, `ranch.goal`, `ranch.sleep`) snaps to the nearest in-key transposition: an octave, a fifth or a fourth either way. `ranch.slot` picks a pentatonic note by pitch.
- **Rate limits:**

  | Cue | At most |
  |---|---|
  | `deck.chip` | about 29 a second, four sounding at once (may slip up to 12 ms) |
  | `deck.hover` | 20 a second |
  | `ranch.step` and `ranch.stepstone` | 12 a second between them |
  | `ranch.suck` | 36 a second, eight sounding at once |
  | `deck.draw` | queues up to 0.5 s, one every 65 ms (a riffle) |

  Past 30 live effect voices the busy cues (hovers, steps, sucks) drop first, past 38 the ordinary ones, and fanfares, refusals and chips keep going up to 48.
- **Loops** fade in and out on their own gain (`ranch.draw` in about 60 ms and out in about 150 ms). Calling `loop(name, true, opts)` every frame is cheap; a changed gain, pitch or pan glides there. A game's loops are silent while another game is playing (they fade with the music) and come back when it returns, so a paused ranch never leaves the bellows running.

### Sunup events added since

`refill` (a splash and a gurgle), `upgrade` (three knocks and a bell climbing with the level) and `request` (a warm rise when filled, a soft fall when missed).

### Checking it

- `/?dev=audio` has a game selector, an intensity slider, a button for every cue (with pan, gain and pitch sliders), loop toggles, and scenario buttons: a cascade, a chip flood, a draw with 30 sucks a second, a walk, and a nettleback.
- `node scripts/audio-check.mjs` measures everything here and writes WAVs, a cue sheet (`cue-sheet.txt`) and `report.json` to `/tmp/acres-audio-2`.
- `node scripts/audio-shots.mjs` presses every workbench button in a real page and takes screenshots.
