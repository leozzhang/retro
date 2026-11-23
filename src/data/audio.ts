/**
 * The soundtrack and the sound effects: files under public/audio/, their sources and the knobs.
 * Sources, licenses and the event map are in docs/AUDIO.md.
 */

const MUSIC_DIR = 'audio/music/';
const SFX_DIR = 'audio/sfx/';

/** The main theme, "I've Got Your Back!" by Bert Cole: the intro once, then the loop, gapless. */
export const THEME = { intro: `${MUSIC_DIR}theme-intro.ogg`, loop: `${MUSIC_DIR}theme-loop.ogg` };

/** The playlist: the ansimuz Action 1, Action 2 and Adventure packs, shuffled together. */
const PLAYLIST_FILES = [
  'action1-battle-encounter', 'action1-bipedal-mech', 'action1-bossbattle', 'action1-cyber-runner', 'action1-cyberpunk-street',
  'action1-jump-run-duck', 'action1-long-preparation', 'action1-magic-fx-7', 'action1-mega-bot-bay', 'action1-mega-bot-pipes-forest',
  'action1-mega-bot-pipes-under',
  'action2-moonlight', 'action2-nesquence', 'action2-neverendingrace', 'action2-outrunner', 'action2-space-marine-theme',
  'action2-space-ray', 'action2-space-rider', 'action2-spaceship-shooter', 'action2-warped-caves', 'action2-warped-shooting-fx',
  'action2-warped-vehicles',
  'adventure-arcade', 'adventure-chibi-robot-b', 'adventure-dark-happy-world', 'adventure-exploration', 'adventure-fantasy-dragon',
  'adventure-going-up', 'adventure-happywalking', 'adventure-hurry-up-and-run',
];
export const PLAYLIST: string[] = PLAYLIST_FILES.map((f) => `${MUSIC_DIR}${f}.ogg`);

export const MUSIC = {
  /** A track can't come back until this many others have played (of 30). */
  noRepeat: 12,
  /** Seconds: crossfade between playlist tracks; fade out going onto the field, back in coming off it. */
  crossfade: 1.5,
  fieldOut: 2,
  fieldIn: 1.5,
  /** Seconds: the theme fading into the playlist (after its first loop on the hub). */
  themeOut: 2.5,
  /** Gain of the music bus at volume 10 (tracks are mastered hot next to the effects). */
  level: 0.55,
};

/**
 * A sound effect: files (a variant is picked at random), or a synth recipe (engine/sfx.ts).
 * `gain` is relative to its bus; `jitter` is a random pitch spread in semitones; `rate` a fixed pitch.
 */
export interface SfxDef {
  files?: string[];
  synth?: 'whistle' | 'whistleLong' | 'whoosh' | 'swipe' | 'thump' | 'hike';
  gain: number;
  jitter?: number;
  rate?: number;
  bus: 'ui' | 'sfx';
  /** Minimum seconds between two plays of this sound (keeps a burst of clicks from stacking). */
  gap?: number;
}

const f = (name: string, n?: number, ext = 'ogg'): string[] =>
  n === undefined ? [`${SFX_DIR}${name}.${ext}`] : Array.from({ length: n }, (_, i) => `${SFX_DIR}${name}-${i}.${ext}`);

