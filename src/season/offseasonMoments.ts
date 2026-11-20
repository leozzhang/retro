import type { Athlete } from '../data/athletes';
import { athleteName, generatedAthlete, starters } from '../data/depth';
import { overall } from '../data/positions';
import { prospect } from '../data/recruits';
import { joinYear } from '../data/rosterGen';
import { teamById } from '../data/teams';
import { START_SLOTS } from './confidence';
import { momentPlayer, MOMENTS, withPos } from './moments';
import { latestPoll, rankIn } from './polls';
import { classRanks } from './recruiting';
import { recruitPlayer, recruitTag } from './recruitStories';
import { records, recordText } from './standings';
import type { Moment, MomentPlayer, MomentRow, OffseasonStage, SeasonState, Storyline } from './types';
import { squadFor } from './world';

/**
 * The offseason as reveals (docs/STORYLINES.md): each stage closes with a few scenes (STAFF CHANGES,
 * DRAFT NIGHT, SIGNING DAY, THE PORTAL), and the new season opens with its own (arrivals, who
 * replaces whom, players to watch, games circled). Display only: it reads what the stages left and
 * changes nothing but `moments` and `stories`; season stories still open close here.
 */

/** New starters whose first games open a story each, the most important positions first. */
const NEW_FACES = 3;

/** Off in the tests that check these change nothing. */
export const STAGE_MOMENTS = { on: true };

const SCHOOL = (id: string) => teamById(id).school.toUpperCase();
const ABBR = (id: string) => teamById(id).abbr;

/** The stories each stage settles; the rest of the season's close when the offseason opens. */
const SETTLED_BY: Partial<Record<Storyline['kind'], OffseasonStage>> = {
  draftStock: 'departures', recruitment: 'signing', recruitClass: 'signing', transferRisk: 'portal',
};

/** A player who may be gone from every roster now: his last squad, else his generated self. */
function athleteOf(state: SeasonState, team: string, id: string): Athlete | undefined {
  return squadFor(state, team).athletes.find((a) => a.id === id) ?? generatedAthlete(id) ?? prospect(id)?.a;
}

/**
 * The user's players as their cards read now (class, dev trait, overall), taken before a stage drops
 * them: once departures run, a drafted player's progress is gone and only his generated self is left.
 */
export function userCards(state: SeasonState): Map<string, MomentPlayer> | undefined {
  if (!STAGE_MOMENTS.on) return undefined;
  const u = state.config.userTeamId;
  return new Map(squadFor(state, u).athletes.map((a) => [a.id, momentPlayer(a, u)]));
}

