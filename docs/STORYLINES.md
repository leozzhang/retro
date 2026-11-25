# Storylines and the Week Wrap

The sim already makes drama: next men up, breakouts, breakthroughs, injuries, upsets, poll jumps, the Heisman race and rivalries. Before this, all of it left as one line of news, and the player had to notice it and imagine the rest. This layer **picks** the few things a week that matter to your program, **stages** them as animated scenes, **sets them up** before the game that decides them, **remembers** earlier beats, and at turning points **asks you to decide**.

| Piece | Where |
| --- | --- |
| Moments: what's worth a scene each week (`MOMENTS`) | `src/season/moments.ts` |
| Storylines: the arcs, their stakes, decisions (`STORY`) | `src/season/storylines.ts` |
| Recruiting's storylines and the commitment scene (`RSTORY`) | `src/season/recruitStories.ts` |
| The races, transfer risk, new faces, senior day, draft stock (`TSTORY`) | `src/season/teamStories.ts` |
| The offseason's reveals and the season opener | `src/season/offseasonMoments.ts` |
| The Week Wrap's scenes | `src/render/momentScreen.ts`, parts in `src/render/momentArt.ts` |
| HOME's THE WEEK'S STORY box, the STORYLINES panel | `src/render/seasonScreen.ts` |
| The `wrap` screen, its input, HOME's M / Y / Enter | `src/game/game.ts` (`toSeason`, `openWrap`, `updateWrap`, `updateStories`) |
| Stored | `SeasonState.moments`, `seenMoments`, `buzz`, `stories`, `lineup` (the offseason's snapshot of the user's starters); `TeamState.pin`; `SeasonConfig.wrap` |
| Every scene with sample data (dev builds) | `window.game.momentGallery()` (`src/render/momentGallery.ts`) |
| Season report | the STORY section of `npm run season` |

## Rules
- **Display only, except decisions.**
  - The `moments` week step runs last and draws no randomness: its wording varies by a hash of ids, like the fan pulse.
  - `src/moments.test.ts` checks that a season with the step and one without are identical apart from `moments`, `buzz` and `stories`.
  - The same goes for the offseason's reveals and the opener (`STAGE_MOMENTS.on` off in the test).
  - Recruiting is read through `peekRecruiting`, which puts the recruiting school cache back as it was.
  - The one thing that reaches the sim is a decision, and it acts only through a lever the game already has: the depth chart, an official visit (`toggleVisit`) or an in-home (`inHome`).
- **Text is written when it happens**, like the news, and player cards are copied in (`MomentPlayer`), so a moment still reads right after the roster changes.
- **Season-scoped.** A new season starts with no moments or storylines. Careers and the chronicle keep the history.

## Moments (`weekMoments`)
Tier 3 is the biggest; `w` orders moments within a tier.

| Kind | Tier | When |
| --- | --- | --- |
| `final` | first, always | your game. Its style is win, loss, `upset` (beat a team ranked 6+ spots higher or while unranked: STORM THE FIELD, confetti), `stunned` (the reverse: rain), `rivalry` (the series under you), `title` (conference champions), `champion`. It shows the score slam, the AP rank rolling, and the game ball (your best line by `impact`). |
| `breakout` | 3 | a breakout on your team: the leap, the dev trait flipping, the bars filling, and the spark's backstory ("4 WEEKS AGO HE STEPPED IN FOR...") |
| `breakthrough` | 2 | a big level-up: overall rolling up, the bars |
| `injury` | 3 for a playmaker out 2+ weeks (`MOMENTS.keyW`), else 2 | a starter hurt: him down in red, then the next man up runs in with his card, career starts and "HIS TIME: AT #12 LSU" (from `newStarters`, so it's the man who'll actually start) |
| `firstStart` | 2 | a first start **with a story**: a spark, or the man up for an injured starter, with his line ("IN HIS FIRST START: 18/25, 240 YDS") |
| `poll` | 2, 3 into the top 5 | into the Top 25, a jump of `pollJump`+ places, into the top 10, top 5, No. 1: the rank rolling and the ladder around you |
| `heisman` | 2-3 | your player enters the top 5 or takes the lead (from `buzz`, the weekly top 10); the ceremony at selection |
| `milestone` | 2 | a season total crossed this week (`MOMENTS.milestones`: 1,000 rushing yards, 3,000 passing, 20 TD passes...) |
| `stakes` | 2-3 | bowl eligible, unbeaten at 6-0, 8-0... (3 at 10-0), title game bound, the playoff seed or the bowl bid |
| `story`, `decision`, `preview` | | from storylines (below) |
| `progress` | 1 | the week's level-ups as tiles, one per player, breakthroughs in gold |
| `around` | 1 | AROUND THE FBS: the biggest upsets elsewhere, a new No. 1, a breakout elsewhere, the Heisman top 3 with movement |

