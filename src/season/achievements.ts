import { athleteName, generatedAthlete } from '../data/depth';
import { anchorsOf, ROOMS, SLOT_FALLBACK, type Anchor, type SlotKind } from '../data/office';
import { teamById } from '../data/teams';
import { latestPoll, rankIn } from './polls';
import { baseRoster } from './world';
import type { DraftPick, OfficeItem, OfficeState, SeasonGame, SeasonState, TeamYear } from './types';

/**
 * The coach's office (docs/OFFICE.md): achievements as things on the wall. Each achievement has a
 * detector that runs at one point in the dynasty (after each week's games, at the end of the season,
 * after the draft) and returns the items it finds. An item's `key` makes finding it twice a no-op.
 * Display only: nothing in the sim reads the office, and finding items takes no randomness.
 */

export type OfficeHook = 'game' | 'season' | 'draft';

/** What an item's card says, from its saved data. */
export type Found = Omit<OfficeItem, 'id' | 'rev' | 'fresh'>;

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
  find: (s: SeasonState, week: number) => Found[];
}

const user = (s: SeasonState) => s.config.userTeamId;
const school = (id: string) => teamById(id).school;
const opp = (g: SeasonGame, id: string) => (g.home === id ? g.away : g.home);

/** The user's games played this week, with the score from his side. */
function userGames(s: SeasonState, week: number): { g: SeasonGame; us: number; them: number; vs: string }[] {
  const id = user(s);
  return s.games
    .filter((g) => g.week === week && g.result && (g.home === id || g.away === id))
    .map((g) => {
      const home = g.home === id;
      return { g, us: home ? g.result!.home : g.result!.away, them: home ? g.result!.away : g.result!.home, vs: opp(g, id) };
    });
}

/** AP rank going into the game (0 = unranked). */
const rankAt = (s: SeasonState, g: SeasonGame, team: string) => rankIn(latestPoll(s, 'ap', g.week), team);

/** The user's finished seasons as his school's coach. */
export function userYears(s: SeasonState): TeamYear[] {
  const id = user(s);
  return s.history.map((h) => h.teams?.[id]).filter((y): y is TeamYear => !!y && y.hc === 'YOU');
}

export const OFFICE = {
  /** Stop the Presses: an unranked team beating a ranked one by this much. */
  paperMargin: 30,
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'gameball',
    name: 'THE GAME BALL',
    hint: 'Everyone remembers the first one.',
    slot: 'desk',
    on: 'game',
    desc: (it) => ['Your first win.', `${it.data!.us}-${it.data!.them} over ${school(String(it.data!.vs))}.`],
    find: (s, week) => {
      if (s.office?.items.some((i) => i.id === 'gameball')) return [];
      const w = userGames(s, week).find((x) => x.us > x.them);
      return w ? [{ key: 'gameball', year: s.year, week, game: w.g.id, team: user(s), data: { us: w.us, them: w.them, vs: w.vs } }] : [];
    },
  },
  {
    id: 'conf',
    name: 'CONFERENCE TROPHY',
    hint: 'Win your league.',
    slot: 'case',
    on: 'game',
    desc: (it) => [`${it.data!.conf} champions.`, `${it.data!.us}-${it.data!.them} over ${school(String(it.data!.vs))} in the title game.`],
    find: (s, week) =>
      userGames(s, week)
        .filter((x) => x.g.kind === 'champ' && x.us > x.them)
        .map((x) => ({
          key: `conf:${s.year}`, year: s.year, week, game: x.g.id, team: user(s),
          data: { conf: teamById(user(s)).conference.toUpperCase(), us: x.us, them: x.them, vs: x.vs },
        })),
  },
  {
    id: 'paper',
    name: 'STOP THE PRESSES',
    hint: 'Some upsets make the front page.',
    slot: 'wall-lg',
    on: 'game',
    desc: (it) => [String(it.data!.head), `Final: ${it.data!.us}-${it.data!.them}.`],
    find: (s, week) =>
      userGames(s, week)
        .filter((x) => x.us - x.them >= OFFICE.paperMargin && !rankAt(s, x.g, user(s)) && rankAt(s, x.g, x.vs))
        .map((x) => {
          const me = teamById(user(s));
          const r = rankAt(s, x.g, x.vs);
          const verb = x.us - x.them >= 40 ? 'BURY' : 'ROUT';
          return {
            key: `paper:${s.year}:${x.g.id}`, year: s.year, week, game: x.g.id, team: user(s),
            data: { head: `UNRANKED ${me.mascot.toUpperCase()} ${verb} NO. ${r} ${school(x.vs).toUpperCase()}`, us: x.us, them: x.them, vs: x.vs, rank: r },
          };
        }),
  },
  {
    id: 'jersey',
    name: 'RING OF HONOR',
    hint: 'Send one to the league in the first round.',
    slot: 'jersey',
    on: 'draft',
    desc: (it) => [`${it.data!.name}, ${it.data!.pos} #${it.data!.num}.`, `No. ${it.data!.pick} pick, to ${it.data!.city}.`],
    order: (it) => Number(it.data!.pick),
    find: (s) => {
      const draft = s.history.find((h) => h.year === s.year)?.draft ?? [];
      return draft.filter((p) => p.team === user(s) && p.round === 1).map((p) => jerseyItem(s, p));
    },
  },
];