/** The reveal for the stage that just ran (`advanceOffseason` calls it); `cards` from `userCards` before it ran. */
export function stageMoments(state: SeasonState, stage: OffseasonStage, cards?: Map<string, MomentPlayer>): void {
  if (!STAGE_MOMENTS.on) return;
  const ms: Moment[] = [];
  const u = state.config.userTeamId;
  const mk = (key: string, m: Omit<Moment, 'id' | 'week' | 'team' | 'os'>) => ms.push({ id: `${state.year}:os:${stage}:${key}`, week: state.week, team: u, os: stage, ...m } as Moment);
  const stories = (state.stories ??= []);
  const close = (s: Storyline, text: string, tone: 'up' | 'down' | 'flat') => {
    s.beats.push({ week: state.week, text, tone });
    s.status = 'resolved';
    s.outcome = text;
    s.stakes = '';
    delete s.meter;
  };

  if (stage === 'carousel') {
    // Who started as the season ended, before departures take players off the lineup.
    state.lineup = { ...(state.teamState[u]?.st ?? {}) };
    // The season's stories that nothing in the offseason settles end with it.
    for (const s of stories.filter((x) => x.status === 'open' && !SETTLED_BY[x.kind])) close(s, s.kind === 'newFace' || s.kind === 'phenom' ? `${s.k?.starts ?? 0} STARTS THIS SEASON` : 'THE SEASON ENDED', 'flat');
    const rows: MomentRow[] = state.news
      .filter((n) => n.kind === 'carousel' && n.teams.includes(u) && n.week === state.week)
      .map((n) => ({ text: n.text.replace(/^STAFF: /i, '').toUpperCase(), team: u }));
    mk('staff', {
      kind: 'staff', tier: 2, w: 1, title: 'STAFF CHANGES', sub: rows.length ? `${rows.length} CHANGE${rows.length === 1 ? '' : 'S'} ON YOUR STAFF` : 'YOUR STAFF STAYS TOGETHER',
      lines: [], rows: rows.slice(0, 8),
    });
  }

  if (stage === 'departures') {
    const picks = (state.history.find((h) => h.year === state.year)?.draft ?? []).filter((p) => p.team === u);
    for (const p of picks.filter((x) => x.round === 1)) {
      const card = cards?.get(p.id);
      const a = card ? undefined : athleteOf(state, u, p.id);
      mk(`draft:${p.id}`, {
        kind: 'draft', tier: 3, w: 3 - p.pick / 100, title: 'THE PICK IS IN', sub: `${p.pos} ${p.name.toUpperCase()}`,
        lines: [`ROUND 1, PICK ${p.pick}: ${p.city.toUpperCase()}`, p.early ? 'AN UNDERCLASSMAN, DECLARED EARLY' : 'A SENIOR'],
        p: card ? { ...card, ovr: p.ovr } : a ? momentPlayer(a, u, p.ovr) : undefined, n: [1, p.pick],
      });
    }
    if (picks.length) {
      mk('draftboard', {
        kind: 'draft', tier: 2, w: 2, title: 'DRAFT NIGHT', sub: `${picks.length} OF YOURS DRAFTED`, lines: [],
        rows: picks.slice(0, 8).map((p) => ({ text: `${p.pos} ${p.name.toUpperCase()}`, val: `ROUND ${p.round}, PICK ${p.pick}: ${p.city.toUpperCase()}`, team: u, me: p.round === 1 })),
      });
    }
    const gone = (state.departures?.gone ?? []).filter((d) => d.team === u);
    const stay = Object.entries(state.departures?.watch ?? {}).filter(([id]) => !gone.some((d) => d.id === id));
    if (gone.length || stay.length) {
      mk('farewell', {
        kind: 'farewell', tier: 2, w: 1, title: 'FAREWELL', sub: `${gone.filter((d) => d.why === 'grad').length} GRADUATE, ${gone.filter((d) => d.why === 'declare').length} DECLARE${stay.length ? `, ${stay.length} STAY` : ''}`,
        lines: [],
        rows: [
          ...stay.map(([id]) => {
            const a = athleteOf(state, u, id);
            return { text: `${a ? athleteName(a).toUpperCase() : cards?.get(id)?.name ?? id} ${a?.pos ?? cards?.get(id)?.pos ?? ''}`, val: 'BACK', me: true };
          }),
          ...gone.sort((a, b) => b.ovr - a.ovr).map((d) => ({ text: `${d.name.toUpperCase()} ${d.pos}`, val: d.why === 'grad' ? 'GRAD' : 'NFL', me: false })),
        ],
      });
    }
    for (const s of stories.filter((x) => x.kind === 'draftStock' && x.status === 'open')) {
      const pk = picks.find((p) => p.id === s.star!.id);
      const left = gone.find((d) => d.id === s.star!.id);
      if (pk) close(s, `DRAFTED: ROUND ${pk.round}, PICK ${pk.pick} (${pk.city.toUpperCase()})`, 'up');
      else if (left) close(s, left.why === 'declare' ? 'DECLARED, WENT UNDRAFTED' : 'WENT UNDRAFTED', 'down');
      else close(s, 'COMING BACK FOR ANOTHER SEASON', 'up');
    }
  }

  if (stage === 'signing') {
    const rs = state.recruiting;
    const signed = Object.entries(rs?.signed ?? {}).filter(([, t]) => t === u).map(([id]) => prospect(id)!).filter(Boolean).sort((a, b) => a.rank - b.rank);
    for (const p of signed.filter((x) => x.stars >= 4).slice(0, 3)) {
      mk(`sign:${p.id}`, {
        kind: 'signing', tier: p.stars >= 5 ? 3 : 2, w: p.stars - p.rank / 1000, title: 'SIGNED', sub: recruitTag(p),
        lines: [`NO. ${p.rank} NATIONALLY, NO. ${p.posRank} ${p.pos}`, `FROM ${p.a.hometown.city.toUpperCase()}, ${p.a.hometown.state}`],
        p: recruitPlayer(p, u),
      });
    }
    const ranks = classRanks(state);
    const at = ranks.findIndex((r) => r.team === u) + 1;
    if (signed.length) {
      mk('class', {
        kind: 'signing', tier: 2, w: 1, title: `THE CLASS OF ${rs!.cls}`, sub: `${signed.length} SIGNED. NO. ${at} NATIONALLY`, lines: [],
        rows: signed.map((p) => ({ text: `${athleteName(p.a).toUpperCase()} ${p.pos}`, val: `${p.stars}*`, me: p.stars >= 5 })),
      });
      const from = Math.max(0, at - 3);
      mk('ranks', {
        kind: 'poll', tier: 2, w: 0.5, title: 'CLASS RANKINGS', sub: at <= 10 ? 'A TOP 10 CLASS' : at <= 25 ? 'A TOP 25 CLASS' : `NO. ${at} NATIONALLY`,
        lines: [`${signed.length} SIGNEES`], n: [at, at],
        rows: ranks.slice(from, from + 5).map((r, i) => ({ text: `${from + i + 1}. ${SCHOOL(r.team)}`, val: `${r.n} / ${r.pts}`, me: r.team === u, team: r.team })),
      });
    }
    // The recruitments that ended today.
    const lost: string[] = [];
    for (const s of stories.filter((x) => x.kind === 'recruitment' && x.status === 'open')) {
      const to = rs?.signed[s.star!.id];
      if (to === u) close(s, 'SIGNED', 'up');
      else if (to) {
        close(s, `SIGNED WITH ${SCHOOL(to)}`, 'down');
        lost.push(`${recruitTag(prospect(s.star!.id)!)}: ${ABBR(to)}`);
      } else close(s, 'NEVER SIGNED', 'flat');
    }
    for (const s of stories.filter((x) => x.kind === 'recruitClass' && x.status === 'open')) close(s, `SIGNED ${signed.length}: NO. ${at} NATIONALLY`, 'up');
    if (lost.length) {
      mk('lost', { kind: 'staff', tier: 1, w: 0, title: 'THE ONES THAT GOT AWAY', sub: 'SIGNED ELSEWHERE', lines: [], rows: lost.slice(0, 8).map((text) => ({ text, team: u })) });
    }
  }

  if (stage === 'portal') {
    const out = (state.portal?.entrants ?? []).filter((e) => e.from === u);
    const rows = out.sort((a, b) => b.ovr - a.ovr).map((e) => {
      const a = athleteOf(state, u, e.id);
      return { text: `${e.pos} ${a ? athleteName(a).toUpperCase() : e.id}`, val: `${e.ovr} OVR. ENTERS THE PORTAL`, team: u };
    });
    for (const s of stories.filter((x) => x.kind === 'transferRisk' && x.status === 'open')) {
      if (out.some((e) => e.id === s.star!.id)) close(s, 'ENTERED THE PORTAL', 'down');
      else close(s, 'STAYED', 'up');
    }
    if (rows.length) mk('portal', { kind: 'portal', tier: 2, w: 1, title: 'THE PORTAL OPENS', sub: `${rows.length} OF YOURS ENTER`, lines: [], rows: rows.slice(0, 8) });
  }
  (state.moments ??= []).push(...ms);
}

