# The CPU defense: playbook, identity and in-game learning

The defense you play against has three layers:
1. **A playbook** of 13 calls.
2. **An identity** that sets how often the program calls each one.
3. **A brain** that learns your offense during a live game. It works at two levels: the DC's calls, and each defender's anticipation.

Design goals:
- **Repeating a play stops working.** QB Sneak on every down used to be a free 3–4 yards.
- **A varied offense still moves the ball,** so games don't become scoreless.
- **Anything the defense learns, you can see and exploit.**

## The playbook (`src/data/defenses.ts`)
Each call has a front, a shell (the pre-snap tell), a coverage, a box count, and an assignment per slot. The first three calls are the original MVP calls, unchanged (`CORE_CALLS`). The balance report's core rows and the ratings report still use them, so those baselines stay comparable.

| Call | Shell | Coverage | Rush | Box | Notes |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | two-high | man | 4 | 6 | |
| Cover 1 Robber | one-high | man | 4 | 7 | |
| Cover 2 | two-high | zone | 4 | 6 | flat, curl, middle hole, curl, flat under two halves |
| Tampa 2 | two-high | zone | 4 | 6 | the MIKE runs the deep middle |
| Cover 3 | one-high | zone | 4 | 7 | corners and FS in thirds; hook, hook, curl/flat ×2 |
| Cover 4 | two-high | zone | 4 | 7 | quarters, with two apex curl/flat defenders and a middle hole |
| Cover 1 Fire | one-high | man | 5 | 7 | MIKE blitz |
| Fire Zone | one-high | zone | 5 | 7 | 3 under, 3 deep, a dropping end |
| Bear Cover 1 | one-high | man | 4 | 8 | bear front |
| Goal Line | zero | man | 5 | 9 | goal-line front with the base backer down; short yardage only |

**Fronts:**
- `even`: the base front.
- `bear`: tackles in the A gaps, ends over the tackles, backers walked to 3 yards.
- `goal`: everyone low and close, plus the SAM on the strong edge. It forces the base package.
- `wide`: wide-nine ends. It's defined but no call uses it yet.

**Tags** go on any call that can spare the defender:
- **SPY:** the call's `spyFrom` defender mirrors the QB at 5 yards. He reacts to a scramble in 0.05 s.
- **CONTAIN:** the ends rush to the QB's outside shoulder and stay level with him until they're close.
- **GAME** (`DefTags.game`): a line stunt on one side of a 4-man rush. TE: the tackle crashes out and the end loops inside; ET: the end crashes in and the tackle loops out; TT: the tackles exchange. The CPU DC runs one on `IDENTITY.games.rate` (0.25) of its 4-man rushes × its style (aggressive 1.3, soft 0.8), split TE 52%, ET 24%, TT 24% (`pickLineGame`, in `Game.toCall`). How the line handles it: PROTECTION.md. The harness passes no tags, so the core rows have no games; the STUNT rows measure them.

**Zone coverage** (`sim/ai.ts`):
- **Landmarks:** `mid`, `hook`, `curl` and `flat` (`ZONE`). Deep zones are the existing `deep` kind with a band: halves, thirds or quarters. Thirds and quarters play 3 yards over the top (`DEEP_OVER_NARROW`); halves play 5.
- **Pattern match (`matchZones`):** once a step, the underneath defenders are paired with receivers as a unit, lowest score first, one receiver each. That's how the hook takes the slant and frees the curl defender for the flat. Each defender scores receivers this way:
  - across his zone counts fully
  - short of his landmark counts too
  - deeper doesn't count, so he sinks under a vertical, up to `carry` yards past the landmark
  - a curl defender widens: a receiver outside him counts half (`ZONE_WIDEN`), and one running out to the flat scores closer still (`ZONE_OUTSIDE`)
  - a receiver breaking inside a curl defender counts double: the hook takes him
  - the receiver he's already on scores closer (`ZONE_STICK`), so he commits instead of flipping between two
- **Defenders with nobody to cover** lean toward the nearest threat, up to `ZONE_LEASH` yards from the landmark.
- **Against run blocking,** zone defenders take a read step instead of bailing. On an RPO the read step ends at the mesh read (below).
- **Breaking on the ball:** zone defenders break on the throw by `zcv` (`Play.throwBall`). Until now, almost nothing exercised that rating.

### Balance by call
From `npm run balance`'s DEF rows. The reference matchup: the auto-QB throws to the most open receiver at a fixed hold, and every run in the book is included.

| Call | Pass 1.2s ypp | Pass 2.2s ypp | PA 2.2s ypp | Runs ypc | QB Sneak 3rd & 1 |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | 4.1 | 5.5 | 7.6 | 4.6 | 88%, 3.0 |
| Cover 1 Robber | 6.4 | 6.2 | 8.6 | 3.3 | 94%, 3.1 |
| Cover 2 | 5.7 | 11.0 | 8.9 | 4.0 | 93%, 3.4 |
| Tampa 2 | 5.3 | 9.3 | 9.3 | 4.3 | 91%, 3.6 |
| Cover 3 | 7.2 | 8.7 | 9.2 | 3.6 | 88%, 3.3 |
| Cover 4 | 7.6 | 8.4 | 10.8 | 3.6 | 76%, 2.8 |
| Cover 1 Fire | 7.4 | 7.0 | 12.2 | 2.9 | 86%, 2.2 |
| Fire Zone | 8.3 | 7.4 | 11.8 | 3.2 | 84%, 2.2 |
| Bear Cover 1 | 8.9 | 6.4 | 10.4 | 2.6 | 87%, 2.3 |
| Goal Line | 7.3 | 4.9 | 13.5 | 2.6 | 77%, 1.7 |

Every call has a weakness:
- The run fronts (Bear, Goal Line) stop runs but give up the quick game and PA.
- The pressures stop runs but are weak against screens.
- The zones are softer than man at a 2.2 s hold.

**Flags (not tuned):**
- **Zones at a 2.2 s hold give up 8–11 yards a play, against 5.5–7 for man.** In NFL tracking, yards per target is about the same in man and zone (TARGETS.md). Part of the gap is that our man coverage is too tight (separation at the catch is 1.2 yards). Part is the harness's "most open" throws. The DC's results learning steers away from a zone that's getting torched.
- **Cover 2 at a 2.2 s hold** (11.0) is the softest call.
- **Screens against Fire Zone** gain 14.4 yards a play, against about 5 for most calls.

