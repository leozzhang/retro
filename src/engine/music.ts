import { MUSIC, PLAYLIST, THEME } from '../data/audio';
import { audioCtx, audioRunning, bus, loadBuffer } from './audio';

/**
 * The music director. Game sets a mode every step and calls `update`:
 * - `theme`: the main theme, its intro once and then its loop, gapless (the menus);
 * - `hub`: the theme plays on to the end of its current loop if it's playing, then gives way to the
 *   playlist for good (the first hub visit after the menus); otherwise the playlist;
 * - `playlist`: the shuffled playlist, never a track from the last `MUSIC.noRepeat`;
 * - `silent`: fade out (the field: the crowd only). The playlist's track pauses and picks up again after.
 * Randomness is Math.random: display only, never season state. See docs/AUDIO.md.
 */
export type MusicMode = 'theme' | 'hub' | 'playlist' | 'silent';

interface ThemePlay {
  gain: GainNode;
  intro: AudioBufferSourceNode;
  loop: AudioBufferSourceNode;
  /** Context time the loop starts, and its length. */
  loopAt: number;
  loopDur: number;
  /** Context time it's fading out to end (set once the handoff is scheduled). */
  endAt: number | null;
}

interface Track {
  url: string;
  el: HTMLAudioElement;
  gain: GainNode;
  src: MediaElementAudioSourceNode;
  /** Fading out for good (the next track took over). */
  leaving: boolean;
}

class Music {
  private mode: MusicMode = 'silent';
  private theme: ThemePlay | null = null;
  private themeStarting = false;
  private track: Track | null = null;
  /** Indexes into PLAYLIST, most recent last. */
  private recent: number[] = [];
  /** The playlist is paused under `silent` (it resumes where it stopped). */
  private paused = false;
  private lastMode: MusicMode = 'silent';

  setMode(m: MusicMode): void {
    this.mode = m;
  }

  /** Once a frame. */
  update(): void {
    const c = audioCtx();
    if (!c || !audioRunning()) return;
    const m = this.mode;
    const changed = m !== this.lastMode;
    this.lastMode = m;
    if (m === 'theme') {
      this.cancelThemeEnd();
      this.leavePlaylist(changed, true);
      if (!this.theme) this.startTheme();
    } else if (m === 'hub') {
      const th = this.theme;
      if (th) {
        this.scheduleThemeEnd(false);
        if (th.endAt !== null && c.currentTime >= th.endAt - MUSIC.crossfade) this.playlist();
      } else if (!this.themeStarting) this.playlist();
    } else if (m === 'playlist') {
      if (this.theme) this.scheduleThemeEnd(true);
      this.playlist();
    } else {
      if (this.theme) this.stopTheme(MUSIC.fieldOut);
      this.leavePlaylist(changed, false);
    }
    this.reap();
  }

  /** Skip to another playlist track (dev: `game.music.next()`). */
  next(): string | undefined {
    if (this.track) this.fadeOutTrack(this.track, 0.3);
    this.track = null;
    this.startTrack();
    return (this.track as Track | null)?.url;
  }

  /** The playlist's history, for checking the shuffle. */
  history(): string[] {
    return this.recent.map((i) => PLAYLIST[i]);
  }

  // ------------------------------------------------------------ theme

  private async startTheme(): Promise<void> {
    if (this.themeStarting) return;
    this.themeStarting = true;
    const [intro, loop] = await Promise.all([loadBuffer(THEME.intro), loadBuffer(THEME.loop)]);
    this.themeStarting = false;
    const c = audioCtx();
    const out = bus('music');
    // The mode may have moved on while the files loaded.
    if (!c || !out || !intro || !loop || this.theme || (this.mode !== 'theme' && this.mode !== 'hub')) return;
    const gain = c.createGain();
    gain.gain.value = MUSIC.level;
    gain.connect(out);
    const t0 = c.currentTime + 0.05;
    const a = c.createBufferSource();
    a.buffer = intro;
    a.connect(gain);
    a.start(t0);
    const b = c.createBufferSource();
    b.buffer = loop;
    b.loop = true;
    b.connect(gain);
    b.start(t0 + intro.duration);
    this.theme = { gain, intro: a, loop: b, loopAt: t0 + intro.duration, loopDur: loop.duration, endAt: null };
  }

