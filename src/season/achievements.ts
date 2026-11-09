import { coachName } from '../data/coaches';
import { athleteName, generatedAthlete, starters } from '../data/depth';
import { TEAM_STATE } from '../data/fbs/geo';
import { anchorsOf, ROOMS, SLOT_FALLBACK, type Anchor, type SlotKind } from '../data/office';
import { prospect } from '../data/recruits';
import { parseWalkOn } from '../data/rosterGen';
import { RIVALRIES } from '../data/season/rivalries';
import { teamById } from '../data/teams';
import { coachNow, treeOf } from './carousel';
import { latestPoll, rankIn } from './polls';
import { pastSeasons, rivalrySeries } from './program';
import { baseRoster, headCoachFor, squadFor } from './world';
import type { DraftPick, OfficeItem, OfficeMark, OfficeState, SeasonGame, SeasonState, SeasonSummary, TeamYear } from './types';

/**
 * The coach's office (docs/OFFICE.md): achievements as things on the wall. Each achievement has a
 * detector that runs at one point in the dynasty (after each week's games, at the end of the season,
 * after the carousel, the draft or signing day) and returns what it finds. An item's `key` makes
 * finding it twice a no-op.
 *
 * Most achievements level up instead of piling up: everything one finds folds into a single item
 * (its `log`), and the item's art grows at each of the def's `levels`. Only the classic trophies
 * (conference and national titles, Heismans, first-round jerseys) stay one item each.
 *
 * Display only: nothing in the sim reads the office, and finding items takes no randomness.
 */

export type OfficeHook = 'game' | 'season' | 'carousel' | 'draft' | 'signing';

/**
 * What a detector found. For a one-of-a-kind item, the item. For a leveled one, one entry in its log:
 * `key` is the entry's, the item's is `stack` (or the def's id); `line` is the log's line, and `data`
 * replaces the item's (its latest).
 */
export type Found = Omit<OfficeItem, 'id' | 'rev' | 'fresh' | 'log' | 'up'> & { line?: string; v?: string; stack?: string };

export interface AchievementDef {
  id: string;
  name: string;
  /** The LIST page's nudge before it's found. */
  hint: string;
  slot: SlotKind;
  on: OfficeHook;
  /** The card's lines for one item. */
  desc: (it: OfficeItem) => string[];
  /** Placement order within its kind: lower goes up first (a jersey wall by draft pick). */
  order?: (it: OfficeItem) => number;
  /** A leveled item: the log length each level needs, from 1. */
  levels?: number[];
  /** A bad moment: shown apart on the LIST page. */
  bad?: boolean;
  /** What it finds for team `me`, whose office so far is `o`. */
  find: (s: SeasonState, week: number, me: string, o: OfficeState) => Found[];
}

const school = (id: string) => teamById(id).school;
const opp = (g: SeasonGame, id: string) => (g.home === id ? g.away : g.home);
const caps = (s: string) => s.toUpperCase();

interface Played {
  g: SeasonGame;
  us: number;
  them: number;
  vs: string;
  home: boolean;
}

/** Team `me`'s games played this week, with the score from its side. */
function gamesOf(s: SeasonState, week: number, me: string): Played[] {
  return s.games
    .filter((g) => g.week === week && g.result && (g.home === me || g.away === me))
    .map((g) => {
      const home = g.home === me;
      return { g, home, us: home ? g.result!.home : g.result!.away, them: home ? g.result!.away : g.result!.home, vs: opp(g, me) };
    });
}

/** AP rank going into the game (0 = unranked). */
const rankAt = (s: SeasonState, g: SeasonGame, team: string) => rankIn(latestPoll(s, 'ap', g.week), team);

const isRival = (a: string, b: string) => RIVALRIES.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));

/** The user's finished seasons as his school's coach. */
export function userYears(s: SeasonState): TeamYear[] {
  return coachYears(s, s.config.userTeamId);
}

/**
 * Team `me`'s finished seasons under the coach the office belongs to, with their years: the user's
 * when it's his team, every dynasty season otherwise (the season report's offices for every team).
 */
function coachRows(s: SeasonState, me: string, before = Infinity): (TeamYear & { year: number })[] {
  const mine = me === s.config.userTeamId;
  return s.history
    .filter((h) => h.year < before)
    .map((h) => (h.teams?.[me] ? { ...h.teams[me], year: h.year } : undefined))
    .filter((y): y is TeamYear & { year: number } => !!y && (!mine || y.hc === 'YOU'));
}
const coachYears = (s: SeasonState, me: string): TeamYear[] => coachRows(s, me);

/** This season's finished row for `me` (the `season` hook runs after it's written). */
const thisYear = (s: SeasonState, me: string): TeamYear | undefined => s.history.find((h) => h.year === s.year)?.teams?.[me];

/** The draft just held: the newest season with one (during the offseason and after it rolls over). */
function lastDraft(s: SeasonState): SeasonSummary | undefined {
  for (let i = s.history.length - 1; i >= 0; i--) if (s.history[i].draft) return s.history[i];
  return undefined;
}

/** A log line's own: the game's score and opponent. */
const vsLine = (x: Played) => `${x.us}-${x.them} ${x.us > x.them ? 'over' : 'to'} ${school(x.vs)}`;
const gameFound = (s: SeasonState, x: Played, key: string, line: string, data: OfficeItem['data'] = {}): Found => ({
  key, year: s.year, week: x.g.week, game: x.g.id, team: x.home ? x.g.home : x.g.away, line,
  data: { us: x.us, them: x.them, vs: x.vs, ...data },
});
const seasonFound = (s: SeasonState, me: string, key: string, line: string, data: OfficeItem['data'] = {}, v?: string): Found => ({
  key, year: s.year, team: me, line, data, ...(v ? { v } : {}),
});