## Identity (`src/data/identity.ts`)
A defense's identity is a few **dials**, which are log-weights on each call's traits (`callTraits`):
- `blitz`: rushers past four
- `man`: man or zone
- `twoHigh`: a two-high shell or not
- `box`: box count past 7

A call's weight is its league prior (`IDENTITY.prior`) × exp(Σ dial × trait). `floor` keeps 15% of every call's prior, so nothing is ever off the table. On a normal down, the league plays about 45% man, 21% pressure and 39% two-high.

**Style** belongs to the DC, as before:

| Style | Blitz dial | Man dial | Two-high dial | Press × | 3rd & long pressure × |
| --- | --- | --- | --- | --- | --- |
| aggressive | +0.6 | +0.3 | -0.2 | 1.3 | 1.6 |
| balanced | 0 | 0 | 0 | 1.0 | 1.2 |
| soft | -0.7 | -0.3 | +0.4 | 0.6 | 0.7 |

**The roster shades it:**
- Each point of the DL unit takes 0.15 off the blitz dial: a front that gets home with four doesn't need to send more.
- Each point of the CB unit adds 0.15 to the man dial and 6 points of press.

**The situation adds dials:**
- **Third and 7+:** pressure × the style's `longBlitz`, and +0.3 two-high.
- **Playing the sticks** (`sticks(toGo)`, `IDENTITY.sticks`; any down): from 10 yards to go up to 15, the `longBlitz` pressure fades out, two-high climbs to +0.4, and the no-deep-safety calls (Cover 0, Goal Line) fade to none. On 4th and 20 nobody plays Cover 0, and no disguise shows a zero look from 15 to go on. This applies to every path that draws a call, the learning DC's included, since his mix leans off this base.
- **Short yardage** (3rd or 4th and 2 or less, or inside the 3): +0.6 box. Goal Line becomes available.
- **Red zone:** +0.3 man and -0.3 two-high.
- **Inches** (3rd or 4th and under a yard, or at the 1): another +0.4 box, so Bear and Goal Line come up against the sneak.

**The clock and score add dials too** (`lateDials`, from the offense's `Situation` in `game/situation.ts`):
- **Prevent** (`preventLevel`): the offense is tied or down one score (8 or less), inside the last 2:00 of the 4th, and outside the red zone. It grows from 0.3 to 1 as the clock runs down. It's 0.6 in the last 0:30 of the 1st half at any score, and 1.5 against a last-snap heave.
  - The dials, × the level: +0.9 two-high, -0.8 blitz, -0.6 man.
  - The call gets the **prevent tag** (`DefTags.prevent`). On the field, the corners don't press, man corners start 3 yd deeper, and deep zones sit 4 yd deeper and stay 4 yd farther over the top (`PREVENT`, `sim/ai.ts`).
- **Sell-out:** the defense trails late and the offense is milking the clock (inside 5:00): +0.5 box, +0.4 blitz.

Three places call it: the CPU's live defense (`Game.toCall`, through `callFor`), the brainless CPU defense at DEFENSE IQ OFF, and every replay's defense (`replay.ts`), which includes the user's own defense on CPU drives. A zero lean, no tags and no situation leave every core row as it was.

## The brain (`src/game/defBrain.ts`)
**Live games only.** CPU-vs-CPU games and the drive sim don't model calls, so season results don't change.

**It never sees your call.** The defense's call is made in `Game.toCall`, before you pick a play. The brain reads only:
- the snaps you've already run
- the situation, and the look you break the huddle in (personnel and formation)
- what the DC knew before kickoff: your OC's book and style (public), your roster (`rosterRead`), and the film of your past live games (`TeamState.film`)

It has two parts. **The DC's model of your offense** (`game/offModel.ts`, "The DC" below) decides his calls, his checks and his keys. **The players' book**, below, drives each defender's lean and nerve.

**The players' book** is plain JSON, reset each game. It holds decayed counts of what you ran:
- `run`
- `qbRun`: designed QB runs, keeps and scrambles
- `screen` and `pa`: from `playTraits`
- `quick`: a quick-game play, or a throw 6 yards or less
- `deep`: a throw 15+ yards downfield
- `pass`
- each play id
- your short-yardage snaps, kept separately

The long book keeps 0.85 of each older snap (the spy, contain and RPO tags read it). The players' book (`flow`) keeps 0.6, so it's their recent read.

### The RPO: reading the mesh (`MESH_READ`, `game/playState.ts`)
Run blocking is a run key, so at the snap every second-level defender without a receiver to mirror sets a run fit. Before this, on an RPO that fit lasted until the throw, deep safeties included: on a pull, the glance window behind the backers was open every time (36–50 yards a throw against every zone call at a 1.3 s throw).
- **The mesh read:** each of them reads whether the back got it `0.4 + 0.5 × (1 − prc/100)` s after the snap, × `leanMul(−lean.run)`: slower when he's sitting on the run, faster when he isn't. If the QB still has it, he stops fitting (`passRead`) and plays his assignment; his zone stops its read step.
- **Deep defenders stay home** on an RPO: no run fit until the handoff, so they're a beat late to a give.
- A defender who has read the pull doesn't bite on the fake (`sellFake`).
- **Pass-first** (`DefTags.rpo`, the DC's tag): the hook and curl defenders to the tagged route's side ignore the run key altogether. That takes the glance, slant and smoke, and leaves the box a fitter short against the give.

The give is always the counter: the harness's "glance ×8 then give" gains 5.2 a carry against a learning defense, against 4.1 against a static one.

### Leverage (`Lean.inside`, `LEAN_FX.shade`, `LEAN_FX.sink`)
The players' book keeps where the intermediate throws (4–20 yd) broke: inside or outside of where their receiver lined up (`laneOf`, on the players' short memory). The share past half is the `inside` lean (`ANTICIPATE.scale.inside`, by `prc` like the others):
- A man defender shades up to `shade` yd more to the inside of his man, pre-snap too (a tell). Negative is outside leverage.
- A hook or curl defender sinks up to `sink` yd under the windows inside.
- On a throw between 3 and 15 yd, he breaks faster on a ball breaking his way and slower on one breaking the other way.
- Nerve: beaten 8+ yards the other way (`laneGain`), he plays it straighter for a few snaps; right on an incomplete or short gain, bolder.

### The DC: a model of your offense and the film table (`game/offModel.ts`, `dcMix`)
Built on the run game once it was stable (it would have learned the bugs). The design choice: **explicit structure, learned numbers.** A game is about 60 snaps of yours: nothing learns from scratch on that, so the DC is a small Bayesian decision-maker, not a trained network. The model says *what* he can know; the counts and residuals are learned. A trained model couldn't be scaled by the DC's rating or explained to you, and it would need sim data that doesn't look like a person calling plays.

**1. What you'll call** (`famDist`, `playDist`). Decayed counts (0.93 a snap) of your play families (`playTags.ts`) and plays, by situation (`sitBin`: early downs, 3rd and 3–6, 3rd and 7+, short yardage, red zone) and by look. Each level is smoothed toward the one above:
- **The prior**, stacked: the league's family shares by situation (the five OC styles' `callWeight`s); your OC's style (public, weighed by SCOUT from `styleMin`); your book (families he doesn't have are all but off the table); your roster (pass families × exp(`rosterTilt` × the pass-vs-run talent edge), QB runs and reads × the QB's mobility).
- **Your whole game** tilts the prior: each family's count against what the prior expected of those snaps.
- **The situation's snaps**, then **the look's**, on top (`sit`, `look` pseudocounts).
- **Plays** within a family: a weak DC sees "a quick pass", a sharp one "the slant" (`play`).
- At the huddle he doesn't know the look and sums over it; at the presnap check he does, and only plays from that formation are possible.

**2. Who gets the ball** (`targetDist`). Each play's prior is its film target shares (`FILM_PAYOFF.rows[id].t`) × each receiver's talent (`tgtTalent`, by SCOUT). It's tilted by who you throw to on *every* play against who those plays' priors expected (your favorite), then by this play's own throws. The target is the slot thrown to (`Play.intended`).

**3. What stops it** (`damage`, `resid`). The film room's table (`data/filmPayoff.ts`, written by `npm run film`): success plus half the explosive rate, by play and call; an RPO is mixed by your give rate.
- **Film is a prior, not the truth.** The film QB reads high to low on a fixed clock; you don't. Each cell is pulled halfway to its row's mean (`filmTrust`): against the ADAPT harness's most-open QB, the full table sent the DC to Cover 4 against the quick game (192 calls in 800, Cover 4 giving up 70%).
- **Residuals** correct it: each snap's result, graded the way the film grades that play (`filmOk`: 4 yd, or 1 for a short-yardage play), less the film's expectation. They're kept by `family|call` and backed off to `family|man or zone, pressure or not`. A success is about 0.45 of noise, so a few snaps move him a little (`res` pseudocounts). Being good against everything doesn't move his calls; being good against *one kind* of call does.

**4. The call** (`dcMix`). For each call in the identity's situation mix: the damage he expects from you against the damage a normal offense (the league's plays in that situation) does to it. That's each call's `gain` (stop rate over normal). Then:
- `w = identity mix × exp(beta × (gain − mean))`, and he hands `lam` of his mix to that lean: `final = (1 − lam) × identity + lam × w`.
- **A varied offense that looks like the league moves nothing; a habit he can read does.** The identity's floor still holds.
- He draws each call's residual from its spread at `explore` of it (Thompson sampling), plus a misread for a weak DC: he tries things and isn't perfectly predictable.
- **Short yardage he expects** (`heavy`: the short-yardage plays pass 35% of what he expects) opens the goal-line call on any down, but never from 10 yards to go on (`sticks`).

