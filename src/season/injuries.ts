import { athleteName, healthOf, starters, type Squad } from '../data/depth';
import { POS_ROLE } from '../data/positions';
import type { Role } from '../data/teams';
import type { Rng } from '../engine/math';
import type { GameGrade } from './grades';
import type { InjuryEvent, InjuryLevel, SeasonState, TeamState } from './types';
import { seasonRng } from './world';

/**
 * Health and injuries, rolled after each game from its grades (season/grades.ts): every snap a player
 * plays and every hit he takes can knock his health down or hurt him. A banged-up player still plays,
 * slower (`fitRatings`), and more likely to get hurt; the staff rest him when the backup is close.
 * Fit to NCAA Injury Surveillance numbers, then scaled down so injuries don't run the season.
 * See docs/INJURIES.md.
 */

/**
 * Injury tuning.
 * - `snap`: injury risk per snap by role (a kicker's snaps are his kicks); `hit`: risk per unit of
 *   contact (`HITS` in grades.ts). Risk becomes odds as `1 - exp(-risk)`.
 * - `knock`: knocks (health lost, still playing) per injury of risk; `knockHealth`: what one costs.
 * - `hurtRisk`: extra risk playing hurt, per share of health lost (at 70 health: x1.45).
 * - `weeks`: how long an injury keeps him out, as [weeks, weight]; 0 is the rest of the season.
 * - `recover`: health back each week, more if he didn't play; `returnHealth`: health on his return.
 * - `levels`: the season setting's multiplier on all of it.
 */
export const INJURY = {
  snap: {
    QB: 0.00011, RB: 0.00023, WR: 0.00017, TE: 0.00025, OL: 0.0002, DL: 0.00022, LB: 0.00026, CB: 0.00018, S: 0.00018, K: 0.0004, P: 0.0004,
  } as Record<Role, number>,
  hit: 0.0009,
  knock: 14,
  knockHealth: [10, 30] as [number, number],
  hurtRisk: 1.5,
  weeks: [[1, 0.36], [2, 0.22], [3, 0.12], [4, 0.08], [5, 0.04], [6, 0.03], [7, 0.03], [8, 0.02], [0, 0.1]] as [number, number][],
  recover: 12,
  recoverRest: 25,
  returnHealth: 85,
  levels: { off: 0, light: 0.5, normal: 1 } as Record<InjuryLevel, number>,
};

/** What's wrong, by how long it keeps him out (0 = the season). */
const TYPES: [number, string[]][] = [
  [1, ['ANKLE SPRAIN', 'HAMSTRING', 'SHOULDER', 'CONCUSSION', 'KNEE SPRAIN', 'HIP POINTER', 'BACK SPASMS']],
  [2, ['HIGH ANKLE SPRAIN', 'HAMSTRING STRAIN', 'CONCUSSION', 'MCL SPRAIN', 'SHOULDER SPRAIN', 'GROIN STRAIN']],
  [4, ['HIGH ANKLE SPRAIN', 'MCL SPRAIN', 'BROKEN HAND', 'TURF TOE', 'SEPARATED SHOULDER', 'RIB FRACTURE']],
  [8, ['BROKEN COLLARBONE', 'TORN MENISCUS', 'BROKEN FOOT', 'BROKEN ARM', 'LISFRANC SPRAIN']],
  [0, ['TORN ACL', 'TORN ACHILLES', 'BROKEN LEG', 'TORN PECTORAL', 'DISLOCATED HIP']],
];
/** Weeks out for a season-ending injury: past any schedule. */
export const SEASON_WEEKS = 99;

export function injuryLevel(state: SeasonState): number {
  return INJURY.levels[state.config.injuries ?? 'normal'];
}

function pickWeeks(rng: Rng): number {
  let x = rng() * INJURY.weeks.reduce((a, [, w]) => a + w, 0);
  for (const [wk, w] of INJURY.weeks) {
    if (x < w) return wk;
    x -= w;
  }
  return 1;
}

function injuryType(weeks: number, rng: Rng): string {
  const list = (weeks === 0 ? TYPES[TYPES.length - 1] : TYPES.find(([max]) => max > 0 && weeks <= max)!)[1];
  return list[Math.floor(rng() * list.length)];
}

/** One player's injury risk from a game: his snaps at his role's rate and the contact he took. */
export function injuryRisk(role: Role, g: Pick<GameGrade, 'snaps' | 'hits'>): number {
  return g.snaps * INJURY.snap[role] + g.hits * INJURY.hit;
}

/**
 * The week's healing, before this week's new injuries: weeks out count down (a player coming back
 * returns at `returnHealth`) and health recovers, faster for anyone who didn't play.
 */
export function healWeek(state: SeasonState, played: Set<string>): void {
  for (const ts of Object.values(state.teamState)) {
    const back = new Set<string>();
    for (const [id, inj] of Object.entries(ts.injuries ?? {})) {
      if (inj.weeks > 1) {
        inj.weeks--;
        continue;
      }
      delete ts.injuries![id];
      (ts.health ??= {})[id] = Math.min(ts.health[id] ?? 100, INJURY.returnHealth);
      back.add(id);
    }
    for (const [id, h] of Object.entries(ts.health ?? {})) {
      if (ts.injuries?.[id] || back.has(id)) continue;
      const next = h + (played.has(id) ? INJURY.recover : INJURY.recoverRest);
      if (next >= 100) delete ts.health![id];
      else ts.health![id] = next;
    }
  }
}

/**
 * Knocks and injuries from one game, for both teams. Each player draws from his own stream, so one
 * player's luck never shifts another's. Returns the injuries that cost games.
 */
export function injureGame(state: SeasonState, gameId: string, week: number, squads: Squad[], grades: Map<string, GameGrade>): InjuryEvent[] {
  const level = injuryLevel(state);
  if (!level) return [];
  const out: InjuryEvent[] = [];
  for (const sq of squads) {
    const ts: TeamState = (state.teamState[sq.team.id] ??= {});
    const starting = new Set(Object.values(starters(sq)).map((a) => a.id));
    for (const a of sq.athletes) {
      const g = grades.get(a.id);
      if (!g || !g.snaps) continue;
      const rng = seasonRng(state, 'injury', gameId, a.id);
      const h = healthOf(a);
      const risk = injuryRisk(POS_ROLE[a.pos], g) * (1 + INJURY.hurtRisk * (100 - h) / 100) * level;
      if (rng() < 1 - Math.exp(-risk)) {
        const wk = pickWeeks(rng);
        const type = injuryType(wk, rng);
        const season = wk === 0;
        (ts.injuries ??= {})[a.id] = { weeks: season ? SEASON_WEEKS : wk, type, ...(season ? { season } : {}) };
        out.push({
          week, team: sq.team.id, id: a.id, name: athleteName(a), pos: a.pos, weeks: season ? SEASON_WEEKS : wk, type,
          ...(season ? { season } : {}), starter: starting.has(a.id), ...(a.real ? { real: true } : {}),
        });
        continue;
      }
      if (rng() < 1 - Math.exp(-risk * INJURY.knock)) {
        const [lo, hi] = INJURY.knockHealth;
        (ts.health ??= {})[a.id] = Math.max(1, h - Math.round(lo + rng() * (hi - lo)));
      }
    }
  }
  return out;
}

/** "OUT 3 WEEKS", "OUT 1 WEEK", "OUT FOR SEASON". */
export function outText(inj: { weeks: number; season?: boolean }): string {
  return inj.season ? 'OUT FOR SEASON' : `OUT ${inj.weeks} WEEK${inj.weeks === 1 ? '' : 'S'}`;
}
