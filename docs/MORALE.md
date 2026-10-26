# Morale

Every player has a **morale** from -1 (miserable) to +1 (fired up). It's how he feels about his situation: his role against what he expected, how the team is doing, what the coach has decided about him, and the mood of the locker room. Each player weighs these differently, by a hidden **temperament**. Morale moves slowly. For now its one effect is development: it's the XP multiplier's practice effort.

Confidence (CONFIDENCE.md) is the other half: how he feels about his own play. It moves fast, comes from his game grades, and acts on the field. **Performance never feeds morale**, so the two don't track each other (r = 0.006 across starters).

| Piece | Where |
| --- | --- |
| Tuning (`MORALE`), temperament, drivers, the weekly step, reasons | `src/season/morale.ts` |
| Stored state | `TeamState.mo` (morale by athlete id), `Progress.me`/`mk` (a coach decision, fading) (`src/season/types.ts`) |
| Effect | the morale factor in `xpMultiplier` (`src/season/progression.ts`) |
| Team page | the MOOD row on the card, the frown on the depth list, team mood in the header (`render/teamScreen.ts`) |
| Season report | the MORALE section of `npm run season` |

## 1. Temperament (hidden)
Drawn from the player's id (`temperament`), so it's fixed for his career and never stored. There are three traits:
- **Baseline** (`base`): the mood he drifts back to. About N(0.05, 0.15), clamped to ±0.3.
- **Pride** (`pride`, 0.5–1.5): how personally he takes his role and the coach's decisions.
- **Team** (`team`, 0.5–1.5): how much the team's results move him. It's loosely the opposite of pride, so team-first and me-first players both exist.
- **Leadership** (`lead`, 0–1): how much the locker room listens to him. It's scaled by class (FR 0.2 up to SR 1), and halved when he isn't starting (`voice`).

The numbers stay hidden. The card shows one word for whatever stands out most (`temperamentLabel`), and hovering the MOOD row explains it:

| Word | When |
| --- | --- |
| LEADER | leadership 0.8+ and a junior or senior |
| MOODY | baseline -0.1 or lower |
| PROUD | pride 1.3+ |
| LOYAL | team 1.3+ |
| MELLOW | nothing stands out |

## 2. What drives it
His **target** is his baseline plus four signed terms (`moraleDrivers`, `moraleTarget`).

**Role against expectation** (`roleW` × pride × gap):
- **Actual role** (`actualRole`) comes from the depth chart: 1 starting, 0.7 in a package (FB, TE2, WR4, SAM, DIME), 0.5 first backup, 0.25 second, 0 below that. Hurt players don't judge their role.
- **Expected role** (`expectedRole`): what he feels entitled to, capped by his talent.
  - Entitlement by class: FR 0.15, SO 0.4, JR 0.7, SR 0.9. Underclassmen also take their stars: 3★ 0.2, 4★ 0.45, 5★ 0.7. A walk-on (1★) expects half.
  - The cap: the role his overall would earn in this position group, plus `slack` (0.25). A fourth-string senior expects some snaps, not the job.
  - A backup within `close` (2) overall of the weakest starter at his position expects `closeExpect` (0.8): nearly as good, and feels buried.
- A role short of expectation hurts in full. One above it lifts by at most `roleUp` (0.1).

**Team** (`teamW` × team trait × `teamMood`). Team mood comes from the results, never stored, -1 to 1:
- form over the last four games (newest counts most)
- an AP rank
- a losing streak past two games
- fading bumps for a rivalry win or loss, reaching bowl eligibility, making the playoff, and winning a bowl or playoff game. Each bump keeps `eventFade` (0.6) of itself per game since.

