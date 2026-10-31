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
- **`staffFor(state, id)`:** the season's staff, with chairs and rating changes laid over the generated one, the way `squadFor` does for rosters (see "Coaches over time").

### Coaches over time
Head coaches, offseason growth, and the coaching carousel (plan: [CAROUSEL_PLAN.md](CAROUSEL_PLAN.md)).
- **Ids for life:** a coach's id is `<team>-<role>`, the staff he was generated on, or `<team>-<role>.<year>.<n>` for outside candidate `n` for that chair in the offseason after `year`. `parseCoachId` reads one back; `generatedCoach`, `generatedHeadCoach` and `anyCoach` rebuild him.
- **Chairs:** `TeamState.staff` maps a role (`HC` included) to the coach in it, when that isn't the generated coach.
- **Rating changes:** `SeasonState.coaches[id].d`, carried wherever he coaches, within 1–99 (`applyCoachDelta`).
- **`staffFor`** lays both over the generated staff (cached), and `headCoachFor` over the generated head coach. A coach seated in a new chair takes that role. His ratings for it are his own where he has them; the rest (a coordinator made head coach, say) are seeded around his own level, SD 5 (`coachAs`, `ROLE_KEYS`). A DC keeps his style, or takes the program's. Ages go up a year each season past the one he was generated for (`from`, else `CALENDAR.year`).
- **Coach careers** (`season/coaching.ts`, `SeasonState.coachCareers`): when a season completes, every coach (head coaches included) gets a row with team, chair, ratings at the season's end and the team's record. It's history only, about 1,800 rows a season.
- **Offseason growth** (`progressCoaches`, run by `newSeason` on the season before; tuned with `COACH_GROWTH`). Each rating of each seated coach, head coaches included, changes by arc × age × work, in whole points:
  - **Arc** (hidden, seeded from his id, young coaches lean riser and old ones fading):
    - riser: +1.4 a year, up to 20 over his generated rating
    - steady: +0.3, up to 8
    - plateau: flat
    - late bloomer: flat until a move or 2–6 seasons in, then +1.8, up to 16
    - fading: −0.5, and he ages 1.5× as fast
  - **Age:** each rating has a peak window: scout and eval 48–68, teach and develop 40–58, game 44–57, recruit 34–50. Below it he gains 0.3 a year; past it he loses 0.3 plus 0.06 a year past the window, up to 1.5.
  - **Work** (counted in the season, `TeamState.lug`, `eg`, `xw`; z-scores against the league, within ±2):
    - teach: his group's level-ups per player, against the same group league-wide (×0.8)
    - scout: wins over the pregame odds (`winOdds`) a game (×0.4), a stand-in for reads that came true
    - recruit: portal signings less half the misses (targets he built interest with who signed elsewhere) (×0.8)
    - game: the share of games his group practiced on an emphasis (×1.5). Only the user picks emphases, so CPU staffs grow GAME from arc and age alone
    - a head coach's develop: the program's level-ups per player (×0.8); his recruit: the program's signings less misses; his eval: no work
    - a coach hired this offseason did none of the season's work
  - **Comfort:** after 5 seasons in one chair growth halves. Starting tenure is seeded (0–8), so some coaches start comfortable. A move restarts it, with +1.
  - **Mentor:** a position coach grows up to 15% faster under a coordinator 25 scout over his tier's mean, and up to 15% slower under a weak one. It's measured against the tier so mentoring doesn't widen the gap between tiers. `CoachProgress.under` keeps everyone he has worked under (his coordinator, or a GA's position coach, and his head coach): his place in coaching trees.
  - It returns the next season's changes and leaves the old season alone, so it gives the same result however often it runs.
