// Audio workbench at /?dev=audio. A game selector, a control for every mood
// field, a button for every simulation event, interface cue and named cue, a
// toggle for every loop, volume sliders, a meter and offline renders.
// window.audioDev drives the same engine from Playwright.

import type { AudioMood, CueOpts, UiCue } from '../contract';
import { AXIS_INFO, PRESETS } from '../sim/presets';
import type { BuildKind, Rules, Season, SimEvent, TileKind, Weather, WorldState } from '../sim/types';
import { createWorld } from '../sim/world';
import type { Core } from './core';
import { DECK_CUES, LOOPS, RANCH_CUES } from './cues';
import { createAudio, getBank } from './index';
import { character, longestQuiet, maxStep, onsetAfter, onsetRate, peakDb, pitchNear, render, rmsDb, sidesDb, wavBase64, windows } from './offline';
import type { Scenario } from './offline';

export const UI_CUES: UiCue[] = ['tap', 'open', 'close', 'toggle', 'preset', 'buy', 'deny', 'tool', 'page', 'star', 'order'];

export interface EventOpts {
  /** Actor id: 1 the farmer, 2 a hand on the left, 3 a hand on the right. */
  by: number;
  quality: number;
  ground: TileKind;
  amount: number;
  done: boolean;
  kind: BuildKind;
  season: Season;
  weather: Weather;
}

const DEFAULTS: EventOpts = { by: 1, quality: 1, ground: 'grass', amount: 60, done: true, kind: 'scarecrow', season: 0, weather: 'sun' };

/** One sample of every event type. A new event type will not compile until it is listed here. */
export function sampleEvents(o: Partial<EventOpts> = {}): Record<SimEvent['type'], SimEvent> {
  const p = { ...DEFAULTS, ...o };
  const at = p.by === 2 ? { x: 4, y: 7 } : p.by === 3 ? { x: 16, y: 7 } : { x: 10, y: 8 };
  const { x, y } = at;
  const rules = PRESETS.patchwork.rules;
  return {
    till: { type: 'till', x, y, by: p.by },
    water: { type: 'water', x, y, by: p.by },
    plant: { type: 'plant', x, y, crop: 'carrot', by: p.by },
    grow: { type: 'grow', x, y, crop: 'carrot', stage: 2 },
    harvest: { type: 'harvest', x, y, crop: 'carrot', quality: p.quality, by: p.by },
    tend: { type: 'tend', x, y, by: p.by },
    clear: { type: 'clear', x, y, by: p.by },
    build: { type: 'build', x, y, kind: p.kind, by: p.by },
    unbuild: { type: 'unbuild', x, y, kind: p.kind },
    wither: { type: 'wither', x, y, crop: 'lettuce' },
    bugs: { type: 'bugs', x, y },
    sprinkle: { type: 'sprinkle', x, y },
    crowIn: { type: 'crowIn', id: 900, x, y },
    crowEat: { type: 'crowEat', id: 900, x, y },
    crowScared: { type: 'crowScared', id: 900, x, y },
    step: { type: 'step', by: p.by, x, y, ground: p.ground },
    deny: { type: 'deny', x, y, reason: 'Nothing to do here' },
    coins: { type: 'coins', amount: p.amount, x, y },
    sell: { type: 'sell', crop: 'carrot', n: 4, value: 220 },
    buy: { type: 'buy', item: 'seeds', cost: 30 },
    order: { type: 'order', id: 7, done: p.done },
    goal: { type: 'goal', id: 'harvest' },
    milestone: { type: 'milestone', id: 'first-field' },
    night: { type: 'night' },
    dawn: { type: 'dawn', day: 2, weather: p.weather, season: p.season },
    season: { type: 'season', season: p.season, round: 1 },
    thunder: { type: 'thunder' },
    rules: { type: 'rules', rules, changed: ['clock'] },
    tired: { type: 'tired' },
    hire: { type: 'hire', id: 3 },
    refill: { type: 'refill', x, y, by: p.by },
    upgrade: { type: 'upgrade', tool: 'can', level: 2 },
    request: { type: 'request', id: 4, who: 'Mabel', done: p.done, reward: 120 },
  };
}

