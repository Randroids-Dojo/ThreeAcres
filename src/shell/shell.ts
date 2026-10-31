// The shell: one screen that is both the title and the game switcher, shared
// settings, device tracking, audio unlock and update checks. Games started in
// this session stay alive while paused, so switching back is instant.

import { createAudio } from '../audio';
import type { AudioEngine, AudioMood } from '../contract';
import { PRESETS } from '../sim/presets';
import { el, esc, toggle } from '../ui/dom';
import { icon } from '../ui/icons';
import { APP_VERSION, registerServiceWorker, watchForUpdates } from '../game/update';
import { GAMES, info, loadGame } from './games';
import type { Device, GameContext, GameHandle, GameId, ShellSettings } from './types';

const SETTINGS_KEY = 'threeacres:v2:settings';
const LAST_KEY = 'threeacres:v2:last';
const saveKey = (id: GameId) => `threeacres:v2:${id}`;

interface Slot {
  summary: string;
  at: number;
  data: unknown;
}

interface Running {
  id: GameId;
  root: HTMLElement;
  handle: GameHandle;
}

declare global {
  interface Window {
    shell?: Shell;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Storage full or blocked: carry on unsaved.
  }
}

export class Shell {
  readonly audio: AudioEngine;
  private app: HTMLElement;
  private games = new Map<GameId, Running>();
  private current: GameId | null = null;
  private overlay = el('div', 'shellover');
  private cornerBtn = el('button', 'shellbtn');
  private open = true;
  private settings: ShellSettings;
  private device: Device = 'mouse';
  private known = false;
  private loading: GameId | null = null;
  private raf = 0;

  constructor(app: HTMLElement) {
    this.app = app;
    this.settings = { master: 0.8, music: 0.6, sfx: 0.8, quality: 'auto', reducedMotion: false, ...(readJson<Partial<ShellSettings>>(SETTINGS_KEY) ?? {}) };
    this.audio = createAudio();
    this.applyVolumes();

    this.cornerBtn.innerHTML = `<span class="ic">${icon('games')}</span>`;
    this.cornerBtn.title = 'Games (`)';
    this.cornerBtn.setAttribute('aria-label', 'Switch game');
    this.cornerBtn.onclick = () => this.show();
    app.append(this.cornerBtn, this.overlay);

    // Device tracking for every game: touch, mouse, keyboard or pad.
    window.addEventListener('pointerdown', (e) => this.saw(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse'), { capture: true, passive: true });
    window.addEventListener('keydown', (e) => {
      this.saw('key');
      if (e.code === 'Backquote' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        if (this.open && this.current) this.hide();
        else this.show();
      }
    }, { capture: true });
    window.addEventListener('gamepadconnected', () => this.saw('pad'));
    const unlock = () => this.audio.unlock();
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      const hidden = document.visibilityState !== 'visible';
      this.audio.suspend(hidden);
      if (hidden) for (const g of this.games.values()) g.handle.save();
    });
    window.addEventListener('pagehide', () => {
      for (const g of this.games.values()) g.handle.save();
    });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    this.syncDevice();
  }

  private saw(d: Device): void {
    if (this.device === d && this.known) return;
    this.device = d;
    this.known = true;
    this.syncDevice();
  }

  private syncDevice(): void {
    const d = this.known ? this.device : matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    if (this.app.dataset.device !== d) this.app.dataset.device = d;
  }

  private applyVolumes(): void {
    this.audio.setVolumes({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx });
  }

  quality(): 'low' | 'high' {
    if (this.settings.quality !== 'auto') return this.settings.quality;
    const phone = /Android|iPhone|iPad/i.test(navigator.userAgent) || Math.min(window.innerWidth, window.innerHeight) < 600;
    return phone ? 'low' : 'high';
  }

  private context(id: GameId, root: HTMLElement): GameContext {
    return {
      root,
      audio: this.audio,
      settings: () => this.settings,
      quality: () => this.quality(),
      device: () => (this.known ? this.device : matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse'),
      deviceKnown: () => this.known,
      openSwitcher: () => this.show(),
      load: <T>() => (readJson<Slot>(saveKey(id))?.data as T) ?? null,
      save: (data, summary) => writeJson(saveKey(id), { summary, at: Date.now(), data } satisfies Slot),
      clearSave: () => {
        try {
          localStorage.removeItem(saveKey(id));
        } catch {
          // Nothing to clear.
        }
      },
    };
  }

  /** Start or return to a game. */
  async play(id: GameId): Promise<void> {
    if (this.loading) return;
    if (this.current && this.current !== id) {
      const cur = this.games.get(this.current)!;
      cur.handle.save();
      cur.handle.pause();
      toggle(cur.root, 'off', true);
    }
    let g = this.games.get(id);
    if (!g) {
      this.loading = id;
      this.render();
      try {
        const root = el('div', 'gameroot');
        root.dataset.game = id;
        this.app.insertBefore(root, this.cornerBtn);
        const mod = await loadGame(id);
        const handle = await mod.start(this.context(id, root));
        g = { id, root, handle };
        this.games.set(id, g);
      } finally {
        this.loading = null;
      }
    } else {
      toggle(g.root, 'off', false);
      g.handle.resume();
    }
    this.current = id;
    writeJson(LAST_KEY, id);
    this.app.dataset.game = id;
    this.hide();
  }

  /** Bring up the title and switcher. The current game pauses underneath. */
  show(): void {
    if (this.current) {
      const cur = this.games.get(this.current);
      cur?.handle.save();
      cur?.handle.pause();
    }
    this.open = true;
    this.render();
    toggle(this.overlay, 'on', true);
    toggle(this.cornerBtn, 'hidden', true);
    this.audio.ui('open');
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.titleMood);
  }

