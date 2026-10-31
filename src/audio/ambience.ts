// The world around the music: rain, wind, cicadas and crickets as loops, and
// birds, frogs, droplets and far thunder as one-shots at random times. The
// ranch's valley adds wind in long grass and meadow insects by day, and owls
// at night. Weather sounds in every game. Loops only run while they can be
// heard.

import type { Season, Weather } from '../sim/types';
import type { Bank, FxName } from './bank';
import { rand, smoothstep } from './dsp';
import type { GameId } from './music';
import type { Voices } from './voices';

export interface AmbParams {
  hour: number;
  season: Season;
  weather: Weather;
  scene: 'title' | 'farm' | 'menu';
  game: GameId;
}

/** 0 by day, 1 at night, for an hour from 0 to 24: dusk from 18.5 to 20.5, dawn from 4.5 to 6.5. */
export function darkness(h: number): number {
  return h >= 12 ? smoothstep(18.5, 20.5, h) : 1 - smoothstep(4.5, 6.5, h);
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
  private grass: Loop;
  private insects: Loop;
  /** Far things: birds across the ranch's valley sound duller. */
  private distant: BiquadFilterNode;
  private r = rand(4242);
  private p: AmbParams = { hour: 12, season: 0, weather: 'sun', scene: 'farm', game: 'homestead' };
  private shots: Record<'bird' | 'frog' | 'drop' | 'rumble' | 'owl', Shot> = {
    bird: { rate: 0, next: -1 },
    frog: { rate: 0, next: -1 },
    drop: { rate: 0, next: -1 },
    rumble: { rate: 0, next: -1 },
    owl: { rate: 0, next: -1 },
  };
  private targets = { rain: 0, wind: 0, crickets: 0, cicadas: 0, grass: 0, insects: 0 };
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
    this.grass = new Loop(ctx, bank, 'grass', this.out);
    this.insects = new Loop(ctx, bank, 'insects', this.out);
    this.distant = ctx.createBiquadFilter();
    this.distant.type = 'lowpass';
    this.distant.frequency.value = 5200;
    this.distant.Q.value = 0.5;
    this.distant.connect(this.out);
  }

  set(p: AmbParams): void {
    this.p = p;
    if (p.game === 'ranch') return this.setRanch(p);
    const now = this.ctx.currentTime;
    const { hour: h, season, weather } = p;
    const wet = weather === 'rain' || weather === 'storm';
    const night = smoothstep(19, 21, h);
    const morning = smoothstep(5.5, 6.4, h) * (1 - smoothstep(9.5, 11, h));
    // Seedbound is played at a table: the weather is outside, a little further off.
    const scene = (p.scene === 'title' ? 0.6 : p.scene === 'menu' ? 0.8 : 1) * (p.game === 'deck' ? 0.7 : 1);

    this.targets.grass = 0;
    this.targets.insects = 0;
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
    this.setRate('owl', 0);
    this.applyLoops(now);
  }

  /** Thistledown's valley: wind in long grass, meadow insects and far birds by day; crickets and owls at night. */
  private setRanch(p: AmbParams): void {
    const now = this.ctx.currentTime;
    const { hour: h, season, weather } = p;
    const wet = weather === 'rain' || weather === 'storm';
    const storm = weather === 'storm';
    const night = darkness(h);
    const day = 1 - night;
    const morning = smoothstep(5, 6.2, h) * (1 - smoothstep(8.5, 10, h));
    const scene = p.scene === 'menu' ? 0.8 : 1;
    this.targets.rain = (wet ? 0.2 : 0) * scene;
    this.rainTone.frequency.setTargetAtTime(storm ? 2600 : 6000, now, 0.5);
    let wind = [0.05, 0.035, 0.08, 0.075][season] + (weather === 'cloud' ? 0.02 : 0);
    if (storm) wind = 0.12;
    this.targets.wind = wind * scene;
    this.targets.grass = 0.06 * [1, 1, 1.25, 0.6][season] * (storm ? 1.4 : 1) * (0.75 + 0.25 * day) * scene;
    this.targets.insects = 0.045 * day * smoothstep(8, 10, h) * [0.7, 1, 0.6, 0][season] * (wet ? 0.15 : 1) * scene;
    this.targets.crickets = 0.08 * night * [0.6, 1, 0.8, 0.1][season] * (storm ? 0 : wet ? 0.4 : 1) * scene;
    this.targets.cicadas = (weather === 'heat' ? 0.05 * day : 0) * scene;
    const birdWeather = storm ? 0 : wet ? 0.2 : 1;
    this.setRate('bird', (0.7 * morning + 0.18 * day) * [1, 0.8, 0.5, 0.25][season] * birdWeather);
    this.setRate('owl', (night / 11) * (storm ? 0 : wet ? 0.3 : 1) * [0.8, 1, 1, 0.8][season]);
    this.setRate('frog', 0);
    this.setRate('drop', weather === 'rain' ? 5 : storm ? 7 : 0);
    this.setRate('rumble', storm ? 1 / 22 : 0);
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
    this.grass.set(this.targets.grass, now, 1.2);
    this.insects.set(this.targets.insects, now, 1.5);
  }

  /** Book one-shots up to `until` and stop silent loops. */
  tick(until: number): void {
    const now = this.ctx.currentTime;
    this.applyLoops(now);
    this.rain.tick(now);
    this.wind.tick(now);
    this.crickets.tick(now);
    this.cicadas.tick(now);
    this.grass.tick(now);
    this.insects.tick(now);
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
      const far = this.p.game === 'ranch';
      const dest = far ? this.distant : this.out;
      const g = (0.05 + r() * 0.07) * (far ? 0.6 : 1);
      this.voices.play(b, dest, t, { gain: g, rate: 0.92 + r() * 0.16, pan });
      // Often a bird answers itself.
      if (r() < 0.4) this.voices.play(b, dest, t + b.duration + 0.15 + r() * 0.3, { gain: g * 0.8, rate: 0.95 + r() * 0.1, pan });
    } else if (k === 'owl') {
      const b = this.bank.get('owl', Math.floor(r() * 2));
      if (!b) return;
      this.voices.play(b, this.distant, t, { gain: 0.06 + r() * 0.04, rate: 0.94 + r() * 0.12, pan });
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
