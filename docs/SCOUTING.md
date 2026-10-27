# Weekly prep and scouting

The prep page (PREP or O in the season hub) shows next week's opponent: a preview, their two-deep, and a scouting report from the staff with the plays the staff likes this week. Behind it, each defense now has an **identity** that the live game plays to.

Design goal: scouting should pay off without being mandatory. Identity tilts how often a defense does things. It never takes an option away, and the pre-snap shell read still works on every snap.

## Defensive identity (`src/data/identity.ts`)
`defIdentity(team)` is computed from the program and never stored (cached per team id).

- **Style:** `aggressive`, `balanced` or `soft`, carried by the program's DC (`buildStaff(team).DC.style`, [COACHES.md](COACHES.md)). He's generated with a hash-seeded pick per team id (`defStyle`; 30/40/30 by `IDENTITY.styles[].share`; the 138 teams land 35/67/36).
- **Call mix:** weights for each `DEF_CALLS` id.

  | Style | 2 Man Under | Cover 1 Robber | Cover 0 Blitz | Press × | 3rd & 7+ Cover 0 × |
  | --- | --- | --- | --- | --- | --- |
  | aggressive | 32% | 38% | 30% | 1.3 | 1.6 |
  | balanced | 40% | 40% | 20% | 1.0 | 1.2 |
  | soft | 50% | 40% | 10% | 0.6 | 0.7 |

  The roster shades it through `profile.units`. Each point of DL trades `dlBlitz` (3 points) of Cover 0 for 2 Man, since a front that gets home with four doesn't need to send six. Each point of CB trades `cbMan` (3 points) of 2 Man for Cover 1.
- **Press:** the old 35/35/20% (CB1/CB2/NB), times the style's factor, plus `cbPress` (6 points) per CB point, clamped to 5–70%.
- **Third and long** (3rd or 4th and `longToGo` = 7+): Cover 0 is multiplied by `longBlitz`, then the mix is renormalized.
- **Guarantees, both tested:**
  - every call is used at least `floor` (8%) of the time, third and long included
  - the league mean is within 2 points of the old fixed weights (measured: 40.8 / 39.6 / 19.6)

**Where it's read:** only `Game.toCall`, which picks the CPU defense's call (`pickDefCall(rng, situationMix(...))`) and its press for each snap. It uses the same number of random draws as before.
- The balance harness passes explicit calls, so `balance.txt` is byte-identical.
- The drive sim and CPU-vs-CPU games don't model calls, so season results are unchanged too.

## The report (`src/season/scouting.ts`)
`scoutReport(state, game, starred)` is a pure function of the season: identity, `squadFor` rosters (injuries, health, confidence), and results. The page builds it once when it opens.

Every item has a **tier**, which says how good a scout its section's coach must be to find it (`SCOUT_TIERS`):
- 1: basic film, always found
- 2: a good staff, scout 60+
- 3: an elite staff, scout 78+

Items a coach misses are counted (`+2 MORE: A SHARPER EYE WOULD FIND THEM`). The OC's and DC's tendency numbers get vaguer under 75 scout (`pctAt`). Details and the tier coverage by program are in [COACHES.md](COACHES.md).

| Coach | Items (tier) |
| --- | --- |
| OC: their defense | shell shares and zero-blitz rate vs FBS (1); third-and-long zero rate vs FBS (2); press rate vs FBS (2); the top 3 defenders, with standouts and hot confidence (1); the weakest starter in coverage (2) |
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
- `runInside` / `runOutside`: stretch, toss, sweep and option count as outside
- `pa`, `rpo`

Rules weight traits from the tendencies and matchups:

| When | Trait favored | Weight |
| --- | --- | --- |
| Zero blitz 25%+ | quick, screen | 2 each |
| Two-high 45%+ | inside run | 2 |
| Single-high 42%+ | deep | 1.5 |
| Press 42%+ | man beaters | 2 |
| Zero blitz 12% or less | play action | 1.5 |
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
