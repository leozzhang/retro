# Saturday Gridiron

A PC football game inspired by Retro Bowl, set in FBS college football, with more realism: real teams and conferences, deeper playbooks, defensive schemes, and reading the defense. It's a personal project. Current status and the roadmap are in [docs/PROGRESS.md](docs/PROGRESS.md); read it first.

## Stack
- TypeScript, HTML5 Canvas 2D, and Vite. No framework or game engine.
- Vitest for tests. The pixel font comes from `@fontsource/press-start-2p`.
- Planned later: package as a Windows .exe with Electron or Tauri.

## Run
```
npm run dev         # http://localhost:5173
npm run typecheck   # tsc --noEmit
npm test            # unit tests (src/logic.test.ts)
npm run balance     # headless AI balance report -> balance.txt
```
Controls are listed in [README.md](README.md).

## Code layout (src/)
- `engine/`: constants, camera projection, input, math and seeded RNG
- `data/`: teams and roster generation (`teams.ts`), formations, route trees and playbook (`plays.ts`), route concepts by receiver number (`concepts.ts`), defensive calls (`defenses.ts`), kick types and special-teams units (`specialTeams.ts`)
- `sim/`: player physics (`player.ts`), ball flight, AI (`ai.ts`: routes, coverage, blocking, pursuit), catch, tackle and pass-aim math, kick physics with wind (`kicking.ts`), and side-agnostic blocking for special teams (`blocking.ts`)
- `game/`:
  - `resolvePlay.ts`: lays a play out for the snap (mirroring, personnel, concepts to slot routes). See [docs/PLAYBOOK.md](docs/PLAYBOOK.md)
  - `playState.ts`: the `Play` class, the state machine for one snap, including handoffs
  - `kickPlay.ts`: the `KickPlay` class (FG/XP, punts, kickoffs) and the special-teams AI
  - `rules.ts`: down and distance, scoring, kick spots, CPU drive sim
  - `clock.ts`: game and play clock rules
  - `wind.ts`: per-game wind and its quarterly drift
  - `game.ts`: screens (title, play call with PAT and kickoff modes, play, kick, notices, final)
- `analysis/` (repo root, Python): NFL Big Data Bowl tracking analysis for route geometry, splits and concepts. See [analysis/README.md](analysis/README.md)
- `render/`: procedural pixel sprites with team-color swaps, the field and goal posts, HUD, the play renderer, and the kick renderer (aim preview, goal cam)

## Conventions
- **World units are yards.** x runs 0–120 along the field: 0–10 is the user's end zone and 110–120 is the opponent's. The user always attacks toward +x. y runs 0–53.3 across the field, with 0 at the far (top) sideline.
- **Fixed 60 Hz timestep.** Each step, AI and user input set `player.want` (desired velocity), then `stepPlayer` accelerates toward it. Don't move players' positions directly; the exception is blockers anchored during an engagement.
- **Separate data, sim and render.** Plays, routes and defensive calls are plain data in `data/`. Sim code never touches the DOM, so the balance harness can run it headlessly.
- **Art is original pixel art drawn in code** (`render/sprites.ts`). Don't copy Retro Bowl assets.
- **Tuning constants sit next to their logic:**
  - `throwErrorSd` (`sim/passing.ts`)
  - `catchOdds` (`sim/catching.ts`)
  - `tackleChance` (`sim/tackling.ts`)
  - shed and push rates (`Play.updateEngagements`), `RUN_BLOCK_EDGE`, `ARM_TACKLE` (`game/playState.ts`)
  - `pitchOdds`, `HANDOFF_ODDS` (`sim/catching.ts`)
  - `AIM_TIME_SCALE` (`game/game.ts`)
  - `LEG_SPEED`, `AIR_DRAG`, `WIND_SCALE`, `kickErrorSd` (`sim/kicking.ts`)
  - `MUFF`, `FG_BLOCK_BASE`, `RETURN_BLOCK_EDGE`, `DIVE_RANGE` (`game/kickPlay.ts`)
- **After changing AI or gameplay,** run `npm run balance` and compare against the baseline in PROGRESS.md.
- **Browser debugging:** in dev builds, `window.game` exposes the `Game` instance, and F1 toggles the debug overlay.

## Working agreement
- Update [docs/PROGRESS.md](docs/PROGRESS.md) at the end of each work session: what's done, what's in progress, bugs, and next steps.
- Keep this file short. Put detailed design notes in `docs/` and link to them from here.
