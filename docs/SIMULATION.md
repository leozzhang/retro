# Simulated games, partial sims and key plays

A dynasty game can be played, simulated, or simulated partway and then played. A simulated stretch, and the CPU's drives in a game you play, can show their **key plays**: on-field replays with the CPU on both sides.

## The rule: highlights only watch
Every result still comes from the drive sim (`simulateDrive`, `simGame`) on its own random stream:
- the score, the box score, grades, injuries and the season.

The highlights only read what the sim did:
- `SimPlay.yard`/`t`, the story (`season/story.ts`), and the credit record that `credit()` fills.

None of these draw random numbers. Replays run the real play engine on their own seeds. A replay is shown only when its outcome matches the snap the sim already decided, and nothing it does feeds back.

**Checks:**
- `highlights.test.ts`: a week with a story gives the same JSON as one without, and `simGame` with a story gives the same result.
- `season.txt` and `balance.txt` came out unchanged apart from the timings and the new PARTIAL SIM section.

## Situational coaching (`game/situation.ts`)
`simulateDrive` coaches the score and the clock when its `DriveClock` has the offense's `lead`. Every caller passes it: the live game's CPU drives and overtime, `simGame` and its overtime, and `simPart`. Without it, the drive runs exactly as before.
- **4th down** (`fourthDown`): kick when the field goal is in range (52) and the points help, meaning they tie or lead, or there's time to score the rest (`cycleSecs`, 120 s, per own possession). Go for it when it has to. Otherwise there's the old 50% gamble on 4th and 2 or less past the 45, then a punt. Going for it plays a real 4th-down snap, which is logged. Overtime has no punts. Going second in overtime, it kicks only to tie or win.
- **Last snap** (`kickNow`, inside 0:20): kick only if the field goal helps. If the offense is beyond field goal range and needs a score (or it's the end of the 1st half), it's a **heave** (`desperate`): a touchdown 7% of the time (plus 0.3% per point of gap, 2–15%), an interception 15%, otherwise incomplete.
- **Tempo** (`tempo`), snap by snap:
  - hurry when trailing inside 2:00 of either half, or the last 5:00 (40% of a quarter) of the 4th
  - milk when ahead in the 4th
  - kneel when ahead and the play clock covers the time left
  - kneel out the 1st half from inside its own 30 with 0:40 left
  
  Kneels and incomplete heaves are never key plays.
- **Pass or run** (`passOdds`): the plan's share, +0.25 on 3rd and 7+, -0.25 on 3rd and 2 or less, +0.25 in the hurry-up, -0.3 when milking. Casting and the replays read it.

## Casting: who made each snap (`season/cast.ts`)
The drive sim decides each snap's yards from team ratings. `castSnap` then gives the snap to real players, weighted by their ratings and by what the snap was, on a stream of its own. It never changes a result.
- **Pass or run:** `passOdds` for the situation, times how likely the gain is on each. A 15+ gain leans pass (×2.5 vs ×0.6), and a 3+ loss on a pass is a sack.
- **Receivers:** `TARGETS` share × (overall/75)² × fit^`sharp` (3). The fit is `spd` and `rte` on a deep gain, `rte` and `cth` on a short one. A receiver 15 points faster and sharper gets about 1.7× the long catches.
- **Runners:** RB or QB by `QB_RUN_SHARE`. Long runs weigh `spd` and `elu`.
- **Interceptions** go to a DB by `cth` and coverage. **Sacks** go to a front player by `rsh` and `spd`.

**The box score** (`credit`, simGame.ts) is the sum of the cast snaps:
- Catches and runs carry their real yards.
- Sacks and kneels are rushes (NCAA).
- Each catch carries 0.61 hidden incompletions on average, for a 62% completion rate, because the drive sim logs only snaps with yards.
- The casting stream is forked once per game from the game's stream, so a story never changes the result.

**Live CPU drives** cast too (`Game.castCpu`), on a stream seeded by the drive. Their key plays name the CPU's real receivers and the user's real defenders.

**The story** keeps the cast per snap (`DriveCredit.snaps`, aligned with `plays`). The replay goes to the cast player (`slot`), an interception has to be the cast DB's (`by`), and the replay's defense calls the snap's situation (`ReplayTarget.sit`).

## PLAY GAME's choices
PLAY GAME on the hub opens a choice:
- the whole game
- sim to the 2nd quarter
- sim to halftime
- sim to the 4th quarter

K cycles the simulated quarters' key-play level.

`simPart` (`season/simGame.ts`) simulates up to the quarter you chose:
- **Clock:** it runs on the live clock (the dynasty's quarter length), so the score is on a played game's scale.
- **Conventions:** it keeps the field's conventions. You receive the opening kickoff and the CPU receives the second half. It uses the CPU drive's late-game rules.
- **From `simGame`:** the home edge, pace and game script.
- **The quarter break:** the last quarter before the hand-off ends at its break (`DriveClock.quarterBreak`). A drive still going stops there and goes on live from the same spot (a new set of downs), so you always get the whole quarter.
- **Hand-off:** your ball, the CPU's ball (its drive through `cpuDrive`), your kickoff after your score, or halftime.
- **Stats:** the simulated quarters' box score is kept in the result. The played quarters still record only the score, as before. The game is marked `live`, since its box score is partial.

**Balance:** at live pace a game has the possessions of a played game, about 5 a team at STANDARD, not `simGame`'s about 12. So it scores like one, about 9–11 points a team, and favorites win a little less often than in SIM GAME. `npm run season`'s PARTIAL SIM section shows this by overall gap. It's shown, not compensated: it's the same gap as "live games score less" in PROGRESS.md.

| Gap | SIM GAME win % | simPart win % | Points per team |
| --- | --- | --- | --- |
| 0-4 | 54.7 | 51.7 | 26.4 vs 9.3 |
| 4-8 | 82.7 | 77.7 | 25.4 vs 9.4 |
| 8-14 | 97.3 | 91.0 | 27.1 vs 10.4 |
| 14+ | 100.0 | 93.3 | 29.2 vs 11.1 |

## SIM GAME with key plays
With SIM GAMES above RESULT ONLY, X (or SIM GAME) does three things:
1. Captures the two squads, simulates the week with a story (`advanceWeek(..., story)`) and saves. The result is in before you watch, so quitting mid-watch changes nothing.
2. Shows the game's key plays, with 15:00 quarters on the clock, as `simGame` models.
3. Ends on the final. Esc skips to the final.

## Key plays (`game/keyPlays.ts`)
Each snap of a drive gets a priority:

| Priority | Snaps |
| --- | --- |
| 3, always shown | touchdowns, turnovers, fourth-down stops, field goals made or missed |
| 2 | big plays (20+), fourth-down conversions, third downs converted from 7+; on defense, also stops, sacks and red-zone stops |
| 1, FULL only | other third downs, sacks, 12+ gains |

Fourth-down tries are logged when the drive sim knows the score, which every caller now gives it. Without the score, they're rebuilt from the gaps between snaps.

`KEY_PLAYS` sets the levels:

| Level | Per CPU drive (played game) | Per drive (sim) | Per simulated quarter |
| --- | --- | --- | --- |
| LEAN | 1 | 1 | 3 |
| NORMAL | 2 | 2 | 4 |
| FULL | 4 | 3 | 7 |

Priority-3 plays ignore the quarter cap.

The settings are `SeasonConfig.keyPlays`, shown as two rows on the new-dynasty screen and on the hub's SETTINGS page:
- **SIM GAMES:** RESULT ONLY / LEAN / NORMAL / FULL. Missing means RESULT ONLY.
- **CPU DRIVES:** SUMMARY / LEAN / NORMAL / FULL. Missing means NORMAL.

Exhibitions have their own CPU DRIVES line (K).

## Replays (`game/replay.ts`, `game/autopilot.ts`, `game/highlights.ts`)
**`ReplaySearch`** tries seeds a few milliseconds a frame (`REPLAY.budgetMs`), and the next show prefetches.

Each try draws:
- a play (pass, or a back or QB run, from the credit record or the pass share)
- the defense's call and press from its identity
- a hold time

It then runs the engine headless with `autoStep`, a per-step CPU QB and runner. Its logic follows the harness's; `harness.ts` is untouched.

**A match** needs:
- the same kind: TD, INT (never a pick six), sack, or a gain within `max(3, 25%)` with the same first-down result
- the ball going to the credited player's slot, so the replay names the player the box score credits, and an interception by the cast DB

**Field goals** replay as kicks (`FgSearch`): the CPU kicker, in calm air, tries a power and line drawn from the seed and stops the meter at a drawn spot (near the middle for a make, early or late for a miss). A try matches when it's good or no good like the sim's (never blocked). The screen hides the timing meter and keeps the goal cam.

**Lost fumbles:** the play engine never loses a fumble, so the replay is a run or catch tackled on the sim's spot (`want: 'fumble'`). After the play is over, `Play.knockLoose` pops the ball out and the nearest free defender falls on it (`recoverer`); the caption names him. A CPU drive in a played game is cast like any other (`Game.castCpu`), so its turnover is a pick or a fumble as cast.

**Rate:** about 97% of key plays match between close teams (the test requires 85%; fumbles 8 of 8), and every field goal in the test sample (48 of 48, 12 of them misses; it requires 90%). The rest show as a card: the ball slides the sim's yards under the same caption.

**Screen:**
- the field is the played game's (your end zone on the left): your offense attacks right, and the CPU's attacks left through a mirrored camera (`Camera.mirror`; the replay itself still runs toward +x)
- each key play has its own camera that starts on its spot, so the view cuts between plays instead of panning; the card's ball stays on the spot until the card shows
- a scorer runs on a few yards into the end zone (`TD_RUN_THROUGH`, `sim/ai.ts`, after the play is over, so outcomes don't change) and the caption waits `SHOW.tdRun`
- captions use the sim's yards
- Space skips one, Esc skips the rest

## Not done
- No mid-game "sim the rest".
- A drive continued at the quarter break starts a new set of downs.
- Punts never show, and extra points aren't key plays.
- Replays between very uneven teams match less often, so more of them are cards.
