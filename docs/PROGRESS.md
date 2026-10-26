# Progress

_Last updated: 2026-10-26_

## Done: gameplay MVP
- **Project setup:** Vite and TypeScript scaffold, fixed-timestep loop, 640×360 internal canvas scaled up with pixelated rendering.
- **Field:** grass stripes, yard lines, college hash marks, numbers, end zones in team colors, midfield logo, crowd. The camera scrolls horizontally in Retro Bowl style.
- **Sprites:** procedural pixel-art players with team uniforms (home and away). Poses: stand, three-point stance, 4-frame run, throw, catch, down.
- **Teams:** 8 FBS teams (UGA, BAMA, OSU, TEX, ORE, MICH, ND, CLEM) with real colors and conferences. Off/def ratings are rough estimates. Rosters are generated and seeded per team, scaled by team strength. (Now all 138 FBS teams with researched rosters; see the ratings and rosters section.)
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
- **Running:** user-controlled carrier, sprint with stamina, broken tackles, sacks, scrambles, out of bounds, interception returns and pick sixes.
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
  - **Right-click (or F)** hands off to the RB whenever he's behind the line and not blocking, on any play. Within 1.8 yd it's a handoff (99.7% clean); up to 8 yd it's a pitch or shovel (`pitchOdds`). Misses are a `fumble` outcome, recovered by the offense.
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
  - Then Space on the timing meter's green (see the timing meter section).
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
- Formation chips under the PASS / RUN / PLAY ACTION tabs: A/D or the wheel switches them, and a click works too. The chip is remembered per tab. (The first chip, ALL, is now STARRED; see the playbook page section.)
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

## Done: cancel a pass aim (2026-10-24)
- **Space while aiming** drops the aim without throwing (`Play.updateLive`). The release that follows does nothing. The hint bar shows `RELEASE TO THROW  SPACE: CANCEL` while aiming.

## Done: perimeter blocks on outside runs (2026-10-24)
Bug: on outside runs, the playside WRs' stalk blocks on the corners almost never held. Both causes were rules meant for the backside that only checked distance to the carrier. Right after the handoff or pitch, a playside corner is 15–19 yd from the back, so those rules caught him too.
- **Peel-off:** `runEngagement` shed every blocked defender more than 8 yd from the carrier at 2.5/s, which is about 0.4 s per block. Now a defender only peels off if he is also backside of the carrier or behind him (`PEEL_DIST`, `PEEL_BACKSIDE`).
- **Engage gate:** after the handoff, `formEngagements` wouldn't start any block more than 10 yd from the carrier. A WR who hadn't reached his man by the pitch couldn't lock on. A blocker's own run-block assignment is now exempt.
- Test: a far playside block keeps its matchup shed rate, and the backside still peels off.
- Balance (before → after, YPC by call: 2 Man / Cover 1 / Cover 0):
  - Lead Toss: 3.2/3.5/0.7 → 6.0/4.3/8.1. Stuffs 38% → 21% against 2 Man.
  - Toss: 7.5/3.1/1.3 → 8.0/4.9/0.8. Stuffs 31% → 20% against 2 Man.
  - Speed Option: 2.5/1.9/10.2 → 4.2/3.7/12.4.
  - Draw: 1.1/0.3 → 2.4/1.8. Its peel-off also stopped hitting the playside.
  - All runs: 3.9 → 4.1. Interior runs moved within noise.
  - Pin-Pull Sweep, Power Read and zone-read keeps are unchanged. Their flagged problems are elsewhere.
- **Flag:** Lead Toss against Cover 0 is now 8.1 YPC with a 0.1 median and 17% 10+ runs, so it's boom or bust. Speed Option against Cover 0 is 12.4. Watch both; they weren't tuned.

## Done: fumbled pitches and handoffs (2026-10-24)
Bug: pitches were fumbled far too often, most visibly on I-form play action, where the back starts 5–7 yd deep, so an early right-click is a pitch. The aim in `Play.handoff()` led a slow back (under 3 yd/s) as if he were already at 75% of top speed, plus 0.15 s extra. A back starting from rest can't get there in a 0.4 s pitch, and any miss beyond `CATCH_REACH` (1.7 yd) was an automatic fumble. Fast backs overshot the same way. Across the playbook the old aim missed by up to 1.9 yd; the new one by at most 0.6.
- **Pitch aim:** leads the back to where he gets at full tilt during the flight, accelerating from his current speed (`accelOf`, capped at top speed), along his heading if he's moving or his path if he's just starting.
- **The back runs through the pitch** at full speed (`thinkOffense`) instead of `seekTimed`, which paced him to arrive exactly on time and catch it at a jog.
- **Rates:** `HANDOFF_ODDS` 0.99 → 0.997. `pitchOdds` is now about 0.5% on the ground when he's under it and 2–3% at the edge of the new `PITCH_REACH` (2.5 yd; was 1.7 with 1–7% drops).
- Tests: `pitchOdds` bounds, and a regression test pitching on Toss, Lead Toss, I-Form Boot, I-Form Deep Cross and PA Seams at every 0.05 s from the snap to 1.2 s; the back must be within half of `PITCH_REACH` when the ball arrives.
- Balance: fumbles across all run rows 145 → 47 (of about 14,600 reps, 1.0% → 0.3%). Toss and Lead Toss over 1,000 reps per call: 0.3–0.6%, all from the base rate.
- **Flag: pitch plays got better.** Catching in stride gets the back to the edge faster. YPC by call (2 Man / Cover 1 / Cover 0), before → after:
  - Toss: 8.0/4.9/0.8 → 11.9/5.1/4.3.
  - Lead Toss: 6.0/4.3/8.1 → 9.3/4.9/12.7 (13 TDs against Cover 0).
  - Speed Option: 4.2/3.7/12.4 → 6.9/4.2/13.5.
  - All runs: 4.1 → 4.6.
  - Pitching into the zero blitz no longer loses yards. Not tuned. The levers are the perimeter blocks and the defense's force player, not the pitch.

