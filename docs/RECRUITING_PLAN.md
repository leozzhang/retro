# Recruiting, graduation and the NFL draft — plan

## Context
Class years are frozen (`Athlete.year` comes from roster generation), nobody graduates, and players who don't play never grow (progression is in season only). So an open dynasty keeps the same players forever. The portal's tier drift flag (T5 starters +6.6 over 5 offseasons) is caused by this, and walk-ons stand in for a freshman class (`signShare`, `makeWalkOn`).

The goal is a realistic player lifecycle:
1. High school recruits are found, evaluated and recruited **during the season**, on a real calendar: summer commits, official visits at home games, flips and decommits, the early signing period, then national signing day.
2. They enroll, develop (including in the offseason), and either graduate or declare for an NFL draft named by city ("Rd 1, Pick 12 — Tampa Bay").

Decisions already made with the user:
- **Weekly load: boards plus key calls.** The user puts prospects on each position coach's board and flags top targets. The user decides offers, home-game visits and in-home visits. Coaches spend their weekly contacts on their own boards. F hands it all to staff.
- **Fog:** every prospect shows the services' stars and rank. Time a position coach spends on a prospect earns that coach's evaluation, which stays vague: words, never OVR or potential numbers. True OVR shows once he enrolls; potential then shows as a range, as transfers' does.
- **Draft:** 7 rounds, 257 picks, teams named only by city.
- **Phasing:** departures first (Phase 1, which is useful on its own), then recruiting on top of it.

The design reuses the systems already built. Players keep their ids for life, and rosters are deltas (`TeamState.roster`, `baseRoster`, `generatedAthlete`). Appeal reuses the portal's `School`, `factors` and `motives`. Personality reuses `temperament` (morale). The coaches' `recruit` and `scout` ratings and the head coach's `recruit`/`EVAL` feed in through `headRecruit` and `tierZ` (coaching.ts). Hometowns use `REGION`/`TALENT`/`CITIES` (geo.ts). The offseason stays a list of stages (`OFFSEASON_STAGES`).

---

## Calendar (season year Y recruits the class that enrolls in Y+1)
| When | What |
| --- | --- |
| `newSeason` (week 0) | The class of Y+1 is generated. A quick automated **summer cycle** runs every staff, the user's included, so about 45–55% of the top 300 are committed by week 1, as in reality. News: "You open the cycle with N commits." |
| Weeks 1–14 | A weekly `recruit` step runs after `results`, so visits see that week's score. Coaches work their boards; home games host official visits. Commits, flips and decommits happen. Top-N lists narrow ("top 8 → top 5 → top 3"). |
| End of week 15 (championship week) | **Early signing period.** Most commits sign, binding. Some uncommitted prospects sign, and some wait. |
| Bowls / CFP | Dead period: contacts only, no visits. In-home visits by the head coach open. |
| Offseason: `carousel` | Already built. At the close, recruits react: a departed head coach or recruiter means decommit rolls and the coach's new school gets interest (the same idea as the portal's `REACT`). |
| Offseason: `departures` (new) | Graduation, early declarations (with a DECLARE WATCH for the user, like the leaving list), and the NFL draft. |
| Offseason: `signing` (new) | **National signing day**, in 2 rounds like the portal. Unsigned and decommitted prospects decide; anyone left over goes to FCS/JUCO. |
| Offseason: `portal` | Now reads next year's real chart: graduates gone, the signed class in. Transfers fill what's left, walk-ons the rest. `signShare` is removed. |
| `nextSeason` | Signees join as freshmen, then **offseason growth**, and class years advance. |

`OFFSEASON_STAGES` becomes `['carousel', 'departures', 'signing', 'portal']`.

---

## Phase 1: departures (class years, redshirts, graduation, offseason growth, the draft)
It works without recruiting: a placeholder freshman class fills spots at the generated-freshman level, so the drift checks are meaningful.

1. **Class years that move.**
   - `classAt(a, state)` = the generated class + seasons elapsed − redshirt years.
   - `baseRoster`/`baseSquad` (`season/world.ts`) lay the year and redshirt onto each athlete, so morale's `classExpect`, `YEAR_XP`, the portal's `cls` and career `cls` all read the real class with no other change.
   - Stored per player: `Progress.rs` (the season he redshirted) and `Progress.gp` (games with a snap, filled from the grades in the `progress` step).
