import { overall, type Position } from '../data/positions';
import { scorer } from './gamePlays';
import type { GamePlay, PlayerLine, SeasonGame, SeasonState } from './types';
import { squadFor } from './world';

/**
 * The stars of a finished game, for its page (render/gameScreen.ts): the player of the game, the
 * player who most outplayed his rating, and the man behind the biggest play. A player's game is
 * scored against what his position usually does, so a big day from a receiver or a pass rusher
 * beats a routine one from a quarterback. Pure. Docs: docs/GAMES.md.
 */

/**
 * - `pts`: points per stat for a line's raw score.
 * - `base`: the mean and spread of that score per position, over the players with a line in a game,
 *   fit to simulated seasons (`npm run season`, GAME PAGES). Positions not listed use `def`.
 * - `win`: spreads added for playing on the winning side.
 * - `ovrMid`, `ovrSpan`: an overall `ovrSpan` above `ovrMid` is expected to score one spread higher.
 * - `minOver`: how far past his rating a player must play to be the overperformer; `maxOvr`: a
 *   player rated this high is a star, not an overperformer, whatever his day.
 * - `play`: the biggest play's weights: leverage, plus a score that ties or takes the lead, a
 *   turnover, and yards; a field goal counts `kick` of that.
 */
export const STARS = {
  pts: { passYd: 0.04, passTd: 4, int: -2, rushYd: 0.1, rushTd: 6, rec: 0.5, recYd: 0.1, recTd: 6, fgm: 3, fgMiss: -1, sk: 4, defInt: 6 },
  base: {
    QB: [17.6, 9.1], HB: [25.6, 12.8], FB: [25.6, 12.8], WR: [14.5, 8.5], TE: [7.2, 5.2], K: [3.7, 3.3], def: [5.7, 2.5],
  } as Partial<Record<Position | 'def', [number, number]>>,
  /**
   * A line is scored in spreads of `spread^pow * common^(1 - pow)`: 1 is each position's own spread
   * (sparse stats like sacks win too often), 0 one scale for all (yards win every time).
   */
  pow: 0.35,
  common: 10,
  /** How much of the position's usual game is taken off: below 1, the positions that pile up points (QB, HB) keep some of their head start. */
  meanW: 0.5,
  /**
   * Spreads added by position for the player of the game (not the overperformer): a team has one
   * quarterback and four or five receivers with a line, and a defender's line is only his sacks and
   * picks, so both need an edge to win their share. `def` is every defensive position.
   */
  edge: { QB: 0.6, def: 0.6 } as Partial<Record<Position | 'def', number>>,
  win: 0.6,
  ovrMid: 75,
  ovrSpan: 12,
  minOver: 1,
  maxOvr: 82,
  play: { lev: 1, lead: 0.4, turnover: 0.25, perYd: 1 / 150, kick: 0.5 },
};

