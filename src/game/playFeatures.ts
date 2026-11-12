import type { PlayDef, ReadType, RouteName, RunScheme } from '../data/plays';
import { ROUTES } from '../data/plays';
import { FAMILIES, type Family, type PlayConcept } from '../data/playTags';
import { FIELD_W } from '../engine/constants';
import { BACKFIELD_DX, personnelOf, resolvePlay } from './resolvePlay';

/**
 * A play's features, read off its data, never typed by hand: what the defense could see or learn about
 * it (docs/PLAYBOOKS.md). The hand tags (`PlayDef.tags`) sit next to these, and `src/playbook.test.ts`
 * holds each tag to them. The learning defense keys its context on the look (personnel and
 * formation, `lookOf`) and learns over `family` and `concept`; `featureVector` is the numeric form.
 */
export type Backfield = 'gun' | 'pistol' | 'under' | 'empty';

export interface PlayFeatures {
  id: string;
  family: Family;
  concept: PlayConcept;
  personnel: string;
  formation: string;
  backfield: Backfield;
  read: ReadType;
  /** Runs (and RPOs): the line's scheme. */
  run?: RunScheme;
  /** Runs: inside or outside, by scheme, read and the back's path. */
  runDir?: 'inside' | 'outside';
  pulls: number;
  /** Pass routes run (no blocks, run paths, leads or fakes). */
  routes: RouteName[];
  /** Deepest pass route, yards downfield. */
  maxDepth: number;
  /** Every pass route is 8 yd or shallower. */
  quick: boolean;
  /** A route goes 25+ yd. */
  deep: boolean;
  screen: boolean;
  pa: boolean;
  rpo: boolean;
  qbRun: boolean;
  /** The QB moves off his spot: a boot or a rollout. */
  boot: boolean;
  drop: number;
  /** Skill players who block or stay in to: 5 + this is the protection. */
  extraBlockers: number;
}

export const SCREEN_ROUTES = new Set<RouteName>(['smoke', 'tunnel', 'bubble', 'screen', 'slip']);
export const MAN_BEATERS = new Set<RouteName>(['slant', 'drag', 'cross']);
/** Routes that sit down in a zone's holes or split its defenders. */
export const ZONE_BEATERS = new Set<RouteName>(['hitch', 'curl', 'in', 'seam']);
export const OUTSIDE_PATHS = new Set<RouteName>(['toss', 'sweep', 'pitchPath', 'oz', 'stretch']);

const routeDepth = (r: RouteName) => Math.max(0, ...ROUTES[r].pts.map(([dn]) => dn));
const isPassRoute = (r: RouteName) => r !== 'block' && !ROUTES[r].run && !ROUTES[r].lead && r !== 'paFake';

const cache = new Map<PlayDef, PlayFeatures>();

export function playFeatures(p: PlayDef): PlayFeatures {
  const hit = cache.get(p);
  if (hit) return hit;
  const rp = resolvePlay(p, FIELD_W / 2, false);
  const all = Object.values(rp.routes).filter((r): r is RouteName => !!r);
  const routes = all.filter(isPassRoute);
  const maxDepth = routes.length ? Math.max(...routes.map(routeDepth)) : 0;
  const qb = p.formation.align.QB.dx;
  const backs = Object.entries(rp.align).filter(([s, a]) => s !== 'QB' && rp.cover[s as keyof typeof rp.cover] && a.dx <= BACKFIELD_DX);
  const backfield: Backfield = !backs.length ? 'empty' : qb <= -4.5 ? 'gun' : qb <= -3 ? 'pistol' : 'under';
  const isRun = p.kind === 'run' || p.read === 'rpo';
  const outside = p.scheme?.run === 'stretch' || p.scheme?.run === 'pin' || p.read === 'pitch' || p.read === 'option' || all.some((r) => OUTSIDE_PATHS.has(r));
  const blockers = Object.values(rp.routes).filter((r) => r === 'block' || r === 'paFake' || (r && ROUTES[r].delayBlock)).length;
  const f: PlayFeatures = {
    id: p.id,
    family: p.tags.family,
    concept: p.tags.concept,
    personnel: personnelOf(p.formation),
    formation: p.formation.name,
    backfield,
    read: p.read,
    run: isRun && p.block === 'run' ? p.scheme?.run ?? 'zone' : undefined,
    runDir: isRun && p.block === 'run' ? (outside ? 'outside' : 'inside') : undefined,
    pulls: p.scheme?.pulls?.length ?? 0,
    routes,
    maxDepth,
    quick: routes.length > 0 && maxDepth <= 8,
    deep: maxDepth >= 25,
    screen: !!p.screen || routes.some((r) => SCREEN_ROUTES.has(r)),
    pa: p.kind === 'pa' && p.read !== 'rpo',
    rpo: p.read === 'rpo',
    qbRun: !!p.qbRun,
    boot: !!p.dropY,
    drop: p.drop,
    extraBlockers: p.block === 'pass' ? blockers : 0,
  };
  cache.set(p, f);
  return f;
}

