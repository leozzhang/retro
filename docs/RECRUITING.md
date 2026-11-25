# Recruiting, graduation and the draft

Planned in [RECRUITING_PLAN.md](RECRUITING_PLAN.md). This page is the design as built: phase 1 (departures) and HS recruiting (phases 2–5). Recruiting runs in open-ended careers only; a single season has no class to enroll.

## Phase 1: departures

### Class years (`season/classes.ts`)
A class is never stored. `classIn(gen, year, rs)` works it out:
- **Where he started:** his generated class in the first season (2026), or a freshman in the season his walk-on or freshman id names (`joinYear`, `data/rosterGen.ts`).
- **Plus the seasons since,** less a redshirt year. `Progress.rs` is the season he redshirted: that season still counts as his class, and from the next one he's "RS" and a year behind.
- `baseRoster`/`baseSquad` (`season/world.ts`) lay the class over every athlete (`withClass`). So morale's expectations, `YEAR_XP`, the portal's class term and career rows all read the real class, with no change of their own. In 2026 with no redshirts, the roster is the generated one, so single-season reports are unchanged.
- `outOfEligibility`: a senior who didn't take his redshirt this season.

### The stage (`season/departures.ts`)
The offseason is `carousel` → `departures` → `portal` → `signing` (PORTAL.md has the reasons for the order).
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
- **Round 1** shows who left. Advancing it opens the portal (the early signees join their rosters first). `DeparturesState.left` counts the players lost per team.
- **After signing day,** placeholder freshmen (`makeFreshman`) fill what the signed class and transfers left, to 85 (about 1.6 a team with recruiting). They start at the team's generated-freshman level (`freshmanOffset`: how far its generated true freshmen sit from their unit targets) with spread `LEVEL_SD`.

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

## Phases 2–5: HS recruiting

### The class (`data/recruits.ts`)
- **About 3,500 prospects a class:** `perTeam` (23) rolled at each FBS program's generated-freshman level (`rollFreshman`, the same roller as placeholder freshmen), plus `extra` (350) under FBS level.
  - Which program a prospect was rolled from is never shown. The market decides where he goes.
  - `spread` (0.6 of `LEVEL_SD`) and `tierShift` calibrate it. The market sorts the class into contiguous bands by tier, where generated rosters overlap, so a narrower spread keeps each tier's signees at its level.
- **Ids are `r{class}.{salt}.{n}`:** the season he enrolls, a salt from the career's seed, and his number. `generatedAthlete` and `joinYear` read them, so a recruit is rebuilt from his id like any player, and his class year starts as a freshman the season he enrolls.
- **The services' composite** (shown):
  - It's built from his level plus `upside` × his growth room, plus noise. The noise is bigger in thin states and off the big metro, and late bloomers are marked down.
  - Stars by national rank: 32 five-stars, 398 four-stars and 1,800 three-stars, with the rest 2-stars. Each prospect also gets a position rank.
  - `pub` is the level the services think he is. Recruits judge playing time with it.
- **Makeup** (hidden, from the id):
  - his timeline: early (summer), normal (from a week), or late (signing day)
  - `firm`, his resistance to flips
  - `spotlight`, how much a visit moves him
  - a dream school for about one in seven
  - wants: PT, WIN, DEV, HOME, NFL, COACH
- **His portal motives once he enrolls** are his recruiting wants (PT, WIN, DEV, HOME renormalized).

### The cycle (`season/recruiting.ts`)
Season Y recruits the class of Y+1. Every school runs the same code. The user's position coaches always make the contacts; the user decides boards, offers, visits and in-homes unless `Delegation.recruiting` (F) hands them to the staff.

