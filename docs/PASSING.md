# Passing: eyes on the ball and throw types

Two connected systems for the passing game:
- **Eyes and finding the ball.** Who is looking at the QB when he throws, and how soon each player locates the ball. This applies on both sides of the ball.
- **Throw types.** BULLET, TOUCH or LOB. Each one trades how fast the ball gets there against how far it clears the defenders between the QB and the receiver.

Throw type and eyes are one mechanic. Flight time decides how much a late look costs. A bullet beats a defender who has to find the ball, but it also beats a receiver who hasn't turned his head yet.

## Eyes (`Player.eyes`, `eyesOf` in sim/ai.ts)
`eyes` is 0..1: how much the player has the QB in view. It's computed every step.

**Receivers** turn their head to the QB at a point on their route:
- `RouteDef.look` is the waypoint index past which he looks. The default is 1, out of the first break.
- `look: 0` means he looks from the start: swing, bubble, tunnel, screen, check-flat.
- `lookDepth` is used for straight-line routes. Go and seam routes look back only about 12 yards downfield.
- Settle routes (curl, hitch, comeback, smoke) use `facingQB`, the existing squared-up turn. It still adds `set`'s small bonus on top.
- Once he passes his look point, `eyes` ramps from 0 to 1 over `turnTime` (faster with `rte`).

**Defenders:**
- 1 (facing the QB): zones, spies, rushers, and a man defender whose man stayed in to block
- `FIND.backpedal` (0.8): a man defender who hasn't turned yet
- `FIND.lbMan` (0.7): a backer in man
- 0: a man defender trailing with his back turned

## Finding the ball (`findAt`, `FIND` in sim/ai.ts)
At the throw, each player's `eyes` becomes `findAt`, the moment he locates the ball.

- **Receiver** (`receiverFind`):
  - looking at the QB, he sees the ball leave the hand (`findAt` = the throw)
  - with his head still downfield, up to `FIND.blind` (0.6 s) later, less with `cth`
  - if his head comes around while the ball is in the air (his look point arrives mid-flight), he finds it `FIND.base` after that
  - the receiver the ball is meant for keeps running his route until `findAt`, and only then adjusts to the ball
- **Defender:**
  - facing the QB, he breaks on the throw after his reaction (`zcv` or `mcv`, and the leans)
  - trailing, he finds the ball at `FIND.trail` (60%) of the flight, but no sooner than `FIND.trailLeft` (0.8 s) before it comes down: on a long ball he plays the receiver's hands
  - in between, the two are blended by his `eyes`

**Readiness** (`readyAt`): how much of a look he got before the ball arrived, `(arrival − findAt) / FIND.settle`, from 0 to 1. It feeds `catchOdds` as `Contender.ready` (`READY`, sim/catching.ts):
- A receiver who never found the ball keeps `READY.hands` (half) of his open-catch odds and half of his contest share. The ball hits him in the back or the helmet.
- A defender who never found it can still get a body on it (`READY.dContest`), but he can't intercept it.

## Throw types (`THROWS` in sim/ball.ts)
Each type sets the ball's speed, arc, range, error, pressure sensitivity and catch radius:

