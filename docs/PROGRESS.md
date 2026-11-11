# Progress

_Last updated: 2026-11-11_

## In progress: pass rush and protection (2026-11-11)
Two rounds in `sim/passPro.ts`; design, constants and sources are in PROTECTION.md.

**Round 1** gave the line a cup: rush lanes, the edge's arc, the tackles' vertical sets, and the QB stepping up.

**Round 2** came from playtest feedback that it was too simple. Edges were always the two outer linemen, blocks held rushers still, the pocket looked disconnected, and blockers slid without moving their legs.
- **Rush roles from alignment**, any position:
  - The widest rusher each side is the edge (a blitzing backer on a fire zone), and the rest work the A or B gap.
  - Each rolls a plan from his ratings: speed, power or counter on the edge; bull or quick inside.
- **Line games** (`DefTags.game`: TE, ET, TT). A crasher drags his blocker across and picks a man blocker (odds by `pbk`), and a looper slips behind him.
  - The CPU DC runs them on about 25% of 4-man rushes, more for aggressive DCs (`IDENTITY.games`, `pickLineGame` in `Game.toCall`). The harness passes no tags.
- **The line's own protection call** (`callProtection`):
  - With a back: a half slide toward the heavier side, the back on the man side.
  - Five-man: man (big on big).
  - A play's `scheme.slide`: a full slide, the back on the backside edge.
  - Zone blockers are matched to rushers one to one each step (`zoneTargets`). They pass a man off only when he leaves the gap, after a recognition beat (`pbk`, `acc`), and never let go of a man still in their gap for a new threat.
- **Blocks wear down** (`REP`): control drains with power and a per-rep roll, plus moves and counters.
  - The rusher always drives at his aim point; the blocker slows and steers him.
  - Edges keep their speed up the arc; the tackle fights the turn, and a tackle in control keeps him wide and deep (`TURN`). A bull push builds over 1.5 s.
  - One dial, `REP.pace` (0.47), was tuned so sacks didn't move.
- **The pocket is connected:** at 2.5 s the tackles are about 5 yd deep, the interior about 2.5, and the edges about 60° around the QB (was 5.5 yd of cup with the edges behind the QB).
- **Pocket rules apply only in the pocket:**
  - Not on screens (the line lets the rush go), and not with the QB outside the tackle box (bootlegs).
  - Sets never go upfield of the stance, and interior blockers set to their man's gap rather than mirroring a backer in space.
  - The QB doesn't climb from a drop shallower than 5 yd.
- **Legs:** blockers and rushers on a moving block step (`fight1/2`, `drive1/2`), and a lineman in his set shuffles with his hands up, facing upfield (`set0–2`, `Player.faceLock`).
- **F1 overlay:** each rusher's role and plan, block control, and the edge's angle; each lineman's Z or M job and pass-offs.

**Measured** (`npm run balance`, against round 1):
- RUN, GAP and the pure-run ADAPT rows are byte-identical.
- Sacks on 3.2 s holds:
  - Plain dropbacks went down: 51 → 35 and 45 → 39 per 120. No more five-man slides leaving an edge free.
  - Play-action went up: 25 → 39 and 28 → 44. A shallower QB holds 3.2 s after a fake. **Flag:** watch this in play.
  - The four rows average 37 → 39.
- Cover 0 at 2.2 s: 87 → 88. Quick throws against Cover 0 take no sacks.
- DEF rows at 2.2 s: Cover 1 Fire 9 → 3, Fire Zone 4 → 3.
- POCKET (2 Man Under, Cover 1 Robber):
  - tackles win 93–95% at 2.5 s (real: 79–90%)
  - first pressure averages 2.9–3.0 s (real: about 2.9)
  - sacks before 3.2 s: 34–35%
- STUNT: no game is stronger than a straight rush (21–48% sacks before 3.2 s vs 34%). Zone handles the TE and ET toward the slide side better than man does (15–18% vs 25–26%); TT is about even. The samples are small.
- `RAT_ONLY=OL,DL npm run ratings`:
  - DL `rsh` is now positive (+0.12; was −0.32), and DL `str` is significant (+0.32).
  - DL `spd` and `acc` are still slightly negative, as before. **Flag**, not tuned.
  - OL `pbk` +0.25 (−9 sacks).

**Checked in headless Chrome:** the cup, a TE stunt picking a man blocker, the leg frames, and the tackles facing upfield.

**Next:**
- Playtest stepping up and the play-action sack rate.
- A QB who reacts to pressure (the CPU QB and the harness) would let `REP.pace` come up toward real tackle win rates.
- Games in the scouting report and a DC line.

## In progress: harder catches, the turn after the catch, crowds (2026-11-11)
Passing was too strong: a perimeter catch ran for big yards, and a ball thrown up into two or three defenders was caught too often. Everything here applies only to passes and the moments after a catch. The run game is unchanged: with their own seed, all 61 RUN rows and the GAP rows are byte-identical, and so are the run-only ADAPT rows. Design is in PASSING.md "Crowds", "Placement" and "Out of the catch".
- **Crowds** (`CROWD`, sim/catching.ts): every defender in reach contests the ball, not just the closest, on every throw type. Each one counts by `pos³`, so a defender at the edge of his reach adds almost nothing, and a ball led a step past the crowd is as safe as one man on him. Touch pass into a tight double: 22% caught, 16% picked; tight triple: 14% and 20%; one man: 48% and 9%.
- **Placement** (`PLACEMENT`, `catchGrade`): the intended receiver records his path when he finds the ball (`Player.track`). At the catch, the throw's placement grades it:
  - IN STRIDE: skips most of the catch ramp
  - REACH: a ball behind him or at the edge of his reach. He keeps 45% of his speed, his hips twist back toward the ball, there's a hands penalty, the `reach` pose and a FINGERTIPS! popup.
  - DIVE: he can't get there on his feet in the last 0.32 s. He lays out (`dive` pose, more reach, a hands penalty), and if he catches it he's down at the spot (the college rule) or scores in the end zone. A diver who misses ends up on the turf.
- **Out of the catch** (`CATCH`, sim/player.ts): his hips (`Player.hips`) turn toward where he wants to go at 5–8 rad/s (by `acc` and `rte`). Until they come around he has 30% of his acceleration and is capped near 2.5 yd/s, and he faces the way his hips do. Every catch also ramps his acceleration from 60% over 0.8 s. Squared up to the QB (curl, hitch, comeback, screen) is a half turn.
- **Defenders on the ball** (sim/ai.ts `onTime`, `CATCH_PURSUIT` in game/playState.ts): a defender breaking on a throw arrives at speed instead of pulling up on the spot. One within 5 yd of the catch who was on the ball reacts in 0.05 s instead of 0.12–0.47.
- **The CPU QB leads by the real flight time** (`cpuAim`, `CPU_THROW.leadIters`). The old distance / 22 s lead put the median go ball 3.4 yd behind the receiver. Once placement counts, that turned every CPU deep ball into a reach, so the harness stopped measuring what a user who leads well sees. **This moves every pass baseline.** Compare against "old code + new lead" (A below), not the old balance.txt.
- **Measured**, A = old code with the new lead, F = this:
  - THROW ALL TOUCH 2.2 s vs 2 Man Under: 11.9 → 7.1 YPP; AUTO vs Tampa 2: 16.1 → 13.0; LOB 2.2 s vs Tampa 2: 61% / 11.4% int → 49% / 17.5%
  - ADAPT quick only: 7.7 → 7.1 YPP early, TD/drive 0.43 → 0.27; screens 0.46 → 0.37
  - ROUTE (thrown to one route regardless of coverage): curl vs 2 Man Under 57% → 31% caught, in 54% → 31%, go 55% → 29%
  - YAC experiment (every pass play × 5 calls, most-open receiver, 1.2 s): mean YAC 11.2 → 8.9, 20+ yd YAC 22% → 18%; with a scripted sidestep at the first defender, 9.2 → 6.6
- **Flag:** INT rates are high when the ROUTE rows throw into two-deep coverage: post and corner vs 2 Man Under at 15–20%. That's the harness throwing into a double blind, which is what's meant to be punished, but it's well above NFL route INT rates (4–6%).
- **Off, for now: the receiver running through the catch** (`PLACEMENT.throughCos` over 1). `seekTimed` makes a receiver pull up on the spot, so nearly every ball was caught at about 3 yd/s. Running through a ball led ahead of him is the realistic in-stride catch, but it took mean YAC from 11.2 to 13.0, a buff to passing. Turn it on once the open-field YAC is tamed.
- **Not reproduced headless:** the user's sprint-and-sidestep past the first defender. A scripted sidestep at 3.5 yd doesn't beat running straight. Playtest it.
- **Not checked in a browser yet:** the `reach` and `dive` sprites, and the hip turn (facing).
- Next:
  - playtest perimeter throws (hitch, out, flat), balls led behind, overthrows, lobs into a double
  - if open-field YAC still feels too high, the next lever is a post-catch pursuit breakdown (a shorter lead within 4 yd), then the tackle radius, both scoped to caught passes
  - then turn the run-through back on

## In progress: aim feel, the gap between QBs in the hand (2026-11-10)
- Experiment for playtesting: a worse passer's drag-back line lags the mouse (accuracy average sets the lag, poise adds under pressure, throw-on-the-run adds on the move), and the ball goes where the lagged line is. Constants `AIM_FEEL` (sim/passing.ts), design in PASSING.md "Aim feel". `window.AIM_FEEL` in dev to tune or switch off.
- Retuned: the lag is now set + pressure + moving costs added up, each from its own rating (accuracy, poise, throw on the run), with moving measured against the aiming jog, so a pocket passer with low TUP drags rolling out. Before, pressure and moving only multiplied the accuracy lag, so an accurate QB barely felt them.
- Fixed: the user's throws on the move counted as about half moving (speed / 6, but aiming slows him to a 3.4 yd/s jog). Aimed throws are now fully moving at that jog, for throw error (`tup`) as well as the lag. The CPU QB and the harness keep speed / 6, so the balance report is unchanged.
- Tuned (2026-11-11): about 20% more lag across the board (`accPer` 0.0043, `pacPer` 0.0054, `tupPer` 0.0066).
- Confidence: the user's shaken QB doesn't lose accuracy on big snaps any more; he gets extra aim lag instead (`CONF.shakenLag`, `shakenAimLag`; CONFIDENCE.md section 1). `window.CONF` in dev to tune it.
- Next: playtest high vs. low QBs on quick flicks, blitzes and rollouts; tune `tauPer`/`vBase`, or drop it.

## Done: the CPU's try after a touchdown (2026-11-10)
- A CPU touchdown in a played game used to add 7 at once. Now `cpuDrive` puts up the six, and `cpuTry` decides the try and shows it. The drive sim and simulated games still count a touchdown as 7, so the season report doesn't change.
- **The call** (`goForTwo`, `TWO_POINT` in `game/situation.ts`): in the 4th quarter the coach follows the classic two-point chart, by the margin after the six. He goes for two when ahead by 1, 4, 5, 12, 15 or 19, or behind by 2, 5, 9, 12 or 16. Before the 4th quarter he always kicks. A touchdown on the last play that wins the game has no try.
- **The odds:** an extra point (`xpOdds`, `PAT` in `game/rules.ts`) is 97% for a median kicker (77 kick accuracy) and moves 0.25% per point of accuracy and of the kicker's confidence edge, within 85–99%. FBS starters run 55–97 kick accuracy, so they make about 91% to 99%. A two-point try uses the overtime sim (`simTwoPoint`): 45% plus 1.2% per point of overall gap.
- **On screen:** a GOING FOR TWO notice, then the two-point key play and its result (the same path as overtime, now taking the half and clock). A kick shows as a replayed 20-yard kick (new key kinds `xp` / `xpMiss`) with an EXTRA POINT: GOOD / NO GOOD notice naming the kicker. Replays are skipped when the DEFENSE key-play level is OFF, but the notice still shows. The story keeps the kick's point on the touchdown's drive, and the two-point try is its own try drive, so the scoring plays still add up to the final. The grades log's always-good `xp` entry now holds the real result, and it's removed when the CPU goes for two.
- Tests: `situation.test.ts` covers the chart and the odds. A 20-yard replay finds a make on the first seed and a miss within about 2.5 seeds.

## Fixed: the QB faces his throw (2026-11-10)
- The QB faced wherever he was moving, so on the drop he faced backward through the whole throw. Now pulling back to aim turns him toward the target, like pressing D, and `stepPlayer` holds his facing through the `throw` and `throwEnd` poses even while he drifts back. The user's ball now leaves from his front hand.
- After a throw, the CPU QB in a replay also turns toward it. His release point is computed before the turn, so the headless reports don't change.

## Fixed: kits swapped on the CPU's drives (2026-11-10)
- `Play` and `KickPlay` gave kits by role: the offense or kicking team wore home, the other team away. The CPU's key-play replays put the CPU on offense, so both teams swapped kits whenever the CPU had the ball. On the road, the user's own snaps also showed the user in home.
- `PlaySetup.homeId` and `KickSetup.homeId` now name the home team, and it wears home on either side of the ball. `setupField` sets it from the season game's `home` (a watched sim passes `game.home`; exhibitions make the user home), and `ReplaySide.home` carries it into replays and FG replays. The postgame tapes record each man's kit, so they come out right too. When it's missing (the harness and the tests), the offense still wears home, so the headless reports don't change.

## Fixed: office names and the league banner (2026-11-10)
- **TO THE LEAGUE:** at level 3 and up, THE LEAGUE banner was 30 px wide for 39 px of text. It now spans the board.
- **RING OF HONOR jerseys:** the full last name shows on the same 36 px jersey. Every name is the same 5 px tall, like a real nameplate. A long one is set narrower: `JERSEY_FITS` steps from the micro font down to half-pixel columns and gaps, drawn in the fine pass (`FINE` in `render/officeArt.ts`). It keeps a pixel clear of each sleeve. A hyphenated or two-word name too long even at the narrowest (COLEMAN-WILLIAMS) breaks onto the body under the sleeves, and the number moves down.
- **Plates:** the year on the conference and national trophies, the Heisman's name, the bowl count and THE LONG HAUL's years now sit on 7 px plates. `plate` centers the text by its ink, so an apostrophe's blank sides don't count, and leaves a pixel clear all round. Before, the text touched or ran past the plate's edges, so it looked cut off. The national trophy's spire is a pixel shorter to make room, and THE LONG HAUL's plate is 28 px (was 20, for 23 px of text).
- **The canvas draws at 2x** (`RENDER_SCALE` in `engine/constants.ts`). The canvas is 1280x720, `main.ts` scales each frame by 2, and everything still draws in 640x360 view pixels. The mouse maps to view pixels (`engine/input.ts`). `itemSprite` returns `{ img, w, h }`, and an item with a fine pass is a 2x canvas.
  - Checked in a headless browser: the field, play call and office look the same as before. Render time on the field was ~0.6-1.2 ms a frame at 1x and at 2x alike.
- **Suffix bug:** names ending in IV, III, Jr. and the like showed the suffix as the last name. `lastName` (`render/officeArt.ts`) drops the suffix and keeps a particle (DEL RIO-WILSON). The Heisman bust's nameplate uses it too.

## Fixed: hub navigation and text that spilled or got cut off (2026-11-09)
- **Sidebar:** SCHEDULE is now first under MY PROGRAM, above PROGRAM. W/S steps through the panels only (HOME, SCHEDULE, then the AROUND THE FBS items), so S on SCHEDULE goes straight to SCORES. Pages open with a click or their hotkey. SETTINGS has one now, G.
- **Home matchup:** the two players always face each other. Before, the away side's player faced away.
- **Text fixes, found with a headless audit** (Edge over CDP: it recorded every `fillText`, flagged overlaps, text past the screen edge or its card, and team or game names cut mid-word, across every hub panel, page, tab and offseason stage for several teams):
  - The hub SCHEDULE sizes its columns to the longest opponent and result. A long rivalry or bowl name wraps under itself.
  - The program page's SEASON schedule shows the opponent's abbreviation when the school name won't fit, and puts a long game name on its own line.
  - Recruiting: the RK column fits 4-digit ranks. Hometowns get 11 characters with no trailing space. STANDING and STATUS no longer touch.
  - Signing day's STILL NEEDS listed a position twice. It now shows four needs a line.
  - Smaller fixes:
    - POLLS no longer cuts long schools.
    - The roster's POS and OVR headers are apart.
    - The portal's MY ROOM headers sit over their columns, and LEAVING names get 11 characters, with where the player went right-aligned.
    - Departures: column spacing, the RUN THE DRAFT and MEET buttons fit their labels, and draft names no longer reach the POS column.
    - The game page's PLAYS tab drops the team names from the score when a long play needs the room.
    - The program page's leaders card shows just NO STATS YET before any games.
  - `drawHint` closes up double spaces in a hint too wide for the bar. The roster hint was.
- **Note:** a full `npm test` run while a browser and dev server are also running can time out five season-sim tests. They pass on their own.

## Done: the ball sits in the carrier's hands (2026-11-09)

- The carried ball is now drawn into the player's sprite (`getSprite`'s `ball`, `drawCarry` in `render/sprites.ts`) instead of at a fixed spot in front of his chest: tucked high under the near arm with the forearm cradling it (standing, running, stumbling, in a block), up by his ear in the cocked hand while the QB pulls back to throw (and back down to the tuck when he cancels), in both hands on a catch, and held out on the punter's drop. The held ball has a dark ring so it reads against any jersey; `outline` skips that color so it isn't outlined twice.
- Poses without a carry drawing (`carriesBall` false: the spike, leap, cheer, spin, down, holder) still draw the ball at its sim spot. Render only: the sim's ball position is unchanged, so balance and tapes are untouched.
- **The hold:** the holder used to kneel right on the kick spot, so the ball sat on his knee and was drawn over him. He now kneels just off it (`HOLDER_OFF` in `data/specialTeams.ts`: 0.45 yd back, 0.4 yd toward the camera) with his hand on the ball's top, and a resting ball (`dead`: the hold, the tee) is drawn in depth order in `kickRenderer`. The FG snap aims at the spot as before (`kickSpot.x + 0.3`, the same distance), so kick timing doesn't change; nothing else reads the holder's position.
- Note: under a full `npm test` run, four season-sim tests (career, confidence, highlights, injuries save/continue) can hit vitest's 5 s timeout from load; they pass alone.

## Done: touchdown celebrations (2026-11-09)
- **The problem:** a scorer froze in the arm-up `catch` pose for 5 s and glided through the end zone. Pick sixes and kick-return TDs glided the same way.
- **Now** (`sim/celebrate.ts`, `CELEBRATE`): the scorer keeps his running frames as he eases to a stop about 4 yd deep, then does one of three celebrations:
  - **spike:** ball raised overhead, then slammed into the turf; the ball bounces free
  - **leap:** tosses the ball aside and jumps twice with both arms up (`POSE_LIFT` raises the sprite off its shadow)
  - **spin:** with a quick dip, he stands the ball on its tip and spins it like a top. It keeps twirling (`Ball.spin`; upright frames 4–7 in `getBallSprite`, with the laces sweeping around) while he pops back up with both arms raised.
- **How it's picked:** a hash of the scorer's number and where he crossed, so it never draws from the play's rng. Kick-return TDs only leap, since the kick play's ball stays in his hands.
- **Where it runs:** the touchdown, pick six, two-point try and kick-return TD paths all go through `startCelebration`. `Player.celebrate` drives the pose in `poseOf` and the timer in `tickTimers`.
- **Replays:** a live snap's tape now keeps 2.4 s after a score (`TAPE.scoreTail`, was 0.8), so postgame highlights show the celebration. Key-play replays get it from the `Play` itself.
- **Checks:**
  - `npm run balance` is byte-identical.
  - `src/celebrate.test.ts` covers the run-out, the stop depth and the pose order.
  - A headless sprite sheet confirmed the six new poses, both facings.
- **Not checked yet:** by hand in a live game.

## Fixed: the fifth signing day froze the game (2026-11-08)
- Leaving signing day for the portal took ~26 s of blocking work, so the game looked frozen, and the save sat at that stage, so restarting didn't help. The recruit pool cache (`data/recruits.ts`) kept only 4 classes, but from a dynasty's fifth signing day on, rosters hold 5 (four on campus plus redshirts, and the class just signed). `overCap` walks every roster through `baseRoster`, and each walk evicted a pool and rolled ~3,800 prospects again on nearly every class switch: ~190 ms a team.
- Now `POOL_CACHE = 8` with least-recently-used eviction. On the slot-2 save (Northern Illinois, 2030) the step takes 0.45 s. Pools are deterministic from their ids, so results don't change.

## Done: game pages and the postgame (2026-11-08)
Every finished game in the league has a page. After a played game, the postgame shows highlights and then that page. See [GAMES.md](GAMES.md).
- **Saved with every game:**
  - defensive stats (`sk`, `defInt`, credited from the cast's `by`)
  - the key plays, `GameResult.plays` (`season/gamePlays.ts`). They're built from a story `simGame` now always tells, which draws no random numbers.
  - the game id on news items
  - `npm run season` is byte-identical apart from the new GAME PAGES section and the careers' new stat keys.
- **The live game's story** (`season/liveBox.ts`): the user's snaps, with who made them (`Play.tackler` for the sacker), the CPU's drives, points as they're scored, and the CPU defense's scores (`against`).
- **Stars** (`season/gameStars.ts`, `STARS`): PLAYER OF THE GAME, BIG PLAY and OVERPERFORMER, scored against each position's usual game. Player of the game over 2 seasons: QB 28%, HB 33%, WR 24%, DEF 12%.
- **The page** (`render/gameScreen.ts`): SUMMARY, BOX SCORE, PLAYS. It opens from SCHEDULE and program SEASON results, SCORES, and news scores (`gameLink`, `gameSpan`). Program and game pages share the back stack.
- **Postgame:** FINAL → the game page → the hub. Up to 2 highlights wait as thumbnails in the SUMMARY's bottom right corner (each its play's opening frame), to click and watch, or H for both. The user's own snaps replay from a tape of the real play (`game/tape.ts`, `drawTape`). The reel favors plays that went the user's way and scores that tie the game or take the lead. A tape of the user being stopped gets no bonus. A SIM GAME with key plays ends on the page.
- **Checked in the browser** (headless Chrome over CDP), with no page errors:
  - a game played from Q4 to the final, the tape highlight, all three tabs
  - links from SCHEDULE, SCORES and NEWS to a game page, then to a player and back
  - a watched sim ending on the page
- **Fixed:** the CPU's yards in a played game had decimals. Its drives started on the unrounded spot where a play or kick ended. `cpuDrive` now rounds it, and `unpackSeason` rounds box scores already saved.
- **Save cost:** about 290 KB gzipped a season, on about 0.95 MB.
- **Not done:** watching another game's highlights from its page, and tackles (they'd need new casting draws).

## Done: live games keep a box score; 8:00 is the default (2026-11-08)
- **The problem:** the user team's season passing and rushing stats were far below every CPU team's. The cause wasn't pacing: a live game added nothing to the box score. `finishSeasonGame` wrote blank team lines and no player lines, so only simulated games and simulated quarters counted. That also zeroed the opponent's line for that game and kept the user's players out of the stat award races.
- **Why we didn't inflate the numbers:** points and yards per game scale together. At 8:00 a game has about 7 drives a team (real FBS: about 12–13), but a user who scores realistically on 7 drives is gaining about 50–60 yd a drive, so the yards should land near the real 390–430 too. Madden and EA's college game don't normalize stats either: short quarters give short stat lines, and the accelerated clock (our `SNAP_AT`) sets the pace.
- **`season/liveBox.ts`:** the live game's box score, built as it's played.
  - The user's snaps are credited to who threw, caught or carried it: `Play.ballMan` (the last offensive player to hold the ball) and `Play.caught`. Sacks and scrambles are rushes (NCAA). FG tries go to the kicker. Two-point tries aren't credited.
  - The CPU's simulated drives are cast and credited the way `simGame` does it. `creditSnaps` and `lineFor` are split out of `credit` (`season/simGame.ts`), and the cast (`castCpu`) is shared with the key plays. `npm run season` is byte-identical apart from timing.
  - A game taken over partway starts its box from the simulated quarters' box (this replaces `partBox`). Exhibitions keep none.
- **8:00 quarters are the default** (`DEFAULT_QUARTER`, `game/clock.ts`) for new dynasties, exhibitions, and saves that never stored a length.
- Tests: `src/liveBox.test.ts`. Not checked by hand in the app yet. Next: play a few 8:00 games and compare the user's yards a game with FBS. If they're still short, look at a pace-adjusted award race, not inflating the sim.

