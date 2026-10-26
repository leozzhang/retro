# Confidence, next man up, and breakouts

Every player has a **confidence** from -1 (shaken) to +1 (rolling). It follows how he has played lately against what his matchup expected. On the field it moves the ratings that take nerve: a little on every snap, and a lot on the snaps that matter. A backup thrust into the lineup for a good reason gets a **spark** that good starts lock in. A strong run of starts from there is a **breakout**: a dev trait up, more potential, and a breakthrough level-up.

| Piece | Where |
| --- | --- |
| On-field effect, leverage, staff weight (`CONF`) | `src/data/confidence.ts` |
| Team confidence for the drive sim and grades (`teamConf`) | `src/data/depth.ts` |
| Season tuning (`CONFIDENCE`, `BREAKOUT`), the per-game step, sparks, breakouts | `src/season/confidence.ts` |
| Stored state | `Progress.c`, `sp`, `spn`, `spy`, `bh`, `sw`, `ls`, `gs`, `bo`, `dev`, `pot`; `TeamState.st`, `gp`; `SeasonState.confLog` (`src/season/types.ts`) |
| Laid over the roster | `squadFor` (`src/season/world.ts`): `Athlete.conf`, dev and potential overrides, the pending spark |
| Team page and HUD | the CONF row and depth-list chevrons (`render/teamScreen.ts`), CLUTCH (`render/hud.ts`), the hub line (`render/seasonScreen.ts`) |
| Season report | the CONFIDENCE and FARMING CHECK sections of `npm run season` |

## 1. What confidence does on the field
- **Leverage** (`leverage`), from 0 to 1 per snap:
  - third down 0.5, fourth down 0.8
  - red zone (inside the 20) +0.3
  - late and close (fourth quarter or overtime, within 8 points) +0.5
  - a field goal of 45+ yards 0.5, plus late and close
  - capped at 1
- **The shift** is `conf × (base + clutch × leverage)` rating points: 0.6 on an ordinary snap and 4 at full leverage. That's about ±0.5 OVR and ±3 OVR for a fully rolling or fully shaken player.
  - It moves every rating except speed, acceleration, strength, stamina, arm and leg (`FIXED`): accuracy and poise, hands and route running, blocking and rushing, coverage, reads, tackling, kick accuracy.
  - `CONF_OVR` converts it to overall points by position, from `OVR_WEIGHTS`: about 0.8 per rating point at most positions, 0.6 for a back (speed-heavy), 0.5 for a kicker and 0.4 for a punter (leg).
- **The live game:** each snap, `clutchRoster` shifts both rosters at that snap's leverage before `Play` or `KickPlay` sees them. The sim code itself doesn't change. Punts and kickoffs use leverage 0.
  - On a big snap (leverage 0.5+), the HUD shows `CLUTCH` with the QB's label, or the kicker's when lining up a kick, left of the play clock.
