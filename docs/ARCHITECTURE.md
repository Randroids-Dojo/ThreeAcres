# Three Acres: architecture

```
src/
  sim/        the farm and every rule set. Deterministic, no DOM, no Math.random.
  contract.ts the seams: Renderer, FrameView, CameraIntent, AudioEngine.
  render2d/   the almanac-page renderer (Canvas 2D). Exports createRenderer2D().
  render3d/   the toy-diorama renderer (three.js). Exports createRenderer3D().
  audio/      procedural Web Audio music and sound. Exports createAudio().
  game/       the director: loop, input, camera intent, view crossfade, saves.
  ui/         DOM HUD, toolbar, mixer, dialogs.
  dev/        fixtures, the renderer workbench and a placeholder renderer.
```

## Flow of a frame

1. Input becomes `Command`s (src/sim/commands.ts).
2. `step(state, dt, commands)` advances the world and returns `SimEvent`s.
3. Events go to both renderers, the audio engine and the UI.
4. The director builds a `FrameView` (camera intent, highlight, smoothed daylight) and calls `frame` on the visible renderer (both during a crossfade).

## Rules

- Only `src/sim` writes the `WorldState`. Renderers treat it as read-only and keep their own effect state.
- Renderers know nothing about each other or the DOM outside their canvas.
- The view switch is a 450 ms crossfade. Before the incoming renderer's first frame, the director calls `snap` so its camera starts on the same framing.
- Tile units everywhere: tile (x, y) covers x to x+1, y to y+1. +y is south (down the screen in 2D, +z in 3D). Actor angle 0 faces east, PI/2 faces south.

## Workbench

`npm run dev`, then open `/?dev=2d`, `/?dev=3d` or `/?dev=both` (V swaps views to check they agree). Fixtures live in `src/dev/fixtures.ts`; `window.harness` drives it from Playwright. `/?dev=audio` is the audio workbench.
