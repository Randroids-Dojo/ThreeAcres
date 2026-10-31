// Colour for the diorama: a palette per season for the living things, and
// the light, sky and mist for any hour and weather.

import { Color, Vector3 } from 'three';
import type { Season, Weather } from '../sim/types';
import { clamp, col, lerp, mixInto, smooth } from './util';

export interface SeasonPalette {
  grass: Color;
  grassDark: Color;
  grassTip: Color;
  meadow: Color;
  meadowTip: Color;
  longGrass: Color;
  longTip: Color;
  floor: Color;
  foliage: Color[];
  pine: Color;
  blossom: Color[] | null;
  flowers: Color[];
  /** Deciduous trees have no leaves. */
  bare: boolean;
  /** Frost on the ground and roofs, 0..1. */
  frost: number;
  /** Leaves or petals drifting down, or none. */
  drift: Color[] | null;
}

export const SEASONS: SeasonPalette[] = [
  {
    grass: col('#8bbb5f'),
    grassDark: col('#5f9a47'),
    grassTip: col('#c4e07c'),
    meadow: col('#9fbf5c'),
    meadowTip: col('#d2e08a'),
    longGrass: col('#86ad4c'),
    longTip: col('#c9d77a'),
    floor: col('#5e7f3c'),
    foliage: [col('#7dbb4a'), col('#97c957'), col('#5f9e40')],
    pine: col('#3f7a46'),
    blossom: [col('#f7c4d4'), col('#fff3f4'), col('#f0a3bd')],
    flowers: [col('#fff7e0'), col('#ffd84d'), col('#f2a7c3'), col('#b9a3f0')],
    bare: false,
    frost: 0,
    drift: [col('#f7c4d4'), col('#fff3f4')],
  },
  {
    grass: col('#79a84b'),
    grassDark: col('#4f8536'),
    grassTip: col('#b8d25a'),
    meadow: col('#93b552'),
    meadowTip: col('#d9cf6a'),
    longGrass: col('#9aa84a'),
    longTip: col('#e3c862'),
    floor: col('#4b6e33'),
    foliage: [col('#3f8a3a'), col('#529c3f'), col('#2f7535')],
    pine: col('#2f6a3d'),
    blossom: null,
    flowers: [col('#fff3c8'), col('#f6c63a'), col('#e86d4f')],
    bare: false,
    frost: 0,
    drift: null,
  },
  {
    grass: col('#a7a656'),
    grassDark: col('#82843f'),
    grassTip: col('#d7c46e'),
    meadow: col('#b5a457'),
    meadowTip: col('#e0b65e'),
    longGrass: col('#b39a55'),
    longTip: col('#e8c070'),
    floor: col('#7a6a3a'),
    foliage: [col('#d9822b'), col('#c4532d'), col('#e8b33a'), col('#a8432a')],
    pine: col('#36603f'),
    blossom: null,
    flowers: [col('#e8a33a'), col('#c4532d')],
    bare: false,
    frost: 0,
    drift: [col('#d9822b'), col('#c4532d'), col('#e8b33a')],
  },
  {
    grass: col('#a9b8a2'),
    grassDark: col('#8a9c88'),
    grassTip: col('#d9e2dc'),
    meadow: col('#b2b7a0'),
    meadowTip: col('#dcdccb'),
    longGrass: col('#b7ad8f'),
    longTip: col('#e1dccb'),
    floor: col('#8d9586'),
    foliage: [],
    pine: col('#36624a'),
    blossom: null,
    flowers: [],
    bare: true,
    frost: 0.55,
    drift: null,
  },
];

export interface Sky {
  /** Direction towards the key light. */
  keyDir: Vector3;
  keyColor: Color;
  keyI: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiI: number;
  /** Backdrop: top and bottom of the screen, display space 0..1. */
  bgTop: Vector3;
  bgBottom: Vector3;
  /** Lamps and windows, 0 off to 1 full glow. */
  glow: number;
  /** 0 sun, 1 moon. */
  moon: number;
}

type Key = [number, string];
const BG_TOP: Key[] = [
  [6, '#b8a6c8'],
  [8, '#c4d6e0'],
  [13, '#b7d3e0'],
  [17, '#cad0d4'],
  [19, '#b59ab4'],
  [20.5, '#6a5b8a'],
  [22, '#232a48'],
  [24, '#181d35'],
];
const BG_BOTTOM: Key[] = [
  [6, '#f0cbb2'],
  [8, '#eee4d2'],
  [13, '#eceedf'],
  [17, '#f1e0c2'],
  [19, '#eeb597'],
  [20.5, '#a07a8c'],
  [22, '#363e63'],
  [24, '#272d4e'],
];
const KEY: Key[] = [
  [6, '#ffbd86'],
  [8, '#ffe0bc'],
  [13, '#fff5e6'],
  [17, '#ffdcae'],
  [19, '#ff9a5a'],
  [20.6, '#ff7a4a'],
];

const keyCache = new Map<Key[], { h: number; c: Color }[]>();
function ramp(keys: Key[], h: number, out: Color): Color {
  let k = keyCache.get(keys);
  if (!k) {
    k = keys.map(([hh, hex]) => ({ h: hh, c: col(hex) }));
    keyCache.set(keys, k);
  }
  if (h <= k[0].h) return out.copy(k[0].c);
  for (let i = 1; i < k.length; i++) {
    if (h <= k[i].h) return mixInto(out, k[i - 1].c, k[i].c, smooth(k[i - 1].h, k[i].h, h));
  }
  return out.copy(k[k.length - 1].c);
}

