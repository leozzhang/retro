# Pass rush and protection

All of it is in `sim/passPro.ts`. It applies only to plays that pass-block (`protecting`). Designed runs, a draw's fake pass set and screens (the line lets the rush go) keep the old rules, so the run game and the screen game are untouched.

## How it works in football
- **The pocket is a cup.**
  - The tackles kick-slide back for depth and stay inside-out on the edge rushers. They ride them around the QB's launch point.
  - The guards and center set short and firm: the front wall.
  - Edge pressure is beaten by stepping up; interior push collapses the cup from the front.
- **Rushers have roles from where they line up.**
  - The widest rusher on each side is the edge. That can be a 4-3 end, a 3-4 outside backer in a wide 9, or a blitzing backer or nickel when the end drops (a fire zone).
  - Inside, a 1-technique works the A gap and a 3-technique the B gap. Rushers keep their lanes so the QB has no gap to escape through.
- **Every rusher has a plan.** A primary move plus counters: speed to the top of the tackle's set and bend; power (bull or long arm) through his chest; an inside counter when the tackle oversets. Inside, a bull rush or a quick swim or rip.
- **Line games (stunts).** One rusher (the penetrator) crashes across a blocker's face to pick the next blocker; another (the looper) jabs, then loops behind him into the gap he left.
  - TE: the tackle crashes, the end loops inside.
  - ET: the end crashes, the tackle loops out.
  - TT: the two tackles exchange.
  - SIS charting has TE on about 13% of pass plays, and ET and TT about 6% each.
- **The line calls a protection.** The center makes the call and IDs the threats.
  - Slide is zone: each blocker owns a gap.
  - Man ("big on big", BOB): linemen take linemen, backs take backers.
  - Half slide mixes them: the slide side is zone, the other side man, and the back takes the man side.
  - Zone passes games off by leverage and communication. Man follows the crasher and gets picked, unless the line communicates the switch.
- **Blocks wear down; they don't hold.** Rushers keep working toward the QB all the way through the rep. Even a much better blocker slows and steers his man rather than freezing him.
  - ESPN credits a blocker with a pass block "win" if he holds for 2.5 s (about the average time to throw). Tackles win about 79–90% of reps by that measure.
  - Average time to pressure is about 2.9 s (Next Gen Stats).