- **Summer** (`openRecruiting`, at `newSeason`): every staff, the user's included, builds a board and runs 4 rounds of contacts, summer official visits and offers. Early deciders commit.
- **Weekly** (`recruitWeek`, the `recruit` week step after the polls):
  1. Home games host official visits: the user's picks (HOST VISIT) and the staffs' for everyone else. The boost scales with the atmosphere (prestige), then the result: a win, the margin, a ranked opponent, a rivalry. A blowout loss can backfire, and `spotlight` scales the swing. The user's visitors make the news ("LOVED IT" ... "LEFT COLD").
  2. Contacts: each position coach works `contacts` (8) prospects on his part of the board: top targets first, then offers he's waiting on, then his commits, then the best reads. Interest builds with his recruit rating, the school's appeal and pipelines, and saturates at `cap`. Interest a school isn't working decays.
  3. Boards refresh at weeks 3, 6, 9 and 12. Offers go out weekly (CPU staffs, or a delegated user).
  4. Decisions:
     - Commits roll on decommitting: a rival's lead, his firmness, a blowout loss, a 3-game losing streak, falling out of the AP poll, a better commit at his position.
     - Then everyone due and open takes his best offer with room, if it leads his next choice by the week's bar. The bar falls through the season and with each official visit he's taken. A decommit can flip the same week.
  5. Week 15 closes with the **early signing period**: commits sign, binding, by firmness. Late deciders mostly wait. In-home visits open (6 for the user, the CPU staffs a few).
     - A school signs at most its planned class (`target`), best-ranked first. Over-commits stay verbal.
     - The plan is kept (`RecruitingState.plan`): commits within it hold roster spots through the portal; those past it don't.
- **Appeal** is the prospect's wants times the school's factors:
  - PT: making next year's two-deep, judged on returners plus `growth` and the commits at his position
  - WIN: this season, the last two, and the brand
  - DEV: the position coach's teach and the program's development record
  - HOME
  - NFL: the program's draft picks at his group
  - COACH: the position coach's recruit rating

  On top come a dream school's pull and the program's pipeline in his state. His **market** is the schools whose boards reach him (`buildMarkets`).
- **The CPU staffs** (and a delegated user):
  - **Needs:** seniors and `attrition` (1, early entrants) out, less the **portal hold**, by position against the usual mix.
    - The hold is `portalHold` (4) spots the class leaves for transfers.
    - The user sets his own on the CLASS tab with `[`/`]` (0 to `holdMax`, 10) until the portal opens (`RecruitingState.hold`). A delegated staff uses it too.
    - Portal losses aren't planned for: signing day, after the portal, fills them.
  - **Once departures have run,** the class is the room under the cap: the roster (with the early signees and transfers on it) and the commits still to come, with no over-commits.
  - **Board:** `board.mult` targets a spot, from prospects who rank the school in their top 12 among the schools that would take them; a board still short reaches to the top 24. Each staff ranks by its own read (`estimate`): a weak scout's lasting bias plus noise that shrinks with effort. A program with less brand than its tier reaches lower (`reach`).
  - **Offers:** to prospects who rank it top 6, within twice the class plus `paceOffers` when behind pace. Offers to prospects committed elsewhere stand but don't count against the budget.
- **The carousel** (`recruitsReact`, at its close): an unsigned commit whose head coach or position coach left rolls on decommitting, and the coach's new school picks up interest.
- **Early signees join** `TeamState.roster.in` as the portal opens (`joinRosters`), as freshmen, with baseline morale and a `signed` career line. They don't grow this offseason and can't enter the portal before they enroll. A roster they put over 85 sends its lowest players to the portal (`overCap`); with the class capped at its plan that's rare.
- **Signing day** (`runSigningDay`, the `signing` stage after the portal):
  - Round 0 is the user's last chance (offers, in-homes).
  - Advancing it runs the day. First, a school whose commits no longer fit the room left under the cap (transfers took it) lets its lowest-ranked go.
  - Then staffs with room make last offers, in up to `signingRounds` (2) rounds while they still have room. Everyone open takes his best offer with room.
  - Every commit signs and joins; the rest go unsigned (FCS or JUCO).
  - Round 1 shows the class; advancing it fills the rosters with placeholder freshmen and starts the next season. A full roster short at a position lets its lowest player go at the deepest position (`makeRoomForMinimums`).
  - Pipelines fade once a cycle, at the first join.
- **Class rank:** star points summed, each later commit counting less (`classRanks`).
- **Coach growth:** recruit work (`coaching.ts seasonWork`) counts HS signings by stars, less half for targets worked hard who signed elsewhere.

### Pipelines (phase 4)
- **A coach's** (`coachPipe`): 1–2 states seeded from his id near where he came up, plus what his signings grow (`CoachProgress.pipe`). They move with him; the carousel's HIRING card shows them.
- **A program's** (`TeamState.pipe`, carried across seasons): it grows with each signee from a state and fades a quarter a year.
- **Effect:** more interest from contacts, sharper evaluations, and a small familiarity pull.

