import { athleteName, starters } from '../data/depth';
import { RIVALRIES } from '../data/season/rivalries';
import { teamById, type Team } from '../data/teams';
import { hashString } from '../engine/math';
import { heismanRace } from './awards';
import { securityOf } from './carousel';
import { HOT_SEAT } from './coach';
import { storySignals } from './fanStories';
import { latestPoll, rankIn } from './polls';
import { coachStart, coachTenure, ordinal, pastSeasons, rivalrySeries, trophies, type SeasonRow, type Tenure, type Trophies } from './program';
import { classRanks } from './recruiting';
import { records, recordText, standings, type TeamRecord } from './standings';
import { seasonStats } from './stats';
import type { SeasonState } from './types';
import { squadFor } from './world';

/**
 * The fan pulse: what a program's fans are feeling and talking about, from what a fan would know
 * (the record against what was expected, the head coach's year, the QB, the rivalry, the polls, the
 * trend, recruiting), and the program's own stories (season/fanStories.ts). Computed on demand,
 * never stored, and nothing in the sim reads it. Wording is picked by a hash of team, year and week,
 * not the season's RNG. See docs/PROGRAM.md.
 */

export type Tone = 'hope' | 'worry' | 'calm';

/** What a point is about. The page shows at most one per group while other groups have something to say. */
export type Group = 'results' | 'race' | 'coach' | 'players' | 'rivals' | 'peers' | 'history' | 'offseason' | 'texture';

export interface TalkingPoint {
  /** -1 (worry) .. 1 (hope). */
  score: number;
  weight: number;
  text: string;
  tone: Tone;
  /** Which signal said it, for tests. */
  key: string;
  group: Group;
  /** Other teams the text names, for links. */
  teams?: string[];
}

export interface Pulse {
  /** -1 .. 1, and its word. */
  mood: number;
  label: string;
  /** What the fans expect from the program, from its standing. */
  expect: string;
  /** What the page shows, and every signal that spoke (the mood is all of them). */
  points: TalkingPoint[];
  all: TalkingPoint[];
}

export const PULSE = {
  /** Talking points shown. */
  points: 5,
  /** The mood: the weighted mean of every signal's score, stretched. */
  stretch: 1.4,
  /** Salience jitter (±), from the hash, so equal stories take turns. */
  jitter: 0.15,
  /** The calm "about as expected" line is filler: shown only with fewer than this many other points. */
  filler: 3,
  labels: [
    [-0.6, 'FURIOUS'], [-0.38, 'FRUSTRATED'], [-0.2, 'RESTLESS'], [-0.07, 'UNEASY'], [0.07, 'STEADY'], [0.25, 'HOPEFUL'], [0.5, 'EXCITED'], [Infinity, 'EUPHORIC'],
  ] as [number, string][],
  /** Wins over the pregame odds that read as clearly ahead of (or behind) expectations. */
  ahead: 0.7,
  wayAhead: 1.6,
};

/** Which group each signal belongs to, by its key (before any `:`). */
const GROUP: Record<string, Group> = {
  results: 'results', bar: 'results',
  race: 'race', conf: 'race',
  coach: 'coach', seat: 'coach', steady: 'coach', bigGames: 'coach', bowlRun: 'coach',
  qb: 'players', heisman: 'players', injury: 'players',
  rival: 'rivals', rivalStreak: 'rivals', rivalCoach: 'rivals', rivalWeek: 'rivals', rivalSeason: 'rivals',
  peer: 'peers', oldCoach: 'peers', poached: 'peers',
  trend: 'history', glory: 'history', drought: 'history', natDrought: 'history', playoffWait: 'history', firstPlayoff: 'history',
  newConf: 'history', bowlStreak: 'history', bowlDrought: 'history', best: 'history', heismanLore: 'history', milestone: 'history',
  class: 'offseason', fiveStar: 'offseason', inState: 'offseason', draft: 'offseason', firstPick: 'offseason', draftHaul: 'offseason',
  draftStreak: 'offseason', firstRounder: 'offseason', early: 'offseason', noPicks: 'offseason', portal: 'offseason', portalIn: 'offseason',
  last: 'texture', close: 'texture', streak: 'texture', scoring: 'texture', home: 'texture', badLoss: 'texture', bigWin: 'texture',
};

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const NUM = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
export const count = (n: number) => (n <= 10 ? NUM[n] : String(n));

