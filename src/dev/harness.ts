// Renderer workbench: /?dev=2d, /?dev=3d or /?dev=both. Shows a fixture farm,
// animates the actors a little, and fires events from the keyboard so each
// renderer can be built and checked without the game around it.
//
// Keys: 1-9,0 fixtures. C camera close/wide. O soil overlay. Q quality pips.
// Space pause time. [ ] time of day. N night transition. A animate actors.
// At the highlighted tile: W water, T till, P plant, H harvest, G grow, B build,
// X wither, U bugs, S sprinkle, R crow lands, K crow scared, E crow eats, D deny,
// M coins, L thunder. V (both mode) swap views. Wheel zooms, drag pans (wide).

import type { CameraIntent, FrameView, Renderer } from '../contract';
import { CROP_IDS } from '../sim/crops';
import { daylightOf, hourOf, season } from '../sim/world';
import type { SimEvent, Verb, WorldState } from '../sim/types';
import { FIXTURES, fixture, type FixtureId } from './fixtures';

declare global {
  interface Window {
    harness?: {
      state: WorldState;
      setFixture(id: FixtureId): void;
      setCamera(c: Partial<CameraIntent>): void;
      setMinute(m: number): void;
      fire(e: SimEvent): void;
      setAnimate(on: boolean): void;
      show(kind: '2d' | '3d'): void;
      renderers: Renderer[];
      frames: number;
    };
  }
}