## Done: pullers and lead backs block their man (2026-11-08)
Bug: Pin-Pull Sweep almost never worked, and the I-Form fullback often ignored the man he was supposed to block. Headless traces (every blocker's mark and engagement every 0.4 s) found one root cause: pullers and lead backs had no assignment at the snap and grabbed someone late, by proximity, often a man another blocker already had.
- **Pullers ran to the sideline before looking:** `pullBlock` sent them flat to the hole's y (a kick: 2.5 past it), which on a sweep is 11–13 yd out, and `formEngagements` skipped them until they got there. On Pin-Pull both pullers were outside the back, still behind the line, while the MLB scraped over the top inside them.
- **The TE took the kick-out man:** the gap window gave the head-up end to the TE, so Power O's FB and Counter's kicking guard had nobody and wandered to the SAM or the nickel.
- **Iso's FB doubled the end:** his `lead` path ended behind the line, and `pickRunTarget` then picked the end the TE had, so the MLB came free. QB Power's back did the same.
- **Wide lead blockers looked only 1.8 yd ahead:** on I-Form Stretch and Lead Toss the FB ran his path out to 9–11 yd while the force player came inside him.

**The fix: point-of-attack assignments** (`assignRunBlocks`, `POA`, `Player.poa` / `poaJob` / `turnY`; details in PLAYBOOK.md):
- **Jobs at the snap:**
  - **kick:** the first man outside the last blocker who stays in, reserved before the line assigns. If nobody's there, he turns up as a lead and takes whoever shows.
  - **lead:** the playside backer nearest where he turns up, held out of the line's climbs.
  - **force** (`leadWide`, the new `arc`, a kick on an outside scheme): the alley defender nobody has.
- **Turn-up:** at the hole, or at the edge on perimeter plays, gathering early by his sideways speed. He blocks his man on the way and aims at the first spot on his man's line to the ball (the carrier led like a pursuer) that he can reach first (`cutOff`). He retargets when his man is gone, and a defender counts as taken only if his blocker isn't tied up with someone else.
- **New scheme `pin`** (Pin-Pull): the stayers pin by zone rules without the reach penalty, and the RT's kick becomes the force block.
- **Power Read:** the TE arcs around the read end for the force (`arc` concept), and a back on a perimeter path reads lanes wide on gap runs.
- **Counter GT:** a shorter jab, `[0.3, −1]` → `[0.2, −0.4]`.
- **RUN ASSIST** draws a dotted line from each puller or lead back to his man (FULL through the run, LIGHT until the handoff). Play cards and the playbook page draw pulls to where they turn up (`pullTurnLat`). The playbook labels `PIN` / `PIN AND PULL` and `ARC`.
- **Tried and dropped:**
  - The auto-runner riding the lead blocker's hip until he turned up: much worse (Counter −0.1, Power O 2.5). Waiting behind the line let the backside chase and pursuit arrive.
  - A deeper counter path: also worse.
  - Kicking the outermost lineman even head-up on the TE: an unblocked 6i crashed into the backfield before the FB got there (Power O 2.6, contact −2.6).

**Measured** (`npm run balance` against the last commit's `balance.txt`; YPC against 2 Man / Cover 1 / Cover 0, stuffs in parentheses):

| Play | Before | After |
| --- | --- | --- |
| Pin-Pull Sweep | 2.3 / 0.3 / −0.4 (61–85%) | 3.2 / 2.3 / 3.3 (21–26%) |
| Counter GT | 2.0 / 1.8 / 2.2 | 3.6 / 2.9 / 2.5 |
| Power Read | 2.4 / 1.4 / 0.5 (33–40%) | 9.7 / 7.0 / 1.6 (18–21%) |
| QB Power | 2.1 / 1.7 / 0.9 | 3.9 / 2.4 / 1.2 |
| Lead Toss | 8.0 / 2.7 / 5.6 (14–37%) | 7.9 / 4.2 / 8.9 (15–19%) |
| Power O | 4.4 / 6.8 / 2.4 | 7.3 / 12.3 / 2.6 |
| Power | 4.3 / 4.1 / 2.4 | 9.4 / 6.3 / 2.5 |
| Iso | 8.7 / 4.4 / 4.5 | 8.3 / 5.4 / 3.6 |
| Split Zone | 7.6 / 4.8 / 2.0 | 11.3 / 8.5 / 2.8 |

- **Unchanged:** pass, PA, PLAY, ROUTE and THROW rows are byte-identical. Plays with no puller or lead back move by random-stream noise (they share one stream).
- **RUN ALL:** 4.8 / 10% stuffs → 5.5 / 6%.
- **GAP rows** (Power is a core run): even 4.6 → 5.0, +5 3.6 → 3.8, +10 2.2 → 2.8 (now inside TARGETS.md's 2.5–3.5), NIU v Kent 3.2 → 3.9.
- **Short yardage:** Power against Goal Line 37% → 69% (target 65–70%); Bear: Power 64% → 76%, Iso 79% → 67%.
- **ADAPT:** QB runs up a little (STATIC 2.9 → 3.2 early); the learning defense still takes about 40% off late. Balanced is within noise.
- `npm test`: 4 new tests (Power O kick and lead, Iso's FB on a backer, Pin-Pull's pullers turn up and block, Counter's kick), and the trap test reads `poa`. In a full parallel run, three slow season tests (scouting, portal, coaching) timed out; they pass on their own and before this change.
- Not checked by hand in the browser yet: the RUN ASSIST lines, and the feel of Pin-Pull with the user carrying.

**Flags:**
- **Power O against Cover 1: 12.3 YPC** (median 4.1, 37% 10+). Seven blockers on seven box defenders leaves the robber and the free safety one-on-one with the back. It's a real strength of the play, but too big; not tuned.
- **Power (9.4) and Split Zone (11.3) against 2 Man** are high, alongside Inside Zone's 10.0 there: 2 Man's light box.
- **Power Read against 2 Man: 9.7** with 18% stuffs, boom or bust. Most stuffs are the read end tackling a give the harness (`READ_AT`) should have kept.
- **Counter GT** is better but still below the other gap runs: the backside end and the chasing WILL get the back. Per the user's call, only the jab was shortened.
- **Pin-Pull** stuffs (about 23%) now come from the slot's stalk on the nickel and the TE's pin on the end losing, not from the pullers.
- **QB Power against Goal Line:** 13% on 3rd and 1.

## Done: a bullet into bodies doesn't get through (2026-11-07)
Slant bullets were still too reliable from the pocket.
- **Fixed a bug:** each defender's tip roll came as the ball entered his lane, at its edge, so a ball straight through a lineman rolled as if it barely grazed him. It now rolls at the closest pass (`Play.tipNear`, `tipOdds`).
- **New body zone:** within 0.55 yd of a defender (`TIP.core`), a low ball hits him at 0.85 odds (`TIP.hit`). Below 1.9 yd it hits him whatever he's looking at; above that it needs him reading the QB.
- **Dead balls:** a ball that hits a defender square dies where he is (`TIP.pop.dead`). It no longer carries on to the receiver.
- **Measured** (400 throws each, the auto-QB leading at 1.1 s, blind to the lane):

  | Throw | Complete | Int | Tipped |
  |---|---|---|---|
  | Slant bullet, pocket | 47.5% | 14.2% | 45% |
  | Slant touch, pocket | 66.8% | 3.0% | 0.5% |
  | Drag bullet, pocket | 46.8% | 8.5% | 59.5% |
  | Flat bullet | 84% | – | 3% |
  | Slant bullet, rolled out | about 80% | – | – |

  - Bullets that miss every body are caught about 86% of the time.
  - THROW section: slant bullet 39–47% complete, 15–18% int.
- **Core rows:** PLAY 69.1% / 9.24 YPP (69.9% / 9.30 before), DEF unchanged, ROUTE 55.6% (57.3% before). GAP rows are identical. RUN ALL's stuff rate moved one point from the shifted random-number stream.
- **Flag:** the harness throws blind to the lane, so its bullet rows are the worst case. A user who threads it does much better, which is the point.
- `npm test`: 336 pass.

## Done: bullets get batted at the line (2026-11-07)
A slant bullet on every snap was too reliable. Bullets now have to get through the traffic between the QB and the receiver (`TIP`, game/playState.ts; details in PASSING.md).
- **Lanes:** each unit has its own lane width and odds. Linemen have the widest lane (1.5 yd, odds 0.65), then backers (1.0, 0.45). DBs are unchanged (0.75, 0.35).
- **Linemen on a block** keep 85% of their odds, up from 35%: they read the QB's eyes and get their hands up anyway.
- **The CPU QB** checks each unit's lane before choosing a bullet (`cpuThrowKind`).
- **Measured** (400 throws, the auto-QB leading at 1.1 s):
  - Slant bullet from the pocket: 61.5% complete, 7.8% int, 19% tipped. Touch: 70.4%, 3.3%, 0.8%.
  - The same bullet rolled out of the pocket: 84%, 1.5%, 2.5%.
  - Drag bullet from the pocket: 24.5% tipped. Flats outside the line: about 2%.
  - THROW section: slant bullet 14–26% tipped, drag 27–31%.
- **Tried and reverted:** widening the DBs' lane and raising the pick share dropped deep touch throws against 2 Man Under, so both stayed at their old values. Tips on 20+ yd touch passes are 0.2% (0.1% before).
- **Core rows:**
  - PLAY 69.9% / 9.30 YPP, against 69.6% / 9.40. Touch passes pick up a few tips (dump-offs into a rusher).
  - GAP rows and RUN ALL are identical. The per-play RUN rows move only because the extra tip rolls shift the shared random-number stream.
- **Flag:** a touch dump-off under 10 yd with a rusher in the QB's face is now batted about 30% of the time (12% before), in a small sample.
- `npm test`: 336 pass.

## Done: each throw type has its own job (2026-11-07)
Each throw type now has its own use and its own costs. Details are in [PASSING.md](PASSING.md).
- **BULLET:**
  - Range is cut from 55% to 42% of max (about 26–29 yd), so it's short and intermediate only.
  - The receiver has to gather it (`GATHER`, `startGather`, sim/player.ts): 75% of his speed through the catch and 60% of his acceleration for 0.35 s. Good hands ease both. That takes a bullet's yards after catch from 11.6 to 9.6 per catch (touch: 7.9), and its yards per play from 12.1 to 10.9 (touch: 10.4).
- **TOUCH:** unchanged; it's the baseline.
- **LOB:** a jump ball (`JUMP`, sim/catching.ts, `catchOdds`'s third argument).
  - In the contest, being a step closer matters less.
  - The receiver gets surer hands (the fewest drops) and a contest boost from `cit`.
  - 80% more of the non-catches are picks.
  - THROW ALL: lob int 7.5–11.5%, touch 0–3.3%.
  - The deep lob against zone went to 80% complete while the flattening also applied to uncontested catches. Limiting it to the contest brought it back to 72% (it was 66% before).
- **Core rows (PLAY, PA, DEF, ROUTE, GAP, ADAPT) are byte-identical.** They throw TOUCH, and touch's `jump` and `gather` are 0.
- **Still flagged:** BULLET edges TOUCH in completion rate on clean short throws (flat 83–84% vs 65–71%). The gather now takes back the yards after the catch, so the edge in yards is small.
- `npm test`: 335 pass, 3 new: bullet range, gather, jump ball.

## Done: eyes on the ball, and three throw types (2026-11-07)
Before this, only settle routes knew whether a receiver was ready for the ball (`set`). A slant's stem caught as well as its break. A defender either saw the throw or didn't, and every pass was the same arc. Details are in [PASSING.md](PASSING.md).
- **Eyes and finding the ball:**
  - Every player has `eyes` (0..1, looking at the QB). Receivers turn their head out of the break (`RouteDef.look`, or `lookDepth` 12 yards on go and seam routes; screens and swings look from the start).
  - Defenders: zones, spies and rushers 1; man defenders still backpedaling 0.8; backers in man 0.7; trailing 0.
  - At the throw, `eyes` becomes `findAt` (`FIND`). A receiver who hasn't found the ball when it arrives catches about half as often (`READY`). The receiver it's meant for keeps running his route until he finds it.
  - A defender who never found it can't pick it. A trailing defender finds it no sooner than 0.8 s before it lands.
- **Throw types:**
  - BULLET, TOUCH and LOB (`THROWS`): speed, arc, range, error, pressure error, catch radius. A bullet's speed scales with `arm` (`kindSpeed`), and it's hot short and a rope deep (`hotness`).
  - TOUCH is the old arc exactly.
  - Passes can be tipped in flight by a defender reading the QB with the ball under his reach (`TIP`). A tip is a pick or a free ball.
  - The wheel or `1` picks the type (TOUCH each snap); the arc preview and a label by the reticle show it, and the aiming hint names the keys.
  - The CPU QB picks its type (`cpuThrowKind`) on replays.
- **Animation:**
  - A receiver's helmet turns back to the QB once he's looking. Hands go up once he's found a ball coming down near him (sprite `Look`).
  - Defenders reading the QB face the backfield; trailing man defenders show their backs.
  - Checked in the browser build over the DevTools protocol: the head turn, the frames picked in flight (`back`, then `hands` within 5 yd), the LOB label and arc, wheel and `1` cycling, no console errors.
- **Fixed along the way:** the intended receiver was whoever stood nearest the landing spot at release. On a long lead that was often somebody else. Now it's who's headed there (his position along his velocity at arrival).
- **Measured** against a baseline from the last commit (all rows move, since tip rolls change the RNG stream):

  | Rows | Before (comp / YPP) | After (comp / YPP) |
  |---|---|---|
  | PLAY | 68.7% / 7.74 | 69.4% / 7.53 |
  | PA | 69.9% / 8.32 | 65.9% / 7.58 |
  | DEF | 71.1% / 9.35 | 72.1% / 9.17 |
  | ROUTE | 58.0% / 12.7 | 59.6% / 13.2 |

  - GAP rows are byte-identical. ADAPT moves within noise, but the learning defense takes less off a quick-only offense than before (16+ snaps 4.9 → 5.7).
  - The new THROW section's shape is in PASSING.md.
- **The harness under-leads its throws.** The auto-QB leads by distance/22 s, short of the ball's real flight time. Leading by the real flight time took PASS from 4.7 to 8.0 YPP and PA from 7.8 to 12.7. It's kept, scaled per throw type (`CPU_THROW.lead`), so the rows stay comparable. A user who leads well may find passing easier than the balance rows say.
- **Flag, not tuned: BULLET still edges TOUCH** on most short and intermediate routes through a clean lane (flat 84–92% vs 71–73%; quick out and in vs man +12–17 points). It loses deep against zone, and its costs are tips (2–12% on slants, ins and curls), a narrower catch radius, hot drops, and more error under pressure. The harness picks receivers by separation, not by lane, so it under-counts tips. Decide in play whether TOUCH needs a buff or BULLET more cost.
- `npm test`: 332 pass, including 11 new in `passing.test.ts`: throw types, readiness, eyes on a slant and a go, defender eyes by coverage, tips on bullets vs lobs.
- **Next:** non-intended receivers near a popped-up or overthrown ball should go for it; the CPU defense's DC could learn the user's throw types; key-play replays of tips.

## Done: the fan pulse's QB debate is league-relative (2026-11-06)
Bug: "QB PLAY IS THE QUESTION" showed for ~43% of teams (nearly the whole Mountain West), and the "real deal" line never showed. The QB signal judged real-world YPA (under 6 bad, 7.8+ good), but the sim's box score puts every starter near 4.5 YPA.
- The QB is now ranked by NCAA passer efficiency against every team's leading passer this season (`PULSE.qbHot` 0.15, `qbCold` 0.1, `qbPicks` 3; `season/fanPulse.ts`). In a probe season, the debate showed for 9 to 14 of 138 teams from week 6 on, and the real deal for about 19.
- When the INTs aren't the problem, the debate is about the passing game stalling, not his TD-INT line.
- **Open, not fixed: the box score's passing scale.** Per team-game: 59 att, 35 cmp (58.7%), 267 yds, 4.5 YPA, 7.7 yds per catch. Real FBS is about 32 att, 20 cmp, 230 yds, 7.2 YPA, 11.5 per catch. Each pass snap is cast as a short catch at the drive sim's per-play gain, and `credit` adds 0.61 hidden incompletions per catch on top (`season/simGame.ts`, `CAST.completion`). Scores and team yards are fine. Season passing totals, the Heisman's production and anything else read against real numbers are off.

## Done: reading the coverage: disguise, motion, the hard count (2026-11-06)
Before this, the presnap picture never lied: every defender lined up where his call put him, and the HUD named the shell. Details are in [DEFENSE.md](DEFENSE.md), "Reading the coverage".
- **Disguise:** 8 of the 13 calls can show another shell (and press or off corners) and spin to their real coverage at the snap. The safeties show on the side of their real job. How often comes from the identity (`IDENTITY.disguise`: about 30%, by the DC's ADJUST and the secondary). There's never a disguise in prevent or on a try. Tells: a low-`prc` disguiser creeps late on the play clock.
- **Motion (M):** yo-yo motion with no route changes. His man defender travels with him (some calls, and 20% of man snaps, bump instead); zones slide. Motion can force a disguiser to give it away. The snap waits until he's set.
- **Hard count (H):** twice a drive, for 1.5 s of play clock. Disguisers flinch, blitzers jump, and about 3% of the time a DL jumps offside (5 yards, a first down if it gets there).
- **Feedback:** the read line names the *shown* look. The READ HELP setting (FULL / SHELL / OFF; exhibitions use FULL) and a blue line after each snap: "THEY WERE IN COVER 3 + SPY, SHOWN AS TWO HIGH". The scouting report has a tier-2 OC line, "DISGUISES ITS COVERAGE: n%".
- **Measured:** every existing `npm run balance` row is byte-identical to a baseline from the last commit (no disguise or motion = old behavior). The new DISGUISE section (table in DEFENSE.md) shows what each look costs the defense. Looks that cost 2+ yards a pass play or 1.5+ a carry were dropped (Cover 0 in both looks, Robber and Cover 3 Sky and Nickel Cat as two-high, Cover 3 as zero).
- **The DISGUISES setting** (ON / OFF) on the dynasty's SETTINGS page. The settings rows are tighter (18 px apart) so all ten fit above the button.
- `npm test`: 4 new tests (a disguise moves only its show defenders, the spin, motion man vs zone and the snap lock, a hard count on a straight call). Checked by hand in the browser build: the presnap look, M, H, the reveal line.
- **Not done yet:** a READ HELP toggle on the exhibition screen (its options line is full); play-authored motion (jet, orbit); the DC learning from the user's reads; a harness that reads the look.

## Done: the run game against a better defense: graded blocks and the pile (2026-11-06)
Bug: with a weak team (Northern Illinois, off 60 against Kent State's def 65) almost every run went for no gain or a loss, with the DL through the line at once. The balance harness only ever tested offense +2 (90 v 88), so it never saw it.

**Diagnosis** (headless probes; the new GAP rows keep measuring it):
- The rating *level* doesn't matter; the *gap* does. Reference rosters at every level from 55 to 90 gave the same curve: about 4 YPC at even, 2.0 with the defense 5 points better, 0.8 at +10, and −0.2 at +15.
- Real rosters matched: NIU v Kent 1.9 YPC with 29% stuffs and first contact 1.3 yd behind the line; Georgia v Kent 28 YPC; NIU v Georgia −1.7.
- About 90% of stuffs were a DL shedding about 0.5 s after the snap. A run block was all or nothing: power linear in the rating gap against an 8-point roll, then a random shed, after which the defender was fully free. A 5-point better DL won half his blocks, and some DL won almost every snap.
- Real lines differ far less: ESPN's NFL team run-stop win rate runs only about 24–36% from best to worst.

**The new model** (`sim/runBlocking.ts`; the user's design: a defender can be fully blocked, partly blocked or free):
- **Squeezed talent edge** (`RUN_GAP`, `runTalent`): a defender's rating edge over his blocker counts at 0.5 near even and saturates past about 10 (tanh). It's measured from the edge equal-talent players at those two positions would have (`evenEdge`, from the templates), so a WR stalking a corner plays as before.
- **Block control** (`RUN_CONTROL`, `Player.blockControl`): 1 at contact, worn down while the defender wins (faster the more he wins), barely worn while he loses, and won back by a winning blocker. He's off at 0, so a block now breaks gradually, never on a coin flip at contact.
  - **At the point of attack** the fight speeds up, and even a losing defender works to get off (`near`, `nearFloor`), less when walled off.
  - **Arm tackles:** a defender still on his block can reach the carrier within `armReach`, with odds that grow with the control he's won (`armOdds`). A stood-up defender gets 6%; one nearly off gets about 56%. Pass pro keeps its flat `ARM_TACKLE`.
  - The old `SHED_WIN` and `SHED_LEVERED` rates are gone.
- **The pile** (`PILE`, `pileCap`, `Play.pile`): an engaged pair directly in front of the carrier near the line is a wall. He moves forward no faster than the pile, plus his own push by strength. He rides a drive block forward, is held up or driven back by a surge, and can bounce to another lane. `laneScores` reads a lane with a pile in it as shut, so the auto-runner and the daylight streaks show the holes between blocks. This is how short yardage is won and lost: by surge, not by tackle odds.
- **Scrimmage tackle odds squeezed** (`TACKLE_GAP`, `tackleChance`, `sim/tackling.ts`): 0.8 at even and 1.2% a point near even, saturating through a tanh. An elite back against a weak defense broke 60% of tackles; now it's about a third.
- **Renderer:** a run block's ring flickers when its control is under 0.3 (`BLOCK_READ.control`), instead of by power.
- **Tried and dropped along the way:**
  - A 0.4 s stalemate ramp on the old random shed: fine numbers, but still all or nothing.
  - A bigger per-block roll (`BLOCK_ROLL_SD` 11–14): more stuffs at every gap without flattening the slope.
  - A lower OL drive edge (`RUN_BLOCK_EDGE` 1 or −1): steepened the slope again.

**Measured** (`balance.txt` against a baseline regenerated just before; TALENT GAP rows are new):

| GAP row | Before | After |
| --- | --- | --- |
| def −20 | 17.7 ypc, 1% stuffs | 14.2, 1% |
| def −10 | 9.5, 6% | 7.0, 4% |
| even | 4.3, 19% | 4.6, 9% |
| def +5 | 2.1, 26% | 3.6, 15% |
| def +10 | 0.9, 43% | 2.2, 23% |
| def +20 | −0.9, 77% | 1.4, 31% |
| NIU 60 v KENT 65 | 1.9, 29%, contact −1.3 | 3.2, 14%, contact −0.4 |
| UGA 88 v BAMA 88 | 4.0, 10% | 4.9, 6% |
| UGA 88 v KENT 65 | 27.8, 2% | 19.1, 1% |
| NIU 60 v UGA 91 | −1.7, 92% | 0.7, 36% |

- **Short yardage against the short-yardage package** (TARGETS.md: sneaks about 83–87%, other runs about 65–68% on 3rd or 4th and 1, NFL):

  | Front | Power | Iso | QB Sneak |
  | --- | --- | --- | --- |
  | Goal Line | 52% → 36% | 73% → 78% | 76% → 63% |
  | Bear Cover 1 | 48% → 74% | 47% → 64% | 74% → 94% |

  Against the base calls, 3rd and 1 converts more than before (Power about 85%, Sneak about 98%), which is fine for a light box.
- **The core:**
  - Core runs: 4.1 ypc / 15% stuffs before, 4.9 / 8% after.
  - RUN ALL: 3.9 / 16% before, 4.9 / 9% after.
  - DEF light boxes up: 2 Man Under 4.7 → 6.3, Cover 2 4.8 → 6.1. Loaded boxes about level: Cover 0 2.7 → 2.8, Goal Line 3.0 → 3.2.
  - Pass rows move by RNG noise only: mean PASS ypp 4.5 → 4.8, PA 8.1 → 8.3, PLAY 7.7 → 7.7.
- **ADAPT, IZ spam:** STATIC 4.2 → 5.5 ypp. SHARP still takes about 40% off late (3.3); NORMAL DC 45 about 11%.
- **`npm run ratings` (OL, DL, RB):**
  - OL `rbk` +0.87 → +0.25 (±0.19), about 0.5 YPC per 15 points.
  - DL `bsh` +0.15 → +0.28 (±0.18).
  - RB `spd`, `str` and `elu` are unchanged and significant.
- `npm test`: 317 pass (new tests in `runGame.test.ts`: the squeeze, block control wearing and the arm tackle, the pile, tackle saturation, and the gap ordering; the levered test in `logic.test.ts` now compares control wear).
- `npm run season` not run: CPU drives are simulated (`DRIVE_SIM`), with no run blocking.

**Flags:**
- **Even matchups are too clean:** 8–9% stuffs against the 15–22% target, and light boxes at 6+ YPC. Stuffs now come only from dominant reps and unblocked defenders. Next lever: something independent of talent, like slants and stunts or a missed assignment, rather than a bigger talent slope.
- **OL `rbk` and DL `bsh` matter less.** They're about 0.5 YPC per 15 points, inside the report's 2-SE band. Line talent and the gap slope are the same lever: a 15-point OL deficit is a 12-point talent gap.
- **The offensive side is still steep:** Georgia v Kent is 19 YPC, mostly speed (`maxSpeed` is shared by every route and pursuit, so it's left alone). Only the user's offense plays on the field, so this matters only for a powerhouse user against a minnow.
- **Short yardage is uneven by front:** Goal Line stops Power and the sneak more than real life (36% / 63%), and Bear less (74% / 94%). The Goal Line front puts bodies in every gap, so the pile is everywhere.
- **Not played by hand yet.** Check NIU v Kent State on IZ and Power with patience and the cut. Watch that losing blocks still clog lanes without the defender tackling from inside his block, that the daylight shows the gaps between blocks, and that holding D on the sneak behind a stalemated center creeps forward.

## Done: fan pulse stories (2026-11-06)
"What the fans are saying" now reads differently from program to program. Design and thresholds are in [PROGRAM.md](PROGRAM.md#the-fan-pulse).
- **Stories** (`season/fanStories.ts`, `STORIES`), about 40 new signals:
  - **Rivals:** streaks, the coach's record against the rival, rivalry week, and the rival's season (envy or schadenfreude).
  - **The coach's story:** steady but never more, can't win (or wins) the big ones, bowl runs.
  - **Peers:** a conference mate or rival that hired the same winter and is clearly doing better ("what could have been") or worse.
  - **Coaches who left:** the old coach elsewhere (bitter, awkward or vindicated) and coordinators hired away.
  - **The draft:** the first overall pick, the nation's or conference's most picks, a named first-rounder at a smaller school, first-round streaks, early entrants who went late, a thin T1 draft.
  - **This season's texture:** close losses, winning and losing runs, scoring extremes, unbeaten at home, the bad loss and the signature win.
  - **Real history:** title droughts, a first playoff trip or still waiting, years in a new conference, bowl streaks and droughts, the best season in years, Heisman lore, all-time win milestones.
  - **Recruiting:** five-star commits, the state's top recruit staying home or going to a rival, big portal arrivals.
- **Kept for it.** `TeamYear` gains `rv` (rivalry results), `big` (W-L against the AP top 25) and `close` (one-score games). Helpers in `program.ts`: `yearExtras`, `rivalrySeries`, `splitRecord`, `coachStart` and `bowlGame`.
- **Selection.** Up to 5 points, one per group (results, race, coach, players, rivals, peers, history, offseason, texture) while others have something to say, with a ±15% hash jitter. Most signals have more wordings. `Pulse.all` holds every signal, and the mood still uses all of them. Named rivals and peers are links.
- **Fixed:** a conference title drought named today's conference for a title won in another league (South Carolina's 1969 ACC title read as an SEC title). Now it names the conference only when the record shows it.
- **Checks:**
  - `npm test`: 312 pass. `program.test.ts` adds 5 tests: the new season fields, a rivalry streak across seasons, the group cap, variety (70%+ distinct sets, no story on more than half the teams), and peers hired the same winter.
  - `npm run season` (2 seasons): identical to the last commit apart from timing lines.
  - A 3-season dump of all 138 pulses was read by hand. 95–128 distinct sets per snapshot, and every page fits its points.
  - Not yet looked at in the app itself.
- **Choices:** rivalry history counts dynasty games only (no researched real series), and there are no fictional pro careers: the draft is all the game knows.

## Done: program pages for every team, clickable names, the PLAYER REGISTRY (2026-11-05)
Design and numbers are in [PROGRAM.md](PROGRAM.md).

**Real history** for all 138 teams through 2025 (`docs/research/history_*.json` → `scripts/build_history.py` → `data/fbs/history.ts`). Each team has its title years (FCS/DII too), conference titles, CFP trips, bowl record, Heismans, all-time record, its 2026 coach's first season, and its 2021–25 seasons.
- **Sources.** Mostly Wikipedia; sports-reference blocked the research. Spot-checked by hand: Alabama, Ohio State, Georgia, Michigan, Indiana, Notre Dame, Texas, LSU, Clemson, USC, Oklahoma, Oregon, Boise State, JMU and NDSU.
- **Weakest numbers.** All-time records (off by a few games, and vacated wins are counted differently) and a few bowl counts. Each team's `notes` field lists them.
- **HISTORY setting.** A new-dynasty-only setting, REAL or FRESH START, where every team starts empty. The hub's SETTINGS page shows it but can't change it. The settings rows are 3 px closer so eight fit.

**Dynasty history** (`season/program.ts`):
- `SeasonSummary.teams`: every team's season when it completes (record, AP, conference title, playoff seed and round, bowl, coach). The Heisman winner's team is kept too.
- The chronicle: each team's big news kept past the season (salience `newsWeight`, at most 12 a team a year, 10 years).
- Trophies, season rows and coach tenure.

**Fan pulse** (`season/fanPulse.ts`): about 15 signals become a mood (FURIOUS to EUPHORIC) and the top 4 talking points. Among them:
- results against the pregame odds
- the coach's year crossed with results, and the hot seat
- the QB's line and class
- the Heisman race, and starters lost for the season
- the polls and the race, the rivalry, last week
- the trend and droughts, recruiting, the draft, portal losses

**The page** (`render/programScreen.ts`, screen `program`): OVERVIEW, SEASON, HISTORY, NEWS and REGISTRY, for any team.
- **PROGRAM (H)** replaces PLAYER STATS on the sidebar.
- **PLAYER REGISTRY** is the renamed stats page. It's now the REGISTRY tab and works for any team.
- **Esc** walks back through the pages opened.

**Links** (`render/links.ts`): team names on the hub panels and the program pages open the team's page.
- **Hub panels:** STANDINGS, SCORES, POLLS, NEWS, HOME, SCHEDULE, LEADERS, AWARDS and PLAYOFF.
- **Player names:** news, leaders, awards and the pages. The user's players open their roster card; other players open their team's REGISTRY.
- **Roster card:** a click on the name (or C) opens the player in the registry.
- **Feel:** a pointer cursor and a gold underline on hover.

**Checks:**
- `npm test`: the new `program.test.ts` has 7 tests: season rows against `records()`, baseline plus dynasty trophies, FRESH, the chronicle across `nextSeason`, tenure, pulse determinism and its worry/hope cases, and link matching and wrapping. One long existing test (`season.test.ts`, the save round trip) timed out under full-suite load once and passed on rerun; that's the preexisting flake.
- `npm run season` (2 seasons): identical to the last commit apart from timing lines. `npm run balance` wasn't run, since gameplay didn't change.
- Driven in headless Chrome over CDP:
  - every tab for Georgia, Alabama, Michigan, Kent State and NDSU
  - hover and click on a STANDINGS row (opened Texas), and a click on the roster card's name (opened REGISTRY)
  - a year-two Ole Miss page after its sim title (trophy case, HISTORY, chronicle)

**Not done yet / next:**
- Links on the portal, recruiting, carousel and departures screens.
- Not played by hand.
- The pulse is flavor only. Hooking it into morale or recruiting would be a design call.

## Done: aim slow motion is a setting, off by default (2026-11-05)
- Aiming a pass or a punt no longer slows the game. The SLOW AIM setting (OFF / ON) turns `AIM_TIME_SCALE` (0.65) back on: `SeasonConfig.aimSlow` (missing = off, so existing dynasties lose the slow motion until they turn it on), a SETTINGS row, and M on the exhibition screen.
- The exhibition options line is shortened to fit four options (DRIVES, IQ, ASSIST, SLOW AIM); a click picks the segment under it. The settings rows are 2 px closer so seven fit above the button.
- Settings cards (new dynasty and the hub): a click only picks the card so its help text shows. Its < and > change it once it's picked; clicking the card's body no longer cycles it. Keys are unchanged.
- The run's slow motion (`RUN_ZOOM.slow`) is unchanged. The headless harness never used the time scale, so the balance report doesn't move.

## Done: fewer ball-only key plays (2026-11-05)
Bug: some key plays showed just the ball sliding, with no players, under BIG PLAY or FUMBLE. That's the card, shown when no seed in `REPLAY.maxTries` replays like the sim's snap. Since snaps are cast to real players, the match also needs the cast slot (and the cast DB on a pick), and about 8% of key plays found none: QB runs most of all (only 3 designed QB runs to try), then long runs, picks, and long catches by one receiver.
- `REPLAY.relaxAt`: the search loosens as tries run out. After 45% of them, anyone may have the ball (the caption names the replay's player). After 75%, the yards may miss by twice as much, and a pass or run credit may show as either. Strict tries draw exactly as before. `ReplaySetup.relax` records the level so a found replay replays identically.
- QB runs also try the zone reads and options the QB can keep.
- Cards went from 60 of 781 to 6 between close teams, and 4 of 618 in lopsided games. The cards left are 40 to 50+ yard plays.


## Done: situational CPU coaching, clock-and-score defense, casting snaps to real players (2026-11-04)
Bugs:
- In overtime, going second and down 7, the CPU kicked a field goal on 4th down and lost. The drive sim never saw the score, so it kicked whenever a kick was 52 yards or shorter, and on the last snap even when a field goal couldn't tie.
- The defense read only down and distance.
- CPU drives' replays were forced to the sim's random outcomes, with whoever happened to be open.

**Situational coaching** (`game/situation.ts`, `SITUATION`):
- `simulateDrive` coaches the score and the clock when its `DriveClock` has `lead`. Every caller passes it now: `cpuDrive`, `otCpuTurn`, `simGame` and its overtime, `simPart`.
- It covers 4th downs (kick only when the points help; overtime has no punts), the last-snap kick or heave, per-snap tempo (hurry, milk, kneel), and the pass lean. The rules are in SIMULATION.md.
- Without `lead` a drive runs as before.

**Defense** (`data/identity.ts`):
- clock-and-score dials: prevent against a one-score team late (two-high, no pressure, plus the `prevent` tag: no press, deeper corners and deep zones, `PREVENT` in `sim/ai.ts`)
- a sell-out against a team milking the clock
- extra box on inches

The CPU's live defense and every replay's defense (so the user's own defense on CPU drives) call them. See DEFENSE.md.

**Casting** (`season/cast.ts`, `CAST`): each simulated snap goes to real players, weighted by ratings and by the gain:
- long catches lean to fast, sharp receivers
- picks lean to the DBs with the best hands and coverage
- sacks lean to the best rushers

The box score is now the sum of cast snaps (`credit` in simGame.ts). The story keeps the cast per snap (`DriveCredit.snaps`), `creditFor` reads it directly (the nearest-yards matching is gone), and a replayed pick has to be the cast DB's. Live CPU drives are cast on their own seeded stream. `TARGETS`, `QB_RUN_SHARE` and `INT_SHARE` moved to cast.ts (still re-exported from simGame).

**Measured** (against a baseline regenerated from the last commit):
- `npm run balance`: every core, DEF and per-play row byte-identical. Only the ADAPT rows moved by a point or two, from the inches box.
- `npm run season`, closer to the real targets on every scoring line:

| Line | Before | Now | Real |
| --- | --- | --- | --- |
| Points per team | 26.1 | 25.7 | 26.5 |
| One-score games | 33.4% | 37.6% | 38% |
| Won by 28+ | 20.1% | 18.0% | 18.9% |
| Won by 35+ | 11.9% | 10.0% | 10% |
| Overtime | 3.6% | 4.3% | 5% |
| Yards per team | 428 | 417 | ~390 |

- Stat leaders moved toward the stars: the receiving leader went from 1589 to 1868 yards, the rushing leader from 2551 to 3106, and the passing leader from 6689 to 5502.
- K growth now crosses the 15% flag (1.61 against a 1.39 mean, 1.59 before). That's noise-level, next to P's existing flag.
- PARTIAL SIM is within noise.
- Everything else is within noise.

**Not checked by hand yet:** in the app, a CPU 4th down in overtime after the user's touchdown; the CPU defense's shells when the user trails late; CPU key plays naming the star receivers and the DBs on picks.

**Tests:** `situation.test.ts` (4th-down and kick rules, tempo, an OT drive down 7 never kicks, a lead kneels out; the defense's prevent and inches; the casting leans). `highlights.test.ts` now counts a two-point try as a scoring key play; seed 14 now reaches a 3rd overtime.

## Done: FBS overtime on the field and in the sim (2026-11-03)
Bug: a live game tied after four showed FINAL: TIE, then `settleTie` quietly simmed an overtime after the final screen, so the hub showed a win or loss the user never saw.

- **Rules** (`OVERTIME`, `simTwoPoint`, `game/rules.ts`), shared by the sim and the field: untimed periods with no kickoffs or punts; each team starts at the opponent's 25; the order alternates every period; a touchdown's try is a kick or two in the 1st OT and must be two from the 2nd; from the 3rd OT on, each team gets one two-point play from the 3; a defensive score ends it, and so does the team going second taking the lead (a walk-off six has no try). A simulated two-point try converts 45% plus 1.2% per point of overall gap (25–70%).
- **Clock** (`clock.ts`): quarters past the 4th are OT periods (`inOvertime`). The game clock doesn't move (the play clock still does). Labels read OT, 2OT, 3OT.
- **Live game** (`game.ts`: `endRegulation`, `otTurn`, `otCpuTurn`, `otChange`, `otNext`): tied after the 4th, there's a coin toss (the winner defers). The user's possessions are played on the field, and the call screen forces the two-point try from 2OT. The CPU's are simulated untimed, with their key plays. The final reads FINAL/OT or FINAL/2OT, and the season gets the period count (`GameResult.ot`). `settleTie` stays as a guard only.
- **Sim** (`simGame.ts` `overtime`): the same rules. Two-point tries are their own one-snap story drives (`StoryDrive.try`, half = 1 + period), shown as key plays (TWO-POINT TRY GOOD/STOPPED). A watched SIM GAME that went to overtime shows an OVERTIME card before the OT plays and a FINAL/OT scorebug.
- `npm run season`: within noise of before (overtime is still 3.6% against the real 5%).
- Not checked by hand yet: playing a tied game into overtime in the app.
- Preexisting: under full-suite load a few long season tests time out at the 5 s default (a different set each run, the same without this change).

## Done: run game revamp, part 1: control, reading the line (2026-11-02)
Running was right-click, hold Shift and hope: the back got the ball already at speed and auto-driving downfield, W/S only gave a 45° drift, and the line drew as one pile.

**The runner** (`userControl`, `game/playState.ts`):
- **Jog:** off the sprint every user-controlled player runs at `JOG_SPEED` (0.74 of top speed, was 0.86), so the sprint is the gear that hits the hole.
- **Patience:** after a handoff or on a designed QB run (not a receiver after the catch), within `RUN_CTRL.zone` (2 yd) of the LOS:
  - with no key held he coasts at half speed on his heading instead of auto-driving downfield
  - W or S alone slides him along the line
- **Cut** (Space while holding W or S; only a back, RB or FB, carrying on a called run: `Play.canCut`; `JUKE`, `cutSpeed`, `sim/player.ts`):
  - a near-instant dash sideways (9–15 yd/s for 0.17 s at 8× acceleration, by a cut skill of half `acc`, half `elu`: about 1.5 yd for a fullback, 2 for an average back, 2.5 for an elite elusive one), then a plant that kills most of the sideways speed; once a play, 12% of the sprint bar; fading afterimages show it
  - it stops short against anyone within 1 yd in its path (`blockCut`), so it can't pass through bodies
  - a tackler who closes mid-cut from in front or level has his odds cut by up to 55% (`jukeTackleMul`, by `elu`), stumbles, and the carrier keeps his speed (MADE HIM MISS!)
  - a cut with nobody there just loses ground
  - it replaced a first version on Q/E (a 6 yd/s hop with a 1.2 s cooldown), which looked like normal running

**Reading the line:**
- **Run camera** (`RUN_ZOOM`, `game/game.ts`; `Camera.setZoom`, `zoomFollow`, `spreadX/Y`): a called run (`kind: 'run'`) is zoomed for the whole snap, set when it's called with no easing in or out, and back to normal on the call screen and kicks. Positions spread 1.3× along and 1.9× across the field about a point easing after the ball. From the snap to the whistle it runs at 0.7 speed (`RUN_ZOOM.slow`, game clock included, like the aim slow-motion); this is to try out. The first version eased in at the snap and back out 5 yd past the line, which felt odd. Sprites keep their size, so the pixels stay crisp and the linemen come apart. `toScreen`, `toWorld` and the field all go through the spread. A plain magnify was tried first and still drew a pile.
- **Block rings** (`drawBlocks`, `BLOCK_READ`; `blockPower` stored by `runEngagement` and the pass-pro step), drawn over the sprites:
  - green under a defender the blocking is beating, gold for even, red when he's winning, flickering when he's about to shed; two rings for a double team
  - on run blocks, a white bar on the blocker's side of him, bright when the runner is on that side (walled off, `levered`)
- **Daylight:** `pickLane` is split into `laneScores` (each lane has `open`, how soon any defender can get there, and `spare`) and the pick, with the pick unchanged. Lanes no defender can reach for 0.35–0.8 s show as fading streaks past the LOS, smoothed per frame.
- **RUN ASSIST setting** (FULL / LIGHT = until the handoff / OFF): `SeasonConfig.runAssist` (missing = FULL), a SETTINGS row, and L on the exhibition screen. Replays never show it.
- **Poses:** `drive` (low, leaning in) for the winning side of a block, `fight` for an even one, `stumble` for a blocker who just got shed (`poseOf`).
- New hint: `W/S STEER  +SPACE: CUT (ONCE)  SHIFT SPRINT  NO KEY: WAIT`. Controls are in the README.

**Harness:**
- The auto-runner cuts (once a play) on a free defender in front within 2 yd half the time (`AUTO_JUKE`), standing in for a fair user.
- `fakeInput` now holds Shift: the harness user sprints with the ball after a catch. With the slower jog, a non-sprinting harness user dropped pass YAC from 3.7 to 1.9, which is not how anyone plays.

**Measured** (`balance.txt` against the report regenerated just before; core = IZ, OZ, Power, Toss and Zone Read over the 3 core calls):

| | Before | After |
| --- | --- | --- |
| Core runs YPC | 4.0 | 4.7 |
| Core runs median | 2.8 | 2.8 |
| Core runs stuffs | 12% | 13% |
| Core runs 4+ | 28% | 31% |
| Core runs 10+ | 10% | 12% |
| All run rows YPC | 3.4 | 3.9 |
| Pass rows ypp | 3.4 | 4.5 |
| Pass rows YAC | 3.7 | 6.4 |

- **The pass jump is the harness, not the game.** Old jog with a sprinting harness gives 4.8 ypp and 6.1 YAC, so for a user who sprints after the catch, the jog change is noise.
- **ADAPT:**
  - IZ only, STATIC: 3.8 → 4.1 (the cuts)
  - against SHARP: 2.6, down 36%; at NORMAL DC 45: 3.1, down 24% (noisy: 31–49% the run before). Both were short of DEFENSE.md's 40% before too (−34% / −29%).
  - quick only and screens rose with the sprinting harness (quick STATIC 4.1 → 6.6)
  - balanced is about level with the DC (0.21 → 0.17–0.23 TDs a drive)
- **SHORT** (3rd and 1) is within noise: Power 68–73% (was 69–78%), Iso 79–86%.

**Checks:**
- `npm test`: 284 pass, including 6 new in `runGame.test.ts`:
  - the camera spread round trip and its fixed point
  - the cut's odds bounds, and the cut on Space with W/S, its cost and once a play
  - patience with no key, and the slide on W/S
  - the auto-runner's pick coming from the shown lanes
- Driven in headless Chrome over CDP on IZ and OZ: the rings, bars, daylight and spread render as described.
- Not played by hand yet. `npm run season` not run (no season code changed).

**Flags:**
- **Pass rows' baseline moved** because the harness now sprints after the catch. The quick game and screens look stronger than in DEFENSE.md's tables; re-baseline or revisit.
- **IZ spam** still loses only about 24–31% at NORMAL (target 40%+, already short before).
- **Patience in hand play:** the CPU line closes on a back who waits too long. That's intended, but check by playing that the window feels right (`RUN_CTRL.patience`, `zone`).

**Next (the rest of the plan):**
- Visible drive and wash on winning blocks, with a puller trail and a combo-release flash (sim; rebalance).
- A lead-blocker bonus for a back on the FB's or puller's hip, and a highlight on the nearest unblocked second-level defender.
- A run grade popup (HIT THE HOLE, MISSED CUTBACK, INTO CONTAIN) from `laneScores`.
- Juice: dust on cuts, shake on broken tackles.
- Low stamina weakening cuts; carries in a row tiring the back.
- A "skilled" auto-runner profile as a ceiling check.

## Done: a learning defense: playbook, identity dials, in-game DC and player anticipation (2026-11-02)
Design, numbers and flags are in [DEFENSE.md](DEFENSE.md).

**Defensive playbook (13 calls).**
- The 3 MVP calls are unchanged, plus:
  - Cover 2, Tampa 2, Cover 3, Cover 3 Sky and Cover 4
  - Cover 1 Fire, Fire Zone and Nickel Cat
  - Bear Cover 1 and Goal Line
- Fronts: even, bear, goal (forces the base package), and wide (not used yet).
- SPY and CONTAIN tags go on any call that can spare the defender.

**Zone coverage AI** (`sim/ai.ts`):
- Underneath landmarks, with a unit-level pattern match each step (`matchZones`): the hook takes the slant, the curl widens to the flat.
- Sinking under verticals, a leash toward the nearest threat, and a read step against run blocking.
- Deep thirds and quarters play tighter over the top than halves.
- `zcv` finally has zones to play in.

**Identity as dials** (`data/identity.ts`):
- `blitz`, `man`, `twoHigh` and `box`, as log-weights on each call's traits over a league prior, with a 15% floor.
- Style and units shade them as before.
- Situation dials: third and long, short yardage (opens Goal Line), and the red zone.
- The scouting report now speaks in pressure (5+ rushers) and man/zone shares. There's a new `zoneBeater` trait and staff-pick rule.

**The DC learns in live games** (`game/defBrain.ts`):
- **The book:** decayed counts of what you've run, by bucket and by play, plus your success against blitz, man and box calls.
- **His posture** moves toward a target built from your tendencies and from what has stopped you.
- **Against a run you keep calling,** he adds box and opens Goal Line on any down.
- **QB runs** bring SPY and CONTAIN.
- **ADJUST** (`dcAdjust`: his SCOUT plus his own spread, not stored) sets how much he trusts, how fast he moves and how often he misreads. A weak DC mostly adjusts at halftime.
- **No peeking:** the call is made before you pick yours.

**Defenders anticipate** (`Player.lean`, `LEAN_FX`):
- **The lean:** a lean on the run, screens, the QB and the deep ball, from the recent flow, by `prc`, with nerve (bolder after a right guess, careful after getting burned).
- **Every effect is double-edged:**
  - sitting on the run fits faster and surges, but bites on PA and is late deep
  - sitting on screens triggers on them, but rushes softer
- **Tells:** creeping backers and bailing corners.

**What the user sees:**
- The pre-snap read adds BEAR FRONT, GOAL LINE, 8 IN THE BOX and SPY.
- A gold line, at most one a drive, on the call screen and pre-snap ("DEFENSE: THEY'RE SELLING OUT FOR THE QB SNEAK").
- A halftime card of their adjustments, with as many lines as your OC's SCOUT finds.
- A tier-2 line in the prep page's OC report on their DC's ADJUST.

**DEFENSE IQ** (STATIC / NORMAL / SHARP):
- A dynasty setting (`SeasonConfig.defIq`, missing means NORMAL) and an exhibition line (I).
- STATIC is the old path with no brain.

**Measured** (the new ADAPTIVE section of `balance.txt`, DEFENSE.md):
- **Sneak only:** 2.7 → 1.0–1.5 yards a play.
- **IZ only:** 3.8 → 2.2–2.7.
- **QB runs:** 2.7 → 1.2–1.9.
- **Screens:** 40% → 34–38% success.
- **A balanced offense:** about level at NORMAL (0.17–0.20 TDs a drive against 0.17) and 8–15% down at SHARP.
- **PA after 8 straight IZ:** 6.5 → 9–12 yards a play. The counter pays.

**Checks:**
- **Tests:** `npm test` passes 278, including 12 new in `defBrain.test.ts`. They cover:
  - STATIC has no brain
  - spam loads the box and brings Goal Line
  - a varied offense moves the dials little
  - the caps and floors hold
  - spy and contain, and the one line a drive
  - a weak DC lags, then catches up at halftime
  - determinism and a JSON round trip
  - nerve
  - the old calls are unchanged under neutral leans
  - tags
  - every call against every formation
  - goal-line personnel
- **`balance.txt`:** the core rows are byte-identical; the DEF and ADAPT rows are new. The balance and ratings reports' core rows still use the three original calls (`CORE_CALLS`).
- **`season.txt`:** identical apart from timings.
- **Not done yet:**
  - played by hand, or driven in the browser
  - `npm run ratings` not rerun (its calls didn't change)

**Flags:**
- Zones at a 2.2 s hold give up 8–11 yards a play against 5.5–7 for man; Cover 2 is the softest at 11.0. Our man coverage is also too tight, so part of the gap is man's.
- Screens against Fire Zone gain 14.4 yards a play.
- Quick-game-only offenses are barely countered.
- The auto-runner doesn't push the sneak like a user holding D, so check the user's sneak by playing.

## Done: gameplay MVP
- **Project setup:** Vite and TypeScript scaffold, fixed-timestep loop, 640×360 internal canvas scaled up with pixelated rendering.
- **Field:** grass stripes, yard lines, college hash marks, numbers, end zones in team colors, midfield logo, crowd. The camera scrolls horizontally in Retro Bowl style.
- **Sprites:** procedural pixel-art players with team uniforms (home and away). Poses: stand, three-point stance, 4-frame run, throw, catch, down.
- **Teams:** 8 FBS teams (UGA, BAMA, OSU, TEX, ORE, MICH, ND, CLEM) with real colors and conferences. Off/def ratings are rough estimates. Rosters are generated and seeded per team, scaled by team strength. (Now all 138 FBS teams with researched rosters; see the ratings and rosters section.)
- **Playbook:** 6 plays from 2 shotgun formations (Four Verts, Slant Flat, Smash, Mesh, Dagger, Curl Flat). The play-call screen shows a route diagram for each.
- **Defensive calls:** 2 Man Under, Cover 1 Robber and Cover 0 Blitz, each with a distinct pre-snap look. Corners press at random. There's a pre-snap coverage read hint, and Esc lets you audible.
- **Passing:** slingshot drag-and-release with an arc preview (slow motion while aiming with the SLOW AIM setting). Throw error depends on distance, the QB's accuracy, pressure and movement.
- **AI:**
  - receivers run routes
  - man coverage uses a reaction lag based on awareness, with off-coverage backpedal and press jams
  - deep halves, deep middle and robber zones
  - O-line versus D-line engagements, with shed chances that ramp up over time
  - backs pick up blitzers
  - pursuit uses intercept angles
  - teammates block downfield after the catch
- **Catch resolution:** catch, drop, pass breakup or interception. Receivers and defenders time their run to arrive with the ball.
- **Running:** user-controlled carrier, sprint with stamina, broken tackles, sacks, scrambles, out of bounds, interception returns and pick sixes.
- **Rules:** down and distance, first downs, touchdown (+7), safety, turnover on downs. The CPU's possessions are simulated by `simulateDrive`.
- **Tooling:** 28 unit tests, a balance harness (`npm run balance`), an F1 debug overlay, and a `window.game` dev hook.

## Done: partial sims and key plays (2026-11-01)
Design and numbers are in [SIMULATION.md](SIMULATION.md).
- **PLAY GAME offers four choices:** the whole game, or sim to the 2nd quarter, halftime or the 4th and take over there.
  - `simPart` simulates on the live clock, with the field's conventions.
  - A drive still going at the quarter break goes on live from its spot, so you always get the whole quarter.
  - The simulated quarters' box score is kept.
- **Key plays:** on-field replays with the CPU on both sides, matched to what the sim decided.
  - **SIM GAMES** sets them for simulated games and quarters. X with key plays on saves the result first, then shows the game and the final.
  - **CPU DRIVES** sets them for the CPU's drives in games you play: its big plays and conversions, and your stops, sacks and picks before the drive summary.
  - Levels are OFF / LEAN / NORMAL / FULL. When a replay can't be matched, a card shows instead.
- **Settings:**
  - Both are dynasty settings (`SeasonConfig.keyPlays`), on the new-dynasty screen and on a new hub **SETTINGS** page. That page also edits injuries and game length, and saves on change.
  - Exhibitions have a CPU DRIVES line (K).
- **Balance is untouched:**
  - The sim only gained observation: `SimPlay.yard`/`t`, a story and a credit record, none of which draw random numbers. `simGame` plays the same, and `harness.ts` isn't changed.
  - `balance.txt` came out byte-identical, and `season.txt` too apart from the timings and a new PARTIAL SIM section.
  - The new `DriveClock.quarterBreak` is only used by `simPart`.
- **Checks:**
  - `npm test`: 264 pass, 7 of them new in `highlights.test.ts`. They cover:
    - a story changes nothing, and adds up to the score
    - the `simPart` hand-off at each quarter
    - possessions per team
    - the level caps
    - the replay match rate: 138/141 between Georgia and Alabama
    - replays replaying identically and leaving the rosters alone
  - Driven in headless Chrome over CDP with screenshots, no console errors:
    - the new-dynasty settings
    - the PLAY GAME choices
    - sim to the 4th: key plays, then 4TH 6:00 with "Your drive goes on"
    - a CPU drive's defensive key plays (a sack, a 3rd down)
    - the hub SETTINGS page
    - X in watch mode (week advanced and saved, then the final and back to the hub)
    - the exhibition line
  - Not played by hand yet.
- **Key-play fixes (same day):**
  - The CPU's key plays now go left, as in a played game, through a mirrored camera (`Camera.mirror`). The field always has your end zone on the left.
  - The ball no longer slides forward and jumps back while a key play looks for its replay.
  - Each show cuts to its spot instead of panning there.
  - A scorer now runs into the end zone before the TOUCHDOWN caption. This also applies to live games, after the play is over, and `balance.txt` is unchanged.
  - Lost fumbles replay on the field: a tackle on the sim's spot, then the ball knocked loose and recovered (`Play.knockLoose`, after the play). The CPU's turnovers in a played game used to always show as interceptions; they're now split into picks and fumbles.
  - Field goals, made or missed, are always key plays now (in sims and on CPU drives) and replay as a real kick by the CPU kicker, matched to the sim's result (`FgSearch`; 48/48 in the test).
- **Flag (not tuned):** a whole game simulated on the live clock scores about 9-11 points a team, against 26 in SIM GAME. Favorites win 3-7 points less often (PARTIAL SIM in `season.txt`). It's the same gap as "live games score less" below.

## Done: UI pass 1: main menu, dynasty slots, the hub's sidebar (2026-11-01)
- **Main menu** (`render/menuScreen.ts`, the `'title'` screen): CONTINUE (the most recently saved dynasty, straight into its hub), DYNASTY and EXHIBITION, over the field-and-crowd backdrop, with a player from each side. The single-season option is gone from the UI (old `length: 'single'` saves still load and play; `defaultConfig` is unchanged for the tests and reports).
- **Exhibition** (`'exhibition'`): the old title's pickers and quarter length, with a KICK OFF button. The final screen comes back here. Esc goes to the menu.
- **Dynasty save slots** (`'slots'`), three:
  - A used card shows the team's player, colors, year and phase, record, AP rank and seasons played. An empty card starts a new dynasty.
  - DEL or the card's DELETE asks before deleting.
  - A new dynasty goes school (`'newTeam'`) → settings (`'newSettings'`: injuries, game length) → START.
  - The settings rows are the `SETTINGS` array in `game.ts`, so a new option is one entry. Game length is the new `SeasonConfig.quarter` (minutes, default 6), used for the dynasty's live games.
- **Saves** (`season/save.ts`):
  - Each slot is `season-v1-<n>` plus a small `slot-v1-<n>` meta (`SlotMeta`) for its card. Only the metas preload at boot (`BOOT_KEYS`).
  - A slot's season loads when it's picked (`loadSlot`, through the new `loadItem` in `engine/storage.ts`, which waits for queued writes). The card shows LOADING.
  - `Game.save()` writes the current slot.
  - The old single save (`season-v1`) moves into the first free slot at boot (`migrateLegacySave`). This fixes "N overwrites the saved season without asking".
- **Season hub** (`render/seasonScreen.ts`):
  - **Sidebar** in place of the 8 tabs and the 5 bottom-right buttons:
    - HOME
    - MY PROGRAM: SCHEDULE, then the pages, each showing its hotkey: ROSTER T, PLAYBOOK P, GAME PREP O, RECRUITING R, PLAYER STATS H
    - AROUND THE FBS: SCORES, STANDINGS, POLLS, NEWS, LEADERS, AWARDS, PLAYOFF
  - GAME PREP is dimmed in the offseason. RECRUITING shows when recruiting is open.
  - The selection is kept by id (`SeasonView.nav`), so it survives a page and back.
  - **The week's action** is a gold button under the sidebar (`primaryAction`): PLAY GAME with SIM GAME under it, ADVANCE WEEK, START OFFSEASON, or the offseason's stage (COACH HIRING, DEPARTURES, SIGNING DAY, TRANSFER PORTAL).
  - **HOME** is a dashboard with three parts:
    - this week's matchup with both teams' players, ranks, records and OVR (or the offseason's four stages with the current one lit, or the national champion)
    - LAST GAME: the result, last week's level-ups and breakout line, and the newest week of your team's news (whole items only)
    - your conference standings (your row always shown)
  - The other panels moved right of the sidebar (`PX`/`PW`): POLLS is one column, and NEWS wraps to the panel.
  - **Keys:**
    - W/S moves through the sidebar, Enter opens a page.
    - A/D (or the header's clickable arrows) steps the week, conference or AP/CFP. This used to be W/S.
    - Space runs the action, X sims, and Esc goes to the main menu.
- **Checks:**
  - `npm run typecheck`. `npm test` passes 257, including a new slot round trip: migrate, save, meta, load, delete, latest.
  - The sim isn't touched.
  - Driven in headless Chrome over CDP on the dev server, with screenshots of every screen:
    - menu → exhibition → kick off → final → exhibition
    - menu → dynasty → empty slot → school → settings → hub. The config has `length: 'open'` and the chosen quarter, and the live game's clock uses it.
    - every sidebar item, and pages opening and coming back with the selection kept
    - X through a whole season → START OFFSEASON → the carousel → Esc → the HOME stage tracker
    - a reload keeps the slot, and CONTINUE resumes it
    - a second dynasty in slot 2, deleted with the mouse
    - no console errors
  - Not checked by hand with keyboard and mouse yet.

## Done: news by week (2026-11-01)
- **The NEWS tab shows one week at a time,** like SCORES: newest week first, W/S or the clickable < > arrows step through the weeks (the SCORES arrows are clickable too). Week 0 shows as PRESEASON. A long week scrolls with the mouse wheel or Q/E, with a scrollbar; changing the week starts it back at the top.
- **Other teams' breakthroughs no longer make the news** (`progress` in `season/season.ts`); breakouts elsewhere still do (`BREAKOUT_NEWS`, the top two a week).

## Done: game pacing (2026-10-31)
- **The problem:** every setting showed 15:00 quarters, and the setting only sped up the time between plays. A user play cost about 6–20 s of game clock, but a CPU drive cost about 32 s per play. Games had about 15 possessions a team and scores like 80-14.
- **Quarters are as long as the setting** (Madden style): SHORT 4:00, STANDARD 6:00, LONG 8:00 (the default since 2026-11-08; it was STANDARD). `QUARTER_DRIVES` (4/5/7 possessions a team) is checked by a pacing test that plays alternating `simulateDrive` possessions through `advanceSim` (it measures 3.8/5.3/6.7).
- **Both clocks run 1:1.** Plays and CPU drives cost what they would in real football, so the quarter length alone sets the number of possessions.
- **Accelerated clock:** `runoffAtSnap` runs the play clock down to `SNAP_AT` (:14, huddle) or `HURRY_AT` (:28, hurry-up) at the snap when the clock is running. A running play costs about 30 s however fast it's called. A stopped clock (incompletion, change of possession) costs nothing. The runoff always leaves 0:01, so it never takes away a last-second kick; waiting still runs the clock out.
- **Tempo:** H on the call screen toggles HUDDLE and HURRY (a tag under the play clock). It switches to HURRY once per quarter when the user isn't ahead inside 2:00 of a half.
- The CPU's late hurry-up window in Q4 is `min(5:00, 40% of a quarter)` instead of 5:00.
- Research: Retro Bowl uses 1–3 minute quarters with offense-only play and opponent drives as summaries. Madden's accelerated clock burns the play clock down to a set minimum at the snap.

## Done: clock, game end, run game (2026-10-23)
- **Game clock and play clock** (`game/clock.ts`). 40/25 s play clock. (Quarter length and the accelerated clock were reworked; see "Done: game pacing" below.)
  - NCAA stoppage rules: an incompletion stops the clock until the snap. Out of bounds and first downs stop it only inside 2:00 of a half; otherwise out of bounds restarts on the ready-for-play and first downs don't stop it.
  - The play clock runs on the call screen and pre-snap, so audibles cost time. If it expires, it's **delay of game**: 5 yards (half the distance inside the 10), replay the down.
- **Quarters, halftime, final.** At halftime the CPU gets the second-half kickoff. The final screen allows ties (no OT yet).
  - CPU drives burn game clock: about 32 s per play, about 7 s on clock-stopping plays, faster when trailing late and slower when milking a Q4 lead. A drive ends at the half.
  - Notices queue up with a scorebug snapshot.
- **Run game.**
  - **Right-click (or F)** hands off to the RB whenever he's behind the line and not blocking, on any play. Within 1.8 yd it's a handoff (99.7% clean); up to 8 yd it's a pitch or shovel (`pitchOdds`). Misses are a `fumble` outcome, recovered by the offense.
  - Run plays use run blocking: DL go to the nearest OL, uncovered OL climb to LBs, TE and WRs stalk DBs. `RUN_BLOCK_EDGE`.
  - The second level reads run blocking and fits its gap (`runFit`). Defenders near the ball shed blocks and make arm tackles (`ARM_TACKLE`).
- **Play action.** The RB's fake path meets the QB's drop point. LBs and safeties bite for a beat (`sellFake`), then the RB stays in to block his own man, whose defender then sits underneath instead of hug-rushing (`lateBlock`).
- **Playbook tabs:** PASS / RUN / PLAY ACTION, 6 plays each. New Pistol and Singleback formations.
  - RUN: Inside Zone, Outside Zone, Power, Toss, Zone Read, QB Sneak.
  - PLAY ACTION: PA Post, PA Boot Flood, PA Crossers, PA Seams, RPO Slant, RPO Bubble.
- **Protection fix:** blockers with an assignment no longer grab whoever they bump into on the way.
- **Sack fix:** a QB tackled past the LOS on a scramble, or on a designed run, is no longer scored as a sack.

## Done: special teams (2026-10-23)
- **SPECIAL playbook tab:** Field Goal, Punt, Pooch Punt, Coffin Corner, Line Drive.
  - Each card shows a side-on sketch of the kick's flight.
  - The FG card shows the attempt distance and flags anything over 55.
- **Kick controls (all kicks):**
  - The card sets the kick type: default loft, loft range, and bounce profile.
  - Drag back like a pass. Drag length sets power and drag angle sets direction.
  - W/S or the mouse wheel tilts the loft within the type's range.
  - Then Space on the timing meter's green (see the timing meter section).
  - The preview arc shows the landing spot, an accuracy ellipse from the kicker's `kac`, hang time and roll. **Wind is not in the preview.**
- **FG / XP:**
  - Aim before the snap. The release snaps it, the holder places it, and the kicker steps in and kicks.
  - Only the first 45% of the arc is previewed, Retro Bowl style.
  - A **goal cam** inset (from behind the kicker) shows the ball going through, wide, short, or off the upright ("DOINK!", with a 30% chance it bounces in).
  - Small rating-based block chance.
- **Punt:** snap first, then aim while the rush comes. The game is in slow motion while aiming (with SLOW AIM on), and a get-off bar sits under the punter. A rusher who reaches the punter blocks it.
- **Kickoff:** happens after every user score and to start the second half. Types: Deep, Sky, Squib, Corner. The kicker's run-up and the coverage lanes are timed to the kick line.
- **PAT:** a TD is now worth 6, then you choose:
  - EXTRA POINT: a 20-yard kick.
  - 2-PT TRY: the normal playbook from the 3 (Esc goes back).
  - Tries are untimed and happen even at 0:00. A defensive return of a try scores 2.
- **Wind:**
  - Set per game: 0-15 mph from a random direction.
  - Each quarter it drifts a little and flips along the field, because teams switch ends.
  - The HUD shows the speed and HEAD, TAIL or CROSS.
  - Drag is computed relative to the air, so wind carries the ball sideways and adds or cuts distance.
- **Special-teams AI** (`game/kickPlay.ts`):
  - **Coverage:** lanes with contain, gunners, a punt shield, and the punter or kicker playing safety. Trailing pursuers can make diving tackles.
  - **Returner:** reads the kick, picks a running lane, and decides between fielding it, a fair catch, or letting it go.
    - Fair catch when coverage is close; on kickoffs only inside the 25.
    - Lets punts go inside the 10.
  - **Loose balls:** muffs (the coverage can recover them), and coverage downs rolling punts.
  - **Return blocking:** the wall assigns one blocker per cover man, and blocks away from the ball peel off.
- **NCAA rules** (`applyKick`):
  - Kickoff touchback at the 25.
  - Kickoff fair catch inside the 25 comes out to the 25.
  - Kickoff out of bounds at the 35.
  - Punt touchback at the 20.
  - Missed FG: previous LOS, or the 20 if that's closer to the CPU's goal.
  - Return TD: CPU +7, then the user receives at the 25.
- **Clock:** FGs and punts run the clock from the snap. Kickoffs start it when the receivers touch the ball. Every kick ends with the clock stopped.
- **Roster:** K and P slots (`ST_SLOTS`) with `kpw` (leg) and `kac` (accuracy) ratings. They're generated after everyone else, so other players' ratings, and the scrimmage balance rows, are unchanged.
- **New art:**
  - Goal posts on both end lines, drawn slightly skewed so the uprights stay readable in this projection.
  - Kick, hold, punt drop, and fair catch poses.
  - End-over-end ball frames and a kicking tee.
- **Tests:** 15 new unit tests covering kick physics, FG judging, kick spots, and tries. The balance harness now has punt, kickoff and FG rows.

## Done: playbook system, Phase 1 (2026-10-23)
A pure refactor: all 18 plays behave as before, and `npm run balance` came out byte-identical. Design notes are in [PLAYBOOK.md](PLAYBOOK.md).
- **Explicit play fields replace id checks:** `read` (`none`, `handoff`, `pitch`, `zoneRead`, `rpo`), `qbRun`, and `flip`. The balance harness now uses `read === 'pitch'` and `!qbRun` instead of checking for the `toss` and `qb-sneak` ids.
- **Concept layer** (`data/concepts.ts`): plays name a concept for the strong side and one for the weak side. Concepts assign routes by receiver number (#1–#3 from the sideline in). Backs get `backs` jobs. Anything left unassigned blocks.
- **`resolvePlay`** (`game/resolvePlay.ts`) lays a play out for the snap. `Play` and the play-card diagrams both use it.
- **Flip:** each play has a rule: `fixed`, `field` or `boundary`. **F** on the play-call screen mirrors the next play; the cards redraw mirrored, and the toggle resets after the snap. All 18 plays are `fixed` for now.
- **Personnel:**
  - New depth players FB, TE2 and WR4 (`OFF_EXTRA`). The FB uses the RB role with a blocking-back archetype.
  - A formation can sub a depth player into a slot with `sub`.
  - New formations, not used by any play yet: **I-Form** (21), **Ace** (12) and **Gun Empty** (10). Cards show the personnel number.
- **Blocking schemes** (optional, not used by any play yet): `scheme.pulls` (kick-out or lead pullers, `pullBlock` in `sim/ai.ts`) and `scheme.slide` (the line slides and the back takes the backside edge).
- **Tests:** 7 new tests in `describe('playbook')`.
  - The migrated plays must match the old route maps exactly.
  - Bad concepts and bad backfield jobs throw.
  - Mirroring and the flip rules.
  - A mirrored snap.
  - Personnel formations and the depth players.
  - A pull and a slide.

## Done: NFL tracking analysis (2026-10-23)
These are Python scripts in `analysis/` that read the Big Data Bowl 2027 data. No game code changed. The full findings and the data's limits are in [analysis/README.md](../analysis/README.md).
- **Route geometry:** about 53k NFL routes. Break depth and angle are derived from tracking, and `compare_game.py` checks them against our `ROUTES`.
- **What's off:**
  - Our out is a deep out at 10 yd; the NFL's most common out breaks at about 5.5 yd.
  - Our dig and drag run flat across, while NFL ones climb.
  - Go routes drift toward the numbers in the NFL; ours run straight.
  - Our WRs are at 6 yd from the sideline, against NFL ~12; our slots at 14, against NFL 18–20. OL and TE splits are about 25% tight.
- **Playbook data:** route mix by formation and situation, same-side route pairs (GO/OUT, double hitch, GO/POST, IN/CROSS lead), and completion % and yards per target by route and coverage.

## Done: NFL routes and splits applied (2026-10-23)
- **Routes** (`ROUTES` in `data/plays.ts`). `compare_game.py` now has go, quick out, dig and drag inside the NFL middle 50%.

  | Route | Change |
  | --- | --- |
  | `quickOut` (new) | Breaks at 5.5 yd and leaves at -65°, then flattens. No play uses it yet. |
  | `deepOut` | The old `out`, renamed. PA Boot Flood keeps it, because its flood needs three levels and a quick out would sit level with the drag. |
  | Dig (`in`) | Climbs at 60° off the 12-yd break, then flattens. |
  | Drag | Climbs at 73° to 5–6 yd, then flattens. |
  | Go | Drifts 15° outside over the first 18 yd, then runs nearly straight. |

- **Splits:** a new `split` align mode replaces `abs` for receivers. `y` is the split at a mid-field ball, scaled by the width of that side of the field, so receivers squeeze into the boundary and spread to the field.

  | Player | Mid ball | Boundary | Field |
  | --- | --- | --- | --- |
  | Outside WR | 11 from the sideline | 8.2 from the sideline | 13.7 from the sideline |
  | 2x2 slot | 8 from the ball | 6 from the ball | 10 from the ball |

  Trips #2 is at 9.5, and Empty's inside receivers at 6.5 and 11. `alignY` in `resolvePlay.ts` is the one place that turns an alignment into a world y.
- **Line:** G 1.5, T 3, inline TE 4.8 (NFL 1.55 / 3.1 / 4.9).
  - DL alignments moved with the line: DE ±4.5, DT -1.25 / +1.5.
  - The IZ and Power paths moved outward to keep hitting the same gaps.
- **Balance harness:** new `PLAY` rows at the end, one per pass and PA play per defense at 1.2 s and 2.2 s, with their own seed. Before/after notes:
  - **Runs got harder:** 5.5 → 4.5 YPC, 31% → 38% stuffs. Testing with the old line put IZ back near the baseline, so the wider line is the cause, not the receiver splits. Shifting the IZ path recovered most of it.
  - **Mesh:** the climbing drags now reach LB depth, so the auto-QB throws the RB swing instead. YPP at 1.2 s fell from 27 to 2.
  - **PA Boot Flood:** at 2.2 s, completions dropped from 92–94% to 65–71%, for the same reason.
  - **Dagger and Curl Flat (vs Cover 1, 2.2 s):** these collapsed to 0–10%, but that's a harness artifact. The auto-QB targets the flat runner and leads him out of bounds ("Out of bounds" / "Nobody home" on nearly every rep).
  - **Slant Flat at 1.2 s:** jumped from 21–36% to 74–77%, the same artifact in reverse. The slot now starts 18.6 from the sideline instead of 14, so his flat stays in bounds.

## Done: playbook system, Phase 2 prerequisites (2026-10-24)
Design notes are in [PLAYBOOK.md](PLAYBOOK.md).
- **Defense vs. personnel** (`game/matchups.ts`):
  - The package follows the offense's personnel: base (SAM for the nickel) against 21/12, nickel against 11, dime (DIME for the MIKE) against 10. The new depth defenders `DEF_EXTRA` are generated last, so existing ratings are unchanged.
  - Man assignments are matched to where players line up (`cover` classes from `resolvePlay`), not to slot names. In I-Form the SAM takes the FB. No DB covers a back in any formation, and five-man calls cover every eligible.
  - All 11-personnel plays keep their calls exactly, so every pass, PA, per-play and kick row in `balance.txt` came out byte-identical.
  - The HUD shows the package next to the call, for example `DEF: 2 Man Under (BASE)`.
  - Small fixes: off-ball DBs use the 4.5-yd cushion regardless of slot, and any non-DL blitzer walks up (a dime back blitzing in Cover 0, for example).
- **Zone Read is a real read:**
  - The backside end is left unblocked and either crashes on the back or stays home (50/50 at the snap).
  - The QB rides the mesh (handoff reach 3.2 yd). If he doesn't give, he keeps automatically when the back clears the mesh, and runs for the alley outside the key.
  - A key who guessed wrong reacts late (`KEY_FOOLED`).
  - The harness auto-QB reads the key at 0.55 s (`keyCrashing()`), and its keeps now count as runs (`keep N` on the row).
- **Power pulls the backside guard** on a `lead`, using the existing pull scheme. Pulls now mirror with the play (LG ↔ RG).
- **Tests:** 9 new ones covering packages, cover classes, unchanged 11-personnel calls, no DB on a back, mirrored pulls, the zone-read key, crash vs. home, the auto keep, and the fooled key.
- **Balance, before → after (60 reps per row):**

  | Run, defense | YPC | Stuffs |
  | --- | --- | --- |
  | Power, 2 Man | 7.2 → 7.0 | 47% → 43% |
  | Power, Cover 1 | 3.9 → 2.3 | 40% → 40% |
  | Power, Cover 0 | 3.1 → 1.0 | 43% → 37% |
  | Zone Read, 2 Man | 4.1 → 2.9 | 25% → 22% |
  | Zone Read, Cover 1 | 11.3 → 1.2 | 23% → 25% |
  | Zone Read, Cover 0 | 0.5 → 1.2 | 77% → 30% |
  | All runs | 4.5 → 3.8 (median 1.6 → 1.1) | 38% → 33% |

  - **Power:** a 300-rep side test (no pull / lead / kick) gave 5.7 / 5.4 / 4.6 YPC against 2 Man, 4.2 / 3.7 / 3.4 against Cover 1, and 4.0 / 1.7 / 1.8 against Cover 0. The pull trims stuffs but loses the long runs. It hurts most against Cover 0, where the guard leaves and nobody picks up the backside blitzer. A kick-out guard arrives after the back, even with the end left for him.
  - **Zone Read:** the auto-QB reads the key perfectly. Gives net about 6.1 / 3.0 / 3.5 YPC. Keeps net only 0.3 / -0.3 / -0.7: the auto-runner QB starts 5 yd deep and the alley defender (the NB or CB1 in man, the robber in Cover 1) gets him near the line. A keep against a home key loses about 2.3. The old 11.3 against Cover 1 was a handful of long IZ runs in 60 reps.
  - **Toss** moved (2 Man 5.7 → 11.0, Cover 0 0.7 → -1.3) only because Power now uses the shared RNG differently. Nothing about Toss changed; the rows are just noisy at 60 reps.

## Done: run blocking and a 62-play playbook (2026-10-24)
Design notes are in [PLAYBOOK.md](PLAYBOOK.md).

### Run blocking (`sim/runBlocking.ts`)
Runs into the middle used to die in the DL. Four things caused it:
- An engaged block moved toward the ball carrier.
- Every blocked defender shed as soon as the back got within 2.2 yd.
- Linemen took the nearest DL with no scheme.
- After the handoff, every blocker dropped his assignment for the nearest defender.

The new model:
- **Schemes (`scheme.run`):**
  - `zone`: covered and playside-gap rules. Uncovered linemen double, then climb to the backer when he declares (`COMBO_CLIMB`), with a cut-off on the backside end.
  - `stretch`: the same rules, but reach blocks give up `REACH_PENALTY` of their edge.
  - `gap`: down blocks. The backside tackle hinges for the pulled guard and then works up after `HINGE_HOLD`. Down linemen far backside are left to chase.
  - `trap`: the first lineman playside of the center is left for the pulling guard.
  - `draw`: the line pass-sets for `DRAW_SET`, then run-blocks.
- **Engagements:**
  - Each run block rolls its outcome at contact (`BLOCK_ROLL_SD`).
  - A winning blocker drives his man back and washes him off the hole (`WASH_RATE`).
  - A losing blocker gets worked around, and the defender penetrates.
  - The blocker keeps the side he got (`blockDir`), so **leverage** matters. A defender his blocker has leverage on rarely sheds (`SHED_LEVERED`) and only gets a weak arm tackle (`ARM_LEVERED`). One the back runs past on his free shoulder sheds fast.
- **Blockers:**
  - Assigned blockers get their hands on their man from `RUN_ENGAGE` (1.4 yd).
  - They take the angle to where their man is going.
  - After the handoff they wall him off from the carrier.
  - They keep their assignments for the whole run.
  - Pullers run tight to the line, don't stop to block on the way, and pick their man by the hole. A latent bug where kick-outs ran as leads is fixed.
- **Defense:**
  - Backers fit at `LB_FIT_DEPTH` (2.8 yd), not at the line.
  - A backer or DB in the box loses 15% speed working through traffic (`TRASH_*`).
  - Man defenders on a back still behind the line hold at `MAN_DEPTH` instead of charging into the backfield.
  - Deep safeties read run faster.
  - Pursuers lead the carrier up to `PURSUIT_LEAD` (2 s), so deep defenders take angles.
- **Tackling:** a carrier going forward falls forward (`fallForward`, about 1.4 yd at full speed), which gives yards after contact.
- **Auto-runner (harness only):** reads the line for the lane with the most time to spare. Zone runs can cut back (`ZONE_READ_W`); gap runs stay near the hole.
- **QB runs:** a designed QB carry is now a run phase. The defense reads it and `autoRun` can carry it.

**FBS targets** for the harness auto-runner (all targets are kept in [TARGETS.md](TARGETS.md)):
- FBS teams average about 4.4 yards per rush (AP, 2018–21, sacks included). Starting backs gain about 3.1 yards after contact (PFF).
- Stuff rate, opportunity rate (4+) and power success are as defined by Football Study Hall.
- The league-wide levels used are from general knowledge, not one current table: about 18% stuffs, about 45% gaining 4+, about 12% gaining 10+, median about 3, power success about 70%.

The original five runs (IZ, OZ, Power, Toss, Zone Read), averaged over the three calls:

| | YPC | Median | Stuffs | 4+ | 10+ |
| --- | --- | --- | --- | --- | --- |
| Before (old harness) | 3.8 | 1.1 | 33% | — | 10% |
| After | 5.1 | 2.9 | 16% | 30% | 13% |
| FBS target | 4.5–5.5 | ~3 | ~18% | ~45% | ~12% |

- **Inside Zone:** 6.7 / 5.6 / 2.0 YPC against 2 Man / Cover 1 / Cover 0. Against light boxes the medians are 3.2 and 4.0.
- **Cover 0:** runs went from mostly stuffs to 2–6 YPC.
- **Short yardage (3rd and 1):** Power 84–85%, Iso 89–92%, QB Sneak 74–79%.
- **Still short of the target:** the 4+ rate (about 30% against about 45%). Too many runs end in 1–3 yards.

### Harness (`npm run balance`)
- **The auto-QB's aim is clamped in bounds.** This fixes the known flats-out-of-bounds bug, so every pass row moved once (see the baseline).
- **YAC bug fixed:** a catch that ended the play the same step (out of bounds at the sideline) never recorded a catch spot. That was the source of the 40–60 yd YAC readings.
- **Auto-QB changes:**
  - It skips a back who is still selling pass before his route.
  - It waits out the draw's fake set.
  - On the option, it pitches once the key commits to the QB.
- **Run rows:**
  - New columns: `median`, `4+`, and `contact` (yards past the LOS at first contact).
  - 180 reps per row.
  - QB runs are included, and RPOs are included as give-only rows.
- **New `SHORT` rows:** 3rd-and-1 conversion for plays tagged `short`.
- **`BAL_ONLY=a,b`:** limits the per-play rows to those ids or kinds. A full report takes about 60 s.

### Playbook: 18 → 62 plays
26 pass, 20 run and 16 PA/RPO, using all seven formations.

**New concepts** (`data/concepts.ts`):
- the common NFL pairs: `double-hitch`, `double-slant`, `go-post`, `go-hitch`, `in-cross`
- `stick`, `flood`, `drive`, `mills`, `cross-go` (Y-Cross), `double-out`, `corner-out` (which finally use `quickOut`), `spacing`, `snag`
- screens (`smoke`, `tunnel`)
- the under-center PA combos (`post-cross`, `cross-corner`, `cross-drag`, `go-corner`, `corner-flat`)
- `pop` and `slice`

**New routes:**
- receivers: `cross`, `glance`, `smoke`, `tunnel`
- backs: `checkFlat`, `screen`, `angle`
- run paths: `izDeep`, `stretch`, `counter`, `trap`, `draw`, `iso`, `sweep`, `pitchPath`
- lead blockers: `lead`, `kickOut`, `leadWide`, `slice`, `qbLead`

**New mechanics:**
- `RouteDef.delay`/`delayBlock`: screens, check-releases and the draw. The back sells pass within `DELAY_SET_RANGE` of his spot.
- Lead blockers (`RouteDef.lead`): the FB, H or TE runs the path, then run-blocks.
- `PlayDef.screen`: the line pass-sets for `SCREEN_SET`, then releases.
- Detached receivers who block **stalk** a DB. Their man doesn't hug-rush, and they're out of the protection pool. This fixed screens being sacked almost every time.
- `PlayDef.qbPath` and `QB_RUN_WAIT` for QB runs.
- The zone read gains `key: 'play'` and `keep: 'inside'` (Power Read).
- The new `read: 'option'` (Speed Option). The key either takes the QB or widens with the pitch man.
- `keyCrashing()` now asks whether the key is running at the back or at the QB, so it works for either key.

**Flip rules:**
- `field`: trips, empty, screens and perimeter runs
- `boundary`: Power O, Counter, Duo, Iso and the boots (boot back to the field)
- `fixed`: balanced 2x2 shells and the 18 legacy plays

### Call screen
- Formation chips under the PASS / RUN / PLAY ACTION tabs: A/D or the wheel switches them, and a click works too. The chip is remembered per tab. (The first chip, ALL, is now STARRED; see the playbook page section.)
- A 3×3 card grid, with W/S to page.
- Cards zoom to their own play, so runs are readable, and pull paths are drawn as dotted lines.

### Tests
75 total (71 run by `npm test`).
- **New `run blocking` tests:**
  - zone combos and the climb
  - gap down blocks and the hinge
  - wash
  - trap
  - draw
  - leverage shed
  - fall-forward
- **New `playbook validity` tests:**
  - unique ids, tip and name lengths, and resolving on every hash, flipped or not
  - 60–80 plays covering all formations
  - trips and empty plays flip to the field
  - no duplicate signatures
- **Legacy tests:** the route-map test now checks the 18 legacy plays as a subset, and the "keeps every call" test covers 11-personnel plays only.

### Flags: plays that are clearly overpowered or useless (not tuned)
Criteria:
- **Overpowered:** a pass play at 12+ YPP at both holds against two or more calls, or a run at 8+ YPC against two or more calls.
- **Useless:** a pass play at 2 or fewer YPP everywhere, or a run at 1.5 or fewer YPC everywhere.

Rows are from the final report.

**Overpowered:**
- **Go Post:** 13–21 YPP at both holds against Cover 1 and Cover 0 (9–18 against 2 Man).
- **PA Boot Flood:** 12–21 YPP at both holds against Cover 1 and Cover 0.
- **Close to the bar against Cover 1 only:** PA Post (21–24 YPP), Ace Max Shot (17–23), PA Seams.

**Useless or broken (a mechanic gap rather than a tuning problem):**
- **Power Read** (about 1.0 YPC): with the line blocking down, the gun sweep has to cover about 12 yd sideways before it turns up. A squeezing key or the WILL gets him in the backfield. It needs a perimeter blocker or a faster sweep path. _(2026-11-08: TE arc and the wide lane read; see the top entry.)_
- **Draw** (0.3 YPC; −1.3 against Cover 0): a four-man rush reaches the mesh while the line is still selling pass. Draws need the DL to rush past the back, or a deeper mesh.
- **QB Power** (0.4 YPC; 3rd and 1 converts 58% / 59% / 1%): after the guard pulls, the center blocks back on the 1-technique alone and loses often enough to stuff the waiting QB. _(2026-11-08: reworked by the point-of-attack assignments; see the top entry.)_
- **Pin-Pull Sweep** (0.8 YPC): the playside guard and tackle pull from a gun sweep and get there behind the back. _(2026-11-08: reworked by the point-of-attack assignments; see the top entry.)_
- **Counter GT** (1.7 YPC; contact −2.2): with both backside linemen pulling, the center can't hold the backside 1-technique. _(2026-11-08: reworked by the point-of-attack assignments; see the top entry.)_

**Weak:**
- **Lead Toss** (2.5 YPC, 44% stuffs; 0.2 against Cover 0). _(2026-11-08: reworked by the point-of-attack assignments; see the top entry.)_
- **Empty QB Draw:** fine against 2 Man (3.5), but −1.1 against Cover 0, where six rush against five.

**Strong run rows** (no run-defense calls exist yet, so every light box stays light):
- Outside Zone against 2 Man: 10.2 YPC.
- Speed Option against Cover 0: 10.4 YPC.
- RPO Stick and Power Bubble give rows against 2 Man (8+ YPC, about 50% 10+): the routes take the man defenders out of the box. That's the point of an RPO, but the defense has no answer yet.

**Harness artifacts, not play problems.** The auto-QB throws to the most open receiver at a fixed hold time:
- At 1.2 s it throws to a flat still crossing the formation (Stick, Flood and Dagger: 5–20% completions, 12–26% INTs). At 2.2 s the same plays are fine.
- At 2.2 s it dumps to a check-release back (Double Hitch, Double Slant, Drive, Corner Out: 90%+ completions at 0–2 YPP).
- On Four Verts, Smash, Mesh, Post Wheel and the I-Form boots it takes the RB or FB flat (3–6 YPP, about 90% completions).
- Smoke at 1.2 s (1–5 YPP): it's a one-step throw, and 1.2 s is late.

**Near-duplicates:** none by the signature test. Four Verts, Smash and Mesh have near-identical rows only because the auto-QB throws the same RB flat on all three.

## Done: route running, speed and settle catches (2026-10-24)
Routes used to run at one speed: top speed about 0.45 s after the snap, every cut rounded off at full speed, and hitch, curl and comeback receivers overrunning their spot (the old curl ran to 12.7 yd and drifted back to 8.7).

**Speed through a route** (`runRoute` in `sim/ai.ts`, pass routes only):
- **Burst:** off the line and out of a cut at `BURST` (scaled by `acc`), tapering by `BURST_TAPER` near top speed. `accelOf` still caps it. A WR now reaches top speed at about 0.7 s instead of 0.5 s, and a go route is about 0.5 yd shorter at 1 s.
- **Plant:** he brakes at `PLANT_DECEL` into each waypoint, down to `cutKeep` of top speed there.
  - `cutKeep` depends on the turn angle and `acc`: about 0.96 on a slant for a sharp route runner, about 0.5 on a hitch or curl, and 1 on bends under 20°.
  - Cuts are now tight, and settle routes stop on their spot (curl at 10.2, hitch at 5.5).
- **Only pass routes are affected.** `Player.passRoute` is false for run paths, PA fakes and lead paths, so handoff timing and run blocking are untouched. The SHORT, punt, kickoff and FG rows came out byte-identical.
- **Defense is unchanged.** Man coverage already follows a lagged position, so it stays tight on the release, and the gap opens where the receiver plants and bursts away.

**Settle and face the QB:**
- On a `settle` route (one that ends with `cont: false`: hitch, curl, comeback, smoke, RB screen), the receiver starts turning to the QB as he comes back down the final leg, or when he stops.
  - The turn takes `TURN_TIME - 0.15·acc/100` (about 0.2–0.3 s), and the sprite turns when it's done.
- `facingQB()` gives a 0..1 "set" value. It drops to 0 if he's moving faster than `SET_MAX_SPEED` and not back toward the QB, and it's always 0 on routes caught in stride.
- `catchOdds` takes `set`:
  - `SET_HANDS` (+0.04 to the hands factor)
  - `SET_CONTEST` (+5% to his share of a contested ball)
  - That's about +3–4 points on a contested hitch and less than 1 on an open one.
- F1 debug shows each route runner's speed, or a green SET.

**Harness:** new `ROUTE` rows (`BAL_ONLY=route`). They throw to the receiver on one route 0.3 s after his sharpest break (go, post and corner use the NFL time to break), with NFL comp % vs man and separation alongside for reference.

**Before → after.** These are paired runs: the same seeds with the new profile on and off, at 1,200 reps per aggregate row and 600 per route row.

| All pass plays | 1.2s comp / YPP | 2.2s comp / YPP |
| --- | --- | --- |
| 2 Man Under | 68.0 / 5.39 → 67.3 / 5.39 | 66.0 / 6.32 → 66.7 / 6.60 |
| Cover 1 Robber | 69.6 / 7.68 → 71.0 / 6.99 | 67.2 / 7.98 → 64.2 / 7.79 |
| Cover 0 Blitz | 70.7 / 8.78 → 69.0 / 8.23 | (sacks) -2.25 → -2.12 |
| **PA:** 2 Man Under | 67.9 / 8.54 → 68.6 / 8.30 | 76.0 / 8.39 → 78.1 / 8.56 |
| **PA:** Cover 1 Robber | 75.2 / 13.28 → 75.3 / 13.20 | 77.2 / 13.08 → 76.7 / **10.93** |
| **PA:** Cover 0 Blitz | 76.9 / 15.31 → 75.0 / 14.55 | (sacks) 1.70 → 1.39 |

| Route (thrown out of the break) | 2 Man comp | Cover 1 comp | Of the gain, from the set bonus |
| --- | --- | --- | --- |
| Hitch | 58 → 66% | 55 → 62% | about +3 / +1 |
| Curl | 51 → 56% | 54 → 61% | about +5 / +10 (noisy) |
| Comeback | 56 → 58% | 54 → 58% | 0 / +6 |
| Slant | 61 → 61% (YPT 8.4 → 5.4) | 60 → 53% | none |
| Deep out | 60 → 52% | 57 → 56% | none |
| Dig | 51 → 48% | 53 → 53% | none |
| Drag | 67 → 62% | 65 → 63% | none |

**Flags (not tuned):**
- The overpowered and useless lists are unchanged: Go Post and PA Boot Flood overpowered, Double Hitch "useless" (the check-release artifact).
- **PA against Cover 1 at 2.2 s lost about 2 YPP.** It's spread over the boots: PA Boot Flood 15.7 → 13.8 and Ace Boot 7.0 → 5.6 (400-rep per-play check). Boot Flood was already flagged as overpowered.
- **Deep out against 2 Man:** 60 → 52%. The plant on an 88° break costs speed the man defender doesn't lose.
- **Quick-throw YAC is lower.** A slant caught 0.3 s after its break is still re-accelerating, so YPT fell from 8.4 to 5.4 (NFL 6.9). That eases the "high YAC on quick throws" bug below.
- **Ace Y-Stick halved** (for example 9.2 → 4.6 against 2 Man at 1.2 s). It's a harness artifact: per target, the go and slant results barely moved, but the WRs are a little tighter at 1.2 s, so the "most open" QB throws the TE2 flat 478 times instead of 317.
- **RB Screen rose** from about 2 to 6–8 YPP against 2 Man and Cover 1. The back now stops on his spot and is set. The NFL screen is 5.1 per target.
- **Separation at arrival is still far below the NFL:** 0.0–0.9 yd against NFL 1.5–3.7, because man defenders run to the ball's landing spot. Real separation lives at the throw.

**Tests:** 7 new ones covering the set catch bonus (open and contested, under 6 points), `cutKeep`, the go route's ramp and no set, the slant keeping speed vs the hitch stopping, the curl plant-settle-turn, and run, fake and lead paths left alone.

## Done: cancel a pass aim (2026-10-24)
- **Space while aiming** drops the aim without throwing (`Play.updateLive`). The release that follows does nothing. The hint bar shows `RELEASE TO THROW  SPACE: CANCEL` while aiming.

## Done: perimeter blocks on outside runs (2026-10-24)
Bug: on outside runs, the playside WRs' stalk blocks on the corners almost never held. Both causes were rules meant for the backside that only checked distance to the carrier. Right after the handoff or pitch, a playside corner is 15–19 yd from the back, so those rules caught him too.
- **Peel-off:** `runEngagement` shed every blocked defender more than 8 yd from the carrier at 2.5/s, which is about 0.4 s per block. Now a defender only peels off if he is also backside of the carrier or behind him (`PEEL_DIST`, `PEEL_BACKSIDE`).
- **Engage gate:** after the handoff, `formEngagements` wouldn't start any block more than 10 yd from the carrier. A WR who hadn't reached his man by the pitch couldn't lock on. A blocker's own run-block assignment is now exempt.
- Test: a far playside block keeps its matchup shed rate, and the backside still peels off.
- Balance (before → after, YPC by call: 2 Man / Cover 1 / Cover 0):
  - Lead Toss: 3.2/3.5/0.7 → 6.0/4.3/8.1. Stuffs 38% → 21% against 2 Man.
  - Toss: 7.5/3.1/1.3 → 8.0/4.9/0.8. Stuffs 31% → 20% against 2 Man.
  - Speed Option: 2.5/1.9/10.2 → 4.2/3.7/12.4.
  - Draw: 1.1/0.3 → 2.4/1.8. Its peel-off also stopped hitting the playside.
  - All runs: 3.9 → 4.1. Interior runs moved within noise.
  - Pin-Pull Sweep, Power Read and zone-read keeps are unchanged. Their flagged problems are elsewhere.
- **Flag:** Lead Toss against Cover 0 is now 8.1 YPC with a 0.1 median and 17% 10+ runs, so it's boom or bust. Speed Option against Cover 0 is 12.4. Watch both; they weren't tuned.

## Done: fumbled pitches and handoffs (2026-10-24)
Bug: pitches were fumbled far too often, most visibly on I-form play action, where the back starts 5–7 yd deep, so an early right-click is a pitch. The aim in `Play.handoff()` led a slow back (under 3 yd/s) as if he were already at 75% of top speed, plus 0.15 s extra. A back starting from rest can't get there in a 0.4 s pitch, and any miss beyond `CATCH_REACH` (1.7 yd) was an automatic fumble. Fast backs overshot the same way. Across the playbook the old aim missed by up to 1.9 yd; the new one by at most 0.6.
- **Pitch aim:** leads the back to where he gets at full tilt during the flight, accelerating from his current speed (`accelOf`, capped at top speed), along his heading if he's moving or his path if he's just starting.
- **The back runs through the pitch** at full speed (`thinkOffense`) instead of `seekTimed`, which paced him to arrive exactly on time and catch it at a jog.
- **Rates:** `HANDOFF_ODDS` 0.99 → 0.997. `pitchOdds` is now about 0.5% on the ground when he's under it and 2–3% at the edge of the new `PITCH_REACH` (2.5 yd; was 1.7 with 1–7% drops).
- Tests: `pitchOdds` bounds, and a regression test pitching on Toss, Lead Toss, I-Form Boot, I-Form Deep Cross and PA Seams at every 0.05 s from the snap to 1.2 s; the back must be within half of `PITCH_REACH` when the ball arrives.
- Balance: fumbles across all run rows 145 → 47 (of about 14,600 reps, 1.0% → 0.3%). Toss and Lead Toss over 1,000 reps per call: 0.3–0.6%, all from the base rate.
- **Flag: pitch plays got better.** Catching in stride gets the back to the edge faster. YPC by call (2 Man / Cover 1 / Cover 0), before → after:
  - Toss: 8.0/4.9/0.8 → 11.9/5.1/4.3.
  - Lead Toss: 6.0/4.3/8.1 → 9.3/4.9/12.7 (13 TDs against Cover 0).
  - Speed Option: 4.2/3.7/12.4 → 6.9/4.2/13.5.
  - All runs: 4.1 → 4.6.
  - Pitching into the zero blitz no longer loses yards. Not tuned. The levers are the perimeter blocks and the defense's force player, not the pitch.

## Done: kick timing meter, no juke, stat-based sprint (2026-10-24)
- **Kick timing meter (FG, XP, punt, kickoff).** The drag still sets power, direction and loft. After the release a bar appears at the bottom center: red, yellow, green, yellow, red, with a needle sweeping left to right. Press **Space** as it crosses the green.
  - Math in `sim/kicking.ts`: `METER_HALF` (0.45 s from the green's center to either end), `timingGreen(kac)` (green half-width `GREEN_BASE + GREEN_KAC·kac/100`, about ±0.1 s for a kac-84 kicker), and `mistimeAngle` (0 on the green, then `MISTIME_DIR·m^MISTIME_CURVE` for `m` the share of the way from the green's edge to the bar's end: 0.18 rad, about 10°, at the end, with the 0.85 curve making near misses cost more. Halfway out is about 4.3°, enough to miss a 40-yarder).
  - The bar is drawn one pixel column at a time, colored by what that spot would cost: green, shading through yellow to red. **Early hooks left (−y), late pushes right (+y).** The existing `kac` gaussian error is applied on top.
  - The run-up is paced (`seekTimed`) so the kicker reaches the ball as the needle hits the green's center: `FG_STRIKE` 0.9 s after an FG/XP release, the natural run-up time on kickoffs, and `PUNT_GETOFF` after the punter's drop.
  - The foot meets the ball when the needle is stopped **and** the kicker is at the ball. An early press strikes on arrival (with the hook); a late press makes him wait planted. If you never press, the needle runs off the end and it's a full late push.
  - Kickoff cover lanes are timed to the strike, so a late press doesn't put anyone offside. They wait at the line.
  - Popups: PERFECT! / EARLY / LATE (red when far off).
  - **`PUNT_GETOFF` went from 0.3 to 0.45 s** so the needle starts moving at the drop. A late press costs more get-off time against the rush.
- **FG/XP protection is gap-sound** (`assignFgProtection`, at the snap). The protectors used to take the nearest rusher, so two would double a DT and the WLB stacked behind him ran through the A gap untouched on every snap. He was 2.6 yd from the hold at the strike every time. Now each rusher gets his own blocker, matched by alignment, and the spare protector picks up whoever comes free.
  - Probe, 200 FGs: the nearest rusher at the strike was a median 2.6 yd from the hold, inside 3 yd 100% of the time. Now it's a median 6.5 yd, inside 3 yd 2% of the time, which is about the real FBS FG block rate (about 1.5–2%). Interior rushers get about a yard of push; the ends get the most.
  - The block itself is still the `FG_BLOCK_BASE` roll, not the rush. FG rows only moved within noise.
  - Test: one blocker per rusher, and no rusher within 2 yd of the hold before the strike (40 seeds).
- **Juke removed.** Space does nothing while running. `tackleChance` lost its `juking` argument; the "JUKED HIM!" popup is gone.
- **Sprint endurance** (`endurance` in `sim/player.ts`): `clamp((0.6·spd + 0.4·acc − 60)/35, 0, 1)`, so it's continuous. Template values: QB about 0.39, TE 0.52, RB 0.83, WR 0.86, and a mobile QB (85/84) about 0.70.
  - Full sprint lasts `SPRINT_TIME` 1.15–3.46 s, eased by endurance squared (it was 2.86 s for everyone): about 1.5 s for a pocket QB, 1.8 for a TE, 2.3 for a mobile QB, 2.7 for an RB, 2.9 for a WR. Receivers keep the old feel; QBs tire much sooner. Recovery is `SPRINT_RECOVER` 0.12–0.18/s (was 0.15).
  - The stamina bar's length scales with endurance (10–18 px), so a QB's bar is visibly shorter.
- **Harness:** the auto-kicker presses at the green's center (|e| ≤ 0.04), so aim is unchanged. Every scrimmage row came out byte-identical. Kick rows moved because pre-kick timing changed (the shared RNG is drawn per step) and because of the longer punt get-off:

  | Row | Before | After |
  | --- | --- | --- |
  | Punt from own 30 | net 39.3, fc 56%, ret 44% (5.8) | net 40.0, fc 71%, ret 29% (6.9) |
  | Pooch | in20 79% | in20 83% |
  | Coffin corner | oob 51%, tb 28% | oob 61%, tb 26% |
  | Line drive | ret TDs 5 | ret TDs 3 |
  | Deep kickoff | CPU start 22.5, tb 64%, ret 13.2 | 23.0, tb 60%, ret 15.9 |
  | FG calm, by decade | 92 / 77 / 66 / 35% | 93 / 80 / 69 / 32% |
  | FG wind, by decade | 90 / 73 / 55 / 25% | 91 / 83 / 57 / 26% |

- **Flag:** the punt fair-catch rate jumped from 56% to 71%. The extra 0.15 s of get-off lets coverage get closer by the time the ball comes down. Punt blocks are still 0. The FG and kickoff changes look like RNG noise at 200 reps. Not tuned.
- **Tests:** 6 new ones: mistime direction and growth, a wider green for better kickers, a live FG (on the green is good, early lands left of the posts, no press auto-pushes right, the kicker is at the ball at the strike), kickoff coverage staying onside on a late press, and endurance ordering. The tackling test lost its juke assertion. 86 tests in total.
- **Not checked by hand yet:** the meter's look and feel in the browser.

## Done: ratings, rosters and every FBS team (2026-10-24)
Design notes are in [RATINGS.md](RATINGS.md) (what every rating does, overall formulas, the evidence) and [ROSTERS.md](ROSTERS.md) (the research, the generator, depth charts).

### Ratings: 12 → 26, each with a job (`data/ratings.ts`)
- The old ratings each fed several unrelated formulas, so they were split along code paths that already existed:
  - `thr` → `sac`/`mac`/`dac` (accuracy by distance, `accuracyAt`), `tup` (on the run) and `pac` (poise under pressure)
  - `awr` → `mcv` (man), `zcv` (zone) and `prc` (run, play-action and pitch reads)
  - `blk` → `pbk`/`rbk`
  - `str` as the defender's power → `rsh` (pass rush) and `bsh` (shedding run and ST blocks); `str` in the press jam → `prs` (corner) vs `rls` (receiver)
  - `acc` in route running → `rte`
  - the spd/acc stamina formula → `sta`
  - new `cit` (catch in traffic) for the receiver's share of a contested ball
- **Pure refactor first:** with every new rating filled from the old one, `balance.txt` came out byte-identical.
- **One new effect:** a blocker's strength is 20% of his block (`ANCHOR_STR`); before, an OL's `str` did nothing. On the old rosters this moved runs from 4.6 to 4.8 YPC (stuffs 14% → 12%) and short yardage up 2-10 points. The pass rows moved within noise.
- **Not ratings, because nothing reads them yet:** ball security, carrier vision, underneath zone drops, QB decisions, and height and weight (they only shape ratings when a player is generated).

### Positions and overall (`data/positions.ts`)
- 17 positions (QB, HB, FB, WR, TE, OT, OG, C, DE, DT, OLB, MLB, CB, FS, SS, K, P); each on-field slot is rated at one.
- **Overall is relative to the position:** measured against the position's rating template at a 75, so a template player at level L rates exactly L, a pocket QB isn't punished for lineman speed, and a point of each rating is worth `w / Σ(w·slope)`.
- **The weights only include ratings that matter at that position**, set from the new sensitivity report (below). Linemen's `str` weight follows from the anchor: a quarter of pass block plus a quarter of run block.

### Sensitivity report: `npm run ratings` (new, about 10 min)
- Lowers one rating by 15 on one group of starters and replays the same plays, paired rep by rep (each rep has its own seed). The output is in `ratings.txt`; the summary is in RATINGS.md.
- It found two harness problems along the way: a +15 bump clipped at 99 for good starters (so it lowers instead), and a shared RNG stream made the noise as big as the effects (so each rep gets its own seed).

### 138 FBS teams, researched (`data/fbs/`)
- Seven research agents covered all 2026 conferences in parallel (records as of Oct 24, AP ranks, preseason honors, team-season pages). They found 486 real standouts on 2026 rosters, each with position, class, archetype and tier, plus each team's QB style, scheme, unit strengths, tier, prestige, colors and offense/defense/ST targets.
- The raw JSON is in `docs/research/`. `python scripts/build_profiles.py` validates it and regenerates `profiles.ts`. Sources per team and known weak spots (guessed class years, QB situations in flux) are in ROSTERS.md.
- The hand-tuned uniforms of the original 8 teams are kept; the rest are derived from two colors (`uniform`).

### Rosters, depth charts, team ratings
- **Player schema** (`Athlete`): name, number, position, archetype, class, redshirt, height, weight, hometown, recruiting stars, potential, development trait, ratings, injury, and `real` for researched players. The sim still sees only `RosterPlayer`, built by `onField`.
- **Generator** (`rosterGen.ts`): 85 players per team, seeded by team id. Standouts go in first under their real names. Classes set levels, archetypes follow the scheme, and builds nudge ratings. Calibration makes each position's starters average the unit target, and every standout starts. Hometowns weight the home state, the region and national talent by program tier.
- **Templates** (`athletes.ts`) are anchored so a level-88 player matches the old 89-team template the playbook was balanced on. Special-teams `bsh`/`rbk` for players off their own side of the ball follow the old strength and block values, because return TDs jumped when coverage players had junk shed values.
- **Depth chart and injuries** (`depth.ts`): an auto depth chart by fit at each slot (out of position -4); starters are filled in slot order, first healthy player. An injury takes a starter off the field and the backup starts on the next snap.
- **Team ratings are computed, never stored:** offense (QB 30%, line 35%, receivers 21%, RB 8%, TE 6%), defense (front 36%, backers 16%, corners 28%, safeties 20%), ST (K 50%, P 35%, returners 15%). `simulateDrive` uses them. Across the 138 teams they land within about half a point of the research targets on average.

### Screens
- **Title:** A/D picks your team within its conference and W/S changes conference; the arrow keys do the same for the opponent. Each panel shows OVR / OFF / DEF.
- **Roster screen (R or T):** offense, then defense and ST starters with the four ratings that weigh most in their overall (real players in gold, out-of-position flagged), then the full 85-man roster with class, height, weight, stars, potential and hometown. Checked in the browser (headless Chrome screenshots); no console errors.

### Harness changes
- `src/harness.ts` holds the auto-QB, auto-runner and auto-kicker for both reports (`balance.txt` was byte-identical after the move).
- **Reference matchup:** the balance and ratings reports now play template players (offense 90 vs defense 88, the old harness's gap), not generated rosters, so research updates and roster rolls don't move the baseline.

### Tests
14 new, 100 in total:
- ratings: template players rate their level; overall rises with every weighted rating and ignores the rest; accuracy bands; `composure`; the anchor; every rating documented
- rosters: all teams have a state, colors and a unique abbreviation; composition and determinism; every slot gets a different healthy starter; ratings and bios in range; an injury promotes the backup and lowers only the right team rating; team ratings within 6 of every target (mean under 2.5) and tier 1 > tier 3 > tier 5; standouts on the roster in the two-deep; mobile-QB teams start a mobile QB
- the route-running tests now pin the receivers to a fixed profile, since an elite generated route runner hit a test boundary

### Flags (not tuned)
- **Talent gaps are far too steep in the live sim.** With real FBS spreads, Georgia's offense (88) against Sacramento State's defense (56) runs for 35.7 YPC (nearly every run a TD) and 15.8 per pass; Sacramento State against Georgia's defense gets -1.8 and -2.5. Even matchups play normally at any level (Sac State vs UTEP: 3.4 YPC). The rating-to-outcome curves (speed, tackling, block power) need compressing before full seasons are playable. The CPU drive sim is milder (5.1 points per drive vs 0.01).
- **The run game is very sensitive to the ball carrier.** The old baseline's Georgia back was a lucky roll (99 elusiveness, 87 strength), and swapping him for a template back cost about 1.2 YPC on the core runs. The new reference baseline is lower for that reason (see below), not because of a change in the sim.
- **Elite returners beat punt coverage:** with the real Alabama returner (99 speed, 90 elusiveness), punts gave up 8-9 return TDs per 300; at elusiveness 80 it's 2. Fixed in the next section.
- **The press jam is weak** (short, and only on 35% of snaps: `prs`/`rls` worth 0.03-0.21 yards per play across the two sensitivity runs), and **zone coverage is nearly unused** until zone calls exist. Their weights assume they'll matter.
- **QB ratings can't be measured** by the auto-QB harness (it throws to the most open man at a fixed time). Their overall weights are judgment.

## Done: return TDs made rare (2026-10-24)
Elite returners were breaking 2 tackles a return and scoring on 9-15% of returns, and a top program returning against a weak one scored on 27-29%. Real FBS punt returns score on about 1%. Measured on line-drive punts (nearly every one returned), 400 reps per case:

| Case | Before: TD % of returns, broken tackles per return | After |
| --- | --- | --- |
| Template returner (reference 90 vs 88) | 5.3%, 1.30 | 1.0%, 0.35 |
| Speed 95, elusiveness 80 | 2.3%, 1.22 | 0.5%, 0.33 |
| Speed 99, elusiveness 90 | 8.3%, 1.63 | 1.3%, 0.43 |
| Speed 99, elusiveness 97 | 15.3%, 2.02 | 1.3%, 0.41 |
| Alabama returns vs Sacramento State coverage | 26.8%, 0.98 | 1.8%, 0.41 |
| Sacramento State returns vs Alabama coverage | 0.0%, 0.81 | 0.3%, 0.24 |

Three causes, three changes:
- **Linear tackle odds.** `returnTackleChance` (`sim/tackling.ts`) runs the tackler-vs-carrier gap through a tanh (`RETURN_TACKLE_BASE`, `RETURN_GAP_SCALE`, `RETURN_GAP_SOFT`), so an elite returner gets a few points per attempt, not 20. Each tackle he's already broken on the return adds `BROKEN_TOLL` (0.12) to the next one: one or two misses happen, a chain of four doesn't. Kick returns only; scrimmage still uses `tackleChance`.
- **Junk tackle ratings on the cover unit.** Punt coverage is the offense's starters, whose `tkl` was a 35-45 placeholder. Offensive templates now carry a special-teams tackle rating (HB 55, FB 62, WR 50, TE 60, OL 55, slope 0.3), like the earlier `bsh` fix. `tkl` has no weight in their overall. In scrimmage it's read only on interception and fumble returns; that reshuffled the shared RNG, so every scrimmage row in `balance.txt` moved. Re-seeding the old and new templates (two seeds each) put both inside the same band (core runs 4.05-4.44 YPC), so it's noise.
- **The speed gap between units.** Most remaining TDs against weak programs had no broken tackle at all: slow cover men (offensive linemen at 46 speed) couldn't stay with a fast returner's cuts, and blocking hardly mattered (10.6 of 11 cover men were free at the TD). Longer pursuit leads didn't help. Now `ST_SPEED_GAP` (`game/kickPlay.ts`) keeps half the speed and acceleration gap between the two units on punts and kickoffs. Each unit is measured against its positions' templates, so players keep their order within the unit and the returner keeps his own edge. Rosters aren't changed.
- **Flag:** returned full-power punts now average about 5.5 yards (it was 10.0; FBS is about 8-9). Line drives average 10.4 and deep kickoffs 14.5. The full punt's hang time lets coverage arrive with the catch, and misses no longer chain. Not tuned. Watch it once returns are playable.
- **Tests:** 2 new (the elite returner's edge stays small and broken tackles add up; the speed squeeze keeps the order within a unit and leaves rosters alone). 102 in total.

## Done: season framework (2026-10-24)
The whole season loop exists end to end, each system with a simple first version behind its own module, so details can be filled in one at a time. Design notes, the week pipeline and every placeholder are in [SEASON.md](SEASON.md).
- **Three layers:** world data in `src/data/season/` (conference rules, 28 rivalries, the calendar, the 12-team CFP format, 32 bowls with tie-ins), a headless engine in `src/season/` with plain-JSON state, and the live game, which the hub launches and whose final screen writes the score back.
- **Week loop** (`advanceWeek`): prep (staff game plans and depth charts) → play (the user's live result, everything else simulated) → results (injuries heal) → rankings (AP every week, CFP from week 9) → news → transition (regular season → championship week → selection → bowls and playoff rounds → complete). `nextSeason` rolls an open-ended season over with the same rosters.
- **Schedule:** 12 games in 14 weeks for all 138 teams. Rivalries first (16 in rivalry week), conference games to `CONF_RULES`, then non-conference games. Deterministic per seed.
- **CPU game sim:** `simulateDrive` possessions with team ratings, home edge, clock management and overtime; box scores credit the starters by game plan, target share and overall.
- **Standings** with an ordered tiebreaker list; **AP poll** (62 simulated voters: record, strength of schedule, margin, a fading preseason prior, inertia, noise); **CFP rankings** (13 members, no prior); **title games**, **playoff selection** (5 auto-bids, straight seeding, byes from the bracket size), **bowls** by tie-in; **season stats, leaders and five awards** including a weekly Heisman watch; a **news feed**; a **coach job-security stub**.
- **Staff automation:** `autoGamePlan` (pass share from the scheme) and `autoDepthChart`; `SeasonConfig.delegate` decides which ones the user hands off. Everything runs fully automated.
- **Saves:** localStorage, versioned, with zero stats left out (2.8 MB → 1.6 MB for a full season). N on the title screen starts a season and C continues it.
- **Hub screen** (`render/seasonScreen.ts`): header with rank, record and next game; tabs for schedule, scores around the country, standings, AP/CFP polls, news, leaders, awards and the bracket. Space plays the week's game, X simulates it. A live tie is settled by simulated overtime. Checked in headless Chrome: launching a game, the write-back, simming to the end, and continuing a save. No console errors.
- **`npm run season`:** headless seasons → `season.txt` (about 0.7 s per season).
- **Tests:** 9 new in `src/season.test.ts`: schedule validity and determinism; sim ties, determinism, talent and box-score totals; settling a live tie; tiebreakers; poll behavior; seed order; a full season (bracket, champions, bowl eligibility, leaders, awards, history); a JSON round trip mid-season; save packing. 111 in total.
- **First report (5 seasons), flags not tuned:**

  | Measure | Sim | FBS |
  | --- | --- | --- |
  | Points per team per game | 19.2 | ~28 |
  | Yards per team per game | 349 | ~390 |
  | Home win % | 56.7% | ~57% |
  | Overtime % | 3.6% | ~5% |
  | Average wins by tier | T1 10.2, T2 8.8, T3 5.8, T4 6.1, T5 2.8 | |

  - **Scoring is low.** It comes from `simulateDrive`'s gain model, which the live game's CPU drives also use.
  - **Leaders are inflated** (5,000–6,000 passing yards, 2,500+ rushing), because only starters get credit.
  - **The Heisman leans to running backs.**
  - **Live games record only the score,** so the user's players never lead stats or win awards.

## Done: season sim fit to real scores (2026-10-24)
Simulated seasons had too many blowouts and too few close games. Comparing them with every real FBS-vs-FBS game from 2024–25 (1,606 games from ESPN's public scoreboard API) confirmed it was the model, not chance:
- one-score games 29.3% vs 38.0% (about 7 standard errors)
- 28+ blowouts 25.2% vs 18.9%
- 19 points per team vs 26.5
- 6.3% team shutouts vs 1.5%

Method and full tables are in [SEASON.md](SEASON.md) under "Score calibration".
- **Causes:** ratings decided too much (each overall point was worth 2.5 points of margin), and the drive sim had no big plays. It used a symmetric 4.6 ± 6.5-yard gain, so under 1% of plays went for 20+, and a talent edge compounded over long drives.
- **`DRIVE_SIM`** (`game/rules.ts`): 6% explosive plays (15 yards plus an exponential tail), a tighter ordinary gain (± 5), and 0.12 yards per play per overall point (was 0.15).
- **`GAME_SIM`** (`season/simGame.ts`, replaces `HOME_EDGE`): a random per-game pace, and a game script where the leading offense eases off. Without the script, matching the real close-game rate made upsets too common, and matching the upset rate made close games too rare.
- **AP inertia 2.5 → 4.5,** because an unbeaten No. 1 kept dropping after narrow wins.
- **Now** (20 held-out seasons, real values in parentheses):

  | Measure | Sim | Real |
  | --- | --- | --- |
  | Points per team | 26.3 | 26.5 |
  | One-score games | 33.2% | 38.0% |
  | Won by 28+ | 20.1% | 18.9% |
  | Won by 35+ | 11.1% | 10.0% |
  | Team shutouts | 1.1% | 1.5% |
  | Median margin | 14 | 14 |
  | Ranked losses per week | 5.0 | 5.5 |
  | Home win %, conference games | 56.1% | 55.8% |

- **Still off:**
  - Games decided by 3 or fewer: 10.9% vs 16.9%.
  - Top-10 teams beat unranked conference opponents about 89% of the time, against 79.6% (only 108 real games).
  - Yards per team: about 430 vs about 390.
- **The live game changes too.** The CPU's simulated drives use the same model, so an even CPU opponent now scores about 1.9 points per drive (was 1.2). `npm run balance` doesn't cover CPU drives, so it's unaffected.
- **`npm run season`** now prints each measure next to the real value. All 111 tests pass.

## Done: team page, depth chart and player cards (2026-10-24)
- **Team page** (`render/teamScreen.ts`): T or the TEAM button in the season hub; Esc returns to the hub.
  - Header: record, live OVR / OFF / DEF / ST (they update as you reorder), and `DEPTH: YOURS / STAFF`.
  - One tab per position (17); a tab turns orange when someone at that position is hurt.
  - **Depth chart:** one player tab per player, in depth order: the slot he starts at this week (X, Z, SL, LT, NB...; gold strip), or his depth rank, or OUT in red; number, name, position, OVR.
  - **Drag a tab** up or down to reorder (a gold line shows where it lands). Click selects. W/S also selects.
  - **Player card:** name, number, position, archetype (`archetypeLabel`), class, height, weight, hometown, stars, potential, dev trait, injury status, and the slot he's starting at. Then the **OVR breakdown** (`overallBreakdown` in `data/positions.ts`): each rating in that position's overall, heaviest first, with value, bar, weight share and overall points gained or lost against a 75 (they sum to the overall). The ratings that don't count at his position sit in a small grid below. Hover any rating for a plain-language line on what it does (`RATING_INFO.blurb`).
- **Depth chart model:** per position, stored as the existing slot-based `TeamState.depth`, so no save change. `positionOrder` and `reorderPosition` in `data/depth.ts`; see SEASON.md.
- **Delegation:** the first drag (or G) takes the chart from the staff (`setUserDepth`, `delegate.depthChart = false`), so the weekly prep no longer resets it. G hands it back (`useStaffDepth`).
- **Fix: live season games now use the season squads** (`squadFor`) for both teams, so the user's depth chart and both teams' injuries reach the field and the CPU drive sim. Before, the live game always used the generated roster's auto chart. Exhibition games are unchanged.
- **Tests:** breakdown sums to the overall; auto order is by overall; moving a WR to #1 makes him the X; every slot keeps every candidate once; an injured new starter is skipped; an OT move reaches LT/RT and TE2; a user chart survives a week and a JSON round trip, and handing it back restores the staff chart. Every rating has a blurb that fits the card.
- **Not checked by hand yet:** the page in the browser (layout at 640×360, dragging feel).

## Done: playbook page and starred plays (2026-10-25)
- **Playbook page** (`render/playbookScreen.ts`): P or the PLAYBOOK button (left of TEAM) in the season hub.
  - Tabs: STARRED, PASS, RUN, PLAY ACTION. Each shows a 4×3 grid of play cards with the call screen's mini diagram; W/S or the wheel pages through them. Special teams kicks aren't included because they have no formation to draw.
  - **Click a card** to open the detail view. It shows the user's **current starters** (`starters(squadFor(...))`, so injuries and the user's depth chart count) as numbered chips in the formation, with the offense moving up. Each player's job is drawn:
    - routes in color, with an arrow when the route keeps going, a dot when he settles, and a T-bar for lead blocks and play-action fakes;
    - run paths bold white;
    - linemen's blocks as short T-bars, angled by the scheme: forward and playside for zone, wider for stretch, back-side down blocks for gap and trap, back for pass sets (angled for slides);
    - pullers dotted behind the line to the hole;
    - the QB's drop, or his path on a designed run.
  - The panel lists the formation, the scheme and read (`schemeText`), the tip, then each player's position, number, name and job (`jobOf`, 8 characters or fewer). Hovering a chip or a row highlights the other one and shows the player's OVR. A/D steps through the tab, F mirrors the play, Esc goes back to the grid.
- **Starred plays** (`game/starred.ts`): click the star on any card (playbook page or call screen), Space or the button in the detail view. They're stored in their own localStorage key, not in the season, so they apply to every game, exhibitions included. Unknown ids are dropped on load.
- **Call screen:** the formation chips' ALL is replaced by **STARRED**, the tab's starred plays. It's the default chip when the tab has any starred plays; otherwise the first formation is. An empty STARRED chip says how to add plays. The cards' mini diagram moved to `render/playDiagram.ts` (`drawMiniPlay`), shared with the playbook page.
- **Tests:** every play's 11 jobs are non-empty and fit the panel, mirrored too; a puller reads PULL and a pass-pro lineman PROTECT; starred parsing drops junk and unknown ids; toggling a star works without storage.
- **Checked in headless Chrome** (CDP canvas snapshots): the hub buttons, the grid, detail views (Mesh, Power O, PA Boot Flood, Speed Option, Curl Flat), starring by click, and the call screen's STARRED chip. A QB under center is drawn a chip behind the center so both numbers show.
- **Rough edges:** long play names are cut at 16 characters on the grid cards ("I-FORM DEEP CROS"). The option QB's path down the line isn't drawn, only his mesh point. Deep routes run off the top of the field.

## Done: player progression (2026-10-25)
Players now improve automatically during the season; nobody picks attributes. Every team uses the same code. Design notes, the formulas and the calibration are in [PROGRESSION.md](PROGRESSION.md).
- **Drive logs:** `simulateDrive` reports each play to an optional `onPlay` callback without drawing random numbers, so every score is unchanged (tested).
  - `simGame` and `settleTie` collect each game's drives, with the try and kickoff after a score.
  - Live season games log the user's real snaps (gain, pass or run, sack, INT) and kicks, plus the CPU's simulated drives. These go through `advanceWeek(state, result, drives)`.
- **Game grades** (`season/grades.ts`): one grade per player per snap.
  - A win or a loss at his job, less an even player's rate. The odds come from the play's success and his overall against the man across from him.
  - Key players (passer, target and cover man, carrier, tackler) follow the play more closely. Sacks go on a lineman and his rusher, INTs on the cover man. Kicks are graded against make odds.
  - Centered so the average snap grades 0 at every position at an even matchup (within ±0.01).
  - Backups rotate in (`ROTATION`), and package players sub in (`PACKAGES`: TE2 and FB, SAM, DIME). Playing time is measured against a full-time player at the slot, so a rotating DT starter counts as full time.
- **XP:** playing time × (base + grade bonus) × a multiplier clamped to 0.5–2: headroom to potential, dev trait, confidence (last 3 grades), morale (team win %, starting) and class.
- **Level-ups:** 1–3 points at a typical position, scaled per position (`POS_POINTS`, `LEVEL_XP`) so a level-up is worth the same overall everywhere. A 4% breakthrough gives 4–6.
  - Each point is a weighted draw: OVR weight × profile (grow into strengths) × performance tags (deep completions → `dac`, contested catches → `cit`, broken tackles → `elu`, sacks → `rsh`...) × growth rate (speed almost never) × headroom to a per-rating ceiling.
- **State:** `TeamState.progress` (XP, level, all-time deltas, last level-up week, tags, recent grades). `squadFor` applies it and rebuilds the staff depth chart. `nextSeason` carries it over.
- **Week loop:** a new `progress` step after `play`. Breakthroughs make the news for the user's team only (other teams' breakthroughs were dropped from the news; their breakouts still show).
- **Team page:**
  - The OVR breakdown's `+/-` column is gone. **WK** shows a green arrow for a rating raised last week, or a flat line; **ALL** is the all-time change.
  - Grown ratings in the other-ratings grid are green.
  - The card shows `LVL n`, an XP bar and the XP multiplier (hover for its parts). The depth list shows an arrow next to OVR for last week's level-ups.
  - The hub shows last week's level-ups and breakthroughs above the hint bar.
- **Speed:** `squadFor` is cached per team state, `buildDepth` scores each candidate once, and `overallRaw` precomputes its terms. Without these, progression made a season 8.8 s; it's now 1.7 s (was 0.63 s).
- **`npm run season`** has a progression section: overall gained by position for starters and others, levels, breakthroughs, and a flag for any position more than 15% off the mean. 5 seasons: the mean is +2.0 for starters, from 1.8 (DE) to 2.2 (C, P). Scores and polls didn't move outside noise.
- **`npm run balance`:** byte-identical (checked against HEAD).
- **Tests:** 11 new in `src/progression.test.ts`:
  - fairness: XP per game by position within 10%, offense vs defense within 5%, overall per XP within 15%
  - the multiplier clamp
  - points per level-up and breakthroughs; ceilings
  - speed under 2% of points
  - a pocket passer keeps his identity
  - tags steer draws
  - `squadFor` applies deltas and re-sorts
  - a week levels players and marks last week
  - live games progress only through drives
  The save test now checks box-score packing and a 4 MB budget. 132 in total.
- **Checked in headless Chrome** (CDP: new season, sim 5 and 9 weeks, team page, hover, news): arrows, ALL, LVL and XP, the hub line and the breakthrough news all show. No console errors.
- **Flags (not tuned):**
  - Saves grew to about 2.6 MB packed (progression is about 0.9 MB of it).
  - Backups barely grow (0–0.3 a season): they need the offseason.
  - The WK arrows clear after a bye week, since they mean "the last week played".
  - The AP preseason prior now reads the current roster, so it drifts slightly as players grow (it fades out by week 9 anyway).

## Done: grades against the expected outcome (2026-10-25)
**Bug:** game grades rewarded winning.
- They were centered on the league-wide success rate (0.56) and on an even player matchup. So a strong team's offense, which succeeds more against a weak defense, and any player out-rated by his man's opponent graded well just for the matchup.
- Template teams at 88 against 68: the strong team's starters graded +0.21 a snap and earned 162 XP a game; the weak team's graded −0.22 and earned 33. That's 5×, and it compounds as the strong team improves.

**Fix** (`season/grades.ts`):
- Every snap is graded against the win rate expected for that player in that matchup (`expectedWin`): his overall against the man across from him, and the success rate expected for this offense against this defense, home edge included.
  - That success rate is `expectedSuccess`, a logistic fit on 3,000 simulated games between real rosters (`successBase` 0.254, `successPerPoint` 0.0365 per point of offense-minus-defense rating).
  - A block held against an elite rusher is now worth more than against a weak one.
- One-on-one reps (`PAIRS`: line, receivers and corners, TE and SS, back and WILL) are one draw, and the defender's grade mirrors it.
- A sack now tags the rusher who beat his man instead of forcing a loss on a lineman.
- Punts and kickoffs are graded against the kicker matchup's expectation, not a flat 0.5.

**After:**
- Strong and weak teams both average 0 per snap (±0.003) and earn 97–98 XP a game at 88 vs 68, 80 vs 80, and 68 vs 88.
- In live games, the user beating the expected success rate still raises the offense's grades.
- 5 real seasons: starters gain +1.95 (positions 1.80–2.18). By tier: T1 2.04, T2 2.08, T3 2.00, T4 1.90, T5 1.73. The remaining slope comes from the multiplier's morale (team win %, which you specified) and from better dev traits on better players, not from grades. `npm run season` now prints the tier line.
- Scores are unchanged (grading draws on its own random stream).

**Tests:** 3 new: a strong team beating a weak one earns the same XP (within 5%) and grades about 0; expectations by matchup (a held block is worth more against an elite rusher, and the defense's expectation mirrors the offense's); beating or missing the expected result grades above or below 0. 135 in total.

## Done: soft potential ceiling, empty breakthroughs fixed (2026-10-25)
- **Problem:** potential wasn't much of a ceiling.
  - The XP multiplier bottomed out at 0.5, so players at potential kept leveling about as often as anyone.
  - Only the per-rating ceilings held them, and those allow about +2 overall from `ceilMargin` plus whole-point steps.
  - Measured over 4 open-ended seasons: up to 4.5 overall past potential, and 58% of leveled players over it by season 4.
- **Fix:** potential stays a soft ceiling, not a hard cap. A new `potentialFactor` scales the XP multiplier after its 0.5–2 clamp:
  - 1 with a point or more of room
  - `atPotential` (0.15) at potential
  - halving for every point past it
  A full-time starter at potential gets about 0.08× XP, about one level-up a season, and each one can still be a breakthrough. The card's hover shows AT POT.
  - **After:** at most 1.5 past potential in 4 seasons. Players starting a season at potential level 0.1–0.3 times in it.
- **Bug fixed:** a level-up where every rating was already at its ceiling still counted as a level. If it rolled a breakthrough, it made the news with no points (8 times over seasons 3–4). Now such a level-up spends its XP but isn't a level, an arrow or a breakthrough.
- **Season report:** starters gain +1.58 a season (was +1.95). Upperclassmen near potential now slow down sharply.
  - **Flag:** the punter row is 17% over the mean (it was already the highest). Not tuned.
- **Tests:** 2 new: the potential factor (1 with room, 0.15 at potential, halving past it, never 0, and the total under the floor); an all-at-ceiling level-up is no level, no event and no breakthrough. The clamp test now checks the floor for a player below potential. 137 in total.

## Balance baseline
From `npm run balance` on the **reference matchup** (template players, offense 90 vs defense 88; `referenceMatchup` in `src/harness.ts`), after the ratings and roster work. The earlier baselines used the old generated Georgia and Alabama rosters, which had a lucky 99-elusiveness back; compare against this one from now on. The single-seed 120-rep rows below move a few points from run to run.
- **Pass and PA rows:** the auto-QB throws to the most open receiver after a fixed hold time, aiming in bounds.
- **Run rows:** the auto-QB hands off as soon as it can (it reads the zone-read key, waits out the draw, and pitches the option on the key), and `autoRun` reads the line for a lane. It doesn't steer around tacklers, so expect real players to do better.

| All pass plays, defense | Hold | Comp | INT | Sacks | YPP |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | 1.2s | 70% | 5.0% | 0/120 | 4.7 |
| 2 Man Under | 2.2s | 68% | 5.3% | 6/120 | 6.3 |
| Cover 1 Robber | 2.2s | 66% | 4.4% | 7/120 | 6.6 |
| Cover 0 Blitz | 1.2s | 70% | 4.2% | 0/120 | 6.6 |
| Cover 0 Blitz | 2.2s | 58% | 7.7% | 94/120 | -1.1 |

| PA plays (dropback), defense | Hold | Comp | INT | Sacks | YPP |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | 2.2s | 70% | 7.0% | 5/120 | 7.4 |
| Cover 1 Robber | 2.2s | 71% | 4.5% | 8/120 | 7.7 |
| Cover 0 Blitz | 1.2s | 68% | 5.0% | 0/120 | 14.5 |

**Runs:**
- All 26 run rows (with RPO gives and QB runs): 3.6 YPC, median 2.1, 16% stuffs, 20% gaining 4+, 8% gaining 10+.
- The original five runs (IZ, OZ, Power, Toss, Zone Read): 4.4 YPC, median 2.8, 12% stuffs, 28% gaining 4+, 11% gaining 10+. The FBS target is 4.5-5.5 YPC, about 18% stuffs and about 45% gaining 4+.
- Since the return fix, the same seed reads 3.4 YPC on all runs and 4.0 on the core five, but that's RNG reshuffle, not a change in the run game (see the return-fix section). Across seeds the core five run 4.0-4.4.

**Short yardage (3rd and 1):** Power 69-78%, Iso 82-85%, QB Sneak 82-89%, QB Power 58-63% (14% against Cover 0).

The per-play `RUN` and `PLAY` rows in `balance.txt` have the details. Reading the defense still matters: don't pitch into the zero blitz, and don't hold the ball against it.

### Future tuning targets: NFL results by route
The NFL completion %, yards per target and man/zone splits by route are in [TARGETS.md](TARGETS.md). They're not tuned toward yet; they belong with the defense work.
These need a harness that targets by route (or by read), not "most open". The current one over-throws flats and checkdowns. The `ROUTE` rows are a first step: they target one route per row, against man calls only.

**Special teams** (after the return fix): an auto-kicker with fixed aim per kick type and perfect meter timing, 200 reps each, in random wind. Kicks use their own seed, so the scrimmage rows don't move.

| Kick | Result |
| --- | --- |
| Punt from own 30 (full power) | Gross 42.4, net 40.6. 68% fair caught, 5.5-yard average return, 0 blocks, 0 return TDs |
| Pooch from opp 40 (74% power) | 80% inside the 20, 87% fair caught, 6 muffs recovered |
| Coffin corner from opp 38 | 99% inside the 20: 55% out of bounds, 27% touchbacks |
| Line drive from own 30 | Gross 45.8, net 35.5. 98% returned (10.4 average), 1 returned for a TD |
| Deep kickoff | 76% touchbacks. CPU starts at its 23.6; 14.5-yard average return |
| Sky kickoff | CPU starts at its 30.9. 14% fair caught |
| Squib | CPU starts at its 35.3. 3 returned for TDs |
| Corner kickoff | CPU starts at its 23.1. 10% out of bounds |
| FG, straight aim, calm | 20-29: 96%, 30-39: 88%, 40-49: 72%, 50-59: 35% |
| FG, straight aim, wind | 20-29: 94%, 30-39: 78%, 40-49: 65%, 50-59: 41%. The auto-kicker doesn't allow for wind |

## Done: health and injuries (2026-10-25)
Design, research and targets: [INJURIES.md](INJURIES.md).
- **Health from 0 to 100** (`TeamState.health`, `Athlete.health`). After each game, every snap and every hit can knock it down by 10–30 points. It recovers 12 a week, or 25 a week sitting out.
  - A banged-up player plays at `fitRatings`: −0.2 per point lost on speed, acceleration, strength and stamina, and −0.08 on the rest. That reaches the live sim, team ratings, the game sim and the grades.
  - He also runs more injury risk.
- **Injuries** (`season/injuries.ts`) are rolled from each game's grades. `GameGrade` gains `hits`: carries, catches, tackles made, sacks taken and made.
  - Severity runs from 1 week to season-ending, with a type label. Players come back at 85 health.
  - Every injury goes into `SeasonState.injuryLog`, with news for the user's team and the worst injuries to real players elsewhere.
  - Live and simulated games use the same model, after the game.
- **Rest.** The staff chart (CPU teams and a delegated user chart) sits a starter below 80 health when the backup is within 4 overall. In the grades, a hurt starter's backup takes more of his snaps (`ROTATION_HURT`). The user's own chart is never reshuffled; they drag to rest players.
- **Team page.** Banged-up players show health % in orange. The injured sit in an **INJURED: OUT** section below the depth list (`3W`, `SZN`): selectable, not draggable, and they keep their place for when they're back. The card shows `BANGED UP: 72% HEALTH` with the playing overall (healthy overall under it), or `OUT 3 WEEKS: HIGH ANKLE SPRAIN`.
- **Setting:** `SeasonConfig.injuries` (OFF / LIGHT / NORMAL), cycled with I on the title screen for a new season.
- **Season report:** a new INJURIES section, with `INJURIES=light|off`. NORMAL results: 10.4 starter-games lost per team-season (target 10–12; real is about 18–20). The starting QB plays every game in 82% of seasons. 0.58 season-ending injuries per team. 12% of starters are banged up on a given week. Position shares are within 2 points of the NCAA ISP. LIGHT: 5.2 starter-games lost, and the QB plays every game in 90% of seasons.
- **Side effect:** starters' progression over a season is about 8% lower (1.58 → 1.45 mean), and backups' is higher. No position is newly flagged. `npm run balance` is byte-identical.
- **Tests:** 8 in `src/injuries.test.ts`:
  - OFF is clean;
  - NORMAL is deterministic and survives a JSON round trip;
  - an injured player sits, comes back banged up, then heals;
  - `fitRatings` and team ratings drop;
  - staff rest for a close backup but not a weak one;
  - the user chart is untouched;
  - QB risk is lower than RB risk;
  - the OUT section and the drag index mapping.

  145 tests pass in total.

## Done: confidence, next man up, breakouts (2026-10-25)
Design, tuning and calibration: [CONFIDENCE.md](CONFIDENCE.md).

**Confidence** is a per-player value from -1 to +1 (`Progress.c`). It replaces the XP multiplier's "last 3 grades".
- **How it moves:** after each game it shifts toward how he played against expectation. That's an EMA of a z from his game grade, with big snaps weighted by `1 + leverage` (`GameGrade.lsum`/`lw`). Half of it carries into a new season.
- **On the field (`data/confidence.ts`):** it shifts every rating but speed, acceleration, strength, stamina, arm and leg, scaled by the snap's **leverage**:
  - leverage parts: third or fourth down, the red zone, late and close, long FGs
  - size at ±1 confidence: about ±0.5 OVR on an ordinary snap and ±3 at full leverage
  - the live game shifts both rosters per snap (`clutchRoster`), and the HUD shows `CLUTCH` with the QB's or kicker's label on big snaps
  - the drive sim shifts each snap's rating gap by the units' confidence (`simulateDrive`'s `conf`, from `teamConf`) and the kicker's FG odds. It draws no extra random numbers.
- **Grades expect it** (per-snap expected success and FG odds), so it can't feed itself. A confident team still grades about 0 (tested).
- **Staff charts:** `slotScore` weighs confidence, so slumping starters can lose their job to a close backup. Last game's starters (`TeamState.st`) keep an incumbent edge, so the chart doesn't flip-flop.

**Next man up:**
- **Who sparks:** a new starter who was quiet (no start in the team's last 2 games, under 3 this season, no injury this season, no spark yet this season).
- **Earned reasons only:** the man he replaced is injured, slumping (built-up confidence -0.35 or lower) or outplayed (overall no better than the new man's).
- **What he gets:** +0.5 confidence on the field from his first start. `newStarters` is pure, so `squadFor` shows it before the game. Good starts lock half of what's left in; bad ones halve it. It lasts 3 starts.
- **Rest days are neutral:** a banged-up starter sitting out gives no spark and no penalty.
- **News** on the user's team.

**Breakouts:** a sparked player who starts 3 of the next 4 games at a mean z of 0.55 or better gets:
- a dev trait up (`Progress.dev`)
- +2 potential (`Progress.pot`; ceilings follow)
- a forced breakthrough level-up (`levelUp`'s `force`)
- news: always for the user's team, the top two elsewhere

Once a career.

**Anti-farming:**
- Benching a healthy, in-form, better starter fires nothing.
- When the user's chart does it, the starter takes a fading benching penalty (`Progress.bh`). The staff never do it.
- The slump test ignores that penalty, so benchings can't manufacture a slump.
- The season report's **FARMING CHECK**: swapping Georgia's QBs every week fires 0 sparks, and an injury fires 1.

**UI:**
- **Card:** a CONF row (bar, label, SPARK, BREAKOUT year, hover explains it). The ratings block moved down a line and the grid tightened to fit.
- **Depth list:** chevrons for strong confidence.
- **Hub line:** breakouts and next man up.
- **Checked in headless Chrome:** the card, the WR list, the hover, the hub and the CLUTCH tag. No console errors.

**Season report, 5 seasons** (new CONFIDENCE and FARMING CHECK sections; `SeasonState.confLog` records sparks, user benchings and breakouts):
- **Confidence spread:** starters' SD 0.31, 4.5% beyond ±0.6.
- **Sparks:** 4.2 per team-season (injured 2.4, slumping 0.8, outplayed 1.0). 9.9% of them break out, 57 breakouts a season nationally.
- **Slumping QBs:** benched in 8.8% of team-seasons.
- **First tuning pass:** a rest-day reason gave 8.5 sparks a team-season by itself and was dropped.
- **Scores** are unchanged within noise (26.2 points per team, 34.0% one-score games).
- **Progression:** the mean starter gain fell from 1.45 to 1.40, because starters lose a few games to slump benchings and sparked backups. The punter row stays flagged (29% over; 28% before). The kicker sits at 14%, just under the line.

**Checks:**
- `npm run balance` is byte-identical against HEAD (checked in a scratch worktree).
- **Tests:** 16 new in `src/confidence.test.ts`:
  - leverage
  - the shift spares physical ratings
  - zero confidence leaves drives unchanged, and a confident offense scores more late
  - no feedback in the grades
  - the slump bench and the incumbent edge
  - the EMA
  - the injured backup's spark, before and after the game
  - lock-in and fade
  - benching an in-form starter
  - repeated benchings never spark
  - slump vs. rest day
  - outplayed
  - no spark after an injury or twice in a season
  - breakouts
  - a save mid-season continues identically

  161 tests pass.

## Done: morale (2026-10-26)
Design, tuning and calibration: [MORALE.md](MORALE.md).

**Morale** is a per-player value from -1 to +1 (`TeamState.mo`). It's how a player feels about his situation, and it's separate from confidence (how he feels about his own play).
- **Drivers:** each pulls toward a target, weighed by his temperament.
  - **Role vs. expectation:** from the depth chart. Expectations come from class and stars (a 5★ freshman expects snaps, a walk-on doesn't), capped by what his talent earns. A backup within 2 OVR of the starter feels buried.
  - **Team mood:** form, AP rank, losing streaks, rivalry results, bowl eligibility, the playoff and postseason wins. It's computed from results.
  - **Coach decisions:** losing the job (any chart, scaled by pride) or winning it, fading.
  - **Locker room:** teammates' morale weighted by voice (leadership × class × starting).
- **Hidden temperament,** drawn from the player's id and never stored: baseline, pride, team-mindedness and leadership. The card shows one word: LEADER, MOODY, PROUD, LOYAL or MELLOW.
- **Slow:** each team game moves it 15% of the way to its target, plus a small nudge from its own RNG stream. Half of the distance from baseline carries into a new season.
- **Never reads grades,** so it doesn't track confidence (r = 0.006 across starters).
- **Effect:** the XP multiplier's morale factor is now `1 + 0.1 × morale` (practice effort). It replaces the win % and starter placeholder.

**UI (team page):**
- **MOOD row on the card:** a pixel face in blue or gold, the mood plus the biggest reason (`FRUSTRATED: EXPECTS TO START`), and the temperament word. Hover explains morale and the word.
- **Depth list:** a blue frown for players at −0.4 or lower.
- **Header:** the team's mood.
- **Layout:** to fit the row, the OTHER RATINGS grid lost its header line (a rule now), and the breakdown moved up 3 px.
- **No news items,** by choice.

**Season report** (new MORALE section, 5 seasons):
- SD 0.21, with 0.6% beyond ±0.6 and none beyond ±0.9.
- 4.0 unhappy players a team, spread out: the worst 10% of teams hold 22.6% of them (the first version had 60%).
- Starters' morale vs. confidence: r = 0.006.
- 84% of the unhappy are unhappy about their role.

**Checks:**
- **Side effects:**
  - The mean starter gain is 1.39 (was 1.40), and the tier line is a little flatter.
  - **Flag:** breakouts went from 57 to 65 a season (about 2 SD). This is probably the knock-on of different XP. Not tuned.
  - Scores, injuries and confidence are otherwise within noise.
  - A season sims in 2.60 s (was 2.32). A new `positionOrders` (`data/depth.ts`) builds every position's depth order in one pass.
- `npm run balance` is byte-identical.
- **Tests:** 13 new in `src/morale.test.ts`:
  - temperament
  - expectations: 5★ vs. walk-on, senior starter, close backup
  - the role term
  - a senior backup sours and a walk-on doesn't
  - slow movement and settling
  - team mood (winning, a losing streak, a rivalry win)
  - benching hurts on any chart, the job lifts, and both fade
  - no benching for an injury or rest day
  - an unhappy leader drags the room
  - confidence leaves morale alone
  - the XP factor
  - the reason is the biggest driver
  - a save continues identically, and the offseason carry

  The save test's two full seasons got a 20 s timeout: they were already near the 5 s default. 174 tests pass.
- **Checked in headless Chrome:** the MOOD row, hover, header and depth-list frown on QB, MLB and WR cards (a 4★ freshman, eighth on the WR chart, reads `MISERABLE: WANTS MORE SNAPS`, MOODY). No console errors.

## Done: weekly prep page, scouting and defensive identity (2026-10-26)
Design, every report item and the hooks for coaches: [SCOUTING.md](SCOUTING.md).
- **Defensive identity** (`data/identity.ts`): each program gets a style (aggressive, balanced or soft), seeded per team until DCs exist. The roster shades it: a strong DL blitzes less, strong CBs play more Cover 1 and press more.
  - The style sets the call mix: Cover 0 at about 30% / 20% / 10%.
  - It sets press rates, and a third-and-7+ blitz multiplier (1.6 / 1.2 / 0.7).
  - Every call keeps an 8% floor, and the FBS mean is 40.8 / 39.6 / 19.6, against the old fixed 40/40/20.
- **Live game:** `toCall` picks the CPU defense's call and press from its identity and the down and distance. Same random draws per snap. Sampled in the browser: a balanced opponent called 2 Man 38%, Cover 1 40%, Cover 0 22% over 400 snaps.
- **Scouting report** (`season/scouting.ts`, pure). Every item has a coach and a tier for hiding by staff quality later; all tiers show for now.
  - **OC:** shells, third-and-long zero, press, players to watch, the weak link.
  - **DC:** scheme, QB, go-to target, hot and cold players. Information only for now.
  - **Position coaches:** the WR, OL and QB coaches' one-on-one matchups and run side.
  - **Trainer and ST coach:** injuries and banged-up starters; kicker and returner.
  - **Staff picks:** 3–5 plays from `playTraits` (read off the play data) and rules on the tendencies.
- **Prep page** (`render/prepScreen.ts`): PREP or O in the hub. It has three tabs:
  - **OPPONENT:** you vs. them OVR/OFF/DEF/ST, identity tags, per-game averages, the last 5 results.
  - **ROSTER:** their starters or backups (W/S), offense and defense: real players in gold, health %, confidence chevrons, OUT list.
  - **SCOUTING:** the report (W/S or wheel to scroll) and the staff picks as mini play cards. Clicking a star saves the play to the call screen's STARRED chip.
- **Hub:** the PREP button sits left of PLAYBOOK. The hint bar now reads `O: PREP ... P: BOOK`, and the LAST WEEK line is cut at 48 characters to clear the button.
- **Checks:**
  - `npm run balance` is byte-identical against HEAD (scratch worktree).
  - `npm run season` is identical apart from timings.
  - 9 new tests in `src/scouting.test.ts`: floors and determinism; the league mean; style and third-and-long ordering; `pickDefCall` draws unchanged; play traits; the report for all 138 teams (with a JSON round trip, and real starters quoted); an injured starter listed; quick or screen picks against a blitz-heavy defense; starred plays first. 183 tests pass.
  - Checked in headless Chrome (CDP canvas snapshots): the hub button, all three tabs, scrolling, starring a pick, and starting a live game. No console errors.
- **Not built, by design:** the DC report has no on-field effect yet, since you don't play defense. Weekly emphases with coaches will give it one.

## Done: coaching staffs, scouting by staff quality, weekly emphases (2026-10-26)
Design, tuning and calibration: [COACHES.md](COACHES.md).
- **Staffs** (`data/coaches.ts`): every program has an OC, a DC, nine position coaches (QB, RB, WR, TE, OL, DL, LB, DB, ST) and a head trainer.
  - Generated from the team id and never stored, like rosters. The level follows prestige.
  - **SCOUT** for everyone; **TEACH** and **GAME** for position coaches.
  - The DC carries the defensive style. He's generated with the same seeded style the program had, so identities are unchanged (tested for every team).
  - `staffFor` (`season/world.ts`) is where the carousel will lay changes over the staff.
- **Scouting by staff quality** (`season/scouting.ts`):
  - Each section's coach finds the items his scout reaches (tier 2 at 60, tier 3 at 78). The rest are counted: `+2 MORE: A SHARPER EYE WOULD FIND THEM`.
  - Tendencies blur under 75 scout (`~30%`), and turn into words under 55 (`SOMETIMES`).
  - Staff play picks only use reads that were found.
  - T1 staffs find every tier-2 read and 55% of tier-3; T5 staffs find 18% of tier-2.
- **Weekly emphases** (`data/emphasis.ts`, `season/emphasis.ts`): 22 emphases over the nine groups, plus STANDARD, the default.
  - The user can set them on the prep page's new **STAFF** tab. They reset to standard every week, and nothing forces the user to touch them.
  - **Practice:** tags on the emphasis's ratings steer the group's level-ups (about ×1.7 for one week at teach 50). Total XP is unchanged.
  - **Game day,** simulated play only: a small situational edge in `simulateDrive`, both units in the user's sim games and the user's defense in live games. +0.1 to +1.0 points a game at an average coach, at most 1.42 at game-day 95. Pass and run effects scale with how likely a snap is a pass, so pass rush is worth more against passing teams, and so on.
  - Grades expect the edge (`LoggedPlay.em`), so emphases don't inflate XP.
  - **CPU staffs stay on standard,** so the league is unchanged.
- **UI:**
  - **STAFF tab:** the coach list with ratings and this week's pick. The selected coach's options, what each practices and does, and his suggestion from the scouting reads (only at tier-2 scouting).
  - **Scouting tab:** coach names and SCOUT on the section headers, the hidden-item lines, and the DC's emphasis ideas.
  - **Team page card:** the XP hover shows `PRACTICING RSH`.
- **`npm run season`:** a new COACHES section with staff by tier and paired per-drive rows for every emphasis (margin at game-day 50 and 95, defense against pass-heavy and run-heavy offenses, and practice odds).
  - The first version paired whole games, which swung ±0.6 points from reshuffled draws. Per-drive pairs fixed it.
  - First tuning pass:
    - Plain group shares made DB press man worth +2.25 a game and TE receiving +0.04. A square-root group weight and per-situation scales fixed both.
    - DB tackling became a run-phase effect, so press man no longer beats it against every opponent.
- **Checks:**
  - `npm run balance` is byte-identical against HEAD.
  - `npm run season` is identical outside the new section, apart from timings.
  - **Tests:** 14 new in `src/coaches.test.ts`:
    - staffs complete, deterministic and JSON-safe
    - tiers ordered, and the DC keeps the style
    - a weak staff sees only tier 1 and gets no suggestions, while an elite one sees everything
    - `pctAt`
    - standard plays exactly as before
    - pass rush only on passing downs, and more against passing teams
    - groups scaled by their share
    - tackling and the deep ball
    - an emphasized team grades about 0
    - practice steers, and a better teacher steers harder
    - picks change the user's sim game and nothing else, and are cleared after the week
    - a mid-week save plays the same

    197 tests pass.
  - **Checked in headless Chrome** (CDP screenshots) for Georgia and Eastern Michigan (the weakest staff):
    - the STAFF tab, with picks by keyboard
    - the suggestions and `NO READ ON THIS ONE`
    - the scouting headers, vague tendencies and hidden lines
    - a live game launching with the user's defensive mods
    - no console errors
- **Flags (not tuned):**
  - **Offensive emphases don't depend on the opponent:** the drive sim doesn't model defensive calls. For a given team, QB accuracy always edges out pocket poise.
  - TE receiving (0.13) and the ST emphases (0.10–0.18) are mostly about practice.
  - Kickers' practice odds run ×2.3–3.0, since they level less often.
- **Small deviations from the plan:** emphases cycle with Q/E (A/D already switch tabs), and a bye week's prep page has no STAFF tab (no game, so no XP and no game day).

## Done: desktop app and saves (2026-10-27)
The game now runs as a Windows desktop app (Electron), and saves no longer live in `localStorage`. The old store allowed about 5 MB, a season packed to about 2.6 MB, and a failed save was dropped silently.
- **Storage** (`src/engine/storage.ts`):
  - Values are gzipped. A week-5 season is 1.6 MB of JSON and 294 KB on disk.
  - Saves are preloaded at boot (`initStore` in `main.ts`), so `loadSeason`/`hasSavedSeason` stay synchronous.
  - Writes are queued in the background.
  - A failed read or write shows a `SAVE FAILED: PROGRESS NOT SAVED` strip for 5 s.
  - Backends: files in the app, IndexedDB in a browser, memory in Node.
  - A browser save from an older build (`saturday-gridiron-<key>` in `localStorage`) moves to IndexedDB on first load.
  - Keys: `season-v1` (`SEASON_KEY`, `save.ts`) and `starred` (`STARRED_KEY`, `starred.ts`).
- **The app** (`electron/main.cjs`, `preload.cjs`):
  - One window: 1280×720, minimum 640×360, no menu, F11 for fullscreen. Context isolation and the sandbox are on.
  - The preload exposes only `gridironStore` (read, write, remove).
  - Saves go to `%APPDATA%/Saturday Gridiron/saves/<key>.bin`, written atomically (temp file, then rename). The last good save is kept as `.bak`.
- **Scripts:**
  - `npm run app` (`scripts/app-dev.mjs`) starts Vite, then opens the app at it, so hot reload works as in the browser. It clears `ELECTRON_RUN_AS_NODE`, which VS Code terminals can leave set, and passes extra arguments to Electron.
  - `npm run app:build` builds the portable .exe and then the installer. Built together, the two collided (NSIS: "Can't open output file"), so they run in sequence. `win-unpacked/` comes out of either one.
  - `vite.config.ts` sets `base: './'` so `dist/` loads from disk. `electronLanguages: ['en-US']` trims 49 MB of Chromium locales.
- **Versions:** Electron 44.9.3, the oldest release with the fix for a high-severity advisory (GHSA-jr5w-w6x2-84p9, which affects 44.7.0). electron-builder 26.17.0.
- **Sizes:** the app bundle is 583 KB. The portable .exe is 102 MB, the installer 112 MB, and `win-unpacked` 322 MB, nearly all of it Electron.
- **Checks:**
  - `npm run typecheck`; `npm test` (197 pass); `npm run balance` byte-identical.
  - Driven over CDP in the built app:
    - a new season writes its file
    - restarting the app and pressing C continues it
    - the portable .exe run from another folder finds the same save
    - F11 fills the screen
    - a read-only save file shows SAVE FAILED, and the old save stays intact
  - In the dev app, an edited source file reloads the window.
  - In headless Chrome on the dev server: an old `localStorage` season and starred plays moved into IndexedDB, and the continued season survived a reload.
- **Steam, later:** a depot takes `win-unpacked/`, Steam Auto-Cloud can take the saves folder, and `steamworks.js` adds achievements and cloud. A commercial release with real schools and players would need licensing (README).

## Done: transfer portal (2026-10-27)
The first offseason system, built from [TRANSFER_PORTAL_PLAN.md](TRANSFER_PORTAL_PLAN.md). Design as built, tuning and results: [PORTAL.md](PORTAL.md).
- **Rosters that change:** `TeamState.roster` (`out`, `in`) laid over the generated roster.
  - `baseRoster`/`baseSquad` (`season/world.ts`) feed `squadFor`, progression's ceilings, confidence's bases and `carryMorale`.
  - A player keeps his id for life. `generatedAthlete(id)` rebuilds any player, walk-ons included (`makeWalkOn`, own stream).
  - With no deltas, `balance.txt` was byte-identical and `season.txt` identical apart from timings.
- **Offseason phase:** `'offseason'` between `complete` and `nextSeason`, for open-ended seasons only.
  - Its stages are in `season/offseason.ts`.
  - The title screen's new L option picks ONE SEASON or DYNASTY. Before this, nothing in the UI could start an open-ended season.
  - `SeasonSummary` keeps the final AP top 25, win shares and level-ups per player (`TeamState.lu`).
- **Portal** (`season/portal.ts`):
  - **Motives:** hidden, from the id: PT, WIN, DEV and HOME. They lean on pride, the team trait and the recruiting school's tier.
  - **Appeal:** from PT on the chart, WIN (with loss aversion on a step down), DEV and HOME.
  - **Entries:** from market against stay, morale, loyalty and class.
  - **Round 0:** the leaving list (MEET, PROMISE A START or SNAPS, LET GO, ENCOURAGE).
  - **Position coaches** build interest with a new `recruit` rating, drawn on its own stream.
  - **Two head-coach rounds:** offers capped by spots and position minimums, calls, visits, promises with offers, focus and drop.
  - **Decisions:** stars first, with a falling bar.
  - **Arrivals** carry progress and health, halve confidence and reset morale.
  - **Close (placeholder):** unplaced players go home or leave FBS, and walk-ons refill to 85.
  - **Promises** are judged when the next offseason opens.
  - **CPU staffs** run the same functions (`autoPortal`). `Delegation.portal` (F) hands the user's side to staff.
  - **News:** a new `'portal'` kind (purple). The user's stories open the next season's news.
- **Screen** (`render/portalScreen.ts`):
  - **BOARD:** position chips, standing bars, suitors and a card with action buttons.
  - **MY ROOM:** depth against needs, who signed and who's leaving.
  - **LEAVING:** the leaving list.
  - The hub's PREP button reads PORTAL in the offseason.
- **Report:** a new PORTAL section in `npm run season`: one 5-season career paired with a no-portal control.
  - Entrants are 10.2 a team (SD 4.8), 81% backups.
  - 26% sign, 64% go home (placeholder), 10% leave FBS.
  - Rosters are never over 85, and positions never go under their minimum.
  - Promise spam backfires: every promise judged was broken.
  - The rest of `season.txt` is unchanged.
- **Checks:**
  - `npm run typecheck`.
  - `npm test`: 211 pass, 14 new in `src/portal.test.ts`. They cover:
    - roster deltas, and walk-ons rebuilt from their id
    - a weak program's star likelier to enter than a power's; buried gems at a T1 enter
    - PT-first picks a start over prestige
    - a full offseason: rosters at 85, no player on two teams, minimums met, progress and morale moving with the player
    - determinism, and a mid-portal save continuing identically
    - single seasons skipping it
    - the leaving list and meeting limit; encourage and promise
    - offers capped
    - a kept and a broken promise
  - `season.test` now checks the new summary fields. The injuries save test got a 20 s timeout (it was near the 5 s default under the heavier suite).
  - `npm run balance` is byte-identical against HEAD.
  - Driven in headless Chrome over CDP on the dev server: a finished dynasty season → hub → portal (leaving, meet, promise, advance, offers, promise, call, visit, chips, MY ROOM, both rounds, close) → the next season's hub. No console errors; layout fixed from the screenshots.
- **Flags (not solved):**
  - **Bottom tiers gain every offseason.** Tier-5 starters average +2.0 over the control after one offseason and +6.6 after five, and the T1–T5 gap closes 5.8 points.
    - Buried tier 2–4 backups drop down to start, which is realistic. But class years are frozen, so they never graduate and the gain compounds.
    - Loss aversion, the origin lean and half the spots to transfers cut it only from about 7.5 to 6.6. **Graduation fixes it, and should come next.**
  - Two-thirds of entrants go home under the §7 placeholder.
  - Snaps promises are judged by starts.
  - Real portal rates weren't checked against a table: recent cycles probably run 15–20 entrants a team, above this target.

## Done: careers, the STATS page, season gains on the card (2026-10-28)
Design notes are in [CAREERS.md](CAREERS.md).
- **Careers kept apart from gameplay** (`season/career.ts`, `SeasonState.careers`). Every FBS player gets a row for each finished season: team, class, role, games and starts, overall from start to end, rating gains, level-ups and stats. He also gets a story: first start or winning the job, next man up (naming who he replaced), benched, breakout, breakthrough, injuries, awards, and the portal (entered, transferred, returned, left FBS). Nothing in the sim reads it: `npm run season` is byte-identical apart from timings.
  - A new week step, `story`, runs after `results`. `archiveSeason` runs when the season completes. `ConfEvent` gained `rep` (who a spark replaced).
- **Player card:** the ALL column is now **SZN** (gains this season, `seasonGain`), and the green tint in the small ratings grid follows it. C opens the player's career.
- **STATS page** (`render/careerScreen.ts`), opened from the hub's STATS button or H, or with C from the team page:
  - left: the roster by position, with class, seasons and overall, and TR marking a transfer
  - right: the player's headline (for example `BENCH TO BREAKOUT` or `2-YEAR STARTER`), career totals, and either SEASONS (a row per season, with this season's row live, then his story, newest first, scrolled with the wheel) or GROWTH (all-time and per-season gains at each rating in his overall)
- **Hub:** a STATS button, and a shorter hint line. The LAST WEEK line now cuts off at 40 characters to make room for the button.
- **Saves:** careers add about 2 MB of JSON a season, about 230 KB gzipped. The save test now checks the gzipped size (under 1.5 MB for a season), since localStorage's 5 MB limit no longer applies.
- **Tests:** `src/career.test.ts` (7 tests): a row per rostered player matching `Progress.gs` and the box scores, season gains against all-time, overall carrying into the next season, a transfer's history and headline, the story matching the confidence log (with the replaced starter named), totals, and save and continue. The new CAREERS section in `npm run season` reports about 1.9 MB a season, 99% of rostered players with a past season (the rest are new walk-ons), and per team-season about 10.5 start lines, 3.8 sparks, 3.6 injuries, 3.4 breakthroughs and 2.1 transfers.
- **Checked in headless Chrome:** the hub, the card's SZN column, and the STATS page in both modes, after one season, an offseason and 5 weeks.

## Done: coaches over time, step 1 of the carousel (2026-10-30)
Plan: [CAROUSEL_PLAN.md](CAROUSEL_PLAN.md) (progression by hidden arc × age × work, CPU head coaches with DEVELOP/RECRUIT/EVAL, a zero-mean development multiplier, reputation and motives, a carousel stage before the portal, hiring with fog and interviews, trees and GAs). This step is the foundation, with no gameplay change. As built: [COACHES.md](COACHES.md), "Coaches over time".
- **Ids for life:** `<team>-<role>`. `generatedCoach(id)` rebuilds a coach from his id (`data/coaches.ts`).
- **Overlay:**
  - `TeamState.staff` seats a coach in a chair.
  - `SeasonState.coaches[id].d` holds his rating changes (`applyCoachDelta`, 1–99).
  - `staffFor` lays both over the generated staff, and coaches age a year a season.
  - `newSeason` carries chairs, changes and careers.
- **Coach careers** (`season/coaching.ts`): at season end, a row per coach with team, chair, ratings and record. History only.
- **Checks:**
  - `npm run typecheck`.
  - `npm test`: 222 pass, 4 new in `src/coaching.test.ts` (rebuilt from the id, delta range, a seat and a delta surviving a save, archive and carry-over).
  - `npm run balance` is byte-identical to HEAD.
  - `npm run season` is identical apart from timings.
- **Not yet:** `defIdentity` still reads the generated DC. It needs the season's staff once DCs can change.

## Done: coach progression, step 2 of the carousel (2026-10-30)
Every seated coach's ratings change each offseason (`progressCoaches`, `season/coaching.ts`, run by `newSeason` on the season before). As built: [COACHES.md](COACHES.md), "Coaches over time".
- **Arc × age × work:**
  - a hidden arc seeded from the id (riser, steady, plateau, late bloomer, fading; age-weighted)
  - a peak window per rating (recruit young, game mid-career, scout late)
  - the season's work as league z-scores: group level-ups for TEACH, wins over the pregame odds for SCOUT, portal signings less misses for RECRUIT, emphasis games for GAME (the user's staff only)
- **Comfort and mentors:** growth halves after 5 seasons in a chair (seeded starting tenure). A move restarts it with a bump. Coordinators speed or slow their position coaches. `CoachProgress.under` starts each coach's tree.
- **Work counters** (`TeamState.lug`, `eg`, `xw`) are filled in the week loop and dropped at the new season. With growth off, the season report is identical to step 1.
- **Pure:** it returns the next season's changes and leaves the old state alone.
- **Checks:**
  - `npm run typecheck`.
  - `npm test`: 224 pass, 2 new (arcs order as intended over 8 offseasons, ratings whole and in range, lineage; a move restarts tenure), plus checks that work counters add up and `nextSeason` applies growth. One full run failed once and passed on 3 reruns; it was probably a timeout under load, and the failing test wasn't captured.
  - `npm run balance` is byte-identical.
  - `npm run season`: a new STAFF section. League drift is under 0.5 a year, and the T1–T5 staff gap moves +0.9. Only the PORTAL section moves (RECRUIT changes who signs where), within its noise. The user's promise count changed from 5 to 0 because Georgia's roster diverged.
- **Tuning caveat:** nobody retires yet, so the league ages. Recheck drift when step 3 adds retirements (done in step 3: ages now fall slightly).

## Done: head coaches and turnover, step 3 of the carousel (2026-10-30)
As built: [COACHES.md](COACHES.md), "Coaches over time".
- **Head coaches** for every program (`buildHeadCoach`, `headCoachFor`; the user is his own). Each rating does something now:
  - DEVELOP: a program XP multiplier, ±6% per SD
  - RECRUIT: his portal calls and visits, ±15% per SD
  - EVAL: how he hires

  The first two are measured against his tier, so the tiers' calibration holds. Head coaches grow each offseason like assistants.
- **Turnover** when the offseason opens, before the portal (`turnover`):
  - CPU head coaches' security, firings off the hot seat, and retirements by age (with "going out on top")
  - a new head coach's housecleaning
  - every opening filled from 4 outside candidates (`<team>-<role>.<year>.<n>`), picked on worth vs. reputation by the hirer's EVAL
  - news (`carousel`) for every head coach change and the user's staff
- **Not in this step:** reputation and motives for FBS coaches move to step 4, where the market reads them. New DCs keep the program's style, so `defIdentity` is unchanged.
- **Checks:**
  - `npm run typecheck`.
  - `npm test`: 227 pass, 3 new (head coach and outside-hire ids; hiring by EVAL and retirement odds; zero-mean program XP; a full offseason keeping every staff full, nobody on two, the user in his job, run once).
  - The full-season test in `season.test.ts` now has the 20 s timeout its neighbors use. It timed out at 5 s under the full suite, which was likely step 2's one-off failure too.
  - `npm run balance` is byte-identical.
  - `npm run season`:
    - 19.8 head coach changes a year
    - assistant turnover 8%
    - ages falling slightly
    - EVAL regret 2.07 → 0.66 from low to high eval
    - DEVELOP thirds 0.94 / 1.00 / 1.05
    - staff gap +1.2
    - the growth table, tier growth and flags as in step 2

## Done: the coaching carousel, step 4 (2026-10-30)
As built: [COACHES.md](COACHES.md), "Coaches over time".
- **A `carousel` offseason stage before the portal** (`season/carousel.ts`):
  - reputation that lags results, and hidden motives
  - CPU head coach firings and retirements, plus coordinator firings after a bad unit year
  - the head coach chain from FBS head coaches, coordinators, coaches out of a job and outside candidates
  - a new head coach's housecleaning, with his loyalists following him
  - 5 hiring rounds with claimed offers, then outside hires at the close
  - `turnover` from step 3 is folded in
- **Any coach in any chair:** seeded ratings for the chairs he wasn't generated for (`coachAs`).
- **The user's side:** a CAROUSEL screen (`render/carouselScreen.ts`; the hub's HIRING button) with three tabs:
  - HIRING: candidates with reputation and blurred ratings, 2 interviews per open chair (sharper ratings, then exact, plus the motive), one offer per chair a round
  - MY STAFF: fire an assistant
  - AROUND THE LEAGUE: the news

  F delegates (`delegate.carousel`). `startToPortal` runs it automated for tests and the report.
- **Checks:**
  - `npm run typecheck`.
  - `npm test`: 228 pass. New coverage: the user's hiring flow (fog, interviews, motive, an offer signing, a full staff at the close); market moves between programs; the chain news; reputations stored. The portal tests reach the portal through `startToPortal`, and the determinism test now saves mid-carousel too.
  - `npm run balance` is byte-identical.
  - `npm run season` STAFF section:
    - 20.4 head coach changes a year
    - assistant turnover 20.7% (real 30–40%; floor 20%)
    - 52% of openings from moves
    - talent flowing up a tier (286 up, 100 down)
    - league level +2.35 (flag 2.5), gap +1.0
    - EVAL regret 1.34 → 0.24
    - the rest of the report as in step 3
  - **The screen, driven in headless Chrome** against `npm run dev`: a simmed season into the carousel; HIRING, MY STAFF and AROUND THE LEAGUE screenshotted; Space through the real input path ended round 1 and the offered candidate signed; no console errors. Two fixes came from it:
    - a fired coach was listed for his old chair
    - the trainer's label overflowed its column
- **Known gaps:**
  - Assistant turnover sits at the bottom of the real range.
  - League staff level creeps up (+2.35 in 5 seasons) and needs watching over longer careers.
  - Money is prestige.
  - The user can't change jobs, so loyalists only follow CPU head coaches.

## Done: players react to coaches leaving, step 5 of the carousel (2026-10-30)
- **When the carousel closes** (`reactToDepartures`, `season/carousel.ts`), every player whose position coach, side's coordinator or head coach left loses morale: 0.3 / 0.12 / 0.2 × bond. Bond is seasons together over 3. `Progress.cl` records which chair, the bond, and where the coach went.
- **Portal:**
  - entry odds +0.9 × bond, with a new reason, HIS COACH LEFT
  - the coach's new school gets +0.15 × bond on its appeal, in his market and when he decides
  - the BOARD card names the coach who left and where he went
- **Checks:**
  - `npm test`: 229 pass. A new test fires the user's WR coach against an identical offseason without it: every WR gets `cl`, lower morale and higher entry odds, and the news reports it.
  - `npm run balance` is byte-identical.
  - `npm run season` PORTAL section:
    - entrants per team 12.8 (from 10.2; target 10–15)
    - 32% of players had a coach leave, and they're 43% of entrants
    - 13 a year follow their coach
    - the T5 drift against the control (already flagged, waits on graduation) moves from +6.5 to +7.0
    - the same 7 flags

## Done: TEACH in development, trees and GAs, steps 6 and 7 of the carousel (2026-10-30)
- **Step 6:** each position group's XP is ×(1 + 0.05·z), with z its position coach's TEACH against his group's peers in the tier (`groupXp`). It multiplies with the head coach's DEVELOP into `programXp`, which now takes a position. Groups with the weakest teachers level up at 0.93 of the usual rate, the strongest at 1.05. The growth table, mean starter gain and tier growth hold.
- **Step 7:**
  - **Graduate assistants:** 2 a program (`TeamState.ga`, generated at level −10 and age 23–28). They grow under their group's coach, can be promoted to any position chair at their program in the carousel, and move on after 3 seasons. About 12 are promoted a year.
  - **Trees:** `under` now records the head coach too. `treeOf` and `treeScore` (3 a head coach branch, 1 a coordinator) power the user's tree on MY STAFF, and news when someone from the user's tree lands a head coach or coordinator job.
  - Former players as GAs wait on graduation.
- **Checks:**
  - `npm run typecheck`.
  - `npm test`: 231 pass. New tests cover the TEACH multiplier (zero-mean per position; a better QB coach lifts only QBs), GAs (ids, growth lineage, promotion through the carousel, slots refilled), and a tree and its score.
  - `npm run balance` is byte-identical.
  - `npm run season`: the same 7 flags. TEACH and DEVELOP thirds, GA promotions and trees are reported in STAFF.
  - The MY STAFF tab was checked in headless Chrome.

## Done: departures, phase 1 of recruiting (2026-10-31)
Plan: [RECRUITING_PLAN.md](RECRUITING_PLAN.md). As built: [RECRUITING.md](RECRUITING.md).
- **Class years move** (`season/classes.ts`): from the generated class (or a walk-on's or freshman's join year) plus seasons since, less a redshirt year (`Progress.rs`). `baseSquad` lays it over every athlete, so morale, XP, the portal and careers read the real class.
- **A `departures` offseason stage** between the carousel and the portal (`season/departures.ts`):
  - redshirts: 4 or fewer games (`Progress.gp`) as a true freshman, or a medical redshirt
  - early declarations by projected pick and temperament; the user's DECLARE WATCH with 3 meetings; CPU staffs meet their 2 likeliest
  - graduation
  - a 257-pick NFL draft by city (`season/draft.ts`) in `SeasonSummary.draft`, with news and career story lines
- **Offseason growth** (`offseasonGrowth`, run as the next season opens): calibrated so the class ladder and the tiers hold.
- **Placeholder freshmen** (`makeFreshman`, at the team's generated-freshman level) replace walk-ons in the post-portal refill. Transfers get `departShare` (0.15) of graduates' spots.
- **Screen** `render/departuresScreen.ts` (the hub's DRAFT button): DECLARE WATCH, SENIORS and DRAFT tabs.
- **Checks:**
  - `npm run typecheck`
  - `npm test`: 245 pass, 10 new in `src/departures.test.ts`. Five existing tests changed for the new stage order:
    - seniors graduate before the portal
    - transfers grow in the offseason
    - offer caps count graduates
    - a promise test picks non-seniors
    - the carousel closes into departures
  - `npm run balance` is byte-identical.
  - `npm run season`: the new DEPARTURES section:
    - 103 early entrants a year, 64 underclassmen drafted, the SEC and Big Ten on top
    - the class ladder holds within about 2
    - starters since the start: T1–T3 within 0.7 after 5 seasons; T4 +2.0 and T5 +4.4 through the portal (before: T5 +7.1 and compounding)
    - the single-season sections are unchanged
  - Driven in headless Chrome against the dev build (hub → watch → meet → seniors → draft → portal). No console errors; the column overlaps it showed were fixed.
- **Flags:** in [RECRUITING.md](RECRUITING.md):
  - T4/T5 portal drift remains.
  - The Group of 5 is under-drafted (22 vs about 30).
  - Class-size waves in the first years.
  - Most true freshmen redshirt (no 4-game management or REDSHIRT toggle yet).
  - Careers grow to about 2.9 MB of JSON a season.
  - Assistant turnover is 19.9%, just under its 20% floor (noise).

## Done: HS recruiting, phases 2-5 (2026-10-31)
Plan: [RECRUITING_PLAN.md](RECRUITING_PLAN.md). As built: [RECRUITING.md](RECRUITING.md). Open-ended careers only.
- **The class** (`data/recruits.ts`): about 3,500 prospects a year, rolled at each program's generated-freshman level and rebuilt from their ids (`r{class}.{salt}.{n}`). The services show stars (32/398/1,800) and national and position ranks, with noise. Each prospect has a hidden makeup (timeline, firmness, spotlight, dream school) and wants (PT, WIN, DEV, HOME, NFL, COACH).
- **The cycle** (`season/recruiting.ts`):
  - an automated summer for every staff
  - a weekly `recruit` step: contacts by the position coaches, official visits at home games swung by the result, offers, commits, decommits and flips
  - the early signing period at week 15, then in-home visits
  - the carousel's departures shaking commits loose
  - a new `signing` offseason stage (national signing day) before the portal; signees join their rosters as freshmen
- **CPU staffs** recruit by need from their own reads. The user's side runs the same code when delegated (F).
- **Pipelines:** coaches' (seeded, grown by signings, moving with them; shown on the carousel's HIRING card) and programs' (from recent classes, carried across seasons).
- **Screen** `render/recruitScreen.ts` (the hub's RECRUIT button or R):
  - BOARD, with the position coach's evaluation in words only and actions to offer, host a visit, in-home, mark a top target, add or drop
  - SEARCH, with filters
  - CLASS, with needs, the national top 10 and pipelines
  - The prep page shows visitors.
- **Other changes:**
  - Portal: an over-cap roster sends its lowest players to the portal; signees can't enter before they enroll; recruits' portal motives are their recruiting wants; a full roster short at a position lets a player go so the refill can fix it.
  - Coach recruit growth counts HS signings.
  - The tier z-score cache now sees coaches' rating changes.
- **Checks:**
  - `npm run typecheck`
  - `npm test`: 256 pass, 11 new in `src/recruiting.test.ts`
  - `npm run balance` is byte-identical.
  - `npm run season`: single-season sections unchanged; the new RECRUITING section (table in RECRUITING.md):
    - tiers 1-4 sign within 1.3 of their generated-freshman level; T5 +3.4
    - 77% of the top 300 committed by early signing; 82% of commits sign early; 13.6% decommit
    - 0.31 s a sim week
  - Driven in headless Chrome against the dev build (hub → board → top target → visit → search → offer → class → signing day → portal). No console errors.
- **Flags** (in RECRUITING.md): T5 signs above its level and its starters still drift up about 4 over 5 seasons; the summer is slow at the top (22% of the top 300); a passive user signs only the summer's commits (placeholders fill); careers grow to about 3.2 MB a season.

## Done: the coach's office, batch 2: leveled items (2026-11-09)
24 more achievements, most of them leveled. See [OFFICE.md](OFFICE.md).
- **Leveling:** each find folds into one item (`OfficeItem.log`), and its art grows at the def's `levels`: more stuff in it, then a wood, silver and gold frame. Old saves' one-per-find front pages fold into one item.
- **Page:** cards show `LV n/N`, what the next level needs and the latest log lines; LIST shows level pips. A "LEVEL UP IN YOUR OFFICE" toast fires on each new level. Showroom: L steps the level.
- **Classics:** the national title and the Heisman.
- **Leveled:** Giant Killer, the Comeback, Ice Water, Air Show, Ground and Pound, Marathon, the ball rack, bowls, the bracket, Perfect Season, Homegrown (the state poster with pins), Prove 'Em Wrong, Turnaround, the doormat, the Long Haul portrait, the awards wall, the coaching tree bonsai, To the League, Draft Night, From Nowhere and the hat rack.
- **Bad moments:** Hate Mail and For Sale.
- **Hooks and rooms:** new `carousel` and `signing` hooks. More slots in the bigger rooms, so a full showroom fits the suite except jerseys past its wall.
- **Season report:** an OFFICE rarity section (every team's office as if it were the user's). The rest of the report is unchanged.
- **Checks:**
  - Typecheck passes. 366 tests pass; `src/office.test.ts` has 16, covering folding, old saves, the game and season detectors, and every drawer at every level staying inside its slot.
  - Headless Chrome screenshots of the showroom at the top, mixed and low levels, the corner and head coach's offices, LIST and a leveled card.
- **Not done:** rivalry trophies held, Fire Extinguisher, and playing it by hand. From Nowhere's new rule hasn't been through the report yet.

## Done: the coach's office, batch 1 (2026-11-08)
Achievements as a room that fills up. See [OFFICE.md](OFFICE.md).
- **Framework:**
  - `SeasonState.office`: items with saved data, unlock order and fresh flags
  - detectors per hook: the week's new `office` step and the draft
  - a computed room tier
  - deterministic placement into slot anchors, with fallbacks and storage boxes
- **Rooms:** five, from the broom closet to the suite over the stadium, drawn in code. The window views are a parking lot, the practice fields, the stadium, and the stadium at night.
- **Items:** the game ball, conference trophies, STOP THE PRESSES and the RING OF HONOR. A 3x5 micro font writes their scores, names and headlines.
- **Page:** OFFICE (C) on the hub: hover cards, click-through to this season's games, and a LIST tab with hints for unfound items and the next room. A gold sidebar dot and "NEW IN YOUR OFFICE" toasts announce unlocks. The dev showroom is Y on the page, or `game.devOffice(tier)`.
- **Checks:**
  - `npm run typecheck` passes.
  - Tests: 358 pass, 8 new in `src/office.test.ts`.
  - `npm run season` (2 seasons) is identical to main apart from its timing lines.
  - In headless Chrome on the dev build: screenshots of every room in the showroom, a hover card and LIST; a real dynasty simmed to the first win showed the toast and dot, and leaving the office cleared them.
- **Not done yet:** the rest of the catalog (OFFICE.md), an OFFICE rarity section in the season report, and playing it by hand.

## In progress
- **Coaching carousel:** all 7 steps are built (CAROUSEL_PLAN.md). Left for later: former players as GAs (waits on graduation), retention tools, specializations, chemistry, bowl-week interims, DCs bringing their own style (`defIdentity`), the user changing jobs. The CAROUSEL screen was checked in headless Chrome against the dev build, not by hand with keyboard and mouse; the portal card's coach-left line hasn't been seen on screen. Not checked by hand yet: playing a full game with the new rosters, or a whole season through the hub with real keyboard play (the hub was driven by scripted key presses in headless Chrome).

## Known bugs and rough edges
- **Multi-season tier drift:** with departures and recruiting, T1–T3 hold, but T4 starters rise about 1.8 and T5 about 4.2 over 5 offseasons: tier 5 signs about 3 above its generated freshmen, and drop-down transfers add to it (PORTAL.md, RECRUITING.md). About 40% of entrants go home (placeholder).
- **Desktop app:** no app icon (Electron's default), no code signing (SmartScreen warns on first launch), and no auto-update. A failed write leaves a stray `.tmp` beside the save; it's overwritten on the next save.
- **Talent gaps are far too steep in the live sim** (see the ratings and rosters flags): a 32-point overall gap turns nearly every run into a TD. Needs compressing before seasons.
- **The run game swings about 1 YPC on a few points of the back's elusiveness and strength.**
- **Injuries are rolled after games only.** The user's live games have no mid-game injuries; that waits for mid-game roster changes. Knocks have no body-part label. Real players listed as injured in the research (for example Sayin) start the season healthy. The QB missing 3+ games rate (5.7%) is a bit under the ~8% aim, on purpose.
- **Confidence only moves between games.** Live games have no in-game swings (a pick shaking the QB for a few drives) and no mid-game substitutions, so next man up works week to week. The user's live-game starters spark like everyone else, but a sim-game backup's breakout is luck around the expectation, by design.
- **Breakouts are common nationally** (about 57 a season, about 0.4 per team-season). The news shows the user's and two elsewhere a week. If they feel too frequent, `BREAKOUT.z` is the lever.
- **Progression:** in season only players who play grow; everyone grows in the offseason (RECRUITING.md). A full season is about 2.6 MB of JSON, plus about 2.9 MB of careers a season with departures (CAREERS.md); gzipped saves are about a seventh of that, and the desktop app has no practical size limit. Details in [PROGRESSION.md](PROGRESSION.md).
- **Season placeholders** (details in [SEASON.md](SEASON.md)): too few games decided by 3 or fewer (11% vs 17%), yards per game high (about 430 vs 390), stat leaders inflated (only starters get credit), divisions and real bowl selection orders aren't modeled.
- **Research class years and redshirts are partly guessed,** and several QB situations were in flux on Oct 24 (ROSTERS.md).
- **The pass harness is "most open at a fixed hold".** It over-throws flats and checkdowns, and it throws quick game and screens too late (see the flags above). Per-route targeting is needed before using the NFL completion targets.
- **Flagged plays need mechanic work:** Power Read, Draw, QB Power, Pin-Pull Sweep and Counter GT (see the flags above). Each has a diagnosis.
- **The run game's 4+ rate is low** (about 30% for the core runs, against FBS about 45%). Too many runs end at 1–3 yards. Second-level fits still beat climbing linemen too often.
- **Routes still outside the NFL middle 50%:**
  - `deepOut` breaks flat (-88° vs NFL -61°). It was kept as it was.
  - The seam runs straight; NFL seams drift outside by about 13°.
  - The flat starts 2 yd upfield (NFL 0.8).
  - Wheel and bubble are thin samples.
- **Kickoff returns are short:** about 13-16 yards per return, versus an NCAA average of about 21. So a deep kick that's returned is slightly better for the kicking team than a touchback. The returner also runs out everything he catches in the field of play and never takes a knee.
- **Line-drive punts give up about 2.5% return TDs.** They're meant to be the risky option, but it's worth watching.
- **Kickoff camera:** while aiming, the camera follows the predicted landing spot, so the kicker and the coverage are off screen.
- **Main-view goal posts are drawn skewed,** because the projection would otherwise stack both uprights on one line. A ball that clips an upright can look slightly off. Trust the goal cam.
- **CPU kicks to the user are still simulated:** the drive starts at the 25 or a computed punt spot. There are no playable returns.
- **The free kick after a safety is still simulated:** CPU ball at its 40.
- **Separation at the catch is tiny** (0.0–0.9 yd in the `ROUTE` rows, against NFL medians of 1.5–3.7). Man defenders run to the ball's landing spot as soon as they react to the throw.
- **The deep out lost about 8 points against 2 Man** with the plant (see the route-running flags).
- **High YAC on quick throws:** about 13–20 yards when throwing to a wide-open receiver at 1.2s. The route burst trimmed this (a slant thrown out of its break now gives 5.4 per target). Defenders trailing in man can't close on a straight-line runner. Realism is unclear; revisit tackling and pursuit tuning.
- **Sack rate when holding long:** about 35% of plays at 3.2s against a 4-man rush, which may be harsh.
- **Play diagrams are small:** cards are now 62 px tall to fit 9 per page. Each card zooms to its own play, but drags and crossers on wide pass plays still look short.
- **No timeouts, spike or kneel yet.**
- **Light boxes are very good to run against:** Outside Zone against 2 Man gives about 10 YPC, and RPO give rows against 2 Man give 6–8. The run fronts (Bear, Cover 3 Sky, Goal Line) and the learning DC's box dial now answer a run-heavy offense (DEFENSE.md), but 2 Man itself is unchanged.
- **WR stalk blocks lose the matchup quickly:** in `runEngagement` the defender's side is `str*0.7 + spd*0.3`, and the WR adds only his `blk` (about 45). A fast corner wins by about 30 points and sheds at about 2.3/s. On stretch plays the WR also takes the lineman's `REACH_PENALTY`. Perimeter blocks now form and last longer than before, but they still don't hold long. Not tuned: consider a stalk-block rule (the WR only has to stay between, not drive) or no reach penalty for non-linemen.
- **CPU drives don't take timeouts,** and the user has no two-minute tools.
- **Live games have fewer possessions than CPU-vs-CPU season games:** about 7 a team at the default LONG 8:00 (5 at STANDARD) vs about 12 in `simGame`. Played by hand, 8:00 gives realistic scores, since the user scores more per drive. That lowers the user's points for and against and the margin terms in the polls (`AP_WEIGHTS`, `CFP_WEIGHTS`). Not compensated yet.
- **Check the user's points per drive by playing.** If the live offense scores on more than 60% of drives, that's a gameplay balance issue, separate from pacing.
- **RPOs are still a run plus a tagged route.** There's no read on a defender yet, and the harness measures only the give.
- **Zone-read keeps are weak for the auto-runner** (about 0 YPC even on a correct read). Blocks on the backside don't hold up once the QB pulls it: the X never reaches a corner who's fitting downhill, and blocks more than 8 yd from a deep QB on his backside shed at once. Keeps were unchanged by the perimeter-block fix. A human steering the QB should do better; check by playing before tuning.
- **The read key's crash is a coin flip.** It doesn't depend on the call, the down, or the key's awareness yet.
- **A user can hand off on any pass play** (the old "call a draw" behavior). `read` could gate this later.

- **Key plays:** kicks never get replays (cards only). A drive continued at a quarter break starts a new set of downs. Replays between very uneven teams match less often (more cards). There's no mid-game "sim the rest" yet.

## Next up (rough priority)
1. **The coach's office** ([OFFICE.md](OFFICE.md)): play a dynasty by hand and watch items level. Still to build: rivalry trophies held (dropped when lost) and Fire Extinguisher (needs the season's lowest job security kept). Rerun the OFFICE section for From Nowhere.
1. **UI, pass 2:** give the sub-pages (team, playbook, prep, recruiting, stats, portal, carousel, departures) the hub's look: a shared header with a clickable BACK, and the same sidebar-and-panel style where it fits. A settings page in the hub for the dynasty's options (game length, injuries) and the delegation toggles. More new-dynasty options (coach career, staff delegation). Rename a slot; export and import a save.
1. **Careers, round 2** ([CAREERS.md](CAREERS.md)): program records and career leaders, opening a career from the news, leaders and portal screens, and a story line for losing the job. Graduation will make class years move in the rows.
1. **Recruiting, round 2** ([RECRUITING.md](RECRUITING.md) flags): bring tier 5's classes and starters back to level; a faster summer at the top; the REDSHIRT toggle and 4-game depth management; former players as GAs; play a full cycle by hand.
1. **Compress talent gaps in the live sim** so a 90 vs 60 game is lopsided but playable (speed, tackling and block-power curves), then check every tier pairing with the real rosters.
1. **Fill in the season framework** ([SEASON.md](SEASON.md)): spread box-score credit to backups; non-conference scheduling that pairs strong programs with weak ones, as real schedules do; mid-game injuries and substitutions in live games, and seeding the researched real-world injuries at season start; morale's next hooks (talking to players and promises, captains, position-change offers; then the transfer portal and recruiting read it: see MORALE.md's "not built yet"); more on the team page (season stats on the card); a game plan screen (the `delegate.gamePlan` flag is ready); coaches, round 2 (COACHES.md's "Later"): opponent-aware offensive emphases (the opponent's `defIdentity` in the drive mods), CPU `autoEmphasis`, specializations (recruiter, motivator, developer), OC scheme identities; the offseason's systems (carousel, departures, recruiting, portal) are built.
1. **Fix the flagged plays:** pullers and lead backs are done (2026-11-08). Left: Power O against Cover 1 (too big), Counter GT and QB Power (still low), Draw against pressure, and the harness's power-read read. Then review Go Post and PA Boot Flood against single-high.
1. **Run game, round 2:** raise the 4+ rate toward about 45%. Look at second-level fits against climbers, and at yards after contact. Play IZ, Power and Counter by hand before tuning.
1. **Harness:** target by route or read instead of "most open". Then use the NFL per-route completion table as balance targets, together with the defense work.
1. **An RPO read on a defender,** and give the harness a pull decision.
2. Clock tools: timeouts (3 per half), spike, kneel.
3. Defense, round 2 ([DEFENSE.md](DEFENSE.md)):
   - play it by hand and check the gold lines and the halftime card on screen
   - film study (the DC's pregame prior from your past live games)
   - tune zones at a 2.2 s hold toward man (and man's separation up), and screens against Fire Zone
   - a counter to quick-game-only offenses
   - a pass-rush package for the `wide` front
4. Playbook UI, part 2: filter by situation (short yardage, red zone, 2-minute).
5. Special teams, part 2: playable kick and punt returns, onside kicks, fakes, a real free kick after a safety, and CPU 4th-down decisions shown as actual kicks.
6. Pre-snap, round 2: play-authored motion, hot routes and protection slides; maybe bring back Cover 0's disguise with a late creep.
7. Sound, and packaging as an .exe with Electron or Tauri.
