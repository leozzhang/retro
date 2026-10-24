import { clamp, gauss, hashString, mulberry32, pick, type Rng } from '../engine/math';

export type Role = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';

export interface Ratings {
  spd: number; // top speed
  acc: number; // acceleration / route sharpness
  cth: number; // hands
  tkl: number; // tackling
  blk: number; // blocking
  str: number; // strength (pass rush power, breaking tackles)
  elu: number; // elusiveness (making tacklers miss)
  awr: number; // awareness (reaction time in coverage / pursuit)
  arm: number; // throw power
  thr: number; // throw accuracy
  kpw: number; // kick power (leg)
  kac: number; // kick accuracy
}

export interface RosterPlayer {
  slot: string;
  role: Role;
  name: string;
  num: number;
  r: Ratings;
  skin: string;
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
  conference: string;
  off: number; // offensive overall (60-99)
  def: number; // defensive overall (60-99)
  colors: TeamColors;
}

// Sample of FBS programs for the MVP. The full FBS list (all conferences,
// realistic strength tiers, real rosters) slots into this same schema later.
export const TEAMS: Team[] = [
  {
    id: 'georgia', school: 'Georgia', mascot: 'Bulldogs', abbr: 'UGA', conference: 'SEC', off: 90, def: 92,
    colors: {
      primary: '#BA0C2F', secondary: '#000000', helmet: '#BA0C2F', stripe: '#111111', logo: '#000000', mask: '#9a9a9a',
      jerseyHome: '#BA0C2F', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#BA0C2F',
      pantsHome: '#bfc3c7', pantsAway: '#bfc3c7', socks: '#111111',
    },
  },
  {
    id: 'alabama', school: 'Alabama', mascot: 'Crimson Tide', abbr: 'BAMA', conference: 'SEC', off: 88, def: 88,
    colors: {
      primary: '#9E1B32', secondary: '#ffffff', helmet: '#9E1B32', stripe: '#ffffff', logo: '#ffffff', mask: '#9a9a9a',
      jerseyHome: '#9E1B32', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#9E1B32',
      pantsHome: '#f4f4f4', pantsAway: '#f4f4f4', socks: '#9E1B32',
    },
  },
  {
    id: 'ohiostate', school: 'Ohio State', mascot: 'Buckeyes', abbr: 'OSU', conference: 'Big Ten', off: 93, def: 91,
    colors: {
      primary: '#BB0000', secondary: '#8f979c', helmet: '#aab3b8', stripe: '#BB0000', logo: '#BB0000', mask: '#9a9a9a',
      jerseyHome: '#BB0000', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#BB0000',
      pantsHome: '#8f979c', pantsAway: '#aab3b8', socks: '#111111',
    },
  },
  {
    id: 'texas', school: 'Texas', mascot: 'Longhorns', abbr: 'TEX', conference: 'SEC', off: 91, def: 89,
    colors: {
      primary: '#BF5700', secondary: '#ffffff', helmet: '#f4f4f4', stripe: '#BF5700', logo: '#BF5700', mask: '#9a9a9a',
      jerseyHome: '#BF5700', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#BF5700',
      pantsHome: '#f4f4f4', pantsAway: '#f4f4f4', socks: '#BF5700',
    },
  },
  {
    id: 'oregon', school: 'Oregon', mascot: 'Ducks', abbr: 'ORE', conference: 'Big Ten', off: 91, def: 86,
    colors: {
      primary: '#154733', secondary: '#FEE123', helmet: '#154733', stripe: '#FEE123', logo: '#FEE123', mask: '#FEE123',
      jerseyHome: '#154733', trimHome: '#FEE123', jerseyAway: '#f4f4f4', trimAway: '#154733',
      pantsHome: '#154733', pantsAway: '#f4f4f4', socks: '#FEE123',
    },
  },
  {
    id: 'michigan', school: 'Michigan', mascot: 'Wolverines', abbr: 'MICH', conference: 'Big Ten', off: 84, def: 88,
    colors: {
      primary: '#00274C', secondary: '#FFCB05', helmet: '#00274C', stripe: '#FFCB05', logo: '#FFCB05', mask: '#FFCB05',
      jerseyHome: '#00274C', trimHome: '#FFCB05', jerseyAway: '#f4f4f4', trimAway: '#00274C',
      pantsHome: '#FFCB05', pantsAway: '#FFCB05', socks: '#00274C',
    },
  },
  {
    id: 'notredame', school: 'Notre Dame', mascot: 'Fighting Irish', abbr: 'ND', conference: 'Independent', off: 89, def: 89,
    colors: {
      primary: '#0C2340', secondary: '#C99700', helmet: '#C99700', stripe: '#C99700', logo: '#0C2340', mask: '#7d7d7d',
      jerseyHome: '#0C2340', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#0C2340',
      pantsHome: '#C99700', pantsAway: '#C99700', socks: '#0C2340',
    },
  },
  {
    id: 'clemson', school: 'Clemson', mascot: 'Tigers', abbr: 'CLEM', conference: 'ACC', off: 86, def: 86,
    colors: {
      primary: '#F56600', secondary: '#522D80', helmet: '#f4f4f4', stripe: '#F56600', logo: '#F56600', mask: '#9a9a9a',
      jerseyHome: '#F56600', trimHome: '#ffffff', jerseyAway: '#f4f4f4', trimAway: '#F56600',
      pantsHome: '#f4f4f4', pantsAway: '#F56600', socks: '#F56600',
    },
  },
];

