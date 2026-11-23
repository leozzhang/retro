# Audio

The music, the sound effects and the stadium crowd. All of it is display only: no audio code touches game state or the season RNG. Without Web Audio (Node: the tests and the headless reports) every call is a no-op.

## Files
- Music is in `public/audio/music/`, the effects and crowd are in `public/audio/sfx/`. Vite serves `public/` in dev and copies it into `dist/`, so the desktop app gets it too.
- The manifest is `src/data/audio.ts`. It holds `THEME`, `PLAYLIST`, `SFX`, `CROWD_FILES`, the knobs `MUSIC` and `CROWD`, and `CREDITS`.
- To swap a sound, drop a file into `public/audio/sfx/` and point its `SFX` entry at it. Any synth entry (`synth: ...`) can be replaced by `files: [...]` the same way.
- The original download folders in the repo root are gitignored. Only the copies under `public/` ship.

## Code
| File | Role |
|---|---|
| `engine/audio.ts` | One AudioContext. Buses master → music, sfx, crowd, ui. The volume prefs (`audio` storage key, global, 0–10 each), unlocking, and a decoded-buffer cache. |
| `engine/music.ts` | The music director: `music.setMode('theme' \| 'hub' \| 'playlist' \| 'silent')`, then `music.update()` once a step. |
| `engine/sfx.ts` | `sfx(id, {gain, rate, pan, delay})`. File variants with pitch jitter, and the synths: whistle, throw whoosh, card swipe, kick thump, hike. |
| `game/crowd.ts` | The stadium: a looping bed and the reactions laid on top of it (roar, cheer, chant, hush). |
| `game/sounds.ts` | `fieldSounds`: watches the `Play` or `KickPlay` on screen from outside and plays what changed. |
| `game/game.ts` `sounds()` | Each step: the music mode, the stadium on or off, which play to watch, the final's stinger, office toasts, and menu clicks. |

`Play` and `KickPlay` themselves make no sound and carry no audio hooks. They run headless in the reports, engine drives and simulated games, so the sound is read off their public state: `phase`, `thrown`, `handedOff`, `popups`, `carrier`, `outcome`. The balance rows cannot change.

## Music
- **Theme:** "I've Got Your Back!". It plays the intro once, then the main loop, gaplessly, on the menus: title, exhibition, roster, save slots, new dynasty, and the SOUND page opened from the title.
- **Hub (every other screen off the field):** if the theme is playing, it plays to the end of its current loop and then fades into the playlist. Otherwise the playlist plays. Practically, the theme follows you into the hub once and comes back only from the title.
- **Playlist:** 30 ansimuz tracks (Action 1, Action 2, Adventure). Each pick is uniformly random among tracks not in the last `MUSIC.noRepeat` (12) played. Tracks crossfade. Each track streams through an `<audio>` element, so the whole playlist is never decoded at once.
- **The field (call, play, kick, notice, final):** the music fades out and only the crowd and the effects play. The paused track resumes where it stopped after the game. Going back to the menus drops it instead.
- **Autoplay:** the desktop app sets `autoplayPolicy: 'no-user-gesture-required'`, so the theme plays at boot. A browser waits for the first key or click, and `Input` calls `unlockAudio()` on each one.
- **Dev:** `music.next()` skips a track and `music.history()` lists the shuffle (`window.music`).

