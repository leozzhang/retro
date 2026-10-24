"""Compare the game's route waypoints (ROUTES in src/data/plays.ts) to NFL tracking.

Needs analysis/out/route_metrics.csv and cache/route_paths.pkl from route_metrics.py.

    python analysis/compare_game.py
"""
from __future__ import annotations

import json
import re

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from nfldata import CACHE, HERE, OUT, md_table

PLAYS_TS = HERE.parent / "src" / "data" / "plays.ts"

# game route -> (NFL route_ran, row filter, note). Filters split NFL labels that
# lump several of our routes together (HITCH = hitch/curl/comeback, CROSS = drag/deep cross).
GROUPS = {
    "go": ("GO", lambda m: m.pos == "WR", "outside WRs"),
    "seam": ("GO", lambda m: m.pos.isin(["SLOT_WR", "TE"]), "slots and TEs"),
    "slant": ("SLANT", None, ""),
    "quickOut": ("OUT", lambda m: m.break_depth < 8, "quick outs: break under 8 yd"),
    "deepOut": ("OUT", lambda m: m.break_depth >= 8, "deep outs: break 8+ yd"),
    "in": ("IN", lambda m: m.break_depth >= 8, "digs: break 8+ yd"),
    "post": ("POST", None, ""),
    "corner": ("CORNER", None, ""),
    "hitch": ("HITCH", lambda m: m.depth_max < 9, "HITCH topping out under 9 yd"),
    "curl": ("HITCH", lambda m: m.depth_max >= 9, "HITCH topping out 9+ yd"),
    "comeback": ("HITCH", lambda m: m.depth_max > 12, "HITCH topping out past 12 yd"),
    "drag": ("CROSS", lambda m: m.depth_max <= 6, "CROSS staying within 6 yd"),
    "flat": ("FLAT", lambda m: m.pos != "RB", "WR/TE flats"),
    "swing": ("FLAT", lambda m: m.pos.isin(["RB", "FB"]), "RB flats (thin)"),
    "bubble": ("SCREEN", None, "SCREEN mixes bubbles, tunnels, smokes"),
    "wheel": ("WHEEL", None, "very thin"),
}
TOP_DEPTH_ROUTES = {"hitch", "curl", "comeback"}  # compare where they stop, not a break
NO_BREAK_ROUTES = {"go", "seam"}  # compare the overall line (alignment -> end), not a break


def parse_routes() -> dict[str, dict]:
    src = PLAYS_TS.read_text(encoding="utf-8")
    body = src[src.index("export const ROUTES"):]
    body = body[:body.index("\n};")]
    out = {}
    for m in re.finditer(r"^\s+(\w+): \{ pts: (\[.*?\]), cont: (true|false)(.*?)\},", body, re.M):
        name, pts, cont, rest = m.groups()
        if "run: true" in rest or "thenBlock" in rest:
            continue
        out[name] = dict(pts=np.array(json.loads(pts) or [[0, 0]], dtype=float), cont=cont == "true")
    return out


def angle(v) -> float:
    return float(np.degrees(np.arctan2(v[1], v[0])))


def point_at_depth(pts: np.ndarray, depth: float) -> np.ndarray:
    """Where our route (from the alignment) first reaches `depth` downfield; the end if it never does."""
    p = np.vstack([[0, 0], pts])
    for a, b in zip(p[:-1], p[1:]):
        if b[0] >= depth > a[0]:
            return a + (b - a) * (depth - a[0]) / (b[0] - a[0])
    return p[-1]


def game_shape(r: dict) -> dict:
    p = r["pts"]
    d = dict(depth_max=p[:, 0].max(), comeback=p[:, 0].max() - p[-1, 0])
    if len(p) == 1:
        d.update(leg_angle=angle(p[0]))
    else:
        d.update(break_depth=p[0, 0], break_inside=p[0, 1], stem_angle=angle(p[0]),
                 leg_angle=angle(p[1] - p[0]))
    return d


def q(s: pd.Series) -> str:
    s = s.dropna()
    if len(s) < 10:
        return "n/a"
    a, b, c = s.quantile([0.25, 0.5, 0.75])
    return f"{b:.1f} ({a:.1f} to {c:.1f})"


def flag(ours: float, s: pd.Series) -> str:
    s = s.dropna()
    if np.isnan(ours) or len(s) < 10:
        return ""
    a, c = s.quantile([0.25, 0.75])
    return "" if a <= ours <= c else ("LOW" if ours < a else "HIGH")


