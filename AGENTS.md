# AGENTS.md

Rules for any coding agent working in Three Acres.

## Product

Three separate farming games for the browser, phone first, under one shell: Thistledown (first-person creature ranch), Sunup (homestead life sim) and Seedbound (roguelike deckbuilder). Each has its own world, rules, controls, look, music and save; the shell's corner button switches between them. Read `docs/DESIGN.md`, then the game's own doc (`docs/RANCH.md`, `docs/SUNUP.md`, `docs/DECK.md`), `docs/ARCHITECTURE.md` and `docs/AUDIO_CUES.md`.

## Rules

1. **No em dashes or en dashes.** Not in code, comments, copy, commits or PRs. Use a period, comma, colon or parentheses.
2. **Commit messages and PR descriptions read as written by a human.** No AI attribution, no generated-by footers.
3. **Each game stands alone.** Games share only the shell, the audio engine, fonts and small UI helpers. Never make one game depend on another's code paths, and keep them feeling different: their own verbs, camera, pacing and look.
4. **Rules engines are deterministic and render-free.** Sunup's `src/sim` and Seedbound's rules: No DOM, no `Math.random`, no wall-clock time. Renderers, audio and UI only read the state and its events.
5. **Leave the shell's corner clear.** The switcher button sits top left (60 px plus the safe area); every game keeps it free.
6. **Every input path.** Touch, mouse and keyboard must each play the whole game and drive every menu. Gamepad where it is cheap.
7. **Copy is short, plain and sentence case**, warm and dry, like an almanac. No hype, no exclamation marks.
8. **Measure, do not eyeball.** Game feel, audio and visuals are checked with instrumented scripts in `scripts/` as well as screenshots.
9. Never commit `.env*` files or print secrets.

## Commands

```bash
npm run dev          # Vite on :5247
npm run typecheck
npm test             # simulation rules, presets, switching
npm run build
```

Workbench: `/?dev=2d`, `/?dev=3d`, `/?dev=both`, `/?dev=audio`.

Checks (dev server running; `npx vite --config scripts/lead-vite.config.ts` serves :5247 without hot reload):

```bash
node scripts/qa/touch.mjs [url]        # touch controls with real touch events (phone viewport); a real tap picks every seed
node scripts/qa/overlap.mjs [url]      # Sunup: no two HUD pieces overlap in any state, phone and desktop; no ruled line through words; every visible button takes a tap
node scripts/qa/lessons.mjs [url]      # Sunup's lessons: one feature at a time, nothing on screen before its lesson
node scripts/ranch-thumbs.mjs [url]    # Thistledown thumb room at the Pixel's viewport: look, buttons, stick, bellows, journal; every slot window takes a tap
node scripts/ranch-tags.mjs [url]      # Thistledown: every hanging tag's title and note fit on the tag, in the game's font (with a control that must fail)
node scripts/ranch-lessons.mjs         # Thistledown's lessons on phone, desktop and pad (RANCH_URL=...); nothing early, frame by frame; no ruled line through journal words
node scripts/deck-lessons.mjs [url]    # Seedbound's guided first season: one piece of the table at a time
node scripts/deck-overlap.mjs [url]    # Seedbound: no two table pieces overlap in any state; no ruled line through words, no price tag over a card's name, every visible button takes a tap
node scripts/qa/e2e.mjs 20 [w h] [url] # bot plays each game, then a storm of random switches
node scripts/qa/shot.mjs "preset=patchwork&fresh" /tmp/x.png 412 900
npx tsx scripts/balance.ts             # thirty bot days per game, money and harvest numbers
npx tsx scripts/ranch-sell-aim.ts      # Thistledown: share of blows that sell from 1.6 to 8 m with aiming errors, and whether the sell crosshair told the truth
node scripts/render2d-shots.mjs        # 2D contact sheet; also render2d-perf, -flicker, -actors, -crops, -game
node scripts/render3d-flash.mjs        # 3D frame readback for black or NaN pixels; also render3d-shots, -perf, -pick, -leak
node scripts/audio-check.mjs           # audio levels, latency, crossfades, bursts (writes WAVs to /tmp/acres-audio-2)
```

Screenshots stall frames at DPR 2, so take frame times from runs without them.

Ruled paper: draw rules on the lines of writing (a border under a title, or a gradient on the text element sized from its own line height), never at fixed pixel offsets on the page. `scripts/qa/strike.mjs` finds any rule crossing the middle of a line of words; the checks above run it.

Tap reach: an invisible touch zone (a walk stick's capture area) can lie over a control the player can see, which a box overlap check never notices. `scripts/qa/reach.mjs` asks the browser what a tap at five points across each visible button would hit; the overlap and thumb checks run it.

URL flags: `?game=ranch|homestead|deck` opens that game directly, `&fresh` clears its save first (once; a reload keeps the save). Sunup also takes `&autoplay` (the bot plays) and `&touch` (touch controls forced on). Thistledown takes `&taught` (lessons skipped) and `&freeze`.

## Deploy

GitHub `Randroids-Dojo/ThreeAcres`, Vercel project `three-acres` (team randroid88s-projects). Every push to `main` deploys to https://three-acres.vercel.app. The build stamps `/version.json` with the commit and open copies offer a reload.
