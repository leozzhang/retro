import { CALENDAR } from '../data/season/calendar';
import { classLabel, DEV_LABEL, type Athlete } from '../data/athletes';
import { athleteName, starters } from '../data/depth';
import { overall, POS_ROLE } from '../data/positions';
import { teamById } from '../data/teams';
import { hashString } from '../engine/math';
import { heismanRace } from './awards';
import type { BreakoutEvent, SparkEvent } from './confidence';
import { START_SLOTS } from './confidence';
import { impact, statLine } from './gameStars';
import { outText } from './injuries';
import { latestPoll, rankIn } from './polls';
import { rivalrySeries } from './program';
import { applyDelta, deltaText, type LevelUpEvent } from './progression';
import { loser, records, recordText, winner } from './standings';
import { seasonStats, type StatKey } from './stats';
import type { InjuryEvent, Moment, MomentPlayer, MomentRow, PlayerLine, Poll, SeasonGame, SeasonState } from './types';
import { squadFor } from './world';

/**
 * Moments (docs/STORYLINES.md): after each week, the few things worth stopping for, staged as the Week
 * Wrap's scenes. Built from what the week's steps already logged; display only, no randomness (the
 * wording varies by a hash of the ids, like the fan pulse).
 */

/**
 * - `big`: moments shown on the BIG setting between the final and UP NEXT, by tier then `w` (decisions always).
 * - `upsetGap`: the news's upset rule (season/news.ts `UPSET_GAP`).
 * - `pollJump`: places gained that make a poll moment on their own.
 * - `milestones`: season totals worth a card when crossed.
 * - `aroundRows`: rows on the AROUND THE FBS card.
 * - `posW`: how much a position's moment weighs within its tier; `keyW` and up are the playmakers whose
 *   long injuries are tier 3.
 */
export const MOMENTS = {
  big: 3,
  upsetGap: 6,
  pollJump: 5,
  milestones: {
    passYds: [2000, 3000, 4000, 5000], rushYds: [1000, 1500, 2000], recYds: [1000, 1500], passTd: [20, 30, 40],
    rushTd: [10, 15, 20, 25], recTd: [10, 15], sk: [8, 12, 16], defInt: [5, 8],
  } as Partial<Record<StatKey, number[]>>,
  aroundRows: 5,
  keyW: 0.55,
  posW: { QB: 1, HB: 0.8, WR: 0.8, TE: 0.6, FB: 0.3, LT: 0.5, LG: 0.4, C: 0.4, RG: 0.4, RT: 0.5, DE: 0.6, DT: 0.5, OLB: 0.55, MLB: 0.55, CB: 0.6, FS: 0.5, SS: 0.5, K: 0.4, P: 0.3 } as Record<string, number>,
};

const STAT_WORDS: Partial<Record<StatKey, string>> = {
  passYds: 'PASSING YARDS', rushYds: 'RUSHING YARDS', recYds: 'RECEIVING YARDS', passTd: 'TOUCHDOWN PASSES',
  rushTd: 'RUSHING TOUCHDOWNS', recTd: 'TOUCHDOWN CATCHES', sk: 'SACKS', defInt: 'INTERCEPTIONS',
};

/** The week's events the moments read, gathered by the week's steps (season.ts `WeekContext.events`). */
export interface WeekEvents {
  levelUps: LevelUpEvent[];
  sparks: SparkEvent[];
  breakouts: BreakoutEvent[];
  /** The playoff field was picked this week. */
  selection?: boolean;
}

export const emptyEvents = (): WeekEvents => ({ levelUps: [], sparks: [], breakouts: [] });

/** A stable pick among wordings. */
export function pick<T>(list: readonly T[], key: string): T {
  return list[hashString(key) % list.length];
}

const SCHOOL = (id: string) => teamById(id).school.toUpperCase();
const ABBR = (id: string) => teamById(id).abbr;

export function ranked(poll: Poll | undefined, id: string): string {
  const r = rankIn(poll, id);
  return r ? `#${r} ${SCHOOL(id)}` : SCHOOL(id);
}

/** A player's name in a storyline's text, with his position so he's easy to place: "QB JOHN SMITH". */
export const withPos = (p: { pos: string; name: string }): string => `${p.pos} ${p.name.toUpperCase()}`;