const SUNRISE = 5.4;
const SUNSET = 20.7;
const MOON_DIR = new Vector3(-0.45, 0.78, 0.45).normalize();

const WEATHER_GREY: Record<Weather, Color> = {
  sun: col('#ffffff'),
  cloud: col('#c6cbcf'),
  rain: col('#9aa6ae'),
  storm: col('#5c6673'),
  heat: col('#f4d9a4'),
};
const WEATHER_MIX: Record<Weather, number> = { sun: 0, cloud: 0.35, rain: 0.6, storm: 0.8, heat: 0.4 };
const WEATHER_KEY: Record<Weather, number> = { sun: 1, cloud: 0.5, rain: 0.3, storm: 0.16, heat: 1.12 };

const _c = new Color();
const _d = new Color();
const SKY_DAY = col('#cfe1ff');
const SKY_DUSK = col('#c3a9d6');
const SKY_NIGHT = col('#2b3a72');
const GROUND_DAY = col('#a07c52');
const GROUND_NIGHT = col('#1d1d2c');
const MOONLIGHT = col('#8fa8ee');
const WINTER_TINT = col('#dfe7f2');
const HEAT_KEY = col('#ffd49a');

export function makeSky(): Sky {
  return {
    keyDir: new Vector3(0, 1, 0),
    keyColor: new Color(),
    keyI: 1,
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemiI: 1,
    bgTop: new Vector3(),
    bgBottom: new Vector3(),
    glow: 0,
    moon: 0,
  };
}

function toDisplay(c: Color, out: Vector3): void {
  _d.copy(c).convertLinearToSRGB();
  out.set(_d.r, _d.g, _d.b);
}

/** Fills sky for an hour (6..24), smoothed daylight (0..1), weather and season. */
export function computeSky(hour: number, daylight: number, weather: Weather, season: Season, out: Sky): void {
  const t = (hour - SUNRISE) / (SUNSET - SUNRISE);
  const sunUp = smooth(0, 0.06, t) * smooth(1, 0.94, t);
  const phi = clamp(t, 0, 1) * Math.PI;
  const el = Math.max(0.4, Math.sin(Math.PI * clamp(t, 0, 1)) * 1.08);
  let dx = Math.cos(phi);
  let dz = Math.sin(phi) * 0.75 + 0.25;
  const len = Math.hypot(dx, dz);
  dx /= len;
  dz /= len;
  const moon = smooth(SUNSET - 0.2, SUNSET + 0.8, hour);
  out.moon = moon;
  if (moon < 0.5) out.keyDir.set(Math.cos(el) * dx, Math.sin(el), Math.cos(el) * dz).normalize();
  else out.keyDir.copy(MOON_DIR);

  const wk = WEATHER_KEY[weather];
  ramp(KEY, hour, out.keyColor);
  if (weather === 'heat') mixInto(out.keyColor, out.keyColor, HEAT_KEY, 0.35);
  if (moon >= 0.5) out.keyColor.copy(MOONLIGHT);
  // The key light fades out at sunset, and the moon fades in once it has gone.
  const moonI = moon >= 0.5 ? smooth(0.5, 1, moon) * 0.8 * (weather === 'storm' || weather === 'rain' ? 0.5 : 1) : 0;
  out.keyI = moon >= 0.5 ? moonI : 2.9 * sunUp * wk * (0.72 + 0.28 * daylight);

  const dusk = smooth(17.5, 20, hour) * (1 - smooth(20.5, 22, hour));
  mixInto(out.hemiSky, SKY_DAY, SKY_DUSK, dusk);
  mixInto(out.hemiSky, out.hemiSky, SKY_NIGHT, smooth(0.75, 0.25, daylight));
  mixInto(out.hemiGround, GROUND_DAY, GROUND_NIGHT, smooth(0.8, 0.25, daylight));
  const wetDim = weather === 'storm' ? 0.6 : weather === 'rain' ? 0.74 : 1;
  // Dawn is golden, not gloomy: the fill rises fast from night to morning.
  out.hemiI = lerp(0.46, 1.5, smooth(0.1, 0.42, daylight)) * wetDim * (weather === 'cloud' ? 1.1 : 1);

  ramp(BG_TOP, hour, _c);
  mixInto(_c, _c, WEATHER_GREY[weather], WEATHER_MIX[weather] * clamp(daylight * 1.4, 0.2, 1));
  if (season === 3) mixInto(_c, _c, WINTER_TINT, 0.3 * daylight);
  toDisplay(_c, out.bgTop);
  ramp(BG_BOTTOM, hour, _c);
  mixInto(_c, _c, WEATHER_GREY[weather], WEATHER_MIX[weather] * clamp(daylight * 1.4, 0.2, 1));
  if (season === 3) mixInto(_c, _c, WINTER_TINT, 0.35 * daylight);
  toDisplay(_c, out.bgBottom);

  // Lamps burn from dusk, and go out soon after dawn.
  out.glow = hour < 12 ? 0.55 * smooth(6.5, 6.0, hour) : smooth(0.78, 0.38, daylight);
}