  /**
   * End the theme at the end of its current loop (`soon`: in a few seconds instead). Only the gain is
   * scheduled, so it can still be called off; `reap` stops the sources once it has faded.
   */
  private scheduleThemeEnd(soon: boolean): void {
    const th = this.theme;
    const c = audioCtx();
    if (!th || !c || th.endAt !== null) return;
    const now = c.currentTime;
    let end: number;
    if (soon) end = now + MUSIC.themeOut;
    else {
      const k = Math.max(1, Math.ceil((now + MUSIC.themeOut - th.loopAt) / th.loopDur));
      end = th.loopAt + k * th.loopDur;
    }
    th.endAt = end;
    const g = th.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setValueAtTime(MUSIC.level, end - MUSIC.themeOut);
    g.linearRampToValueAtTime(0, end);
  }

  /** Back to the menus before the handoff finished: the theme carries on. */
  private cancelThemeEnd(): void {
    const th = this.theme;
    if (!th || th.endAt === null) return;
    th.endAt = null;
    this.ramp(th.gain, MUSIC.level, 0.5);
  }

  private stopTheme(fade: number): void {
    const th = this.theme;
    const c = audioCtx();
    if (!th || !c) return;
    const now = c.currentTime;
    const g = th.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    try {
      th.intro.stop(now + fade + 0.05);
      th.loop.stop(now + fade + 0.05);
    } catch {
      // already stopped
    }
    this.theme = null;
  }

  // ------------------------------------------------------------ playlist

  private playlist(): void {
    if (this.track && this.paused) {
      this.paused = false;
      const t = this.track;
      void t.el.play().catch(() => undefined);
      this.ramp(t.gain, MUSIC.level, MUSIC.fieldIn);
    }
    if (!this.track) {
      this.startTrack();
      return;
    }
    const el = this.track.el;
    // Crossfade into the next track as this one ends.
    if (Number.isFinite(el.duration) && el.duration > 0 && el.duration - el.currentTime <= MUSIC.crossfade) {
      this.fadeOutTrack(this.track, MUSIC.crossfade);
      this.track = null;
      this.startTrack();
    }
  }

  private leavePlaylist(changed: boolean, drop: boolean): void {
    const t = this.track;
    if (!t) return;
    if (drop) {
      // Back to the menus: this track is done; the playlist starts fresh next time.
      this.fadeOutTrack(t, MUSIC.fieldOut);
      this.track = null;
      this.paused = false;
      return;
    }
    if (changed && !this.paused) {
      this.paused = true;
      this.ramp(t.gain, 0, MUSIC.fieldOut);
      const el = t.el;
      setTimeout(() => {
        if (this.paused && this.track?.el === el) el.pause();
      }, MUSIC.fieldOut * 1000 + 50);
    }
  }

  private pick(): number {
    const n = PLAYLIST.length;
    const keep = Math.min(MUSIC.noRepeat, n - 1);
    const recent = new Set(this.recent.slice(-keep));
    const open = Array.from({ length: n }, (_, i) => i).filter((i) => !recent.has(i));
    const i = open[Math.floor(Math.random() * open.length)];
    this.recent.push(i);
    if (this.recent.length > n) this.recent.shift();
    return i;
  }

  private startTrack(): void {
    const c = audioCtx();
    const out = bus('music');
    if (!c || !out) return;
    const url = PLAYLIST[this.pick()];
    const el = new Audio(url);
    el.preload = 'auto';
    const src = c.createMediaElementSource(el);
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(out);
    const t: Track = { url, el, gain, src, leaving: false };
    el.addEventListener('ended', () => {
      if (this.track === t) this.track = null;
      this.dispose(t);
    });
    el.addEventListener('error', () => {
      console.warn('audio: track failed', url);
      if (this.track === t) this.track = null;
      this.dispose(t);
    });
    void el.play().catch(() => undefined);
    this.ramp(gain, MUSIC.level, MUSIC.crossfade);
    this.track = t;
    this.paused = false;
  }

  private fadeOutTrack(t: Track, secs: number): void {
    t.leaving = true;
    this.ramp(t.gain, 0, secs);
    setTimeout(() => this.dispose(t), secs * 1000 + 100);
  }

  private dispose(t: Track): void {
    t.el.pause();
    t.el.removeAttribute('src');
    t.el.load();
    try {
      t.src.disconnect();
      t.gain.disconnect();
    } catch {
      // already gone
    }
  }

  private ramp(g: GainNode, to: number, secs: number): void {
    const c = audioCtx();
    if (!c) return;
    const now = c.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(to, now + Math.max(0.01, secs));
  }

  /** Stop a theme whose scheduled end has passed. */
  private reap(): void {
    const c = audioCtx();
    const th = this.theme;
    if (!th || !c || th.endAt === null || c.currentTime <= th.endAt) return;
    try {
      th.intro.stop();
      th.loop.stop();
    } catch {
      // already stopped
    }
    th.gain.disconnect();
    this.theme = null;
  }
}

export const music = new Music();
