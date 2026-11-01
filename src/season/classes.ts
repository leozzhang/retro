import { CLASS_YEARS, type Athlete, type ClassYear } from '../data/athletes';
import { joinYear } from '../data/rosterGen';
import { CALENDAR } from '../data/season/calendar';

/**
 * Class years that move (docs/RECRUITING_PLAN.md, phase 1). A player's class is never stored: it comes
 * from where he started (his generated class in the first season, or a freshman in the season his
 * walk-on or freshman id names) plus the seasons since, less a redshirt year (`Progress.rs`). The
 * season he redshirts counts as his class that year; from the next season he's "RS" and a year behind.
 */

export interface ClassNow {
  year: ClassYear;
  redshirt: boolean;
  /** 0 FR .. 3 SR. */
  idx: number;
  /** Which season in the program this is: 1 for a true freshman. */
  seasons: number;
}

/** His class in season `year`, from how he was generated and the season he redshirted (if any). */
export function classIn(gen: Pick<Athlete, 'id' | 'year' | 'redshirt'>, year: number, rs?: number): ClassNow {
  const joined = joinYear(gen.id);
  const from = joined ?? CALENDAR.year;
  const idx0 = joined === undefined ? CLASS_YEARS.indexOf(gen.year) : 0;
  const took = rs !== undefined && rs < year;
  const raw = idx0 + (year - from) - (took ? 1 : 0);
  const idx = Math.max(0, Math.min(3, raw));
  const redshirt = (joined === undefined && gen.redshirt) || took;
  return { year: CLASS_YEARS[idx], redshirt, idx, seasons: idx + (redshirt ? 1 : 0) + 1 };
}

/** The athlete in his class for season `year` (the same object when nothing changed). */
export function withClass<T extends Athlete>(a: T, year: number, rs?: number): T {
  const c = classIn(a, year, rs);
  return c.year === a.year && c.redshirt === a.redshirt ? a : { ...a, year: c.year, redshirt: c.redshirt };
}

/** Out of eligibility after season `year`: a senior who didn't take his redshirt this season. */
export function outOfEligibility(gen: Pick<Athlete, 'id' | 'year' | 'redshirt'>, year: number, rs?: number): boolean {
  return classIn(gen, year, rs).idx === 3 && rs !== year;
}
