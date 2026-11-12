# Playbooks and OC styles

**Your OC's style fixes your book.** Every OC runs one of five styles. A style is a book of plays, the personnel that book lines up in, and how the style likes to call it. Hiring an OC means hiring his book, so the carousel shows each OC candidate's style and signature plays.

How plays are built (formations, concepts, reads, blocking) is in [PLAYBOOK.md](PLAYBOOK.md). How each play is measured is in [FILM.md](FILM.md).

**Programs by their own OC's style:**

| Style | Programs |
| --- | --- |
| Spread Option | 52 |
| Spread RPO | 46 |
| Pro Style | 26 |
| Air Raid | 13 |
| Power | 1 |

Batch 1 builds the Spread RPO and Pro books (72 programs), and the rest run the legacy book until batch 2. The Spread RPO book has 66 plays and the Pro book 57.

## The library and the books
**The library (`PLAYBOOK`, `src/data/plays.ts`)** holds every play. `LEGACY` is the original 62; batch 6 adds 36 for the Spread RPO and Pro books.

**Style books (`STYLES` in `src/data/offStyles.ts`):** each built style lists its play ids, so a whole book reads in one place.
- A style without a built book (`book: null`) runs `LEGACY` until its batch is built. In batch 1 that's Air Raid, Spread Option and Power.
- `styleBook(style)` returns a style's book.

**An OC's book, `ocBook(coach)`:** his style's book plus 2–3 signature plays from a nearby style's book (`near`, `OC_STYLE.sigMin`/`sigMax`).
- The signature plays are drawn from his id, so no two OCs of a style have quite the same book.
- Short-yardage plays are never signature plays.
- `signatures(coach)` lists them.

**What reads the book:**
- the call screen (`game/game.ts`, `this.book`)
- the playbook page (`render/playbookScreen.ts`, `BookOwner`)
- the staff's play picks on the prep page (`suggest` in `season/scouting.ts`)
- the CPU's key-play replays (`game/replay.ts`, `bookPick`), weighted by the style's `calls` and the situation (`CALL_SITUATION`)

**Stars** are kept for every play in the library (`starred.ts`). A starred play outside your current book is hidden, not lost, so it's back if you hire that style again.

## The OC carries the style
`ocIdentity(coach)` derives his style and scheme from his id. Nothing is stored.
- **A program's own staff** (`<team>-oc`, or any role) runs its profile's style (`styleOfProfile`):
  - `air-raid` → Air Raid
  - `pro` → Pro Style
  - `power-run` → Power
  - `option` → Spread Option
  - `spread` → Spread RPO with a pocket QB, Spread Option with a dual or runner QB
