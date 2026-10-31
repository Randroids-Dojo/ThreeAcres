// Light and weather laid over the finished page. The hour sets a colour
// temperature, daylight sets how deep the indigo night wash goes, and the
// weather tints and darkens it. All laid on as one multiply wash. Rain, snow,
// leaves and petals are procedural from the clock: no particles to keep.

import type { Season, Weather } from '../sim/types';
import { hex, mix, type RGB } from './color';
import { hashf } from './rng';

const HOUR_KEYS: [number, RGB][] = [
  [6, hex('#ffc49c')],
  [7.5, hex('#ffe4c4')],
  [9, hex('#fff7ea')],
  [15, hex('#fffaf0')],
  [17.5, hex('#ffe9c2')],
  [19, hex('#ffd2a2')],
  [20.3, hex('#eeb3a0')],
  [21.4, hex('#aa9ccc')],
  [23, hex('#8e9ad0')],
  [24, hex('#8e9ad0')],
];

const NIGHT = hex('#46528e');

const WEATHER_TINT: Record<Weather | 'snow', RGB> = {
  sun: [255, 255, 255],
  cloud: [232, 233, 236],
  rain: [205, 212, 222],
  storm: [170, 178, 198],
  heat: [255, 238, 214],
  snow: [236, 242, 252],
};

const tmp: RGB = [0, 0, 0];

/** The multiply colour for the light of the moment. */
export function lightColor(hour: number, daylight: number, weather: Weather, snow: boolean, out: RGB = tmp): RGB {
  let a = HOUR_KEYS[0];
  let b = HOUR_KEYS[HOUR_KEYS.length - 1];
  for (let i = 0; i < HOUR_KEYS.length - 1; i++) {
    if (hour >= HOUR_KEYS[i][0] && hour <= HOUR_KEYS[i + 1][0]) {
      a = HOUR_KEYS[i];
      b = HOUR_KEYS[i + 1];
      break;
    }
  }
  const k = b[0] === a[0] ? 0 : (hour - a[0]) / (b[0] - a[0]);
  const hue = mix(a[1], b[1], Math.max(0, Math.min(1, k)));
  // Night deepens below daylight 0.55; dawn light is kinder than the same light at dusk.
  const n = Math.pow(Math.max(0, Math.min(1, (0.55 - daylight) / 0.35)), 1.25) * 0.84 * (hour < 8 ? 0.6 : 1);
  const c = mix(hue, NIGHT, n);
  const w = WEATHER_TINT[snow ? 'snow' : weather];
  // Bad weather matters less in the dark.
  const wk = 1 - n * 0.6;
  out[0] = c[0] * (1 - wk + (wk * w[0]) / 255);
  out[1] = c[1] * (1 - wk + (wk * w[1]) / 255);
  out[2] = c[2] * (1 - wk + (wk * w[2]) / 255);
  return out;
}

/** Light colours as cached CSS strings: the light changes slowly, strings are made rarely. */
const cssCache = new Map<number, string>();
export function lightCss(c: RGB): string {
  const r = Math.round(c[0] / 2) * 2;
  const g = Math.round(c[1] / 2) * 2;
  const b = Math.round(c[2] / 2) * 2;
  const k = (r << 16) | (g << 8) | b;
  let s = cssCache.get(k);
  if (!s) {
    s = `rgb(${r},${g},${b})`;
    if (cssCache.size > 4000) cssCache.clear();
    cssCache.set(k, s);
  }
  return s;
}

/** How much the windows glow: 0 by day, 1 at night. */
export function glowOf(daylight: number, weather: Weather): number {
  const dim = weather === 'storm' ? 0.2 : weather === 'rain' ? 0.12 : 0;
  return Math.max(0, Math.min(1, (0.78 - daylight) / 0.5 + dim));
}

/** A soft round glow sprite, warm. */
export function makeGlow(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,140,0.95)');
  grad.addColorStop(0.25, 'rgba(255,190,110,0.55)');
  grad.addColorStop(0.6, 'rgba(240,150,80,0.18)');
  grad.addColorStop(1, 'rgba(240,150,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

/** A soft, irregular cloud shadow: lobes blurred into one shape. */
export function makeCloud(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.filter = 'blur(16px)';
  g.fillStyle = 'rgb(84,96,120)';
  g.beginPath();
  for (let i = 0; i < 9; i++) {
    const x = 70 + hashf(i, 1, 5) * 116;
    const y = 60 + hashf(i, 2, 5) * 40;
    const r = 22 + hashf(i, 3, 5) * 22;
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, Math.PI * 2);
  }
  g.fill();
  return c;
}

