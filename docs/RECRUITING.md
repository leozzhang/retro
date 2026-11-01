# Recruiting, graduation and the draft

Planned in [RECRUITING_PLAN.md](RECRUITING_PLAN.md). This page is the design as built. Phase 1 (departures) is done; HS recruiting (phases 2–5) isn't built yet, and placeholder freshmen stand in for it.

## Phase 1: departures

### Class years (`season/classes.ts`)
A class is never stored. `classIn(gen, year, rs)` works it out:
- **Where he started:** his generated class in the first season (2026), or a freshman in the season his walk-on or freshman id names (`joinYear`, `data/rosterGen.ts`).
- **Plus the seasons since,** less a redshirt year. `Progress.rs` is the season he redshirted: that season still counts as his class, and from the next one he's "RS" and a year behind.
- `baseRoster`/`baseSquad` (`season/world.ts`) lay the class over every athlete (`withClass`). So morale's expectations, `YEAR_XP`, the portal's class term and career rows all read the real class, with no change of their own. In 2026 with no redshirts, the roster is the generated one, so single-season reports are unchanged.
- `outOfEligibility`: a senior who didn't take his redshirt this season.

### The stage (`season/departures.ts`)
The offseason is `carousel` → `departures` → `portal`.
- **Round 0, the declare watch:** the user's underclassmen with at least `DEPARTURES.watch` (15%) odds of declaring, with their projected round. MEET (`meet.n`, 3): the odds are `base` plus `team` per point of his team trait, less a first- or second-round projection. A good talk takes `lift` (1.5) off his logit. CPU staffs (and a delegated user, F) meet their 2 likeliest.
- **Advancing round 0 runs the stage:**
  1. **Redshirts.** A player who hasn't redshirted and took snaps in 4 or fewer games (`Progress.gp`, counted in `progressTeam`) takes the year, if he's a true freshman or had a season-ending injury (a medical redshirt, which can keep a senior).
  2. **Declarations.** Anyone 3+ seasons out of high school (a JR, RS SO and up) who isn't out of eligibility. The logit is `byPick` by projected pick (from +2.6 for a top-16 projection to −5 undrafted), plus `pride` and `team` per point of his temperament (the proud go, the team-first stay), plus `last` with one season left. The projection is his rank in the draft class as if everyone declared.
  3. **The draft** (`season/draft.ts`). The class is every senior out of eligibility plus the declarers. Value is:
     - overall plus `posValue` (QB +4, OT and DE +2.5 ... K and P −9 to −10)
     - athleticism over his position's template at his overall (speed, acceleration, and strength on the lines)
     - upside: potential room (`room`, capped) and `youth` per season of eligibility left
     - a fixed noise draw per player and year

     7 rounds of 32 in one seeded city order, plus `comp` compensatory picks closing rounds 3–7: 257 in all. NFL teams are only cities (`NFL_CITIES`).
  4. Everyone graduating or declaring leaves (`dropPlayer`). Each gets career story lines (`graduated`/`declared`, `drafted`, or "goes undrafted"), and the draft lands in `SeasonSummary.draft`. The news (`'draft'` kind, carried into next season's week 0) covers the departures count, the first pick, the top conference and every user pick.
- **Round 1** shows who left. Advancing it opens the portal. `DeparturesState.left` (players lost per team) gives transfers `departShare` of those spots.
- **After the portal,** placeholder freshmen (`makeFreshman`) fill every roster to 85. They start at the team's generated-freshman level (`freshmanOffset`: how far its generated true freshmen sit from their unit targets) with spread `LEVEL_SD`.

### Offseason growth
See [PROGRESSION.md](PROGRESSION.md#offseason-growth). Returning players grow as the next season opens; incoming freshmen don't.

### Screen (`render/departuresScreen.ts`; the hub's DRAFT button in this stage)
- **DECLARE WATCH:** odds, projection, lean (LEANING NFL at 50%+), and MEET (1 or the button). After the stage: STAYS, or the round and city.
- **SENIORS:** who's out of eligibility; after the stage, everyone who left, why, and where he was drafted.
- **DRAFT:** all 257 picks, with yours in gold and early entrants starred.
- Space runs the draft, then opens the portal. F hands the watch to staff (`Delegation.departures`).

### Results (`npm run season`, 5 offseasons of one career, DEPARTURES and PORTAL sections)
The real-world references are approximate, from general knowledge, not a verified table.

| Measure | Result | Reference |
| --- | --- | --- |
| Graduates a team-offseason | 17.8 | |
| Early entrants a year | 103 | about 80–110 |
| Underclassmen drafted | 64, 22 in round 1 | |
| Picks by conference | SEC 74, Big Ten 66, Big 12 42, ACC 39, independents 14, the Group of 5 and Pac-12 about 22 | Group of 5 about 30 |
| Redshirts a team-offseason | about 12 (most true freshmen) | |
| Overall by season in the program | holds the generated ladder within about 2 | |
| Starter overall by tier since the start, after 5 | T1–T3 within about 0.7; T4 +2, T5 +4.5 | within 1.5 |

### Flags
- **T4 and T5 still rise** through the portal's drop-downs (PORTAL.md flags). Without portal entries, every tier holds within 1.3.
- **The Group of 5 is under-drafted** (about 22 picks against about 30), because its best players sit well below the power programs' in overall. That's the steep-talent-gap issue in PROGRESS.md.
- **Class sizes come in waves.** Most generated true freshmen redshirt in the first offseason, so graduating classes swing between about 12 and 21 a team in the early years.
- **Most true freshmen redshirt,** because backups barely play in season. The depth chart doesn't manage the 4-game limit yet, and there's no REDSHIRT toggle on the team page.
- **Saves grow:** graduates' careers are kept, and redshirt and graduation lines add up (CAREERS.md).
- **`SAVE_VERSION` is unchanged.** Every new field is optional, so a saved season continues; an old save mid-offseason at the portal skips departures that year.
