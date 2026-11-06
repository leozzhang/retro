import { athleteName, starters } from '../data/depth';
import { RIVALRIES } from '../data/season/rivalries';
import { teamById } from '../data/teams';
import { hashString } from '../engine/math';
import { heismanRace } from './awards';
import { securityOf } from './carousel';
import { HOT_SEAT } from './coach';
import { latestPoll, rankIn } from './polls';
import { coachTenure, ordinal, pastSeasons, trophies } from './program';
import { classRanks } from './recruiting';
import { records, recordText, standings } from './standings';
import { seasonStats } from './stats';
import type { SeasonState } from './types';
import { squadFor } from './world';

/**
 * The fan pulse: what a program's fans are feeling and talking about, from what a fan would know
 * (the record against what was expected, the head coach's year, the QB, the rivalry, the polls, the
 * trend, recruiting). Computed on demand, never stored, and nothing in the sim reads it. Wording is
 * picked by a hash of team, year and week, not the season's RNG. See docs/PROGRAM.md.
 */

export type Tone = 'hope' | 'worry' | 'calm';

export interface TalkingPoint {
  /** -1 (worry) .. 1 (hope). */
  score: number;
  weight: number;
  text: string;
  tone: Tone;
  /** Which signal said it, for tests. */
  key: string;
}

export interface Pulse {
  /** -1 .. 1, and its word. */
  mood: number;
  label: string;
  /** What the fans expect from the program, from its standing. */
  expect: string;
  points: TalkingPoint[];
}