**How much is the DC** (`ML_DC`, each pair from ADJUST 40 to 85+, skill 0..1):

| Knob | Weak DC | Sharp DC |
| --- | --- | --- |
| Prior weight (`trust`) | 8 snaps | 3 |
| Situation / look separation | 10 / 10 | 2.5 / 2 |
| Picks out one play in a family (`play`) | 14 | 1.2 |
| `beta` (lean per point of stop rate) | 6 | 16 |
| `lam` (the most of his mix he leans) | 0.35 | 0.85 |
| Misread SD | 0.04 | 0.01 |

`lam` is the difficulty budget: × the team's execution (`execute`, by smarts) and the IQ setting (at most 1; `beta` takes SHARP's 1.4). At halftime every DC studies the first half: his skill for reading you moves 35% toward sharp (`half`).

**Tags:** spy and contain from the QB-run share of the long book, RPO pass-first from its RPO share, as before (`DEF_BRAIN.tag`), stepping toward them by `rate`.

### Keying a receiver (`DefTags.key`, `KEY` in `sim/ai.ts`)
The answer to a good receiver on the same easy completion every play. The DC keys the receiver he expects the ball to go to (`ML_DC.key`): the top receiver's share of the throws he expects past 0.4 (a normal top target gets about a third), plus 1.5 × how far that receiver has beaten the film's expectation, × 3, × his lean budget's share of the most, at most 70% of snaps. Never in prevent.

On the field, on the keyed man:
- his man defender reacts 35% sooner to his moves and plays a yard tighter
- underneath zones score him 4 yd closer, so they rally to him first
- a robber within 14 yd takes him
- a deep defender with him in his band shades 40% toward him (help over the top)
- every defender breaks 30% sooner on a ball to him

The cost: his tight man is 35% slower on a ball thrown 15+ yd to him, the deep help leaves the other side thinner, and every defender is 12% slower on a ball to anyone else. With no key, nothing changes.

**Measured, forced to a 99 X** (quick and dropback passes, 150 a call): 9.7 → 8.2 yards a throw. Man calls lose the most (Cover 1 Robber 15.0 → 10.7); zones move little.

### The players learn your throws (`game/habits.ts`, `ANTIC` in `sim/ai.ts`)
Added after a hand-played game of PA Boot Flood: the QB booted out every snap and fired a bullet to the same out, for about 11 yd every time, keyed or not. A rollout behind the line was no cue (the defense only read a scramble past the line), the players learned buckets rather than throws, and a turned man defender has his back to the QB (`eyes` 0), so he could never tip or pick a bullet.

