/**
 * A program's real history through the 2025 season (data/fbs/history.ts, built by
 * scripts/build_history.py). Display only: the team pages read it, the sim never does.
 */
export interface ProgramHistory {
  /** National titles the school claims. */
  natTitles: number[];
  /** Titles below the top division (FCS, I-AA, Division II, small college), for programs that came up from it. */
  fcsTitles?: number[];
  /** Conference titles, shared ones included, and the last. */
  confTitles: number;
  lastConf: number | null;
  /** College Football Playoff seasons, 2014 on. */
  playoffs: number[];
  bowls: { apps: number; w: number; l: number; t: number; last: number | null };
  heisman: { name: string; year: number }[];
  allTime: { w: number; l: number; t: number };
  /** The first season of the head coach the 2026 season opens with. */
  coachSince: number;
  /** The last five seasons, oldest first. */
  recent: PastSeason[];
}

export interface PastSeason {
  year: number;
  conf: string;
  w: number;
  l: number;
  cw: number;
  cl: number;
  ap?: number;
  /** The postseason, short and upper case: "W ROSE BOWL", "L CFP QF". */
  post?: string;
}
