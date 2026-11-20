import { athleteName, healthy, starters } from '../data/depth';
import type { Athlete } from '../data/athletes';
import { overall } from '../data/positions';
import { prospect } from '../data/recruits';
import { joinYear } from '../data/rosterGen';
import { CALENDAR } from '../data/season/calendar';
import { CONF_RULES } from '../data/season/conferences';
import { TEAMS, teamById } from '../data/teams';
import { AWARDS, awardRace } from './awards';
import { START_SLOTS } from './confidence';
import { seniorsLeaving, teamProjections } from './departures';
import { roundOf } from './draft';
import { impact, statLine } from './gameStars';
import { moraleContext, moraleOf, moraleReason } from './morale';
import { momentPlayer, MOMENTS, nextText, withPos } from './moments';
import { latestPoll, rankIn } from './polls';
import { selectPlayoff } from './postseason';
import { standings } from './standings';
import { decisionMoment, had, open, STORY, type StoryKit } from './storylines';
import type { SeasonState, Storyline } from './types';

/**
 * The storylines that tie the rest of the game in (docs/STORYLINES.md): the conference race, the
 * playoff bubble, the position awards, an unhappy player who could transfer, a freshman phenom, a
 * new starter's first games, senior day, and draft stock. Display only, like the rest of storyStep;
 * the one lever is the transfer risk's "give him a start" (a depth pin, `decide`).
 */

/**
 * - `confFrom`: conference games played before the race opens, in the top `confPlace`.
 * - `bubbleTop`: CFP rank the bubble opens at; `bubbleOut`: spots out of the field it follows.
 * - `awardTop`: a player's place in a position award race that opens his story.
 * - `miserable`: morale that opens a transfer risk (`MORALE`'s MISERABLE); `content` closes it.
 * - `riskReach`: overall points a transfer risk may trail his position's weakest starter by and still matter.
 * - `riskOpen`: transfer risks followed at once.
 * - `newStarts`: starts a new face's story follows.
 * - `draftWeeks`: weeks draft stock is checked; `draftRound`: the projected round that opens it.
 */
export const TSTORY = {
  confFrom: 2, confPlace: 3, bubbleTop: 20, bubbleOut: 4, awardTop: 3, miserable: -0.5, content: -0.2, riskReach: 4, riskOpen: 2,
  newStarts: 3, draftWeeks: [6, 10, 14], draftRound: 2,
};

const SCHOOL = (id: string) => teamById(id).school.toUpperCase();
const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH'}`;

export function teamStories(k: StoryKit): void {
  confRace(k);
  bubble(k);
  awards(k);
  transferRisk(k);
  phenom(k);
  newFaces(k);
  seniorDay(k);
  draftStock(k);
}

// ---------------------------------------------------------------- the conference race

/** Conference games a team has left. */
function confLeft(state: SeasonState, team: string): number {
  return state.games.filter((x) => !x.result && x.kind === 'conf' && (x.home === team || x.away === team)).length;
}