- **Head coaches** (`buildHeadCoach`, `<team>-hc`, on the stream `hc:<team>` at the program's staff level, aged 40–68). The user is his own team's head coach. Each rating has one job, and the first two are measured against the head coaches in the same tier (z-scores within ±2, `HEAD_EFFECT`). Programs within a tier spread apart while the league and its tiers stay calibrated:
  - **DEVELOP:** the program's XP multiplier, ×(1 + 0.06·z) (`programXp`, into `progressTeam`). It multiplies with the position coach's TEACH factor below
  - **RECRUIT:** his portal calls' and visits' interest, ×(1 + 0.15·z) (`headRecruit`, in `pursue`)
  - **EVAL:** how he hires: true worth over reputation (`hire`)
- **The coaching carousel** (`season/carousel.ts`), the offseason's first stage, before the portal. Tuned with `CAROUSEL`, `TURNOVER`, `WILL`, and `HEAD` in `data/coaches.ts`.
  - **Reputation** (`CoachProgress.rep`, `repOf`): his worth plus a seeded error (SD 8) to start. Each offseason it moves 30% of the way to what the world saw: his program's staff level plus 6 per SD of his unit's results. Those are points scored for the offense, points allowed for the defense, wins against expectations for a head coach, and wins for ST and the trainer. A stacked roster flatters its coaches. Losing a job costs 4. An outside candidate's reputation is 3 under his worth's.
  - **Motives** (hidden, seeded, `motiveOf`): climber, lifer, mercenary, homebody, loyalist or winner, 25% climbers and 15% each of the rest. `willing` scores a move by motive: a base; per level up the ladder (position coach, coordinator, head coach); per 20 prestige up; per win share up; ±home region (homebodies); and −0.8 for an assistant job under a hot-seat head coach. Noise SD is 0.3, and he takes the move over 0.1. A coach out of a job takes nearly anything, but he's put off by big steps down (−0.5 per 20 prestige). Outside candidates always say yes.
  - **Opening:**
    - CPU head coaches' security moves by wins against `expectedWins` (6 a win). It starts at a seeded 30–85, and at 60 for a new hire. Under the hot seat (25) after 2 seasons, he's fired at 50% odds.
    - Retirement for everyone but the user: 0.4% a year under 60, then 3% plus 2.5% a year past 60 (up to 50%), certain at 76. A big year (3 wins over expected) adds 12% at 56+.
    - A CPU head coach fires his OC or DC at 50% after a season more than 1 SD under the league on his side of the ball.
  - **The head coach chain** (`headChain`, instant): openings fill best program first. The pool is FBS head coaches at programs 5+ prestige smaller, coordinators at programs no more than 30 smaller, coaches out of a job, and 3 outside candidates. The athletic director picks among the willing, 30% on worth and 70% on reputation. A hire from FBS empties his chair, and an emptied head coach chair joins the chain.
  - **A new head coach** keeps each assistant at 30%. His loyalists from his old staff follow him into the chairs he opened.
  - **Hiring rounds** (5, `carouselRound`): every open assistant chair gets one offer, best program first. A CPU staff calls around and offers the best candidate who'd listen, by its head coach's eval; it doesn't offer a coach another CPU staff already has an offer out to. The user's offers compete with anyone's. Each candidate takes his best offer if he'd move for it, and a move empties his old chair for the next round.
    - **Pools** (`poolFor`): the same chair at a program 5+ prestige smaller; for a coordinator job, his side's position coaches at programs no more than 20 smaller; in-house promotions; the best 12 by reputation. Plus 4 coaches out of a job (never back to the program that let them go) and 3 outside candidates.
  - **The close** (`closeCarousel`): chairs still open go to the best outside candidate.
  - **Outside candidates** (`outsideFor`) are built from their ids at the program's staff level plus a tier shift: −9, −7.5, −6, −4, −2 for T1 to T5. The FCS is a real pool for a small program, not for a big one. They're younger: assistants 29–48, head coaches 38–58.
  - **The pick** (`hire`) weighs true worth by the hirer's eval (30 → 0, 95 → 1) and reputation for the rest.
  - **The user's side** (the CAROUSEL screen, `render/carouselScreen.ts`; the hub's HIRING button):
    - **HIRING:** each open chair's candidates show reputation and where they are now. Their ratings are ranges as wide as the user's eval leaves them ((100 − eval) / 4, 2 to 14). There are 2 interviews per open chair: one halves the ranges and reveals the motive, a second makes the ratings exact. One offer per chair a round.
    - **MY STAFF:** fire an assistant to open his chair.
    - **AROUND THE LEAGUE:** the offseason's coaching news.
    - F hands hiring to the staff (`delegate.carousel`). `startToPortal` runs the carousel delegated, for tests and the report.
  - Every head coach change, coordinator firing, and the user's staff changes make the news (`carousel`) and open the next year's feed. `CarouselState.log` records every hire.
  - **Players react** (`reactToDepartures`, at the close, from who sat in every chair when it opened, `CarouselState.was`):
    - **Bond:** seasons together over 3, from 1/3 to 1. Together is the shorter of his seasons on the team (since he transferred in, else his class) and the coach's seasons in the chair. A coach who recruited him and coached him for years hurts most.
    - **Morale** drops by 0.3 × bond for his position coach, 0.12 for his side's coordinator and 0.2 for a head coach. The biggest one counts, and `Progress.cl` records it (chair, bond, and where the coach went).
    - **In the portal:** his entry odds rise and the coach's new school pulls him ([PORTAL.md](PORTAL.md)).
    - **For the user:** firing an assistant shakes his room, and the news says how many took it hard.
