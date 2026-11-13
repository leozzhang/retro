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

## Where each play stands (success at even talent, after the fixes and the level retune)
| Play | Light (2M/C2/C3/C4) | Heavy (Cat/Sky/Bear) | Blitz (Fire/FZ/C0) | Verdict |
| --- | --- | --- | --- | --- |
| Inside Zone | 73/63/73/77 | 13/63/17 | 43/80/27 | As designed. Sky (63) and Fire Zone (80) run high. |
| Outside Zone | 37/43/27/27 | 17/43/0 | 10/13/7 | Stops right; **weak against light boxes**: the TE's reach on the end loses (he makes 25% of tackles). |
| Power | 60/63/63/63 | 53/27/7 | 7/33/47 | As designed; 3rd and 1 Bear 73%, Goal 67%. |
| Toss | 23/37/23/13 | 27/30/10 | 0/0/0 | **Open:** tagged to beat heavy boxes, it doesn't (toss family). |
| Zone Read | 83/77/70/77 | 23/60/40 | 57/50/37 | As designed. |
| Split Zone | 73/67/73/83 | 70/90/53 | 20/13/17 | Good; heavy boxes (53–90) high. |
| I-Form Stretch | 53/67/67/60 | 43/67/13 | 0/23/10 | As designed. |
| Power O | 73/53/57/70 | 47/60/20 | 13/43/57 | As designed. |
| Counter GT | 57/50/40/47 | 0/13/10 | 43/3/0 | As designed. |
| Duo | 43/63/60/63 | 37/67/40 | 23/13/17 | As designed. |
| Iso | 50/53/53/60 | 37/60/27 | 37/20/13 | As designed; 3rd and 1 67/47%. |
| Trap | 67/53/63/43 | 0/27/15 | 3/47/0 | Light boxes fixed (was 3% against 2 Man). **Open:** against the blitz it only beats Fire Zone. |
| Lead Toss | 10/27/30/13 | 3/37/13 | 13/7/30 | **Open** (toss family). |
| Pin-Pull Sweep | 10/43/23/33 | 10/17/10 | 0/27/10 | **Open** (toss family). |
| Draw | 63/77/27/80 | 57/43/0 | 0/50/3 | As designed; it beats Fire Zone, not Cover 1 Fire or Cover 0. |
| Empty QB Draw | 37/27/50/100 | 17/50/0 | 100/50/47 | Beats man and Cover 4. |
| Power Read | 23/53/47/43 | 10/67/20 | 10/10/10 | **Open:** tagged to beat man, 23% against 2 Man. |
| Speed Option | 17/43/50/13 | 33/83/65 | 23/3/27 | Beats heavy boxes, as tagged. |
| QB Power | 57/33/17/40 | 10/33/0 | 27/17/10 | **Open:** 3rd and 1 27/13% (target 65–70%); the back leads in the data. |
| QB Sneak | 10/3/3/0 | 0/0/0 | 0/93/0 | 3rd and 1: Bear 100%, Goal 73%. |
| Trey Inside Zone | 80/60/73/80 | 10/73/27 | 33/73/17 | As designed. |
| Trey Duo | 50/47/67/67 | 53/57/17 | 30/13/10 | As designed. |
| Trey Counter | 37/57/23/47 | 0/30/20 | 23/7/7 | Fixed (was level-flipping 11–80%); now moderate. |
| Wing Split Zone | 63/73/70/70 | 30/60/27 | 20/13/0 | As designed. |
| QB Counter | 27/30/30/20 | 7/13/27 | 30/7/3 | **Weak:** 20–30% against light boxes. |
| Ace Wide Zone | 43/70/57/50 | 60/50/17 | 3/63/0 | As designed. |
| Pistol Ace Zone | 43/70/53/50 | 33/50/0 | 0/53/3 | As designed. |
| Pistol Duo | 23/53/37/50 | 20/70/30 | 23/13/3 | Weak against 2 Man (23). |
| Ace Wing Counter | 67/63/77/70 | 33/80/27 | 63/73/23 | Good; blitz rows high. |
| Strong I Power | 80/83/83/83 | 67/87/30 | 7/27/40 | Good; Sky (87) high. |
| Strong I Toss | 13/37/27/27 | 0/27/17 | 17/10/30 | **Open** (toss family). |
| Heavy Iso | 33/30/67/70 | 30/53/20 | 17/7/10 | As designed; 3rd and 1 67/73%. |
| Heavy Power | 73/77/77/67 | 3/87/20 | 37/70/57 | 3rd and 1 67/73%, in target. |
| Split Zone Read | 53/73/77/87 | 33/70/53 | 20/43/3 | Good. |
| Split Zone Lead | 67/70/83/87 | 13/80/40 | 13/60/13 | Good. |
| Split Counter | 17/37/13/30 | 13/30/23 | 7/0/0 | **Open:** weak everywhere (13–37%). |
| Pistol Zone Read | 83/80/73/83 | 20/57/40 | 33/37/13 | Good. |
| Trey Zone Read | 60/77/83/73 | 23/67/33 | 63/63/33 | Good. |
| Wing Zone Read | 47/50/73/53 | 33/67/10 | 0/17/0 | Weak against blitz man (0%). The wing has no man by design. |
| Weak I Duo | 40/57/57/60 | 27/63/13 | 20/37/0 | OK. |
| Wing Duo | 27/63/53/63 | 27/40/3 | 7/20/10 | Weak against 2 Man (27). |

## Open (mechanics, not single plays)
- **The toss family's aiming point** (Toss, Lead Toss, Strong I Toss, Pin-Pull):
  - The toss path ends 12.5 yd outside the back's alignment, and that spot is the play's hole. The lanes, the edge's fit and the lead's force landmark all key on it.
  - With the back pressing his path, he runs to the numbers behind the line, and the defense gets there.
  - Pressing to the edge and reading made it worse, so the fix is an aiming point at the edge (outside the last blocker) instead of the drawn endpoint. It needs its own pass: it moves every perimeter row.
- **The heavy-box rows run high for inside runs** (IZ and the Powers against Cover 3 Sky: 70–87%). Sky's eighth man is the rolled-down safety. Worth a trace of where he fits.
- **2 Man against Duo variants and Power Read** (13–37%): the backer in man on the back fills free. The playside double's climb (or the read) has to account for him.
- **Trap against Cover 1 Fire and Cover 0**, and **Split Counter**.
- **Short yardage:** QB Power (27/13% in the audit, 30/32% in balance); the goal-line sneak (57%, target 75–80%).
- **The retune hit the perimeter hardest:** Outside Zone (27–43% against light boxes) and QB Counter (20–30%). The reach and the edge are the next mechanic, with the toss's aiming point.