| | BULLET | TOUCH | LOB |
|---|---|---|---|
| Speed (× the arm's) | 1.4 (`kindSpeed`: all of it from a 90 arm, 40% of the extra at 60) | 1 | 0.78 |
| Arc height | 0.3× | 1× (the old single arc, exactly) | 1.6× |
| Range | 42% of max (about 26–29 yd) | full | full |
| Error, short → deep | 1.25 → 1.6× | 1× | 1.3 → 1.05× |
| Pressure error | 1.5× | 1× | 1.2× |
| Catch radius (both sides) | 0.8× | 1× | 1.15× |
| After the catch | gathered (`GATHER`) | | |
| At the catch | | | a jump ball (`JUMP`) |

**What each is for:**
- **BULLET threads the needle short and intermediate**, and gets the ball out fast on screens and quick game. It can't reach the deep third (the range), it's the throw most likely to get tipped, and it costs a step after the catch.
- **TOUCH is the baseline**: the old arc, no extra costs.
- **LOB is the throw to a man who isn't open.** It hangs the longest, so both the receiver and the defender get the most time to find it and get under it. It gives the receiver his best chance in a contest and the fewest drops, and gives the defense the most picks.

**Gathering a bullet** (`startGather`, `GATHER` in sim/player.ts). A ball on a rope comes into his body, not his hands in stride:
- He keeps `GATHER.keep` (75%) of his speed through the catch.
- He has `GATHER.accel` (60%) of his acceleration for `GATHER.time` (0.35 s).
- Sure hands ease both: a 100 `cth` takes off `GATHER.ease` (half), a 50 none. His `acc` still sets how fast he gets going again.
- A tipped ball isn't gathered.
- Measured over 1,500 reps of every pass play (hold 1.4 s): a bullet's yards after the catch are 11.6 without it and 9.6 with it, against 7.9 for touch. The bullet's yards per play go from 12.1 to 10.9, against touch's 10.4. A bullet still gets there first, so it keeps a little more run-after than touch.

**The jump ball** (`catchOdds(o, d, jump)`, `JUMP` in sim/catching.ts; `THROWS.lob.jump` = 1, others 0, a tipped ball 0):
- In the contest, being a step closer matters less (the contest's `pos` exponent goes from 0.6 to `JUMP.pos`, 0.45). Whether an open man gets there doesn't change.
- The receiver gets `JUMP.hands` (+0.05) on his hands, the surest of any throw, and a contest boost of `JUMP.contest` × `cit` (he high-points it).
- `JUMP.int` (+80%) more of the non-catches are picks.
- At the same spot (receiver 0.6, defender 1.0 into his reach) a touch pass is 35% caught and 12% picked; a lob is 45% caught and 18% picked. An open receiver at the edge of his reach drops a lob least.
- Its real cost is the long flight, which brings the defenders in.

**Hot balls** (`hotness`, `HOT`). A bullet is hard to hang on to, which comes off the receiver's hands (`READY.hot`, eased by `cth`):
- short: hot out to 18 yards, more with a big arm
- deep (from 20 yards): a rope coming over his shoulder instead of dropping in

**Tips in flight** (`Play.inFlight`, `tipOdds`, `TIP` in game/playState.ts). Each defender rolls once, at the ball's closest pass by him (`tipNear`):
- **Into his body.** Within `TIP.core` (0.55 yd) of him, the ball is into his chest, helmet or raised hands, and he gets it at `TIP.hit` (0.85) odds:
  - below `TIP.body` (1.9 yd), whatever he's looking at
  - above that, up to his reach, if he's reading the QB (`eyes`), less just under his fingertips (`TIP.under`)
  - a low ball fired through a lineman or a backer doesn't get there; it has to be threaded between them
- **Past him.** Out to `TIP.width` (DL 1.5 yd, arms up; LB 1.0; DB 0.75), a defender reading the QB has up to `TIP.odds` (DL 0.65, LB 0.45, DB 0.35). It falls off toward the edge of the lane, with his `cth` and `prc`.
- Reach: DL 2.8, LB 2.9, DB 3.0 yd. A lineman still on his block keeps `TIP.engaged` (0.85): he reads the QB's eyes and gets his hands up anyway.

What happens to a tipped ball:
- an unblocked tipper catches `TIP.pick` × `cth` of them (a pick)
- off his fingertips, the rest pop `TIP.pop.dist` (3) yd on as a free ball
- square into him, it dies where he is (`TIP.pop.dead`, 0.8 yd)

Nothing within `TIP.clear` of the target counts; that's the catch itself.

Before this, the roll came as the ball entered a defender's lane, at its edge, so a ball straight through a lineman was rolled as if it barely grazed him.

**The pocket against the lanes.** A bullet is low the whole way, so it has to get through the line. From the pocket, the defensive line stands between the QB and anything over the middle. Rolled out or scrambling, nobody is in the lane. A touch pass clears the line and the backers past about 8 yards, and a lob clears everyone. Measured, 400 throws each, the auto-QB leading the receiver at 1.1 s with no regard for the lane:

| | Bullet, pocket | Touch, pocket | Bullet, rolled out |
|---|---|---|---|
| Slant | 47.5% comp, 14.2% int, 45% tipped | 66.8%, 3.0%, 0.5% | about 80%, under 1%, 2% |
| Drag | 46.8%, 8.5%, 59.5% | 78.7%, 2.0%, 0.5% | about 70%, 1.5% |
| Curl | 31.7%, 12.8%, 24.9% | 60.7%, 4.0%, 0.3% | |
| Flat (outside the line) | 84.1%, 0%, 2.8% | 80.2%, 1.8%, 0% | |

Bullets that miss every body are caught about 86% of the time: threading it works, and throwing it into bodies doesn't.

A touch dump-off under 10 yards thrown with a rusher in the QB's face still gets batted sometimes (about 30% of the few such throws in a 2-second-hold sample).

**Input:** before or while aiming, the mouse wheel steps the type (up = more loft) and `1` cycles it (for trackpads). It resets to TOUCH every snap. The arc preview draws the chosen type's arc, and its name sits by the reticle while aiming.

**CPU QB** (`cpuThrowKind`, `CPU_THROW`; replays and the harness's AUTO rows):
- LOB past 30 yards
- over a reading defender under the bullet's line: TOUCH, or LOB if he'd get a hand on TOUCH too
- BULLET into a tight window (a defender within 2.5 yd) inside 24 yards
- TOUCH otherwise

`cpuAim` leads the receiver by the ball's real flight time to the led spot (solved in `CPU_THROW.leadIters` passes). It used to lead by distance / 22 s, short of the flight time, which put the median go ball 3.4 yd behind the man. Once placement started deciding the catch, that turned every CPU deep ball into a reach (2026-11-11). Every pass baseline before then used the old lead.

## Crowds (`CROWD` in sim/catching.ts)
Every defender in reach at the arrival contests the ball, not just the closest (`resolveArrival` passes them all to `catchOdds`). This applies to every throw type.
- Each defender past the best one counts by `w = pos^CROWD.posExp` (3). `pos` is how well he's under the ball, so one at the edge of his reach adds almost nothing. **Placement decides it:** a ball led a step past the crowd plays like one man on him.
- Each one adds `extra` × w of his contest skill to the defense's side, takes `hands` × w off the receiver's open-catch odds (bodies and the hit at the catch point), and is another set of hands for a pick (`pick` × w of his own pick odds, combined).
- Receiver at 0.9, touch pass, catch / int:

| Defenders (pos) | Touch | Lob |
|---|---|---|
| one at 1.0 | 48% / 9% | 55% / 14% |
| led past them (0.5, 0.3, 0.3) | 54% / 6% | 59% / 10% |
| double (0.8, 0.7) | 35% / 11% | 40% / 19% |
| tight double (0.9, 0.9) | 22% / 16% | 26% / 27% |
| tight triple (0.9, 0.9, 0.8) | 14% / 20% | 17% / 34% |

One defender is numerically identical to the old single-defender `catchOdds`.

## Placement: in stride, reach, dive (`PLACEMENT`, `catchGrade` in sim/catching.ts)
When the intended receiver finds the ball, he records where he'd have been at its arrival on his own path and the way he was going (`Player.track`, sim/ai.ts `adjustToBall`). At the catch, the ball's placement against that grades it:
- `adjust` = yards off his line sideways, plus `behind` × yards behind him. A ball led ahead costs nothing unless he can't get there.
- **IN STRIDE:** `adjust` under `stride` (1.2) and still moving over `strideSpeed`. Only `strideRamp` of the catch ramp applies, and his hips already point his way.
- **CLEAN:** in between. The full ramp; his hips face the QB if he was squared up or coming back, otherwise his way.
- **REACH:** `adjust` over `reach` (2.6), or caught at the edge of his reach (`pos` under `edge`).
  - He keeps `reachKeep` (45%) of his speed, and his hips twist back toward the ball (`reachTwist`, `reachTwistBehind` for a ball behind him).
  - `hands` × `reachLunge` comes off his open-catch odds.
  - Shown as the `reach` pose (lunging, arms out low) and FINGERTIPS!
- **DIVE:** in the last `diveWindow` (0.32 s), if he can't get within `diveFrom` of his reach on his feet but can by laying out, he dives.
  - He goes airborne toward the spot at `diveSpeed` or better, with no steering, and gains `diveReach` (0.9 yd) of reach. `hands` comes off his open-catch odds.
  - Caught, he's **down where he lands** (the college rule): no yards after the catch, or a touchdown in the end zone. DIVING CATCH! shows.
  - Missed, he ends up on the turf.
- **Why it doesn't look random:** the dive and the reach start from where the ball is coming down, which the player can see, and the dive starts before the ball arrives. The popup names what happened.
- A tipped ball isn't graded.
- **Running through the catch** (`throughCos`, `throughSpeed`) is **off** (`throughCos` over 1). On, a receiver with the ball led ahead on his line times it at a steady speed instead of pulling up on the spot (`seekTimed`). It's the realistic in-stride catch, but it raised the most-open receiver's mean YAC from 11.2 to 13.0, so it waits until open-field YAC is tamed.

## Out of the catch (`CATCH` in sim/player.ts)
A receiver has to turn his hips to where he's going, and get going. Only the offense's caught passes get this; runs, returns and picks don't.
- `Player.hips` is the way his body faces at the catch (from the grade above). It turns toward his `want` at `hipTurnRate`: `turn.lo` (5 rad/s) at a turn skill (half `acc`, half `rte`) of 60 to `turn.hi` (8) at 95.
- Until his hips come around, he has `turnAccel` (30%) of his acceleration and is capped at `turnCap` (2.5 yd/s). Both ease to full by alignment, `(1 + cos) / 2`. The sprite faces the way his hips do, so the turn shows.
- Every catch: his acceleration is `ramp` (60%) of normal, easing back over `rampTime` (0.8 s), while he secures the ball.
- Squared up to the QB is a half turn, about 0.5 s for an average receiver before he's really going. A bullet's `GATHER` stacks on top.
- **Defenders on the ball** (`onTime` in sim/ai.ts, `CATCH_PURSUIT` in game/playState.ts):
  - a defender breaking on a throw gets there on time and at speed, instead of pulling up on the spot
  - one within `near` (5 yd) of the catch who was on the ball reacts in `react` (0.05 s); everyone else still takes 0.12–0.47 s by `prc`

## After the catch: who gets there (2026-11-12)
Found with the film room's EXPLAIN and a frame trace. Before these fixes, deep completions averaged about 20 yd of YAC and short ones 10–15.
- **Breaking on the ball (`BREAK_ON`, game/playState.ts).**
  - A defender used to react to a throw only within 14 yd of where it was going. A deep safety 17 yd off a 1.7 s seam ball kept playing his zone, then trailed the catch at the same speed for 35 yd.
  - Now anyone who can get there during the flight breaks: within `near` yd, or within his top speed × the flight + `slack`.
- **The diving tackle (`DIVE_TACKLE`, `Play.diveAt`).**
  - It applies only in the open field: the carrier is `past` yd beyond the line, and the tackler isn't in front of him.
  - A free defender within `range` who's closing slower than `closing` yd/s lays out once, at `odds` of a normal tackle. A miss leaves him on the ground.
  - Without it, a pursuer one step behind an equally fast runner chased him the length of the field.
- **Wrapping up at the catch (`AT_CATCH`).** A receiver still turning out of his catch (`hips`) misses tackles at `miss` of the usual rate. A defender on him at the catch now usually finishes the play.
- **Open-field angles (`pursue`'s `intercept`, `OPEN_FIELD`, sim/ai.ts).**
  - Once the carrier is 5+ yd past the line, pursuers aim at the intercept point (`interceptTime`) instead of a fixed lead.
  - In the box, the old lead stays. A perfect angle on a runner who's still cutting took the run game from 5.6 to 4.0 yd a carry.
- **In bounds (`ROUTE_SIDELINE`).** Route waypoints stop 2 yd inside the sideline, and a continuing route turns upfield 2.5 yd from it. A trips quick out used to run its receiver out of bounds at full speed.
- **Short throws on a line (`CPU_THROW.shortDepth`).** The CPU QB throws a bullet to anyone 10 yd or less downfield, not only to a covered man. An open quick out used to go as a 1.3 s touch pass.
- **Measured:**
  - Against 2 Man Under, YAC is 3.5–3.7 a catch (it was 5.4–6.6).
  - In the film room: hitch 1.6, out 2.8, flat 4.3, slant 4.8, deep 10–14 (it was 15–21).
  - Single-high man (Cover 1 Robber, Cover 0) still gives up 12–17 on short throws. That's partly the design, with no help under, and it's the next thing to look at.

## Aim feel (`AIM_FEEL`, `aimLag` in sim/passing.ts) — experiment

A worse passer's pull-back line trails the mouse instead of following it 1:1, so the gap between QBs is felt in the hand. The line eases toward the mouse with time constant `tau` and a speed cap `vmax`, stepped in real time (SLOW AIM doesn't add to it). **The ball goes where the lagged line is**, so a quick flick with a bad QB lands short or off-line; holding a beat lets it settle. A faint dot shows the mouse while the line drags.

The lag `tau` is three costs added up, each from its own rating, so QB types feel different. A pocket passer is crisp set in the pocket and heavy rolling out; a scrambler is a bit heavy everywhere but keeps it on the move.

| Cost | Rating | Seconds of lag |
|---|---|---|
| Set | `A = (sac+mac+dac)/3` | `max(0, 95 − A) × 0.0043` (A 90: 0.022, 80: 0.065, 70: 0.11) |
| Pressure (0–1, a free rusher inside 4 yd) | `pac` | `pressure × max(0, 92 − pac) × 0.0054` (pac 60: 0.17, 75: 0.092, 90: 0.011) |
| Moving (speed / `MOVE_FULL` 3.4 yd/s, the aiming jog) | `tup` | `moving × max(0, 92 − tup) × 0.0066` (tup 60: 0.21, 70: 0.15, 80: 0.079, 90: 0.013) |
| Nerves (CONFIDENCE.md) | confidence | `shakenAimLag × (1 + pressure)` |
| Speed cap | `A` | `vmax = 600 + (A − 50) × 40` view px/s |

`pressure` and `moving` are `Play.passContext()`, the same values the throw error uses. On the user's aimed throws, moving is full at the aiming jog (`MOVE_FULL`), for the lag and the throw error alike. It used to be speed / 6, which a QB aiming on the move never got near (about 0.57), so the user's throws on the run were undercharged. The CPU QB and the harness keep speed / 6. The headless harness and the CPU QB don't aim with the mouse, so the balance and ratings reports don't see it. In dev builds, `window.AIM_FEEL` tunes it live (`on = false` to compare).

## Animation (render/renderer.ts `lookOf`, render/sprites.ts `Look`)
Nothing new on the HUD. It's all in the players:
- A route runner's helmet turns back over his shoulder toward the QB once he's looking (`eyes` > 0.5, running away from the QB).
- Anyone who has found a ball coming down within 5 yards of him puts both hands up: out in front, or back over his head for one coming over his shoulder.
- A receiver the ball's thrown to before he looks keeps running head down: he never saw it.
- Defenders reading the QB face the backfield (a backpedal or a shuffle) until they break on a throw. Trailing man defenders face downfield with their backs to the QB.
- The F1 debug overlay is unchanged.

## Measured (`npm run balance`, THROW section)
The THROW rows throw each type to one route against the man and the zone calls. ON TIME is 0.3 s out of his break. EARLY is the moment he plants, before his head is around.
- **Throwing before the head comes around costs a lot.** Drag EARLY: 17–21% of bullets and touch passes find him ready (a lob, 71%), against 99–100% ON TIME. Early bullets to the in, quick out and curl complete 40–51%, against 66–84% on time.
- **BULLET:** best on quick throws outside the line or through clean lanes (flat 81–90%). Thrown blind from the pocket over the middle it's batted and picked: slant 39–47% complete, 15–18% int, 30–51% tipped; curl, in and drag 18–40% tipped. A 150-rep row swings about 8 points between runs, so compare shapes, not single rows.
- **LOB:** the most intercepted throw (THROW ALL: 7.5–11.5%, against 0–3.3% for touch). Best over the top against zone (go: 72% complete, 33.5 yards per throw). On short routes it's picked 10–16% of the time, so it's the wrong throw there.
- **TOUCH:** the middle. About equal to BULLET on curls and drags against zone, better than BULLET deep against zone.
- **Flag:** BULLET still edges TOUCH on most short and intermediate routes when the lane is clean. The harness picks receivers by separation, not by lane, so it under-counts tips.

## Defenders sitting on a throw (2026-11-14)
A defender who has learned the user's throw (DEFENSE.md, "The players learn your throws") sits in the lane with his eyes on the QB. A flat bullet through him is a tip or a pick by the existing `TIP` model. A lob sails over him, and a touch pass gets over him when it's thrown early enough. So against a defense sitting on the out, the lob over the top and the vacated drag are the counters. The THROW rows don't change: they have no throws on record.
