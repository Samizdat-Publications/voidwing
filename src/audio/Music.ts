import type { AudioEngine } from './Audio';

export type MusicMode = 'off' | 'title' | 'combat' | 'boss' | 'victory' | 'defeat';

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

interface Chord {
  root: number;
  tones: number[];
}
// A minor: Am - F - C - G for combat; Am - Am - F - E (harmonic minor lift) for the carrier fight.
const COMBAT: Chord[] = [
  { root: 45, tones: [0, 3, 7] },
  { root: 41, tones: [0, 4, 7] },
  { root: 48, tones: [0, 4, 7] },
  { root: 43, tones: [0, 4, 7] },
];
const BOSS: Chord[] = [
  { root: 45, tones: [0, 3, 7] },
  { root: 45, tones: [0, 3, 7] },
  { root: 41, tones: [0, 4, 7] },
  { root: 40, tones: [0, 4, 7] },
];
const BASS_PATTERN = [0, 0, 12, 0, 0, 12, 0, 7];
const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 4, 3, 2, 1];
const LEAD = [12, -1, 15, -1, 19, 17, 15, -1, 12, -1, 10, 12, 15, -1, 14, -1];

type Layer = 'drums' | 'bass' | 'arp' | 'pad' | 'lead';
const MIX: Record<Exclude<MusicMode, 'off' | 'victory' | 'defeat'>, Record<Layer, number>> = {
  title: { drums: 0, bass: 0.35, arp: 0.35, pad: 0.8, lead: 0 },
  combat: { drums: 0.9, bass: 0.85, arp: 0.45, pad: 0.45, lead: 0 },
  boss: { drums: 1, bass: 0.95, arp: 0.5, pad: 0.5, lead: 0.45 },
};

/** A small synth band with a lookahead scheduler. */
export class Music {
  private mode: MusicMode = 'off';
  private readonly bpm = 128;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private layers: Record<Layer, GainNode> | null = null;
  private arpSend: GainNode | null = null;
  private duck: GainNode | null = null;

  constructor(private readonly audio: AudioEngine) {}

  get currentMode(): MusicMode {
    return this.mode;
  }

  private get spb(): number {
    return 60 / this.bpm / 4; // seconds per 16th
  }

