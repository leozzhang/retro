"""Shared loading and normalization for the NFL Big Data Bowl 2027 data.

Coordinates are normalized to the game's convention: offense attacks +x,
x runs 0-120 (end zones included), y runs 0-53.3.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
OUT = HERE / "out"
FIELD_W = 160 / 3  # 53.33 yd
CENTER_Y = FIELD_W / 2
NFL_HASH = 23.58  # NFL hash marks: 70'9" from each sideline
NCAA_HASH = 20.0  # college hash marks: 60' from each sideline

RECEIVERS = ["WR", "SLOT_WR", "TE", "RB", "FB"]
OL = ["C", "G", "T", "EXTRA_OL"]  # INTERIOR_LINE is the defensive tackle label

PLAY_COLS = [
    "game_id", "play_id", "team_abbr", "nfl_id", "lined_up_position", "quarter", "down",
    "yards_to_go", "possession_team", "yardline_side", "yardline_number", "play_direction",
    "offense_formation", "receiver_alignment", "pass_result", "pass_length", "yards_gained",
    "team_coverage_man_zone", "team_coverage_type", "in_motion_at_ball_snap", "target",
    "rec_yards", "yards_after_catch", "route_ran", "separation_at_pass_forward", "cushion",
    "dropback_duration", "play_nullified_by_penalty",
]


def data_dir_arg(default: str = "nfl-big-data-bowl-2027") -> Path:
    d = Path(sys.argv[1] if len(sys.argv) > 1 else default).resolve()
    if not (d / "player_play.csv").exists():
        sys.exit(f"player_play.csv not found in {d}")
    return d


def load_player_play(data_dir: Path) -> pd.DataFrame:
    df = pd.read_csv(data_dir / "player_play.csv", usecols=PLAY_COLS, low_memory=False)
    df["on_offense"] = df.team_abbr == df.possession_team
    df["los_x"] = los_x(df)
    return df


def los_x(df: pd.DataFrame) -> pd.Series:
    """Line of scrimmage in the normalized frame (offense attacks +x).

    yardline_number counts from the goal line named by yardline_side; at
    midfield yardline_side is empty and both readings give 60.
    """
    own = df.yardline_side == df.possession_team
    dist_own_goal = np.where(own, df.yardline_number, 100 - df.yardline_number)
    return pd.Series(10 + dist_own_goal, index=df.index, dtype=float)


def normalize(track: pd.DataFrame, play_dir: pd.Series) -> pd.DataFrame:
    """Flip plays moving left so the offense attacks +x. play_dir is aligned to track rows."""
    left = (play_dir == "left").to_numpy()
    track = track.copy()
    track.loc[left, "x"] = 120 - track.loc[left, "x"]
    track.loc[left, "y"] = FIELD_W - track.loc[left, "y"]
    for col in ("dir", "o"):
        if col in track:
            track.loc[left, col] = (track.loc[left, col] + 180) % 360
    return track


def snap_frames(track: pd.DataFrame) -> pd.DataFrame:
    """One row per player-play: the first frame at or after the snap."""
    return track[track.ts >= -0.05].drop_duplicates(["game_id", "play_id", "nfl_id"])


def check_los(snap: pd.DataFrame, pp: pd.DataFrame) -> None:
    """Tracked linemen should sit just behind the computed LOS. Fails loudly otherwise."""
    m = snap.merge(pp[pp.lined_up_position.isin(OL)][["game_id", "play_id", "nfl_id", "los_x"]])
    d = (m.x - m.los_x).median()
    print(f"LOS check: OL median snap x - LOS = {d:+.2f} yd over {len(m)} linemen")
    if not -2.5 < d < 0:
        sys.exit("LOS check failed: coordinates or los_x are wrong")


def ball_y(snap: pd.DataFrame, pp: pd.DataFrame) -> pd.Series:
    """Ball y at the snap, indexed by (game_id, play_id), for plays with a tracked center."""
    c = snap.merge(pp[pp.lined_up_position == "C"][["game_id", "play_id", "nfl_id"]])
    return c.groupby(["game_id", "play_id"]).y.mean().rename("ball_y")


def load_routes_cache() -> pd.DataFrame:
    p = CACHE / "routes_tracking.pkl"
    if not p.exists():
        sys.exit("No cache yet: run `python analysis/extract_routes.py nfl-big-data-bowl-2027` first")
    return pd.read_pickle(p)


def pct_table(df: pd.DataFrame, by, cols, qs=(0.1, 0.25, 0.5, 0.75, 0.9)) -> pd.DataFrame:
    """n plus quantiles of each column per group, flattened to 'col_p50' style names."""
    g = df.groupby(by)
    parts = [g.size().rename("n")]
    for c in cols:
        q = g[c].quantile(list(qs)).unstack()
        q.columns = [f"{c}_p{int(x * 100)}" for x in qs]
        parts.append(q)
    return pd.concat(parts, axis=1).round(2)


def md_table(df: pd.DataFrame, index: bool = True) -> str:
    """Minimal markdown table (avoids needing the tabulate package)."""
    d = df.reset_index() if index else df
    cols = [str(c) for c in d.columns]
    lines = ["| " + " | ".join(cols) + " |", "| " + " | ".join("---" for _ in cols) + " |"]
    for row in d.itertuples(index=False):
        cells = []
        for v in row:
            if isinstance(v, float):
                cells.append("" if np.isnan(v) else f"{v:.2f}".rstrip("0").rstrip("."))
            else:
                cells.append(str(v))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)
