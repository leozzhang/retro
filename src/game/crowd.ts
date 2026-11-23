import { CROWD, CROWD_FILES } from '../data/audio';
import { audioCtx, audioRunning, bus, loadBuffer, preload } from '../engine/audio';

/**
 * The stadium: a looping bed of crowd noise under the field, which rises on big downs and
 * hushes when the home team is hurt, plus reactions (a roar, a cheer, a chant) laid on top.
 * Display only: game/sounds.ts drives it from what the field shows. See docs/AUDIO.md.
 */

type Slice = { file: string; slice: [number, number] };

class Crowd {
  private bed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private starting = false;
  private on = false;
  /** The bed's level it's heading for, and until when a hush holds it down. */
  private target: number = CROWD.bed;
  private hushUntil = 0;

  /** Load the stadium's files (the first game's kickoff shouldn't wait on them). */
  preload(): void {
    preload([CROWD_FILES.bed.file, CROWD_FILES.chant.file, ...CROWD_FILES.roar.map((r) => r.file), ...CROWD_FILES.cheer.map((r) => r.file)]);
  }

  /** On the field: the bed fades in (and keeps going until `stop`). */
  start(): void {
    this.on = true;
    if (this.bed || this.starting) return;
    const c = audioCtx();
    if (!c || !audioRunning()) return;
    this.starting = true;
    void loadBuffer(CROWD_FILES.bed.file).then((buf) => {
      this.starting = false;
      const c2 = audioCtx();
      const out = bus('crowd');
      if (!buf || !c2 || !out || !this.on || this.bed) return;
      const src = c2.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const [a, b] = CROWD_FILES.bed.slice;
      src.loopStart = Math.min(a, buf.duration);
      src.loopEnd = Math.min(b, buf.duration);
      const gain = c2.createGain();
      gain.gain.setValueAtTime(0, c2.currentTime);
      gain.gain.linearRampToValueAtTime(this.target, c2.currentTime + CROWD.fadeIn);
      src.connect(gain);
      gain.connect(out);
      src.start(c2.currentTime, src.loopStart);
      this.bed = { src, gain };
    });
  }

  /** Off the field: the stadium fades away. */
  stop(): void {
    this.on = false;
    const b = this.bed;
    const c = audioCtx();
    if (!b || !c) return;
    this.bed = null;
    const now = c.currentTime;
    b.gain.gain.cancelScheduledValues(now);
    b.gain.gain.setValueAtTime(b.gain.gain.value, now);
    b.gain.gain.linearRampToValueAtTime(0, now + CROWD.fadeOut);
    b.src.stop(now + CROWD.fadeOut + 0.05);
  }

  /** The bed's level between plays: calm, or up for a big down. */
  level(big: boolean): void {
    this.setBed(big ? CROWD.bigDown : CROWD.bed);
  }

  /** The home crowd goes quiet for a moment (their team was hurt). */
  hush(): void {
    const c = audioCtx();
    if (!c) return;
    this.hushUntil = c.currentTime + CROWD.hushHold;
    this.ramp(CROWD.hush, 0.3);
  }

  /** A reaction on top of the bed. `share` scales it (the away fans are a fraction of the stadium). */
  react(kind: 'roar' | 'cheer' | 'chant', share = 1): void {
    const pool: Slice[] = kind === 'roar' ? CROWD_FILES.roar : kind === 'cheer' ? CROWD_FILES.cheer : [CROWD_FILES.chant];
    const s = pool[Math.floor(Math.random() * pool.length)];
    const peak = (kind === 'roar' ? CROWD.roar : CROWD.cheer) * share;
    this.playSlice(s, peak);
  }

  /** Once a frame: lift a hush when it's done. */
  update(): void {
    const c = audioCtx();
    if (!c || !this.bed || !this.hushUntil || c.currentTime < this.hushUntil) return;
    this.hushUntil = 0;
    this.ramp(this.target, CROWD.ramp * 2);
  }

  private setBed(v: number): void {
    this.target = v;
    const c = audioCtx();
    if (c && c.currentTime < this.hushUntil) return;
    this.ramp(v, CROWD.ramp);
  }

  private ramp(v: number, secs: number): void {
    const c = audioCtx();
    const b = this.bed;
    if (!c || !b) return;
    const now = c.currentTime;
    b.gain.gain.cancelScheduledValues(now);
    b.gain.gain.setValueAtTime(b.gain.gain.value, now);
    b.gain.gain.linearRampToValueAtTime(v, now + secs);
  }

  private playSlice(s: Slice, peak: number): void {
    const c = audioCtx();
    const out = bus('crowd');
    if (!c || !out || !audioRunning() || !this.on) return;
    void loadBuffer(s.file).then((buf) => {
      if (!buf || !this.on) return;
      const now = c.currentTime;
      const [a, b] = s.slice;
      const dur = Math.max(0.5, Math.min(b, buf.duration) - a);
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.25);
      g.gain.setValueAtTime(peak, now + Math.max(0.3, dur - CROWD.reactFade));
      g.gain.linearRampToValueAtTime(0, now + dur);
      src.connect(g);
      g.connect(out);
      src.start(now, a, dur + 0.05);
    });
  }
}

export const crowd = new Crowd();
