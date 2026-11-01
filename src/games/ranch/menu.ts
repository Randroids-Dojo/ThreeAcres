// Which hanging tag is chosen, and what the act button says. Render-free, so
// the rules can be tested: when a post's tags come down nothing is chosen
// (the playtest's first Buy spent 300 coins on a Silo that happened to sit
// under the crosshair), unless the lesson on screen is teaching one of them.
// On touch only a tap chooses, and a tap on the chosen tag (or the act
// button) takes it. With a mouse or a pad the crosshair chooses, but only once
// you have looked about yourself: the view turning to face the tags does not.

import type { MenuOption } from './sim';

export type PickDev = 'touch' | 'mouse' | 'pad';

/** Radians of your own looking after the tags come down before the crosshair may choose one. */
const LOOK_FIRST = 0.02;

export class TagChoice {
  /** The chosen tag, or -1 for none. */
  hot = -1;
  private dev: PickDev = 'mouse';
  private looked = 0;

  /** Tags just came down: nothing chosen, unless the lesson on screen teaches one of them. */
  open(opts: MenuOption[], dev: PickDev, lessonTag: string | null): void {
    this.dev = dev;
    this.looked = 0;
    this.hot = lessonTag ? opts.findIndex((o) => o.id === lessonTag) : -1;
  }

  /** The device changed while the tags were down. */
  setDev(dev: PickDev): void {
    this.dev = dev;
  }

  /** Each frame: the tag under the crosshair (-1 for none) and how far you turned the view by hand. */
  aim(under: number, turned: number): void {
    if (this.dev === 'touch') return;
    this.looked += turned;
    if (this.looked < LOOK_FIRST) return;
    this.hot = under;
  }

  /** A tap or click on tag i (-1: on nothing). Returns true when the tag should be taken now. */
  tap(i: number): boolean {
    if (i < 0) return false;
    // A mouse click lands where it is meant: it takes the tag at once.
    if (this.dev !== 'touch') {
      this.hot = i;
      return true;
    }
    // A thumb chooses first; a second tap on the chosen tag takes it.
    if (this.hot === i) return true;
    this.hot = i;
    return false;
  }

  /** The act button (or E, X, Enter): take the chosen tag; with nothing chosen, on touch it only nudges the tags. A note-only tag closes them. */
  press(opts: MenuOption[]): 'take' | 'nudge' | 'close' {
    const o = this.hot >= 0 ? opts[this.hot] : null;
    if (o) return o.id === 'info' ? 'close' : 'take';
    return this.dev === 'touch' ? 'nudge' : 'close';
  }

  /** What the act button (or the prompt) says. */
  label(opts: MenuOption[]): string {
    const o = this.hot >= 0 ? opts[this.hot] : null;
    if (!o) return this.dev === 'touch' ? 'Tap a tag' : 'Look at a tag';
    if (o.id === 'sleep') return 'Sleep';
    if (o.id.startsWith('silo:')) return 'Pull these';
    if (o.price !== null) return 'Buy';
    if (o.id === 'garden:clear') return 'Pull it';
    return o.id === 'info' ? 'Close' : 'Use';
  }
}
