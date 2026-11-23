# Engine drives: every snap of your games through the engine

Today every CPU possession in a live game, and every snap of a simulated game, comes from the drive sim (`simulateDrive`, game/rules.ts). It's a team-overall gap plus noise, with no calls, schemes or coaches. So your DC, his identity and the learning brain never touch what the opponent gains.

**The goal:** every snap of the user's games runs in the engine, played or simulated:
- The opponent's OC calls from his book.
- A CPU QB reads the field.
- Your DC calls the defense with the same brain the CPU uses against you.

CPU-vs-CPU games stay on the drive sim, with a DC and scheme edge fitted from the engine.

**The hard part is calibration.** The drive sim is fit to real FBS scores, so the engine has to land on its numbers before it replaces anything. The full roadmap (phases 0–7) is in the plan; this doc holds the tool, the bands and the measurements.

## Phase 0 (built 2026-11-14): the CPU offense, one drive, the report
**`game/cpuOffense.ts`:**
- **`ocCall(oc, situation, rng)`:**
  - Pass or run by `passOdds` (the game plan's pass share, moved by down, distance and tempo).
  - Then a play of that kind from the OC's book by `callWeight` (style × `CALL_SITUATION`).
  - Short-yardage plays come only on short yardage. A last-snap heave is a shot.
  - `bookPick` and `callSit` are shared with the key-play replays (`replay.ts`, same draws as before).
- **`CpuQb`, the QB, a step at a time** (`CPU_QB`). He decides only from the field:
  - **When his read opens:** by family (`window`).
  - **Who's a target:** a receiver is one once his head is around (`eyes`, from `Player.eyes`). Throwing before the break costs, as PASSING.md says.
  - **The window:** where the ball would meet the receiver (`cpuAim`), and how far the nearest defender is from that spot when it arrives, each closing at top speed after `react`. A short throw is open at `open` yd, plus `openPerYd` a yard deeper.
  - **High to low:** a dropback or shot reads deep first (`floor` by family), and the floor comes down `fall` yd a second. On 3rd and 4th down he looks past the sticks until his hold runs out.
  - **Under pressure, or past `hold`:** the most open man if his window is at least `check`, else a scramble (`spd` and room), else a throwaway, else the sack.
  - **Ratings:** his `prc` sets how fast he scans (`scan`), how long he holds (`hold`), how far off his read is (`noise`: he sees windows that aren't there), and how often he throws it away rather than eat a sack.
  - **RPOs:** the presnap box count against his blockers gives or pulls (`rpoPull`). A pull throws the tagged route at `rpoHold` if it's open, else he reads the rest.
  - **Runs** give by `Play.giveDue`, as the harness does. Whoever has the ball after that runs on the AI (`autoRun`). A scramble is steered on the auto-runner's line.
  - **His misreads** come from his own stream, so the play's stream isn't touched by how he reads.

**`game/engineDrive.ts`:**
- **`engineSnap`:** the defense's call, exactly as `Game.toCall` makes it for the CPU defense:
  - `callFor` with a brain (else the identity's `situationMix`), a line game, press, a disguise
  - the OC's call, the presnap check, the leans and anticipation
  - a `Play` stepped with the `CpuQb` to the end
- **`engineDrive`:** a possession on the drive sim's coaching (`tempo`, `fourthDown`, `kickNow`, `desperate`, kneels).
  - Downs and spots come from `applyOutcome`. The clock comes from `SNAP_SECS` (the drive sim's scale: a stopped clock, a running one, hurry, milk).
  - **Out of bounds** stops the clock only inside 2:00 of a half (NCAA). Before that, the clock starts again on the ready signal, so the snap costs a running snap less `SNAP_SECS.oobReady` (7 s). It used to be a full stop all game.
  - **Spikes:** after an in-bounds snap with the clock running, `spikeNow` (game/situation.ts, the drive sim's rule, see SIMULATION.md) may spike the next one. The snap costs `SNAP_SECS.spikeRun` (the play and lining up to spike) in place of its draw, and the spike costs `SNAP_SECS.spike`. It's logged as a play with `spike` and no `EngineSnap`, then the usual `kickNow` and 4th-down checks run. That also lets a 1st-down gain set up the last-second kick.
  - **The two-minute drill** (`clockOut`: the hurry-up inside 2:00) plays to stop the clock:
    - The `Play` gets `clockOut`. Past the line, the auto-runner (a receiver after the catch, a back, a scrambling QB) turns for the nearer sideline once he's within 14 yd of it or someone's closing (`OOB_RUN`, sim/ai.ts).
    - The CPU QB scores a catch spot within 9 yd of a sideline 3 yd better, and throws it away 3× as readily rather than take a sack (`CLOCK_OUT`, game/cpuOffense.ts).
    - It's off everywhere else, so the film room, the balance report and the user's snaps are untouched.
  - The defense's brain watches every snap (`observe`).
  - It returns the `DriveSim` shape, plus `defPoints` (pick sixes, safeties) and an `EngineSnap` per snap: the play, call, tags, gain, outcome, target, carrier, tackler, takeaway, and the QB's log.
- **Kicks are still the drive sim's:** field goals by `fgOdds`, punts by the caller's net. (Engine games play their kickoffs and punts since 2026-11-15: "Kicks in engine games".)
- **Lost fumbles (`FUMBLE`):** the engine never loses a fumble, so one is rolled per tackle (more on sacks), by the tackler's `tkl` against the carrier's `str`. It's a placeholder until there's a mechanic.

**`npm run drives` → `drives.txt`** (`src/drives.ts`, about 15 s for 60 games; `DRIVES_GAMES=n`):
- **The matchups:**
  - random pairs of the 138 programs with their generated rosters
  - their OCs (style, book, pass share) and DCs (identity, ADJUST, SCOUT)
  - each defense's brain on at NORMAL, built as `Game` builds the CPU's
- **Two arms over the same pairs:** each game is played by the engine and by the drive sim (simGame's loop: halves, pace, the script, the next start). There's no home edge and no overtime.
- **Sections:**
  - **BY GAP** (offense minus defense overall), per drive: points, how drives end, plays, ypp, 20+, turnovers a play, 3rd down
  - **ENGINE PASS AND RUN:** dropback share, completion, ypa, interceptions, sacks, scrambles, throwaways, ypc, lost fumbles
  - **GAMES:** the favorite's win % and points per team by overall gap
  - **BY OC and DC STYLE**
  - **BY HALF:** do the brains learn
  - **THE QB:** why he threw, throws by depth, release time

### The bands (the gate before the engine goes in, Phase 3)

| Row | Band |
| --- | --- |
| Points per drive, every gap bucket | within ±0.15 of the drive sim |
| Favorite win % by overall gap | within ±5 points of the drive sim |
| Points per team a game | the drive sim's (about 28) |
| 20+ yard plays | 4–7% of plays |
| Turnovers | 1.6–2.6% of plays (FBS: about 0.8 interceptions and 0.6 lost fumbles a team a game) |
| Completion | 58–66% |
| Sacks | 5–8% of dropbacks |
| Run ypc | 4.5–5.5 (TARGETS.md) |
| Deep throws (20+ air) | about 12% of attempts, about 35–40% complete |

## Baseline (2026-11-14, 60 games)

| | Sim | Engine |
| --- | --- | --- |
| Points a drive | 2.20 | 2.25 |
| Plays a drive | 6.0 | 4.5 |
| ypp | 6.1 | 7.8 |
| 20+ plays | 4.1% | **12.8%** |
| Turnovers a play | 2.4% | 2.4% |
| 3rd down | 46.7% | 40.1% |
| Points a team a game | 27.9 | **38.4** |
| Favorite win %, all games | 73 | **86** |
| Gap −8 or worse / +8 or better, points a drive | 1.26 / 3.25 | 1.02 / 3.55 |

**Engine QB:**
- completion 61.7%, ypa 11.5, interceptions 3.8%
- **sacks 1.6%** of dropbacks, scrambles about 0
- throwaways 2.4%
- release median 1.8 s
- **36% of attempts travel 20+ yards in the air**, and they complete 56%
- ypc 4.5

It takes about 250 ms an engine game, so SIM GAME through the engine is cheap.

**What it says.** Points per drive land on the sim's only by accident: the engine scores on fewer, faster drives made of big plays. In order of size:
1. **The deep ball is far too good** (Phase 1, item 3). The QB isn't cheating: he throws when his projected window is open, and his estimate of how fast defenders close is generous to the defense. Deep receivers are often the most open men on the field at 1.5–2 s. It's the same softness as "zones at a 2.2 s hold" in DEFENSE.md, and the separation flags in PROGRESS.md.
2. **Drives are short** (4.5 plays), so there are more of them (about 32 a game against 25) and teams score 38. It follows from 1. Also check `SNAP_SECS` once the big plays are in line.
3. **Sacks are a third of the target.** The QB gets the ball out at 1.8 s, and pressure in the engine arrives around 2.9–3.1 s (PROTECTION.md). Revisit once the deep ball stops being open early, since that's what lets him throw early.
4. **Talent gaps are a bit steeper** than the sim's: the favorite wins 86% against 73%. It's the known "talent gaps too steep" item, milder than feared.
5. **DC style barely moves anything** (2.24 / 2.25 / 2.26 points a drive for aggressive / balanced / soft). That's the point of Phase 2, and of Phase 1's check that identities matter.
6. **The sample is mostly spread offenses,** since that's FBS: Power has 19 drives. A future option is to sample pairs by style.

## Phase 1, first pass (2026-11-14): the QB, man coverage, speed
**Tools added to `npm run drives`:**
- ENGINE DEEP THROWS: by call and by route, with the window and the separation at the throw
- the throws by why and by depth, with air yards and YAC a catch
- ENGINE RUNS by family
- `DRIVES_IQ=STATIC` (brains off)
- **`DRIVES_UNITS=1`, the unit swap.** In 12 lopsided pairs (overall gap 10+), the weak side borrows one of the strong team's units (QB, OL, REC, RB, DL, LB, DB) and the change in points a drive is measured. `DRIVES_SPLIT=1` splits the defense's units by rating group.

**The QB (`CPU_QB`; his side only).**
- **Depth at the catch point, not where the receiver is now.** A go route at 12 yd is caught at 25.
- **The progression:**
  - `floor`: where it starts, by family
  - `reach`: how deep a call's read counts depth; past it he takes the most open man
  - the checkdown is caught no deeper than `checkDepth`
- **Decisions on his scans** (twice as often with a rusher on him), so a new misread isn't drawn every step. Drawing one every step made throwaways near-certain under pressure.
- **His aim trails a moving receiver as a user's line does** (`aimLag`'s tau × the receiver's speed, `lag`).
- **Throwaways** by `awayPerScan`.
- **The result:** 20+ air attempts went from 36% of attempts to 22%. Release median 1.8 s. Sacks went from 1.6% to 8–9% of dropbacks, throwaways from 9–11% to 5.6%.

**Man coverage trailed every vertical (`MAN_TRAIL`, sim/ai.ts; the user's games too).**
- A man defender plays his receiver as he saw him a reaction lag ago (by `mcv`). He aimed at that lagged spot itself, so on a straight vertical he sat speed × lag (1.5–2.5 yd) behind the whole way and never closed.
- Now the lagged spot is carried `lead` (0.5) of the lag along the receiver's lagged velocity: the lag costs more on a break than on a straight line.

Balance, a 2.2 s hold (ypp):

| Lead | 2 Man Under | Cover 1 Robber | Cover 1 Fire | PA vs Cover 1 Robber |
| --- | --- | --- | --- | --- |
| 0 (before) | 8.2 | 12.6 (YAC 7.9) | 15.1 | 17.3 |
| 0.5 | 7.1 | 8.9 | 10.4 | 13.4 |
| 1 | 6.2 | 4.2 | 5.7 | 10.5 |

At 0.5, man lands beside the zones (6.5–10), about the NFL's parity (TARGETS.md: yards a target about the same in man and zone). Lead 1 made the slant against man 30% (NFL 63%). The forced-throw ROUTE rows tighten a few points. Engine deep throws against Cover 1 Robber went from 81% complete (35 ypa) to about 56%.

**Talent gaps: speed counted for nearly everything (`SPEED.squeeze`, sim/player.ts; the user's games too).**
- **The unit swap** (lopsided pairs, before):

  | Measure | Points a drive |
  | --- | --- |
  | Strong offense vs weak defense | 4.25 (the drive sim gives about 3.3 at these gaps) |
  | Weak defense borrows the DBs | −1.68 |
  | Weak defense borrows the DL | −1.00 |
  | Weak defense borrows the LBs | −0.53 |
  | DB speed alone | −0.92 |
  | DL speed alone | −0.55 |
  | LB speed alone | −0.37 |
  | DB coverage ratings | −0.41 |
  | Ball skills | about 0 |

- **What that means:** a T1-to-T5 speed gap (about 11 points: CBs 97.6 / 86.7) is a realistic 0.46 yd/s, but pursuit, closing and trailing turn it into the play.
- **The fix:** `maxSpeed` pulls each player's speed toward his position's typical speed (`mid`) by `squeeze` (0.6). Same-position gaps count 60%. A receiver's edge over a backer is the positions' gap, untouched.
- **After:** strong offense vs weak defense 3.48; weak D borrowing DBs −1.16, DL −0.59.
- **Balance:** GAP −20 run 13.8 → 9.3 ypc, Georgia 88 vs Kent 65 18.1 → 11.8. Even and harder rows, POCKET (pressure 3.07 s) and ADAPT hold.

**`FUMBLE`:** carry 0.007, sack 0.05; lost fumbles about 0.8% of plays.

`npm run film` was rerun, so `src/data/filmPayoff.ts` is rewritten for the coverage change. `npm test` passes.

### Where it stands (60 games)

| | Sim | Engine |
| --- | --- | --- |
| Points a team a game | 27.9 | 26.2 |
| Favorite win %, gap 0–4 / 4–8 / 8–14 | 43 / 68 / 88 | 40 / 82 / 91 |
| Fav–dog points, all games | 35.7–20.0 | 38.0–14.5 |
| Points a drive | 2.20 | 1.56 |
| Plays a drive | 6.0 | 4.4 |
| Drives a game | about 25 | about 31 |
| ypp | 6.1 | 6.0 |
| 20+ plays | 4.1% | 8.7% |
| 3rd down | 46.7% | 35.7% |
| Turnovers a play | 2.4% | 2.4% |

**Engine passing:** completion 63.6%, ypa 9.4, interceptions 3.2%, sacks 8.8%, throwaways 5.6%. Deep (20+ air) attempts are 22%, complete 59%.

**Engine runs:** 4.2 ypc (gap runs 4.0 with 34% stuffs, inside zone 5.4, reads 6.1, QB runs 2.6). At even overall gap it's 3.3 ypc.

**DC style** still moves almost nothing.

### Open (phase 1, next)
1. **Drives are boom or bust:** 4.4 plays a drive, punts on 50%, 3rd down 36%, 20+ plays twice the sim's. The game total lands only because there are more, shorter drives.
   - Run efficiency at even talent (3.3 ypc).
   - The deep ball still completes 59% when thrown.
   - `SNAP_SECS` and possessions a game.
2. **The trenches aren't even at even overall.** Generated rosters give the DL's `bsh` a 3–6 point edge over the OL's `rbk` at every tier (T1 94/88, T3 83/81, T5 71/68). It's a roster-generation question (ROSTERS.md), not to be tuned around in the engine without a decision.
3. **The underdog** still scores 14.5 against the sim's 20, and favorites at a 4–8 gap win 82% against 68%.
4. **DC identity** has to show (phase 2 and the identity dials).

## Phase 1, second pass (2026-11-14): what made drives boom or bust
**The tool.** `drives.txt` has a SUCCESS section:
- every snap by kind: run, QB carry, throws by air depth, behind the line, sacks, throwaways, scrambles, RPO holds
- each kind's share, success rate (40% of the distance on 1st down, 60% on 2nd, all of it on 3rd and 4th: `successful`, season/grades.ts), ypp, ≤0 and 10+
- by down, and the RB runs and attempts in bands
- side by side with rough FBS numbers

**The finding: not mainly the deep ball.** On success rate the engine was already near FBS (41% against about 42%; the drive sim's own is 57%, since its plays are a normal draw tuned for scores, not plays). Drives died on four things:
1. **RPOs held to a tackle** (4.3% of snaps, −4.7 yd each). RPO plays are `kind: 'pa'`, so the CPU QB never reached his give and read every RPO as a dropback behind a run-blocking line.
   - *Fixed:* he gives on the box read, and on a pull with nothing open he tucks it and runs (`rpoTuck`). Down to about 1%.
2. **Throws behind the line** (6.8% of snaps, 9% success, 0.4 ypp). Bubbles thrown 8–14 yd clear went for 0, tackled by ends and tackles.
   - *The bug:* `autoRun` sent any carrier behind the line to read the run's crease (`pickLane`), so a bubble catcher turned back inside into the front.
   - *Fixed:* that read is only for a runner (`!play.thrown`), plus a bigger window for throws caught behind the line (`behind`).
   - *Now:* 27% success, 2.3 ypp (FBS screens about 5–6: still short, a blocking question).
   - *Reach:* the CPU, replays and the harness. The user steers his own catches.
3. **Runs stuffed by a lineman who shed his block** (89% of stuffs). The auto-runner could only cut from a yard behind the line, so it never cut the man coming at it in the backfield (the cut was on 5% of stuffed runs).
   - *Fixed:* `AUTO_JUKE.behind` 3. From 3 yd deep he cuts a defender closing on him, toward the side with room (`cutSide`, `look`).
   - *Now:* RB stuffs 22.6% (FBS about 18%), run success 47%.
4. **Too many sacks and throwaways** (first pass). There are still 9.3% sacks, plus the RPO holds.

**The run-block edge.** `RUN_BLOCK_EDGE` 3 → 5 was tried with the cut. It overshot the user's run rows: GAP even 7.0 ypc against the 4.5–5.5 target, +5 5.6 against 3–4, runs into Cover 0 Blitz 6.5, Georgia vs Kent 17.9. So it stays 3: the cut alone does the job.

**Balance with the cut** (edge 3):
- **GAP:** −10 7.5, even 5.3 (stuffs 19%), +5 3.9, +10 2.7, +20 1.8, all in target. RUN ALL 4.9.
- **RUNFIT stuffs** 11–22%. Duo and Power O are at 11%, a bit under the band.
- **Short yardage:** Power 76–80%, Iso 69–82%, the sneak 97–100%.
- **ADAPT:** IZ spam loses 60% against DC 75.
- **Audit:** the summary is about the same as the last one (no new IDLE, WRONG SIDE or DEAD DOUBLE; OWES shuffles).
- **Open:** runs into Cover 0 Blitz are 5.6 ypc against the 2.5–3.5 loaded-box target. It was 4.4 before the cut, over target already.

### Against real FBS (60 games)

| | Engine | FBS (rough) | Drive sim |
| --- | --- | --- | --- |
| Success rate | 46% | about 42% | 57% |
| 3rd down | 38.5% | about 40% | 46.7% |
| Completion | 65.5% | about 62% | — |
| Yards an attempt | 9.8 | about 7.5 | — |
| Sacks of dropbacks | 9.3% | about 6–7% | — |
| Attempts 20+ air | 21% | about 13% | — |
| RB runs ≤0 / 1–3 / 4–6 / 7–9 / 10+ | 23 / 29 / 19 / 14 / 16 | 18 / 32 / 25 / 12 / 12 | — |
| 20+ plays | 7.4% | about 6% | 4.1% |
| Plays a drive | 4.7 | about 5.5 | 6.0 |
| Drives a team a game | about 14 | about 12.5 | 12.6 |
| Points a drive / a team a game | 1.75 / 25.8 | about 2.2 / 28 | 2.20 / 27.9 |
| Favorite win %, gap 0–4 / 4–8 / 8–14 | 53 / 71 / 100 | | 43 / 68 / 88 |

**What's still boom or bust:**
- **Too many deep shots that hit:** 21% of attempts, 60% complete. That's why ypa is 9.8 and 20+ plays are 7.4%.
- **Sacks.**
- **Runs that are stuffed or break long, too few 4–6.**
- **The underdog** scores 14.1 against the drive sim's 20.0.

**Next:**
- the QB's deep share (`reach`, `floor` for shots and PA) toward 13%
- sacks toward 7%
- why runs are bimodal (second-level fits, yards after contact: RUNGAME.md has the same open item)

## Phase 1, third pass (2026-11-14): deep judgment, the presnap check, the hold
200-game runs from here on: at 60 games the win % by gap swings 10 points (the drive sim itself reads 73% or 84% over all games).

**Deep judgment (`CPU_QB.far`).** A user's long throws miss by his judgment with the mouse; the CPU's were placed perfectly but for throw error. Past 12 yd his placement misses by `per` 0.25 yd a yard × (1.4 − `dac`/100), over or under, and 60% of that sideways.
- 0.12 barely bit: receivers track a ball in the air, and a wide-open man adjusts to a miss of a yard.
- At 0.25, 20+ air attempts complete 46% (was 60%; FBS about 38–40%). ypa 7.7 (FBS about 7.5). 20+ plays 6.4% (FBS about 6%).

**The presnap check (`ocCheck`, `CPU_CHECK`; the first piece of a smart OC).**
- **What he reads:** the box (a defense can't hide its numbers) and the shell (a disguise shows another one).
- **Weighing the calls:** every call that could be behind it, by the defense's mix for the situation (its identity: what scouting has) × how often that call would show this shell, straight or disguised.
- **Scoring plays:** each play in the same personnel gets its film damage over that read (`damage`, the number the DC reads the other way). One from another formation is a shift and needs `CPU_CHECK.shift` more (see "Audibles" below). Before 2026-11-15 it was the same formation only.
- **The check:** to the best one when it beats the call by `gain`, with odds by `prc`. He stays in a run on short yardage and in a pass on 3rd and long.
- **What it may check to:** out of a run, a run or the quick game; out of a pass, the same family.
- **Tried and dropped:**
  - Checking by the tags alone (`beats` against `stops` on the shown look) changed nothing: the looks that kill runs are pressures with 7 in the box, which a QB can't see.
  - Letting it check into shots sent 34% of snaps deep with 15.8% sacks. The film table measures shots with the harness QB's perfect deep judgment.
- **Measured** (200 games each):

  | | No check | Check |
  | --- | --- | --- |
  | Points a drive | 1.56 | 1.60 |
  | Run success | 48% | 52% |

  The check fires on about 20% of snaps, at 48% success against 46% overall. A small lever, but disguises now fool the CPU's QB too. `DRIVES_CHECK=0` turns it off.

**The hold (`CPU_QB.hold` [0.45, 1.05]):** sacks 9% → 7.7% of dropbacks.

**The red zone and the field** (new rows in SUCCESS):

| | Engine | Drive sim | FBS (rough) |
| --- | --- | --- | --- |
| Drives reaching the red zone | 28% | 37% | about 30% |
| Red-zone TD rate | 67% | 71% | about 60% |
| Red-zone FG rate | 20% | 16% | about 22% |
| Start (own) | 27.7 | 28.1 | about 29 |

### Where it stands (200 games)

| | Engine | FBS (rough) | Drive sim |
| --- | --- | --- | --- |
| Success | 46% | about 42% | 58% |
| 3rd down | 37% | about 40% | 45% |
| Completion | 62% | about 62% | |
| ypa | 7.7 | about 7.5 | |
| Sacks | 7.7% | about 6–7% | |
| Interceptions | 3.4% | about 2.5% | |
| 20+ plays | 6.4% | about 6% | 4.1% |
| Attempts 20+ air | 20% | about 13% | |
| RB runs ≤0 / 1–3 / 4–6 / 7–9 / 10+ | 21 / 27 / 20 / 16 / 17 | 18 / 32 / 25 / 12 / 12 | |
| Plays a drive | 4.8 | about 5.5 | 5.9 |
| Drives a team a game | 14.2 | about 12.5 | 12.6 |
| Points a drive | 1.49 | | 2.14 |
| Points a team a game | 24.2 | about 28 | 26.9 |
| Favorite win %, all / 0–4 / 4–8 / 8–14 | 85 / 61 / 85 / 93 | | 84 / 53 / 82 / 97 |

**What's left.**
- **Per play, the engine is about real FBS.** The drive sim isn't: 58% success, fit to scores rather than plays. Per game, the engine scores about 2.7 a team less: about 0.6 fewer points a drive, partly offset by more drives.
- **The talent slope now matches** at 200 games.
- **The open items:**
  - 3rd down (37%)
  - runs too all-or-nothing (stuffs 21%, 10+ 17%, too few 4–6)
  - throws behind the line at 2.2 ypp (real screens 5–6; screen blocking)
  - the extra possessions (`SNAP_SECS`: snaps are short)
  - DC style still moves nothing (phase 2)

## Phase 1, fourth pass (2026-11-14): parity with a played game, money downs, screens
**Everything a played snap has, an engine snap has** (`engineSnap`, held by `src/engineDrive.test.ts`). Each item is built as `Game.startPlay` and `Game.toCall` build it.

| Already there | Added this pass |
| --- | --- |
| The identity's call mix | Confidence at the snap's leverage (`clutchRoster` on both rosters; `leverage` with late and close read off the drive's clock, the 4th quarter or overtime within `CONF.closeMargin`) |
| The DC brain: calls, the check, keys, tags | A shaken QB's nerves as aim lag (`shakenAimLag`, read by the CPU QB's `aimLag`) |
| Leans, anticipation, throw habits | The kicker's confidence on field goals (`EngineSide.conf`, `unitEdge`) |
| Line games, press, disguises | |
| Prevent and sell-out by the clock and score | |

**Not in engine snaps, because a played game's CPU doesn't have them either:**
- the hard count and motion (the user's presnap tools; the CPU offense could use them in phase 2)
- mid-game injuries
- wind (kicks only, and engine kicks are still the drive sim's)
- weekly emphases (simulated play only, COACHES.md). An emphasis on the user's defense moved CPU drives through `driveMods`; once engine drives replace those in phase 3, it needs an on-field form or it does nothing in played games.

**Money downs (`CPU_OC`).** `passOdds` only adds 0.25 on 3rd and long, so an option offense ran on 37% of 3rd and 6–9 and 31% of 3rd and 10+ (FBS throws about 85%). The CPU OC's own floor:
- 3rd and 4th, 7+ to go: at least `longPass` 85% passes
- 3–6 to go: at least `midPass` 60%
- a yard or less, when he runs: his short-yardage call (the sneak) `inches` 60% of the time

`passOdds` itself is untouched: the season sim's casting reads it.

**3rd down by distance** (engine / drive sim / FBS rough):

| Distance | Engine | Drive sim | FBS (rough) |
| --- | --- | --- | --- |
| 1–2 yd | 61.5% | 76% | 60–68%: the NFL is about 68% on 3rd and 1, 57% on 3rd and 2 |
| 3–5 yd | 50% | 59% | about 50% |
| 6–9 yd | 36% | 36% | about 35% |
| 10+ yd | 20% | 12% | 20–25% |

On 3rd and 1–2 the sneak converts 70% (against a goal-line front 41% of the time) and reads 75%.

**The runs aren't bimodal by themselves.** At even talent (gap −3 to 3), RB runs come out 21 / 28 / 21 / 16 / 14 (≤0 / 1–3 / 4–6 / 7–9 / 10+), against FBS about 18 / 32 / 25 / 12 / 12.
- The bimodal aggregate is the mismatches mixed in: big favorites 28% 10+, big underdogs 33% stuffed.
- The report's random pairings of all 138 programs are far more lopsided than a real schedule.

**Screens.** A line-release screen (`screen`: Tunnel, RB Screen, TE Slip) was thrown at 0.55 s, before the line released (`SCREEN_SET` 0.8 s). The back's `screen` route is a settle route: he blocks to 0.9 s and turns at the end of it, about 1.9 s. Thrown at him before his head came around, it was dropped.
- Now the screen man (by route, looking or not) gets it `screenAfter` 1.0 s after the line releases, once his head is around, waiting at most `screenWait` 0.6.
- Screens: 72% complete, 5.0 ypa, 7.5 YAC a catch (real screens about 5.5 ypa). They were 35–44% and 0.5–1.9.
- A user throwing the RB screen early has the same problem: the back isn't looking until he's at the end of his route.

**Possessions.** The engine runs about 67 plays a team a game (FBS about 70). Its extra drives come from shorter drives, not a fast clock, so `SNAP_SECS` stays.

### Where it stands (200 games)

| | Engine | FBS (rough) | Drive sim |
| --- | --- | --- | --- |
| Success | 47% | about 42% | 58% |
| 3rd down | 39% | about 40% | 45% |
| Completion | 63% | about 62% | |
| ypa | 7.8 | about 7.5 | |
| Interceptions | 3.0% | about 2.5% | |
| Sacks | 8.7% | about 6–7% | |
| Attempts by air (behind / 0–9 / 10–19 / 20+) | 21 / 46 / 17 / 17 | 20 / 45 / 22 / 13 | |
| 20+ plays | 6.2% | about 6% | 4.1% |
| Red-zone trips | 30% of drives (TD 65%) | about 30% (60%) | 37% (71%) |
| Points a team a game | 23.7 | about 28 | 26.9 |
| Favorite win %, all / 0–4 / 4–8 / 8–14 | 85 / 56 / 85 / 97 | | 84 / 53 / 82 / 97 |

**The scoring gap** (about 3–4 points a team) has one real cause the engine doesn't have: **defensive penalties.** FBS defenses commit about 3 a game, many of them automatic first downs (pass interference, holding) that extend drives. The drive sim's scores have them built in. It needs a penalty model; tuning plays around it isn't the answer.

## Phase 2 (2026-11-14): every offense plays like itself, and the coordinators learn
### The offense's identity (`data/offIdentity.ts`, `OFF_ID`)
`offIdentity(oc, roster)` is the offense's `defIdentity`. It's built from the OC in the chair and the players on the field, and nothing is stored:
- **The OC's taste:** his style's call weights × his own lean on each family (`famSd`, from his id), his pass share's own lean (`passSd`, at most `passMax`), and two go-to plays (`favorites`, `favW`, × `money` on 3rd and 4th down and in the red zone).
- **Who gets the ball:** each receiver's prior share is the casting share for his slot (`TARGETS`, how often its routes get looked at) × exp(`talent` × his overall over the team's best). The QB's read scores a receiver `CPU_QB.favor.score` yd a unit of ln(share / an even share) and forgives him `favor.trust` yd of window, × `favor.money` on money downs. An open man counts at most `openCap` yd of window past what he needs, so the progression and his guys decide, not a wide-open flat route.
- **The QB** (`qbLean`): `runLean` from speed (0 at 74, 1 at 96), elusiveness and the style. `aggression` from arm and deep accuracy against play recognition: a gunslinger's deep windows are tighter (`CPU_QB.aggr`).

**When the pocket breaks down** (`CPU_QB.run`, `escape`):
- **Taking off:** he needs room, a spot ahead of him or angled off with no free defender near it; a rusher on a block doesn't close a lane. By his run lean he takes it: readily with the rush on him (`forced`), now and then when nobody's open (`open`), and on a wide lane when his read comes up empty (`lane`).
- **Buying time:** a passer slides away from the rush, behind the line, and keeps reading on the move, so his `tup` and the moving aim lag count. After `extend` s he runs if he can, else throws it away.

### The adapting OC (`game/ocBrain.ts`, `ML_OC`)
The DC's brain from the other side:
- **What they call:** decayed counts by situation, over his pregame read of their identity. That read is as much of their real mix as his SCOUT got (`scout`), weighing `prior` snaps.
- **What hides behind each shell:** the calls behind each shell they showed presnap (`shells`). The QB's presnap check reads it (`shellRead`): against a DC who shows two-high and rolls to Cover 3 all day, a sharp OC's QB knows by the second quarter.
- **What's working:** each family's success over what the payoff table says it should have been against those calls, and each receiver's (`tres`). A receiver who's winning pulls the QB's eyes (`tgt`).
- **His lean:** each play's worth (damage against the calls he expects, less against a normal defense, plus what's working) leans his mix the way `dcMix` leans the DC's (`beta`, `lam`), and tilts pass or run (`tilt`). The check's odds are × `check` by his skill.
- **Skill:** his ADJUST (`ocAdjust`, data/coaches.ts, `dcAdjust`'s twin), with a game-day form around it (`form`).
  - A weak OC overreacts: he believes a trend after a couple of snaps (`res`) and carries a misjudgment of each family through the game (`bias`).
  - A sharp one waits for evidence and sees it as it is. The QB's play recognition sets how much of the plan gets carried out.
- **Headlines:** `ocAdjustments` has the lines ("THEY'RE GETTING THE BALL OUT QUICK", "THEY'RE FEEDING THEIR TOP TARGET") for the halftime card in phase 3.

### The engine's payoff table (`data/enginePayoff.ts`)
The learners chose by the film room's payoff table. On engine snaps it barely predicts anything. Regressing engine success on the film's success for the same play and call gives a slope of 0.21–0.35 (1 would mean the table is right). The film room's harness QB reads high to low on a fixed clock. The CPU QB reads the field and works off a covered first read, so coverage matters about a quarter as much.
- So `DRIVES_PAYOFF=1 npm run drives` fits the engine's own table (`writePayoff`):
  - success and explosive rate of each family against each call
  - an additive fit that takes out the situation and the talent gap, shrunk by `PAYOFF_K`
  - fitted on 500 games, 67,000 snaps
- **Out of sample** (`DRIVES_SEED=777`), its slope is 0.90–1.05.
- **Who reads it:**
  - `damage`, `cell` and `OffModel` take a `table`. The DC's brain in engine drives reads the engine's (`newBrain({ table: 'engine' })`), and so do the OC's brain and the QB's presnap check.
  - The user's games keep the film's: your passing is closer to the film room's QB. The default path is unchanged.
- **The engine's real matchups**, in success-rate points:
  - quick game against Cover 0 +12, screens against Cover 4 +14 and against Cover 0 −11
  - inside zone against Cover 0 −11, draws against Cover 2 +15
  - The interaction's spread is about 5 points of success rate (the film says about 17).
- Rerun it after a calibration change, as `npm run film` is rerun after a play change.

### Does each team play like itself (200 games, TENDENCIES in drives.txt)

| | Engine | FBS (rough) |
| --- | --- | --- |
| Pass rate by style (Air Raid / Spread RPO / Pro / Spread Option / Power) | 65 / 52 / 52 / 49 / 49% | |
| Top receiver's share of targets (by talent, not slot) | 26% (31% on 3rd down, 33% in the red zone) | 25–28% |
| Backs / tight ends | 14.5 / 14.9% | 10–12 / 12–15% |
| Scrambles: pocket / dual / runner (RPO keeps not counted) | 3.8 / 10.6 / 14.9% of dropbacks | 3–5 / 7–9 / 10–14% |
| Throws on the move after leaving the pocket | 2.8 / 2.2 / 1.1% | |

Before this phase the best receiver got 20%, the same as the 5th, and the back 23%. Pocket passers and runners scrambled alike (11–13%, nearly all of it RPO keeps), and nobody threw on the move.

**DC style shows on the field:**

| | Blitz | Man | Two-high | Sacks | 20+ | Plays a drive | 3-and-out |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Aggressive | 42% | 60% | 28% | 7.8% | 6.9% | 4.7 | 28.5% |
| Balanced | 23% | 47% | 40% | 6.4% | 6.0% | 5.1 | 26.6% |
| Soft | 10% | 34% | 56% | 8.1% | 5.3% | 5.2 | 27.9% |

Points a drive are about the same (1.63 / 1.76 / 1.71): the styles differ in how they give up points, not how many.

### The coordinators' battle (`DRIVES_ADAPT=1`, 600 games each way)

| Arm | Points a drive | Success |
| --- | --- | --- |
| No learners | 1.73 | 49.4% |
| DC's brain only | 1.68 | 48.5% |
| OC's brain only | 1.74 | 49.4% |
| Both | 1.69 | 48.7% |

- **The DC's brain helps his defense:** −0.05 points a drive, about −1 point of success rate. That's about 3 standard errors in success rate.
- **The OC's brain is worth nothing measurable.** Over talent, the battle rows by ADJUST gap stay within ±0.1 points a drive, inside the noise.
- **Why:** in the engine, calling plays from tendencies has very little leverage. Even an OC with perfect, maximal exploitation of the table (`DRIVES_ML_OC`) gains +0.06 points a drive and +0.2 points of success rate. The matchups are real but small, and neither side knows the other's call before the snap, so they average out over a mix.
- **Tried and taken out:** a presnap coverage diagnosis for the CPU QB.
  - Read right, he was on time to the right side. Fooled, he committed to the wrong coverage.
  - It added complexity and moved success by about a point, because the engine's passing forgives a tight window about as much as it punishes holding the ball.

**Open:**
- Where the battle's leverage can come from: protection and hot adjustments against pressure, receivers' sight adjustments, the user DC's game plan (phase 6).
- Deep throws: Pro and Power throw 34–40% of their attempts 20+ yards (play action reads deep). FBS is about 13%.

### Scheming players open (2026-11-14): tested, and the engine doesn't give the edges yet
The user's idea: the OC should watch how the defenders respond and scheme his players open:
- play action against backers who bite
- a hitch against a man defender who trails too close
- the weak cover man
- screens and quick throws against corners giving a cushion presnap

**Built:**
- **The OC's film of the defenders** (`OcBrain`):
  - play-action bites against chances (`Play.paSeen`, `paBit`)
  - corners off per snap
  - success by route kind (`routeGroup`: back, out, in, vertical, screen), overall and by the defender beaten on the throw
  - each defender's coverage before kickoff (`coverOf`)
- **Five switches,** `ML_OC.x`:
  - the call's worth: `pa`, `soft`, `route`
  - the check's bonus for a quick throw or screen per corner off this snap: `check`
  - the QB's pull toward a receiver from the man on him (`defPull`): `free` (his man off on a quick route), `matchup`, `beat`

**Each alone,** 400 games, the OC's brain on (success-rate SE about 0.35 points):

| Switch | Success | Points a drive |
| --- | --- | --- |
| None | 49.7% | 1.74 |
| PA bites | +0.1 | 0.00 |
| Soft corners and the check | +0.5 | +0.01 |
| Free access | +0.3 | 0.00 |
| Route kinds | +0.4 | −0.04 |
| Matchups | −0.5 | −0.02 |
| Beaten defenders | +0.2 | +0.01 |
| All | −0.1 | −0.01 |

**Why: the engine's defenders don't have the flaws to exploit** (400 games of snaps, `DRIVES_DUMP`):
- **Play action:**
  - Bites matter for yards, not success: three or more biters take play action from 7.0 to 11.3 ypp, but success from 47% to 48.5%.
  - Every defense bites alike: about 63% of chances. The spread across teams (sd 0.10) is what chance alone gives, because `PA_BITE` barely reads play recognition.
- **Off corners:**
  - They give nothing away. Quick throws succeed 55% against two pressed corners and 52% against two off; hitch-type routes complete 75–77% either way.
  - An off man defender's cushion closes 2.2 yd a second from the snap (`OFF_MAN.close`), so he's on the hitch when it breaks.
- **Weak cover men:** throws at the weakest fifth complete 65% (the best fifth 59%), but for 5.5 ypa: mostly backs and tight ends on linebackers.

**With the mechanics on trial** (`DRIVES_MECH`: `OFF_MAN.close` 1.0; `PA_BITE` base 0.65 and 0.025 a point of play recognition):
- **The signals appear:**
  - The team bite-rate spread is 0.18 (chance 0.11).
  - Against two off corners the quick game gains 3.6 points of success and screens 7.6.
- **The OC still gains nothing:**

| Switch, under the trial mechanics | Success | Points a drive |
| --- | --- | --- |
| None | 50.2% | 1.70 |
| PA bites | 50.2% | 1.67 |
| Soft corners, check, free access | 50.5% | 1.70 |

  - Biters add explosive yards on a tenth of the calls.
  - Off corners are the norm (65% of snaps), and dropbacks already out-succeed the quick game (57 to 53).

**Where it stands:**
- The switches are off and the mechanics keep today's values, so nothing changed for the user's games.
- Defender flaws big and persistent enough to scheme against need engine changes, and the user's own games would feel them too:
  - corners who really give the hitch from off coverage
  - backers whose discipline varies
  - man defenders who can't stay with a break

## Phase 3 (built 2026-11-14): the CPU's drives in a played game go through the engine
Every CPU possession in a game you play is now played by the engine against your defense: regulation drives (`Game.cpuDrive`), overtime possessions (`otCpuTurn`) and the CPU's two-point tries (`cpuTwoPoint`, `engineTry`: one snap from the 3). The drive sim and casting are gone from the played game. Simulated quarters went through the engine in phase 4.

- **Who calls what:**
  - **Their offense:** their OC's book, his identity (`offIdentity`) and an `OcBrain` that learns your defense through the game.
  - **Your defense:** your DC's identity (`defIdentity(user, your DC)`) and a `DefBrain` learning their offense (`Game.setupEngine`).
  - **What your DC knows at kickoff** is what a CPU DC knows of you: their OC's book and style, and their roster. Per-opponent film isn't kept yet. `TeamState.film` holds only your offense.
  - **The DEFENSE IQ setting** is the CPU defense's alone. Your DC is always himself (NORMAL), and his ADJUST, SCOUT and his defenders' `prc` set how he learns.
- **What you see:**
  - **Key plays are the real snaps on tape:** each engine snap is recorded (`EngineOpts.record`). The key plays show the tape, with no replay search and no card.
  - **Your defense's call on each shown snap:** "YOUR D: COVER 1 ROBBER, QB SPY, KEYING J. SMITH", and also DISGUISED, PREVENT, CONTAIN, STUNT, SITTING ON THE THROW (`Game.snapNote`).
  - **CPU DRIVES gets EVERY SNAP** (`KeyLevel` `all`, `WATCH_LEVELS`): every snap of each CPU drive plays on the field as a LIVE show. Punts and kneels are skipped. It uses a shorter lineup and caption (`SHOW.snapSet`, `snapHold`), and the caption says what's next ("3RD & 4 NEXT", "FIRST DOWN"). Esc skips the rest of the drive.
  - **Your DC's line:** at most one a drive, over the drive's notice (`headline`, in his voice: `ourLine`), e.g. "YOUR DC: WE'RE SITTING ON THEIR THROW TO KAMARI CAMPBELL".
  - **At halftime:** your DC's adjustments (YOUR DC ADJUSTS), and their OC's (`ocAdjustments`). Theirs are shown as far as your DC's SCOUT sees them, as your OC's SCOUT does for their DC.
- **Scoring by your defense:**
  - **A pick six:** your six, then your own try (even at 0:00), then your kickoff.
  - **A safety:** two, then your ball at the 40.
  - **In overtime,** a defensive score ends the game.
- **The box score and grades read the real snaps** (`engineCredit`, season/cast.ts):
  - the target on every throw, the carrier, the sacker, the picker
  - no made-up incompletions (`creditSnaps(..., played)`)
  - the drive log marks each snap's pass, sack and interception (`driveLog(..., credit)`)
- **The weekly emphases' game-day edge** no longer reaches your defense in played games. Like your offense, your defense is played now (COACHES.md).
- **Watching changes nothing:**
  - **A taped snap's tail** (past the whistle, for the celebration) runs on a stream of its own (`tapeTail`). So a drive on tape plays exactly as one off it (tested).
  - **The engine** costs a few milliseconds a snap.
- **Tests** (`src/engineDrive.test.ts`):
  - tape on and off give the same drive
  - credit matches every snap
  - the box score adds up (attempts, completions, yards)
  - the try is deterministic
  - `ourLine`
- **Fixed:** an interception's end spot wasn't rounded, which gave fractional yards and starts. `drives.txt` is regenerated (200 games; the rows moved within the noise).
- **Not built yet:**
  - a postgame defense line (calls by down and what worked)
  - per-opponent film for your DC
  - a lost fumble after a catch credits the fumble but not the catch

## Phase 4 (built 2026-11-14): every snap of your games through the engine
The user's games are now engine games from end to end, played or simulated. Only CPU-vs-CPU games stay on the drive sim (`simGame`).

- **`season/engineGame.ts`:**
  - **`engineGame(home, away, rng, opts)`:** a whole game through the engine, on 15:00 quarters. Both offenses are their OC's book, identity and `OcBrain`, run by the CPU QB. Both defenses are their DC's identity and `DefBrain` on the engine's payoff table. Each brain adjusts at halftime.
  - **`enginePart(user, cpu, ...)`:** the same up to the quarter where you take over, on the dynasty's quarter length, with `simPart`'s hand-offs (a drive going at the break goes on on the field). The brains the game passes in (your DC's, the CPU's DC and OC) keep learning into the live part.
  - **Around the drives it plays like a played game:**
    - the try after a touchdown: the two-point chart (`goForTwo`, then `engineTry`), or the kick by the kicker's accuracy and confidence (`xpOdds`)
    - the defense's scores: a pick six (then its try and kickoff), a safety (then the free kick, ball at the 40)
    - FBS overtime, with a defensive score ending it
  - **There's no home edge,** as on the field.
  - **The box score, the grades' drive logs and the game page** read the real snaps (`engineCredit`, `creditSnaps(..., played)`, `driveLog(..., credit)`, and `gamePlays` with the defense's scores).
  - **Watching:** `opts.watch` maps each story play to its `EngineSnap`, on tape with `record`. It draws nothing from the game's streams (tested).
  - **`engineTeam(state, id, squad, plan)`** (season/season.ts) builds a team from the season: the staff in the chair and the plan. The CPU's DC plays the DEFENSE IQ and DISGUISES settings, with your film as his prior. Your DC is himself.
- **Where it plays:**
  - **SIM GAME** (`advanceWeek`'s `play` step): the user's game is `engineGame`.
  - **PLAY GAME from the 2nd quarter, halftime or the 4th** (`Game.simAhead`): `enginePart`.
  - **The exhibition's SIM GAME** (X, or the button beside KICK OFF): `Game.simExhibition`, watched at the exhibition's DRIVES level, then the final, then back to the setup.
- **SIM GAMES gets EVERY SNAP** (`WATCH_LEVELS`, `pickGame(story, 'all')`): every snap of a simulated game or stretch plays on tape, both offenses. Field goals still show as kick replays.
  - **The call is over each snap** (`Game.snapNote`): "YOUR O: MESH VS COVER 3, DISGUISED" on yours, "YOUR D: TAMPA 2, QB SPY, STUNT" on theirs.
  - The lower levels show their key plays on tape too. Recording is on whenever the level isn't RESULT ONLY.
- **The cost:**
  - about 260–370 ms an engine game in Node, and 330–420 ms in the browser with every snap recorded
  - about 40 MB of tapes for a whole recorded game, held only while it's watched
  - `npm run season` takes about 4 s longer a season (2.4 s → 6.6 s of simulating). Sim-to-end in the hub costs about 0.3 s a week more.
- **The weekly emphases' game-day edge no longer plays anywhere.** It was the drive sim's, in the user's simulated games, and those are engine games now. CPU staffs stay on standard, so it has no game to reach. The practice half (steering level-ups) is unchanged. Making it count again is a design question (COACHES.md).
- **Measured: USER GAMES in `npm run season`.** The same matchups through `engineGame` and `simGame` (neutral), by the overall gap, 40 games a bucket. Per team:

  | | engine | drive sim | real FBS |
  | --- | --- | --- | --- |
  | points | 24.0 | 26.7 | 26.5 |
  | yards | 393 | 422 | ~390 |
  | passing share of yards | 51% | 64% | ~44% |
  | plays | 67.6 | 76.6 | ~70 |
  | completions | 62% | 59% | 62% |
  | sacks | 2.2 | 3.6 | 2.3 |
  | turnovers | 1.5 | 1.8 | 1.3 |
  | possessions | 13.4 | 12.9 | ~12 |
  | one-score games | 23% | 34% | 38% |
  | won by 28+ | 39% | 25% | 19% |

  - **The box score is more real than the drive sim's** on yards, completions, sacks and plays.
  - **It scores about 2.7 points a team less,** and it throws for more of its yards.
  - **Talent gaps are too steep:** favorites win about as often (88% vs 87.5%), but by far more. At a gap of 8–14, half the games are won by 28+ (drive sim 22.5%). At 14+ it's 87.5% (57.5%). This is the calibration gap ENGINEDRIVES.md has carried since phase 1, now visible in the user's simulated games.
  - These are the user's games only. The league's rows don't move (SEASONS: 25.8 points a team, 4,405 games with no scoring plays off the final).
- **Fixed along the way:**
  - **A snap stopped inches short of the goal line rounded to a touchdown** on the game page (a 9-yard gain from the 91), and a kick could be spotted at "the 100". A live ball's rounded spot is now between the 1 and the 99, and only a touchdown's gain reaches 100 (`readSnap`). This touched the played game's CPU drives too.
  - **`starters()` left a slot empty** when injuries emptied its depth list on a thin roster (a later season of an open dynasty). The engine needs eleven, so it crashed. The slot now takes the best healthy player left, at one of its positions if possible.
- **Tests** (`src/engineDrive.test.ts`, "Phase 4"):
  - watching changes nothing
  - the box score and the game page's last score match the final
  - every pass in the box score is a logged snap
  - EVERY SNAP picks every snap
  - a part hands off at the right quarter, and its brains learn
- **Not built yet:**
  - emphasis on the field (above)
  - simulated quarters in an exhibition (PLAY GAME's choices are the dynasty's)
  - the drive sim's grades fit (`GRADES` expected success) hasn't been refit on engine snaps

## Blowouts: garbage time (2026-11-14)
Phase 4 measured 39% of engine games won by 28+ (drive sim 25%, FBS 19%).

**Part of that was the report.** USER GAMES draws 40 games for each gap bucket, so half its games are 8+ point mismatches. Real schedules are 33 / 32 / 26 / 9% across the buckets (0–4 / 4–8 / 8–14 / 14+). Conference games average a 5.5 gap and non-conference 8.5. Drawn from real schedules, the engine was 29.7% won by 28+ and the drive sim 17.7% (600 games, same seeds).
- **The schedule isn't the cause:** the drive sim on those games lands on FBS.
- **USER GAMES now has a `sched` row:** games drawn from real `newSeason` schedules (`USER_SCHED`, default 200). That's the row to hold against FBS. The buckets' `all` row isn't.

**The rest was the second half.** Favorite's margin in games with an 8+ gap (150 games):

| | after Q1 | half | after Q3 | final |
| --- | --- | --- | --- | --- |
| engine | 10.5 | 17.4 | 29.4 | 35.0 |
| drive sim | 9.8 | 15.1 | 22.4 | 24.8 |

- Up 21+, the favorite kept scoring 3.20 points a drive and the underdog 0.57 (drive sim 2.88 / 1.12).
- **It isn't the brains.** With both brains off it's 16.5 at the half and 33.4 at the final.
- **The cause:** the engine had no game script. A team up 35 played its starters all 60 minutes. The drive sim has `GAME_SIM.script` for this, fit to real scores.

**The fix (`MOPUP`, season/engineGame.ts):** at each regulation drive in the second half, a side whose lead reaches the line puts its twos in, on offense and defense. K and P stay.
- **The line falls with the clock:** 30 at the start of the 3rd quarter, 24 at the start of the 4th, 18 with 8:00 left, 14 at the end. It's scaled down for quarters shorter than 15:00.
- **Hysteresis:** the twos stay in until the lead falls 10 under the line.
- **The leader's OC throws less** (pass share −0.2). The milk tempo was already there.
- **The twos come from `twosSquad`** (data/depth.ts): each starter goes to the bottom of his slot lists.
- **The box score credits the backups,** and a highlight names them (`Credited.id`). The drive log marks the drive (`DriveLog.mop`), and `gradeGame` gives those snaps to each seat's backup. It still makes the same draws, so untagged games grade as before.
- **It draws no random numbers.** The trailing team keeps its starters, and overtime puts the starters back.
- CPU-vs-CPU games and played snaps are untouched.

**Measured (600 schedule games, same seeds):**

| | engine before | engine after | drive sim | FBS |
| --- | --- | --- | --- | --- |
| Won by 28+ | 29.7% | 21.7% | 17.7% | 18.9% |
| One-score | 31.0% | 32.3% | 37.7% | 38% |
| Favorite's mean margin | 17.9 | 15.3 | 12.9 | |
| Points a team | 23.6 | 23.3 | 25.9 | 26.5 |

A line of 35 / 28 / 21 / 17 gave 24.7%. `npm run season`'s `sched` row (200 games, about ±3 points) reads 25.0% against the drive sim's 19.5%.

**Still open:**
- **The first-half talent slope.** It's about 15–20% steeper than the drive sim's: halftime margin 17.4 vs 15.1, and at a 4–8 gap the 28+ share is about twice the drive sim's. A `DRIVES_UNITS=1` unit swap would find the unit that carries it. Squeezing that unit, as `SPEED.squeeze` does, would reach the user's played games, so it needs `npm run balance`.
- **One-score games** (32% vs 38%), even at a 0–4 gap (about 50% vs 62%).

## Audibles in engine drives (2026-11-15)
The CPU QB's presnap check (`ocCheck`) picks from his whole personnel group, as the user's audibles do (DEFENSE.md, "The presnap").
- **How a shift plays out** (`engineSnap`): a check to another formation is a shift.
  - The snap is laid out in the huddle's formation first; the players' leans read that look.
  - The DC may re-check in his package (`recheckFor`). He has `ENGINE_SHIFT.clock` (15) s of play clock, or `hurry` (5, too few) in the no-huddle.
  - The players re-read the new look (`releanFor`).
  - The checked play is built from the huddle's (`Play` with `from`), keeping the strength side, and the presnap runs until the offense is set (at most `ENGINE_SHIFT.max` s).
  - On a running clock the shift's seconds are added to the snap's (`stopped`).
- **Designed shifts** (`OffIdentity.shift`): most shifts in real football aren't audibles. On a normal-tempo snap (not the hurry-up, not with the clock running out, not a heave) the OC may break the huddle in another formation of the called play's personnel (`showFormation`, by how many of his plays line up in it) and shift into the called one.
  - The defense's huddle check and the leans read the shown look; then the shift plays out as above. A shift needs no check.
  - His rate: the style's `OFF_ID.shift` (air raid 5%, spread 10%, pro 22%, power 25%) × exp(`shiftSd` × z) from his id, at most `shiftMax`, on a stream of its own (`shiftRate`).
  - `DRIVES_SHIFT=0 npm run drives` turns them off.
- **The record:** `EngineSnap.shifted` and `rechecked`; the DC's `observe` counts the shift.
  - **On tape:** `Tape.shift` holds the shift's frames, which the show plays in its lineup (`shiftAt`).
  - **On the EVERY SNAP line:** "YOUR O: <PLAY>, SHIFTED VS <CALL>", or "THEY SHIFTED" and "CHECKED ON THEIR SHIFT" on your defense's line.
- **`npm run drives` reports it:** "shifts …% of snaps (designed …, on a check …), the DC re-checked …", with the success of shifted snaps against the rest.
- **The payoff table is refit on 500 games** (`DRIVES_PAYOFF=1 DRIVES_GAMES=500`).
- **Measured** (60 games against HEAD, before → after):

  | | before | after |
  | --- | --- | --- |
  | points a drive | 1.66 | 1.69 |
  | checks, share of snaps | 7.0% | 10.7% |
  | shifts, share of checks | — | 45% |
  | DC re-checks, share of shifts | — | 1.6% |

  At 500 games, on the old table: 1.64 points a drive, checks 13.1%, shifts 37%, re-checks 1.1%.
- **With designed shifts** (2026-11-15, 200 games each, the payoff table refit on 500):

  | | designed shifts off | on |
  | --- | --- | --- |
  | points a drive | 1.62 | 1.70 |
  | shifts, share of snaps | 4.5% | 14.1% (9.3% designed) |
  | success, shifted snaps / the rest | 54.4% / 48.9% | 51.9% / 48.7% |
  | DC re-checks, share of shifts | 1.1% | 0.9% |

  A shift is a small edge (the defenders re-read late, by `prc`), not an exploit. Before them a played game showed about one shift at the normal key-play level; now about three (Georgia–Alabama, both shifting teams: 22% of snaps).
- **Flag: the DC hardly re-checks on a CPU shift.** `checkFor` needs the new look to move his mix by `CHECK.from`, and a CPU OC's looks rarely do. Against the scripted user offenses (ADAPT) it's 4–19%. Shown, not tuned.

## Kicks in engine games (2026-11-15)
The user's simulated games (SIM GAME, the simulated quarters, the exhibition's SIM GAME) play their kickoffs and punts through `KickPlay`, with the CPU on both sides (`game/engineKick.ts`). Before, a kickoff was a touchback at the 25 and a punt a 40-yard net, and EVERY SNAP skipped them.

- **The CPU kicker** (`CPU_KICK`):
  - **Kickoffs:** deep, or 12% of the time angled at a corner, from the 35. After a safety, a free kick from the 20 (it used to be the ball at the 40).
  - **Punts:** a full punt, or a pooch from 52 yards out or closer (power by the distance).
  - He stops the timing meter near the middle of the green (`timingSd`). His intent has a small spread on top of the kick's own error by accuracy.
  - The air is calm, as the engine game's field goals are.
- **The return team** is the kick play's AI: the returner, his blockers, fair catches, muffs.
- **What the kick decides:**
  - where the receivers start
  - a muff the kickers fall on (their ball)
  - a return touchdown: six and the returners' try, then they kick off
- **Its clock:** a kickoff runs from the receivers' touch, a punt from the snap. It can end a half.
- **The story:** each kick is a `StoryKick` (`GameStory.kicks`, with `at`: how many drives came before it): its result, its caption, the returner. Extra points are told too (`tellXp`).
  - A return touchdown is a score on the game page (`Against` `returnTd`, on the punt's snap or on a one-play drive of the kicking team's holding the kickoff).
- **Watching** (`kickEvents`, `pickGame`):
  - **EVERY SNAP** shows every kickoff and punt on tape (`newKickRecorder`, `SnapWatch` holding a `KickSnap`), and every extra point as a kick replay (`FgSearch`), in order between the drives.
  - **The lower levels** show return touchdowns, muffs and blocks (priority 3) and 30+ yard returns (priority 2).
  - The caption is the kick's ("FAIR CATCH", "J. SMITH CALLS FOR IT ON A 44-YARD PUNT"), in gold when it went your way.
  - Recording draws nothing: the kick plays on a stream of its own (one draw from the drive's), and its tape's tail past the whistle on that same stream.
- **Two-point tries** were already engine snaps on tape (`twoPoint`), shown at every level.
- **Measured** (30 engine games, 5 matchups, the same seeds; per game, both teams):

  | | before | kicks played | real FBS |
  | --- | --- | --- | --- |
  | points | 42.0 | 44.4 | ~53 |
  | possessions | 27.4 | 25.4 | ~24 |
  | ms a game (Node) | 580 | 630 | |

  - **`npm run season`'s USER GAMES `sched` row** (200 games, per team, before → after): points 23.0 → 23.4, yards 382 → 373, plays 68.2 → 66.6, possessions 13.2 → 13.0, won by 28+ 27.5% → 28.0%, one-score 28.0% → 22.0% (the drive sim's row moved 37.5% → 35.0% on the same draws, so part of it is noise). The league's rows didn't move beyond noise, and no game page's scoring plays are off its final (0 of 4,404).
  - **Kickoffs:** 9.7 a game, 53% touchbacks, returns 17.4 yd, the receivers' start 22.5.
  - **Punts:** 11.7 a game, net 36.1 (it was 40), 79% fair caught, returns 4.3 yd.
  - **Over 80 games** between Georgia and Alabama: 4 kickoff return touchdowns, 7 muffed punts recovered by the punting team, no punt return touchdowns.
- **Flags, shown, not tuned** (they're the played game's kick play, so tuning them reaches your own kicks; check `npm run balance`'s PUNT and KO rows):
  - **Too many fair catches** and too few punt returns (FBS: about 40% fair caught, 8–9 yd a return).
  - **Kickoff returns are a little short** (FBS about 21 yd).
- **Tests** (`src/engineDrive.test.ts`): kicks are in order between the drives, a muff keeps the ball, touchbacks land at the 25 and the 20, return touchdowns add up on the game page, EVERY SNAP picks every kick, and every show of a game plays to its end.
- **Not built:** return yards aren't in the box score.
- **Update (2026-11-23, docs/KICKING.md):**
  - The CPU kicker is `game/cpuKicker.ts`, and its call comes from the kicking team's ST coach by situation (`kickoffCall`, `puntCall`): every kick type, onside kicks late and the rugby punt against a block look.
  - The return look comes from `returnCall`.
  - `KickRun` steps a kick, so played games now play the CPU's punts and kickoffs to you live (mirrored).
  - The fair-catch and return flags above are fixed: punts 38% fair caught and 6.8-yard returns; kickoff returns about 18 yards.

## Not built yet (later phases)
- Live substitutions in played games: garbage-time twos on the field, and rotations. Audibles already keep the called personnel ("Audibles" above); substitutions need who is on the field to be explicit per snap.
- The fitted DC table for CPU-vs-CPU sims (phase 5).
