"""Route geometry from tracking: break depth, break angle, leg direction, depth at the throw.

Frame (same as the game's ROUTES): downfield = x - snap x, inside = lateral
movement toward the ball (toward the field center when the center isn't tracked).

    python analysis/route_metrics.py nfl-big-data-bowl-2027
"""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from nfldata import (CACHE, CENTER_Y, OUT, ball_y, check_los, data_dir_arg, load_player_play,
                     load_routes_cache, pct_table, snap_frames)

BREAK_TURN = 15  # deg: smallest heading change that counts as a break (posts turn only 15-35)
MIN_STEM = 1.5  # yd: ignore turns closer than this to the alignment (release footwork)
LEG_LOOK = 5.0  # yd of path after the break used to measure the leg direction
MIN_LEG = 1.5  # yd: the leg must actually go somewhere (a hitch settling isn't a break)
AFTER_THROW = 0.3  # s: route kept this long past the throw (then receivers track the ball or scramble-drill)
NO_THROW_END = 3.5  # s: route window on sacks/scrambles with no throw


def angle(v) -> float:
    """Degrees from straight downfield; + = inside, |a| > 90 = coming back toward the LOS."""
    return float(np.degrees(np.arctan2(v[1], v[0])))


def route_shape(p: np.ndarray, ts: np.ndarray) -> dict:
    """p: N x 2 (downfield, inside) from the alignment.

    Break = the point where the heading from the alignment (the stem) differs
    most from the heading over the next LEG_LOOK yd of path (the leg), if that
    turn is BREAK_TURN+. Measuring over distances rather than frame to frame
    keeps rounded NFL breaks from splitting into several small turns.
    """
    top = int(np.argmax(p[:, 0]))
    out = dict(depth_max=p[top, 0], inside_at_top=p[top, 1], t_top=ts[top], depth_end=p[-1, 0],
               inside_end=p[-1, 1], comeback=p[top, 0] - p[top:, 0].min())
    if len(p) >= 3:
        k = np.ones(3) / 3
        p = np.column_stack([np.convolve(np.pad(p[:, i], 1, mode="edge"), k, "valid") for i in (0, 1)])
    cum = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(p, axis=0).T))])
    j = np.minimum(np.searchsorted(cum, cum + LEG_LOOK), len(p) - 1)
    leg_v = p[j] - p
    ok = (np.hypot(p[:, 0], p[:, 1]) >= MIN_STEM) & (np.hypot(leg_v[:, 0], leg_v[:, 1]) >= MIN_LEG)
    if not ok.any():
        return out
    stem = np.degrees(np.arctan2(p[:, 1], p[:, 0]))
    leg = np.degrees(np.arctan2(leg_v[:, 1], leg_v[:, 0]))
    turn = np.where(ok, (leg - stem + 180) % 360 - 180, 0)
    i = int(np.argmax(np.abs(turn)))
    out.update(max_turn=turn[i], max_turn_depth=p[i, 0])
    if abs(turn[i]) >= BREAK_TURN:
        out.update(break_depth=p[i, 0], break_inside=p[i, 1], break_t=ts[i],
                   stem_angle=stem[i], leg_angle=leg[i], turn=turn[i])
    return out


