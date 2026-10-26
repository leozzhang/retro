import { PROFILES } from './fbs/profiles';
import type { Conference, TeamProfile } from './fbs/profile';
import type { Ratings } from './ratings';

export type Role = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';

export type { Ratings } from './ratings';

/** The sim's view of a player on the field. Built from an `Athlete` by `onField` (data/depth.ts). */
export interface RosterPlayer {
  slot: string;
  role: Role;
  name: string;
  num: number;
  r: Ratings;
  skin: string;
  /** Confidence, -1..1 (data/confidence.ts): shifts his ratings snap by snap. Missing is 0. */
  conf?: number;
}

export interface TeamColors {
  primary: string;
  secondary: string;
  helmet: string;
  stripe: string;
  logo: string;
  mask: string;
  jerseyHome: string;
  trimHome: string;
  jerseyAway: string;
  trimAway: string;
  pantsHome: string;
  pantsAway: string;
  socks: string;
}

export interface Team {
  id: string;
  school: string;
  mascot: string;
  abbr: string;
  conference: Conference;
  colors: TeamColors;
  /** The research the roster is generated from. Team overalls come from the roster, see `teamRatings`. */
  profile: TeamProfile;
}

/** Hand-tuned uniforms; every other team's are derived from its two colors by `uniform`. */
const COLOR_OVERRIDES: Record<string, TeamColors> = {
  georgia: {
    primary: '#BA0C2F', secondary: '#000000', helmet: '#BA0C2F', stripe: '#111111', logo: '#000000', mask: '#9a9a9a',
    jerseyHome: '#BA0C2F', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#BA0C2F',
    pantsHome: '#bfc3c7', pantsAway: '#bfc3c7', socks: '#111111',
  },
  alabama: {
    primary: '#9E1B32', secondary: '#ffffff', helmet: '#9E1B32', stripe: '#ffffff', logo: '#ffffff', mask: '#9a9a9a',
    jerseyHome: '#9E1B32', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#9E1B32',
    pantsHome: '#f4f4f4', pantsAway: '#f4f4f4', socks: '#9E1B32',
  },
  ohiostate: {
    primary: '#BB0000', secondary: '#8f979c', helmet: '#aab3b8', stripe: '#BB0000', logo: '#BB0000', mask: '#9a9a9a',
    jerseyHome: '#BB0000', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#BB0000',
    pantsHome: '#8f979c', pantsAway: '#aab3b8', socks: '#111111',
  },
  texas: {
    primary: '#BF5700', secondary: '#ffffff', helmet: '#f4f4f4', stripe: '#BF5700', logo: '#BF5700', mask: '#9a9a9a',
    jerseyHome: '#BF5700', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#BF5700',
    pantsHome: '#f4f4f4', pantsAway: '#f4f4f4', socks: '#BF5700',
  },
  oregon: {
    primary: '#154733', secondary: '#FEE123', helmet: '#154733', stripe: '#FEE123', logo: '#FEE123', mask: '#FEE123',
    jerseyHome: '#154733', trimHome: '#FEE123', jerseyAway: '#f4f4f4', trimAway: '#154733',
    pantsHome: '#154733', pantsAway: '#f4f4f4', socks: '#FEE123',
  },
  michigan: {
    primary: '#00274C', secondary: '#FFCB05', helmet: '#00274C', stripe: '#FFCB05', logo: '#FFCB05', mask: '#FFCB05',
    jerseyHome: '#00274C', trimHome: '#FFCB05', jerseyAway: '#f4f4f4', trimAway: '#00274C',
    pantsHome: '#FFCB05', pantsAway: '#FFCB05', socks: '#00274C',
  },
  notredame: {
    primary: '#0C2340', secondary: '#C99700', helmet: '#C99700', stripe: '#C99700', logo: '#0C2340', mask: '#7d7d7d',
    jerseyHome: '#0C2340', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#0C2340',
    pantsHome: '#C99700', pantsAway: '#C99700', socks: '#0C2340',
  },
  clemson: {
    primary: '#F56600', secondary: '#522D80', helmet: '#f4f4f4', stripe: '#F56600', logo: '#F56600', mask: '#9a9a9a',
    jerseyHome: '#F56600', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#F56600',
    pantsHome: '#f4f4f4', pantsAway: '#F56600', socks: '#F56600',
  },
};

const WHITE = '#f4f4f4';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** A plausible uniform from a primary and secondary color: primary home jerseys, white away. */
export function uniform(primary: string, secondary: string): TeamColors {
  const lightSecondary = luminance(secondary) > 0.8;
  const trim = lightSecondary ? '#ffffff' : secondary;
  return {
    primary, secondary,
    helmet: primary, stripe: secondary, logo: secondary, mask: '#9a9a9a',
    jerseyHome: primary, trimHome: trim, jerseyAway: WHITE, trimAway: primary,
    pantsHome: lightSecondary ? WHITE : secondary, pantsAway: WHITE, socks: primary,
  };
}

/** Every FBS team in 2026, by conference (research in docs/ROSTERS.md). */
export const TEAMS: Team[] = PROFILES.map((p) => ({
  id: p.id,
  school: p.school,
  mascot: p.mascot,
  abbr: p.abbr,
  conference: p.conference,
  colors: COLOR_OVERRIDES[p.id] ?? uniform(p.colors.primary, p.colors.secondary),
  profile: p,
}));

export function teamById(id: string): Team {
  const t = TEAMS.find((x) => x.id === id);
  if (!t) throw new Error(`no team ${id}`);
  return t;
}

export const OFF_SLOTS = ['QB', 'RB', 'X', 'Z', 'SL', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'] as const;
export const DEF_SLOTS = ['DE1', 'DT1', 'DT2', 'DE2', 'WLB', 'MLB', 'CB1', 'CB2', 'NB', 'FS', 'SS'] as const;
/** Specialists. */
export const ST_SLOTS = ['K', 'P'] as const;
/** Depth players a formation can sub into an on-field slot. */
export const OFF_EXTRA = ['FB', 'TE2', 'WR4'] as const;
/** Defensive depth players for personnel packages: a strongside backer (base) and a dime back. */
export const DEF_EXTRA = ['SAM', 'DIME'] as const;
export type OffSlot = (typeof OFF_SLOTS)[number];
export type DefSlot = (typeof DEF_SLOTS)[number];
export type ExtraSlot = (typeof OFF_EXTRA)[number];
export type RosterOffSlot = OffSlot | ExtraSlot;
export type DefExtraSlot = (typeof DEF_EXTRA)[number];
export type RosterDefSlot = DefSlot | DefExtraSlot;

export const SLOT_ROLE: Record<string, Role> = {
  QB: 'QB', RB: 'RB', X: 'WR', Z: 'WR', SL: 'WR', TE: 'TE', LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
  DE1: 'DL', DT1: 'DL', DT2: 'DL', DE2: 'DL', WLB: 'LB', MLB: 'LB', CB1: 'CB', CB2: 'CB', NB: 'CB', FS: 'S', SS: 'S', K: 'K', P: 'P',
  FB: 'RB', TE2: 'TE', WR4: 'WR', SAM: 'LB', DIME: 'CB',
};
