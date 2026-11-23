import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildStaff } from './data/coaches';
import { buildSquad } from './data/depth';
import { teamById } from './data/teams';
import { REEL, REEL_GAMES, type ReelClip, type ReelFile, type ReelKind } from './data/titleReel';
import { mulberry32 } from './engine/math';
import type { EngineSnap } from './game/engineDrive';
import { encodeClip, rivalryName } from './game/titleReel';
import { tapeLength } from './game/tape';
import { engineGame, isEngineSnap, type SnapWatch } from './season/engineGame';

/**
 * `npm run reel`: the title screen's highlight reel. Each rivalry in `REEL_GAMES` plays a few engine games on
 * tape; the biggest snaps (touchdowns, picks, long gains) are kept and written to public/title/reel.json.
 * Commit the file. REEL_SEED moves every game's seed.
 */

/** What a snap shows, and how much it belongs on the reel (0: not at all). */
function judge(s: EngineSnap): { kind: ReelKind; score: number } | null {
  if (s.type === 'pick6') return { kind: 'pick6', score: 6 };
  if (s.type === 'td' && s.pass && s.complete) return { kind: 'passTd', score: 5 + Math.min(s.air, 50) / 20 };
  if (s.type === 'td' && !s.pass && s.gain >= 15) return { kind: 'runTd', score: 4.5 + s.gain / 30 };
  if (s.type === 'int') return { kind: 'int', score: 4 + Math.min(s.air, 40) / 40 };
  if (s.pass && s.complete && s.gain >= 30) return { kind: 'bigCatch', score: 3 + s.gain / 40 };
  if (!s.pass && s.gain >= 25) return { kind: 'longRun', score: 3 + s.gain / 40 };
  return null;
}

const school = (id: string) => teamById(id).school.toUpperCase();

it.runIf(process.env.npm_lifecycle_event === 'reel')('title reel', () => {
  const seed0 = Number(process.env.REEL_SEED ?? 1);
  const side = (id: string) => {
    const t = teamById(id);
    const st = buildStaff(t);
    return { squad: buildSquad(t), oc: st.OC, dc: st.DC, passShare: 0.5 };
  };
  const clips: ReelClip[] = [];
  const lines: string[] = [];
  REEL_GAMES.forEach(({ home, away }, gi) => {
    type Cand = { snap: EngineSnap; kind: ReelKind; score: number; game: number; off: string };
    const cands: Cand[] = [];
    for (let k = 0; k < REEL.games; k++) {
      const watch: SnapWatch = new Map();
      engineGame(side(home), side(away), mulberry32(seed0 * 1000 + gi * 17 + k), { watch, record: true });
      for (const s of watch.values()) {
        if (!isEngineSnap(s) || !s.tape?.frames.length || tapeLength(s.tape) > REEL.maxSecs) continue;
        const j = judge(s);
        if (j) cands.push({ snap: s, ...j, game: k, off: s.tape.cast[0].uniform.key });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    const kept: Cand[] = [];
    for (let n = 0; n < REEL.clips; n++) {
      // Another kind of play than those kept, from another game; the other team's ball is worth a point.
      const best = cands
        .filter((c) => !kept.some((q) => q.kind === c.kind || q.game === c.game))
        .map((c) => ({ c, s: c.score + (kept.some((q) => q.off !== c.off) || !kept.length ? 0 : 1) }))
        .sort((a, b) => b.s - a.s)[0]?.c;
      if (!best) break;
      kept.push(best);
    }
    const title = rivalryName(home, away);
    for (const c of kept) {
      const off = c.off.endsWith('-h') ? home : away;
      const what = { passTd: 'TD PASS', runTd: 'TD RUN', pick6: 'PICK SIX', int: 'INTERCEPTION', bigCatch: `${c.snap.gain}-YD CATCH`, longRun: `${c.snap.gain}-YD RUN` }[c.kind];
      const name = `${title}  ${school(home)} VS ${school(away)}  ${what}`;
      clips.push(encodeClip(c.snap.tape!, home, away, name, c.kind));
      lines.push(`${home.padEnd(16)} ${away.padEnd(16)} ${c.kind.padEnd(9)} off ${off.padEnd(16)} gain ${String(c.snap.gain).padStart(3)}  ${tapeLength(c.snap.tape!).toFixed(1)} s`);
    }
    if (kept.length < REEL.clips) lines.push(`${home} vs ${away}: only ${kept.length} clip(s) of ${cands.length} candidates`);
  });
  const file: ReelFile = { fps: REEL.fps, scale: REEL.scale, clips };
  const json = JSON.stringify(file);
  mkdirSync('public/title', { recursive: true });
  writeFileSync('public/title/reel.json', json);
  lines.push(`${clips.length} clips, ${(json.length / 1024).toFixed(0)} KB`);
  writeFileSync('reel.txt', lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}, 3_600_000);
