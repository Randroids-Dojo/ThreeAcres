// A flat stand-in renderer: coloured squares and dots. It exists so the game
// runs before the real renderers land, and as a reference for the camera and
// pick conventions. Not used by the shipped game.

import type { FrameView, Renderer } from '../contract';
import { CROPS } from '../sim/crops';
import { PROPS } from '../sim/map';
import type { SimEvent, WorldState } from '../sim/types';

const GROUND: Record<string, string> = { grass: '#7db35a', field: '#9b7b52', path: '#cbb48a', water: '#4f8fc0', wood: '#2f5b32', yard: '#b89c6e' };

export function createPlaceholder(kind: '2d' | '3d'): Renderer {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  let w = 1;
  let h = 1;
  let dpr = 1;
  let scale = 32;
  let ox = 0;
  let oy = 0;

  const fit = (v: FrameView) => {
    const s = v.state;
    const cam = v.camera;
    const base = cam.mode === 'wide' ? Math.min(w / s.W, h / s.H) : Math.min(w, h) / 9;
    scale = base * cam.zoom;
    const cx = cam.mode === 'wide' ? s.W / 2 + cam.panX : cam.focusX;
    const cy = cam.mode === 'wide' ? s.H / 2 + cam.panY : cam.focusY;
    ox = w / 2 - cx * scale;
    oy = h / 2 - cy * scale;
  };

  return {
    kind,
    canvas,
    resize(cw, ch, r) {
      w = cw;
      h = ch;
      dpr = r;
      canvas.width = Math.round(cw * r);
      canvas.height = Math.round(ch * r);
    },
    frame(v) {
      fit(v);
      const s = v.state as WorldState;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#1b2a1c';
      ctx.fillRect(0, 0, w, h);
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);
      for (let y = 0; y < s.H; y++) {
        for (let x = 0; x < s.W; x++) {
          const i = y * s.W + x;
          const k = s.tiles[i];
          const p = s.plots[i];
          ctx.fillStyle = k === 'field' ? (s.parcels[s.parcelOf[i]].owned ? (p.tilled ? (p.wet || p.moisture >= 2 ? '#6b4f33' : '#9b7b52') : '#a3a36b') : '#5f8f45') : GROUND[k];
          ctx.fillRect(x, y, 1.02, 1.02);
          const c = p.crop;
          if (c) {
            ctx.fillStyle = c.dead ? '#5a4a3a' : CROPS[c.kind].color;
            ctx.beginPath();
            ctx.arc(x + 0.5, y + 0.5, 0.1 + c.stage * 0.08, 0, Math.PI * 2);
            ctx.fill();
            if (c.bugs) {
              ctx.fillStyle = '#222';
              ctx.fillRect(x + 0.7, y + 0.2, 0.12, 0.12);
            }
          }
        }
      }
      for (const b of s.builds) {
        ctx.fillStyle = b.kind === 'sprinkler' ? '#9fd3ff' : '#e0c070';
        ctx.fillRect(b.x + 0.3, b.y + 0.2, 0.4, 0.6);
      }
      for (const p of PROPS) {
        ctx.fillStyle = p.kind === 'house' ? '#c4583c' : p.kind === 'bunkhouse' ? '#8a5a3c' : '#a07a4a';
        ctx.fillRect(p.x + 0.05, p.y + 0.05, p.w - 0.1, p.h - 0.1);
      }
      for (const a of s.actors) {
        if (a.away) continue;
        ctx.fillStyle = a.role === 'farmer' ? '#2d5fbf' : '#d68a2a';
        ctx.beginPath();
        ctx.arc(a.x, a.y - 0.2 * Math.sin(Math.PI * a.hop), 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + Math.cos(a.angle) * 0.35, a.y + Math.sin(a.angle) * 0.35);
        ctx.stroke();
      }
      for (const c of s.crows) {
        if (c.phase === 'gone') continue;
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(c.x + 0.5, c.y + 0.5, 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const j of s.jobs) {
        ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.lineWidth = 0.05;
        ctx.strokeRect(j.x + 0.2, j.y + 0.2, 0.6, 0.6);
      }
      const hl = v.highlight;
      if (hl) {
        ctx.strokeStyle = hl.ok ? '#fff' : '#f55';
        ctx.lineWidth = 0.08;
        ctx.strokeRect(hl.x + 0.04, hl.y + 0.04, 0.92, 0.92);
      }
      const dark = (1 - v.daylight) * 0.55 + v.night * 0.8;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(10,15,40,${Math.min(0.92, dark)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.font = '12px sans-serif';
      ctx.fillText(`placeholder ${kind}`, 8, h - 8);
    },
    onEvent(_e: SimEvent) {},
    pick(px, py) {
      const x = Math.floor((px - ox) / scale);
      const y = Math.floor((py - oy) / scale);
      return x >= 0 && y >= 0 && x < 20 && y < 15 ? { x, y } : null;
    },
    project(x, y) {
      return { x: ox + x * scale, y: oy + y * scale };
    },
    snap(v) {
      fit(v);
    },
    dispose() {},
  };
}
