# Player progression

Players improve during the season on their own; the user never picks attributes. Each game earns XP, XP rolls into levels, and each level-up spends a few rating points chosen by weighted draw. CPU teams run the same code.

| Piece | Where |
| --- | --- |
| Drive logs | `simulateDrive`'s `onPlay` (`game/rules.ts`), collected by `simGame` and by the live game (`Game.logSnap`, `logKick`, `cpuDrive`) |
| Game grades | `season/grades.ts` (`gradeGame`) |
| XP, levels, attribute draws | `season/progression.ts` |
| Week step | `progress` in `season/season.ts`, between `play` and `results` |
| Stored state | `TeamState.progress` (`season/types.ts`), laid over the roster by `squadFor` (`season/world.ts`) |
| Team page | WK and ALL columns, LVL and XP on the card (`render/teamScreen.ts`); last week's level-ups in the hub (`render/seasonScreen.ts`) |

## 1. Drive logs
The season sim works in whole drives, so there are no real per-player events to grade. Every game is graded from its **drive log**: each snap's gain, down and distance, turnover, and the kicks. Grades are drawn at random from that.
- **Simulated games:** `simulateDrive` reports each play to an optional `onPlay` callback. It draws no random numbers, so every score is unchanged. A test checks this.
- **Live games:** the user's snaps are logged with the real gain, pass or run (the play's kind), sack, interception, and every kick. The user's defense never plays live; it is graded from the CPU's simulated drives, the same way CPU games are.
- Logs aren't saved. They live for one week's `progress` step.

## 2. Game grades: against what the matchup expects
Each snap, every player on the field gets one grade: his result at his job (a win, 1, or a loss, 0) less the win rate **expected for him in that matchup**. Grades measure playing above or below expectation, never the matchup itself.
- **Win odds:** `sigmoid(gapK·gap ± q)`.
  - `gap` is his overall against the man across from him (`MATCHUP`: OL vs DL, WR vs CB, TE vs SS, and so on).
  - `q` is `GRADES.play`: + for the offense on a successful snap, − for the defense, reversed on a failed one. A snap is successful at 40% of the distance on first down, 60% on second, and all of it on third and fourth.
- **Expected win rate** (`expectedWin`): the same odds averaged over the snap succeeding or failing, at the rate expected for this offense against this defense.
  - That rate is `expectedSuccess(offense rating − defense rating)`, the home edge included: `sigmoid(0.254 + 0.0365·gap)`, fit on 3,000 simulated games between real rosters (game script included). It's within about 1 point of the sim at every gap from −28 to +28.
- **Why winning isn't rewarded:**
  - Both the rating gap and the team matchup are in the expectation. So a strong team beating a weak one, or a star beating a backup, grades about 0 on average.
  - Holding a block against an elite rusher is unexpected and is worth more than the same block against a weak one; losing it costs less.
  - In live games, the user beating the expected success rate (better play-calling and execution than the ratings predict) raises the offense's grades, and falling short lowers them.
- **Measured:** template teams at 88 against 68, 200 games. The strong team wins nearly every game, and both teams' starters average 0 per snap (±0.003) and earn the same XP per game (97–98).
  - Before this fix, the strong team graded +0.21 a snap and the weak one −0.22, so the strong team earned 5× the XP.
- **One-on-one reps** (`PAIRS`: tackles and guards against the line, X/Z/slot against the corners and nickel, TE against the strong safety, the back against the WILL) are one draw per snap, and the defender's grade is the mirror image. A block won by the tackle is a block lost by the end.
- **Key players:** the passer, the target and his cover man, the ball carrier and the tackler use the larger `GRADES.key`, so their result follows the play more closely.
- **Special plays:**
  - A sack tags the rusher who beat his lineman (`rsh`). Both grades come from their rep as usual.
  - An interception is a loss for the passer and the target and a win for the cover man (`cth`).
  - On a deep ball the free safety shares the coverage half the time.
