# Ratings and overalls

Every rating is a 0-99 number that some sim formula reads. The rule: **no rating without the mechanic behind it**. The list was built backwards from what the sim already did. The old 12 ratings each fed several unrelated formulas (`awr` ran man coverage, run reads and interceptions), so they were split along code paths that already existed, and each new number got one job. `RATING_INFO` in `src/data/ratings.ts` carries the same descriptions, and the roster screen shows them.

## The ratings

| Group | Rating | What it changes on the field | Where |
| --- | --- | --- | --- |
| Physical | `spd` Speed | Top speed, 4.8 + 4.2·spd/100 yd/s. 30% of a defender's power against blocks | `maxSpeed`; engagements |
| | `acc` Acceleration | How fast he reaches top speed (10 + 10·acc/100 yd/s²) | `accelOf` |
| | `str` Strength | 40% of the carrier's side of a tackle; falling forward (carrier minus tackler); 20% of a blocker's anchor (`ANCHOR_STR`) | `tackleChance`, `fallForward`, `passBlockValue`, `runBlockValue` |
| | `sta` Stamina | How long a full sprint lasts and how fast it recovers. **Only for the player you control** | `endurance` |
| Carrier | `elu` Elusiveness | 60% of the carrier's side of a tackle | `tackleChance` |
| Receiving | `cth` Catching | Hands on open catches, pitches (`pitchOdds`) and kicks (muffs); a defender's ball skills on interceptions (60%) | `catchOdds` |
| | `cit` Catch in Traffic | The receiver's share of a contested ball | `catchOdds` |
| | `rte` Route Running | Burst off the line and out of breaks, speed carried through cuts (`cutKeep`), turning to the QB on settle routes | `runRoute`, `turnTime` |
| | `rls` Release | Beating the press jam at the snap (against the corner's `prs`) | `Play.snap` |
| QB | `arm` Throw Power | Max throw distance (42 + 0.28·arm yd) and ball speed | `maxThrowDist`, `passParams` |
| | `sac` / `mac` / `dac` Short / Medium / Deep Accuracy | Throw error. Short to 8 yd, medium 14-20, deep 28+, blended in between (`ACC_BANDS`) | `accuracyAt`, `throwErrorSd` |
| | `tup` Throw on the Run | Scales the extra error from moving: `composure(tup)` = 1 at 80, 1.5 at 55, 0.7 at 95 | `throwErrorSd` |
| | `pac` Poise | Scales the extra error under pressure the same way | `throwErrorSd` |
| Blocking | `pbk` Pass Block | The blocker's side of pass-pro engagements (80%, with `str`) | `Play.updateEngagements` |
| | `rbk` Run Block | The blocker's side of run blocks and special-teams blocks (80%, with `str`) | `runEngagement`, `sim/blocking.ts` |
| Defense | `tkl` Tackle | Chance to bring the carrier down on contact (also dives). Offensive players' `tkl` is their special-teams coverage tackle | `tackleChance`; `returnTackleChance` on kick returns (skill gap compressed) |
| | `rsh` Pass Rush | 70% of a defender's power against pass blocks: push and shed rate | `Play.updateEngagements` |
| | `bsh` Block Shedding | 70% of a defender's power against run and special-teams blocks | `runEngagement`, `sim/blocking.ts` |
| | `mcv` Man Coverage | Reaction lag trailing a receiver in man; reaction to the throw when in man | `cover`, `Play.throwBall` |
| | `zcv` Zone Coverage | Reaction to the throw from a zone | `Play.throwBall` |
| | `prs` Press | Winning the jam at the line (against the receiver's `rls`) | `Play.snap` |
| | `prc` Play Recognition | Reading run, play action and pitches; run-fit timing; 40% of interception ball skills | `reactToRun`, `sellFake`, `catchOdds` |
| Kicking | `kpw` Kick Power | Leg speed: distance on kicks and punts | `legSpeed` |
| | `kac` Kick Accuracy | Kick error and the width of the timing meter's green | `kickErrorSd`, `timingGreen` |

**Retired:** `awr` (now `mcv`, `zcv`, `prc`), `blk` (now `pbk`, `rbk`), `thr` (now `sac`, `mac`, `dac`, `tup`, `pac`).

**The split was a pure refactor first.** With every new rating filled from the old one (`sac = mac = dac = thr`, `tup = pac = 80`, `rsh = bsh = prs = rls = str`, and so on), `balance.txt` came out byte-identical. The only new effect is the blocker's strength anchor. See PROGRESS.md for what it moved.

**Not ratings yet, because nothing reads them:** ball security (there are no contact fumbles), ball-carrier vision (the CPU never carries the ball live), zone drops underneath (there are no underneath zones), QB decision-making (the user is the QB), and height and weight (they shape ratings when a player is generated, see ROSTERS.md, but the sim never reads them).

## Positions and overall

Positions are QB, HB, FB, WR, TE, OT, OG, C, DE, DT, OLB, MLB, CB, FS, SS, K and P. The sim only sees roles (OL, DL, ...), and each on-field slot is rated at one position (`SLOT_POS`: LT/RT are OT, WLB/SAM are OLB, NB/DIME are CB).

**Overall is relative to the position** (`overallRaw` in `src/data/positions.ts`). Each position has a rating template (`TEMPLATES` in `src/data/athletes.ts`): each rating's value for a level-75 player, and how fast it climbs with level (its slope). Skill ratings climb point for point; physical limits barely move, since an elite tackle is still slow. Overall is

  OVR = 75 + Σ w·(rating − template at 75) / Σ w·slope

So a player exactly on his position's template at level L rates exactly L. A pocket QB isn't dragged down by a lineman-slow 40, and a tackle's speed only counts against other tackles. Each point of a rating is worth `w / Σ(w·slope)` overall points at that position.

**The weights** (`OVR_WEIGHTS`) include only ratings that do something at that position, weighted by how much it's worth. The evidence is the sensitivity report below. A test checks that every weighted rating raises the overall and every other rating leaves it alone.

| Position | Weights (share of the overall formula) |
| --- | --- |
| QB | `sac` 15%, `mac` 15%, `arm` 15%, `pac` 12%, `dac` 10%, `spd` 9%, `tup` 8%, `elu` 5%, `acc` 4%, `sta` 4%, `str` 2% |
| HB | `spd` 24%, `elu` 18%, `str` 16%, `acc` 11%, `cth` 10%, `sta` 9%, `pbk` 6%, `rte` 4%, `cit` 2% |
| FB | `rbk` 32%, `str` 21%, `pbk` 16%, `spd` 8%, `cth` 8%, `acc` 7%, `elu` 4%, `sta` 3% |
| WR | `spd` 20%, `rte` 16%, `cth` 16%, `cit` 10%, `elu` 10%, `acc` 8%, `rbk` 6%, `rls` 6%, `str` 5%, `sta` 3% |
| TE | `rbk` 18%, `cth` 14%, `spd` 12%, `pbk` 12%, `cit` 10%, `rte` 10%, `str` 8%, `acc` 6%, `rls` 4%, `elu` 3%, `sta` 3% |
| OT | `pbk` 42%, `rbk` 30%, `str` 18%, `acc` 5%, `spd` 5% |
| OG | `rbk` 39%, `pbk` 33%, `str` 18%, `acc` 5%, `spd` 5% |
| C | `rbk` 37%, `pbk` 35%, `str` 18%, `acc` 5%, `spd` 5% |
| DE | `rsh` 26%, `bsh` 24%, `spd` 20%, `tkl` 14%, `acc` 6%, `str` 6%, `prc` 4% |
| DT | `bsh` 32%, `rsh` 20%, `tkl` 16%, `spd` 14%, `str` 8%, `prc` 6%, `acc` 4% |
| OLB | `tkl` 18%, `spd` 14%, `prc` 14%, `acc` 12%, `mcv` 12%, `zcv` 8%, `bsh` 8%, `rsh` 8%, `str` 4%, `cth` 2% |
| MLB | `tkl` 20%, `prc` 18%, `spd` 14%, `acc` 12%, `mcv` 10%, `zcv` 8%, `bsh` 8%, `rsh` 4%, `str` 4%, `cth` 2% |
| CB | `mcv` 22%, `spd` 18%, `acc` 14%, `tkl` 14%, `zcv` 10%, `prs` 6%, `cth` 6%, `prc` 6%, `bsh` 2%, `str` 2% |
| FS | `spd` 22%, `tkl` 18%, `zcv` 18%, `prc` 12%, `mcv` 8%, `acc` 8%, `cth` 8%, `str` 3%, `bsh` 3% |
| SS | `tkl` 22%, `spd` 18%, `prc` 14%, `zcv` 12%, `mcv` 10%, `bsh` 8%, `acc` 6%, `cth` 6%, `str` 4% |
| K | `kpw` 50%, `kac` 50% |
| P | `kpw` 60%, `kac` 40% |

## Team ratings

Team ratings are computed from the current healthy starters by `teamRatings` (`src/data/depth.ts`); they're never stored. An injured starter's backup counts the moment the injury is set.
- **Offense:** QB 30%, RB 8%, X/Z/SL 8/7/6%, TE 6%, line 35% (LT 8, LG 6.5, C 7, RG 6.5, RT 7). This is the 11-personnel lineup, the most common snap.
- **Defense:** ends 10% each, tackles 8% each, WLB and MLB 8% each, CB1/CB2/NB 11/10/7%, safeties 10% each. This is the nickel, the defense's answer to 11 personnel.
- **Special teams:** K 50%, P 35%, returners 15%. The returners are the Z and the back (see `specialTeams.ts`), rated 0.4·spd + 0.3·elu + 0.3·cth.
- **Team OVR** = 45% offense + 45% defense + 10% special teams.
- The CPU drive sim (`simulateDrive`) uses the CPU's computed offense against the user's computed defense.

## Evidence: `npm run ratings`

`src/ratings.test.ts` lowers one rating by 15 on one group of starters and replays the same plays: 720 pass reps (pass and PA plays against all three calls, 1.2 and 2.2 s holds) and 720 run reps. Each rep has its own seed, so the base and the variant are paired rep by rep. Gain is the change in yards per play, with an interception counted as −45. `*` marks a gain beyond two standard errors of the paired difference.

What the harness can't see:
- The auto-QB throws to the most open man at a fixed time. It can't scramble or throw on the run, and it rarely throws deep, so `tup`, `dac` and the QB's legs are under-measured. Their weights are judgment, informed by the formulas.
- `sta` only acts on a user-controlled carrier.
- `zcv` acts only for deep and robber zones. The three defensive calls are mostly man, so it measures small; it will matter more once zone coverages exist.

It was run twice on 2026-10-24: first on the generated Georgia offense and Alabama defense, then on the reference matchup (template players, offense 90 vs defense 88; `referenceMatchup` in `src/harness.ts`), which is what `npm run ratings` uses now. Both rank the ratings the same way at every position. Key rows from the first run follow; gain is in yards per play for 15 rating points across the whole unit:

| Group | What clearly matters (gain) | Measured near zero |
| --- | --- | --- |
| RB | `spd` +0.82, `str` +0.35, `elu` +0.31 | `cth`, `pbk` (the auto-QB rarely uses the back as a receiver or blocker) |
| WR | `spd` +0.28, `elu` +0.17, `str` +0.16, `rte` +0.14, `rbk` +0.13 | `rls` (see below) |
| OL | `rbk` +0.37, `pbk` +0.31 (sacks 18 fewer per 720 passes) | `spd` |
| DL | `spd` +0.52, `bsh` +0.47, `tkl` +0.18 | `rsh`: +13 sacks but little yardage, since most sacks come at the 2.2 s hold anyway |
| LB | `acc` +0.49, `prc` +0.27, `tkl` +0.27, `spd` +0.24, `mcv` +0.23 | `bsh`, `rsh` |
| CB | `tkl` +0.57, `spd` +0.49, `acc` +0.46, `mcv` +0.45 | `prs`, `cth` |
| S | `spd` +0.96, `tkl` +0.43 | `zcv` (the three calls are man-heavy) |
| QB | nothing beyond noise | everything: the auto-QB's throw error rarely decides the catch |
| K / P | K `kpw` +21 pts of FG% from 40-55, K `kac` +9.5 (an 83 leg); on the reference (a 91 leg), `kpw` +12, `kac` +16. P `kpw` +0.7 to +1.6 net | P `kac` |

On the reference run, OL `rbk` (+0.29), `str` (+0.23) and `pbk` (+0.14, 21 fewer sacks), LB `tkl`/`acc`/`prc`, CB `spd`/`tkl`/`mcv` and S `spd`/`tkl`/`prc` lead their groups, and WR `rls` became measurable (+0.21).

**Flags (not tuned):**
- **The press jam is weak.** It only slows a receiver for 0.45 s, and corners press on 35% of snaps: `prs` measured +0.03 to +0.15 and `rls` +0.03 to +0.21 across the two runs. Either the jam needs teeth or both should lose weight.
- **Zone coverage is nearly unused** until zone calls exist (Cover 2/3/4 are on the roadmap). Its weights assume they will.
- **QB ratings need a better harness** (targeting by read or route, throwing deep, throwing on the move) before their weights can be measured rather than judged.
- **Tackling is the defense's biggest lever after speed,** especially for corners, because yards after the catch dominate the auto-QB's short game.