/** Career wins milestones for the ball rack: one ball (level) each. */
const WIN_MARKS = [10, 25, 50, 100, 150, 200, 250, 300];
/** Seasons at one school for the portrait. */
const HAUL_MARKS = [5, 10, 15, 20, 25];
/** Straight wins over one rival for the doormat. */
const MAT_MARKS = [3, 5, 8, 10];

export const OFFICE = {
  /** Stop the Presses: an unranked team beating a ranked one by this much. */
  paperMargin: 30,
  /** The Comeback: won after trailing by this much. */
  comeback: 21,
  /** Ice Water: a field goal to take the lead with this many seconds left or fewer. */
  iceTime: 5,
  /** Air Show: one passer's touchdowns. Ground and Pound: the team's rushing yards. Marathon: overtimes. */
  airTds: 6,
  groundYds: 350,
  marathonOt: 3,
  /** Hate Mail: lost to a rival by this much. */
  hateMargin: 28,
  /** Homegrown: the share of starters from the school's state in a title season. */
  homeShare: 0.6,
  /** Prove 'Em Wrong: unranked in the preseason poll, then this or better in the final one. */
  proveRank: 10,
  /** Turnaround: wins after the program's losing season. */
  turnWins: 10,
  /** Draft Night: first-rounders in one draft. */
  draftNight: 3,
  /** For Sale: losing seasons in a row. */
  saleYears: 3,
  /** From Nowhere: a walk-on drafted, or a recruit with this many stars or fewer drafted by this round. */
  nowhereStars: 3,
  nowhereRound: 2,
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const n = (it: OfficeItem) => it.log?.length ?? 1;
const d = (it: OfficeItem, k: string) => it.data?.[k];

export const ACHIEVEMENTS: AchievementDef[] = [
  // ------------------------------------------------------------ the classics: one item each
  {
    id: 'gameball',
    name: 'THE GAME BALL',
    hint: 'Everyone remembers the first one.',
    slot: 'desk',
    on: 'game',
    desc: (it) => ['Your first win.', `${d(it, 'us')}-${d(it, 'them')} over ${school(String(d(it, 'vs')))}.`],
    find: (s, week, me, o) => {
      if (o.items.some((i) => i.id === 'gameball')) return [];
      const w = gamesOf(s, week, me).find((x) => x.us > x.them);
      return w ? [{ ...gameFound(s, w, 'gameball', ''), line: undefined }] : [];
    },
  },
  {
    id: 'conf',
    name: 'CONFERENCE TROPHY',
    hint: 'Win your league.',
    slot: 'case',
    on: 'game',
    desc: (it) => [`${d(it, 'conf')} champions.`, `${d(it, 'us')}-${d(it, 'them')} over ${school(String(d(it, 'vs')))} in the title game.`],
    find: (s, week, me) =>
      gamesOf(s, week, me)
        .filter((x) => x.g.kind === 'champ' && x.us > x.them)
        .map((x) => ({ ...gameFound(s, x, `conf:${s.year}`, '', { conf: caps(teamById(me).conference) }), line: undefined })),
  },
  {
    id: 'natty',
    name: 'NATIONAL CHAMPIONSHIP',
    hint: 'The last game of the year. Win it.',
    slot: 'case',
    on: 'season',
    desc: (it) => [`National champions, ${d(it, 'w')}-${d(it, 'l')}.`, `${d(it, 'us')}-${d(it, 'them')} over ${school(String(d(it, 'vs')))} in the final.`],
    order: () => -1,
    find: (s, _w, me) => {
      const y = thisYear(s, me);
      if (!y?.nc) return [];
      const g = s.games.filter((x) => x.kind === 'cfp' && x.result && (x.home === me || x.away === me)).sort((a, b) => b.week - a.week)[0];
      const us = g ? (g.home === me ? g.result!.home : g.result!.away) : 0;
      const them = g ? (g.home === me ? g.result!.away : g.result!.home) : 0;
      return [{ key: `natty:${s.year}`, year: s.year, team: me, game: g?.id, data: { w: y.w, l: y.l, us, them, vs: g ? opp(g, me) : me } }];
    },
  },
  {
    id: 'heisman',
    name: 'THE BRONZE MAN',
    hint: 'One of yours, the best player in the country.',
    slot: 'shelf',
    on: 'season',
    desc: (it) => [`${d(it, 'name')}, ${d(it, 'pos')}.`, 'Heisman Trophy winner.'],
    find: (s, _w, me) => {
      const a = s.awards.find((x) => x.id === 'heisman')?.finalists[0];
      return a?.team === me && thisYear(s, me) ? [{ key: `heisman:${s.year}`, year: s.year, team: me, data: { name: a.name, pos: a.pos } }] : [];
    },
  },
  {
    id: 'jersey',
    name: 'RING OF HONOR',
    hint: 'Send one to the league in the first round.',
    slot: 'jersey',
    on: 'draft',
    desc: (it) => [`${d(it, 'name')}, ${d(it, 'pos')} #${d(it, 'num')}.`, `No. ${d(it, 'pick')} pick, to ${d(it, 'city')}.`],
    order: (it) => Number(d(it, 'pick')),
    find: (s, _w, me) => (lastDraft(s)?.draft ?? []).filter((p) => p.team === me && p.round === 1).map((p) => jerseyItem(s, p, lastDraft(s)!.year)),
  },

  // ------------------------------------------------------------ leveled: one item that grows
  {
    id: 'paper',
    name: 'STOP THE PRESSES',
    hint: 'Some upsets make the front page.',
    slot: 'wall-lg',
    on: 'game',
    levels: [1, 2, 4, 7],
    desc: (it) => [String(d(it, 'head')), n(it) > 1 ? `${plural(n(it), 'front page')} framed.` : `Final: ${d(it, 'us')}-${d(it, 'them')}.`],
    find: (s, week, me) =>
      gamesOf(s, week, me)
        .filter((x) => x.us - x.them >= OFFICE.paperMargin && !rankAt(s, x.g, me) && rankAt(s, x.g, x.vs))
        .map((x) => {
          const r = rankAt(s, x.g, x.vs);
          const verb = x.us - x.them >= 40 ? 'BURY' : 'ROUT';
          const head = `UNRANKED ${caps(teamById(me).mascot)} ${verb} NO. ${r} ${caps(school(x.vs))}`;
          return gameFound(s, x, `paper:${s.year}:${x.g.id}`, `${x.us}-${x.them} over No. ${r} ${school(x.vs)}`, { head, rank: r });
        }),
  },
  {
    id: 'giant',
    name: 'GIANT KILLER',
    hint: 'Somebody has to beat No. 1.',
    slot: 'wall-lg',
    on: 'game',
    levels: [1, 2, 3, 5],
    desc: (it) => [`${plural(n(it), 'No. 1 team')} beaten. Their helmets, in a shadow box.`],
    find: (s, week, me) =>
      gamesOf(s, week, me)
        .filter((x) => x.us > x.them && rankAt(s, x.g, x.vs) === 1)
        .map((x) => ({ ...gameFound(s, x, `giant:${s.year}:${x.g.id}`, `${vsLine(x)}, No. 1`), v: x.vs })),
  },
  {
    id: 'comeback',
    name: 'THE COMEBACK',
    hint: 'Never turn the TV off.',
    slot: 'wall-sm',
    on: 'game',
    levels: [1, 2, 4],
    desc: (it) => [`Down ${d(it, 'low')}, won ${d(it, 'us')}-${d(it, 'them')}.`, 'The scoreboard at the low point, framed.'],
    find: (s, week, me) =>
      gamesOf(s, week, me).flatMap((x) => {
        if (x.us <= x.them) return [];
        let low = 0, at: [number, number, number] = [0, 0, 1];
        for (const p of x.g.result!.plays ?? []) {
          const [h, a] = p.score;
          const m = x.home ? h - a : a - h;
          if (m < low) {
            low = m;
            at = [x.home ? h : a, x.home ? a : h, p.q];
          }
        }
        if (-low < OFFICE.comeback) return [];
        return [gameFound(s, x, `comeback:${s.year}:${x.g.id}`, `Down ${-low}, beat ${school(x.vs)} ${x.us}-${x.them}`, { low: `${at[0]}-${at[1]}`, q: at[2] })];
      }),
  },
  {
    id: 'ice',
    name: 'ICE WATER',
    hint: 'Some kicks you remember.',
    slot: 'wall-sm',
    on: 'game',
    levels: [1, 2, 4],
    desc: (it) => [`${plural(n(it), 'walk-off kick')}. The tees, on a plaque.`, `Last: ${d(it, 'us')}-${d(it, 'them')} over ${school(String(d(it, 'vs')))}.`],
    find: (s, week, me) =>
      gamesOf(s, week, me).flatMap((x) => {
        if (x.us <= x.them) return [];
        const scoring = (x.g.result!.plays ?? []).filter((p) => p.pts > 0);
        const last = scoring[scoring.length - 1];
        if (!last || last.kind !== 'fg' || last.off !== me || last.q !== 4 || last.time > OFFICE.iceTime) return [];
        const [h, a] = last.score;
        const before = (x.home ? h : a) - last.pts - (x.home ? a : h);
        if (before > 0) return [];
        return [gameFound(s, x, `ice:${s.year}:${x.g.id}`, `A field goal at 0:0${last.time} to beat ${school(x.vs)}`)];
      }),
  },
  {
    id: 'airshow',
    name: 'AIR SHOW',
    hint: 'Throw it all over the yard.',
    slot: 'wall-sm',
    on: 'game',
    levels: [1, 3, 5],
    desc: (it) => [`${d(it, 'name')}: ${d(it, 'td')} touchdown passes.`, n(it) > 1 ? `${plural(n(it), 'six-touchdown day')}. The whiteboard stays up.` : 'The play is still on the whiteboard.'],
    find: (s, week, me) =>
      gamesOf(s, week, me).flatMap((x) => {
        const qb = x.g.result!.box.players.find((p) => p.team === me && p.passTd >= OFFICE.airTds);
        return qb ? [gameFound(s, x, `air:${s.year}:${x.g.id}`, `${qb.name}, ${qb.passTd} TD passes vs ${school(x.vs)}`, { name: qb.name, td: qb.passTd })] : [];
      }),
  },
  {
    id: 'cleats',
    name: 'GROUND AND POUND',
    hint: 'Run it until they stop it.',
    slot: 'shelf',
    on: 'game',
    levels: [1, 3, 6],
    desc: (it) => [`${d(it, 'yds')} rushing yards against ${school(String(d(it, 'vs')))}.`, n(it) > 1 ? `${plural(n(it), 'pair')} of worn-out cleats.` : 'The cleats never came clean.'],
    find: (s, week, me) =>
      gamesOf(s, week, me).flatMap((x) => {
        const yds = (x.home ? x.g.result!.box.home : x.g.result!.box.away).rushYds;
        return yds >= OFFICE.groundYds ? [gameFound(s, x, `cleats:${s.year}:${x.g.id}`, `${yds} rushing yards vs ${school(x.vs)}`, { yds })] : [];
      }),
  },
  {
    id: 'marathon',
    name: 'MARATHON',
    hint: 'Some games won\'t end.',
    slot: 'desk',
    on: 'game',
    levels: [1, 2, 3],
    desc: (it) => [`Won in ${d(it, 'ot')} overtimes.`, `${d(it, 'us')}-${d(it, 'them')} over ${school(String(d(it, 'vs')))}. The stopwatch didn't survive.`],
    find: (s, week, me) =>
      gamesOf(s, week, me)
        .filter((x) => x.us > x.them && x.g.result!.ot >= OFFICE.marathonOt)
        .map((x) => gameFound(s, x, `marathon:${s.year}:${x.g.id}`, `${x.g.result!.ot} OT, ${vsLine(x)}`, { ot: x.g.result!.ot })),
  },
  {
    id: 'ballrack',
    name: 'THE BALL RACK',
    hint: 'Keep winning.',
    slot: 'floor',
    on: 'game',
    levels: WIN_MARKS.map((_, i) => i + 1),
    desc: (it) => [`${d(it, 'wins')} career wins.`, `A ball for each milestone: ${it.log?.map((m) => m.v).join(', ')}.`],
    find: (s, week, me) => {
      const before = coachRows(s, me, s.year).reduce((a, y) => a + y.w, 0);
      const now = s.games.filter((g) => g.week <= week && g.result && (g.home === me || g.away === me) && (g.home === me ? g.result.home > g.result.away : g.result.away > g.result.home)).length;
      const wins = before + now;
      return WIN_MARKS.filter((m) => m <= wins).map((m) => seasonFound(s, me, `wins:${m}`, `Win No. ${m}`, { wins: m }, String(m)));
    },
  },
  {
    id: 'bowl',
    name: 'BOWL TROPHIES',
    hint: 'Finish the year with a win.',
    slot: 'shelf',
    on: 'season',
    levels: [1, 3, 6, 10],
    desc: (it) => [`${plural(n(it), 'bowl win')}.`, `Last: the ${d(it, 'bowl')}.`],
    find: (s, _w, me) => {
      const y = thisYear(s, me);
      return y?.bw ? [seasonFound(s, me, `bowl:${s.year}`, `Won the ${y.bowl}`, { bowl: String(y.bowl) })] : [];
    },
  },
  {
    id: 'bracket',
    name: 'THE BRACKET',
    hint: 'Get in the playoff.',
    slot: 'wall-lg',
    on: 'season',
    levels: [1, 2, 4, 6, 10],
    desc: (it) => [`${plural(n(it), 'playoff trip')}.`, `Last: the No. ${d(it, 'seed')} seed, ${d(it, 'nc') ? 'national champions' : ROUND[Number(d(it, 'rd'))]}.`],
    find: (s, _w, me) => {
      const y = thisYear(s, me);
      if (!y?.seed) return [];
      const how = y.nc ? 'national champions' : ROUND[y.rd ?? 0];
      return [seasonFound(s, me, `cfp:${s.year}`, `No. ${y.seed} seed, ${how}`, { seed: y.seed, rd: y.rd ?? 0, nc: y.nc ?? 0 })];
    },
  },
  {
    id: 'perfect',
    name: 'PERFECT SEASON',
    hint: 'Don\'t lose.',
    slot: 'wall-lg',
    on: 'season',
    levels: [1, 2, 3],
    desc: (it) => [`${d(it, 'w')}-0.`, n(it) > 1 ? `${plural(n(it), 'perfect season')}: a pennant for each.` : 'A pennant for the wall.'],
    find: (s, _w, me) => {
      const y = thisYear(s, me);
      return y && !y.l && y.w >= 10 ? [seasonFound(s, me, `perfect:${s.year}`, `${y.w}-0`, { w: y.w })] : [];
    },
  },
  {
    id: 'homegrown',
    name: 'HOMEGROWN',
    hint: 'Win a title with the kids from down the road.',
    slot: 'wall-lg',
    on: 'season',
    levels: [1, 2, 3],
    desc: (it) => [`A title with ${d(it, 'home')} of ${d(it, 'of')} starters from ${STATE_NAME[String(d(it, 'st'))] ?? d(it, 'st')}.`, 'A pin for each hometown.'],
    find: (s, _w, me) => {
      const y = thisYear(s, me);
      if (!y?.cc && !y?.nc) return [];
      const st = TEAM_STATE[me];
      const xi = Object.values(starters(squadFor(s, me)));
      const home = xi.filter((a) => a.hometown.state === st);
      if (!xi.length || home.length / xi.length < OFFICE.homeShare) return [];
      const towns = [...new Set(home.map((a) => a.hometown.city))].join('|');
      return [seasonFound(s, me, `home:${s.year}`, `${home.length} of ${xi.length} starters from home`, { st, home: home.length, of: xi.length, towns })];
    },
  },
  {
    id: 'prove',
    name: 'PROVE \'EM WRONG',
    hint: 'Nobody picked you. Make them pay.',
    slot: 'wall-sm',
    on: 'season',
    levels: [1, 2, 3],
    desc: (it) => [`Unranked in the preseason, No. ${d(it, 'ap')} at the end.`, 'The magazine that said otherwise, framed.'],
    find: (s, _w, me) => {
      const y = thisYear(s, me);
      const pre = s.polls.find((p) => p.kind === 'ap' && p.week === 0);
      return y?.ap && y.ap <= OFFICE.proveRank && pre && !rankIn(pre, me) ? [seasonFound(s, me, `prove:${s.year}`, `Unranked to No. ${y.ap}`, { ap: y.ap })] : [];
    },
  },
  {
    id: 'turnaround',
    name: 'TURNAROUND',
    hint: 'Fix a program that was broken.',
    slot: 'wall-sm',
    on: 'season',
    levels: [1, 2, 3],
    desc: (it) => [`${d(it, 'was')} the year before, ${d(it, 'now')} this one.`, 'Before and after.'],
    find: (s, _w, me) => {
      const y = thisYear(s, me);
      const prev = pastSeasons(s, me, false).find((r) => r.year === s.year - 1);
      return y && prev && prev.w < prev.l && y.w >= OFFICE.turnWins
        ? [seasonFound(s, me, `turn:${s.year}`, `${prev.w}-${prev.l} to ${y.w}-${y.l}`, { was: `${prev.w}-${prev.l}`, now: `${y.w}-${y.l}` })]
        : [];
    },
  },
  {
    id: 'doormat',
    name: 'THE DOORMAT',
    hint: 'Own a rival.',
    slot: 'floor',
    on: 'season',
    levels: MAT_MARKS.map((_, i) => i + 1),
    desc: (it) => [`${d(it, 'n')} straight over ${school(String(d(it, 'vs')))}.`, 'Wipe your feet.'],
    find: (s, _w, me) => {
      if (!thisYear(s, me)) return [];
      const best = RIVALRIES.filter((r) => r.a === me || r.b === me)
        .map((r) => (r.a === me ? r.b : r.a))
        .map((vs) => ({ vs, streak: rivalrySeries(s, me, vs).streak }))
        .sort((a, b) => b.streak - a.streak)[0];
      if (!best || best.streak < MAT_MARKS[0]) return [];
      return MAT_MARKS.filter((m) => m <= best.streak).map((m) => seasonFound(s, me, `mat:${m}`, `${m} straight over ${school(best.vs)}`, { n: m, vs: best.vs }, best.vs));
    },
  },
  {
    id: 'haul',
    name: 'THE LONG HAUL',
    hint: 'Stay a while.',
    slot: 'wall-lg',
    on: 'season',
    levels: HAUL_MARKS.map((_, i) => i + 1),
    desc: (it) => [`${d(it, 'n')} seasons at ${school(it.team)}.`, 'The portrait gets a better frame every five.'],
    find: (s, _w, me) => {
      const rows = coachRows(s, me);
      let run = 0;
      for (let i = rows.length - 1; i >= 0 && rows[i].year === s.year - (rows.length - 1 - i); i--) run++;
      return HAUL_MARKS.filter((m) => m <= run).map((m) => seasonFound(s, me, `haul:${m}`, `Season No. ${m}`, { n: m }));
    },
  },
  {
    id: 'plaques',
    name: 'THE AWARDS WALL',
    hint: 'Coach up a national award winner.',
    slot: 'wall-sm',
    on: 'season',
    levels: [1, 3, 6, 10, 20],
    desc: (it) => [`${plural(n(it), 'national award')}.`, `Last: ${d(it, 'name')}, the ${d(it, 'award')}.`],
    find: (s, _w, me) =>
      thisYear(s, me)
        ? s.awards
            .filter((a) => a.id !== 'heisman' && a.finalists[0]?.team === me)
            .map((a) => seasonFound(s, me, `award:${s.year}:${a.id}`, `${a.finalists[0].name}, ${a.name}`, { name: a.finalists[0].name, award: a.name }))
        : [],
  },
  {
    id: 'bonsai',
    name: 'THE COACHING TREE',
    hint: 'Your assistants go on to run their own shows.',
    slot: 'desk',
    on: 'carousel',
    levels: [1, 3, 6, 10],
    desc: (it) => [`${plural(n(it), 'branch', )} on your tree.`, `Last: ${d(it, 'name')}, ${d(it, 'role')} at ${school(String(d(it, 'at')))}.`],
    find: (s, _w, me) => {
      const root = headCoachFor(s, me).id;
      return treeOf(s, root)
        .filter((x) => x.role === 'HC' || x.role === 'OC' || x.role === 'DC')
        .map((x) => {
          const name = coachName(coachNow(s, x.id, x.role));
          const role = x.role === 'HC' ? 'head coach' : x.role;
          return seasonFound(s, me, `tree:${x.id}:${x.role}`, `${name}, ${role} at ${school(x.team)}`, { name, role, at: x.team }, x.role);
        });
    },
  },
  {
    id: 'league',
    name: 'TO THE LEAGUE',
    hint: 'Get them drafted.',
    slot: 'wall-lg',
    on: 'draft',
    levels: [1, 5, 10, 25, 50, 100],
    desc: (it) => [`${plural(n(it), 'player')} drafted.`, `Last: ${d(it, 'name')}, round ${d(it, 'round')} to ${d(it, 'city')}.`],
    find: (s, _w, me) => {
      const h = lastDraft(s);
      return (h?.draft ?? [])
        .filter((p) => p.team === me)
        .map((p) => ({ key: `nfl:${p.id}`, year: h!.year, team: me, line: `${p.name}, ${p.pos}, round ${p.round} to ${p.city}`, data: { name: p.name, round: p.round, city: p.city } }));
    },
  },
  {
    id: 'night',
    name: 'DRAFT NIGHT',
    hint: 'Own the first round.',
    slot: 'wall-sm',
    on: 'draft',
    levels: [1, 2, 3],
    desc: (it) => [`${d(it, 'k')} first-rounders in the ${it.year} draft.`, String(d(it, 'names')).split('|').join(', ') + '.'],
    find: (s, _w, me) => {
      const h = lastDraft(s);
      const r1 = (h?.draft ?? []).filter((p) => p.team === me && p.round === 1);
      if (r1.length < OFFICE.draftNight) return [];
      const names = r1.map((p) => p.name.split(' ').slice(-1)[0]).join('|');
      return [{ key: `night:${h!.year}`, year: h!.year, team: me, line: `${r1.length} first-rounders`, data: { k: r1.length, names } }];
    },
  },
  {
    id: 'nowhere',
    name: 'FROM NOWHERE',
    hint: 'Nobody wanted him. The league took him early.',
    slot: 'wall-sm',
    on: 'draft',
    levels: [1, 2, 4],
    desc: (it) => [`${d(it, 'name')}, ${d(it, 'was')}, drafted in round ${d(it, 'round')}.`, 'His letter, framed.'],
    find: (s, _w, me) => {
      const h = lastDraft(s);
      return (h?.draft ?? [])
        .filter((p) => p.team === me)
        .flatMap((p) => {
          const walk = !!parseWalkOn(p.id);
          const stars = generatedAthlete(p.id)?.stars ?? 3;
          if (!walk && (stars > OFFICE.nowhereStars || p.round > OFFICE.nowhereRound)) return [];
          const was = walk ? 'a walk-on' : `a ${stars}-star`;
          return [{ key: `nowhere:${p.id}`, year: h!.year, team: me, line: `${p.name}, ${was}, round ${p.round}`, data: { name: p.name, was, round: p.round } }];
        });
    },
  },
  {
    id: 'hats',
    name: 'THE HAT RACK',
    hint: 'Sign the best in the country.',
    slot: 'floor',
    on: 'signing',
    levels: [1, 3, 6, 10, 20],
    desc: (it) => [`${plural(n(it), 'five-star')} signed.`, `Last: ${d(it, 'name')}, ${d(it, 'pos')}, from ${d(it, 'from')}.`],
    find: (s, _w, me) =>
      Object.entries(s.recruiting?.signed ?? {})
        .filter(([, t]) => t === me)
        .map(([id]) => prospect(id))
        .filter((p) => p?.stars === 5)
        .map((p) => {
          const from = `${p!.a.hometown.city}, ${p!.a.hometown.state}`;
          return seasonFound(s, me, `hat:${p!.id}`, `${athleteName(p!.a)}, ${p!.pos}, ${from}`, { name: athleteName(p!.a), pos: p!.pos, from });
        }),
  },

  // ------------------------------------------------------------ bad moments
  {
    id: 'hatemail',
    name: 'HATE MAIL',
    hint: 'Never lose that one. Especially not like that.',
    slot: 'desk',
    on: 'game',
    levels: [1, 3, 5],
    bad: true,
    desc: (it) => [`Lost to ${school(String(d(it, 'vs')))} ${d(it, 'us')}-${d(it, 'them')}.`, n(it) > 1 ? `${plural(n(it), 'stack')} of letters. The fans write in.` : 'The fans wrote in.'],
    find: (s, week, me) =>
      gamesOf(s, week, me)
        .filter((x) => x.them - x.us >= OFFICE.hateMargin && x.g.kind !== 'bowl' && x.g.kind !== 'cfp' && isRival(me, x.vs))
        .map((x) => gameFound(s, x, `hate:${s.year}:${x.g.id}`, vsLine(x))),
  },
  {
    id: 'forsale',
    name: 'FOR SALE',
    hint: 'A fan left it on your lawn.',
    slot: 'floor',
    on: 'season',
    levels: [1, 2, 3],
    bad: true,
    desc: (it) => [`${d(it, 'k')} losing seasons in a row.`, 'Someone left it on your lawn. You kept it.'],
    find: (s, _w, me) => {
      const rows = coachRows(s, me);
      let k = 0;
      for (let i = rows.length - 1; i >= 0 && rows[i].w < rows[i].l; i--) k++;
      return thisYear(s, me) && rows[rows.length - 1]?.year === s.year && k >= OFFICE.saleYears ? [seasonFound(s, me, `sale:${s.year}`, `${k} losing seasons in a row`, { k })] : [];
    },
  },
];

const ROUND = ['out in the first round', 'out in the quarterfinals', 'out in the semifinals', 'runners-up'];

/** Two-letter codes to names, for the cards and the Homegrown poster. */
export const STATE_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington, D.C.',
};