/** A farm with the farmer in the middle and a hand at each side, so panning can be heard. */
export function devState(rules: Rules = PRESETS.sunup.rules): WorldState {
  const s = createWorld(11, rules);
  const f = s.actors[0];
  f.x = 10.5;
  f.y = 8.5;
  s.actors.push({ ...f, id: 2, role: 'hand', name: 'Ada', x: 4.5, y: 7.5, tint: 0, path: [] });
  s.actors.push({ ...f, id: 3, role: 'hand', name: 'Bram', x: 16.5, y: 7.5, tint: 1, path: [] });
  return s;
}

export function defaultMood(): AudioMood {
  return { game: 'homestead', intensity: 0, rules: { ...PRESETS.sunup.rules }, hour: 9, season: 0, weather: 'sun', scene: 'farm', night: 0, speed: 1, tired: false };
}

const CSS = `
.aw { position: absolute; inset: 0; overflow: auto; background: #1d2a1b; color: #f3ead6; font: 14px/1.4 'Bricolage Grotesque Variable', system-ui, sans-serif; user-select: text; -webkit-user-select: text; touch-action: auto; }
.aw h1 { font: 600 22px 'Fraunces Variable', Georgia, serif; margin: 0 0 4px; }
.aw h2 { font: 600 15px 'Fraunces Variable', Georgia, serif; margin: 0 0 8px; color: #e9c46a; }
.aw .wrap { max-width: 1100px; margin: 0 auto; padding: 16px; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.aw .card { background: #26361f; border: 1px solid #3c5232; border-radius: 10px; padding: 12px; }
.aw .wide { grid-column: 1 / -1; }
.aw .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0; }
.aw label { display: flex; gap: 6px; align-items: center; }
.aw button { font: inherit; background: #f3ead6; color: #2b2418; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer; min-height: 32px; }
.aw button:hover, .aw button:focus-visible { background: #e9c46a; outline: none; }
.aw button.on { background: #e9c46a; }
.aw select, .aw input[type=range] { font: inherit; }
.aw select { background: #f3ead6; color: #2b2418; border-radius: 6px; border: 0; padding: 4px; }
.aw .meter { height: 14px; background: #142012; border-radius: 4px; overflow: hidden; position: relative; }
.aw .meter i { position: absolute; left: 0; top: 0; bottom: 0; background: #8cc152; }
.aw .meter b { position: absolute; top: 0; bottom: 0; width: 2px; background: #f3ead6; }
.aw pre { margin: 0; font: 12px/1.35 ui-monospace, monospace; white-space: pre-wrap; color: #cfe3c0; max-height: 260px; overflow: auto; }
/* Not .hint: Sunup's HUD styles that class globally (absolute, transparent). */
.aw .aw-note { color: #b5c4a6; font-size: 13px; }
`;