- **The drive sim** (`simulateDrive`'s `conf`): each snap's rating gap moves by the offense's unit confidence minus the defense's at that snap's leverage. Field goal odds move by the kicker's (`fgPerPoint`). No extra random numbers are drawn, and zero confidence gives the same drives as before.
  - Unit confidence (`teamConf`) is the starters' confidence weighted like the team overalls (`TEAM_WEIGHTS`), so the QB counts most.
  - `simGame` sets late and close per drive; the live game's CPU drives do the same.
- **The grades** expect it. Each snap's expected success rate includes both units' confidence at that snap's leverage, and an FG's expected odds include the kicker's. So confidence can't feed itself: a confident team grades about 0 against what it was expected to do (tested). In simulated games, confidence moves on luck around the expectation. In the user's live games, it moves on how the user actually plays.

## 2. How confidence moves (`updateConfidence`)
After each game he played:
- **Performance:** his game's average snap grade, weighted by `1 + leverage` (the `lsum`/`lw` fields on `GameGrade`), as a z: `avg · √snaps / snapSd`, capped at ±3. A full-time starter's z has an SD of about 1.1, and a few snaps barely move it. The game's performance is `tanh(z / perfScale)`.
- **Step:** `c += rate · √share · (performance − c)`, an EMA with `rate` 0.45, so the last two or three games matter most.
- **Weeks he doesn't play:** no change.
- **New season** (`carryConfidence`): half carries over; starts, sparks, windows and penalties clear.
- **XP:** the progression multiplier's confidence part is `1 + 0.1 × conf` (0.9–1.1), as before but from the stored value instead of the last 3 grades.

## 3. Staff charts and slumps
- `slotScore` adds `staff × conf` (3 overall points per unit), so a slumping starter can lose his job to a close backup.
- Last game's starter at a slot (`TeamState.st`) keeps an `incumbent` edge of 1.5, so the chart doesn't flip-flop. That also steadies level-up reshuffles.
- This applies to CPU teams and a delegated user chart. The user's own chart is never reshuffled.

## 4. Next man up: the spark
Before each game, `newStarters` pairs every player starting who didn't start last game with the starter he replaced: same position first, then same role. It's a pure function of the state, so `squadFor` puts the spark on the field for the first start, and the progress step commits the same decision afterwards.

A new starter sparks (`spark` 0.5 on top of his confidence) only if all of these hold:
- He didn't start either of the team's last 2 games, and has under 3 starts this season.
- He hasn't been injured this season, so a starter coming back never sparks.
- He hasn't sparked this season.
- **The job was earned.** The man he replaced:
  - is injured, or
  - is slumping (his built-up confidence `c` at or under -0.35), or
  - was outplayed: the new starter's healthy overall at the slot is at least the old one's.

A banged-up starter sitting to heal (under `HEALTH.restBelow`) is a rest day: no spark and no penalty.

**The spark's life:**
- Each start that grades at or above expectation locks half of what's left into his confidence. A start below expectation halves it instead.
- It ends after 3 starts, or as soon as he doesn't start.
- On the user's team it makes the news: `NEXT MAN UP: <name> (QB) starts for the injured <name>`.

## 5. Breakouts
- A spark opens a **window** of 4 team games. If he starts at least 3 of them and averages a performance z of 0.55 or better (`BREAKOUT`), he breaks out once the window closes.
- **He gets:**
  - one dev trait up (`Progress.dev`; elite stays elite)
  - +2 potential (`Progress.pot`), and the per-rating ceilings rise with it
  - a guaranteed breakthrough level-up (`levelUp` with `force`), drawn against the raised ceilings
- **Once a career** (`Progress.bo`).
- **News:** `BREAKOUT: <name> (<TEAM> <POS>) NORMAL TO IMPACT +2 RBK +1 PBK`. Always for the user's team, and the top two elsewhere each week (real players first).
- The potential bump matters most for upperclassmen. Without it, a player at his potential would gain almost nothing from the dev step, because `potentialFactor` dominates his XP.

## 6. Why benching a starter doesn't pay
The worry: a starter and a slightly worse backup, and the best move is always to bench the starter to farm the backup's spark and a breakout.
1. **No reason, no spark.** Benching a healthy, in-form starter who is better than his backup fires nothing.
2. **It costs the starter.** When the user's chart does it, he takes a benching penalty (`bh`, 0.3) that halves every team game. The staff never do it, because their chart is by the book.
3. **Penalties can't make a slump.** The slump test reads his built-up confidence only, so repeated benchings never turn into a "slumping" spark. Rotating QBs also fails the quiet test: the backup started 2 games ago.
4. **It's small.** A spark is about +0.25 OVR on ordinary snaps and +1.6 on the biggest ones. It never closes a real talent gap, and the starter loses the XP of the games he sits.
5. **A breakout is earned.** It needs play above expectation, and the expectation already includes his ratings and his spark. Sparks happen once a season, breakouts once a career.
6. **Slumps are real.** One only comes from bad graded games, so faking one costs results.

The season report's FARMING CHECK runs it: Georgia swapping QB1 and QB2 every week fires no sparks and leaves QB1 at -0.45 on the field. The same season with QB1 hurt for weeks 4–6 sparks QB2 once.

## Calibration (`npm run season`, 5 seasons)
| Measure | Sim | Target |
| --- | --- | --- |
| Starters' confidence SD (every regular week) | 0.31 | about 0.3 |
| Starters beyond ±0.6 | 4.5% | about 5% |
| Sparks per team-season | 4.2 (injured 2.4, slumping 0.8, outplayed 1.0) | 2–4, most after injuries |
| Sparks that break out | 9.9% (57 a season nationally) | about 1 in 10 |
| Team-seasons with a slumping QB benched | 8.8% | 5–10% |

- The first version had a rest-day reason. It made 8.5 sparks a team-season from staff rest days alone, so it was dropped: a rest day isn't a lost job.
- **Scores** didn't move outside noise: 26.2 points per team, 34.0% one-score games, 5.1 ranked losses a week.
- **Progression:** the mean starter gain went from 1.45 to 1.40. Starters lose a few more games to slump benchings and sparked backups, and kickers and punters (one per team, never benched) don't. The punter row was already flagged (29% over the mean, was 28%). The kicker sits at 14% over (was 14.5%), just under the line. Not tuned.
- `npm run balance` is byte-identical: the reference matchup's template players carry no confidence.

## Not built yet
- **Morale** (the team's mood: winning, playing time, the coach) is next. Its XP factor is unchanged.
- **In-game swings** in live games: a pick shaking the QB for a few drives, a big catch lifting the receiver.
- **Mid-game substitutions.** Next man up works week to week, because live games don't change personnel mid-game yet.
