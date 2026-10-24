import type { ClassYear } from '../athletes';
import type { Position } from '../positions';

export type Conference = 'SEC' | 'Big Ten' | 'ACC' | 'Big 12' | 'Pac-12' | 'American' | 'Mountain West' | 'Sun Belt' | 'MAC' | 'C-USA' | 'Independent';

export const CONFERENCES: Conference[] = ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac-12', 'American', 'Mountain West', 'Sun Belt', 'MAC', 'C-USA', 'Independent'];

/** Position groups a profile can call a strength or weakness. */
export type Unit = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';

/** A real player from the research; placed on the roster under his own name. */
export interface Standout {
  name: string;
  pos: Position;
  year: ClassYear;
  redshirt: boolean;
  archetype: string;
  /** elite: All-American level; star: all-conference; good: a quality starter. */
  tier: 'elite' | 'star' | 'good';
  note: string;
}

/** What the research says about a program in 2026. The roster generator builds everything else from it. */
export interface TeamProfile {
  id: string;
  school: string;
  mascot: string;
  abbr: string;
  conference: Conference;
  colors: { primary: string; secondary: string };
  /** 1 national power .. 5 bottom FBS / new to FBS. */
  tier: 1 | 2 | 3 | 4 | 5;
  /** Tradition and brand, 1-100. */
  prestige: number;
  /** 2026 record as of the research date (2026-10-24). */
  record: string;
  /** Overall of a typical starter on each unit. */
  target: { off: number; def: number; st: number };
  offense: { qbStyle: 'pocket' | 'dual' | 'runner'; scheme: 'air-raid' | 'spread' | 'pro' | 'option' | 'power-run' };
  /** Position groups clearly better (+) or worse (-) than the rest of the team, -2..2. */
  units: Partial<Record<Unit, number>>;
  standouts: Standout[];
}
