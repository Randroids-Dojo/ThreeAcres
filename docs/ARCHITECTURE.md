# Three Acres: architecture

```
src/
  main.ts          routes ?dev= workbenches, otherwise starts the shell
  shell/           title and switcher, shared settings, device tracking, audio unlock, updates
    types.ts       GameModule, GameContext, GameHandle: the seam every game implements
    games.ts       the three games' static info and lazy loaders
  games/
    ranch/         Thistledown (first person, three.js)
    homestead/     Sunup: director over src/sim, drawn by src/render3d
    deck/          Seedbound (rules engine, card UI, a board painted with src/render2d's crop art)
  audio/           one procedural Web Audio engine for every game (docs/AUDIO_CUES.md)
  contract.ts      AudioEngine and the renderer contract Sunup's view implements
  sim/             Sunup's farm simulation (deterministic, tested)
  render3d/        Sunup's 3D diorama
  render2d/        the almanac-page renderer; Seedbound reuses its crop paintings
  ui/              Sunup's HUD and dialogs, shared DOM helpers, icons, styles
  game/            Sunup's input and the update checker
  dev/             fixtures and renderer workbenches
```

## A game's life

1. The shell shows the title. Picking a game lazy-loads its module and calls `start(ctx)` with a container, the shared audio engine, settings, the device, and the game's own save slot.
2. The game builds itself inside `ctx.root`, runs its own animation loop, and calls `ctx.audio.mood({ game, ... })` every frame.
3. Switching away calls `save()` then `pause()`: the loop stops, pointer lock is released, and held sounds stop. Switching back calls `resume()`.
4. "Start over" clears the save and calls `reset()`.

Each game owns its input, apart from the shell's ` key and corner button. The shell tracks the last input device; games read it with `ctx.device()`.
