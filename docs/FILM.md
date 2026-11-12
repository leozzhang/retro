# The film room

`npm run film` plays every play in the library against every defensive call, headless on the reference matchup, and writes two files (both gitignored):
- `film.txt`: the report.
- `film.json`: the table (`FilmTable` in `src/film.ts`).

It has two jobs:
1. **A balancing tool for new plays.** Each play gets a row against all 13 calls, and the report flags plays that beat every call or none, and calls that no play beats. Run it after every playbook batch.
2. **The table the ML defense will learn from** (DEFENSE.md, Hooks): the expected success of each call against each play, with a backoff by play family. Nothing in the game reads it yet.

## How it's measured (`src/film.ts`)
- **Rows are plays.** An RPO is two rows, the give and the pull (`filmRows`). Each row records:
  - its traits (`playTraits`)
  - its hand tags: family, concept and `beats` ([PLAYBOOKS.md](PLAYBOOKS.md))
  - the style books it's in, plus `legacy` for the original 62
  - its feature vector (`featureVector`)
  - its look (`lookOf`: personnel and formation)
  - the down it's measured on: short-yardage plays on 3rd and 1, the rest on 1st and 10
- **Columns are calls,** plus tagged variants where a tag changes the call:
  - the RPO pass-first tag (`+rpo`) on pulls against zone calls
  - the spy (`+spy`) on QB runs against calls with a `spyFrom`
- **Each cell is `FILM.reps` (80) snaps from the 35** on the harness's auto-players:
  - a run: `H.runRep`
  - an RPO: `H.rpoRep`, which hands off, or pulls and throws the tagged route at 1.3 s
  - a pass: `H.passRep` with the CPU's throw type at 1.2 s (quick game and screens) or 2.2 s (`holdFor`). The QB **reads high to low** (`pick: 'read'`, `H.READ`): the deepest receiver with 2.5 yd of separation, else the most open, the checkdown.
    - The balance report's QB throws to the most open man, and that's nearly always the back's checkdown or a flat. Against Cover 2, Smash went to the RB's flat on all 120 throws and never to the corner.
    - So the film QB reads, or every concept check would measure the checkdown. The balance report keeps the old pick, so its baseline doesn't move.
