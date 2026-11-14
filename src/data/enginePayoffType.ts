/**
 * The engine's payoff table (docs/ENGINEDRIVES.md): success and explosive rate (%) of each play family
 * against each defensive call on engine snaps (the CPU QB reading the field), fitted by `npm run drives`
 * with the situation and the talent gap taken out. The learners in engine drives read it in place of the
 * film room's table (`filmPayoff.ts`), whose harness QB reads high to low on a fixed clock.
 */
export interface Payoff {
  /** Games it was fitted on. */
  games: number;
  /** Column ids: the calls. */
  cols: string[];
  /** By family: success and explosive rate (%) by column, at an even matchup on an early down. */
  rows: Record<string, { s: number[]; e: number[] }>;
}
