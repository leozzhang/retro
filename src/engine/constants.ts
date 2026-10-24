// World units are yards. x runs 0..120 along the field (0-10 = user's end zone,
// 110-120 = opponent end zone; the user always attacks toward +x). y runs 0..53.3
// across the field, 0 = far sideline (top of screen).
export const FIELD_LEN = 120;
export const FIELD_W = 160 / 3;
export const OWN_GOAL = 10;
export const OPP_GOAL = 110;
export const HASH_TOP = 20; // college hashes are 60ft (20yd) from each sideline
export const HASH_BOT = FIELD_W - 20;

// Internal render resolution (scaled up with pixelated filtering).
export const VIEW_W = 640;
export const VIEW_H = 360;

// Projection: horizontal yards are wider than vertical yards, giving the tilted
// Retro Bowl style top-down look. Height (z) lifts sprites up the screen.
export const PPY_X = 12;
export const PPY_Y = 5.2;
export const PPY_Z = 9;
export const FIELD_TOP_PX = 60;

export const STEP = 1 / 60;
