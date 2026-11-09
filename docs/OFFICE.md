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

### Hooks
- **`game`**: the week's `office` step, the last of `WEEK_STEPS`. It reads the user's games that week. Ranks at kickoff come from `latestPoll(s, 'ap', g.week)`.
- **`season`**: the same step on the week the season completes, after `history` has its rows.
- **`draft`**: `advanceOffseason` right after `runDepartures` writes the draft.

To add an achievement:
1. Add a def to `ACHIEVEMENTS` with `id`, `name`, `hint`, `slot`, `on`, `desc` and `find`.
2. Add a drawer to `DRAW` in `officeArt.ts`. Items without one show as a "?" crate.
3. Add a test in `src/office.test.ts`.

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

## Built (batch 1)
| Item | Slot | When |
|---|---|---|
| THE GAME BALL | desk | The first win. The ball on a stand. |
| CONFERENCE TROPHY | case | Each conference title game won. A gold cup with the school's ribbon and the year on the plate. |
| STOP THE PRESSES | wall-lg | Unranked beats ranked by `OFFICE.paperMargin` (30)+. A framed front page, "ROUT!", or "BURY!" at 40+. |
| RING OF HONOR | jersey | Each first-round pick. His framed jersey, with name and number. |

## Catalog still to build
Classic:
- bowl trophies (shelf)
- the playoff bracket
- the national championship trophy
- rivalry trophies held (dropped when lost)
- the Heisman bust, and other awards as plaques
- later-round picks on a "To the League" board
- win milestones (50/100/200 career wins): ball racks

Story:
- **Homegrown**: a title won mostly with in-state starters. A state poster with hometown pins.
- **Giant Killer**: beat AP No. 1. The opponent's helmet in a case.
- **The Comeback**: won from 21+ down (from `GamePlay.score`). The scoreboard photo at the low point.
- **Ice Water**: a winning FG in the last 0:05. The tee on a plaque.
- **Perfect Season**: a pennant.
- **Air Show**: 6+ TD passes. The whiteboard play.
- **Ground and Pound**: 350+ rushing yards. Worn cleats.
- **Marathon**: 3+ overtimes. A cracked stopwatch.
- **The Doormat**: beat a rival 5 straight years. A doormat in the rival's colors.
- **Coaching Tree**: a former assistant hired as a head coach. A bonsai with a leaf for each.
- **Hat Rack**: each 5-star signee. His cap.
- **Prove 'Em Wrong**: picked low, finished top 10. A preseason magazine.
- **Draft Night**: 3+ first-rounders in one draft. A draft board.
- **From Nowhere**: a walk-on drafted. A letter.
- **Turnaround**: a losing record the year before, then 10+ wins. Before and after photos.
- **Long Haul**: 10 or 20 seasons at one school. A portrait, then a statue model.

Bad moments:
- **Fire Extinguisher**: survived the hot seat.
- **Hate Mail**: lost to a rival by 28+.
- **FOR SALE Sign**: three straight losing seasons.

Needs new hooks: `signing` (hat rack) and `carousel` (coaching tree).

Planned: an OFFICE section in `npm run season` to set rarity, by counting what each team would earn as if the user coached it. Rare items should come a few times a decade, not every year.

## Dev
- **Showroom** (dev builds): on the office page, Y toggles the showroom (`sampleOffice`, every item several times over) and `[` `]` step through the rooms. From the console, `game.devOffice(tier)` opens it directly, even with no dynasty loaded. The showroom is never saved.
- **Headless screenshots:** the canvas is letterboxed, so send synthetic `mousemove` events in canvas coordinates rather than raw CDP mouse events.

## Flags
- No user job changes exist yet (`config.userTeamId` is fixed). When they do, the office follows the coach: items keep the colors of the school where they were earned, and held items such as rivalry trophies should drop off.
- The toast can cover the bottom of the hub's panels for its 3.2 s.
