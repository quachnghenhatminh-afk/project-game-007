// Procedural sound effects (WebAudio, no audio files). Placeholder until real SFX exist.
// Call `Sfx.unlock()` from a user gesture (start button) — browsers block audio before that.
//
// Note: the channel hum plays while the mic listens; it is kept low and low-pitched so the
// browser's echo cancellation removes it. Headphones are still recommended.

type Stop = () => void;

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.6;

  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  getVolume(): number {
    return this.volume;
  }

  // --- Building blocks -------------------------------------------------------------

  private get ready(): boolean {
    return !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  private env(gain: number, attack: number, decay: number, at = 0): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const t = ctx.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master!);
    return g;
  }

  private noiseBurst(out: AudioNode, filter: BiquadFilterType, f0: number, f1: number, dur: number, at = 0, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bq = ctx.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    const t = ctx.currentTime + at;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    src.connect(bq).connect(out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, at = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + at;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 0..1 loudness from distance (m) to the listener. */
  private falloff(distance: number): number {
    return 1 / (1 + Math.max(0, distance - 4) * 0.06);
  }

  // --- Effects ---------------------------------------------------------------------------

  /** Soft magical hum while the cast button is held. Returns a stop function. */
  channelLoop(): Stop {
    if (!this.ready) return () => {};
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.25);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.connect(out).connect(this.master!);
    const oscs = [110, 165.5, 220.7].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      return o;
    });
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5;
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(out.gain);
    lfo.start();
    return () => {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      for (const o of [...oscs, lfo]) o.stop(t + 0.25);
    };
  }

  /** Spell leaves the hands. */
  castWhoosh(empowered: boolean): void {
    if (!this.ready) return;
    const g = this.env(empowered ? 0.5 : 0.35, 0.02, 0.35);
    this.noiseBurst(g, 'bandpass', 500, 3500, 0.35, 0, 1.5);
    this.tone(g, 'sine', empowered ? 520 : 420, empowered ? 1300 : 900, 0.25);
    if (empowered) this.tone(this.env(0.2, 0.01, 0.5), 'triangle', 1320, 1760, 0.4); // sparkle
  }

  /** Impact explosion; `size` ~ blast radius in meters. */
  explosion(size: number, distance: number): void {
    if (!this.ready) return;
    const k = this.falloff(distance) * Math.min(1.4, 0.5 + size / 8);
    const boom = this.env(0.9 * k, 0.005, 0.6 + size * 0.06);
    this.noiseBurst(boom, 'lowpass', 2400, 120, 0.7 + size * 0.05);
    this.tone(this.env(0.8 * k, 0.005, 0.5), 'sine', 90, 35, 0.5);
  }

  /** "Alô alô" sound bullet launch: two quick electronic chirps. */
  soundBullet(): void {
    if (!this.ready) return;
    this.tone(this.env(0.18, 0.005, 0.12), 'square', 880, 880, 0.12);
    this.tone(this.env(0.18, 0.005, 0.12, 0.14), 'square', 660, 660, 0.12, 0.14);
    this.tone(this.env(0.18, 0.005, 0.12, 0.3), 'square', 880, 880, 0.12, 0.3);
    this.tone(this.env(0.18, 0.005, 0.12, 0.44), 'square', 660, 660, 0.12, 0.44);
  }

  /** Sonic burst where the sound bullet lands. */
  sonicImpact(distance: number): void {
    if (!this.ready) return;
    const k = this.falloff(distance);
    this.tone(this.env(0.5 * k, 0.005, 0.5), 'sawtooth', 1200, 80, 0.5);
    this.noiseBurst(this.env(0.4 * k, 0.005, 0.3), 'highpass', 3000, 800, 0.3);
  }

  shieldUp(): void {
    if (!this.ready) return;
    this.tone(this.env(0.25, 0.05, 0.6), 'sine', 300, 900, 0.6);
    this.tone(this.env(0.15, 0.05, 0.6), 'triangle', 450, 1350, 0.6);
  }

  /** Guardian spirit rising: deep roar. */
  spiritRise(): void {
    if (!this.ready) return;
    const g = this.env(0.55, 0.15, 1.4);
    this.tone(g, 'sawtooth', 45, 70, 1.5);
    this.noiseBurst(g, 'lowpass', 300, 900, 1.4, 0, 0.7);
    this.tone(this.env(0.2, 0.3, 1.2), 'sine', 220, 330, 1.4);
  }

  spiritEnd(): void {
    if (!this.ready) return;
    this.noiseBurst(this.env(0.3, 0.02, 0.6), 'lowpass', 1500, 200, 0.6);
  }

  /** Wand chop swing. */
  swing(heavy = false): void {
    if (!this.ready) return;
    this.noiseBurst(this.env(heavy ? 0.45 : 0.25, 0.01, heavy ? 0.3 : 0.16), 'bandpass', heavy ? 600 : 1500, heavy ? 200 : 4000, heavy ? 0.3 : 0.16, 0, 2);
  }

  /** Wand hits wood/props. */
  hit(): void {
    if (!this.ready) return;
    this.noiseBurst(this.env(0.5, 0.002, 0.09), 'bandpass', 900, 500, 0.09, 0, 3);
    this.tone(this.env(0.35, 0.002, 0.12), 'sine', 190, 120, 0.12);
  }

  /** Tree cracks, then thuds on the ground ~1.1s later. */
  treeFall(distance: number): void {
    if (!this.ready) return;
    const k = this.falloff(distance);
    for (let i = 0; i < 4; i++) this.noiseBurst(this.env(0.35 * k, 0.002, 0.06, i * 0.07), 'bandpass', 1800, 900, 0.06, i * 0.07, 4);
    this.tone(this.env(0.7 * k, 0.005, 0.5, 1.1), 'sine', 70, 30, 0.5, 1.1);
    this.noiseBurst(this.env(0.4 * k, 0.005, 0.4, 1.1), 'lowpass', 800, 100, 0.4, 1.1);
  }

  /** Crate/barrel smashed. */
  breakProp(distance: number): void {
    if (!this.ready) return;
    const k = this.falloff(distance);
    this.noiseBurst(this.env(0.6 * k, 0.002, 0.25), 'bandpass', 1400, 400, 0.25, 0, 1.2);
    this.tone(this.env(0.3 * k, 0.002, 0.15), 'square', 140, 60, 0.15);
  }

  fizzle(): void {
    if (!this.ready) return;
    this.noiseBurst(this.env(0.25, 0.01, 0.4), 'bandpass', 2500, 300, 0.4, 0, 1);
  }

  denied(): void {
    if (!this.ready) return;
    this.tone(this.env(0.15, 0.005, 0.15), 'square', 180, 150, 0.15);
  }
}

export const Sfx = new SfxEngine();