### The user's screen (`render/recruitScreen.ts`; the hub's RECRUIT button or R)
- **BOARD:** stars, national rank, hometown, your standing (RATES YOU HIGH / ON HIS LIST / LUKEWARM / NOT INTERESTED), status, and flags (O offered, V visit, H in-home).
  - The card shows the position coach's **evaluation in words**: when he'd play (WILL PLAY EARLY / NEEDS A YEAR / DEVELOPMENTAL PROJECT), his ceiling here (SPECIAL ... DEPTH PIECE), how sure the coach is (HUNCH / FAIRLY SURE / CONVINCED), and two notes. There's nothing until the staff has worked him.
  - His wants appear as contacts reveal them, along with his top schools, official visits and how the last one went.
  - Actions 1–5: OFFER, HOST VISIT (next home game, 4 a game), IN-HOME (from week 15), TOP TARGET, ADD/DROP. G: staff fill. F: hand it to the staff.
- **SEARCH:** the national class by group, filtered (R) by ALL, OPEN, IN-STATE or PIPELINE.
- **CLASS:** commits and signees, needs left, the national top 10, and your pipelines.
- **Elsewhere:** the prep page shows how many recruits visit a home game. In the signing stage, the screen is national signing day (Space runs it, then opens the portal).

### Results (`npm run season`, RECRUITING section; the same 5-season career)
The real-world references are approximate, from general knowledge, not a verified table.

| Measure | Result | Target |
| --- | --- | --- |
| Signees a team-class (T1..T5) | 18.9, 18.1, 18.3, 20.7, 22.5 (19.7 overall); 807 unsigned a class | |
| True level against the tier's generated freshmen | T1 +0.6, T2 +0.2, T3 +1.3, T4 +1.2, T5 +3.4 | within 1.5 |
| Stars by tier | T1 9% five-stars, 54% four-stars; T3 81% three-stars; T5 69% two-stars | |
| True level by stars | 5* 79.9, 4* 73.0, 3* 62.5, 2* 50.9 | |
| Top 300 committed | summer 22%, week 5 42%, week 10 61%, week 15 77% | about half by the season, 75-85% by early signing |
| Commits signing early | 81.6% (63% of the final signees) | 75-85% |
| Decommits / flips | 13.6% of commits; 238 flips a class | 10-20% |
| In-state signees | T1 19%, T2 42%, T3 58%, T4 54%, T5 44% | |
| Third-season starters | 30% of 3-stars and under start (gems); 34% of 4-5 stars don't (busts) | |
| Placeholder freshmen | 1.6 a team-offseason (was a whole class) | |
| Time | 0.31 s a sim week, whole week; a season opens about 0.5 s slower | under 0.5 s |
| Starter overall since the start, after 5 | T1 +0.8, T2 -0.8, T3 +1.2, T4 +1.8, T5 +4.2 | within 1.5 |

**After the portal moved ahead of signing day (2026-11-24):** 18.2 signees a team-class (from 19.6), 58% of them in the early period (from 63%), 1,012 unsigned a class, placeholder freshmen 1.5 a team. Signees against their tier's generated freshmen: T1 +0.6, T2 −0.4, T3 +1.3, T4 +2.2, T5 +4.7. Tier 4 and 5 sign fewer HS players (about 18 against 21–22) because portal drop-downs take their room; the late, low-level tail is what goes, so their mean rises. Starter overall by tier still holds about where it was (PORTAL.md).

### Flags
- **Since the reorder, T4 and T5 sign above their level** (+2.2, +4.7; flagged, limit 1.5), and the STAFF section's T1–T5 gap change reached +1.51 (limit 1.5; +0.93 before), likely because T5 recruiters sign fewer HS players to grow on. A smaller T4/T5 hold, or a tier lean on `portalHold`, is the next lever.
- **Tier 5 signs about 3 over its generated freshmen:** tier-5 schools land tier 4's leftovers (playing time and home pull), and their own template group goes unsigned. With the portal's drop-downs, T5 starters still rise about 4 over 5 seasons, about where phase 1 left them. Without fixing T5's market, a lower `tierShift` for tier 5 barely moves it.
- **The summer is slow at the top:** about 22% of the top 300 commit by the season, against about half in reality.
- **A user who never opens the screen** signs only the summer's commits (about 7), and placeholder freshmen fill the rest at the team's level. The season-open news says how to hand it to the staff.
- **Saves:** the cycle is about 1.25 MB of JSON while it runs; it's replaced each season. Careers grow about 3.2 MB a season, since signees get stories.
- **Not built:** NIL, the 105-man roster, hot-seat rumors denting interest midseason, high school names, and walk-on/grayshirt decisions.
