import { CALENDAR } from '../data/season/calendar';
import { TEAM_STATE } from '../data/fbs/geo';
import { athleteName, healthy, starters, type Squad } from '../data/depth';
import type { Athlete } from '../data/athletes';
import { overall } from '../data/positions';
import { teamById } from '../data/teams';
import { BREAKOUT, CONFIDENCE, START_SLOTS } from './confidence';
import { impact, statLine } from './gameStars';
import { injuredStarters, momentPlayer, withPos, MOMENTS, nextGame, nextText, pick, userGame, type WeekEvents } from './moments';
import { rivalrySeries } from './program';
import { inHome, toggleVisit } from './recruiting';
import { recruitStories, recruitTag } from './recruitStories';
import { prospect } from '../data/recruits';
import { teamStories } from './teamStories';
import { records, recordText, winner } from './standings';
import type { Moment, MomentPlayer, SeasonGame, SeasonState, Storyline, StoryKind } from './types';
import { squadFor } from './world';

/**
 * Storylines (docs/STORYLINES.md): the user's season as a handful of running stories, a few weeks
 * each, with what the next game decides. They open, move and close from what the week's steps logged;
 * nothing here draws randomness or touches the sim. A storyline's turning point can offer a decision
 * (who starts), which acts only through the depth chart (`decide`).
 */

/**
 * - `hotHand`: the backup's built-up confidence that makes his run good enough to ask who starts.
 * - `slump`: built-up confidence a starter must sink to for a slump story (deeper than the staff's
 *   `CONFIDENCE.slump`, so it's a real one), after `slumpStarts` starts, at a position weighing
 *   `slumpW` or more (or the kicker); at most `slumpOpen` at once.
 * - `slumpOut`: confidence a slumping starter climbs back over to snap out of it; after `slumpWeeks`
 *   the story closes anyway.
 * - `slumpReach`: overall points a backup may trail a slumping starter by and still be offered.
 * - `decideW`: positions whose job a decision is offered for (`MOMENTS.posW` at or over it).
 * - `unbeaten`: wins with no loss that open the unbeaten run.
 * - `bowlLeft`: regular-season games left when the bowl chase opens.
 */
export const STORY = { hotHand: 0.15, slump: -0.5, slumpStarts: 3, slumpW: 0.55, slumpOpen: 2, slumpOut: -0.2, slumpWeeks: 5, slumpReach: 4, decideW: 0.6, unbeaten: 5, bowlLeft: 4 };

const SCHOOL = (id: string) => teamById(id).school.toUpperCase();

export function open(state: SeasonState, kind: StoryKind, key: string): Storyline | undefined {
  return state.stories?.find((s) => s.status === 'open' && s.kind === kind && s.id.startsWith(`${kind}:${key}`));
}

export function had(state: SeasonState, kind: StoryKind, key: string): boolean {
  return !!state.stories?.some((s) => s.kind === kind && s.id.startsWith(`${kind}:${key}`));
}

/** The squad's player by id, now. */
function who(sq: Squad, id: string) {
  return sq.athletes.find((a) => a.id === id);
}

/** Starts at `slot` this season: the last game's starters (`TeamState.st`) is who started. */
function startedAt(state: SeasonState, id: string): boolean {
  return Object.values(state.teamState[state.config.userTeamId]?.st ?? {}).includes(id);
}

/** What a week's story code shares: the state, the week's game, and the add / beat / resolve helpers. */
export interface StoryKit {
  state: SeasonState;
  u: string;
  week: number;
  ev: WeekEvents;
  out: Moment[];
  g: SeasonGame | undefined;
  won: boolean;
  next: SeasonGame | undefined;
  sq: Squad;
  roles: Set<string>;
  add: (s: Omit<Storyline, 'opened' | 'status' | 'beats'>) => Storyline;
  beat: (s: Storyline, text: string, tone: 'up' | 'down' | 'flat', m?: Partial<Moment> & { tier?: 1 | 2 | 3 }) => void;
  resolve: (s: Storyline, outcome: string) => void;
  line: (id: string) => import('./types').PlayerLine | undefined;
  prog: (id: string) => import('./types').Progress | undefined;
}

