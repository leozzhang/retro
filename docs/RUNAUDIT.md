# Run audit: every designed run, by intent

`npm run audit` (`src/runAudit.ts`, about 40 s) runs every designed run against ten regular calls (light: 2 Man, Cover 2, Cover 3, Cover 4; heavy: Cat, Cover 3 Sky, Bear; blitz: Cover 1 Fire, Fire Zone, Cover 0), at three defense levels against a 70 offense (−10, even, +10), 30 snaps a cell. Short-yardage plays also get Goal Line, and 3rd and 1 on half the Bear and Goal snaps.
- `AUDIT_ONLY=id,...` limits the plays; `AUDIT_REPS=n` sets the snaps.
- A cell is about ±9 points of noise at 30 snaps.
- For the why behind a row: `npm run trace` and the INTENT section of `npm run runfit` (RUNGAME.md).

## What it checks
**At the snap** (on a draw, after the pass set), the blocking card against the scheme's rules:
- **IDLE:** a blocker with no job.
- **DEAD DOUBLE:** two on one, nobody climbs, while a playside box defender is free (a wasted hat).
- **WRONG SIDE:** a lead, kick or force block on a backside man.
- **FREE PLAYSIDE:** a playside box defender nobody has (shown with the box and hat counts: expected when the box outnumbers the hats).

**On the field:**
- **ON AIM:** where the carrier crossed against the gap his path is drawn to.
- **OWES:** a blocker whose man at the snap makes 20%+ of the tackles.
- **POA:** a pull, lead or kick not on a man as the ball gets 2 yd past the line.

**Then the grid:** success (4+ yd; 3rd and 1: a gain of 1+) and ypc by call and level. Each play should win against its `beats` looks and lose against its `stops` looks (PLAYBOOKS.md).

## The design by family
- **Inside zone** (Inside Zone, Trey IZ, Split Zone, Split Zone Lead, Wing Split Zone):
  - The line takes zone steps: covered linemen take their man, uncovered ones double and climb to the backers.
  - The backside cuts off.
  - The back presses the playside B gap and reads bang, bend or bounce.
  - On split zone, the TE or wing slices across on the backside end. Split Zone Lead's H leads the carrier into the hole on the playside backer.
- **Zone read** (Zone Read, Pistol, Trey, Wing, Split): inside zone with the backside end left unblocked as the read. The Wing ZR's wing bluffs the end and takes the next man; the Split ZR's H leads the give.
- **Outside zone** (Outside Zone, I-Form Stretch, Ace Wide Zone, Pistol Ace Zone):
  - The line reaches playside; the climbs are on the clock.
  - The back presses to the edge, then makes one cut. I-Form Stretch's FB takes the force player.
- **Duo** (Duo, Trey Duo, Pistol Duo, Weak I Duo, Wing Duo):
  - Gap rules, no pullers: two doubles, the playside on the 3-technique up to the MIKE, the backside guard and center on the nose up to the WILL.
  - Aim A/B; the back reads the MIKE.
- **Power** (Power, Power O, Strong I Power, Heavy Power):
  - The line blocks down; the backside guard pulls and leads on the playside backer.
  - The FB kicks out the end (Power O, Strong I, Heavy); the backside tackle hinges. Aim C.
- **Counter** (Counter GT, Trey Counter, Ace Wing Counter, Split Counter):
  - The back jabs away.
  - The backside guard kicks out the end and the tackle wraps on the backer (Split Counter: the H kicks, the guard wraps). Aim C.
  - The backside end is left to chase.
- **Iso** (Iso, Heavy Iso): the FB isolates the MIKE; gap rules; aim A/B.
- **Trap:**
  - The playside 3-technique is let in, and the backside guard traps him.
  - The center blocks back; the uncovered playside linemen release straight to the backers. Aim A/B.
- **Toss and sweep** (Toss, Lead Toss, Strong I Toss, Pin-Pull):
  - The line reaches or pins and the lead takes the force.
  - The back gets outside.
- **Draws** (Draw, Empty QB Draw): pass set for `DRAW_SET`, then the run; the receivers release to sell pass and then block.
- **QB runs:**
  - Power Read: the sweep, reading the playside end.
  - Speed Option.
  - QB Power and QB Counter: the QB behind the pullers, the back leading.
  - QB Sneak: the A gaps.

