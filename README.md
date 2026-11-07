# Three Acres

Three separate farming games for the browser, phone first, under one roof. Play them at **https://three-acres.vercel.app**.

| Game | Kind |
| --- | --- |
| **Thistledown** | First-person creature ranch. Catch downies with a bellows, pen and feed them, sell their fluff, and open up the valley. |
| **Sunup** | Homestead life sim. Real-time days of planting, watering and harvesting, town requests, a fair each season, tool upgrades. |
| **Seedbound** | Roguelike seed deckbuilder. Plant seed cards on a small plot, chain their bonuses, pick an engine, and meet each season's quota. |

Each game has its own world, rules, controls, look, music and save. The corner button (or the ` key) switches between them, and each picks up where you left it. Touch, mouse and keyboard each play all three, and every game teaches its controls one at a time as you play.

The games were shaped by twelve rounds of harsh playtests; what is still open is in `docs/BACKLOG.md`.

```bash
npm install
npm run dev        # http://localhost:5247
npm test
npm run build
```

Design: `docs/DESIGN.md`, then each game's doc (`docs/RANCH.md`, `docs/SUNUP.md`, `docs/DECK.md`). Art: `docs/ART_DIRECTION.md`. Code layout: `docs/ARCHITECTURE.md`. Sound: `docs/AUDIO_CUES.md`. Agent rules and every check script: `AGENTS.md`.
