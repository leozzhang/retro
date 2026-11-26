# Alumni (THE LETTERMEN)

Every player the user has coached, past and present, kept as a **plaque**. The code is in `season/alumni.ts`. The page is the ALUMNI tab of the user's own program page (`render/alumniScreen.ts`), and only the user's program has one. The point is the feeling of a long tenure: years later you can look back at a player you recruited and see what he became.

## Rules
- **Display only**, like careers (docs/CAREERS.md). Nothing in the sim reads it and it draws no randomness. Adding it left `npm run season` byte-identical apart from timing.
- **Only seasons with the user's team.** No players are made up for the years before the dynasty. A transfer's earlier seasons stay on the REGISTRY.
- **The media guide, not the spreadsheet.** A plaque keeps what a fan would remember, not what the sim knew. It has no full ratings, weekly grades, morale or health. Players have no faces, so a plaque's identity comes from his number in the home jersey's colors, a nickname, and a frame for his legacy.

## Data (`SeasonState.alumni`, `SeasonState.hof`)
`AlumPlaque` (`season/types.ts`) holds:
- name, number, position, archetype, hometown, height and weight, stars
- **origin:** `signed` (a high school signee or placeholder freshman, with his national rank), `inherited` (on the roster the user took over), `transfer` (with `from`) or `walkon`
- `ovr0` (his overall on arrival) and a row per season with the user: class, role, GP, GS, his overall at season's end, his jersey if it changed, and stat totals
- the calling card: his two best ratings at his position, in words ("ELITE SPEED")
- honors: award wins and finalist finishes, from his story's `award` lines
- the story's most telling lines with the team (`ALUMNI.lines`, 6), ranked: award, breakout, spark, transfer, first start, breakthrough, injury. Season-ending injuries rank higher, and a plaque keeps only one start line.
- **exit:** `grad`, `declare`, `transfer` (with `to`) or `left`, plus the draft (round, pick, city) from `SeasonSummary.draft`
- `score`, the legacy score

`hof` is a list of athlete ids. It's the user's free toggle, for any player current or former, with no limit.

## The store (`syncAlumni`)
- Every plaque is rebuilt from the career store and `generatedAthlete(id)`. Ratings are the generated ratings plus `careerGains` of his rows, so `Progress` isn't needed after he leaves.
- Current players are refreshed on every sync with their archived rows only. The page lays the live season on top (`alumniList`, cached by week and phase).
- A player who has played a season for the user and is no longer on the roster is frozen with his exit and never rebuilt.
- The sync runs as a season completes (after `archiveSeason`), after departures, after the portal closes, before the next season starts, and whenever the page is opened. It's idempotent, and it backfills saves from before the store existed.
- A former player's number comes from his last refresh as a current player, else his career rows (`CareerSeason.num`, kept for joiners and anyone not in his generated number; `jerseyOf` in `career.ts`). A plaque frozen at #0 by a save from before rows kept numbers (freshmen, walk-ons and recruits get theirs on joining, and their generated record says 0) is repaired on sync with a seeded stand-in in his position's bands.
- Size: about 400 bytes a plaque, so 25–30 a season, about 12 KB of JSON a season.

## Legacy and frames (`ALUMNI`)
| Tier | Rule | Frame |
| --- | --- | --- |
| ON THE ROLL | never played | thin gray |
| LETTERMAN | played | team-color border |
| STARTER | a season as the starter, score 30+ | bronze |
| STAR | a season as the starter and score 62+ (or 30+ with a breakout), or drafted in rounds 1-3 | silver with rivets |
| LEGEND | score 115+, an award won, or a top-10 pick | gold with studs |
| HALL OF FAME | the user's toggle | gold on a black plate, a glint running the border |

The score adds up starter seasons (10), rotation seasons (3), starts (0.6 each), peak overall over 75 (1.2 a point), award wins (45), finalist finishes (14) and the draft by round (40 for the 1st down to 8). Over two Georgia seasons: 52 on the roll, 38 lettermen, 26 starters, 14 stars and 2 legends. The STARTER and STAR frames need a season as the starter, because a deep roster's backups rate in the 90s too.

**Nicknames** (`epithet`) go to stars and up only. They're fixed by id: "THE <HOMETOWN> <NOUN>", with a position noun that starts with the town's letter when one exists. A long town name gives "<LAST NAME> THE <NOUN>". A walk-on star is THE WALK-ON WONDER, and a 2-star signee THE <TOWN> SLEEPER.

## The page
- **ROLL:** the list (number, name, position, years, peak overall; the tier color on the left edge, a star for the Hall of Fame, green for current players) and the plaque. Filters are chips: click to step forward, right-click to step back. They are SHOW (PLAYED by default, FORMER, CURRENT, EVERYONE), POS by group, YEAR, FROM (origin), HOF, and SORT (legacy with the Hall first, peak, starts, newest, yards, name). `/` or a click on the box searches names, hometowns and nicknames.
- The plaque has the jersey, name and nickname, the tier, position, archetype and size, the hometown and years, IN (how he came) and OUT (how he left). Then the ARC (his overall each season, the peak in gold), the calling card and career totals, honors, his last seasons, his story lines, and the Hall of Fame button (F).
- **RECORDS:** single-season and career leaders "since you arrived", in passing, rushing, receiving, sacks, interceptions, field goals and starts. A name opens his plaque.
- **NUMBERS:** a 0–99 grid. Each cell shows how many players wore the number, with a bar in its best wearer's tier color. Picking a number shows its lineage.
- **TIMELINE:** the starters at each position group by season, up to two names per cell. Dots on the cell's edge count the rest. Names are colored by tier, and a name returning from last season is softer.
- Keys: V view, W/S player (or category, or number row), A/D number or timeline year, F Hall of Fame, the wheel scrolls.
- A link to a former user player (news, game pages) opens his plaque.

## Dev
`game.devAlumni(n)` from the console sims `n` open seasons with their offseasons and opens the page. It's not saved.

## Not built yet
- Where are they now: an NFL afterlife, seeded per id and display only.
- Yearbooks with a team photo and senior superlatives; a hometown map.
- Record-broken news during the season.
- All-conference teams don't exist yet, so they don't count toward legacy.
