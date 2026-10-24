# Saturday Gridiron

A Retro Bowl–inspired college football game with deeper, more realistic gameplay. This build is the gameplay MVP: one offensive drive loop against a simulated opponent.

## Run

```
npm install
npm run dev        # open http://localhost:5173
npm test           # unit tests for rules, ball flight, catching, tackling, camera
npm run balance    # AI balance report -> balance.txt
```

## Controls

| Action | Input |
| --- | --- |
| Pick team / opponent | A/D, W/S (or click the arrows), Enter to start |
| Call a play | Click a card or press 1–6 |
| Audible (pre-snap) | Esc |
| Snap | Space or click |
| Pass | Press anywhere, drag back, and release. The target is projected the opposite way from the QB, and the game goes into slight slow motion while you aim |
| Move QB / steer runner | WASD or arrow keys. After a catch the runner keeps going downfield automatically |
| Sprint | Shift (drains stamina) |
| Juke | Space while running |
| Debug overlay | F1 (coverage assignments, blocks, catch radius, defensive call) |

## Layout

- `src/engine/`: fixed-timestep loop helpers, camera projection (yards to pixels), input
- `src/data/`: teams and roster generation, playbook (formations and route trees), defensive calls
- `src/sim/`: player physics, ball flight, AI (routes, man and zone coverage, blocking, pursuit), catch and tackle resolution
- `src/game/`: play state machine (`playState.ts`), down/distance rules and CPU drive sim (`rules.ts`), screens (`game.ts`)
- `src/render/`: procedural pixel-art sprites with team-color swaps, field, HUD

Tuning constants live next to the logic they affect: `throwErrorSd` in `sim/passing.ts`, `catchOdds` in `sim/catching.ts`, `tackleChance` in `sim/tackling.ts`, shed and push rates in `Play.updateEngagements`, and `AIM_TIME_SCALE` in `game/game.ts`.