**Coach decisions:** a fading term (`Progress.me`, kind `mk`), set in the weekly step from last game's starters (`newStarters`):
- **Lost his starting job** while healthy and not resting: -0.5 × pride. It doesn't matter whose chart made the call, the staff's or the user's. A slumping starter the staff sit is benched too.
- **Won a job** (any new starter who isn't covering a rest day): +0.2.
- Either keeps `decisionFade` (0.75) of itself each team game.

**Locker room** (`roomW` × his teammates' morale, weighted by voice). It uses last week's morale, so there's no feedback within a week. An unhappy senior leader drags the room; happy leaders lift it.

## 3. How it moves (`moraleStep`)
- After each team game, for all 85 players: `m += rate × (target − m) + noise`. `rate` is 0.15, so one bad week barely registers and a lasting situation takes about six games to show. `noise` (SD 0.04, from `seasonRng(state, 'morale', team, week)`) keeps two players in the same spot from moving in lockstep.
- It runs before the confidence step, which moves `TeamState.st` on to this game's starters.
- It reads no grades. The test pins this: confidence values change nothing.
- Stored rounded to 0.01. A missing entry is his baseline.
- **New season** (`carryMorale`): half the distance from his baseline carries over, and coach decisions clear.

## 4. What it does
- **Practice effort:** the XP multiplier's morale factor is `1 + moraleXp × m` (0.9–1.1). This replaces the old placeholder, which was team win % plus ±0.02 for starting.
- Nothing on the field. Confidence drives this week's play; morale drives development and, later, retention.

## 5. Showing it
- **Card: the MOOD row**, under CONF. It has a pixel face (smile, flat or frown) and blue-to-gold colors, so it doesn't read as confidence's red-green bar.
  - The text is the mood label plus the biggest reason (`moraleReason`): the largest driver pulling the way his morale leans from his baseline, for example `FRUSTRATED: EXPECTS TO START` or `HAPPY: TEAM WINNING`.
  - His temperament word sits on the right.
  - Mood labels: MISERABLE (−0.5 or lower), FRUSTRATED (−0.2 or lower), CONTENT, HAPPY (0.2 or higher), FIRED UP (0.5 or higher).
  - Reasons: role (EXPECTS TO START, WANTS MORE SNAPS, SHOULD BE STARTING, STARTING, EARNED A ROLE), team (TEAM WINNING or LOSING, LOSING STREAK, TEAM RANKED, RIVALRY WIN, LOST THE RIVALRY, BOWL BOUND, BOWL WIN, IN THE PLAYOFF), coach (BENCHED, WON THE JOB), room (LOCKER ROOM UPBEAT, UNHAPPY VETERANS), or SETTLED.
- **Depth list:** a small blue frown next to the number of anyone at −0.4 or lower.
- **Header:** `MOOD:` with the roster's mean label.
- **No news** for morale. That was a deliberate choice.
- To fit the row, the OTHER RATINGS grid lost its header line (a rule separates it now).

## Calibration (`npm run season`, 5 seasons)
| Measure | Sim | Target |
| --- | --- | --- |
| Morale SD, everyone, every regular week | 0.21 | about 0.2–0.25 |
| Beyond ±0.6 / beyond ±0.9 | 0.6% / 0.0% | under 5% / about 0 (not at the extremes) |
| Unhappy (−0.4 or lower) per team | 4.0 (max 22, none on 20% of teams) | 3–8 |
| Share of the unhappy on the worst 10% of teams (pooled over weeks) | 22.6% | under 30% (spread out) |
| Starters' morale vs. confidence | r = 0.006 | \|r\| under 0.3 |

- **By role:** starting 0.07, package 0.00, backup −0.05, buried −0.10, hurt 0.05.
- **By tier:** T1 0.03 down to T5 −0.05.
- **Why the unhappy are unhappy** (end of the regular season): role 84%, coach 7.5%, team 4.7%.
- **Losing teams do cluster** (a 1-11 team can reach about 20 unhappy players). The first version had 60% of the unhappy on the worst 10% of teams. Moving weight from the team and the room to the role (`teamW` 0.35 → 0.2, `roomW` 0.3 → 0.15, `roleW` 0.7 → 1.4, `streakCap` 0.3 → 0.2) spread them out.
- **Progression:** the mean starter gain is 1.39 (was 1.40). The tier line is a little flatter (T1 1.39 to T5 1.23, was 1.43 to 1.21), since win % no longer feeds XP directly. The punter row stays flagged (unchanged).
- **Breakouts** went from 57 to 65 a season (9.9% → 11.1% of sparks). Sparks are unchanged (4.2 per team-season). Morale doesn't touch the grades or the breakout test, so this is probably the knock-on of different XP, and so different ratings, across 5 seasons. It's about 2 SD. Not tuned.
- Scores, injuries and confidence are otherwise within noise. `npm run balance` is byte-identical.
- **Speed:** a season takes 2.60 s (was 2.32 s). `positionOrders` (`data/depth.ts`) builds every position's order in one pass for the context.

## Not built yet (morale is designed to feed these)
- **Transfer portal:** unhappy players, especially proud ones with a big role gap, ask to leave.
- **Recruiting:** a happy roster recruits better.
- **Talking to players:** promises (more touches, a shot at the job). A kept promise lifts morale; a broken one drops it. The coach decision term (`Progress.me`/`mk`) is the place for it.
- **Captains:** naming one lifts him, and a captain's voice counts more in the room.
- **Position changes** offered for playing time. A move to a new position is also a coach decision.
- **Redshirts:** a happier player accepts one more readily.
- **Pulled mid-game:** waits for mid-game substitutions.
