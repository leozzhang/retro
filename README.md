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
| Main menu | W/S or the mouse, then Enter or click: CONTINUE (your most recent dynasty), DYNASTY or EXHIBITION |
| Exhibition | A/D your team, W/S its conference; Left/Right the opponent, Up/Down its conference (or click the arrows). Q/E quarter length: SHORT 4:00, STANDARD 6:00 or LONG 8:00 (about 4, 5 or 7 drives each). R or T shows your or the opponent's roster (A/D pages, Esc back). Enter or KICK OFF starts the game; the final goes back to this screen. Esc returns to the menu |
| Dynasty slots | Three save slots. A/D or click a slot, Enter plays it. An empty slot starts a new dynasty: choose your school (A/D team, W/S conference), then the settings (W/S a row, A/D changes it: injuries and game length), then START DYNASTY. DEL or a card's DELETE asks before deleting a dynasty |
| Season hub | The sidebar has everything: HOME (this week's game, your last game and news, your conference race), MY PROGRAM (your program page H, schedule and the pages: roster T, playbook P, game prep O, recruiting R) and AROUND THE FBS (scores, standings, polls, news, leaders, awards, playoff). W/S or click picks an item, Enter or a click opens a page. A/D or the header arrows step the week, conference or poll; Q/E or the wheel scrolls a long week of news. Space or the gold button runs the week's action (play the game, advance, the offseason's next stage), X or SIM GAME simulates the game. Esc goes to the main menu. Team names (standings, news, scores, polls and more) open that team's program page, and your players' names open their roster card. See [docs/SEASON.md](docs/SEASON.md) |
| Program page | Any team's page: OVERVIEW (the fan pulse, trophy case, last five seasons, big headlines), SEASON, HISTORY, NEWS and REGISTRY (every player's career). 1-5, Tab or a click picks the page; the wheel or W/S scrolls HISTORY and NEWS; names are links; Esc goes back. On the roster, C or a click on the card's name opens the player in the registry. See [docs/PROGRAM.md](docs/PROGRAM.md) |
| Transfer portal | In a dynasty, Space on the finished season opens the offseason. A/D or click a tab (Board, My Room, Leaving). Board: Q/E or click a position chip, W/S or click a player, then 1 offer, 2 promise (snaps, then a start), 3 call, 4 visit, 5 focus or drop. Leaving: 1 meet, 2 promise a start, 3 promise snaps, 4 let go, 5 encourage. F hands the portal to your staff, Space advances a round, Esc returns to the hub (Space or the gold button reopens it). See [docs/PORTAL.md](docs/PORTAL.md) |
| Team page | ROSTER (or T) in the hub. A/D or click a tab to pick a position, click a player for his card, drag a player up or down the depth chart to reorder it. G hands the depth chart to your staff or takes it back. Esc returns to the hub |
| Playbook page | PLAYBOOK (or P) in the hub. A/D or click a tab (Starred, Pass, Run, Play Action), W/S pages. Click a card to see it drawn with your starters; click a card's star to save the play. In a play: A/D previous/next, Space star, F flip, Esc back |
| Playbook tab (Pass / Run / Play Action / Special) | Click a tab, or Q/E or Tab |
| Formation filter | A/D or the mouse wheel (or click a chip) picks STARRED (your starred plays on this tab) or a formation; W/S pages when there are more than 9 plays. Click a card's star to star or unstar it |
| Call a play | Click a card or press 1–9. Watch the play clock: if it runs out, it's delay of game. With the clock running, the snap runs it down to :14 (huddle) or :28 (hurry-up), however fast you call the play |
| Tempo | H on the play-call screen toggles HUDDLE and HURRY. Hurry switches itself on once when you're not ahead inside 2:00 of a half |
| Speed option | Right-click to pitch while you attack the end; run past the line to keep it |
| Flip the play | F on the play-call screen mirrors the next play (the cards redraw mirrored) |
| Audible (pre-snap) | Esc |
| Snap | Space or click |
| Motion (pre-snap) | M sends a receiver in toward the ball and back (each press, the next one: slots, then wideouts, then tight ends). His man defender travels with him; a zone only slides over. You can't snap until he's set |
| Hard count (pre-snap) | H fakes the snap, twice a drive, for 1.5 s of play clock. A disguised defender may flinch toward his real spot, a blitzer may jump, and now and then a lineman jumps offside (5 yards) |
| Reading the coverage | Some snaps the defense shows one shell and spins to its real coverage at the snap (the DISGUISES setting turns this off); the read line over the field names what's shown (the READ HELP setting: the whole look, the shell only, or nothing). After the play, a blue line says what they were really in |
| Pass | Press anywhere, drag back, and release. The target is projected the opposite way from the QB, with no slow motion unless you turn on SLOW AIM (a dynasty setting; M on the exhibition screen), which also covers aiming a punt. Space cancels the aim without throwing |
| Hand off / pitch to the RB | Right-click (or F) while he's in the backfield and not blocking. Works on any play, so you can call a draw |
| Move QB / steer runner | WASD or arrow keys. After a catch the runner keeps going downfield automatically. A runner at the line (within 2 yards of it after a handoff) waits for the hole when you hold nothing, and W or S alone slides him along the line; past it, he runs downfield on his own |
| Sprint | Shift (drains stamina). Off the sprint a player jogs at about three quarters of his top speed. How long the sprint lasts depends on the player's stamina, so a pocket QB's bar is shorter than a receiver's |
| Cut | Space while holding W or S, for a running back carrying on a called run: a near-instant dash of about two yards up or down the screen (it stops short if someone's in the way), once a play, costing some of the sprint bar. A quicker, more elusive back (acceleration and elusiveness) cuts farther. A tackler who closes on you mid-cut often misses, more often against an elusive back; cutting with nobody there just loses ground |
| Reading the line | A called run plays zoomed in for the whole snap (the field spreads out so the line comes apart) and in slight slow motion from the snap. A ring under each blocked defender shows the block: green, the block is winning; gold, even; red, he's beating it (flickering when he's about to get off). A white bar on a defender marks his blocker's side, bright when you're on that side of him. Pale streaks past the line are daylight: lanes no defender can reach soon (the RUN ASSIST setting shows them always, only until the handoff, or never; L on the exhibition screen) |
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