export interface SkyView {
  /** Device px size of the canvas. */
  w: number;
  h: number;
  t: number;
  dpr: number;
  weather: Weather;
  season: Season;
  snow: boolean;
  reduced: boolean;
  /** Camera offset in device px, so falling things drift with the page a little. */
  ox: number;
  oy: number;
}

/** Rain, snow, leaves, petals and heat shimmer, in device px. */
export function drawWeather(ctx: CanvasRenderingContext2D, v: SkyView): void {
  const { w, h, t, dpr } = v;
  const par = 0.25;
  const pox = v.ox * par;
  const poy = v.oy * par;
  if (v.snow) {
    const n = v.weather === 'storm' ? 260 : 170;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = 22 + hashf(i, 7) * 26;
      const r = (1.1 + hashf(i, 8) * 2.2) * dpr;
      const x = (((hashf(i, 1) * w + Math.sin(t * 0.8 + i) * 12 * dpr + t * (v.weather === 'storm' ? 60 : 14) * dpr + pox) % w) + w) % w;
      const y = (((hashf(i, 2) * h + t * sp * dpr + poy) % h) + h) % h;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,130,160,0.35)';
    ctx.lineWidth = 0.6 * dpr;
    ctx.stroke();
    return;
  }
  if (v.weather === 'rain' || v.weather === 'storm') {
    const storm = v.weather === 'storm';
    const n = v.reduced ? 90 : storm ? 300 : 190;
    const slant = storm ? 0.45 : 0.2;
    const len = (storm ? 30 : 22) * dpr;
    const sp = (storm ? 900 : 620) * dpr;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const y = (((hashf(i, 2) * (h + len) + t * sp * (0.8 + hashf(i, 3) * 0.4) + poy) % (h + len)) + h + len) % (h + len) - len;
      const x = (((hashf(i, 1) * (w + 200 * dpr) + y * slant + pox) % (w + 200 * dpr)) + w) % (w + 200 * dpr) - 100 * dpr;
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * slant, y - len);
    }
    // Ink streaks with a pale edge, so they read on dark soil and light paper alike.
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(235,242,250,0.35)';
    ctx.lineWidth = 2.6 * dpr;
    ctx.stroke();
    ctx.strokeStyle = storm ? 'rgba(40,52,84,0.62)' : 'rgba(52,72,110,0.55)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();
    return;
  }
  if (v.weather === 'heat') {
    // Shimmer: faint wavering bands rising.
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const by = (((hashf(i, 4) * h - t * 18 * dpr) % h) + h) % h;
      ctx.moveTo(0, by);
      for (let x = 0; x <= w; x += 24 * dpr) ctx.lineTo(x, by + Math.sin(x / (40 * dpr) + t * 3 + i) * 3 * dpr);
    }
    ctx.strokeStyle = 'rgba(255,250,235,0.16)';
    ctx.lineWidth = 3 * dpr;
    ctx.stroke();
  }
  if (v.season === 2 || v.season === 0) {
    // Falling leaves in autumn, petals in spring.
    const autumn = v.season === 2;
    const n = v.reduced ? 6 : autumn ? 16 : 12;
    for (let g = 0; g < 2; g++) {
      ctx.beginPath();
      for (let i = g; i < n; i += 2) {
        const sp = 18 + hashf(i, 5) * 20;
        const y = (((hashf(i, 2) * h + t * sp * dpr + poy) % h) + h) % h;
        const x = (((hashf(i, 1) * w + t * 22 * dpr + Math.sin(t * 1.3 + i * 2) * 24 * dpr + pox) % w) + w) % w;
        const rot = t * (1 + hashf(i, 6)) + i;
        const s = (autumn ? 4.2 : 2.6) * dpr;
        ctx.moveTo(x + s, y);
        ctx.ellipse(x, y, s, s * 0.45 * (0.4 + 0.6 * Math.abs(Math.cos(rot))), rot, 0, Math.PI * 2);
      }
      ctx.fillStyle = autumn ? (g ? '#d47a32' : '#e8b448') : g ? '#f6d7df' : '#fff8f4';
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,41,26,0.5)';
      ctx.lineWidth = 0.6 * dpr;
      ctx.stroke();
    }
  }
}
