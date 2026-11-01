// Inline line icons, drawn on a 24 grid with a slightly loose hand.

const wrap = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  hands: wrap('<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.6 0-4-1.4-5.4-3.6L4 13.6a1.4 1.4 0 0 1 2.3-1.5L8 14"/>'),
  hoe: wrap('<path d="M4 20 15.5 8.5"/><path d="M13.5 4.5 19.5 10.5"/><path d="M13.5 4.5c1.6-1.2 3.6-1.3 5 .2 1.5 1.4 1.4 3.4.2 5.1"/>'),
  can: wrap('<path d="M5 9h10v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M15 11l5-4"/><path d="M19 5.5l1.8 1.3"/><path d="M8 9V6.5a2 2 0 0 1 4 0V9"/><path d="M21 9.5v1M22 12v1M20 12.5v1"/>'),
  seeds: wrap('<path d="M6 4h12v16H6z"/><path d="M6 8h12"/><path d="M12 17c-2.2 0-3-1.6-3-3 1.8 0 3 .9 3 3zm0 0c2.2 0 3-1.6 3-3-1.8 0-3 .9-3 3zm0 0v-5"/>'),
  // A hammer: its head across the handle, the claw curling off the back (the old drawing read as a pencil).
  build: wrap('<path d="M13.2 10.8 5 19"/><path d="M9.8 7.4l3.5-3.5 6.8 6.8-3.5 3.5z"/><path d="M17.4 4.6c1.6.2 2.6 1.2 2.9 2.9"/>'),
  smart: wrap('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M12 8.5l1.2 2.3 2.3 1.2-2.3 1.2L12 15.5l-1.2-2.3L8.5 12l2.3-1.2z"/>'),
  sun: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  cloud: wrap('<path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18z"/>'),
  rain: wrap('<path d="M7 14h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.3A2.9 2.9 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>'),
  storm: wrap('<path d="M7 13h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.3A2.9 2.9 0 0 0 7 13z"/><path d="M12.5 14l-2 3.5h3l-2 3.5"/>'),
  heat: wrap('<circle cx="12" cy="9" r="3.5"/><path d="M12 2.5v1.5M5.5 9H4M20 9h-1.5M7.4 4.4l1 1M16.6 4.4l-1 1"/><path d="M5 16c1.5-1 2.5 1 4 0s2.5 1 4 0 2.5 1 4 0M5 20c1.5-1 2.5 1 4 0s2.5 1 4 0 2.5 1 4 0"/>'),
  coin: wrap('<ellipse cx="12" cy="12" rx="8" ry="8"/><path d="M12 7.5v9M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.2 0-2.1-.5-2.6-1.5"/>'),
  moon: wrap('<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>'),
  mixer: wrap('<path d="M5 4v16M12 4v16M19 4v16"/><rect x="3" y="13" width="4" height="3" rx="1"/><rect x="10" y="7" width="4" height="3" rx="1"/><rect x="17" y="11" width="4" height="3" rx="1"/>'),
  board: wrap('<rect x="4" y="5" width="16" height="12" rx="1.5"/><path d="M8 21l1.5-4M16 21l-1.5-4"/><path d="M8 9h5M8 12h8"/><circle cx="16.5" cy="8.5" r="1"/>'),
  gear: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
  pause: wrap('<path d="M9 6v12M15 6v12"/>'),
  play: wrap('<path d="M8 5.5v13l10-6.5z"/>'),
  fast: wrap('<path d="M4 6.5v11l7.5-5.5zM12.5 6.5v11l7.5-5.5z"/>'),
  close: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  star: wrap('<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  starFill: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>`,
  sprinkler: wrap('<path d="M12 21v-8"/><path d="M9 13h6"/><path d="M12 10c-3-3-6-3-8-2M12 10c3-3 6-3 8-2M12 10V5"/>'),
  scarecrow: wrap('<circle cx="12" cy="6" r="2.5"/><path d="M8.5 4.2h7"/><path d="M12 8.5V21M5 11h14M9 21l3-5 3 5"/>'),
  drop: wrap('<path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z"/>'),
  leaf: wrap('<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/>'),
  notes: wrap('<path d="M6 3.5h9l3 3V20.5H6z"/><path d="M9 10h6M9 13.5h6M9 17h4"/>'),
  copy: wrap('<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  person: wrap('<circle cx="12" cy="7" r="3.2"/><path d="M5.5 20.5c.8-4 3.4-6 6.5-6s5.7 2 6.5 6"/>'),
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  view: wrap('<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><rect x="9" y="9.5" width="6" height="5" rx="1"/>'),
  games: wrap('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M17 13.5v7M13.5 17h7"/>'),
} as const;

export type IconId = keyof typeof ICONS;

export function icon(id: IconId): string {
  return ICONS[id];
}
