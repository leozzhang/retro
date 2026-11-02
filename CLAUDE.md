# Saturday Gridiron

A PC football game inspired by Retro Bowl, set in FBS college football, with more realism: real teams and conferences, deeper playbooks, defensive schemes, and reading the defense. It's a personal project. Current status and the roadmap are in [docs/PROGRESS.md](docs/PROGRESS.md); read it first. The transfer portal, the first offseason system, is in [docs/PORTAL.md](docs/PORTAL.md).

## Stack
- TypeScript, HTML5 Canvas 2D, and Vite. No framework or game engine.
- Vitest for tests. The pixel font comes from `@fontsource/press-start-2p`.
- The desktop app is Electron (`electron/`: the main process and a preload that gives the game file storage for saves). The browser build still runs on its own.

## Run
```
npm run dev         # http://localhost:5173
npm run typecheck   # tsc --noEmit
npm test            # unit tests (src/logic.test.ts)
npm run balance     # headless AI balance report -> balance.txt (BAL_ONLY=id,kind limits the per-play rows)
npm run ratings     # what each rating is worth per position -> ratings.txt (~10 min; RAT_ONLY=QB,WR limits groups)
npm run season      # headless full-season sims -> season.txt (SEASONS=n, default 5)
npm run app         # the desktop app on the Vite dev server (hot reload); `-- --remote-debugging-port=9222` for CDP
npm run app:build   # release/: portable .exe, installer, and win-unpacked/ (the folder Steam would take)
python scripts/build_profiles.py   # rebuild src/data/fbs/profiles.ts from docs/research/*.json
```
Controls are listed in [README.md](README.md).