/** A player as a moment card shows him; `ovr` defaults to his overall now. */
export function momentPlayer(a: Athlete, team: string, ovr = overall(a.r, a.pos)): MomentPlayer {
  return {
    id: a.id, team, name: athleteName(a).toUpperCase(), num: a.num, pos: a.pos, cls: classLabel(a), stars: a.stars,
    home: `${a.hometown.city.toUpperCase()}, ${a.hometown.state}`, ovr, skin: a.skin, dev: a.dev,
  };
}

/** The athlete as his team's squad has him now (progress, injuries and all). */
function current(state: SeasonState, team: string, id: string): Athlete | undefined {
  return squadFor(state, team).athletes.find((a) => a.id === id);
}

function playerNow(state: SeasonState, team: string, id: string): MomentPlayer | undefined {
  const a = current(state, team, id);
  return a ? momentPlayer(a, team) : undefined;
}

/** "A 2-STAR FROM VALDOSTA, GA", "A FORMER 5-STAR". */
export function originLine(p: MomentPlayer): string {
  return `A ${p.cls} ${p.stars}-STAR FROM ${p.home}`;
}

/** The user's game this week, if they played one. */
export function userGame(state: SeasonState, week: number): SeasonGame | undefined {
  const u = state.config.userTeamId;
  return state.games.find((g) => g.week === week && g.result && (g.home === u || g.away === u));
}

/** The user's next game after `week`, if scheduled. */
export function nextGame(state: SeasonState, week: number): SeasonGame | undefined {
  const u = state.config.userTeamId;
  return state.games.filter((g) => g.week > week && !g.result && (g.home === u || g.away === u)).sort((a, b) => a.week - b.week)[0];
}

/** "VS #12 LSU", "AT TEXAS". */
export function nextText(state: SeasonState, g: SeasonGame | undefined): string {
  if (!g) return '';
  const u = state.config.userTeamId;
  const opp = g.home === u ? g.away : g.home;
  const at = g.neutral ? 'VS' : g.home === u ? 'VS' : 'AT';
  return `${at} ${ranked(latestPoll(state, 'ap'), opp)}`;
}

function lineOf(g: SeasonGame, id: string): PlayerLine | undefined {
  return g.result?.box.players.find((l) => l.id === id);
}

/**
 * This week's injuries to the user's real starters (last game's starting lineup, `TeamState.st`; the
 * package slots like WR4, TE2 or DIME don't count), each with his next man up: a bench player who's now
 * in the starting lineup at any slot. Not a starter who slid over from another slot or came back from
 * a missed game: a bench player is one who didn't start last game and has started fewer than half the
 * team's games. The same position first, then the same role; one man per injury. None moved up, none told.
 */
export function injuredStarters(state: SeasonState, week: number): { e: InjuryEvent; up?: { athlete: Athlete; slot: string } }[] {
  const u = state.config.userTeamId;
  const ts = state.teamState[u];
  const last = new Set(Object.values(ts?.st ?? {}));
  const hurt = (state.injuryLog ?? []).filter((x) => x.week === week && x.team === u && last.has(x.id))
    .sort((a, b) => (MOMENTS.posW[b.pos] ?? 0) - (MOMENTS.posW[a.pos] ?? 0));
  if (!hurt.length) return [];
  const sq = squadFor(state, u);
  const now = starters(sq);
  const games = ts?.gp ?? 0;
  const bench = START_SLOTS.filter((slot) => now[slot] && !last.has(now[slot].id))
    .map((slot) => ({ slot, athlete: now[slot] }))
    .filter((x) => (ts?.progress?.[x.athlete.id]?.gs ?? 0) < games / 2);
  const used = new Set<string>();
  return hurt.map((e) => {
    const pick = (ok: (a: Athlete) => boolean) => bench.filter((x) => !used.has(x.athlete.id) && ok(x.athlete))
      .sort((a, b) => overall(b.athlete.r, b.athlete.pos) - overall(a.athlete.r, a.athlete.pos))[0];
    const up = pick((a) => a.pos === e.pos) ?? pick((a) => POS_ROLE[a.pos] === POS_ROLE[e.pos]);
    if (up) used.add(up.athlete.id);
    return { e, up };
  });
}

