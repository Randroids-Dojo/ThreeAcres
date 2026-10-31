// People and crows, drawn per frame because they move. The farmer wears a
// straw hat and blue overalls; hands wear bandanas and shirts by tint. Facing
// comes from the actor's angle (front, back or side), the walk from `walked`,
// and each verb has its own tool and pose, timed by task.t / task.dur.
// Kept to a few dozen path calls per figure and no allocation.

import type { Actor, Crow, Verb } from '../sim/types';
import type { Ctx } from './brush';
import { BANDANAS, SHIRTS } from './palette';

const SKIN = '#efc49c';
const SKIN_D = '#c98f6a';
const DENIM = '#3f62a6';
const DENIM_D = '#2c4880';
const STRAW = '#e2c05e';
const STRAW_D = '#b8923a';
const BOOT = '#4a3424';
const TROUSER = '#6a5440';
const FARMER_SHIRT = '#efe3c4';
const SHADOW = 'rgba(40,30,22,0.28)';

let INK = '#3a2d20';
let LW = 0.02;

function ln(ctx: Ctx, w = 1): void {
  ctx.lineWidth = LW * w;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, col: string, outline = true, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
  if (outline) ln(ctx);
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, rad: number, col: string): void {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ln(ctx);
}

function limb(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: string): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineCap = 'round';
  ctx.lineWidth = w + LW * 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  ctx.stroke();
}

