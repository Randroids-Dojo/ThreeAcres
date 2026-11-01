// Round 2, P1: the keyboard could not pick a seed. Enter on a focused seed
// opened "Sleep now?", Space was blocked, the arrow keys walked the farmer,
// and Escape with the picker open opened the game switcher. Now, while a
// picker is open, the arrow keys choose in it (and never walk), number keys
// pick a card, Enter and Escape close it, and a button reached with Tab takes
// Enter and Space itself.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Input, type InputHost } from '../src/game/input';
import { pickerStep } from '../src/ui/hud';
import { PRESETS } from '../src/sim/presets';

type Listener = (e: unknown) => void;

/** Just enough of a browser for the input layer: windows, a stage, key events. */
function fakeBrowser() {
  const on: Record<string, Listener[]> = {};
  const target = () => ({ addEventListener: (t: string, f: Listener) => (on[t] ??= []).push(f), getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }) });
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, document: g.document };
  g.window = target();
  g.document = { ...target(), activeElement: null };
  const key = (code: string, tagName = 'CANVAS') => {
    let prevented = false;
    const e = { code, key: code, repeat: false, shiftKey: false, target: { tagName }, preventDefault: () => (prevented = true) };
    for (const f of on.keydown ?? []) f(e);
    return prevented;
  };
  const up = (code: string) => {
    for (const f of on.keyup ?? []) f({ code });
  };
  return { key, up, stage: target() as unknown as HTMLElement, restore: () => Object.assign(g, saved) };
}

describe('keys while a picker is open', () => {
  let b: ReturnType<typeof fakeBrowser>;
  beforeEach(() => (b = fakeBrowser()));
  afterEach(() => b.restore());

  function input(picking: () => boolean) {
    const heard: string[] = [];
    const host: InputHost = {
      rules: () => PRESETS.sunup.rules,
      pick: () => null,
      canPaint: () => false,
      hasJob: () => false,
      pan: () => undefined,
      zoom: () => undefined,
      // The game's own keys; the input layer must keep the arrows off the walk by itself while a picker is open.
      hotkey: (k) => {
        heard.push(k);
        return picking() && /^(Digit|Enter|Escape)/.test(k);
      },
      blocked: () => false,
      picking,
    };
    return { input: new Input(b.stage, host), heard };
  }

  it('the arrow keys choose in the picker and never walk the farmer', () => {
    let open = true;
    const { input: inp, heard } = input(() => open);
    expect(b.key('ArrowRight')).toBe(true);
    expect(heard).toContain('ArrowRight');
    const move = inp.collect(0.016).find((c) => c.type === 'move') as { x: number; y: number };
    expect(move.x).toBe(0);
    expect(move.y).toBe(0);
    // With the picker closed, the same key walks.
    b.up('ArrowRight');
    open = false;
    b.key('ArrowRight');
    const walk = inp.collect(0.016).find((c) => c.type === 'move') as { x: number; y: number };
    expect(walk.x).toBe(1);
  });

  it('Enter and Escape go to the game (the picker) first; on a button reached with Tab, Enter and Space press it', () => {
    const { heard } = input(() => true);
    b.key('Enter');
    b.key('Escape');
    expect(heard).toEqual(['Enter', 'Escape']);
    // A focused button: the browser presses it, the game hears nothing and Space does not act.
    expect(b.key('Enter', 'BUTTON')).toBe(false);
    expect(b.key('Space', 'BUTTON')).toBe(false);
    expect(heard).toEqual(['Enter', 'Escape']);
  });
});

describe('choosing a card with the keys', () => {
  // Seven seeds on two rows (a phone's picker); carrots and lettuce too late to sow.
  const cards = [
    { id: 'radish', ok: true, x: 50, y: 100 },
    { id: 'lettuce', ok: false, x: 140, y: 100 },
    { id: 'carrot', ok: false, x: 230, y: 100 },
    { id: 'beans', ok: true, x: 320, y: 100 },
    { id: 'strawberry', ok: true, x: 95, y: 190 },
    { id: 'sunflower', ok: true, x: 185, y: 190 },
    { id: 'corn', ok: true, x: 275, y: 190 },
  ];

  it('left and right step over what cannot be sown, and wrap round', () => {
    expect(pickerStep(cards, 'radish', 'ArrowRight')).toBe('beans');
    expect(pickerStep(cards, 'beans', 'ArrowLeft')).toBe('radish');
    expect(pickerStep(cards, 'radish', 'ArrowLeft')).toBe('corn');
    expect(pickerStep(cards, 'corn', 'ArrowRight')).toBe('radish');
  });

  it('up and down go to the nearest card on the next row', () => {
    expect(pickerStep(cards, 'radish', 'ArrowDown')).toBe('strawberry');
    expect(pickerStep(cards, 'corn', 'ArrowUp')).toBe('beans');
    expect(pickerStep(cards, 'sunflower', 'ArrowUp')).toBe('radish');
  });

  it('a number names a card by its place (a card that cannot be sown is still named, and says why)', () => {
    expect(pickerStep(cards, 'radish', 'Digit4')).toBe('beans');
    expect(pickerStep(cards, 'radish', 'Digit2')).toBe('lettuce');
    expect(pickerStep(cards, 'radish', 'Numpad7')).toBe('corn');
    expect(pickerStep(cards, 'radish', 'Digit9')).toBe(null);
    expect(pickerStep(cards, 'radish', 'KeyQ')).toBe(null);
  });
});
