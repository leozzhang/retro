# Coaching progression and the carousel: plan

_Agreed design (2026-10-30). Steps 1–7 are built; what's left is under Later, plus former players as GAs (waits on graduation). The system as built is in [COACHES.md](COACHES.md)._

## Goal
- Coaches change over time. Some get better, some stall, some fade, and you can't tell which from a glance.
- Coaches leave: other schools poach them, they retire, CPU head coaches get fired, and every opening sets off a chain of hires.
- The user hires in the offseason without seeing true ratings. Candidates show reputation; interviews reveal more.
- Coaches matter league-wide **without recalibrating progression**: their effects are relative to the league mean (§4).

## 1. Foundation (built)
- **A coach's id is his for life:** `<team>-<role>`, the staff he was generated on. `generatedCoach(id)` (`data/coaches.ts`) rebuilds him from it.
- **Chairs:** `TeamState.staff` maps a role to the coach sitting in it, when that isn't the generated coach.
- **Changes:** `SeasonState.coaches` holds each coach's changes by id (`CoachProgress.d`, rating changes) and goes wherever he does.
- **`staffFor`** (`season/world.ts`) lays both over the generated staff. Coaches age a year each season. With no changes it returns the generated staff itself.
- **History:** coach careers (`SeasonState.coachCareers`, `season/coaching.ts`) get a row per finished season: team, chair, ratings and the team's record. Nothing in the sim reads them.
- **Not yet:** `defIdentity` still reads the generated DC (`buildStaff`). It has to read the season's staff once a DC can change.

## 2. Progression (offseason, built)
A rating changes each offseason by **arc × age × work**:
- **Arc** (hidden, seeded from the id): riser, steady, plateaued, late bloomer, fading. It sets the rate and the ceiling.
- **Age curve, by rating:**
  - RECRUIT peaks young.
  - GAME peaks in his mid-40s to mid-50s.
  - SCOUT keeps rising.
  - TEACH peaks in the middle years.
- **Learning by doing:**
  - TEACH grows from his group's level-ups.
  - GAME grows from games coached on an emphasis.
  - SCOUT grows from reads that came true.
  - RECRUIT grows from portal wins.

  The arc sets how far the work can take him.
- **Comfort:** after about 5 years in one chair, growth slows. A move or a promotion restarts it, with a small bump.
- **Mentors:** a coach under a strong coordinator or head coach grows a little faster. Every coach keeps a lineage (who he worked under), which is what coaching trees are made from.
- **As built:** SCOUT's "reads that came true" is wins over the pregame odds, since checking each report item against the game would mean building every team's report every week. Mentors are the coordinators for now; head coaches join in step 3. The numbers are in [COACHES.md](COACHES.md).

## 3. Head coaches (built)
Every program gets a head coach; the user is his own team's. Each rating has a job:
- **DEVELOP:** part of the program's development multiplier (§4).
- **RECRUIT:** scales the head coach's calls and visits in the portal.
- **EVAL:** how well he hires. A high-EVAL head coach bids on a candidate's true ratings, a low-EVAL one on reputation. The user's EVAL sets how blurred candidates look.

Age, reputation, motive and job security (`expectedWins` from `season/coach.ts`) drive firings, poaching and retirement. There's no game-day rating, since the drive sim would need a recalibration.
- **As built:**
  - Head coaches, security, firings, retirements and a new head coach's housecleaning all work. Openings are filled from outside FBS (`candidatesFor`), picked by EVAL; those candidates stay in the step-4 pool.
  - DEVELOP is wired now: the head coach's half of §4, measured against his tier, not the league, so the tiers stay calibrated. RECRUIT is measured against the tier too.
  - **Reputation and motives move to step 4,** where the market reads them. Outside candidates already carry a reputation (worth plus noise).
  - New DCs keep the program's style, so `defIdentity` waits for DCs bringing their own.
  - The numbers are in [COACHES.md](COACHES.md).

## 4. League impact, zero-mean (built)
- **Multiplier:** a program's development multiplier is `1 + k·(staff TEACH plus head coach DEVELOP, minus the mean)` (built against the tier's mean: the head coach's DEVELOP for the program, and each position coach's TEACH for his own group), recomputed each season. The league's average XP stays the same, so the PROGRESSION.md growth table holds, but a good hire still lifts a weak program over a season or two.
- **Check:** the mean multiplier is about 1.00, and the per-position growth table doesn't move.

## 5. Reputation and motives (built with step 4)
- **Reputation (public):** built from what the world sees: his unit's rank, breakouts and awards in his room, wins, portal hauls. It lags reality. The market bids on reputation, so overrated coaches get poached and underrated ones are the finds.
- **Motives (hidden, seeded):**
  - climber: wants the next title up
  - lifer: rarely leaves
  - mercenary: follows the money
  - homebody: stays in his region
  - loyalist: follows his head coach, the user included in coach career mode
  - winner: wants a contender

## 6. The carousel (a new offseason stage before the portal, built)
1. **Firings and retirements.** CPU head coaches are judged against expected wins. Retirement comes from age and burnout, plus a "go out on top" chance after a big year.
2. **The head-coach chain.** Openings fill in order of program appeal. A hire empties another chair, and each link makes the news.
3. **Assistant rounds.** Every team fills its open chairs, using portal-style appeal: role, winning, region, and the head coach's job security (a hot-seat head coach can't land good assistants).
4. **The user's side:**
   - Candidates show reputation and résumé rows; true ratings are blurred by the user's EVAL.
   - A few interview slots per opening each sharpen a rating or reveal a motive.
   - A delegate flag hands hiring to staff.
5. **Players react.** When a player's position coach leaves, his morale drops and his odds of entering the portal rise. That's why the carousel runs before the portal.

**As built:**
- Reputation lags, motives are hidden until an interview, and the chain runs from FBS head coaches, coordinators, coaches out of a job and outside candidates. The 5 assistant rounds use claimed offers. The user hires with fog and interviews, can fire an assistant to open a chair, and can delegate.
- **Money is prestige:** the mercenary's money is the program's prestige, since there are no budgets.
- **Loyalists:** they follow CPU head coaches who move. The user can't change jobs yet.
- **Not built:** the scheme-fit meter, and a DC bringing his own style.
- **Players reacting** (step 5) is built: bond from seasons together, a morale hit, portal entry odds, and following the coach to his new school. A beloved coach staying gives no bump yet.
- The numbers are in [COACHES.md](COACHES.md).

## 7. Pipeline and trees (built, but former players as GAs)
- **GA slots:** cheap young coaches, riser-heavy, promoted from within.
- **Former players as GAs:** a graduating player can be offered a GA spot, and his career page continues as a coach. This waits on graduation; it's a stub until class years move.
- **Tree news and a tree score** for the user's legacy.

## Later
- Retention tools: raises, title bumps, promises.
- Specializations.
- Staff chemistry.
- Bowl-week interims.
- Retired coaches back as analysts.
- DC philosophy drift.

## Checks
- `npm run season` gets a STAFF section covering:
  - rating drift by arc and tier
  - head coach changes a year (FBS: about 20–25)
  - assistant turnover (about 30–40% a year)
  - flows between tiers
  - the T1–T5 staff gap holding steady over 5 seasons
- `npm test`: determinism, a save mid-carousel continuing identically, staffs always full, nobody on two staffs.
- `npm run balance`: byte-identical.
