# Playbook system

A play is **formation + a concept on each side + backfield jobs + read + blocking scheme**. It's plain data in `src/data/plays.ts` and `src/data/concepts.ts`. `resolvePlay` (`src/game/resolvePlay.ts`) turns it into a slot-by-slot layout for one snap. `Play` and the play-card diagrams both build from that layout, so the two always agree.

## Slots vs. cast
- **`OFF_SLOTS`** are the 11 positions on the field: `QB RB X Z SL TE` and the five linemen. Defensive calls key their man assignments on these slots.
- **A formation can sub a depth player into a slot** with `sub`. The depth players are `OFF_EXTRA`: FB, TE2 and WR4. For example, I-Form puts the FB in the SL slot, so the nickel in man coverage follows the FB. That's a Phase 2 item: the defense doesn't adjust to personnel yet.
- **Depth players are generated after everyone else,** so adding them didn't change any existing player's ratings.
- **Personnel is derived, not stored.** `personnelOf` counts the backs and tight ends in the cast and returns, for example, `11`, `12`, `21` or `10`.

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
- **What's wired up so far:** the harness auto-pitches on `pitch` and skips plays with `qbRun`.

## Blocking schemes (optional)
- **`scheme.pulls`**: each pull names a player (`who`) and a `job`.
  - The puller is skipped in the snap-time run-block assignment.
  - He runs flat behind the line to the hole: 2.5 yd outside it for a `kick`, straight to it for a `lead`.
  - He then marks the nearest free defender: one outside the hole for a kick, or a backer for a lead. From there the normal run block takes over (`pullBlock` in `sim/ai.ts`).
- **`scheme.slide`**: `strong` or `weak`.
  - A back in protection takes the edge rusher away from the slide.
  - The linemen match the remaining rushers one gap toward the slide.
- **Plays without a scheme** use the original assignment code unchanged.
