// Start-up: load or make a farm, put the director behind the title card, and
// let the player pick one of the three games. The farm is the same whichever
// game is picked; a new farm is a separate choice.

import { PRESET_IDS, PRESETS, type PresetId } from '../sim/presets';
import { createWorld } from '../sim/world';
import type { WorldState } from '../sim/types';
import { el, esc } from '../ui/dom';
import { Director } from './director';
import { clearFarm, loadFarm, saveFarm } from './save';
import { APP_VERSION, registerServiceWorker, watchForUpdates } from './update';

declare global {
  interface Window {
    acres?: { director: Director; state: () => WorldState; play: (p: PresetId, fresh?: boolean) => void; version: string };
  }
}

const TAGS: Record<PresetId, string[]> = {
  sunup: ['3D', 'walk', 'real-time day', 'water daily', 'shop'],
  patchwork: ['2D', 'point', '12 moves a day', 'companions', 'almanac'],
  bushel: ['3D', 'point', 'speed up time', 'farmhands', 'orders'],
};

function newSeed(): number {
  return (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;
}

export function startApp(): void {
  const root = document.getElementById('app')!;
  const params = new URLSearchParams(location.search);
  if (params.has('fresh')) clearFarm();
  const saved = loadFarm();
  const first = (params.get('preset') as PresetId | null) ?? null;
  let state = saved ?? createWorld(newSeed(), PRESETS[first && PRESETS[first] ? first : 'sunup'].rules);

  const director = new Director(state, root, {
    autoplay: params.has('autoplay'),
    onNewFarm: () => {
      clearFarm();
      showTitle(true);
    },
  });
  void director.start();

  const title = el('div', 'title');
  root.append(title);

  const play = (p: PresetId, fresh: boolean) => {
    if (fresh) {
      state = createWorld(newSeed(), PRESETS[p].rules);
      director.replace(state);
    } else {
      director.setRules({ ...PRESETS[p].rules });
    }
    title.classList.add('out');
    director.title = false;
    director.audio.ui('preset');
    director.hud.intro(p);
    saveFarm(director.state);
  };

  function showTitle(fresh: boolean) {
    const has = !fresh && !!loadFarm();
    director.title = true;
    title.classList.remove('out');
    title.innerHTML = '';
    const inner = el('div', 'inner');
    inner.append(el('h1', '', 'Three Acres'), el('div', 'sub', 'Three farming games on one farm. Switch the view, the clock, the soil, the goals or the crew at any moment, and keep farming.'));
    const games = el('div', 'games');
    for (const id of PRESET_IDS) {
      const p = PRESETS[id];
      const b = el('button', 'card game', `<b>${esc(p.name)}</b><span class="line">${esc(p.line)}</span><p>${esc(p.pitch)}</p><span class="tags">${TAGS[id].map((t) => `<span>${t}</span>`).join('')}</span>`);
      b.onclick = () => play(id, !has);
      games.append(b);
    }
    inner.append(games);
    const row = el('div', 'row');
    if (has) {
      const cont = el('button', 'btn primary', `Carry on, day ${director.state.day}`);
      cont.onclick = () => {
        title.classList.add('out');
        director.title = false;
        director.audio.ui('preset');
      };
      const fresh2 = el('button', 'btn', 'Start a new farm');
      fresh2.onclick = () => {
        if (confirm('Start over on a new farm? This one is lost.')) {
          clearFarm();
          showTitle(true);
        }
      };
      row.append(cont, fresh2);
    }
    inner.append(row, el('div', 'foot', has ? 'Picking a game keeps your farm and changes how it plays.' : 'Pick one to start. The mix button changes everything later.'));
    title.append(inner);
  }

  if (first && PRESETS[first]) {
    play(first, !saved || params.has('fresh'));
  } else showTitle(false);

  registerServiceWorker();
  watchForUpdates(() => {
    const u = el('div', 'card update', '<span>A new version is ready.</span>');
    const b = el('button', 'btn primary', 'Reload');
    b.onclick = () => {
      saveFarm(director.state);
      location.reload();
    };
    u.append(b);
    root.append(u);
  });

  window.acres = { director, state: () => director.state, play: (p, fresh = false) => play(p, fresh), version: APP_VERSION };
}
