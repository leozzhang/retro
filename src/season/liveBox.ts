import type { Athlete } from '../data/athletes';
import { athleteName } from '../data/depth';
import type { Rng } from '../engine/math';
import type { DriveSim, SimPlay } from '../game/rules';
import type { SnapCredit } from './cast';
import { gamePlays, type Against } from './gamePlays';
import { blankTeamLine, creditSnaps, lineFor, type BoxSide } from './simGame';
import { newStory, type DriveCredit, type GameStory, type StoryDrive } from './story';
import type { BoxScore, GamePlay, PlayerLine } from './types';

/**
 * The box score and the story of a game played on the field. The user's snaps are credited as
 * they happen (whoever threw, caught or carried it, and the defender who picked it off or sacked
 * him); the CPU's simulated drives are cast and credited the way a simulated game's are
 * (`creditSnaps`, season/simGame.ts), so both teams' lines read like any other game's. The story
 * (season/story.ts) holds both teams' drives for the game page's plays (season/gamePlays.ts) and
 * the postgame highlights.
 */
export interface LiveBox {
  user: BoxSide;
  cpu: BoxSide;
  story: GameStory;
  /** The user's drive the next snap goes on, while the user has the ball. */
  open: StoryDrive | null;
  /** The user's snaps and kicks the CPU scored on. */
  against: Against;
}

/** What one of the user's snaps was, for the box score. NCAA: sacks are rushes. */
export interface UserSnap {
  kind: 'catch' | 'inc' | 'int' | 'run' | 'sack';
  qb?: Athlete;
  /** The receiver on a catch, the ball carrier on a run or sack. */
  who?: Athlete;
  /** The CPU defender who intercepted it or made the sack. */
  by?: Athlete;
  yds: number;
  td: boolean;
  /** The ball went over to the defense (an interception). */
  turnover?: boolean;
}

/** Where a snap of the user's falls in the game: the half (2+ in overtime, as in `StoryDrive`), its seconds left, and the score before it. */
export interface SnapAt {
  half: number;
  left: number;
  qSecs: number;
  score: Record<string, number>;
}

export interface LiveBoxInit {
  /** The game's home and away ids. */
  home: string;
  away: string;
  /** The simulated quarters' box score when the user took over partway, so those stats carry into the live part. */
  from?: { user: BoxScore['home']; cpu: BoxScore['home']; players: PlayerLine[] };
  /** And their drives. */
  story?: GameStory;
}

/** A fresh box for the user's and the CPU's starters. */
export function newLiveBox(user: { id: string; on: Record<string, Athlete> }, cpu: { id: string; on: Record<string, Athlete> }, cast: Rng, init: LiveBoxInit): LiveBox {
  const from = init.from;
  const side = (id: string, on: Record<string, Athlete>, tl = blankTeamLine()): BoxSide => ({
    id, on, cast, tl: { ...tl },
    lines: new Map((from?.players ?? []).filter((l) => l.team === id).map((l) => [l.id, { ...l }])),
  });
  const story = newStory(init.home, init.away);
  if (init.story) story.drives.push(...init.story.drives);
  return { user: side(user.id, user.on, from?.user), cpu: side(cpu.id, cpu.on, from?.cpu), story, open: null, against: new Map() };
}

export function creditUserSnap(box: LiveBox, s: UserSnap): void {
  const b = box.user;
  const tl = b.tl;
  tl.plays++;
  tl.yards += s.yds;
  if (s.turnover) tl.turnovers++;
  const q = s.qb ? lineFor(b, s.qb) : null;
  const w = s.who ? lineFor(b, s.who) : null;
  const by = s.by ? lineFor(box.cpu, s.by) : null;
  if (by && s.kind === 'sack') by.sk++;
  if (by && s.kind === 'int') by.defInt++;
  switch (s.kind) {
    case 'catch':
      tl.passYds += s.yds;
      if (q) {
        q.att++;
        q.cmp++;
        q.passYds += s.yds;
        if (s.td) q.passTd++;
      }
      if (w) {
        w.rec++;
        w.recYds += s.yds;
        if (s.td) w.recTd++;
      }
      break;
    case 'inc':
    case 'int':
      if (q) {
        q.att++;
        if (s.kind === 'int') q.int++;
      }
      break;
    case 'run':
    case 'sack':
      tl.rushYds += s.yds;
      if (w) {
        w.rush++;
        w.rushYds += s.yds;
        if (s.td) w.rushTd++;
      }
      break;
  }
}