**The records.** Every pass the user throws is a `ThrowSeen`:
- the look
- where the QB threw from (the pocket, or rolled 4.5+ yd to the formation's strong or weak side, `rollOf`)
- the release time and the throw type
- the receiver and his route, and the catch spot (mirrored to the formation's strength)
- the gain, and the defender nearest the catch

They decay 0.85 a pass (`HABIT`), 24 at most. The DC's brain keeps them for the game, and film carries the latest 12 to next week.

**The live read** (`expectThrow`, each step while the QB holds the ball). Each record is weighed against the cues now:
- the same look (1) or another (0.3)
- the QB rolled the same way (1), still in the pocket (0.5), or rolled the other way (0.1)

The read is the receiver most of that weight went to, his catch spot, the release time, the bullet share, and a confidence (that receiver's share × how much matching weight there is; about 0.33 after one throw, 0.75 after six). A rollout is now a cue, and the defense still never sees the call.

**Each defender's anticipation** (`anticFor`, `HABIT_PLAYERS`) is the team's read × his play recognition × the DC's film × the team's smarts, plus his own:
- **Experience:** the defender nearest the catch on a 6+ yd completion gets +1 (decaying 0.85 a pass), worth 0.25 of anticipation. The corner who keeps getting beaten learns first.
- **Nerve:** sitting in the lane or jumping it and giving up 15+ yd costs 0.35 for a few snaps; getting to the ball (an incompletion or a pick) adds 0.1.

**The answers** (`anticRoles`, then `anticipate` in `thinkDefense`; strength `s` = his anticipation × the read's confidence):

| Answer | Who | When | What | The cost |
| --- | --- | --- | --- | --- |
| Lane | the man on the expected receiver, else the underneath zone defender nearest the spot | `s` ≥ 0.12 | his goal moves up to 85% toward 2.5 yd in front of the catch, on the line to the QB; eyes on the QB (a flat bullet can be tipped or picked, `TIP`) | his trail is `lag` × s later: the double move, a route continuing deeper, a lob over him |
| Jump | the same man | `s` ≥ 0.38, within 0.35 s of the expected release | drives to the catch spot before the throw | a hold, a pump or a throw elsewhere leaves him out of position |
| Break | anyone answering | on the throw | 35% × s faster to the expected throw (that receiver, within 4 yd of the spot), 30% × s slower to anything else | |
| Chase | one second-level defender to a rolled QB's side, not on the receiver | `s` = anticipation × the rollout share ≥ 0.2, after his reaction (0.25–0.5 s by `prc`) | pursues the QB; the end to that side plays contain (`rollContain`) | his zone or man is open (the drag behind him) |

**The tell:** a man corner with anticipation 0.45+ lines up a yard shallower. With no throws seen, every snap is exactly as before.

**The DC learns them too** (`game/offModel.ts`):
- **Signatures.** Each throw is a signature (`sigOf`: pocket or rolled strong or weak; behind the line, under 8, under 15 or deeper; inside or outside 12 yd across; the throw type), counted overall and by look.
- **Residuals by signature.** What a throw gained against a call over film, less the family's residual (so a snap isn't counted twice), by `sig|call` backed off to `sig|man or zone, pressure`.
- **A coaching prior** (`HABIT_PRIOR`), until those residuals arrive:
  - a rolling QB beats man and Cover 3, and is walled by a hard flat (Cover 2, Tampa 2, Sky)
  - the quick out is the Cover 2 corner's
  - the deep ball wants two high
- `dcMix` adds the pass share × Σ P(signature) × its residual to each call's expected damage.
- **Contain and spy** odds rise with the share of throws on the move (`DEF_BRAIN.tag.roll`, `rollSpy`).
- **The trap** (`DefTags.trap`, `trapRead`): when the throws pile up on one receiver from one side, the DC calls the corner and flat defender there to sit on it (`ANTIC.trap` 0.8, whatever their own read). It works even for a defense whose players are slow to learn, if the DC is sharp. Odds by the habit's concentration past 0.35, × 2, × his lean budget, at most 60%.
- **Film** carries the signatures, their residuals and the throws.

**Measured** (ADAPT, yards per play by snap window 1–6 / 7–15 / 16+; `boot bullet` is PA Boot Flood every snap, a bullet to the out at 1.7 s):

| Offense | STATIC | NORMAL, DC 45 | NORMAL, DC 75 | SHARP, DC 75 |
| --- | --- | --- | --- | --- |
| Boot bullet (before this work) | 12.1 / 11.0 / 11.7 | 11.6 / 8.6 / 8.5 | 11.3 / 8.7 / 7.8 | 11.7 / 7.7 / 8.0 |
| Boot bullet | 12.1 / 11.0 / 11.7, int 1.3% | 11.6 / 8.3 / 7.9, int 6.7% | 11.1 / 6.7 / 6.7, int 7.3% | 10.3 / 6.4 / 6.1, int 9.2% |
| … ×8, then the drag (counter ypp) | 6.5 | 6.8 | 7.0 | 6.7 |
| … ×8, then a lob to the go (counter ypp) | 22.2 | 20.6 | 17.7 | 18.8 |
| RPO slant only | 8.9 / 8.8 / 8.4 | 7.1 / 5.4 / 3.1 | 6.0 / 3.3 / 2.3 | 4.4 / 2.2 / 2.2 |
| Glance ×8 then smoke (counter ypp) | 2.4 | 3.9 | 4.1 | 4.4 |

- **Tiers:** the boot bullet loses 45% against the strong defense and 28% against the weak one (`team` × smarts).
- **Unchanged:** balanced and quick-only are within noise. Every row outside ADAPT is byte-identical.
- **Flag:** a pure pass spam now loses 45–60% (the slant the most). The harness throws it into a defender sitting on it every time, which a person wouldn't, but it's past the old 30–50% band.
- **Flag:** the DC's habit features (signatures, the prior, the trap) add little over the players' answers in these rows. The players do most of the work.

**What the user sees:** "THEY'RE SITTING ON YOUR THROW TO <NAME>", "THEIR BACKERS ARE CHASING THE ROLLOUT", the shallow corner, and on F1 the throw they expect and who's on it.

### The presnap: the look, the check and audibles (`CHECK`, `lookOf`, `checkFor`, `AUDIBLE`, `AUDIBLE_DC`)
The defense sees your **personnel and formation** once you break the huddle, never the play. Personnel can't change after that: the offense didn't sub, so the defense can't either (the NCAA's substitution rule). Every check and audible stays inside both packages, so the look is the defense's key.
- **The players know the look:** their leans move toward what that look has shown (`CHECK.lean` × the team's smarts × confidence). A formation that has only run gets them sitting on the run, and play action from it is the counter.
- **The check:** the DC works out his mix again with only the plays he expects from that look. If it moved by `from` (0.15 of the package's mix, total variation) or more, he may check, with odds `odds` × his skill (`skillMin` for a weak DC) × the team's smarts × IQ, at most `max`. He checks only to a call the look says is better than the one he's in, in the same package. It happens once a snap, at the huddle break. A check is played straight (no disguise), and the presnap shows "THEY CHECKED: THEY'VE SEEN THIS LOOK".
- **Your audibles** (Esc before the snap opens a strip of your book's plays in the personnel on the field, over the live field). There's no limit but the play clock. There are two kinds:
  - **A quiet check** (CHECK, a play in the same formation): nobody moves, and it's hidden. The call, alignment, disguise, its tips and the players' leans all stay as they were. It rewards reading the defense, limited to that formation's plays.
  - **A shift** (SHIFT, another formation in the same personnel, or F to flip the play): everyone jogs to the new spots (`AUDIBLE.jog`), and there's no snap until the offense is set for `AUDIBLE.set` (1 s). The defense always realigns (its man matchups follow their men and the corners travel; it walks there at `MOTION.trail`). It may also answer:
    - **The DC may re-check** (`recheckFor`): `checkFor` on the new look at `AUDIBLE_DC.recheck` (0.6) of its odds, up by `rise` × your shift rate (`DefBrain.shifts`, decayed `decay` a snap): a defense that has seen you shift waits for it. Never with under `clock` (6) s on the play clock, and only within his package. It's played straight: "THEY CHECKED AFTER THE SHIFT", else "THEY REALIGN TO THE SHIFT".
    - **The players re-read the new look** (`releanFor`): each lean moves toward its read of the new look by his `prc` (`leanMin` 0.3 of the way at 0, all of it at 100). Slow readers keep the old one, and that's part of what a shift buys.
    - **A disguiser may tip it**, as motion makes him (`AUDIBLE.spin`).
- **Why both:** a quiet check is invisible but narrow; a shift opens the package but shows your hand, costs play clock, and gives the DC another look. Shifting every snap makes him wait for it. A check made on a disguised shell can be the wrong one.
- **The CPU offense audibles too** (engine drives, ENGINEDRIVES.md "Audibles in engine drives"). Its QB checks within his personnel, a shift costs him `CPU_CHECK.shift` of edge, and the defense answers it the same way. Its OC also shifts by design (`OffIdentity.shift`, 5–25% of normal-tempo snaps by style): he shows one formation of the personnel and shifts into the call, and the defense reads the shown look first.
- **What the DC learns:** the snap as it was run (the final play and formation). A shift counts toward `shifts`; a quiet check isn't seen. Breaking the huddle in one look and always shifting to another leaves the first with no tendencies, so the huddle-break check rarely fires; the re-check on the second look is the answer. If ADAPT shows that's an exploit, the next step is to credit the huddle look a share of the snap.

**Measured** (ADAPT AUDIBLE, the balanced script audibling off the shell by the engine payoff table, `presnapRead` + `readDamage`; 30 games × 40 snaps, ypp by window 1–6 / 7–15 / 16+, against the same offense not audibling):

| Audible | STATIC | NORMAL DC 45 | NORMAL DC 75 | SHARP DC 75 |
| --- | --- | --- | --- | --- |
| none | 6.3 / 5.6 / 5.7 | 6.7 / 5.5 / 6.5 | 8.0 / 6.3 / 5.0 | 7.2 / 6.3 / 5.3 |
| check (61% of snaps) | 6.4 / 6.9 / 4.4 | 5.4 / 4.6 / 4.7 | 4.7 / 5.8 / 4.0 | 6.0 / 4.4 / 3.6 |
| shift (67%, 38% shifted) | 7.3 / 5.4 / 5.4 | 5.7 / 4.1 / 5.8 | 6.1 / 4.5 / 4.9 | 5.4 / 4.5 / 3.0 |
| spam (every snap shifts) | 5.8 / 5.7 / 5.7 | 6.1 / 5.9 / 5.8 | 7.4 / 7.1 / 6.2 | 5.9 / 6.3 / 6.7 |

- **Re-checks** on a shift: 0% at DC 45, 4–6% at DC 75, and 10–19% under shift spam (the `shifts` rise works).
- **Flag: the oracle audibler loses to a learning defense.** Checking to the table's best play off the shell 60%+ of the time narrows the offense to a few plays, and the DC and the players learn them (the pass-spam effect). Against STATIC it's within noise (about ±0.3 a window). So audibles aren't an exploit. Whether a person reading the shell gains is for playtesting: a person audibles far less, and on tells the table can't see (tips, press, the box).
- **Flag: shift spam holds up** (NORMAL DC 75 7.4 / 7.1 / 6.2). Shifting at random spreads the plays, which the defense can't key, and that offsets the re-checks. Watch it in play; the levers are `AUDIBLE_DC.rise` and crediting the huddle look.

### Film study (`TeamState.film`, `FilmBook`, `mergeFilm`, `layFilm`)
Your live games leave film. The model keeps an undecayed copy of each game's counts and residuals (`OffModel.raw`): families by situation and look, plays, targets by slot (with who played there), the RPO's give rate, and how you did against each kind of call. At the final whistle of a season game it's merged into your `TeamState.film` (each older game keeps 0.6 of its weight; small counts drop; about 2–4 KB).
- **Next week's DC lays it in as snaps already seen,** each worth `film.w` of a live snap: 0.04 at SCOUT 0, up to 0.35 at 100. Live snaps decay it, so it shapes the first quarter, then your play takes over.
- **A receiving slot with a new man loses its old targets** (the film was someone else's).
- **The prep page** (OC section, tier 2): "THEIR DC HAS YOUR FILM: 58% RUNS ON EARLY DOWNS, 81% PASSES ON 3RD AND LONG, 44% OF THROWS TO SMITH". With "HE STUDIED IT: BREAK YOUR TENDENCIES EARLY" for a SCOUT 70+ DC, "HE ONLY SKIMMED IT" at 50 or less.
- Only live games make film. Simulated weeks don't (a box score has no calls).

### Smarts: a weak defense is a less smart one (`teamSmarts`, `SMARTS`)
Every in-game adjustment is gated by the DC **and** the team. A defense's smarts is the mean `prc` of its eleven: 50 is `floor` (0.25), 90 is 1 (the reference defense is about 0.87, a 70 unit about 0.56). It scales:
- how much of the DC's lean (`lam`), tags and keys the defense carries out (`execute`: from `dcMin` 0.5 to all of it)
- the check's odds
- how far the players' read moves toward the look

The players' own reads still go through each one's `prc`. The ADAPT TIER rows check it: the same spammed RPO loses 44% against the reference defense and 27% against a 70 defense; the formation tell 16% and nothing.

### The players
Each snap, each defender gets a **lean** (`Lean` in `sim/player.ts`), from −1 (wary) to 1 (sitting on it), on five things: the run, screens, the QB taking off, the deep ball, and leverage (`inside`, above). A lean is made of:
- the players' recent read of your offense, moved `ML_DC.leans` (0.5) × the team's smarts toward the DC's model of this situation and look against the league's there (`modelRead`): they know you throw on 3rd and long from trips
- × his play recognition (a 0 `prc` reader gets 30% of it)
- × the DC's film (60% to 100% by skill)
- \+ his own **nerve:**
  - a right guess (a stuffed run he sat on, a screen he jumped) makes him bolder
  - getting burned (a 12+ yard gain on a ball thrown 10+ yards over him while he sat on the run or a screen) makes him careful for a few snaps
- \+ a small guess of his own

**What a lean does on the field** (`LEAN_FX`). Every effect scales an existing timer or chance, and a zero lean is exactly the old behavior:

| Lean | Helps | Costs |
| --- | --- | --- |
| Run | Faster run read and fit (`fitAt`, `reactToRun`). Linemen get off the ball into it (`surge`, +8 block power). Backers creep up (a tell). | Bites more often and longer on play action (`paBite`, `biteLong`). A man defender's eyes are in the backfield (`eyes`). Softer pass rush. Late to a throw 15+ yards downfield. |
| Screen | Jumps throws behind the line. Past 0.3, the line, the target's man and any free defender within 10 yards go for the screen when the line releases. | Softer pass rush. Late to a throw 15+ yards downfield. |
| QB | Faster to a scramble. | |
| Deep | Faster to deep throws. A corner bails up to 2 yards deeper (a tell). | Slower to throws 3–15 yards out. A negative deep lean (nothing deep seen) is the reverse: he squats on the short ones. |

**The counter is always the other play.** Sitting on the run is what makes play action work. After 8 straight Inside Zones, PA gains 9–12 yards a play against a learning defense, against 6.5 against a static one.

### What you see
- **The pre-snap read** shows the front, the box count and a spy: `BEAR FRONT`, `GOAL LINE`, `8 IN THE BOX`, `SPY`. You can also spot creeping backers and bailing corners yourself.
- **A gold line,** at most one a drive, the first time an adjustment crosses 0.5. Examples:
  - "THEY'RE SELLING OUT FOR THE QB SNEAK"
  - "THEY'RE LOADING THE BOX"
  - "SPYING YOUR QB"
  - "THEY'VE STOPPED BLITZING AND SIT IN COVERAGE"
  - "THEY'RE KEYING SMITH: HELP OVER THE TOP"
  - The posture lines read how far his mix leans from his identity's (`leanOf`, × `ML_DC.say`).
  - It can be said again once that shift has faded under 0.25.
- **At halftime,** "<TEAM> ADJUSTS" lists their biggest adjustments. Your OC's SCOUT decides how many you're told: 1, then 2 at 60+, 3 at 78+.
- **On the prep page,** the OC's report has a tier-2 line on their DC: "THEIR DC ADJUSTS IN-GAME: FAST / STEADY / SLOW (ADJ n)". FAST is 70+, SLOW is 50 or less. And what he has on you from film (above).
- **F1** (dev builds) shows the DC's read on the field: the plays he expects, his top calls (his share, the identity's, the stop rate over normal), the key and its odds.

### DEFENSE IQ
A dynasty setting (`SeasonConfig.defIq`, also on the hub's SETTINGS page) and an exhibition line (I):
- **STATIC:** no brain. Calls come from the identity and the situation, as before this system.
- **NORMAL:** the default, ×1.
- **SHARP:** ×1.4 on every dial and lean.

## Measured: the ADAPTIVE section of `npm run balance`

**With the ML DC (2026-11-13; `npm run adapt` runs it alone).** Yards per play by snap window (1–6 / 7–15 / 16+), against the reference defense. The adaptive brains now get the legacy book and the harness roster (`rosterRead`). The tables after this one are the rule-based DC's, kept for comparison.

| Offense | STATIC | NORMAL, DC 45 | NORMAL, DC 75 | SHARP, DC 75 |
| --- | --- | --- | --- | --- |
| Sneak only | 3.5 / 3.5 / 3.3 | 3.2 / 2.6 / 2.3 | 2.9 / 2.0 / 1.6 | 2.7 / 1.8 / 1.4 |
| IZ only | 4.5 / 4.4 / 4.3 | 3.8 / 3.4 / 2.3 | 4.4 / 2.2 / 1.5 | 3.1 / 1.5 / 1.5 |
| QB runs | 5.0 / 4.0 / 4.3 | 4.1 / 3.9 / 3.3 | 2.8 / 2.7 / 2.4 | 3.7 / 2.7 / 2.3 |
| Quick only (succ) | 55% | 57% | 59% | 57% |
| Balanced (TD/drive) | 0.24 | 0.33 | 0.31 | 0.30 |
| IZ ×8 then PA: PA ypp | 8.3 | 10.7 | 12.4 | 11.7 |
| RPO glance, always the pull | 12.7 / 11.6 / 10.8 | 11.6 / 10.4 / 8.4 | 8.5 / 8.2 / 6.1 | 7.3 / 6.4 / 6.2 |
| RPO slant only | 8.9 / 8.8 / 8.4 | 6.7 / 5.6 / 5.1 | 6.3 / 5.4 / 4.0 | 5.9 / 4.5 / 3.8 |
| Pistol runs, Trips passes | 5.6 / 6.9 / 4.8 | 5.0 / 6.1 / 5.0 | 5.9 / 4.8 / 4.5 | 5.6 / 4.5 / 4.5 |
| Elite X (99, 75% of throws to him) | 8.7 / 7.8 / 7.7 | 8.1 / 7.3 / 7.5 | 7.7 / 7.2 / 6.5 | 8.0 / 7.7 / 6.8 |

**Film** (three games of the same offense on film, then NORMAL DC 75; ypp snaps 1–6, without → with): IZ only 4.2 → 2.3 (SCOUT 40), 4.4 → 1.7 (SCOUT 85); slant 6.8 → 4.5, 6.0 → 4.5; elite X 8.2 → 8.0, 7.8 → 6.4; pistol/trips 5.8 → 5.5, 5.9 → 4.5.

**Against the targets:**
- **Met:** a spammed run loses 40–55% by snaps 7–15 for a DC 75. The rule-based DC took 80–90%, more than the target; a DC 45 now takes 20–30%.
- **Met:** a spammed RPO or pass play loses 30–50%.
- **Met:** the counter (PA after IZ ×8) gains more than static.
- **Met:** a balanced offense loses nothing (TDs per drive at or above static, within noise).
- **Met:** a formation tell is read (−30% at DC 75, about −10% before).
- **Met:** film shows in the first snaps, more for a sharp scout.
- **Flag:** quick-only is still untouched, as before (the players' leans cost the defense about 4 points there, before this work too).
- **Flag:** the elite X loses 8–15% late, short of the 25% hoped for. The key alone is worth −16% on throws to him, mostly against man.
- **Flag, as before:** the weak-defense TIER row (−38%) is about as big as the strong one (−44%) on the RPO glance.
Scripted offenses play 30 games of 40 snaps against the reference defense, starting drives at the 25 and going for it on fourth down (`src/adaptive.ts`). Yards per play by snap window, success rate and TDs per drive:

| Offense | STATIC | NORMAL, DC 45 | NORMAL, DC 75 | SHARP, DC 75 |
| --- | --- | --- | --- | --- |
| Sneak only | 2.6 / 2.7 / 2.7 | 2.3 / 1.5 / 1.4 | 2.0 / 1.3 / 1.2 | 1.8 / 1.1 / 1.0 |
| IZ only | 3.6 / 4.1 / 3.6 | 2.7 / 2.7 / 2.5 | 3.2 / 2.2 / 2.6 | 2.1 / 2.4 / 2.7 |
| QB runs | 2.8 / 2.5 / 2.8 | 2.9 / 1.8 / 1.5 | 2.7 / 1.4 / 1.2 | 1.4 / 1.9 / 1.4 |
| Quick only | 36% | 35% | 36% | 34% |
| Screens | 40%, 0.23 TD | 34%, 0.14 | 38%, 0.13 | 35%, 0.13 |
| Balanced | 34%, 0.17 TD | 33%, 0.20 | 31%, 0.17 | 31%, 0.14 |
| IZ ×8 then PA: PA ypp | 6.5 | 9.1 | 9.2 | 11.7 |

**RPO, pass spam and formation rows** (2026-11-11, after the mesh read; the RPO pull throws the tagged route at 1.3 s, `H.rpoRep`). Yards per play by snap window:

| Offense | STATIC | NORMAL, DC 45 | NORMAL, DC 75 | SHARP, DC 75 |
| --- | --- | --- | --- | --- |
| RPO Glance, always the pull | 12.4 / 12.9 / 12.0 | 10.3 / 9.2 / 8.5 | 12.0 / 7.5 / 7.9 | 9.8 / 7.0 / 6.9 |
| RPO Glance, 30% give | 10.2 / 10.9 / 10.1 | 10.3 / 8.4 / 9.1 | 10.5 / 7.5 / 8.8 | 10.6 / 8.9 / 8.7 |
| RPO Slant only | 9.8 / 8.0 / 9.0 | 9.1 / 6.5 / 6.1 | 8.0 / 5.3 / 6.1 | 8.0 / 6.1 / 5.8 |
| Glance ×8 then give: give ypc | 4.1 | 5.2 | 5.3 | 5.2 |
| Glance ×8 then smoke: smoke ypp | 3.8 | 3.2 | 2.9 | 2.7 |
| Pistol runs, Trips passes | 6.4 / 6.3 / 6.4 | 7.3 / 6.0 / 4.8 | 6.9 / 5.8 / 5.7 | 6.5 / 4.7 / 5.9 |

Before the mesh read, the always-pull glance gained 20–22 yards a play (0.75 TDs a drive) **at every setting**: the defense learned nothing it could use. The smoke doesn't pay after the glance, because the pass-first defender sits right on it; the give is the counter. The PA counter after IZ ×8 now reads 7.4 / 12.4 / 14.4 / 15.2: that drift was already there at HEAD before this change.

**Targets and where they stand:**
- **Met:** a spammed run loses 40–60% of its yards by snaps 7–15.
- **Met:** a balanced offense loses little at NORMAL (TDs per drive 0.17–0.20 against 0.17) and about 8–15% at SHARP.
- **Met:** the counter after spamming the run gains more than its static baseline.
- **Met:** a spammed RPO or pass play loses 30–45% by snaps 7–15 (glance −40 to −44%, slant −33%); a mixed RPO (30% give) loses less.
- **Flag:** quick-game-only offenses are barely touched. They're a random mix of quick plays, so there's no one play or lane to sit on.
- The auto-runner doesn't "hold D and push" the sneak the way a user does, so a user's sneak starts higher than these 2.6 yards. It should fall by a similar share.

## Reading the coverage: disguise, motion and the hard count
Before this, the presnap picture was always the truth: every defender lined up where his call put him, so the shell never lied, and Cover 2 and Tampa 2 looked the same. Now the defense can lie, the offense has two tools for testing it, and the snap tells the truth.

### Disguise (`Disguise` in `data/defenses.ts`; `DISGUISE` in `game/playState.ts`)
- **A call can show another look.** Its `disguises` list the shells it shows (`two-high`, `one-high`, `zero`) and, optionally, the corners:
  - `press`: zone corners walk up into a press-man look (press bail).
  - `off`: man corners play off, with a zone corner's outside leverage.
- **The safeties show on the side of their real job,** so at the snap the spin is a rotation, not a sprint across the field. The post-snap AI takes each defender from his shown spot to his real job; nothing else changes. A disguised safety gets to his landmark about half a second after a straight one, and the spot he left is open for that beat.
- **The disguises by call:**

  | Call | Shows |
  | --- | --- |
  | 2 Man Under | single-high; two-high with off corners |
  | Cover 1 Robber | single-high with off corners |
  | Cover 2 | single-high; two-high with press corners |
  | Tampa 2, Cover 4 | single-high |
  | Cover 3 | two-high; single-high with press corners (press bail) |
  | Cover 1 Fire | two-high |
  | Fire Zone | two-high; zero with press corners |
  | Cover 0, Cover 3 Sky, Nickel Cat, Bear, Goal Line | never disguised |

  A look that gave up 2+ yards a pass play at either hold, or 1.5+ a carry, against the call played straight (the DISGUISE rows) was dropped: Cover 0 as two-high and as single-high, Cover 1 Robber as two-high, Cover 3 as zero, Cover 3 Sky as two-high, and Nickel Cat as two-high.

- **The DISGUISES setting** (dynasty, ON by default; `SeasonConfig.disguises`) turns them off: every call is played straight. Exhibitions always disguise.
- **How often** is the identity's `disguise` (`IDENTITY.disguise`): 0.3 of snaps, plus 0.006 a point of the DC's ADJUST over 60, plus 0.03 a point of the secondary (the CB and S units' mean), held to 0.10–0.55. Prevent and tries are never disguised.
- **The tells:** a disguiser tips it with odds 0.45 × (1.3 − prc/100). Once the play clock is down to somewhere between :14 and :04, he creeps 55% of the way to his real spot. A fast snap keeps the disguise but catches them away from their spots; waiting may let them give it away.
- **The scouting report** has a tier-2 OC line: "DISGUISES ITS COVERAGE: n% OF SNAPS". It's a warning at 38% and up.

### Motion (`MOTION`)
- **M** sends a receiver in toward the ball (7 yd, no closer than 2.5) and back, at half speed. Each press takes the next receiver: slots first, then wideouts, then tight ends. Routes don't change, since he comes back to his spot, and the snap waits until he's set.
- **Man:** his defender travels with him. On a `bump` call (Cover 1 Robber, Nickel Cat), or on 20% of the other man snaps, the defense bumps over instead: his man slides 35% of the way.
- **Zone:** an underneath defender within 11 yd of him slides 35% of his move; a deep one slides 12%.
- **Motion can force a disguise's hand:** each disguiser rolls 0.35 × (1.3 − prc/100) to give it away and creep toward his real spot.
- So motion is strong evidence, not proof.

### The hard count (`HARD_COUNT`)
- **H** fakes the snap, twice a drive, for 1.5 s of play clock each time (not on tries).
- A disguiser flinches 60% of the way to his real spot for about half a second, with odds 0.55 × (1.3 − prc/100).
- A walked-up blitzer jumps at the line, with odds 0.5 × the same.
- A DL jumps offside with odds 0.1 × his line's mean (1 − prc/100): about 3% against a typical line. That's 5 yards, half the distance inside the 10, and a first down if it reaches the line to gain. Replay the down.

### The feedback
- **The read line** names what's *shown*: it counts the safeties where they stand, so a disguise reads as the look it shows. The **READ HELP** setting is FULL (the shell, front, box, walked-up backers, press and spy), SHELL (the shell only) or OFF. Exhibitions show FULL.
- **After every snap,** a blue line under the result: "THEY WERE IN COVER 3, SHOWN AS TWO HIGH".

### Measured: the DISGUISE section of `npm run balance`
Each disguised call is played straight and then in each of its looks, from the same seeds. The auto-QB never reads the look, so these rows measure only what the spin costs the defense, not what a reader gains.

| Call | Look | Pass 1.2s ypp | Pass 2.2s ypp | Runs ypc |
| --- | --- | --- | --- | --- |
| 2 Man Under | straight | 5.5 | 6.0 | 6.8 |
| 2 Man Under | single high | 5.4 | 5.8 | 6.2 |
| 2 Man Under | two high, off corners | 5.2 | 5.9 | 5.7 |
| Cover 1 Robber | straight | 10.2 | 6.8 | 5.2 |
| Cover 1 Robber | two high | 10.0 | 9.3 | 5.7 |
| Cover 1 Robber | single high, off corners | 5.4 | 7.1 | 5.5 |
| Cover 2 | straight | 7.4 | 12.6 | 6.9 |
| Cover 2 | single high | 8.5 | 13.1 | 5.5 |
| Cover 2 | two high, press | 7.6 | 12.6 | 5.3 |
| Tampa 2 | straight | 4.7 | 10.7 | 6.0 |
| Tampa 2 | single high | 5.6 | 12.6 | 5.7 |
| Cover 3 | straight | 8.1 | 11.6 | 4.6 |
| Cover 3 | two high | 8.5 | 11.4 | 4.6 |
| Cover 3 | single high, press | 9.6 | 12.2 | 3.7 |
| Cover 4 | straight | 10.4 | 9.6 | 5.3 |
| Cover 4 | single high | 7.9 | 8.9 | 5.1 |
| Cover 1 Fire | straight | 9.8 | 9.4 | 3.7 |
| Cover 1 Fire | two high | 11.1 | 8.3 | 4.9 |
| Fire Zone | straight | 12.9 | 10.0 | 3.7 |
| Fire Zone | two high | 13.3 | 9.8 | 4.9 |
| Fire Zone | no deep safety, press | 9.8 | 10.5 | 4.3 |

The pass rows are noisy (a few hundred reps), so read the runs and the big moves:
- **A two-high look costs a run call some of its box.** Cover 1 Fire's and Fire Zone's runs go 3.7 → 4.9 ypc when shown two-high: two-high invites the run, so run against a two-high look you don't trust.
- **Cheap disguises:** Cover 3 as two-high, Cover 4 as single-high and 2 Man Under in either look cost about nothing.
- The harness never reads the look, so these rows show only what a disguise costs the defense, not what it gains against a user who misreads it.

## Hooks for later
- **The ML defense, still to do:** regret matching toward an equilibrium mix at SHARP (hard to exploit when unsure); film from simulated weeks (box-score targets and the OC's style); `+key` columns in the film room, so the payoff table knows what a key buys against each play; the players' own `Lean.key` (today the key is the DC's call-level tag).
- **Deep safeties fitting pure runs:** on a designed run they still come down to 4 yd 0.5–1 s after the snap. Left as is, so the core run rows stay comparable.
- **PA discipline:** a defense that keeps getting burned by play action could bite less (`paBite`) for a while; for now, only nerve does that.
- **The CPU's drives** could learn your defensive play in the same way, if user defense is ever played live.
- **The `wide` front** has no call yet; a pass-rush package for third and long would use it.
- **Play-authored motion:** jet, orbit and across-the-formation motion that changes strength, with routes written for the formation after it. The defense would re-align (man defenders follow, zones rebalance by strength).
- **The DC learning your reads:** disguise more against an offense that keeps beating the straight look, and less when the user keeps burning the rotation.
- **The harness reading the look:** an auto-QB that throws to the side a rotating safety left, so the DISGUISE rows can show what reading it is worth.
