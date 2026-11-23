/**
 * Did this step's click land on something? Game arms it with the click's spot before a screen's
 * update; every hit test it runs (`inRect`, `inBox`, the screens' `...At` lookups, wrapped by
 * `tracked`) reports here, and the click sound plays only on a hit (game.ts `sounds`).
 * Display only: it never changes what a click does.
 */

let armed = false;
let hit = false;
let px = 0;
let py = 0;

export function armClick(x: number, y: number): void {
  armed = true;
  hit = false;
  px = x;
  py = y;
}

/** A hit test's answer: a box contains the point, an index >= 0, or something found. */
const found = (r: unknown): boolean => r !== undefined && r !== null && r !== false && !(typeof r === 'number' && r < 0);

/** Report a hit test at (x, y); passes its answer through. */
export function noteHit<T>(x: number, y: number, r: T): T {
  if (armed && x === px && y === py && found(r)) hit = true;
  return r;
}

/** Whether the armed click hit anything; disarms. */
export function takeClick(): boolean {
  const h = hit;
  armed = false;
  hit = false;
  return h;
}

/** A hit-test lookup that reports to `noteHit` when it's asked about the click's spot (any argument pair). */
export function tracked<A extends unknown[], R>(f: (...a: A) => R): (...a: A) => R {
  return (...a: A) => {
    const r = f(...a);
    if (armed && found(r)) {
      for (let i = 0; i + 1 < a.length; i++) if (a[i] === px && a[i + 1] === py) hit = true;
    }
    return r;
  };
}
