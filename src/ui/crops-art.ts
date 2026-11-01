// Sunup's crops drawn as small almanac plates: brown ink outlines, flat fills,
// one highlight and a darker line for the detail (rings, kernels, ribs). Drawn
// on a 32 grid so they read at 16 px on a chip and stay crisp at 40 on a card.

import type { CropId } from '../sim/types';

const INK = '#3b2a1c';

const plate = (body: string) =>
  `<svg class="crop-art" viewBox="0 0 32 32" stroke="${INK}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ART: Record<CropId, string> = {
  radish: plate(
    // Two leaves, the bulb with its pale tip and tail, a highlight.
    '<path d="M16 10c-1.2-3.4-4.4-6-8.2-5.6.5 3.3 3.4 5.6 7.4 5.9z" fill="#6aa84f"/>' +
      '<path d="M16 10c1-3.6 4-6.4 8-6.4-.2 3.4-3.2 6-7 6.6z" fill="#86c25c"/>' +
      '<path d="M16 9.6c4.7 0 7.6 3.2 7.6 7.5 0 4.8-3.6 8-7.6 8.6-4-.6-7.6-3.8-7.6-8.6 0-4.3 2.9-7.5 7.6-7.5z" fill="#d9465f"/>' +
      '<path d="M12.6 22.4c1 1.5 2.2 2.6 3.4 3 1.2-.4 2.4-1.5 3.4-3" fill="#f6ece0"/>' +
      '<path d="M16 25.7v3.6" fill="none"/>' +
      '<path d="M12 14.6c.7-1.8 2-2.8 3.5-3.1" fill="none" stroke="#f4a7b4" stroke-width="1.6"/>',
  ),
  lettuce: plate(
    // A loose head: frilled outer leaves, a pale heart, veins.
    '<path d="M4.8 18.8c-1-5 1.9-8.6 5.8-9.3C11.8 6.4 14.7 4.8 17.8 5.6c3-.2 5.6 2.2 6.2 4.8 3.1 1.6 4.2 5.1 3.1 8.6-1.2 4-5.2 7.3-11.1 7.3S5.9 23 4.8 18.8z" fill="#74b444"/>' +
      '<path d="M9.4 18.6c-.4-3.8 2.4-6.8 6.6-6.8s7 3 6.6 6.8c-.4 3-3.2 4.8-6.6 4.8s-6.2-1.8-6.6-4.8z" fill="#c2e48a"/>' +
      '<path d="M16 23.2v-8.4M16 18.6l-3.2-2.3M16 18.6l3.2-2.3" fill="none" stroke="#5c9a35" stroke-width="1.1"/>' +
      '<path d="M7.6 13.4c1 .4 1.6 1.2 1.8 2.2M24.4 13.4c-1 .4-1.6 1.2-1.8 2.2" fill="none"/>',
  ),
  carrot: plate(
    // Fronds, then the root tapering to a point, with growth rings.
    '<path d="M16 10c-.6-3.2-2.6-5.6-5.4-6.6M16 10c0-3.2.8-5.8 2.6-7.4M16 10c1-2.6 3.4-4.4 6.2-4.6" fill="none" stroke="#4f8f3a" stroke-width="2"/>' +
      '<path d="M10.8 12c0-1.4 1.1-2.4 2.5-2.4h5.4c1.4 0 2.5 1 2.5 2.4l-4 16c-.3 1.3-2.1 1.3-2.4 0z" fill="#ee8a2b"/>' +
      '<path d="M12 15.4h2.8M17.4 18.8h2.2M13.2 21.8h2.4M15.4 25.2h1.4" fill="none" stroke="#b25c16" stroke-width="1.1"/>' +
      '<path d="M12.6 12.4c.2-.8.8-1.2 1.6-1.2" fill="none" stroke="#f9c27c" stroke-width="1.5"/>',
  ),
  beans: plate(
    // A curved pod with the beans swelling inside, its stalk and a leaf.
    '<path d="M8.2 7c-.5-1.8.2-3.6 1.8-4.6" fill="none"/>' +
      '<path d="M9.4 4.4c2.2-1.7 5.2-1.6 6.6.1-2 1.7-4.6 1.8-6.6-.1z" fill="#6aa84f"/>' +
      '<path d="M7.6 7.2c3 0 5 1.6 6.6 4.6s3.2 6.4 7 8.6c2.4 1.4 4.6 1.4 5.8.8-.4 2.8-3 4.4-6.8 4-4.6-.6-7.6-4.2-9.6-8.2S8.6 12 7 11.4c-1.2-1.4-.8-4.2.6-4.2z" fill="#4f9a3a"/>' +
      '<circle cx="10.6" cy="11.2" r="1.7" fill="#86c45f" stroke="none"/>' +
      '<circle cx="13.6" cy="15" r="1.8" fill="#86c45f" stroke="none"/>' +
      '<circle cx="16.8" cy="18.8" r="1.8" fill="#86c45f" stroke="none"/>' +
      '<circle cx="20.6" cy="21.8" r="1.7" fill="#86c45f" stroke="none"/>',
  ),
  strawberry: plate(
    // The berry, its pips, the green calyx on top, a highlight.
    '<path d="M16 11c5.2 0 9.2 2 9.2 6.6 0 5-4.6 10.6-9.2 11.6-4.6-1-9.2-6.6-9.2-11.6C6.8 13 10.8 11 16 11z" fill="#e0303f"/>' +
      '<g fill="#f7d34a" stroke="none"><ellipse cx="12" cy="16.6" rx=".7" ry="1"/><ellipse cx="16" cy="15.6" rx=".7" ry="1"/><ellipse cx="20" cy="16.6" rx=".7" ry="1"/><ellipse cx="13.8" cy="20.4" rx=".7" ry="1"/><ellipse cx="18.2" cy="20.4" rx=".7" ry="1"/><ellipse cx="16" cy="24" rx=".7" ry="1"/><ellipse cx="10.4" cy="19.8" rx=".6" ry=".9"/><ellipse cx="21.6" cy="19.8" rx=".6" ry=".9"/></g>' +
      '<path d="M16 12.4 10.4 9.8l3-.4-2.6-3 3.8 1.8L16 5l1.4 3.2 3.8-1.8-2.6 3 3 .4z" fill="#4f9a3a"/>' +
      '<path d="M10.4 15c.5-1.2 1.4-2 2.6-2.4" fill="none" stroke="#f58a94" stroke-width="1.5"/>',
  ),
  sunflower: plate(
    // Twelve petals round a seeded brown middle.
    '<g fill="#f4c22b">' +
      Array.from({ length: 12 }, (_, i) => `<ellipse cx="16" cy="7.4" rx="2.5" ry="4.6" transform="rotate(${i * 30} 16 16)"/>`).join('') +
      '</g>' +
      '<circle cx="16" cy="16" r="5.6" fill="#7a4a24"/>' +
      '<g fill="#4e2c14" stroke="none"><circle cx="14" cy="14.4" r=".8"/><circle cx="17.6" cy="14" r=".8"/><circle cx="16" cy="16.6" r=".8"/><circle cx="13.6" cy="17.8" r=".8"/><circle cx="18.4" cy="17.6" r=".8"/></g>',
  ),
  corn: plate(
    // The cob in its husks, a grid of kernels, silk at the top.
    '<path d="M16 4.4c-.6-1.4-1.6-2.4-3-2.8M16 4.4c.6-1.4 1.6-2.4 3-2.8" fill="none" stroke="#b5823a"/>' +
      '<path d="M16 4.4c3.2 0 5 3.6 5 9.6s-1.8 11-5 11-5-5-5-11 1.8-9.6 5-9.6z" fill="#f0d35a"/>' +
      '<path d="M11.4 10h9.2M11.1 13.6h9.8M11.2 17.2h9.6M11.8 20.8h8.4M16 5.2v19.6M13.5 6.4c-.7 4-.7 12 .2 17.2M18.5 6.4c.7 4 .7 12-.2 17.2" fill="none" stroke="#c9a43a" stroke-width=".9"/>' +
      '<path d="M16 28.6c-4.2-1-7.2-5.2-7.6-11.2 2 2.6 4 6.2 5.6 8.8z" fill="#6aa84f"/>' +
      '<path d="M16 28.6c4.2-1 7.2-5.2 7.6-11.2-2 2.6-4 6.2-5.6 8.8z" fill="#5a9442"/>',
  ),
  pumpkin: plate(
    // A squat ribbed pumpkin, its stalk and a curl of leaf.
    '<path d="M18.6 6.6c2-1.4 4.6-1.2 5.8.2-1.6 1.4-3.8 1.6-5.8-.2z" fill="#6aa84f"/>' +
      '<path d="M16 10.4c2-1.2 5-1.6 7.5-.4 3.2 1.5 4.5 5 4 9-.6 4.5-3.8 7.5-8 7.6-1.3.4-2.5.4-3.5.3-1 .1-2.2.1-3.5-.3-4.2-.1-7.4-3.1-8-7.6-.5-4 .8-7.5 4-9 2.5-1.2 5.5-.8 7.5.4z" fill="#e8772e"/>' +
      '<path d="M16 10.6c-2 3-2.4 12 0 16.2M16 10.6c2 3 2.4 12 0 16.2M10.6 11c-2.4 3.5-2.4 11 .4 15M21.4 11c2.4 3.5 2.4 11-.4 15" fill="none" stroke="#b5501a" stroke-width="1.1"/>' +
      '<path d="M15 10.8c0-2 .3-4 1.8-5.4l1.7.8c-1 1.4-1.3 3-1.3 4.6z" fill="#7a5a2a"/>' +
      '<path d="M7.4 15c.5-1.6 1.4-2.6 2.6-3.2" fill="none" stroke="#f6b27a" stroke-width="1.5"/>',
  ),
};

/** A crop's little plate, as inline SVG. */
export function cropArt(id: CropId): string {
  return ART[id];
}