  private build(): boolean {
    const ctx = this.audio.ctx;
    if (!ctx) return false;
    if (this.layers) return true;
    this.duck = ctx.createGain();
    this.duck.connect(this.audio.music);
    const mk = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.duck!);
      return g;
    };
    this.layers = { drums: mk(), bass: mk(), arp: mk(), pad: mk(), lead: mk() };
    // Dotted-eighth echo on the arpeggio.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = this.spb * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.arpSend = ctx.createGain();
    this.arpSend.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.layers.arp);
    return true;
  }

  setDucked(ducked: boolean): void {
    const ctx = this.audio.ctx;
    if (!ctx || !this.duck) return;
    this.duck.gain.setTargetAtTime(ducked ? 0.35 : 1, ctx.currentTime, 0.2);
  }

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    if (!this.build()) return;
    const ctx = this.audio.ctx!;
    const prev = this.mode;
    this.mode = mode;
    const t = ctx.currentTime;
    if (mode === 'victory' || mode === 'defeat') {
      for (const g of Object.values(this.layers!)) g.gain.setTargetAtTime(0, t, 0.25);
      if (mode === 'victory') this.victory(t + 0.3);
      else this.defeat(t + 0.2);
      // Settle into the quiet title bed afterwards.
      window.setTimeout(() => {
        if (this.mode === mode) {
          this.mode = 'off';
          this.setMode('title');
        }
      }, 4200);
      return;
    }
    if (mode === 'off') {
      for (const g of Object.values(this.layers!)) g.gain.setTargetAtTime(0, t, 0.3);
      return;
    }
    const mix = MIX[mode];
    for (const k of Object.keys(mix) as Layer[]) this.layers![k].gain.setTargetAtTime(mix[k], t, prev === 'off' ? 0.8 : 0.6);
    if (this.timer === null) {
      this.step = 0;
      this.nextTime = t + 0.1;
      this.timer = window.setInterval(() => this.tick(), 25);
    }
  }

  private tick(): void {
    const ctx = this.audio.ctx;
    if (!ctx || !this.layers) return;
    if (ctx.state !== 'running') {
      this.nextTime = ctx.currentTime + 0.05;
      return;
    }
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += this.spb;
      this.step++;
    }
  }

  private schedule(step: number, t: number): void {
    if (this.mode === 'off') return;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const boss = this.mode === 'boss';
    const prog = boss ? BOSS : COMBAT;
    const titleSlow = this.mode === 'title';
    const chord = prog[(titleSlow ? Math.floor(bar / 2) : bar) % 4];
    const L = this.layers!;
    // Drums.
    if (!titleSlow) {
      if (s % 4 === 0) this.kick(t, L.drums);
      if (boss && s === 14) this.kick(t, L.drums, 0.6);
      if (s === 4 || s === 12) this.snare(t, L.drums);
      if (s % 2 === 0 || boss) this.hat(t, L.drums, s === 6 || s === 14, boss && s % 2 === 1 ? 0.5 : 1);
    }
    // Bass on eighths (quarter notes in the title bed).
    if (s % (titleSlow ? 8 : 2) === 0) {
      const off = BASS_PATTERN[(s / 2) % 8];
      this.bass(t, chord.root - 12 + (titleSlow ? 0 : off), this.spb * (titleSlow ? 7 : 1.8), L.bass);
    }
    // Arpeggio on sixteenths (eighths in the title bed).
    if (!titleSlow || s % 2 === 0) {
      const idx = ARP_PATTERN[s];
      const tones = [...chord.tones, 12, chord.tones[1] + 12];
      this.arp(t, chord.root + 12 + tones[idx % tones.length], L.arp);
    }
    // Pad chord at the top of the bar (every other bar in the title bed).
    if (s === 0 && (!titleSlow || bar % 2 === 0)) {
      const dur = this.spb * 16 * (titleSlow ? 2 : 1);
      this.pad(t, chord.tones.map((i) => chord.root + 12 + i), dur, L.pad);
    }
    // Lead line in the carrier fight.
    if (boss && LEAD[s] >= 0 && bar % 2 === 1) this.lead(t, chord.root + 12 + LEAD[s], this.spb * 1.8, L.lead);
  }

  // ---- instruments ---------------------------------------------------------
  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private kick(t: number, out: GainNode, vol = 1): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    const g = ctx.createGain();
    this.env(g, t, 0.9 * vol, 0.003, 0.34);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noise(t: number, dur: number): AudioBufferSourceNode {
    const ctx = this.audio.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    src.loop = true;
    src.start(t, Math.random());
    src.stop(t + dur);
    return src;
  }

  private snare(t: number, out: GainNode): void {
    const ctx = this.audio.ctx!;
    const n = this.noise(t, 0.22);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    this.env(g, t, 0.45, 0.002, 0.18);
    n.connect(bp);
    bp.connect(g);
    g.connect(out);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 185;
    const og = ctx.createGain();
    this.env(og, t, 0.3, 0.002, 0.1);
    o.connect(og);
    og.connect(out);
    o.start(t);
    o.stop(t + 0.14);
  }

  private hat(t: number, out: GainNode, open: boolean, vol: number): void {
    const ctx = this.audio.ctx!;
    const dur = open ? 0.24 : 0.045;
    const n = this.noise(t, dur + 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7800;
    const g = ctx.createGain();
    this.env(g, t, (open ? 0.14 : 0.11) * vol, 0.002, dur);
    n.connect(hp);
    hp.connect(g);
    g.connect(out);
  }

  private bass(t: number, midi: number, dur: number, out: GainNode): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 7;
    lp.frequency.setValueAtTime(1500, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.34, 0.006, dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private arp(t: number, midi: number, out: GainNode): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = hz(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.Q.value = 3;
    const g = ctx.createGain();
    this.env(g, t, 0.09, 0.004, 0.14);
    o.connect(lp);
    lp.connect(g);
    g.connect(out);
    if (this.arpSend) g.connect(this.arpSend);
    o.start(t);
    o.stop(t + 0.2);
  }

  private pad(t: number, midis: number[], dur: number, out: GainNode): void {
    const ctx = this.audio.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 950;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.25);
    g.gain.setValueAtTime(0.07, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
    lp.connect(g);
    g.connect(out);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    g.connect(send);
    send.connect(this.audio.reverbSend);
    for (const m of midis) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(m);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur * 1.1);
      }
    }
  }

  private lead(t: number, midi: number, dur: number, out: GainNode): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = hz(midi) * 1.002;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2000;
    const g = ctx.createGain();
    this.env(g, t, 0.12, 0.01, dur);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(out);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private victory(t: number): void {
    const ctx = this.audio.ctx!;
    const out = this.duck!;
    const notes = [57, 61, 64, 69, 73, 76, 81];
    notes.forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(m);
      const g = ctx.createGain();
      this.env(g, t + i * 0.11, 0.18, 0.01, 1.4);
      o.connect(g);
      g.connect(out);
      o.start(t + i * 0.11);
      o.stop(t + i * 0.11 + 1.5);
    });
    this.pad(t + 0.6, [57, 61, 64, 69], 3.2, out);
    this.kick(t + 0.6, out, 0.8);
  }

  private defeat(t: number): void {
    const ctx = this.audio.ctx!;
    const out = this.duck!;
    [64, 60, 57, 52].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = ctx.createGain();
      this.env(g, t + i * 0.42, 0.12, 0.02, 0.9);
      o.connect(lp);
      lp.connect(g);
      g.connect(out);
      o.start(t + i * 0.42);
      o.stop(t + i * 0.42 + 1);
    });
    const drone = ctx.createOscillator();
    drone.frequency.value = hz(33);
    const dg = ctx.createGain();
    this.env(dg, t, 0.3, 0.4, 3.2);
    drone.connect(dg);
    dg.connect(out);
    drone.start(t);
    drone.stop(t + 3.8);
  }
}
