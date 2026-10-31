// The seam between the shell and the three games. Each game is a module with
// its own world, rules, controls, look and save. The shell owns the title,
// the game switcher, shared settings, audio unlock and update checks, and
// keeps each started game alive (paused) so switching back is instant.

import type { AudioEngine } from '../contract';

export type GameId = 'ranch' | 'homestead' | 'deck';

export interface ShellSettings {
  master: number;
  music: number;
  sfx: number;
  quality: 'auto' | 'low' | 'high';
  reducedMotion: boolean;
}

export type Device = 'touch' | 'mouse' | 'key' | 'pad';

export interface GameContext {
  /** Full-screen container for this game. The shell shows and hides it; the game owns everything inside. */
  root: HTMLElement;
  /** The shared audio engine. Call audio.mood() every frame while running. */
  audio: AudioEngine;
  settings(): ShellSettings;
  /** Render quality to use: 'low' on phones unless the player chose otherwise. */
  quality(): 'low' | 'high';
  /** Last input device, tracked by the shell across all games. */
  device(): Device;
  /** True until the player has pressed, clicked or touched anything. Use with device(). */
  deviceKnown(): boolean;
  /** Open the game switcher (the shell also has its own button and the ` key). */
  openSwitcher(): void;
  /** This game's own save slot (JSON). */
  load<T>(): T | null;
  /** Write the save, with a few words for the title card, e.g. "Day 12, 3 pens". */
  save(value: unknown, summary: string): void;
  clearSave(): void;
}

export interface GameHandle {
  /** Stop the loop, release pointer lock, stop held sounds. State stays in memory. */
  pause(): void;
  /** Start the loop again exactly where it left off. */
  resume(): void;
  /** Write the save now (page hide, before switching away). */
  save(): void;
  /** Start this game over from scratch (the save is already cleared). */
  reset(): void;
}

export interface GameInfo {
  id: GameId;
  name: string;
  /** One line under the name. */
  line: string;
  /** Two or three short sentences for the title card. */
  pitch: string;
  tags: string[];
  /** Accent colour for the title card and switcher. */
  accent: string;
}

export interface GameModule {
  id: GameId;
  /** Build the game into ctx.root and start it (from the save if there is one). */
  start(ctx: GameContext): Promise<GameHandle>;
}

/**
 * Corner the shell keeps for itself: the switcher button sits in the top-left,
 * so games keep this square (CSS px, plus the safe-area inset) clear.
 */
export const SHELL_CORNER = 60;
