# Kicking: punts and kickoffs

You call the kick; the kicker kicks it. On punts and kickoffs you pick the type, and the CPU kicker (`game/cpuKicker.ts`) aims it, stops the timing meter and strikes it with his own `kpw` and `kac`. The rush, the wind and his misses do the rest inside `KickPlay`. Field goals and extra points stay yours (drag, loft, meter).

The CPU's punts and kickoffs to you are played live too. The CPU's special-teams coach makes its call (`kickoffCall`, `puntCall`), and the return team's look is picked by situation (`returnCall`). The AI plays both sides, on a mirrored camera.

## The research behind it (NCAA rules)

- **Kickoffs:**
  - From the 35. A touchback comes out to the 25, and since 2018 so does a fair catch inside the 25. Out of bounds puts the ball at the receivers' 35.
  - A kickoff is a free kick: the kicking team may recover it once it has gone 10 yards, or once a receiver has touched it.
- **Onside kicks:** recovered about 8–13% of the time when the receivers expect one, and roughly 50–60% on a true surprise. After a failure the receivers start short.
- **Punts:**
  - The spiral gives distance and hang.
  - The rugby (rollout) punt is end-over-end: it is hard to block on the move, hard to field, rolls, and gives the punter a run option. It travels less in the air.
  - The pooch (backspin) and the coffin corner pin a team deep. The coffin corner is the high-variance one: off by a few degrees, it's a 20-something-yard punt or a touchback.
  - The line drive cheats a headwind but outkicks its coverage.
- **FBS reference rates:** gross punt about 42–44 yards, net about 38–40, about 40% fair caught, punt returns 8–9 yards; kickoff returns about 21 yards.

## The calls (`data/specialTeams.ts`, `KickDef.aim`)

| Call | The kicker's aim | Wins when | Costs |
|---|---|---|---|
| **Punt** | Spiral, all his leg, middle | The default | Gets returned |
| **Directional** | To the numbers on the short side (`cap` 0.98) | An elite returner, backed up | About 3 yards of distance |
| **Rugby** | Rolls out, kicks on the move, end-over-end; short 4th: the run option | A block look; 4th and 1 against a return look (the run, +0.5 EP) | Less air, so returned more |
| **Line drive** | Low and hard, rolls | A strong headwind | Little hang, longer returns |
| **Pooch** | High with backspin to their 14 | Their 35–45 | Fair caught near the 12 if it's short |
| **Coffin corner** | Just out of bounds at their 8 | Their 35–45, protecting a lead | A touchback (about 12%) or out at the 15; from deep it's just an out-of-bounds punt |
| **Deep** | Max power at the goal line | A big leg or a tailwind (touchback); with a weak leg against an elite returner, no big return | A weak leg or a headwind: a return |
| **Corner** | High to the numbers at their 7, coverage overloaded | The best mean start with most legs | Out of bounds (the 35) in a crosswind or with low accuracy |
| **Squib** | Low skipper at their 22, bad hops to gather (`gather`) | Takes the returner out of it | About their 38: the worst mean start |
| **Sky** | A pop-up on the up-backs at their 30; cover men go to the ball (`contested`) | Protecting a lead with a weak leg against an elite returner: almost no return yards | Fair caught at their 30 |
| **Onside** | A hop to the overload side (`KICKOFF_ONSIDE`), recoverable at 10 yards | They aren't expecting it: about 50% | The hands team: about 15%; failed, they start near your 45 |

On the call screen each punt and kickoff card shows:
- A forecast for this kicker in this wind (`forecast`: 30 ball-flight samples): where it lands, the hang time, and the touchback, out-of-bounds and inside-20 odds.
- What the call is for and what it risks.
- The ST coach's pick (`kickCall`).

The receivers' look shows on the call screen and the field: RETURN, PUNT BLOCK, SAFE or HANDS TEAM.

## The looks (`ReturnScheme`, `returnCall`)

- **Punt return** (`PUNT_RETURN`): four rush, two hold up the line and peel back, jams on the gunners, a wall.
- **Punt block** (`PUNT_BLOCK`): nine come, one more than the shield blocks. Blocks (about 7.5% on a spiral), pressure, shanks and roughing flags; the gunners run free, so returns are short. The rugby punter rolls away from it.
- **Safe** (`PUNT_SAFE`): nobody rushes and the front holds up, which takes away the rugby run. The CPU shows it on a short 4th near midfield (`safeShare`).
- **Hands team** (`KICKOFF_HANDS`): the sure hands up close, one deep. The CPU shows it when it expects an onside kick (late, behind by 16 or less), and more after each onside kick you've tried this game (`handsAlert`).

## Events (all rolled on the kick play's stream; no new ratings)

