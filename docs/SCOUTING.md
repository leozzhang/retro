# Weekly prep and scouting

The prep page (PREP or O in the season hub) shows next week's opponent: a preview, their two-deep, and a scouting report from the staff with the plays the staff likes this week. Behind it, each defense now has an **identity** that the live game plays to.

Design goal: scouting should pay off without being mandatory. Identity tilts how often a defense does things. It never takes an option away, and the pre-snap shell read still works on every snap.

## Defensive identity (`src/data/identity.ts`)
`defIdentity(team)` is computed from the program and never stored (cached per team id). It's a few dials over the whole defensive playbook (13 calls: man, zones, pressures and run fronts). The full design is in [DEFENSE.md](DEFENSE.md).

- **Style:** `aggressive`, `balanced` or `soft`, carried by the program's DC (`buildStaff(team).DC.style`, [COACHES.md](COACHES.md)). He's generated with a hash-seeded pick per team id (`defStyle`; 30/40/30 by `IDENTITY.styles[].share`; the 138 teams land 35/67/36).
- **Dials:**
  - `blitz`, `man`, `twoHigh` and `box`, as log-weights on each call's traits.
  - A call's weight is its league prior × exp(Σ dial × trait). 15% of every prior is always kept.
  - Styles: aggressive +0.6 blitz, +0.3 man; soft −0.7 blitz, −0.3 man, +0.4 two-high.
  - The roster shades them: each DL point is −0.15 blitz, each CB point +0.15 man.
- **Press:** the old 35/35/20% (CB1/CB2/NB), times the style's factor, plus `cbPress` (6 points) per CB point, clamped to 5–70%.
- **The situation:**
  - third and 7+ multiplies pressure by the style's `longBlitz` and adds two-high
  - short yardage loads the box and opens the Goal Line call
  - the red zone plays tighter man
- **Tested:**
  - every call keeps its floor
  - the league plays 38–55% man and 15–30% pressure, with every shell used
  - aggressive defenses pressure more than balanced, and balanced more than soft

**Where it's read:**
- `Game.toCall`, which picks the CPU defense's call and press for each snap. In a live game the DC's in-game shift is added on top (`game/defBrain.ts`), unless DEFENSE IQ is STATIC.
- The key-play replays (`game/replay.ts`).
- The balance harness passes explicit calls, so its core rows are byte-identical.
- The drive sim and CPU-vs-CPU games don't model calls, so season results are unchanged.

## The report (`src/season/scouting.ts`)
`scoutReport(state, game, starred)` is a pure function of the season: identity, `squadFor` rosters (injuries, health, confidence), and results. The page builds it once when it opens.

Every item has a **tier**, which says how good a scout its section's coach must be to find it (`SCOUT_TIERS`):
- 1: basic film, always found
- 2: a good staff, scout 60+
- 3: an elite staff, scout 78+

Items a coach misses are counted (`+2 MORE: A SHARPER EYE WOULD FIND THEM`). The OC's and DC's tendency numbers get vaguer under 75 scout (`pctAt`). Details and the tier coverage by program are in [COACHES.md](COACHES.md).

| Coach | Items (tier) |
| --- | --- |
| OC: their defense | shell shares (1); pressure (5+ rushers) and man/zone shares vs FBS (1); third-and-long pressure vs FBS (2); their DC's in-game ADJUST: fast, steady or slow (2); press rate vs FBS (2); the top 3 defenders, with standouts and hot confidence (1); the weakest starter in coverage (2) |
| DC: their offense | scheme and pass share (1); QB style and run share (1); go-to target (by `TARGETS` weight × overall) and feature back (1); hot or shaky skill players (2) |
| WR coach | our X/Z/SL/TE against their CB1/CB2/NB/SS: speed gap and route running vs man coverage. The best two and the worst one (2) |
| OL coach | the best and worst pass-pro pair, pass block vs pass rush (2); a run side when one side's run block vs shed beats the other by 4+ (3) |
| QB coach | their blitz plan against our QB's poise (2) |
| Trainer | their starters out (and who replaces them) (1); starters under 90% health (2) |
| ST coach | the kicker's power and accuracy (1); the returner's speed, flagged at 92+ (2) |

**The DC report counts through weekly emphases.** You don't play defense live, but the defensive coaches' emphases play in the CPU's simulated drives, and pass rush or stop the run is worth more against the right offense ([COACHES.md](COACHES.md)). The DC section's note lists their ideas.

### Staff picks
`playTraits(play)` reads each play's data with no hand tags:
- `quick`: every route 8 yd or shorter
- `screen`
- `deep`: a route 25 yd or longer
- `manBeater`: a slant, drag or cross
- `zoneBeater`: a hitch, curl, in or seam
- `runInside` / `runOutside`: stretch, toss, sweep and option count as outside
- `pa`, `rpo`

Rules weight traits from the tendencies and matchups:

| When | Trait favored | Weight |
| --- | --- | --- |
| Pressure 6+ points over FBS | quick, screen | 2 each |
| Two-high 6+ points over FBS | inside run | 2 |
| Single-high 6+ points over FBS | deep | 1.5 |
| Man 6+ points under FBS (a zone team) | zone beaters | 1.5 |
| Press 42%+ | man beaters | 2 |
| Pressure 6+ points under FBS | play action | 1.5 |
| Cushions (press 25% or less) | quick | 1.5 |
| A receiver with a 5+ speed edge | deep | 2 |
| A receiver with a 6+ route edge | man beaters | 1 |
| A run side | inside run | 1 |
| Always (so quiet weeks fill the list) | quick, inside run | 0.4, 0.3 |

Picks are the top five, with starred plays +0.5 among equals, short-yardage plays left out, and at most two per reason. Clicking a pick's star adds it to the call screen's STARRED chip.

**A rule fires only if its read was found:** press and cushions need the OC's tier 2, the speed and route edges the WR coach's tier 2, and the run side the OL coach's tier 3.

## Hooks for later
- **Built** ([COACHES.md](COACHES.md)): staff quality hides tiers and blurs percentages, position coaches' weekly emphases, and the DC owns the style.
- **A coaching hire changes a program's defensive identity** (the carousel; `defIdentity` will need the season state).
- **Self-scouting:** observed tendencies from live games (the calls you actually saw) next to the staff's read.
- **Film study** for the opposing DC (your tendencies from past live games as his pregame prior): [DEFENSE.md](DEFENSE.md).
