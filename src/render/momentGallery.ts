import { starters } from '../data/depth';
import { TEAMS } from '../data/teams';
import { momentPlayer } from '../season/moments';
import type { Moment, SeasonState, Storyline } from '../season/types';
import { squadFor } from '../season/world';

/**
 * One moment of every kind from the user's roster, for looking at the Week Wrap's scenes in a dev build
 * (`window.game.momentGallery()`). Nothing here is saved, except the sample storyline its decision
 * card reads, which is dropped again if left undecided.
 */
export function galleryMoments(s: SeasonState): Moment[] {
  const u = s.config.userTeamId;
  const sq = squadFor(s, u);
  const st = starters(sq);
  const qb = momentPlayer(st.QB, u);
  const hb = momentPlayer(st.RB, u);
  const wr = momentPlayer(st.X ?? st.Z, u);
  const backup = sq.athletes.find((a) => a.pos === 'QB' && a.id !== st.QB.id) ?? st.QB;
  const qb2 = momentPlayer(backup, u);
  const opp = TEAMS.find((t) => t.id !== u)!.id;
  const base = { week: s.week, team: u, w: 1, lines: [] as string[] };
  const story: Storyline = {
    id: 'gallery', kind: 'nextManUp', team: u, title: 'NEXT MAN UP', star: qb2, other: qb, opened: s.week, status: 'open', slot: 'QB',
    beats: [{ week: s.week - 2, text: `${qb.name} GOES DOWN. ${qb2.name} IS UP.`, tone: 'down' }, { week: s.week - 1, text: 'W VS LSU: 21/30, 288 YDS, 3 TD', tone: 'up' }],
    stakes: 'YOUR CALL: WHO STARTS', meter: { at: 2, of: 3, label: '2 OF 3 STARTS, 1 GAME LEFT' },
    decision: {
      prompt: `${qb.name} IS HEALTHY. WHO STARTS AT QB?`, slot: 'QB', week: s.week,
      options: [{ id: qb2.id, label: `RIDE ${qb2.name}`, sub: '2-0 AS THE STARTER, PLAYING WITH CONFIDENCE' }, { id: qb.id, label: `GO BACK TO ${qb.name}`, sub: 'THE STARTER, BACK FROM INJURY' }],
    },
  };
  s.stories = [...(s.stories ?? []).filter((x) => x.id !== 'gallery'), story];
  const rows = (n: number, f: (i: number) => Moment['rows'] extends (infer R)[] | undefined ? R : never) => Array.from({ length: n }, (_, i) => f(i));
  return [
    { ...base, id: 'g1', kind: 'final', tier: 3, title: 'STORM THE FIELD', sub: 'BEAT #3 TEXAS - RED RIVER', style: 'upset', score: [31, 28], opp, p: qb, n: [18, 9], lines: ['8-2', 'SERIES UNDER YOU: 3-1', `GAME BALL: ${qb.name} 24/31, 318 YDS, 3 TD`] },
    { ...base, id: 'g2', kind: 'final', tier: 2, title: 'STUNNED', sub: 'LOST TO UNRANKED TULSA', style: 'stunned', score: [17, 20], opp, n: [6, 14], lines: ['7-3'] },
    { ...base, id: 'g3', kind: 'breakout', tier: 3, title: 'BREAKOUT', sub: `${hb.name} HAS ARRIVED`, p: hb, dev: ['normal', 'impact'], n: [hb.ovr - 4, hb.ovr], d: { spd: 1, elu: 2, acc: 2, str: 1 }, lines: [`A ${hb.cls} ${hb.stars}-STAR FROM ${hb.home}`, '4 WEEKS AGO HE STEPPED IN FOR THE INJURED STARTER.'] },
    { ...base, id: 'g4', kind: 'breakthrough', tier: 2, title: 'BREAKTHROUGH', sub: `${wr.name}: IT CLICKED`, p: wr, n: [wr.ovr - 3, wr.ovr], d: { cth: 2, rte: 2, rls: 1 }, lines: [`A ${wr.cls} ${wr.stars}-STAR FROM ${wr.home}`] },
    { ...base, id: 'g5', kind: 'injury', tier: 3, title: 'INJURY', sub: `${qb.name} IS OUT`, p: qb2, q: qb, arc: 'gallery', lines: ['HIGH ANKLE SPRAIN: OUT 3 WEEKS', `NEXT MAN UP: ${qb2.name}`, 'HE HAS NEVER STARTED A GAME', 'HIS TIME: AT #12 LSU'] },
    { ...base, id: 'g6', kind: 'firstStart', tier: 2, title: 'FIRST START', sub: `${qb2.name}: A WINNER`, p: qb2, arc: 'gallery', lines: [`A ${qb2.cls} ${qb2.stars}-STAR FROM ${qb2.home}`, 'IN HIS FIRST START: 21/30, 288 YDS, 3 TD', 'BREAKOUT WATCH: 3 STRONG STARTS IN HIS FIRST 4 GAMES AND HE BREAKS OUT'] },
    { ...base, id: 'g7', kind: 'poll', tier: 3, title: 'THE AP POLL', sub: 'INTO THE TOP 5', n: [9, 4], lines: ['FROM NO. 9 TO NO. 4'], rows: rows(5, (i) => ({ text: `${i + 2}. ${i === 2 ? 'YOU' : TEAMS[i].school.toUpperCase()}`, val: '8-1', mv: i === 2 ? 5 : -1, me: i === 2, team: i === 2 ? u : TEAMS[i].id })) },
    { ...base, id: 'g8', kind: 'heisman', tier: 3, title: 'HEISMAN WATCH', sub: `${qb.name}: THE HEISMAN FRONTRUNNER`, p: qb, n: [3, 1], lines: [`A ${qb.cls} ${qb.stars}-STAR FROM ${qb.home}`], rows: rows(5, (i) => ({ text: `${i + 1}. ${i ? `PLAYER ${i}` : qb.name}`, val: 'QB', mv: i ? -1 : 2, me: !i, team: i ? TEAMS[i + 3].id : u })) },
    { ...base, id: 'g9', kind: 'milestone', tier: 2, title: 'MILESTONE', sub: '1,000 RUSHING YARDS', p: hb, n: [912, 1047], lines: [`${hb.name} THIS SEASON: 1,047 IN 8 GAMES`] },
    { ...base, id: 'g10', kind: 'stakes', tier: 3, title: 'IN THE PLAYOFF', sub: 'THE NO. 3 SEED', lines: ['A FIRST-ROUND BYE'] },
    { ...base, id: 'g11', kind: 'story', tier: 2, title: 'NEXT MAN UP', sub: `${qb2.name}: 2-0 AS THE STARTER`, p: qb2, arc: 'gallery', lines: ['21/30, 288 YDS, 3 TD', `${qb.name} BACK IN ABOUT 1 WEEK`] },
    { ...base, id: 'g12', kind: 'decision', tier: 3, title: 'YOUR CALL', sub: story.decision!.prompt, p: qb2, q: qb, arc: 'gallery' },
    { ...base, id: 'g13', kind: 'progress', tier: 1, title: 'PROGRESS REPORT', sub: '8 LEVEL-UPS THIS WEEK', rows: sq.athletes.slice(0, 8).map((a, i) => ({ text: `${a.first} ${a.last} ${a.pos}`.toUpperCase(), val: `+${1 + (i % 4)}`, me: i === 1, team: u })) },
    { ...base, id: 'g14', kind: 'preview', tier: 1, title: 'UP NEXT', sub: 'AT #12 LSU', opp, lines: ['WEEK 9'], rows: [
      { text: 'HOMECOMING: ' + wr.name, val: 'PLAYS IN FRONT OF FAMILY IN LA', me: true, team: u },
      { text: 'BREAKOUT WATCH: ' + qb2.name, val: 'ON PACE TO BREAK OUT: 2 GAMES LEFT', team: u },
      { text: 'THE UNBEATEN RUN', val: '8-0. NEXT: AT #12 LSU', team: u },
    ] },
    { ...base, id: 'g15', kind: 'around', tier: 1, title: 'AROUND THE FBS', sub: `WEEK ${s.week}`, rows: [
      { text: `UPSET: ${TEAMS[5].school.toUpperCase()} OVER #2 ${TEAMS[6].school.toUpperCase()}`, val: '27-24', team: TEAMS[5].id },
      { text: `NEW NO. 1: ${TEAMS[7].school.toUpperCase()}`, team: TEAMS[7].id },
      { text: `HEISMAN 1. ${qb.name} ${TEAMS.find((t) => t.id === u)!.abbr}`, mv: 2, me: true, team: u },
    ] },
  ];
}
