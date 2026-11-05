// The things on the table, painted once: oak planks, seed scoops (what cards cost), the
// lantern (End day), the seed tin (draw pile) and the cribbage-style pegboard
// that tallies the quota. Each returns a data URL for an <img> or a CSS background.

import { fill, ink } from '../../../render2d/brush';
import { hashf, Rng, valueNoise } from '../../../render2d/rng';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

const memo = new Map<string, string>();
function once(key: string, make: () => string): string {
  let v = memo.get(key);
  if (!v) {
    v = make();
    memo.set(key, v);
  }
  return v;
}

/** Oak planks running across the table, tileable. */
export function woodUrl(): string {
  return once('wood', () => {
    const W = 512;
    const H = 384;
    const [c, g] = canvas(W, H);
    const img = g.createImageData(W, H);
    const plank = H / 3;
    for (let y = 0; y < H; y++) {
      const pi = Math.floor(y / plank);
      const py = (y % plank) / plank;
      for (let x = 0; x < W; x++) {
        // Long grain: stretched noise, warped a little.
        const warp = valueNoise(x / 96, y / 24, 16, 30 + pi) * 6;
        const grain = valueNoise(x / 160, (y + warp) / 2.6, 32, 7 + pi * 13);
        const fine = valueNoise(x / 40, y / 1.2, 128, 3 + pi);
        const ring = Math.sin((y + warp * 2 + valueNoise(x / 200, 0, 8, pi) * 30) * 0.55) * 0.5 + 0.5;
        let k = 0.55 + grain * 0.25 + ring * 0.12 + fine * 0.08 + (hashf(x, y, 9) - 0.5) * 0.04;
        // Plank tone varies, and the edges darken into the seams.
        k *= 0.9 + hashf(pi, 4, 4) * 0.18;
        const edge = Math.min(py, 1 - py);
        if (edge < 0.025) k *= 0.45 + edge * 18;
        const i = (y * W + x) * 4;
        img.data[i] = 70 + k * 110;
        img.data[i + 1] = 42 + k * 66;
        img.data[i + 2] = 22 + k * 34;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // Butt joints, offset per plank, with nail heads.
    for (let p = 0; p < 3; p++) {
      const x = (hashf(p, 1, 2) * W + p * 170) % W;
      g.fillStyle = 'rgba(30, 16, 6, 0.6)';
      g.fillRect(x, p * plank + 2, 1.5, plank - 4);
      for (const yy of [0.22, 0.78]) {
        g.beginPath();
        g.arc(x + 9, p * plank + plank * yy, 2.2, 0, Math.PI * 2);
        g.fillStyle = 'rgba(40, 30, 24, 0.75)';
        g.fill();
      }
    }
    return c.toDataURL('image/jpeg', 0.86);
  });
}

/**
 * A wooden seed scoop, full of seed or empty, drawn in a 120 by 90 box. The
 * table's scoops and the cost printed on every card are this same drawing, so
 * a card's scoops and the bench's scoops read as one thing.
 */
export function paintScoop(g: CanvasRenderingContext2D, full: boolean, lw = 1): void {
  const r = new Rng(full ? 5 : 6);
  g.save();
  g.translate(60, 52);
  // Handle.
  g.beginPath();
  g.moveTo(26, -6);
  g.lineTo(56, -14);
  g.lineTo(58, -6);
  g.lineTo(28, 4);
  g.closePath();
  fill(g, '#a8784a');
  ink(g, '#3a2614', 1.4 * lw, 0.9);
  // Bowl: a half-round seen from above at an angle.
  g.beginPath();
  g.ellipse(-4, 0, 40, 24, 0, 0, Math.PI * 2);
  fill(g, '#9a6a3e');
  ink(g, '#3a2614', 1.8 * lw, 0.95);
  g.beginPath();
  g.ellipse(-4, -2, 34, 19, 0, 0, Math.PI * 2);
  fill(g, full ? '#6a4a2a' : '#c49a68');
  if (full) {
    g.save();
    g.clip();
    for (let i = 0; i < 160; i++) {
      const a = r.next() * Math.PI * 2;
      const d = Math.sqrt(r.next());
      const x = -4 + Math.cos(a) * d * 34;
      const y = -2 + Math.sin(a) * d * 19 - (1 - d) * 6;
      g.beginPath();
      g.ellipse(x, y, 2.6, 1.8, r.next() * 3, 0, Math.PI * 2);
      g.fillStyle = ['#e8d8a8', '#d8b878', '#c9a060', '#f0e2b8'][i % 4];
      g.fill();
      g.strokeStyle = 'rgba(60, 40, 20, 0.5)';
      g.lineWidth = 0.6;
      g.stroke();
    }
    g.restore();
  } else {
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(90, 60, 30, 0.35)';
    g.lineWidth = 1;
    for (let k = -3; k < 4; k++) {
      g.beginPath();
      g.ellipse(-4, -2 + k * 4, 30, 6, 0, 0.2, Math.PI - 0.2);
      g.stroke();
    }
    g.restore();
  }
  g.beginPath();
  g.ellipse(-4, -2, 34, 19, 0, 0, Math.PI * 2);
  ink(g, '#3a2614', 1.2 * lw, 0.8);
  g.restore();
}

/** A seed scoop as an image, full or empty. 120 by 90. */
export function scoopUrl(full: boolean): string {
  return once(`scoop${full}`, () => {
    const [c, g] = canvas(120, 90);
    paintScoop(g, full);
    return c.toDataURL();
  });
}

/** The lantern, 140 by 200: brass frame, glass, a candle. The flame is a separate element. */
export function lanternUrl(): string {
  return once('lantern', () => {
    const [c, g] = canvas(140, 200);
    g.translate(70, 0);
    const brass = '#b8893a';
    const brassDark = '#7a5418';
    const inkc = '#2a1a0a';
    // Ring and cap.
    g.beginPath();
    g.ellipse(0, 14, 13, 11, 0, 0, Math.PI * 2);
    ink(g, inkc, 6, 1);
    ink(g, brass, 3.4, 1);
    g.beginPath();
    g.moveTo(-34, 50);
    g.quadraticCurveTo(0, 14, 34, 50);
    g.closePath();
    fill(g, brass);
    ink(g, inkc, 2, 1);
    g.beginPath();
    g.rect(-40, 48, 80, 10);
    fill(g, brassDark);
    ink(g, inkc, 2, 1);
    // Glass.
    g.beginPath();
    g.rect(-32, 58, 64, 92);
    fill(g, 'rgba(235, 225, 190, 0.35)');
    // Candle.
    g.beginPath();
    g.rect(-10, 104, 20, 46);
    fill(g, '#f2e8d0');
    ink(g, inkc, 1.4, 0.9);
    g.beginPath();
    g.ellipse(0, 104, 10, 3, 0, 0, Math.PI * 2);
    fill(g, '#fff8e6');
    ink(g, inkc, 1, 0.8);
    g.beginPath();
    g.moveTo(0, 104);
    g.lineTo(0, 97);
    ink(g, '#2a2420', 1.6, 1);
    // Wax drip.
    g.beginPath();
    g.moveTo(6, 104);
    g.quadraticCurveTo(9, 114, 6, 118);
    ink(g, '#f8f0dc', 3, 1);
    // Frame bars and glass sheen.
    for (const x of [-32, 32]) {
      g.beginPath();
      g.rect(x - 3, 58, 6, 92);
      fill(g, brass);
      ink(g, inkc, 1.6, 1);
    }
    g.beginPath();
    g.moveTo(-22, 64);
    g.lineTo(-22, 140);
    ink(g, 'rgba(255,255,255,0.5)', 3, 1);
    // Base.
    g.beginPath();
    g.rect(-42, 150, 84, 14);
    fill(g, brass);
    ink(g, inkc, 2, 1);
    g.beginPath();
    g.rect(-36, 164, 72, 10);
    fill(g, brassDark);
    ink(g, inkc, 2, 1);
    g.beginPath();
    g.moveTo(-42, 154);
    g.lineTo(42, 154);
    ink(g, 'rgba(255, 236, 180, 0.6)', 1.4, 1);
    return c.toDataURL();
  });
}

/** The seed tin that holds the draw pile, 150 by 110. */
export function tinUrl(): string {
  return once('tin', () => {
    const [c, g] = canvas(150, 110);
    const inkc = '#2a1a0a';
    g.translate(75, 58);
    g.beginPath();
    g.ellipse(0, 30, 62, 14, 0, 0, Math.PI * 2);
    fill(g, 'rgba(20, 10, 0, 0.3)');
    g.beginPath();
    g.rect(-60, -24, 120, 50);
    fill(g, '#3f6a58');
    g.save();
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(-60, -24, 120, 8);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(-60, 14, 120, 12);
    // Printed label.
    g.beginPath();
    g.rect(-38, -14, 76, 30);
    fill(g, '#efe2bf');
    ink(g, '#8a2a20', 1.2, 1);
    g.restore();
    g.beginPath();
    g.rect(-60, -24, 120, 50);
    ink(g, inkc, 2, 1);
    // Lid rim.
    g.beginPath();
    g.rect(-63, -30, 126, 10);
    fill(g, '#355a4a');
    ink(g, inkc, 2, 1);
    g.beginPath();
    g.moveTo(-60, -28);
    g.lineTo(60, -28);
    ink(g, 'rgba(255,255,255,0.35)', 1.2, 1);
    // The label's words are the table's own label under the tin, at a size that reads (painted here they came out 5 px).
    g.beginPath();
    g.moveTo(-26, -4);
    g.lineTo(26, -4);
    g.moveTo(-20, 5);
    g.lineTo(20, 5);
    ink(g, 'rgba(138, 42, 32, 0.55)', 1.4, 1);
    return c.toDataURL();
  });
}

/** The pegboard's wood, w by h px at 2x, with a track of holes. Returns the url and hole x positions (CSS px). */
export function pegboardUrl(w: number, h: number, holes: number): { url: string; xs: number[] } {
  const key = `peg${w}x${h}x${holes}`;
  const xs: number[] = [];
  const x0 = 16;
  const x1 = w - 22;
  for (let i = 0; i < holes; i++) xs.push(x0 + ((x1 - x0) * i) / (holes - 1));
  const url = once(key, () => {
    const S = 2;
    const [c, g] = canvas(w * S, h * S);
    g.scale(S, S);
    const r = new Rng(holes);
    // Rounded board.
    const rr = 7;
    g.beginPath();
    g.moveTo(rr, 0);
    g.arcTo(w, 0, w, h, rr);
    g.arcTo(w, h, 0, h, rr);
    g.arcTo(0, h, 0, 0, rr);
    g.arcTo(0, 0, w, 0, rr);
    g.closePath();
    g.fillStyle = '#c99a62';
    g.fill();
    g.save();
    g.clip();
    for (let y = 1; y < h; y += 1.6 + r.next() * 2) {
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 12) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 0.6);
      g.strokeStyle = `rgba(110, 66, 30, ${0.12 + r.next() * 0.2})`;
      g.lineWidth = 0.7;
      g.stroke();
    }
    g.fillStyle = 'rgba(255, 236, 200, 0.3)';
    g.fillRect(0, 0, w, 2);
    g.fillStyle = 'rgba(60, 30, 10, 0.25)';
    g.fillRect(0, h - 3, w, 3);
    g.restore();
    g.strokeStyle = '#3a2410';
    g.lineWidth = 1.2;
    g.stroke();
    // Holes, every fifth set a little apart by a burned tick. Round 10: they grow with a taller board (the desktop's).
    const cy = h * 0.5;
    const k = Math.max(1, Math.min(1.6, h / 30));
    xs.forEach((x, i) => {
      g.beginPath();
      g.arc(x, cy, 2.4 * k, 0, Math.PI * 2);
      g.fillStyle = '#2a1608';
      g.fill();
      g.beginPath();
      g.arc(x + 0.4, cy + 0.5, 1.6 * k, 0, Math.PI * 2);
      g.fillStyle = '#120802';
      g.fill();
      if (i % 5 === 0 && i > 0 && i < holes - 1) {
        g.beginPath();
        g.moveTo(x, cy - 7 * k);
        g.lineTo(x, cy - 5 * k);
        g.moveTo(x, cy + 5 * k);
        g.lineTo(x, cy + 7 * k);
        g.strokeStyle = 'rgba(58, 36, 16, 0.7)';
        g.lineWidth = 1;
        g.stroke();
      }
    });
    // The quota hole at the end: a brass ring.
    const qx = xs[xs.length - 1];
    g.beginPath();
    g.arc(qx, cy, 5.2 * k, 0, Math.PI * 2);
    g.strokeStyle = '#d8a83a';
    g.lineWidth = 2.2 * k;
    g.stroke();
    g.strokeStyle = '#3a2410';
    g.lineWidth = 0.8;
    g.stroke();
    return c.toDataURL();
  });
  return { url, xs };
}

/** A brass map pin for pinned pages and notes, 24 by 24. */
export function pinUrl(): string {
  return once('pin', () => {
    const [c, g] = canvas(48, 48);
    g.scale(2, 2);
    g.beginPath();
    g.arc(12, 12, 6, 0, Math.PI * 2);
    const gr = g.createRadialGradient(10, 10, 1, 12, 12, 7);
    gr.addColorStop(0, '#fff2c0');
    gr.addColorStop(0.4, '#d8a83a');
    gr.addColorStop(1, '#7a5418');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = '#3a2410';
    g.lineWidth = 0.8;
    g.stroke();
    return c.toDataURL();
  });
}


/** A small painting of a stall thing (stamp, bell, compost) at 2x, size by size. */
export function thingUrl(kind: 'stamp' | 'bell' | 'compost', size: number, paint: (g: CanvasRenderingContext2D, px: number) => void): string {
  return once(`thing-${kind}-${size}`, () => {
    const [c, g] = canvas(size * 2, size * 2);
    g.translate(size, size);
    g.scale(size * 2, size * 2);
    paint(g, 1 / (size * 2));
    return c.toDataURL();
  });
}
