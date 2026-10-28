# Coaching staffs

Every program has a staff: an OC, a DC, nine position coaches and a head trainer. For now their ratings do three things:
- **Scouting:** how much of the weekly scouting report each coach finds, and how precisely.
- **Weekly emphases:** a position coach can have his group practice one thing this week.
- **The DC's style:** the DC carries the defense's style (aggressive, balanced or soft).

Recruiting, hiring and the carousel come later (see the end).

| Piece | Where |
| --- | --- |
| Staffs: roles, ratings, generation | `src/data/coaches.ts` (`buildStaff`, `STAFF`) |
| Emphasis table | `src/data/emphasis.ts` (`EMPHASES`, `GROUP_POS`, `GROUP_SLOTS`) |
| Emphasis effects, practice tags | `src/season/emphasis.ts` (`EMPHASIS`, `emphasisMods`, `snapEdge`, `practiceTags`) |
| Report tiers and precision | `src/season/scouting.ts` (`SCOUT_TIERS`, `pctAt`, `suggestEmphasis`) |
| A season's staff | `staffFor` in `src/season/world.ts` |
| Staff page | the STAFF tab of the prep page (`src/render/prepScreen.ts`, `Game.updateStaff`) |

## Staffs
Staffs are generated from the team id and never stored, like rosters (`buildStaff`, cached).
- **Level:** a program's level is `STAFF.base + perPrestige × prestige` (40 + 0.4 × prestige), plus a per-program spread (`levelSd` 6). Each coach's ratings scatter around it (`ratingSd` 7), clamped to 30–95.
- **Ages:** 32–66.
- **Names:** from the player name pools.
- **`staffFor(state, id)`:** returns the generated staff. Hires, firings and the carousel will lay their changes over it there, the way `squadFor` does for rosters.

**Ratings.** Every one changes something:

| Rating | Who has it | What it does |
| --- | --- | --- |
| SCOUT | everyone | Which report items his section finds (`SCOUT_TIERS`), and how precise his tendencies are (`pctAt`). Position coaches also need it for their emphasis suggestion |
| TEACH | position coaches | How hard his emphasis steers his players' level-ups (`coachFactor`: 0.8 at 30, 1 at 50, 1.45 at 95) |
| GAME | position coaches | How much his emphasis shows up in simulated play (same factor) |
| RECRUIT | position coaches | How much interest he builds with a transfer-portal target each round ([PORTAL.md](PORTAL.md)). Drawn on its own stream (`staff-recruit:<team>`), so every other rating is unchanged |

**The DC owns the style.** `defIdentity` reads `buildStaff(team).DC.style`. The DC is generated with the same seeded style the program had before (`defStyle`, tested for every team), so identities, live calls and `balance.txt` are unchanged.

**By program tier** (`npm run season`):

| Tier | Mean scout | Section coaches finding tier 2 | Finding tier 3 |
| --- | --- | --- | --- |
| T1 | 78.6 | 100% | 55% |
| T2 | 71.0 | 89% | 26% |
| T3 | 63.3 | 65% | 7% |
| T4 | 56.7 | 39% | 1% |
| T5 | 51.5 | 18% | 0% |

## Scouting by staff quality
- **Sections:** each report section belongs to a coach (`ScoutSection.role`: OC, DC, WR, OL, QB, trainer, ST). The header shows his name and SCOUT.
- **Hidden items:** an item shows when his scout reaches `SCOUT_TIERS` for its tier (tier 1 always, tier 2 at 60, tier 3 at 78). The rest are counted in `hidden`, and the page shows `+2 MORE: A SHARPER EYE WOULD FIND THEM`.
- **Precision** (`pctAt`), for the OC's and DC's tendency numbers:
  - exact at 75+ scout
  - `~30%` (to the nearest 10) at 55–74
  - words below 55: RARELY, SOMETIMES, OFTEN, MOSTLY
- **Staff picks use only what was found.** Each play-suggestion rule fires only if its read is visible:
  - press rate and cushions: the OC at tier 2
  - the speed and route edges: the WR coach at tier 2
  - the run side: the OL coach at tier 3
  - Shells and the zero-blitz rate are tier 1, so they always count.

