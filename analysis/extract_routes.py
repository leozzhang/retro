"""One-time pass over the tracking CSVs: keep only route runners (and the
offensive linemen tracked on the same plays), from the snap to just after
the throw. Writes analysis/cache/routes_tracking.pkl.

    python analysis/extract_routes.py nfl-big-data-bowl-2027
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd

from nfldata import CACHE, OL, data_dir_arg, load_player_play, normalize

AFTER_THROW = 1.0  # seconds kept after pass_forward
MAX_WINDOW = 5.0  # seconds kept after the snap at most
TRACK_COLS = ["game_id", "play_id", "nfl_id", "time", "x", "y", "s", "a", "o", "dir", "event"]


def key(g, p, n):
    return (np.asarray(g, dtype=np.int64) * 10000 + np.asarray(p, dtype=np.int64)) * 100000 + np.asarray(n, dtype=np.int64)


def main():
    data = data_dir_arg()
    CACHE.mkdir(exist_ok=True)
    pp = load_player_play(data)
    runners = pp[pp.route_ran.notna()]
    route_plays = runners[["game_id", "play_id"]].drop_duplicates()
    linemen = pp[pp.on_offense & pp.lined_up_position.isin(OL)].merge(route_plays)
    keep = pd.concat([runners, linemen])
    keys = set(key(keep.game_id, keep.play_id, keep.nfl_id).tolist())
    print(f"route rows {len(runners)}, linemen on those plays {len(linemen)}")

    frames = []
    for f in sorted(data.glob("game_tracking_*.csv")):
        t0 = time.time()
        n = 0
        for chunk in pd.read_csv(f, usecols=TRACK_COLS, chunksize=4_000_000):
            k = key(chunk.game_id, chunk.play_id, chunk.nfl_id)
            frames.append(chunk[pd.Series(k).isin(keys).to_numpy()])
            n += len(chunk)
        print(f"{f.name}: {n} rows scanned in {time.time() - t0:.0f}s")
    t = pd.concat(frames, ignore_index=True)
    t["time"] = pd.to_datetime(t.time)

    # Window: snap .. min(pass_forward + AFTER_THROW, snap + MAX_WINDOW), per player-play.
    grp = ["game_id", "play_id", "nfl_id"]
    snap = t[t.event.isin(["ball_snap", "snap_direct"])].groupby(grp).time.min().rename("t_snap")
    fwd = t[t.event.isin(["pass_forward", "pass_shovel"])].groupby(grp).time.min().rename("t_fwd")
    t = t.join(snap, on=grp).join(fwd, on=grp)
    t = t[t.t_snap.notna()]
    t["ts"] = (t.time - t.t_snap).dt.total_seconds()
    t["t_throw"] = (t.t_fwd - t.t_snap).dt.total_seconds()
    end = np.minimum(t.t_throw.fillna(MAX_WINDOW) + AFTER_THROW, MAX_WINDOW)
    t = t[(t.ts >= -0.05) & (t.ts <= end + 1e-6)].drop(columns=["time", "t_snap", "t_fwd"])

    dirs = pp.drop_duplicates(["game_id", "play_id"]).set_index(["game_id", "play_id"]).play_direction
    t = normalize(t, t.set_index(["game_id", "play_id"]).index.map(dirs).to_series(index=t.index))
    t = t.sort_values(grp + ["ts"]).reset_index(drop=True)
    t.to_pickle(CACHE / "routes_tracking.pkl")

    got = t[["game_id", "play_id", "nfl_id"]].drop_duplicates().merge(runners[grp])
    print(f"kept {len(t)} frames; {len(got)} of {len(runners)} routes have tracking")


if __name__ == "__main__":
    main()