/** Every moment of the week, unordered. `ev` is what the week's steps gathered. */
export function weekMoments(state: SeasonState, week: number, ev: WeekEvents): Moment[] {
  const out: Moment[] = [];
  const u = state.config.userTeamId;
  const add = (m: Omit<Moment, 'id' | 'week' | 'team'> & { team?: string; key: string }) => {
    const { key, ...rest } = m;
    out.push({ id: `${state.year}:${week}:${key}`, week, team: u, ...rest });
  };
  const before = latestPoll(state, 'ap', week);
  const after = latestPoll(state, 'ap');
  const g = userGame(state, week);
  const next = nextGame(state, week);

  // The final: always first.
  if (g) finalMoment(state, week, g, before, after, add);

  // Breakouts and breakthroughs on the user's team.
  const broke = new Set<string>();
  for (const e of ev.breakouts.filter((x) => x.team === u)) {
    broke.add(e.athlete.id);
    const now = current(state, u, e.athlete.id) ?? e.athlete;
    const p = momentPlayer(now, u);
    const spark = (state.confLog ?? []).filter((c) => c.id === e.athlete.id && c.kind === 'spark').pop();
    const rep = spark?.rep ? current(state, u, spark.rep) : undefined;
    const lines = [originLine(p)];
    if (spark && rep) {
      const ago = week - spark.week + 1;
      lines.push(`${ago} WEEKS AGO HE STEPPED IN FOR ${spark.reason === 'injured' ? 'THE INJURED ' : ''}${withPos({ pos: rep.pos, name: athleteName(rep) })}.`);
    }
    lines.push(`NOW: ${DEV_LABEL[e.to].toUpperCase()} TALENT, ${deltaText(e.d)}`);
    add({
      key: `bo:${e.athlete.id}`, kind: 'breakout', tier: 3, w: 3 + (MOMENTS.posW[p.pos] ?? 0.5), title: 'BREAKOUT',
      sub: `${withPos(p)} HAS ARRIVED`, lines, p, d: e.d, dev: [e.from, e.to],
      n: [overall(e.athlete.r, e.athlete.pos), p.ovr],
    });
  }
  for (const e of ev.levelUps.filter((x) => x.team === u && x.big && !broke.has(x.athlete.id))) {
    const from = overall(e.athlete.r, e.athlete.pos);
    const to = overall(applyDelta(e.athlete.r, e.d), e.athlete.pos);
    const p = momentPlayer(e.athlete, u, to);
    add({
      key: `bt:${e.athlete.id}`, kind: 'breakthrough', tier: 2, w: 1 + (MOMENTS.posW[p.pos] ?? 0.5) + (to - from) / 10, title: 'BREAKTHROUGH',
      sub: pick(['IT CLICKED IN PRACTICE', 'A STEP FORWARD', 'THE WORK SHOWS'], e.athlete.id + week), lines: [originLine(p), deltaText(e.d)], p, d: e.d, n: [from, to],
    });
  }

  // Injuries to the user's starters, with the man who steps in next game.
  for (const { e, up } of injuredStarters(state, week)) {
    const q = playerNow(state, u, e.id);
    if (!q) continue;
    const p = up ? momentPlayer(up.athlete, u) : undefined;
    const long = e.season || e.weeks >= 2;
    const lines = [`${e.type.toUpperCase()}: ${outText(e).toUpperCase()}`];
    if (p) {
      lines.push(`NEXT MAN UP: ${withPos(p)}, ${p.cls}, ${p.ovr} OVR`);
      const c = state.careers?.[p.id];
      const starts = (c?.seasons ?? []).reduce((t, r) => t + (r.gs ?? 0), 0) + (c?.now?.gs ?? 0);
      lines.push(starts ? `${starts} CAREER START${starts === 1 ? '' : 'S'}` : 'HE HAS NEVER STARTED A GAME');
      if (next) lines.push(`HIS TIME: ${nextText(state, next)}`);
    }
    add({
      key: `inj:${e.id}`, kind: 'injury', tier: long && (MOMENTS.posW[e.pos] ?? 0) >= MOMENTS.keyW ? 3 : 2, w: 2 + (MOMENTS.posW[e.pos] ?? 0.5) + (e.season ? 1 : 0),
      title: e.season ? 'SEASON OVER' : 'INJURY', sub: `${withPos(q)} IS ${e.season ? 'DONE FOR THE YEAR' : 'OUT'}`,
      lines, p, q,
    });
  }

  // First starts: how a new starter did (career.ts already logged the start).
  if (g) {
    for (const [id, c] of Object.entries(state.careers ?? {})) {
      const st = c.story.find((s) => s.week === week && s.year === state.year && s.team === u && s.kind === 'start' && /first/i.test(s.text));
      if (!st) continue;
      // Only a start with a story: a spark, or the man up for an injured starter.
      const story = ev.sparks.some((e) => e.athlete.id === id) || state.stories?.some((x) => x.kind === 'nextManUp' && x.star?.id === id);
      if (!story) continue;
      const a = current(state, u, id);
      if (!a) continue;
      const l = lineOf(g, id);
      const p = momentPlayer(a, u);
      const won = winner(g) === u;
      const stat = l ? statLine(l) : '';
      const good = l ? impact(l, false) > 0 : won;
      add({
        key: `fs:${id}`, kind: 'firstStart', tier: 2, w: (MOMENTS.posW[p.pos] ?? 0.5) + (good ? 0.5 : 0), title: 'FIRST START',
        sub: `${withPos(p)}: ${won ? 'A WINNER' : 'A TOUGH DEBUT'}`,
        lines: [originLine(p), stat ? `IN HIS FIRST START: ${stat}` : `IN HIS FIRST START: ${won ? 'THE WIN' : 'A LOSS'}`],
        p,
      });
    }
  }

  // The poll: big jumps and thresholds.
  if (after?.week === week) {
    const was = rankIn(before, u);
    const now = rankIn(after, u);
    const top = now && (!was || was > now);
    const why =
      top && now === 1 ? 'NO. 1 IN THE COUNTRY'
      : top && now <= 5 && (!was || was > 5) ? 'INTO THE TOP 5'
      : top && now <= 10 && (!was || was > 10) ? 'INTO THE TOP 10'
      : now && !was ? 'INTO THE AP TOP 25'
      : top && was - now >= MOMENTS.pollJump ? `UP ${was - now} SPOTS`
      : '';
    if (why) {
      const rows: MomentRow[] = after.ranks.slice(Math.max(0, now - 3), now + 2).map((r) => {
        const at = after.ranks.indexOf(r) + 1;
        const b = rankIn(before, r.team);
        return { text: `${at}. ${SCHOOL(r.team)}`, val: recordText(records(state).get(r.team)!), mv: b ? b - at : 26 - at, me: r.team === u, team: r.team };
      });
      add({
        key: `poll`, kind: 'poll', tier: now <= 5 ? 3 : 2, w: 2 - now / 25, title: 'THE AP POLL', sub: why,
        lines: [was ? `FROM NO. ${was} TO NO. ${now}` : `RANKED NO. ${now}`], n: [was || 26, now], rows,
      });
    }
  }

  heismanMoments(state, week, ev, add);
  milestoneMoments(state, week, ev, g, add);
  stakesMoments(state, week, ev, g, next, add);

  // The rest of the week's level-ups, as tiles.
  const ups = ev.levelUps.filter((x) => x.team === u);
  if (ups.length) {
    const by = new Map<string, { e: LevelUpEvent; pts: number; big: boolean }>();
    for (const e of ups) {
      const x = by.get(e.athlete.id) ?? { e, pts: 0, big: false };
      x.pts += Object.values(e.d).reduce((t, v) => t + (v ?? 0), 0);
      x.big ||= e.big;
      by.set(e.athlete.id, x);
    }
    const rows = [...by.values()]
      .sort((a, b) => b.pts - a.pts)
      .map(({ e, pts, big }) => ({ text: `${athleteName(e.athlete).toUpperCase()} ${e.athlete.pos}`, val: `+${pts}`, me: big, team: u }));
    add({ key: 'ups', kind: 'progress', tier: 1, w: 0, title: 'PROGRESS REPORT', sub: `${ups.length} LEVEL-UP${ups.length === 1 ? '' : 'S'} THIS WEEK`, lines: [], rows });
  }

  around(state, week, ev, before, after, add);
  return out;
}

