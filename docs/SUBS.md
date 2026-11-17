# Substitutions

In a game you play by hand, you can change who's on the field. Uses:
- move receivers between X, Z and the slot
- bring in a backup with a different style (a power back for an elusive one)
- play someone out of position (a halfback at fullback)
- replace a player who's hurt

Changes last for **this game only**. The saved depth chart on the team page doesn't change.

## When you can sub
- **Only in the huddle,** on the play-call screen: normal snaps, the point after, a two-point try and before a kickoff. Once the huddle breaks (presnap, the play, a kick), no subs. That matches the audible rule: an audible keeps the personnel on the field.
- **The clocks keep running** while the panel is open. Take too long and it's a delay of game, which closes the panel. A kickoff has no play clock, so subbing before one is free. Timeouts, when they come, will be the free window.
- **An offensive sub ends the hurry-up for that snap.** When the offense subs, the defense gets time to match, so you can't go no-huddle. H is locked until the snap.
- **Defensive subs start with the CPU's next drive.** Your defense plays the CPU's possessions a whole drive at a time, so defensive changes happen between series, as they would anyway.
- **Re-entry is allowed.** Football has no re-entry rule. A player ruled out for the game (`outForGame`) can't come back.

## The panel (`render/subsScreen.ts`)
U or the **U SUBS** chip opens it. It has three tabs: OFFENSE, DEFENSE and SPECIAL (switch with Q/E or a click).

**Top half:** the side's slots, laid out like a formation. Each shows the slot, jersey number, last name, his overall at that slot, and an orange dot if he's banged up. The PACKAGES row holds the slots that are on the field only in some formations: FB, TE2, WR4, SAM and DIME. A slot changed since the huddle formed is green.

**Bottom half:** everyone who can play the chosen slot, best at the slot first, with each player's position, style (archetype), overall at the slot and health. Tags:
- ON FIELD: he's the one there now.
- IN AT X: SWAP: clicking him trades the two players.
- OUT OF POSITION: he's from a position the depth chart wouldn't put there (dimmed).

A click applies the change at once, with no confirm step, because the clock is running. The play-call tip line then says what changed.

## Who can play where (`game/lineup.ts`)
`SUB_CANDIDATES` is the depth chart's `SLOT_CANDIDATES` plus a few game-day moves:
- RB: an HB, FB or WR
- FB: an FB, HB or TE
- X, Z, SL and WR4: a WR, HB or TE
- TE: a TE, FB or OT

Nobody plays two slots, and nobody plays both ways. A player who is out of position plays with his own ratings, so an HB at fullback blocks like an HB. No new ratings or tuning are involved.

`substitute` puts a player in. If he was already on the field at another slot on the same side, the two swap, when the other man can play that slot. If he can't, the next man up (`nextManUp`) takes the vacated slot.

## How it reaches the game
- `withLineup` (`data/depth.ts`) lays the lineup over the depth chart. Each slot's list starts with its lineup player, and no lineup player appears on another slot's list. So `starters`, `onField` and the engine read the lineup exactly, and nothing new is stored.
- `Game.applyLineup` rebuilds:
  - `userSquad` and `userRoster`, which every snap and kick reads
  - the engine side for the CPU's drives (`userDef`)
  - the box score's on-field players (`liveBox.user.on`)

  The brains keep what they've learned and their pregame read of your roster.
- Box-score credits and key plays carry the player's id (`Credited.id`). A player who was subbed out keeps his earlier plays.

## Grades, XP and injuries
After the game, players are graded from the drive logs over the depth chart (`gradeGame`). The game logs your subs as `DriveLog.subs`, entries of `{ team, from, lineup }`, where `lineup` lists only the slots that differ from the depth chart:
- Your own snaps all go in one log, and each change applies from that log's next play.
- A CPU drive's log carries the lineup your defense played it with.

`gradeGame` grades those snaps with a cast built from that lineup, with benched starters moved off the rotation. It then merges each player's grade across the lineups. Playing time is his snaps over all of the team's snaps at his slot. A game without subs grades exactly as before: there is a test for that.

## For mid-game injuries
`Game.forceSub(id, why)` is the hook:
1. Rules the player out for the game.
2. Puts the next man up in his slot.
3. Shows a notice.

Nothing calls it yet. When in-game injuries arrive, they call it and the user can then adjust the lineup in the panel.

## Not yet
- Timeouts, which would give a free window to sub.
- The CPU making its own subs. Its injuries can use `nextManUp`.
- Kick and punt returners as slots.
- A SAVE TO DEPTH CHART button.
