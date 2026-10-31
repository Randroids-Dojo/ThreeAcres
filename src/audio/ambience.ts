// The farm around the music: rain, wind, cicadas and crickets as loops, and
// birds, frogs, droplets and far thunder as one-shots at random times. Loops
// only run while they can be heard.

import type { Season, Weather } from '../sim/types';
import type { Bank, FxName } from './bank';
import { rand, smoothstep } from './dsp';
import type { Voices } from './voices';

export interface AmbParams {
  hour: number;
  season: Season;
  weather: Weather;
  scene: 'title' | 'farm' | 'menu';
}

class Loop {
  private src: AudioBufferSourceNode | null = null;
  private level = 0;
  private stopAt = 0;
  readonly g: GainNode;

  constructor(
    private ctx: BaseAudioContext,
    private bank: Bank,
    private name: FxName,
    dest: AudioNode,
    private rate = 1,
  ) {
    this.g = ctx.createGain();
    this.g.gain.value = 0;
    this.g.connect(dest);
  }

  set(level: number, now: number, tau = 1): void {
    if (Math.abs(level - this.level) < 0.002) return;
    if (level > 0.002 && !this.src) {
      const b = this.bank.get(this.name, 0);
      // Not built yet: leave the level alone so the next tick tries again.
      if (!b) return;
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.playbackRate.value = this.rate;
      s.connect(this.g);
      s.start(now, Math.random() * b.duration);
      this.src = s;
    }
    this.g.gain.setTargetAtTime(level, now, tau);
    this.stopAt = level <= 0.002 ? now + tau * 6 : 0;
    this.level = level;
  }

  tick(now: number): void {
    if (this.src && this.stopAt && now > this.stopAt) {
      this.src.stop();
      this.src.disconnect();
      this.src = null;
      this.stopAt = 0;
    }
  }

  get running(): boolean {
    return this.src !== null;
  }
}

interface Shot {
  rate: number;
  next: number;
}

export class Ambience {
  readonly out: GainNode;
  private rain: Loop;
  private rainTone: BiquadFilterNode;
  private wind: Loop;
  private crickets: Loop;
  private cicadas: Loop;
  private r = rand(4242);
  private p: AmbParams = { hour: 12, season: 0, weather: 'sun', scene: 'farm' };
  private shots: Record<'bird' | 'frog' | 'drop' | 'rumble', Shot> = {
    bird: { rate: 0, next: -1 },
    frog: { rate: 0, next: -1 },
    drop: { rate: 0, next: -1 },
    rumble: { rate: 0, next: -1 },
  };
  private targets = { rain: 0, wind: 0, crickets: 0, cicadas: 0 };
  /** One-shots played, for tests. */
  shotsPlayed = 0;

  constructor(
    private ctx: BaseAudioContext,
    private bank: Bank,
    private voices: Voices,
  ) {
    this.out = ctx.createGain();
    this.rainTone = ctx.createBiquadFilter();
    this.rainTone.type = 'lowpass';
    this.rainTone.frequency.value = 6000;
    this.rainTone.connect(this.out);
    this.rain = new Loop(ctx, bank, 'rain', this.rainTone);
    this.wind = new Loop(ctx, bank, 'wind', this.out);
    this.crickets = new Loop(ctx, bank, 'crickets', this.out);
    this.cicadas = new Loop(ctx, bank, 'cicadas', this.out);
  }

