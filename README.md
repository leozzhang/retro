# Saturday Gridiron

A Retro Bowl–inspired college football game with deeper, more realistic gameplay. This build is the gameplay MVP: a full timed game where you play offense; the opponent's drives are simulated.

## Run

```
npm install
npm run dev        # open http://localhost:5173
npm test           # unit tests for rules, ball flight, catching, tackling, camera
npm run balance    # AI balance report -> balance.txt
npm run season     # headless full seasons -> season.txt
```

## Controls

| Action | Input |
| --- | --- |
| Pick your team | A/D team, W/S conference (or click the arrows) |
| Pick the opponent | Left/Right team, Up/Down conference |
| View a roster | R (yours) or T (opponent's); A/D pages, Esc back |
| Start the game | Enter |
| Season | N on the title screen starts a season with your team; C continues the saved one. In the hub: A/D tabs, W/S pages within a tab, Space plays this week's game, X simulates it, Esc goes back to the title. See [docs/SEASON.md](docs/SEASON.md) |
| Team page | T (or the TEAM button) in the season hub. A/D or click a tab to pick a position, click a player for his card, drag a player up or down the depth chart to reorder it. G hands the depth chart to your staff or takes it back. Esc returns to the hub |
| Quarter length | Q/E on the title screen (3, 5, 8 or 15 minutes) |
| Playbook tab (Pass / Run / Play Action / Special) | Click a tab, or Q/E or Tab |
| Formation filter | A/D or the mouse wheel (or click a chip) picks a formation under the tab; W/S pages when there are more than 9 plays |
| Call a play | Click a card or press 1–9. Watch the play clock: if it runs out, it's delay of game |
| Speed option | Right-click to pitch while you attack the end; run past the line to keep it |
| Flip the play | F on the play-call screen mirrors the next play (the cards redraw mirrored) |
| Audible (pre-snap) | Esc |
| Snap | Space or click |
| Pass | Press anywhere, drag back, and release. The target is projected the opposite way from the QB, and the game goes into slight slow motion while you aim. Space cancels the aim without throwing |
| Hand off / pitch to the RB | Right-click (or F) while he's in the backfield and not blocking. Works on any play, so you can call a draw |
| Move QB / steer runner | WASD or arrow keys. After a catch the runner keeps going downfield automatically |
| Sprint | Shift (drains stamina). How long it lasts depends on the player's speed and acceleration, so a pocket QB's bar is shorter than a receiver's |
| Kick (FG, PAT, kickoff) | Drag back from anywhere and release. Drag length sets power and drag angle sets direction. W/S or the mouse wheel raises or lowers the loft. The preview ignores wind. Then press Space as the needle crosses the green: early hooks the kick left, late pushes it right |
| Punt | Space or click to snap, then drag and release before the rush gets home, then Space on the green |
| After a touchdown | Pick EXTRA POINT, or 2-PT TRY to run any play from the 3 (Esc goes back) |
| Debug overlay | F1 (coverage assignments, blocks, catch radius, defensive call) |

## Layout

- `src/engine/`: fixed-timestep loop helpers, camera projection (yards to pixels), input
- `src/data/`: ratings and positions, the 138 FBS team profiles, roster generation and depth charts, playbook (formations and route trees), defensive calls. See [docs/RATINGS.md](docs/RATINGS.md) and [docs/ROSTERS.md](docs/ROSTERS.md)
- `src/sim/`: player physics, ball flight, AI (routes, man and zone coverage, blocking, pursuit), catch and tackle resolution
- `src/game/`: play state machine (`playState.ts`), down/distance rules and CPU drive sim (`rules.ts`), game and play clocks (`clock.ts`), screens (`game.ts`)
- `src/render/`: procedural pixel-art sprites with team-color swaps, field, HUD

Tuning constants live next to the logic they affect: kick physics and accuracy (`LEG_SPEED`, `AIR_DRAG`, `WIND_SCALE`, `kickErrorSd`) in `sim/kicking.ts`, special-teams odds (`MUFF`, `FG_BLOCK_BASE`, `RETURN_BLOCK_EDGE`, `DIVE_RANGE`) in `game/kickPlay.ts`, `throwErrorSd` in `sim/passing.ts`, `catchOdds` in `sim/catching.ts`, `tackleChance` in `sim/tackling.ts`, shed and push rates in `Play.updateEngagements`, `RUN_BLOCK_EDGE` and `ARM_TACKLE` in `game/playState.ts`, `pitchOdds` in `sim/catching.ts`, and `AIM_TIME_SCALE` in `game/game.ts`.