- **A hire from outside FBS** runs the hiring program's style `OC_STYLE.fit` (60%) of the time. Otherwise he brings the style of a program drawn from the league, so a candidate pool has a mix.
- **He keeps his style for life**, like an athlete keeps his id. A position coach promoted to OC runs the style of the program that first hired him.
- **The season sim's pass share** (`autoGamePlan`, `season/staff.ts`) follows the OC's scheme (`SCHEME_PASS`). A program's own OC has its profile's scheme, so the first season is unchanged. After that, a team that hires an Air Raid OC throws more.
- **Where you see it:**
  - the staff tab on the prep page (the OC's row and panel)
  - the carousel's OC card ("RUNS PRO STYLE: 60 PLAYS, PLUS ...")
  - the playbook page's header
  - the scouting report's offense line, which now names their OC's style

## Tags: what the defense will learn from
Every play has hand tags (`PlayDef.tags`, `src/data/playTags.ts`). Next to them are features derived from its data (`playFeatures`, `src/game/playFeatures.ts`).

**`family`** is the coarse key, with 14 values:

| Family | Values |
| --- | --- |
| Pass | quick, dropback, shot, screen, pa, boot, rpo |
| Run | insideZone, outsideZone, gap, perimeter, read, qbRun, draw |

**`concept`** is the named concept, shared across formations: Stick from Trips, from Ace, and from the RPO. It's the learning defense's middle level: play → concept → family → book.

**`beats`** lists the looks coaching literature says the concept attacks:
- coverages: `man`, `press`, `zero`, `cover1`, `cover2`, `cover3`, `quarters`
- fronts: `blitz`, `lightBox`, `heavyBox`

`callCovers` maps each defensive call to these. The film room checks every `beats` tag (`TAG MISS`, FILM.md).

**`stops`** is the other half: the looks that should stop the concept (`STOPS` in `playTags.ts`, by concept, so Smash is beaten by quarters from every formation). `tags()` fills it in; a look can't be in both. The film room checks it the same way (`STOP MISS`), and its SITUATIONS section shows each play's spread between the two (below).

**Features (`playFeatures`):** personnel, formation, backfield (gun, pistol, under center, empty), read, run scheme and direction, pulls, the pass routes and the deepest, quick and deep, screen, PA, RPO, QB run, boot, drop, and the extra blockers.
- `featureVector` is the numeric form, and `FEATURE_KEYS` names its entries, in an order that stays stable.
- Scouting's `playTraits` is now a view over the features, with the same output as before.

**The validation test (`src/playbook.test.ts`)** holds each tag to the data. For example:
- `quick` is a pass with a drop of 1.5 or less and no screen
- `shot` has a 25+ yd route and a drop of 2.5+
- `boot` has `dropY`
- `gap` is gap or trap blocking with a handoff

The test also holds every book to the rules below. **A play can't ship with tags that disagree with what it is.**

## The book rules (tested)
Every style book must have:
- 55–75 plays
- a sneak
- 2+ short-yardage plays
- 3+ screens
- 4+ quick-game plays
- 2+ shots
- 2+ run families
- 4+ plays with a sideline route (for the two-minute drill)

Each built book's personnel shares must also sit inside its style's targets.

## The styles: what makes them real
FBS-wide charting of formations and concepts isn't public. So a style is defined by what the coaching literature agrees on: its core concepts, its personnel, and its pass rate. The film room's `beats` check enforces the concept-against-coverage truths ("smash beats Cover 2").

| Style | Pass share | Personnel (book share) | Core | Built |
| --- | --- | --- | --- | --- |
| Air Raid | 0.62 | 10/11 | Mesh, Four Verts, Double Hitch, Shallow, Y-Stick, Y-Cross, Y-Corner, screens, IZ and the draw | batch 2 |
| Spread RPO | 0.54 | 11 ~90%, 10 and 12 ~5% each | IZ, Duo and Counter with RPO tags (bubble, arrow, glance, stick, slant, pop, fade) from Doubles, Trips, Trey and Wing; quick game; Smash, Dagger, Snag from a Bunch | **batch 1** |
| Spread Option | 0.54 (0.30 for `option` programs) | 11, 20 | zone read, power read, QB counter and power, speed option, RPOs, play action off the read | batch 2 |
| Pro Style | 0.50 | 11 ~53%, 12 ~26%, 21 ~16%, 22 ~5% | wide zone and stretch under center, boots and the naked keeper, the Y-leak, PA dig and deep over, Duo, Counter and Power from the I, toss, quick game under center | **batch 1** |
| Power | 0.40 | 21, 12, 22 heavy | Iso, Power O, Counter, Lead Toss, play action from the I, max protection, the goal line | batch 2 |

**Sources:**
- The Air Raid core: Mumme and Leach. The ~7-concept core is widely described, and the book is small and repped a lot ([Queer Football Breakdowns](https://queerfootballbreakdowns.substack.com/p/what-is-the-air-raid-in-honor-of), [FootballScoop](https://footballscoop.com/news/for-every-play-mike-leach-adds-to-his-playbook-he-takes-one-away)).
- Shanahan's wide zone as the base run, with boots and play action built off it, under center and in 12 and 21 personnel ([The Ringer](https://www.theringer.com/2024/02/07/nfl/super-bowl-preview-kyle-shanahan-offense-evolution-san-francisco-49ers), [West Coast Football](https://westcoastfootball.substack.com/p/49ers-film-room-play-action-sequencing-part-1)).
- RPO packaging: IZ, Duo and Counter with bubble, glance and stick tags ([Viqtory Sports](https://www.viqtorysports.com/spread-offensive-run-plays-complete-guide/)).
- Personnel: StatsBomb found 11 personnel is well over half of snaps at both levels; LSU ran 76% and Clemson 81% in 2019 ([StatsBomb](https://blogarchive.statsbomb.com/articles/football/personnel-usage-diversity-nfl-vs-college-football/), [Rivals](https://uga.rivals.com/news/football-101-offensive-personnel-groups)).
- The pass shares are `SCHEME_PASS`, unchanged.

**What's approximate:**
- Personnel shares are shares of the book, not of snaps. The `calls` weights set how often a family gets called in replays.
- Route shapes for fade, whip, arrow, out-and-up, slip and leak come from coaching texts. The NFL tracking sample in `analysis/` has none of them.
- There's no crack block or option route yet. A crack toss and Y-option wait on those mechanics.

## Balancing: where a play should work, and where it shouldn't
A play is balanced when it works against the looks it's built to beat and fails against the ones that stop it. Its average says little. A play that's good against everything is a cheat, and the learning defense will have nothing to read. A play that's mediocre against everything is filler. The tools, in the order to use them:

1. **SITUATIONS** (`npm run film`): each play's success and yards a play against its `beats` looks, less against its `stops` looks. FLAT means under 10 points and 3 yd a play: it doesn't care what the defense shows, so look at it first. A negative spread (better against the look that should stop it) is a mechanic bug or a wrong tag.
2. **STOP MISS / TAG MISS:** the same, one look at a time, against the play's peers.
3. **`FILM_EXPLAIN=id`:** which receiver and route win each column, with the separation and the catch rate.
4. **`npm run runfit`** for runs: who makes the tackle (by job and by slot), the cutback share, the SHORT section (3rd and 1 against Bear and Goal Line), and the ablations (what each block is worth).
5. **`npm run trace`** (`TRACE_PLAY`, `TRACE_CALL`): one snap step by step. The JOBS line shows every blocker's assignment at the snap. Most run-game bugs this pass showed up there in one look: the wrong man kicked out, a lineman skipping the man over him, a lead turning up outside his backer.

**Lessons from the first two books (2026-11-12), for the next ones:**
- **Fix the mechanic, not the play.** The weak gun counters weren't a counter problem. They were three blocking rules, a timing problem and a missing threat:
  - the kick-out skipped an end head-up on the tight end
  - the gap scheme assigned the man over a guard to the tackle two yards away
  - an uncovered lineman helped playside instead of down
  - the back reached the hole before his pullers
  - nothing held the backside end home for the gun QB's keep

  Each fix moved a family: Power O, Trey Counter, Ace Wing Counter and Duo all moved with them.
- **Read success and yards together.** A shot's checkdown against the coverage that takes the shot away still counts as a 1st-down success. Four Verts against Cover 4 is 63% at 6.6 yd a play; against Cover 3 it's 74% at 44.7. Success alone called that flat.
- **Compare like with like.** Short-yardage plays (3rd and 1) are judged against each other, not against 1st-and-10 runs. A stop look is judged on its plain form: "loses to man" is 2 Man and Cover 1, not Cover 0, where nobody's deep and every route is open.
- **Mind the noise.** A film cell is about ±6 points at 80 snaps. The run ablations need 150+ snaps a call: at 60, Power's hinge read −1.3 yd a carry; at 150 the same code read −0.4.
- **Runs need their timing.** A puller takes about 1.1–1.3 s to reach the hole. A back's path has to arrive after him (the counter step), or the back outruns his blocks and the backer he was meant to meet makes the tackle.
- **The tags can be wrong too.** Play action wasn't stopped by the blitz in our film, and the literature agrees: PA is beaten by two-high safeties who don't bite. Check the source before tuning the sim to match a tag.
- **Known biases to read through** (open, PROGRESS.md):
  - The film QB's deep ball is too good (go and seam caught 55–66% against an NFL 33%). Shots and dropbacks flag at 45–50% "against every call" because of it.
  - Cover 2's underneath loses to the quick game and the screens.
  - Boots fail against Cover 3.
  - Heavy power beats the Bear front.

## Adding a batch
1. Add formations, routes and concepts as data (`plays.ts`, `concepts.ts`). Keep personnel fixed per formation.
2. Add plays to `BATCH_*` in `plays.ts` with tags. Each play's id is its own and stays stable.
3. Put each play in at least one style book (`offStyles.ts`), and flip a style's `book` from `null` when it's built.
4. Run `npm test`: the validation test holds the tags and the book rules.
5. Run `npm run film` and read SITUATIONS first, then FLAGS, `TAG MISS`/`STOP MISS`, BOOKS and ROUTES, with `FILM_EXPLAIN` on anything flagged (and `npm run runfit` / `npm run trace` for runs). A new concept gets its `STOPS` entry. Save a baseline (`cp film.json film.base.json`) and diff later runs with `FILM_BASE=film.base.json`.
6. Run `npm run balance`. The aggregate rows run over `LEGACY` and must not move. New plays get their own per-play rows, and each built book gets BOOK rows.
