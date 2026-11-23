import { getItem, setItem } from './storage';

/**
 * The game's one AudioContext and its buses: master, then music, sfx (the field), crowd and ui.
 * Everything here is a no-op without Web Audio (Node: the tests and the headless reports), so
 * sim code can never reach a speaker. See docs/AUDIO.md.
 */

export type Bus = 'music' | 'sfx' | 'crowd' | 'ui';

/** The user's volumes, 0..10 each. Global (not per dynasty), stored on their own. */
export interface AudioPrefs {
  music: number;
  sfx: number;
  crowd: number;
}

export const AUDIO_KEY = 'audio';
const DEFAULT_PREFS: AudioPrefs = { music: 7, sfx: 8, crowd: 7 };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buses = new Map<Bus, GainNode>();
let prefs: AudioPrefs = { ...DEFAULT_PREFS };
let loaded = false;
const unlockWaiters: (() => void)[] = [];

function readPrefs(): AudioPrefs {
  try {
    const raw = getItem(AUDIO_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<AudioPrefs>) : {};
    const clamp = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 10 ? Math.round(v) : d);
    return { music: clamp(p.music, DEFAULT_PREFS.music), sfx: clamp(p.sfx, DEFAULT_PREFS.sfx), crowd: clamp(p.crowd, DEFAULT_PREFS.crowd) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Volume 0..10 to gain: a gentle curve, so the low steps are still audible and 0 is silent. */
const volGain = (v: number): number => (v <= 0 ? 0 : (v / 10) ** 1.6);

/** The context, made on first use; null without Web Audio. */
export function audioCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!AC) return null;
  if (!loaded) {
    prefs = readPrefs();
    loaded = true;
  }
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  for (const b of ['music', 'sfx', 'crowd', 'ui'] as Bus[]) {
    const g = ctx.createGain();
    g.connect(master);
    buses.set(b, g);
  }
  applyPrefs();
  ctx.addEventListener('statechange', () => {
    if (ctx?.state === 'running') unlockWaiters.splice(0).forEach((f) => f());
  });
  return ctx;
}

export function bus(b: Bus): GainNode | null {
  audioCtx();
  return buses.get(b) ?? null;
}

/** Running: the browser has let us play (after the first gesture, or at once in the desktop app). */
export const audioRunning = (): boolean => ctx?.state === 'running';

/** Call on every user gesture: the browser only lets a context start from one. */
export function unlockAudio(): void {
  const c = audioCtx();
  if (c && c.state !== 'running') void c.resume().catch(() => undefined);
}

/** Runs `f` once audio can play (at once if it already can). */
export function whenRunning(f: () => void): void {
  if (audioRunning()) f();
  else unlockWaiters.push(f);
}

function applyPrefs(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  // The ui bus rides the effects volume.
  const v: Record<Bus, number> = { music: prefs.music, sfx: prefs.sfx, crowd: prefs.crowd, ui: prefs.sfx };
  for (const [b, g] of buses) g.gain.setTargetAtTime(volGain(v[b]), t, 0.03);
}

export function audioPrefs(): AudioPrefs {
  if (!loaded) {
    prefs = readPrefs();
    loaded = true;
  }
  return prefs;
}

export function setAudioPref(k: keyof AudioPrefs, v: number): void {
  audioPrefs();
  prefs = { ...prefs, [k]: Math.max(0, Math.min(10, Math.round(v))) };
  setItem(AUDIO_KEY, JSON.stringify(prefs));
  applyPrefs();
}

const buffers = new Map<string, Promise<AudioBuffer | null>>();

/** A decoded file, fetched once and cached; null if it can't load (missing file, no audio). */
export function loadBuffer(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    const c = audioCtx();
    p = !c
      ? Promise.resolve(null)
      : fetch(url)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${url}`))))
          .then((a) => c.decodeAudioData(a))
          .catch((err) => {
            console.warn('audio: failed to load', url, err);
            return null;
          });
    buffers.set(url, p);
  }
  return p;
}

/** The buffer if it has already decoded (for sounds that must play now or not at all). */
const ready = new Map<string, AudioBuffer>();
export function readyBuffer(url: string): AudioBuffer | null {
  const b = ready.get(url);
  if (b) return b;
  void loadBuffer(url).then((x) => x && ready.set(url, x));
  return null;
}

/** Starts loading these files now, so their first play isn't late. */
export function preload(urls: string[]): void {
  if (!audioCtx()) return;
  for (const u of urls) readyBuffer(u);
}
