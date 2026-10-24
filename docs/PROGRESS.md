# Progress

_Last updated: 2026-10-24_

## Done: gameplay MVP
- **Project setup:** Vite and TypeScript scaffold, fixed-timestep loop, 640×360 internal canvas scaled up with pixelated rendering.
- **Field:** grass stripes, yard lines, college hash marks, numbers, end zones in team colors, midfield logo, crowd. The camera scrolls horizontally in Retro Bowl style.
- **Sprites:** procedural pixel-art players with team uniforms (home and away). Poses: stand, three-point stance, 4-frame run, throw, catch, down.
- **Teams:** 8 FBS teams (UGA, BAMA, OSU, TEX, ORE, MICH, ND, CLEM) with real colors and conferences. Off/def ratings are rough estimates. Rosters are generated and seeded per team, scaled by team strength.
- **Playbook:** 6 plays from 2 shotgun formations (Four Verts, Slant Flat, Smash, Mesh, Dagger, Curl Flat). The play-call screen shows a route diagram for each.
- **Defensive calls:** 2 Man Under, Cover 1 Robber and Cover 0 Blitz, each with a distinct pre-snap look. Corners press at random. There's a pre-snap coverage read hint, and Esc lets you audible.
- **Passing:** slingshot drag-and-release with an arc preview and slow motion while aiming. Throw error depends on distance, the QB's accuracy, pressure and movement.
- **AI:**
  - receivers run routes
  - man coverage uses a reaction lag based on awareness, with off-coverage backpedal and press jams
  - deep halves, deep middle and robber zones
  - O-line versus D-line engagements, with shed chances that ramp up over time
  - backs pick up blitzers
  - pursuit uses intercept angles
  - teammates block downfield after the catch
- **Catch resolution:** catch, drop, pass breakup or interception. Receivers and defenders time their run to arrive with the ball.
- **Running:** user-controlled carrier, sprint with stamina, juke, broken tackles, sacks, scrambles, out of bounds, interception returns and pick sixes.
- **Rules:** down and distance, first downs, touchdown (+7), safety, turnover on downs. The CPU's possessions are simulated by `simulateDrive`.
- **Tooling:** 28 unit tests, a balance harness (`npm run balance`), an F1 debug overlay, and a `window.game` dev hook.

## Done: clock, game end, run game (2026-10-23)
- **Game clock and play clock** (`game/clock.ts`). Clocks show real football time (15:00 quarters, 40/25 s play clock).
  - Quarter length is selectable on the title screen (3/5/8/15 min, Q/E). Shorter settings speed up only the between-play time; live plays always run 1:1.
  - NCAA stoppage rules: an incompletion stops the clock until the snap. Out of bounds and first downs stop it only inside 2:00 of a half; otherwise out of bounds restarts on the ready-for-play and first downs don't stop it.
  - The play clock runs on the call screen and pre-snap, so audibles cost time. If it expires, it's **delay of game**: 5 yards (half the distance inside the 10), replay the down.
- **Quarters, halftime, final.** At halftime the CPU gets the second-half kickoff. The final screen allows ties (no OT yet).
  - CPU drives burn game clock: about 32 s per play, about 7 s on clock-stopping plays, faster when trailing late and slower when milking a Q4 lead. A drive ends at the half.
  - Notices queue up with a scorebug snapshot.
- **Run game.**
  - **Right-click (or F)** hands off to the RB whenever he's behind the line and not blocking, on any play. Within 1.8 yd it's a handoff (99% clean); up to 8 yd it's a pitch or shovel (`pitchOdds`). Misses are a `fumble` outcome, recovered by the offense.
  - Run plays use run blocking: DL go to the nearest OL, uncovered OL climb to LBs, TE and WRs stalk DBs. `RUN_BLOCK_EDGE`.
  - The second level reads run blocking and fits its gap (`runFit`). Defenders near the ball shed blocks and make arm tackles (`ARM_TACKLE`).
- **Play action.** The RB's fake path meets the QB's drop point. LBs and safeties bite for a beat (`sellFake`), then the RB stays in to block his own man, whose defender then sits underneath instead of hug-rushing (`lateBlock`).
- **Playbook tabs:** PASS / RUN / PLAY ACTION, 6 plays each. New Pistol and Singleback formations.
  - RUN: Inside Zone, Outside Zone, Power, Toss, Zone Read, QB Sneak.
  - PLAY ACTION: PA Post, PA Boot Flood, PA Crossers, PA Seams, RPO Slant, RPO Bubble.
- **Protection fix:** blockers with an assignment no longer grab whoever they bump into on the way.
- **Sack fix:** a QB tackled past the LOS on a scramble, or on a designed run, is no longer scored as a sack.

## Done: special teams (2026-10-23)
- **SPECIAL playbook tab:** Field Goal, Punt, Pooch Punt, Coffin Corner, Line Drive.
  - Each card shows a side-on sketch of the kick's flight.
  - The FG card shows the attempt distance and flags anything over 55.
- **Kick controls (all kicks):**
  - The card sets the kick type: default loft, loft range, and bounce profile.
  - Drag back like a pass. Drag length sets power and drag angle sets direction.
  - W/S or the mouse wheel tilts the loft within the type's range.
  - The preview arc shows the landing spot, an accuracy ellipse from the kicker's `kac`, hang time and roll. **Wind is not in the preview.**
