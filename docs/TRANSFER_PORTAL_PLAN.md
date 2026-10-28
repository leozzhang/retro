# Transfer portal: plan

_Agreed design (2026-10-27), now built: see [PORTAL.md](PORTAL.md) for the system as built, its results and where it differs from this plan._

## Goal
- The portal is the first offseason system. It should feel realistic: stars at weak programs move up, buried players at top programs move to mid-tier programs for snaps, and so on.
- It must stay balanced over many seasons.
- It uses no currency. A school's pull comes only from reputation, recent results, prestige and titles, the chance to start, its development record, the coaches' recruiting, and closeness to home.
- The HC makes real decisions on both sides: who to chase and who to keep.
- Transfers have less variance than HS recruits will: a transfer's overall is known from film.
- Graduation, the NFL draft and HS recruiting come later. Until then, the only open roster spots come from departures. Unplaced players and walk-on backfill are an explicit **placeholder** (§7).

## 1. Foundation: rosters that change (no-op refactor, do first)
Rosters are generated from the team id and never stored (`buildSquad`), so lay roster deltas over the generated roster, the way progress is laid over ratings.
- `TeamState.roster?: { out?: string[]; in?: { id; from; num }[]; walkOns?: { id; pos; seed }[] }`. Athlete ids (`${teamId}-${i}`, `rosterGen.ts`) are unique across the league, so a transfer **keeps his id**. His `progress`, `mo` and `health` entries move to the new team's state. He's rebuilt from `from`'s generated roster, so the save stays small.
- A new `baseRoster(state, teamId)` in `season/world.ts` returns the generated roster, minus `out`, plus arrivals and walk-ons (cached). It replaces the direct `buildSquad` base in:
  - `squadFor` (add the roster to its cache key)
  - `progression.ts` (the base map in the level-up code)
  - `season.ts` (the progress step's bases, and `carryMorale` in `newSeason`)
  - the season-game fallbacks in `game.ts`

  Walk-ons come from `rollRatings` plus a seeded name, at a low level.
- `newSeason` carries `roster` (and promises, §6) across the year.
- **Check:** with no deltas, `npm run season` and `npm run balance` come out byte-identical.

## 2. Offseason phase
- `Phase` gains `'offseason'`. With `SeasonState.offseason = { stage: 'portal', round: 0..3 }` and `SeasonState.portal: PortalState`, the pool, interest, offers and commits are all plain JSON, with randomness from `seasonRng(state, 'portal', ...)`.
- `length: 'open'`: `complete` leads to the offseason, which leads to `nextSeason`. `single` seasons skip it.
- The stage list is built so graduation, the NFL draft, signing day and offseason growth can slot in **before** the portal later, so the portal reads next year's depth chart.
- `SeasonSummary` gains final AP top 25, wins by team, and each team's development record (mean level-ups per player). Two or three years of history give "recent performance".

## 3. The player's side (`season/portal.ts`, pure)
**Motives (hidden, from the id, never stored, like `temperament`):** weights over **PT** (playing time), **WIN** (contender or brand), **DEV** (development and the NFL) and **HOME**. PT is correlated with pride, and WIN with the team trait. The coach's scout rating reveals the top two (`pctAt`/`SCOUT_TIERS`): `WANTS: PLAYING TIME · CLOSE TO HOME`.

**School appeal** `appeal(school, player)` = Σ motive × factor, each factor 0..1:
- **PT:** where his overall projects on that school's chart at his position, counting commits. This is the natural brake on hoarding: an 88 won't sit behind a 91.
- **WIN:** this season's finish (AP rank, win %), the last 2–3 seasons from history, and a slow prestige-and-titles base (`profile.prestige` plus champions in `history`). An underperforming blue blood still pulls.
- **DEV:** the position coach's `teach` plus the program's development record.
- **HOME:** hometown state against the school's state: same state 1, same region 0.6, otherwise 0.2 (`fbs/geo.ts`).
- Small terms: the room's mean morale ("a happy roster recruits better"), and coach security in career mode.

**Entering the portal:** a logistic on `market − stay + morale term + noise`.
- `stay` is the current school's appeal, with PT from his real role there.
- `market` is a high percentile of his appeal over the schools whose chart he'd crack.
- On top of that: low morale (the role, team and coach drivers in `morale.ts`), loyalty (the team trait, LOYAL), a penalty if he already transferred, and class.

The same comparison gives every flow: a G5 star gains WIN while keeping PT and leaves upward; a buried gem at a T1 gains PT and leaves for a mid-tier school; a fringe player at a mid-tier school drops a tier to play.

**Target:** about **10–15 entrants per team**, with real spread from mood and coaching. Tuning goes in `PORTAL` next to the logic.

## 4. Rounds: coaches first, then the HC
- **Round 0, entries:** the user's at-risk players appear first on the LEAVING tab (§6).
- **Round 1, coaches work the board:** each position coach (CPU and user alike) works the entrants who'd improve his chart.
  - The gain in interest scales with a **new `recruit` rating** (`CoachRatings.recruit`, position coaches) and the school's appeal.
  - Each coach has a fixed number of targets per round.
  - Draw `recruit` from its own RNG stream, so existing scout, teach and game values don't change.
- **The user reads the results:** each entrant's standing with your school: **RATES YOU HIGH** (top 3), **ON HIS LIST** (top 5–6), **LUKEWARM** or **NOT INTERESTED**, plus his visible suitors.
- **Rounds 2–3, the HC pursues** with a limited attention budget:
  - **OFFER:** capped at open spots plus a small over-offer margin. A commit that fills the last spot lapses your other offers.
  - **CALL:** about 6 per round; small.
  - **VISIT:** about 3 per round; big.
  - **PROMISE:** a starting shot or more snaps. It lifts his PT factor (§6).
  - **Focus or drop a coach's target.**
  - The risk-and-reward choice: spend visits on a reach target who has you LUKEWARM, or lock in the players who rate you highly.
- **Decisions at each round's end:** each player picks his best offer by `appeal + interest` if it clears a threshold.
  - The threshold falls each round and rises with his overall and his number of offers, so top players hold out and rivals can steal a target between rounds.
  - After the last round, the unplaced go to §7.
- **CPU teams** run the same functions (`autoPortal`), sized by need and open spots. A new `Delegation.portal` hands the user's board to staff.

## 5. Arriving
- Arrivals keep their progression.
- Confidence halves (as in `carryConfidence`), and morale resets to his baseline plus a small fresh-start bump.
- He gets a free jersey number.
- `Progress.tr = { from, year }` marks a transfer. It feeds the card (`TRANSFER FROM GEORGIA`) and the penalty for transferring again.
- **Less variance than HS:** his overall shows exactly. Potential and dev trait show as a range, narrowed by the position coach's scout. HS recruits will show the overall itself as a range.
- **News** (a new `'portal'` kind): top entrants, big commitments (real players especially), and the user's commits and losses.

## 6. Leaving tab, promises
- **Before round 0 resolves,** the user sees players **CONSIDERING THE PORTAL**, each with a reason (BURIED ON THE DEPTH CHART, WANTS A CONTENDER, CLOSER TO HOME, plus the morale reason) and a lean (LEANING OUT / TORN). The actions:
  - **MEET** (about 4 meetings): odds from his reason, his loyalty and the school's appeal.
  - **PROMISE:** a starting shot or more snaps; a big lift.
  - **LET HIM GO.**
  - **ENCOURAGE A MOVE:** frees a spot, with no hit to the room.
- **Promises** go in `Progress.pr = { kind: 'start' | 'snaps', year }`. They're judged next season from `Progress.gs` and the role.
  - **Kept:** a coach-decision morale lift.
  - **Broken:** a large `me` hit, plus a bonus to entering the portal next year.
  - Promising one starting job to two players breaks one promise. Promises to incoming transfers work the same way.
- **After he enters,** you can recruit him back like any suitor, with a small familiarity bonus.

## 7. Placeholder until graduation and HS recruiting (documented as such)
- An unplaced player goes back to his old school if it has a spot, with a morale hit. Otherwise he leaves FBS.
- Walk-ons refill any roster below 85, filling `COMPOSITION` shortfalls first so every position stays playable.
- Class years stay frozen, as they are today. Both of these are removed once graduation and recruiting land.

## 8. UI (`render/portalScreen.ts`; hub shows OFFSEASON → PORTAL)
- **BOARD:** position chips (ALL, QB … ST, like the call screen's formation chips), sorted by overall from high to low. Columns: name, POS, OVR, POT range, class, from, WANTS, your standing (bar plus tag), suitors, status. A selected player opens a card.
- **MY ROOM:** open spots, depth by position against needs, commits.
- **LEAVING:** §6.
- **Budget line:** `OFFERS 7/9 · VISITS 2/3 · CALLS 4/6`, plus ADVANCE ROUND.

## 9. Balance risks to measure (new PORTAL section in `npm run season`)
- **Rich get richer:** mean starter overall by tier, season over season, should drift by less than about 1 point over 5 seasons. PT is the main brake and spots the second. This matters more because of the steep talent gaps in the live sim.
- **Volume and shape:** entrants per team (mean about 12, with SD and min/max) by role; the share placed in FBS; flows by entrant overall band (tier up / same / down); net talent by tier.
- **Promises:** kept and broken rates. **Exploits:** you can't hoard players beyond your spots, and promise spam backfires.
- Research real-world targets (entry counts, starter share, placement rate) into `docs/PORTAL.md` at build time, labeled approximate.

## Build order
1. Roster deltas and `baseRoster` (no-op; byte-identical reports).
2. Offseason phase, history fields, motives, appeal, entries, and calibration of entries.
3. Interest, `recruit`, the rounds, the CPU AI, decisions, placement and the §7 placeholder. Calibrate the flows and tier drift over 5 seasons.
4. Leaving tab logic and promises.
5. Portal screen, hub and news.
6. Docs: `docs/PORTAL.md`, plus updates to CLAUDE.md, PROGRESS.md, MORALE.md ("not built"), COACHES.md (`recruit`) and SEASON.md (offseason).

## Verification
- **New `src/portal.test.ts`:**
  - determinism and a JSON round trip, including a save mid-portal that continues identically
  - no player on two teams; rosters ≤ 85; position minimums met
  - progress and morale move with the player
  - a star is likelier to enter at a T5 than at a T1; a buried gem at a T1 enters
  - a PT-first player picks starting over prestige
  - offers capped by spots
  - a promise kept and a promise broken
  - `squadFor` shows arrivals
- **Commands:** `npm run typecheck`; `npm run balance` byte-identical; `SEASONS=5 npm run season` checked against the PORTAL targets and the existing flags.
- **In the browser:** headless Chrome through the offseason, with no console errors.