/**
 * One week of the user's storylines: close what ended, move what's running, open what started, then
 * the preview of the next game. Returns the week's beats as moments (each with its `arc`).
 */
export function storyStep(state: SeasonState, week: number, ev: WeekEvents): Moment[] {
  const u = state.config.userTeamId;
  const stories = (state.stories ??= []);
  const out: Moment[] = [];
  const sq = squadFor(state, u);
  const roles = startingRoles(state, sq);
  const g = userGame(state, week);
  const won = g ? winner(g) === u : false;
  const next = nextGame(state, week);
  const beat = (s: Storyline, text: string, tone: 'up' | 'down' | 'flat', m?: Partial<Moment> & { tier?: 1 | 2 | 3 }) => {
    s.beats.push({ week, text, tone });
    if (m) {
      out.push({
        id: `${state.year}:${week}:arc:${s.id}`, week, kind: 'story', tier: m.tier ?? 2, w: m.w ?? 1, team: u,
        title: s.title, sub: m.sub ?? text, lines: m.lines ?? [], p: s.star, q: s.other, arc: s.id, ...m,
      } as Moment);
    }
  };
  const resolve = (s: Storyline, outcome: string) => {
    s.status = 'resolved';
    s.outcome = outcome;
    delete s.meter;
    s.stakes = '';
  };
  const add = (s: Omit<Storyline, 'opened' | 'status' | 'beats'>): Storyline => {
    const full: Storyline = { ...s, opened: week, status: 'open', beats: [] };
    stories.push(full);
    return full;
  };
  const line = (id: string) => (g ? g.result!.box.players.find((l) => l.id === id) : undefined);
  const prog = (id: string) => state.teamState[u]?.progress?.[id];
  const opp = g ? (g.home === u ? g.away : g.home) : '';
  const kit: StoryKit = { state, u, week, ev, out, g, won, next, sq, roles, add, beat, resolve, line, prog };

  // A decision left open last week: the staff's chart stood (or the chance passed).
  for (const s of stories) {
    if (s.status !== 'open' || !s.decision || s.decision.chosen !== undefined || s.decision.week >= week) continue;
    if (keepsGoing(s)) {
      s.decision.chosen = '';
      s.beats.push({ week, text: s.decision.act === 'visit' ? 'NO VISIT THIS TIME' : s.decision.act === 'inhome' ? 'NO IN-HOME' : 'THE STAFF KEPT THE CHART', tone: 'flat' });
      continue;
    }
    const who = s.decision.options.find((o) => startedAt(state, o.id)) ?? s.decision.options[0];
    s.decision.chosen = who.id;
    resolve(s, `THE STAFF'S CALL: ${who.label.replace(/^(RIDE|GO BACK TO|STICK WITH|START) /, '')} STARTED`);
  }

  // ---- Next man up: an injured starter's replacement, start by start, to the starter's return.
  for (const s of stories.filter((x) => x.kind === 'nextManUp' && x.status === 'open' && !x.decision && x.opened < week)) {
    const star = who(sq, s.star!.id);
    const back = who(sq, s.other!.id);
    if (g && star && startedAt(state, star.id)) {
      const k = (s.k ??= {});
      k.starts = (k.starts ?? 0) + 1;
      k.wins = (k.wins ?? 0) + (won ? 1 : 0);
      const l = line(star.id);
      const rec = `${k.wins}-${k.starts - k.wins}`;
      const good = l ? impact(l, false) > 0 : won;
      const stat = l ? statLine(l) : won ? 'THE WIN' : 'A LOSS';
      beat(s, `${won ? 'W' : 'L'} VS ${teamById(opp).abbr}: ${stat}`, won ? 'up' : 'down', {
        tier: good || k.starts === 1 ? 2 : 1, w: 1 + (MOMENTS.posW[s.star!.pos] ?? 0.5),
        sub: `${withPos(s.star!)}: ${rec} AS THE STARTER`, lines: back && healthy(back) ? [stat] : [stat, s.stakes],
      });
    }
    if (back && healthy(back)) {
      // The starter is back: was the run good enough to ask?
      const c = prog(s.star!.id)?.c ?? 0;
      const k = s.k ?? {};
      if (star && healthy(star) && (k.starts ?? 0) >= 1 && c >= STORY.hotHand && (MOMENTS.posW[s.star!.pos] ?? 0) >= STORY.decideW) {
        s.decision = {
          prompt: `${withPos(s.other!)} IS HEALTHY. WHO STARTS AT ${s.star!.pos}?`, slot: s.slot!, week,
          options: [
            { id: star.id, label: `RIDE ${withPos(s.star!)}`, sub: `${k.wins ?? 0}-${(k.starts ?? 0) - (k.wins ?? 0)} AS THE STARTER, ${overall(star.r, star.pos)} OVR, PLAYING WITH CONFIDENCE` },
            { id: back.id, label: `GO BACK TO ${withPos(s.other!)}`, sub: `THE STARTER, ${overall(back.r, back.pos)} OVR, BACK FROM INJURY` },
          ],
        };
        s.stakes = 'YOUR CALL: WHO STARTS';
        beat(s, `${withPos(s.other!)} IS BACK. A ${s.star!.pos} CONTROVERSY.`, 'flat');
        out.push(decisionMoment(state, week, s));
      } else {
        const k2 = s.k ?? {};
        const rec = `${k2.wins ?? 0}-${(k2.starts ?? 0) - (k2.wins ?? 0)}`;
        // Who the chart has at the slot now: the staff may keep the backup on.
        const next = starters(sq)[s.slot!]?.id;
        const text = !k2.starts
          ? `${withPos(s.other!)} IS BACK`
          : next === s.star!.id
            ? `${withPos(s.other!)} IS BACK, BUT ${withPos(s.star!)} KEEPS THE JOB (${rec} AS THE STARTER)`
            : `${withPos(s.other!)} IS BACK; ${withPos(s.star!)} RETURNS TO THE BENCH AFTER ${k2.starts} START${k2.starts === 1 ? '' : 'S'} (${rec})`;
        beat(s, text, 'flat', { tier: 1, sub: text });
        resolve(s, text);
      }
    } else if (star && !healthy(star)) {
      resolve(s, `${withPos(s.star!)} WAS HURT TOO`);
    } else if (s.k?.due) {
      const left = Math.max(0, s.k.due - week - 1);
      s.stakes = left ? `${withPos(s.other!)} BACK IN ABOUT ${left} WEEK${left === 1 ? '' : 'S'}` : `${withPos(s.other!)} COULD BE BACK NEXT WEEK`;
    }
  }
  for (const { e, up: step } of injuredStarters(state, week)) {
    if (!e.season && e.weeks < 2) continue;
    const inj = who(sq, e.id);
    if (!step || !inj) continue;
    const star = momentPlayer(step.athlete, u);
    const other = momentPlayer(inj, u);
    const s = add({
      id: `nextManUp:${step.athlete.id}:${week}`, kind: 'nextManUp', team: u, title: 'NEXT MAN UP', star, other, slot: step.slot,
      stakes: e.season ? `THE JOB IS ${withPos(star)}'S FOR THE SEASON` : `${withPos(other)} BACK IN ABOUT ${e.weeks} WEEKS`,
      k: { due: e.season ? 99 : week + e.weeks, starts: 0, wins: 0 },
    });
    beat(s, `${withPos(other)} GOES DOWN (${e.type.toUpperCase()}). ${withPos(star)} IS UP.`, 'down');
  }

  // ---- Breakout watch: a spark's four-game window.
  for (const s of stories.filter((x) => x.kind === 'breakoutWatch' && x.status === 'open')) {
    const p = prog(s.star!.id);
    const bo = ev.breakouts.find((b) => b.athlete.id === s.star!.id);
    if (bo) {
      beat(s, 'HE BROKE OUT', 'up');
      resolve(s, `BROKE OUT: NOW ${bo.to.toUpperCase()}`);
    } else if (!p?.sw) {
      beat(s, 'THE SPARK FADES', 'down', { tier: 1, sub: `${withPos(s.star!)}: THE SPARK FADES`, lines: ['THE WINDOW CLOSED WITHOUT A BREAKOUT'] });
      resolve(s, 'THE WINDOW CLOSED');
    } else {
      s.meter = watchMeter(p.sw);
      s.stakes = watchStakes(p.sw);
      s.k = { starts: p.sw.n, need: BREAKOUT.minStarts };
    }
  }
  for (const e of ev.sparks.filter((x) => x.team === u)) {
    const p = prog(e.athlete.id);
    if (!p?.sw) continue;
    const star = momentPlayer(who(sq, e.athlete.id) ?? e.athlete, u);
    const s = add({
      id: `breakoutWatch:${e.athlete.id}:${state.year}`, kind: 'breakoutWatch', team: u, title: 'BREAKOUT WATCH', star,
      stakes: watchStakes(p.sw), meter: watchMeter(p.sw), k: { starts: p.sw.n, need: BREAKOUT.minStarts },
    });
    beat(s, `${withPos(star)} STEPS IN FOR ${withPos({ pos: e.replaced.pos, name: athleteName(e.replaced) })}`, 'up', {
      tier: 2, w: 1.5 + (MOMENTS.posW[star.pos] ?? 0.5), sub: `${withPos(star)}: THE CHANCE`,
      lines: [`START ${BREAKOUT.minStarts} OF HIS FIRST ${BREAKOUT.games} GAMES AND PLAY WELL, AND HE BREAKS OUT`],
    });
  }

  // ---- Slumps: a starter's confidence through the floor; the job is at stake.
  for (const s of stories.filter((x) => x.kind === 'slump' && x.status === 'open' && !x.decision)) {
    const a = who(sq, s.star!.id);
    const c = prog(s.star!.id)?.c ?? 0;
    if (!a || !healthy(a)) {
      // Hurt (or gone): the slump isn't the story any more; next man up tells the rest.
      s.beats.push({ week, text: a ? 'HURT' : 'GONE', tone: 'down' });
      resolve(s, a ? 'HURT' : 'LEFT THE TEAM');
    } else if (!roles.has(a.id)) {
      // Not starting and not slated to: the chart has moved on (a rest day keeps him slated).
      beat(s, 'LOSES THE JOB', 'down', { tier: 1, sub: `${withPos(s.star!)} LOSES THE JOB` });
      resolve(s, 'LOST THE JOB');
    } else if (c > STORY.slumpOut) {
      beat(s, 'SNAPS OUT OF IT', 'up', { tier: 2, sub: `${withPos(s.star!)} SNAPS OUT OF IT`, lines: g && line(s.star!.id) ? [statLine(line(s.star!.id)!)] : [] });
      resolve(s, 'SNAPPED OUT OF IT');
    } else if (week - s.opened >= STORY.slumpWeeks) {
      s.beats.push({ week, text: 'STILL SEARCHING', tone: 'down' });
      resolve(s, 'A LONG SLUMP');
    }
  }
  const st = state.teamState[u]?.st ?? {};
  // Two straight wins: nobody's "in a slump" on a team that's rolling, whatever his number says.
  const lastTwo = state.games.filter((x) => x.result && (x.home === u || x.away === u)).sort((a, b) => a.week - b.week).slice(-2);
  const rolling = lastTwo.length === 2 && lastTwo.every((x) => winner(x) === u);
  for (const [slot, id] of rolling ? [] : Object.entries(st)) {
    const a = who(sq, id);
    const c = prog(id)?.c ?? 0;
    if (!a || !healthy(a) || !roles.has(id) || c > STORY.slump || (prog(id)?.gs ?? 0) < STORY.slumpStarts || had(state, 'slump', `${id}:${state.year}`) || prog(id)?.sp) continue;
    if ((MOMENTS.posW[a.pos] ?? 0) < STORY.slumpW && a.pos !== 'K') continue;
    if (stories.filter((x) => x.kind === 'slump' && x.status === 'open').length >= STORY.slumpOpen) break;
    const star = momentPlayer(a, u);
    const s = add({ id: `slump:${id}:${state.year}`, kind: 'slump', team: u, title: 'IN A SLUMP', star, slot, stakes: 'HIS JOB' });
    const alt = challenger(state, sq, slot, a, roles);
    if (alt && (MOMENTS.posW[a.pos] ?? 0) >= STORY.decideW) {
      s.other = momentPlayer(alt, u);
      s.decision = {
        prompt: `${withPos(star)} IS PRESSING. DO YOU MAKE A CHANGE?`, slot, week,
        options: [
          { id, label: `STICK WITH ${withPos(star)}`, sub: `${star.ovr} OVR. A BENCHING COULD COST HIM MORE` },
          { id: alt.id, label: `START ${withPos(s.other)}`, sub: `${s.other.ovr} OVR, ${s.other.cls}. NO ROLE YET, HUNGRY FOR A CHANCE` },
        ],
      };
      s.stakes = 'YOUR CALL: STICK WITH HIM OR MAKE A CHANGE';
      beat(s, `${withPos(star)} IS IN A SLUMP`, 'down');
      out.push(decisionMoment(state, week, s));
    } else {
      beat(s, `${withPos(star)} IS IN A SLUMP`, 'down', { tier: 1, sub: `${withPos(star)} IS IN A SLUMP`, lines: ['HE NEEDS A GOOD GAME'] });
    }
  }

  // ---- The Heisman campaign.
  const bz = state.buzz?.[state.buzz.length - 1];
  for (const s of stories.filter((x) => x.kind === 'heisman' && x.status === 'open')) {
    if (ev.selection) {
      const h = state.awards.find((a) => a.id === 'heisman');
      const at = h?.finalists.findIndex((f) => f.id === s.star!.id) ?? -1;
      const text = at === 0 ? 'WON THE HEISMAN TROPHY' : at > 0 ? `FINISHED ${at + 1}${['ST', 'ND', 'RD'][at] ?? 'TH'} IN THE HEISMAN VOTE` : 'MISSED THE CEREMONY';
      beat(s, text, at === 0 ? 'up' : 'flat');
      resolve(s, text);
      continue;
    }
    if (bz?.week !== week) continue;
    const at = bz.top.findIndex((f) => f.id === s.star!.id);
    if (at < 0) {
      beat(s, 'FALLS OUT OF THE RACE', 'down', { tier: 1, sub: `${withPos(s.star!)} FALLS OUT OF THE HEISMAN RACE` });
      resolve(s, 'FELL OUT OF THE RACE');
      continue;
    }
    s.meter = { at: 10 - at, of: 10, label: `NO. ${at + 1} IN THE RACE` };
    s.stakes = next ? `NO. ${at + 1}. NEXT: ${nextText(state, next)}` : `NO. ${at + 1} IN THE RACE`;
    s.beats.push({ week, text: `NO. ${at + 1}`, tone: 'flat' });
  }
  if (bz?.week === week) {
    const mine = bz.top.findIndex((f) => f.team === u);
    const f = bz.top[mine];
    if (f && mine < 5 && !had(state, 'heisman', `${f.id}:${state.year}`)) {
      const a = who(sq, f.id);
      if (a) {
        add({
          id: `heisman:${f.id}:${state.year}`, kind: 'heisman', team: u, title: 'HEISMAN CAMPAIGN', star: momentPlayer(a, u),
          meter: { at: 10 - mine, of: 10, label: `NO. ${mine + 1} IN THE RACE` }, stakes: next ? `NO. ${mine + 1}. NEXT: ${nextText(state, next)}` : `NO. ${mine + 1}`,
        }).beats.push({ week, text: `ENTERS THE RACE AT NO. ${mine + 1}`, tone: 'up' });
      }
    }
  }

  // ---- The team: an unbeaten run, the bowl chase.
  const rec = records(state).get(u)!;
  const unb = open(state, 'unbeaten', `${state.year}`);
  if (unb && rec.l) {
    beat(unb, `THE RUN ENDS AT ${rec.w}-0`, 'down', { tier: 2, sub: `PERFECT NO MORE: THE RUN ENDS AT ${rec.w}-0`, lines: [`NOW ${recordText(rec)}`] });
    resolve(unb, `ENDED AT ${rec.w}-0`);
  } else if (unb) {
    unb.stakes = next ? `${rec.w}-0. NEXT: ${nextText(state, next)}` : `${rec.w}-0`;
    unb.meter = { at: rec.w, of: CALENDAR.games, label: `${rec.w}-0` };
  } else if (!rec.l && rec.w >= STORY.unbeaten && state.phase === 'regular' && !had(state, 'unbeaten', `${state.year}`)) {
    add({ id: `unbeaten:${state.year}`, kind: 'unbeaten', team: u, title: 'THE UNBEATEN RUN', stakes: next ? `${rec.w}-0. NEXT: ${nextText(state, next)}` : `${rec.w}-0`, meter: { at: rec.w, of: CALENDAR.games, label: `${rec.w}-0` } })
      .beats.push({ week, text: `${rec.w}-0`, tone: 'up' });
  }
  const left = state.games.filter((x) => (x.home === u || x.away === u) && !x.result && (x.kind === 'conf' || x.kind === 'nonconf')).length;
  const chase = open(state, 'bowlChase', `${state.year}`);
  const need = Math.max(0, 6 - rec.w);
  if (chase) {
    if (!need) {
      beat(chase, 'BOWL ELIGIBLE', 'up');
      resolve(chase, 'MADE IT: BOWL ELIGIBLE');
    } else if (need > left) {
      beat(chase, 'NO BOWL THIS YEAR', 'down', { tier: 2, sub: 'NO BOWL THIS YEAR', lines: [`${recordText(rec)} WITH ${left} TO PLAY`] });
      resolve(chase, 'FELL SHORT');
    } else {
      chase.stakes = `NEED ${need} OF THE LAST ${left}`;
      chase.meter = { at: rec.w, of: 6, label: `${rec.w} OF 6 WINS` };
    }
  } else if (state.phase === 'regular' && need && need <= left && left <= STORY.bowlLeft && !had(state, 'bowlChase', `${state.year}`)) {
    const s = add({ id: `bowlChase:${state.year}`, kind: 'bowlChase', team: u, title: 'THE BOWL CHASE', stakes: `NEED ${need} OF THE LAST ${left}`, meter: { at: rec.w, of: 6, label: `${rec.w} OF 6 WINS` } });
    beat(s, `NEED ${need} OF THE LAST ${left}`, 'flat');
  }

  // ---- Game stories close with the game.
  if (g) {
    for (const s of stories.filter((x) => x.status === 'open' && x.game === g.id)) {
      const pl = s.star ? line(s.star.id) : undefined;
      const [us, them] = g.home === u ? [g.result!.home, g.result!.away] : [g.result!.away, g.result!.home];
      const text = `${won ? 'WON' : 'LOST'} ${us}-${them}${pl ? `; ${withPos(s.star!)}: ${statLine(pl)}` : ''}`;
      beat(s, text, won ? 'up' : 'down');
      resolve(s, text);
    }
  }
  if (next) openGameStories(state, week, next, sq, add);

  // ---- Recruiting, the races, morale, new faces, draft stock (season/recruitStories.ts, teamStories.ts).
  recruitStories(kit);
  teamStories(kit);

  // ---- The preview: what the next game decides.
  if (next) {
    const rows = stories
      .filter((s) => s.status === 'open' && s.stakes && (s.game === next.id || !s.game))
      .sort((a, b) => Number(b.game === next.id) - Number(a.game === next.id))
      .slice(0, 5)
      .map((s) => ({ text: `${s.title}${s.star ? `: ${withPos(s.star)}` : ''}`, val: s.stakes, team: u, me: s.game === next.id }));
    // Recruits the user is hosting on official visits.
    const visiting = next.home === u ? (state.recruiting?.visits[next.id] ?? []).map((id) => prospect(id)).filter((p): p is NonNullable<typeof p> => !!p) : [];
    if (visiting.length) rows.push({ text: 'IN THE STANDS', val: `OFFICIAL VISITS: ${visiting.slice(0, 3).map(recruitTag).join(', ')}${visiting.length > 3 ? ` +${visiting.length - 3}` : ''}`, team: u, me: false });
    if (rows.length) {
      out.push({
        id: `${state.year}:${week}:preview`, week, kind: 'preview', tier: 1, w: -0.5, team: u, title: 'UP NEXT', sub: nextText(state, next),
        lines: [next.name ? next.name.toUpperCase() : `WEEK ${next.week}`], rows, game: next.id,
        opp: next.home === u ? next.away : next.home,
      });
    }
  }
  return out;
}