Sources:
- Linemen and the pocket: [Glazier Clinics: vertical sets](https://www.glazierclinics.com/football-coach-resources/protect-your-qb-with-vertical-set-technique-for-tackles), [ITP: vertical set](https://scoutingacademy.com/itp-glossary-vertical-set/), [NFL.com: NFL pass protections](https://amp.nfl.com/news/more-than-just-a-pocket-inside-look-at-nfl-pass-protections-0ap3000000796282), [PFF: DL techniques](https://www.pff.com/news/pro-defensive-line-techniques-the-2017-prototypes)
- Rush plans: [USA Football: rush plans](https://blogs.usafootball.com/blog/1425/4-key-components-to-a-pass-rush-plan), [Jay Arnold: rushing the passer](https://jayarnold.substack.com/p/the-beginners-guide-to-rushing-the)
- Games: [SIS pass rush charting](https://www.sportsinfosolutions.com/?p=10090), [Surma & Wiley: stunt busters](https://msurma51.github.io/stunt-busters), [Scouting Academy: passing off twists](https://scoutingacademy.com/glossary-entry-passing-off-twist-games/)
- Protection calls: [Eleven Warriors: pass protection](https://www.elevenwarriors.com/forum/college-sports/2019/10/107387/intro-to-pass-protection-for-us-junkies), [half slide](https://queerfootballbreakdowns.substack.com/p/half-slide-protection-review-and), [PFF: attacking five-man protections](https://www.pff.com/news/nfl-how-nfl-defenses-attacked-five-man-protections-2021)
- Win rates and pressure: [ESPN: win rates explained](https://global.espn.com/nfl/story/_/id/24892208/creating-better-nfl-pass-blocking-pass-rushing-stats-analytics-explainer-faq-how-work), [NFL Next Gen Stats: pressure](https://www.nfl.com/news/next-gen-stats-introduction-to-pressure-probability), [PFF: FBS pressure rate](https://www.pff.com/news/college-football-8-best-returning-pass-rushers-for-the-2026-season)

## The model
### Rush roles (`assignRushRoles`, at the snap)
- **Roles:** every called rusher gets a `RushRole` on `Player.rushRole`.
  - The widest rusher on each side past `RUSH.edgeFrom` (outside the guard) is the edge, any position.
  - The rest: the A gap inside `aFrom`, otherwise the B gap. Linemen choose first, then blitzers take what's left on their side.
  - Hug rushers (a man defender whose man stayed in to block) have no role and rush as before.
- **Plans:** each rusher rolls a plan from his ratings (`PLAN`, one draw per rusher).
  - Edge: `power` with odds from `str` against `spd`/`acc` (halved from a wide 9, more head-up on the tackle); otherwise `speed`, and `counter` for a share of the speed rushers.
  - Inside: `bull` from `str` against `acc`, otherwise `quick`.
- **Paths (`rusherAim`):**
  - The edge runs to a landmark (`RUSH.arcWidth`, wider from a wide 9) level with the QB's upfield shoulder, then turns at him within `bendAt` (sooner with `acc`).
  - Where he turns depends on the block (`TURN`). A free or winning rusher aims at the near shoulder; a tackle in control keeps him wide and deep. Past `pastAngle` around the QB he comes straight back at him.
  - Power aims through the tackle at the QB.
  - Interior rushers go through their gap until within `laneClose`.

### Line games (`DefTags.game`, `GAME`)
- `applyGame` turns two rushers on the call's side into a crasher and a looper.
- The crasher slants across his blocker's face for `crashFor` s, to `crashTo` (the tackle's inside shoulder) on a TE. He keeps `crashGive` of his speed even when blocked, so he drags the man on him.
- The looper jabs for `delay` s, then loops behind for `loopFor` s to the vacated gap, slippery on the way (`loopGive`).
- A man blocker the crasher runs into is picked (stunned `pick` s) with odds `pickOdds` + `pickPer` × (75 − pbk). Otherwise he saw it coming.
- The CPU DC runs a game on `IDENTITY.games.rate` of its 4-man rushes, × its style (`pickLineGame`, in `Game.toCall`). See DEFENSE.md.

### The protection call (`callProtection`, `PROT`)
- The center counts threats each side: linemen, plus anyone walked up within `threatDepth` of the LOS and `boxWidth` of the ball.
- **The call:**
  - With a back in protection: a half slide toward the side with more threats (a tie slides away from the back). The center and the slide side zone their gaps, the other side mans up, and the back takes the man side's blitzers.
  - Five-man: man (big on big), the center spare for a blitzer; a play's `scheme.slide` forces a full slide (the far edge is the QB's).
  - A play's `scheme.slide` forces its side.
- **Zone blockers (`zoneMark`, from `protectStep`):**
  - A rusher belongs to the zone gap he's nearest, looking 0.3 s ahead. Only threats within `threatDepth` count, nearer the line likelier (`depthCost`), so a deep safety doesn't pull a blocker off the tackle in front of him.
  - When a man crosses into another gap, the blocker passes him off after a recognition beat (`passOffMax` → `passOffMin` with `pbk` and `acc`). A new threat never pulls a blocker off a man who's still in his gap.
  - Re-sorting only happens in the first `window` s; after that everyone stays on his man.
- **Man blockers** keep their man. A lineman with nobody helps within `spareReach` of his spot. On his own man in the pocket, a blocker engages from `engage` yards.

### Pass sets (`passSet`, `PASS_PRO`)
- The tackle on an edge kick-slides a half-man deeper than his rusher on his inside shoulder, faster with `pbk`, no deeper than `tackleDepth`, and no closer than `floor` to the QB.
- Interior blockers set short in front of their man's gap (within `gapStep` of their spot) and mirror him once he's within `mirrorFrom`. Mirroring a backer out in space would open the gap he cuts back to.
- Nobody sets upfield of his stance, and each eases into his spot over the last `arrive` yards.
- A setting lineman faces upfield (`Player.faceLock`).

### The rep (`passEngagement`, `REP`)
A pass block's control (`Player.blockControl`) starts at 1 at contact (`startRep`). At 0 the rusher is off it (`shed`).
- **`pace` scales everything below.** It's the one dial for how long blocks last.
- **Drain:** control drains `base` + `perPt` × (power + the rep's roll) a second.
  - Power is rsh·0.7 + spd·0.3 − the pass-block value.
  - The roll is rolled at contact, sd `rollSd`. Some reps are lost early; most hold a long time.
  - The sum is capped at ±`edgeCap`, and the drain never drops below `minDrain`. It's divided by blockers^1.5.
  - A speed rusher at the top of the arc drains it faster with `acc` (`bend`).
- **Moves:** every `moveEvery` s (sooner with `acc`) the rusher tries a move, with odds from `rsh` against `pbk`.
  - A win takes `moveHit` off (× `quick` inside).
  - A loss stalls him `stall` s.
  - A counter ready fires when his tackle oversets: `counterHit` off, and his lane becomes the B gap.
- **Motion:** the rusher always drives at his aim point at `drive` × top speed (bull and power: more with `str`).
  - `floor` + (1 − floor) × (1 − control) of that gets through. Nobody parks a rusher; the blocker slows and steers him.
  - Inside, the floor (`floorIn`) builds over `pushRamp` s, so the wall is firm off the snap.
  - An edge running up the arc keeps `edgeRun`: the tackle runs with him and fights the turn, not the depth.
  - A tackle in control (above `rideFrom`) rides a speed rusher around behind the QB (`ride`).

### The QB and what you see
- **Step-up (`POCKET`, `pocketSpot`):** a QB nobody's steering steps up `stepUp` yards once an edge is `climbAngle` around him and the spot in front is clear. That covers the user off the keys, the harness and the replay autopilot.
- **Legs (`BLOCK_STEP`, `render/sprites.ts`):** blockers and rushers on a moving block step with the `fight1`/`fight2` and `drive1`/`drive2` frames. A lineman in his pass set shuffles (`set0`–`set2`, hands up) and faces upfield.
- **F1 overlay:**
  - a line through the five linemen
  - each rusher's role and plan (E, A or B: SPEED, POWER, COUNTER (! once used), BULL, QUICK, CRASH, LOOP), the edge's angle around the QB (or PAST), and his block's control
  - each lineman's job: Z (zone) or M (man), with `>` during a pass-off

## Ratings
- **Rusher:**
  - `rsh` is 70% of his power (how fast blocks wear down) and wins his moves.
  - `spd` is 30% of it, his speed up the arc, and the odds he speed rushes.
  - `acc` is his bend (turning sooner, faster at the top of the arc) and how often he tries a move.
  - `str` is his odds of a power or bull rush, and how hard it drives.
- **Blocker:**
  - `pbk` is his side of the rep, his kick slide, his pass-off speed, and not getting picked.
  - `acc` is his pass-off and getting to his set.

## Targets and what the harness shows
See the measured numbers in PROGRESS.md (2026-11-11, round 2). The POCKET and STUNT rows of `npm run balance` measure dropbacks the QB never throws, against the core calls, Fire Zone and Bear, and each game on each side against 2 Man Under. Calibrated to keep the pass rows' sacks where they were before this model: sacks before 3.2 s on a 4-man rush within noise of round 1.

## Later
- The CPU QB doesn't slide in the pocket or escape; he only steps up. The harness turns nearly every early win into a sack, so `pace` sits where tackles win a bit more than real tackles do (about 94% at 2.5 s against 79–90%). A QB who reacts to pressure would let `pace` come up toward real win rates.
- No DC line yet for games (DEFENSE.md's lines come from the brain's tags), and the scouting report doesn't mention them.
- Protections by play (max protect, chips, an RB scanning the backers) and the user choosing a protection.
- The DL pass-rush ratings still come out slightly negative for the defense in yards per play in `npm run ratings`, as they did before this model (flagged, not tuned).
