# Saturday Gridiron

A Retro Bowl–inspired college football game with deeper, more realistic gameplay. This build is the gameplay MVP: a full timed game where you play offense; the opponent's drives are simulated.

## Run

```
npm install
npm run dev        # open http://localhost:5173
npm test           # unit tests for rules, ball flight, catching, tackling, camera
npm run balance    # AI balance report -> balance.txt
npm run season     # headless full seasons -> season.txt
npm run app        # the desktop app (Electron), hot-reloading like the browser
npm run app:build  # build the Windows app into release/
```

## Desktop app

`npm run app` opens the game in its own window on the same dev server as `npm run dev`, so edits reload live. F11 toggles fullscreen.

`npm run app:build` makes three things in `release/`:
- `Saturday Gridiron-<version>-portable.exe`: one file that runs from anywhere
- `Saturday Gridiron-<version>-setup.exe`: an installer with a Start menu shortcut and an uninstaller
- `win-unpacked/`: the app as a plain folder

The .exe isn't code-signed, so Windows SmartScreen warns on first launch: click **More info**, then **Run anyway**.

**Saves.** In the app, saves are gzipped files in `%APPDATA%\Saturday Gridiron\saves`. The previous save is kept as `.bak`, and writes are atomic. In a browser they go to IndexedDB, and a season saved by an older build (in `localStorage`) moves over on first load. If a save fails, the game says so (SAVE FAILED) instead of losing it quietly.

**Steam later.** Nothing in the current setup blocks it:
- A Steam depot takes the `win-unpacked/` folder.
- Steam Auto-Cloud can sync the saves folder.
- `steamworks.js` adds achievements and cloud when needed.
- The Steam overlay is known to be finicky with Electron.
- A commercial release with real schools and players would need licensing (the schools' trademarks and the players' NIL rights). The likely route is fictional default data, with real data loadable from editable files.

## Controls

| Action | Input |
| --- | --- |
| Pick your team | A/D team, W/S conference (or click the arrows) |
| Pick the opponent | Left/Right team, Up/Down conference |
| View a roster | R (yours) or T (opponent's); A/D pages, Esc back |
| Start the game | Enter |
| Season | N on the title screen starts a season with your team; C continues the saved one. In the hub: A/D tabs, W/S pages within a tab (the week on SCORES and NEWS, or click the arrows; the mouse wheel or Q/E scrolls a long week of news), Space plays this week's game, X simulates it, Esc goes back to the title. See [docs/SEASON.md](docs/SEASON.md) |
| Season length | L on the title screen: ONE SEASON or DYNASTY (open-ended, with an offseason) |
| Transfer portal | In a dynasty, Space on the finished season opens the offseason. A/D or click a tab (Board, My Room, Leaving). Board: Q/E or click a position chip, W/S or click a player, then 1 offer, 2 promise (snaps, then a start), 3 call, 4 visit, 5 focus or drop. Leaving: 1 meet, 2 promise a start, 3 promise snaps, 4 let go, 5 encourage. F hands the portal to your staff, Space advances a round, Esc returns to the hub (its PORTAL button comes back). See [docs/PORTAL.md](docs/PORTAL.md) |
| Team page | T (or the TEAM button) in the season hub. A/D or click a tab to pick a position, click a player for his card, drag a player up or down the depth chart to reorder it. G hands the depth chart to your staff or takes it back. Esc returns to the hub |
| Playbook page | P (or the PLAYBOOK button) in the season hub. A/D or click a tab (Starred, Pass, Run, Play Action), W/S pages. Click a card to see it drawn with your starters; click a card's star to save the play. In a play: A/D previous/next, Space star, F flip, Esc back |
| Quarter length | Q/E on the title screen: SHORT 4:00, STANDARD 6:00 or LONG 8:00 quarters (about 4, 5 or 7 drives each) |
| Playbook tab (Pass / Run / Play Action / Special) | Click a tab, or Q/E or Tab |
| Formation filter | A/D or the mouse wheel (or click a chip) picks STARRED (your starred plays on this tab) or a formation; W/S pages when there are more than 9 plays. Click a card's star to star or unstar it |
| Call a play | Click a card or press 1–9. Watch the play clock: if it runs out, it's delay of game. With the clock running, the snap runs it down to :14 (huddle) or :28 (hurry-up), however fast you call the play |
| Tempo | H on the play-call screen toggles HUDDLE and HURRY. Hurry switches itself on once when you're not ahead inside 2:00 of a half |
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

- `src/engine/`: fixed-timestep loop helpers, camera projection (yards to pixels), input, saved data (`storage.ts`)
- `electron/`: the desktop app's main process and preload
- `src/data/`: ratings and positions, the 138 FBS team profiles, roster generation and depth charts, playbook (formations and route trees), defensive calls. See [docs/RATINGS.md](docs/RATINGS.md) and [docs/ROSTERS.md](docs/ROSTERS.md)
- `src/sim/`: player physics, ball flight, AI (routes, man and zone coverage, blocking, pursuit), catch and tackle resolution
- `src/game/`: play state machine (`playState.ts`), down/distance rules and CPU drive sim (`rules.ts`), game and play clocks (`clock.ts`), screens (`game.ts`)
- `src/render/`: procedural pixel-art sprites with team-color swaps, field, HUD

Tuning constants live next to the logic they affect: kick physics and accuracy (`LEG_SPEED`, `AIR_DRAG`, `WIND_SCALE`, `kickErrorSd`) in `sim/kicking.ts`, special-teams odds (`MUFF`, `FG_BLOCK_BASE`, `RETURN_BLOCK_EDGE`, `DIVE_RANGE`) in `game/kickPlay.ts`, `throwErrorSd` in `sim/passing.ts`, `catchOdds` in `sim/catching.ts`, `tackleChance` in `sim/tackling.ts`, shed and push rates in `Play.updateEngagements`, `RUN_BLOCK_EDGE` and `ARM_TACKLE` in `game/playState.ts`, `pitchOdds` in `sim/catching.ts`, and `AIM_TIME_SCALE` in `game/game.ts`.