## Done: kick timing meter, no juke, stat-based sprint (2026-10-24)
- **Kick timing meter (FG, XP, punt, kickoff).** The drag still sets power, direction and loft. After the release a bar appears at the bottom center: red, yellow, green, yellow, red, with a needle sweeping left to right. Press **Space** as it crosses the green.
  - Math in `sim/kicking.ts`: `METER_HALF` (0.45 s from the green's center to either end), `timingGreen(kac)` (green half-width `GREEN_BASE + GREEN_KAC·kac/100`, about ±0.1 s for a kac-84 kicker), and `mistimeAngle` (0 on the green, then `MISTIME_DIR·m^MISTIME_CURVE` for `m` the share of the way from the green's edge to the bar's end: 0.18 rad, about 10°, at the end, with the 0.85 curve making near misses cost more. Halfway out is about 4.3°, enough to miss a 40-yarder).
  - The bar is drawn one pixel column at a time, colored by what that spot would cost: green, shading through yellow to red. **Early hooks left (−y), late pushes right (+y).** The existing `kac` gaussian error is applied on top.
  - The run-up is paced (`seekTimed`) so the kicker reaches the ball as the needle hits the green's center: `FG_STRIKE` 0.9 s after an FG/XP release, the natural run-up time on kickoffs, and `PUNT_GETOFF` after the punter's drop.
  - The foot meets the ball when the needle is stopped **and** the kicker is at the ball. An early press strikes on arrival (with the hook); a late press makes him wait planted. If you never press, the needle runs off the end and it's a full late push.
  - Kickoff cover lanes are timed to the strike, so a late press doesn't put anyone offside. They wait at the line.
  - Popups: PERFECT! / EARLY / LATE (red when far off).
  - **`PUNT_GETOFF` went from 0.3 to 0.45 s** so the needle starts moving at the drop. A late press costs more get-off time against the rush.
- **FG/XP protection is gap-sound** (`assignFgProtection`, at the snap). The protectors used to take the nearest rusher, so two would double a DT and the WLB stacked behind him ran through the A gap untouched on every snap. He was 2.6 yd from the hold at the strike every time. Now each rusher gets his own blocker, matched by alignment, and the spare protector picks up whoever comes free.
  - Probe, 200 FGs: the nearest rusher at the strike was a median 2.6 yd from the hold, inside 3 yd 100% of the time. Now it's a median 6.5 yd, inside 3 yd 2% of the time, which is about the real FBS FG block rate (about 1.5–2%). Interior rushers get about a yard of push; the ends get the most.
  - The block itself is still the `FG_BLOCK_BASE` roll, not the rush. FG rows only moved within noise.
  - Test: one blocker per rusher, and no rusher within 2 yd of the hold before the strike (40 seeds).
- **Juke removed.** Space does nothing while running. `tackleChance` lost its `juking` argument; the "JUKED HIM!" popup is gone.
- **Sprint endurance** (`endurance` in `sim/player.ts`): `clamp((0.6·spd + 0.4·acc − 60)/35, 0, 1)`, so it's continuous. Template values: QB about 0.39, TE 0.52, RB 0.83, WR 0.86, and a mobile QB (85/84) about 0.70.
  - Full sprint lasts `SPRINT_TIME` 1.15–3.46 s, eased by endurance squared (it was 2.86 s for everyone): about 1.5 s for a pocket QB, 1.8 for a TE, 2.3 for a mobile QB, 2.7 for an RB, 2.9 for a WR. Receivers keep the old feel; QBs tire much sooner. Recovery is `SPRINT_RECOVER` 0.12–0.18/s (was 0.15).
  - The stamina bar's length scales with endurance (10–18 px), so a QB's bar is visibly shorter.
- **Harness:** the auto-kicker presses at the green's center (|e| ≤ 0.04), so aim is unchanged. Every scrimmage row came out byte-identical. Kick rows moved because pre-kick timing changed (the shared RNG is drawn per step) and because of the longer punt get-off:

  | Row | Before | After |
  | --- | --- | --- |
  | Punt from own 30 | net 39.3, fc 56%, ret 44% (5.8) | net 40.0, fc 71%, ret 29% (6.9) |
  | Pooch | in20 79% | in20 83% |
  | Coffin corner | oob 51%, tb 28% | oob 61%, tb 26% |
  | Line drive | ret TDs 5 | ret TDs 3 |
  | Deep kickoff | CPU start 22.5, tb 64%, ret 13.2 | 23.0, tb 60%, ret 15.9 |
  | FG calm, by decade | 92 / 77 / 66 / 35% | 93 / 80 / 69 / 32% |
  | FG wind, by decade | 90 / 73 / 55 / 25% | 91 / 83 / 57 / 26% |

- **Flag:** the punt fair-catch rate jumped from 56% to 71%. The extra 0.15 s of get-off lets coverage get closer by the time the ball comes down. Punt blocks are still 0. The FG and kickoff changes look like RNG noise at 200 reps. Not tuned.
- **Tests:** 6 new ones: mistime direction and growth, a wider green for better kickers, a live FG (on the green is good, early lands left of the posts, no press auto-pushes right, the kicker is at the ball at the strike), kickoff coverage staying onside on a late press, and endurance ordering. The tackling test lost its juke assertion. 86 tests in total.
- **Not checked by hand yet:** the meter's look and feel in the browser.

## Done: ratings, rosters and every FBS team (2026-10-24)
Design notes are in [RATINGS.md](RATINGS.md) (what every rating does, overall formulas, the evidence) and [ROSTERS.md](ROSTERS.md) (the research, the generator, depth charts).

### Ratings: 12 → 26, each with a job (`data/ratings.ts`)
- The old ratings each fed several unrelated formulas, so they were split along code paths that already existed:
  - `thr` → `sac`/`mac`/`dac` (accuracy by distance, `accuracyAt`), `tup` (on the run) and `pac` (poise under pressure)
  - `awr` → `mcv` (man), `zcv` (zone) and `prc` (run, play-action and pitch reads)
  - `blk` → `pbk`/`rbk`
  - `str` as the defender's power → `rsh` (pass rush) and `bsh` (shedding run and ST blocks); `str` in the press jam → `prs` (corner) vs `rls` (receiver)
  - `acc` in route running → `rte`
  - the spd/acc stamina formula → `sta`
  - new `cit` (catch in traffic) for the receiver's share of a contested ball
- **Pure refactor first:** with every new rating filled from the old one, `balance.txt` came out byte-identical.
- **One new effect:** a blocker's strength is 20% of his block (`ANCHOR_STR`); before, an OL's `str` did nothing. On the old rosters this moved runs from 4.6 to 4.8 YPC (stuffs 14% → 12%) and short yardage up 2-10 points. The pass rows moved within noise.
- **Not ratings, because nothing reads them yet:** ball security, carrier vision, underneath zone drops, QB decisions, and height and weight (they only shape ratings when a player is generated).

### Positions and overall (`data/positions.ts`)
- 17 positions (QB, HB, FB, WR, TE, OT, OG, C, DE, DT, OLB, MLB, CB, FS, SS, K, P); each on-field slot is rated at one.
- **Overall is relative to the position:** measured against the position's rating template at a 75, so a template player at level L rates exactly L, a pocket QB isn't punished for lineman speed, and a point of each rating is worth `w / Σ(w·slope)`.
- **The weights only include ratings that matter at that position**, set from the new sensitivity report (below). Linemen's `str` weight follows from the anchor: a quarter of pass block plus a quarter of run block.

### Sensitivity report: `npm run ratings` (new, about 10 min)
- Lowers one rating by 15 on one group of starters and replays the same plays, paired rep by rep (each rep has its own seed). The output is in `ratings.txt`; the summary is in RATINGS.md.
- It found two harness problems along the way: a +15 bump clipped at 99 for good starters (so it lowers instead), and a shared RNG stream made the noise as big as the effects (so each rep gets its own seed).

### 138 FBS teams, researched (`data/fbs/`)
- Seven research agents covered all 2026 conferences in parallel (records as of Oct 24, AP ranks, preseason honors, team-season pages). They found 486 real standouts on 2026 rosters, each with position, class, archetype and tier, plus each team's QB style, scheme, unit strengths, tier, prestige, colors and offense/defense/ST targets.
- The raw JSON is in `docs/research/`. `python scripts/build_profiles.py` validates it and regenerates `profiles.ts`. Sources per team and known weak spots (guessed class years, QB situations in flux) are in ROSTERS.md.
- The hand-tuned uniforms of the original 8 teams are kept; the rest are derived from two colors (`uniform`).

### Rosters, depth charts, team ratings
- **Player schema** (`Athlete`): name, number, position, archetype, class, redshirt, height, weight, hometown, recruiting stars, potential, development trait, ratings, injury, and `real` for researched players. The sim still sees only `RosterPlayer`, built by `onField`.
- **Generator** (`rosterGen.ts`): 85 players per team, seeded by team id. Standouts go in first under their real names. Classes set levels, archetypes follow the scheme, and builds nudge ratings. Calibration makes each position's starters average the unit target, and every standout starts. Hometowns weight the home state, the region and national talent by program tier.
- **Templates** (`athletes.ts`) are anchored so a level-88 player matches the old 89-team template the playbook was balanced on. Special-teams `bsh`/`rbk` for players off their own side of the ball follow the old strength and block values, because return TDs jumped when coverage players had junk shed values.
- **Depth chart and injuries** (`depth.ts`): an auto depth chart by fit at each slot (out of position -4); starters are filled in slot order, first healthy player. An injury takes a starter off the field and the backup starts on the next snap.
- **Team ratings are computed, never stored:** offense (QB 30%, line 35%, receivers 21%, RB 8%, TE 6%), defense (front 36%, backers 16%, corners 28%, safeties 20%), ST (K 50%, P 35%, returners 15%). `simulateDrive` uses them. Across the 138 teams they land within about half a point of the research targets on average.

### Screens
- **Title:** A/D picks your team within its conference and W/S changes conference; the arrow keys do the same for the opponent. Each panel shows OVR / OFF / DEF.
- **Roster screen (R or T):** offense, then defense and ST starters with the four ratings that weigh most in their overall (real players in gold, out-of-position flagged), then the full 85-man roster with class, height, weight, stars, potential and hometown. Checked in the browser (headless Chrome screenshots); no console errors.

### Harness changes
- `src/harness.ts` holds the auto-QB, auto-runner and auto-kicker for both reports (`balance.txt` was byte-identical after the move).
- **Reference matchup:** the balance and ratings reports now play template players (offense 90 vs defense 88, the old harness's gap), not generated rosters, so research updates and roster rolls don't move the baseline.

### Tests
14 new, 100 in total:
- ratings: template players rate their level; overall rises with every weighted rating and ignores the rest; accuracy bands; `composure`; the anchor; every rating documented
- rosters: all teams have a state, colors and a unique abbreviation; composition and determinism; every slot gets a different healthy starter; ratings and bios in range; an injury promotes the backup and lowers only the right team rating; team ratings within 6 of every target (mean under 2.5) and tier 1 > tier 3 > tier 5; standouts on the roster in the two-deep; mobile-QB teams start a mobile QB
- the route-running tests now pin the receivers to a fixed profile, since an elite generated route runner hit a test boundary

### Flags (not tuned)
- **Talent gaps are far too steep in the live sim.** With real FBS spreads, Georgia's offense (88) against Sacramento State's defense (56) runs for 35.7 YPC (nearly every run a TD) and 15.8 per pass; Sacramento State against Georgia's defense gets -1.8 and -2.5. Even matchups play normally at any level (Sac State vs UTEP: 3.4 YPC). The rating-to-outcome curves (speed, tackling, block power) need compressing before full seasons are playable. The CPU drive sim is milder (5.1 points per drive vs 0.01).
- **The run game is very sensitive to the ball carrier.** The old baseline's Georgia back was a lucky roll (99 elusiveness, 87 strength), and swapping him for a template back cost about 1.2 YPC on the core runs. The new reference baseline is lower for that reason (see below), not because of a change in the sim.
- **Elite returners beat punt coverage:** with the real Alabama returner (99 speed, 90 elusiveness), punts gave up 8-9 return TDs per 300; at elusiveness 80 it's 2. Fixed in the next section.
- **The press jam is weak** (short, and only on 35% of snaps: `prs`/`rls` worth 0.03-0.21 yards per play across the two sensitivity runs), and **zone coverage is nearly unused** until zone calls exist. Their weights assume they'll matter.
- **QB ratings can't be measured** by the auto-QB harness (it throws to the most open man at a fixed time). Their overall weights are judgment.

## Done: return TDs made rare (2026-10-24)
Elite returners were breaking 2 tackles a return and scoring on 9-15% of returns, and a top program returning against a weak one scored on 27-29%. Real FBS punt returns score on about 1%. Measured on line-drive punts (nearly every one returned), 400 reps per case:

| Case | Before: TD % of returns, broken tackles per return | After |
| --- | --- | --- |
| Template returner (reference 90 vs 88) | 5.3%, 1.30 | 1.0%, 0.35 |
| Speed 95, elusiveness 80 | 2.3%, 1.22 | 0.5%, 0.33 |
| Speed 99, elusiveness 90 | 8.3%, 1.63 | 1.3%, 0.43 |
| Speed 99, elusiveness 97 | 15.3%, 2.02 | 1.3%, 0.41 |
| Alabama returns vs Sacramento State coverage | 26.8%, 0.98 | 1.8%, 0.41 |
| Sacramento State returns vs Alabama coverage | 0.0%, 0.81 | 0.3%, 0.24 |

Three causes, three changes:
- **Linear tackle odds.** `returnTackleChance` (`sim/tackling.ts`) runs the tackler-vs-carrier gap through a tanh (`RETURN_TACKLE_BASE`, `RETURN_GAP_SCALE`, `RETURN_GAP_SOFT`), so an elite returner gets a few points per attempt, not 20. Each tackle he's already broken on the return adds `BROKEN_TOLL` (0.12) to the next one: one or two misses happen, a chain of four doesn't. Kick returns only; scrimmage still uses `tackleChance`.
- **Junk tackle ratings on the cover unit.** Punt coverage is the offense's starters, whose `tkl` was a 35-45 placeholder. Offensive templates now carry a special-teams tackle rating (HB 55, FB 62, WR 50, TE 60, OL 55, slope 0.3), like the earlier `bsh` fix. `tkl` has no weight in their overall. In scrimmage it's read only on interception and fumble returns; that reshuffled the shared RNG, so every scrimmage row in `balance.txt` moved. Re-seeding the old and new templates (two seeds each) put both inside the same band (core runs 4.05-4.44 YPC), so it's noise.
- **The speed gap between units.** Most remaining TDs against weak programs had no broken tackle at all: slow cover men (offensive linemen at 46 speed) couldn't stay with a fast returner's cuts, and blocking hardly mattered (10.6 of 11 cover men were free at the TD). Longer pursuit leads didn't help. Now `ST_SPEED_GAP` (`game/kickPlay.ts`) keeps half the speed and acceleration gap between the two units on punts and kickoffs. Each unit is measured against its positions' templates, so players keep their order within the unit and the returner keeps his own edge. Rosters aren't changed.
- **Flag:** returned full-power punts now average about 5.5 yards (it was 10.0; FBS is about 8-9). Line drives average 10.4 and deep kickoffs 14.5. The full punt's hang time lets coverage arrive with the catch, and misses no longer chain. Not tuned. Watch it once returns are playable.
- **Tests:** 2 new (the elite returner's edge stays small and broken tackles add up; the speed squeeze keeps the order within a unit and leaves rosters alone). 102 in total.

## Done: season framework (2026-10-24)
The whole season loop exists end to end, each system with a simple first version behind its own module, so details can be filled in one at a time. Design notes, the week pipeline and every placeholder are in [SEASON.md](SEASON.md).
- **Three layers:** world data in `src/data/season/` (conference rules, 28 rivalries, the calendar, the 12-team CFP format, 32 bowls with tie-ins), a headless engine in `src/season/` with plain-JSON state, and the live game, which the hub launches and whose final screen writes the score back.
- **Week loop** (`advanceWeek`): prep (staff game plans and depth charts) → play (the user's live result, everything else simulated) → results (injuries heal) → rankings (AP every week, CFP from week 9) → news → transition (regular season → championship week → selection → bowls and playoff rounds → complete). `nextSeason` rolls an open-ended season over with the same rosters.
- **Schedule:** 12 games in 14 weeks for all 138 teams. Rivalries first (16 in rivalry week), conference games to `CONF_RULES`, then non-conference games. Deterministic per seed.
- **CPU game sim:** `simulateDrive` possessions with team ratings, home edge, clock management and overtime; box scores credit the starters by game plan, target share and overall.
- **Standings** with an ordered tiebreaker list; **AP poll** (62 simulated voters: record, strength of schedule, margin, a fading preseason prior, inertia, noise); **CFP rankings** (13 members, no prior); **title games**, **playoff selection** (5 auto-bids, straight seeding, byes from the bracket size), **bowls** by tie-in; **season stats, leaders and five awards** including a weekly Heisman watch; a **news feed**; a **coach job-security stub**.
- **Staff automation:** `autoGamePlan` (pass share from the scheme) and `autoDepthChart`; `SeasonConfig.delegate` decides which ones the user hands off. Everything runs fully automated.
- **Saves:** localStorage, versioned, with zero stats left out (2.8 MB → 1.6 MB for a full season). N on the title screen starts a season and C continues it.
- **Hub screen** (`render/seasonScreen.ts`): header with rank, record and next game; tabs for schedule, scores around the country, standings, AP/CFP polls, news, leaders, awards and the bracket. Space plays the week's game, X simulates it. A live tie is settled by simulated overtime. Checked in headless Chrome: launching a game, the write-back, simming to the end, and continuing a save. No console errors.
- **`npm run season`:** headless seasons → `season.txt` (about 0.7 s per season).
- **Tests:** 9 new in `src/season.test.ts`: schedule validity and determinism; sim ties, determinism, talent and box-score totals; settling a live tie; tiebreakers; poll behavior; seed order; a full season (bracket, champions, bowl eligibility, leaders, awards, history); a JSON round trip mid-season; save packing. 111 in total.
- **First report (5 seasons), flags not tuned:**

  | Measure | Sim | FBS |
  | --- | --- | --- |
  | Points per team per game | 19.2 | ~28 |
  | Yards per team per game | 349 | ~390 |
  | Home win % | 56.7% | ~57% |
  | Overtime % | 3.6% | ~5% |
  | Average wins by tier | T1 10.2, T2 8.8, T3 5.8, T4 6.1, T5 2.8 | |

  - **Scoring is low.** It comes from `simulateDrive`'s gain model, which the live game's CPU drives also use.
  - **Leaders are inflated** (5,000–6,000 passing yards, 2,500+ rushing), because only starters get credit.
  - **The Heisman leans to running backs.**
  - **Live games record only the score,** so the user's players never lead stats or win awards.

## Done: season sim fit to real scores (2026-10-24)
Simulated seasons had too many blowouts and too few close games. Comparing them with every real FBS-vs-FBS game from 2024–25 (1,606 games from ESPN's public scoreboard API) confirmed it was the model, not chance:
- one-score games 29.3% vs 38.0% (about 7 standard errors)
- 28+ blowouts 25.2% vs 18.9%
- 19 points per team vs 26.5
- 6.3% team shutouts vs 1.5%

Method and full tables are in [SEASON.md](SEASON.md) under "Score calibration".
- **Causes:** ratings decided too much (each overall point was worth 2.5 points of margin), and the drive sim had no big plays. It used a symmetric 4.6 ± 6.5-yard gain, so under 1% of plays went for 20+, and a talent edge compounded over long drives.
- **`DRIVE_SIM`** (`game/rules.ts`): 6% explosive plays (15 yards plus an exponential tail), a tighter ordinary gain (± 5), and 0.12 yards per play per overall point (was 0.15).
- **`GAME_SIM`** (`season/simGame.ts`, replaces `HOME_EDGE`): a random per-game pace, and a game script where the leading offense eases off. Without the script, matching the real close-game rate made upsets too common, and matching the upset rate made close games too rare.
- **AP inertia 2.5 → 4.5,** because an unbeaten No. 1 kept dropping after narrow wins.
- **Now** (20 held-out seasons, real values in parentheses):

  | Measure | Sim | Real |
  | --- | --- | --- |
  | Points per team | 26.3 | 26.5 |
  | One-score games | 33.2% | 38.0% |
  | Won by 28+ | 20.1% | 18.9% |
  | Won by 35+ | 11.1% | 10.0% |
  | Team shutouts | 1.1% | 1.5% |
  | Median margin | 14 | 14 |
  | Ranked losses per week | 5.0 | 5.5 |
  | Home win %, conference games | 56.1% | 55.8% |

- **Still off:**
  - Games decided by 3 or fewer: 10.9% vs 16.9%.
  - Top-10 teams beat unranked conference opponents about 89% of the time, against 79.6% (only 108 real games).
  - Yards per team: about 430 vs about 390.
- **The live game changes too.** The CPU's simulated drives use the same model, so an even CPU opponent now scores about 1.9 points per drive (was 1.2). `npm run balance` doesn't cover CPU drives, so it's unaffected.
- **`npm run season`** now prints each measure next to the real value. All 111 tests pass.

## Done: team page, depth chart and player cards (2026-10-24)
- **Team page** (`render/teamScreen.ts`): T or the TEAM button in the season hub; Esc returns to the hub.
  - Header: record, live OVR / OFF / DEF / ST (they update as you reorder), and `DEPTH: YOURS / STAFF`.
  - One tab per position (17); a tab turns orange when someone at that position is hurt.
  - **Depth chart:** one player tab per player, in depth order: the slot he starts at this week (X, Z, SL, LT, NB...; gold strip), or his depth rank, or OUT in red; number, name, position, OVR.
  - **Drag a tab** up or down to reorder (a gold line shows where it lands). Click selects. W/S also selects.
  - **Player card:** name, number, position, archetype (`archetypeLabel`), class, height, weight, hometown, stars, potential, dev trait, injury status, and the slot he's starting at. Then the **OVR breakdown** (`overallBreakdown` in `data/positions.ts`): each rating in that position's overall, heaviest first, with value, bar, weight share and overall points gained or lost against a 75 (they sum to the overall). The ratings that don't count at his position sit in a small grid below. Hover any rating for a plain-language line on what it does (`RATING_INFO.blurb`).
- **Depth chart model:** per position, stored as the existing slot-based `TeamState.depth`, so no save change. `positionOrder` and `reorderPosition` in `data/depth.ts`; see SEASON.md.
- **Delegation:** the first drag (or G) takes the chart from the staff (`setUserDepth`, `delegate.depthChart = false`), so the weekly prep no longer resets it. G hands it back (`useStaffDepth`).
- **Fix: live season games now use the season squads** (`squadFor`) for both teams, so the user's depth chart and both teams' injuries reach the field and the CPU drive sim. Before, the live game always used the generated roster's auto chart. Exhibition games are unchanged.
- **Tests:** breakdown sums to the overall; auto order is by overall; moving a WR to #1 makes him the X; every slot keeps every candidate once; an injured new starter is skipped; an OT move reaches LT/RT and TE2; a user chart survives a week and a JSON round trip, and handing it back restores the staff chart. Every rating has a blurb that fits the card.
- **Not checked by hand yet:** the page in the browser (layout at 640×360, dragging feel).

## Done: playbook page and starred plays (2026-10-25)
- **Playbook page** (`render/playbookScreen.ts`): P or the PLAYBOOK button (left of TEAM) in the season hub.
  - Tabs: STARRED, PASS, RUN, PLAY ACTION. Each shows a 4×3 grid of play cards with the call screen's mini diagram; W/S or the wheel pages through them. Special teams kicks aren't included because they have no formation to draw.
  - **Click a card** to open the detail view. It shows the user's **current starters** (`starters(squadFor(...))`, so injuries and the user's depth chart count) as numbered chips in the formation, with the offense moving up. Each player's job is drawn:
    - routes in color, with an arrow when the route keeps going, a dot when he settles, and a T-bar for lead blocks and play-action fakes;
    - run paths bold white;
    - linemen's blocks as short T-bars, angled by the scheme: forward and playside for zone, wider for stretch, back-side down blocks for gap and trap, back for pass sets (angled for slides);
    - pullers dotted behind the line to the hole;
    - the QB's drop, or his path on a designed run.
  - The panel lists the formation, the scheme and read (`schemeText`), the tip, then each player's position, number, name and job (`jobOf`, 8 characters or fewer). Hovering a chip or a row highlights the other one and shows the player's OVR. A/D steps through the tab, F mirrors the play, Esc goes back to the grid.
- **Starred plays** (`game/starred.ts`): click the star on any card (playbook page or call screen), Space or the button in the detail view. They're stored in their own localStorage key, not in the season, so they apply to every game, exhibitions included. Unknown ids are dropped on load.
- **Call screen:** the formation chips' ALL is replaced by **STARRED**, the tab's starred plays. It's the default chip when the tab has any starred plays; otherwise the first formation is. An empty STARRED chip says how to add plays. The cards' mini diagram moved to `render/playDiagram.ts` (`drawMiniPlay`), shared with the playbook page.
- **Tests:** every play's 11 jobs are non-empty and fit the panel, mirrored too; a puller reads PULL and a pass-pro lineman PROTECT; starred parsing drops junk and unknown ids; toggling a star works without storage.
- **Checked in headless Chrome** (CDP canvas snapshots): the hub buttons, the grid, detail views (Mesh, Power O, PA Boot Flood, Speed Option, Curl Flat), starring by click, and the call screen's STARRED chip. A QB under center is drawn a chip behind the center so both numbers show.
- **Rough edges:** long play names are cut at 16 characters on the grid cards ("I-FORM DEEP CROS"). The option QB's path down the line isn't drawn, only his mesh point. Deep routes run off the top of the field.

## Done: player progression (2026-10-25)
Players now improve automatically during the season; nobody picks attributes. Every team uses the same code. Design notes, the formulas and the calibration are in [PROGRESSION.md](PROGRESSION.md).
- **Drive logs:** `simulateDrive` reports each play to an optional `onPlay` callback without drawing random numbers, so every score is unchanged (tested).
  - `simGame` and `settleTie` collect each game's drives, with the try and kickoff after a score.
  - Live season games log the user's real snaps (gain, pass or run, sack, INT) and kicks, plus the CPU's simulated drives. These go through `advanceWeek(state, result, drives)`.
- **Game grades** (`season/grades.ts`): one grade per player per snap.
  - A win or a loss at his job, less an even player's rate. The odds come from the play's success and his overall against the man across from him.
  - Key players (passer, target and cover man, carrier, tackler) follow the play more closely. Sacks go on a lineman and his rusher, INTs on the cover man. Kicks are graded against make odds.
  - Centered so the average snap grades 0 at every position at an even matchup (within ±0.01).
  - Backups rotate in (`ROTATION`), and package players sub in (`PACKAGES`: TE2 and FB, SAM, DIME). Playing time is measured against a full-time player at the slot, so a rotating DT starter counts as full time.
- **XP:** playing time × (base + grade bonus) × a multiplier clamped to 0.5–2: headroom to potential, dev trait, confidence (last 3 grades), morale (team win %, starting) and class.
- **Level-ups:** 1–3 points at a typical position, scaled per position (`POS_POINTS`, `LEVEL_XP`) so a level-up is worth the same overall everywhere. A 4% breakthrough gives 4–6.
  - Each point is a weighted draw: OVR weight × profile (grow into strengths) × performance tags (deep completions → `dac`, contested catches → `cit`, broken tackles → `elu`, sacks → `rsh`...) × growth rate (speed almost never) × headroom to a per-rating ceiling.
- **State:** `TeamState.progress` (XP, level, all-time deltas, last level-up week, tags, recent grades). `squadFor` applies it and rebuilds the staff depth chart. `nextSeason` carries it over.
- **Week loop:** a new `progress` step after `play`. Breakthroughs make the news: the user's team, plus the two biggest by real players elsewhere each week.
- **Team page:**
  - The OVR breakdown's `+/-` column is gone. **WK** shows a green arrow for a rating raised last week, or a flat line; **ALL** is the all-time change.
  - Grown ratings in the other-ratings grid are green.
  - The card shows `LVL n`, an XP bar and the XP multiplier (hover for its parts). The depth list shows an arrow next to OVR for last week's level-ups.
  - The hub shows last week's level-ups and breakthroughs above the hint bar.
- **Speed:** `squadFor` is cached per team state, `buildDepth` scores each candidate once, and `overallRaw` precomputes its terms. Without these, progression made a season 8.8 s; it's now 1.7 s (was 0.63 s).
- **`npm run season`** has a progression section: overall gained by position for starters and others, levels, breakthroughs, and a flag for any position more than 15% off the mean. 5 seasons: the mean is +2.0 for starters, from 1.8 (DE) to 2.2 (C, P). Scores and polls didn't move outside noise.
- **`npm run balance`:** byte-identical (checked against HEAD).
- **Tests:** 11 new in `src/progression.test.ts`:
  - fairness: XP per game by position within 10%, offense vs defense within 5%, overall per XP within 15%
  - the multiplier clamp
  - points per level-up and breakthroughs; ceilings
  - speed under 2% of points
  - a pocket passer keeps his identity
  - tags steer draws
  - `squadFor` applies deltas and re-sorts
  - a week levels players and marks last week
  - live games progress only through drives
  The save test now checks box-score packing and a 4 MB budget. 132 in total.
- **Checked in headless Chrome** (CDP: new season, sim 5 and 9 weeks, team page, hover, news): arrows, ALL, LVL and XP, the hub line and the breakthrough news all show. No console errors.
- **Flags (not tuned):**
  - Saves grew to about 2.6 MB packed (progression is about 0.9 MB of it).
  - Backups barely grow (0–0.3 a season): they need the offseason.
  - The WK arrows clear after a bye week, since they mean "the last week played".
  - The AP preseason prior now reads the current roster, so it drifts slightly as players grow (it fades out by week 9 anyway).

## Done: grades against the expected outcome (2026-10-25)
**Bug:** game grades rewarded winning.
- They were centered on the league-wide success rate (0.56) and on an even player matchup. So a strong team's offense, which succeeds more against a weak defense, and any player out-rated by his man's opponent graded well just for the matchup.
- Template teams at 88 against 68: the strong team's starters graded +0.21 a snap and earned 162 XP a game; the weak team's graded −0.22 and earned 33. That's 5×, and it compounds as the strong team improves.

**Fix** (`season/grades.ts`):
- Every snap is graded against the win rate expected for that player in that matchup (`expectedWin`): his overall against the man across from him, and the success rate expected for this offense against this defense, home edge included.
  - That success rate is `expectedSuccess`, a logistic fit on 3,000 simulated games between real rosters (`successBase` 0.254, `successPerPoint` 0.0365 per point of offense-minus-defense rating).
  - A block held against an elite rusher is now worth more than against a weak one.
- One-on-one reps (`PAIRS`: line, receivers and corners, TE and SS, back and WILL) are one draw, and the defender's grade mirrors it.
- A sack now tags the rusher who beat his man instead of forcing a loss on a lineman.
- Punts and kickoffs are graded against the kicker matchup's expectation, not a flat 0.5.

**After:**
- Strong and weak teams both average 0 per snap (±0.003) and earn 97–98 XP a game at 88 vs 68, 80 vs 80, and 68 vs 88.
- In live games, the user beating the expected success rate still raises the offense's grades.
- 5 real seasons: starters gain +1.95 (positions 1.80–2.18). By tier: T1 2.04, T2 2.08, T3 2.00, T4 1.90, T5 1.73. The remaining slope comes from the multiplier's morale (team win %, which you specified) and from better dev traits on better players, not from grades. `npm run season` now prints the tier line.
- Scores are unchanged (grading draws on its own random stream).

**Tests:** 3 new: a strong team beating a weak one earns the same XP (within 5%) and grades about 0; expectations by matchup (a held block is worth more against an elite rusher, and the defense's expectation mirrors the offense's); beating or missing the expected result grades above or below 0. 135 in total.

## Done: soft potential ceiling, empty breakthroughs fixed (2026-10-25)
- **Problem:** potential wasn't much of a ceiling.
  - The XP multiplier bottomed out at 0.5, so players at potential kept leveling about as often as anyone.
  - Only the per-rating ceilings held them, and those allow about +2 overall from `ceilMargin` plus whole-point steps.
  - Measured over 4 open-ended seasons: up to 4.5 overall past potential, and 58% of leveled players over it by season 4.
- **Fix:** potential stays a soft ceiling, not a hard cap. A new `potentialFactor` scales the XP multiplier after its 0.5–2 clamp:
  - 1 with a point or more of room
  - `atPotential` (0.15) at potential
  - halving for every point past it
  A full-time starter at potential gets about 0.08× XP, about one level-up a season, and each one can still be a breakthrough. The card's hover shows AT POT.
  - **After:** at most 1.5 past potential in 4 seasons. Players starting a season at potential level 0.1–0.3 times in it.
- **Bug fixed:** a level-up where every rating was already at its ceiling still counted as a level. If it rolled a breakthrough, it made the news with no points (8 times over seasons 3–4). Now such a level-up spends its XP but isn't a level, an arrow or a breakthrough.
- **Season report:** starters gain +1.58 a season (was +1.95). Upperclassmen near potential now slow down sharply.
  - **Flag:** the punter row is 17% over the mean (it was already the highest). Not tuned.
- **Tests:** 2 new: the potential factor (1 with room, 0.15 at potential, halving past it, never 0, and the total under the floor); an all-at-ceiling level-up is no level, no event and no breakthrough. The clamp test now checks the floor for a player below potential. 137 in total.

## Balance baseline
From `npm run balance` on the **reference matchup** (template players, offense 90 vs defense 88; `referenceMatchup` in `src/harness.ts`), after the ratings and roster work. The earlier baselines used the old generated Georgia and Alabama rosters, which had a lucky 99-elusiveness back; compare against this one from now on. The single-seed 120-rep rows below move a few points from run to run.
- **Pass and PA rows:** the auto-QB throws to the most open receiver after a fixed hold time, aiming in bounds.
- **Run rows:** the auto-QB hands off as soon as it can (it reads the zone-read key, waits out the draw, and pitches the option on the key), and `autoRun` reads the line for a lane. It doesn't steer around tacklers, so expect real players to do better.

| All pass plays, defense | Hold | Comp | INT | Sacks | YPP |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | 1.2s | 70% | 5.0% | 0/120 | 4.7 |
| 2 Man Under | 2.2s | 68% | 5.3% | 6/120 | 6.3 |
| Cover 1 Robber | 2.2s | 66% | 4.4% | 7/120 | 6.6 |
| Cover 0 Blitz | 1.2s | 70% | 4.2% | 0/120 | 6.6 |
| Cover 0 Blitz | 2.2s | 58% | 7.7% | 94/120 | -1.1 |

| PA plays (dropback), defense | Hold | Comp | INT | Sacks | YPP |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | 2.2s | 70% | 7.0% | 5/120 | 7.4 |
| Cover 1 Robber | 2.2s | 71% | 4.5% | 8/120 | 7.7 |
| Cover 0 Blitz | 1.2s | 68% | 5.0% | 0/120 | 14.5 |

**Runs:**
- All 26 run rows (with RPO gives and QB runs): 3.6 YPC, median 2.1, 16% stuffs, 20% gaining 4+, 8% gaining 10+.
- The original five runs (IZ, OZ, Power, Toss, Zone Read): 4.4 YPC, median 2.8, 12% stuffs, 28% gaining 4+, 11% gaining 10+. The FBS target is 4.5-5.5 YPC, about 18% stuffs and about 45% gaining 4+.
- Since the return fix, the same seed reads 3.4 YPC on all runs and 4.0 on the core five, but that's RNG reshuffle, not a change in the run game (see the return-fix section). Across seeds the core five run 4.0-4.4.

**Short yardage (3rd and 1):** Power 69-78%, Iso 82-85%, QB Sneak 82-89%, QB Power 58-63% (14% against Cover 0).

The per-play `RUN` and `PLAY` rows in `balance.txt` have the details. Reading the defense still matters: don't pitch into the zero blitz, and don't hold the ball against it.

### Future tuning targets: NFL results by route
The NFL completion %, yards per target and man/zone splits by route are in [TARGETS.md](TARGETS.md). They're not tuned toward yet; they belong with the defense work.
These need a harness that targets by route (or by read), not "most open". The current one over-throws flats and checkdowns. The `ROUTE` rows are a first step: they target one route per row, against man calls only.

**Special teams** (after the return fix): an auto-kicker with fixed aim per kick type and perfect meter timing, 200 reps each, in random wind. Kicks use their own seed, so the scrimmage rows don't move.

| Kick | Result |
| --- | --- |
| Punt from own 30 (full power) | Gross 42.4, net 40.6. 68% fair caught, 5.5-yard average return, 0 blocks, 0 return TDs |
| Pooch from opp 40 (74% power) | 80% inside the 20, 87% fair caught, 6 muffs recovered |
| Coffin corner from opp 38 | 99% inside the 20: 55% out of bounds, 27% touchbacks |
| Line drive from own 30 | Gross 45.8, net 35.5. 98% returned (10.4 average), 1 returned for a TD |
| Deep kickoff | 76% touchbacks. CPU starts at its 23.6; 14.5-yard average return |
| Sky kickoff | CPU starts at its 30.9. 14% fair caught |
| Squib | CPU starts at its 35.3. 3 returned for TDs |
| Corner kickoff | CPU starts at its 23.1. 10% out of bounds |
| FG, straight aim, calm | 20-29: 96%, 30-39: 88%, 40-49: 72%, 50-59: 35% |
| FG, straight aim, wind | 20-29: 94%, 30-39: 78%, 40-49: 65%, 50-59: 41%. The auto-kicker doesn't allow for wind |

## Done: health and injuries (2026-10-25)
Design, research and targets: [INJURIES.md](INJURIES.md).
- **Health from 0 to 100** (`TeamState.health`, `Athlete.health`). After each game, every snap and every hit can knock it down by 10–30 points. It recovers 12 a week, or 25 a week sitting out.
  - A banged-up player plays at `fitRatings`: −0.2 per point lost on speed, acceleration, strength and stamina, and −0.08 on the rest. That reaches the live sim, team ratings, the game sim and the grades.
  - He also runs more injury risk.
- **Injuries** (`season/injuries.ts`) are rolled from each game's grades. `GameGrade` gains `hits`: carries, catches, tackles made, sacks taken and made.
  - Severity runs from 1 week to season-ending, with a type label. Players come back at 85 health.
  - Every injury goes into `SeasonState.injuryLog`, with news for the user's team and the worst injuries to real players elsewhere.
  - Live and simulated games use the same model, after the game.
- **Rest.** The staff chart (CPU teams and a delegated user chart) sits a starter below 80 health when the backup is within 4 overall. In the grades, a hurt starter's backup takes more of his snaps (`ROTATION_HURT`). The user's own chart is never reshuffled; they drag to rest players.
- **Team page.** Banged-up players show health % in orange. The injured sit in an **INJURED: OUT** section below the depth list (`3W`, `SZN`): selectable, not draggable, and they keep their place for when they're back. The card shows `BANGED UP: 72% HEALTH` with the playing overall (healthy overall under it), or `OUT 3 WEEKS: HIGH ANKLE SPRAIN`.
- **Setting:** `SeasonConfig.injuries` (OFF / LIGHT / NORMAL), cycled with I on the title screen for a new season.
- **Season report:** a new INJURIES section, with `INJURIES=light|off`. NORMAL results: 10.4 starter-games lost per team-season (target 10–12; real is about 18–20). The starting QB plays every game in 82% of seasons. 0.58 season-ending injuries per team. 12% of starters are banged up on a given week. Position shares are within 2 points of the NCAA ISP. LIGHT: 5.2 starter-games lost, and the QB plays every game in 90% of seasons.
- **Side effect:** starters' progression over a season is about 8% lower (1.58 → 1.45 mean), and backups' is higher. No position is newly flagged. `npm run balance` is byte-identical.
- **Tests:** 8 in `src/injuries.test.ts`:
  - OFF is clean;
  - NORMAL is deterministic and survives a JSON round trip;
  - an injured player sits, comes back banged up, then heals;
  - `fitRatings` and team ratings drop;
  - staff rest for a close backup but not a weak one;
  - the user chart is untouched;
  - QB risk is lower than RB risk;
  - the OUT section and the drag index mapping.

  145 tests pass in total.

## Done: confidence, next man up, breakouts (2026-10-25)
Design, tuning and calibration: [CONFIDENCE.md](CONFIDENCE.md).

**Confidence** is a per-player value from -1 to +1 (`Progress.c`). It replaces the XP multiplier's "last 3 grades".
- **How it moves:** after each game it shifts toward how he played against expectation. That's an EMA of a z from his game grade, with big snaps weighted by `1 + leverage` (`GameGrade.lsum`/`lw`). Half of it carries into a new season.
- **On the field (`data/confidence.ts`):** it shifts every rating but speed, acceleration, strength, stamina, arm and leg, scaled by the snap's **leverage**:
  - leverage parts: third or fourth down, the red zone, late and close, long FGs
  - size at ±1 confidence: about ±0.5 OVR on an ordinary snap and ±3 at full leverage
  - the live game shifts both rosters per snap (`clutchRoster`), and the HUD shows `CLUTCH` with the QB's or kicker's label on big snaps
  - the drive sim shifts each snap's rating gap by the units' confidence (`simulateDrive`'s `conf`, from `teamConf`) and the kicker's FG odds. It draws no extra random numbers.
- **Grades expect it** (per-snap expected success and FG odds), so it can't feed itself. A confident team still grades about 0 (tested).
- **Staff charts:** `slotScore` weighs confidence, so slumping starters can lose their job to a close backup. Last game's starters (`TeamState.st`) keep an incumbent edge, so the chart doesn't flip-flop.

**Next man up:**
- **Who sparks:** a new starter who was quiet (no start in the team's last 2 games, under 3 this season, no injury this season, no spark yet this season).
- **Earned reasons only:** the man he replaced is injured, slumping (built-up confidence -0.35 or lower) or outplayed (overall no better than the new man's).
- **What he gets:** +0.5 confidence on the field from his first start. `newStarters` is pure, so `squadFor` shows it before the game. Good starts lock half of what's left in; bad ones halve it. It lasts 3 starts.
- **Rest days are neutral:** a banged-up starter sitting out gives no spark and no penalty.
- **News** on the user's team.

**Breakouts:** a sparked player who starts 3 of the next 4 games at a mean z of 0.55 or better gets:
- a dev trait up (`Progress.dev`)
- +2 potential (`Progress.pot`; ceilings follow)
- a forced breakthrough level-up (`levelUp`'s `force`)
- news: always for the user's team, the top two elsewhere

Once a career.

**Anti-farming:**
- Benching a healthy, in-form, better starter fires nothing.
- When the user's chart does it, the starter takes a fading benching penalty (`Progress.bh`). The staff never do it.
- The slump test ignores that penalty, so benchings can't manufacture a slump.
- The season report's **FARMING CHECK**: swapping Georgia's QBs every week fires 0 sparks, and an injury fires 1.

**UI:**
- **Card:** a CONF row (bar, label, SPARK, BREAKOUT year, hover explains it). The ratings block moved down a line and the grid tightened to fit.
- **Depth list:** chevrons for strong confidence.
- **Hub line:** breakouts and next man up.
- **Checked in headless Chrome:** the card, the WR list, the hover, the hub and the CLUTCH tag. No console errors.

**Season report, 5 seasons** (new CONFIDENCE and FARMING CHECK sections; `SeasonState.confLog` records sparks, user benchings and breakouts):
- **Confidence spread:** starters' SD 0.31, 4.5% beyond ±0.6.
- **Sparks:** 4.2 per team-season (injured 2.4, slumping 0.8, outplayed 1.0). 9.9% of them break out, 57 breakouts a season nationally.
- **Slumping QBs:** benched in 8.8% of team-seasons.
- **First tuning pass:** a rest-day reason gave 8.5 sparks a team-season by itself and was dropped.
- **Scores** are unchanged within noise (26.2 points per team, 34.0% one-score games).
- **Progression:** the mean starter gain fell from 1.45 to 1.40, because starters lose a few games to slump benchings and sparked backups. The punter row stays flagged (29% over; 28% before). The kicker sits at 14%, just under the line.

**Checks:**
- `npm run balance` is byte-identical against HEAD (checked in a scratch worktree).
- **Tests:** 16 new in `src/confidence.test.ts`:
  - leverage
  - the shift spares physical ratings
  - zero confidence leaves drives unchanged, and a confident offense scores more late
  - no feedback in the grades
  - the slump bench and the incumbent edge
  - the EMA
  - the injured backup's spark, before and after the game
  - lock-in and fade
  - benching an in-form starter
  - repeated benchings never spark
  - slump vs. rest day
  - outplayed
  - no spark after an injury or twice in a season
  - breakouts
  - a save mid-season continues identically

  161 tests pass.

## Done: morale (2026-10-26)
Design, tuning and calibration: [MORALE.md](MORALE.md).

**Morale** is a per-player value from -1 to +1 (`TeamState.mo`). It's how a player feels about his situation, and it's separate from confidence (how he feels about his own play).
- **Drivers:** each pulls toward a target, weighed by his temperament.
  - **Role vs. expectation:** from the depth chart. Expectations come from class and stars (a 5★ freshman expects snaps, a walk-on doesn't), capped by what his talent earns. A backup within 2 OVR of the starter feels buried.
  - **Team mood:** form, AP rank, losing streaks, rivalry results, bowl eligibility, the playoff and postseason wins. It's computed from results.
  - **Coach decisions:** losing the job (any chart, scaled by pride) or winning it, fading.
  - **Locker room:** teammates' morale weighted by voice (leadership × class × starting).
- **Hidden temperament,** drawn from the player's id and never stored: baseline, pride, team-mindedness and leadership. The card shows one word: LEADER, MOODY, PROUD, LOYAL or MELLOW.
- **Slow:** each team game moves it 15% of the way to its target, plus a small nudge from its own RNG stream. Half of the distance from baseline carries into a new season.
- **Never reads grades,** so it doesn't track confidence (r = 0.006 across starters).
- **Effect:** the XP multiplier's morale factor is now `1 + 0.1 × morale` (practice effort). It replaces the win % and starter placeholder.

**UI (team page):**
- **MOOD row on the card:** a pixel face in blue or gold, the mood plus the biggest reason (`FRUSTRATED: EXPECTS TO START`), and the temperament word. Hover explains morale and the word.
- **Depth list:** a blue frown for players at −0.4 or lower.
- **Header:** the team's mood.
- **Layout:** to fit the row, the OTHER RATINGS grid lost its header line (a rule now), and the breakdown moved up 3 px.
- **No news items,** by choice.

**Season report** (new MORALE section, 5 seasons):
- SD 0.21, with 0.6% beyond ±0.6 and none beyond ±0.9.
- 4.0 unhappy players a team, spread out: the worst 10% of teams hold 22.6% of them (the first version had 60%).
- Starters' morale vs. confidence: r = 0.006.
- 84% of the unhappy are unhappy about their role.

**Checks:**
- **Side effects:**
  - The mean starter gain is 1.39 (was 1.40), and the tier line is a little flatter.
  - **Flag:** breakouts went from 57 to 65 a season (about 2 SD). This is probably the knock-on of different XP. Not tuned.
  - Scores, injuries and confidence are otherwise within noise.
  - A season sims in 2.60 s (was 2.32). A new `positionOrders` (`data/depth.ts`) builds every position's depth order in one pass.
- `npm run balance` is byte-identical.
- **Tests:** 13 new in `src/morale.test.ts`:
  - temperament
  - expectations: 5★ vs. walk-on, senior starter, close backup
  - the role term
  - a senior backup sours and a walk-on doesn't
  - slow movement and settling
  - team mood (winning, a losing streak, a rivalry win)
  - benching hurts on any chart, the job lifts, and both fade
  - no benching for an injury or rest day
  - an unhappy leader drags the room
  - confidence leaves morale alone
  - the XP factor
  - the reason is the biggest driver
  - a save continues identically, and the offseason carry

  The save test's two full seasons got a 20 s timeout: they were already near the 5 s default. 174 tests pass.
- **Checked in headless Chrome:** the MOOD row, hover, header and depth-list frown on QB, MLB and WR cards (a 4★ freshman, eighth on the WR chart, reads `MISERABLE: WANTS MORE SNAPS`, MOODY). No console errors.

## In progress
- Nothing right now. Not checked by hand yet: playing a full game with the new rosters, or a whole season through the hub with real keyboard play (the hub was driven by scripted key presses in headless Chrome).

## Known bugs and rough edges
- **Talent gaps are far too steep in the live sim** (see the ratings and rosters flags): a 32-point overall gap turns nearly every run into a TD. Needs compressing before seasons.
- **The run game swings about 1 YPC on a few points of the back's elusiveness and strength.**
- **Injuries are rolled after games only.** The user's live games have no mid-game injuries; that waits for mid-game roster changes. Knocks have no body-part label. Real players listed as injured in the research (for example Sayin) start the season healthy. The QB missing 3+ games rate (5.7%) is a bit under the ~8% aim, on purpose.
- **Confidence only moves between games.** Live games have no in-game swings (a pick shaking the QB for a few drives) and no mid-game substitutions, so next man up works week to week. The user's live-game starters spark like everyone else, but a sim-game backup's breakout is luck around the expectation, by design.
- **Breakouts are common nationally** (about 57 a season, about 0.4 per team-season). The news shows the user's and two elsewhere a week. If they feel too frequent, `BREAKOUT.z` is the lever.
- **Progression is in season only:** no offseason growth, graduation or aging yet, and players who don't play (redshirts, deep backups) don't grow. A full season packs to about 2.6 MB, half the localStorage limit. Details in [PROGRESSION.md](PROGRESSION.md).
- **Season placeholders** (details in [SEASON.md](SEASON.md)): too few games decided by 3 or fewer (11% vs 17%), yards per game high (about 430 vs 390), stat leaders inflated (only starters get credit), the user's live games record no player stats, N on the title screen overwrites the saved season without asking, divisions and real bowl selection orders aren't modeled, and an open-ended season rolls over without an offseason.
- **Research class years and redshirts are partly guessed,** and several QB situations were in flux on Oct 24 (ROSTERS.md).
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
- **WR stalk blocks lose the matchup quickly:** in `runEngagement` the defender's side is `str*0.7 + spd*0.3`, and the WR adds only his `blk` (about 45). A fast corner wins by about 30 points and sheds at about 2.3/s. On stretch plays the WR also takes the lineman's `REACH_PENALTY`. Perimeter blocks now form and last longer than before, but they still don't hold long. Not tuned: consider a stalk-block rule (the WR only has to stay between, not drive) or no reach penalty for non-linemen.
- **CPU drives don't take timeouts,** and the user has no two-minute tools.
- **No zone underneath coverage:** defenses are man or deep zones only.
- **RPOs are still a run plus a tagged route.** There's no read on a defender yet, and the harness measures only the give.
- **Zone-read keeps are weak for the auto-runner** (about 0 YPC even on a correct read). Blocks on the backside don't hold up once the QB pulls it: the X never reaches a corner who's fitting downhill, and blocks more than 8 yd from a deep QB on his backside shed at once. Keeps were unchanged by the perimeter-block fix. A human steering the QB should do better; check by playing before tuning.
- **The read key's crash is a coin flip.** It doesn't depend on the call, the down, or the key's awareness yet.
- **A user can hand off on any pass play** (the old "call a draw" behavior). `read` could gate this later.

## Next up (rough priority)
1. **Compress talent gaps in the live sim** so a 90 vs 60 game is lopsided but playable (speed, tackling and block-power curves), then check every tier pairing with the real rosters.
1. **Fill in the season framework** ([SEASON.md](SEASON.md)): record the live game's box score; spread box-score credit to backups; non-conference scheduling that pairs strong programs with weak ones, as real schedules do; mid-game injuries and substitutions in live games, and seeding the researched real-world injuries at season start; morale's next hooks (talking to players and promises, captains, position-change offers; then the transfer portal and recruiting read it: see MORALE.md's "not built yet"); more on the team page (season stats on the card); a game plan screen (the `delegate.gamePlan` flag is ready); then the offseason: graduation, offseason growth (in-season progression is done; see PROGRESSION.md), recruiting from `stars`/hometowns, and the coaching carousel. Practice focus can plug into the progression draw (`focus` in `pointWeight`).
1. **Fix the flagged plays:** Power Read, Draw, QB Power, Pin-Pull Sweep and Counter GT (diagnoses are in the flags above). Then review Go Post and PA Boot Flood against single-high.
1. **Run game, round 2:** raise the 4+ rate toward about 45%. Look at second-level fits against climbers, and at yards after contact. Play IZ, Power and Counter by hand before tuning.
1. **Harness:** target by route or read instead of "most open". Then use the NFL per-route completion table as balance targets, together with the defense work.
1. **An RPO read on a defender,** and give the harness a pull decision.
2. Clock tools: timeouts (3 per half), spike, kneel, college overtime.
3. Run-defense calls (8-man box, run blitzes; light boxes are currently too easy to run on) and zone coverages (Cover 2, 3, 4, and underneath zones) and smarter defensive play-calling by down and distance.
4. Playbook UI, part 2: filter by situation (short yardage, red zone, 2-minute).
5. Special teams, part 2: playable kick and punt returns, onside kicks, fakes, a real free kick after a safety, and CPU 4th-down decisions shown as actual kicks.
6. Pre-snap reads and audibles beyond Esc (hot routes, protection slides).
7. Sound, and packaging as an .exe with Electron or Tauri.