## Code layout (src/)
- `engine/`: constants, camera projection, input, math and seeded RNG, and saved data (`storage.ts`: gzipped, preloaded at boot or loaded on demand with `loadItem`, written in the background; files in the desktop app, IndexedDB in a browser, memory in Node)
- `data/`: players and teams. See [docs/RATINGS.md](docs/RATINGS.md) and [docs/ROSTERS.md](docs/ROSTERS.md)
  - `coaches.ts` (coaching staffs, generated per team; see [docs/COACHES.md](docs/COACHES.md)), `emphasis.ts` (the position coaches' weekly emphases)
  - `ratings.ts` (every rating and what it does), `positions.ts` (positions, overall formulas), `athletes.ts` (player schema, rating templates, archetypes, builds)
  - `fbs/` (the 138 researched team profiles, home states and hometowns), `rosterGen.ts` (85-man rosters from a profile, walk-ons), `depth.ts` (depth chart, starters, injuries, computed team ratings, `generatedAthlete` by id), `teams.ts` (`TEAMS`, uniforms, slots)
  - `season/`: world data for seasons: conference rules, rivalries, the calendar, the playoff format and bowls. See [docs/SEASON.md](docs/SEASON.md)
  - formations, route trees and playbook (`plays.ts`), route concepts by receiver number (`concepts.ts`), defensive calls (`defenses.ts`), each defense's identity: style, call mix, press and third-and-long blitz (`identity.ts`; see [docs/SCOUTING.md](docs/SCOUTING.md)), kick types and special-teams units (`specialTeams.ts`)
- `sim/`: player physics (`player.ts`), ball flight, AI (`ai.ts`: routes, coverage, pass pro, pursuit), run blocking by scheme (`runBlocking.ts`: zone/stretch/gap/trap/draw, combos, pulls, leverage, the auto-runner's lane read), catch, tackle and pass-aim math, kick physics with wind (`kicking.ts`), and side-agnostic blocking for special teams (`blocking.ts`)
- `game/`:
  - `resolvePlay.ts`: lays a play out for the snap (mirroring, personnel, concepts to slot routes). See [docs/PLAYBOOK.md](docs/PLAYBOOK.md)
  - `matchups.ts`: the defense's package and man matchups for the offense on the field
  - `playState.ts`: the `Play` class, the state machine for one snap, including handoffs
  - `kickPlay.ts`: the `KickPlay` class (FG/XP, punts, kickoffs) and the special-teams AI
  - `rules.ts`: down and distance, scoring, kick spots, CPU drive sim
  - `clock.ts`: game and play clock rules
  - `wind.ts`: per-game wind and its quarterly drift
  - `game.ts`: screens (main menu, exhibition setup, dynasty save slots, new dynasty school and settings (`SETTINGS`, also the hub's SETTINGS page), roster, season hub with PLAY GAME's choices, play call with PAT and kickoff modes, play, kick, notices, final). A season game's final screen writes the score back with `advanceWeek`; `save()` writes the dynasty's slot
  - key plays and partial sims: picking a drive's or a simulated game's key plays (`keyPlays.ts`), on-field replays matched to the sim (`replay.ts`, the CPU QB `autopilot.ts`), and the replay screen (`highlights.ts`). The sim side is `simPart` and the story (`season/simGame.ts`, `season/story.ts`). See [docs/SIMULATION.md](docs/SIMULATION.md)
- `season/`: the season engine, headless and plain JSON (`types.ts`): the week loop (`season.ts`), schedule, CPU game sim with box scores (`simGame.ts`), standings and tiebreakers, AP and CFP polls, postseason, stats, awards, news, staff automation (`staff.ts`), coach career, saves (`save.ts`: three dynasty slots with a small meta each). See [docs/SEASON.md](docs/SEASON.md)
  - player progression: per-snap game grades from drive logs (`grades.ts`), then XP, levels and weighted attribute draws (`progression.ts`). See [docs/PROGRESSION.md](docs/PROGRESSION.md)
  - health and injuries after each game from the grades' snaps and hits (`injuries.ts`). See [docs/INJURIES.md](docs/INJURIES.md)
  - confidence from the grades, next-man-up sparks and breakouts (`confidence.ts`; the on-field shift by leverage is `data/confidence.ts`). See [docs/CONFIDENCE.md](docs/CONFIDENCE.md)
  - morale from role vs. expectations, team results, coach decisions and the locker room, weighed by a hidden temperament; never from grades (`morale.ts`). See [docs/MORALE.md](docs/MORALE.md)
  - the weekly scouting report on the next opponent, with tiered items found by each coach's scouting, and staff play picks (`scouting.ts`). See [docs/SCOUTING.md](docs/SCOUTING.md)
  - weekly emphases: practice tags and the simulated game-day edge (`emphasis.ts`). See [docs/COACHES.md](docs/COACHES.md)
  - coaches over time: chairs and rating changes laid over the generated staffs by `staffFor` (`world.ts`), head coaches (`headCoachFor`), coach career rows and offseason growth by hidden arc, age and work (`coaching.ts`), and the coaching carousel, the offseason's first stage: reputation, motives, firings, retirements, the head coach chain, hiring rounds, and the user's fog and interviews (`carousel.ts`, screen `render/carouselScreen.ts`). The carousel is planned in [docs/CAROUSEL_PLAN.md](docs/CAROUSEL_PLAN.md); graduation, the draft and HS recruiting in [docs/RECRUITING_PLAN.md](docs/RECRUITING_PLAN.md)
  - HS recruiting (open-ended careers): the class (`data/recruits.ts`: a seeded pool by id, stars and the services' read, hidden makeup and wants) and the cycle (`recruiting.ts`: the summer, weekly contacts, home-game visits, offers, commits, flips and decommits, early signing, the carousel's reactions, national signing day, pipelines, the position coaches' worded evaluations), screen `render/recruitScreen.ts`. See [docs/RECRUITING.md](docs/RECRUITING.md)
  - careers: every player's season rows and story across seasons and teams, history only (nothing in the sim reads it) (`career.ts`). See [docs/CAREERS.md](docs/CAREERS.md)
  - class years from the season and redshirts (`classes.ts`); departures, the offseason stage before the portal: redshirts, graduation, early declarations and the declare watch (`departures.ts`), and the NFL draft by city (`draft.ts`). See [docs/RECRUITING.md](docs/RECRUITING.md)
  - the offseason's stages (`offseason.ts`) and the transfer portal (`portal.ts`: motives, appeal, entries, rounds, the CPU staffs, placement, promises). Rosters change through `TeamState.roster`, laid over the generated roster by `baseRoster` (`world.ts`). See [docs/PORTAL.md](docs/PORTAL.md)
- `analysis/` (repo root, Python): NFL Big Data Bowl tracking analysis for route geometry, splits and concepts. See [analysis/README.md](analysis/README.md)
- `render/`: procedural pixel sprites with team-color swaps, the field and goal posts, HUD, the play renderer, the kick renderer (aim preview, goal cam), the roster screen, the menus before a game or dynasty (`menuScreen.ts`: main menu, exhibition, save slots, new dynasty), the season hub (`seasonScreen.ts`: sidebar, HOME, panels, the week's action button), the team page (`teamScreen.ts`), the playbook page (`playbookScreen.ts`), the weekly prep page (`prepScreen.ts`), the portal (`portalScreen.ts`), departures and the draft (`departuresScreen.ts`), recruiting and signing day (`recruitScreen.ts`), the STATS page of careers (`careerScreen.ts`) and the shared play diagrams (`playDiagram.ts`)
- `harness.ts`: the headless auto-QB, auto-runner and auto-kicker shared by the balance and ratings reports

## Conventions
- **World units are yards.** x runs 0–120 along the field: 0–10 is the user's end zone and 110–120 is the opponent's. The user always attacks toward +x. y runs 0–53.3 across the field, with 0 at the far (top) sideline.
- **Fixed 60 Hz timestep.** Each step, AI and user input set `player.want` (desired velocity), then `stepPlayer` accelerates toward it. Don't move players' positions directly; the exception is blockers anchored during an engagement.
- **Separate data, sim and render.** Plays, routes and defensive calls are plain data in `data/`. Sim code never touches the DOM, so the balance harness can run it headlessly.
- **Every rating must change something on the field.** Don't add a rating without the mechanic that reads it. Overall formulas (`OVR_WEIGHTS`) only weight ratings that matter at that position; check with `npm run ratings`.
- **Team ratings are computed, never stored:** `teamRatings(squad)` from the healthy starters. The same goes for season records, standings, stats and award races (from game results), and season rosters (generated roster plus `teamState`).
- **Season state is plain JSON** and season randomness comes from `seasonRng(state, ...)`, so a saved season continues identically.
- **Art is original pixel art drawn in code** (`render/sprites.ts`). Don't copy Retro Bowl assets.
- **Tuning constants sit next to their logic:**
  - `throwErrorSd`, `ACC_BANDS`, `composure` (`sim/passing.ts`)
  - `catchOdds`, and the set-receiver bonus `SET_HANDS`, `SET_CONTEST` (`sim/catching.ts`)
  - route running: `BURST`, `BURST_TAPER`, `PLANT_DECEL`, `cutKeep`, `TURN_TIME`, `SET_MAX_SPEED` (`sim/ai.ts`)
  - `tackleChance`, `FALL_FORWARD`; kick returns: `returnTackleChance`, `BROKEN_TOLL` (`sim/tackling.ts`)
  - pass-pro shed and push rates (`Play.updateEngagements`), `ARM_TACKLE` (`game/playState.ts`)
  - run blocks: `RUN_BLOCK_EDGE`, `REACH_PENALTY`, `BLOCK_ROLL_SD`, `WASH_RATE`, `COMBO_CLIMB`, `SHED_WIN`, `SHED_LEVERED`, `ARM_LEVERED`, `RUN_ENGAGE`, `DRAW_SET` (`sim/runBlocking.ts`)
  - defense vs. the run: `LB_FIT_DEPTH`, `MAN_DEPTH`, `TRASH_SPEED`, `PURSUIT_LEAD` (`sim/ai.ts`)
  - zone read and option: `KEY_CRASH`, `KEY_FOOLED`, `MESH_REACH`, `KEEP_WIDTH`, `KEEP_INSIDE`, `OPTION_CUT`; screens `SCREEN_SET` (`game/playState.ts`)
  - `pitchOdds`, `PITCH_REACH`, `HANDOFF_ODDS` (`sim/catching.ts`)
  - `AIM_TIME_SCALE` (`game/game.ts`)
  - quarter lengths `QUARTER_OPTIONS`, `QUARTER_DRIVES`; the accelerated clock `SNAP_AT`, `HURRY_AT` (`game/clock.ts`)
  - `LEG_SPEED`, `AIR_DRAG`, `WIND_SCALE`, `kickErrorSd`; the kick timing meter `METER_HALF`, `MISTIME_DIR`, `MISTIME_CURVE`, `GREEN_BASE`, `GREEN_KAC` (`sim/kicking.ts`)
  - `MUFF`, `FG_BLOCK_BASE`, `RETURN_BLOCK_EDGE`, `ST_SPEED_GAP`, `DIVE_RANGE`, `FG_STRIKE`, `PUNT_GETOFF` (`game/kickPlay.ts`)
  - sprint: `SPRINT_TIME`, `SPRINT_RECOVER` (`game/playState.ts`), scaled by `endurance` (`sim/player.ts`)
  - key plays: `KEY_PLAYS` (`game/keyPlays.ts`), `REPLAY` (`game/replay.ts`), `SHOW` (`game/highlights.ts`)
  - season: `DRIVE_SIM` (`game/rules.ts`, also the live game's CPU drives), `GAME_SIM`, `TARGETS`, `QB_RUN_SHARE` (`season/simGame.ts`), all fit to real FBS scores (SEASON.md); `AP_WEIGHTS`, `CFP_WEIGHTS` (`season/polls.ts`), `AWARDS` (`season/awards.ts`), `UPSET_GAP` (`season/news.ts`), scheme pass shares (`season/staff.ts`)
  - progression: `GRADES` (including the fitted expected success rate), `TAG`, `ROTATION`, `PACKAGES`, `PAIRS` (`season/grades.ts`); `PROGRESSION` (including `atPotential`, the soft potential ceiling), `DEV_XP`, `YEAR_XP`, `GROWTH_RATE` (`season/progression.ts`); `BREAKOUT_NEWS` (`season/season.ts`)
  - injuries: `INJURY` (`season/injuries.ts`), `HITS`, `ROTATION_HURT` (`season/grades.ts`), `HEALTH` (playing hurt and staff rest, `data/depth.ts`), `INJURY_NEWS` (`season/season.ts`)
  - confidence: `CONF` (leverage, the clutch shift, the staff's slump and incumbent weights, `data/confidence.ts`); `CONFIDENCE`, `BREAKOUT` (`season/confidence.ts`)
  - morale: `MORALE` (`season/morale.ts`); its XP factor `moraleXp` (`PROGRESSION`)
  - defensive identity: `IDENTITY` (`data/identity.ts`); the staff picks' rules in `suggest` (`season/scouting.ts`)
  - coaches: `STAFF` (`data/coaches.ts`), `SCOUT_TIERS` and `pctAt` (`season/scouting.ts`), `EMPHASIS` (`season/emphasis.ts`), offseason growth `COACH_GROWTH`, head coaches' and position coaches' development effects `HEAD_EFFECT` (`season/coaching.ts`); the carousel's `CAROUSEL`, `TURNOVER`, `WILL` (`season/carousel.ts`); head coach and outside-hire generation `HEAD`, graduate assistants `GA` (`data/coaches.ts`)
  - transfer portal: `PORTAL`, `MIN_COUNT` (`season/portal.ts`); careers: `CAREER` (`season/career.ts`); walk-ons `WALK_ON`, placeholder freshmen `makeFreshman` (`data/rosterGen.ts`)
  - departures: `DEPARTURES` (`season/departures.ts`), `DRAFT` (`season/draft.ts`); offseason growth `OFFSEASON` (`season/progression.ts`)
  - recruiting: `RECRUITS` (the class's size, calibration, composite noise, stars, makeup; `data/recruits.ts`), `RECRUITING` (`season/recruiting.ts`)
  - blocking anchor `ANCHOR_STR` (`data/ratings.ts`); overall weights `OVR_WEIGHTS` (`data/positions.ts`); rating templates and archetypes (`data/athletes.ts`); roster levels `CLASS_ADJ`, `LEVEL_SD`, `STANDOUT_LEVEL`, `UNIT_STEP`, `GROWTH` (`data/rosterGen.ts`); team weights `TEAM_WEIGHTS` (`data/depth.ts`)
- **After changing the season sim, polls, progression, injuries, confidence, morale, departures or recruiting,** run `npm run season` and compare against the flags in SEASON.md, the per-position growth table in PROGRESSION.md (the report flags any position more than 15% off the mean), the injury targets in INJURIES.md (`INJURIES=light` checks the light setting), the confidence targets and farming check in CONFIDENCE.md, and the morale targets in MORALE.md (spread, unhappy players spread across teams, no tracking with confidence), the emphasis targets in COACHES.md, the PORTAL section against PORTAL.md (entrants a team, flows, starter talent by tier against the control), the STAFF section against COACHES.md (head coach changes 15–30 a year, assistant turnover 20%+, talent flowing up, the league level within 2.5 and the T1–T5 staff gap within 1.5 over 5 seasons), the CAREERS section against CAREERS.md (size per season; the rest of the report must not change, since careers are history only), the DEPARTURES section against RECRUITING.md (early entrants, picks by conference, the class ladder, and starter overall by tier since the start), the PARTIAL SIM section against SIMULATION.md (shown, not tuned), and the RECRUITING section against RECRUITING.md (signees by tier against their generated-freshman level, the commit pace, early signing, decommits, time per week).
- **After changing AI or gameplay,** run `npm run balance` and compare against the baseline in PROGRESS.md and the real-world targets in [docs/TARGETS.md](docs/TARGETS.md) (FBS rushing, NFL route shapes, splits and completion rates). Flag plays that look overpowered or useless instead of quietly tuning them.
- **Browser debugging:** in dev builds, `window.game` exposes the `Game` instance, and F1 toggles the debug overlay.

## Working agreement
- Update [docs/PROGRESS.md](docs/PROGRESS.md) at the end of each work session: what's done, what's in progress, bugs, and next steps.
- Keep this file short. Put detailed design notes in `docs/` and link to them from here.