export const OFF_SLOTS = ['QB', 'RB', 'X', 'Z', 'SL', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'] as const;
export const DEF_SLOTS = ['DE1', 'DT1', 'DT2', 'DE2', 'WLB', 'MLB', 'CB1', 'CB2', 'NB', 'FS', 'SS'] as const;
/** Specialists, generated after everyone else so the other players' ratings don't depend on them. */
export const ST_SLOTS = ['K', 'P'] as const;
/** Depth players a formation can sub into an on-field slot. Generated last so existing ratings don't change. */
export const OFF_EXTRA = ['FB', 'TE2', 'WR4'] as const;
/** Defensive depth players for personnel packages: a strongside backer (base) and a dime back. Generated last. */
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

/** Per-slot tweaks on top of the role template: a fullback is a blocking back. */
const SLOT_ADJ: Partial<Record<string, Partial<Ratings>>> = {
  FB: { spd: -8, elu: -18, cth: -6, blk: 15, str: 6 },
};

// Archetype ratings for a roughly 80-overall player at each position.
// Only specialists get kick ratings rolled; everyone else has a flat 30.
const TEMPLATE: Record<Role, Omit<Ratings, 'kpw' | 'kac'>> = {
  QB: { spd: 72, acc: 76, cth: 50, tkl: 30, blk: 30, str: 60, elu: 66, awr: 82, arm: 86, thr: 84 },
  RB: { spd: 89, acc: 89, cth: 70, tkl: 35, blk: 55, str: 76, elu: 86, awr: 72, arm: 40, thr: 30 },
  WR: { spd: 91, acc: 89, cth: 85, tkl: 30, blk: 45, str: 55, elu: 82, awr: 76, arm: 40, thr: 30 },
  TE: { spd: 79, acc: 77, cth: 79, tkl: 40, blk: 70, str: 76, elu: 66, awr: 74, arm: 40, thr: 30 },
  OL: { spd: 52, acc: 56, cth: 30, tkl: 40, blk: 83, str: 86, elu: 30, awr: 74, arm: 30, thr: 30 },
  DL: { spd: 70, acc: 74, cth: 40, tkl: 78, blk: 40, str: 85, elu: 40, awr: 72, arm: 30, thr: 30 },
  LB: { spd: 80, acc: 81, cth: 60, tkl: 85, blk: 45, str: 76, elu: 50, awr: 78, arm: 30, thr: 30 },
  CB: { spd: 92, acc: 91, cth: 66, tkl: 66, blk: 35, str: 55, elu: 70, awr: 80, arm: 30, thr: 30 },
  S: { spd: 88, acc: 87, cth: 66, tkl: 79, blk: 40, str: 65, elu: 60, awr: 82, arm: 30, thr: 30 },
  K: { spd: 62, acc: 64, cth: 50, tkl: 35, blk: 25, str: 50, elu: 45, awr: 70, arm: 35, thr: 35 },
  P: { spd: 64, acc: 64, cth: 72, tkl: 35, blk: 25, str: 52, elu: 45, awr: 70, arm: 45, thr: 40 },
};
const KICK_TEMPLATE: Partial<Record<Role, Pick<Ratings, 'kpw' | 'kac'>>> = {
  K: { kpw: 85, kac: 84 },
  P: { kpw: 84, kac: 80 },
};

const FIRST = [
  'Jalen', 'Marcus', 'Tyler', 'Caleb', 'Jaylen', 'Drew', 'Bryce', 'Trey', 'Malik', 'Cole', 'Devin', 'Isaiah', 'Mason',
  'Xavier', 'Carson', 'Jordan', 'Kendrick', 'Luke', 'Darius', 'Quinn', 'Andre', 'Brady', 'Camden', 'DeShawn', 'Elijah',
  'Gavin', 'Hunter', 'Jace', 'Kamari', 'Landon', 'Micah', 'Nico', 'Omari', 'Peyton', 'Rashad', 'Sawyer', 'Tre', 'Wyatt',
  'Zion', 'Ty',
];
const LAST = [
  'Johnson', 'Williams', 'Carter', 'Brooks', 'Henderson', 'Mitchell', 'Bennett', 'Ward', 'Price', 'Sanders', 'Hayes',
  'Coleman', 'Jenkins', 'Barnes', 'Fisher', 'Graham', 'Hollis', 'Irving', 'Kelley', 'Lawson', 'Moss', 'Nelson',
  'Owens', 'Porter', 'Reed', 'Stokes', 'Turner', 'Vaughn', 'Walker', 'Young', 'Banks', 'Dawson', 'Ellis', 'Foster',
  'Gaines', 'Harper', 'Jackson', 'Knight', 'Lockett', 'McCoy', 'Norris', 'Pryor', 'Rollins', 'Simmons', 'Tate',
  'Whitfield', 'Burrell', 'Crawford', 'Daniels', 'Spencer',
];
const SKINS = ['#f1c9a5', '#e0ac85', '#c68a5e', '#9c6440', '#7a4a2a', '#5a3620'];

const NUM_RANGES: Record<Role, [number, number][]> = {
  QB: [[1, 19]], RB: [[0, 9], [20, 39]], WR: [[0, 19], [80, 88]], TE: [[80, 89]], OL: [[50, 79]],
  DL: [[90, 99], [40, 49]], LB: [[0, 9], [40, 59]], CB: [[0, 39]], S: [[0, 39]],
  K: [[1, 49], [90, 99]], P: [[1, 49], [90, 99]],
};

function pickNumber(rng: Rng, role: Role, used: Set<number>): number {
  const ranges = NUM_RANGES[role];
  for (let i = 0; i < 50; i++) {
    const [lo, hi] = pick(rng, ranges);
    const n = lo + Math.floor(rng() * (hi - lo + 1));
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  return Math.floor(rng() * 99);
}

/**
 * Generates placeholder rosters whose ratings scale with team strength.
 * Real FBS rosters can replace this by supplying RosterPlayer data directly.
 */
export function generateRoster(team: Team): Record<string, RosterPlayer> {
  const rng = mulberry32(hashString(team.id));
  const roster: Record<string, RosterPlayer> = {};
  const used = new Set<number>();
  for (const slot of [...OFF_SLOTS, ...DEF_SLOTS, ...ST_SLOTS, ...OFF_EXTRA, ...DEF_EXTRA]) {
    const role = SLOT_ROLE[slot];
    const st = (ST_SLOTS as readonly string[]).includes(slot);
    const offense = (OFF_SLOTS as readonly string[]).includes(slot) || (OFF_EXTRA as readonly string[]).includes(slot);
    const ovr = st ? (team.off + team.def) / 2 : offense ? team.off : team.def;
    const shift = (ovr - 80) * 0.8 + gauss(rng) * 3;
    const base: Partial<Ratings> = { ...TEMPLATE[role], ...KICK_TEMPLATE[role] };
    for (const [k, v] of Object.entries(SLOT_ADJ[slot] ?? {}) as [keyof Ratings, number][]) base[k] = base[k]! + v;
    const r = { kpw: 30, kac: 30 } as Ratings;
    for (const k of Object.keys(base) as (keyof Ratings)[]) {
      // Specialists' strength matters less than for position players.
      r[k] = Math.round(clamp(base[k]! + shift * (st ? 0.5 : 1) + gauss(rng) * 3, 25, 99));
    }
    roster[slot] = {
      slot,
      role,
      name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
      num: pickNumber(rng, role, used),
      r,
      skin: pick(rng, SKINS),
    };
  }
  return roster;
}
