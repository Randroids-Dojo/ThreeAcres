// The three games. Info is static so the title can show them without loading
// any game's code; each game's module loads only when it is first played.

import type { GameId, GameInfo, GameModule } from './types';

export const GAMES: readonly GameInfo[] = [
  {
    id: 'ranch',
    name: 'Thistledown',
    line: 'A ranch for drifting puffs',
    pitch: 'Roam the valley with your bellows, catch downies, pen them and feed them. Sell the fluff they shed and build the ranch out into the far meadows.',
    tags: ['first person', 'creatures', 'explore', 'build'],
    accent: '#5f9a6b',
  },
  {
    id: 'homestead',
    name: 'Sunup',
    line: 'A day on the homestead',
    pitch: 'Walk your own rows from dawn to dusk. Water, harvest, ship and sleep through the seasons, fill town requests and earn better tools.',
    tags: ['third person', 'real-time days', 'seasons', 'town requests'],
    accent: '#c9792f',
  },
  {
    id: 'deck',
    name: 'Seedbound',
    line: 'A deck of seeds against the seasons',
    pitch: 'Draw seed, tool and weather cards, plant a little plot and chain companions into big harvests. Beat each season’s quota or the run is over.',
    tags: ['cards', 'roguelike', 'short runs', 'combos'],
    accent: '#5b6fb5',
  },
];

export function loadGame(id: GameId): Promise<GameModule> {
  switch (id) {
    case 'ranch':
      return import('../games/ranch').then((m) => m.game);
    case 'homestead':
      return import('../games/homestead').then((m) => m.game);
    case 'deck':
      return import('../games/deck').then((m) => m.game);
  }
}

export function info(id: GameId): GameInfo {
  return GAMES.find((g) => g.id === id)!;
}