- **Shank** (`SHANK`, `sim/kicking.ts`): the odds rise with low `kac`, the rush's pressure and the wind (about 1.5–3% at 75), and a shank costs line and power. Not on field goals or extra points.
- **The CPU's timing:** the needle stop's spread scales with `kac` (`CPU_KICK.timing`), so a mistimed strike still pulls or pushes.
- **Bad snap** (`BAD_SNAP`): about 1.8% of punts. The punter fields it by `cth` or bobbles it, and the delay feeds the rush.
- **Roughing or running into the kicker** (`ROUGH`): a free rusher on him at the kick. The kicking team takes running into (5 yards) only if it makes the line to gain, and always takes roughing (15 yards and a first down). It shows up most against the block look.
- **The onside scrum** (`ONSIDE`): the return team, unless it's the hands team, reacts `lag` seconds late and can lose the hop (`muff`). A loose ball both sides reach goes by closeness, `cth` and `str`.
- **The rugby run option** (`RUGBY`): on 4th and 3 or less, once he's outside the end of the line, he runs `odds` of the time if nobody free is in the alley to the line to gain. Men peeling back to block for the return don't count, and they take `react` seconds to turn around. Results against a return look: on 4th and 1, about a quarter of the time with 85% converted; on 4th and 3, 40% converted. It never runs against the block or safe look.
- **Returner confidence:** a fast, elusive returner waits longer before he fair catches (`FAIR_CATCH_TRUST`).
- **Already there:** muffs (more on squibs and sky kicks), blocks, return TDs, coffin balls downed inside the 5, touchbacks off a bounce.

## Physics changes

- `PUNT_BOOST` 1.05: a punter's drop and full swing. Gross punts went from 38 to 43 yards.
- `TEE_BOOST` 1.12 → 1.14: a 75 leg's deep kick is a touchback about half the time.
- `FAIR_CATCH_RANGE`: punts 7 → 5.4, kickoffs 11 → 9 (fair catches had been 79%). A kickoff can be fair caught anywhere; inside the 25 it comes out to the 25, and outside the 25 at the spot.
- `RETURN_BLOCK_EDGE` 15 → 30: returns had been 4 yards on punts and 17 on kickoffs.
- `CPU_KICK.puntHold` 0.65 s: the spiral punt's operation now takes about 1.9 s, so a punt block look is a real threat.

## The report: `npm run kicks` → kicks.txt

`src/kicks.ts` runs about 70 s at 160 reps. `KICKS_ONLY=id,...` limits the rows; `KICKS_REPS` sets the reps.
- **Sections:**
  - punts by spot;
  - kickoffs by leg;
  - accuracy;
  - wind;
  - the looks;
  - returners;
  - the run option;
  - BEST BY SITUATION, with each situation's goal: `ep` for field position, `safe` for the fewest return yards, 30+ returns and TDs, `keep` for getting the ball back;
  - the FBS TARGETS line;
  - FLAGS.
- Every row is scored in expected points for the kicking team: a drive start is worth -EP(start), keeping the ball EP(spot), a return TD -7.

**Last full run (2026-11-23):**
- Spiral punt: 43.0 gross, 39.8 net, 38% fair caught, 6.8-yard returns. Deep kick at leg 75: 49% touchbacks, 17.8-yard returns.
- Onside: 53% recovered on a surprise, 16% against the hands team.
- Punt block look: 7.5% of spirals blocked.
- Who wins:

  | Call | Best in |
  |---|---|
  | Directional | Own 30, backed up, elite returner |
  | Line drive | A 15 mph headwind |
  | Rugby | The block look; 4th and 1 against a return look, with the run |
  | Coffin corner | Their 40; protecting a lead |
  | Corner | Kickoffs with a 90 leg, a headwind, an elite returner |
  | Deep | A 65 leg; safe with a big leg |
  | Sky | Safe with a weak leg |
  | Onside | Getting the ball back |

- **Flags:**
  - Squib is best in no situation. Its mean start (about their 38) trails the sky kick even on safety, so it stays as the "keep it away from him" call.
  - The plain punt and the pooch are each within 0.05 EP of the winner in their spots: the default and the coffin's safer twin.

## Tuning

- `CPU_KICK`, `CPU_KICK_CALL` (`game/cpuKicker.ts`)
- `SHANK`, `PUNT_BOOST`, `TEE_BOOST` (`sim/kicking.ts`)
- `BAD_SNAP`, `RUGBY`, `ROUGH`, `ONSIDE`, `FAIR_CATCH_RANGE`, `FAIR_CATCH_TRUST`, `RETURN_BLOCK_EDGE` (`game/kickPlay.ts`)
- Each call's `aim`, `bounce`, `gather` and `contested` (`data/specialTeams.ts`)
- The report's `KICKS_REPORT` (`src/kicks.ts`)
