// P1: on a phone the camera spent the top 31% of the screen on sky, showed
// the void under the farm, about 8 rows and 10 columns, and left lesson
// targets off screen. Now a tall screen looks down more steeply and keeps to
// the farm: the whole depth of it, back trees to front hedge, fills the clear
// band between the day card and the tool rack wherever the farmer stands,
// with 10 to 12 columns and bigger tiles.
import { describe, expect, it } from 'vitest';
import { makeRig } from '../src/render3d/camera';

const W = 412;
const SPOTS = [
  [2.5, 3.5],
  [3.5, 6.5],
  [9, 7],
  [11.5, 3.5],
  [16, 12],
  [3, 13],
  [18.5, 4.5],
  [1.5, 9.5],
];

function framed(h: number, fx: number, fy: number) {
  const rig = makeRig();
  rig.resize(W, h);
  rig.update({ mode: 'close', focusX: fx, focusY: fy, zoom: 1, panX: 0, panY: 0 }, 20, 15, 0, true);
  rig.commit();
  return rig;
}

describe('the phone camera keeps the farm in view', () => {
  for (const h of [838, 900]) {
    it(`${W}x${h}: no sky in the clear band: the back trees reach its top, the yard starts just below`, () => {
      for (const [fx, fy] of SPOTS) {
        const rig = framed(h, fx, fy);
        // The crowns of the back row (about 1.75 tall, half a tile in) are at or above the top of the band.
        expect(rig.project(fx, 0.5, 1.75)!.y, `trees at ${fx},${fy}`).toBeLessThanOrEqual(101);
        // And the ground is farm a short way below it, across the screen.
        for (const px of [40, W / 2, W - 40]) expect(rig.pick(px, 190, 20, 15), `at ${fx},${fy}, x ${px}`).not.toBeNull();
      }
    });

    // (Round 10: at least 8.6 tiles across, so a tall phone's farm runs down to the rack: at 9.8 or more a 412x900 phone
    // had a blank cream band under the farm, 13% of the screen. Nine columns or more.)
    it(`${W}x${h}: the middle of the screen is farm edge to edge (no void at the sides), with at least 9 columns`, () => {
      for (const [fx, fy] of SPOTS) {
        const rig = framed(h, fx, fy);
        expect(rig.pick(3, h / 2, 20, 15), `left at ${fx},${fy}`).not.toBeNull();
        expect(rig.pick(W - 3, h / 2, 20, 15), `right at ${fx},${fy}`).not.toBeNull();
        const cols = new Set<number>();
        for (let i = 0; i < 80; i++) cols.add(rig.pick(((i + 0.5) / 80) * W, h / 2, 20, 15)?.x ?? -1);
        cols.delete(-1);
        expect(cols.size).toBeGreaterThanOrEqual(9);
      }
    });

    it(`${W}x${h}: the clear band (below the day card, above the tool rack) is at least 85% farm, and all of its rows`, () => {
      for (const [fx, fy] of SPOTS) {
        const rig = framed(h, fx, fy);
        let on = 0;
        let n = 0;
        const rows = new Set<number>();
        for (let j = 0; j < 40; j++) {
          for (let i = 0; i < 20; i++) {
            n++;
            const t = rig.pick(((i + 0.5) / 20) * W, 100 + ((j + 0.5) / 40) * (h - 212), 20, 15);
            if (t) {
              on++;
              rows.add(t.y);
            }
          }
        }
        // Before: about half the screen, and eight of the fifteen rows.
        expect(on / n, `at ${fx},${fy}`).toBeGreaterThanOrEqual(0.85);
        expect(rows.size).toBe(15);
      }
    });
  }

  it('the farmer is always on screen, inside the clear band', () => {
    for (const [fx, fy] of SPOTS) {
      const rig = framed(838, fx, fy);
      const p = rig.project(fx, fy, 0)!;
      expect(p.x).toBeGreaterThan(20);
      expect(p.x).toBeLessThan(W - 20);
      expect(p.y).toBeGreaterThan(100);
      expect(p.y).toBeLessThan(838 - 112);
    }
  });

  // Round 10: in the yard, from the board on, its well keeps in view as far as the farmer allows (at the farm's tighter
  // tiles it slid off the right edge from the board).
  it('in the yard, from the board to the well, the yard’s well is on screen', () => {
    for (const h of [838, 900]) {
      for (const fx of [8, 8.5, 10.5, 11.5]) {
        const rig = framed(h, fx, 3.5);
        const w = rig.project(11.5, 2.5, 0.6)!;
        expect(w.x, `well, farmer ${fx},3.5`).toBeLessThanOrEqual(W - 12);
        expect(rig.project(fx, 3.5, 0)!.x).toBeGreaterThan(12);
      }
    }
  });

  it('from the first field, the second field and the notice board are in view', () => {
    for (const h of [838, 900]) {
      const rig = framed(h, 3.5, 6.5);
      for (const [x, y] of [
        [9, 7],
        [8.5, 2.5],
      ]) {
        const p = rig.project(x, y, 0)!;
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(W);
      }
    }
  });

  // Round 3: from the first field the well was off screen, and on the path between the fields the first field's
  // left column left the screen. Now the west side holds still on the first two fields and the well.
  // (Round 10: a well, the yard's or, since round 8, the one where the field paths cross: with the farm filling the screen
  // down to the rack the yard's well can sit just off the right edge from the first field.)
  it('from the first field and the path beside it, the first field’s left column and a well are both on screen', () => {
    for (const h of [838, 900]) {
      for (const [fx, fy] of [[3.5, 6.5], [2.5, 5.5], [6.5, 7], [7.5, 9.5], [5.5, 4.5]]) {
        const rig = framed(h, fx, fy);
        // The left edge of the first field, on every one of its rows.
        for (let y = 5; y < 9; y++) expect(rig.project(2, y + 0.99, 0)!.x, `field 1 at row ${y}, farmer ${fx},${fy}`).toBeGreaterThanOrEqual(0);
        const wells = [rig.project(11.5, 2.5, 0.6)!, rig.project(6.5, 9.5, 0.6)!];
        expect(wells.some((w) => w.x >= 12 && w.x <= W - 12), `a well, farmer ${fx},${fy}`).toBe(true);
      }
    }
  });

  // Round 5: with the farmer in the second field or at the well, the first field's left column was off screen and
  // could not be tapped. Now the camera holds still on the west side as far as the well's front. Round 12: but standing
  // in the second field, that field comes first: it is whole on screen (at 412x900 its right column's middle sat at x 410
  // of 412), and the first field's left column still shows a finger's width.
  it('from the well’s front and the path beside the second field, the middle of the first field’s left column is on screen, with room for a finger', () => {
    for (const h of [838, 900]) {
      // (Round 10: from the yard's well itself, at the farm's tighter tiles, the yard is in view instead: a tap queue now
      // fills the can at the nearer well on its own, the one between the fields, so no one walks to the yard's well to
      // water field 1.)
      for (const [fx, fy] of [[6.5, 8.5], [7.5, 9.5], [6.5, 6.5]]) {
        const rig = framed(h, fx, fy);
        // Its middle 12 px or more in from the edge: with half a tile (about 20 px) to its right, a finger has 32 px.
        for (let y = 5; y < 9; y++) expect(rig.project(2.5, y + 0.5, 0)!.x, `field 1 at row ${y}, farmer ${fx},${fy}`).toBeGreaterThanOrEqual(12);
        // And the farmer stays on screen.
        const f = rig.project(fx, fy, 0)!;
        expect(f.x).toBeLessThan(W - 16);
      }
    }
  });

  it('from the second field, it is whole on screen, and the first field’s left column still shows a finger’s width', () => {
    for (const h of [838, 900]) {
      for (const [fx, fy] of [[10.5, 6.5], [10.5, 8.5], [9.5, 7.5], [7.5, 5.5]]) {
        const rig = framed(h, fx, fy);
        for (let y = 5; y < 9; y++) {
          expect(rig.project(11, y + 1, 0)!.x, `field 2's right edge at row ${y}, farmer ${fx},${fy}`).toBeLessThanOrEqual(W);
          expect(rig.project(3, y + 0.5, 0)!.x, `field 1's left column at row ${y}, farmer ${fx},${fy}`).toBeGreaterThanOrEqual(20);
        }
        const f = rig.project(fx, fy, 0)!;
        expect(f.x).toBeLessThan(W - 16);
      }
    }
  });
});