function jerseyItem(s: SeasonState, p: DraftPick, year: number): Found {
  const num = s.teamState[p.team]?.roster?.in?.find((e) => e.id === p.id)?.num ?? generatedAthlete(p.id)?.num ?? 0;
  return { key: `jersey:${p.id}`, year, team: p.team, data: { name: p.name, pos: p.pos, num, pick: p.pick, city: p.city } };
}

export const achievement = (id: string): AchievementDef | undefined => ACHIEVEMENTS.find((a) => a.id === id);

/** A leveled item's level, from 1 (0 for none); a one-of-a-kind item is level 1 of 1. */
export function levelOf(it: OfficeItem): number {
  const lv = achievement(it.id)?.levels;
  if (!lv) return 1;
  const k = it.log?.length ?? 1;
  return lv.filter((x) => x <= k).length;
}

export const maxLevel = (id: string): number => achievement(id)?.levels?.length ?? 1;

/** Log entries until the next level, or undefined at the top. */
export function toNextLevel(it: OfficeItem): number | undefined {
  const lv = achievement(it.id)?.levels;
  const next = lv?.[levelOf(it)];
  return next === undefined ? undefined : next - (it.log?.length ?? 1);
}

/** The room the user has earned, from his finished seasons (an index into `ROOMS`). Computed, never stored. */
export function officeTier(s: SeasonState): number {
  const ys = userYears(s);
  const cc = ys.filter((y) => y.cc).length;
  const bowls = ys.filter((y) => y.bw).length;
  const nc = ys.filter((y) => y.nc).length;
  const playoff = ys.some((y) => y.seed);
  if (nc && cc >= 5) return 4;
  if (cc >= 2 || playoff) return 3;
  if (cc || bowls >= 3) return 2;
  if (ys.some((y) => y.w > y.l) || bowls) return 1;
  return 0;
}

