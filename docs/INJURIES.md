# Health and injuries

Players have a **health** from 0 to 100. Games can lower it a little (a knock) or take a player out for weeks (an injury). Both are rolled **after each game**, from that game's grades, and the same way for the user's live games and simulated games. Mid-game injuries in live games wait until the game supports roster changes mid-game.

- Code: `src/season/injuries.ts` (the `INJURY` tuning block).
- Contact load: `HITS` and `ROTATION_HURT` in `src/season/grades.ts`.
- Effect on the field and staff rest: `HEALTH` in `src/data/depth.ts`.
- Season report: the INJURIES section of `npm run season`.

## The setting
Injury frequency is picked on the title screen (**I** cycles it) before a new season starts. It's saved as `SeasonConfig.injuries`.
- **NORMAL** (the default) is about 55% of real FBS injury rates.
- **LIGHT** is half of NORMAL.
- **OFF** turns off knocks and injuries entirely.

## How it works
1. **Exposure.** Every snap a player plays adds risk at his role's rate (`INJURY.snap`). Contact he takes adds more (`INJURY.hit` times his hits):
   - carries and catches, which get him tackled;
   - tackles he makes;
   - sacks taken, and lightly, sacks made.

   The grader already decides who is on the field each snap and who carried, caught or tackled (`GameGrade.snaps` and `hits`). So a pocket QB's risk comes mostly from sacks, while a running QB or a feature back takes far more.
2. **Injury.** The chance is `1 - exp(-risk · hurt · setting)`. `hurt = 1 + hurtRisk·(100 - health)/100`, so playing banged up is riskier (×1.45 at 70 health). Weeks out come from `INJURY.weeks` (1 week 36%, 2 weeks 22%, 3–4 weeks 20%, 5–8 weeks 12%, the season 10%). The injury type label is drawn by severity.
3. **Knock.** If he isn't injured, a knock happens at `knock` (14) times the injury risk. It costs 10–30 health, and he keeps playing.
4. **Healing**, in the `results` step before the week's new injuries:
   - weeks out count down, so "OUT 1 WEEK" misses exactly the next game;
   - health comes back +12 a week, or +25 if he didn't play, so resting him helps;
   - a player back from an injury returns at 85 health.

   A new season starts everyone healthy.

## What health does
- **`fitRatings`** lowers his ratings by 0.2 per point of health lost on speed, acceleration, strength and stamina, and 0.08 on everything else. At 75 health that's −5 and −2, about −3 overall.
- These ratings feed the live sim (`onField`), the team ratings (and through them the CPU game sim), and the grades. The card's ratings and progression use his own ratings.
- **The staff rest hurt starters.** `slotScore` takes off another `restPenalty` (4) below `restBelow` (80) health, so a hurt starter sits when his backup is close. An elite starter over a weak backup keeps playing.
  - This applies to CPU teams and to a delegated user depth chart.
  - The user's own chart is never reshuffled; they rest players by dragging.
- **Rotation.** A banged-up starter's backup takes an extra 0.5% of his snaps per point of health lost (+15% at 70 health), so he gets less exposure.
- **Team page.** Banged-up players show their health % in orange. The injured drop to an **INJURED: OUT** section below the depth list, showing weeks out (`3W`, `SZN`); they can't be dragged. They keep their place in the order for when they come back.

## Real numbers
- **NCAA Injury Surveillance Program, 2014–19** ([PMC8293875](https://pmc.ncbi.nlm.nih.gov/articles/PMC8293875)):
  - 37.3 injuries per 1000 athlete-exposures in games, 5.8 in practice;
  - 38% of game injuries cost time, and 36% of those cost 10 or more days;
  - player contact causes 63% of game injuries (tackling 20%, being tackled 14%).
- **Share of injuries by position** (same source): DB 17.8%, OL 15.6%, DL 15.4%, LB 11.7%, WR 11.2%, RB 10.2%, QB 3.7%, K/P 1.0%.
- **Time-loss split** in the NCAA ISP hand and wrist study ([PMC6444788](https://pmc.ncbi.nlm.nih.gov/articles/PMC6444788)): most injuries cost under a week, and 2.5% were season-ending.
- **Starts lost to injury:** a typical FBS team loses about 18–20 a season. Phil Steele's yearly lists treat 5 or fewer as low and 34 or more as high ([philsteele.com](https://philsteele.com/2020-starts-lost-to-injury/)).
- **QBs:** only about 38% of programs started the same QB in every game in 2015, though that includes benchings.

## Targets and current results
Per team-season, from 5 simulated seasons:

| | NORMAL target | NORMAL sim | LIGHT target | LIGHT sim |
|---|---|---|---|---|
| Injuries that cost a game | | 5.6 | | 2.8 |
| Players who missed a game | ~4–5 | 4.8 | ~2–3 | 2.4 |
| Starter-games lost (real ≈ 18–20) | 10–12 | 10.4 | 5–6.5 | 5.2 |
| Season-ending injuries | 0.3–0.7 | 0.58 | 0.15–0.35 | 0.29 |
| Starting QB misses no games | 75–85% | 82% | 85–95% | 90% |
| Starting QB misses 3+ games | ~8% | 5.7% | | 3.3% |
| Starters banged up (under 90) on a week | 10–20% | 12% | | 6% |

On NORMAL, injuries by position come out at DB 19.1%, OL 17.7%, DL 16.1%, LB 12.8%, WR 11.7%, RB 11.7%, TE 5.4%, QB 4.3% and K/P 1.2%. Each is within 2 points of the ISP share.

Injuries cost starters snaps, so starters gain about 8% less progression over a season (mean 1.58 → 1.45) and backups gain more.
