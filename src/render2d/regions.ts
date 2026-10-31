// Ground regions as hand-drawn shapes. Each kind of ground (grass, yard,
// path, water, field, wood) becomes one outline traced along tile edges. The
// edges wobble, and the wobble is a pure function of the edge, so two regions
// that share an edge share exactly the same line and never gap or overlap.

import type { TileKind, WorldState } from '../sim/types';
import { hashf } from './rng';

export interface Regions {
  /** Fill paths per kind, in tile units, filled with the even-odd rule. */
  path: Record<TileKind, Path2D>;
  /** The same outlines as point loops, for inking. */
  loops: Record<TileKind, Float32Array[]>;
  /** Everything that is not wood: the hole in the wood floor. */
  open: Float32Array[];
}

const KINDS: TileKind[] = ['grass', 'field', 'path', 'water', 'wood', 'yard'];

export function buildRegions(s: Readonly<WorldState>): Regions {
  const W = s.W;
  const H = s.H;
  const kind = (x: number, y: number): TileKind => (x < 0 || y < 0 || x >= W || y >= H ? 'wood' : s.tiles[y * W + x]);

  // Corner points: a little jitter, and round the convex corners of the pond.
  const corner = (i: number, j: number, out: number[]) => {
    let x = i + (hashf(i, j, 11) - 0.5) * 0.07;
    let y = j + (hashf(i, j, 12) - 0.5) * 0.07;
    const a = kind(i - 1, j - 1);
    const b = kind(i, j - 1);
    const c = kind(i - 1, j);
    const d = kind(i, j);
    const k4 = [a, b, c, d];
    for (const k of ['water', 'path'] as const) {
      let n = 0;
      let cx = 0;
      let cy = 0;
      for (let q = 0; q < 4; q++) {
        if (k4[q] === k) {
          n++;
          cx += q % 2 === 0 ? -0.5 : 0.5;
          cy += q < 2 ? -0.5 : 0.5;
        }
      }
      const pull = k === 'water' ? 0.36 : 0.12;
      if (n === 1) {
        x += cx * pull;
        y += cy * pull;
      } else if (n === 3 && k === 'water') {
        x -= cx * 0.06;
        y -= cy * 0.06;
      }
    }
    if (k4.includes('field') && (a === 'field' || b === 'field' || c === 'field' || d === 'field')) {
      // Field corners stay crisp: surveyed lots.
      x = i + (x - i) * 0.4;
      y = j + (y - j) * 0.4;
    }
    out[0] = x;
    out[1] = y;
  };

  const amp = (k1: TileKind, k2: TileKind) => {
    if (k1 === 'water' || k2 === 'water') return 0.08;
    if (k1 === 'field' || k2 === 'field') return 0.018;
    if (k1 === 'path' || k2 === 'path') return 0.035;
    return 0.045;
  };

  // Points of one unit edge from corner (i0, j0) to (i1, j1), not including the end.
  const tmp = [0, 0];
  const edgePts = (i0: number, j0: number, i1: number, j1: number, pts: number[]) => {
    corner(i0, j0, tmp);
    pts.push(tmp[0], tmp[1]);
    const horiz = j0 === j1;
    const ci = Math.min(i0, i1);
    const cj = Math.min(j0, j1);
    const k1 = horiz ? kind(ci, cj - 1) : kind(ci - 1, cj);
    const k2 = kind(ci, cj);
    const a = amp(k1, k2);
    const fwd = horiz ? i1 > i0 : j1 > j0;
    const ts = fwd ? [1 / 3, 2 / 3] : [2 / 3, 1 / 3];
    for (const t of ts) {
      const seed = t < 0.5 ? 21 : 22;
      const off = (hashf(ci, cj, seed + (horiz ? 0 : 10)) - 0.5) * 2 * a;
      if (horiz) pts.push(ci + t, cj + off);
      else pts.push(ci + off, cj + t);
    }
  };

  const trace = (inMask: (x: number, y: number) => boolean): Float32Array[] => {
    // Directed boundary edges with the region on the right of travel (screen coords).
    const edges = new Map<number, number[]>();
    const key = (i: number, j: number) => (j + 2) * 1000 + (i + 2);
    const add = (i0: number, j0: number, i1: number, j1: number) => {
      const k = key(i0, j0);
      let l = edges.get(k);
      if (!l) edges.set(k, (l = []));
      l.push(i1, j1);
    };
    let count = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inMask(x, y)) continue;
        if (!inMask(x, y - 1)) (add(x, y, x + 1, y), count++);
        if (!inMask(x + 1, y)) (add(x + 1, y, x + 1, y + 1), count++);
        if (!inMask(x, y + 1)) (add(x + 1, y + 1, x, y + 1), count++);
        if (!inMask(x - 1, y)) (add(x, y + 1, x, y), count++);
      }
    }
    const loops: Float32Array[] = [];
    while (count > 0) {
      let start = -1;
      for (const [k, l] of edges) {
        if (l.length) {
          start = k;
          break;
        }
      }
      if (start < 0) break;
      let i = (start % 1000) - 2;
      let j = Math.floor(start / 1000) - 2;
      const si = i;
      const sj = j;
      const pts: number[] = [];
      let guard = 0;
      do {
        const l = edges.get(key(i, j))!;
        const nj = l.pop()!;
        const ni = l.pop()!;
        count--;
        edgePts(i, j, ni, nj, pts);
        i = ni;
        j = nj;
      } while ((i !== si || j !== sj) && ++guard < 10000);
      loops.push(new Float32Array(pts));
    }
    return loops;
  };

  const path = {} as Record<TileKind, Path2D>;
  const loops = {} as Record<TileKind, Float32Array[]>;
  for (const k of KINDS) {
    if (k === 'wood') continue;
    loops[k] = trace((x, y) => kind(x, y) === k && x >= 0 && y >= 0 && x < W && y < H);
    path[k] = toPath(loops[k]);
  }
  const open = trace((x, y) => x >= 0 && y >= 0 && x < W && y < H && kind(x, y) !== 'wood');
  // The wood floor: a ragged margin around the farm with the open ground cut out.
  const woodPath = new Path2D();
  const rag: number[] = [];
  const M = 0.75;
  const ragPt = (x: number, y: number, i: number) => {
    rag.push(x + (hashf(i, 3, 41) - 0.5) * 0.35, y + (hashf(i, 4, 41) - 0.5) * 0.35);
  };
  let n = 0;
  for (let x = -M; x < W + M; x += 0.5) ragPt(x, -M, n++);
  for (let y = -M; y < H + M; y += 0.5) ragPt(W + M, y, n++);
  for (let x = W + M; x > -M; x -= 0.5) ragPt(x, H + M, n++);
  for (let y = H + M; y > -M; y -= 0.5) ragPt(-M, y, n++);
  addLoop(woodPath, new Float32Array(rag));
  for (const l of open) addLoop(woodPath, l);
  path.wood = woodPath;
  loops.wood = [new Float32Array(rag)];
  return { path, loops, open };
}

function addLoop(p: Path2D, l: Float32Array): void {
  p.moveTo(l[0], l[1]);
  for (let i = 2; i < l.length; i += 2) p.lineTo(l[i], l[i + 1]);
  p.closePath();
}

function toPath(loops: Float32Array[]): Path2D {
  const p = new Path2D();
  for (const l of loops) addLoop(p, l);
  return p;
}

/** Trace a loop onto a context's current path. */
export function loopPath(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, l: Float32Array): void {
  ctx.moveTo(l[0], l[1]);
  for (let i = 2; i < l.length; i += 2) ctx.lineTo(l[i], l[i + 1]);
  ctx.closePath();
}