export type Say = (key: string, score: number, weight: number, texts: string | string[], teams?: string[]) => void;

/** What every signal reads, worked out once. */
export interface Ctx {
  state: SeasonState;
  id: string;
  t: Team;
  tier: number;
  rec: TeamRecord;
  recs: Map<string, TeamRecord>;
  recTxt: string;
  gp: number;
  /** The season is over (complete or offseason), or not yet begun. */
  over: boolean;
  pre: boolean;
  /** 'WAS' once the season is over, 'IS' while it's played. */
  was: string;
  xw: number;
  ten: Tenure;
  /** 'COACH X' or 'YOUR STAFF'. */
  hc: string;
  /** The season the head coach's run began. */
  start: number;
  /** Every finished season on record, oldest first (this one not included). */
  past: SeasonRow[];
  last?: SeasonRow;
  tro: Trophies;
  /** AP rank now (0 unranked). */
  rank: number;
  say: Say;
}

/** The program's standing, as its fans see it. */
export function expectation(id: string): string {
  const p = teamById(id).profile;
  if (p.tier === 1 || p.prestige >= 88) return 'TITLE OR BUST';
  if (p.tier === 2 || p.prestige >= 72) return 'CONTENDER';
  if (p.tier === 3 || p.prestige >= 55) return 'BOWL TEAM';
  return 'BUILDING';
}

export function pulseLabel(mood: number): string {
  return PULSE.labels.find(([at]) => mood <= at)![1];
}

export function fanPulse(state: SeasonState, id: string): Pulse {
  const t = teamById(id);
  const recs = records(state);
  const rec = recs.get(id)!;
  const over = state.phase === 'complete' || state.phase === 'offseason';
  const ten = coachTenure(state, id);
  const pts: TalkingPoint[] = [];
  const salt = `${id}:${state.year}:${state.week}`;
  const say: Say = (key, score, weight, texts, teams) => {
    const list = typeof texts === 'string' ? [texts] : texts;
    const text = list[hashString(`${salt}:${key}`) % list.length];
    const group = GROUP[key.split(':')[0]] ?? 'results';
    pts.push({ key, group, score: clamp(score, -1, 1), weight, text, tone: score > 0.15 ? 'hope' : score < -0.15 ? 'worry' : 'calm', ...(teams?.length ? { teams } : {}) });
  };
  const past = pastSeasons(state, id, false).filter((r) => r.year < state.year || (over && r.year === state.year));
  const ctx: Ctx = {
    state, id, t, tier: t.profile.tier, rec, recs, recTxt: recordText(rec), gp: rec.w + rec.l, over, pre: rec.w + rec.l === 0 && !over, was: over ? 'WAS' : 'IS',
    xw: state.teamState[id]?.xw ?? 0, ten, hc: ten.user ? 'YOUR STAFF' : `COACH ${ten.name}`, start: coachStart(state, id, ten),
    past, last: past.filter((r) => r.year < state.year).pop(), tro: trophies(state, id), rank: rankIn(latestPoll(state, 'ap'), id), say,
  };
  coreSignals(ctx);
  storySignals(ctx);

  if (!pts.length) say('results', 0, 1, ctx.pre ? [`A NEW SEASON. EVERYONE IS UNDEFEATED IN AUGUST.`, `AUGUST OPTIMISM: THIS COULD BE THE YEAR.`] : [`A QUIET STRETCH AROUND THE PROGRAM.`, `NOT MUCH TO TALK ABOUT. FANS ARE WAITING ON SOMETHING.`]);
  const wsum = pts.reduce((s, p) => s + p.weight, 0);
  const mood = clamp((pts.reduce((s, p) => s + p.score * p.weight, 0) / wsum) * PULSE.stretch, -1, 1);
  return { mood, label: pulseLabel(mood), expect: expectation(id), points: pick(pts, salt), all: pts };
}

/**
 * The points shown: by salience (|score| × weight, jittered by the hash), one per group while other
 * groups have something to say, and the calm filler only when little else does.
 */
