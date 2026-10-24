# Saturday Gridiron

A Retro Bowl–inspired college football game with deeper, more realistic gameplay. This build is the gameplay MVP: a full timed game where you play offense; the opponent's drives are simulated.

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
| Quarter length | Q/E on the title screen (3, 5, 8 or 15 minutes) |
| Playbook tab (Pass / Run / Play Action) | Click a tab, or Q/E or Tab |
| Call a play | Click a card or press 1–6. Watch the play clock: if it runs out, it's delay of game |
| Audible (pre-snap) | Esc |
| Snap | Space or click |
| Pass | Press anywhere, drag back, and release. The target is projected the opposite way from the QB, and the game goes into slight slow motion while you aim |
| Hand off / pitch to the RB | Right-click (or F) while he's in the backfield and not blocking. Works on any play, so you can call a draw |
| Move QB / steer runner | WASD or arrow keys. After a catch the runner keeps going downfield automatically |
| Sprint | Shift (drains stamina) |
| Juke | Space while running |
| Debug overlay | F1 (coverage assignments, blocks, catch radius, defensive call) |

## Layout

- `src/engine/`: fixed-timestep loop helpers, camera projection (yards to pixels), input
- `src/data/`: teams and roster generation, playbook (formations and route trees), defensive calls
- `src/sim/`: player physics, ball flight, AI (routes, man and zone coverage, blocking, pursuit), catch and tackle resolution
- `src/game/`: play state machine (`playState.ts`), down/distance rules and CPU drive sim (`rules.ts`), game and play clocks (`clock.ts`), screens (`game.ts`)
- `src/render/`: procedural pixel-art sprites with team-color swaps, field, HUD

Tuning constants live next to the logic they affect: `throwErrorSd` in `sim/passing.ts`, `catchOdds` in `sim/catching.ts`, `tackleChance` in `sim/tackling.ts`, shed and push rates in `Play.updateEngagements`, `RUN_BLOCK_EDGE` and `ARM_TACKLE` in `game/playState.ts`, `pitchOdds` in `sim/catching.ts`, and `AIM_TIME_SCALE` in `game/game.ts`.
