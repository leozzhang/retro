# The Coach's Office

Achievements, shown as a room. Each dynasty has its own office. It starts as a broom closet and fills with trophies, frames and keepsakes as the dynasty goes on. Big milestones move the coach into a bigger room, ending in a suite overlooking the stadium. It's display only: nothing in the sim reads the office, and finding items uses no randomness. `npm run season` stays byte-identical apart from its timing lines.

Open it from the hub with **OFFICE** (C) under MY PROGRAM.
- A gold dot on the sidebar item means something new: an item not seen yet, or a room to move into.
- Each unlock also shows a toast, "NEW IN YOUR OFFICE", on any screen off the field.

## Code
| Layer | File | What |
|---|---|---|
| data | `src/data/office.ts` | `ROOMS` (the five tiers), slot kinds and sizes (`SLOT_SIZE`), fallbacks (`SLOT_FALLBACK`), `anchorsOf` (every spot in a room) |
| logic | `src/season/achievements.ts` | `ACHIEVEMENTS` (each with a detector), `checkOffice` (runs one hook's detectors), `officeTier`, `layoutOffice`, `seeOffice`, the dev `sampleOffice` |
| state | `SeasonState.office` (`types.ts`) | `{ items, rev, tier }`. Optional, so old saves load. `newSeason` carries it over |
| art | `src/render/officeArt.ts` | one procedural drawer per item, cached by key, plus a 3x5 micro font for scores, names and headlines |
| page | `src/render/officeScreen.ts` | OFFICE (the room, hover cards, a click opens this season's games) and LIST (every achievement, found or hinted, and the next room) |

### Items
- An `OfficeItem` keeps what its art and card need at the moment it unlocks: score, opponent, headline, name and jersey number. Games are cleared each season and players leave, so the item can't look them up later.
- `key` makes each item unique (`conf:2027`, `jersey:<athlete id>`), so running a detector twice adds nothing.
- `team` is the school where the item was earned, and its colors are drawn into it.
- `fresh` marks items not yet seen on the office page. Leaving the page clears it.

### Leveled items
Most achievements level up instead of piling up, so the walls never fill with copies. The def's `levels` lists the finds each level needs, starting at 1:
- Every find folds into one item. Its `log` keeps each find's key, year, card line and an optional value its art reads, such as the beaten No. 1 team or a tree branch's role. `data` is the latest find's.
- Reaching a new level sets `up` (for the "LEVEL UP IN YOUR OFFICE" toast) and marks the item fresh. The item keeps its first `rev`, so it stays in its spot.
- The art grows with the level: more pages, helmets, caps, balls or leaves, then the frame goes wood, silver, gold, with gold studs at the top level.
- The card shows `LV n/N`, how many more finds the next level needs, and the latest three log lines. LIST shows pips.
- Items saved before an achievement leveled (batch 1's front pages) fold into one item the first time `checkOffice` runs.

Only the classics stay one item each: conference and national titles, Heismans, and first-round jerseys.

### Hooks
- **`game`**: the week's `office` step, the last of `WEEK_STEPS`. It reads the team's games that week. Ranks at kickoff come from `latestPoll(s, 'ap', g.week)`; comebacks and walk-off kicks come from `result.plays`.
- **`season`**: the same step on the week the season completes, after `history` has its rows (and the awards are final).
- **`carousel`**: `advanceOffseason` after the last hiring round (the coaching tree, from `treeOf`).
- **`draft`**: right after `runDepartures` writes the draft. It reads the newest history row with a draft.
- **`signing`**: right after `runSigningDay` (five-stars from `recruiting.signed`).

Detectors take the team (`me`) and its office (`o`), so the season report can keep an office for every team. `checkOffice(s, hook)` defaults to the user's.

To add an achievement:
1. Add a def to `ACHIEVEMENTS` with `id`, `name`, `hint`, `slot`, `on`, `desc` and `find`, plus `levels` for a leveled item.
2. Add a drawer to `DRAW` in `officeArt.ts`. It gets the level and the top level. The tests fail for a def without art, or for art drawn outside its slot at any level.
3. Add a sample to `sampleOffice` and a test in `src/office.test.ts`.

### Rooms
The tier is computed from the user's finished seasons (`TeamYear` rows with `hc === 'YOU'`) and never stored. `office.tier` only records the room the user has already been shown, so a move can be announced.

| Tier | Room | Earned by | Window |
|---|---|---|---|
| 0 | The Broom Closet: cinderblock, folding table, bare bulb, mop bucket | start | none |
| 1 | Position Coach's Office: wood desk, one shelf | a winning season or a bowl win | parking lot |
| 2 | Head Coach's Office: carpet, an accent band in school colors, trophy case | a conference title or 3 bowl wins | practice fields |
| 3 | The Corner Office: paneling, a bigger case, the jersey wall | 2 conference titles or a playoff berth | the stadium |
| 4 | The Suite: dark paneling, 6 jerseys, the largest case | a national title and 5 conference titles | the stadium, lit at night after the regular season |

### Placement
Rooms are centered on the page, standing on its floor, so the closet is a small lit box in the dark.

`layoutOffice` places items deterministically:
1. Each item takes the first free spot of its own kind. Items are sorted by the def's `order` (jerseys by draft pick, so the best picks stay on the wall), then by unlock order.
2. Leftover items try their fallbacks: a trophy goes on a shelf before there's a case, and a jersey hangs as a large frame before there's a jersey wall.
3. Whatever still doesn't fit goes in storage boxes in the corner. Hovering the boxes lists what's in them.

Moving up a room re-flows everything.

## Built
Thresholds sit in `OFFICE` (`achievements.ts`). Levels are the finds each level needs.

Classics, one item each:
| Item | Slot | When |
|---|---|---|
| THE GAME BALL | desk | The first win. |
| CONFERENCE TROPHY | case | Each conference title game won. A gold cup, the year on its plate. |
| NATIONAL CHAMPIONSHIP | case | Each national title. A gold ball on a crystal spire; first in the case. |
| THE BRONZE MAN | shelf | Each Heisman winner. A bronze bust with his name. |
| RING OF HONOR | jersey | Each first-round pick. His framed jersey. |

Leveled:
| Item | Slot | When | Levels | Grows by |
|---|---|---|---|---|
| STOP THE PRESSES | wall-lg | unranked beats ranked by 30+ | 1, 2, 4, 7 | pages stacked behind, then gold |
| GIANT KILLER | wall-lg | beat AP No. 1 | 1, 2, 3, 5 | a helmet per No. 1 (the last three) |
| THE COMEBACK | wall-sm | won from 21+ down | 1, 2, 4 | the frame |
| ICE WATER | wall-sm | a go-ahead FG in the last 0:05 | 1, 2, 4 | a tee per kick |
| AIR SHOW | wall-sm | a passer with 6+ TDs | 1, 3, 5 | more routes on the whiteboard |
| GROUND AND POUND | shelf | 350+ team rushing yards | 1, 3, 6 | a second pair, then bronzed |
| MARATHON | desk | won in 3+ overtimes | 1, 2, 3 | more stopwatches |
| THE BALL RACK | floor | career wins 10, 25, 50, 100, 150, 200, 250, 300 | one per mark | a ball each, white at 100, gold at 200 |
| BOWL TROPHIES | shelf | each bowl win | 1, 3, 6, 10 | bronze, silver, gold, a wreath |
| THE BRACKET | wall-lg | each playoff trip | 1, 2, 4, 6, 10 | a star per trip; the last run in gold |
| PERFECT SEASON | wall-lg | no losses, 10+ wins | 1, 2, 3 | a pennant each |
| HOMEGROWN | wall-lg | a conference or national title with 60%+ in-state starters | 1, 2, 3 | the state poster with a pin per hometown |
| PROVE 'EM WRONG | wall-sm | unranked preseason, top 10 final | 1, 2, 3 | magazines stacked |
| TURNAROUND | wall-sm | 10+ wins after the program's losing season | 1, 2, 3 | the frame |
| THE DOORMAT | floor | 3, 5, 8, 10 straight over a rival | one per mark | stripes, their name, gold fringe |
| THE LONG HAUL | wall-lg | 5, 10, 15, 20, 25 seasons in a row at the school | one per mark | grayer hair, a better frame |
| THE AWARDS WALL | wall-sm | each national award but the Heisman | 1, 3, 6, 10, 20 | a brass plate each, then a ribbon |
| THE COACHING TREE | desk | a former assistant becomes a head coach or coordinator elsewhere | 1, 3, 6, 10 | a bonsai: a leaf each, blossoms for head coaches |
| TO THE LEAGUE | wall-lg | each draft pick | 1, 5, 10, 25, 50, 100 | photos on a corkboard |
| DRAFT NIGHT | wall-sm | 3+ first-rounders in one draft | 1, 2, 3 | the frame |
| FROM NOWHERE | wall-sm | a walk-on drafted, or a 3-star or lower in rounds 1-2 | 1, 2, 4 | letters stacked |
| THE HAT RACK | floor | each five-star signee | 1, 3, 6, 10, 20 | a cap each, then a brass stand |
| HATE MAIL (bad) | desk | lost to a rival by 28+ | 1, 3, 5 | the pile, then a mail bin |
| FOR SALE (bad) | floor | 3 straight losing seasons | 1, 2, 3 | "CHEAP", then "OBO" riders |

Homegrown's state is a blob seeded by its code, not the real outline. Each pin sits at a spot seeded by its town.

## Still to build
- rivalry trophies held (dropped when lost)
- Fire Extinguisher (survived the hot seat): it needs the season's lowest job security, which isn't kept
- Long Haul's statue model at 20 seasons, beyond the portrait

## Rarity
The season report's OFFICE section keeps an office for every team over the portal career, as if each coach were the user, and prints finds per team-season, the share of teams with each item, and how many reached each level. Story items should come a few times a decade for a team. The report flags any that never turn up, or that show up in more than 35% of team-seasons.

First run (5 seasons, 2026-11-09), finds per team-season:
- Rare, a few times a decade or less: Stop the Presses 1 in 86, Giant Killer 1 in 53, the Comeback 1 in 43, Marathon 1 in 43, Homegrown 1 in 86, Prove 'Em Wrong 1 in 86, Turnaround 1 in 138, Perfect Season 1 in 690, Hate Mail 1 in 35.
- Story items that come every few years: Ice Water 1 in 21, Air Show 1 in 14, Ground and Pound 1 in 10.
- Milestones: about 9 items per office after 5 seasons, at most 40. The board, the bowls, the bonsai and the hat rack fill steadily.
- From Nowhere never fired at first: no walk-on or 2-star was drafted (about 2 three-stars a year go in rounds 1-2), so it became a walk-on in any round or a 3-star by round 2. Not rerun since.
- For Sale's 1 in 6 counts CPU teams' bad runs. A real user only gets it for three losing seasons in a row.
- The OFFICE section costs 0.24 s a season for all 138 offices. The rest of the report is unchanged: a 2-season run matched the old one apart from timing.

## Dev
- **Showroom** (dev builds): on the office page, Y toggles the showroom (`sampleOffice`: every achievement, the classics several times over) and `[` `]` step through the rooms. L steps the leveled items' level: the top, mixed, then 1 up. From the console, `game.devOffice(tier, level)` opens it directly, even with no dynasty loaded. The showroom is never saved.
- **Headless screenshots:** the canvas is letterboxed, so send synthetic `mousemove` events in canvas coordinates rather than raw CDP mouse events.

## Flags
- No user job changes exist yet (`config.userTeamId` is fixed). When they do, the office follows the coach: items keep the colors of the school where they were earned, and held items such as rivalry trophies should drop off.
- The toast can cover the bottom of the hub's panels for its 3.2 s.