- **FG / XP:**
  - Aim before the snap. The release snaps it, the holder places it, and the kicker steps in and kicks.
  - Only the first 45% of the arc is previewed, Retro Bowl style.
  - A **goal cam** inset (from behind the kicker) shows the ball going through, wide, short, or off the upright ("DOINK!", with a 30% chance it bounces in).
  - Small rating-based block chance.
- **Punt:** snap first, then aim while the rush comes. The game is in slow motion while aiming, and a get-off bar sits under the punter. A rusher who reaches the punter blocks it.
- **Kickoff:** happens after every user score and to start the second half. Types: Deep, Sky, Squib, Corner. The kicker's run-up and the coverage lanes are timed to the kick line.
- **PAT:** a TD is now worth 6, then you choose:
  - EXTRA POINT: a 20-yard kick.
  - 2-PT TRY: the normal playbook from the 3 (Esc goes back).
  - Tries are untimed and happen even at 0:00. A defensive return of a try scores 2.
- **Wind:**
  - Set per game: 0-15 mph from a random direction.
  - Each quarter it drifts a little and flips along the field, because teams switch ends.
  - The HUD shows the speed and HEAD, TAIL or CROSS.
  - Drag is computed relative to the air, so wind carries the ball sideways and adds or cuts distance.
- **Special-teams AI** (`game/kickPlay.ts`):
  - **Coverage:** lanes with contain, gunners, a punt shield, and the punter or kicker playing safety. Trailing pursuers can make diving tackles.
  - **Returner:** reads the kick, picks a running lane, and decides between fielding it, a fair catch, or letting it go.
    - Fair catch when coverage is close; on kickoffs only inside the 25.
    - Lets punts go inside the 10.
  - **Loose balls:** muffs (the coverage can recover them), and coverage downs rolling punts.
  - **Return blocking:** the wall assigns one blocker per cover man, and blocks away from the ball peel off.
- **NCAA rules** (`applyKick`):
  - Kickoff touchback at the 25.
  - Kickoff fair catch inside the 25 comes out to the 25.
  - Kickoff out of bounds at the 35.
  - Punt touchback at the 20.
  - Missed FG: previous LOS, or the 20 if that's closer to the CPU's goal.
  - Return TD: CPU +7, then the user receives at the 25.
- **Clock:** FGs and punts run the clock from the snap. Kickoffs start it when the receivers touch the ball. Every kick ends with the clock stopped.
- **Roster:** K and P slots (`ST_SLOTS`) with `kpw` (leg) and `kac` (accuracy) ratings. They're generated after everyone else, so other players' ratings, and the scrimmage balance rows, are unchanged.
- **New art:**
  - Goal posts on both end lines, drawn slightly skewed so the uprights stay readable in this projection.
  - Kick, hold, punt drop, and fair catch poses.
  - End-over-end ball frames and a kicking tee.
- **Tests:** 15 new unit tests covering kick physics, FG judging, kick spots, and tries. The balance harness now has punt, kickoff and FG rows.