function confRace(k: StoryKit): void {
  const { state, u, week, add, beat, resolve } = k;
  const conf = teamById(u).conference;
  if (!CONF_RULES[conf]?.champGame) return;
  const s = open(state, 'confRace', `${state.year}`);
  // The title game is set: the race is over.
  if (state.phase !== 'regular') {
    if (!s) return;
    const inIt = state.games.some((x) => x.kind === 'champ' && (x.home === u || x.away === u));
    if (inIt && !s.k?.clinched) beat(s, 'IN THE TITLE GAME', 'up');
    if (!inIt) beat(s, 'MISSED THE TITLE GAME', 'down', { tier: 2, sub: `NO ${conf.toUpperCase()} TITLE GAME THIS YEAR`, lines: ['THE RACE CAME DOWN TO THE LAST WEEK'] });
    resolve(s, inIt ? `${conf.toUpperCase()} TITLE GAME` : 'MISSED THE TITLE GAME');
    return;
  }
  const rows = standings(state, conf);
  const me = rows.find((r) => r.team === u);
  if (!me || me.rec.cw + me.rec.cl < TSTORY.confFrom) return;
  const max = me.rec.cw + confLeft(state, u);
  const others = rows.filter((r) => r.team !== u);
  const clinched = others.filter((r) => r.rec.cw + confLeft(state, r.team) >= me.rec.cw).length <= 1;
  const out = others.filter((r) => r.rec.cw > max).length >= 2;
  const place = rows.indexOf(me) + 1;
  const second = rows[1];
  const gb = place <= 2 ? 0 : (second.rec.cw - me.rec.cw + (me.rec.cl - second.rec.cl)) / 2;
  const leader = rows[0].team === u ? rows[1] : rows[0];
  const stakes = place <= 2
    ? `${ORD(place)} IN THE ${conf.toUpperCase()} AT ${me.rec.cw}-${me.rec.cl}${leader ? `. ${SCHOOL(leader.team)} ${leader.rec.cw}-${leader.rec.cl}` : ''}`
    : `${ORD(place)} IN THE ${conf.toUpperCase()}, ${gb} GAME${gb === 1 ? '' : 'S'} OUT OF 2ND`;
  if (!s) {
    if (out || place > TSTORY.confPlace || had(state, 'confRace', `${state.year}`)) return;
    const n = add({ id: `confRace:${state.year}`, kind: 'confRace', team: u, title: `THE ${conf.toUpperCase()} RACE`, stakes, k: { place } });
    n.beats.push({ week, text: `${ORD(place)} AT ${me.rec.cw}-${me.rec.cl}`, tone: place <= 2 ? 'up' : 'flat' });
    if (clinched) clinch(k, n, conf);
    return;
  }
  const kk = (s.k ??= {});
  if (out) {
    beat(s, 'ELIMINATED', 'down', { tier: 2, sub: `OUT OF THE ${conf.toUpperCase()} TITLE RACE`, lines: [`${me.rec.cw}-${me.rec.cl} IN CONFERENCE`] });
    resolve(s, 'ELIMINATED');
    return;
  }
  if (place !== kk.place) s.beats.push({ week, text: `${ORD(place)} AT ${me.rec.cw}-${me.rec.cl}`, tone: place < (kk.place ?? place) ? 'up' : 'down' });
  kk.place = place;
  s.stakes = kk.clinched ? `CLINCHED. NEXT: ${k.next ? nextText(state, k.next) : 'THE TITLE GAME'}` : stakes;
  if (clinched && !kk.clinched) clinch(k, s, conf);
}

function clinch(k: StoryKit, s: Storyline, conf: string): void {
  (s.k ??= {}).clinched = 1;
  s.stakes = 'CLINCHED A SPOT IN THE TITLE GAME';
  k.beat(s, 'CLINCHED A SPOT IN THE TITLE GAME', 'up', { tier: 3, w: 3, sub: `${conf.toUpperCase()} TITLE GAME BOUND`, lines: ['CLINCHED WITH GAMES TO SPARE'] });
}

// ---------------------------------------------------------------- the playoff bubble

/** The field if it were picked today: the user's seed, or how many spots out. */
function fieldToday(state: SeasonState, u: string): { seed: number; out: number; rank: number } | undefined {
  const cfp = latestPoll(state, 'cfp');
  if (!cfp) return undefined;
  const ranked = cfp.ranks.map((r) => r.team);
  const order = [...ranked, ...TEAMS.map((t) => t.id).filter((id) => !ranked.includes(id))];
  const field = selectPlayoff(state, order);
  const seed = field.indexOf(u) + 1;
  const outside = order.filter((id) => !field.includes(id));
  return { seed, out: seed ? 0 : outside.indexOf(u) + 1, rank: rankIn(cfp, u) };
}