type Add = (m: Omit<Moment, 'id' | 'week' | 'team'> & { team?: string; key: string }) => void;

function finalMoment(state: SeasonState, week: number, g: SeasonGame, before: Poll | undefined, after: Poll | undefined, add: Add): void {
  const u = state.config.userTeamId;
  const r = g.result!;
  const opp = g.home === u ? g.away : g.home;
  const us = g.home === u ? r.home : r.away;
  const them = g.home === u ? r.away : r.home;
  const won = winner(g) === u;
  const wr = rankIn(before, u);
  const lr = rankIn(before, opp);
  const upset = won ? !!lr && (!wr || wr - lr >= MOMENTS.upsetGap) : !!wr && (!lr || lr - wr >= MOMENTS.upsetGap);
  const rec = recordText(records(state).get(u)!);
  const lines: string[] = [];
  const style =
    won && g.kind === 'cfp' && state.bracket?.champion === u ? 'champion'
    : won && g.kind === 'champ' ? 'title'
    : won && upset ? 'upset'
    : !won && upset ? 'stunned'
    : won && g.name && (g.kind === 'conf' || g.kind === 'nonconf') ? 'rivalry'
    : won ? 'win' : 'loss';
  const label = g.name ? g.name.toUpperCase() : g.kind === 'conf' ? `${teamById(u).conference.toUpperCase()} GAME` : '';
  if (g.name && (g.kind === 'conf' || g.kind === 'nonconf')) {
    const s = rivalrySeries(state, u, opp);
    if (s.w + s.l) {
      const streak = s.streak > 1 ? `, ${s.streak} STRAIGHT` : s.streak < -1 ? `, LOST ${-s.streak} STRAIGHT` : '';
      lines.push(`SERIES UNDER YOU: ${s.w}-${s.l}${streak}`);
    }
  }
  // The game ball: the user's best line.
  const best = r.box.players.filter((l) => l.team === u).map((l) => ({ l, z: impact(l) })).sort((a, b) => b.z - a.z)[0];
  let p: MomentPlayer | undefined;
  if (best) {
    p = playerNow(state, u, best.l.id);
    if (p) lines.push(`GAME BALL: ${withPos(p)} ${statLine(best.l)}`);
  }
  // Recruits on official visits: how the day went for them.
  const rs = state.recruiting;
  const vis = g.home === u && rs ? (rs.visits[g.id] ?? []).filter((id) => rs.ov[id]?.includes(u)) : [];
  if (vis.length) {
    const loved = vis.filter((id) => (rs!.vibe[id] ?? 0) >= 0.25).length;
    const cold = vis.filter((id) => (rs!.vibe[id] ?? 0) < -0.4).length;
    lines.push(`${vis.length} RECRUIT${vis.length === 1 ? '' : 'S'} ON VISITS: ${loved ? `${loved} LOVED IT` : cold ? `${cold} LEFT COLD` : 'GOOD REVIEWS'}`);
  }
  const now = after?.week === week ? rankIn(after, u) : wr;
  const tier = style === 'champion' || style === 'title' || style === 'upset' ? 3 : style === 'stunned' || style === 'rivalry' ? 2 : 1;
  const head: Record<string, string[]> = {
    champion: ['NATIONAL CHAMPIONS'],
    title: [`${teamById(u).conference.toUpperCase()} CHAMPIONS`],
    upset: ['STORM THE FIELD', 'THE UPSET', 'SHOCKER'],
    stunned: ['STUNNED', 'UPSET ALERT', 'A BAD DAY'],
    rivalry: ['BRAGGING RIGHTS', 'RIVALRY WON'],
    win: ['FINAL', 'VICTORY', 'WIN'],
    loss: ['FINAL', 'DEFEAT'],
  };
  add({
    key: 'final', kind: 'final', tier, w: 100, opp, game: g.id,
    title: pick(head[style], g.id),
    sub: `${won ? 'BEAT' : 'LOST TO'} ${ranked(before, opp)}${label ? ` - ${label}` : ''}`,
    lines: [`${SCHOOL(u)} ${rec}`, ...lines], score: [us, them], style, p,
    n: [wr || 26, now || 26],
  });
}