function pick(pts: TalkingPoint[], salt: string): TalkingPoint[] {
  const sal = (p: TalkingPoint) => Math.abs(p.score) * p.weight * (1 + PULSE.jitter * ((hashString(`${salt}:j:${p.key}`) % 2001) / 1000 - 1));
  const real = pts.filter((p) => !(p.key === 'results' && p.tone === 'calm'));
  const pool = (real.length >= PULSE.filler ? real : pts).slice().sort((a, b) => sal(b) - sal(a));
  const out: TalkingPoint[] = [];
  const used = new Set<Group>();
  for (const p of pool) {
    if (out.length >= PULSE.points) break;
    if (used.has(p.group)) continue;
    used.add(p.group);
    out.push(p);
  }
  for (const p of pool) {
    if (out.length >= PULSE.points) break;
    if (!out.includes(p) && out.filter((x) => x.group === p.group).length < 2) out.push(p);
  }
  // Back in salience order (the seconds from a group were added last).
  return out.sort((a, b) => sal(b) - sal(a));
}

/** The season as it stands: the record, the coach's year, the QB, the stars, the polls, the rivalry, recruiting. */
function coreSignals(c: Ctx): void {
  const { state, id, t, tier, rec, recTxt, gp, over, pre, was, xw, ten, hc, past, last, tro, rank, say } = c;
  const champ = state.bracket?.champion === id;

  // ---- results against what was expected
  if (gp >= 2) {
    if (xw >= PULSE.wayAhead) say('results', 0.9, 3, [`NOBODY SAW ${recTxt} COMING. THIS ${was} A SPECIAL YEAR.`, `${recTxt} ${was} WAY BETTER THAN ANYONE DARED HOPE.`, `${recTxt}. FANS KEEP PINCHING THEMSELVES.`]);
    else if (xw >= PULSE.ahead) say('results', 0.5, 2.5, [`${recTxt} AND PLAYING AHEAD OF EXPECTATIONS.`, `THEY'VE WON GAMES THEY WEREN'T SUPPOSED TO. ${recTxt}.`, `${recTxt}: THE PRESEASON PICKS LOOK WRONG, IN A GOOD WAY.`]);
    else if (xw <= -PULSE.wayAhead) say('results', -0.9, 3, [`${recTxt}? THIS ROSTER ${was} BETTER THAN THAT.`, `FANS EXPECTED FAR MORE THAN ${recTxt}.`, `${recTxt} WITH THIS TALENT? SOMETHING IS WRONG.`]);
    else if (xw <= -PULSE.ahead) say('results', -0.5, 2.5, [`A COUPLE OF GAMES THEY SHOULD HAVE WON GOT AWAY. ${recTxt}.`, `${recTxt} FEELS LIKE IT SHOULD BE BETTER.`, `${recTxt}, AND FANS CAN NAME THE GAMES THAT SLIPPED AWAY.`]);
    else say('results', 0.05, 0.8, [`${recTxt}: ABOUT WHERE MOST FANS THOUGHT THEY'D BE.`, `${recTxt}. NO BIG SURPRISES EITHER WAY.`]);
    // What the record means at a place like this.
    if (tier <= 2 && rec.l >= 3) say('bar', -0.6, tier === 1 ? 2.5 : 1.5, [`${count(rec.l)} LOSSES IS A LOST YEAR AT A PROGRAM LIKE THIS.`, `${count(rec.l)} LOSSES. THAT DOESN'T FLY HERE.`]);
    if (tier >= 4 && rec.w >= 6) say('bar', 0.6, 2, [`BOWL ELIGIBLE! THAT'S A BIG DEAL AROUND HERE.`, `${rec.w} WINS: A BOWL TRIP IS ON THE WAY.`]);
    if (tier >= 3 && !over && rec.l >= 6) say('bar', -0.5, 1.5, [`NO BOWL THIS YEAR. FANS ARE ALREADY LOOKING AHEAD.`, `${count(rec.l)} LOSSES. THE BOWL HOPES ARE GONE.`]);
  }

  // ---- the head coach
  const sec = securityOf(state, id);
  const behind = gp >= 3 && xw <= -PULSE.ahead;
  const ahead = gp >= 3 && xw >= PULSE.ahead;
  if (ten.year === 1 && !pre) {
    if (behind) say('coach', -0.7, 2.5, [`YEAR ONE UNDER ${hc} HAS BEEN ROUGH. THE HONEYMOON IS OVER.`, `THE NEW REGIME WAS SUPPOSED TO MEAN BETTER THAN THIS.`, `FANS WANTED A FRESH START. ${hc} HASN'T DELIVERED ONE YET.`]);
    else if (ahead) say('coach', 0.7, 2.5, [`${hc} HAS THEM PLAYING HARD IN YEAR ONE. FANS ARE BUYING IN.`, `YEAR ONE UNDER ${hc} IS AHEAD OF SCHEDULE.`, `THE HIRE OF ${hc} LOOKS BETTER EVERY WEEK.`]);
    else say('coach', 0.1, 1, [`YEAR ONE UNDER ${hc}: FANS ARE WAITING TO SEE MORE.`, `${hc}'S FIRST YEAR: A FEW SIGNS, NO VERDICT YET.`]);
  } else if (ten.year === 1 && pre) say('coach', 0.35, 2, [`A NEW ERA: ${hc} TAKES OVER. HOPE SPRINGS ETERNAL.`, `NEW STAFF, CLEAN SLATE. ${hc} HAS FANS CURIOUS.`, `${hc} IS IN. THE MESSAGE BOARDS ARE CAUTIOUSLY THRILLED.`]);
  else if (ten.year <= 3 && behind && last && last.w <= last.l + 2) say('coach', -0.6, 2, [`YEAR ${ten.year} UNDER ${hc} AND STILL NOT TURNING THE CORNER.`, `PATIENCE IS WEARING THIN IN YEAR ${ten.year}.`, `${hc} ASKED FOR TIME. FANS ARE RUNNING OUT OF IT.`]);
  else if (ten.year <= 3 && ahead) say('coach', 0.6, 2, [`${hc}'S REBUILD IS SHOWING UP IN YEAR ${ten.year}.`, `YEAR ${ten.year} AND ${hc}'S PLAN IS WORKING.`]);
  else if (ten.year >= 8 && behind) say('coach', -0.5, 1.5, [`${ordinal(ten.year)} YEAR UNDER ${hc}. SOME WONDER IF THINGS HAVE GONE STALE.`, `IS IT TIME FOR NEW BLOOD? ${hc} IS IN YEAR ${ten.year}.`]);
  else if (ten.year >= 8 && !behind && ten.w > ten.l * 2) say('coach', 0.4, 1, [`${ordinal(ten.year)} YEAR UNDER ${hc}: AN INSTITUTION AT THIS POINT.`, `${hc}, YEAR ${ten.year}. FANS CAN'T PICTURE ANYONE ELSE.`]);
  if (!ten.user && sec < HOT_SEAT + 10 && !ahead) say('seat', -0.8, 2.5, [`${hc} IS SQUARELY ON THE HOT SEAT.`, `BOOSTERS ARE ASKING QUESTIONS ABOUT ${hc}.`, `"FIRE ${ten.name}" CHANTS HAVE STARTED.`]);
  if (ten.user && state.config.coachCareer && sec < HOT_SEAT + 10 && !ahead) say('seat', -0.8, 2.5, [`THE HOT SEAT IS GETTING WARM. THE ADMINISTRATION IS WATCHING.`, `BOOSTERS ARE ASKING QUESTIONS ABOUT YOUR STAFF.`]);

  // ---- the quarterback
  const qb = starters(squadFor(state, id)).QB;
  if (qb) {
    const name = athleteName(qb).toUpperCase();
    const young = qb.year === 'FR' || qb.year === 'SO';
    const who = `${young ? (qb.year === 'FR' ? 'FRESHMAN' : 'SOPHOMORE') : 'QB'} ${name}`;
    const line = seasonStats(state).get(qb.id);
    const broke = state.confLog?.some((e) => e.id === qb.id && e.kind === 'breakout');
    if (line && line.att >= 40) {
      const ypa = line.passYds / line.att;
      if (broke || (ypa >= 7.8 && line.passTd >= 2.5 * Math.max(1, line.int))) {
        say('qb', 0.75, young ? 2.6 : 1.6, [`${who} (${line.passYds} YDS, ${line.passTd} TD) HAS THE FAN BASE DREAMING.`, `${who} LOOKS LIKE THE REAL DEAL: ${line.passTd} TD, ${line.int} INT.`, `${line.passYds} YARDS AND ${line.passTd} TD. ${who} IS A PROBLEM FOR DEFENSES.`]);
      } else if (line.att >= 60 && line.int >= 3 && (line.int > line.passTd || (ypa < 6 && line.passTd < 2 * line.int))) {
        say('qb', -0.6, 2, [`QB PLAY IS THE QUESTION: ${name} HAS ${line.passTd} TD AND ${line.int} INT.`, `FANS ARE CALLING FOR THE BACKUP. ${name}: ${line.int} INT.`, `${line.int} INTERCEPTIONS. THE QB DEBATE IS ON.`]);
      } else if (young) say('qb', 0.3, 1.2, [`${who} IS GROWING UP ON THE JOB.`, `${who} HAS GROWING PAINS, BUT FANS LIKE HIM.`]);
    } else if (pre || over) {
      if (young && qb.stars >= 5) say('qb', 0.55, 2, [`ALL EYES ON THE FIVE-STAR ${who}.`, `THE FIVE-STAR ${who} COULD CHANGE EVERYTHING.`]);
      else if (qb.real && !young) say('qb', 0.35, 1.2, [`${name} IS BACK UNDER CENTER, AND THAT'S A COMFORT.`, `A VETERAN QB IN ${name}. FANS WILL TAKE IT.`]);
    }
  }

  // ---- stars, and the stars lost
  const heis = state.awards.find((a) => a.id === 'heisman')?.finalists[0];
  if (heis?.team === id) say('heisman', 1, 3, [`${heis.name.toUpperCase()} BROUGHT HOME THE HEISMAN.`, `A HEISMAN FOR ${heis.name.toUpperCase()}! ANOTHER STATUE.`]);
  else if (!over && state.week >= 5) {
    const race = heismanRace(state, 3).finalists.find((f) => f.team === id);
    if (race) say('heisman', 0.6, 1.8, [`${race.name.toUpperCase()} IS IN THE HEISMAN CONVERSATION.`, `HEISMAN WATCH: ${race.name.toUpperCase()} IS A REAL CANDIDATE.`]);
  }
  const hurt = (state.injuryLog ?? []).filter((e) => e.team === id && e.season && e.starter).pop();
  if (hurt && !over) say('injury', -0.5, hurt.pos === 'QB' ? 2.5 : 1.4, [`LOSING ${hurt.name.toUpperCase()} (${hurt.pos}) FOR THE SEASON STILL STINGS.`, `WHAT IF ${hurt.name.toUpperCase()} HADN'T GOTTEN HURT?`]);

  // ---- the polls and the race
  const cr = rankIn(latestPoll(state, 'cfp'), id);
  const field = state.bracket?.seeds.includes(id);
  if (champ) say('race', 1, 4, [`NATIONAL CHAMPIONS. NOTHING ELSE NEEDS TO BE SAID.`, `${state.year} NATIONAL CHAMPIONS. FANS WILL TALK ABOUT THIS ONE FOREVER.`]);
  else if (field) say('race', 0.75, 2.5, over ? [`A PLAYOFF TRIP. THE PROGRAM IS WHERE IT WANTS TO BE.`, `MADE THE PLAYOFF. THE BAR IS SET.`] : [`IN THE PLAYOFF! ANYTHING CAN HAPPEN NOW.`, `PLAYOFF BOUND. FANS ARE BOOKING FLIGHTS.`]);
  else if (cr && cr <= 12 && !over) say('race', 0.6, 2, [`NO. ${cr} IN THE CFP RANKINGS: PLAYOFF TALK IS REAL.`, `NO. ${cr} IN THE CFP POLL. FANS ARE DOING BRACKET MATH.`]);
  else if (rank && rank <= 5 && !over) say('race', 0.55, 1.8, [`A TOP-5 TEAM. FANS ARE BOOKING TRAVEL FOR JANUARY.`, `NO. ${rank} IN THE COUNTRY. THIS IS THE BIG TIME.`]);
  else if (pre && rank) say('race', rank <= 10 ? 0.45 : 0.25, 1.5, [`PRESEASON NO. ${rank}. EXPECTATIONS ARE ${rank <= 10 ? 'SKY HIGH' : 'RISING'}.`, `THE POLLSTERS HAVE THEM NO. ${rank}. NOW PROVE IT.`]);
  else if (pre && !rank && tier <= 2) say('race', -0.3, 1.2, [`UNRANKED IN THE PRESEASON POLL. FANS TOOK THAT PERSONALLY.`, `NO PRESEASON RANKING. BULLETIN-BOARD MATERIAL.`]);
  const cc = state.games.find((g) => g.kind === 'champ' && g.result && (g.home === id || g.away === id));
  const conf = t.conference.toUpperCase();
  if (cc) {
    const won = (cc.home === id) === cc.result!.home > cc.result!.away;
    say('conf', won ? 0.7 : -0.3, 2, won ? [`${conf} CHAMPIONS. HANG ANOTHER BANNER.`, `THE ${conf} TROPHY IS COMING HOME.`] : [`CAME UP SHORT IN THE ${conf} TITLE GAME.`, `SO CLOSE: LOST THE ${conf} TITLE GAME.`]);
  } else if (!over && c.gp >= 5 && t.conference !== 'Independent') {
    const rows = standings(state, t.conference);
    if (rows[0]?.team === id && rows[0].rec.cl === 0) say('conf', 0.4, 1.2, [`UNBEATEN IN THE ${conf} AND IN THE DRIVER'S SEAT.`, `ATOP THE ${conf}, AND NOBODY HAS BEATEN THEM IN LEAGUE PLAY.`]);
  }

  // ---- the rivalry, this season
  for (const r of RIVALRIES.filter((x) => x.a === id || x.b === id)) {
    const opp = r.a === id ? r.b : r.a;
    const g = state.games.find((x) => x.result && x.kind !== 'cfp' && x.kind !== 'bowl' && x.kind !== 'champ' && ((x.home === id && x.away === opp) || (x.home === opp && x.away === id)));
    if (!g) continue;
    const won = (g.home === id) === g.result!.home > g.result!.away;
    const o = teamById(opp).school.toUpperCase();
    const name = r.name.toUpperCase();
    const run = Math.abs(rivalrySeries(state, id, opp).streak);
    if (won && run >= 2) say(`rival:${opp}`, 0.5 + 0.05 * run, 1.5 + 0.2 * run, [`BEAT ${o} AGAIN: ${count(run)} STRAIGHT.`, `${count(run)} IN A ROW OVER ${o}. THE RIVALRY IS OURS.`], [opp]);
    else if (won) say(`rival:${opp}`, 0.5, 1.5, [`BEAT ${o} IN THE ${name}. BRAGGING RIGHTS FOR A YEAR.`, `${name}: ${o} GOES HOME UNHAPPY.`, `${o} FANS ARE QUIET AFTER THE ${name}.`], [opp]);
    else if (run >= 2) say(`rival:${opp}`, -0.55 - 0.05 * run, 1.6 + 0.2 * run, [`${count(run)} STRAIGHT LOSSES TO ${o}. UNACCEPTABLE.`, `${o} OWNS THE ${name} RIGHT NOW: ${count(run)} STRAIGHT.`], [opp]);
    else say(`rival:${opp}`, -0.55, 1.6, [`LOSING THE ${name} TO ${o} WILL HURT ALL YEAR.`, `${o} HAS THE BRAGGING RIGHTS AFTER THE ${name}.`, `A WHOLE YEAR OF ${o} FANS GLOATING.`], [opp]);
  }

  // ---- the last game, while it's fresh
  if (!over && gp) {
    const g = state.games.filter((x) => x.result && (x.home === id || x.away === id)).sort((a, b) => b.week - a.week)[0];
    if (g && g.week >= state.week - 1) {
      const us = g.home === id ? g.result!.home : g.result!.away;
      const them = g.home === id ? g.result!.away : g.result!.home;
      const opp = g.home === id ? g.away : g.home;
      const or = rankIn(latestPoll(state, 'ap', g.week), opp);
      const o = teamById(opp).school.toUpperCase();
      if (them - us >= 24) say('last', -0.55, 1.5, [`THAT ${them}-${us} LOSS TO ${o} WAS UGLY.`, `FANS LEFT EARLY IN THE ${them}-${us} LOSS TO ${o}.`, `${them}-${us} TO ${o}. NOBODY WANTS TO TALK ABOUT IT.`], [opp]);
      else if (us > them && or && (!rank || or < rank)) say('last', 0.6, 1.7, [`BEAT NO. ${or} ${o}! THE WHOLE TOWN IS BUZZING.`, `STORMED PAST NO. ${or} ${o}. WHAT A WEEKEND.`], [opp]);
    }
  }

  // ---- the trend and the droughts
  const lastThree = past.slice(-3);
  if (lastThree.length === 3) {
    const [a, , z] = lastThree.map((r) => r.w);
    const ws = lastThree.map((r) => r.w).join(', ');
    if (z - a >= 4) say('trend', 0.55, 1.5, [`${ws} WINS THE LAST THREE YEARS: THE ARROW IS POINTING UP.`, `${ws} WINS. THE CLIMB IS REAL.`]);
    else if (a - z >= 4) say('trend', -0.55, 1.5, [`WINS HAVE GONE ${ws} THE LAST THREE YEARS. FANS HAVE NOTICED.`, `${ws} WINS. THE SLIDE HAS FANS WORRIED.`]);
  }
  const lastNat = tro.nat[tro.nat.length - 1];
  if (lastNat && lastNat < state.year && state.year - lastNat <= 2) say('glory', 0.6, 1.8, [`STILL RIDING HIGH FROM THE ${lastNat} NATIONAL TITLE.`, `THE ${lastNat} TITLE RINGS STILL SHINE.`]);
  else if (last?.playoff && (pre || over)) say('glory', 0.35, 1.2, [`LAST YEAR'S PLAYOFF RUN RAISED THE BAR.`, `AFTER LAST YEAR'S PLAYOFF TRIP, ANYTHING LESS FEELS LIKE A STEP BACK.`]);
  if (tier <= 2 && t.conference !== 'Independent') {
    const since = tro.lastConf ? state.year - tro.lastConf : undefined;
    // The real history gives the year, not the league: name it only when the record shows it was this one.
    const title = past.find((r) => r.year === tro.lastConf)?.conf === t.conference ? `${conf} TITLE` : 'CONFERENCE TITLE';
    if (since !== undefined && since >= (tier === 1 ? 10 : 15)) say('drought', -0.35, 1, [`IT'S BEEN ${since} YEARS SINCE THE LAST ${title}.`, `NO ${title} SINCE ${tro.lastConf}. THAT GNAWS AT FANS.`]);
  }
  let losing = 0;
  for (let i = past.length - 1; i >= 0 && past[i].w <= past[i].l; i--) losing++;
  if (tier >= 3 && losing >= 3) say('drought', -0.3 - 0.03 * losing, 0.9, [`${count(losing)} LOSING SEASONS IN A ROW. FANS WANT SIGNS OF LIFE.`, `${count(losing)} STRAIGHT LOSING YEARS. THE STANDS ARE THINNING.`]);

  // ---- recruiting and the offseason
  if (state.recruiting) {
    const ranks = classRanks(state);
    const i = ranks.findIndex((r) => r.team === id);
    const n = ranks[i]?.n ?? 0;
    if (n >= 5) {
      if (i < 10) say('class', 0.5, 1.5, [`THE ${state.recruiting.cls} CLASS RANKS NO. ${i + 1} IN THE COUNTRY.`, `RECRUITING IS ROLLING: A TOP-10 CLASS AND COUNTING.`]);
      else if (tier === 1 && i >= 25) say('class', -0.35, 1, [`THE RECRUITING CLASS IS ONLY NO. ${i + 1}. THAT'S NOT THE STANDARD.`, `A NO. ${i + 1} CLASS? FANS EXPECT TOP TEN.`]);
      else if (tier >= 3 && i < 30) say('class', 0.4, 1.2, [`A NO. ${i + 1} RECRUITING CLASS. THAT'S RARE AIR HERE.`, `THE CLASS IS NO. ${i + 1} NATIONALLY. THE STAFF CAN RECRUIT.`]);
    }
  }
  const lost = (state.portal?.entrants ?? []).filter((e) => e.from === id && e.ovr >= 80 && e.out === 'commit').length;
  if (lost >= 3) say('portal', -0.4, 1.2, [`${count(lost)} GOOD PLAYERS LEFT THROUGH THE PORTAL. THAT HURTS.`, `THE PORTAL TOOK ${count(lost)} STARTERS-IN-WAITING.`]);
}
