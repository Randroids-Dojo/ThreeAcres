// The farm, settings and lab notes in localStorage. A save that fails to parse
// is ignored rather than crashing the title screen.

import { AXES } from '../sim/presets';
import type { Rules, WorldState } from '../sim/types';

const FARM = 'threeacres:v1:farm';
const SETTINGS = 'threeacres:v1:settings';
const NOTES = 'threeacres:v1:notes';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  quality: 'auto' | 'low' | 'high';
  reducedMotion: boolean;
  soilOverlay: boolean;
}

export const DEFAULT_SETTINGS: Settings = { master: 0.8, music: 0.6, sfx: 0.8, quality: 'auto', reducedMotion: false, soilOverlay: false };

export interface Note {
  at: number;
  day: number;
  rules: Rules;
  text: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game carries on unsaved.
  }
}

export function loadFarm(): WorldState | null {
  const s = read<WorldState>(FARM);
  if (!s || s.version !== 1 || !Array.isArray(s.plots) || !s.rules || !AXES.every((a) => a in s.rules)) return null;
  return s;
}

export function saveFarm(s: WorldState): void {
  write(FARM, s);
}

export function clearFarm(): void {
  try {
    localStorage.removeItem(FARM);
  } catch {
    // Nothing to clear.
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(SETTINGS) ?? {}) };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS, s);
}

export function loadNotes(): Note[] {
  return read<Note[]>(NOTES) ?? [];
}

export function saveNotes(n: Note[]): void {
  write(NOTES, n);
}