function heismanMoments(state: SeasonState, week: number, ev: WeekEvents, add: Add): void {
  const u = state.config.userTeamId;
  if (state.phase === 'regular' && week >= CALENDAR.heismanWatchWeek) {
    const race = heismanRace(state, 10).finalists;
    const prev = state.buzz?.[state.buzz.length - 1];
    (state.buzz ??= []).push({ week, top: race.map((f) => ({ id: f.id, team: f.team, name: f.name, pos: f.pos, score: f.score })) });
    const mine = race.findIndex((f) => f.team === u);
    if (mine >= 0 && mine < 5) {
      const f = race[mine];
      const was = prev ? prev.top.findIndex((x) => x.id === f.id) : -1;
      const why = mine === 0 && was !== 0 ? 'THE HEISMAN FRONTRUNNER' : (was < 0 || was >= 5) ? 'ENTERS THE HEISMAN RACE' : '';
      if (why) {
        const p = playerNow(state, u, f.id);
        add({
          key: `hz:${f.id}`, kind: 'heisman', tier: mine === 0 ? 3 : 2, w: 3 - mine / 2, title: 'HEISMAN WATCH', sub: `${withPos(f)}: ${why}`,
          lines: [p ? originLine(p) : ''].filter(Boolean), p, n: [was < 0 ? 11 : was + 1, mine + 1], rows: ladder(race, prev, u),
        });
      }
    }
  }
  if (ev.selection) {
    const h = state.awards.find((a) => a.id === 'heisman');
    const at = h?.finalists.findIndex((f) => f.team === u) ?? -1;
    if (h && at >= 0 && at < 4) {
      const f = h.finalists[at];
      const p = playerNow(state, u, f.id);
      add({
        key: `hw:${f.id}`, kind: 'heisman', tier: 3, w: 5 - at, title: at === 0 ? 'HEISMAN TROPHY' : 'HEISMAN FINALIST',
        sub: at === 0 ? `${withPos(f)} WINS THE HEISMAN` : `${withPos(f)} FINISHES ${['', '2ND', '3RD', '4TH'][at]}`,
        lines: [p ? originLine(p) : ''].filter(Boolean), p, rows: ladder(h.finalists.slice(0, 5), undefined, u),
      });
    }
  }
}