## Sound effects
### Menus
These play in `Game.sounds()` on every screen except play, kick and the wrap:
- Esc or Backspace: `back`
- Enter, Space, or a digit: `select`
- a click: `select`, but only when it hits something. Each hit test (`inRect`, `inBox`, and the screens' `...At` lookups wrapped by `tracked`) reports to `engine/clicks.ts`. A click also counts when it changed the screen, or on the screens where a click anywhere goes on (notice, final, roster). A click on nothing is silent.
- arrows, WASD, Q/E, Tab: `nav`
- the mouse wheel: `scroll`
- a hotkey that changed the screen: `select`
- the mouse moving onto a link: `hover`

### Explicit
- **The wrap (storylines):** advancing a card plays `swipe`. Finishing a card's animation plays `nav`, closing plays `select`, and a decision taken plays `jingleDecide`.
- **SOUND page:** each volume step plays `toggle`.
- **Office toasts:** `jingleUnlock`.
- **The final:** `jingleWin` or `jingleLoss`.

### Field event map (`game/sounds.ts`)
| What changed | Sound |
|---|---|
| presnap → snap | `hike`; the crowd bed settles |
| `thrown` | `throw` whoosh, pitched by ball speed; softer on a pitch |
| `handedOff` | a soft `catch` |
| popups CATCH!, IN STRIDE!, FINGERTIPS!, DIVING CATCH! (plus `ground`) | `catch` |
| TIPPED! | a high `hitLight` |
| BROKEN TACKLE!, SPUN OUT! | `hit` and a cheer |
| MADE HIM MISS! | a low whoosh |
| OFFSIDE | `whistle` |
| carrier `CROWD.bigYards` past the line | a roar while he's still running |
| outcome tackle | hit, heavy/medium/light by the carrier's speed, then `whistle`; a cheer or roar by yards, or a home hush for a loss |
| outcome sack | `hitHeavy`, `ground`, `whistle`, reaction against the offense |
| outcome incomplete | `ground`, `whistle` |
| outcome td | `jingleTd`, `whistleLong`, roar |
| outcome int / fumble | `jingleTurnover`, `whistle`, reaction against the offense |
| kick → flight | `kick` and `kickThump` |
| kick → return | `catch` |
| DOINK! | `doink` (metal) |
| BLOCKED! | `hitHeavy` |
| fg/xp good | `jingleFg` and a cheer (a roar for a field goal) |
| miss | `jingleMiss` |
| return TD | `jingleTd` and a roar |

### Crowd
- **The bed:** a 16 s slice of Quendel's ambience, looped. It sits at `CROWD.bed`, rises to `bigDown` before a 3rd or 4th down, an FG or a kickoff, and drops to `hush` for `hushHold` seconds when the home team is hurt.
- **Reactions:** a roar or a cheer, from slices of the cheering recordings. The home crowd reacts at full strength. When the visitors do something good, the visiting fans cheer at `awayShare` and the home crowd hushes. `userHome` comes from `Game.homeId`; on a show, `userBall` comes from the KeyShow.
- **There is no groan recording yet.** A home team's bad play is the hush.

## Sources and licenses
| What | Source | License |
|---|---|---|
| Theme "I've Got Your Back!" | Bert Cole, 16-Bit Starter Pack, bitbybitsound.com | Credit required ("Music composed by Bert Cole" plus a link). No resale and no derivative works. Shown under the title's SETTINGS → CREDITS. |
| Playlist | Luis Zuno (ansimuz), Action Pack 1 and 2, Adventure Pack 1 | Free for any use. Credit appreciated and given. |
| Crowd | Gregor Quendel, Free Crowd Cheering Sounds, opengameart.org/content/free-crowd-cheering-sounds | CC-BY 4.0, credited. |
| UI, impacts, jingles | Kenney: Interface Sounds, UI Audio, Impact Sounds, Music Jingles (kenney.nl) | CC0 |
| Whistle, whooshes, swipe, thump, hike | Synthesized in `engine/sfx.ts` | ours |

Files picked from the Kenney packs:
- `ui-*`: from Interface Sounds (tick, select, back, toggle, error, confirmation, pluck, scroll, drop) and UI Audio (rollover).
- `hit-*`: impactPunch_heavy, impactSoft_heavy, impactSoft_medium.
- `catch-*`: impactGeneric_light.
- `kick-*`: impactPunch_medium.
- `ground-*`: footstep_grass.
- `doink`: impactMetal_heavy.
- `jingle-*`: the 8-bit (NES) jingles. They were chosen by pitch contour: rising for td (14), fg (03), win (12), unlock (09) and decide (16); falling for loss (11), miss (04) and turnover (07). They were not chosen by ear, so swap any that don't fit.

Possible upgrades: a crowd groan, a real referee whistle, and pad pops. Freesound.org has CC0 recordings of all three, but downloads need an account.
