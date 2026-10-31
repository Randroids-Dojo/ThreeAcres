// The three games. Each is a full set of rules; the mixer can change any one
// axis on its own, and a mix that matches no preset is a custom game.

import type { Axis, Rules } from './types';

export type PresetId = 'sunup' | 'patchwork' | 'bushel';

export interface Preset {
  id: PresetId;
  name: string;
  /** One line under the name. */
  line: string;
  /** Two or three short sentences for the picker. */
  pitch: string;
  rules: Rules;
}

export const PRESETS: Record<PresetId, Preset> = {
  sunup: {
    id: 'sunup',
    name: 'Sunup',
    line: 'A day on the homestead',
    pitch: 'Walk your own rows from dawn to dusk. Water, harvest, ship, sleep. Mind the crows and the weather.',
    rules: { view: '3d', camera: 'close', control: 'walk', clock: 'day', growth: 'classic', goal: 'market', weather: 'wild', crew: 'solo', tools: 'kit' },
  },
  patchwork: {
    id: 'patchwork',
    name: 'Patchwork',
    line: 'The almanac puzzle',
    pitch: 'Twelve moves a day. Plant companions side by side, keep the soil rich, and meet the season’s goals.',
    rules: { view: '2d', camera: 'wide', control: 'point', clock: 'turns', growth: 'synergy', goal: 'almanac', weather: 'wild', crew: 'solo', tools: 'smart' },
  },
  bushel: {
    id: 'bushel',
    name: 'Bushel & Co.',
    line: 'The farm that runs itself',
    pitch: 'Hire hands, lay out fields and fill town orders against the clock. Speed time up and watch it hum.',
    rules: { view: '3d', camera: 'wide', control: 'point', clock: 'flow', growth: 'classic', goal: 'orders', weather: 'calm', crew: 'crew', tools: 'smart' },
  },
};

export const PRESET_IDS: PresetId[] = ['sunup', 'patchwork', 'bushel'];

export const AXES: Axis[] = ['view', 'camera', 'control', 'clock', 'growth', 'goal', 'weather', 'crew', 'tools'];

/** Labels for the mixer. */
export const AXIS_INFO: Record<Axis, { name: string; options: { value: string; label: string; hint: string }[] }> = {
  view: {
    name: 'View',
    options: [
      { value: '2d', label: '2D', hint: 'A painted almanac page' },
      { value: '3d', label: '3D', hint: 'A lit toy diorama' },
    ],
  },
  camera: {
    name: 'Camera',
    options: [
      { value: 'close', label: 'Close', hint: 'Follows the farmer' },
      { value: 'wide', label: 'Wide', hint: 'The whole farm, pan and zoom' },
    ],
  },
  control: {
    name: 'Control',
    options: [
      { value: 'walk', label: 'Walk', hint: 'Move the farmer and use what faces you' },
      { value: 'point', label: 'Point', hint: 'Tap or drag tiles, the farmer goes' },
    ],
  },
  clock: {
    name: 'Clock',
    options: [
      { value: 'day', label: 'Day', hint: 'Real-time day, stamina, sleep to end it' },
      { value: 'turns', label: 'Turns', hint: 'Twelve moves a day, time waits for you' },
      { value: 'flow', label: 'Flow', hint: 'A minute a day, speed it up' },
    ],
  },
  growth: {
    name: 'Soil',
    options: [
      { value: 'classic', label: 'Classic', hint: 'Water every day, it grows' },
      { value: 'synergy', label: 'Synergy', hint: 'Moisture, nutrients, companions, quality' },
    ],
  },
  goal: {
    name: 'Goal',
    options: [
      { value: 'market', label: 'Market', hint: 'Free play, a shop and milestones' },
      { value: 'almanac', label: 'Almanac', hint: 'Seasonal goals, stars and new seeds' },
      { value: 'orders', label: 'Orders', hint: 'Town orders on deadlines, prices move' },
    ],
  },
  weather: {
    name: 'Weather',
    options: [
      { value: 'calm', label: 'Calm', hint: 'Sun and the odd shower' },
      { value: 'wild', label: 'Wild', hint: 'Forecasts, storms, heat, crows and bugs' },
    ],
  },
  crew: {
    name: 'Crew',
    options: [
      { value: 'solo', label: 'Solo', hint: 'Just you' },
      { value: 'crew', label: 'Crew', hint: 'Farmhands water, harvest and replant' },
    ],
  },
  tools: {
    name: 'Tools',
    options: [
      { value: 'kit', label: 'Kit', hint: 'Hoe, can, seeds, hands: pick one' },
      { value: 'smart', label: 'Smart', hint: 'One action that does the obvious thing' },
    ],
  },
};

export function matchPreset(r: Rules): PresetId | null {
  for (const id of PRESET_IDS) {
    const p = PRESETS[id].rules;
    if (AXES.every((a) => p[a] === r[a])) return id;
  }
  return null;
}