function bubble(k: StoryKit): void {
  const { state, u, week, ev, add, beat, resolve } = k;
  const s = open(state, 'bubble', `${state.year}`);
  if (ev.selection) {
    if (!s) return;
    const seed = (state.bracket?.seeds ?? []).indexOf(u) + 1;
    beat(s, seed ? `IN AS THE NO. ${seed} SEED` : 'LEFT OUT', seed ? 'up' : 'down');
    resolve(s, seed ? `MADE THE PLAYOFF: NO. ${seed} SEED` : 'LEFT OUT OF THE PLAYOFF');
    return;
  }
  if (week < CALENDAR.cfpStartWeek || (state.phase !== 'regular' && state.phase !== 'confChamp')) return;
  const f = fieldToday(state, u);
  if (!f) return;
  const status = f.seed ? `IN AS THE NO. ${f.seed} SEED` : f.out === 1 ? 'FIRST TEAM OUT' : `${f.out} SPOTS OUT`;
  const near = f.seed || (f.out > 0 && f.out <= TSTORY.bubbleOut);
  if (!s) {
    if (!near || !f.rank || f.rank > TSTORY.bubbleTop || had(state, 'bubble', `${state.year}`)) return;
    add({
      id: `bubble:${state.year}`, kind: 'bubble', team: u, title: 'THE PLAYOFF PICTURE', stakes: `IF IT ENDED TODAY: ${status}`,
      meter: f.seed ? { at: 13 - f.seed, of: 12, label: `NO. ${f.seed} SEED` } : undefined, k: { seed: f.seed },
    }).beats.push({ week, text: `CFP NO. ${f.rank}: ${status}`, tone: f.seed ? 'up' : 'flat' });
    return;
  }
  const kk = (s.k ??= {});
  const was = kk.seed ?? 0;
  kk.seed = f.seed;
  s.stakes = `IF IT ENDED TODAY: ${status}`;
  s.meter = f.seed ? { at: 13 - f.seed, of: 12, label: `NO. ${f.seed} SEED` } : undefined;
  if (!was && f.seed) beat(s, `INTO THE FIELD: NO. ${f.seed} SEED`, 'up', { tier: 2, w: 2.5, sub: `INTO THE PLAYOFF FIELD AS THE NO. ${f.seed} SEED`, lines: [`CFP NO. ${f.rank}`] });
  else if (was && !f.seed) beat(s, `OUT OF THE FIELD: ${status}`, 'down', { tier: 2, w: 2.5, sub: `OUT OF THE PLAYOFF FIELD: ${status}`, lines: [f.rank ? `CFP NO. ${f.rank}` : 'UNRANKED'] });
  else if (f.seed && f.seed !== was) s.beats.push({ week, text: `NO. ${f.seed} SEED`, tone: f.seed < was ? 'up' : 'down' });
}

// ---------------------------------------------------------------- the position awards

function awards(k: StoryKit): void {
  const { state, u, week, ev, add, beat, resolve, out } = k;
  for (const def of AWARDS.slice(1)) {
    const s = state.stories!.find((x) => x.kind === 'award' && x.status === 'open' && x.id.startsWith(`award:${def.id}:`));
    if (ev.selection) {
      const a = state.awards.find((x) => x.id === def.id);
      const at = a?.finalists.findIndex((f) => f.team === u) ?? -1;
      if (a && at === 0) {
        const f = a.finalists[0];
        const pl = k.sq.athletes.find((x) => x.id === f.id);
        out.push({
          id: `${state.year}:${week}:award:${def.id}`, week, kind: 'award', tier: 3, w: 3, team: u, arc: s?.id,
          title: def.name.toUpperCase(), sub: `${withPos(f)}: THE WINNER`, lines: [],
          p: pl ? momentPlayer(pl, u) : undefined,
          rows: a.finalists.slice(0, 5).map((x, i) => ({ text: `${i + 1}. ${x.name.toUpperCase()}`, val: `${teamById(x.team).abbr} ${x.pos}`, me: x.team === u, team: x.team })),
        });
      }
      if (s) {
        const mineAt = a?.finalists.findIndex((x) => x.id === s.star?.id) ?? -1;
        const text = mineAt === 0 ? `WON THE ${def.name.toUpperCase()}` : mineAt > 0 ? `FINISHED ${ORD(mineAt + 1)}` : 'NOT A FINALIST';
        s.beats.push({ week, text, tone: mineAt === 0 ? 'up' : 'flat' });
        resolve(s, text);
      }
      continue;
    }
    if (state.phase !== 'regular' || week < CALENDAR.heismanWatchWeek) continue;
    const race = awardRace(state, def, 5).finalists;
    if (s) {
      const at = race.findIndex((f) => f.id === s.star!.id);
      if (at < 0) {
        beat(s, 'FALLS OUT OF THE RACE', 'down');
        resolve(s, 'FELL OUT OF THE RACE');
        continue;
      }
      if (at !== s.k?.at) s.beats.push({ week, text: `NO. ${at + 1}`, tone: at < (s.k?.at ?? at) ? 'up' : 'down' });
      s.k = { at };
      s.stakes = `NO. ${at + 1} IN THE RACE`;
      s.meter = { at: 5 - at, of: 5, label: `NO. ${at + 1}` };
      continue;
    }
    const at = race.findIndex((f) => f.team === u);
    if (at < 0 || at >= TSTORY.awardTop) continue;
    const f = race[at];
    if (had(state, 'award', `${def.id}:${state.year}`)) continue;
    const pl = k.sq.athletes.find((x) => x.id === f.id);
    if (!pl) continue;
    add({
      id: `award:${def.id}:${state.year}`, kind: 'award', team: u, title: def.name.toUpperCase(), star: momentPlayer(pl, u),
      stakes: `NO. ${at + 1} IN THE RACE`, meter: { at: 5 - at, of: 5, label: `NO. ${at + 1}` }, k: { at },
    }).beats.push({ week, text: `IN THE RACE AT NO. ${at + 1}`, tone: 'up' });
  }
}

