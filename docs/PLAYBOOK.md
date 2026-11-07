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
- **What's wired up so far:** `zoneRead` and `option` are real reads, and the harness plays both. `qbRun` plays are run-phase carries the harness also runs. `rpo` is still only a tagged route; the harness measures the give.

## Zone read (backside key)
- **The read key** is the outermost DL on the backside, away from the hole. Run blocking leaves him alone: no snap assignment, no `pickRunTarget`, and no engagement before the handoff or keep.
- **At the snap he picks one** (`KEY_CRASH`, 50/50):
  - crash: chase the back down the line
  - stay home: squeeze a little and keep outside leverage on the QB
- **The QB rides the mesh.** Handoff reach stretches to `MESH_REACH` (3.2 yd), so the give stays a handoff. Once the back is carried out of reach without a give (or never got there by `MESH_TIME`), the QB keeps it.
- **On a keep,** the QB runs for the alley `KEEP_WIDTH` outside wherever the key is, starting with half speed from the ride. The back carries out his fake and blocks.
- **A key who guessed wrong is late:** a crash against a keep, or staying home against a give, adds `KEY_FOOLED` to his reaction.
- **`keyCrashing()`** is the visible cue: the key moving inside, not just upfield. The harness reads it at 0.55 s: give unless he's crashing.

## Run blocking (`src/sim/runBlocking.ts`)
`scheme.run` picks the line's rules. The default is `zone`. The assignment is made at the snap, relative to the play side (the hole against the ball):

| Scheme | Line rules | Used by |
| --- | --- | --- |
| `zone` | Take the man over you or in your playside gap. An uncovered lineman doubles a neighbour's man (playside first; each covered blocker takes one helper) and climbs to a backer at `COMBO_CLIMB` or as soon as the backer declares. The last uncovered lineman cuts off the backside end. | IZ, Split Zone, Zone Read, RPOs |
| `stretch` | Zone, but the reach blocks give up `REACH_PENALTY`, and combos climb early. | OZ, Toss, I-Form Stretch, Speed Option, Pin-Pull |
| `gap` | Block down (the man over you or in your inside gap), doubles at the point of attack. With a puller, the backside tackle **hinges** to the puller's gap, takes whoever comes through, and works up after `HINGE_HOLD`. Down linemen far backside are left to chase. | Power, Power O, Counter, Duo, Iso, QB Power, Power Read |
| `trap` | Gap, but the first lineman playside of the center is left for the pulling guard (`pullTarget`). | Trap |
| `draw` | Pass pro for `DRAW_SET`, then run blocking. The second level reads it late. | Draw, Empty QB Draw |

**Engagements on runs** (`runEngagement`):
- **The roll:** each block rolls its outcome at contact (`blockRoll`, `BLOCK_ROLL_SD`) on top of the ratings, `RUN_BLOCK_EDGE` and the double-team bonus.
- **Winning block:** drives the defender back and **washes** him away from the hole (`WASH_RATE`).
- **Losing block:** the defender works around it toward the ball and the pile moves back.
- **Leverage:** the blocker stays on the side he got (`blockDir`).
  - If he's between his man and the ball carrier (`LEVERAGE_DOT`), the defender's fight to get off the block slows (`RUN_CONTROL.nearLevered`) and his arm tackle is weaker (`ARM_LEVERED`). A block is a gradient: `Player.blockControl` wears from 1 toward 0 while he's winning, and his arm tackle grows as it does (`RUN_CONTROL`).
  - A back who runs past a defender's free shoulder lets him off the block fast.
- **Getting on the block:** assigned blockers engage their man from `RUN_ENGAGE`, lead their man's movement, and wall him off from the carrier after the handoff.
- **Assignments hold** through the whole run.

**Pulls** (`scheme.pulls`):
- **Mirroring:** pulls mirror with the play (LG ↔ RG).
- **The path:** a puller runs tight behind the line, `PULL_TURN` short of the hole, and doesn't stop to block on the way.
- **The pickup:** he takes the man nearest the hole. For a `kick` that's the first man outside it; for a `lead` it's a backer.

**Lead blockers** (`RouteDef.lead`: `lead`, `kickOut`, `leadWide`, `slice`, `qbLead`):
- **On a run:** a back or TE on one of these routes is a blocker from the snap. He runs the path and takes the first unclaimed defender within `LEAD_PICKUP`.
- **Split Zone:** the Pistol TE slices back across (the `slice` concept) to kick out the backside end.

**Defense:**
- Backers fit at `LB_FIT_DEPTH`.
- Defenders in the box slow down through traffic (`TRASH_*`).
- A man defender on a back still behind the line holds at `MAN_DEPTH`.
- Scrimmage pursuers lead the carrier by up to `PURSUIT_LEAD`; kick coverage keeps the old 1.2 s.

## Passing additions
- **Delayed routes** (`RouteDef.delay`, `delayBlock`): the back sells pass (staying within `DELAY_SET_RANGE` of his spot), then runs `checkFlat`, `screen` or the draw path.
- **Screens** (`PlayDef.screen`): the line pass-sets for `SCREEN_SET`, lets its rushers go, then releases to block for the `screenTarget`. The screen target is whoever runs `smoke`, `tunnel`, `screen` or `bubble`.
- **Stalk blockers:** a receiver split wider than `STALK_SPLIT` who blocks stalks a DB. His man defender plays him instead of hug-rushing, and he stays out of the protection pool.

## Power read, option and QB runs
- **Zone read** (`read: 'zoneRead'`): see the zone read section above.
  - **`key: 'play'`** reads the playside end instead of the backside one.
  - **`keep: 'inside'`** has the QB keep it inside the key, behind the pulling guard (Power Read).
  - **`keyCrashing()`** asks whether the key is running at the back rather than the QB, so it works for either key.
- **Option** (`read: 'option'`, Speed Option):
  - **The key:** the playside end is left unblocked. At the snap he either takes the QB or widens along the line with the pitch man (`keyCrash`).
  - **The QB** attacks along `drop` and `dropY`, and the back runs `pitchPath`.
  - **The pitch** is the usual right-click pitch.
  - **The keep:** reaching the line without pitching is a keep, inside the key (`OPTION_CUT`).
- **Designed QB runs** (`qbRun`):
  - **Run phase:** once the QB has the snap the play is a run, after `QB_RUN_WAIT` for gap and draw schemes.
  - **The hole:** comes from `qbPath`.

## Call screen
- **Formation chips:** under the PASS / RUN / PLAY ACTION tabs: ALL, then each formation that tab uses.
  - Switch with A/D, the mouse wheel, or a click.
  - The default is the first formation, and the chip is remembered per tab.
- **Grid:** cards are 3×3, so 9 per page, and W/S pages.
- **Diagrams:** each card zooms to its play's spread, so a tight run reads as well as a four-wide pass. Pull paths are dotted.

## Flip rules in the book
- `field`: trips, empty, screens and perimeter runs
- `boundary`: downhill gap runs (Power O, Counter, Duo, Iso) and boots, so the boot goes back to the field
- `fixed`: balanced 2x2 shells and the 18 legacy plays
