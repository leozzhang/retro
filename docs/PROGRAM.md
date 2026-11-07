# Program pages

Every team has a page that shows what its fans know: how the season is going, past records, titles, playoff and bowl history, the big news, and how the fan base feels. The user's own page is **PROGRAM** (H) on the hub. Any other team's page opens from a click on its name.

Everything here is **display only**. The sim never reads the history, the chronicle or the pulse, so `npm run season` and `npm run balance` don't move. A 2-season report diff came out identical apart from timing lines.

| Piece | Where |
| --- | --- |
| Real history through 2025 | `docs/research/history_*.json` → `scripts/build_history.py` → `src/data/fbs/history.ts` (`TEAM_HISTORY`, type in `programHistory.ts`) |
| Each team's season in the dynasty | `SeasonSummary.teams` (`TeamYear`), written by `seasonRows` when the season completes (`season/season.ts`) |
| Seasons, trophies, coach tenure, news salience, the chronicle | `season/program.ts` (`PROGRAM`) |
| The fan pulse | `season/fanPulse.ts` (`PULSE`), its stories `season/fanStories.ts` (`STORIES`) |
| The page | `render/programScreen.ts`; the registry tab is `render/careerScreen.ts` |
| Clickable names | `render/links.ts` |

## The real history
- **Research.** It covers all 138 teams through the 2025 season, mostly from Wikipedia. Sports-reference blocked the research agents. Each team's research row has `notes` (the figures it's unsure of) and `sources`. The fields:
  - claimed national titles
  - lower-division titles (FCS, I-AA, Division II, small college)
  - conference titles and the last one
  - CFP appearances
  - bowl record
  - Heismans
  - all-time record
  - the 2026 head coach's first season (`coachSince`)
  - the 2021–2025 seasons: conference that year, W-L, conference W-L, final AP rank and the postseason in a few words
- **Weakest numbers.** All-time records are the least reliable: sources disagree by a few games, and some schools count vacated wins and some don't. Bowl records differ by how a school counts CFP first-round games. Fix a team in its JSON and rerun the script.
- **Head coaches.** The game's coaches are fictional, so real seasons show no coach. `coachSince` gives the generated head coach his real tenure (a coach hired for 2026 is in year one). Once the carousel replaces him, tenure comes from `coachCareers`.
- **HISTORY setting.** It's a new-dynasty-only setting, REAL or FRESH START (`SeasonConfig.history`). FRESH ignores `TEAM_HISTORY`, so every page starts empty. Tenure then falls back to the coach's seeded `coachTraits(id).tenure`.

## The dynasty's history
- **Each season.** When a season completes, `seasonRows` records each team's:
  - conference, W-L and conference W-L
  - final AP rank
  - conference title game (played and won)
  - playoff seed and last round reached, and the national title
  - non-playoff bowl and its result
  - head coach (`YOU` for the user)
- **Postseason text.** `postText` writes the same short strings as the research ("W SEC TITLE, L CFP QF").
- **Trophies.** They're the real history plus these seasons. Every playoff game counts as a bowl, as most record books count them. First-round NFL picks come from `history[].draft`, and the Heisman from `SeasonSummary.heismanTeam`.
- **The chronicle** (`SeasonState.chronicle`). When the next season starts, `archiveChronicle` keeps each team's news from the season and offseason:
  - only items whose `newsWeight` is at least `PROGRAM.keepWeight` (3)
  - at most `perYear` (12) per team, the heaviest first
  - `years` (10) seasons in all
- **News weights (`newsWeight`):**
  - 10: national title
  - 9: Heisman winner
  - 8: head coach fired, hired or retired; first overall pick
  - 6: playoff field, title-game and bowl results
  - 5: new No. 1, first-round pick
  - 3–4: upsets, season-ending injuries, breakouts, top-25 commits, good transfers
  - 1–2: most weekly news
- **Headlines.** The page's BIG HEADLINES ranks items by weight, faded by age: 1.5 a season and 0.08 a week.

