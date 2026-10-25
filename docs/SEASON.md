# Season mode

The season framework: every system in the week loop exists end to end, each behind a small interface with a simple first version. This doc says where each piece lives and what's still a placeholder, so details can be filled in one module at a time.

## Design principles
- **One mode, many starting points.** `SeasonConfig` holds the user's team, `coachCareer` (on = hot seat, firing and offers; off = dynasty), and `length` (`single` or `open`). Only the flags and a job-security stub exist so far.
- **Staff automation is the casual/deep dial.** Every management system has an `auto*` function in `season/staff.ts`. CPU teams always use it, and so does the user for anything in `config.delegate`. The season must always run with everything automated (the tests run it that way).
- **Progressive disclosure.** The hub shows record, rank and the next game up top, with one tab per system underneath. Box scores, ratings breakdowns and recruiting boards go one level deeper later.
- **Ratings drive the field.** Simulated games use the same `teamRatings` the live game uses, and box-score credit follows the starters' overalls.
- **Everything is data.** Conference rules, rivalries, the calendar, the playoff format and bowl tie-ins are plain objects in `src/data/season/`.

## Three layers
| Layer | Where | What |
| --- | --- | --- |
| World data | `src/data/season/` | `conferences.ts` (`CONF_RULES`: conference games, title game), `rivalries.ts` (`RIVALRIES`, rivalry-week flag), `calendar.ts` (`CALENDAR`: weeks, rivalry week, championship week, CFP start), `postseason.ts` (`CFP_FORMAT`, `BOWLS`, `BOWL_WINS`) |
| Season engine | `src/season/` | No DOM and no graphics. Plain-JSON `SeasonState`, the week loop, and every system below |
| On-field game | `src/game/game.ts`, `src/render/seasonScreen.ts` | The hub screen launches the live game for the user's week; the final screen writes the result back |

## State
`SeasonState` (`season/types.ts`) is plain JSON. A test checks that a season saved mid-way and reloaded finishes identically.
- **Rosters aren't stored.** They regenerate from the team id (`buildSquad`). `teamState` holds only this season's changes: injuries, a user depth chart, a user game plan. `squadFor(state, id)` lays them over the generated roster.
- **Records, standings, season stats and award races are computed** from the game results whenever they're needed, never stored (like team ratings).
- **Seeding:** every random draw comes from `seasonRng(state, ...parts)`, so a game's result depends only on the season seed and the game id, not on the order things are simulated in.
- **Saves** (`season/save.ts`): localStorage, versioned key. Box-score lines leave out zero stats (a full season is about 2.8 MB raw and 1.6 MB packed, against a localStorage limit of about 5 MB). There's no save-slot UI yet: N on the title screen starts a new season (over the old one), and C continues.

## The week loop (`season/season.ts`)
`advanceWeek(state, userResult?)` runs `WEEK_STEPS` in order. Each step is a plain function of the state and a week context:

