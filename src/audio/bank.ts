// Every sound in the game, built at startup into AudioBuffers from the recipes
// in recipes.ts. No sample files. The work runs in a worker where one is
// available, else in small slices on the main thread; anything asked for
// before its buffer exists is simply skipped.

import { SR, mtof } from './dsp';
import { JOBS, runJob } from './recipes';
import type { FxName, InstName } from './recipes';

export type { FxName, InstName } from './recipes';

interface Sample {
  centre: number;
  f0: number;
  buf: AudioBuffer;
}

function toBuffer(chans: Float32Array<ArrayBuffer>[]): AudioBuffer {
  const b = new AudioBuffer({ length: chans[0].length, numberOfChannels: chans.length, sampleRate: SR });
  chans.forEach((c, i) => b.copyToChannel(c, i));
  return b;
}

export class Bank {
  private inst = new Map<InstName, Sample[]>();
  private fx = new Map<FxName, AudioBuffer[]>();
  private built: boolean[] = JOBS.map(() => false);
  private next = 0;
  readonly total = JOBS.length;
  done = 0;
  /** Main-thread milliseconds spent synthesizing, for the workbench. */
  spent = 0;
  /** Where the work happened: 'worker', 'main' or 'none' yet. */
  where: 'worker' | 'main' | 'none' = 'none';
  private timer = 0;
  private worker: Worker | null = null;

  get ready(): boolean {
    return this.done >= this.total;
  }

  private accept(i: number, chans: Float32Array<ArrayBuffer>[], f0: number): void {
    if (this.built[i]) return;
    this.built[i] = true;
    this.done++;
    const j = JOBS[i];
    const buf = toBuffer(chans);
    if (j.type === 'inst') {
      const list = this.inst.get(j.name) ?? [];
      list.push({ centre: j.centre, f0, buf });
      list.sort((a, b) => a.centre - b.centre);
      this.inst.set(j.name, list);
    } else {
      const list = this.fx.get(j.name) ?? [];
      list[j.k] = buf;
      this.fx.set(j.name, list);
    }
  }

  /** Run jobs here for up to `ms` milliseconds. Returns true when everything is built. */
  work(ms: number): boolean {
    const t0 = performance.now();
    while (this.next < JOBS.length && performance.now() - t0 < ms) {
      const i = this.next++;
      if (this.built[i]) continue;
      const { chans, f0 } = runJob(JOBS[i]);
      this.accept(i, chans, f0);
    }
    this.spent += performance.now() - t0;
    return this.ready;
  }

  /** Build everything now. Tests and offline renders use this. */
  finish(): void {
    this.work(Infinity);
  }

  /** Keep building in the background: in a worker if possible, else in short slices. */
  background(sliceMs = 6): void {
    if (this.timer || this.worker || this.ready) return;
    try {
      const w = new Worker(new URL('./synth.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ i: number; chans: Float32Array<ArrayBuffer>[]; f0: number } | { done: true }>) => {
        const m = e.data;
        if ('done' in m) {
          w.terminate();
          this.worker = null;
          return;
        }
        this.accept(m.i, m.chans, m.f0);
      };
      w.onerror = () => {
        w.terminate();
        this.worker = null;
        this.slices(sliceMs);
      };
      this.worker = w;
      this.where = 'worker';
    } catch {
      this.slices(sliceMs);
    }
  }

  private slices(sliceMs: number): void {
    this.where = 'main';
    const run = () => {
      this.timer = 0;
      if (!this.work(sliceMs)) this.timer = window.setTimeout(run, 4);
    };
    this.timer = window.setTimeout(run, 0);
  }

  /** The nearest sample and the playback rate that lands it on `midi`. */
  note(name: InstName, midi: number): { buf: AudioBuffer; rate: number } | null {
    const list = this.inst.get(name);
    if (!list || !list.length) return null;
    let best = list[0];
    for (const s of list) if (Math.abs(s.centre - midi) < Math.abs(best.centre - midi)) best = s;
    return { buf: best.buf, rate: mtof(midi) / best.f0 };
  }

  get(name: FxName, variant = -1): AudioBuffer | null {
    const list = this.fx.get(name)?.filter(Boolean);
    if (!list || !list.length) return null;
    const k = variant < 0 ? Math.floor(Math.random() * list.length) : variant % list.length;
    return list[k];
  }

  count(name: FxName): number {
    return this.fx.get(name)?.filter(Boolean).length ?? 0;
  }

  /** Bytes held in buffers, for the workbench. */
  bytes(): number {
    let n = 0;
    for (const l of this.inst.values()) for (const s of l) n += s.buf.length * s.buf.numberOfChannels * 4;
    for (const l of this.fx.values()) for (const b of l) if (b) n += b.length * b.numberOfChannels * 4;
    return n;
  }
}
