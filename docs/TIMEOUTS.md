# Timeouts

FBS rules: each team gets **3 timeouts a half** and **1 each overtime period**. Unused ones don't carry over: halftime refills both teams to 3, and each overtime period resets them to 1. A timeout stops the game clock, and the clock starts again on the next snap. The play clock restarts at 25 when play resumes.

The code is `game/timeouts.ts`: `TIMEOUTS`, the decisions, and the record helpers. Like `game/situation.ts`, it's plain functions with no random numbers, except `timeoutAt`'s single draw for a timeout that isn't about the clock. Every path uses the same decisions:

| Path | Offense's timeouts | Defense's timeouts |
| --- | --- | --- |
| Your snaps, live | You (T) | The CPU (`cpuTimeoutAfter`) |
| CPU drives in your game (engine) | The CPU | Your staff |
| SIM GAME, sim-ahead (`engineGame`, `enginePart`) | Both CPU | Both CPU |
| CPU vs CPU (`simGame`, `simPart`) | Both CPU | Both CPU |
| `npm run drives` (both arms) | Both CPU | Both CPU |

## You

- **T** calls a timeout. It works on the play-call screen (normal, PAT and two-point modes; not the kickoff), at the line before the snap (it sends you back to the huddle, which also saves a delay of game), and before a field goal, extra point or punt.
- **The pause has no time limit.** The call screen stays open with both clocks frozen until you resume. A card over the field shows:
  - the clock, the down and distance, and the score;
  - both teams' timeout pips;
  - one coaching line: the kneel ends it, the scores and time you need, or how many times they can stop the clock.

  You can page the playbook, star plays, flip, and open subs (U) without the clock moving.
- **Resume** with Space, which leaves a 25-second play clock. Calling a play also resumes.
- With none left, T flashes NO TIMEOUTS LEFT.
- **In the two-minute drill**, the call screen's clock line says "X TO SPIKE IT, T FOR A TIMEOUT (n LEFT)".
- **On defense your staff calls them**, with the same rules as the CPU. The CPU drive's banner says so: "TIMEOUTS: YOUR STAFF 1, UGA 1". Every replay (CPU drives, key plays, simulated stretches, the postgame highlights) has the pips as of its snap, and a snap with a timeout at its whistle takes the pip away under its caption, which says "TIMEOUT: UGA".
- **The scorebug** shows three pips under each team's abbreviation: bright for left, dim for used. In overtime it shows one.

## The decisions

All are read at the whistle of a snap the offense keeps (not a score, turnover, punt or kick), from the offense's situation with the clock at the whistle.

**The clock** (`timeoutAfter`), only with the clock running after the snap. The offense decides first.
- **Offense** (`offenseTimeout`):
  - In the two-minute drill (`clockOut`), it takes a timeout on 3rd and 4th down, on any down inside `offLate` (0:40), or to kick a field goal that helps inside `spikeKickSecs`. Earlier on 1st and 2nd down it spikes (`spikeNow`) and saves them.
  - At the end of the 1st half, it takes them in range: inside `halfOffSecs` (1:00) and within `halfOffFrom` (50) yards.
  - Never while kneeling or milking a lead.
- **Defense** (`defenseTimeout`):
  - In the final half, it saves the clock when the offense leads by 1 to `defMaxDeficit` (16), inside the shorter of `defWindow` (4:00) and `defShare` (0.3) of a quarter, unless the offense's kneel ends the game anyway.
  - In the 1st half, it calls them inside `halfDefSecs` (1:30) on an offense at least `halfDefFrom` (65) yards out that's playing it normally, to get the ball back.

**Not about the clock** (`adminOdds`): the play clock running down, the wrong personnel, a look to sort out before a big snap. These are small odds a snap:

| Side | Situation | Odds a snap |
| --- | --- | --- |
| Offense | 3rd/4th and 3 or less | 5% |
| Offense | At the goal line | 3% |
| Offense | Any other snap | 0.4% |
| Defense | 3rd/4th down | 1% |
| Defense | Any other snap | 0.2% |

They're only called with 2 or more left (`keep`), and never inside the last 5:00 of the game or 2:00 of the 1st half, where the clock rules decide. They're why a game simmed to the 4th quarter can hand you fewer than three. A running clock stops for these too.

**A timeout's cost.** On the drive sim and engine paths, a snap followed by a timeout costs `playSecs` (6 s, whistle to whistle) in place of its running cost. No time is drawn for it.

**What the coaching reads:**
- **The kneel** (`tempo`, `kneelBurn`): each defensive timeout turns one 40-second kneel into `kneelStop` (3 s). A leader kneels only when it ends the game even against the defense's timeouts.
- **Possessions left** (`possessionsAfter`): each timeout the offense holds adds `toSave` (35 s). Holding timeouts makes a late punt or a field goal from behind worth more.
- **Pacing:** no timeout once the snap ran out the drive's time (the half, or the quarter break of a partial sim). With no time left, a 4th down ends the drive at END OF HALF, not as a punt.

## What it doesn't change
- Without `DriveClock.timeouts`, a drive plays and draws exactly as before. That covers the legacy drive-sim path, the balance harness, the film room and the `coaches.test.ts` neutral-mods check.
- Overtime is untimed, so nobody calls one there in the sims. You can still call your one a period.

## The record
- `GameResult.tos` keeps each regulation timeout compactly: `[quarter, seconds left, 0 home / 1 away]`. It's about 4 a game, so roughly 50 KB a season, and it's kept out of `plays`, so line scores, top plays, stars and the office never see it.
- The game page's PLAYS tab lays the timeouts in among the key plays, in gray ("TIMEOUT, GEORGIA").
- `PartResult.timeouts` and `tos` hand a partial sim's counts and record to the live game.

## Measured
Pacing, simPart to the end, Georgia–Alabama, 400 seeds (drives a team):

| Quarters | No timeouts | Timeouts, clock rules only | Timeouts, all |
| --- | --- | --- | --- |
| 4:00 | 4.13 | 4.42 | 4.45 |
| 6:00 | 5.68 | 6.03 | 6.06 |
| 8:00 | 7.28 | 7.66 | 7.84 |

Timeouts used a game, all timeouts: 3.3, 3.9 and 4.3. Stopping the clock late in halves buys the trailing team about 0.3–0.5 possessions. The highlights pacing test's tolerance was loosened to 1.25 for it; `logic.test.ts`'s legacy pacing test doesn't use timeouts and is unchanged.

`npm run season`, 5 seasons, before → after:

| Row | Before | After | Real FBS |
| --- | --- | --- | --- |
| Points | 25.8 | 26.9 | 26.5 |
| One-score games | 37.8% | 35.9% | 38% |
| Won by 28+ | 18.1% | 21.0% | 18.9% |

- Teams use 2.4 timeouts a game, 68% of them in a half's last 4:00.
- Going into the 4th quarter, 79.5% of teams have all 3 left and 18.3% have 2.
- The drive sim's pace was fit to real scores without timeouts, so it needs a re-fit with them on. See the flag in PROGRESS.md.