export const newOffice = (): OfficeState => ({ items: [], rev: 0, tier: 0 });

/**
 * Items saved before an achievement leveled (one item per find) fold into its one item, so an old
 * save's front pages become a stack.
 */
function foldOld(o: OfficeState): void {
  for (const a of ACHIEVEMENTS) {
    if (!a.levels) continue;
    const old = o.items.filter((i) => i.id === a.id && !i.log);
    if (!old.length) continue;
    const keep = old[0];
    const log: OfficeMark[] = old.map((i) => ({ k: i.key, y: i.year, t: a.desc(i)[0] }));
    Object.assign(keep, { ...old[old.length - 1], key: a.id, rev: keep.rev, log });
    o.items = o.items.filter((i) => !old.includes(i) || i === keep);
  }
}

/**
 * Run one hook's detectors for team `me` (the user's, into his office, unless the season report asks
 * for another's). A new item comes in fresh; so does a leveled item that reaches its next level, with
 * `up` set. Returns the items added or leveled.
 */
export function checkOffice(s: SeasonState, on: OfficeHook, week = s.week, me = s.config.userTeamId, o: OfficeState = (s.office ??= newOffice())): OfficeItem[] {
  foldOld(o);
  const have = new Set(o.items.map((i) => i.key));
  const out: OfficeItem[] = [];
  for (const a of ACHIEVEMENTS) {
    if (a.on !== on) continue;
    for (const f of a.find(s, week, me, o)) {
      const { line, v, stack, ...base } = f;
      if (!a.levels) {
        if (have.has(f.key)) continue;
        have.add(f.key);
        const it: OfficeItem = { id: a.id, ...base, rev: ++o.rev, fresh: 1 };
        o.items.push(it);
        out.push(it);
        continue;
      }
      const key = stack ?? a.id;
      let it = o.items.find((i) => i.key === key);
      if (it?.log?.some((m) => m.k === f.key)) continue;
      const mark: OfficeMark = { k: f.key, y: f.year, t: line ?? '', ...(v ? { v } : {}) };
      if (!it) {
        it = { id: a.id, ...base, key, rev: ++o.rev, fresh: 1, log: [mark] };
        o.items.push(it);
        have.add(key);
        out.push(it);
        continue;
      }
      const was = levelOf(it);
      it.log!.push(mark);
      Object.assign(it, { year: base.year, week: base.week, game: base.game, team: base.team, data: base.data });
      if (levelOf(it) > was) {
        it.up = ++o.rev;
        it.fresh = 1;
        if (!out.includes(it)) out.push(it);
      }
    }
  }
  return out;
}