/** Rivalry, reunion and homecoming stories for the next game, opened the week before it. */
function openGameStories(state: SeasonState, week: number, next: SeasonGame, sq: Squad, add: (s: Omit<Storyline, 'opened' | 'status' | 'beats'>) => Storyline): void {
  const u = state.config.userTeamId;
  if (state.stories?.some((s) => s.game === next.id)) return;
  const opp = next.home === u ? next.away : next.home;
  if (next.name && (next.kind === 'conf' || next.kind === 'nonconf')) {
    const s = rivalrySeries(state, u, opp);
    const last = s.games[s.games.length - 1];
    const stakes = last && !last.won ? `REVENGE: THEY WON LAST YEAR` : s.w + s.l ? `SERIES UNDER YOU ${s.w}-${s.l}${s.streak > 1 ? `, ${s.streak} STRAIGHT` : ''}` : 'YOUR FIRST ONE AS HEAD COACH';
    add({ id: `rivalry:${next.id}`, kind: 'rivalry', team: u, title: next.name.toUpperCase(), game: next.id, stakes })
      .beats.push({ week, text: stakes, tone: 'flat' });
  }
  const st = new Set(Object.values(state.teamState[u]?.st ?? {}));
  const starters = sq.athletes.filter((a) => st.has(a.id) && healthy(a));
  const prog = state.teamState[u]?.progress ?? {};
  const old = starters.find((a) => prog[a.id]?.tr?.from === opp);
  if (old && !state.stories?.some((s) => s.kind === 'reunion' && s.star?.id === old.id && s.id.endsWith(`${state.year}`))) {
    const star = momentPlayer(old, u);
    add({ id: `reunion:${next.id}:${state.year}`, kind: 'reunion', team: u, title: 'REUNION', star, game: next.id, stakes: `FACES ${SCHOOL(opp)}, THE TEAM HE LEFT` })
      .beats.push({ week, text: `FACES HIS OLD TEAM`, tone: 'flat' });
  }
  const oppState = TEAM_STATE[opp];
  if (oppState && oppState !== TEAM_STATE[u] && !next.neutral && next.away === u) {
    const home = starters
      .filter((a) => a.hometown.state === oppState && !state.stories?.some((s) => s.kind === 'homecoming' && s.star?.id === a.id))
      .sort((a, b) => (MOMENTS.posW[b.pos] ?? 0) - (MOMENTS.posW[a.pos] ?? 0))[0];
    if (home) {
      const star = momentPlayer(home, u);
      const stakes = pick([`PLAYS IN FRONT OF FAMILY IN ${oppState}`, `COMES HOME TO ${oppState}`, `BACK IN ${oppState}: HIS HOMETOWN CROWD`], home.id);
      add({ id: `homecoming:${next.id}:${home.id}`, kind: 'homecoming', team: u, title: 'HOMECOMING', star, game: next.id, stakes })
        .beats.push({ week, text: `FROM ${star.home}`, tone: 'flat' });
    }
  }
}