function ladder(race: { id: string; team: string; name: string; pos: string }[], prev: SeasonState['buzz'] extends (infer T)[] | undefined ? T | undefined : never, u: string): MomentRow[] {
  return race.slice(0, 5).map((f, i) => {
    const was = prev ? prev.top.findIndex((x) => x.id === f.id) : -1;
    return { text: `${i + 1}. ${f.name.toUpperCase()}`, val: `${ABBR(f.team)} ${f.pos}`, mv: prev ? (was < 0 ? 11 - i - 1 : was - i) : undefined, me: f.team === u, team: f.team };
  });
}

function milestoneMoments(state: SeasonState, week: number, _ev: WeekEvents, g: SeasonGame | undefined, add: Add): void {
  if (!g) return;
  const u = state.config.userTeamId;
  const now = seasonStats(state);
  for (const l of g.result!.box.players.filter((x) => x.team === u)) {
    const is = now.get(l.id);
    if (!is) continue;
    for (const [k, marks] of Object.entries(MOMENTS.milestones) as [StatKey, number[]][]) {
      const from = is[k] - l[k];
      const hit = marks.filter((m) => from < m && is[k] >= m).pop();
      if (!hit) continue;
      const p = playerNow(state, u, l.id);
      if (!p) continue;
      add({
        key: `ms:${l.id}:${k}`, kind: 'milestone', tier: 2, w: (MOMENTS.posW[p.pos] ?? 0.5) + hit / (marks[0] * 4), title: 'MILESTONE',
        sub: `${hit.toLocaleString('en-US')} ${STAT_WORDS[k]}`, lines: [`${withPos(p)} THIS SEASON: ${is[k].toLocaleString('en-US')} IN ${is.games} GAMES`, originLine(p)],
        p, n: [from, is[k]],
      });
      break;
    }
  }
}

