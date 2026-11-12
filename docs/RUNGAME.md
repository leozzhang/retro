# The run game: the line, the fits, the edge

Run blocking is in `sim/runBlocking.ts`, the defense's run jobs in `sim/runFits.ts`, and the measurement in `src/runfit.ts` (`npm run runfit`, and the RUNFIT section of `npm run balance`). Pass plays never touch any of it: the front gets run jobs only on a designed run (`block: 'run'`, not the draw's fake pass set), so the pass rush and protection (PROTECTION.md) are unchanged. How the plays themselves are built is in [PLAYBOOK.md](PLAYBOOK.md).

## How it works in football
- **Gaps and techniques.**
  - Gaps are labelled A–D on each side, from the center out. A tight end adds one.
  - A lineman's technique is where he lines up on a blocker: head-up, or on one shoulder.
  - A **one-gap** lineman attacks his gap and has to get off a block to own it.
  - A **two-gap** lineman controls the man over him and plays either side.
  - College 4-3 fronts mostly one-gap.
- **The edge.** The end man on the line plays **box** or **spill**:
  - Box: he keeps his outside arm free and turns the ball back inside.
  - Spill: he wrong-arms the kick-out and pushes the ball wide to the pursuit.
  - Someone else has the **force** (the alley) outside him.
- **The backside.**
  - The backside end has **chase**: he flattens down the line behind the ball, with the QB's keep, the boot and the reverse first.
  - A backside backer has the **cutback**.
  - Over-chasing gives up the boot; staying home gives up the cutback lane.
- **Zone blocking** works from three questions: covered or uncovered, playside or backside, and whether the man inside is covered.
  - Covered linemen reach or drive.
  - Uncovered linemen help on the double team with their eyes on the backer, and climb when he crosses or the down man is under control.
  - The backside cuts off: the scoop, which is what makes the cutback lane.
  - The back reads the first down lineman playside of center: bang, bounce or bend.
- **Gap blocking.**
  - The line blocks down at an inside-out angle so nobody penetrates, and doubles at the point of attack.
  - The puller kicks out or wraps, and the backside hinges for the gap he pulled from.
  - The back reads the kick-out: inside it, or bounce.
- **Rates:**
  - ESPN's run block win rate: teams win about 67–74% of their blocks.
  - FBS: a light box gives 4.5–5.5 yd a carry, with 15–22% stuffs.
  - 3rd and 1 converts about 65–70% (TARGETS.md).

