import type { Position } from '../data/positions';
import { latestPoll, rankIn } from './polls';
import { seasonStats, type SeasonLine } from './stats';
import { records } from './standings';
import type { Award, SeasonState } from './types';

/**
 * Awards score players from their season stats, scaled by how their team is doing: a Heisman race
 * needs a winning team behind the numbers.
 */

/** Production points: a touchdown is worth about 60 rushing yards. */
function production(s: SeasonLine): number {
  return s.passYds / 25 + s.passTd * 4 - s.int * 2 + s.rushYds / 10 + s.rushTd * 6 + s.recYds / 10 + s.recTd * 6;
}

function kicking(s: SeasonLine): number {
  return s.fgm * 3 - (s.fga - s.fgm) * 2;
}

/** Team success multiplier: win % and AP rank. */
const TEAM_WIN = 0.6;
const TEAM_RANK = 0.5;

export interface AwardDef {
  id: string;
  name: string;
  /** Eligible positions; empty means everyone. */
  pos: Position[];
  score: (s: SeasonLine) => number;
  /** Whether team success scales the score. */
  team: boolean;
}

export const AWARDS: AwardDef[] = [
  { id: 'heisman', name: 'Heisman Trophy', pos: [], score: production, team: true },
  { id: 'obrien', name: "Davey O'Brien Award", pos: ['QB'], score: production, team: true },
  { id: 'walker', name: 'Doak Walker Award', pos: ['HB', 'FB'], score: production, team: false },
  { id: 'biletnikoff', name: 'Biletnikoff Award', pos: ['WR', 'TE'], score: production, team: false },
  { id: 'groza', name: 'Lou Groza Award', pos: ['K'], score: kicking, team: false },
];

export function awardRace(state: SeasonState, def: AwardDef, n = 5): Award {
  const recs = records(state);
  const ap = latestPoll(state, 'ap');
  const scored = [...seasonStats(state).values()]
    .filter((s) => !def.pos.length || def.pos.includes(s.pos))
    .map((s) => {
      let score = def.score(s);
      if (def.team) {
        const r = recs.get(s.team)!;
        const winPct = r.w + r.l ? r.w / (r.w + r.l) : 0;
        const rank = rankIn(ap, s.team);
        score *= 1 + TEAM_WIN * (winPct - 0.5) + (rank ? (TEAM_RANK * (26 - rank)) / 25 : 0);
      }
      return { id: s.id, team: s.team, name: s.name, pos: s.pos, score: Math.round(score) };
    })
    .sort((a, b) => b.score - a.score);
  return { id: def.id, name: def.name, finalists: scored.slice(0, n) };
}

export function heismanRace(state: SeasonState, n = 5): Award {
  return awardRace(state, AWARDS[0], n);
}

export function seasonAwards(state: SeasonState): Award[] {
  return AWARDS.map((d) => awardRace(state, d));
}