export const SFX = {
  // Menus (Kenney Interface Sounds and UI Audio, CC0).
  nav: { files: f('ui-nav'), gain: 0.35, jitter: 0.5, bus: 'ui', gap: 0.03 },
  hover: { files: f('ui-hover'), gain: 0.18, bus: 'ui', gap: 0.05 },
  select: { files: f('ui-select'), gain: 0.5, bus: 'ui', gap: 0.05 },
  back: { files: f('ui-back'), gain: 0.45, bus: 'ui', gap: 0.05 },
  toggle: { files: f('ui-toggle'), gain: 0.45, bus: 'ui', gap: 0.03 },
  error: { files: f('ui-error'), gain: 0.45, bus: 'ui', gap: 0.1 },
  confirm: { files: f('ui-confirm'), gain: 0.5, bus: 'ui', gap: 0.1 },
  toast: { files: f('ui-toast'), gain: 0.5, bus: 'ui', gap: 0.2 },
  scroll: { files: f('ui-scroll'), gain: 0.25, jitter: 0.7, bus: 'ui', gap: 0.04 },
  drop: { files: f('ui-drop'), gain: 0.45, bus: 'ui', gap: 0.05 },
  swipe: { synth: 'swipe', gain: 0.5, bus: 'ui', gap: 0.08 },
  // Stingers (Kenney Music Jingles, 8-bit set, CC0).
  jingleTd: { files: f('jingle-td'), gain: 0.55, bus: 'sfx' },
  jingleFg: { files: f('jingle-fg'), gain: 0.5, bus: 'sfx' },
  jingleMiss: { files: f('jingle-miss'), gain: 0.45, bus: 'sfx' },
  jingleTurnover: { files: f('jingle-turnover'), gain: 0.45, bus: 'sfx' },
  jingleWin: { files: f('jingle-win'), gain: 0.6, bus: 'ui' },
  jingleLoss: { files: f('jingle-loss'), gain: 0.5, bus: 'ui' },
  jingleUnlock: { files: f('jingle-unlock'), gain: 0.5, bus: 'ui', gap: 0.5 },
  jingleDecide: { files: f('jingle-decide'), gain: 0.5, bus: 'ui' },
  // The field (Kenney Impact Sounds, CC0, and synths).
  hike: { synth: 'hike', gain: 0.5, bus: 'sfx' },
  whistle: { synth: 'whistle', gain: 0.32, bus: 'sfx', gap: 0.4 },
  whistleLong: { synth: 'whistleLong', gain: 0.32, bus: 'sfx', gap: 0.4 },
  throw: { synth: 'whoosh', gain: 0.45, bus: 'sfx', gap: 0.1 },
  catch: { files: f('catch', 3), gain: 0.7, jitter: 1, rate: 0.8, bus: 'sfx', gap: 0.1 },
  hitHeavy: { files: f('hit-heavy', 5), gain: 0.75, jitter: 1.5, bus: 'sfx', gap: 0.06 },
  hit: { files: f('hit-soft', 5), gain: 0.75, jitter: 1.5, bus: 'sfx', gap: 0.06 },
  hitLight: { files: f('hit-light', 5), gain: 0.55, jitter: 1.5, bus: 'sfx', gap: 0.06 },
  ground: { files: f('ground', 3), gain: 0.5, jitter: 1, rate: 0.8, bus: 'sfx', gap: 0.08 },
  kick: { files: f('kick', 3), gain: 0.8, jitter: 1, rate: 0.7, bus: 'sfx', gap: 0.1 },
  kickThump: { synth: 'thump', gain: 0.6, bus: 'sfx', gap: 0.1 },
  doink: { files: f('doink'), gain: 0.6, bus: 'sfx' },
} satisfies Record<string, SfxDef>;
export type SfxId = keyof typeof SFX;

/** The crowd (Gregor Quendel, Free Crowd Cheering Sounds, CC-BY 4.0). Slices are [start, end] seconds of a file. */
export const CROWD_FILES = {
  bed: { file: `${SFX_DIR}crowd-bed.mp3`, slice: [13, 29] as [number, number] },
  roar: [
    { file: `${SFX_DIR}crowd-roar-0.mp3`, slice: [3.5, 13] as [number, number] },
    { file: `${SFX_DIR}crowd-roar-1.mp3`, slice: [4, 16] as [number, number] },
    { file: `${SFX_DIR}crowd-roar-2.mp3`, slice: [4, 13] as [number, number] },
  ],
  cheer: [
    { file: `${SFX_DIR}crowd-cheer-0.mp3`, slice: [7.5, 15] as [number, number] },
    { file: `${SFX_DIR}crowd-cheer-1.mp3`, slice: [2, 11] as [number, number] },
  ],
  chant: { file: `${SFX_DIR}crowd-chant.mp3`, slice: [4.5, 13] as [number, number] },
};

export const CROWD = {
  /** The bed's gain: between plays, before a snap (on a big down it rises), and the hush when the home team's hurt. */
  bed: 0.35,
  bigDown: 0.6,
  hush: 0.18,
  /** Seconds the bed takes to move to a new level, and to come back after a hush or a reaction. */
  ramp: 0.8,
  hushHold: 2.5,
  /** Reactions: a roar for a home score or a home team's big play, a cheer for a good one; the away fans are this share of the noise. */
  roar: 0.9,
  cheer: 0.55,
  awayShare: 0.3,
  /** Yards that make a play big (a roar) or good (a cheer). */
  bigYards: 20,
  goodYards: 8,
  /** Seconds a reaction lasts before it fades. */
  reactFade: 1.8,
  /** Seconds to fade the stadium in at kickoff and out at the final. */
  fadeIn: 1.5,
  fadeOut: 2,
};

/** Credits shown on the title's SETTINGS page. Bert Cole's credit and link are required by his license. */
export const CREDITS: { line: string; sub: string }[] = [
  { line: 'MUSIC COMPOSED BY BERT COLE', sub: 'BITBYBITSOUND.COM' },
  { line: 'MUSIC BY LUIS ZUNO (ANSIMUZ)', sub: 'ANSIMUZ.COM' },
  { line: 'CROWD SOUNDS BY GREGOR QUENDEL', sub: 'CC-BY 4.0  OPENGAMEART.ORG' },
  { line: 'SOUND EFFECTS BY KENNEY', sub: 'CC0  KENNEY.NL' },
];
