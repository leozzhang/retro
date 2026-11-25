# Transfer portal

The first offseason system. It was built from [TRANSFER_PORTAL_PLAN.md](TRANSFER_PORTAL_PLAN.md); differences from that plan are listed at the end. Code: `season/portal.ts` (pure), `season/offseason.ts` (the stages), `render/portalScreen.ts`. Tuning is in `PORTAL` next to the logic.

## Rosters that change
Rosters are still generated from the team id and never stored. A team's changes sit in `TeamState.roster`, laid over the generated roster:
- `out`: the generated players who left.
- `in`: the players who joined, as `{ id, num }`.

A player keeps his id for life, and the id names the roster he was generated on. That makes him rebuildable anywhere: `generatedAthlete(id)` (`data/depth.ts`). Walk-on ids encode the team, year, position and a count (`${team}-w2027.QB.0`), and they're rebuilt on their own random stream (`makeWalkOn`, `data/rosterGen.ts`). Placeholder freshmen work the same way (`${team}-f2027.QB.0`, `makeFreshman`). Since departures (RECRUITING.md), `baseRoster` also lays each player's class for the season over him.

`baseRoster`/`baseSquad` (`season/world.ts`) give the generated roster with the delta applied. `squadFor`, progression's ceilings, confidence's bases and `carryMorale` all start from it. With no deltas, every report is byte-identical to the old code. `newSeason` carries `roster` into the next year.

## The offseason
- `Phase` gains `'offseason'`. An open-ended season goes `complete` → `startOffseason` → the stages → `nextSeason`. A one-season game has no offseason.
- `OFFSEASON_STAGES` is `['carousel', 'departures', 'portal', 'signing']`, the real calendar's order:
  - The coaching carousel ([COACHES.md](COACHES.md)) runs first, so players can react to coaches leaving.
  - Then departures (redshirts, graduation, early declarations and the NFL draft; [RECRUITING.md](RECRUITING.md)), so the portal reads next year's depth chart.
  - Then the portal. Its chart has the early signees on it (they join as it opens).
  - National signing day comes last and fills what the portal left (RECRUITING.md).
  - Offseason growth runs as the next season opens.
- **Why this order:** signing day used to come before the portal and filled the roster to 85. Delegated staffs could even sign past it, so `overCap` pushed players into the portal. The portal then had no room except what the user's own entrants freed, so the better you kept players, the less portal you got.
- **Old saves:** a save sitting at signing day with no portal yet opens the portal first (`migrateOffseason`, on load and on advance). One whose class already signed skips signing day after the portal.
- `SeasonSummary` now keeps the final AP top 25 (`ap`), win shares (`wp`) and level-ups per player (`dev`, from `TeamState.lu`). The portal reads the last two seasons from these for "recent results" and the development record.

## The player's side
**Motives** (`motives`): weights over PT, WIN, DEV and HOME. They're drawn from his id and never stored.
- PT runs with his pride and WIN with his team trait (`temperament`).
- Where he signed out of high school also leans them (`origin`): a power program's recruit chose a contender and the NFL path.
- His position coach's scout shows the top one, or the top two at tier-2 scouting (`SCOUT_TIERS`).

**Factors**, each 0 to 1:

| Factor | From |
| --- | --- |
| PT | A logistic on his overall against the overall of the last starter he'd have to beat at that school (`ptScale` 2.5). A promise sets a floor. |
| WIN | This season's AP rank and win share, the last two seasons from history, and a brand from prestige plus titles. A step down from his current program's WIN counts `lossAversion` (2) times extra. |
| DEV | The position coach's TEACH, and the program's development record as a percentile. |
| HOME | 1 for his home state, 0.6 for his region, 0.2 otherwise (`data/fbs/geo.ts`). |

`appeal` adds two small terms to the weighted factors: the room's mean morale and, in career mode, the user coach's security.

**Entering** (`entryOdds`): a logistic on `base + k·(market − stay) + morale + loyalty + class`.
- `stay` is his own school's appeal, with PT from his own chart.
- `market` is the 85th percentile of his appeal over the schools whose chart he'd crack.
- Low morale pushes him out. Loyalty (the team trait), a past transfer and class hold him. A promise broken last season pushes him out (`broken`).
- Walk-ons can't enter (placeholder).
- **A coach of his left in the carousel** (`Progress.cl`, `REACT` in `season/carousel.ts`): his morale already took the hit at the close, and his odds get +0.9 per unit of bond (seasons together, 1 to 3, over 3). The school the coach went to gets +0.15 × bond on its appeal, both in his market and when he decides. He follows his coach.
- The biggest weighted gap gives his reason: BURIED ON THE DEPTH CHART, WANTS A CONTENDER, WANTS TO DEVELOP or CLOSER TO HOME. When morale is the bigger push, the reason is UNHAPPY HERE; when the coach leaving is, HIS COACH LEFT. The BOARD card says which coach left and for where.