function jerseyItem(s: SeasonState, p: DraftPick): Found {
  const num = s.teamState[p.team]?.roster?.in?.find((e) => e.id === p.id)?.num ?? generatedAthlete(p.id)?.num ?? 0;
  return { key: `jersey:${p.id}`, year: s.year, team: p.team, data: { name: p.name, pos: p.pos, num, pick: p.pick, city: p.city } };
}

export const achievement = (id: string): AchievementDef | undefined => ACHIEVEMENTS.find((a) => a.id === id);

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
 * Run one hook's detectors. New items go in fresh; a better room is noted for the page. Returns the
 * items added.
 */
export function checkOffice(s: SeasonState, on: OfficeHook, week = s.week): OfficeItem[] {
  const o = (s.office ??= newOffice());
  const have = new Set(o.items.map((i) => i.key));
  const added: OfficeItem[] = [];
  for (const a of ACHIEVEMENTS) {
    if (a.on !== on) continue;
    for (const f of a.find(s, week)) {
      if (have.has(f.key)) continue;
      have.add(f.key);
      const it: OfficeItem = { id: a.id, ...f, rev: ++o.rev, fresh: 1 };
      o.items.push(it);
      added.push(it);
    }
  }
  return added;
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

/**
 * Dev: a full office to look at (the showroom on the office page): every achievement a few times
 * over, with names from the user's roster. Never saved.
 */
export function sampleOffice(s: SeasonState): OfficeItem[] {
  const team = user(s);
  const roster = baseRoster(s, team);
  const foes = ['auburn', 'florida', 'tennessee', 'lsu', 'alabama', 'texas'].filter((t) => t !== team);
  const out: OfficeItem[] = [];
  const add = (id: string, n: number, make: (i: number) => Found['data']) => {
    for (let i = 0; i < n; i++) out.push({ id, key: `show:${id}:${i}`, year: s.year - n + i + 1, team, data: make(i), rev: out.length + 1, fresh: i === n - 1 ? 1 : undefined });
  };
  add('gameball', 1, () => ({ us: 31, them: 17, vs: foes[0] }));
  add('conf', 9, (i) => ({ conf: teamById(team).conference.toUpperCase(), us: 30 + i, them: 20, vs: foes[i % foes.length] }));
  add('paper', 3, (i) => ({ head: `UNRANKED ${teamById(team).mascot.toUpperCase()} ROUT NO. ${4 + i} ${school(foes[i]).toUpperCase()}`, us: 45 + i * 6, them: 10, vs: foes[i], rank: 4 + i }));
  add('jersey', 8, (i) => {
    const a = roster[(i * 7) % roster.length];
    return { name: athleteName(a), pos: a.pos, num: a.num, pick: 3 + i * 4, city: 'DALLAS' };
  });
  for (const it of out) if (!it.fresh) delete it.fresh;
  return out;
}
