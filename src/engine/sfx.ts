import { SFX, type SfxDef, type SfxId } from '../data/audio';
import { audioCtx, audioRunning, bus, preload, readyBuffer } from './audio';

/**
 * Sound effects: `sfx(id)` plays one from data/audio.ts, a file (a random variant, with pitch
 * jitter) or a synth recipe drawn here (the whistle, whooshes, the kick's thump, the hike).
 * Nothing plays until audio is running, and a file not yet decoded is skipped rather than played
 * late. A no-op without Web Audio.
 */

export interface SfxOpts {
  /** Gain multiplier on the sound's own. */
  gain?: number;
  /** Pitch multiplier (1 = as recorded). */
  rate?: number;
  /** Stereo position -1..1. */
  pan?: number;
  /** Seconds from now. */
  delay?: number;
}

const lastAt = new Map<SfxId, number>();

export function sfx(id: SfxId, o: SfxOpts = {}): void {
  const c = audioCtx();
  if (!c || !audioRunning()) return;
  const d: SfxDef = SFX[id];
  const now = c.currentTime;
  const at = now + (o.delay ?? 0);
  const last = lastAt.get(id);
  if (d.gap !== undefined && last !== undefined && at - last < d.gap) return;
  lastAt.set(id, at);
  const out = bus(d.bus);
  if (!out) return;
  let dest: AudioNode = out;
  if (o.pan) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    p.connect(out);
    dest = p;
  }
  const gain = d.gain * (o.gain ?? 1);
  if (d.synth) {
    SYNTHS[d.synth](c, dest, at, gain, o.rate ?? 1);
    return;
  }
  const files = d.files ?? [];
  const buf = readyBuffer(files[Math.floor(Math.random() * files.length)]);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const semis = d.jitter ? (Math.random() * 2 - 1) * d.jitter : 0;
  src.playbackRate.value = (d.rate ?? 1) * (o.rate ?? 1) * 2 ** (semis / 12);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(dest);
  src.start(at);
}

/** Decode every effect's files now (called once audio starts), so the first play of each is on time. */
export function preloadSfx(): void {
  const urls: string[] = [];
  for (const d of Object.values(SFX) as SfxDef[]) if (d.files) urls.push(...d.files);
  preload(urls);
}

// ------------------------------------------------------------ synths

type Synth = (c: AudioContext, out: AudioNode, at: number, gain: number, rate: number) => void;

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const n = Math.floor(c.sampleRate * 1.5);
  noiseBuf = c.createBuffer(1, n, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(c: AudioContext, at: number, peak: number, attack: number, hold: number, release: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  return g;
}

/** A referee's pea whistle: a high tone warbled fast by the pea, with a breath of air. */
function whistle(len: number): Synth {
  return (c, out, at, gain, rate) => {
    const f0 = 2950 * rate;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0 * 0.97, at);
    o.frequency.linearRampToValueAtTime(f0, at + 0.04);
    // The pea's trill: frequency and loudness wobble together.
    const lfo = c.createOscillator();
    lfo.frequency.value = 34;
    const fm = c.createGain();
    fm.gain.value = f0 * 0.035;
    lfo.connect(fm);
    fm.connect(o.frequency);
    const am = c.createGain();
    am.gain.value = 0.75;
    const amDepth = c.createGain();
    amDepth.gain.value = 0.25;
    lfo.connect(amDepth);
    amDepth.connect(am.gain);
    const e = env(c, at, gain, 0.015, len, 0.08);
    o.connect(am);
    am.connect(e);
    // A second partial for the whistle's edge.
    const o2 = c.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f0 * 2.01;
    fm.connect(o2.frequency);
    const g2 = c.createGain();
    g2.gain.value = 0.12;
    o2.connect(g2);
    g2.connect(am);
    // Breath.
    const n = c.createBufferSource();
    n.buffer = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f0;
    bp.Q.value = 3;
    const ng = c.createGain();
    ng.gain.value = 0.25;
    n.connect(bp);
    bp.connect(ng);
    ng.connect(e);
    e.connect(out);
    const end = at + len + 0.2;
    for (const s of [o, o2, lfo, n]) {
      s.start(at);
      s.stop(end);
    }
  };
}

/** Air moving: noise through a bandpass swept from `f0` to `f1`. */
function sweep(f0: number, f1: number, dur: number, q: number, attack: number): Synth {
  return (c, out, at, gain, rate) => {
    const n = c.createBufferSource();
    n.buffer = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0 * rate, at);
    bp.frequency.exponentialRampToValueAtTime(f1 * rate, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    n.connect(bp);
    bp.connect(g);
    g.connect(out);
    n.start(at, Math.random() * 0.5);
    n.stop(at + dur + 0.05);
  };
}

/** A low body thump (a foot on the ball, the snap), with a short click on top. */
function thump(f0: number, f1: number, dur: number, click: number): Synth {
  return (c, out, at, gain, rate) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0 * rate, at);
    o.frequency.exponentialRampToValueAtTime(f1 * rate, at + dur);
    const g = env(c, at, gain, 0.004, 0, dur);
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
    const n = c.createBufferSource();
    n.buffer = noise(c);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = env(c, at, gain * click, 0.002, 0, 0.03);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(out);
    n.start(at, Math.random());
    n.stop(at + 0.06);
  };
}

const SYNTHS: Record<NonNullable<SfxDef['synth']>, Synth> = {
  whistle: whistle(0.28),
  whistleLong: whistle(0.75),
  whoosh: sweep(500, 2200, 0.28, 1.2, 0.06),
  swipe: sweep(1400, 5200, 0.2, 0.8, 0.05),
  thump: thump(140, 45, 0.16, 0.5),
  hike: thump(220, 110, 0.07, 0.8),
};