## Done: playbook system, Phase 1 (2026-10-23)
A pure refactor: all 18 plays behave as before, and `npm run balance` came out byte-identical. Design notes are in [PLAYBOOK.md](PLAYBOOK.md).
- **Explicit play fields replace id checks:** `read` (`none`, `handoff`, `pitch`, `zoneRead`, `rpo`), `qbRun`, and `flip`. The balance harness now uses `read === 'pitch'` and `!qbRun` instead of checking for the `toss` and `qb-sneak` ids.
- **Concept layer** (`data/concepts.ts`): plays name a concept for the strong side and one for the weak side. Concepts assign routes by receiver number (#1–#3 from the sideline in). Backs get `backs` jobs. Anything left unassigned blocks.
- **`resolvePlay`** (`game/resolvePlay.ts`) lays a play out for the snap. `Play` and the play-card diagrams both use it.
- **Flip:** each play has a rule: `fixed`, `field` or `boundary`. **F** on the play-call screen mirrors the next play; the cards redraw mirrored, and the toggle resets after the snap. All 18 plays are `fixed` for now.
- **Personnel:**
  - New depth players FB, TE2 and WR4 (`OFF_EXTRA`). The FB uses the RB role with a blocking-back archetype.
  - A formation can sub a depth player into a slot with `sub`.
  - New formations, not used by any play yet: **I-Form** (21), **Ace** (12) and **Gun Empty** (10). Cards show the personnel number.
- **Blocking schemes** (optional, not used by any play yet): `scheme.pulls` (kick-out or lead pullers, `pullBlock` in `sim/ai.ts`) and `scheme.slide` (the line slides and the back takes the backside edge).
- **Tests:** 7 new tests in `describe('playbook')`.
  - The migrated plays must match the old route maps exactly.
  - Bad concepts and bad backfield jobs throw.
  - Mirroring and the flip rules.
  - A mirrored snap.
  - Personnel formations and the depth players.
  - A pull and a slide.

## Done: NFL tracking analysis (2026-10-23)
These are Python scripts in `analysis/` that read the Big Data Bowl 2027 data. No game code changed. The full findings and the data's limits are in [analysis/README.md](../analysis/README.md).
- **Route geometry:** about 53k NFL routes. Break depth and angle are derived from tracking, and `compare_game.py` checks them against our `ROUTES`.
- **What's off:**
  - Our out is a deep out at 10 yd; the NFL's most common out breaks at about 5.5 yd.
  - Our dig and drag run flat across, while NFL ones climb.
  - Go routes drift toward the numbers in the NFL; ours run straight.
  - Our WRs are at 6 yd from the sideline, against NFL ~12; our slots at 14, against NFL 18–20. OL and TE splits are about 25% tight.
- **Playbook data:** route mix by formation and situation, same-side route pairs (GO/OUT, double hitch, GO/POST, IN/CROSS lead), and completion % and yards per target by route and coverage.

## Done: NFL routes and splits applied (2026-10-23)
- **Routes** (`ROUTES` in `data/plays.ts`). `compare_game.py` now has go, quick out, dig and drag inside the NFL middle 50%.

  | Route | Change |
  | --- | --- |
  | `quickOut` (new) | Breaks at 5.5 yd and leaves at -65°, then flattens. No play uses it yet. |
  | `deepOut` | The old `out`, renamed. PA Boot Flood keeps it, because its flood needs three levels and a quick out would sit level with the drag. |
  | Dig (`in`) | Climbs at 60° off the 12-yd break, then flattens. |
  | Drag | Climbs at 73° to 5–6 yd, then flattens. |
  | Go | Drifts 15° outside over the first 18 yd, then runs nearly straight. |

- **Splits:** a new `split` align mode replaces `abs` for receivers. `y` is the split at a mid-field ball, scaled by the width of that side of the field, so receivers squeeze into the boundary and spread to the field.

  | Player | Mid ball | Boundary | Field |
  | --- | --- | --- | --- |
  | Outside WR | 11 from the sideline | 8.2 from the sideline | 13.7 from the sideline |
  | 2x2 slot | 8 from the ball | 6 from the ball | 10 from the ball |

  Trips #2 is at 9.5, and Empty's inside receivers at 6.5 and 11. `alignY` in `resolvePlay.ts` is the one place that turns an alignment into a world y.
- **Line:** G 1.5, T 3, inline TE 4.8 (NFL 1.55 / 3.1 / 4.9).
  - DL alignments moved with the line: DE ±4.5, DT -1.25 / +1.5.
  - The IZ and Power paths moved outward to keep hitting the same gaps.
- **Balance harness:** new `PLAY` rows at the end, one per pass and PA play per defense at 1.2 s and 2.2 s, with their own seed. Before/after notes:
  - **Runs got harder:** 5.5 → 4.5 YPC, 31% → 38% stuffs. Testing with the old line put IZ back near the baseline, so the wider line is the cause, not the receiver splits. Shifting the IZ path recovered most of it.
  - **Mesh:** the climbing drags now reach LB depth, so the auto-QB throws the RB swing instead. YPP at 1.2 s fell from 27 to 2.
  - **PA Boot Flood:** at 2.2 s, completions dropped from 92–94% to 65–71%, for the same reason.
  - **Dagger and Curl Flat (vs Cover 1, 2.2 s):** these collapsed to 0–10%, but that's a harness artifact. The auto-QB targets the flat runner and leads him out of bounds ("Out of bounds" / "Nobody home" on nearly every rep).
  - **Slant Flat at 1.2 s:** jumped from 21–36% to 74–77%, the same artifact in reverse. The slot now starts 18.6 from the sideline instead of 14, so his flat stays in bounds.

## Done: playbook system, Phase 2 prerequisites (2026-10-24)
Design notes are in [PLAYBOOK.md](PLAYBOOK.md).
- **Defense vs. personnel** (`game/matchups.ts`):
  - The package follows the offense's personnel: base (SAM for the nickel) against 21/12, nickel against 11, dime (DIME for the MIKE) against 10. The new depth defenders `DEF_EXTRA` are generated last, so existing ratings are unchanged.
  - Man assignments are matched to where players line up (`cover` classes from `resolvePlay`), not to slot names. In I-Form the SAM takes the FB. No DB covers a back in any formation, and five-man calls cover every eligible.
  - All 11-personnel plays keep their calls exactly, so every pass, PA, per-play and kick row in `balance.txt` came out byte-identical.
  - The HUD shows the package next to the call, for example `DEF: 2 Man Under (BASE)`.
  - Small fixes: off-ball DBs use the 4.5-yd cushion regardless of slot, and any non-DL blitzer walks up (a dime back blitzing in Cover 0, for example).
- **Zone Read is a real read:**
  - The backside end is left unblocked and either crashes on the back or stays home (50/50 at the snap).
  - The QB rides the mesh (handoff reach 3.2 yd). If he doesn't give, he keeps automatically when the back clears the mesh, and runs for the alley outside the key.
  - A key who guessed wrong reacts late (`KEY_FOOLED`).
  - The harness auto-QB reads the key at 0.55 s (`keyCrashing()`), and its keeps now count as runs (`keep N` on the row).
- **Power pulls the backside guard** on a `lead`, using the existing pull scheme. Pulls now mirror with the play (LG ↔ RG).
- **Tests:** 9 new ones covering packages, cover classes, unchanged 11-personnel calls, no DB on a back, mirrored pulls, the zone-read key, crash vs. home, the auto keep, and the fooled key.
- **Balance, before → after (60 reps per row):**

  | Run, defense | YPC | Stuffs |
  | --- | --- | --- |
  | Power, 2 Man | 7.2 → 7.0 | 47% → 43% |
  | Power, Cover 1 | 3.9 → 2.3 | 40% → 40% |
  | Power, Cover 0 | 3.1 → 1.0 | 43% → 37% |
  | Zone Read, 2 Man | 4.1 → 2.9 | 25% → 22% |
  | Zone Read, Cover 1 | 11.3 → 1.2 | 23% → 25% |
  | Zone Read, Cover 0 | 0.5 → 1.2 | 77% → 30% |
  | All runs | 4.5 → 3.8 (median 1.6 → 1.1) | 38% → 33% |

  - **Power:** a 300-rep side test (no pull / lead / kick) gave 5.7 / 5.4 / 4.6 YPC against 2 Man, 4.2 / 3.7 / 3.4 against Cover 1, and 4.0 / 1.7 / 1.8 against Cover 0. The pull trims stuffs but loses the long runs. It hurts most against Cover 0, where the guard leaves and nobody picks up the backside blitzer. A kick-out guard arrives after the back, even with the end left for him.
  - **Zone Read:** the auto-QB reads the key perfectly. Gives net about 6.1 / 3.0 / 3.5 YPC. Keeps net only 0.3 / -0.3 / -0.7: the auto-runner QB starts 5 yd deep and the alley defender (the NB or CB1 in man, the robber in Cover 1) gets him near the line. A keep against a home key loses about 2.3. The old 11.3 against Cover 1 was a handful of long IZ runs in 60 reps.
  - **Toss** moved (2 Man 5.7 → 11.0, Cover 0 0.7 → -1.3) only because Power now uses the shared RNG differently. Nothing about Toss changed; the rows are just noisy at 60 reps.

## Done: run blocking and a 62-play playbook (2026-10-24)
Design notes are in [PLAYBOOK.md](PLAYBOOK.md).

### Run blocking (`sim/runBlocking.ts`)
Runs into the middle used to die in the DL. Four things caused it:
- An engaged block moved toward the ball carrier.
- Every blocked defender shed as soon as the back got within 2.2 yd.
- Linemen took the nearest DL with no scheme.
- After the handoff, every blocker dropped his assignment for the nearest defender.

The new model:
- **Schemes (`scheme.run`):**
  - `zone`: covered and playside-gap rules. Uncovered linemen double, then climb to the backer when he declares (`COMBO_CLIMB`), with a cut-off on the backside end.
  - `stretch`: the same rules, but reach blocks give up `REACH_PENALTY` of their edge.
  - `gap`: down blocks. The backside tackle hinges for the pulled guard and then works up after `HINGE_HOLD`. Down linemen far backside are left to chase.
  - `trap`: the first lineman playside of the center is left for the pulling guard.
  - `draw`: the line pass-sets for `DRAW_SET`, then run-blocks.
- **Engagements:**
  - Each run block rolls its outcome at contact (`BLOCK_ROLL_SD`).
  - A winning blocker drives his man back and washes him off the hole (`WASH_RATE`).
  - A losing blocker gets worked around, and the defender penetrates.
  - The blocker keeps the side he got (`blockDir`), so **leverage** matters. A defender his blocker has leverage on rarely sheds (`SHED_LEVERED`) and only gets a weak arm tackle (`ARM_LEVERED`). One the back runs past on his free shoulder sheds fast.
- **Blockers:**
  - Assigned blockers get their hands on their man from `RUN_ENGAGE` (1.4 yd).
  - They take the angle to where their man is going.
  - After the handoff they wall him off from the carrier.
  - They keep their assignments for the whole run.
  - Pullers run tight to the line, don't stop to block on the way, and pick their man by the hole. A latent bug where kick-outs ran as leads is fixed.
- **Defense:**
  - Backers fit at `LB_FIT_DEPTH` (2.8 yd), not at the line.
  - A backer or DB in the box loses 15% speed working through traffic (`TRASH_*`).
  - Man defenders on a back still behind the line hold at `MAN_DEPTH` instead of charging into the backfield.
  - Deep safeties read run faster.
  - Pursuers lead the carrier up to `PURSUIT_LEAD` (2 s), so deep defenders take angles.
- **Tackling:** a carrier going forward falls forward (`fallForward`, about 1.4 yd at full speed), which gives yards after contact.
- **Auto-runner (harness only):** reads the line for the lane with the most time to spare. Zone runs can cut back (`ZONE_READ_W`); gap runs stay near the hole.
- **QB runs:** a designed QB carry is now a run phase. The defense reads it and `autoRun` can carry it.

**FBS targets** for the harness auto-runner (all targets are kept in [TARGETS.md](TARGETS.md)):
- FBS teams average about 4.4 yards per rush (AP, 2018–21, sacks included). Starting backs gain about 3.1 yards after contact (PFF).
- Stuff rate, opportunity rate (4+) and power success are as defined by Football Study Hall.
- The league-wide levels used are from general knowledge, not one current table: about 18% stuffs, about 45% gaining 4+, about 12% gaining 10+, median about 3, power success about 70%.

The original five runs (IZ, OZ, Power, Toss, Zone Read), averaged over the three calls:

| | YPC | Median | Stuffs | 4+ | 10+ |
| --- | --- | --- | --- | --- | --- |
| Before (old harness) | 3.8 | 1.1 | 33% | — | 10% |
| After | 5.1 | 2.9 | 16% | 30% | 13% |
| FBS target | 4.5–5.5 | ~3 | ~18% | ~45% | ~12% |

- **Inside Zone:** 6.7 / 5.6 / 2.0 YPC against 2 Man / Cover 1 / Cover 0. Against light boxes the medians are 3.2 and 4.0.
- **Cover 0:** runs went from mostly stuffs to 2–6 YPC.
- **Short yardage (3rd and 1):** Power 84–85%, Iso 89–92%, QB Sneak 74–79%.
- **Still short of the target:** the 4+ rate (about 30% against about 45%). Too many runs end in 1–3 yards.

### Harness (`npm run balance`)
- **The auto-QB's aim is clamped in bounds.** This fixes the known flats-out-of-bounds bug, so every pass row moved once (see the baseline).
- **YAC bug fixed:** a catch that ended the play the same step (out of bounds at the sideline) never recorded a catch spot. That was the source of the 40–60 yd YAC readings.
- **Auto-QB changes:**
  - It skips a back who is still selling pass before his route.
  - It waits out the draw's fake set.
  - On the option, it pitches once the key commits to the QB.
- **Run rows:**
  - New columns: `median`, `4+`, and `contact` (yards past the LOS at first contact).
  - 180 reps per row.
  - QB runs are included, and RPOs are included as give-only rows.
- **New `SHORT` rows:** 3rd-and-1 conversion for plays tagged `short`.
- **`BAL_ONLY=a,b`:** limits the per-play rows to those ids or kinds. A full report takes about 60 s.

### Playbook: 18 → 62 plays
26 pass, 20 run and 16 PA/RPO, using all seven formations.

**New concepts** (`data/concepts.ts`):
- the common NFL pairs: `double-hitch`, `double-slant`, `go-post`, `go-hitch`, `in-cross`
- `stick`, `flood`, `drive`, `mills`, `cross-go` (Y-Cross), `double-out`, `corner-out` (which finally use `quickOut`), `spacing`, `snag`
- screens (`smoke`, `tunnel`)
- the under-center PA combos (`post-cross`, `cross-corner`, `cross-drag`, `go-corner`, `corner-flat`)
- `pop` and `slice`

**New routes:**
- receivers: `cross`, `glance`, `smoke`, `tunnel`
- backs: `checkFlat`, `screen`, `angle`
- run paths: `izDeep`, `stretch`, `counter`, `trap`, `draw`, `iso`, `sweep`, `pitchPath`
- lead blockers: `lead`, `kickOut`, `leadWide`, `slice`, `qbLead`

**New mechanics:**
- `RouteDef.delay`/`delayBlock`: screens, check-releases and the draw. The back sells pass within `DELAY_SET_RANGE` of his spot.
- Lead blockers (`RouteDef.lead`): the FB, H or TE runs the path, then run-blocks.
- `PlayDef.screen`: the line pass-sets for `SCREEN_SET`, then releases.
- Detached receivers who block **stalk** a DB. Their man doesn't hug-rush, and they're out of the protection pool. This fixed screens being sacked almost every time.
- `PlayDef.qbPath` and `QB_RUN_WAIT` for QB runs.
- The zone read gains `key: 'play'` and `keep: 'inside'` (Power Read).
- The new `read: 'option'` (Speed Option). The key either takes the QB or widens with the pitch man.
- `keyCrashing()` now asks whether the key is running at the back or at the QB, so it works for either key.

**Flip rules:**
- `field`: trips, empty, screens and perimeter runs
- `boundary`: Power O, Counter, Duo, Iso and the boots (boot back to the field)
- `fixed`: balanced 2x2 shells and the 18 legacy plays

### Call screen
- Formation chips under the PASS / RUN / PLAY ACTION tabs: A/D or the wheel switches them, and a click works too. The chip is remembered per tab.
- A 3×3 card grid, with W/S to page.
- Cards zoom to their own play, so runs are readable, and pull paths are drawn as dotted lines.

### Tests
75 total (71 run by `npm test`).
- **New `run blocking` tests:**
  - zone combos and the climb
  - gap down blocks and the hinge
  - wash
  - trap
  - draw
  - leverage shed
  - fall-forward
- **New `playbook validity` tests:**
  - unique ids, tip and name lengths, and resolving on every hash, flipped or not
  - 60–80 plays covering all formations
  - trips and empty plays flip to the field
  - no duplicate signatures
- **Legacy tests:** the route-map test now checks the 18 legacy plays as a subset, and the "keeps every call" test covers 11-personnel plays only.

### Flags: plays that are clearly overpowered or useless (not tuned)
Criteria:
- **Overpowered:** a pass play at 12+ YPP at both holds against two or more calls, or a run at 8+ YPC against two or more calls.
- **Useless:** a pass play at 2 or fewer YPP everywhere, or a run at 1.5 or fewer YPC everywhere.

Rows are from the final report.

**Overpowered:**
- **Go Post:** 13–21 YPP at both holds against Cover 1 and Cover 0 (9–18 against 2 Man).
- **PA Boot Flood:** 12–21 YPP at both holds against Cover 1 and Cover 0.
- **Close to the bar against Cover 1 only:** PA Post (21–24 YPP), Ace Max Shot (17–23), PA Seams.

**Useless or broken (a mechanic gap rather than a tuning problem):**
- **Power Read** (about 1.0 YPC): with the line blocking down, the gun sweep has to cover about 12 yd sideways before it turns up. A squeezing key or the WILL gets him in the backfield. It needs a perimeter blocker or a faster sweep path.
- **Draw** (0.3 YPC; −1.3 against Cover 0): a four-man rush reaches the mesh while the line is still selling pass. Draws need the DL to rush past the back, or a deeper mesh.
- **QB Power** (0.4 YPC; 3rd and 1 converts 58% / 59% / 1%): after the guard pulls, the center blocks back on the 1-technique alone and loses often enough to stuff the waiting QB.
- **Pin-Pull Sweep** (0.8 YPC): the playside guard and tackle pull from a gun sweep and get there behind the back.
- **Counter GT** (1.7 YPC; contact −2.2): with both backside linemen pulling, the center can't hold the backside 1-technique.

**Weak:**
- **Lead Toss** (2.5 YPC, 44% stuffs; 0.2 against Cover 0).
- **Empty QB Draw:** fine against 2 Man (3.5), but −1.1 against Cover 0, where six rush against five.

**Strong run rows** (no run-defense calls exist yet, so every light box stays light):
- Outside Zone against 2 Man: 10.2 YPC.
- Speed Option against Cover 0: 10.4 YPC.
- RPO Stick and Power Bubble give rows against 2 Man (8+ YPC, about 50% 10+): the routes take the man defenders out of the box. That's the point of an RPO, but the defense has no answer yet.

**Harness artifacts, not play problems.** The auto-QB throws to the most open receiver at a fixed hold time:
- At 1.2 s it throws to a flat still crossing the formation (Stick, Flood and Dagger: 5–20% completions, 12–26% INTs). At 2.2 s the same plays are fine.
- At 2.2 s it dumps to a check-release back (Double Hitch, Double Slant, Drive, Corner Out: 90%+ completions at 0–2 YPP).
- On Four Verts, Smash, Mesh, Post Wheel and the I-Form boots it takes the RB or FB flat (3–6 YPP, about 90% completions).
- Smoke at 1.2 s (1–5 YPP): it's a one-step throw, and 1.2 s is late.

**Near-duplicates:** none by the signature test. Four Verts, Smash and Mesh have near-identical rows only because the auto-QB throws the same RB flat on all three.

## Done: route running, speed and settle catches (2026-10-24)
Routes used to run at one speed: top speed about 0.45 s after the snap, every cut rounded off at full speed, and hitch, curl and comeback receivers overrunning their spot (the old curl ran to 12.7 yd and drifted back to 8.7).

**Speed through a route** (`runRoute` in `sim/ai.ts`, pass routes only):
- **Burst:** off the line and out of a cut at `BURST` (scaled by `acc`), tapering by `BURST_TAPER` near top speed. `accelOf` still caps it. A WR now reaches top speed at about 0.7 s instead of 0.5 s, and a go route is about 0.5 yd shorter at 1 s.
- **Plant:** he brakes at `PLANT_DECEL` into each waypoint, down to `cutKeep` of top speed there.
  - `cutKeep` depends on the turn angle and `acc`: about 0.96 on a slant for a sharp route runner, about 0.5 on a hitch or curl, and 1 on bends under 20°.
  - Cuts are now tight, and settle routes stop on their spot (curl at 10.2, hitch at 5.5).
- **Only pass routes are affected.** `Player.passRoute` is false for run paths, PA fakes and lead paths, so handoff timing and run blocking are untouched. The SHORT, punt, kickoff and FG rows came out byte-identical.
- **Defense is unchanged.** Man coverage already follows a lagged position, so it stays tight on the release, and the gap opens where the receiver plants and bursts away.

**Settle and face the QB:**
- On a `settle` route (one that ends with `cont: false`: hitch, curl, comeback, smoke, RB screen), the receiver starts turning to the QB as he comes back down the final leg, or when he stops.
  - The turn takes `TURN_TIME - 0.15·acc/100` (about 0.2–0.3 s), and the sprite turns when it's done.
- `facingQB()` gives a 0..1 "set" value. It drops to 0 if he's moving faster than `SET_MAX_SPEED` and not back toward the QB, and it's always 0 on routes caught in stride.
- `catchOdds` takes `set`:
  - `SET_HANDS` (+0.04 to the hands factor)
  - `SET_CONTEST` (+5% to his share of a contested ball)
  - That's about +3–4 points on a contested hitch and less than 1 on an open one.
- F1 debug shows each route runner's speed, or a green SET.

**Harness:** new `ROUTE` rows (`BAL_ONLY=route`). They throw to the receiver on one route 0.3 s after his sharpest break (go, post and corner use the NFL time to break), with NFL comp % vs man and separation alongside for reference.

**Before → after.** These are paired runs: the same seeds with the new profile on and off, at 1,200 reps per aggregate row and 600 per route row.

| All pass plays | 1.2s comp / YPP | 2.2s comp / YPP |
| --- | --- | --- |
| 2 Man Under | 68.0 / 5.39 → 67.3 / 5.39 | 66.0 / 6.32 → 66.7 / 6.60 |
| Cover 1 Robber | 69.6 / 7.68 → 71.0 / 6.99 | 67.2 / 7.98 → 64.2 / 7.79 |
| Cover 0 Blitz | 70.7 / 8.78 → 69.0 / 8.23 | (sacks) -2.25 → -2.12 |
| **PA:** 2 Man Under | 67.9 / 8.54 → 68.6 / 8.30 | 76.0 / 8.39 → 78.1 / 8.56 |
| **PA:** Cover 1 Robber | 75.2 / 13.28 → 75.3 / 13.20 | 77.2 / 13.08 → 76.7 / **10.93** |
| **PA:** Cover 0 Blitz | 76.9 / 15.31 → 75.0 / 14.55 | (sacks) 1.70 → 1.39 |

| Route (thrown out of the break) | 2 Man comp | Cover 1 comp | Of the gain, from the set bonus |
| --- | --- | --- | --- |
| Hitch | 58 → 66% | 55 → 62% | about +3 / +1 |
| Curl | 51 → 56% | 54 → 61% | about +5 / +10 (noisy) |
| Comeback | 56 → 58% | 54 → 58% | 0 / +6 |
| Slant | 61 → 61% (YPT 8.4 → 5.4) | 60 → 53% | none |
| Deep out | 60 → 52% | 57 → 56% | none |
| Dig | 51 → 48% | 53 → 53% | none |
| Drag | 67 → 62% | 65 → 63% | none |

**Flags (not tuned):**
- The overpowered and useless lists are unchanged: Go Post and PA Boot Flood overpowered, Double Hitch "useless" (the check-release artifact).
- **PA against Cover 1 at 2.2 s lost about 2 YPP.** It's spread over the boots: PA Boot Flood 15.7 → 13.8 and Ace Boot 7.0 → 5.6 (400-rep per-play check). Boot Flood was already flagged as overpowered.
- **Deep out against 2 Man:** 60 → 52%. The plant on an 88° break costs speed the man defender doesn't lose.
- **Quick-throw YAC is lower.** A slant caught 0.3 s after its break is still re-accelerating, so YPT fell from 8.4 to 5.4 (NFL 6.9). That eases the "high YAC on quick throws" bug below.
- **Ace Y-Stick halved** (for example 9.2 → 4.6 against 2 Man at 1.2 s). It's a harness artifact: per target, the go and slant results barely moved, but the WRs are a little tighter at 1.2 s, so the "most open" QB throws the TE2 flat 478 times instead of 317.
- **RB Screen rose** from about 2 to 6–8 YPP against 2 Man and Cover 1. The back now stops on his spot and is set. The NFL screen is 5.1 per target.
- **Separation at arrival is still far below the NFL:** 0.0–0.9 yd against NFL 1.5–3.7, because man defenders run to the ball's landing spot. Real separation lives at the throw.

**Tests:** 7 new ones covering the set catch bonus (open and contested, under 6 points), `cutKeep`, the go route's ramp and no set, the slant keeping speed vs the hitch stopping, the curl plant-settle-turn, and run, fake and lead paths left alone.

## Balance baseline
From `npm run balance` (Georgia offense vs Alabama defense), after the route-running work. The single-seed 120-rep rows below move a few points from run to run; use the paired table above for before/after.
- **Pass and PA rows:** the auto-QB throws to the most open receiver after a fixed hold time, aiming in bounds.
- **Run rows:** the auto-QB hands off as soon as it can (it reads the zone-read key, waits out the draw, and pitches the option on the key), and `autoRun` reads the line for a lane. There are no jukes, so expect real players to do better.

| All pass plays, defense | Hold | Comp | INT | Sacks | YPP |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | 1.2s | 70% | 4.2% | 0/120 | 4.9 |
| 2 Man Under | 2.2s | 65% | 5.4% | 8/120 | 6.3 |
| Cover 1 Robber | 2.2s | 72% | 0.0% | 8/120 | 8.4 |
| Cover 0 Blitz | 1.2s | 67% | 2.5% | 0/120 | 7.3 |
| Cover 0 Blitz | 2.2s | 64% | 4.0% | 95/120 | -2.1 |

| PA plays (dropback), defense | Hold | Comp | INT | Sacks | YPP |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | 2.2s | 78% | 2.6% | 4/120 | 8.7 |
| Cover 1 Robber | 2.2s | 80% | 1.8% | 7/120 | 15.8 |
| Cover 0 Blitz | 1.2s | 72% | 3.3% | 0/120 | 14.1 |

**Runs:**
- All 26 run rows (with RPO gives and QB runs): 3.9 YPC, median 2.1, 18% stuffs, 22% gaining 4+, 10% gaining 10+. Run code didn't change; this moved by 0.1 only because the pass rows ahead of it use the shared RNG differently.
- The original five runs: 5.1 YPC, median 2.9, 16% stuffs. See the table above.
- Against Cover 0, interior runs give 2–4 YPC; Toss and Lead Toss lose yards.
- **Kicks are unchanged:** the punt, kickoff and FG rows still match the table below exactly. Kick coverage keeps the old pursuit lead; only scrimmage pursuers use `PURSUIT_LEAD`.

**Short yardage (3rd and 1):** Power 84%, Iso 90%, QB Sneak 77%, QB Power 58% (1% against Cover 0).

The per-play `RUN` and `PLAY` rows in `balance.txt` have the details. Reading the defense still matters: don't pitch into the zero blitz, and don't hold the ball against it.

### Future tuning targets: NFL results by route
The NFL completion %, yards per target and man/zone splits by route are in [TARGETS.md](TARGETS.md). They're not tuned toward yet; they belong with the defense work.
These need a harness that targets by route (or by read), not "most open". The current one over-throws flats and checkdowns. The new `ROUTE` rows are a first step: they target one route per row, against man calls only.

**Special teams:** an auto-kicker with fixed aim per kick type, 200 reps each, in random wind. Kicks use their own seed, so the scrimmage rows don't move.

| Kick | Result |
| --- | --- |
| Punt from own 30 (full power) | Gross 42.1, net 39.3. 56% fair caught, 5.8-yard average return, 0 blocks |
| Pooch from opp 40 (74% power) | 79% downed or caught inside the 20, 94% fair caught |
| Coffin corner from opp 38 | 100% inside the 20: 51% out of bounds, 28% touchbacks |
| Line drive from own 30 | Gross 43.7, net 34.3. 97% returned (10.5 average), 2.5% returned for TDs |
| Deep kickoff | 64% touchbacks. CPU starts at its 22.5; 13.2-yard average return |
| Sky kickoff | CPU starts at its 31. 14% fair caught |
| Squib | CPU starts at its 36. 1% returned for TDs |
| Corner kickoff | CPU starts at its 22. 8% out of bounds |
| FG, straight aim, calm | 20-29: 92%, 30-39: 77%, 40-49: 66%, 50-59: 35%. Blocks about 1.5% |
| FG, straight aim, wind | 20-29: 90%, 30-39: 73%, 40-49: 55%, 50-59: 25%. The auto-kicker doesn't allow for wind |

## In progress
- Nothing right now.

## Known bugs and rough edges
- **The pass harness is "most open at a fixed hold".** It over-throws flats and checkdowns, and it throws quick game and screens too late (see the flags above). Per-route targeting is needed before using the NFL completion targets.
- **Flagged plays need mechanic work:** Power Read, Draw, QB Power, Pin-Pull Sweep and Counter GT (see the flags above). Each has a diagnosis.
- **The run game's 4+ rate is low** (about 30% for the core runs, against FBS about 45%). Too many runs end at 1–3 yards. Second-level fits still beat climbing linemen too often.
- **Routes still outside the NFL middle 50%:**
  - `deepOut` breaks flat (-88° vs NFL -61°). It was kept as it was.
  - The seam runs straight; NFL seams drift outside by about 13°.
  - The flat starts 2 yd upfield (NFL 0.8).
  - Wheel and bubble are thin samples.
- **Kickoff returns are short:** about 13-16 yards per return, versus an NCAA average of about 21. So a deep kick that's returned is slightly better for the kicking team than a touchback. The returner also runs out everything he catches in the field of play and never takes a knee.
- **Line-drive punts give up about 2.5% return TDs.** They're meant to be the risky option, but it's worth watching.
- **Kickoff camera:** while aiming, the camera follows the predicted landing spot, so the kicker and the coverage are off screen.
- **Main-view goal posts are drawn skewed,** because the projection would otherwise stack both uprights on one line. A ball that clips an upright can look slightly off. Trust the goal cam.
- **CPU kicks to the user are still simulated:** the drive starts at the 25 or a computed punt spot. There are no playable returns.
- **The free kick after a safety is still simulated:** CPU ball at its 40.
- **Separation at the catch is tiny** (0.0–0.9 yd in the `ROUTE` rows, against NFL medians of 1.5–3.7). Man defenders run to the ball's landing spot as soon as they react to the throw.
- **The deep out lost about 8 points against 2 Man** with the plant (see the route-running flags).
- **High YAC on quick throws:** about 13–20 yards when throwing to a wide-open receiver at 1.2s. The route burst trimmed this (a slant thrown out of its break now gives 5.4 per target). Defenders trailing in man can't close on a straight-line runner. Realism is unclear; revisit tackling and pursuit tuning.
- **Sack rate when holding long:** about 35% of plays at 3.2s against a 4-man rush, which may be harsh.
- **Play diagrams are small:** cards are now 62 px tall to fit 9 per page. Each card zooms to its own play, but drags and crossers on wide pass plays still look short.
- **No timeouts, spike, kneel or overtime yet.** Ties stand.
- **Light boxes are very good to run against:** Outside Zone against 2 Man gives about 10 YPC, and RPO give rows against 2 Man give 6–8. The defense has no run-defense calls yet.
- **Toss pitch timing:** if you pitch the instant the ball is snapped, the RB catches it nearly standing still.
- **CPU drives don't take timeouts,** and the user has no two-minute tools.
- **No zone underneath coverage:** defenses are man or deep zones only.
- **RPOs are still a run plus a tagged route.** There's no read on a defender yet, and the harness measures only the give.
- **Zone-read keeps are weak for the auto-runner** (about 0 YPC even on a correct read). Blocks on the backside don't hold up once the QB pulls it: the X never reaches a corner who's fitting downhill, and blocks more than 8 yd from a deep QB shed at once. A human steering the QB should do better; check by playing before tuning.
- **The read key's crash is a coin flip.** It doesn't depend on the call, the down, or the key's awareness yet.
- **A user can hand off on any pass play** (the old "call a draw" behavior). `read` could gate this later.

## Next up (rough priority)
1. **Fix the flagged plays:** Power Read, Draw, QB Power, Pin-Pull Sweep and Counter GT (diagnoses are in the flags above). Then review Go Post and PA Boot Flood against single-high.
1. **Run game, round 2:** raise the 4+ rate toward about 45%. Look at second-level fits against climbers, and at yards after contact. Play IZ, Power and Counter by hand before tuning.
1. **Harness:** target by route or read instead of "most open". Then use the NFL per-route completion table as balance targets, together with the defense work.
1. **An RPO read on a defender,** and give the harness a pull decision.
1. Full FBS database: all conferences and teams, realistic strength tiers, then real rosters.
2. Clock tools: timeouts (3 per half), spike, kneel, college overtime.
3. Run-defense calls (8-man box, run blitzes; light boxes are currently too easy to run on) and zone coverages (Cover 2, 3, 4, and underneath zones) and smarter defensive play-calling by down and distance.
4. Playbook UI, part 2: filter by situation (short yardage, red zone, 2-minute).
5. Special teams, part 2: playable kick and punt returns, onside kicks, fakes, a real free kick after a safety, and CPU 4th-down decisions shown as actual kicks.
6. Pre-snap reads and audibles beyond Esc (hot routes, protection slides).
7. Sound, and packaging as an .exe with Electron or Tauri.
