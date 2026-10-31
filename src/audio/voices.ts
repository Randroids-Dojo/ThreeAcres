// One-shot and looping buffer voices. Each voice is a source and a gain (and a
// panner only when it needs one). Envelopes use setTargetAtTime so a later
// release can always take over without cancelling anything.

export interface PlayOpts {
  gain: number;
  rate?: number;
  /** Sounding time before the release starts. Defaults to the buffer's own length. */
  dur?: number;
  /** Release time constant x4, seconds. */
  release?: number;
  /** Attack time, seconds. 0 starts at full level. */
  attack?: number;
  pan?: number;
  loop?: boolean;
  /** Start slightly off pitch and slide in, as a multiplier of rate. */
  slide?: number;
  /** Seconds into the buffer to start from. */
  offset?: number;
}

export interface Voice {
  src: AudioBufferSourceNode;
  g: GainNode;
  end: number;
}

export class Voices {
  /** Voices started and not yet ended. */
  live = 0;
  started = 0;
  /** Most voices alive at once. */
  maxLive = 0;

  constructor(private ctx: BaseAudioContext) {}

  play(b: AudioBuffer, dest: AudioNode, t: number, o: PlayOpts): Voice {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = b;
    const rate = o.rate ?? 1;
    if (o.slide) {
      src.playbackRate.setValueAtTime(rate * o.slide, t);
      src.playbackRate.linearRampToValueAtTime(rate, t + 0.07);
    } else if (rate !== 1) {
      src.playbackRate.value = rate;
    }
    if (o.loop) src.loop = true;
    const g = ctx.createGain();
    const a = o.attack ?? 0;
    if (a > 0) {
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t);
      g.gain.setTargetAtTime(o.gain, t, a / 3);
    } else {
      g.gain.value = o.gain;
    }
    const natural = o.loop ? Infinity : (b.duration - (o.offset ?? 0)) / rate;
    let end = t + natural;
    if (o.dur !== undefined && o.dur < natural) {
      const rel = o.release ?? 0.08;
      g.gain.setTargetAtTime(0, t + o.dur, rel / 4);
      // Six time constants: the level is under -50 dB when the source stops.
      end = t + o.dur + rel * 1.5;
    }
    src.connect(g);
    let p: StereoPannerNode | null = null;
    if (o.pan) {
      p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p);
      p.connect(dest);
    } else {
      g.connect(dest);
    }
    src.start(t, o.offset ?? 0);
    if (Number.isFinite(end)) src.stop(end + 0.02);
    this.live++;
    this.started++;
    if (this.live > this.maxLive) this.maxLive = this.live;
    src.onended = () => {
      this.live--;
      g.disconnect();
      p?.disconnect();
    };
    return { src, g, end };
  }

  /** Fade a voice out from time `at` and stop it. Safe to call more than once. */
  release(v: Voice, at: number, tau = 0.3): void {
    const t = Math.max(at, this.ctx.currentTime);
    if (t >= v.end) return;
    v.g.gain.setTargetAtTime(0, t, tau);
    v.end = t + tau * 7;
    v.src.stop(v.end);
  }
}