function stakesMoments(state: SeasonState, week: number, ev: WeekEvents, g: SeasonGame | undefined, next: SeasonGame | undefined, add: Add): void {
  const u = state.config.userTeamId;
  const rec = records(state).get(u)!;
  if (g && winner(g) === u && (g.kind === 'conf' || g.kind === 'nonconf')) {
    if (rec.w === 6) add({ key: 'bowl6', kind: 'stakes', tier: 2, w: 1, title: 'BOWL ELIGIBLE', sub: `WIN NO. 6: ${SCHOOL(u)} IS GOING BOWLING`, lines: [`${recordText(rec)}`] });
    if (!rec.l && rec.w >= 6 && rec.w % 2 === 0) {
      add({ key: `unb${rec.w}`, kind: 'stakes', tier: rec.w >= 10 ? 3 : 2, w: rec.w / 4, title: 'STILL PERFECT', sub: `${rec.w}-0`, lines: [pick(['NOBODY HAS SOLVED THEM YET', 'THE UNBEATEN RUN GOES ON', 'EVERY WEEK, A BIGGER TARGET'], `${state.year}${rec.w}`)] });
    }
  }
  if (next?.kind === 'champ' && next.week === week + 1) {
    const opp = next.home === u ? next.away : next.home;
    add({ key: 'champ', kind: 'stakes', tier: 3, w: 4, title: 'TITLE GAME BOUND', sub: `${(next.name ?? `${teamById(u).conference} CHAMPIONSHIP`).toUpperCase()}`, lines: [`NEXT: ${nextText(state, next)}`], opp });
  }
  if (ev.selection) {
    const seed = state.bracket?.seeds.indexOf(u) ?? -1;
    if (seed >= 0) {
      add({ key: 'cfp', kind: 'stakes', tier: 3, w: 5, title: 'IN THE PLAYOFF', sub: `THE NO. ${seed + 1} SEED`, lines: [next ? `FIRST: ${nextText(state, next)}` : 'A FIRST-ROUND BYE'] });
    } else if (next?.kind === 'bowl') {
      add({ key: 'bowl', kind: 'stakes', tier: 2, w: 2, title: 'BOWL BID', sub: (next.name ?? 'A BOWL GAME').toUpperCase(), lines: [nextText(state, next)] });
    }
  }
}

function around(state: SeasonState, week: number, ev: WeekEvents, before: Poll | undefined, after: Poll | undefined, add: Add): void {
  const u = state.config.userTeamId;
  const rows: MomentRow[] = [];
  const games = state.games.filter((x) => x.week === week && x.result && x.home !== u && x.away !== u);
  const ups = games
    .map((x) => {
      const w = winner(x)!;
      const l = loser(x)!;
      const wr = rankIn(before, w);
      const lr = rankIn(before, l);
      const gap = lr ? (wr || 30) - lr : 0;
      return { w, l, gap, lr, x };
    })
    .filter((x) => x.lr && x.gap >= MOMENTS.upsetGap)
    .sort((a, b) => a.lr - b.lr);
  for (const x of ups.slice(0, 2)) {
    const r = x.x.result!;
    rows.push({ text: `UPSET: ${SCHOOL(x.w)} OVER ${ranked(before, x.l)}`, val: `${Math.max(r.home, r.away)}-${Math.min(r.home, r.away)}`, team: x.w });
  }
  if (after?.week === week && after.ranks[0] && before?.ranks[0] && after.ranks[0].team !== before.ranks[0].team) {
    rows.push({ text: `NEW NO. 1: ${SCHOOL(after.ranks[0].team)}`, team: after.ranks[0].team, me: after.ranks[0].team === u });
  }
  const bo = ev.breakouts.filter((e) => e.team !== u).sort((a, b) => Number(!!b.athlete.real) - Number(!!a.athlete.real))[0];
  if (bo) rows.push({ text: `BREAKOUT: ${athleteName(bo.athlete).toUpperCase()} ${ABBR(bo.team)} ${bo.athlete.pos}`, team: bo.team });
  const bz = state.buzz?.[state.buzz.length - 1];
  if (bz?.week === week) {
    const prev = state.buzz!.length > 1 ? state.buzz![state.buzz!.length - 2] : undefined;
    for (const [i, f] of bz.top.slice(0, Math.max(1, MOMENTS.aroundRows - rows.length)).slice(0, 3).entries()) {
      const was = prev ? prev.top.findIndex((x) => x.id === f.id) : -1;
      rows.push({ text: `HEISMAN ${i + 1}. ${f.name.toUpperCase()} ${ABBR(f.team)}`, mv: prev ? (was < 0 ? 10 - i : was - i) : undefined, me: f.team === u, team: f.team });
    }
  }
  if (rows.length) add({ key: 'around', kind: 'around', tier: 1, w: -1, title: 'AROUND THE FBS', sub: `WEEK ${week}`, lines: [], rows: rows.slice(0, MOMENTS.aroundRows + 1) });
}

