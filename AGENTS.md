# AGENTS.md

Rules for any coding agent working in Three Acres.

## Product

Three farming games on one farm, for the browser, phone first. Sunup (homestead day), Patchwork (almanac puzzle) and Bushel & Co. (crew and orders) are presets over nine independent axes: view, camera, control, clock, soil, goal, weather, crew, tools. The player can switch any axis at any moment and keep the same farm. Read `docs/DESIGN.md`, `docs/ART_DIRECTION.md` and `docs/ARCHITECTURE.md` before changing anything.

## Rules

1. **No em dashes or en dashes.** Not in code, comments, copy, commits or PRs. Use a period, comma, colon or parentheses.
2. **Commit messages and PR descriptions read as written by a human.** No AI attribution, no generated-by footers.
3. **Every mix works.** Anything added must work under every value of every axis, be drawn by both renderers and make sense in all three clocks. A switch never loses progress, traps the farmer or strands a job.
4. **`src/sim` is deterministic and render-free.** No DOM, no `Math.random`, no wall-clock time. Renderers, audio and UI only read the state and its events.
5. **Both views agree.** The same tile shows the same thing in 2D and 3D. The 2D view is its own painted art, not the 3D scene seen flat.
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
node scripts/qa/touch.mjs [url]        # touch controls with real touch events (phone viewport)
node scripts/qa/e2e.mjs 20 [w h] [url] # bot plays each game, then a storm of random switches
node scripts/qa/shot.mjs "preset=patchwork&fresh" /tmp/x.png 412 900
npx tsx scripts/balance.ts             # thirty bot days per game, money and harvest numbers
node scripts/render2d-shots.mjs        # 2D contact sheet; also render2d-perf, -flicker, -actors, -crops, -game
node scripts/audio-check.mjs           # audio levels, latency, crossfades, bursts (writes WAVs to /tmp/acres-audio)
```

URL flags: `?preset=sunup|patchwork|bushel` starts that game, `&fresh` starts a new farm, `&autoplay` hands the farm to the bot, `&touch` forces the touch controls on.

## Deploy

GitHub `Randroids-Dojo/ThreeAcres`, Vercel project `three-acres` (team randroid88s-projects). Every push to `main` deploys to https://three-acres.vercel.app. The build stamps `/version.json` with the commit and open copies offer a reload.