/** A field goal try by the user's kicker. */
export function creditUserFg(box: LiveBox, k: Athlete | undefined, made: boolean): void {
  if (!k) return;
  const l = lineFor(box.user, k);
  l.fga++;
  if (made) l.fgm++;
}

/** One of the CPU's drives, played through the engine (the snaps from `engineCredit`), and told in the story. */
export function creditCpuDrive(box: LiveBox, d: DriveSim, plays: SimPlay[], snaps: DriveCredit['snaps'], told?: StoryDrive): void {
  creditSnaps(box.cpu, d, plays, snaps, box.user, true);
  if (told) storyCpuDrive(box, told);
}

/** A CPU drive (or overtime try) in the story: the user's drive before it is over. */
export function storyCpuDrive(box: LiveBox, d: StoryDrive): void {
  box.story.drives.push(d);
  box.open = null;
}

/** The SnapCredit a user's snap is told with: slots and names, as `castDrive`'s are. */
export function userCredit(s: UserSnap, slotOf: (a: Athlete) => string | undefined, pass: boolean): SnapCredit {
  const cred = (a: Athlete | undefined, yds: number) => {
    const slot = a && slotOf(a);
    return slot ? { slot, name: athleteName(a), yds } : undefined;
  };
  const who = cred(s.kind === 'catch' || s.kind === 'run' || s.kind === 'sack' ? s.who : undefined, s.yds);
  const by = cred(s.by, 0);
  return { kind: s.kind, pass, ...(who ? { who } : {}), ...(by ? { by } : {}) };
}

/**
 * One of the user's snaps (or kicks) in the story, on the user's open drive, or a new one when the
 * ball just came over, the half changed, or it's an overtime try (its own drive, as in `simGame`).
 * `p.t` is set here from `at`. Returns the drive.
 */
export function storyUserSnap(box: LiveBox, at: SnapAt, p: SimPlay, credit: SnapCredit | null, opts: { try?: boolean } = {}): StoryDrive {
  let d = box.open;
  if (!d || d.half !== at.half || opts.try || d.try) {
    d = {
      off: box.user.id, half: at.half, left: at.left, qSecs: at.qSecs, score: { ...at.score }, start: p.yard,
      result: 'PUNT', points: 0, plays: [], credit: { snaps: [] }, live: true, ...(opts.try ? { try: true } : {}),
    };
    box.story.drives.push(d);
    box.open = d;
  }
  p.t = Math.max(0, d.left - at.left);
  d.plays.push(p);
  d.credit.snaps.push(credit);
  return d;
}

/** Points the user scored on the open drive (a touchdown, its try, a field goal) and how the drive ended. */
export function storyUserPoints(box: LiveBox, pts: number, result?: StoryDrive['result']): void {
  const d = box.open;
  if (!d) return;
  d.points += pts;
  if (result) d.result = result;
}

/** The user's drive ended without points (a turnover, a punt, downs). */
export function storyUserEnd(box: LiveBox, result: StoryDrive['result']): void {
  if (box.open) box.open.result = result;
  box.open = null;
}

/** The CPU scored on one of the user's snaps or kicks (the play already in the story). */
export function storyAgainst(box: LiveBox, p: SimPlay, pts: number, kind: 'pick6' | 'returnTd' | 'safety'): void {
  box.against.set(p, { pts, kind });
  box.open = null;
}

/** The finished game's key plays, from its story. */
export function liveGamePlays(box: LiveBox): GamePlay[] {
  return gamePlays(box.story, { [box.user.id]: box.user.on, [box.cpu.id]: box.cpu.on }, box.against);
}

/** The finished box score, with the final points. */
export function finishLiveBox(box: LiveBox, userHome: boolean, home: number, away: number): BoxScore {
  const h = userHome ? box.user : box.cpu;
  const a = userHome ? box.cpu : box.user;
  return {
    home: { ...h.tl, points: home },
    away: { ...a.tl, points: away },
    players: [...h.lines.values(), ...a.lines.values()],
  };
}
