# Playbook system

A play is **formation + a concept on each side + backfield jobs + read + blocking scheme**. It's plain data in `src/data/plays.ts` and `src/data/concepts.ts`. `resolvePlay` (`src/game/resolvePlay.ts`) turns it into a slot-by-slot layout for one snap. `Play` and the play-card diagrams both build from that layout, so the two always agree.

## Slots vs. cast
- **`OFF_SLOTS`** are the 11 positions on the field: `QB RB X Z SL TE` and the five linemen. Defensive calls key their man assignments on these slots.
- **A formation can sub a depth player into a slot** with `sub`. The depth players are `OFF_EXTRA`: FB, TE2 and WR4. For example, I-Form puts the FB in the SL slot. The defense adjusts to that (see below).
- **Depth players are generated after everyone else,** so adding them didn't change any existing player's ratings.
- **Personnel is derived, not stored.** `personnelOf` counts the backs and tight ends in the cast and returns, for example, `11`, `12`, `21` or `10`.

## Defense vs. personnel
`matchDefense` (`src/game/matchups.ts`) sets the defense for each snap.
- **Package from personnel** (`packageFor` in `data/defenses.ts`):

  | Offense | Package | Sub |
  | --- | --- | --- |
  | 3+ backs and TEs (21, 12, 22) | base | SAM backer for the nickel |
  | 11, 20 | nickel | none |
  | 10 | dime | DIME back for the MIKE |

  `DEF_EXTRA` (SAM, DIME) are generated last, so no existing ratings changed.
- **Cover classes:** `resolvePlay` tags every skill slot by where it lines up. A side's #1 receiver is `wide`, other detached receivers are `slot`, attached ends are `inline`, and backs are `back`.
- **Matchups:** calls are still written against 11 personnel (CB1 on X, NB on SL, and so on).
  - A man defender keeps his called target if that player lines up where the call expects. So every 11-personnel play keeps its call exactly.
  - Otherwise he takes the nearest uncovered player of the class the call meant. If none is left, he works down his role's list: DBs go slot, wide, inline, back; safeties go slot, inline, back, wide; backers go back, inline, slot, wide.
  - Anyone with nobody left to cover plays the hole as a robber.
  - Result: in I-Form the SAM covers the FB. In Ace he takes TE2. In Empty the dime takes a slot receiver and the WILL follows the split-out back.

## Receiver numbering
- **Backs:** players lined up at `dx ≤ BACKFIELD_DX` (-2.5).
- **Receivers:** every other skill slot. They're split by side and numbered #1, #2, #3 from the sideline in. Numbering is measured at a mid-field ball.
- **Alignment modes:** `rel` is a fixed offset from the ball (line, inline TE, backs). `split` is for receivers: `y` is the split at a mid-field ball, and on a hash it scales with the width of that side, so splits squeeze into the boundary and spread to the field. Both scale evenly per side, so numbering holds on any hash. `alignY` in `resolvePlay.ts` turns either one into a world y.
- **The strong side** comes from `Formation.strong`, mirrored if the play flips.

## Concepts
- **A concept assigns routes by receiver number:** `smash` gives #1 a hitch and #2 a corner.
- **It covers as many receivers as the side has.** `verts` gives #3 a seam only in a 3x1 set.
- **Receivers no concept reaches, and backs with no `backs` job, block.**
- **`resolvePlay` throws** if a concept reaches nobody, or if `backs` names a slot that isn't in the backfield.

## Flip
- **Every play has a `flip` rule:**
  - `fixed`: never auto-mirror.
  - `field`: strong side to the wide side of the hash.
  - `boundary`: strong side to the short side.
- **Within 0.5 yd of the middle**, there's no field side, so `field` and `boundary` don't mirror.
- **The user's F toggle** on the play-call screen is XORed on top, and resets after the snap.
- **Mirroring:**
  - Every alignment's y becomes -y, and `dropY` changes sign.
  - Routes are defined relative to "inside", so they don't change.
  - A back lined up on the ball treats the strong side as inside, so run paths follow the TE.

## Reads and QB runs
- **`read`** says what the QB does after the snap: `none`, `handoff`, `pitch`, `zoneRead` or `rpo`.
- **`qbRun`** marks a designed QB carry. It turns off the handoff and leaves the play out of the RB run rows in `npm run balance`.
- **Code checks these fields, never a play id.**
- **What's wired up so far:** the harness auto-pitches on `pitch` and skips plays with `qbRun`. `zoneRead` is a real read (below). `rpo` is still only a tagged route.

## Zone read
- **The read key** is the outermost DL on the backside, away from the hole. Run blocking leaves him alone: no snap assignment, no `pickRunTarget`, and no engagement before the handoff or keep.
- **At the snap he picks one** (`KEY_CRASH`, 50/50):
  - crash: chase the back down the line
  - stay home: squeeze a little and keep outside leverage on the QB
- **The QB rides the mesh.** Handoff reach stretches to `MESH_REACH` (3.2 yd), so the give stays a handoff. Once the back is carried out of reach without a give (or never got there by `MESH_TIME`), the QB keeps it.
- **On a keep,** the QB runs for the alley `KEEP_WIDTH` outside wherever the key is, starting with half speed from the ride. The back carries out his fake and blocks.
- **A key who guessed wrong is late:** a crash against a keep, or staying home against a give, adds `KEY_FOOLED` to his reaction.
- **`keyCrashing()`** is the visible cue: the key moving inside, not just upfield. The harness reads it at 0.55 s: give unless he's crashing.

## Blocking schemes (optional)
- **`scheme.pulls`**: each pull names a player (`who`) and a `job`. When the play mirrors, `resolvePlay` swaps line slots (LG ↔ RG, LT ↔ RT), so the pull stays on the backside.
  - **Power** pulls the backside guard on a `lead`: the playside line takes the DL, and the guard wraps through the hole for a backer. A `kick` was tried; the guard arrives after the back, and it tested worse.
  - The puller is skipped in the snap-time run-block assignment.
  - He runs flat behind the line to the hole: 2.5 yd outside it for a `kick`, straight to it for a `lead`.
  - He then marks the nearest free defender: one outside the hole for a kick, or a backer for a lead. From there the normal run block takes over (`pullBlock` in `sim/ai.ts`).
- **`scheme.slide`**: `strong` or `weak`.
  - A back in protection takes the edge rusher away from the slide.
  - The linemen match the remaining rushers one gap toward the slide.
- **Plays without a scheme** use the original assignment code unchanged.