/**
 * Everyone with a starting role: last game's starters, the chart's next lineup, and the top of every
 * slot's list (a starter sitting hurt or resting keeps his role).
 */
export function startingRoles(state: SeasonState, sq: Squad): Set<string> {
  const ids = new Set(Object.values(state.teamState[state.config.userTeamId]?.st ?? {}));
  for (const a of Object.values(starters(sq))) ids.add(a.id);
  for (const slot of START_SLOTS) if (sq.depth[slot]?.[0]) ids.add(sq.depth[slot][0]);
  return ids;
}

/**
 * Who could take a slumping starter's job: a healthy player on the slot's list with no starting role
 * anywhere, not slumping himself and not in a slump story, within `slumpReach` overall of him.
 */
export function challenger(state: SeasonState, sq: Squad, slot: string, a: Athlete, roles: Set<string>): Athlete | undefined {
  const prog = state.teamState[state.config.userTeamId]?.progress ?? {};
  const slumping = new Set((state.stories ?? []).filter((x) => x.kind === 'slump' && x.status === 'open').map((x) => x.star?.id));
  return (sq.depth[slot] ?? [])
    .map((x) => who(sq, x))
    .find((x): x is Athlete => !!x && x.id !== a.id && healthy(x) && !roles.has(x.id) && !slumping.has(x.id)
      && (prog[x.id]?.c ?? 0) > CONFIDENCE.slump && overall(x.r, x.pos) >= overall(a.r, a.pos) - STORY.slumpReach);
}