// ---------------------------------------------------------------- morale: a transfer risk

function transferRisk(k: StoryKit): void {
  const { state, u, week, sq, add, beat, resolve, out, roles } = k;
  if (state.phase === 'offseason') return;
  const ts = state.teamState[u];
  const ctx = moraleContext(state, sq);
  const stories = state.stories!;
  for (const s of stories.filter((x) => x.kind === 'transferRisk' && x.status === 'open')) {
    const a = sq.athletes.find((x) => x.id === s.star!.id);
    if (!a) {
      resolve(s, 'LEFT THE TEAM');
      continue;
    }
    const m = moraleOf(ts, a);
    if (m > TSTORY.content) {
      beat(s, 'BACK IN GOOD SPIRITS', 'up', { tier: 1, sub: `${withPos(s.star!)} IS BACK IN GOOD SPIRITS` });
      resolve(s, 'BACK IN GOOD SPIRITS');
      continue;
    }
    s.stakes = `${moraleReason(ctx, a, m).text}. HE COULD HIT THE PORTAL`;
  }
  // Who matters: within reach of his position's weakest starter, or a 4-star or better.
  const st = starters(sq);
  const weakest = new Map<string, number>();
  for (const a of Object.values(st)) weakest.set(a.pos, Math.min(weakest.get(a.pos) ?? 99, overall(a.r, a.pos)));
  for (const a of sq.athletes) {
    if (stories.filter((x) => x.kind === 'transferRisk' && x.status === 'open').length >= TSTORY.riskOpen) break;
    const m = moraleOf(ts, a);
    if (m > TSTORY.miserable || had(state, 'transferRisk', `${a.id}:${state.year}`)) continue;
    const ovr = overall(a.r, a.pos);
    if (ovr < (weakest.get(a.pos) ?? 99) - TSTORY.riskReach && a.stars < 4) continue;
    const why = moraleReason(ctx, a, m);
    const star = momentPlayer(a, u);
    const s = add({ id: `transferRisk:${a.id}:${state.year}`, kind: 'transferRisk', team: u, title: 'TRANSFER RISK', star, stakes: `${why.text}. HE COULD HIT THE PORTAL` });
    beat(s, `${withPos(star)} IS MISERABLE`, 'down', { tier: 2, w: 1 + (MOMENTS.posW[a.pos] ?? 0.5), sub: `${withPos(star)} IS MISERABLE`, lines: [why.text, 'HE COULD HIT THE PORTAL THIS OFFSEASON'] });
    // Unhappy about his role, with a starting job he could take: the user can give him one.
    const slot = why.driver === 'role' && !roles.has(a.id) && healthy(a) ? slotFor(k, a) : undefined;
    if (slot) {
      const cur = st[slot];
      s.slot = slot;
      s.other = momentPlayer(cur, u);
      s.decision = {
        prompt: `${withPos(star)} WANTS TO PLAY. GIVE HIM THE START AT ${slot}?`, slot, act: 'depth', week,
        options: [
          { id: a.id, label: `START ${withPos(star)}`, sub: `${star.ovr} OVR. A STARTING JOB CAN WIN HIM BACK; ${withPos(s.other)} LOSES HIS` },
          { id: '', label: 'KEEP THE CHART', sub: `${withPos(s.other)} STAYS THE STARTER. HE MAY LOOK ELSEWHERE` },
        ],
      };
      out.push(decisionMoment(state, week, s));
    }
  }
}

/** A starting slot an unhappy backup could take: his position's, its starter no hot hand and in no story. */
function slotFor(k: StoryKit, a: Athlete): string | undefined {
  const st = starters(k.sq);
  const busy = new Set((k.state.stories ?? []).filter((x) => x.status === 'open' && x.slot).map((x) => x.slot));
  return START_SLOTS.filter((slot) => st[slot] && st[slot].pos === a.pos && !busy.has(slot) && (k.sq.depth[slot] ?? []).includes(a.id))
    .filter((slot) => (k.prog(st[slot].id)?.c ?? 0) < STORY.hotHand && overall(a.r, a.pos) >= overall(st[slot].r, st[slot].pos) - TSTORY.riskReach)
    .sort((x, y) => overall(st[x].r, st[x].pos) - overall(st[y].r, st[y].pos))[0];
}

