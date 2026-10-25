import type { Conference } from '../data/fbs/profile';
import { CALENDAR } from '../data/season/calendar';
import { CONF_RULES, type ConferenceRules } from '../data/season/conferences';
import { RIVALRIES, type Rivalry } from '../data/season/rivalries';
import type { Team } from '../data/teams';
import type { Rng } from '../engine/math';
import type { SeasonGame } from './types';

export interface ScheduleRules {
  weeks: number;
  games: number;
  nonConfWeeks: number;
  rivalryWeek: number;
  conf: Record<Conference, ConferenceRules>;
  rivalries: Rivalry[];
}

export const DEFAULT_RULES: ScheduleRules = {
  weeks: CALENDAR.regularWeeks,
  games: CALENDAR.games,
  nonConfWeeks: CALENDAR.nonConfWeeks,
  rivalryWeek: CALENDAR.rivalryWeek,
  conf: CONF_RULES,
  rivalries: RIVALRIES,
};

interface Pairing {
  a: string;
  b: string;
  kind: 'conf' | 'nonconf';
  name?: string;
  rivalryWeek?: boolean;
}

const ATTEMPTS = 200;
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pair teams until each has played `need` more games: always the neediest team first, against the neediest
 * allowed partner (Havel-Hakimi style), restarting with a new shuffle if it paints itself into a corner.
 */
function fillPairs(
  ids: string[], need: Map<string, number>, taken: Set<string>, allowed: (a: string, b: string) => boolean, rng: Rng,
): [string, string][] {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const left = new Map(need);
    const used = new Set(taken);
    const out: [string, string][] = [];
    let stuck = false;
    for (;;) {
      const open = shuffle(ids.filter((id) => (left.get(id) ?? 0) > 0), rng).sort((x, y) => left.get(y)! - left.get(x)!);
      if (!open.length) break;
      const t = open[0];
      const partner = open.find((o) => o !== t && allowed(t, o) && !used.has(key(t, o)));
      if (!partner) {
        stuck = true;
        break;
      }
      out.push([t, partner]);
      used.add(key(t, partner));
      left.set(t, left.get(t)! - 1);
      left.set(partner, left.get(partner)! - 1);
    }
    if (!stuck) return out;
  }
  throw new Error('schedule: could not pair every team');
}

/** Put each game in a week both teams have free, most constrained game first; restart on a dead end. */
function assignWeeks(pairs: Pairing[], rules: ScheduleRules, rng: Rng): number[] {
  const weeks = Array.from({ length: rules.weeks }, (_, i) => i + 1);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const busy = new Map<string, Set<number>>();
    const busyOf = (id: string) => busy.get(id) ?? busy.set(id, new Set()).get(id)!;
    const out = new Array<number>(pairs.length).fill(0);
    const place = (i: number, w: number) => {
      out[i] = w;
      busyOf(pairs[i].a).add(w);
      busyOf(pairs[i].b).add(w);
    };
    let ok = true;
    pairs.forEach((p, i) => {
      if (!p.rivalryWeek) return;
      if (busyOf(p.a).has(rules.rivalryWeek) || busyOf(p.b).has(rules.rivalryWeek)) throw new Error(`schedule: two rivalry-week games for ${p.a} or ${p.b}`);
      place(i, rules.rivalryWeek);
    });
    let open = shuffle(pairs.map((_, i) => i).filter((i) => !out[i]), rng);
    while (open.length) {
      let best = -1;
      let bestFree: number[] = [];
      for (const i of open) {
        const free = weeks.filter((w) => !busyOf(pairs[i].a).has(w) && !busyOf(pairs[i].b).has(w));
        if (best < 0 || free.length < bestFree.length) {
          best = i;
          bestFree = free;
          if (!free.length) break;
        }
      }
      if (!bestFree.length) {
        ok = false;
        break;
      }
      const early = pairs[best].kind === 'nonconf';
      const preferred = bestFree.filter((w) => (w <= rules.nonConfWeeks) === early);
      const from = preferred.length ? preferred : bestFree;
      place(best, from[Math.floor(rng() * from.length)]);
      open = open.filter((i) => i !== best);
    }
    if (ok) return out;
  }
  throw new Error('schedule: could not fit the games into the weeks');
}

/**
 * The regular season: rivalries first, then conference games, then non-conference games to fill
 * everyone to `rules.games`, spread over `rules.weeks` with at most one game a week per team.
 * Odd-sized conferences can't always give every team exactly `confGames`; the shortfall becomes
 * non-conference games.
 */
export function generateSchedule(teams: Team[], year: number, rng: Rng, rules: ScheduleRules = DEFAULT_RULES): SeasonGame[] {
  const ids = teams.map((t) => t.id);
  const conf = new Map(teams.map((t) => [t.id, t.conference]));
  const count = new Map(ids.map((id) => [id, 0]));
  const confCount = new Map(ids.map((id) => [id, 0]));
  const taken = new Set<string>();
  const pairs: Pairing[] = [];
  const add = (p: Pairing) => {
    pairs.push(p);
    taken.add(key(p.a, p.b));
    for (const id of [p.a, p.b]) {
      count.set(id, count.get(id)! + 1);
      if (p.kind === 'conf') confCount.set(id, confCount.get(id)! + 1);
    }
  };

  for (const r of rules.rivalries) {
    if (!conf.has(r.a) || !conf.has(r.b) || taken.has(key(r.a, r.b))) continue;
    const kind = conf.get(r.a) === conf.get(r.b) && conf.get(r.a) !== 'Independent' ? 'conf' : 'nonconf';
    add({ a: r.a, b: r.b, kind, name: r.name, rivalryWeek: r.rivalryWeek });
  }

  for (const c of Object.keys(rules.conf) as Conference[]) {
    const k = rules.conf[c].confGames;
    const members = ids.filter((id) => conf.get(id) === c);
    if (!k || members.length < 2) continue;
    const need = new Map(members.map((id) => [id, Math.max(0, Math.min(k, members.length - 1) - confCount.get(id)!)]));
    // An odd total can't be paired; the team left short plays one more non-conference game.
    let total = [...need.values()].reduce((s, n) => s + n, 0);
    for (const id of shuffle(members, rng)) {
      if (total % 2 === 0) break;
      if (need.get(id)! > 0) {
        need.set(id, need.get(id)! - 1);
        total--;
      }
    }
    for (const [a, b] of fillPairs(members, need, taken, () => true, rng)) add({ a, b, kind: 'conf' });
  }

  const need = new Map(ids.map((id) => [id, Math.max(0, rules.games - count.get(id)!)]));
  const cross = (a: string, b: string) => conf.get(a) !== conf.get(b) || conf.get(a) === 'Independent';
  for (const [a, b] of fillPairs(ids, need, taken, cross, rng)) add({ a, b, kind: 'nonconf' });

  const weeks = assignWeeks(pairs, rules, rng);
  const order = pairs.map((_, i) => i).sort((x, y) => weeks[x] - weeks[y]);
  const homes = new Map(ids.map((id) => [id, 0]));
  const games: SeasonGame[] = [];
  for (const i of order) {
    const p = pairs[i];
    const ha = homes.get(p.a)!;
    const hb = homes.get(p.b)!;
    const aHome = ha < hb || (ha === hb && rng() < 0.5);
    const home = aHome ? p.a : p.b;
    const away = aHome ? p.b : p.a;
    homes.set(home, homes.get(home)! + 1);
    games.push({ id: `${year}-w${weeks[i]}-${away}-${home}`, week: weeks[i], home, away, kind: p.kind, neutral: false, name: p.name });
  }
  return games;
}
