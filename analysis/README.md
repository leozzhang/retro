# NFL tracking analysis

These Python scripts read the NFL Big Data Bowl 2027 data (`nfl-big-data-bowl-2027/`, not in git). They check our route geometry and formation splits, and mine route combinations for the playbook. Nothing here touches game code.

## Run
Needs Python 3.11 with pandas, numpy and matplotlib. Run from the repo root and pass the data folder:

```
python analysis/extract_routes.py nfl-big-data-bowl-2027   # ~25 s, one time: tracking -> cache/routes_tracking.pkl
python analysis/route_metrics.py nfl-big-data-bowl-2027    # ~45 s: out/route_metrics.csv, route_summary.csv, plots
python analysis/compare_game.py                            # our ROUTES vs NFL: out/route_compare.md + .png
python analysis/splits.py nfl-big-data-bowl-2027           # alignments: out/splits.md + .png
python analysis/concepts.py nfl-big-data-bowl-2027         # route mix, pairs, results: out/concepts.md
```

| File | What it does |
| --- | --- |
| `nfldata.py` | Loading, LOS, normalizing so the offense always attacks +x, ball y from a tracked center, table helpers |
| `extract_routes.py` | Keeps route runners and the offensive linemen on the same plays, from the snap to 1 s after the throw |
| `route_metrics.py` | Per-route break depth, break angle, leg direction, top depth, depth at the throw, speed |
| `compare_game.py` | Parses `ROUTES` from `src/data/plays.ts` and flags values outside the NFL middle 50% |
| `splits.py` | Sideline distance, split from the ball, and depth at the snap; OL splits |
| `concepts.py` | Route mix by formation and situation, same-side route pairs, results by coverage |

## What's in the data, and its limits
- **About 53k labeled routes from 2023–25 NFL games,** with tracking for 52.9k:
  - `route_ran` labels: GO, HITCH, CROSS, IN, OUT, POST, CORNER, SLANT, FLAT, SCREEN, WHEEL, ANGLE.
  - Each route also comes with its formation, receiver alignment, position, coverage, target, result and separation.
- **Only some players are tracked,** about 1.6 per play, apparently the 2023–25 draft classes. There's no ball, usually no QB, and rarely more than two receivers on a play, so full concepts can't be seen. Same-side route pairs are the best we get (4.7k pairs).
- **No break depth or angle fields exist.** `route_metrics.py` derives them. The break is the point where the heading from the alignment differs most from the heading over the next 5 yd of path, if that difference is at least 15° (posts only turn 15–35°).
  - Release footwork sometimes registers as a break at about 1.5 yd. Medians hold up; lower percentiles of deep routes are affected.
  - Paths are cut 0.3 s after the throw, because after that receivers track the ball or scramble-drill. So hitch and curl come-backs aren't seen.
- **The ball's y is known only when the center is tracked** (6.2k routes). Otherwise "inside" means toward the field center, and receivers within 3 yd of the center are dropped.
- **NFL vs college:** NFL hashes are 23.6 yd from the sideline, college 20. Outside WR sideline distances transfer to college; slot splits are tied to the ball.
- **Too thin to use:** RB routes and run paths (about 300 RB rows), WHEEL (36) and ANGLE (26).

## Findings (first pass, 2026-10-23)

### Route geometry (`out/route_compare.md`, `out/route_compare.png`)
Our routes are mostly in range:
- **In range:** slant (2 yd, 45°), post (12 yd, 23°), corner (12 yd, −31°), hitch (6), curl (12), comeback (15).

Outside the NFL middle 50%:
- **Out:** ours breaks at 10. The NFL median is 6.3, with a 5–6 yd quick-out peak and a 10–15 yd shelf. Our out also breaks dead flat (−88°); NFL outs leave at about −65°, slightly upfield.
  - Suggestion: add a quick out at about 5.5 yd and keep the 10-yd out as the deep version.
- **Dig (IN, 8+ yd):** the depth matches (12 vs 13). Ours runs flat across (88°); NFL digs climb (60°, IQR 41–75°).
  - IN is also bimodal: a 5–6 yd shallow in, plus the 10–14 yd dig.