// ---------------------------------------------------------------- new faces

/** Started last game (`TeamState.st`). */
const started = (state: SeasonState, id: string) => Object.values(state.teamState[state.config.userTeamId]?.st ?? {}).includes(id);

function phenom(k: StoryKit): void {
  const { state, u, week, g, add, beat, resolve, line } = k;
  for (const s of state.stories!.filter((x) => x.kind === 'phenom' && x.status === 'open')) {
    const l = g && started(state, s.star!.id) ? line(s.star!.id) : undefined;
    if (l) {
      const kk = (s.k ??= {});
      kk.starts = (kk.starts ?? 0) + 1;
      s.beats.push({ week, text: `${k.won ? 'W' : 'L'} VS ${teamById(g!.home === u ? g!.away : g!.home).abbr}: ${statLine(l)}`, tone: impact(l, false) > 0 ? 'up' : 'flat' });
      s.stakes = `${kk.starts} START${kk.starts === 1 ? '' : 'S'} AS A TRUE FRESHMAN`;
    }
    if (!k.next && state.phase !== 'regular') resolve(s, `A FRESHMAN SEASON: ${s.k?.starts ?? 0} STARTS`);
  }
  if (!g) return;
  const sparked = new Set(k.ev.sparks.filter((e) => e.team === u).map((e) => e.athlete.id));
  for (const a of k.sq.athletes) {
    if (joinYear(a.id) !== state.year || !started(state, a.id) || had(state, 'phenom', `${a.id}`)) continue;
    const l = line(a.id);
    if (!sparked.has(a.id) && !(l && impact(l, false) > 0.5)) continue;
    const star = momentPlayer(a, u);
    const p = prospect(a.id);
    const was = p ? `A ${p.stars}-STAR, NO. ${p.rank} IN HIS CLASS` : `A ${a.stars}-STAR FROM ${star.home}`;
    const s = add({ id: `phenom:${a.id}`, kind: 'phenom', team: u, title: 'FRESHMAN PHENOM', star, stakes: 'A TRUE FRESHMAN, STARTING', k: { starts: 1 } });
    beat(s, `A TRUE FRESHMAN ARRIVES`, 'up', {
      tier: 2, w: 1.5 + (MOMENTS.posW[a.pos] ?? 0.5), sub: `${withPos(star)}: A TRUE FRESHMAN ARRIVES`,
      lines: [was, l ? statLine(l) : 'A STARTER ALREADY'],
    });
  }
}

/** A new starter's first games, opened by the season opener (season/offseasonMoments.ts). */
function newFaces(k: StoryKit): void {
  const { state, u, week, g, beat, resolve, line } = k;
  if (!g) return;
  for (const s of state.stories!.filter((x) => x.kind === 'newFace' && x.status === 'open')) {
    if (!started(state, s.star!.id)) continue;
    const kk = (s.k ??= {});
    kk.starts = (kk.starts ?? 0) + 1;
    kk.wins = (kk.wins ?? 0) + (k.won ? 1 : 0);
    const l = line(s.star!.id);
    const rec = `${kk.wins}-${kk.starts - kk.wins}`;
    const opp = teamById(g.home === u ? g.away : g.home).abbr;
    if (kk.starts === 1) {
      const debut = s.star!.from ? 'TRANSFER DEBUT' : 'THE DEBUT';
      beat(s, `${debut}: ${k.won ? 'W' : 'L'} VS ${opp}${l ? `, ${statLine(l)}` : ''}`, k.won ? 'up' : 'flat', {
        tier: 2, w: 1 + (MOMENTS.posW[s.star!.pos] ?? 0.5), sub: `${withPos(s.star!)}: ${k.won ? 'A WINNING DEBUT' : 'A TOUGH DEBUT'}`,
        lines: [s.star!.from ? `FROM ${SCHOOL(s.star!.from)}` : s.title, l ? statLine(l) : ''].filter(Boolean),
      });
    } else s.beats.push({ week, text: `${k.won ? 'W' : 'L'} VS ${opp}${l ? `: ${statLine(l)}` : ''}`, tone: k.won ? 'up' : 'flat' });
    s.stakes = `${rec} AS THE STARTER`;
    s.meter = { at: kk.starts, of: TSTORY.newStarts, label: `${kk.starts} OF ${TSTORY.newStarts} STARTS` };
    if (kk.starts >= TSTORY.newStarts) resolve(s, `${rec} IN HIS FIRST ${TSTORY.newStarts} STARTS`);
  }
}