2. **Redshirts.**
   - The NCAA rule: a player who hasn't redshirted and plays 4 or fewer games gets the year automatically at season end.
   - The staff depth chart keeps a non-starting freshman to 4 games (`HEALTH`-style rule in `data/depth.ts`).
   - The user can toggle REDSHIRT on the team page's player card.
3. **Offseason growth** (`season/progression.ts`, `offseasonGrowth`, run in `nextSeason`):
   - XP from class, dev trait, potential room (`potentialFactor`), the position coach's TEACH and the head coach's DEVELOP (`programXp`), and morale.
   - Non-players gain the most relative to their in-season work.
   - Calibrate so class means keep the generated ladder (`CLASS_ADJ` FR −8 / SO −3 / JR +1 / SR +3) and per-tier starter level stays flat over 5–10 seasons.
   - Tuning: `OFFSEASON` next to it.
4. **Graduation:** seniors with no eligibility left leave in `departures`. Career story `graduated`, and their row closes.
5. **Early declarations** (`season/draft.ts`, new):
   - Players 3+ years out of high school (JR, RS SO and up) declare on a logistic of their projected round, an NFL want (from temperament plus the stars' origin, like `motives`), and a team-trait "unfinished business" pull back.
   - The user's DECLARE WATCH lists his at-risk players with MEET, which reuses the portal's meeting pattern.
   - Tuning: `DRAFT.declare`.
6. **NFL draft:**
   - Value = position overall × position value (QB, OT, DE, CB high; K, P, FB low) + athleticism (spd, acc, str, size) + seeded noise.
   - 257 picks over 32 cities, with the order seeded by year.
   - Undrafted players just leave.
   - `SeasonSummary.draft` (`{id, team, round, pick, city}[]`) holds the result. Recruiting's NFL pull will read it. News, career story `drafted`, and a hub notice for the user's picks.
7. **Placeholder freshmen** (`makeFreshman` in `data/rosterGen.ts`, its own id form and stream) fill spots after the portal at the tier's generated-freshman level. They're replaced by real recruits in Phase 3.
8. **Former players as GAs** (left open in the carousel plan): a graduate can be offered a GA slot. Optional, last.
9. **Save version bump.** The `newSeason` carry-over adds `rs`.

**Report:** a DEPARTURES section in `npm run season`:
- graduates and early entrants per team (real: about 80–100 underclassmen enter, about 257 drafted, about 95% from FBS, with the SEC and Big Ten on top)
- picks by conference and tier
- per-tier starter overall drift over 5 seasons (target: within ±1.5, and the PORTAL T5 drift flag gone)
- class-mean ladder holding

---

## Phase 2: the prospect pool (data only)
- **`data/recruits.ts`:** `recruitPool(seed, year)`, about 3,600 prospects (FBS signs about 3,300; the rest go FCS), cached.
  - The id is `r{year}.{salt}.{n}`, with the salt from the season seed, so `generatedAthlete(id)` rebuilds any recruit statelessly, like walk-ons.
- **Truth (hidden):**
  - position by the national need mix (`COMPOSITION`)
  - hometown by `TALENT`
  - a level as an incoming freshman, potential and dev trait from a national distribution, and ratings via `rollRatings`
- **Services' composite** (shown):
  - stars and national and position rank from `potential + level + noise`
  - more noise in low-TALENT states and small towns, and late bloomers (elite dev) underrated, matching `starsFor`'s existing lean
  - About 32 five-stars, 400 four-stars and 1,800 three-stars a class. These are approximate, from general knowledge; unverified like the portal's.
- **Personality (hidden, from the id):** his `temperament` carries into his career, so a PT-driven recruit is later the portal-prone one. Recruit-only traits:
  - `timeline`: early, normal or signing-day
  - `firmness`: flip and decommit resistance
  - `spotlight`: how much a visit's atmosphere and the result swing him
  - `dream`: about 15% have a dream school, usually in-state or a brand
  - Wants: PT, WIN, DEV, HOME, NFL (program draft record at his position), and COACH (bond with his recruiter). `motives()` in portal.ts leans the same way once he enrolls.
- **Calibration test:** under fully automated recruiting (Phase 3), each tier's signed class averages that tier's generated-freshman level (unit target + `CLASS_ADJ.FR`) within about 1.5, and the T1–T5 gap holds. This is the most important tuning target in the whole project.

---

## Phase 3: the recruiting engine (headless, every team automated)
`season/recruiting.ts`, pure like portal.ts, with `RECRUITING` tuning next to the logic. State is `SeasonState.recruiting` (plain JSON, kept sparse):
- `interest[rid][team]`
- `offers[team]`
- `commits[rid] = team`
- `signed[rid] = team`
- `boards[team][group]` (prospect ids, plus a top-target flag)
- `eval[team][rid]`: evaluation effort
- `by[rid][team]`: the recruiting coach's id, for the bond
- `visits`: by game id
- a log of commits, flips and decommits for news and the report

**Weekly step** (`recruitWeek`, after `results`):
1. **Contacts.** Each position coach works up to `contacts` prospects on his board.
   - Interest += his `recruit` × appeal fit × pipeline × noise.
   - Evaluation effort accrues. The head coach adds offers' weight and, after week 15, in-home visits (`headRecruit`).
   - Interest decays a little without contact.
2. **Visits.**
   - Each home game hosts up to `visitsPerGame`. A prospect gets at most 5 official visits.
   - The boost scales with the result and margin, the opponent's rank, a rivalry, prestige and atmosphere, and his `spotlight`, plus a vibe roll. A bad home loss can backfire.
   - The user's live game uses its real score.
3. **Appeal:** the portal's `factors` plus NFL and COACH.
   - PT is projected on **next year's** chart: seniors and likely declarations removed, commits at his position added. A 5-star QB commit scares off other QBs.
   - WIN reads this season's results live, so a slump hurts mid-cycle.
4. **Commit** when his timeline is due, he holds an offer, and his top school's `appeal + interest` leads the next by a bar that falls through the cycle (the portal's threshold idea). Top-100 commits get a "hat ceremony" news line.
5. **Flips and decommits.**
   - Other schools keep recruiting a commit, at reduced effect.
   - Each week a firmness logit rolls on: the best rival's lead, a team slump (a losing streak, a blowout, dropping out of the AP), a higher-ranked commit at his position, his `firmness`, and (from the carousel close) his recruiter or head coach leaving.
   - A decommit is open again and can flip the same week.
