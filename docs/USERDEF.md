# Play defense (USERDEF)

On CPU drives in a played game, the user can take one defender and play him live. The DC still calls the defense. The user picks which of the back seven to be before each snap, then plays his assignment, jumps a route, or shadows a man. Built 2026-11-26 (ENGINEDRIVES.md's phase 7); this is the first test build.

## The setting
**PLAY DEFENSE** (dynasty settings, `SeasonConfig.liveDefense`; P on the exhibition screen). Missing means OFF, which plays every CPU drive headless exactly as before.
- **OFF**
- **BIG PLAYS** (`bigSnap`, `BIG_SNAP` in game/situation.ts):
  - 3rd and 4th down
  - inside the user's 10
  - a snap of leverage 0.5 or more (`leverage`, which counts late and close)
  - the last 0:40 of a half
  - overtime
  - the CPU's first snap of each half (`Game.cpuSnapHalf`)
- **EVERY SNAP**

The snaps the user doesn't play run headless. They're shown by the CPU DRIVES watch level as before, minus the ones he played.

## Controls
| | |
| --- | --- |
| Pick (before the snap) | Q/E or W/S, or click; the back seven, top of the screen to the bottom. The one he played last is picked first. A dashed line shows his job: his man, his zone's spot (ringed), or the QB for a blitz or spy. The second header line names it |
| Snap | Space |
| Move | WASD at his top speed, aim-assisted (below). Until you first touch WASD or Shift the AI plays him; from then on he's yours to the whistle, and holding nothing stands him still |
| LOOK | Shift: his head around to the QB (to the ball once it's thrown). Backing away from the QB while looking, he moves at `backpedal` of his speed. Shift alone turns his head; he doesn't move |
| Ball in the air | Only on a ball coming to him (the meter over his head): Space plays the ball, E swats it; one press a throw |
| Diving tackle | Space with the carrier in reach (ringed red): he lays out and homes on him; up to 0.2 s early still counts |
| Blocked | WASD picks the shoulder he fights toward (`d.goal`); the block engine decides the shed |
| Timeout | T asks for the user's timeout at the whistle (T again cancels) |

## The feel (pass 2, 2026-11-26)
- **Slow motion** (`DEF_FEEL` in game/game.ts): the live snap runs at `slow` (0.75), and at `ballSlow` (0.55) while a ball is in the air and his eyes are on it. The snap is stepped once a frame by the frame's slowed dt (`SnapRun.step(input, dt)`), so the motion is smooth and no key press is lost. The field spreads a little (`spreadX`, `spreadY`) about the QB and your man (`defFocus`).
- **The QB's eyes: a vision cone.** `CpuQb.eyesOn` and `lookAt()` (game/cpuOffense.ts, `QB_EYES`) are display only; nothing he decides reads them, and they take no draws.
  - Where he looks: his first read (his top target) before his read opens, then each scan's best-scoring receiver, open or not.
  - Look-offs: a QB with `awr` 80+ opens to the other side 45% of the time for 0.45 s, on a stream of their own.
  - When you see it: only while your man's eyes are on the QB (`Play.defEyes()`: LOOK, or squared up to him), before the throw. A little eye over his head says he's reading.
  - How clearly, by his `prc` (`DEF_FEEL.cone`): its half-width from 22° (prc 40) to 7° (99), its opacity, and how late it follows the QB's real eyes (0.35 s to 0.05 s). A rookie sees a wide, faint, late wedge; a veteran a tight, crisp one.
- **The timing ring** (replaced by the ball meter in pass 3, and its two bands by one in pass 4).
- **Commitments.** PLAY BALL is a jump: the arms-up `leap` pose, `leapSpeed` (0.4) of his speed until the ball's down. SWAT is a chop: the new `swat` pose, `swatSpeed` (0.7) for `swatTime` (0.3 s). A mistimed jump that's caught leaves him on the turf.
- **The dive** is a lunge (`startLunge`): the `dive` pose at `lungeSpeed` × his speed toward where the carrier is going, for `lunge` s. It's decided on contact (`tackleChance` × `dive`); a lunge that finds nobody is a WHIFF and leaves him down. A blinking red ring marks a carrier in range (`diveFrom`, 2.6 yd).
- **The verdict.** PERFECT, GOOD, EARLY or LATE, by how many ms off the sweet spot, with what came of it (PICKED OFF!, BROKEN UP, CAUGHT). A pick or breakup freezes the play for `hitStop` and shakes the screen. A pick or breakup timed by him is credited to him.
- **His tackles:** BIG HIT! at a closing speed of `bigHit` (7 yd/s) or more, STUFFED! behind the line, each with a heavy hit sound, the crowd and a shake.
- **Sound:** a whoosh on the jump, the swat and the lunge (`swipe`), a hit on a breakup, the turf on a miss. The popups' cases are in game/sounds.ts.
- **Prompts:** the hint line says what he can do right now: read the QB, play the ball or swat it on the gold ring, find the ball, lay out for the carrier.

## Pass 3 (2026-11-27): manual, assisted, the meter, a sure dive
- **Manual means manual.** The AI plays him until the user first touches WASD or Shift (`Play.defManual`). After that, an idle stick stands him still (on a block, an idle stick lets the AI fight it). An untouched snap is still the AI's, draw for draw.
- **Aim assist** (`USER_DEF.assist`, `Play.assist`). Only while a key is held. Its targets are:
  - the carrier's pursuit intercept, at the AI's own angle (`interceptTime`, `PURSUIT_ANGLE`, `PURSUIT_LEAD`);
  - a scrambling or blitzed QB, the same way;
  - a found ball's landing spot;
  - in coverage, each receiver within `range` (12 yd), `trail` (0.3 s) ahead of where he is now. His man gets the wider `manCone`.

  The key bends all the way onto the target inside `full` (24°) and fades back to the key itself at the cone's edge (36°, 42° for his man). The keys are 45° apart, so every heading is a key away. A key well off every target is exact, so cutting off a route or reversing is instant. Within `close` (1.5 yd) of a receiver he matches the receiver's speed rather than overrunning him. Acceleration and turning are still his ratings (`stepPlayer`).
- **The ball meter** (`Play.ballMeter`, drawn by `Game.drawBallMeter`; it replaces the timing ring).
  - A little kick meter over his head, up only for a ball **coming to him**: it lands within his reach plus how far he can run before it's down (capped at 12 yd), or it's going to his man. Once up, it stays up for that throw.
  - The needle crosses the middle `lead` before the ball lands, `meterSpan` (0.35 s) from the middle to an end.
  - The bands (pass 4: one gold window for both calls, its bright core PERFECT) are by his hands, and narrower for a ball he hasn't found.
  - A press freezes the needle, colored by how it landed.
  - Space and E in flight count only while it's up. Bullet time (`ballSlow`) runs while it's up.
  - The contest is still a roll on his ratings (`catchOdds` with the call's multipliers).
- **The dive** (`diveReach`, `startLunge`, `stepLunge`).
  - In reach means within `diveFrom` (3.2 yd) and catchable inside the lunge (`lunge` 0.38 s at `lungeSpeed` 1.15×). A carrier running away from him at his speed isn't in reach.
  - The lunge homes on the carrier and reaches him at the CPU dive's range (`DIVE_TACKLE.range`). Decided dives get there 95%+ of the time.
  - On contact it's the CPU's own roll (`contactOdds`, shared with `checkTackles`): `tackleChance`, the hips bonus, the juke. His tackling and nothing else; `USER_DEF.dive` is gone.
  - A miss is a stumble (0.6 s), as a juked tackler's.
- **The report after pass 3** (48 drives): FLAGS none.
  - The hawk is still about even with the AI: −0.04 to +0.10 at CB1 and FS, −0.14 to +0.21 at MLB.
  - Freelancing at CB1 or FS still costs 0.2–1.1 points a drive.
  - An MLB shadowing or jumping is up to 0.2 points a drive better than the AI, inside the 0.3 flag.
  - A steering FS or MLB makes about 0.6 tackles a drive against the AI's 0.3–0.4, because he chases every carrier and dives. His box score stays under the 2.5× farming flag. Watch this if the dive's reach grows.

## Pass 4 (2026-11-27): one window; position decides PLAY BALL or SWAT
- **One bar.** The meter has a single gold window for both calls, with a bright PERFECT core. SPACE goes for the pick and E swats it down.
- **The edge** (`Play.ballEdge`, `USER_DEF.edge`, taken at the press, −1 to +1).
  - The base is his closeness to where the ball comes down against the receiver's. Both are carried on at their speed to the arrival, scored by `reachScore` with 1 yd of slack and the `^0.6` curve the contest uses.
  - Undercutting him (on the thrower's side of the receiver by `under` 0.5 yd), it's `underKeep` (half) of the base plus `underBonus` (0.45).
  - A step on him (level or ahead, running with him) adds `stepBonus` (0.15).
  - There's no cue on screen: you read it off the field. The verdict names it afterwards: UNDERCUT (0.4 or more), A STEP (0.1 or more), EVEN, TRAILING (under −0.2).
- **The call's odds** (`callOdds`, `USER_CALL`), at average hands and a perfect press, linear between the anchors:

  | Call | Good (edge ≥ +0.5): INT / catch | Even (0) | Trailing (≤ −0.5) |
  | --- | --- | --- | --- |
  | PLAY BALL (SPACE) | 50% / 12% | 18% / 52% | 4% / 75% |
  | SWAT (E) | 6% / 5% | 3% / 12% | 1% / 25% |

  Each call has its own job. SWAT forces an incompletion three times in four even from behind the receiver. PLAY BALL picks it off from a good spot, is a coin flip from an even one, and gets caught over him from behind. With a pick worth about 3 catches, the better call switches near even: go for it when ahead, swat it when trailing. The first table (before the 2026-11-27 retune) made SPACE the better call everywhere.

  - An incompletion is the rest.
  - His hands scale the pick (×0.75 to ×1.2), and the receiver's catch in traffic scales the catch (×0.8 to ×1.2).
  - A receiver who can't get to it catches less, and other defenders at the ball cut the catch as a crowd does.
  - GOOD rather than PERFECT costs 0.15 of edge.
  - A mistimed PLAY BALL plays the trailing row, and a catch over him leaves him on the turf. A mistimed SWAT is the AI's contest.
- **The adjustment** (`canHome`, `homeSpot`).
  - In reach of the spot at the press (his reach plus `homeSpeed` × his speed × the time left), he takes himself to the ball for the commitment.
  - PLAY BALL takes it `homeFront` yd in front of the receiver.
  - The odds come from the edge at the press, so the adjustment only makes the picture match.
  - A pick comes down in his hands. A breakup is his chop (SWAT) or a hand on it (PLAY BALL), and the ball pops off him (`startDeflect`, sim/ball.ts).

### Number tags (2026-11-27)
The offense's number tags, on defense (`drawNumberTags` with `defenseColors`, render/numberTags.ts):
- **Before the snap**, every player but the linemen wears his number chip. The receivers' chips are ringed white, and the man he has in man coverage is ringed gold.
- **Hovering** anyone before the snap shows his position and name over his head.
- **After the snap**, each receiver's chip shrinks to a dot (gold for his man) until the ball is caught or run.
- Display only.

## The balance principle: the read is yours, the body is his
Every AI knowledge limit is a timer that only gates the AI's decisions: `reactAt`, `fitAt`, `findAt`, `MAN_TRAIL`'s lag, `RUN_TELL`. A human steering `want` directly skips all of them. Following the precedent of the user's QB and runner, ratings limit **execution**, never **what the user sees**:
1. **Reaction is the human's own.** A human's perceive-and-react time (0.2–0.3 s and a frame) sits in the AI's band (0.15–0.5 s by `mcv`/`zcv`/`prc`). There's no artificial delay; `npm run userdef` measures it.
2. **No extra information.** No route lines, no landing marker, no offensive play name (the scorebug's right side says DEFENSE). The CPU attacks right to left on a mirrored camera, as on the CPU's kicks.
3. **Knowledge lives in the contact math.** Once the user has touched the stick or LOOK (`Play.defManual`), his eyes are his own (`updateEyes`): 1 with LOOK held or facing the QB or ball, else 0. At the throw he finds the ball only if he's looking (`findAt`); in flight, the moment he looks. So `readyAt` and every catch contest and tip still read whether he saw it. A man defender trailing with his back turned who never looks plays the ball blind.
4. **Ball skills are a timed call, paid by position** (pass 4; `USER_DEF` in game/playState.ts, `USER_CALL` in sim/catching.ts).
   - **Timing:** one window for both calls. The sweet spot is `lead` (0.2 s) before the ball arrives, within a half-window of 0.07–0.14 s by his hands (`cth` 60%, `prc` 40%), shrunk to `blindWindow` of it for a ball he hasn't seen.
   - **Position:** the edge he pressed from (`Play.ballEdge`) sets the odds of the call (`callOdds`). Nothing pressed, or a mistimed SWAT, is the AI's contest, untouched. A call by him that ends in a pick or a breakup is credited to him.
5. **The body is his ratings.** Same acceleration (`accelOf`) and top speed (`SPEED`). There's no jog/sprint/stamina split, since AI defenders always run full. Tackles stay automatic by proximity (`checkTackles`). Steering, he makes no automatic diving tackle; that's his button (pass 3: at the CPU's contact odds).
6. **Untouched is the AI.** Until the first key, nothing the user's code touches runs (after it, an idle stick stands him still). src/userdef.test.ts holds a bot with its hands off to the engine's drive, tape and all.
7. **The offense answers for free.** `CpuQb` reads the live field, so he doesn't throw into a defender camping in a lane. His targets weight what's working this game (`qbCtx`, `targetPull`), so a corner who keeps shutting his man down sees fewer balls.

## Stats and progression
A live snap goes back into the drive's loop as the same `SnapResult` a headless snap makes. INTs, tackles and takeaways are credited to the defender who made them (`readSnap`), and the box score, grades and XP read them exactly as they read the AI's. Nothing marks a stat as the user's. The DC brain doesn't learn the user's freelancing as its own anticipation: `observe` drops the controlled man's `anticLog` entry.

**Farming:** the userdef report's FLAGS compare the controlled slot's box score (5 × INT + TKL a drive) under a perfect oracle against the AI at that slot (`USERDEF.flag.statX`, 2.5×).

## Code
- `driveSteps` (game/engineDrive.ts): the possession as a generator that yields each snap request (`SnapReq`) and takes back its result (`SnapBack`, with the user's timeout). `engineDrive` is `runDrive(driveSteps(...))`, draw for draw.
- `SnapRun`: one snap stepped: built and lined up when made, then `snap()`, `step(defInput)`, `done()`, `result()`. `engineSnap` runs it at once.
- `Play.defControlled`, `defFlip` (mirrored stick), `defManual`, `defLook`, `defBall`, `defVerdict`; `defUserControl`, `ballCall`, `userDive` (game/playState.ts).
- Game (game/game.ts):
  - `playCpuDrive` is shared by `cpuDrive` and `otCpuTurn`;
  - `pumpDefense` runs the drive on to the user's next snap;
  - `startDefSnap` and `updateDefense` handle the 'defense' screen (stages pre, live, over);
  - `renderDefense` and `renderDefenseHud` draw it.

  Notices queued before the drive show first (`afterNotices: 'defense'`). The scorebug's clock is the drive's start advanced by the snaps so far (`defClock`); the drive burns its time on the real clock when it ends, as before.
- `DefBot`, `BotInput` and `botDrive` (game/userDefBot.ts): the scripted user for the tests and the report.
- Not live yet: CPU two-point tries (`cpuTwoPoint`) are simulated.

## The report: `npm run userdef` (~1 min; `USERDEF_PAIRS`, `USERDEF_DRIVES`, `USERDEF_OUT`)
An oracle plays the user's defender with perfect information and a reaction time (0.15, 0.25 and 0.35 s), at CB1, FS and MLB. The same matchups and seeds are played with the bot's hands off (the AI row). Policies:
- `hawk`: his assignment until the throw, then to the landing spot, looking, and on the sweet spot PLAY BALL or SWAT, whichever is worth more from his edge (a pick worth `BOT.pickWorth` catches)
- `jump`: sits on the receiver nearest him (where he'll be 0.6 s on), eyes on the QB, then the hawk's ball
- `shadow`: runs with the receiver nearest him, then the hawk's ball

**FLAGS** (at 0.25 s):
- the team's INT rate more than 2× the AI's;
- more than 0.3 points a drive under the AI;
- his box score more than 2.5× the AI's at his slot;
- a policy better than the AI at every slot and reaction time.

Run with `arch -arm64 env USERDEF_DRIVES=48 npm run userdef` (`arch` drops variables set in front of it).

### Measured (2026-11-26, pass 2: with the jump and swat commitments)
16 matchups × 48 drives from the 25 (768 drives a row; a row's points a drive have a standard error of about 0.1). The AI allows 1.76 points a drive, 62.1% completions and a 3.13% INT rate.

| Slot | hawk (0.15 / 0.25 / 0.35 s) | jump | shadow |
| --- | --- | --- | --- |
| CB1 | +0.07 / +0.05 / +0.11 | +0.40 / +0.25 / +0.55 | +0.74 / +0.99 / +0.87 |
| FS | −0.01 / −0.08 / −0.16 | +0.25 / +0.34 / +0.51 | +0.49 / +0.60 / +0.41 |
| MLB | −0.07 / −0.24 / +0.02 | +0.04 / −0.19 / +0.06 | +0.00 / −0.01 / +0.04 |

Points a drive against the AI: negative is better for the user's defense. **FLAGS: none.**

- **A perfect ball-hawk is now about even with the AI** (−0.24 to +0.11). He trades more picks (the team's INT rate up to 4.6% from 3.1%) for the yards a slowed jump gives up when it doesn't come down with the ball. That's the intended risk and reward.
- **Freelancing costs more than before.** Jumping or shadowing at corner or safety gives up 0.25–1.0 points a drive.
- **No farming:** his box score stays within 1.5× the AI's at his slot.
- **Pass 1** (no commitments): hawk was worth 0 to 0.26 points a drive, with one flag (hawk beat the AI everywhere).
- **Slow motion** gives a human more real time: a 0.25 s reaction is about 0.19 s of game time, inside the band measured.

## Next
- Tune from the report and from play: the window widths, `lead`, the LOOK cost, and a plant cost on hard reversals if the oracle shows a clear edge. Mechanics, not information delays.
- Play it and tune `DEF_FEEL` and `USER_DEF` by feel: the slow-motion pace, the cone's widths and lag, the windows, the commitments.
- DL and edge rushers: the get-off (jumping the snap against offside) and rush moves by direction (`PLAN`, sim/passPro.ts).
- The CPU OC learning the user's defender (a mirror of game/habits.ts): throwing away from, or testing, the man he always plays (DEFENSE.md, "The CPU's drives could learn your defensive play").
- Live CPU two-point tries; presnap cheats (±2 yd) that the CPU QB's check reads.
