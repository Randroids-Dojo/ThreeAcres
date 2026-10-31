// The paper: a tileable grain with soft mottling, a few fibres and the odd
// foxing spot, tinted to the season's paper. Generated once per season.

import { hex } from './color';
import { hashf, valueNoise } from './rng';

const SIZE = 256;

export function makePaper(paperHex: string, deepHex: string, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(SIZE, SIZE);
  const p = hex(paperHex);
  const d = hex(deepHex);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const lo = valueNoise(x / 64, y / 64, 4, seed) * 0.6 + valueNoise(x / 21.333, y / 21.333, 12, seed + 1) * 0.4;
      const fine = hashf(x, y, seed + 2);
      // Mottle towards the deeper tone, plus a fine tooth.
      const k = Math.max(0, Math.min(1, (lo - 0.35) * 0.55 + (fine - 0.5) * 0.12));
      const i = (y * SIZE + x) * 4;
      img.data[i] = p[0] + (d[0] - p[0]) * k;
      img.data[i + 1] = p[1] + (d[1] - p[1]) * k;
      img.data[i + 2] = p[2] + (d[2] - p[2]) * k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Fibres, wrapped at the edges so the tile repeats cleanly.
  g.lineWidth = 0.6;
  for (let i = 0; i < 46; i++) {
    const x = hashf(i, 1, seed) * SIZE;
    const y = hashf(i, 2, seed) * SIZE;
    const a = hashf(i, 3, seed) * Math.PI * 2;
    const l = 6 + hashf(i, 4, seed) * 14;
    g.strokeStyle = i % 3 ? 'rgba(120,96,60,0.10)' : 'rgba(255,255,255,0.25)';
    for (const ox of [-SIZE, 0, SIZE]) {
      for (const oy of [-SIZE, 0, SIZE]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + 2, y + oy + Math.sin(a) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        g.stroke();
      }
    }
  }
  // Foxing: a couple of faint rust spots.
  for (let i = 0; i < 3; i++) {
    const x = hashf(i, 5, seed) * SIZE;
    const y = hashf(i, 6, seed) * SIZE;
    const r = 2 + hashf(i, 7, seed) * 4;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(150,100,50,0.16)');
    grad.addColorStop(1, 'rgba(150,100,50,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

/**
 * A neutral print grain, near white, laid over the whole finished page with
 * multiply so the gouache sits in the paper's tooth like the washes do.
 */
export function makeGrain(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const lo = valueNoise(x / 32, y / 32, 8, seed);
      const fine = hashf(x, y, seed + 3);
      const v = 255 - fine * fine * 26 - lo * 10;
      const i = (y * SIZE + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v - 1;
      img.data[i + 2] = v - 4;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
