// The seams between modules. The simulation (src/sim) owns the WorldState and
// emits SimEvents. The two renderers and the audio engine only read the state
// and react to events. The director (src/game) owns input, the camera intent
// and which renderer is visible. Nothing here may import from src/game.

import type { Rules, Season, SimEvent, Verb, Weather, WorldState } from './sim/types';

export interface CameraIntent {
  /** close follows the farmer; wide frames the whole farm. */
  mode: 'close' | 'wide';
  /** Tile-space point the close camera follows: the farmer's position. */
  focusX: number;
  focusY: number;
  /** Player zoom multiplier on the default framing, 0.6 to 2.5. 1 is the default. */
  zoom: number;
  /** Player pan in tiles from the default centre. Wide only; close ignores it. */
  panX: number;
  panY: number;
}

export interface Highlight {
  x: number;
  y: number;
  /** What the current tool would do on this tile, or null if nothing. */
  verb: Verb | null;
  ok: boolean;
}

export interface FrameView {
  state: Readonly<WorldState>;
  rules: Readonly<Rules>;
  /** Real seconds since the app started, and since the last frame (clamped to 0.1). */
  t: number;
  dt: number;
  camera: CameraIntent;
  /** The tile the player is aiming at: under the pointer (point) or in front of the farmer (walk). */
  highlight: Highlight | null;
  /** Hour of day 6 to 24, float. */
  hour: number;
  /** 0 night to 1 full day, smoothed. Drive sky, sun and lamp light from it. */
  daylight: number;
  /** Night transition: rises 0 to 1 and back to 0 while the day turns over. Darken the whole view by it. */
  night: number;
  season: Season;
  /** Show moisture and nutrient per plot (synergy soil overlay). */
  soilOverlay: boolean;
  /** Draw quality pips on crops (synergy growth). */
  showQuality: boolean;
  /** Reduced motion: no camera shake, gentler particles. */
  reducedMotion: boolean;
  /** Render quality hint from settings. */
  quality: 'low' | 'high';
}

export interface Renderer {
  readonly kind: '2d' | '3d';
  /** The renderer's own canvas. The director positions it and fades it. */
  readonly canvas: HTMLCanvasElement;
  /** CSS pixel size of the canvas and the device pixel ratio to render at. */
  resize(w: number, h: number, dpr: number): void;
  /** Draw one frame. Called every animation frame while visible, including during a crossfade. */
  frame(view: FrameView): void;
  /** Every simulation event, visible or not, so effects stay coherent. Must be cheap when hidden. */
  onEvent(e: SimEvent, state: Readonly<WorldState>): void;
  /** CSS px relative to the canvas, to the tile under it, using the last frame's camera. Null if off the map. */
  pick(px: number, py: number): { x: number; y: number } | null;
  /** Tile-space point (x, y are tile units, e.g. 3.5 is the middle of column 3) to CSS px, at a height in tiles. Null if behind the camera. */
  project(x: number, y: number, height?: number): { x: number; y: number } | null;
  /** About to become visible after the other view: jump the camera to the current framing, no glide. */
  snap(view: FrameView): void;
  dispose(): void;
}

export type UiCue = 'tap' | 'open' | 'close' | 'toggle' | 'preset' | 'buy' | 'deny' | 'tool' | 'page' | 'star' | 'order';

export interface AudioMood {
  /** Which game is playing: picks the music. Homestead, deck and ranch each have their own. */
  game: 'title' | 'homestead' | 'ranch' | 'deck';
  /** 0 calm to 1 busy: danger in the ranch, a scoring run in the deck. */
  intensity: number;
  /** Homestead rules (the sim's). Other games pass the homestead defaults. */
  rules: Readonly<Rules>;
  hour: number;
  season: Season;
  weather: Weather;
  /** title: the title screen. farm: playing. menu: a dialog or the mixer is open over the farm. */
  scene: 'title' | 'farm' | 'menu';
  night: number;
  /** Flow clock speed (0 paused, 1, 2, 4). Under other clocks always 1. */
  speed: number;
  /** Stamina or moves are nearly gone. */
  tired: boolean;
}

export interface AudioEngine {
  /** Call from a user gesture (pointerup, touchend, click, keydown). Safe to call repeatedly. */
  unlock(): void;
  /** Called every frame. Cheap: only acts when something changed. */
  mood(m: AudioMood): void;
  event(e: SimEvent, state: Readonly<WorldState>): void;
  ui(cue: UiCue): void;
  setVolumes(v: { master: number; music: number; sfx: number }): void;
  /** Tab hidden or app paused. */
  suspend(on: boolean): void;
  /** A named one-shot sound for the ranch and the deck (see docs/AUDIO_CUES.md). Unknown names are ignored. */
  cue(name: string, opts?: CueOpts): void;
  /** Start or stop a held sound (the ranch's bellows drawing, wind). Unknown names are ignored. */
  loop(name: string, on: boolean, opts?: CueOpts): void;
}

export interface CueOpts {
  /** -1 left to 1 right. */
  pan?: number;
  /** 0 to 1, default 1. */
  gain?: number;
  /** Playback rate or pitch multiplier, default 1. */
  pitch?: number;
}