6. **Class limits:** commits are capped at projected open spots + `overCommit` (2). Signings over the limit push the lowest-value roster players to the portal (`forced`, ENCOURAGED TO TRANSFER), which is realistic roster management.

**Signing:**
- **Early period:** commits sign by firmness (target: about 75–85% of a class signs early).
- **National signing day:** 2 rounds (offers and in-home visits, then decisions; the last round has a floor). Leftovers go to FCS.
- **Arrival:** signees join `TeamState.roster.in` as freshmen with morale at baseline, and a career story "signed with X as a 4★ from City, ST".

**CPU staffs and the user's auto mode** (`autoRecruit`, the same code; `Delegation.recruiting`):
- Needs come from projected departures by position against `COMPOSITION`.
- The board is about 3× needs, picked from a reachable star band by tier (with a reach factor). Prospects are ranked by **the staff's own estimate**, so a bad scout misses gems and signs busts, × gettability × need.
- They offer as interest builds, and host the best targets at home games.

**Coach growth:** `coaching.ts`'s recruit work counter moves from portal signings to star-weighted HS signings less misses, plus the portal.

**Report:** a RECRUITING section in `npm run season`:
- stars by tier, the class level against the generated-freshman level (the Phase 2 target), class rank spread
- in-state share by tier
- % committed by week, the early-signing share, the decommit rate (target 10–20% of commits), flips
- gems (3-stars who start by year 3) and busts
- time per simulated week (target under about 0.5 s)

The portal's §7 placeholders and `signShare` are removed here.

---

## Phase 4: pipelines and reactions
- **Coach pipelines:** `CoachProgress.pipe` (state to strength). It's seeded from the coach's id (1–2 states, near where he was generated), grows with signings from that state, and fades without them. It gives an interest and evaluation bonus there. **It moves with him in the carousel**, so hiring a DL coach with a Georgia pipeline means something. The carousel's HIRING card shows a coach's pipeline.
- **Program pipelines:** `TeamState.pipe`, built from recent classes' signees by state and decaying. Carried in `newSeason`. It adds a familiarity term ("guys from his area went there").
- **Reactions at the carousel close:** a recruiter's or head coach's departure drives decommits, and the coach's new school gets interest × bond (like the portal's `REACT`). A new head coach's housecleaning can also drop commits.
- Optional flavor: high school names, and "former high school teammate on the roster" as a small pull.

---