/**
 * The order the Week Wrap plays them: the final first, then by tier and weight, the level-up tiles, UP
 * NEXT and AROUND THE FBS last. `big` keeps the final, decisions, the top `MOMENTS.big` other tier 2+
 * moments, UP NEXT and AROUND THE FBS.
 */
export function wrapOrder(ms: Moment[], level: 'all' | 'big' | 'off'): Moment[] {
  if (level === 'off') return [];
  // An offseason reveal or the season opener plays every card, in the order it was built.
  if (ms.length && ms.every((m) => m.os)) return [...ms];
  const rank = (m: Moment) => (m.kind === 'final' ? 0 : m.kind === 'around' ? 4 : m.kind === 'preview' ? 3 : m.kind === 'progress' ? 2 : 1);
  const sorted = [...ms].sort((a, b) => rank(a) - rank(b) || b.tier - a.tier || b.w - a.w);
  if (level === 'all') return sorted;
  const mid = sorted.filter((m) => rank(m) === 1 && (m.tier >= 2 || m.kind === 'decision'));
  const keep = [...mid.filter((m) => m.kind === 'decision'), ...mid.filter((m) => m.kind !== 'decision').slice(0, MOMENTS.big)];
  return sorted.filter((m) => rank(m) === 0 || rank(m) >= 3 || keep.includes(m));
}

/** The moments the user hasn't seen, in the wrap's order for their setting. */
export function unseenWrap(state: SeasonState): Moment[] {
  const ms = (state.moments ?? []).slice(state.seenMoments ?? 0);
  // Decisions always show, whatever the setting.
  const level = state.config.wrap ?? 'big';
  const shown = wrapOrder(ms, level);
  for (const m of ms) if (m.kind === 'decision' && !shown.includes(m)) shown.push(m);
  return shown;
}

export function markSeen(state: SeasonState): void {
  state.seenMoments = state.moments?.length ?? 0;
}

/** The week's biggest moment for HOME: the top non-final, non-list moment, else the final. */
export function headlineMoment(state: SeasonState): Moment | undefined {
  const ms = state.moments ?? [];
  if (!ms.length) return undefined;
  const week = ms[ms.length - 1].week;
  const wk = ms.filter((m) => m.week === week);
  // A list card (the staff, arrivals, a class) isn't a headline; a player's card is.
  const list = (m: Moment) => ['staff', 'farewell', 'arrivals', 'portal'].includes(m.kind) || (['draft', 'signing'].includes(m.kind) && !m.p);
  return wk.filter((m) => !['final', 'around', 'progress', 'decision', 'preview'].includes(m.kind) && !list(m)).sort((a, b) => b.tier - a.tier || b.w - a.w)[0] ?? wk.find((m) => m.kind === 'final');
}

/**
 * One card per player a week: a story beat about a player who also has a first start, a breakout or an
 * injury card folds into that card (its lines added, its storyline linked).
 */
export function mergeWeek(ms: Moment[], stories: SeasonState['stories']): Moment[] {
  const main = ms.filter((m) => m.kind === 'firstStart' || m.kind === 'breakout');
  const out: Moment[] = [];
  for (const m of ms) {
    if (m.kind === 'story' && m.p) {
      const host = main.find((x) => x.p?.id === m.p!.id);
      if (host) {
        host.arc ??= m.arc;
        for (const l of m.lines) if (l && !host.lines.includes(l) && !host.lines.some((h) => h.includes(l))) host.lines.push(l);
        continue;
      }
    }
    out.push(m);
  }
  for (const m of out) {
    if (m.arc || !m.p || (m.kind !== 'injury' && m.kind !== 'breakout' && m.kind !== 'firstStart')) continue;
    const s = (stories ?? []).find((x) => x.status === 'open' && (m.kind === 'injury' ? x.kind === 'nextManUp' && x.other?.id === m.q?.id : x.star?.id === m.p!.id));
    if (s) m.arc = s.id;
  }
  return out;
}

/** The newest week's moments, in the order the wrap plays them all. */
export function lastWeekMoments(state: SeasonState): Moment[] {
  const ms = state.moments ?? [];
  const last = ms[ms.length - 1];
  // A week's moments, or the latest offseason reveal (one stage's, or the opener).
  return wrapOrder(ms.filter((m) => m.week === last?.week && m.os === last?.os), 'all');
}