def main():
    data = data_dir_arg()
    OUT.mkdir(exist_ok=True)
    pp = load_player_play(data)
    t = load_routes_cache()
    snap = snap_frames(t)
    check_los(snap, pp)
    by = ball_y(snap, pp)

    runners = pp[pp.route_ran.notna()].set_index(["game_id", "play_id", "nfl_id"])
    rows, paths = [], {}
    for (g, pl, n), f in t.groupby(["game_id", "play_id", "nfl_id"], sort=False):
        if (g, pl, n) not in runners.index:
            continue  # tracked lineman
        r = runners.loc[(g, pl, n)]
        throw = f.t_throw.iloc[0]
        end = NO_THROW_END if np.isnan(throw) else throw + AFTER_THROW
        f = f[(f.ts >= -0.05) & (f.ts <= end)]
        if len(f) < 5:
            continue
        x0, y0 = f.x.iloc[0], f.y.iloc[0]
        bally = by.get((g, pl), np.nan)
        ref = bally if not np.isnan(bally) else CENTER_Y
        side = 1.0 if ref > y0 else -1.0  # +1: the ball is toward +y
        p = np.column_stack([f.x - x0, (f.y - y0) * side])
        ts = f.ts.to_numpy()
        row = dict(game_id=g, play_id=pl, nfl_id=n, route=r.route_ran, pos=r.lined_up_position,
                   formation=r.offense_formation, alignment=r.receiver_alignment,
                   coverage=r.team_coverage_type, motion=r.in_motion_at_ball_snap, target=r.target,
                   pass_result=r.pass_result, t_throw=throw, align_depth=x0 - r.los_x,
                   snap_y=y0, ball_y=bally, sideline_dist=min(y0, 53.33 - y0), ball_y_known=not np.isnan(bally),
                   split_from_ball=abs(y0 - bally) if not np.isnan(bally) else np.nan,
                   ambiguous_side=np.isnan(bally) and abs(y0 - CENTER_Y) < 3,
                   max_speed=f.s.max())
        if not np.isnan(throw):
            at = f[f.ts <= throw]
            if len(at):
                row.update(depth_at_throw=at.x.iloc[-1] - x0, inside_at_throw=(at.y.iloc[-1] - y0) * side)
        row.update(route_shape(p, ts))
        rows.append(row)
        paths[(g, pl, n)] = np.column_stack([p, ts]).astype(np.float32)

    m = pd.DataFrame(rows)
    m.to_csv(OUT / "route_metrics.csv", index=False)
    pd.to_pickle(paths, CACHE / "route_paths.pkl")  # (game, play, nfl_id) -> [downfield, inside, t]
    clean = m[~m.ambiguous_side & (m.motion != True)]
    cols = ["break_depth", "break_inside", "turn", "leg_angle", "break_t", "depth_max", "comeback",
            "depth_at_throw", "inside_at_throw", "t_throw", "max_speed"]
    pd.concat([
        pct_table(clean, "route", cols).assign(pos="ALL").set_index("pos", append=True),
        pct_table(clean[clean.pos.isin(["WR", "SLOT_WR", "TE"])], ["route", "pos"], cols),
    ]).sort_index().to_csv(OUT / "route_summary.csv")
    nb = clean.groupby("route").break_depth.apply(lambda s: s.isna().mean()).round(2)
    print(f"{len(m)} routes measured, {len(clean)} clean (no motion, side known)")
    print("share with no break detected:\n" + nb.to_string())
    plot_paths(paths, clean)


COLORS = {"WR": "#1f77b4", "SLOT_WR": "#ff7f0e", "TE": "#2ca02c"}


def plot_paths(paths, clean):
    routes = clean.route.value_counts().index
    fig, axes = plt.subplots(3, 4, figsize=(16, 13))
    colors = COLORS
    for ax, route in zip(axes.flat, routes):
        s = clean[clean.route == route]
        for k in s.head(200).itertuples():
            p = paths[(k.game_id, k.play_id, k.nfl_id)]
            ax.plot(p[:, 1], p[:, 0], lw=0.5, alpha=0.25, color=colors.get(k.pos, "#888"))
        ax.scatter(s.break_inside.head(1500), s.break_depth.head(1500), s=2, color="k", alpha=0.2)
        ax.set_title(f"{route} (n={len(s)}): break p50 {s.break_depth.median():.1f} yd")
        ax.set_xlim(-20, 20)
        ax.set_ylim(-5, 30)
        ax.axhline(0, color="#999", lw=0.5)
        ax.axvline(0, color="#999", lw=0.5)
        ax.set_xlabel("<- outside   inside ->  (yd)")
        ax.set_ylabel("downfield (yd)")
    for ax in axes.flat[len(routes):]:
        ax.axis("off")
    fig.suptitle("NFL routes from snap (WR blue, slot orange, TE green; dots = detected break)")
    fig.tight_layout()
    fig.savefig(OUT / "route_paths.png", dpi=90)

    fig, axes = plt.subplots(3, 4, figsize=(16, 10))
    for ax, route in zip(axes.flat, routes):
        s = clean[clean.route == route]
        metric = "depth_max" if route == "HITCH" else "break_depth"  # hitches stop rather than turn
        for pos, c in colors.items():
            v = s[s.pos == pos][metric].dropna()
            if len(v) > 30:
                ax.hist(v, bins=np.arange(-2, 25, 0.5), alpha=0.5, color=c, label=f"{pos} ({len(v)})", density=True)
        ax.set_title(f"{route}: {metric.replace('_', ' ')}")
        if ax.get_legend_handles_labels()[0]:
            ax.legend(fontsize=7)
    for ax in axes.flat[len(routes):]:
        ax.axis("off")
    fig.tight_layout()
    fig.savefig(OUT / "break_depth_hist.png", dpi=90)


if __name__ == "__main__":
    main()