type Window = { t: number; n: number; z: number; r?: string };

/** One box per game of the window (what each game was), and the rule under them. */
function watchMeter(sw: Window): Storyline['meter'] {
  return {
    at: sw.t, of: BREAKOUT.games, pips: sw.r ?? '?'.repeat(sw.t),
    label: `START ${BREAKOUT.minStarts} OF HIS FIRST ${BREAKOUT.games} GAMES AND PLAY WELL`,
  };
}

/** Where he stands: the starts he still needs in the games left, and whether his play is good enough. */
function watchStakes(sw: Window): string {
  const left = BREAKOUT.games - sw.t;
  const need = Math.max(0, BREAKOUT.minStarts - sw.n);
  const pl = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 'S'}`;
  if (need > left) return 'OUT OF REACH: MISSED TOO MANY STARTS';
  const starts = need ? `NEEDS ${sw.n ? `${need} MORE` : need} START${need === 1 ? '' : 'S'} IN ${pl(left, 'GAME')}` : `HAS HIS ${BREAKOUT.minStarts} STARTS`;
  if (!sw.n) return starts;
  return `${starts}, ${sw.z / sw.n >= BREAKOUT.z ? 'PLAYING WELL' : 'GRADES TOO LOW'}`;
}

export function decisionMoment(state: SeasonState, week: number, s: Storyline): Moment {
  return {
    id: `${state.year}:${week}:decide:${s.id}`, week, kind: 'decision', tier: 3, w: 10, team: state.config.userTeamId,
    title: 'YOUR CALL', sub: s.decision!.prompt, lines: [], p: s.star, q: s.other, arc: s.id,
  };
}

/** The storylines waiting on the user's decision. */
export function pendingDecisions(state: SeasonState): Storyline[] {
  return (state.stories ?? []).filter((s) => s.status === 'open' && s.decision && s.decision.chosen === undefined);
}

/** A storyline that runs on after its decision: a recruitment, a transfer risk. */
function keepsGoing(s: Storyline): boolean {
  return (s.decision?.act ?? 'depth') !== 'depth' || s.kind === 'transferRisk';
}

/**
 * Take a decision: the chosen player starts at its slot. A user-edited chart is edited; a staff chart
 * gets a pin the staff honor while he's healthy (`TeamState.pin`, laid on in `squadFor`). Everything
 * that follows is the sim's own: morale's job and bench reactions, the benching penalty, sparks.
 */
export function decide(state: SeasonState, storyId: string, id: string): void {
  const s = state.stories?.find((x) => x.id === storyId);
  const d = s?.decision;
  if (!s || !d || d.chosen !== undefined || !d.options.some((o) => o.id === id)) return;
  d.chosen = id;
  const o = d.options.find((x) => x.id === id)!;
  if (keepsGoing(s)) {
    // The lever, then the story carries on: a visit, an in-home, a start for an unhappy player.
    const u = state.config.userTeamId;
    if (id && d.act === 'visit') toggleVisit(state, id);
    else if (id && d.act === 'inhome') inHome(state, u, id);
    else if (id) pinStarter(state, d.slot, id);
    s.beats.push({ week: d.week, text: id ? `YOU CHOSE: ${o.label}` : 'YOU PASSED', tone: 'flat' });
    return;
  }
  pinStarter(state, d.slot, id);
  const text = `YOU CHOSE: ${o.label}`;
  s.beats.push({ week: d.week, text, tone: 'flat' });
  s.status = 'resolved';
  s.outcome = text;
  s.stakes = '';
}

/** `id` starts at `slot`: a user-edited chart is edited, a staff chart gets the pin. */
function pinStarter(state: SeasonState, slot: string, id: string): void {
  const ts = (state.teamState[state.config.userTeamId] ??= {} as never);
  if (ts.depth && !state.config.delegate.depthChart) {
    const list = (ts.depth[slot] ?? []).filter((x) => x !== id);
    ts.depth = { ...ts.depth, [slot]: [id, ...list] };
  } else {
    ts.pin = { slot, id };
  }
}

/** The storyline a moment belongs to. */
export function storyOf(state: SeasonState, m: Pick<Moment, 'arc'>): Storyline | undefined {
  return m.arc ? state.stories?.find((s) => s.id === m.arc) : undefined;
}

export type { MomentPlayer };
