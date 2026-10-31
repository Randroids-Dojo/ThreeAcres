// A small timeline: callbacks at times and tweens over spans, advanced by the
// table's frame loop at the scoring speed. finish() runs everything left in
// order with every tween at its end, so a skipped night lands exactly where a
// watched one would.

interface Cue {
  at: number;
  fn: () => void;
}

interface Tween {
  at: number;
  dur: number;
  fn: (k: number) => void;
}

export class Seq {
  t = 0;
  private cues: Cue[] = [];
  private tweens: Tween[] = [];
  private onDone: (() => void) | null = null;
  done = false;

  at(t: number, fn: () => void): this {
    this.cues.push({ at: t, fn });
    return this;
  }

  tween(t: number, dur: number, fn: (k: number) => void): this {
    this.tweens.push({ at: t, dur: Math.max(1e-4, dur), fn });
    return this;
  }

  then(fn: () => void): this {
    this.onDone = fn;
    return this;
  }

  /** The time the last thing ends. */
  get end(): number {
    let e = 0;
    for (const c of this.cues) e = Math.max(e, c.at);
    for (const w of this.tweens) e = Math.max(e, w.at + w.dur);
    return e;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    this.step(this.t);
    if (this.t >= this.end) this.finish();
  }

  private step(t: number): void {
    // Cues and tween endings in time order (a cue may add more), then tweens in flight.
    for (;;) {
      let cue: Cue | null = null;
      for (const c of this.cues) if (c.at <= t && (!cue || c.at < cue.at)) cue = c;
      let tw: Tween | null = null;
      for (const w of this.tweens) {
        const e = w.at + w.dur;
        if (e <= t && (!tw || e < tw.at + tw.dur)) tw = w;
      }
      if (tw && (!cue || tw.at + tw.dur <= cue.at)) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.fn(1);
        continue;
      }
      if (!cue) break;
      this.cues.splice(this.cues.indexOf(cue), 1);
      cue.fn();
    }
    for (const w of this.tweens) if (t >= w.at) w.fn(Math.min(1, (t - w.at) / w.dur));
  }

  finish(): void {
    if (this.done) return;
    // Interleave so state lands as it would have: everything up to each cue, in order.
    this.step(Number.POSITIVE_INFINITY);
    this.done = true;
    const f = this.onDone;
    this.onDone = null;
    f?.();
  }
}

export const ease = {
  out: (k: number) => 1 - (1 - k) * (1 - k),
  inOut: (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  back: (k: number) => {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
  },
  pop: (k: number) => Math.sin(Math.PI * k) * (1 - k * 0.3),
};