**`mergeWeek`** keeps it to one card per player a week: a storyline beat about a player who also has a first start or a breakout folds its lines into that card, and the injury, breakout and first-start cards link to their storyline.

## The Week Wrap
- It opens whenever the hub is reached with unseen moments (`toSeason`): after the postgame game page, after a simulated week, after a watched SIM GAME. Esc goes home at any point, and leaving marks them seen and saves.
- A click (or Space) finishes the scene's animation; the next one moves on. Each scene is drawn purely from its clock, so skipping just sets it to the end.
- **The order** (`wrapOrder`): the final, then decisions, then the rest by tier and weight, then the progress tiles, UP NEXT, and AROUND THE FBS.
- **The WEEK WRAP setting:**
  - **BIG** (the default): the final, decisions, the top `MOMENTS.big` (3) other tier-2+ moments, UP NEXT, AROUND THE FBS.
  - **ALL**: everything.
  - **OFF**: nothing, but decisions always show.
- **Replays:** M on HOME replays the newest week, in full. A storyline on the STORYLINES panel replays its moments.

## Storylines (`storyStep`)
Each runs a few weeks with **stakes**: what the next game decides. The stakes show in UP NEXT at the end of the wrap and on the STORYLINES panel.

**Where they show:**
- **Names:** every player in a storyline is written with his position ("QB JOHN SMITH", `withPos` in moments.ts), and names on HOME and the STORYLINES panel are links.
- **HOME's THE WEEK'S STORY:** one line per running storyline: a short name, the player (position and last name), and a word or two of what's on the line (YOUR CALL, 6-0, 2/3, NO. 3, VS MIA). Anything longer lives on the STORYLINES panel.
- **The STORYLINES panel:** full lines, cut at a word when they don't fit. A finished story's outcome takes both lines when it needs them.