## The fan pulse
`fanPulse(state, team)` lets each signal that applies say one sentence, with a score from −1 (worry) to +1 (hope) and a weight. The core signals are in `season/fanPulse.ts`; the program's own stories are in `season/fanStories.ts` (`STORIES` holds their thresholds). The mood is the weighted mean of every signal, shown or not, stretched by 1.4. The label runs FURIOUS, FRUSTRATED, RESTLESS, UNEASY, STEADY, HOPEFUL, EXCITED, EUPHORIC.

**What's shown** (`pick`): up to 5 points (`PULSE.points`), by salience (|score × weight|) times a hash jitter of ±15%, so equal stories take turns.
- Every signal has a group: results, race, coach, players, rivals, peers, history, offseason or texture. The page shows one point per group. A group gets a second point only when no other group has anything left, and never a third.
- The calm "about where fans thought" results line is filler, used only when fewer than 3 other points exist.
- A point can name other teams (`TalkingPoint.teams`), and the page links them.
- On a 3-season run (seed 11), 95–128 of the 138 teams have a distinct set of points at each snapshot (preseason is the least varied). Every point fits the card.

**Kept for it.** `TeamYear` gains three fields, written by `seasonRows` (history only, and the sim never reads them):
- `rv`: the result against each rival in the regular season
- `big`: W-L against teams in the AP top 25 at kickoff, postseason included
- `close`: W-L in one-score games (8 or fewer)

The real 2021–25 seasons don't have these, so rivalry streaks and big-game records count from the dynasty's first season.