export const PULSE = {
  /** Talking points shown. */
  points: 4,
  /** The mood: the weighted mean of every signal's score, stretched. */
  stretch: 1.4,
  labels: [
    [-0.6, 'FURIOUS'], [-0.38, 'FRUSTRATED'], [-0.2, 'RESTLESS'], [-0.07, 'UNEASY'], [0.07, 'STEADY'], [0.25, 'HOPEFUL'], [0.5, 'EXCITED'], [Infinity, 'EUPHORIC'],
  ] as [number, string][],
  /** Wins over the pregame odds that read as clearly ahead of (or behind) expectations. */
  ahead: 0.7,
  wayAhead: 1.6,
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const NUM = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
const count = (n: number) => (n <= 10 ? NUM[n] : String(n));

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
  const tier = t.profile.tier;
  const rec = records(state).get(id)!;
  const gp = rec.w + rec.l;
  const over = state.phase === 'complete' || state.phase === 'offseason';
  const pre = gp === 0 && !over;
  const ts = state.teamState[id];
  const xw = ts?.xw ?? 0;
  const recTxt = recordText(rec);
  const ten = coachTenure(state, id);
  const hc = ten.user ? 'YOUR STAFF' : `COACH ${ten.name}`;
  const pts: TalkingPoint[] = [];
  const salt = `${id}:${state.year}:${state.week}`;
  const say = (key: string, score: number, weight: number, ...texts: string[]) => {
    const text = texts[hashString(`${salt}:${key}`) % texts.length];
    pts.push({ key, score: clamp(score, -1, 1), weight, text, tone: score > 0.15 ? 'hope' : score < -0.15 ? 'worry' : 'calm' });
  };
  const ap = latestPoll(state, 'ap');
  const rank = rankIn(ap, id);
  const past = pastSeasons(state, id, false).filter((r) => r.year < state.year);
  const last = past[past.length - 1];
  const champ = state.bracket?.champion === id;

  // ---- results against what was expected
  if (gp >= 2) {
    const was = over ? 'WAS' : 'IS';
    if (xw >= PULSE.wayAhead) say('results', 0.9, 3, `NOBODY SAW ${recTxt} COMING. THIS ${was} A SPECIAL YEAR.`, `${recTxt} ${was} WAY BETTER THAN ANYONE DARED HOPE.`);
    else if (xw >= PULSE.ahead) say('results', 0.5, 2.5, `${recTxt} AND PLAYING AHEAD OF EXPECTATIONS.`, `THEY'VE WON GAMES THEY WEREN'T SUPPOSED TO. ${recTxt}.`);
    else if (xw <= -PULSE.wayAhead) say('results', -0.9, 3, `${recTxt}? THIS ROSTER ${over ? 'WAS' : 'IS'} BETTER THAN THAT.`, `FANS EXPECTED FAR MORE THAN ${recTxt}.`);
    else if (xw <= -PULSE.ahead) say('results', -0.5, 2.5, `A COUPLE OF GAMES THEY SHOULD HAVE WON GOT AWAY. ${recTxt}.`, `${recTxt} FEELS LIKE IT SHOULD BE BETTER.`);
    else say('results', 0.05, 0.8, `${recTxt}: ABOUT WHERE MOST FANS THOUGHT THEY'D BE.`);
    // What the record means at a place like this.
    if (tier <= 2 && rec.l >= 3) say('bar', -0.6, tier === 1 ? 2.5 : 1.5, `${count(rec.l)} LOSSES IS A LOST YEAR AT A PROGRAM LIKE THIS.`);
    if (tier >= 4 && rec.w >= 6) say('bar', 0.6, 2, `BOWL ELIGIBLE! THAT'S A BIG DEAL AROUND HERE.`, `${rec.w} WINS: A BOWL TRIP IS ON THE WAY.`);
    if (tier >= 3 && !over && rec.l >= 6) say('bar', -0.5, 1.5, `NO BOWL THIS YEAR. FANS ARE ALREADY LOOKING AHEAD.`);
  }

  // ---- the head coach
  const sec = securityOf(state, id);
  const behind = gp >= 3 && xw <= -PULSE.ahead;
  const ahead = gp >= 3 && xw >= PULSE.ahead;
  if (ten.year === 1 && !pre) {
    if (behind) say('coach', -0.7, 2.5, `YEAR ONE UNDER ${hc} HAS BEEN ROUGH. THE HONEYMOON IS OVER.`, `THE NEW REGIME WAS SUPPOSED TO MEAN BETTER THAN THIS.`);
    else if (ahead) say('coach', 0.7, 2.5, `${hc} HAS THEM PLAYING HARD IN YEAR ONE. FANS ARE BUYING IN.`, `YEAR ONE UNDER ${hc} IS AHEAD OF SCHEDULE.`);
    else say('coach', 0.1, 1, `YEAR ONE UNDER ${hc}: FANS ARE WAITING TO SEE WHAT'S BEING BUILT.`);
  } else if (ten.year === 1 && pre) say('coach', 0.35, 2, `A NEW ERA: ${hc} TAKES OVER. HOPE SPRINGS ETERNAL.`, `NEW STAFF, CLEAN SLATE. ${hc} HAS FANS CURIOUS.`);
  else if (ten.year <= 3 && behind && last && last.w <= last.l + 2) say('coach', -0.6, 2, `YEAR ${ten.year} UNDER ${hc} AND STILL NOT TURNING THE CORNER.`, `PATIENCE IS WEARING THIN IN YEAR ${ten.year}.`);
  else if (ten.year <= 3 && ahead) say('coach', 0.6, 2, `${hc}'S REBUILD IS SHOWING UP IN YEAR ${ten.year}.`);
  else if (ten.year >= 8 && behind) say('coach', -0.5, 1.5, `${ordinal(ten.year)} YEAR UNDER ${hc}. SOME WONDER IF THINGS HAVE GONE STALE.`);
  else if (ten.year >= 8 && !behind && ten.w > ten.l * 2) say('coach', 0.4, 1, `${ordinal(ten.year)} YEAR UNDER ${hc}: AN INSTITUTION AT THIS POINT.`);
  if (!ten.user && sec < HOT_SEAT + 10 && !ahead) say('seat', -0.8, 2.5, `${hc} IS SQUARELY ON THE HOT SEAT.`, `BOOSTERS ARE ASKING QUESTIONS ABOUT ${hc}.`);
  if (ten.user && state.config.coachCareer && sec < HOT_SEAT + 10 && !ahead) say('seat', -0.8, 2.5, `THE HOT SEAT IS GETTING WARM. THE ADMINISTRATION IS WATCHING.`);

  // ---- the quarterback
  const squad = squadFor(state, id);
  const qb = starters(squad).QB;
  if (qb) {
    const name = athleteName(qb).toUpperCase();
    const young = qb.year === 'FR' || qb.year === 'SO';
    const who = `${young ? (qb.year === 'FR' ? 'FRESHMAN' : 'SOPHOMORE') : 'QB'} ${name}`;
    const line = seasonStats(state).get(qb.id);
    const broke = state.confLog?.some((e) => e.id === qb.id && e.kind === 'breakout');
    if (line && line.att >= 40) {
      const ypa = line.passYds / line.att;
      if (broke || (ypa >= 7.8 && line.passTd >= 2.5 * Math.max(1, line.int))) {
        say('qb', 0.75, young ? 2.6 : 1.6, `${who} (${line.passYds} YDS, ${line.passTd} TD) HAS THE FAN BASE DREAMING.`, `${who} LOOKS LIKE THE REAL DEAL: ${line.passTd} TD, ${line.int} INT.`);
      } else if (line.att >= 60 && line.int >= 3 && (line.int > line.passTd || (ypa < 6 && line.passTd < 2 * line.int))) {
        say('qb', -0.6, 2, `QB PLAY IS THE QUESTION: ${name} HAS ${line.passTd} TD AND ${line.int} INT.`, `FANS ARE CALLING FOR THE BACKUP. ${name}: ${line.int} INT.`);
      } else if (young) say('qb', 0.3, 1.2, `${who} IS GROWING UP ON THE JOB.`);
    } else if (pre || over) {
      if (young && qb.stars >= 5) say('qb', 0.55, 2, `ALL EYES ON THE FIVE-STAR ${who}.`);
      else if (qb.real && !young) say('qb', 0.35, 1.2, `${name} IS BACK UNDER CENTER, AND THAT'S A COMFORT.`);
    }
  }

  // ---- stars, and the stars lost
  const heis = state.awards.find((a) => a.id === 'heisman')?.finalists[0];
  if (heis?.team === id) say('heisman', 1, 3, `${heis.name.toUpperCase()} BROUGHT HOME THE HEISMAN.`);
  else if (!over && state.week >= 5) {
    const race = heismanRace(state, 3).finalists.findIndex((f) => f.team === id);
    if (race >= 0) say('heisman', 0.6, 1.8, `${heismanRace(state, 3).finalists[race].name.toUpperCase()} IS IN THE HEISMAN CONVERSATION.`);
  }
  const hurt = (state.injuryLog ?? []).filter((e) => e.team === id && e.season && e.starter).pop();
  if (hurt && !over) say('injury', -0.5, hurt.pos === 'QB' ? 2.5 : 1.4, `LOSING ${hurt.name.toUpperCase()} (${hurt.pos}) FOR THE SEASON STILL STINGS.`);

  // ---- the polls and the race
  const cfp = latestPoll(state, 'cfp');
  const cr = rankIn(cfp, id);
  const field = state.bracket?.seeds.includes(id);
  if (champ) say('race', 1, 4, `NATIONAL CHAMPIONS. NOTHING ELSE NEEDS TO BE SAID.`, `${state.year} NATIONAL CHAMPIONS. FANS WILL TALK ABOUT THIS ONE FOREVER.`);
  else if (field) say('race', 0.75, 2.5, over ? `A PLAYOFF TRIP. THE PROGRAM IS WHERE IT WANTS TO BE.` : `IN THE PLAYOFF! ANYTHING CAN HAPPEN NOW.`);
  else if (cr && cr <= 12 && !over) say('race', 0.6, 2, `NO. ${cr} IN THE CFP RANKINGS: PLAYOFF TALK IS REAL.`);
  else if (rank && rank <= 5 && !over) say('race', 0.55, 1.8, `A TOP-5 TEAM. FANS ARE BOOKING TRAVEL FOR JANUARY.`);
  else if (pre && rank) say('race', rank <= 10 ? 0.45 : 0.25, 1.5, `PRESEASON NO. ${rank}. EXPECTATIONS ARE ${rank <= 10 ? 'SKY HIGH' : 'RISING'}.`);
  else if (pre && !rank && tier <= 2) say('race', -0.3, 1.2, `UNRANKED IN THE PRESEASON POLL. FANS TOOK THAT PERSONALLY.`);
  const cc = state.games.find((g) => g.kind === 'champ' && g.result && (g.home === id || g.away === id));
  if (cc) {
    const won = (cc.home === id) === cc.result!.home > cc.result!.away;
    say('conf', won ? 0.7 : -0.3, 2, won ? `${t.conference.toUpperCase()} CHAMPIONS. HANG ANOTHER BANNER.` : `CAME UP SHORT IN THE ${t.conference.toUpperCase()} TITLE GAME.`);
  } else if (!over && gp >= 5 && t.conference !== 'Independent') {
    const rows = standings(state, t.conference);
    if (rows[0]?.team === id && rows[0].rec.cl === 0) say('conf', 0.4, 1.2, `UNBEATEN IN THE ${t.conference.toUpperCase()} AND IN THE DRIVER'S SEAT.`);
  }

  // ---- the rivalry
  for (const r of RIVALRIES.filter((x) => x.a === id || x.b === id)) {
    const opp = r.a === id ? r.b : r.a;
    const g = state.games.find((x) => x.result && x.kind !== 'cfp' && x.kind !== 'bowl' && ((x.home === id && x.away === opp) || (x.home === opp && x.away === id)));
    if (!g) continue;
    const won = (g.home === id) === g.result!.home > g.result!.away;
    const o = teamById(opp).school.toUpperCase();
    const name = r.name.toUpperCase();
    if (won) say(`rival:${opp}`, 0.5, 1.5, `BEAT ${o} IN THE ${name}. BRAGGING RIGHTS FOR A YEAR.`, `${name}: ${o} GOES HOME UNHAPPY.`);
    else say(`rival:${opp}`, -0.55, 1.6, `LOSING THE ${name} TO ${o} WILL HURT ALL YEAR.`, `${o} HAS THE BRAGGING RIGHTS AFTER THE ${name}.`);
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
      if (them - us >= 24) say('last', -0.55, 1.5, `THAT ${them}-${us} LOSS TO ${o} WAS UGLY.`, `FANS LEFT EARLY IN THE ${them}-${us} LOSS TO ${o}.`);
      else if (us > them && or && (!rank || or < rank)) say('last', 0.6, 1.7, `BEAT NO. ${or} ${o}! THE WHOLE TOWN IS BUZZING.`);
    }
  }

  // ---- the trend and the droughts
  const lastThree = past.slice(-3);
  if (lastThree.length === 3) {
    const [a, , c] = lastThree.map((r) => r.w);
    const ws = lastThree.map((r) => r.w).join(', ');
    if (c - a >= 4) say('trend', 0.55, 1.5, `${ws} WINS THE LAST THREE YEARS: THE ARROW IS POINTING UP.`);
    else if (a - c >= 4) say('trend', -0.55, 1.5, `WINS HAVE GONE ${ws} THE LAST THREE YEARS. FANS HAVE NOTICED.`);
  }
  const tro = trophies(state, id);
  const lastNat = tro.nat[tro.nat.length - 1];
  if (lastNat && lastNat < state.year && state.year - lastNat <= 2) say('glory', 0.6, 1.8, `STILL RIDING HIGH FROM THE ${lastNat} NATIONAL TITLE.`);
  else if (last?.playoff && (pre || over)) say('glory', 0.35, 1.2, `LAST YEAR'S PLAYOFF RUN RAISED THE BAR.`);
  if (tier <= 2 && t.conference !== 'Independent') {
    const since = tro.lastConf ? state.year - tro.lastConf : undefined;
    if (since !== undefined && since >= 10) say('drought', -0.35, 1, `IT'S BEEN ${since} YEARS SINCE THE LAST ${t.conference.toUpperCase()} TITLE.`);
  }
  if (tier >= 3 && past.length >= 3 && past.slice(-3).every((r) => r.w <= r.l) && !pts.some((p) => p.key === 'trend')) say('drought', -0.35, 1, `THREE LOSING SEASONS IN A ROW. FANS WANT SIGNS OF LIFE.`);

  // ---- recruiting and the offseason
  if (state.recruiting) {
    const ranks = classRanks(state);
    const i = ranks.findIndex((r) => r.team === id);
    const n = ranks[i]?.n ?? 0;
    if (n >= 5) {
      if (i < 10) say('class', 0.5, 1.5, `THE ${state.recruiting.cls} CLASS RANKS NO. ${i + 1} IN THE COUNTRY.`, `RECRUITING IS ROLLING: A TOP-10 CLASS AND COUNTING.`);
      else if (tier === 1 && i >= 25) say('class', -0.35, 1, `THE RECRUITING CLASS IS ONLY NO. ${i + 1}. THAT'S NOT THE STANDARD.`);
    }
  }
  const draft = state.history.find((h) => h.year === state.year - (over && state.offseason?.stage !== 'carousel' ? 0 : 1))?.draft;
  const firsts = (draft ?? []).filter((p) => p.team === id && p.round === 1).length;
  if (firsts >= 2 && (pre || over)) say('draft', 0.35, 1, `${count(firsts)} FIRST-ROUND PICKS. THE NFL PIPELINE IS REAL.`);
  const lost = (state.portal?.entrants ?? []).filter((e) => e.from === id && e.ovr >= 80 && e.out === 'commit').length;
  if (lost >= 3) say('portal', -0.4, 1.2, `${count(lost)} GOOD PLAYERS LEFT THROUGH THE PORTAL. THAT HURTS.`);

  if (!pts.length) say('quiet', 0, 1, pre ? `A NEW SEASON. EVERYONE IS UNDEFEATED IN AUGUST.` : `A QUIET STRETCH AROUND THE PROGRAM.`);
  const wsum = pts.reduce((s, p) => s + p.weight, 0);
  const mood = clamp((pts.reduce((s, p) => s + p.score * p.weight, 0) / wsum) * PULSE.stretch, -1, 1);
  const points = pts.slice().sort((a, b) => Math.abs(b.score) * b.weight - Math.abs(a.score) * a.weight).slice(0, PULSE.points);
  return { mood, label: pulseLabel(mood), expect: expectation(id), points };
}