/** A room upgrade not shown yet: the new tier, or undefined. */
export function newRoom(s: SeasonState): number | undefined {
  const t = officeTier(s);
  return t > (s.office?.tier ?? 0) ? t : undefined;
}

export const roomName = (tier: number): string => ROOMS[tier].name;

/** Something new in the office: an item not seen yet, or a room to move into. */
export const officeNews = (s: SeasonState): boolean => !!s.office?.items.some((i) => i.fresh) || newRoom(s) !== undefined;

/** The office page has been seen: everything's old news, and the room is the user's. */
export function seeOffice(s: SeasonState): void {
  const o = (s.office ??= newOffice());
  for (const it of o.items) delete it.fresh;
  o.tier = Math.max(o.tier, officeTier(s));
}

export interface OfficeLayout {
  placed: { item: OfficeItem; at: Anchor }[];
  /** Everything that didn't fit, in the storage boxes. */
  stored: OfficeItem[];
}

/**
 * Where everything goes in a room. Each kind fills in its own order (`order`, then unlock order);
 * an item takes the first free spot of its kind, then of its fallbacks (`SLOT_FALLBACK`), else it's
 * stored. The same items always land in the same spots.
 */
export function layoutOffice(items: OfficeItem[], tier: number): OfficeLayout {
  const free = anchorsOf(ROOMS[tier]);
  const used = new Set<Anchor>();
  const placed: OfficeLayout['placed'] = [];
  const stored: OfficeItem[] = [];
  const rank = (it: OfficeItem) => achievement(it.id)?.order?.(it) ?? 0;
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || a.rev - b.rev);
  // An item's own kind before anything falls back into it, so a trophy on the shelf never takes a ball's spot.
  const pending: OfficeItem[] = [];
  const take = (it: OfficeItem, kind: SlotKind): boolean => {
    const at = free.find((a) => a.kind === kind && !used.has(a));
    if (!at) return false;
    used.add(at);
    placed.push({ item: it, at });
    return true;
  };
  for (const it of sorted) {
    const def = achievement(it.id);
    if (!def || !take(it, def.slot)) pending.push(it);
  }
  for (const it of pending) {
    const def = achievement(it.id);
    if (!def || !SLOT_FALLBACK[def.slot].slice(1).some((k) => take(it, k))) stored.push(it);
  }
  return { placed, stored };
}