Sources:
- Inside zone rules: [USA Football: covered vs uncovered](https://blogs.usafootball.com/blog/590/here), [Coaches Insider](https://coachesinsider.com/football/inside-zone-complete-offensive-line-article/), [Breakdown Sports](https://breakdownsports.blogspot.com/2014/12/football-fundamentals-zone-blocking.html)
- Footwork: [X&O Labs](https://www.xandolabs.com/?p=11424)
- One-gap and two-gap: [Wikipedia: gap](https://en.wikipedia.org/wiki/Gap_(American_football)), [Steelers Depot](https://steelersdepot.com/2020/07/football-101-one-gapping-vs-two-gapping)
- Box and spill: [Jon Svec](https://jonsvec.substack.com/p/box-vs-spill), [Viqtory: pulling guards](https://www.viqtorysports.com/how-to-play-pulling-guards-spill-box-dent/)
- Chase and collapse: [coaching forum](https://jcfb.forums.net/thread/16961/chase--collapse-ball-away)
- Win rates: [ESPN](https://global.espn.com/nfl/story/_/id/29813062/introducing-new-nfl-run-blocking-run-stopping-stats-how-run-block-win-rate-run-stop-win-rate-work)

## Before this rework
- Every down lineman rushed the QB on a run, then chased the ball.
- Backers fit one blended spot, and backers in man on the back never fit.
- Each lineman ran straight at his man, and climbs came off a double on a timer.
- Unblocked players passed through linemen.

So backside blocks were worth little:
- Power without its hinge lost 0.4 yd a carry.
- An unblocked backside man only mattered when he blew up a gun mesh.
- Inside runs were stuffed 0% of the time (target 15–22%).

## The defense's run jobs (`sim/runFits.ts`)
**At the snap of a designed run** (`assignRunFits`), the gaps come from where the blockers line up. Then every front player gets a job. The front is the down linemen and any backer rushing from the line (within `standUp` yd: a stand-up end, the goal line's walked-up backer), so the end man on the line has the edge whether he's down or standing:
- **The edge:** the widest down lineman on the play side. He sets up outside the end blocker (`edgeOut`). Box or spill comes from the call (`DefCall.runFit`), otherwise it's the league's mix (`RUN_FIT.spill`).
  - Blocked, his goal is outside the ball (box) or inside it (spill), so the block fights him that way (`engagedGoal`).
  - After the handoff he keeps that leverage near the line (`runLeverage`).
- **Chase:** the widest lineman on the backside.
  - He stays home for `chaseHome` s for the keep or the boot, `gunHome` s longer when the QB's in the gun (the keep is a real threat there, and the QB carries out the fake).
  - Then he flattens down the line behind the ball, `chaseDepth` deep in the backfield. That's the threat counter, split zone and the boot exist to block.
- **Gap:** every other lineman, one-gap. His gap is the shoulder he lines up on. A head-up tackle takes the A gap if he's the inner one, the B gap if not.
  - Before his read (`readAt`, by `prc`) he attacks his landmark in the backfield.
  - After it he squeezes toward the ball.
  - Free after his read, with nobody on him, he goes and gets the ball. Through his gap with the ball near, the same.
- **Two-gap:** only on a call that two-gaps (`DefCall.twoGap`). A head-up lineman holds the man over him.
- **Backers:**
  - The backside-most zone backer has the **cutback**: a lane `cutbackOff` backside of the hole, held until the ball crosses the line.
  - The rest **fill** a gap in the box (`fillFlow` of the way from where they lined up). On a toss or a sweep, the alley belongs to the force player.
  - A backer in man on the back keys him and fills on a designed run, instead of mirroring him at 3 yd until the handoff.
  - A backer fits a step (`LB_FIT_STEP`) in front of where he lined up, no deeper than `LB_FIT_DEPTH`, and a backer in man holds his depth if he lined up shallower than `MAN_DEPTH`: the goal line's backers at 2.2 yd play downhill, not back out of the box (`sim/ai.ts`).

## Blocking (`sim/runBlocking.ts`)
- **The get-off** (`RUN_GETOFF`, `getOffWins`): the first contact of each down lineman's first block, inside `window` s.
  - A one-gap lineman or the edge beats his man if a roll (`sd`) plus `perTalent` × (his power − the block) clears `win`. Then he slips him into his gap instead of being engaged. That's penetration, and the stuffs and TFLs come from it.
  - The goal-line and bear fronts add `short` (they play low, one-gap, attack).
  - A sneak takes off `count`: the line fires on the count.
- **Gap rules** (power, counter, duo, iso, trap): the line takes its men by best fit across the whole line (gap, on, down), not in playside order, so the man over a guard is the guard's. An uncovered lineman helps down (the man inside) and climbs from there; in zone he helps playside.
- **The kick-out** takes the end man on the line, head-up on the last blocker included (`POA.kickHeadUp`): the tight end blocks down inside him. A man off the ball has to be outside the last blocker.
- **Backside cutoffs** (`CUTOFF_FROM`): a lineman backside of the hole takes the angle across his man's path to the ball (`cutOff`), so a backside tackle slanting playside is walled off.
- **Climbs on control** (`CLIMB`): the helper on a double comes off once the down man is being moved, after the combo's time, or when the backer declares. A down man who's still winning keeps him there up to `hold` s longer.
  - On the perimeter (stretch, pin, the toss) the climb stays on the clock.
- **Bodies** (`RUN_PICKUP`, game/playState.ts): a backside lineman on his way to a backer picks up a free down lineman who crosses his face. Playside climbers keep their man.
- **A gap run with nobody pulling (Duo)** blocks its backside like any other run. Only a puller's run leaves the backside end to chase, because the hinge has the gap he left.
- **A lead back with no force man** (nobody in the alley) leads on the playside backer nearest the edge.
- **Lead blocks from the backfield** (kick-out, lead, the toss's lead) are drawn for the strong side, so an offset back goes there (`buildRoute`). Strong I's fullback used to run them to the wrong side.

## Timing
- **The gun counter's back** takes a real counter step (a yard away) before he comes back across. The pullers need about 1.1–1.3 s to reach the hole; without it the back got there first and ran into the backer the tackle was pulling for.
- **The draw's back** sells pass within `DRAW_SET_RANGE` (0.6 yd, `sim/ai.ts`) of his spot beside the QB, so the mesh is there when the delay's up. Before, he stepped up 1.2 yd to block while the QB dropped, and the handoff came 6 yd deep at 1.3 s, into the blitz the draw is meant to beat.
  - The setting is a balance: at 0.4 the draw beat every call (70% success); at 0.8 it lost to the blitz it's built for. At 0.6 it beats light boxes and fire-zone pressure, and the bear and the goal line stop it.
  - Cover 0 still stops it: the extra blitzer meets the mesh.
  - Against two-high zones it's nearly automatic. The pass-side hook and curl defenders never fit a draw before the handoff (`passRead`), so the backers' "fooled" time (`DRAW_FOOLED`, `game/playState.ts`) doesn't bind. That's open.

## Bodies (`BODY`, `game/playState.ts`)
On a designed run a free defender can't run through the line. Within `r` yd (centre to centre) of a blocker, or of a lineman engaged on a block (the pile), he's pushed back out to `r`. He loses the speed going into the body and moves at no more than `keep` of his top speed while he's in contact, so he scrapes around it or finds a gap.
- It applies within `band` yd of the line.
- It doesn't apply to a lineman who's beaten his man off the ball (the get-off slip), to anyone on the ball carrier, or to a blocker standing down for an ablation.
- `r` is 0.6: a lineman's half-width plus a defender's. The guards sit 1.5 yd from the center, so an interior gap is tight but open. At 0.7 every interior gap was closed.
- It's off on passes, so the pass game is unchanged.

**Why it matters:** before this, a backer reading a run ran straight through the linemen. That was worst on the slow plays, the counters, where the backers had time to get there. With bodies on and nothing else changed, Counter GT went from 4.0 to 7.3 yd a carry and Trey Counter from 6.0 to 9.2. Inside zone, which hits fast, didn't move.

**What it exposed:**
- **The blitzers on a run.** A backer rushing on a blitz call was handed a fill job on a run, so he stood and read like a normal backer, and walking through the line had hidden it. A rusher is now on the front whatever the play (`RUN_FIT.standUp`): he attacks his gap and the bodies decide whether he gets through. Counters against the blitz calls are now boom or bust: 32–56% stuffed.
- **The inside-out lead turn-up** (`POA.leadInside`, last pass) had been making up for backers who came through the line. With bodies it made Power 7.1 and Counter 7.3 yd a carry, so it's gone.
- **The gun's keep hold** (`RUN_FIT.gunHome`) is still needed. It holds the backside end, who isn't coming through the line.

## The runner
- **Lanes count where a free defender is headed** (`LANE_LEAD` s ahead), so a closing backside chaser shuts the cutback.
- **A sneak reads only the A gaps** (`SNEAK_READ_W`).

## Measuring it (`npm run runfit`)
- **RUNFIT rows:** each run against 2 Man Under, Cover 1 Robber, Cover 3, Cover 4, Cover 3 Sky and Bear Cover 1:
  - yards a carry, median, stuffs, TFLs, 4+ and 10+, the cutback share
  - **who made the tackle:**
    - FREE: nobody ever blocked him
    - SHED: he got off a block
    - BLOCKED: an arm tackle
    - BACK: he lined up on the far side of the play
    - DOWN: past 5 yd
- **ABLATE rows:** the same run with one block standing down (`PlaySetup.ablate`, harness-only), which is what that block is worth. For example, Power without its hinge, Inside Zone without its backside cutoff, Split Zone without its slice.
- **Tacklers by slot:** each RUNFIT row ends with the three slots that make the most tackles.
- **SHORT:** every short-yardage run on 3rd and 1 against 2 Man, Bear and Goal Line: the conversion (a gain of 1+), yards a carry, and who makes the stops.
- `RUNFIT_ONLY=id,...`, `RUNFIT_REPS` and `RUNFIT_CALLS=id,...` work like the film room's options. It takes about 10 s at 60 reps. Read the ablations at 150+ (`RUNFIT_REPS=150`, about 30 s): at 60 they're inside the noise.
- To see why a row is what it is, trace a snap: `TRACE_PLAY=id TRACE_CALL=id npm run trace` (FILM.md).

## Measured (2026-11-12, `npm run balance`)
| Row | Before | After | Target |
| --- | --- | --- | --- |
| RUN ALL | 5.4 ypc, 6% stuffs, 13% 10+ | 4.6–4.7 ypc, 14% stuffs, 10–12% 10+ | light box 4.5–5.5, 15–22% stuffs, 10–14% 10+ |
| GAP, even (70 v 70) | 4.3, 11% stuffs | 3.7, 17% | 4.5–5.5, 12–22% |
| GAP −10 / +5 / +10 / +20 | 7.7 / 3.3 / 2.2 / 1.7 | 8.2 / 2.8 / 1.8 / 1.0 | 5.5–8 / 3–4 / 2.5–3.5 / 1.5–2.5 |
| Bear Cover 1, 3rd and 1: Power / sneak | 81% / 92% | 73% / 79% | 65–70% / 83–87% |
| Goal Line, 3rd and 1: Power / sneak | 70% / 67% | 87% / 62% | 65–70% / 83–87% |

**The ablations (RUNFIT), what each block is worth now:**
- Power without the hinge: −1.3 yd a carry (was −0.4)
- Power O without the hinge: −1.8
- Inside Zone without the backside two: −5.4 yd and −32 points of 4+ runs
- Outside Zone without the backside two: −2.4
- Split Zone without the slice: −18 points of 4+ runs

**Still unchanged:** the pass rows and the season sim. ADAPT holds: spamming inside zone loses most of its success, and the counter after it pays 15–16 ypp.

**Open, not tuned:**
- **Defense-heavy matchups:** at +10 and +20 the run game is a little too hard. The get-off's talent term and the tackle odds both favor the defense.
- **Gun counters** (Counter GT, Trey Counter, 3.3–3.8 yd a carry): the MIKE and the cutback backer make most of the stops after the handoff. A backer's read after the handoff (being fooled by the back's jab) isn't modeled yet. Ace Wing Counter, from under center, gets 4.6.
- **The Goal Line front:** Power converts too often (87%) and the sneak too rarely (62%). QB Power from the gun is still near 15% there, which predates this rework.
- **Draw** has almost no stuffs. It keeps the old pass-rush path before the run.

## Balancing by situation (2026-11-12, at 150 snaps a call)
The gap-scheme rules, the counter step, the gun's keep threat, the goal-line fits and the draw's mesh (above) changed these:

| Row | Before | After | Target |
| --- | --- | --- | --- |
| RUN ALL | 4.6–4.7 ypc, 14% stuffs | 5.0–5.2 ypc, 14–17% stuffs | 4.5–5.5, 15–22% |
| GAP −10 / even / +10 / +20 | 8.2 / 3.7 / 1.8 / 1.0 | 7.4 / 4.0 / 2.0 / 1.2 | 5.5–8 / 4.5–5.5 / 2.5–3.5 / 1.5–2.5 |
| Counter GT / Trey Counter / Ace Wing Counter | 3.6 / 3.4 / 4.1 ypc | 4.0 / 6.0 / 5.4 ypc | about 4.5–5 |
| Goal Line, 3rd and 1: Power / Iso / sneak | 87% / 79% / 62% | 84–89% / 62–65% / 62–76% | 65–70% / 65–70% / 75–80% |
| Bear, 3rd and 1: Power / sneak | 73% / 79% | 74–76% / 82–87% | 65–70% / 83–87% |
| Draw | 26% success, 97% stuffed vs Cover 0 | 56% success | — |

**What each block is worth now (ABLATE, 150 snaps):**
- Inside Zone's backside: −5.0
- Outside Zone's backside: −3.2
- Split Zone's slice: −2.5
- Counter's backside: −4.9
- Power O's hinge: −1.0
- Power's hinge and Duo's backside: about 0. With the line now blocking down correctly, the backside end rarely gets to Power's mesh. Worth a trace before the next gap-scheme book.

**Open:** Heavy Power against Bear and Goal Line (85–93%), QB Power in short yardage (20–30%), the draw against two-high zones, and the defense-heavy talent slope. PROGRESS.md has the list.

**With bodies (`BODY`) and blitzers attacking their gaps (same day, 150 snaps a call):**

| Row | Before bodies | After | Target |
| --- | --- | --- | --- |
| RUN ALL | 5.0–5.2 ypc, 14–17% stuffs | 5.5–5.8 ypc, 15–18% stuffs | 4.5–5.5, 15–22% |
| GAP −10 / even / +5 / +10 / +20 | 7.4 / 4.0 / 2.7 / 2.0 / 1.2 | 10.2 / 5.4 / 3.7 / 2.9 / 1.3 | 5.5–8 / 4.5–5.5 / 3–4 / 2.5–3.5 / 1.5–2.5 |
| Counter GT / Trey Counter / Ace Wing Counter | 4.0 / 6.0 / 5.4 | 6.0 / 5.9 / 5.0 | about 4.5–5.5 |
| Counter GT against Cover 0 (success) | 9% | 8% | low |
| Goal Line, 3rd and 1: Power / Iso / sneak / QB Power | 89% / 62% / 76% / 21% | 79% / 76% / 68% / 38% | 65–70 / 65–70 / 75–80 / 65–70 |
| Bear, 3rd and 1: Power / sneak | 76% / 82% | 77% / 89% | 65–70 / 83–87 |

- **The talent gap mostly falls into place:** the defense-heavy side (+5, +10) is now in target, and even is 5.4.
- **What's high:** the offense-heavy side (−10 at 10.2), and RUN ALL is at the top of its range.
- **ABLATE:** Inside Zone's backside is still about −5 yd a carry and Counter's backside about −4. Power's hinge and Duo's backside are still about 0.

