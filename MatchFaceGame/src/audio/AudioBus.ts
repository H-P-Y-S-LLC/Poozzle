/**
 * Audio bus: lazy AudioContext, SFX/music gains, mute toggles, 3D spatialization.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.7.1 / §5.7.5.
 */
import { AudioSynth } from "./AudioSynth.js";
import { SFX_RECIPES, type SfxName, type SfxOptions } from "./SfxRecipes.js";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export class AudioBus {
  private ctx: AudioContext | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private synth: AudioSynth | null = null;
  private musicSynth: AudioSynth | null = null;

  private sfxVolume = 0.55;
  private musicVolume = 0.35;
  private muted = false;
  private musicMuted = false;

  private ensure(): boolean {
    if (this.synth) return true;
    const AC: typeof AudioContext | undefined =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 5;
    this.comp.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.comp);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicMuted ? 0 : this.musicVolume;
    this.musicBus.connect(this.comp);

    this.synth = new AudioSynth(this.ctx, this.sfxBus, 1);
    this.musicSynth = new AudioSynth(this.ctx, this.musicBus, 1);
    return true;
  }

  /** Call inside a user gesture to satisfy autoplay policies. */
  resume(): void {
    if (!this.ensure() || !this.ctx) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  // ───────────────────────────── sfx ─────────────────────────────

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.sfxBus) this.sfxBus.gain.value = this.muted ? 0 : this.sfxVolume;
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  play(name: SfxName, opts: SfxOptions = {}): void {
    if (this.muted || !this.ensure() || !this.synth) return;
    this.wake();
    SFX_RECIPES[name](this.synth, opts);
  }

  /** Play a sound positioned in 3D space (relative to the listener). */
  playAt(name: SfxName, opts: SfxOptions, pos: Vec3): void {
    if (this.muted || !this.ensure() || !this.ctx || !this.sfxBus) return;
    this.wake();
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    // The listener sits on the camera far above the board, so keep attenuation
    // mild to avoid silencing board sounds while preserving left/right panning.
    panner.refDistance = 50;
    panner.maxDistance = 220;
    panner.rolloffFactor = 0.2;
    setPosition(panner, pos);
    panner.connect(this.sfxBus);
    const spatialSynth = new AudioSynth(this.ctx, panner, 1.0);
    SFX_RECIPES[name](spatialSynth, opts);
    setTimeout(() => {
      try {
        panner.disconnect();
      } catch {
        /* ignore */
      }
    }, 2500);
  }

  /** Keep the Web Audio listener in sync with the camera (Web Audio is -Z forward). */
  updateListener(pos: Vec3, forward: Vec3): void {
    if (!this.ctx) return;
    const l = this.ctx.listener as AudioListener & {
      positionX?: AudioParam;
      forwardX?: AudioParam;
    };
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  // ───────────────────────────── music ─────────────────────────────

  toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    if (this.musicBus) this.musicBus.gain.value = this.musicMuted ? 0 : this.musicVolume;
    return this.musicMuted;
  }

  isMusicMuted(): boolean {
    return this.musicMuted;
  }

  /** A synth connected to the music bus, for MusicGenerator. */
  ensureMusicSynth(): AudioSynth | null {
    if (!this.ensure()) return null;
    this.wake();
    return this.musicSynth;
  }

  private wake(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }
}

function setPosition(node: PannerNode, pos: Vec3): void {
  const p = node as PannerNode & { positionX?: AudioParam };
  if (p.positionX) {
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
  } else {
    node.setPosition(pos.x, pos.y, pos.z);
  }
}