- **Kickers:** a field goal is graded against the drive sim's make odds at that distance and an XP against 0.97. Punts and kickoffs are graded against the expected result of the matchup with the other team's kicker or punter.
- **Fair by position:** the same curve and the same expectation apply everywhere, so at any matchup the average snap grades 0 at every position. Position never decides how fast someone levels.
- **Who's on the field:** the 11-personnel offense and the nickel defense, from the depth chart.
  - Backups rotate in (`ROTATION`: DL and RB 30%, TE 20%, LB 15%, WR and DB 10%, OL 3%, QB 2%).
  - Package players sub for a slot (`PACKAGES`): TE2 and FB for the slot receiver, SAM for the nickel, DIME for the MIKE.
- **Playing time (`share`):** his snaps over what a full-time player at his slot plays. A defensive tackle starter at his normal 70% counts as full time, like a tackle at 97%.

## 3. XP
- **Game XP:** `share × (gameXp + gradeXp × average snap grade)`, floored at 0, times the multiplier below.
- **The multiplier:** `clamp(headroom × dev × confidence × morale × class, 0.5, 2) × potential factor`. The potential factor is the only part that goes under the 0.5 floor.

| Part | Range | From |
| --- | --- | --- |
| Headroom | 0.6–1.4 | Potential minus overall: 0.6 at his ceiling, 1.4 with 10+ to go |
| Potential factor | 1 down to near 0 | `potentialFactor`: 1 with a point or more of room, falling to `atPotential` (0.15) at his potential, then halving for every point past it (`overHalving`). Applied after the clamp |
| Dev | 0.85–1.45 | `DEV_XP`: normal, impact, star, elite |
| Confidence | 0.9–1.1 | His last 3 game grades (stored in `Progress.g`) |
| Morale | 0.9–1.1 | His team's win %, and whether he starts |
| Class | 0.85–1.2 | `YEAR_XP`: FR 1.2 to SR 0.9; a redshirt year takes off 0.05 |

Confidence and morale are computed from game results, not stored as ratings. The card shows the multiplier next to LVL; hover it for the parts (AT POT shows when the potential factor is under 1).

**Potential is a soft ceiling, not a hard cap.**
- A full-time starter at his potential earns about 0.08× XP: 0.5 × 0.15, about one level-up a season instead of five. A point past it, half that.
- Each of those rare level-ups can still be a breakthrough (4%), so once in a long while a player at his potential jumps 1–2 more points.
- The per-rating ceilings (section 4) still stop each rating at the shape of his potential plus `ceilMargin`.
- Over 4 open-ended seasons (no graduation yet), no player got more than 1.5 overall past his potential (it was 4.5 before the factor). Players who start a season at potential level up 0.1–0.3 times in it.
- Many players still end a little past it (a quarter of leveled players after one season), because a level-up can land past potential before growth slows.

## 4. Level-ups and which ratings grow
- **XP per level:** `LEVEL_XP[pos]` (175 at most positions).
- **Points per level-up:** 1–3 at a typical position. A **breakthrough** (`breakOdds`, 4%) gives 4–6 and makes the news: always on the user's team, plus the two biggest by real players elsewhere each week.
  - The 4% is flat per level-up, so a player's breakthroughs scale with how often he levels: about 1 in 5 starters a season, far fewer for players at their potential.
  - A level-up where no point can land (every rating at its ceiling) isn't counted: its XP is spent, but there's no level, no WK arrow and no breakthrough. Before this fix, such a level-up could make the news as an empty breakthrough.
- **Every point is a separate weighted draw,** re-weighted after it lands:
  `weight = position weight × profile × performance × growth rate × headroom × practice focus`