## Rounds
Round 0 is the leaving list (below). Advancing it does three things:
- **Entries roll.** CPU staffs first meet their at-risk starters, up to 4 (`cpuMeets`).
- **The position coaches work the board.** Each coach takes 3 entrants at his positions who'd improve his chart, best first with a lean toward the gettable.
- **Interest grows,** scaled by his `recruit` rating and the school's appeal.

Rounds 1 and 2 are the head coaches':
- **OFFER:** capped at the spots open to transfers plus 2 (`overOffer`), and only while the roster can still meet every position's minimum (`MIN_COUNT`). A promise can go with it.
- **CALL:** 6 a round, small interest.
- **VISIT:** 3 a round, big interest.
- **FOCUS or DROP** one of a coach's targets.
- **CPU staffs** (`autoPortal`) offer to entrants who'd start or make their two-deep and who have them in their top six. Starters come first, at most a few a position. They then visit the 3 best they've offered and call the next 6.
- The coaches work again between rounds 1 and 2.

**Deciding:** at each round's end, every player with offers takes the best by `appeal + interest`, if it clears his bar.
- The bar is 0.8 in round 1 and 0.65 in round 2, plus 0.05 per 5 overall over 75 and 0.04 per extra offer. In the last round it's only 0.25.
- Stars decide first.
- A school whose open spots fill loses its other offers.

**Arriving:**
- He keeps his id, progression and health.
- His confidence halves, and his morale resets to his baseline plus `freshStart`.
- He gets a free jersey number, and `Progress.tr` records where from.
- His overall shows exactly. Potential shows as a range that narrows with the position coach's scout; the dev trait shows at tier-2 scouting.

**Room for transfers:**
- **Roster room** (`rosterRoom`) is the cap, less everyone on the roster who isn't in the portal, less the HS commits still to join (`heldSpots`, season/recruiting.ts). Only commits within the class planned at the early signing period (`RecruitingState.plan`) hold a spot. Over-commits past it don't, and signing day lets them go if the roster fills.
- **Spots open to transfers** (`openSpots`) are the roster room, within the class's portal hold (`portalHold`: the user's dial, or `RECRUITING.portalHold`, 4) plus `signShare` (half) of the players a school lost to the portal. Before this, `departShare` (0.15) of graduates stood in for the hold.
- **Releasing a commit** (`releaseForPortal`, X on MY ROOM) frees the user's lowest unsigned commit's spot. It adds one to the hold, his interest in the school falls to `release.interest` (0.3) of what it was, and the program's pipeline in his state loses `release.pipe` (0.1). Signed commits are binding.

**Closing (§7 placeholder):**
- An unplaced player goes back to his old school only if it's short of its usual count at his position (`COMPOSITION`) and has room after its position minimums, with a morale hit (`returnHit`). Otherwise he leaves FBS. Before signing day moved after the portal, this check was room only; since rosters now have room when the portal closes, the count check keeps nearly everyone from going home.
- Then signing day (RECRUITING.md). After it, placeholder freshmen (`refillFreshmen`, `makeFreshman`) fill every roster to 85: positions under their minimum first, then the furthest under `COMPOSITION`. They start at the team's generated-freshman level.

## Leaving list and promises
Before the portal opens, the user sees every player with at least 20% odds of entering, with his reason and lean (LEANING OUT at 50%+, TORN otherwise).
- **MEET** (4): the odds come from his reason, loyalty and how far his market beats staying. A good talk cuts his logit by 1.5.
- **PROMISE A START** (−2.5) or **PROMISE SNAPS** (−1.5).
- **LET GO.**
- **ENCOURAGE:** he enters.

**Promises** (`Progress.pr`) are judged when the next offseason opens, from his starts (`gs`):
- A start needs 60% of games started; snaps need 20%, and at least one.
- **Kept:** +0.15 morale.
- **Broken:** −0.4 morale, and `pb` pushes him toward that portal.
- The morale change goes straight to `mo`, not to the fading coach-decision term `me`, because `carryMorale` clears `me` at the new season.
- A promise that came with an offer becomes his `pr` if he signs there.

## Screen (hub: SPACE on a finished dynasty season)
- **BOARD:** position chips (Q/E or click). Rows show name, POS, OVR, POT range, class, from, WANTS, your standing and the top suitors. The standing is RATES YOU HIGH (top 3), ON HIS LIST (top 6), LUKEWARM (top 20) or NOT INTERESTED. The card's actions take number keys or clicks.
- **MY ROOM:**
  - The header reads `ROSTER x/85  HS COMMITS n  ROOM r  OPEN TO TRANSFERS k`, with the hold below it, or a warning when commits run over the plan.
  - Depth by position against its usual count (red under the minimum), who signed and who's leaving.
  - X releases the lowest commit for a spot.