// ------------------------------------------------------------ the dev showroom

/**
 * Dev: a full office to look at (the showroom on the office page): every achievement, the classics a
 * few times over and each leveled item at `level` (its top by default, -1 for each at a different
 * level), with names from the user's roster. Never saved.
 */
export function sampleOffice(s: SeasonState, level = Infinity): OfficeItem[] {
  const team = s.config.userTeamId;
  const roster = baseRoster(s, team);
  const foes = ['auburn', 'florida', 'tennessee', 'lsu', 'alabama', 'texas', 'ohiostate', 'michigan'].filter((t) => t !== team);
  const rival = RIVALRIES.find((r) => r.a === team || r.b === team);
  const rv = rival ? (rival.a === team ? rival.b : rival.a) : foes[0];
  const name = (i: number) => athleteName(roster[(i * 7) % roster.length]);
  const out: OfficeItem[] = [];
  const add = (id: string, k: number, make: (i: number) => OfficeItem['data']) => {
    for (let i = 0; i < k; i++) out.push({ id, key: `show:${id}:${i}`, year: s.year - k + i + 1, team, data: make(i), rev: out.length + 1, fresh: i === k - 1 ? 1 : undefined });
  };
  add('gameball', 1, () => ({ us: 31, them: 17, vs: foes[0] }));
  add('natty', 2, (i) => ({ w: 14 - i, l: i, us: 38, them: 24, vs: foes[i + 2] }));
  add('conf', 7, (i) => ({ conf: caps(teamById(team).conference), us: 30 + i, them: 20, vs: foes[i % foes.length] }));
  add('heisman', 2, (i) => ({ name: name(i), pos: i ? 'HB' : 'QB' }));
  add('jersey', 8, (i) => {
    const a = roster[(i * 7) % roster.length];
    return { name: athleteName(a), pos: a.pos, num: a.num, pick: 3 + i * 4, city: 'DALLAS' };
  });
  let step = 0;
  const lead = (id: string, make: (i: number) => { data: OfficeItem['data']; v?: string; t?: string }) => {
    const def = achievement(id)!;
    const top = def.levels!.length;
    const lv = level === -1 ? (step++ % top) + 1 : Math.min(top, level);
    const k = def.levels![lv - 1];
    const log: OfficeMark[] = Array.from({ length: k }, (_, i) => {
      const m = make(i);
      return { k: `${id}:${i}`, y: s.year - k + i + 1, t: m.t ?? `Sample ${i + 1}`, ...(m.v ? { v: m.v } : {}) };
    });
    out.push({ id, key: `show:${id}`, year: s.year, team, data: make(k - 1).data, rev: out.length + 1, log, ...(lv === top ? { fresh: 1 as const } : {}) });
  };
  const sch = (t: string) => caps(school(t));
  lead('paper', (i) => ({ data: { head: `UNRANKED ${caps(teamById(team).mascot)} ROUT NO. ${4 + (i % 9)} ${sch(foes[i % foes.length])}`, us: 45 + i, them: 10, vs: foes[i % foes.length], rank: 4 + i } }));
  lead('giant', (i) => ({ data: { us: 27, them: 24, vs: foes[i % foes.length] }, v: foes[i % foes.length] }));
  lead('comeback', () => ({ data: { us: 35, them: 31, vs: foes[2], low: '7-31', q: 3 } }));
  lead('ice', () => ({ data: { us: 23, them: 20, vs: foes[1] } }));
  lead('airshow', (i) => ({ data: { name: name(i), td: 6 + (i % 2), us: 56, them: 21, vs: foes[3] } }));
  lead('cleats', () => ({ data: { yds: 412, us: 48, them: 10, vs: foes[4] } }));
  lead('marathon', () => ({ data: { ot: 4, us: 50, them: 47, vs: foes[5] } }));
  lead('ballrack', (i) => ({ data: { wins: WIN_MARKS[i] }, v: String(WIN_MARKS[i]) }));
  lead('bowl', (i) => ({ data: { bowl: ['Peach Bowl', 'Citrus Bowl', 'Gator Bowl', 'Music City Bowl'][i % 4] } }));
  lead('bracket', (i) => ({ data: { seed: 1 + (i % 4), rd: 3, nc: 1 } }));
  lead('perfect', (i) => ({ data: { w: 15 - (i % 2) }, t: `${15 - (i % 2)}-0` }));
  lead('homegrown', () => ({ data: { st: TEAM_STATE[team], home: 16, of: 24, towns: [...new Set(roster.filter((a) => a.hometown.state === TEAM_STATE[team]).map((a) => a.hometown.city))].slice(0, 9).join('|') } }));
  lead('prove', () => ({ data: { ap: 6 } }));
  lead('turnaround', () => ({ data: { was: '3-9', now: '11-2' } }));
  lead('doormat', (i) => ({ data: { n: MAT_MARKS[i], vs: rv }, v: rv }));
  lead('haul', (i) => ({ data: { n: HAUL_MARKS[i] } }));
  lead('plaques', (i) => ({ data: { name: name(i), award: 'Biletnikoff Award' } }));
  lead('bonsai', (i) => ({ data: { name: 'Sam Rivers', role: 'head coach', at: foes[i % foes.length] }, v: i % 3 ? 'OC' : 'HC' }));
  lead('league', (i) => ({ data: { name: name(i), round: 1 + (i % 7), city: 'DENVER' } }));
  lead('night', () => ({ data: { k: 4, names: [0, 1, 2, 3].map((i) => name(i).split(' ').slice(-1)[0]).join('|') } }));
  lead('nowhere', (i) => ({ data: { name: name(i), was: 'a walk-on', round: 6 } }));
  lead('hats', (i) => ({ data: { name: name(i), pos: 'WR', from: 'Valdosta, GA' } }));
  lead('hatemail', () => ({ data: { us: 3, them: 42, vs: rv } }));
  lead('forsale', (i) => ({ data: { k: 3 + i } }));
  for (const it of out) if (!it.fresh) delete it.fresh;
  return out;
}