## Fixed in this pass (each one is a rule; none is tuned to a play)
- **Blitzers are blocked as down men** (`assignRunBlocks` uses the run fits' `onFront`).
  - A backer blitzing from the line is a gap to block at the snap, not a backer to climb to half a second later.
  - Before, the line left him free and doubled a down man with nobody to climb to.
- **Leads and their pickups stay playside.**
  - A lead takes a playside backer, or turns up through the hole and takes whoever shows.
  - A point-of-attack block's new man is playside before the handoff.
  - A playside TE or back doesn't cross the formation for a backside man.
  - The exception: a backer in man on the carrier follows him across (`flows`).
  - Before: QB Power's and QB Counter's guard or tackle led on the backside WLB, and Counter GT's TE took the WLB and left the force player free. Then that rule, applied to linemen too, stopped the doubles climbing to the backside backer on the counters, so linemen are exempt.
- **Receivers aren't line blockers.** A receiver in a tight slot (Empty) stalks; he's not given gap rules on a defensive tackle. Applied in the blocking, the run fits' gaps and INTENT.
- **A point-of-attack man is the puller's.**
  - After the handoff, a blocker far from his own man doesn't grab the defender a puller or lead is closing on (`POA_CLAIM`).
  - Before: Trey Counter's slot grabbed the end the guard was pulling to kick, then lost him. It flipped the play between 11% and 80% success on a 2-point rating change.
- **Climbing linemen cut off a filling backer** (`runBlock`): they step into his path to the ball. Leading where he'd be, the climber's target swung behind him and he stood still.
- **Trap's uncovered linemen release straight to the backers.**
  - Before, joining the center's double first, the playside guard was released by the combo's clock as he arrived, with his momentum going the wrong way.
  - Trap against 2 Man went from 3% to 67%.
- **A wide zone presses to the edge, then reads** (`pressEdge`). The toss and sweep keep their drawn paths.

**The level retune.** With the blocks now reaching their men, the run game rose: RUN ALL 4.6 → 5.8, GAP +5 5.3, +10 4.2. Three global dials brought it back:
- `RUN_GETOFF.perTalent` 0.1 → 0.2: a better line wins its first step more often.
- `CONTACT.breakBase` 0.3 → 0.2: fewer clean broken tackles.
- `RUN_CONTROL.base` 0.75 → 0.95: a winning defender works off his block sooner.

Measured:
- RUN ALL: 5.2 ypc, med 2.8, 10+ 12%.
- GAP −10 / 0 / +5 / +10 / +20: 7.5 / 5.3 / 3.9 / 3.4 / 2.4, all in target.
- 3rd and 1, Bear / Goal Line: Power 71% / 77%, Iso 51% / 64%, sneak 89% / 57%.
- Unchanged: PASS, PA, POCKET and STUNT (THROW and ROUTE move through the RPOs and run-action PA).
- `RUN_GAP.k` was tried at 0.65 and reverted: it steepens the offense side too.

## Second pass (2026-11-13): the open items
Each is a rule, traced on the field before it was changed (`npm run trace`, plus a probe of one defender's block, power, control and the ball's spot every 0.2 s).

**The perimeter**
- **The toss and the sweep aim at the edge** (`PERIMETER_AIM`, `Play.aimPerimeter`).
  - The hole was the drawn spot 12.5 yd out, so the back ran to the numbers behind the line, reaching it at about 2.0 s.
  - Now he goes for a spot `out` yd outside the edge (`pressEdge`), `bend` yd behind the line, and turns up: toss 1.2, the gun sweep 2.5. The sweep runs flat outside an unblocked key and the pullers.
  - The toss's 6 yd flat first step is cut (he angles from the pitch); the sweep's short step stays.
  - The toss's lead (`leadWide`) leads the new track (`aimLeads`).
- **A double team's helper gets a hand on his man** (`CLIMB.touch`, `closing`, `late`).
  - The stretch's 0.3 s clock ran from the snap, so the tackle climbed before he reached the end, and the TE reached him alone.
  - Now the clock runs from contact, and a helper still closing on a man he can block keeps going a moment longer.
- **The outermost blocker on the perimeter, uncovered, arcs for the force** (`forceMan`). Against a Bear, the TE used to help inside and leave the walked-up safety free.
- **Climbs on the perimeter work playside** (`CLIMB_BACKSIDE.perimeter`). The center used to climb to the WILL and leave the MIKE over the toss.

**Reads and QB carries**
- **Power read's key is read by depth** (`KEY_UPFIELD`).
  - The sweep crosses the QB's face toward the key, so "chasing the back" and "squeezing the QB" point the same way. Read by direction, the scripted QB gave every time.
- **Power read's guard leads the keep through the C gap** (`POA.keepInside`), and the keep aims there. He used to lead at the sweep's edge, and the keep went up the A gap.
- **A QB carrying on a designed run presses his hole** like the back presses his path (`pressPoint`). Reading lanes from 5 yd deep, the keep took the A gap into the MIKE.

**Reaction and the front**
- **On a designed run, a defender who hasn't reacted carries on with what he was doing** (`rush`). The rush used to chase the carrier, so a lineman's reaction never counted, nor the fooled key's `KEY_FOOLED`.
- **A front player past his read is already on the ball** (`reactToRun`: 0.05 s, like a fitting backer). Without this, a free backside lineman at the mesh was frozen for 0.2 s, and IZ with its backside standing down gained more.
- **The edge plays a kick-out at the line.**
  - A puller or lead back assigned to him counts from anywhere: the down block is his cue to squeeze (`runTechnique`). He used to count himself free and chase the jab.
  - Engaged, he works no deeper than his landmark and no more than `squeeze` inside it (box), instead of toward the back 5 yd deep (`engagedGoal`).
  - He brakes into his landmark (`RUN_FIT.edgeSet`) instead of running a yard past it.
  - Before: Split Counter's end met the H 2 yd deep, in the hole.
- **The hinge takes the gap first, then the end** (`HINGE_CHASE`), reading until he's engaged. Taking the first body near his spot, he used to trail the end upfield while a blitzing WILL came through the gap (Trap vs Cover 0: 3%).

**Assignments**
- **Corners aren't climb targets.** Wing Duo's tackle climbed past the MIKE to the corner pressed on the wing.
- **A back doesn't take the backer a double is climbing to.** Wing Duo's FB and LG both had the WILL.

**Play data**
- **QB Power's back kicks out the end** (`kickOut`); the guard wraps. Gun QB power's design: nobody used to kick him.

**Measured** (balance):
- RUN ALL 5.2 ypc, med 2.9.
- GAP −20 / −10 / 0 / +5 / +10 / +20: 11.2 / 7.0 / 5.9 / 3.7 / 2.7 / 1.7. Even is 0.4 over its 4.5–5.5 target; the rest are in (−20 was 16.3).
- 3rd and 1 Bear / Goal: Power 82 / 72, Heavy Power 75 / 55, Iso 47 / 62, sneak 83 / 67, QB Power 27 / 5.
- RUNFIT stuffs 8–20% (Outside Zone 32%). ABLATE: IZ backside −7.3, Counter −1.8, Duo −0.9.
- PASS, PA, POCKET and STUNT rows are byte-identical. ADAPT holds (IZ spam 12–18%). `npm test` passes.

## Third pass (2026-11-13): Outside Zone, Pistol Duo, QB Power, and what decides a run
The question behind this pass: why did every slow-developing run (outside zone, the counters, the gun QB runs, the pistol) lose, whatever its design?

**Fixes:**
- **A losing block isn't shed on a clock.**
  - The level used to be set by how fast a winning defender works off his block (`RUN_CONTROL.base` 1.3/s). Every losing block was shed in about 1 s, so any run that reached the line after 1.1 s lost on timing, not design.
  - Now the shed is slow at a narrow margin and fast at a big one: `base` 0.5 plus `perPower` 0.25 a point, at most `maxWear` 3.5/s.
  - The level comes from contact instead, which is timing-neutral: `CONTACT.breakBase` 0.06, `breakMin` 0.03, `hold` 0.85, `drag` 1.0.
  - `RUN_GAP.k` 0.4 sets the talent slope.
- **A TE or back blocking a defender carries part of the position edge** (`RUN_GAP.pos` 0.25; a receiver's stalk `posWr` 0.75; linemen whole).
  - At full value a TE won 22% of his blocks on an end at equal talent, against ESPN's run-block win rates of about 60% for TEs and 70% for linemen.
  - The reach and the kick were lost by design.
- **The reach penalty is 2** (`REACH_PENALTY`, was 4). Real outside zone averages about what inside zone does.
- **The defense reads a handoff no sooner than an under-center one** (`RUN_TELL` 0.55 s).
  - Backers read the line, not the exchange. Timed from the exchange, the pistol's mesh (0.3 s) set them pursuing 0.3 s early, so every pistol run trailed its under-center twin.
  - A front player already chasing the ball and a pitch still count at once.
- **Gap rules:**
  - Down blocks mirror on the backside: inside is toward the play.
  - A gap scheme doubles only toward the center, and only with an adjacent neighbour (`COMBO_REACH`).
  - The nearer man of a double climbs (`COMBO_SWAP`).
  - An inline TE cuts off a backer, and cuts off on the backside of the ball only.
  - Before, Pistol Duo's backside tackle took the end outside him and the TE climbed to the SAM from 3 yd outside. Heavy Power's backside TE "doubled" the center's man from 4 yd away.
- **QB Power:**
  - Its hole is the C gap outside the down block (`qbPath` [1, 4]); before, it was inside the end the TE blocks down.
  - Real QB power is a short-yardage play against a normal box: the QB carries, so the back is an extra hat. A Bear (guards and center covered) or a 9-man goal-line front with three wideouts out stops it.
  - So it keeps `short`, its tags (beats man, stops heavyBox), and a "Short-yardage hammer" tip.
- **Tried and dropped:**
  - Slowing the shed for any walled-off defender: it lifted every run alike.
  - A power track for QB carriers: it ran the QB into the slipping end.

**Measured:**
- RUN ALL 5.3 ypc.
- GAP −10 / −5 / 0 / +5 / +10 / +20: 7.7 / 7.2 / 4.7 / 3.2 / 2.7 / 1.6, in target (−20: 14.0).
- RUNFIT stuffs 13–24%.
- ABLATE: IZ backside −6.4, OZ −1.4, Duo −1.9, Counter −2.5, the slice −0.6.
- 3rd and 1 Bear / Goal: Power 63 / 73, Heavy Power 53 / 65, sneak 90 / 60, QB Power 25 / 17 (2 Man 65).
- PASS, PA, POCKET and STUNT rows are byte-identical. ADAPT holds. `npm test` passes; the +10 stuff test's limit is 0.4, its sample has Cover 0 against the toss and OZ.

## Fourth pass (2026-11-13): Split Counter, Trey Counter, Power Read, the goal-line sneak
Each fix is a rule; none is tuned to a play.
- **A receiver's stalk is a mirror** (`RUN_CONTROL.stalkWear` 1.6). He only has to stay between his man and the ball, so a defender winning it wears it at most 1.6 a second.
  - At `maxWear` every stalk on a DB was gone 0.4 s after contact, whatever the matchup: the corner's speed counts as shed power (`defPower`), so a DB had about a 19-point position edge over an equal receiver (a DE over a tackle: −2).
  - So a slot on the nickel decided every counter to his side. Trey Counter's slot and Split Counter's lost the nickel by 1.0 s, and he made the tackle.
  - At 1.2 the perimeter gained 0.4 yd a carry at every talent gap; 2.0 bought the counters nothing.
- **The talent edge is measured from the full position edge** (`runEngagement`), then laid on the share that counts. `RUN_GAP.pos` is 0.5 and `posWr` 0.85, the same effective edges as before at template ratings.
  - Measured from the reduced edge, most of the removed edge came back through the tanh (a corner on a receiver 15.8, not 14; a TE on an end 4.7, not 2.3).
  - A bad TE or receiver blocker was barely worse than an average one, the tanh already flat. Now a worse secondary loses more stalks, which lifts the −10 GAP row about 0.9 yd.
- **Power read's key widening with the sweep is the keep** (`KEY_UPFIELD.widen`), as much as flying upfield is. Against Cover 0 the end widened along the line, the read saw home, the QB gave, and the end made 51% of the tackles.
- **A puller or lead never blocks the read key, after the mesh too** (`Play.formEngagements`). On a give the MIKE scrapes more than 4 yd off, which lifted the "work to your man" check, and the guard took the key 43–49% of the time against Cover 3 and Cover 4. The free MIKE made 37–40% of the tackles.
- **On power read the line blocks the keep's C gap** (`lineHole`), not the sweep's spot 9 yd out.
  - Blocked to the sweep, the center's back block on the 1-technique cut off a spot 3 yd playside of him. He touched him only by brushing past (at even talent); against a weaker defense he missed, and the guard ran into the free tackle instead of pulling. Against a 10-point weaker defense the play did worse than at even.
  - The playside tackle's cutoff toward the sweep had walled off the key's chase lane by accident. The key now chases a slow sweep down from inside, which is how a squeezing end plays it.
- **A sneak is a wedge** (`assignRunBlocks`): its doubles drive the down men and nobody climbs.
  - Climbing at the snap to a goal-line backer 2 yd off the ball (he counts as declared), the center left the guard alone on the nose. The stalled pile held the QB behind the line on 18% of goal-line snaps.
  - The audit's DEAD DOUBLE skips the wedge.
- **Power Read's tags:** it beats light boxes; heavy boxes and the blitz stop it (`STOPS` blitz, heavyBox). It's a numbers play: the end is left unblocked to gain a hat, and a blitz's extra rusher or a loaded box beats it. Its old "man" looks included Cover 0, Bear and Cat. The film room had it FLAT and inverted (works 25%, fails 60%); now it discriminates.
- **Split Counter stays the weakest counter, by its structure.**
  - The H, not a guard, kicks the end: the H loses it 53% of the time, the guard 19%.
  - With no TE, the playside guard must climb to the WILL, so the tackle is alone on the 3-technique (loses 33%).
  - The play runs to the two-receiver side, where the nickel is.

**Measured:**
- RUN ALL 5.4 / 5.4.
- GAP at 120 snaps a call (±0.2): −10 8.6, −5 6.6, 0 5.2, +5 4.0, +10 2.7, +20 1.6. −10 is over its 8.0 target; the full-edge fix alone makes it 8.8.
- RUNFIT stuffs 11–25%.
- ABLATE (150 reps): IZ −6.5, Counter −2.5, Duo −2.1, the slice −1.2, OZ −0.7 (was −1.4: under the 1 yd target, near the noise).
- 3rd and 1, Bear / Goal: sneak 85 / 80 (was 90 / 60), Power 67 / 67, QB Power 15 / 7 (2 Man 72).
- PASS, PA, POCKET and STUNT rows are byte-identical.
- THROW rows move: a receiver's block after the catch is a stalk too, so the stream rerolls. Yards a throw 8.54 to 8.45 and completions −0.3 points: noise, no shift.
- ADAPT holds. `npm test` passes.

## Where each play stands (fourth pass, even talent, 90 snaps a cell: success 4+ yd and ypc, averaged over light (2M/C2/C3/C4), heavy (Cat/Sky/Bear) and blitz (Fire/FZ/C0))
| Play | Beats / stops | Light | Heavy | Blitz |
| --- | --- | --- | --- | --- |
| Inside Zone | lightBox / heavyBox | 46% (4.7) | 22% (2.4) | 18% (1.9) |
| Outside Zone | lightBox / blitz | 57% (5.3) | 30% (2.7) | 22% (3.3) |
| Power | lightBox / heavyBox | 61% (5.1) | 43% (4.4) | 35% (4.2) |
| Toss | heavyBox / blitz | 47% (4.5) | 28% (3.2) | 4% (0.4) |
| Zone Read | man / heavyBox | 60% (5.8) | 46% (6.1) | 37% (5.3) |
| Split Zone | lightBox / heavyBox | 57% (5.0) | 40% (4.3) | 10% (1.5) |
| I-Form Stretch | lightBox / blitz | 73% (6.8) | 32% (3.5) | 16% (2.3) |
| Power O | lightBox / heavyBox | 59% (5.4) | 42% (6.5) | 32% (3.9) |
| Counter GT | lightBox / blitz,heavyBox | 54% (5.0) | 18% (0.5) | 12% (1.0) |
| Duo | lightBox / heavyBox | 43% (4.5) | 32% (3.0) | 24% (3.8) |
| Iso | lightBox / heavyBox | 41% (4.0) | 38% (5.7) | 25% (3.1) |
| Trap | blitz / heavyBox | 47% (3.9) | 24% (2.9) | 18% (3.8) |
| Lead Toss | heavyBox / blitz | 42% (3.5) | 35% (4.0) | 12% (2.0) |
| Pin-Pull Sweep | heavyBox / blitz | 31% (3.4) | 15% (0.4) | 14% (2.5) |
| Draw | blitz,lightBox / heavyBox | 65% (4.3) | 29% (4.0) | 20% (4.0) |
| Empty QB Draw | man,lightBox / heavyBox | 59% (4.6) | 36% (3.7) | 75% (5.0) |
| Power Read | lightBox / blitz,heavyBox | 40% (4.0) | 33% (4.5) | 7% (1.5) |
| Speed Option | heavyBox / - | 69% (5.8) | 55% (7.8) | 44% (9.0) |
| QB Power | man / heavyBox | 35% (2.4) | 13% (0.1) | 9% (0.5) |
| QB Sneak | - / - | 0% (3.6) | 0% (3.1) | 43% (4.4) |
| Trey Inside Zone | lightBox / heavyBox | 53% (4.9) | 22% (2.9) | 24% (2.6) |
| Trey Duo | lightBox / heavyBox | 45% (4.3) | 27% (2.5) | 16% (2.0) |
| Trey Counter | lightBox / blitz,heavyBox | 40% (3.0) | 18% (0.3) | 4% (-0.2) |
| Wing Split Zone | lightBox / heavyBox | 60% (6.3) | 32% (3.2) | 26% (2.2) |
| QB Counter | man / blitz,heavyBox | 36% (2.2) | 30% (1.2) | 28% (1.8) |
| Ace Wide Zone | lightBox / blitz | 72% (6.3) | 46% (3.6) | 43% (5.0) |
| Pistol Ace Zone | lightBox / blitz | 60% (5.2) | 34% (2.3) | 42% (4.7) |
| Pistol Duo | lightBox / heavyBox | 43% (4.0) | 30% (2.4) | 19% (2.6) |
| Ace Wing Counter | lightBox / blitz,heavyBox | 41% (4.6) | 37% (8.4) | 22% (3.4) |
| Strong I Power | lightBox / heavyBox | 41% (4.1) | 42% (6.1) | 27% (4.0) |
| Strong I Toss | heavyBox / blitz | 52% (4.5) | 29% (2.7) | 9% (2.5) |
| Heavy Iso | lightBox / heavyBox | 38% (3.8) | 28% (2.0) | 33% (3.7) |
| Heavy Power | lightBox / heavyBox | 54% (5.7) | 36% (3.9) | 39% (6.7) |
| Split Zone Read | man / heavyBox | 66% (7.9) | 46% (5.4) | 18% (3.1) |
| Split Zone Lead | lightBox / heavyBox | 52% (5.8) | 27% (3.0) | 16% (1.9) |
| Split Counter | lightBox / blitz,heavyBox | 29% (2.3) | 25% (2.4) | 5% (-0.3) |
| Pistol Zone Read | man / heavyBox | 48% (4.8) | 39% (5.1) | 23% (2.8) |
| Trey Zone Read | man / heavyBox | 66% (7.6) | 39% (5.5) | 49% (8.6) |
| Wing Zone Read | man / heavyBox | 55% (5.2) | 42% (3.3) | 6% (1.3) |
| Weak I Duo | lightBox / heavyBox | 46% (4.8) | 33% (4.1) | 15% (1.9) |
| Wing Duo | lightBox / heavyBox | 45% (5.5) | 34% (6.3) | 18% (2.4) |

## Open
- **Split Counter** (29% vs light): its structure (see the fourth pass). To make it a light-box play like Counter GT it needs a design change, not a mechanic. For example, run it away from the slot with the H crossing to kick, the way real split-flow counter goes to the one-receiver side.
- **The −10 GAP row** at 8.6 ypc (target 5.5–8): a weaker secondary now loses its stalks for real.
- **Outside Zone's backside cutoff** is worth 0.7 yd (target 1+).
- **The zone reads tagged "man"** (Wing and Split Zone Read) read FLAT and inverted in the film room, as Power Read did. Same question: the man looks include the heavy and blitz calls.
- **QB Counter** still flags WRONG SIDE (the tackle's lead on the backside WILL).