  hide(): void {
    if (!this.current) return;
    this.open = false;
    cancelAnimationFrame(this.raf);
    toggle(this.overlay, 'on', false);
    toggle(this.cornerBtn, 'hidden', false);
    const cur = this.games.get(this.current);
    if (cur) {
      toggle(cur.root, 'off', false);
      cur.handle.resume();
    }
  }

  // Title music while the switcher is up.
  private titleMood = () => {
    if (!this.open) return;
    const mood: AudioMood = {
      game: 'title',
      intensity: 0,
      rules: PRESETS.sunup.rules,
      hour: 9,
      season: 0,
      weather: 'sun',
      scene: 'title',
      night: 0,
      speed: 1,
      tired: false,
    };
    this.audio.mood(mood);
    this.raf = requestAnimationFrame(this.titleMood);
  };

  private render(): void {
    const o = this.overlay;
    o.innerHTML = '';
    const inner = el('div', 'inner');
    const head = el('div', 'head');
    head.append(el('h1', '', 'Three Acres'));
    if (this.current) {
      const back = el('button', 'btn iconbtn close', `<span class="ic">${icon('close')}</span>`);
      back.title = 'Back to the game (`)';
      back.onclick = () => this.hide();
      head.append(back);
    }
    inner.append(head);
    const cards = el('div', 'games');
    for (const g of GAMES) {
      const slot = readJson<Slot>(saveKey(g.id));
      const running = this.games.has(g.id);
      const here = this.current === g.id;
      const status = this.loading === g.id ? 'Loading' : here ? 'Playing now' : running ? `Paused. ${slot?.summary ?? ''}` : slot ? `Saved: ${slot.summary}` : 'New';
      const b = el('button', `game ${here ? 'here' : ''}`, `<span class="shot" style="background-image:url(/covers/${g.id}.jpg)"></span><span class="cap"><b>${esc(g.name)}</b><span class="line">${esc(g.line)}</span><span class="pitch">${esc(g.pitch)}</span><span class="state">${esc(status)}</span></span>`);
      b.style.setProperty('--accent', g.accent);
      b.dataset.game = g.id;
      b.onclick = () => {
        this.audio.ui('preset');
        if (here) this.hide();
        else void this.play(g.id);
      };
      cards.append(b);
    }
    inner.append(cards);

    const row = el('div', 'row');
    if (this.current) {
      const fresh = el('button', 'btn', `Start ${esc(info(this.current).name)} over`);
      fresh.onclick = () => this.restart();
      row.append(fresh);
    }
    const gear = el('button', 'btn', `<span class="ic">${icon('gear')}</span>Settings`);
    gear.onclick = () => {
      settings.classList.toggle('on');
      this.audio.ui('tap');
    };
    row.append(gear);
    inner.append(row);

    const settings = el('div', 'card settings');
    const slider = (label: string, key: 'master' | 'music' | 'sfx') => {
      const r = el('label', 'slider', `<span>${label}</span>`);
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(this.settings[key]);
      input.oninput = () => {
        this.settings[key] = Number(input.value);
        this.applyVolumes();
        writeJson(SETTINGS_KEY, this.settings);
      };
      r.append(input);
      return r;
    };
    const q = el('div', 'tabs');
    for (const v of ['auto', 'low', 'high'] as const) {
      const b = el('button', this.settings.quality === v ? 'on' : '', v === 'auto' ? 'Auto' : v === 'low' ? 'Light' : 'Full');
      b.onclick = () => {
        this.settings.quality = v;
        writeJson(SETTINGS_KEY, this.settings);
        for (const c of q.children) toggle(c, 'on', c === b);
      };
      q.append(b);
    }
    const motion = el('label', 'check');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = this.settings.reducedMotion;
    box.onchange = () => {
      this.settings.reducedMotion = box.checked;
      writeJson(SETTINGS_KEY, this.settings);
    };
    motion.append(box, document.createTextNode('Reduce motion'));
    settings.append(slider('Volume', 'master'), slider('Music', 'music'), slider('Sounds', 'sfx'), el('div', 'legend', 'Graphics'), q, motion, el('div', 'legend', `Version ${esc(APP_VERSION.slice(0, 7))}`));
    inner.append(settings, el('div', 'foot', 'Each game keeps its own save. The corner button brings you back here.'));
    o.append(inner);
  }

  private restart(): void {
    const id = this.current;
    if (!id) return;
    if (!confirm(`Start ${info(id).name} over? Its save is lost.`)) return;
    this.context(id, this.games.get(id)!.root).clearSave();
    this.games.get(id)!.handle.reset();
    this.hide();
  }

  /** The game played last, for "carry on". */
  last(): GameId | null {
    return readJson<GameId>(LAST_KEY);
  }
}

export function startShell(): void {
  const app = document.getElementById('app')!;
  const shell = new Shell(app);
  window.shell = shell;
  const params = new URLSearchParams(location.search);
  const want = params.get('game') as GameId | null;
  if (params.has('fresh') && want) {
    try {
      localStorage.removeItem(saveKey(want));
    } catch {
      // Nothing to clear.
    }
  }
  if (want && GAMES.some((g) => g.id === want)) void shell.play(want);
  else shell.show();

  registerServiceWorker();
  watchForUpdates(() => {
    const u = el('div', 'card update', '<span>A new version is ready.</span>');
    const b = el('button', 'btn primary', 'Reload');
    b.onclick = () => {
      window.dispatchEvent(new Event('pagehide'));
      location.reload();
    };
    u.append(b);
    app.append(u);
  });
}
