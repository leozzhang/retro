# Progress

_Last updated: 2026-10-23_

## Done: gameplay MVP
- **Project setup:** Vite and TypeScript scaffold, fixed-timestep loop, 640×360 internal canvas scaled up with pixelated rendering.
- **Field:** grass stripes, yard lines, college hash marks, numbers, end zones in team colors, midfield logo, crowd. The camera scrolls horizontally in Retro Bowl style.
- **Sprites:** procedural pixel-art players with team uniforms (home and away). Poses: stand, three-point stance, 4-frame run, throw, catch, down.
- **Teams:** 8 FBS teams (UGA, BAMA, OSU, TEX, ORE, MICH, ND, CLEM) with real colors and conferences. Off/def ratings are rough estimates. Rosters are generated and seeded per team, scaled by team strength.
- **Playbook:** 6 plays from 2 shotgun formations (Four Verts, Slant Flat, Smash, Mesh, Dagger, Curl Flat). The play-call screen shows a route diagram for each.
- **Defensive calls:** 2 Man Under, Cover 1 Robber and Cover 0 Blitz, each with a distinct pre-snap look. Corners press at random. There's a pre-snap coverage read hint, and Esc lets you audible.
- **Passing:** slingshot drag-and-release with an arc preview and slow motion while aiming. Throw error depends on distance, the QB's accuracy, pressure and movement.
- **AI:**
  - receivers run routes
  - man coverage uses a reaction lag based on awareness, with off-coverage backpedal and press jams
  - deep halves, deep middle and robber zones
  - O-line versus D-line engagements, with shed chances that ramp up over time
  - backs pick up blitzers
  - pursuit uses intercept angles
  - teammates block downfield after the catch
- **Catch resolution:** catch, drop, pass breakup or interception. Receivers and defenders time their run to arrive with the ball.
- **Running:** user-controlled carrier, sprint with stamina, juke, broken tackles, sacks, scrambles, out of bounds, interception returns and pick sixes.
- **Rules:** down and distance, first downs, touchdown (+7), safety, turnover on downs. The CPU's possessions are simulated by `simulateDrive`.
- **Tooling:** 28 unit tests, a balance harness (`npm run balance`), an F1 debug overlay, and a `window.game` dev hook.

## Done: clock, game end, run game (2026-10-23)
- **Game clock and play clock** (`game/clock.ts`). Clocks show real football time (15:00 quarters, 40/25 s play clock).
  - Quarter length is selectable on the title screen (3/5/8/15 min, Q/E). Shorter settings speed up only the between-play time; live plays always run 1:1.
  - NCAA stoppage rules: an incompletion stops the clock until the snap. Out of bounds and first downs stop it only inside 2:00 of a half; otherwise out of bounds restarts on the ready-for-play and first downs don't stop it.
  - The play clock runs on the call screen and pre-snap, so audibles cost time. If it expires, it's **delay of game**: 5 yards (half the distance inside the 10), replay the down.
- **Quarters, halftime, final.** At halftime the CPU gets the second-half kickoff. The final screen allows ties (no OT yet).
  - CPU drives burn game clock: about 32 s per play, about 7 s on clock-stopping plays, faster when trailing late and slower when milking a Q4 lead. A drive ends at the half.
  - Notices queue up with a scorebug snapshot.
- **Run game.**
  - **Right-click (or F)** hands off to the RB whenever he's behind the line and not blocking, on any play. Within 1.8 yd it's a handoff (99% clean); up to 8 yd it's a pitch or shovel (`pitchOdds`). Misses are a `fumble` outcome, recovered by the offense.
  - Run plays use run blocking: DL go to the nearest OL, uncovered OL climb to LBs, TE and WRs stalk DBs. `RUN_BLOCK_EDGE`.
  - The second level reads run blocking and fits its gap (`runFit`). Defenders near the ball shed blocks and make arm tackles (`ARM_TACKLE`).
