# Passing: eyes on the ball and throw types

Two connected systems for the passing game:
- **Eyes and finding the ball.** Who is looking at the QB when he throws, and how soon each player locates the ball. This applies on both sides of the ball.
- **Throw types.** BULLET, TOUCH or LOB. Each one trades how fast the ball gets there against how far it clears the defenders between the QB and the receiver.

Throw type and eyes are one mechanic. Flight time decides how much a late look costs. A bullet beats a defender who has to find the ball, but it also beats a receiver who hasn't turned his head yet.

## Eyes (`Player.eyes`, `eyesOf` in sim/ai.ts)
`eyes` is 0..1: how much the player has the QB in view. It's computed every step.

**Receivers** turn their head to the QB at a point on their route:
- `RouteDef.look` is the waypoint index past which he looks. The default is 1, out of the first break.
- `look: 0` means he looks from the start: swing, bubble, tunnel, screen, check-flat.
- `lookDepth` is used for straight-line routes. Go and seam routes look back only about 12 yards downfield.
- Settle routes (curl, hitch, comeback, smoke) use `facingQB`, the existing squared-up turn. It still adds `set`'s small bonus on top.
- Once he passes his look point, `eyes` ramps from 0 to 1 over `turnTime` (faster with `rte`).

**Defenders:**
- 1 (facing the QB): zones, spies, rushers, and a man defender whose man stayed in to block
- `FIND.backpedal` (0.8): a man defender who hasn't turned yet
- `FIND.lbMan` (0.7): a backer in man
- 0: a man defender trailing with his back turned

## Finding the ball (`findAt`, `FIND` in sim/ai.ts)
At the throw, each player's `eyes` becomes `findAt`, the moment he locates the ball.

- **Receiver** (`receiverFind`):
  - looking at the QB, he sees the ball leave the hand (`findAt` = the throw)
  - with his head still downfield, up to `FIND.blind` (0.6 s) later, less with `cth`
  - if his head comes around while the ball is in the air (his look point arrives mid-flight), he finds it `FIND.base` after that
  - the receiver the ball is meant for keeps running his route until `findAt`, and only then adjusts to the ball
- **Defender:**
  - facing the QB, he breaks on the throw after his reaction (`zcv` or `mcv`, and the leans)
  - trailing, he finds the ball at `FIND.trail` (60%) of the flight, but no sooner than `FIND.trailLeft` (0.8 s) before it comes down: on a long ball he plays the receiver's hands
  - in between, the two are blended by his `eyes`

**Readiness** (`readyAt`): how much of a look he got before the ball arrived, `(arrival − findAt) / FIND.settle`, from 0 to 1. It feeds `catchOdds` as `Contender.ready` (`READY`, sim/catching.ts):
- A receiver who never found the ball keeps `READY.hands` (half) of his open-catch odds and half of his contest share. The ball hits him in the back or the helmet.
- A defender who never found it can still get a body on it (`READY.dContest`), but he can't intercept it.

## Throw types (`THROWS` in sim/ball.ts)
Each type sets the ball's speed, arc, range, error, pressure sensitivity and catch radius:

| | BULLET | TOUCH | LOB |
|---|---|---|---|
| Speed (× the arm's) | 1.4 (`kindSpeed`: all of it from a 90 arm, 40% of the extra at 60) | 1 | 0.78 |
| Arc height | 0.3× | 1× (the old single arc, exactly) | 1.6× |
| Range | 55% of max | full | full |
| Error, short → deep | 1.25 → 1.6× | 1× | 1.3 → 1.05× |
| Pressure error | 1.5× | 1× | 1.2× |
| Catch radius (both sides) | 0.8× | 1× | 1.15× |

**Hot balls** (`hotness`, `HOT`). A bullet is hard to hang on to, which comes off the receiver's hands (`READY.hot`, eased by `cth`):
- short: hot out to 18 yards, more with a big arm
- deep (from 20 yards): a rope coming over his shoulder instead of dropping in

**Tips in flight** (`Play.inFlight`, `TIP` in game/playState.ts). On its way to the target, a pass can be tipped by a defender who meets all of these:
- he's reading the QB (`eyes`)
- he's within `TIP.width` (0.75 yd) of the ball
- the ball is under his reach (DL 2.8, LB 2.9, DB 3.0 yd)

Odds go up to `TIP.odds` (0.35), scaled by how close he is, how far below his reach the ball is, his `cth` and `prc`, and his eyes. A lineman still on his block bats balls at `TIP.engaged` of that. What happens to a tipped ball:
- an unblocked tipper catches `TIP.pick` × `cth` of them (a pick)
- the rest pop up `TIP.pop` yards on as a free ball for anyone near it

Nothing within `TIP.clear` of the target counts; that's the catch itself. A bullet is low the whole way, so a hook or robber defender in the lane can tip it. A touch pass clears linebackers past about 8 yards. A lob clears everyone.

**Input:** before or while aiming, the mouse wheel steps the type (up = more loft) and `1` cycles it (for trackpads). It resets to TOUCH every snap. The arc preview draws the chosen type's arc, and its name sits by the reticle while aiming.

**CPU QB** (`cpuThrowKind`, `CPU_THROW`; replays and the harness's AUTO rows):
- LOB past 30 yards
- over a reading defender under the bullet's line: TOUCH, or LOB if he'd get a hand on TOUCH too
- BULLET into a tight window (a defender within 2.5 yd) inside 24 yards
- TOUCH otherwise

`cpuAim` leads the receiver by the old touch lead (distance / 22 s) scaled by the type's flight time. The balance rows were tuned with that lead, which is short of the ball's real flight time. Leading by the real flight time adds about 3 YPP to every pass row.

## Animation (render/renderer.ts `lookOf`, render/sprites.ts `Look`)
Nothing new on the HUD. It's all in the players:
- A route runner's helmet turns back over his shoulder toward the QB once he's looking (`eyes` > 0.5, running away from the QB).
- Anyone who has found a ball coming down within 5 yards of him puts both hands up: out in front, or back over his head for one coming over his shoulder.
- A receiver the ball's thrown to before he looks keeps running head down: he never saw it.
- Defenders reading the QB face the backfield (a backpedal or a shuffle) until they break on a throw. Trailing man defenders face downfield with their backs to the QB.
- The F1 debug overlay is unchanged.

## Measured (`npm run balance`, THROW section)
The THROW rows throw each type to one route against the man and the zone calls. ON TIME is 0.3 s out of his break. EARLY is the moment he plants, before his head is around.
- **Throwing before the head comes around costs a lot.** Drag EARLY: 17–21% of bullets and touch passes find him ready (a lob, 71%), against 99–100% ON TIME. Early bullets to the in, quick out and curl complete 40–51%, against 66–84% on time.
- **BULLET:** best on quick throws through clean lanes (flat 84–92%, quick out vs man 78%, curl vs man 84%). It gets tipped 2–12% of the time on slants, ins and curls, and it's worse deep against zone (go 36%, against 66% for a LOB).
- **LOB:** best over the top against zone (go: 66% complete, 31 yards per throw). Poor on anything short.
- **TOUCH:** the middle. About equal to BULLET on curls and drags against zone, better than BULLET deep against zone.
- **Flag:** BULLET still edges TOUCH on most short and intermediate routes when the lane is clean. The harness picks receivers by separation, not by lane, so it under-counts tips.