/** Tool in the hand at (hx, hy), pointing along `a` (radians, screen). */
function tool(ctx: Ctx, verb: Verb, hx: number, hy: number, a: number, p: number, side: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  switch (verb) {
    case 'till':
    case 'clear': {
      // Hoe (or a sickle for clearing).
      const L = verb === 'till' ? 0.42 : 0.18;
      const ex = hx + c * L;
      const ey = hy + s * L;
      limb(ctx, hx - c * 0.08, hy - s * 0.08, ex, ey, 0.028, '#a8804e');
      ctx.beginPath();
      if (verb === 'till') {
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + -s * 0.09 * side + c * 0.02, ey + c * 0.09 * side + s * 0.02);
        ctx.lineTo(ex + -s * 0.1 * side + c * 0.07, ey + c * 0.1 * side + s * 0.07);
        ctx.closePath();
      } else {
        ctx.arc(ex + c * 0.06, ey + s * 0.06, 0.08, a - 1.6, a + 1.4);
      }
      ctx.fillStyle = '#9aa0a6';
      ctx.fill();
      ln(ctx);
      break;
    }
    case 'water': {
      // Watering can, tipped by the pose; a stream of drops from the rose.
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(a);
      rrect(ctx, -0.02, -0.05, 0.13, 0.1, 0.02, '#6f9aa8');
      ctx.beginPath();
      ctx.moveTo(0.11, -0.01);
      ctx.lineTo(0.22, -0.06);
      ctx.lineTo(0.23, -0.04);
      ctx.lineTo(0.12, 0.02);
      ctx.closePath();
      ctx.fillStyle = '#6f9aa8';
      ctx.fill();
      ln(ctx, 0.8);
      ctx.restore();
      const sx = hx + c * 0.22 - s * -0.05;
      const sy = hy + s * 0.22 + c * -0.05;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const k = (i / 5 + p * 3) % 1;
        const dx = sx + c * 0.12 * k * side;
        const dy = sy + k * 0.32 + k * k * 0.05;
        ctx.moveTo(dx + 0.014, dy);
        ctx.arc(dx, dy, 0.014, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#7fb7e0';
      ctx.fill();
      break;
    }
    case 'build': {
      limb(ctx, hx, hy, hx + c * 0.16, hy + s * 0.16, 0.024, '#a8804e');
      ctx.save();
      ctx.translate(hx + c * 0.17, hy + s * 0.17);
      ctx.rotate(a);
      rrect(ctx, -0.02, -0.05, 0.05, 0.1, 0.01, '#7a7f86');
      ctx.restore();
      break;
    }
    case 'plant': {
      // Seeds falling from the hand.
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const k = (p * 2 + i * 0.33) % 1;
        const dx = hx + (i - 1) * 0.03;
        const dy = hy + k * 0.3;
        ctx.moveTo(dx + 0.012, dy);
        ctx.arc(dx, dy, 0.012, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#c9a060';
      ctx.fill();
      break;
    }
    case 'harvest': {
      if (p > 0.45) {
        ell(ctx, hx, hy - 0.03, 0.06, 0.05, '#7cb24c');
        ell(ctx, hx + 0.02, hy + 0.02, 0.035, 0.03, '#e0782e');
      }
      break;
    }
    default:
      break;
  }
}

export interface ActorStyle {
  ink: string;
  /** Ink line width in tile units. */
  lw: number;
}

/**
 * Draw an actor with its feet at (0, 0) in the current transform. dir: 0 east,
 * 1 south (towards us), 2 west, 3 north.
 */
export function drawActor(ctx: Ctx, a: Readonly<Actor>, t: number, st: ActorStyle): void {
  INK = st.ink;
  LW = st.lw;
  const ang = a.angle;
  let dir = Math.round(ang / (Math.PI / 2)) % 4;
  if (dir < 0) dir += 4;
  const side = dir === 2 ? -1 : 1;
  const farmer = a.role === 'farmer';
  const shirt = farmer ? FARMER_SHIRT : SHIRTS[a.tint % SHIRTS.length];
  const legCol = farmer ? DENIM : TROUSER;
  const task = a.task;
  const verb = task ? task.verb : null;
  const p = task ? Math.min(1, Math.max(0, task.t / Math.max(0.01, task.dur))) : 0;
  const ph = a.moving ? a.walked * Math.PI * 2.2 : 0;
  const swing = Math.sin(ph);
  const bob = a.moving ? -Math.abs(Math.sin(ph)) * 0.03 : Math.sin(t * 2 + a.id) * 0.004;
  const lift = Math.sin(Math.PI * Math.min(1, Math.max(0, a.hop))) * 0.28;

  // Pose from the verb.
  let crouch = 0;
  let armA = 0; // near arm angle offset from hanging, radians, towards facing
  let armB = 0;
  let toolA = 0;
  if (verb === 'till') {
    const k = p < 0.55 ? p / 0.55 : 1 - (p - 0.55) / 0.45;
    armA = -0.6 - k * 2.0;
    armB = armA + 0.25;
    toolA = -1.4 - k * 1.6;
    if (p > 0.55) crouch = 0.03;
  } else if (verb === 'water') {
    armA = -1.2;
    armB = -0.3;
    toolA = 0.25 + Math.sin(p * Math.PI) * 0.35;
  } else if (verb === 'plant') {
    armA = -0.9 + Math.sin(p * Math.PI * 2) * 0.3;
    crouch = 0.04;
  } else if (verb === 'harvest') {
    crouch = p < 0.45 ? 0.1 : 0.1 * (1 - (p - 0.45) / 0.55);
    armA = p < 0.45 ? -0.5 : -0.5 - ((p - 0.45) / 0.55) * 2.2;
    armB = armA * 0.8;
  } else if (verb === 'tend') {
    crouch = 0.11;
    armA = -0.7 + Math.sin(p * Math.PI * 6) * 0.2;
    armB = -0.6 - Math.sin(p * Math.PI * 6) * 0.2;
  } else if (verb === 'clear') {
    crouch = 0.05;
    armA = -0.9 + Math.sin(p * Math.PI) * 1.2;
    toolA = -0.4 + Math.sin(p * Math.PI) * 1.4;
  } else if (verb === 'build') {
    crouch = 0.08;
    const k = Math.abs(Math.sin(p * Math.PI * 2));
    armA = -0.8 - k * 1.4;
    toolA = -1.2 - k * 1.2;
  } else if (verb === 'scare') {
    armA = -2.6 + Math.sin(p * Math.PI * 4) * 0.5;
    armB = -2.6 - Math.sin(p * Math.PI * 4) * 0.5;
  }

  // Shadow on the ground, then lift for a hop.
  ctx.beginPath();
  ctx.ellipse(0.03, 0.005, 0.17 - lift * 0.15, 0.055 - lift * 0.04, 0, 0, Math.PI * 2);
  ctx.fillStyle = SHADOW;
  ctx.fill();
  ctx.save();
  // People are drawn a touch larger than life so they read at 24 px a tile.
  ctx.scale(1.12, 1.12);
  ctx.translate(0, -lift + bob + crouch);

  const hipY = -0.26 + crouch * 0.5;
  const shY = -0.5;
  const headY = -0.62;

  if (dir === 1 || dir === 3) {
    // Front or back.
    const front = dir === 1;
    const lA = a.moving ? Math.max(0, swing) * 0.045 : 0;
    const lB = a.moving ? Math.max(0, -swing) * 0.045 : 0;
    const legH = -hipY;
    rrect(ctx, -0.1, hipY, 0.085, legH - lA - crouch, 0.02, legCol);
    rrect(ctx, 0.015, hipY, 0.085, legH - lB - crouch, 0.02, legCol);
    ell(ctx, -0.058, -lA - crouch + 0.005, 0.052, 0.028, BOOT);
    ell(ctx, 0.058, -lB - crouch + 0.005, 0.052, 0.028, BOOT);
    // Arms swing out from the shoulder in the plane of the page: 0 hangs down,
    // PI is straight overhead. The right hand holds the tool.
    const rRaise = verb ? Math.min(2.9, Math.max(0, -armA)) : a.moving ? 0.12 + swing * 0.12 : 0.1;
    const lRaise = verb ? Math.min(2.9, Math.max(0, -armB)) : a.moving ? 0.12 - swing * 0.12 : 0.1;
    const rAng = Math.PI / 2 - rRaise;
    const lAng = Math.PI / 2 + lRaise;
    let rhx = 0.125 + Math.cos(rAng) * 0.2;
    let rhy = shY + 0.05 + Math.sin(rAng) * 0.2;
    let lhx = -0.125 + Math.cos(lAng) * 0.2;
    let lhy = shY + 0.05 + Math.sin(lAng) * 0.2;
    let toolAng = verb === 'water' ? 0.35 + Math.sin(p * Math.PI) * 0.3 : verb === 'build' || verb === 'clear' ? rAng - 0.5 : rAng;
    if (verb === 'till') {
      // Both hands on the handle: up over the head, then down in front.
      const k = p < 0.55 ? p / 0.55 : 1 - (p - 0.55) / 0.45;
      rhx = 0.035;
      lhx = -0.035;
      rhy = lhy = shY + 0.2 - k * 0.36;
      toolAng = Math.PI / 2 - 0.15 + (-Math.PI + 0.45) * k;
    }
    // Tool behind the body when facing away.
    if (!front && verb) tool(ctx, verb, rhx, rhy, toolAng, p, 1);
    // Torso.
    rrect(ctx, -0.125, shY, 0.25, hipY - shY + 0.02, 0.05, shirt);
    if (farmer) {
      // Bib and straps (crossed on the back).
      ctx.beginPath();
      if (front) {
        ctx.rect(-0.085, shY + 0.08, 0.17, hipY - shY - 0.06);
      } else {
        ctx.moveTo(-0.09, shY + 0.02);
        ctx.lineTo(0.06, hipY);
        ctx.lineTo(0.09, hipY);
        ctx.lineTo(-0.06, shY + 0.02);
        ctx.closePath();
        ctx.moveTo(0.09, shY + 0.02);
        ctx.lineTo(-0.06, hipY);
        ctx.lineTo(-0.09, hipY);
        ctx.lineTo(0.06, shY + 0.02);
        ctx.closePath();
      }
      ctx.fillStyle = DENIM;
      ctx.fill();
      ln(ctx, 0.8);
      if (front) {
        ctx.beginPath();
        ctx.moveTo(-0.075, shY + 0.08);
        ctx.lineTo(-0.085, shY + 0.01);
        ctx.moveTo(0.075, shY + 0.08);
        ctx.lineTo(0.085, shY + 0.01);
        ctx.lineWidth = 0.022;
        ctx.strokeStyle = DENIM_D;
        ctx.stroke();
        ell(ctx, -0.06, shY + 0.09, 0.012, 0.012, '#e8c45a', false);
        ell(ctx, 0.06, shY + 0.09, 0.012, 0.012, '#e8c45a', false);
      }
    } else {
      ctx.beginPath();
      ctx.rect(-0.125, hipY - 0.03, 0.25, 0.04);
      ctx.fillStyle = '#5a3a24';
      ctx.fill();
    }
    // Shade on the side away from the light.
    ctx.beginPath();
    ctx.rect(0.03, shY + 0.03, 0.085, hipY - shY - 0.03);
    ctx.fillStyle = 'rgba(40,30,22,0.14)';
    ctx.fill();
    // Arms.
    limb(ctx, -0.125, shY + 0.05, lhx, lhy, 0.06, shirt);
    limb(ctx, 0.125, shY + 0.05, rhx, rhy, 0.06, shirt);
    ell(ctx, lhx, lhy, 0.03, 0.03, SKIN);
    ell(ctx, rhx, rhy, 0.03, 0.03, SKIN);
    // Head.
    ell(ctx, 0, headY, 0.098, 0.098, SKIN);
    if (front) {
      ctx.beginPath();
      ctx.arc(-0.035, headY + 0.005, 0.011, 0, Math.PI * 2);
      ctx.arc(0.035, headY + 0.005, 0.011, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-0.055, headY + 0.04, 0.018, 0, Math.PI * 2);
      ctx.arc(0.055, headY + 0.04, 0.018, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(214,110,90,0.45)';
      ctx.fill();
    } else {
      ell(ctx, 0, headY + 0.01, 0.09, 0.07, farmer ? '#8a5a34' : '#5a3a28', false);
    }
    headwear(ctx, farmer, a.tint, headY, 0, front ? 0 : 1);
    if (front && verb) tool(ctx, verb, rhx, rhy, toolAng, p, 1);
  } else {
    // Side view, facing east (side 1) or west (side -1).
    ctx.scale(side, 1);
    const legSw = a.moving ? swing * 0.07 : 0;
    // Far leg and far arm first.
    limb(ctx, -0.01, hipY + 0.02, -legSw * 0.8, -0.03 - crouch, 0.075, legCol);
    ell(ctx, -legSw * 0.8 + 0.025, -0.012 - crouch, 0.05, 0.026, BOOT);
    const farA = verb ? armB : -swing * 0.5;
    limb(ctx, -0.02, shY + 0.05, -0.02 + Math.sin(-farA) * -0.2, shY + 0.05 + Math.cos(farA) * 0.2, 0.055, shirt);
    // Torso.
    rrect(ctx, -0.085, shY, 0.17, hipY - shY + 0.02, 0.05, shirt);
    ctx.beginPath();
    // The shaded side is screen east whichever way they face.
    ctx.rect(side > 0 ? 0.015 : -0.075, shY + 0.03, 0.06, hipY - shY - 0.03);
    ctx.fillStyle = 'rgba(40,30,22,0.12)';
    ctx.fill();
    if (farmer) {
      ctx.beginPath();
      ctx.rect(-0.02, shY + 0.07, 0.105, hipY - shY - 0.05);
      ctx.fillStyle = DENIM;
      ctx.fill();
      ln(ctx, 0.8);
      ctx.beginPath();
      ctx.moveTo(0.0, shY + 0.07);
      ctx.lineTo(-0.02, shY + 0.01);
      ctx.lineWidth = 0.02;
      ctx.strokeStyle = DENIM_D;
      ctx.stroke();
    }
    // Near leg.
    limb(ctx, 0.01, hipY + 0.02, legSw, -0.03 - crouch, 0.08, legCol);
    ell(ctx, legSw + 0.03, -0.012 - crouch, 0.052, 0.027, BOOT);
    // Head in profile.
    ell(ctx, 0.0, headY, 0.095, 0.095, SKIN);
    ell(ctx, 0.09, headY + 0.012, 0.022, 0.018, SKIN_D, false);
    ctx.beginPath();
    ctx.arc(0.045, headY - 0.005, 0.011, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ell(ctx, -0.04, headY + 0.005, 0.06, 0.07, farmer ? '#8a5a34' : '#5a3a28', false);
    headwear(ctx, farmer, a.tint, headY, 1, 0);
    // Near arm, with the tool.
    const nearA = verb ? armA : swing * 0.5;
    const hx = 0.01 + Math.sin(-nearA) * -0.21;
    const hy = shY + 0.05 + Math.cos(nearA) * 0.21;
    if (verb) tool(ctx, verb, hx, hy, toolA, p, 1);
    limb(ctx, 0.01, shY + 0.05, hx, hy, 0.058, shirt);
    ell(ctx, hx, hy, 0.03, 0.03, SKIN);
  }
  ctx.restore();
}

function headwear(ctx: Ctx, farmer: boolean, tint: number, headY: number, side: number, back: number): void {
  if (farmer) {
    // Straw hat: a wide brim and a round crown with a red band.
    const bx = side * 0.02;
    ell(ctx, bx, headY - 0.055, 0.18, 0.052, STRAW);
    ctx.beginPath();
    ctx.moveTo(bx - 0.09, headY - 0.06);
    ctx.quadraticCurveTo(bx - 0.09, headY - 0.17, bx, headY - 0.17);
    ctx.quadraticCurveTo(bx + 0.09, headY - 0.17, bx + 0.09, headY - 0.06);
    ctx.closePath();
    ctx.fillStyle = STRAW;
    ctx.fill();
    ln(ctx);
    ctx.beginPath();
    ctx.rect(bx - 0.088, headY - 0.095, 0.176, 0.03);
    ctx.fillStyle = '#b8433a';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx - 0.14, headY - 0.05);
    ctx.quadraticCurveTo(bx, headY - 0.02, bx + 0.14, headY - 0.05);
    ctx.lineWidth = LW * 0.7;
    ctx.strokeStyle = STRAW_D;
    ctx.stroke();
  } else {
    // Bandana over the hair, knotted at the back.
    const col = BANDANAS[tint % BANDANAS.length];
    ctx.beginPath();
    ctx.moveTo(-0.1, headY - 0.01);
    ctx.quadraticCurveTo(-0.1, headY - 0.11, 0, headY - 0.115);
    ctx.quadraticCurveTo(0.1, headY - 0.11, 0.1, headY - 0.01);
    ctx.quadraticCurveTo(0, headY - 0.04, -0.1, headY - 0.01);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ln(ctx);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(-0.05 + i * 0.05 + 0.01, headY - 0.07);
      ctx.arc(-0.05 + i * 0.05, headY - 0.07, 0.01, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
    if (side || back) {
      const kx = side ? -0.1 : 0;
      ctx.beginPath();
      ctx.moveTo(kx, headY - 0.04);
      ctx.lineTo(kx - 0.06 * (side || 1), headY - 0.0);
      ctx.lineTo(kx - 0.03 * (side || 1), headY + 0.03);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ln(ctx, 0.8);
    }
  }
}

// ---------------------------------------------------------------------------
// Crows

const CROW = '#262a36';
const CROW_L = '#4a5266';

/**
 * A crow with its body at (0, -h) and its shadow at (0, 0). face 1 east, -1
 * west. flap is the wing phase (radians); pecking bobs the head down.
 */
export function drawCrow(ctx: Ctx, h: number, face: number, flap: number, flying: boolean, peck: number, st: ActorStyle): void {
  INK = st.ink;
  LW = st.lw * 0.8;
  const sh = Math.max(0.25, 1 - h * 0.25);
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.13 * sh, 0.04 * sh, 0, 0, Math.PI * 2);
  ctx.fillStyle = SHADOW;
  ctx.fill();
  ctx.save();
  ctx.translate(0, -h);
  ctx.scale(face, 1);
  if (flying) {
    const w = Math.sin(flap);
    // Far wing.
    ctx.beginPath();
    ctx.moveTo(-0.02, -0.03);
    ctx.quadraticCurveTo(-0.06, -0.05 - w * 0.16, -0.14, -0.04 - w * 0.22);
    ctx.lineTo(0.04, -0.02);
    ctx.closePath();
    ctx.fillStyle = CROW_L;
    ctx.fill();
    ln(ctx);
  } else {
    // Legs.
    ctx.beginPath();
    ctx.moveTo(-0.01, 0.0);
    ctx.lineTo(-0.02, 0.06 + h * 0);
    ctx.moveTo(0.03, 0.0);
    ctx.lineTo(0.035, 0.06);
    ctx.lineWidth = LW;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.translate(0, -0.06);
  }
  // Tail and body.
  ctx.beginPath();
  ctx.moveTo(-0.08, -0.02);
  ctx.lineTo(-0.2, -0.05 + (flying ? 0 : 0.04));
  ctx.lineTo(-0.19, 0.01 + (flying ? 0 : 0.05));
  ctx.closePath();
  ctx.fillStyle = CROW;
  ctx.fill();
  ln(ctx);
  ell(ctx, 0, -0.02, 0.11, 0.06, CROW, true, flying ? 0 : -0.2);
  // Head, bobbing down to peck.
  const hx = 0.1 + peck * 0.03;
  const hy = -0.07 + peck * 0.09;
  ell(ctx, hx, hy, 0.05, 0.045, CROW);
  ctx.beginPath();
  ctx.moveTo(hx + 0.04, hy - 0.012);
  ctx.lineTo(hx + 0.1, hy + 0.005 + peck * 0.02);
  ctx.lineTo(hx + 0.04, hy + 0.015);
  ctx.closePath();
  ctx.fillStyle = '#8a8478';
  ctx.fill();
  ln(ctx, 0.7);
  ctx.beginPath();
  ctx.arc(hx + 0.015, hy - 0.01, 0.009, 0, Math.PI * 2);
  ctx.fillStyle = '#f2ead8';
  ctx.fill();
  if (flying) {
    // Near wing over the body.
    const w = Math.sin(flap);
    ctx.beginPath();
    ctx.moveTo(-0.04, -0.03);
    ctx.quadraticCurveTo(0.0, -0.06 - w * 0.2, -0.1, -0.06 - w * 0.3);
    ctx.lineTo(-0.16, -0.02 - w * 0.22);
    ctx.lineTo(0.05, -0.0);
    ctx.closePath();
    ctx.fillStyle = CROW;
    ctx.fill();
    ln(ctx);
  } else {
    ctx.beginPath();
    ctx.moveTo(-0.07, -0.04);
    ctx.quadraticCurveTo(0.0, -0.06, 0.05, -0.02);
    ctx.lineWidth = LW;
    ctx.strokeStyle = CROW_L;
    ctx.stroke();
  }
  ctx.restore();
}

/** Where a crow is and how high, from its phase. Writes into `out` [x, y, h, face, flying]. */
export function crowPose(c: Readonly<Crow>, flySeconds: number, perchH: number, out: Float32Array): boolean {
  if (c.phase === 'gone') return false;
  const tx = c.x + 0.74;
  const ty = c.y + 0.7;
  if (c.phase === 'peck') {
    out[0] = tx;
    out[1] = ty;
    out[2] = perchH;
    out[3] = c.fromX <= tx ? 1 : -1;
    out[4] = 0;
    return true;
  }
  const p = Math.min(1, Math.max(0, c.t / flySeconds));
  if (c.phase === 'in') {
    const e = 1 - (1 - p) * (1 - p) * (1 - p);
    out[0] = c.fromX + (tx - c.fromX) * e;
    out[1] = c.fromY + (ty - c.fromY) * e;
    out[2] = 2.6 * (1 - e) + perchH * e + Math.sin(Math.PI * p) * 0.5;
    out[3] = tx >= c.fromX ? 1 : -1;
  } else {
    const e = p * p;
    out[0] = tx + (c.fromX - tx) * e;
    out[1] = ty + (c.fromY - ty) * e;
    out[2] = perchH + e * 3 + Math.sin(Math.PI * p) * 0.4;
    out[3] = c.fromX >= tx ? 1 : -1;
  }
  out[4] = 1;
  return true;
}