export async function runHarness(mode: '2d' | '3d' | 'both'): Promise<void> {
  const root = document.getElementById('app')!;
  root.innerHTML = '';
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;inset:0;background:#222;overflow:hidden';
  root.appendChild(stage);
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:10;font:12px/1.4 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
  root.appendChild(bar);

  const renderers: Renderer[] = [];
  if (mode === '2d' || mode === 'both') renderers.push((await import('../render2d')).createRenderer2D());
  if (mode === '3d' || mode === 'both') renderers.push(await (await import('../render3d')).createRenderer3D());
  for (const r of renderers) {
    r.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;transition:opacity .45s';
    stage.appendChild(r.canvas);
  }
  let shown = renderers.length - 1;
  const showOnly = (i: number) => {
    shown = i;
    renderers.forEach((r, k) => (r.canvas.style.opacity = k === i ? '1' : '0'));
  };

  let fixtureId: FixtureId = (new URLSearchParams(location.search).get('fixture') as FixtureId) || 'lush';
  let state = fixture(fixtureId);
  const camera: CameraIntent = { mode: 'wide', focusX: 0, focusY: 0, zoom: 1, panX: 0, panY: 0 };
  let paused = true;
  let animate = true;
  let overlay = false;
  let showQuality = true;
  let night = 0;
  let nightT = -1;
  let pointer = { x: -1, y: -1 };
  let t = 0;
  let last = performance.now();
  let frames = 0;
  const base = state.actors.map((a) => ({ x: a.x, y: a.y }));

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const r of renderers) r.resize(stage.clientWidth, stage.clientHeight, dpr);
  };
  window.addEventListener('resize', resize);
  resize();

  const view = (dt: number): FrameView => {
    const a = renderers[shown];
    const tile = pointer.x >= 0 ? a.pick(pointer.x, pointer.y) : null;
    const plot = tile ? state.plots[tile.y * state.W + tile.x] : null;
    const isField = tile ? state.tiles[tile.y * state.W + tile.x] === 'field' : false;
    const verb: Verb | null = !tile || !isField ? null : plot?.crop ? (plot.crop.stage === 4 ? 'harvest' : 'water') : plot?.tilled ? 'plant' : 'till';
    return {
      state,
      rules: state.rules,
      t,
      dt,
      camera: { ...camera, focusX: state.actors[0].x, focusY: state.actors[0].y },
      highlight: tile ? { x: tile.x, y: tile.y, verb, ok: verb !== null } : null,
      hour: hourOf(state.minute),
      daylight: daylightOf(state.minute),
      night,
      season: season(state.day),
      soilOverlay: overlay,
      showQuality,
      reducedMotion: false,
      quality: 'high',
    };
  };

  const fire = (e: SimEvent) => {
    for (const r of renderers) r.onEvent(e, state);
  };

  const hl = () => view(0).highlight ?? { x: 4, y: 6 };

  const setFixture = (id: FixtureId) => {
    fixtureId = id;
    state = fixture(id);
    base.length = 0;
    for (const a of state.actors) base.push({ x: a.x, y: a.y });
    for (const r of renderers) r.snap(view(0));
  };

  window.addEventListener('keydown', (ev) => {
    const k = ev.key.toLowerCase();
    const h = hl();
    const crop = state.plots[h.y * state.W + h.x]?.crop?.kind ?? 'radish';
    if (/^[0-9]$/.test(k)) {
      const i = k === '0' ? 9 : Number(k) - 1;
      if (FIXTURES[i]) setFixture(FIXTURES[i]);
      return;
    }
    switch (k) {
      case 'c':
        camera.mode = camera.mode === 'wide' ? 'close' : 'wide';
        break;
      case 'o':
        overlay = !overlay;
        break;
      case 'q':
        showQuality = !showQuality;
        break;
      case ' ':
        paused = !paused;
        break;
      case '[':
        state.minute = Math.max(0, state.minute - 60);
        break;
      case ']':
        state.minute = Math.min(1079, state.minute + 60);
        break;
      case 'n':
        nightT = 0;
        fire({ type: 'night' });
        break;
      case 'a':
        animate = !animate;
        break;
      case 'v':
        if (renderers.length > 1) {
          const next = (shown + 1) % renderers.length;
          renderers[next].snap(view(0));
          showOnly(next);
        }
        break;
      case 'w':
        fire({ type: 'water', x: h.x, y: h.y, by: 1 });
        break;
      case 't':
        fire({ type: 'till', x: h.x, y: h.y, by: 1 });
        break;
      case 'p':
        fire({ type: 'plant', x: h.x, y: h.y, crop: CROP_IDS[Math.floor(t) % 8], by: 1 });
        break;
      case 'h':
        fire({ type: 'harvest', x: h.x, y: h.y, crop, quality: Math.floor(t) % 4, by: 1 });
        break;
      case 'g':
        fire({ type: 'grow', x: h.x, y: h.y, crop, stage: 3 });
        break;
      case 'b':
        fire({ type: 'build', x: h.x, y: h.y, kind: 'sprinkler', by: 1 });
        break;
      case 'x':
        fire({ type: 'wither', x: h.x, y: h.y, crop });
        break;
      case 'u':
        fire({ type: 'bugs', x: h.x, y: h.y });
        break;
      case 's':
        fire({ type: 'sprinkle', x: h.x, y: h.y });
        break;
      case 'r':
        fire({ type: 'crowIn', id: 901, x: h.x, y: h.y });
        break;
      case 'k':
        fire({ type: 'crowScared', id: 900, x: h.x, y: h.y });
        break;
      case 'e':
        fire({ type: 'crowEat', id: 900, x: h.x, y: h.y });
        break;
      case 'd':
        fire({ type: 'deny', x: h.x, y: h.y, reason: 'Nothing to do here' });
        break;
      case 'm':
        fire({ type: 'coins', amount: 120, x: h.x, y: h.y });
        break;
      case 'l':
        fire({ type: 'thunder' });
        break;
    }
  });

  let drag: { x: number; y: number } | null = null;
  stage.addEventListener('pointermove', (e) => {
    pointer = { x: e.offsetX, y: e.offsetY };
    if (drag && camera.mode === 'wide') {
      const scale = 40 * camera.zoom;
      camera.panX -= (e.clientX - drag.x) / scale;
      camera.panY -= (e.clientY - drag.y) / scale;
      drag = { x: e.clientX, y: e.clientY };
    }
  });
  stage.addEventListener('pointerdown', (e) => (drag = { x: e.clientX, y: e.clientY }));
  window.addEventListener('pointerup', () => (drag = null));
  stage.addEventListener('wheel', (e) => {
    camera.zoom = Math.min(2.5, Math.max(0.6, camera.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    e.preventDefault();
  }, { passive: false });

  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    frames++;
    if (!paused) state.minute = (state.minute + dt * 20) % 1080;
    if (nightT >= 0) {
      nightT += dt / 2;
      night = Math.sin(Math.PI * Math.min(1, nightT));
      if (nightT >= 1) {
        nightT = -1;
        night = 0;
        fire({ type: 'dawn', day: state.day, weather: state.weather, season: season(state.day) });
      }
    }
    if (animate) {
      state.actors.forEach((a, i) => {
        if (a.away) return;
        const b = base[i];
        const phase = t * 0.6 + i * 1.7;
        const nx = b.x + Math.sin(phase) * 1.2;
        const ny = b.y + Math.sin(phase * 2) * 0.5;
        const dx = nx - a.x;
        const dy = ny - a.y;
        a.moving = Math.hypot(dx, dy) > 0.001;
        a.walked += Math.hypot(dx, dy);
        a.x = nx;
        a.y = ny;
        if (a.moving) {
          a.angle = Math.atan2(dy, dx);
          a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
        }
        if (a.task) a.task.t = (a.task.t + dt) % a.task.dur;
      });
      for (const c of state.crows) {
        if (c.phase === 'in') c.t = (c.t + dt) % 1.6;
        if (c.phase === 'peck') c.t += dt * 4;
      }
    }
    const v = view(dt);
    renderers.forEach((r, i) => {
      if (mode !== 'both' || i === shown || r.canvas.style.opacity !== '0') r.frame(v);
    });
    bar.textContent = `${mode}  fixture ${fixtureId}  ${Math.floor(v.hour)}:${String(Math.floor((state.minute % 60))).padStart(2, '0')}  cam ${camera.mode} x${camera.zoom.toFixed(2)}  overlay ${overlay ? 'on' : 'off'}\n1-0 fixtures  C cam  O overlay  Q pips  space time  [ ] hour  N night  A animate  V swap\nW T P H G B X U S R K E D M L events at the highlighted tile`;
    requestAnimationFrame(tick);
  };
  showOnly(renderers.length - 1);
  for (const r of renderers) r.snap(view(0));
  requestAnimationFrame(tick);

  window.harness = {
    get state() {
      return state;
    },
    setFixture,
    setCamera: (c) => Object.assign(camera, c),
    setMinute: (m) => (state.minute = m),
    fire,
    setAnimate: (on) => (animate = on),
    show: (kind) => {
      const i = renderers.findIndex((r) => r.kind === kind);
      if (i >= 0) {
        renderers[i].snap(view(0));
        showOnly(i);
      }
    },
    renderers,
    get frames() {
      return frames;
    },
  } as Window['harness'];
}
