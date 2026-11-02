import { CALENDAR } from '../data/season/calendar';
import { teamById } from '../data/teams';
import { heismanRace } from './awards';
import { latestPoll, rankIn } from './polls';
import { loser, records, recordText, winner } from './standings';
import type { NewsItem, Poll, SeasonGame, SeasonState } from './types';

/** The week's news feed, from templates. Runs after the week's games and polls. */

/** A ranked team losing to a team ranked this many spots lower (or unranked) is an upset. */
const UPSET_GAP = 6;
const MAX_PERFORMANCES = 4;

export function teamLabel(id: string, poll?: Poll): string {
  const r = rankIn(poll, id);
  const school = teamById(id).school;
  return r ? `#${r} ${school}` : school;
}

function score(g: SeasonGame): string {
  const r = g.result!;
  const hi = Math.max(r.home, r.away);
  const lo = Math.min(r.home, r.away);
  return `${hi}-${lo}${r.ot ? ` (${r.ot > 1 ? `${r.ot}OT` : 'OT'})` : ''}`;
}

export function weekNews(state: SeasonState, week: number): NewsItem[] {
  const before = latestPoll(state, 'ap', week);
  const after = latestPoll(state, 'ap');
  const games = state.games.filter((g) => g.week === week && g.result);
  const user = state.config.userTeamId;
  const recs = records(state);
  const out: NewsItem[] = [];

  for (const g of games) {
    const w = winner(g)!;
    const l = loser(g)!;
    // Playoff games go by seed; everything else by the AP rank going in.
    const seeds = g.kind === 'cfp' ? state.bracket?.seeds : undefined;
    const name = (id: string) => (seeds ? `#${seeds.indexOf(id) + 1} ${teamById(id).school}` : teamLabel(id, before));
    const wr = seeds ? seeds.indexOf(w) + 1 : rankIn(before, w);
    const lr = seeds ? seeds.indexOf(l) + 1 : rankIn(before, l);
    const label = g.name && g.kind !== 'conf' && g.kind !== 'nonconf' ? `${g.name}: ` : '';
    const upset = !!lr && (!wr || wr - lr >= UPSET_GAP);
    if (w === user || l === user) {
      out.push({
        week, kind: upset ? 'upset' : 'result', teams: [w, l],
        text: `${upset ? 'UPSET: ' : ''}${label}${name(w)} ${w === user ? 'beats' : 'tops'} ${name(l)} ${score(g)} (${teamById(user).abbr} ${recordText(recs.get(user)!)})`,
      });
    } else if (upset) {
      out.push({ week, kind: 'upset', teams: [w, l], text: `UPSET: ${label}${name(w)} stuns ${name(l)} ${score(g)}` });
    } else if (g.kind === 'champ' || g.kind === 'cfp' || (wr && lr)) {
      out.push({ week, kind: 'result', teams: [w, l], text: `${label}${name(w)} beats ${name(l)} ${score(g)}` });
    }
  }

  const perf = games.flatMap((g) => g.result!.box.players).map((p) => {
    const td = p.passTd + p.rushTd + p.recTd;
    const text =
      p.passYds >= 400 ? `${p.passYds} passing yards and ${p.passTd} TD` :
      p.rushYds >= 200 ? `${p.rushYds} rushing yards and ${p.rushTd} TD` :
      p.recYds >= 180 ? `${p.rec} catches for ${p.recYds} yards` :
      td >= 5 ? `${td} touchdowns` : '';
    return { p, text, size: p.passYds / 2 + p.rushYds + p.recYds + td * 40 };
  }).filter((x) => x.text).sort((a, b) => b.size - a.size).slice(0, MAX_PERFORMANCES);
  for (const { p, text } of perf) {
    out.push({ week, kind: 'performance', teams: [p.team], text: `${p.name} (${teamById(p.team).abbr}): ${text}` });
  }

  if (after && before && after.week === week && after.ranks[0] && after.ranks[0].team !== before.ranks[0]?.team) {
    out.push({ week, kind: 'poll', teams: [after.ranks[0].team], text: `${teamById(after.ranks[0].team).school} is the new No. 1 in the AP poll` });
  }

  if (state.phase === 'regular' && week >= CALENDAR.heismanWatchWeek) {
    const top = heismanRace(state, 3).finalists;
    if (top.length) {
      out.push({
        week, kind: 'heisman', teams: top.map((f) => f.team),
        text: `HEISMAN WATCH: ${top.map((f, i) => `${i + 1}. ${f.name} (${teamById(f.team).abbr})`).join('  ')}`,
      });
    }
  }
  return out;
}
