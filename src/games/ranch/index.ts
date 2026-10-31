// Thistledown. Placeholder until the game lands.
import type { GameModule } from '../../shell/types';

export const game: GameModule = {
  id: 'ranch',
  async start(ctx) {
    ctx.root.innerHTML = '<div class="soon"><b>Thistledown</b><span>Being built.</span></div>';
    return { pause() {}, resume() {}, save() {}, reset() {} };
  },
};