## Weekly emphases
**STANDARD is the default, and it's the normal practice week:** the usual level-up draws and no game-day effect. The user never has to touch emphases. Picks live in `TeamState.emph`, only for the user's team, and **`advanceWeek` clears them**, so every week starts on standard. **CPU staffs stay on standard for now**, so ignoring the feature costs nothing and the league's calibration doesn't move (`npm run season` is identical to before outside its COACHES section).

A pick does two things:

### 1. Practice: steering level-ups
- After each game, every player in the group who played gets `EMPHASIS.tag × playing share × coachFactor(teach)` performance tags on each of the emphasis's ratings that count at his position (`practiceTags`).
- These are the same tags games already add. `pointWeight`'s performance factor reads them (+`perfBoost` 0.1 per tag, capped at ×2.5), and they clear at his next level-up.
- One full-time week at teach 50 makes those ratings about ×1.7 as likely on his next level-up.
- **Total XP doesn't change.** It only moves where points land.
- **Side effect, kept on purpose:** practicing a rating with a small overall weight (WR blocking, `rbk` 6 of 100) grows the overall a little slower than the standard draw. That's the cost of a blocking week.
- **Measured:** over 12 weeks of one emphasis, the odds of a point landing on its ratings rise ×1.6–2.2 at every group but ST. Odds, not shares, because a group whose focus already takes most of its points can't double its share. Kickers and punters run higher (×2.3–3.0): they level about half as often, so the tags pile up toward the cap.

