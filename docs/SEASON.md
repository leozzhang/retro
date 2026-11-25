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
- **Rosters aren't stored.** They regenerate from the team id (`buildSquad`). `teamState` holds only the changes: progression (rating changes, levels, XP), injuries, a user depth chart, a user game plan. `squadFor(state, id)` lays them over the generated roster, and rebuilds the staff depth chart once anyone has leveled.
- **The user's depth chart** is edited on the team page (T in the hub) per position. `reorderPosition` (`data/depth.ts`) moves a player in his position's order and rebuilds every slot that position can fill, natural position first; `starters` then fills slots in `PICK_ORDER`, so WR #1-#4 play X, Z, SL and WR4 and an injured starter's backup steps in. The first edit calls `setUserDepth` (`season/staff.ts`), which turns off `delegate.depthChart` so `prep` keeps the chart; `useStaffDepth` hands it back. Live season games use `squadFor` for both teams, so the user's chart and both teams' injuries are on the field.
- **Records, standings, season stats and award races are computed** from the game results whenever they're needed, never stored (like team ratings).
- **Seeding:** every random draw comes from `seasonRng(state, ...parts)`, so a game's result depends only on the season seed and the game id, not on the order things are simulated in.
- **Saves** (`season/save.ts`): localStorage, versioned key. Box-score lines leave out zero stats. A full season is about 3.7 MB raw and 2.6 MB packed, about 0.9 MB of it progression, against a localStorage limit of about 5 MB. There's no save-slot UI yet: N on the title screen starts a new season (over the old one), and C continues.

## The week loop (`season/season.ts`)
`advanceWeek(state, userResult?)` runs `WEEK_STEPS` in order. Each step is a plain function of the state and a week context:

| Step | Now | Later |
| --- | --- | --- |
| `prep` | Game plans for every team playing (`autoGamePlan`: pass share from the program's scheme), the user's if not delegated. Delegated depth charts are reset to the staff chart | Game-plan screen; opponent-specific plans; fatigue |
| `play` | The user's game takes the live result (the field plays overtime, so it comes in decided; `settleTie` stays as a guard); every other game is `simGame`. Both log their drives | Live box-score capture; a "watch" mode |
| `progress` | Every game is graded from its drives; players earn XP and level up ([PROGRESSION.md](PROGRESSION.md)), then every player's morale moves ([MORALE.md](MORALE.md)), then confidence moves, new starters spark and breakouts land ([CONFIDENCE.md](CONFIDENCE.md)). The user's breakthroughs, breakouts (plus a few elsewhere) and next man up make the news | Practice focus; offseason growth; promises, captains and the transfer portal (MORALE.md) |
| `results` | Injuries count down and health recovers, then each game's knocks and injuries from its grades (`season/injuries.ts`, [INJURIES.md](INJURIES.md)); injury news | Suspensions; mid-game injuries in live games |
| `rankings` | AP poll every week; CFP rankings from `CALENDAR.cfpStartWeek` until selection | |
| `news` | `weekNews`: user results, upsets, ranked matchups, big games, new No. 1, Heisman watch | More templates, coach quotes, recruiting news |
| `transition` | Regular season → championship week → selection (bracket, bowls, awards) → playoff rounds → complete | Offseason (open seasons): coaching carousel, departures and the draft, transfer portal; offseason growth as the next season opens. Recruiting later |

Phases: `regular` (weeks 1–14) → `confChamp` (week 15) → `postseason` (week 16: bowls and the first playoff round, then one week per round) → `complete`. An open-ended season (DYNASTY on the title screen, L) then goes to `offseason`: its stages (`season/offseason.ts`) run the transfer portal ([PORTAL.md](PORTAL.md)), and the last one calls `nextSeason`, which rolls into the next year with the rosters' changes (`TeamState.roster`), progression and morale. Graduation, the draft, signing day and offseason growth will be stages before the portal. Each finished year's summary keeps the final AP top 25, win shares and level-ups per player, for reputations.

## Systems
- **Schedule** (`schedule.ts`): rivalries first (rivalry-week games in week 14), then conference games, then non-conference games to 12 each, one game a week per team, spread over 14 weeks. Pairing is "neediest team first" with restarts, and weeks are assigned most-constrained game first. Conference games lean late and non-conference games early (`nonConfWeeks`). Home and away are balanced per team. Odd conferences may leave a team one conference game short; it becomes a non-conference game. Divisions aren't modeled.
- **CPU game sim** (`simGame.ts`): alternating possessions of `simulateDrive` (from `game/rules.ts`) with team off/def ratings plus `GAME_SIM.homeEdge`, a game clock per half (hurry-up and milking late) with a random per-game pace, a game script (the leading offense loses `script` overall points per point of lead), and FBS overtime (`OVERTIME`, `game/rules.ts`: possessions from the 25, two after a touchdown from the 2nd period, two-point plays from the 3rd; no ties). See "Score calibration" below. The drive sim coaches the score and the clock (4th downs, last-second kicks, tempo, kneels, heaves; `game/situation.ts`, see SIMULATION.md). Each snap is cast to the players who made it (`season/cast.ts`): receivers by `TARGETS`, their overall and their fit for the gain, carries to the RB and QB by `QB_RUN_SHARE`, picks to DBs. The box score is the sum of the cast snaps. No defensive stats in the box score yet.
- **Standings** (`standings.ts`): conference win %, then `TIEBREAKERS` in order (head-to-head among the tied teams, overall record, conference margin, a seeded coin flip). Conference records count only conference games, not the title game.
- **Polls** (`polls.ts`): `AP_WEIGHTS` (62 voters) and `CFP_WEIGHTS` (13 members). Each voter scores every team's resume game by game (`gameValue`):
  - A win is worth `winBase + winQual * quality(opp)`. Quality is 1 for the best opponent and falls fast: about 0.7 for the 10th, 0.37 for the 26th.
  - A loss costs `lossBase + lossBad * (1 - quality) + lossWorst * badness`, times a closeness factor. Badness runs straight from 0 for the best team to 1 for the worst. Closeness forgives a one-score road loss most, and mostly against good teams. Each loss past the 3rd costs `lossPile` more, so a 5-loss team isn't ranked however good its schedule.
  - On top: schedule strength (quality over the league mean, per game), capped average margin, a preseason prior from roster overall and prestige that fades by week 9 (AP only), inertia toward last week's rank, and personal noise. Ballots are counted Borda style.
  - **Opponents are judged by `powerRatings`.** It's an SRS-style rating: capped, home-adjusted margins plus the opponents' own ratings, pulled toward the prior as if the prior were 3 games (`POWER`). Non-conference results carry each conference's strength to all of its teams, so a weak conference's .500 teams rate low.
  - The rank an opponent counts at is its power rank, blended with its rank in last week's poll if it was ranked there (`opponentRanks`, `POWER.pollBlend`).
  - **Every game is judged again each week by where the opponent stands now.** A loss to a team that later climbs into the top 25 costs less every week, and a win over a team that collapses is worth less. Nothing is stored per game.
- **Postseason** (`postseason.ts`): title games between the top two in the standings (neutral site). Selection uses the final committee order: the top `autoBids` conference champions plus the best remaining teams, seeded straight. The bracket is the next power of two, so 12 teams give 4 byes; the first round is on campus. Bowls take the best remaining team from each tie-in conference, with 6+ wins, in `BOWLS` order.
- **Stats and awards** (`stats.ts`, `awards.ts`): season totals and leaders from the box scores. `AWARDS` (Heisman, O'Brien, Walker, Biletnikoff, Groza) score each position by its own value (`AWARDS_TUNE`; see "AWARDS" under Report), and the Heisman compares positions by dominance over their peers. Awards are given at selection, before the bowls. The user's live games count too: their box score is built as they're played (`season/liveBox.ts`: the user's snaps credited to who threw, caught or carried it, the CPU's drives cast like a simulated game's). At the default 8:00 quarters a live game has about 7 possessions a team against `simGame`'s 12, so the user's totals run on fewer, more productive drives.
- **Coach career** (`coach.ts`): when on, job security moves with wins against `expectedWins` from prestige. Firing and offers aren't built yet.

## Hub controls
| Key | Action |
| --- | --- |
| N / C (title screen) | New season with the selected team / continue the saved season |
| A/D | Tab: schedule, scores, standings, polls, news, leaders, awards, playoff |
| W/S | Within a tab: the week on SCORES, the conference on STANDINGS, AP or CFP on POLLS, pages on NEWS |
| Space | Play this week's game on the field (or advance the week with no game) |
| X | Simulate this week's game |
| T | Team page: depth chart and player cards |
| P | Playbook page: every play drawn with your starters; star plays for the call screen's STARRED chip |
| Esc | Back to the title (the season stays in memory and saved) |

## Report
`npm run season` simulates whole seasons headlessly (`SEASONS=n`, default 5) and writes `season.txt`: scoring, close games and blowouts, shutouts, overtime, home wins and ranked losses next to the real FBS values (below), average wins by program tier, then one season in detail (final top 25, champions, bracket, bowls, leaders, awards).

### POLLS (2026-11-24)
The report's POLLS section shows how the AP poll treats a ranked team's loss. Teams ranked 1–15 are measured by spots dropped, and teams ranked 16–25 by the share falling out. Losses are bucketed by the winner's rank at kickoff and the margin. The section also shows the final top 25's non-P4 teams, loss counts and bad losses, and losses that are re-judged as the opponent climbs. `SEASON_ONLY=polls npm run season` runs just the aggregate rows and this section (about 90 s for 10 seasons).

Before the rewrite, every loss cost the same 2 wins, wherever it came from. Schedule strength was the opponents' plain win %, so a weak conference's teams looked like everyone else's. 10 seasons, before → after:

| | Before | After | Target (real AP) |
| --- | --- | --- | --- |
| 1–15, one-score loss to a top 5: spots dropped | 5.7 | 2.8 | 2–4 |
| 16–25, one-score loss to a top 10: out | 54% | 29% | rare to sometimes |
| 1–15, loss to an unranked team by 9+: spots dropped | 5.6 | 6.3 | the biggest drop |
| 16–25, loss to an unranked team by 9+: out | 64% | 86% | most |
| Final top 25 outside the P4, a season | 6.9 | 4.5 | ~4 (2024: Boise State, Army, UNLV, Memphis) |
| Final top 25 with 2+ losses to teams outside the power top 60 | 1.5 | 0.5 | ~0 |
| Ranked teams a week, weeks 6–14, with 2+ such losses | — | 0.02 | under 0.3 |
| Final top 25 with 5+ losses, a season | 0.0 | 0.7 | ~0 |
| A loss to a team unranked then and ranked at the end: resume cost then → at the end | 3.01 → 2.44 (opponent's win % rose) | 2.87 → 2.34 | lower at the end |

Flags:
- The final top 25 has more 4-loss teams (5.8 a season, against about 4 in 2024's final poll), because losses to good teams are cheap now. A 5-loss team still gets in now and then.
- The 0.5 a season with two bad losses are 11-2 and 12-2 non-P4 conference champions at No. 22–25 after the bowls.
- Ranked losses per week (4.8, to unranked 2.1) moved a little further from the real 5.5 and 2.5, because the top 25 is now slightly stronger.

### AWARDS (2026-11-24)
The report's AWARDS section lists, over every season:
- the Heisman's winners and top-5 finalists by position, against real voting from 2000–2025;
- the Heisman winner's team at selection;
- each award winner's average line from the games before the bowls.

Awards are display only. News, storylines, moments, the office and careers read them, and the sim doesn't.

How each award is scored (`season/awards.ts`, `AWARDS_TUNE`):

| Award | Value | Team factor |
| --- | --- | --- |
| Heisman | dominance over the position: value / the mean of the position's top 5, ^ 2.5, × the voters' prior (QB 1, HB 0.77, WR 0.86, TE 0.62) | steep: win % and AP rank, −0.35 unranked |
| O'Brien | passing yds/20, TD ×4, INT ×−3, rushing yds/10, TD ×6, × efficiency (passer rating over the league's qualified median, clamped 0.85–1.15) | moderate |
| Doak Walker | rushing yds/10, TD ×6, half of receiving, × a mild YPC factor | small |
| Biletnikoff | receiving yds/10, TD ×6, catches ×0.3 | small |
| Groza | makes × accuracy³ (accuracy shrunk by 3 phantom kicks at 75%), with 1+ attempt a game to qualify | none |

Why it's built this way:
- **The old formula** paid 1 point per 25 passing yards but 1 per 10 rushing yards. On top of that, the cast sim gives the starting HB every non-QB carry, so the rushing leader runs for about 2,700 yards. HBs won about half the Heismans.
- **Normalizing within each position** makes the Heisman immune to whichever position's box-score stats run hot. The priors then set how voters lean.
- **QB efficiency is relative and capped.** The user's engine-played games run at passer ratings near 180, against about 105 for drive-sim QBs. Before the cap, the user's QB won 11 of 20 Heismans.

Tuned on 40 seasons snapshotted at selection (Georgia as the user team):

| | Sim | Target (real 2000–2025) |
| --- | --- | --- |
| Heisman winners QB / HB / WR | 80% / 12.5% / 7.5% | 77% / 12% / 12% (flag bands 65–85 / 5–22 / 4–18) |
| Top-5 finalists QB / HB / WR | 56% / 27% / 17% | — |
| Winner's team at selection | AP #4.3, 0.4 losses | about #3, 1 loss (flag past #8) |
| Groza winner | about 90% FG | 85%+ |

Flags:
- One strong QB (Miami's) wins many of the 40 seasons, because each report season starts from the same 2026 rosters.
- Winners' lines are inflated by the box score: about 2,550 rushing yards for the Walker winner, and about 4,900 passing yards at a 115 rating for the O'Brien winner. That's the cast's carry share and the drive sim's attempts, not the awards.

## Score calibration (2026-10-24)
Simulated scores are fit to real games, not guesses. The real data are 1,606 FBS-vs-FBS games from 2024 and 2025 (regular season and postseason), from ESPN's public scoreboard API, with each team's AP rank at kickoff. FCS opponents are left out (FBS teams are those with 6+ games in the feed).

**The first version had too many blowouts and too few close games:**
- One-score games were 29.3% (real 38.0%, about 7 standard errors apart) and 28+ blowouts 25.2% (real 18.9%), with 19 points per team and 6.3% team shutouts (real 1.5%).
- Ratings decided too much: each overall point was worth 2.5 points of margin. Ratings explained about 20 points of the margin spread and luck only 13. In real games it's about 13 and 16.
- There were no big plays. Each play's gain was a symmetric normal (4.6 ± 6.5 yards), so under 1% of plays went for 20+ yards. Scoring needed long drives, and any talent edge compounded over them.

**The model now:**
- `DRIVE_SIM` (`game/rules.ts`): an ordinary play gains 4.6 ± 5 yards, plus `edgePerPoint` (0.12) per overall point. With `explosive` odds (6%), a play instead gains 15 yards plus an exponential tail averaging 12.
- `GAME_SIM` (`season/simGame.ts`):
  - `paceSd` (0.12): a random per-game tempo, so game totals vary like real ones.
  - `script` (0.15 overall points per point of lead, the lead capped at 21): the leading offense eases off and the trailing one presses. Favorites usually win, but often by less than the talent gap. Without it, matching the real close-game rate made upsets too common, and matching the upset rate made close games too rare.
- AP `inertia` went from 2.5 to 4.5. With closer games, an unbeaten No. 1 kept falling after narrow wins, which real voters don't do.

**Result** (20 seasons on seeds the tuning didn't use):

| | Real FBS 2024–25 | Sim | First version |
| --- | --- | --- | --- |
| Points per team | 26.5 | 26.3 | 19.1 |
| Combined points, 10th–90th percentile | 33–75 | 34–72 | 22–55 |
| Median margin | 14 | 14 | 16 |
| Decided by 3 or fewer | 16.9% | 10.9% | 10.0% |
| One-score games (8 or fewer) | 38.0% | 33.2% | 29.3% |
| Won by 21+ | 33.3% | 33.2% | 39.4% |
| Won by 28+ | 18.9% | 20.1% | 25.2% |
| Won by 35+ | 10.0% | 11.1% | 15.1% |
| Team shutouts | 1.5% | 1.1% | 6.3% |
| Overtime | 5.0% | 3.9% | 3.4% |
| Home win %, conference games | 55.8% | 56.1% | 56.9% |
| Ranked losses per week (to unranked) | 5.5 (2.5) | 5.0 (2.4) | 4.8 (2.2) |
| Ranked 11–25 beat unranked, conference games | 75.1% (169 games) | ~76% | ~69% |
| Top 10 beat unranked, conference games | 79.6% (108 games) | ~89% | ~74% |

**What's still off:**
- **Games decided by 3 or fewer:** 10.9% vs 16.9%. Real margins land on exactly 3 in 10% of games, the sim's in about 6.5%, because real endgames cluster on field goals. A "tied or down 3 late, play for the field goal" rule barely moved it, so it wasn't kept.
- **Top-10 teams beat unranked conference opponents too often:** about 89% vs 79.6%, but the real sample is only 108 games (±4 points).
- **Yards per team** are about 430 against roughly 390. Big plays add yards faster than points.
- **Non-conference games** in real life are deliberately lopsided (68% home wins, 28% won by 28+), while the sim pairs non-conference opponents at random. That's a schedule-generator job, not a game-sim one.

**The live game's CPU drives use the same model.** At an even matchup the CPU now scores 1.94 points per drive (touchdowns on 23% of drives), up from 1.17 (12%). A 32-point mismatch gives the weaker offense 0.27.

The comparison scripts (the ESPN fetch and a Python comparison) were scratch tools and aren't in the repo. `npm run season` prints the key measures next to the real values.

## Known placeholders and flags (not tuned)
- **Leaders are inflated:** only starters get credit, so a top QB throws for 5,000–6,000 yards and a feature back runs for 2,500+. Backups, rotation and receiver depth would fix it.
- **The Heisman leans to running backs** with these production weights.
- **Live games record only the score.** The user's players have no stats, so they never lead or win awards.
- Average wins by tier: T1 10.2, T2 8.8, T3 5.8, T4 6.1, T5 2.8. Tier 4 above tier 3 is mostly the Group of Five teams beating each other.
- The playoff format is the 2024–25 12-team format with straight seeding. The New Year's Six hosting playoff games and real bowl selection orders aren't modeled.

## Game pages
Every game keeps its key plays (`GameResult.plays`), and defenders get sacks and interceptions in the box score. Both come from what the sim already casts, so they draw no new random numbers. The season report's GAME PAGES section shows who the star cards go to and what the plays cost a save. See [GAMES.md](GAMES.md).