**Core signals** (`fanPulse.ts`):
- **results:** wins over the pregame odds (`TeamState.xw`, kept for the staffs' scouting): ±0.7 is clearly ahead or behind, ±1.6 far ahead or behind. Also what the record means at the program's tier: three losses at a T1, bowl eligibility at a T4–T5.
- **coach:** the head coach's tenure crossed with results.
  - Year one: honeymoon over, or ahead of schedule.
  - Years 2–3: still not turning the corner.
  - Year 8 and up: gone stale, or an institution.
  - Hot seat: security under `HOT_SEAT + 10`. For the user, only in coach career mode.
- **qb:** the starter's line.
  - Hope: a breakout, or 7.8+ yards an attempt with 2.5 TDs per INT.
  - Worry: 60+ attempts, 3+ INTs, and more INTs than TDs or a poor rate.
  - A young starter (FR, SO) weighs more. A five-star freshman or a real returning starter counts in the preseason.
- **heisman:** a winner, or a top-3 candidate from week 5.
- **injury:** a starter lost for the season (more for a QB).
- **race:** national champion, playoff field, CFP top 12, AP top 5, preseason rank, unranked T1–T2 in the preseason, conference title game, unbeaten in conference.
- **rival:** this season's rivalry game, with the streak when it's 2+.
- **last:** last week's blowout loss by 24+, or a win over a better-ranked team.
- **trend:** wins up or down 4+ over the last three seasons; still riding a title from the last two years; last year's playoff run.
- **drought:** a conference title drought, 10+ years at a T1 and 15+ at a T2. The real history gives the year but not the league, so the conference is named only when the record shows the title was won in it. Also a run of 3+ losing seasons (T3+).
- **class:** a top-10 recruiting class; a T1 class outside the top 25; a top-30 class at a T3+.
- **portal:** 3+ good players lost.

**Stories** (`fanStories.ts`):
- **Rivals:**
  - a streak of 2+ between meetings
  - the head coach's record against the rival: 0-2 or worse, or 3-0 and better. It's skipped when the streak already says the same thing.
  - rivalry week
  - the rival's season, as a rival no more than a tier below sees it: a national title, a playoff trip we didn't make, a top-10 rank, or a losing year (schadenfreude)
- **Coach story** (his run here, the real 2021–25 seasons included):
  - **Steady but stuck:** 4+ seasons, all winning, wins within 2 of each other, no title, at a T1–T3. At a T4–T5 the same run is praise.
  - **Big games:** 5+ games against ranked teams. 30% or worse is "can't win the big one"; 65% or better is "wins the big ones".
  - **Bowl runs:** 3+ postseason wins or losses in a row, from `post` (`bowlGame`).
- **Peers:**
  - **What could have been:** a conference mate or rival, no more than a tier apart, that hired its head coach the same winter as us. In the coach's first 3 years, with 4+ games each, the gap must be 25+ points of win share and 3+ wins. Regret needs us under 55% and them at 60%+. Gloating needs us at 60%+ and them under 40%.
  - **The old coach:** the coach before ours, now leading another program. Bitter if he left for a better tier. Awkward if he's 4+ games over .500 there; vindication if he's 4+ under.
  - **Poached:** last season's OC or DC is now a head coach elsewhere. It's said in the offseason, the preseason and the first 3 weeks.
- **Draft** (the latest draft, in the offseason, the preseason and the first 3 weeks):
  - the first overall pick
  - a first-rounder by name: at a T3+ it's rare and big; at a T1–T2 only a top-10 pick
  - the most picks in the nation (5+) or the conference (3+)
  - two or more first-rounders
  - a first-rounder in 3+ straight drafts
  - an early entrant who went in round 4 or later
  - a T1 with one pick or none
- **Texture** (this season, from week 3):
  - one-score losses: 3+, or 4+ once 10 games are played. Or 3+ one-score wins with at most one such loss.
  - a winning or losing run of 4+, or still unbeaten after 6
  - a top- or bottom-8 offense or defense in points a game
  - unbeaten at home (4+ games)
  - a loss to a team 2+ tiers lower, said once it's no longer last week's news
  - a win over a top-5 team, also said once it's no longer last week's news
- **History** (the real history plus the dynasty):
  - a national title drought of 25+ years, or none ever at a T1
  - a first playoff trip, or still waiting at a T1–T2
  - a new conference (years 1–3), toned by the conference record
  - a bowl streak of 5+, bowl eligible for the first time in 4+ years, or no bowl in 5+ years
  - the most wins (8+) or losses (7+) in 4+ years
  - Heisman lore in the preseason
  - all-time win milestones (every 100)
- **Recruiting:**
  - five-star commits
  - the home state's top recruit (top 60 nationally): kept home, or lost to a rival or an in-state school of our tier or better
  - a portal arrival rated 85+

**Expectation** comes from tier and prestige: TITLE OR BUST, CONTENDER, BOWL TEAM or BUILDING.

**Wording.** Most signals have 2–3 wordings, picked by a hash of team, year and week, never `seasonRng`. The page caches the pulse per team, week and phase. Texts stay near 70 characters, two lines on the card.

## The page
- **Header:** the team's colors, rank, record, OVR, the head coach and his year, and the tabs (1-5, Tab or a click).
- **OVERVIEW:**
  - the fan pulse: mood, meter, expectation and what the fans are saying
  - the trophy case
  - last five seasons as bars: gold for a title, green for the playoff, dim for a losing year, faint for the season in progress
  - big headlines
- **SEASON:**
  - schedule and results
  - where they stand: conference place, AP now and its high, CFP
  - team leaders
  - staff and stars: HC, OC and DC, then the QB and the best starters
- **HISTORY:**
  - the all-time record, title years, playoffs, conference titles and bowls
  - Heismans and the dynasty's first-round picks
  - a season-by-season table, newest first, which the wheel scrolls
- **NEWS:** this season's team news, then the chronicle, under season and week headers.
- **REGISTRY:** the PLAYER REGISTRY (formerly PLAYER STATS), for any team.

## Links
- **What a click opens:**
  - a team name opens its program page
  - one of the user's players opens his roster card
  - another team's player opens that team's REGISTRY on him
- **Where they are:**
  - hub: STANDINGS, SCORES, POLLS, NEWS, HOME (the matchup, last game, news and conference table), SCHEDULE, LEADERS, AWARDS, PLAYOFF
  - program pages
  - the roster card's name (to the registry)
- **Matching news text.** `findSpans` matches school names and abbreviations of the item's teams, plus its teams' players' full names, longest first and whole words only, so "Georgia" never matches inside "Georgia Tech". `wrapSpans` never splits a name across lines.
- **Feel.** The canvas shows a pointer over a link, and a hovered link turns gold and underlined. Esc walks back through the pages opened, then to where the first was opened from.

## Not done yet
- Links on the portal, recruiting, carousel and departures screens.
- More pulse signals: senior leaders leaving; real rivalry series records before 2026 (the dynasty's own games only, by choice for now); pro careers (the game only knows the draft).
- The pulse doesn't feed morale or recruiting. It's flavor only, by design for now.