### 2. Game day: simulated play only
- **Where it plays:**
  - the user's simulated games, both units
  - **the user's defense in live games**, since the CPU's possessions are always simulated (`Game.cpuDrive` passes the user's defensive mods)
- **Where it doesn't:** the user's live offense, by design.
- **How it plays:** `simulateDrive` takes optional `DriveMods` (`emphasisMods` → `driveMods`). Per snap:
  - **edge:** rating points on the gain, from `snapEdge`
  - **explosive:** the big-play odds × (1 + offense − defense)
  - **turnover:** the takeaway odds × (1 + defense)
  - **fg:** an edge in `fgOdds`
  - They draw no extra random numbers, so without mods a drive plays exactly as before (tested).
- **Size of an effect:** `base(kind) × EMPHASIS.when[situation] × GROUP_WEIGHT[group] × coachFactor(game)`.
  - `GROUP_WEIGHT` is the group's share of its unit's `TEAM_WEIGHTS` to the power `shareExp` (0.5). Big rooms matter more without the DBs (48% of the defense) drowning out a tight end (6% of the offense).
  - `when` scales rare situations up (passing downs ×2, red zone ×3, short yardage ×4), so they're worth about as much over a game as an every-snap emphasis.
- **Pass and run phases:** a pass effect is scaled by `passOdds/0.5`, a run effect by `(1 − passOdds)/0.5`.
  - `passOdds` is the offense's plan share, +0.25 on passing downs (3rd/4th and 5+, 2nd and 8+), −0.25 at 2 or less to go.
  - **This is what makes the DC's report count:** pass rush is worth more against a passing team, stop the run against a running one.
- **Grades expect it.** The drive log carries each snap's edge (`LoggedPlay.em`), and `gradeGame` adds it to the expected success and FG odds. So an emphasized team still grades about 0 per snap (tested), and an emphasis grows players only through practice.

### The emphases

| Group | Emphasis | Practices | Game day |
| --- | --- | --- | --- |
| QB | Pocket poise | pac, tup | pass edge on passing downs |
| QB | Accuracy | sac, mac | pass edge |
| QB | Deep ball | dac, arm | more big pass plays |
| RB | Break tackles | elu, str | more big runs |
| RB | Pass pro | pbk | pass edge on passing downs |
| RB | Short yardage | str, rbk | run edge at 2 or less to go |
| WR | Route running | rte, rls | pass edge |
| WR | Contested catches | cit, cth | pass edge in the red zone and on passing downs |
| WR | Perimeter blocking | rbk | more big runs |
| TE | Blocking | rbk, pbk | run edge |
| TE | Receiving | rte, cth, cit | pass edge in the red zone |
| OL | Pass pro | pbk, str | pass edge on passing downs |
| OL | Run blocking | rbk, str | run edge, double at short yardage |
| DL | Pass rush | rsh | pass edge on passing downs |
| DL | Stop the run | bsh, tkl | run edge |
| LB | Run fits | prc, bsh, tkl | run edge |
| LB | Coverage | zcv, mcv | pass edge |
| DB | Press man | mcv, prs | pass edge |
| DB | Ball skills | cth, zcv | more takeaways on pass snaps |
| DB | Tackling | tkl | fewer big runs allowed |
| ST | Leg | kpw | FG odds from 45+ |
| ST | Accuracy | kac | FG odds under 45 |

### Calibration (COACHES section of `npm run season`)
- **Method:** the median team by overall (Toledo, 74) plays all 137 others, 300 paired drives each, scaled by 12.9 drives a game.
- **Why drives, not games:** whole games are too noisy to pair, because a changed gain reshuffles the rest of the game's draws (a first try at 8 games per opponent swung ±0.6 points). Within a drive the draws stay in step.
- **Target:**
  - +0.2 to +1.0 points of margin a game at game-day 50
  - nothing over 1.5 at game-day 95
  - within each defensive group, the better choice depends on the opponent

| Emphasis | @50 | @95 | vs pass-heavy | vs run-heavy |
| --- | --- | --- | --- | --- |
| DL pass rush | 0.70 | 0.96 | 0.91 | 0.68 |
| DL stop the run | 0.64 | 0.89 | 0.47 | 0.97 |
| LB run fits | 0.42 | 0.62 | 0.34 | 0.69 |
| LB coverage | 0.58 | 0.84 | 0.83 | 0.40 |
| DB press man | 0.99 | 1.42 | 1.19 | 0.95 |
| DB ball skills | 0.63 | 0.89 | 0.66 | 0.29 |
| DB tackling | 0.42 | 0.63 | 0.34 | 1.06 |
| Offense | 0.13 (TE receiving) to 0.69 (QB accuracy) | up to 1.03 | | |
| ST | 0.10–0.18 | up to 0.24 | | |

- **First pass:** sizes scaled with the plain group share. DB press man was worth +2.25 a game and TE receiving +0.04. The square-root weight and the `when` scales fixed both.
- **DB tackling started as an every-snap effect,** which left press man best against every opponent. It's now a run-phase effect (open-field tackles on runs and screens), so it wins against run-heavy offenses.
- **Flag, not tuned: offensive emphases don't depend on the opponent.** The drive sim doesn't model the defense's calls, so QB accuracy is always a little better than pocket poise for a given team, and OL pass pro vs run blocking follows only our own pass share. Hooking the opponent's `defIdentity` in (a blitz-heavy defense makes pocket poise and pass pro count more) is the next step. For now the offensive choice is mostly about practice.

## Staff page (prep page, STAFF tab)
- **Left:** each coach's role, name, SCOUT / TEACH / GAME (colored like overalls), and this week's emphasis. STANDARD is dim; a pick is gold, and the DC shows his style.
- **Right:** the selected coach's job and what his scouting finds.
  - A position coach also lists his options: label, the ratings practiced, a blurb and the game-day effect.
  - Then his suggestion (`SUGGESTS: STOP THE RUN / THEY RUN 46%`), or `NO READ ON THIS ONE` under tier-2 scouting.
- **Controls:** W/S picks a coach; Q/E or a click picks his emphasis; R puts every group back on standard. A/D still switch tabs. Picks are saved with the season.
- **Team page card:** hovering the XP multiplier adds `PRACTICING RSH` for a player whose group has an emphasis this week.
- **Scouting tab:** the DC section's note lists the defensive coaches' ideas.

## Later
- **HS recruiting:** a coach's pitch, with RECRUIT (used by the portal) and recruiting as a specialization.
- **Coaching carousel:**
  - firings and retirements, CPU schools included
  - assistants poached for other jobs, or for head coach elsewhere
  - `staffFor` lays the changes over the generated staff
  - a new DC brings his own style (so `defIdentity` needs the state then)
- **Specializations:** recruiter, motivator (morale), developer (a group XP multiplier: the "development" bonus deliberately left out of emphases).
- **OC scheme identities,** possibly with playbook variants by identity.
- **CPU emphases:** an `autoEmphasis` from the same suggestions, once it's worth the league-wide recalibration.
- **Opponent-aware offensive emphases** (see the flag above).