| Factor | What it does |
| --- | --- |
| Position weight | `OVR_WEIGHTS`. Ratings outside the position's overall never grow |
| Profile | `1 + (rating − template at his overall) / profileScale`, clamped to 0.5–1.8. A player grows into his strengths, so a pocket passer stays a pocket passer |
| Performance | `1 + min(perfCap, tags × perfBoost)`. Tags come from his games since his last level-up: deep completions → `dac`, contested catches → `cit`, broken tackles → `elu`/`str`, sacks → `rsh`, pass breakups → `mcv`/`zcv`, interceptions → `cth`, long field goals → `kpw`, and a small tag for every won rep (`pbk`, `rbk`, `rte`, `bsh`, `tkl`) |
| Growth rate | `GROWTH_RATE`: speed 0.04, acceleration 0.12, strength 0.35, stamina 0.4, skills 1, reads and poise 1.1 |
| Headroom | Slows each rating over its last `headroomSoft` points below its ceiling: his generated shape around the template, carried up to his potential, plus `ceilMargin`, at most 99 |
| Practice focus | Always 1; the hook for practice later |

**Equal overall growth across positions.** A tackle's overall is mostly two ratings, so a point moves it about twice as much as a QB's point; a kicker's about 2.7 times.
- `POS_POINTS` scales the points per level-up so a level-up is worth about the same overall everywhere: a QB gets 1–4 points and a tackle 1–2.
- A level-up never gives fewer than one point. So OL, K and P need a little more XP per level (`LEVEL_XP`), and they level about 4 times a season against 5 elsewhere.
- Tested: overall per XP is within 15% at every position.

## 5. State
- **`TeamState.progress[athleteId]`:**
  - `xp`: XP toward the next level
  - `lvl`: level-ups so far
  - `d`: the all-time rating changes
  - `up`: the week of his last level-up and what it raised
  - `tags`: performance tags since his last level-up
  - `g`: his last 3 grades
- **`squadFor`** adds `d` to the generated ratings. Once anyone has leveled, it rebuilds the staff depth chart, so a player who passes a teammate moves up. Squads are cached per team state and rebuilt only when levels, injuries or the user's chart change.
- **`nextSeason`** carries progress into the next year, so ALL means all time.
- **Save size:** progress adds about 0.9 MB, so a full season packs to about 2.6 MB (localStorage holds about 5 MB). `SAVE_VERSION` is unchanged: the field is optional, so old saves load.

## Calibration (`npm run season`, 5 seasons)
Overall gained over a season by the generated depth chart's starters (11-personnel offense, nickel defense, K, P):

| | QB | HB | WR | TE | OT | OG | C | DE | DT | OLB | MLB | CB | FS | SS | K | P |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Overall | 1.5 | 1.6 | 1.5 | 1.5 | 1.5 | 1.6 | 1.7 | 1.4 | 1.5 | 1.7 | 1.5 | 1.7 | 1.7 | 1.5 | 1.7 | 1.9 |
| Levels | 3.8 | 4.0 | 3.7 | 3.7 | 3.0 | 3.4 | 3.6 | 3.3 | 3.5 | 4.3 | 3.5 | 3.7 | 3.9 | 3.8 | 3.2 | 3.2 |

- **Spread:** the mean is +1.58, down from +1.95 before the potential factor: most starters are upperclassmen with little room, and now slow down sharply at their potential. The lowest position is 1.41 (DE) and the highest 1.85 (P).
- **Flag:** the punter row is 17% over the mean, past the report's 15% line. It was already the highest row before (2.2). A punter's overall is two ratings, so one level-up can land well past his potential before the factor slows him. Not tuned: 138 punters a season.
- **By program tier:** T1 1.60, T2 1.69, T3 1.64, T4 1.54, T5 1.38. Grades don't cause the slope. Two factors in the XP multiplier do:
  - **Morale** reads the team's win %, up to about 6% more XP for a winning team. It's the one place winning is rewarded on purpose.
  - **Dev traits** come out better for better players when rosters are generated.
- **Backups and package players** gain 0–0.3, since they play little. Offseason growth belongs to the offseason, which isn't built yet.
- **Scores and polls** didn't move outside noise: 26.3 points per team, 4.9 ranked losses a week.
- **Speed:** a season now takes about 1.7 s, up from 0.63 s. Most of it is grading every snap of every game (about 0.5 ms a game).

## Not built yet
- Offseason growth, graduation and aging.
- Practice focus.
- Showing confidence and morale on their own, and per-game grades on the card.
- A player who doesn't play still earns nothing, including a redshirting freshman.
