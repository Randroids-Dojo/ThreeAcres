// Season palettes for the almanac page. The paper, the ink and every wash
// shift with the season; the light of the hour and the weather is laid over
// the finished page as one multiply wash (see light.ts).

import type { Season } from '../sim/types';

export interface Palette {
  season: Season;
  paper: string;
  paperDeep: string;
  ink: string;
  inkSoft: string;
  grass: string;
  grassDeep: string;
  grassLight: string;
  tuft: string;
  flower: string[];
  yard: string;
  yardDeep: string;
  path: string;
  pathDeep: string;
  pebble: string;
  water: string;
  waterDeep: string;
  waterLight: string;
  woodFloor: string;
  meadow: string;
  meadowDeep: string;
  tall: string;
  tallDeep: string;
  tallLight: string;
  soilDry: string;
  soilDamp: string;
  soilMoist: string;
  soilWet: string;
  soilRidge: string;
  soilShadow: string;
  sheen: string;
  /** Tree crowns, light to dark, and a blossom or fruit colour. */
  crown: string[];
  crownDeep: string;
  blossom: string[];
  conifer: string;
  coniferDeep: string;
  trunk: string;
  fence: string;
  fenceDeep: string;
  frost: number;
  /** Bare deciduous trees. */
  bare: boolean;
}

const SPRING: Palette = {
  season: 0,
  paper: '#f2e8cf',
  paperDeep: '#e3d3ae',
  ink: '#3a2d20',
  inkSoft: '#6b5a44',
  grass: '#a6c77a',
  grassDeep: '#7ea85a',
  grassLight: '#c4da94',
  tuft: '#5d8a40',
  flower: ['#f5f0e6', '#f2c94c', '#e9a3b5', '#b9a6e0'],
  yard: '#dcc79e',
  yardDeep: '#c4a777',
  path: '#e6d8b6',
  pathDeep: '#c9b48c',
  pebble: '#a8977a',
  water: '#8dbdc4',
  waterDeep: '#5d93a6',
  waterLight: '#d6ece8',
  woodFloor: '#7ea463',
  meadow: '#c2cf8a',
  meadowDeep: '#93a95e',
  tall: '#c9cb84',
  tallDeep: '#98a05a',
  tallLight: '#e0dc9c',
  soilDry: '#ddb780',
  soilDamp: '#c39a68',
  soilMoist: '#a57a52',
  soilWet: '#83603f',
  soilRidge: '#efd3a2',
  soilShadow: '#a77b4c',
  sheen: '#dfeaf0',
  crown: ['#a9cf72', '#79ad57', '#4f8a45'],
  crownDeep: '#36633a',
  blossom: ['#fbf3f0', '#f3c3cf', '#f7dce2'],
  conifer: '#4d7d55',
  coniferDeep: '#2f553f',
  trunk: '#7a5a3e',
  fence: '#b89a72',
  fenceDeep: '#7c6145',
  frost: 0,
  bare: false,
};

const SUMMER: Palette = {
  ...SPRING,
  season: 1,
  paper: '#f3e4c1',
  paperDeep: '#e2cc9c',
  ink: '#3a2a1b',
  grass: '#93bb5f',
  grassDeep: '#689a45',
  grassLight: '#b7d07a',
  tuft: '#4c7a33',
  flower: ['#f7d046', '#f5f0e6', '#e86a4a', '#9c84d8'],
  meadow: '#bcc673',
  meadowDeep: '#8f9d4b',
  tall: '#d6c878',
  tallDeep: '#a99b4e',
  tallLight: '#eadb95',
  crown: ['#8fc062', '#5e9a48', '#3d7a3c'],
  crownDeep: '#2a5631',
  blossom: ['#e8c74a', '#d9503f', '#e8c74a'],
  water: '#80b8c2',
};

const AUTUMN: Palette = {
  ...SPRING,
  season: 2,
  paper: '#efdcb6',
  paperDeep: '#dcc293',
  ink: '#46291a',
  inkSoft: '#77583f',
  grass: '#b6b46c',
  grassDeep: '#8f9452',
  grassLight: '#cfc88a',
  tuft: '#7a7a3e',
  flower: ['#e8a83a', '#c9562e', '#f0d9a0', '#a85a8a'],
  yard: '#d8bf93',
  meadow: '#c7bd76',
  meadowDeep: '#a08f4c',
  tall: '#d9bb72',
  tallDeep: '#b08c48',
  tallLight: '#ead39a',
  crown: ['#e8b448', '#d47a32', '#b14a2a'],
  crownDeep: '#7d3420',
  blossom: ['#c94a2a', '#e8b448', '#8a3a22'],
  conifer: '#4a7552',
  coniferDeep: '#2d4c39',
  water: '#86b0b5',
};

const WINTER: Palette = {
  ...SPRING,
  season: 3,
  paper: '#ece9e0',
  paperDeep: '#d8d4c8',
  ink: '#2f3445',
  inkSoft: '#5f6577',
  grass: '#cfd4c2',
  grassDeep: '#a9b39d',
  grassLight: '#e8ebe2',
  tuft: '#8a957e',
  flower: ['#ffffff', '#e8eef5', '#c9d6e3', '#ffffff'],
  yard: '#d6cdbb',
  yardDeep: '#b9ab92',
  path: '#e2ddd0',
  pathDeep: '#bdb4a2',
  pebble: '#9a948a',
  water: '#b4cbd2',
  waterDeep: '#86a6b3',
  waterLight: '#f1f6f7',
  woodFloor: '#b4bca8',
  meadow: '#d2d3bd',
  meadowDeep: '#a8aa8e',
  tall: '#d6cfaa',
  tallDeep: '#aaa07a',
  tallLight: '#ece6c8',
  soilDry: '#cdb89a',
  soilDamp: '#b49c7c',
  soilMoist: '#9a8063',
  soilWet: '#7d654d',
  soilRidge: '#e9e2d4',
  soilShadow: '#9e8a6e',
  sheen: '#eef4f8',
  crown: ['#c9cfc4', '#a9b0a6', '#8b928a'],
  crownDeep: '#5f665f',
  blossom: ['#ffffff', '#eef3f7', '#ffffff'],
  conifer: '#56766a',
  coniferDeep: '#344f47',
  trunk: '#6e5a4a',
  fence: '#a8957c',
  fenceDeep: '#6f5f4c',
  frost: 1,
  bare: true,
};

export const PALETTES: readonly Palette[] = [SPRING, SUMMER, AUTUMN, WINTER];

/** Shirt colours for hands by tint index. The farmer wears blue overalls and a straw hat. */
export const SHIRTS = ['#c8553d', '#3f7f6e', '#d9a441', '#7a5aa6', '#4f7fbf', '#b85c8a'];
export const BANDANAS = ['#e8d5a8', '#c84a3a', '#2f4f7a', '#e8d5a8', '#9a3a3a', '#3a6a4a'];

/** Job flag colours per verb. */
export const VERB_COLOR: Record<string, string> = {
  till: '#9a6a3a',
  water: '#3f7fbf',
  plant: '#5f9a3a',
  harvest: '#e0782e',
  tend: '#8a5aa6',
  clear: '#7a7a6a',
  build: '#c9a050',
  scare: '#2f2f3a',
};