- **LEAVING:** the list above.
- The header shows the budget: `OFFERS 2/9  VISITS 1/3  CALLS 1/6`, or meetings in round 0.
- SPACE (or ADVANCE / CLOSE PORTAL) moves on. F hands the portal to staff (`Delegation.portal`). The last advance starts next season, and the user's portal stories open its news.
- During the offseason the hub's PREP button reads PORTAL. The title screen's L picks ONE SEASON or DYNASTY.

## Targets and results (PORTAL section of `npm run season`)
**Real-world references** are approximate, from general knowledge, not a verified table:
- Recent cycles have roughly 2,000–3,000 FBS scholarship entrants, on the order of 15–20 a team.
- Most entrants aren't starters.
- About half find a new school at some level, fewer at FBS.

The agreed target here is 10–15 a team, with real spread.

**5 offseasons of one career, every side automated, paired with a no-portal control:**

| Measure | Result |
| --- | --- |
| Entrants per team | mean 12.8, SD 6.8, range 0–35 (10.2 before players reacted to the carousel) |
| Coach departures | 32% of players had a coach leave; they're 43% of entrants; 13 a year follow their coach to his new school |
| Who enters | 81% backups |
| Outcomes | 26% sign, 64% go home (placeholder), 10% leave FBS |
| Flows by entrant overall (tier up / same / down) | 85+: 51/41/40 · 75–84: 83/135/389 · 65–74: 84/182/377 |
| Rosters | never over 85; no position under its minimum |
| Promise spam (the user promises everyone on the leaving list) | every promise judged was broken |
| Time | about 2 s per offseason |

**Starter overall by tier against the control** (T1..T5): `+0.20 0.00 +0.16 +0.79 +2.05` after one offseason, and `+0.76 +0.33 +0.32 +2.52 +6.55` after five. The T1–T5 gap closes by 5.8 points.

**After the portal moved ahead of signing day (2026-11-24), 5 seasons against the old order on the same seeds:**

| Measure | Old order | Now |
| --- | --- | --- |
| Entrants per team | 12.1 | 10.0 (fewer HS freshmen on the chart when it opens) |
| Outcomes (sign / home / out of FBS) | 29 / 42 / 29% | 38 / 48 / 14% |
| Room at open, before entries | often none, some rosters over 85 | about the hold (3–5); never over 85 |
| Starters since the start after 5 (T1..T5) | 0.89 −0.95 1.22 2.08 4.56 | 0.96 −1.44 0.92 2.07 4.33 |
| T1–T5 gap change vs control | −3.61 | −3.31 |

## Flags (not solved)
- **Entrants sit at the bottom of the 10–15 target** (10.0) since the reorder: the portal reads only the early signees, so fewer backups look buried.
- **The bottom tiers gain** ("poor get richer", the opposite of the feared rich-get-richer). Buried backups at tier 2–4 are better than tier-5 starters, and they drop down to start. That's realistic.
  - Before departures, class years were frozen and every transfer stayed forever, so the gain compounded (T5 starters +7.1 over a no-portal control after 5 offseasons).
  - **With departures** (RECRUITING.md), transfers graduate and it levels off: since the start of the career, T1–T3 starters hold within about 0.7 over 5 seasons, T4 rises about 2 and T5 about 4.5. Without portal entries, every tier holds within 1.3, so what's left is the drop-down flow itself.
  - Tried before departures: loss aversion on WIN, the origin lean, and half the spots to transfers (about 7.5 to 6.6).
  - Next levers: stronger WIN pull for good players (85+ entrants still go down more than up), and real HS recruiting, where power programs out-recruit the rest.
- **Most unplaced entrants go home,** because §7 sends anyone unplaced back when there's room, and with graduates gone there's almost always room (about 59% of entrants go home, almost none leave FBS). Real entrants rarely go back.
- **Snaps promises are judged by starts,** since snaps aren't stored. A backup promised snaps who plays without starting counts as broken.
- **Real-world calibration** of entry and placement rates wasn't researched against a table.

## Differences from the plan
- **Two head-coach rounds, not three:** round 0 is the leaving list, and the coaches' round runs as it closes. The coaches work again between rounds 1 and 2.
- **New tuning beyond the plan:** `lossAversion`, `origin`, `signShare`, and the position-minimum check on offers and returns.
- **Promises** change `mo` directly (see above).
- **Screen:** the PORTAL button replaces PREP in the offseason instead of sitting beside it, and the title screen gained the L option, since nothing could start a dynasty before.
