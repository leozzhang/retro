# Careers

A player's history across seasons and teams: a row for each finished season, plus a story made of the moments that shaped it. The code is in `season/career.ts` and the PLAYER REGISTRY (the REGISTRY tab of every program page, `render/programScreen.ts`) is `render/careerScreen.ts`.

## The separation rule
Gameplay state is what a player **is**: `TeamState.progress` (XP, levels, rating changes, confidence, sparks, promises), morale and health. The sim reads all of it.

A career is what he **did**. It lives in `SeasonState.careers`, keyed by athlete id, so it follows him through a transfer. Nothing in the sim reads it, and it draws no randomness: adding it left `npm run season` byte-identical apart from the timing lines.

The career store reads gameplay state at two points:
- the end of every week (the `story` step, after `results`)
- the end of the season (`archiveSeason`, which runs when the phase becomes `complete`)

The portal also writes story lines when players enter, transfer, return or leave.

There is one place where the two meet. The team page's **SZN** column (`seasonGain`) shows his all-time change in `Progress.d` minus the gains in his earlier archived rows.

## Data (`season/types.ts`)
- `Career.seasons: CareerSeason[]`, oldest first. Each row holds the year, the team, his class (`classLabel`) and his role, with zero counts left out:
  - `role`: `starter` if he started at least half the team's games, `rotation` if he had starts or played in at least half, `reserve` if he played at all, `dnp` otherwise (`CAREER`)
  - `gp` and `gs`
  - `ovr0` and `ovr1`: his overall at the start and end of the season (generated ratings plus the rating changes up to that point)
  - `d` and `lvl`: the season's rating gains and level-ups
  - `st`: box-score totals
- `Career.story: StoryEvent[]`, oldest first. Each line has a year, a week (no week means the offseason after that year), a team, a kind and its text. The text is written when the event happens, because names and rosters change later. A transfer also records `from`.
- `Career.now`: this season's games played and starts. It's cleared at the archive. These are the career store's own counts, separate from `Progress.gs`.

The current season's row is never stored. `liveSeason` builds it on demand until the archive.

## Story lines
| Kind | When |
| --- | --- |
| `start` | A player's first start of a season, when it means something: opening his first tracked season as the starter, a first start, a first career start, or winning the job at the opener after a season that wasn't as the starter |
| `spark` | A next-man-up spark, naming who he replaced and why (`ConfEvent.rep`) |
| `bench` | The user's chart benched him while he was in form |
| `breakout` | A breakout: his new dev trait and its gains |
| `breakthrough` | A big level-up (not one that a breakout already told) |
| `injury` | Out `CAREER.injuryWeeks` (2) or more weeks, or for the season |
| `award` | Winner or finalist (the top 3) of each award |
| `portal` | Entered the portal, came back to his school, or had no offer he liked |
| `transfer` | Signed with a new school |
| `left` | Left FBS |
| `redshirt` | Took a redshirt year (4 or fewer games as a true freshman, or a season-ending injury) |
| `graduated` | Out of eligibility |
| `declared` | Declared early for the NFL draft |
| `drafted` | Drafted (round, pick and city), or an early entrant who went undrafted |

`headline` sums up a career in up to two phrases: a transfer, a breakout (from the bench if he wasn't a starter before it), next man up, N-year starter, or waiting his turn.

## Size
A season adds about 1.9–2.4 MB of JSON, about 230 KB gzipped. Every player on every roster gets a row, so a transfer always arrives with his history. Saves are gzipped (`engine/storage.ts`), so ten seasons is about 2.5 MB on disk. If saves start to drag, the first thing to trim is the `dnp` rows of non-user players.

Older saves with no `careers` show all-time gains in SZN until their first archive.

## Not built yet
- A league-wide player search. (The user's program records, career leaders and former players are built: see docs/ALUMNI.md.)
- **Size with departures:** graduated players' careers are kept, and redshirt and graduation lines add up, so a 5-season career runs about 2.9 MB of JSON a season (from about 2.0). Trimming `dnp` rows and non-user redshirt lines are the first levers.
- Live games record no box scores, so the user's played games add games and starts but no stats.
- Box-score credit goes to starters only (SEASON.md), so backups' stat lines are thin.
- No defensive stats exist, so defenders' stories are made of starts, sparks, injuries and growth.