- **Hot throws:** against `FILM.hotAt` (6) or more rushers, every pass is thrown at `hotHold` (1.2 s). Without it the auto-QB holds the ball 2.2 s into Cover 0, which then "stops" every pass (22% success, 40% negative plays) and hides every other answer.
- **Stats per cell:** success (`successful`, on the row's down and distance), yards a play, explosives (15+ yd), negatives (a loss, a sack or a turnover), sacks.
- **Throws per cell** (`FilmCell.tgt`, keyed `<slot>:<route>`): targets, catches, yards, air yards, YAC, INTs, and the separation and QB pressure at the throw. EXPLAIN and ROUTES read them.
- **Stable seeds:** each cell has its own seed from its row and column ids, so adding a play or a call never moves another cell. A cell is about ±6 points of success at 80 snaps.

## The report
- **SUCCESS and YARDS PER PLAY grids:** a row per play and a column per call, then the mean over the regular calls, the call that stops it best, and the call it beats most.
- **CALLS:** each call's mean over the book, and the three plays that beat it most.
- **FAMILIES:** success by play trait against each call. The in-game model's backoff will use this.
- **TAGS:** cells where a tag moves success 10+ points.
- **BEATS** (`beatsChecks`): the realism check on every `beats` tag. A play tagged to beat a look should do better against the calls showing it than its peers do (passes against passes, runs against runs), each relative to its own mean.
  - `TAG MISS`: the play does at least `beatsSlack` (3 points) worse than its peers there. The bar widens by 2 standard errors of the cells it rests on, so a look shown by one call (Cover 4, Cover 0) isn't flagged on noise.
  - `TAG EXTRA`: it does 12+ points better against a look it isn't tagged for.
  - RPO gives aren't checked, and `press` can't be (it's the identity's, not a call's).
- **ROUTES:** every throw by route against the NFL's catch rate and yards a target. The film QB throws only to an open man, so deep routes run high there. The balance report's ROUTE rows throw every route and are the fair comparison.
- **BOOKS:** each built style book against each call, and its families.
  - `BOOK HOLE`: a call nothing in the book reaches 50% against.
  - `BOOK FAMILY`: a family that beats every call.
- **FLAGS** (regular calls only, not tuned, for a person to look at):
  - `BEATS EVERY CALL`: no regular call holds the play under `beatsAll` (45%), or under `beatsAllShort` (75%) for a short-yardage play.
  - `BEATS NO CALL`: the play reaches `beatsNone` (30%) against no call.
  - `NO ANSWER`: a call that no play reaches `noAnswer` (50%) against.

## Diagnosing a play
- **`FILM_EXPLAIN=slant-flat,rpo-stick`** adds a section per play. For each column it shows success, yards and sacks, plus the top three targets. Each target is listed as slot:route with:
  - share of the throws
  - catch %
  - yards a target
  - air yards and YAC a catch
  - separation and pressure at the throw

  Then it totals each target over the regular calls against the NFL route rate. That shows *why* a play wins: which receiver, which route, and whether it's the catch or the run after it.
- **`FILM_BASE=film.base.json`** diffs against a saved table (`cp film.json film.base.json`). It lists cells that moved 10+ points and rows whose mean moved 3+, a before and after for each fix or batch.
- To dig further, trace one rep headless: `H.newPlay`, `play.snap()`, step it and print positions (see PROGRESS.md for the Cover 2 corner found that way).

**Options:**
- `FILM_ONLY=id,kind` limits the plays (for example `FILM_ONLY=pass` or `FILM_ONLY=rpo-glance,smash`)
- `FILM_REPS` sets the snaps a cell
- `FILM_OUT` and `FILM_JSON` set the output paths

The whole library (98 plays, 111 rows) takes about 2 minutes.

## Batch 6, with the reading QB (2026-11-11)
**Book means:** Spread RPO 54%, Pro Style 58%, Legacy 56%.

**The beats check:** 113 of 144 tags hold.

**Where the misses cluster:**
- Out and hitch concepts against Cover 3 (Trips Outs, Empty Spacing, Go Out, RPO Stick's pull)
- Dagger and PA Dig against Cover 4
- gap runs against a light box (Power, Heavy Power)

**Fixed while diagnosing:**
- **The Cover 2 corner chased #1's slant 9 yd inside his flat** and left the flat empty, so a flat against Cover 2 or Tampa 2 averaged 21.5 YAC. A flat defender now follows inside only `FLAT_INSIDE` (3 yd) past his landmark and squats (`zoneCover`, sim/ai.ts). Slant Flat against Cover 2 now goes to the slant behind the corner (10.5 ypp, 3 YAC).
- **The film QB threw the checkdown** (see "How it's measured"). It now reads high to low.
- **Ace Wing Counter never handed off,** because the gun counter path never reaches an under-center mesh. It now uses the under-center downhill path: 42%, 6.1 ypp.

**Fixed on 2026-11-12** (PASSING.md, "After the catch"): deep YAC is down to 10–14 and short-route YAC is near NFL, and Trips Outs runs its outs from #2 and #3. Now:
- 115 of 144 tags hold.
- Six plays still beat every call, four of them by a hair (45–51% at worst): Four Verts, Curl Flat, Double Hitch, Drive, RPO Arrow's pull, QB Sneak.
- The run flags below wait on the run-blocking rework.

**Flags at the time:**
- **Downfield completions run far too long.** This is the big one, and it's game-wide. With a QB who reads, deep routes dominate:
  - go: 65% caught, 30.5 yards a target, 19.4 YAC
  - post: 26.1 yards a target
  - corner: 65% caught, 28.5 yards a target (NFL 42% and 9.7)

  The open catch isn't the problem: deep YAC is about 20 yd. So the plays that beat every call are the vertical ones: Four Verts (80%), Smash, Flood, Y-Cross, Post Wheel, PA Post and the deep-cross PA plays. It's the deep-coverage and pursuit model, not the playbook. The balance report's ROUTE rows, throwing every route, are near NFL catch rates, but their YAC is high too.
- **Slant Flat** (73%, never under 55%) and **Fade Out** (63%+).
- **Power and QB Sneak on 3rd and 1** (78%+ and 94%+, against an FBS 65–70% and NFL sneak 84–87%).
- **Weak plays:** Strong I Toss (14%) and Counter GT (18%).

The first run's numbers (2026-11-11, the most-open QB) are kept in git history.