- **Play action.** The RB's fake path meets the QB's drop point. LBs and safeties bite for a beat (`sellFake`), then the RB stays in to block his own man, whose defender then sits underneath instead of hug-rushing (`lateBlock`).
- **Playbook tabs:** PASS / RUN / PLAY ACTION, 6 plays each. New Pistol and Singleback formations.
  - RUN: Inside Zone, Outside Zone, Power, Toss, Zone Read, QB Sneak.
  - PLAY ACTION: PA Post, PA Boot Flood, PA Crossers, PA Seams, RPO Slant, RPO Bubble.
- **Protection fix:** blockers with an assignment no longer grab whoever they bump into on the way.
- **Sack fix:** a QB tackled past the LOS on a scramble, or on a designed run, is no longer scored as a sack.

## Balance baseline
From `npm run balance` (Georgia offense vs Alabama defense).
- **Pass and PA rows:** an auto-QB throws to the most open receiver after a fixed hold time.
- **Run rows:** an auto-QB hands off as soon as it can, and `autoRun` carries the ball (no jukes, so expect real players to do better).

| Pass plays, defense | Hold | Comp | INT | Sacks | YAC |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | 2.2s | 75% | 0.0% | 10/120 | 5.9 |
| Cover 1 Robber | 2.2s | 70% | 0.9% | 9/120 | 10.2 |
| Cover 0 Blitz | 1.2s | 77% | 0.0% | 0/120 | 19.7 |
| Cover 0 Blitz | 2.2s | n/a | n/a | 100/120 | n/a |

| PA plays, defense | Hold | Comp | INT | Sacks | YPP |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | 2.2s | 78% | 2.8% | 14/120 | 7.1 |
| Cover 1 Robber | 2.2s | 79% | 2.7% | 8/120 | 13.9 (vs 4.2 for straight dropbacks) |

Runs, all plays and defenses: **5.5 YPC, median 2.5**, 31% for 0 or fewer yards, 16% gain 10 or more. By defense:
- Against 2 Man and Cover 1: 6–9 YPC.
- Against Cover 0: 1–4.5 YPC with 65–90% stuffs, except Outside Zone (4.5 YPC).
- Toss: only works against 2 Man.

Reading the defense matters: don't run inside, or pitch, into the zero blitz. Holding the ball against Cover 0 still gets the QB sacked almost every time.

## In progress
- Nothing right now.

## Known bugs and rough edges
- **High YAC on quick throws:** about 13–20 yards when throwing to a wide-open receiver at 1.2s. Defenders trailing in man can't close on a straight-line runner. Realism is unclear; revisit tackling and pursuit tuning.
- **Sack rate when holding long:** about 35% of plays at 3.2s against a 4-man rush, which may be harsh.
- **Squashed play diagrams:** the play-card diagrams are compressed vertically, so drags and crossers look short.
- **No 4th-down options:** there's no kicking game, so the user must go for it on 4th down.
- **No timeouts, spike, kneel or overtime yet.** Ties stand.
- **Run results are lumpy:** the harness shows clusters (for example, many 9–10 yard runs), because the sim is fairly deterministic once blocks set. Small randomness in blocker paths or fits would help.
- **Cover 0 vs runs is harsh** (about 70% stuffs for the auto-runner). It's intended as a read, but it may need softening once players try it.
- **Toss pitch timing:** if you pitch the instant the ball is snapped, the RB catches it nearly standing still.
- **CPU drives don't take timeouts,** and the user has no two-minute tools.
- **No zone underneath coverage:** defenses are man or deep zones only.
- **No git repo yet.**

## Next up (rough priority)
1. Full FBS database: all conferences and teams, realistic strength tiers, then real rosters.
2. Clock tools: timeouts (3 per half), spike, kneel, college overtime.
3. Run-defense calls (8-man box, run blitzes) and zone coverages (Cover 2, 3, 4, and underneath zones) and smarter defensive play-calling by down and distance.
4. A bigger playbook UI: formation sets, filtering by situation.
5. Kicking game (FG, punt, kickoff), so 4th down has options.
6. Pre-snap reads and audibles beyond Esc (hot routes, protection slides).
7. Sound, and packaging as an .exe with Electron or Tauri.