/** Scouting's traits (`season/scouting.ts`): what a play is good for, a view over its features. */
export type Trait = 'quick' | 'screen' | 'deep' | 'manBeater' | 'zoneBeater' | 'runInside' | 'runOutside' | 'pa' | 'rpo';

export function traitsOf(p: PlayDef): Set<Trait> {
  const f = playFeatures(p);
  const out = new Set<Trait>();
  if (p.kind === 'run') {
    out.add(f.runDir === 'outside' ? 'runOutside' : 'runInside');
    return out;
  }
  if (f.rpo) out.add('rpo');
  else if (p.kind === 'pa') out.add('pa');
  if (f.screen) out.add('screen');
  else if (f.quick) out.add('quick');
  if (f.deep) out.add('deep');
  if (f.routes.some((r) => MAN_BEATERS.has(r))) out.add('manBeater');
  if (f.routes.some((r) => ZONE_BEATERS.has(r))) out.add('zoneBeater');
  return out;
}

// ------------------------------------------------------------ the vector

const BACKFIELDS: Backfield[] = ['gun', 'pistol', 'under', 'empty'];
const PERSONNEL = ['10', '11', '12', '20', '21', '22'];
const READS: ReadType[] = ['none', 'handoff', 'pitch', 'zoneRead', 'option', 'rpo'];
const SCHEMES: RunScheme[] = ['zone', 'stretch', 'gap', 'trap', 'draw', 'pin'];

/** Names of `featureVector`'s entries, in order. Stable: the learning defense's input layout. */
export const FEATURE_KEYS: string[] = [
  ...FAMILIES.map((x) => `family:${x}`),
  ...PERSONNEL.map((x) => `pers:${x}`),
  ...BACKFIELDS.map((x) => `bf:${x}`),
  ...READS.map((x) => `read:${x}`),
  ...SCHEMES.map((x) => `run:${x}`),
  'runOutside', 'pulls', 'depth', 'quick', 'deep', 'screen', 'pa', 'rpo', 'qbRun', 'boot', 'drop', 'protect',
];

export function featureVector(p: PlayDef): number[] {
  const f = playFeatures(p);
  const hot = <T>(xs: readonly T[], v: T | undefined) => xs.map((x) => (x === v ? 1 : 0));
  return [
    ...hot(FAMILIES, f.family),
    ...hot(PERSONNEL, f.personnel),
    ...hot(BACKFIELDS, f.backfield),
    ...hot(READS, f.read),
    ...hot(SCHEMES, f.run),
    f.runDir === 'outside' ? 1 : 0,
    f.pulls / 2,
    Math.min(f.maxDepth, 40) / 40,
    +f.quick, +f.deep, +f.screen, +f.pa, +f.rpo, +f.qbRun, +f.boot,
    Math.max(0, f.drop) / 3,
    f.extraBlockers / 3,
  ];
}