- **Drag:** the depth is right (2 vs 1.7). Ours runs at 87°; NFL drags climb to about 4–5 yd across the field (73°).
- **Go and seam:** NFL go routes drift outside by about 15° (they stack toward the numbers), while ours run straight up.
- **Flat:** ours starts 2 yd upfield; NFL flats break at about 0.8 yd and gain depth as they go (−68° vs our −77°).
- **Speeds:** NFL route runners peak at about 7.6 yd/s on vertical routes and about 5.7–6.3 on hitches, slants and outs. Median time to the break:

  | Route | Time to break |
  | --- | --- |
  | Slant | 1.6 s |
  | Out | 2.2 s |
  | Dig and post | 2.7 s |

### Splits (`out/splits.md`, `out/splits.png`)
- **Outside WRs:** median about 11.5–14 yd from the sideline (on the numbers), p25 about 10. **Our X and Z are at 6 yd, much wider than the NFL.**
- **Slots:** 18–20 yd from the sideline; 7 yd from the ball to the boundary side, 9 to the field side. **Ours is at 14.**
- **Line and TE:** NFL guards sit at 1.55 from the ball, tackles at 3.1 and inline TEs at 4.9. **Ours are 1.2 / 2.4 / 3.8,** about 25% tighter. That may be fine for sprite readability, but it squeezes the edges.
- **Depth:** WRs on the ball sit at about −1.0, off the ball at about −1.9; slots at about −1.6. This roughly matches ours.
- **Motion:** about 5% of WRs and slots, and 12% of TEs, are in motion at the snap.

### Playbook (`out/concepts.md`)
- **Most common same-side pairs, outer then inner:**

  | Outer | Inner | Share | In our book? |
  | --- | --- | --- | --- |
  | GO | OUT | 5.3% | go-out |
  | HITCH | HITCH | 4.5% | no (double hitch) |
  | GO | GO | 3.8% | verts |
  | GO | POST | 3.3% | no |
  | GO | HITCH | 3.3% | no |
  | IN | CROSS | 3.1% | no |
  | HITCH | GO | 2.8% | comeback-seam |
  | POST | CROSS | 2.8% | post-drag |
  | SLANT | SLANT | 2.5% | no (double slant) |

  **Mesh** (corner over a crosser) ranks 60th and **slant-flat** 37th. Both are real concepts, but rarer as same-side pairs.
- **Route mix depends on formation:**
  - **Singleback and I-Form** (mostly play action): heavy on CROSS (26–30%) and CORNER (12–20%), with TEs running FLAT and CROSS. That's the boot/flood family.
  - **Shotgun WRs:** GO 24%, HITCH 19%, IN 13%.
  - **3rd and short:** more CROSS, SLANT and OUT.
- **Results when targeted:**

  | Route | Comp % | Yd/target | INT % | Note |
  | --- | --- | --- | --- | --- |
  | Screen | 91 | 5.1 | | |
  | Flat | 82 | 5.9 | | |
  | Hitch | 70 | 6.8 | | |
  | Cross | 68 | 8.2 | | |
  | Out | 66 | 6.2 | | |
  | Slant | 66 | 6.9 | | |
  | In | 57 | 8.2 | | |
  | Post | 51 | 13.0 | 6.3 | most yards and most INTs |
  | Corner | 42 | 9.7 | | |
  | Go | 33 | 9.3 | | |

  - Against **Cover 0**, posts average 17.7 yd per target; outs (3.5) and corners (3.8) are poor.
  - These completion rates are a realistic target for our balance harness, which is currently 70–77% across the board.

### How useful is it?
- **Very useful for:**
  - route depth and break angles
  - route timing and speed
  - receiver and OL splits
  - which routes each formation and situation favours
  - per-route completion and yardage targets for tuning
- **Limited for:** full concepts (partial tracking) and anything involving the RB or run game.
- **Not covered yet:** defenders are tracked well (CB, safety, LB). A later pass could measure coverage depths, cushions and zone drops by coverage type, which would feed the planned zone coverages.