/**
 * The new season's opener, from the offseason that made it (`prev`, with its portal, departures,
 * signing class and draft still on it). Week 0 moments, and the first stories: each new starter at a
 * playmaker position.
 */
export function seasonOpener(prev: SeasonState, state: SeasonState): void {
  if (!STAGE_MOMENTS.on) return;
  const u = state.config.userTeamId;
  const ms: Moment[] = [];
  const mk = (key: string, m: Omit<Moment, 'id' | 'week' | 'team' | 'os'>) => ms.push({ id: `${state.year}:opener:${key}`, week: 0, team: u, os: 'opener', ...m } as Moment);
  const sq = squadFor(state, u);
  const st = starters(sq);
  const prog = state.teamState[u]?.progress ?? {};
  const was = prev.lineup ?? prev.teamState[u]?.st ?? {};
  const ap = latestPoll(state, 'ap');
  const rank = rankIn(ap, u);
  const last = records(prev).get(u);
  const slots = START_SLOTS.filter((x) => st[x]);
  const back = slots.filter((x) => Object.values(was).includes(st[x].id)).length;

  // 1. The year.
  mk('year', {
    kind: 'opener', tier: 3, w: 9, title: `THE ${state.year} SEASON`, sub: rank ? `PRESEASON NO. ${rank}` : 'UNRANKED IN THE PRESEASON',
    lines: [last ? `LAST YEAR: ${recordText(last)}` : '', `${back} OF ${slots.length} STARTERS RETURN`].filter(Boolean),
  });

  // 2. Who arrived: transfers, then the signing class.
  const tin = Object.entries(prev.portal?.commits ?? {}).filter(([, t]) => t === u).map(([id]) => sq.athletes.find((a) => a.id === id)).filter((a): a is Athlete => !!a);
  const signees = sq.athletes.filter((a) => joinYear(a.id) === state.year && prospect(a.id)).sort((a, b) => (prospect(a.id)!.rank) - (prospect(b.id)!.rank));
  if (tin.length || signees.length) {
    mk('arrivals', {
      kind: 'arrivals', tier: 2, w: 8, title: 'NEW ARRIVALS', sub: `${tin.length} TRANSFER${tin.length === 1 ? '' : 'S'}, ${signees.length} FRESHM${signees.length === 1 ? 'AN' : 'EN'}`, lines: [],
      rows: [
        ...tin.sort((a, b) => overall(b.r, b.pos) - overall(a.r, a.pos)).map((a) => ({ text: withPos({ pos: a.pos, name: athleteName(a) }), val: `${overall(a.r, a.pos)} OVR. TRANSFER FROM ${SCHOOL(prog[a.id]?.tr?.from ?? u)}`, team: prog[a.id]?.tr?.from ?? u, me: true })),
        ...signees.slice(0, Math.max(0, 8 - tin.length)).map((a) => ({ text: withPos({ pos: a.pos, name: athleteName(a) }), val: `${prospect(a.id)!.stars}-STAR FRESHMAN, NO. ${prospect(a.id)!.rank} NATIONALLY`, team: u })),
      ],
    });
  }

  // 3. Who replaces whom.
  const draft = new Map((prev.history.find((h) => h.year === prev.year)?.draft ?? []).map((p) => [p.id, p]));
  const gone = new Map((prev.departures?.gone ?? []).map((d) => [d.id, d]));
  const left = new Map(Object.entries(prev.portal?.commits ?? {}));
  const fresh: Moment['rows'] = [];
  const opened: string[] = [];
  const faces: { now: Athlete; slot: string; tr: string | undefined; who: string; oldA: Athlete | undefined }[] = [];
  for (const slot of slots) {
    const now = st[slot];
    const old = was[slot];
    if (!old || old === now.id || Object.values(was).includes(now.id)) continue;
    const oldA = athleteOf(prev, u, old);
    const pk = draft.get(old);
    const moved = slots.find((x) => st[x].id === old);
    const why = moved ? `MOVES TO ${moved}` : pk ? `DRAFTED, RD ${pk.round}` : gone.get(old)?.why === 'grad' ? 'GRADUATED' : gone.get(old) ? 'DECLARED' : left.get(old) ? `TRANSFERRED TO ${ABBR(left.get(old)!)}` : sq.athletes.some((a) => a.id === old) ? 'BEATEN OUT' : 'GONE';
    const tr = prog[now.id]?.tr?.from;
    const who = tr ? `TRANSFER FROM ${ABBR(tr)}` : joinYear(now.id) === state.year ? 'TRUE FRESHMAN' : 'MOVES UP';
    fresh.push({ text: `${slot}: ${withPos({ pos: now.pos, name: athleteName(now) })}`, val: `${who}. REPLACES ${oldA ? athleteName(oldA).toUpperCase() : 'A STARTER'} (${why})`, team: tr ?? u, me: !!tr });
    // The playmakers' first games are a story (the `NEW_FACES` most important).
    if ((MOMENTS.posW[now.pos] ?? 0) >= MOMENTS.keyW && !opened.includes(now.id)) {
      opened.push(now.id);
      faces.push({ now, slot, tr, who, oldA });
    }
  }
  for (const { now, slot, tr, who, oldA } of faces.sort((a, b) => (MOMENTS.posW[b.now.pos] ?? 0) - (MOMENTS.posW[a.now.pos] ?? 0)).slice(0, NEW_FACES)) {
    const star = { ...momentPlayer(now, u), ...(tr ? { from: tr } : {}) };
    (state.stories ??= []).push({
      id: `newFace:${now.id}:${state.year}`, kind: 'newFace', team: u, title: `THE NEW ${now.pos}`, star, slot, opened: 0, status: 'open',
      beats: [{ week: 0, text: `${who}. REPLACES ${oldA ? athleteName(oldA).toUpperCase() : 'A STARTER'}`, tone: 'flat' }],
      stakes: `HIS FIRST START: WEEK ${state.games.filter((g) => g.home === u || g.away === u).sort((a, b) => a.week - b.week)[0]?.week ?? 1}`, k: { starts: 0, wins: 0 },
    });
  }
  if (fresh.length) {
    const sorted = fresh.sort((a, b) => Number(b.me) - Number(a.me));
    mk('starters', { kind: 'arrivals', tier: 2, w: 7, title: 'NEW STARTERS', sub: `${fresh.length} NEW FACE${fresh.length === 1 ? '' : 'S'} IN THE LINEUP`, lines: [], rows: sorted.slice(0, 8) });
  }

  // 4. The players to watch, and 5. the games circled.
  const best = Object.values(st).filter((a, i, all) => all.findIndex((x) => x.id === a.id) === i).sort((a, b) => overall(b.r, b.pos) - overall(a.r, a.pos)).slice(0, 6);
  mk('watch', {
    kind: 'farewell', tier: 2, w: 6, title: 'PLAYERS TO WATCH', sub: 'THE BEST OF THE ROSTER', lines: [],
    rows: best.map((a) => ({ text: `${athleteName(a).toUpperCase()} ${a.pos}`, val: `${overall(a.r, a.pos)}`, me: false })),
  });
  const big = state.games
    .filter((g) => (g.home === u || g.away === u) && (g.name || rankIn(ap, g.home === u ? g.away : g.home)))
    .sort((a, b) => a.week - b.week)
    .slice(0, 6)
    .map((g) => {
      const opp = g.home === u ? g.away : g.home;
      const r = rankIn(ap, opp);
      return { text: `WEEK ${g.week}: ${g.home === u ? 'VS' : 'AT'} ${r ? `#${r} ` : ''}${SCHOOL(opp)}`, val: g.name ? g.name.toUpperCase() : `A TOP ${r <= 10 ? 10 : 25} OPPONENT`, team: opp, me: !!g.name };
    });
  if (big.length) mk('circled', { kind: 'arrivals', tier: 2, w: 5, title: 'GAMES CIRCLED', sub: 'THE ONES THAT DECIDE THE SEASON', lines: [], rows: big });
  (state.moments ??= []).push(...ms);
}