## Phase 5: the user's screen (`render/recruitScreen.ts`, the hub's RECRUIT button; the PREP button stays)
- **BOARD:** position chips (as in the portal).
  - Rows show stars, rank, hometown, the assigned coach, your standing (the portal's standing labels), his top schools, status (OPEN, COMMITTED (school), SIGNED), and a TOP TARGET flag.
  - The card shows **the position coach's evaluation**, all in words:
    - **readiness:** "WILL PLAY EARLY", "NEEDS A YEAR", "DEVELOPMENTAL PROJECT"
    - **ceiling:** "STARTER", "ALL-CONFERENCE TALENT", "SPECIAL"
    - **sureness:** "HUNCH", "FAIRLY SURE", "CONVINCED"
    - two or three trait notes ("explosive first step", "raw hands")
  - The evaluation sharpens with effort, the coach's SCOUT and the head coach's EVAL, and gets a nudge from his pipeline. A weak scout can be confidently wrong. Actions: OFFER, HOST AT (pick a home game), IN-HOME VISIT (post-week 15), TOP TARGET, DROP.
  - His wants appear as contact reveals them: the top one, then the top two.
- **SEARCH:** the national pool, filtered by position, stars, state, pipeline and status. ADD TO a coach's board. STAFF FILL fills the empty board slots the way `autoRecruit` would.
- **CLASS:** commits and signees, needs by position against projected departures, the class rank (a star-points composite) and the national top 10.
- **Visits in games:** the prep screen lists VISITING THIS WEEK, and the final screen shows each visitor's reaction ("★★★★ QB J. Smith: LOVED IT").
- **Budget in the header:** `OFFERS 14/30  VISITS 3/6 (vs AUB)  IN-HOMES 2/4`.
- **F delegates.**
- News kinds: `'recruiting'` and `'draft'`.

---

## Files
- **New:**
  - `src/season/draft.ts`, `src/season/recruiting.ts`, `src/data/recruits.ts`, `src/render/recruitScreen.ts`
  - `docs/RECRUITING.md` (design as built)
  - `docs/RECRUITING_PLAN.md` (this plan, saved like CAROUSEL_PLAN.md)
  - tests `src/departures.test.ts`, `src/recruiting.test.ts`
- **Modified:**
  - `src/season/types.ts`: Progress `rs`/`gp`, RecruitingState, Delegation `recruiting`, SeasonSummary `draft`, new stages and news kinds
  - `src/season/world.ts`: class laid over in `baseSquad`
  - `src/season/offseason.ts`: new stages
  - `src/season/season.ts`: `recruit` week step, early signing at week 15, `newSeason` summer cycle, growth, carry-over
  - `src/season/progression.ts`: offseason growth
  - `src/data/depth.ts`: `generatedAthlete` for recruit and placeholder ids, the redshirt-protect rule
  - `src/data/rosterGen.ts`: `makeFreshman`
  - `src/season/portal.ts`: remove `signShare`/§7 placeholders, PT on next year's chart
  - `src/season/carousel.ts`: recruit reactions, pipeline on the card
  - `src/season/coaching.ts`: recruit work
  - `src/season/career.ts`: graduated, drafted and signed stories
  - `src/game/game.ts` + `src/render/seasonScreen.ts`, `prepScreen.ts`, `teamScreen.ts`: buttons, visitors, redshirt toggle
  - `scripts`: season report sections
  - CLAUDE.md tuning list, PROGRESS.md

## Verification (each phase)
- `npm run typecheck`; `npm test`. New tests:
  - class advance and redshirt rule
  - graduation and draft determinism (257 picks, no duplicates)
  - a recruit rebuilt from his id
  - pool star counts
  - a mid-cycle save continuing identically
  - roster ≤ 85 with minimums met
  - a decommit after the recruiter leaves
  - the auto class calibrated by tier
- `npm run balance`: byte-identical (no sim changes).
- `npm run season` (SEASONS=5, then 10 once to check drift): the DEPARTURES and RECRUITING sections against the targets above. The PORTAL, STAFF and CAREERS sections are re-checked against their docs; the PORTAL T5 drift flag should go away.
- Drive the screens in headless Chrome over CDP against `npm run dev` (as with the portal and carousel): the board, an offer, hosting a visitor at a home game, a commit, early signing, the offseason stages, the next season's freshmen on the roster. No console errors.
- Update PROGRESS.md at the end of each phase.

## Open questions for later (not blocking Phase 1)
- **NIL money:** none for now. Brand and prestige stand in for it, as "money is prestige" does in the carousel.
- **The modern roster limit (105):** stays at 85, since every system is calibrated to it.
- **Midseason CPU firings** (which would trigger in-season decommits): currently only the carousel fires. A hot-seat rumor that dents interest is a small add later.