const OFFENSE = new Set<Position>(['QB', 'HB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'K', 'P']);

/** A line's raw score (`STARS.pts`). */
export function impactPts(l: PlayerLine): number {
  const P = STARS.pts;
  return (
    l.passYds * P.passYd + l.passTd * P.passTd + l.int * P.int + l.rushYds * P.rushYd + l.rushTd * P.rushTd +
    l.rec * P.rec + l.recYds * P.recYd + l.recTd * P.recTd + l.fgm * P.fgm + (l.fga - l.fgm) * P.fgMiss +
    (l.sk ?? 0) * P.sk + (l.defInt ?? 0) * P.defInt
  );
}

/** A line's score in spreads above its position's usual game, with the position's `edge` when `edge`. */
export function impact(l: PlayerLine, edge = true): number {
  const off = OFFENSE.has(l.pos);
  const [mean, sd] = STARS.base[l.pos] ?? (off ? [0, 4] : STARS.base.def!);
  const z = (impactPts(l) - mean * STARS.meanW) / (sd ** STARS.pow * STARS.common ** (1 - STARS.pow));
  return edge ? z + ((off ? STARS.edge[l.pos] : STARS.edge.def) ?? 0) : z;
}

/** "18/27, 284 YDS, 3 TD, 1 INT", "21 CAR, 156 YDS, 2 TD", "7 REC, 143 YDS", "2 SK, 1 INT", "4/4 FG". */
export function statLine(l: PlayerLine): string {
  const parts: [number, string][] = [];
  if (l.att) parts.push([l.passYds * 0.6, `${l.cmp}/${l.att}, ${l.passYds} YDS${l.passTd ? `, ${l.passTd} TD` : ''}${l.int ? `, ${l.int} INT` : ''}`]);
  if (l.rush) parts.push([l.rushYds, `${l.rush} CAR, ${l.rushYds} YDS${l.rushTd ? `, ${l.rushTd} TD` : ''}`]);
  if (l.rec) parts.push([l.recYds, `${l.rec} REC, ${l.recYds} YDS${l.recTd ? `, ${l.recTd} TD` : ''}`]);
  if (l.sk || l.defInt) parts.push([100, [l.sk ? `${l.sk} SK` : '', l.defInt ? `${l.defInt} INT` : ''].filter(Boolean).join(', ')]);
  if (l.fga) parts.push([l.fgm * 20, `${l.fgm}/${l.fga} FG`]);
  return parts.sort((a, b) => b[0] - a[0]).slice(0, 2).map((p) => p[1]).join('  ');
}

export interface StarCard {
  kind: 'pog' | 'over' | 'play';
  title: string;
  id: string;
  team: string;
  name: string;
  pos: Position;
  /** The stat line, or the play's caption. */
  text: string;
  line?: PlayerLine;
  play?: GamePlay;
  /** The overperformer's overall. */
  ovr?: number;
}

/** How big a play was, for BIG PLAY (`STARS.play`). */
export function playSize(p: GamePlay, home: string): number {
  const W = STARS.play;
  const [h, a] = p.score;
  const homeOff = scorer(p) === home;
  const before = homeOff ? [h - p.pts, a] : [h, a - p.pts];
  const offBefore = homeOff ? before[0] - before[1] : before[1] - before[0];
  const leadSwing = p.pts > 0 && offBefore <= 0 && offBefore + p.pts >= 0;
  const turnover = p.kind === 'int' || p.kind === 'pick6' || p.kind === 'fumble' || p.kind === 'fourthStop';
  const size = (p.lev ?? 0) * W.lev + (leadSwing ? W.lead : 0) + (turnover ? W.turnover : 0) + Math.abs(p.yds) * W.perYd;
  return p.kind === 'fg' || p.kind === 'missedFg' ? size * W.kick : size;
}

/** Who a play is credited to on its page: the defender on a defensive play, else the carrier, receiver or kicker. */
export function playStar(p: GamePlay): { id: string; def: boolean } | null {
  if (DEFENSIVE.has(p.kind)) return p.by ? { id: p.by, def: true } : null;
  if (p.who) return { id: p.who, def: false };
  return null;
}

/** Plays that went the defense's way: the star of one is the defender who made it, or no one. */
export const DEFENSIVE = new Set(['int', 'pick6', 'sack', 'fumble', 'fourthStop', 'thirdStop', 'redZoneStop', 'twoPtStop', 'missedFg', 'safety', 'returnTd']);

/** The game's star cards, never the same player twice. `ovrOf` gives a player's overall (missing: `ovrMid`). */
export function gameStars(g: SeasonGame, ovrOf: (team: string, id: string) => number | undefined): StarCard[] {
  const r = g.result;
  if (!r) return [];
  const lines = r.box.players;
  const winner = r.home > r.away ? g.home : r.away > r.home ? g.away : '';
  const used = new Set<string>();
  const out: StarCard[] = [];
  const card = (kind: StarCard['kind'], title: string, l: PlayerLine): StarCard => ({ kind, title, id: l.id, team: l.team, name: l.name, pos: l.pos, text: statLine(l), line: l });

  const scored = lines.map((l) => ({ l, z: impact(l), raw: impact(l, false) }));
  const pog = [...scored].sort((a, b) => b.z + (b.l.team === winner ? STARS.win : 0) - (a.z + (a.l.team === winner ? STARS.win : 0)))[0];
  if (pog) {
    out.push(card('pog', 'PLAYER OF THE GAME', pog.l));
    used.add(pog.l.id);
  }

  const plays = (r.plays ?? []).filter((p) => playStar(p));
  const best = plays.map((p) => ({ p, s: playSize(p, g.home) })).sort((a, b) => b.s - a.s);
  const big = best.find((b) => !used.has(playStar(b.p)!.id)) ?? null;
  if (big) {
    const st = playStar(big.p)!;
    const team = st.def === (big.p.off === g.home) ? g.away : g.home;
    const l = lines.find((x) => x.id === st.id);
    out.push({ kind: 'play', title: 'BIG PLAY', id: st.id, team, name: l?.name ?? '', pos: l?.pos ?? 'WR', text: '', play: big.p, ...(l ? { line: l } : {}) });
    used.add(st.id);
  }

  const over = scored
    .filter((s) => !used.has(s.l.id))
    .map((s) => {
      const ovr = ovrOf(s.l.team, s.l.id);
      return { ...s, ovr, over: s.raw - ((ovr ?? STARS.ovrMid) - STARS.ovrMid) / STARS.ovrSpan };
    })
    .filter((s) => s.over >= STARS.minOver && (s.ovr ?? STARS.ovrMid) < STARS.maxOvr)
    .sort((a, b) => b.over - a.over)[0];
  if (over) out.push({ ...card('over', 'OVERPERFORMER', over.l), ...(over.ovr ? { ovr: over.ovr } : {}) });
  return out;
}

/** `gameStars` with overalls from the season's rosters as they are now. */
export function seasonGameStars(state: SeasonState, g: SeasonGame): StarCard[] {
  const cache = new Map<string, Map<string, number>>();
  return gameStars(g, (team, id) => {
    let m = cache.get(team);
    if (!m) {
      m = new Map(squadFor(state, team).athletes.map((a) => [a.id, overall(a.r, a.pos)]));
      cache.set(team, m);
    }
    return m.get(id);
  });
}