def main():
    m = pd.read_csv(OUT / "route_metrics.csv")
    m = m[~m.ambiguous_side & (m.motion != True)]
    paths = pd.read_pickle(CACHE / "route_paths.pkl")
    ours = parse_routes()
    print(f"parsed {len(ours)} pass routes from {PLAYS_TS.name}: {', '.join(ours)}")

    rows, groups = [], {}
    for name, r in ours.items():
        if name not in GROUPS:
            continue
        label, filt, note = GROUPS[name]
        g = m[m.route == label]
        if filt is not None:
            g = g[filt(g)]
        groups[name] = g
        gs = game_shape(r)
        depth_col = "depth_max" if name in TOP_DEPTH_ROUTES else "break_depth"
        nfl_angle = g.leg_angle
        if name in NO_BREAK_ROUTES:
            # the overall line: inside drift vs depth at the end of the route window. Ours is read at the
            # NFL median end depth, so a route that straightens later isn't judged on its 45-yd endpoint.
            depth_col = None
            nfl_angle = np.degrees(np.arctan2(g.inside_end, g.depth_end))
            gs["leg_angle"] = angle(point_at_depth(r["pts"], g.depth_end.median()))
        elif name in TOP_DEPTH_ROUTES:
            # the window ends at the throw, about when they plant, so the leg back isn't seen
            nfl_angle = pd.Series(dtype=float)
        ours_depth = gs.get(depth_col, np.nan) if depth_col else np.nan
        nfl_depth = g[depth_col] if depth_col else pd.Series(dtype=float)
        rows.append({
            "route": name, "NFL group": f"{label}: {note}" if note else label, "n": len(g),
            "depth: ours": ours_depth, "depth: NFL p50 (IQR)": q(nfl_depth),
            "depth flag": flag(ours_depth, nfl_depth),
            "leg angle: ours": gs["leg_angle"], "leg angle: NFL": q(nfl_angle),
            "angle flag": flag(gs["leg_angle"], nfl_angle),
            "break inside: ours": gs.get("break_inside", np.nan), "break inside: NFL": q(g.break_inside),
            "time to break (s)": q(g.break_t), "max speed (yd/s)": q(g.max_speed),
        })
    t = pd.DataFrame(rows).set_index("route")
    (OUT / "route_compare.md").write_text(
        "# Game routes vs NFL tracking\n\n"
        "Generated by `analysis/compare_game.py`. Ours come from `ROUTES` in `src/data/plays.ts`.\n\n"
        "- **depth**: break depth (yd past the alignment), or top depth for hitch/curl/comeback.\n"
        "- **go/seam** have no break: the angle is the overall line from the alignment to the end of the route.\n"
        "- **hitch/curl/comeback**: the NFL route window ends at the throw, about when they plant, so the "
        "leg back isn't measured.\n"
        "- **leg angle**: direction after the break in degrees from straight downfield; + is inside, "
        "beyond ±90 comes back toward the LOS. NFL legs are measured over the 5 yd after the break, "
        "so rounded breaks read less sharp than a waypoint corner.\n"
        "- **flag**: our value is outside the NFL middle 50%.\n\n"
        + md_table(t) + "\n", encoding="utf-8")
    print(md_table(t[["n", "depth: ours", "depth: NFL p50 (IQR)", "depth flag",
                      "leg angle: ours", "leg angle: NFL", "angle flag"]]))
    plot_overlays(ours, groups, paths)


def plot_overlays(ours, groups, paths):
    names = [n for n in GROUPS if n in groups]
    cols = 5
    fig, axes = plt.subplots(int(np.ceil(len(names) / cols)), cols, figsize=(20, 4.6 * np.ceil(len(names) / cols)))
    rng = np.random.default_rng(0)
    for ax, name in zip(axes.flat, names):
        g = groups[name]
        pick = g.iloc[rng.permutation(len(g))[:150]]
        for k in pick.itertuples():
            p = paths[(k.game_id, k.play_id, k.nfl_id)]
            ax.plot(p[:, 1], p[:, 0], lw=0.5, alpha=0.2, color="#555")
        bd = g.break_depth.median()
        ax.scatter([g.break_inside.median()], [bd], color="#1f77b4", s=40, zorder=5, label="NFL median break")
        pts = np.vstack([[0, 0], ours[name]["pts"]])
        ax.plot(pts[:, 1], pts[:, 0], color="#d62728", lw=2.5, marker="o", ms=4, label="game route")
        if ours[name]["cont"] and len(pts) > 1:
            d = pts[-1] - pts[-2]
            ext = pts[-1] + 6 * d / max(np.hypot(*d), 1e-6)
            ax.plot([pts[-1, 1], ext[1]], [pts[-1, 0], ext[0]], color="#d62728", lw=1.5, ls="--")
        ax.set_title(f"{name} vs {GROUPS[name][0]} (n={len(g)})")
        ax.set_xlim(-20, 20)
        ax.set_ylim(-4, 30)
        ax.set_aspect("equal")
        ax.axhline(0, color="#bbb", lw=0.5)
        ax.axvline(0, color="#bbb", lw=0.5)
    axes.flat[0].legend(fontsize=7, loc="upper left")
    for ax in axes.flat[len(names):]:
        ax.axis("off")
    fig.suptitle("Game routes (red) over NFL paths (grey), x = inside (yd), y = downfield (yd)")
    fig.tight_layout()
    fig.savefig(OUT / "route_compare.png", dpi=80)


if __name__ == "__main__":
    main()
