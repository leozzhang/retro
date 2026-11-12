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
- the situation
- a pregame read of your QB: his speed shows up as a couple of QB runs already in the book, weighted by the DC's SCOUT

**The book** is plain JSON, reset each game. It holds decayed counts of what you ran:
- `run`
- `qbRun`: designed QB runs, keeps and scrambles
- `screen` and `pa`: from `playTraits`
- `quick`: a quick-game play, or a throw 6 yards or less
- `deep`: a throw 15+ yards downfield
- `pass`
- each play id
- your short-yardage snaps, kept separately

It also records the success you had against calls with and without each trait: blitz, man, box. The DC's book keeps 0.85 of each older snap. The players' book (`flow`) keeps 0.6, so it's their recent read.

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

### The DC
After each snap the DC builds a **target posture** and moves part of the way toward it:
- **From tendencies,** measured against a normal offense (`DEF_BRAIN.norm`):
  - runs above normal → more box, fewer two-high shells
  - deep throws → more two-high
  - quick game → more man, fewer blitzes
  - screens → fewer blitzes
  - RPOs (`rpo` bucket) → more man and two-high, and the pass-first tag (`tag.rpo`)
- **Buckets:** an RPO the QB gave is a run (and an RPO); one he pulled is a pass, play action and an RPO. A throw 7–14 yd out is `mid`.
- **From results:** each trait gets more weight if it has given up less success than its opposite. He needs about 3 decayed snaps of each before he trusts it.
- **Against a play you keep running:**
  - If one run is 50%+ of the book, or of your short-yardage snaps, he adds box against it on any down, and the Goal Line front opens on any down.
  - If one pass is 50%+ of the book, the players sit on it: their screen, deep and leverage reads are up to `passSpam` × (share − 0.3) stronger ("THEY'RE SITTING ON THE ...").
  - QB runs raise his odds of tagging SPY and CONTAIN.

**How much and how fast** comes from **ADJUST**, the DC's in-game rating (`dcAdjust`, `data/coaches.ts`):
- It follows his SCOUT, seeded per coach. It isn't stored and doesn't touch his other ratings or his worth in the carousel.
- His skill is (ADJUST − 40) / 45, from 0 to 1.
- **Trust:** a sharp DC half-believes a tendency after 3 snaps, a weak one after 7.
- **Speed:** a sharp DC closes 60% of the gap to his target each snap, a weak one 12%.
- **Halftime:** every DC closes the gap completely, so a weak DC mostly adjusts at the half.
- **Misreads:** a weak DC misreads (noise on each dial).

**Limits:**
- Every dial is capped at ±1 × the DEFENSE IQ setting.
- The identity's floor still holds, so a sold-out DC still mixes in every call.
- Tags are capped at 60%.

### The look and the presnap check (`CHECK`, `lookOf`, `checkFor`)
The defense sees your **personnel and formation** once you break the huddle, never the play. Audibles are planned to keep personnel, so the look is the defense's key. The brain keeps a book per look (`lookOf`: "11 Gun Doubles").
- **The players know the look:** their leans move toward what that look has shown (`CHECK.lean` × the team's smarts × confidence). A formation that has only run gets them sitting on the run, and play action from it is the counter.
- **The check:** when a look's tendency differs from the whole book's by `from`+ on a dial, the DC may check to a call drawn with that look's tendency, from the same package. The odds are `odds` × his skill (`skillMin` for a weak DC) × the team's smarts × IQ, at most `max`. It happens once a snap, at the huddle break; an audible keeps the defense. A check is played straight (no disguise), and the presnap shows "THEY CHECKED: THEY'VE SEEN THIS LOOK".
- **Measured:** the check alone is worth little (a redrawn call from shifted dials is often no better). It's the hook the film room (Hooks) will make sharp.

### Smarts: a weak defense is a less smart one (`teamSmarts`, `SMARTS`)
Every in-game adjustment is gated by the DC **and** the team. A defense's smarts is the mean `prc` of its eleven: 50 is `floor` (0.25), 90 is 1 (the reference defense is about 0.87, a 70 unit about 0.56). It scales:
- how much of the DC's posture, tags and sell-outs the defense carries out (`execute`: from `dcMin` 0.5 to all of it)
- the check's odds
- how far the players' read moves toward the look

The players' own reads still go through each one's `prc`. The ADAPT TIER rows check it: the same spammed RPO loses 44% against the reference defense and 27% against a 70 defense; the formation tell 16% and nothing.

### The players
Each snap, each defender gets a **lean** (`Lean` in `sim/player.ts`), from −1 (wary) to 1 (sitting on it), on five things: the run, screens, the QB taking off, the deep ball, and leverage (`inside`, above). A lean is made of:
- the players' recent read of your offense
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
  - It can be said again once that shift has faded under 0.25.
- **At halftime,** "<TEAM> ADJUSTS" lists their biggest adjustments. Your OC's SCOUT decides how many you're told: 1, then 2 at 60+, 3 at 78+.
- **On the prep page,** the OC's report has a tier-2 line on their DC: "THEIR DC ADJUSTS IN-GAME: FAST / STEADY / SLOW (ADJ n)". FAST is 70+, SLOW is 50 or less.

### DEFENSE IQ
A dynasty setting (`SeasonConfig.defIq`, also on the hub's SETTINGS page) and an exhibition line (I):
- **STATIC:** no brain. Calls come from the identity and the situation, as before this system.
- **NORMAL:** the default, ×1.
- **SHARP:** ×1.4 on every dial and lean.

## Measured: the ADAPTIVE section of `npm run balance`
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
- **The ML defense (after the playbook expansion):** the film room (`npm run film`, FILM.md) is built: a table of success by (play, call). In game, the DC models your play-calling per look and down-distance (Dirichlet counts, backoff to the whole book and a league prior) and picks the call that beats it (softmax over expected stop rate, Thompson-sampled from his own results), on top of the identity prior. The check becomes "the call that beats what this look runs". Every knob is gated by ADJUST × `teamSmarts` × IQ; a weak staff only sees a coarse table. At SHARP it blends toward an equilibrium mix (regret matching over the table), so it's hard to exploit when unsure. It would retire the hand-written `gain` dials.
- **Deep safeties fitting pure runs:** on a designed run they still come down to 4 yd 0.5–1 s after the snap. Left as is, so the core run rows stay comparable.
- **PA discipline:** a defense that keeps getting burned by play action could bite less (`paBite`) for a while; for now, only nerve does that.
- **Film study** (phase 5): `TeamState.film` holds your bucket shares from your last few live games, so next week's DC starts with a prior, weighted by his SCOUT. The prep page would say what they've seen.
- **The CPU's drives** could learn your defensive play in the same way, if user defense is ever played live.
- **The `wide` front** has no call yet; a pass-rush package for third and long would use it.
- **Play-authored motion:** jet, orbit and across-the-formation motion that changes strength, with routes written for the formation after it. The defense would re-align (man defenders follow, zones rebalance by strength).
- **The DC learning your reads:** disguise more against an offense that keeps beating the straight look, and less when the user keeps burning the rotation.
- **The harness reading the look:** an auto-QB that throws to the side a rotating safety left, so the DISGUISE rows can show what reading it is worth.
