import { CONFERENCES, type Conference } from '../data/fbs/profile';
import { CONF_RULES } from '../data/season/conferences';
import { BOWL_WINS, BOWLS, CFP_FORMAT } from '../data/season/postseason';
import { teamById } from '../data/teams';
import { records, standings, winner } from './standings';
import type { Bracket, SeasonGame, SeasonState } from './types';

/** Championship games: the top two in each conference that plays one, at a neutral site. */
export function confChampGames(state: SeasonState, week: number): SeasonGame[] {
  const out: SeasonGame[] = [];
  for (const c of CONFERENCES) {
    if (!CONF_RULES[c].champGame) continue;
    const rows = standings(state, c);
    if (rows.length < 2) continue;
    const [home, away] = [rows[0].team, rows[1].team];
    out.push({ id: `${state.year}-w${week}-${c}-champ`, week, home, away, kind: 'champ', neutral: true, name: `${c} Championship` });
  }
  return out;
}

/** Each conference's champion: the title game winner, or the standings leader where there is none. */
export function champions(state: SeasonState): Map<Conference, string> {
  const out = new Map<Conference, string>();
  for (const c of CONFERENCES) {
    if (c === 'Independent') continue;
    const game = state.games.find((g) => g.kind === 'champ' && g.name === `${c} Championship` && g.result);
    const w = game ? winner(game) : standings(state, c)[0]?.team;
    if (w) out.set(c, w);
  }
  return out;
}

/** The field, best seed first: the top `autoBids` champions by `order`, then the best of the rest. */
export function selectPlayoff(state: SeasonState, order: string[]): string[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const champs = [...champions(state).values()].sort((a, b) => rank.get(a)! - rank.get(b)!).slice(0, CFP_FORMAT.autoBids);
  const field = new Set(champs);
  for (const id of order) {
    if (field.size >= CFP_FORMAT.size) break;
    field.add(id);
  }
  return [...field].sort((a, b) => rank.get(a)! - rank.get(b)!);
}

/** Standard bracket order for `n` (a power of two): 1 v n, then the pairs that meet 1 latest. */
export function seedOrder(n: number): number[] {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2 + 1;
    order = order.flatMap((s) => [s, m - s]);
  }
  return order;
}

export function newBracket(seeds: string[]): Bracket {
  let n = 1;
  while (n < seeds.length) n *= 2;
  return { seeds, rounds: [seedOrder(n).map((s) => seeds[s - 1] ?? '')] };
}

const seedOf = (b: Bracket, id: string) => b.seeds.indexOf(id);

/**
 * Games for the latest round of the bracket, played in `week`. Byes advance straight away. The next
 * round's slots are added empty and filled in by `recordBracket`.
 */
export function bracketGames(state: SeasonState, week: number): SeasonGame[] {
  const b = state.bracket!;
  const r = b.rounds.length - 1;
  const cur = b.rounds[r];
  const next = new Array<string>(cur.length / 2).fill('');
  const out: SeasonGame[] = [];
  for (let i = 0; i < next.length; i++) {
    const [x, y] = [cur[2 * i], cur[2 * i + 1]];
    if (!x || !y) {
      next[i] = x || y;
      continue;
    }
    const [home, away] = seedOf(b, x) < seedOf(b, y) ? [x, y] : [y, x];
    const name = next.length === 1 ? 'CFP National Championship' : next.length === 2 ? 'CFP Semifinal' : next.length === 4 ? 'CFP Quarterfinal' : 'CFP First Round';
    out.push({
      id: `${state.year}-w${week}-cfp-r${r}-${i}`, week, home, away, kind: 'cfp', neutral: r >= CFP_FORMAT.campusRounds,
      name, round: r, slot: i,
    });
  }
  b.rounds.push(next);
  return out;
}

/** Move this round's winners into the next round; crown the champion after the final. */
export function recordBracket(state: SeasonState): void {
  const b = state.bracket!;
  for (const g of state.games) {
    if (g.kind !== 'cfp' || !g.result || g.round === undefined) continue;
    b.rounds[g.round + 1][g.slot!] = winner(g)!;
  }
  const last = b.rounds[b.rounds.length - 1];
  if (last.length === 1 && last[0]) b.champion = last[0];
}

/** True when the latest round is decided and another one is needed. */
export function bracketRoundDone(state: SeasonState): boolean {
  const b = state.bracket;
  return !!b && !b.champion && b.rounds[b.rounds.length - 1].every(Boolean);
}

/** Bowl games for eligible teams outside the playoff: each bowl takes the best team left from each tie-in. */
export function bowlGames(state: SeasonState, order: string[], playoff: string[], week: number): SeasonGame[] {
  const recs = records(state);
  const inPlayoff = new Set(playoff);
  const pool = order.filter((id) => !inPlayoff.has(id) && recs.get(id)!.w >= BOWL_WINS);
  const used = new Set<string>();
  const take = (conf: Conference | null) => {
    const id = pool.find((t) => !used.has(t) && (!conf || teamById(t).conference === conf)) ?? pool.find((t) => !used.has(t));
    if (id) used.add(id);
    return id;
  };
  const out: SeasonGame[] = [];
  for (const bowl of BOWLS) {
    const a = take(bowl.tieIns[0]);
    const b = take(bowl.tieIns[1]);
    if (!a || !b) break;
    const [home, away] = order.indexOf(a) < order.indexOf(b) ? [a, b] : [b, a];
    out.push({ id: `${state.year}-w${week}-bowl-${home}-${away}`, week, home, away, kind: 'bowl', neutral: true, name: bowl.name });
  }
  return out;
}