  set(p: AmbParams): void {
    this.p = p;
    const now = this.ctx.currentTime;
    const { hour: h, season, weather } = p;
    const wet = weather === 'rain' || weather === 'storm';
    const night = smoothstep(19, 21, h);
    const morning = smoothstep(5.5, 6.4, h) * (1 - smoothstep(9.5, 11, h));
    const scene = p.scene === 'title' ? 0.6 : p.scene === 'menu' ? 0.8 : 1;

    this.targets.rain = (weather === 'rain' ? 0.2 : weather === 'storm' ? 0.2 : 0) * scene;
    this.rainTone.frequency.setTargetAtTime(weather === 'storm' ? 2600 : 6000, now, 0.5);
    let wind = [0.025, 0.015, 0.09, 0.07][season];
    if (weather === 'cloud') wind += 0.03;
    if (weather === 'storm') wind = 0.12;
    this.targets.wind = wind * scene;
    this.targets.crickets = 0.075 * night * [0.5, 1, 0.8, 0][season] * (weather === 'storm' ? 0 : weather === 'rain' ? 0.4 : 1) * scene;
    const day = smoothstep(8, 10, h) * (1 - smoothstep(18.5, 20, h));
    const afternoon = smoothstep(11, 13, h) * (1 - smoothstep(18, 19.5, h));
    this.targets.cicadas = (weather === 'heat' ? 0.075 * day : season === 1 && weather === 'sun' ? 0.03 * afternoon : 0) * scene;

    const birdSeason = [1, 0.8, 0.5, 0.25][season];
    const birdWeather = weather === 'storm' ? 0 : wet ? 0.2 : 1;
    this.setRate('bird', (0.9 * morning + 0.12 * day) * birdSeason * birdWeather * (p.scene === 'title' ? 0.7 : 1));
    this.setRate('frog', 0.55 * night * [1, 0.8, 0.3, 0][season] * (wet ? 1.3 : 1) * (weather === 'storm' ? 0.4 : 1));
    this.setRate('drop', weather === 'rain' ? 5 : weather === 'storm' ? 7 : 0);
    this.setRate('rumble', weather === 'storm' ? 1 / 22 : 0);
    this.applyLoops(now);
  }

  private setRate(k: keyof Ambience['shots'], rate: number): void {
    const s = this.shots[k];
    if (rate <= 0.0001) {
      s.rate = 0;
      s.next = -1;
      return;
    }
    if (s.next < 0) s.next = this.ctx.currentTime + this.wait(rate) * 0.5;
    s.rate = rate;
  }

  private wait(rate: number): number {
    return -Math.log(1 - this.r() * 0.999) / rate;
  }

  private applyLoops(now: number): void {
    this.rain.set(this.targets.rain, now, 0.8);
    this.wind.set(this.targets.wind, now, 1.2);
    this.crickets.set(this.targets.crickets, now, 1.5);
    this.cicadas.set(this.targets.cicadas, now, 1.2);
  }

  /** Book one-shots up to `until` and stop silent loops. */
  tick(until: number): void {
    const now = this.ctx.currentTime;
    this.applyLoops(now);
    this.rain.tick(now);
    this.wind.tick(now);
    this.crickets.tick(now);
    this.cicadas.tick(now);
    for (const k of Object.keys(this.shots) as (keyof Ambience['shots'])[]) {
      const s = this.shots[k];
      if (s.rate <= 0) continue;
      let guard = 0;
      while (s.next < until && guard++ < 8) {
        if (s.next >= now - 0.05) this.shot(k, Math.max(s.next, now));
        s.next = Math.max(s.next, now - 0.05) + this.wait(s.rate);
      }
    }
  }

  private shot(k: keyof Ambience['shots'], t: number): void {
    const r = this.r;
    const pan = (r() * 2 - 1) * 0.8;
    if (k === 'bird') {
      const b = this.bank.get('bird', Math.floor(r() * 6));
      if (!b) return;
      const g = 0.05 + r() * 0.07;
      this.voices.play(b, this.out, t, { gain: g, rate: 0.92 + r() * 0.16, pan });
      // Often a bird answers itself.
      if (r() < 0.4) this.voices.play(b, this.out, t + b.duration + 0.15 + r() * 0.3, { gain: g * 0.8, rate: 0.95 + r() * 0.1, pan });
    } else if (k === 'frog') {
      const b = this.bank.get('frog', Math.floor(r() * 4));
      if (!b) return;
      this.voices.play(b, this.out, t, { gain: 0.05 + r() * 0.05, rate: 0.9 + r() * 0.2, pan });
    } else if (k === 'drop') {
      const b = this.bank.get('drop', Math.floor(r() * 4));
      if (!b) return;
      this.voices.play(b, this.out, t, { gain: 0.025 + r() * 0.05, rate: 0.8 + r() * 0.5, pan });
    } else {
      const b = this.bank.get('thunder', Math.floor(r() * 2));
      if (!b) return;
      this.voices.play(b, this.out, t, { gain: 0.1 + r() * 0.08, rate: 0.55 + r() * 0.1 });
    }
    this.shotsPlayed++;
  }

  /** Which loops are running, for the workbench. */
  loops(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.targets)) o[k] = v;
    return o;
  }

  get params(): AmbParams {
    return this.p;
  }
}