// ---------------------------------------------------------------- senior day

function seniorDay(k: StoryKit): void {
  const { state, u, week, g, next, add, out } = k;
  // Played: the seniors' send-off (the game story itself closed with the game).
  const done = g && state.stories!.find((x) => x.kind === 'seniorDay' && x.game === g.id);
  if (done) {
    const sr = seniorsLeaving(state, u);
    out.push({
      id: `${state.year}:${week}:seniors`, week, kind: 'farewell', tier: 2, w: 1.2, team: u, arc: done.id,
      title: 'SENIOR DAY', sub: `${k.won ? 'A WIN' : 'A LOSS'} IN THEIR LAST HOME GAME`, lines: [],
      rows: sr.slice(0, 18).map((a) => ({ text: `${athleteName(a).toUpperCase()} ${a.pos}`, val: `${careerStarts(state, a.id)}`, me: false })),
    });
  }
  if (!next || next.home !== u || next.neutral || (next.kind !== 'conf' && next.kind !== 'nonconf') || next.id === g?.id) return;
  const later = state.games.some((x) => x.home === u && !x.neutral && !x.result && x.week > next.week && (x.kind === 'conf' || x.kind === 'nonconf'));
  if (later || had(state, 'seniorDay', `${state.year}`)) return;
  const sr = seniorsLeaving(state, u);
  if (!sr.length) return;
  const star = momentPlayer(sr[0], u);
  add({
    id: `seniorDay:${state.year}`, kind: 'seniorDay', team: u, title: 'SENIOR DAY', star, game: next.id,
    stakes: `${sr.length} SENIORS PLAY THEIR LAST HOME GAME`,
  }).beats.push({ week, text: `${sr.length} SENIORS, LED BY ${withPos(star)}`, tone: 'flat' });
}

function careerStarts(state: SeasonState, id: string): number {
  const c = state.careers?.[id];
  return (c?.seasons ?? []).reduce((t, r) => t + (r.gs ?? 0), 0) + (c?.now?.gs ?? 0);
}

// ---------------------------------------------------------------- draft stock

const roundText = (proj: number) => (roundOf(proj) ? `${ORD(roundOf(proj))} ROUND` : 'UNDRAFTED');

function draftStock(k: StoryKit): void {
  const { state, u, week, add, beat, roles } = k;
  if (state.phase !== 'regular' || !TSTORY.draftWeeks.includes(week)) return;
  for (const x of teamProjections(state, u)) {
    if (!roles.has(x.a.id)) continue;
    // Past the last pick he projects undrafted (`roundOf` 0): no story, and a fall off the board.
    const round = roundOf(x.proj) || 99;
    const s = state.stories!.find((y) => y.kind === 'draftStock' && y.star?.id === x.a.id && y.status === 'open');
    const stakes = `PROJECTED ${roundText(x.proj)}${x.grad ? '' : '. WILL HE DECLARE?'}`;
    if (s) {
      const was = s.k?.round ?? round;
      s.k = { round };
      s.stakes = stakes;
      if (round < was) beat(s, `STOCK RISING: ${roundText(x.proj)}`, 'up', round === 1 ? { tier: 2, sub: `${withPos(s.star!)}: A 1ST ROUND PROJECTION`, lines: [x.grad ? 'A SENIOR. THE DRAFT IS NEXT' : 'AN UNDERCLASSMAN. WILL HE DECLARE?'] } : undefined);
      else if (round > was) s.beats.push({ week, text: `STOCK FALLING: ${roundText(x.proj)}`, tone: 'down' });
      continue;
    }
    if (round > TSTORY.draftRound || had(state, 'draftStock', `${x.a.id}:${state.year}`)) continue;
    const star = momentPlayer(x.a, u);
    add({ id: `draftStock:${x.a.id}:${state.year}`, kind: 'draftStock', team: u, title: 'DRAFT STOCK', star, stakes, k: { round } })
      .beats.push({ week, text: `SCOUTS HAVE HIM IN THE ${roundText(x.proj)}`, tone: 'up' });
  }
}

