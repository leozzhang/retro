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
- **Tooling:** 17 unit tests, a balance harness (`npm run balance`), an F1 debug overlay, and a `window.game` dev hook.

## Balance baseline
From `npm run balance`: an auto-QB throws to the most open receiver against Georgia vs Alabama ratings.

| Defense | Hold time | Completion | INT | Sacks | YAC |
| --- | --- | --- | --- | --- | --- |
| 2 Man Under | 2.2s | 77% | 0.9% | 8/120 | 5.0 |
| Cover 1 Robber | 2.2s | 69% | 3.6% | 8/120 | 5.6 |
| Cover 0 Blitz | 1.2s | 78% | 0.8% | 0/120 | 20.9 |
| Cover 0 Blitz | 2.2s | n/a | n/a | 99/120 | n/a |

Holding the ball against Cover 0 gets the QB sacked almost every time. That's intended: it rewards reading the blitz.

## In progress
- Nothing right now.

## Known bugs and rough edges
- **High YAC on quick throws:** about 13–20 yards when throwing to a wide-open receiver at 1.2s. Defenders trailing in man can't close on a straight-line runner. Realism is unclear; revisit tackling and pursuit tuning.
- **Sack rate when holding long:** about 35% of plays at 3.2s against a 4-man rush, which may be harsh.
- **Squashed play diagrams:** the play-card diagrams are compressed vertically, so drags and crossers look short.
- **No 4th-down options:** there's no kicking game, so the user must go for it on 4th down.
- **No game clock:** no quarters, so a game never ends.
- **No zone underneath coverage:** defenses are man or deep zones only.
- **No git repo yet.**

## Next up (rough priority)
1. Full FBS database: all conferences and teams, realistic strength tiers, then real rosters.
2. Run game: handoffs, QB sneak, play action, fakes, RPOs.
3. Zone coverages (Cover 2, 3, 4, and underneath zones) and smarter defensive play-calling by down and distance.
4. A bigger playbook UI: formation sets, filtering by situation.
5. Game clock and quarters, kicking game (FG, punt, kickoff), end of game.
6. Pre-snap reads and audibles beyond Esc (hot routes, protection slides).
7. Sound, and packaging as an .exe with Electron or Tauri.
