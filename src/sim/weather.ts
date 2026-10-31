// Tomorrow's weather. Wild weather draws from the season; calm weather keeps
// to sun, cloud and the odd shower.

import { weighted } from './rng';
import { season } from './world';
import type { Weather, WorldState } from './types';

const WILD: Record<number, Partial<Record<Weather, number>>> = {
  0: { sun: 4, cloud: 3, rain: 3, storm: 1 },
  1: { sun: 5, cloud: 2, rain: 1, storm: 1, heat: 3 },
  2: { sun: 3, cloud: 4, rain: 3, storm: 2 },
  3: { sun: 3, cloud: 5, rain: 2, storm: 1 },
};

const CALM: Partial<Record<Weather, number>> = { sun: 6, cloud: 3, rain: 2 };

export function rollWeather(s: WorldState, day: number): Weather {
  return weighted(s, s.rules.weather === 'wild' ? WILD[season(day)] : CALM);
}

/** Calm skies have no storms or heat waves. */
export function calmed(w: Weather): Weather {
  return w === 'storm' ? 'rain' : w === 'heat' ? 'sun' : w;
}

export const WEATHER_NAMES: Record<Weather, string> = { sun: 'Sunny', cloud: 'Cloudy', rain: 'Rain', storm: 'Storm', heat: 'Heat wave' };