| Kind | Opens | Moves | Closes |
| --- | --- | --- | --- |
| `nextManUp` | a starter hurt 2+ weeks; the star is the replacement `newStarters` names | each start: a beat with his line and his record as the starter | the starter is healthy. If the backup's confidence is `hotHand`+ at a position weighing `decideW`+, it becomes a **decision: WHO STARTS?** Otherwise "returns to the bench after N starts (W-L)". |
| `breakoutWatch` | a spark with a breakout window | one box per game of the window (GOOD, STARTED, NO START, or still to come; `Progress.sw.r`) under the rule (START 3 OF HIS FIRST 4 GAMES AND PLAY WELL), and where he stands: NEEDS 1 MORE START IN 2 GAMES, PLAYING WELL / GRADES TOO LOW, or OUT OF REACH | the breakout, or "the spark fades" |
| `slump` | a healthy starter at `slump` (-0.5) confidence after 3+ starts, at a playmaker position or the kicker; at most 2 at once | | back over `slumpOut`; hurt; losing the job (only when he has no starting role left: not last game's starter, not in the chart's next lineup, not top of any slot, so a rest day or a week out hurt isn't a lost job); or `slumpWeeks` later. With a `challenger` at a `decideW` position: **decision: STICK WITH HIM or START <BACKUP>** |
| `heisman` | your player in the weekly top 5 | rank and the next game | the ceremony, or falling out of the top 10 |
| `unbeaten` | 5-0 (`STORY.unbeaten`) | | the first loss: PERFECT NO MORE |
| `bowlChase` | short of 6 wins with `bowlLeft` or fewer games left, still alive | NEED 2 OF THE LAST 4 | bowl eligible, or out |
| `rivalry` | the week before a named rivalry game: the series under you, or REVENGE if they won the last one | | the game |
| `reunion` | a starter facing the school he transferred from | | the game |
| `homecoming` | a starter playing a road game in his home state (not your own state) | | the game |

### Recruiting (`recruitStories.ts`)
| Kind | Opens | Moves | Closes |
| --- | --- | --- | --- |
| `recruitment` | the user climbs into the top `RSTORY.enter` (3) of a 4-star or better, a national top 150, or a top target's market; at most `open` (4) at once, the most valuable first. A decommit from the user reopens his story as WAVERING. | his market place each week (YOU LEAD, NO. 2: TEXAS LEADS), his official visit's verdict (from `vibe`: LOVED THE LSU GAME; "THE STAFF HOSTED HIM" when the staff recruit), an in-home | the hat pick (`commit` moment: his top 3 schools' plates, one locks in): to the user, tier 3 for a 5-star or top 100; elsewhere, "PICKS ALABAMA". Out of his top 5 for 2 weeks. Signing day settles the rest. |
| `recruitClass` | the first commit | the national rank and commits out of the room; a ladder moment into the top 25, the top 10, No. 1, or up 5+ inside the top 25 | signing day |

- **Decisions** (only with the user recruiting; 4-stars and up; at most `RSTORY.asks` (3) a season, one a week):
  - **HOST HIM FOR THE <OPP> GAME?** when the user's next game is at home and there's a visit slot. It calls `toggleVisit`.
  - **SEND THE STAFF INTO HIS LIVING ROOM?** from championship week, when the user is No. 1-2 or he's wavering. It calls `inHome`.
  - The story goes on after either answer. An unanswered question is passed.
- **The visit weekend:** UP NEXT lists the recruits in the stands; the final adds "3 RECRUITS ON VISITS: 2 LOVED IT".

### The rest of the program (`teamStories.ts`)
| Kind | Opens | Closes |
| --- | --- | --- |
| `confRace` | in a conference with a title game, 2+ conference games in, in the top `confPlace` (3) and alive | CLINCHED (tier 3) when at most one rival can still reach the user's conference wins; ELIMINATED when two have more than the user can reach; else the title game decides |
| `bubble` | from the first CFP poll, CFP top 20, in the field or within 4 spots of it (the field picked today with `selectPlayoff`) | selection: the seed, or left out. Moving in or out of the field is a tier-2 beat. |
| `award` | a user player top 3 in a position award's race (O'Brien, Walker, Biletnikoff, Groza) | the ceremony (`award` moment for a winner) |
| `transferRisk` | a user player at MISERABLE morale (`TSTORY.miserable`) who matters (within 4 of his position's weakest starter, or a 4-star+); at most 2. Why from `moraleReason`. Unhappy about his role with a slot he can take: **decision: GIVE HIM THE START?** (a depth pin) | back to CONTENT, or the portal's reveal: ENTERED THE PORTAL / STAYED |
| `phenom` | a true freshman (`joinYear`) who starts with a spark or a big line; his recruiting stars and rank | the season's end |
| `newFace` | the season opener, for up to 3 new starters at playmaker positions (THE NEW QB: TRANSFER FROM UCF) | 3 starts (the first is TRANSFER DEBUT / THE DEBUT, tier 2) |
| `seniorDay` | the week before the last regular-season home game; the seniors leaving (`seniorsLeaving`) | the game, then a SENIOR DAY card of the seniors with their career starts |
| `draftStock` | weeks 6, 10, 14: a user starter projected in the first `draftRound` (2) rounds (`teamProjections`) | departures: DRAFTED (round, pick, city), DECLARED/WENT UNDRAFTED, or COMING BACK |

## The offseason (`offseasonMoments.ts`)
Each stage ends with a reveal (`stageMoments`, called by `advanceOffseason`). The offseason screens open it (`Game.stageWrap`) and go back to their stage after. Every card plays, in the order built (`wrapOrder` keeps an offseason list whole). The WEEK WRAP setting OFF skips them.
| Stage | Cards |
| --- | --- |
| carousel | STAFF CHANGES: the user's carousel news. The season's stories nothing in the offseason settles close here, and the user's lineup is kept (`lineup`) for the opener. |
| departures | THE PICK IS IN for each first-rounder (the pick rolling, the city, his card), DRAFT NIGHT for every pick, FAREWELL: who graduated, who declared, who stays. Closes draft stock. |
| signing | SIGNED for up to 3 4-star-plus signees, THE CLASS (tiles), CLASS RANKINGS, THE ONES THAT GOT AWAY. Closes recruitments and the class. |
| portal | THE PORTAL OPENS: the user's entrants. Closes transfer risks. |

**The season opener** (`seasonOpener`, from `newSeason` with the offseason's state), week 0:
1. THE <YEAR> SEASON: the preseason rank, last year's record, starters returning.
2. NEW ARRIVALS: transfers in (from where), then the freshmen.
3. NEW STARTERS: each changed starting slot, who moved in (transfer, true freshman, moves up) and whom he replaces (drafted, graduated, transferred, moved to another slot, beaten out).
4. PLAYERS TO WATCH, 5. GAMES CIRCLED (ranked opponents and named rivalries).
It opens the `newFace` stories.

**Continuity rules** (`startingRoles`, `challenger`, `injuredStarters`; tested in `src/moments.test.ts`):
- **Next man up:**
  - Only an injury to a real starter has one. A real starter was in last game's starting lineup (`TeamState.st`); a package slot like WR4, TE2 or DIME doesn't count.
  - The next man up is a bench player now in the starting lineup at any slot: he didn't start last game and has started fewer than half the team's games. The same position first, then the same role, one per injury.
  - A starter who slid over from another slot, or came back from a missed game, is never the next man up.
  - If no bench player moved up, there's no next man up.
  - The injury card and the storyline use the same answer.
- A slump's challenger has **no starting role anywhere**, so he's never another slot's starter, and never a starter sitting hurt.
- He's healthy and not slumping himself (confidence over `CONFIDENCE.slump`, no open slump story), within `slumpReach` overall.
- No challenger means no decision, just the beat.
- A next man up whose starter is back says who the chart actually has: KEEPS THE JOB when the staff keep the backup on, RETURNS TO THE BENCH otherwise.

## Decisions (`decide`)
- **A decision never blocks the week.** Esc leaves it as a gold YOUR CALL card on HOME (Enter opens it). If the next week is played first, the staff's chart stood, and the storyline says so.
- **Your own depth chart:** the choice moves the player to the top of the slot.
- **A staff chart:** it sets `TeamState.pin`, which `squadFor` lays on: the pinned man is first at his slot while he's healthy, for the rest of the season. With no pin, the code path is unchanged.
- **The consequences are the sim's own:**
  - Morale's job and bench reactions read who started.
  - The confidence benching penalty applies to a pin as it does to a user's chart (`confidenceStep`). Riding a weaker hot hand over an in-form starter costs the starter.
  - The sparks' rules are unchanged.

## Calibration (`npm run season`, STORY)
Targets:
- BIG shows 3-6 cards a week.
- A tier-3 moment in 25-45% of game weeks (one every 2-4 weeks).
- Fewer than 35% of weeks with nothing past the final.
- 0.5-3 decisions a season.
- Recruiting (the tier teams play open-ended careers with the user recruiting and nobody acting):
  - 2-6 recruitments followed a season;
  - 1-3 recruiting decisions.
- The offseason's cards per stage are listed for the first tier team.

Last run (5 georgia seasons plus the 5 tier teams):
- BIG: 4.8 cards a week.
- Tier-3 moments: 35.7% of weeks; nothing past the final: 11.4% of weeks.
- Decisions: 2.0 a season.
- Recruiting: 3.6 recruitments followed and 1.4 recruiting decisions a season. 0.2 commit to the user, since nobody makes the offers.
- Offseason cards (texas): carousel 1, departures 4, signing 5, opener 5.

The tuning that got there:
- Slumps at the staff's line (-0.35) fired for 7 starters in one week. They're now -0.5 after 3 starts, playmakers and kickers only, at most 2 open.
- First starts showed every rotation player and punter. Now a first start needs a story behind it.

The numbers are in PROGRESS.md.

## Not built yet
- **In-game:** a pregame intro with the storylines to watch, and lower-thirds when a storyline's player makes a play (`liveBox` has his line live). The final screen could read its moment's style.
- **More arcs:** the hot seat (coach career has no firing yet), records (the program's and careers'), a portal pursuit during the portal stage (who you're chasing, round by round).
- **Sound:** stingers for the scenes.