- **Checked by** the STAFF section of `npm run season` (the portal report's career, 5 offseasons), as of 2026-10-30:
  - **Growth** (assistants seated all 5 offseasons): risers +5 to +6.5 a rating, 75% up 4+; plateau flat to −2; fading −1 to −6, 33% down 4+. By age, the young gain and the 60+ lose teach, game and recruit. Their drift a year is at most +0.5.
  - **Turnover:** 20.4 head coach changes a year (real about 20–25). Assistant turnover is 20.7% a year (real about 30–40%; the floor is 20%). Chairs opened: moves 52%, let go 29%, retired 13%, fired 6%. They were filled by FBS coaches 33% (promotions 4.5%), coaches out of a job 21%, outside 47%.
  - **Flows:** FBS moves by tier go up 286, same 215, down 100.
  - **Ages:** assistants 48.6 → 46.7, head coaches 55.3 → 53.4.
  - **Staff level:** the league +2.35 over 5 seasons (flag at 2.5); the T1–T5 gap +1.0 (flag at 1.5).
  - **EVAL:** worth given up against the best candidate is 1.34 under 55 eval, 0.86 at 55–69, 0.24 at 70+.
  - **DEVELOP:** level-ups a player run 0.95 / 1.03 / 1.01 by the head coach's develop, bottom / middle / top third.
  - **The rest of the report:** unchanged from step 3: the growth table, starter gain by tier, and the 7 flags already known.
  - **Step 6 (TEACH):** level-ups a player run 0.93 / 1.02 / 1.05 by his position coach's TEACH factor, bottom / middle / top third. The per-position growth table and mean starter gain (1.39) hold, and starter gain by tier is unchanged.
  - **Step 7:** 12 GAs promoted a year (3.4% of hires). The user's tree is 6 after 5 seasons; the league's biggest is 42.
  - **Tuning history:** the first pass filled 79% of chairs from outside, because the best of several noisy outside reputations beat real coaches. Then every staff called the same free agents. Claimed offers, weaker outside candidates, and a tier-based outside shift made the market work while keeping the gap and level in bounds.
- **TEACH and development** (step 6 of the plan): a position group's XP is also ×(1 + 0.05·z), where z is its position coach's TEACH against the same group's coaches in the tier (`groupXp`). A great QB coach lifts his QBs, and the league and its tiers stay calibrated. TEACH also still steers an emphasis's level-ups (`coachFactor`).
- **Graduate assistants** (step 7; `GA` in `data/coaches.ts`, `TeamState.ga`, `gasFor` in `season/world.ts`):
  - 2 a program, with ids `<team>-<group>.<year>.ga<n>`. They're generated at the staff level −10, aged 23–28 (so mostly risers), with a group they lean to.
  - They grow each offseason under that group's coach, with no work of their own.
  - In the carousel, they're candidates for any position chair at their program, and they always accept. On the HIRING tab they show as YOUR GA.
  - They move on after 3 seasons, and new ones fill the slots at the close.
  - Former players as GAs wait on graduation.
- **Coaching trees** (step 7):
  - `treeOf(root)` lists the coaches who have worked under him and now sit at another program. `treeScore` counts 3 for a head coach on it and 1 for a coordinator.
  - The user's tree shows on MY STAFF.
  - A hire from the user's tree to a head coach or coordinator job elsewhere makes the news ("your 2nd head coach branch").
- **Still reading the generated staff:** `defIdentity` (`data/identity.ts`) reads the generated DC's style. New DCs keep the program's style, so that's still right. It needs the season's staff once a DC brings his own.

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
