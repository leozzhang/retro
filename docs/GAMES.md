# Game pages and the postgame

Every finished game in the league has a page. After the user's own games, the postgame shows one or two highlights first, then that game's page.

## Where it comes from
Every game keeps three things (`GameResult`, `season/types.ts`):
- **`box`**: team lines and player lines.
  - A simulated game's come from `simGame`'s casting (`season/cast.ts`). A played game's come from the field (`season/liveBox.ts`).
  - Defenders now get sacks (`sk`) and interceptions (`defInt`). They're credited from the cast's `by`, so no new random draws are made.
- **`plays`**: the game's key plays (`season/gamePlays.ts`).
  - Every scoring play, turnover, fourth-down stop and other play the key-play rules always show (priority 3), plus the `GAME_PLAYS.extra` biggest of the rest.
  - They're built from the game's story (`season/story.ts`). `simGame` and `simPart` now always tell one, which draws no random numbers, so `npm run season` stays byte-identical.
  - Plays store athlete ids. Names come from the box score's lines.
  - Scoring plays always add up to the final. The season report's GAME PAGES section checks this for every game.
- **News items** carry `game`, so their score links to the page (`gameSpan`, `render/links.ts`).

Cost: about 17 plays a game, about 290 KB gzipped a season.

## A played game's story (`season/liveBox.ts`)
- The user's snaps go on the user's open drive as `SimPlay`s, with a `SnapCredit` naming who threw, caught or carried it and the CPU defender who intercepted or sacked. Drives marked `live` don't get rebuilt fourth downs.
- The CPU's drives go in as their simulated `StoryDrive`s.
- Points are added as they're scored: the touchdown, its try, a field goal. In the shootout, a try is its own drive, as in `simGame`.
- A score by the CPU's defense (pick six, safety, return touchdown) is attached to the user's snap or kick it came from (`against`). It's kept as a play with `for` set to the team that scored.
- A game taken over partway starts from `simPart`'s story and box score.

## Stars of the game (`season/gameStars.ts`)
- **PLAYER OF THE GAME:** the best `impact` on the winning side. A losing player can still win it with a far better line.
  - `impact` is a fantasy-style score (`STARS.pts`) minus `meanW` of that position's usual game, divided by a blend of the position's spread and one shared scale (`pow`, `common`).
  - Plus an `edge` for QB and for defenders. A team has one QB and four or five receivers with lines, and a defender's line is only sacks and picks.
  - Targets, from the season report: QB ≤ 40%, HB and WR clearly there, DEF about 10%. Currently QB 28%, HB 33%, WR 24%, DEF 12%.
- **BIG PLAY:** the play with the biggest `playSize`: leverage, a score that ties the game or takes the lead, a turnover, and yards. A field goal counts at `play.kick` of its size.
  - It's credited to the carrier, receiver or kicker, or to the defender on a defensive play. A stop with no defender named has no star.
- **OVERPERFORMER:** the player whose `impact` (without the edge) is furthest above what his overall predicts (`ovrMid`, `ovrSpan`), by at least `minOver`. Players rated `maxOvr` or higher don't qualify.
- No player gets two cards.

## The page (`render/gameScreen.ts`, screen `game`)
- **Header:** away on the left, home on the right, each in its colors, with the final, the week and the site.
- **SUMMARY:**
  - the score by quarter, from the scoring plays
  - the team stats
  - the top 4 plays by `playSize`
  - the star cards, with names linked
- **BOX SCORE:** each team's passing, rushing, receiving, defense and kicking.
- **PLAYS:** the scoring and key plays in order, with the score after each score. It scrolls.
- Games from before the plays were kept show the box score and "NO PLAY-BY-PLAY".

**Opened from:**
- RESULT on the hub's SCHEDULE and on a program's SEASON tab
- either score on SCORES
- the score (or a player's stat phrase) in NEWS

Game pages and program pages share one back stack. Esc walks back through it. From a game page, every player name opens the registry, so Esc comes back to the game.

## The postgame
- **A played season game:** FINAL → Space → the result is saved → the game's page (Space or Esc: the hub).
  - **HIGHLIGHTS** sit in the SUMMARY's bottom right corner: up to `POSTGAME.reel` thumbnails, each the opening frame of the play, cropped around the ball (`REEL_CROP`, `game/game.ts`). Click one to watch it, or H for all of them. Esc or the end of the show comes back to the page.
    - A thumbnail is drawn once its show is cued (`cueShow`, `drawShowStill`, `game/highlights.ts`): a re-enacted play's search runs while the page is open.
    - The reel stays in memory until the next game ends, so the page shows it from SCHEDULE too until then. Other games' pages have none.
  - The reel (`pickReel`, `game/tape.ts`) takes the biggest plays rated `minPriority` or higher, by leverage and yards.
    - A score that ties the game or takes the lead scores `lead` more, whoever made it.
    - A play that went the user's way scores `userGood` more, and `tapeBonus` more again when it's on tape. A tape of the user being stopped gets no bonus.
  - **Tapes:** the user's own snaps replay as they were played.
    - Every live snap is recorded at `TAPE.fps`: each man's spot, facing, pose, look and juke, and the ball. Recording only reads the play.
    - The best `TAPE.keep` snaps are kept, by `tapeScore` (touchdowns, turnovers, 20+ yd gains, sacks, fourth downs). Tapes live in memory and are dropped after the game.
    - `drawTape` (`render/renderer.ts`) draws a frame, and a `KeyShow` with a tape plays it in place of a re-enactment.
  - CPU drives and kicks are re-enacted by the key-play replays, as during the game.
- **SIM GAME with key plays:** the key plays already ran, so FINAL goes straight to the page, with no thumbnails.
- **An instant SIM GAME** goes to the hub as before. The result is clickable.

## Whole yards
The live game's CPU drives start on a rounded spot (`cpuDrive`), since a play or kick can end on a fraction of a yard. Before that fix, the CPU's team yards and a scorer's capped touchdown yards could carry decimals. `unpackSeason` (`season/save.ts`) rounds box-score numbers on load, which repairs saves that already have them.