| Step | Now | Later |
| --- | --- | --- |
| `prep` | Game plans for every team playing (`autoGamePlan`: pass share from the program's scheme), the user's if not delegated. Delegated depth charts are reset to the staff chart | User depth chart and game-plan screens; opponent-specific plans; fatigue |
| `play` | The user's game takes the live result (a tie goes to simulated overtime with `settleTie`); every other game is `simGame` | Live box-score capture; a "watch" mode |
| `results` | Injuries count down | Injuries from games, suspensions |
| `rankings` | AP poll every week; CFP rankings from `CALENDAR.cfpStartWeek` until selection | |
| `news` | `weekNews`: user results, upsets, ranked matchups, big games, new No. 1, Heisman watch | More templates, coach quotes, recruiting news |
| `transition` | Regular season → championship week → selection (bracket, bowls, awards) → playoff rounds → complete | Offseason: graduation, progression, recruiting, coaching carousel |

Phases: `regular` (weeks 1–14) → `confChamp` (week 15) → `postseason` (week 16: bowls and the first playoff round, then one week per round) → `complete`. `nextSeason` rolls an open-ended season into the next year with the same rosters (the offseason isn't built).

## Systems
- **Schedule** (`schedule.ts`): rivalries first (rivalry-week games in week 14), then conference games, then non-conference games to 12 each, one game a week per team, spread over 14 weeks. Pairing is "neediest team first" with restarts, and weeks are assigned most-constrained game first. Conference games lean late and non-conference games early (`nonConfWeeks`). Home and away are balanced per team. Odd conferences may leave a team one conference game short; it becomes a non-conference game. Divisions aren't modeled.
- **CPU game sim** (`simGame.ts`): alternating possessions of `simulateDrive` (from `game/rules.ts`) with team off/def ratings plus `HOME_EDGE`, a game clock per half (hurry-up and milking late), and untimed overtime from the 25 (no ties). Each drive's yards are split between pass and run by the game plan; completions go to receivers weighted by `TARGETS` and their overall, and carries to the RB and QB by `QB_RUN_SHARE`. Touchdowns, field goals and interceptions are credited to players. No defensive stats yet.
- **Standings** (`standings.ts`): conference win %, then `TIEBREAKERS` in order (head-to-head among the tied teams, overall record, conference margin, a seeded coin flip). Conference records count only conference games, not the title game.
- **Polls** (`polls.ts`): `AP_WEIGHTS` (62 voters) and `CFP_WEIGHTS` (13 members). Each voter scores every team on wins and losses, strength of schedule, capped margin, a preseason prior from the roster overall and prestige that fades by week 9 (AP only), and inertia toward last week's rank, plus personal noise. Ballots are counted Borda style.
- **Postseason** (`postseason.ts`): title games between the top two in the standings (neutral site). Selection uses the final committee order: the top `autoBids` conference champions plus the best remaining teams, seeded straight. The bracket is the next power of two, so 12 teams give 4 byes; the first round is on campus. Bowls take the best remaining team from each tie-in conference, with 6+ wins, in `BOWLS` order.
- **Stats and awards** (`stats.ts`, `awards.ts`): season totals and leaders from the box scores. `AWARDS` (Heisman, O'Brien, Walker, Biletnikoff, Groza) score production, scaled by team success for the Heisman and O'Brien. Awards are given at selection, before the bowls.
- **Coach career** (`coach.ts`): when on, job security moves with wins against `expectedWins` from prestige. Firing and offers aren't built yet.

## Hub controls
| Key | Action |
| --- | --- |
| N / C (title screen) | New season with the selected team / continue the saved season |
| A/D | Tab: schedule, scores, standings, polls, news, leaders, awards, playoff |
| W/S | Within a tab: the week on SCORES, the conference on STANDINGS, AP or CFP on POLLS, pages on NEWS |
| Space | Play this week's game on the field (or advance the week with no game) |
| X | Simulate this week's game |
| Esc | Back to the title (the season stays in memory and saved) |

## Report
`npm run season` simulates whole seasons headlessly (`SEASONS=n`, default 5) and writes `season.txt`: points and yards per game, home win %, overtime %, ranked losses per week, average wins by program tier, then one season in detail (final top 25, champions, bracket, bowls, leaders, awards).

## Known placeholders and flags (not tuned)
- **Scoring is low:** 19.2 points per team per game against FBS ~28, and 349 yards against ~390. That comes from `simulateDrive`'s gain model, which the live game also uses for the CPU's drives.
- **Leaders are inflated:** only starters get credit, so a top QB throws for 5,000–6,000 yards and a feature back runs for 2,500+. Backups, rotation and receiver depth would fix it.
- **The Heisman leans to running backs** with these production weights.
- **Live games record only the score.** The user's players have no stats, so they never lead or win awards.
- Average wins by tier: T1 10.2, T2 8.8, T3 5.8, T4 6.1, T5 2.8. Tier 4 above tier 3 is mostly the Group of Five teams beating each other.
- About 2 ranked teams a week lose to unranked teams.
- The playoff format is the 2024–25 12-team format with straight seeding. The New Year's Six hosting playoff games and real bowl selection orders aren't modeled.
