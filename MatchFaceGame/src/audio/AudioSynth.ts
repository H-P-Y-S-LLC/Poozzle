/**
 * Web Audio synthesis primitives (zero audio files).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.7.2.
 */
export class AudioSynth {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  private noiseBuf: AudioBuffer | null = null;

  constructor(ctx: AudioContext, destination: AudioNode, volume = 0.5) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = volume;
    this.master.connect(destination);
  }

  private ensureNoise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; toFreq?: number; attack?: number; delay?: number } = {}
  ): void {
    const { type = "sine", gain = 0.35, toFreq, attack = 0.006, delay = 0 } = opts;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t);
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noise(
    dur: number,
    opts: { type?: BiquadFilterType; freq?: number; q?: number; gain?: number; decay?: number; sweepTo?: number; delay?: number } = {}
  ): void {
    const { type = "lowpass", freq = 800, q = 1, gain = 0.4, decay = dur, sweepTo, delay = 0 } = opts;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.ensureNoise();
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t + dur);
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, decay));
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }
}