export function runAudioDev(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'aw';
  app.appendChild(root);
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  root.appendChild(wrap);

  let core: Core | null = null;
  const bank = getBank();
  const engine = createAudio({ meter: true, onCore: (c) => (core = c) });
  const mood = defaultMood();
  let state = devState(mood.rules);
  const opts: EventOpts = { ...DEFAULTS };
  const cueOpts: Required<CueOpts> = { pan: 0, gain: 1, pitch: 1 };
  const volumes = { master: 1, music: 1, sfx: 1 };
  let suspended = false;

  // The same unlock wiring as the game: any tap release, click or key.
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, () => engine.unlock(), { capture: true });

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', parent?: HTMLElement): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    parent?.appendChild(e);
    return e;
  };
  const card = (title: string, wide = false): HTMLElement => {
    const c = el('div', '', wrap);
    c.className = wide ? 'card wide' : 'card';
    el('h2', title, c);
    return c;
  };
  const row = (parent: HTMLElement): HTMLElement => {
    const r = el('div', '', parent);
    r.className = 'row';
    return r;
  };
  const button = (parent: HTMLElement, text: string, fn: () => void): HTMLButtonElement => {
    const b = el('button', text, parent);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const select = <T extends string | number>(parent: HTMLElement, label: string, values: T[], get: () => T, set: (v: T) => void, names?: string[]): HTMLSelectElement => {
    const l = el('label', label, parent);
    const s = el('select', '', l);
    values.forEach((v, i) => {
      const o = el('option', names?.[i] ?? String(v), s);
      o.value = String(v);
    });
    s.value = String(get());
    s.addEventListener('change', () => {
      const v = values.find((x) => String(x) === s.value);
      if (v !== undefined) set(v);
    });
    return s;
  };
  const slider = (parent: HTMLElement, label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt = (v: number) => v.toFixed(2)): void => {
    const l = el('label', label, parent);
    const s = el('input', '', l);
    s.type = 'range';
    s.min = String(min);
    s.max = String(max);
    s.step = String(step);
    s.value = String(get());
    const out = el('span', fmt(get()), l);
    s.addEventListener('input', () => {
      set(Number(s.value));
      out.textContent = fmt(Number(s.value));
    });
  };

  // ---------------------------------------------------------------- header
  const head = card('Three Acres audio workbench', true);
  const status = el('div', 'Tap anywhere to start the sound.', head);
  status.className = 'aw-note';
  const meterBox = el('div', '', head);
  meterBox.className = 'meter';
  const meterFill = el('i', '', meterBox);
  const meterPeak = el('b', '', meterBox);
  const meterText = el('div', '', head);
  meterText.className = 'aw-note';

  // ---------------------------------------------------------------- mood
  const mc = card('Mood');
  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const GAMES: AudioMood['game'][] = ['title', 'homestead', 'ranch', 'deck'];
  let r = row(mc);
  const gameSel = select(r, 'Game', GAMES, () => mood.game, (v) => (mood.game = v), ['Title', 'Sunup', 'Thistledown', 'Seedbound']);
  const setGame = (g: AudioMood['game']) => {
    mood.game = g;
    gameSel.value = g;
  };
  r = row(mc);
  slider(r, 'Intensity', 0, 1, 0.05, () => mood.intensity, (v) => (mood.intensity = v));
  r = row(mc);
  select(r, 'Scene', ['title', 'farm', 'menu'] as AudioMood['scene'][], () => mood.scene, (v) => (mood.scene = v));
  select(r, 'Season', [0, 1, 2, 3] as Season[], () => mood.season, (v) => (mood.season = v), SEASONS);
  select(r, 'Sky', ['sun', 'cloud', 'rain', 'storm', 'heat'] as Weather[], () => mood.weather, (v) => (mood.weather = v));
  r = row(mc);
  slider(r, 'Hour', 6, 24, 0.25, () => mood.hour, (v) => (mood.hour = v), (v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`);
  r = row(mc);
  slider(r, 'Night', 0, 1, 0.05, () => mood.night, (v) => (mood.night = v));
  const tl = el('label', 'Tired', r);
  const tired = el('input', '', tl);
  tired.type = 'checkbox';
  tired.addEventListener('change', () => (mood.tired = tired.checked));
  const ax = card('Other rules');
  el('div', 'Camera changes how effects are panned: close follows the farmer, wide pans across the farm.', ax).className = 'aw-note';
  r = row(ax);
  const AXES: Record<keyof Rules, string[]> = {
    clock: ['day', 'turns', 'flow'], view: ['2d', '3d'], camera: ['close', 'wide'], control: ['walk', 'point'], growth: ['classic', 'synergy'],
    goal: ['market', 'almanac', 'orders'], weather: ['calm', 'wild'], crew: ['solo', 'crew'], tools: ['kit', 'smart'],
  };
  for (const k of Object.keys(AXES) as (keyof typeof AXES)[]) {
    select(r, AXIS_INFO[k].name, AXES[k], () => mood.rules[k], (v) => {
      mood.rules = { ...mood.rules, [k]: v } as Rules;
      state.rules = { ...mood.rules };
    });
  }
  r = row(ax);
  for (const id of ['sunup', 'patchwork', 'bushel'] as const) {
    button(r, PRESETS[id].name, () => {
      mood.rules = { ...PRESETS[id].rules };
      state = devState(mood.rules);
      engine.event({ type: 'rules', rules: mood.rules, changed: ['clock'] }, state);
    });
  }

  // ---------------------------------------------------------------- volumes
  const vc = card('Volume');
  for (const k of ['master', 'music', 'sfx'] as const) {
    slider(row(vc), k[0].toUpperCase() + k.slice(1), 0, 1, 0.01, () => volumes[k], (v) => {
      volumes[k] = v;
      engine.setVolumes(volumes);
    });
  }
  r = row(vc);
  const sus = button(r, 'Suspend', () => {
    suspended = !suspended;
    engine.suspend(suspended);
    sus.classList.toggle('on', suspended);
    sus.textContent = suspended ? 'Resume' : 'Suspend';
  });

  // ---------------------------------------------------------------- events
  const ec = card('Simulation events', true);
  r = row(ec);
  select(r, 'Who', [1, 2, 3], () => opts.by, (v) => (opts.by = v), ['Farmer', 'Hand, left', 'Hand, right']);
  select(r, 'Quality', [0, 1, 2, 3], () => opts.quality, (v) => (opts.quality = v), ['Plain', 'Silver', 'Gold', 'Star']);
  select(r, 'Ground', ['grass', 'field', 'path', 'yard', 'wood', 'water'] as TileKind[], () => opts.ground, (v) => (opts.ground = v));
  select(r, 'Coins', [5, 60, 250, 900], () => opts.amount, (v) => (opts.amount = v));
  select(r, 'Order', ['done', 'expired'], () => (opts.done ? 'done' : 'expired'), (v) => (opts.done = v === 'done'));
  select(r, 'Build', ['scarecrow', 'sprinkler'] as BuildKind[], () => opts.kind, (v) => (opts.kind = v));
  select(r, 'Season', [0, 1, 2, 3] as Season[], () => opts.season, (v) => (opts.season = v), SEASONS);
  r = row(ec);
  for (const type of Object.keys(sampleEvents()) as SimEvent['type'][]) {
    button(r, type, () => engine.event(sampleEvents(opts)[type], state));
  }
  el('div', 'Bursts, the way the farm produces them.', ec).className = 'aw-note';
  r = row(ec);
  const dawnBurst = () => {
    engine.event(sampleEvents(opts).dawn, state);
    for (let k = 0; k < 60; k++) engine.event({ type: 'grow', x: 2 + (k % 14), y: 5 + (k % 8), crop: 'carrot', stage: 2 }, state);
    for (let k = 0; k < 30; k++) engine.event({ type: 'sprinkle', x: 2 + (k % 14), y: 5 + (k % 8) }, state);
  };
  button(r, 'Dawn: 60 grow, 30 sprinkle', dawnBurst);
  button(r, 'Walk 3 s', () => {
    for (let k = 0; k < 23; k++) later(k * 130, () => engine.event({ type: 'step', by: 1, x: 10, y: 8, ground: opts.ground }, state));
  });
  button(r, 'Hands at 4x for 5 s', () => {
    for (let k = 0; k < 250; k++) {
      later(k * 20, () => {
        const by = 2 + (k % 2);
        const x = by === 2 ? 4 : 16;
        const ev: SimEvent[] = [
          { type: 'harvest', x, y: 7, crop: 'radish', quality: k % 4, by },
          { type: 'water', x, y: 7, by },
          { type: 'step', by, x, y: 7, ground: 'path' },
        ];
        engine.event(ev[k % 3], state);
      });
    }
  });
  button(r, 'Storm worst case', () => {
    mood.weather = 'storm';
    engine.event({ type: 'thunder' }, state);
    dawnBurst();
    for (let k = 0; k < 60; k++) later(k * 30, () => engine.event({ type: 'harvest', x: 10, y: 8, crop: 'carrot', quality: k % 4, by: 1 + (k % 3) }, state));
  });

  // ---------------------------------------------------------------- cues
  const uc = card('Interface cues');
  r = row(uc);
  for (const c of UI_CUES) button(r, c, () => engine.ui(c));

  // ---------------------------------------------------------------- named cues
  const later = (ms: number, fn: () => void) => window.setTimeout(fn, ms);
  const oc = card('Cue options', true);
  el('div', 'Pan, gain and pitch for the cue buttons below. Thistledown cues and loops switch the game to Thistledown; Seedbound cues to Seedbound.', oc).className = 'aw-note';
  r = row(oc);
  slider(r, 'Pan', -1, 1, 0.05, () => cueOpts.pan, (v) => (cueOpts.pan = v));
  slider(r, 'Gain', 0, 1, 0.05, () => cueOpts.gain, (v) => (cueOpts.gain = v));
  slider(r, 'Pitch', 0.5, 2, 0.01, () => cueOpts.pitch, (v) => (cueOpts.pitch = v));
  const dc = card('Seedbound cues', true);
  r = row(dc);
  for (const c of DECK_CUES) {
    button(r, c.slice(5), () => {
      setGame('deck');
      engine.cue(c, { ...cueOpts });
    });
  }
  el('div', 'Scoring, the way a cascade produces it.', dc).className = 'aw-note';
  r = row(dc);
  const cascade = () => {
    setGame('deck');
    mood.intensity = 0.2;
    for (let h = 0; h < 8; h++) {
      const t0 = h * 420;
      later(t0, () => {
        engine.cue('deck.harvest', { pitch: Math.pow(2, h / 12) });
        mood.intensity = Math.min(1, 0.2 + h * 0.1);
      });
      for (let c = 0; c < 10; c++) later(t0 + 60 + c * 25, () => engine.cue('deck.chip', { pitch: 1 + c * 0.06 }));
      later(t0 + 330, () => engine.cue('deck.mult', { pitch: 1 + h * 0.12 }));
    }
    later(8 * 420, () => engine.cue('deck.big'));
    later(8 * 420 + 800, () => (mood.intensity = 0));
  };
  button(r, 'Cascade: 8 harvests, 40 chips a second', cascade);
  button(r, 'Draw 5', () => {
    setGame('deck');
    for (let k = 0; k < 5; k++) engine.cue('deck.draw');
  });
  button(r, 'Chips flood: 100 a second for 2 s', () => {
    setGame('deck');
    for (let k = 0; k < 200; k++) later(k * 10, () => engine.cue('deck.chip'));
  });

  const rch = card('Thistledown cues', true);
  r = row(rch);
  for (const c of RANCH_CUES) {
    button(r, c.slice(6), () => {
      setGame('ranch');
      engine.cue(c, { ...cueOpts });
    });
  }
  el('div', 'Loops: start and stop with these.', rch).className = 'aw-note';
  r = row(rch);
  const loopOn = new Map<string, boolean>();
  for (const l of LOOPS) {
    const b = button(r, l.slice(6), () => {
      const on = !loopOn.get(l);
      loopOn.set(l, on);
      b.classList.toggle('on', on);
      if (on) setGame('ranch');
      engine.loop(l, on, { ...cueOpts });
    });
  }
  el('div', 'Play, the way the ranch produces it.', rch).className = 'aw-note';
  r = row(rch);
  button(r, 'Walk 3 s on grass', () => {
    setGame('ranch');
    for (let k = 0; k < 7 * 3; k++) later(k * 143, () => engine.cue('ranch.step', { pitch: 0.95 + Math.random() * 0.1 }));
  });
  button(r, 'Draw 3 s, 30 sucks a second', () => {
    setGame('ranch');
    engine.loop('ranch.draw', true);
    for (let k = 0; k < 90; k++) later(100 + k * 33, () => engine.cue('ranch.suck', { pitch: k % 5 === 0 ? 0.7 : 1.2 + Math.random() * 0.3, pan: Math.random() * 0.4 - 0.2 }));
    later(3200, () => engine.loop('ranch.draw', false));
  });
  button(r, 'Nettleback near', () => {
    setGame('ranch');
    mood.intensity = 0.8;
    engine.cue('ranch.nettle', { pan: -0.5 });
    later(6000, () => (mood.intensity = 0));
  });

  // ---------------------------------------------------------------- render
  const rc = card('Render');
  el('div', 'Renders 12 seconds of the current mood offline and offers it as a WAV.', rc).className = 'aw-note';
  r = row(rc);
  const renderOut = el('div', '', rc);
  button(r, 'Render', () => {
    renderOut.textContent = 'Rendering...';
    void render({ dur: 12, mood: { ...mood, rules: { ...mood.rules } }, volumes }, bank, state).then((res) => {
      const blob = new Blob([Uint8Array.from(atob(wavBase64(res.buffer)), (c) => c.charCodeAt(0))], { type: 'audio/wav' });
      renderOut.innerHTML = '';
      const a = el('a', 'Download WAV', renderOut);
      a.href = URL.createObjectURL(blob);
      a.download = `acres-${mood.game}-${SEASONS[mood.season].toLowerCase()}.wav`;
      a.style.color = '#e9c46a';
      el('div', `Peak ${peakDb(res.buffer).toFixed(1)} dBFS, RMS ${rmsDb(res.buffer, 2).toFixed(1)} dBFS, ${Math.round(res.ms)} ms to render.`, renderOut);
    });
  });

  // ---------------------------------------------------------------- stats
  const sc = card('Engine', true);
  const pre = el('pre', '', sc);

  // ---------------------------------------------------------------- loop
  let lastStats = 0;
  let peakHold = 0;
  const td = new Float32Array(2048);
  const frame = (now: number) => {
    engine.mood(mood);
    const c = core;
    if (c?.analyser) {
      c.analyser.getFloatTimeDomainData(td);
      let p = 0;
      let s = 0;
      for (const v of td) {
        p = Math.max(p, Math.abs(v));
        s += v * v;
      }
      const rms = Math.sqrt(s / td.length);
      peakHold = Math.max(p, peakHold * 0.97);
      const pos = (x: number) => `${Math.max(0, Math.min(100, ((20 * Math.log10(x + 1e-9) + 60) / 60) * 100))}%`;
      meterFill.style.width = pos(rms);
      meterPeak.style.left = pos(peakHold);
      meterText.textContent = `RMS ${(20 * Math.log10(rms + 1e-9)).toFixed(1)} dBFS, peak ${(20 * Math.log10(peakHold + 1e-9)).toFixed(1)} dBFS`;
    }
    if (now - lastStats > 250) {
      lastStats = now;
      status.textContent = c
        ? `Context ${c.ctx.state}, ${c.ctx.sampleRate} Hz, ${Math.round(((c.ctx as AudioContext).baseLatency ?? 0) * 1000)} ms base latency. Bank ${bank.done} of ${bank.total} built (${bank.where}), ${(bank.bytes() / 1048576).toFixed(1)} MB.`
        : `Tap anywhere to start the sound. Bank ${bank.done} of ${bank.total} built (${bank.where}).`;
      pre.textContent = c ? JSON.stringify(c.stats(), null, 1) : '';
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const w = window as unknown as { audioDev: unknown };
  w.audioDev = {
    engine,
    core: () => core,
    bank,
    mood,
    get state() {
      return state;
    },
    devState,
    defaultMood,
    sampleEvents,
    cues: UI_CUES,
    deckCues: DECK_CUES,
    ranchCues: RANCH_CUES,
    loops: LOOPS,
    render: (sc: Scenario) => render(sc, bank, devState(sc.mood.rules)),
    analyse: { peakDb, rmsDb, onsetAfter, onsetRate, longestQuiet, character, pitchNear, wavBase64, windows, maxStep, sidesDb },
  };
}
