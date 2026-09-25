/**
 * Every sound in VOID WING is synthesised here with the Web Audio API: no sample files.
 * The context is created on the first user gesture (browser autoplay rules).
 */
export type LaserKind = 'player' | 'wing' | 'enemy' | 'heavy' | 'flak';
export type AlarmKind = 'missile' | 'hull';

export class AudioEngine {
  ctx: AudioContext | null = null;
  enabled = true;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  reverbSend!: GainNode;
  private comp!: DynamicsCompressorNode;
  /** Shared 2 s white-noise buffer (also used by the music drums). */
  noise!: AudioBuffer;
  private analyser: AnalyserNode | null = null;
  private meterBuf: Float32Array | null = null;

  /** RMS of the current master output (0 when silent or not started). */
  level(): number {
    if (!this.analyser) return 0;
    this.meterBuf ??= new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.meterBuf as Float32Array<ArrayBuffer>);
    let s = 0;
    for (let i = 0; i < this.meterBuf.length; i++) s += this.meterBuf[i] * this.meterBuf[i];
    return Math.sqrt(s / this.meterBuf.length);
  }
  private readonly voices = new Map<string, number[]>();
  readonly volume = { master: 0.8, sfx: 0.85, music: 0.55 };
  // Continuous sounds.
  private engineNodes: { osc1: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private boostNodes: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private lockSolid: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
  private alarmTimers: Partial<Record<AlarmKind, number>> = {};
  private alarmPhase = 0;

  /** Create or resume the audio context; call from a user gesture. */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    else if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private init(): void {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      this.enabled = false;
      return;
    }
    const ctx = new Ctx();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.comp);
    this.music.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);
    // Level meter (used by the automated playtest to prove sound is actually produced).
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.master.connect(this.analyser);
    // Procedural reverb: decaying stereo noise impulse.
    const conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    conv.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(conv);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    conv.connect(wet);
    wet.connect(this.comp);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volume.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volume.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(this.volume.music, t, 0.05);
  }

  setMuted(muted: boolean): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : this.volume.master, this.ctx.currentTime, 0.05);
  }

  /** Voice limiter: at most `max` overlapping instances of a sound. */
  private allow(key: string, max: number, dur: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const list = (this.voices.get(key) ?? []).filter((e) => e > now);
    if (list.length >= max) {
      this.voices.set(key, list);
      return false;
    }
    list.push(now + dur);
    this.voices.set(key, list);
    return true;
  }

  private out(pan: number, gain: number, reverb = 0): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(this.sfx);
    if (reverb > 0) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      p.connect(s);
      s.connect(this.reverbSend);
    }
    return g;
  }

  private noiseSrc(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    return src;
  }

  private stopLater(nodes: (AudioScheduledSourceNode | null)[], t: number): void {
    for (const n of nodes) {
      if (!n) continue;
      try {
        n.stop(t);
      } catch {
        /* already stopped */
      }
    }
  }

  // ------------------------------------------------------------------ weapons
  laser(kind: LaserKind, pan = 0, gain = 1): void {
    if (!this.ctx || gain < 0.02) return;
    const key = kind === 'player' ? 'laserP' : `laser_${kind}`;
    if (!this.allow(key, kind === 'player' ? 6 : 10, 0.14)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const cfg = {
      player: { f0: 1500, f1: 240, type: 'square' as OscillatorType, dur: 0.11, vol: 0.2 },
      wing: { f0: 1250, f1: 260, type: 'square' as OscillatorType, dur: 0.1, vol: 0.1 },
      enemy: { f0: 950, f1: 170, type: 'sawtooth' as OscillatorType, dur: 0.13, vol: 0.16 },
      heavy: { f0: 420, f1: 70, type: 'sawtooth' as OscillatorType, dur: 0.3, vol: 0.3 },
      flak: { f0: 700, f1: 120, type: 'triangle' as OscillatorType, dur: 0.16, vol: 0.18 },
    }[kind];
    const o = this.out(pan, gain * cfg.vol, kind === 'heavy' ? 0.3 : 0.08);
    const osc = ctx.createOscillator();
    osc.type = cfg.type;
    osc.frequency.setValueAtTime(cfg.f0 * (0.97 + Math.random() * 0.06), t);
    osc.frequency.exponentialRampToValueAtTime(cfg.f1, t + cfg.dur);
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(cfg.f0 * 0.5, t);
    osc2.frequency.exponentialRampToValueAtTime(cfg.f1 * 0.5, t + cfg.dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5000, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + cfg.dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + cfg.dur);
    osc.connect(lp);
    osc2.connect(lp);
    lp.connect(env);
    env.connect(o);
    osc.start(t);
    osc2.start(t);
    this.stopLater([osc, osc2], t + cfg.dur + 0.02);
    if (kind === 'heavy' || kind === 'flak') {
      // Low body thump for the heavy guns.
      const th = ctx.createOscillator();
      th.frequency.setValueAtTime(140, t);
      th.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.7, t);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      th.connect(tg);
      tg.connect(o);
      th.start(t);
      th.stop(t + 0.27);
    }
  }

  missileLaunch(pan = 0, gain = 1): void {
    if (!this.ctx || !this.allow('missile', 4, 0.8)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = this.out(pan, 0.45 * gain, 0.25);
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    n.connect(bp);
    bp.connect(g);
    g.connect(o);
    n.start(t);
    n.stop(t + 0.9);
    const th = ctx.createOscillator();
    th.frequency.setValueAtTime(110, t);
    th.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.9, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    th.connect(tg);
    tg.connect(o);
    th.start(t);
    th.stop(t + 0.25);
  }

  /** Rising lock-on beep (call as the lock builds). */
  lockBeep(progress: number): void {
    if (!this.ctx || !this.allow('lockbeep', 1, 0.07)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = this.out(0, 0.12);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 900 + progress * 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g);
    g.connect(o);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  /** Solid tone while a missile lock is held. */
  setLockSolid(on: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.lockSolid) {
      const o = this.out(0, 1);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 1760;
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = 880;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3500;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.055, ctx.currentTime, 0.01);
      osc.connect(lp);
      osc2.connect(lp);
      lp.connect(gain);
      gain.connect(o);
      osc.start();
      osc2.start();
      this.lockSolid = { osc, osc2, gain };
    } else if (!on && this.lockSolid) {
      const { osc, osc2, gain } = this.lockSolid;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
      this.stopLater([osc, osc2], ctx.currentTime + 0.1);
      this.lockSolid = null;
    }
  }

  // ------------------------------------------------------------------ impacts
  explosion(size: number, pan = 0, gain = 1): void {
    if (!this.ctx || gain < 0.02) return;
    if (!this.allow('explosion', 6, 1)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = Math.min(4.5, 0.9 + size * 0.45);
    const o = this.out(pan, Math.min(1.2, 0.55 + size * 0.08) * gain, 0.45);
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600 + size * 200, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(lp);
    lp.connect(g);
    g.connect(o);
    n.start(t);
    n.stop(t + dur + 0.05);
    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(90, t);
    sub.frequency.exponentialRampToValueAtTime(24, t + dur * 0.7);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(1.1, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8);
    sub.connect(sg);
    sg.connect(o);
    sub.start(t);
    sub.stop(t + dur);
    // Crackle tail for the big ones.
    const crackles = Math.min(10, Math.floor(size * 2));
    for (let i = 0; i < crackles; i++) {
      const ct = t + 0.1 + Math.random() * dur * 0.6;
      const cn = this.noiseSrc();
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 800 + Math.random() * 2000;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, ct);
      cg.gain.exponentialRampToValueAtTime(0.5, ct + 0.005);
      cg.gain.exponentialRampToValueAtTime(0.0001, ct + 0.08);
      cn.connect(hp);
      hp.connect(cg);
      cg.connect(o);
      cn.start(ct);
      cn.stop(ct + 0.1);
    }
  }

  shieldHit(pan = 0, gain = 1): void {
    if (!this.ctx || !this.allow('shield', 3, 0.2)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = this.out(pan, 0.3 * gain, 0.15);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1900, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.8, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g);
    g.connect(o);
    osc.start(t);
    osc.stop(t + 0.22);
    const n = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(o);
    n.start(t);
    n.stop(t + 0.1);
  }

  hullHit(pan = 0, gain = 1): void {
    if (!this.ctx || !this.allow('hull', 3, 0.3)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = this.out(pan, 0.38 * gain, 0.2);
    // FM clang.
    const car = ctx.createOscillator();
    car.frequency.value = 180 + Math.random() * 60;
    const mod = ctx.createOscillator();
    mod.frequency.value = car.frequency.value * 1.41;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(600, t);
    mg.gain.exponentialRampToValueAtTime(5, t + 0.3);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    car.connect(g);
    g.connect(o);
    car.start(t);
    mod.start(t);
    this.stopLater([car, mod], t + 0.35);
  }

  asteroidBreak(size: number, pan = 0, gain = 1): void {
    if (!this.ctx || gain < 0.03 || !this.allow('rock', 4, 0.7)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = this.out(pan, Math.min(0.9, 0.3 + size * 0.01) * gain, 0.3);
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    n.connect(lp);
    lp.connect(g);
    g.connect(o);
    n.start(t);
    n.stop(t + 0.8);
    const th = ctx.createOscillator();
    th.frequency.setValueAtTime(70, t);
    th.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.9, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    th.connect(tg);
    tg.connect(o);
    th.start(t);
    th.stop(t + 0.5);
  }

  warp(gain = 1, big = false): void {
    if (!this.ctx || !this.allow('warp', 3, 1)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = big ? 2.4 : 1.0;
    const o = this.out(0, (big ? 0.6 : 0.3) * gain, 0.6);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(big ? 40 : 120, t);
    osc.frequency.exponentialRampToValueAtTime(big ? 600 : 1400, t + dur * 0.8);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(5000, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp);
    lp.connect(g);
    g.connect(o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    if (big) this.explosion(6, 0, 0.8 * gain);
  }

  // ------------------------------------------------------------------ alarms and loops
  setAlarm(kind: AlarmKind, on: boolean): void {
    if (!this.ctx) return;
    if (on && this.alarmTimers[kind] === undefined) {
      const period = kind === 'missile' ? 160 : 420;
      this.alarmTimers[kind] = window.setInterval(() => this.alarmTick(kind), period);
      this.alarmTick(kind);
    } else if (!on && this.alarmTimers[kind] !== undefined) {
      window.clearInterval(this.alarmTimers[kind]);
      delete this.alarmTimers[kind];
    }
  }

  private alarmTick(kind: AlarmKind): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.alarmPhase++;
    const o = this.out(0, kind === 'missile' ? 0.1 : 0.12);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = kind === 'missile' ? 1180 : this.alarmPhase % 2 ? 740 : 560;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    const len = kind === 'missile' ? 0.08 : 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.01);
    g.gain.setValueAtTime(1, t + len - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(bp);
    bp.connect(g);
    g.connect(o);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }

  /** Continuous engine hum driven by throttle and boost. */
  setEngine(active: boolean, throttle = 0, boosting = false): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (active && !this.engineNodes) {
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.detune.value = 14;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.out(0, 1));
      osc1.start();
      osc2.start();
      this.engineNodes = { osc1, osc2, filter, gain };
    }
    if (!this.engineNodes) return;
    const t = ctx.currentTime;
    const e = this.engineNodes;
    if (!active) {
      e.gain.gain.setTargetAtTime(0, t, 0.2);
      return;
    }
    const k = throttle + (boosting ? 0.8 : 0);
    e.osc1.frequency.setTargetAtTime(42 + k * 26, t, 0.25);
    e.osc2.frequency.setTargetAtTime(42.5 + k * 26, t, 0.25);
    e.filter.frequency.setTargetAtTime(180 + k * 520, t, 0.2);
    e.gain.gain.setTargetAtTime(0.05 + k * 0.035, t, 0.2);
  }

  setBoost(on: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (on && !this.boostNodes) {
      const src = this.noiseSrc();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.9;
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(1300, t + 0.4);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.15);
      gain.gain.setTargetAtTime(0.12, t + 0.3, 0.3);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.out(0, 1, 0.1));
      src.start(t);
      this.boostNodes = { src, filter, gain };
    } else if (!on && this.boostNodes) {
      const b = this.boostNodes;
      b.gain.gain.setTargetAtTime(0, t, 0.12);
      b.filter.frequency.setTargetAtTime(300, t, 0.2);
      this.stopLater([b.src], t + 0.6);
      this.boostNodes = null;
    }
  }

  // ------------------------------------------------------------------ UI
  ui(kind: 'click' | 'hover' | 'banner' | 'radio' | 'deny'): void {
    if (!this.ctx || !this.allow(`ui_${kind}`, 2, 0.1)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = this.out(0, kind === 'hover' ? 0.05 : 0.14);
    const osc = ctx.createOscillator();
    osc.type = kind === 'deny' ? 'square' : 'sine';
    const f = { click: [1300, 650], hover: [900, 900], banner: [520, 1040], radio: [1500, 1100], deny: [220, 180] }[kind];
    const dur = kind === 'banner' ? 0.35 : kind === 'deny' ? 0.18 : 0.06;
    osc.frequency.setValueAtTime(f[0], t);
    osc.frequency.exponentialRampToValueAtTime(f[1], t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    if (kind === 'radio') {
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.25, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(o);
      n.start(t);
      n.stop(t + 0.13);
    }
  }

  stopLoops(): void {
    this.setEngine(false);
    this.setBoost(false);
    this.setLockSolid(false);
    this.setAlarm('missile', false);
    this.setAlarm('hull', false);
  }
}
