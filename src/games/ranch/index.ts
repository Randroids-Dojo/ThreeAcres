// Thistledown: a first-person creature ranch. Catch downies with the bellows,
// pen and feed them, sell the down they shed and open up the valley.
import type { GameModule } from '../../shell/types';
import { Ranch } from './game';

declare global {
  interface Window {
    ranch?: Ranch;
  }
}

export const game: GameModule = {
  id: 'ranch',
  async start(ctx) {
    const r = new Ranch(ctx);
    window.ranch = r;
    r.start();
    return {
      pause: () => r.pause(),
      resume: () => r.resume(),
      save: () => r.save(),
      reset: () => r.reset(),
    };
  },
};
