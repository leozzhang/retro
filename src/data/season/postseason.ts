import type { Conference } from '../fbs/profile';

/**
 * The playoff format. Seeds follow the final CFP rankings. The bracket is the next power of two, so a
 * 12-team field gives the top 4 seeds a first-round bye.
 */
export const CFP_FORMAT = {
  size: 12,
  /** The highest-ranked conference champions get in automatically. */
  autoBids: 5,
  /** First-round games are on the higher seed's campus; later rounds are neutral. */
  campusRounds: 1,
};

/** Wins needed for a bowl (regular season plus the conference championship game). */
export const BOWL_WINS = 6;

export interface BowlDef {
  name: string;
  /** Conferences the bowl picks from first, one per slot; a missing entry is an at-large pick. */
  tieIns: [Conference | null, Conference | null];
}

/**
 * Non-playoff bowls, best pick first. A starter list: the real lineup has about 40, and the New Year's Six
 * also host playoff games, which isn't modeled.
 */
export const BOWLS: BowlDef[] = [
  { name: 'Citrus Bowl', tieIns: ['SEC', 'Big Ten'] },
  { name: 'Alamo Bowl', tieIns: ['Big 12', 'Pac-12'] },
  { name: 'Gator Bowl', tieIns: ['SEC', 'ACC'] },
  { name: 'Pop-Tarts Bowl', tieIns: ['ACC', 'Big 12'] },
  { name: 'Holiday Bowl', tieIns: ['Pac-12', 'ACC'] },
  { name: 'ReliaQuest Bowl', tieIns: ['SEC', 'Big Ten'] },
  { name: 'Music City Bowl', tieIns: ['SEC', 'Big Ten'] },
  { name: 'Texas Bowl', tieIns: ['SEC', 'Big 12'] },
  { name: 'Las Vegas Bowl', tieIns: ['Big Ten', 'Pac-12'] },
  { name: 'Liberty Bowl', tieIns: ['SEC', 'Big 12'] },
  { name: 'Pinstripe Bowl', tieIns: ['ACC', 'Big Ten'] },
  { name: 'Sun Bowl', tieIns: ['ACC', 'Pac-12'] },
  { name: 'Military Bowl', tieIns: ['ACC', 'American'] },
  { name: 'Armed Forces Bowl', tieIns: ['American', 'Big 12'] },
  { name: 'Birmingham Bowl', tieIns: ['American', 'SEC'] },
  { name: 'First Responder Bowl', tieIns: ['American', 'C-USA'] },
  { name: 'LA Bowl', tieIns: ['Mountain West', 'Pac-12'] },
  { name: 'Hawaii Bowl', tieIns: ['Mountain West', 'American'] },
  { name: 'Arizona Bowl', tieIns: ['Mountain West', 'MAC'] },
  { name: 'Camellia Bowl', tieIns: ['Sun Belt', 'MAC'] },
  { name: 'New Orleans Bowl', tieIns: ['Sun Belt', 'C-USA'] },
  { name: 'Boca Raton Bowl', tieIns: ['American', 'MAC'] },
  { name: 'Cure Bowl', tieIns: ['Sun Belt', 'American'] },
  { name: 'Frisco Bowl', tieIns: ['American', 'Mountain West'] },
  { name: 'Myrtle Beach Bowl', tieIns: ['Sun Belt', 'C-USA'] },
  { name: 'Potato Bowl', tieIns: ['Mountain West', 'MAC'] },
  { name: 'Bahamas Bowl', tieIns: ['C-USA', 'MAC'] },
  { name: 'GameAbove Sports Bowl', tieIns: ['MAC', 'Big Ten'] },
  { name: 'New Mexico Bowl', tieIns: ['Mountain West', 'C-USA'] },
  { name: 'Independence Bowl', tieIns: [null, null] },
  { name: 'Fenway Bowl', tieIns: ['ACC', 'American'] },
  { name: 'Duke\'s Mayo Bowl', tieIns: ['ACC', 'SEC'] },
];
