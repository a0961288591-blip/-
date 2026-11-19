"""Honest cost model (2026-10 public prices from digital-human-asset-feasibility.md — verify before budgeting).

per video = Σ lip-sync(visible talking seconds × engine price × rework) + plate amortisation + (TTS, excluded: every route needs it)
The two levers this skill adds on top of "plates once, mouths each time":
  1. visibility routing — hidden spans (B-roll / cards) are never sent to a lip-sync engine;
  2. size routing — PiP / small faces go to the cheap fast engine, only hero spans pay pro prices.
"""
from .lipsync import ENGINES

GEN_USD_PER_S = (0.08, 0.14)   # long-duration video models, per generated second
DRAWS = (4, 5)                 # takes per plate (final-koubo rule: draw 4–5, keep the best)
REWORK = {"commercial": (1.1, 1.3), "open_source": (1.2, 1.5), "avatar_service": (1.1, 1.1), "none": (1.0, 1.0)}
ALTERNATIVES = [  # per finished minute, incl. rework (feasibility §6.2)
    ("全量生成：通用视频模型 + 原生音频", 10.0, 25.0),
    ("全量生成：音频驱动数字人 SaaS", 5.0, 8.0),
    ("现成数字分身服务（本人出镜）", 1.0, 1.5),
]


def plate_capex(catalog_plates):
    secs = sum(p.get("duration", 30) for p in catalog_plates)
    return secs, (secs * GEN_USD_PER_S[0] * DRAWS[0], secs * GEN_USD_PER_S[1] * DRAWS[1])


def video_cost(jobs, lifetime_minutes=300.0, capex=(0.0, 0.0)):
    lo = hi = 0.0
    rows = []
    for j in jobs["jobs"]:
        e = ENGINES.get(j["engine"], {})
        price = e.get("usd_per_min")
        rw = REWORK.get(e.get("kind", "commercial") if e.get("mode") != "avatar_service" else "avatar_service", (1.2, 1.4))
        if price is None:
            rows.append((j["id"], j["engine"], j["seconds"], None, None))
            continue
        m = j["seconds"] / 60.0
        a, b = m * price[0] * rw[0], m * price[1] * rw[1]
        lo += a
        hi += b
        rows.append((j["id"], j["engine"], j["seconds"], a, b))
    minutes = jobs["duration"] / 60.0
    amort = (capex[0] / lifetime_minutes * minutes, capex[1] / lifetime_minutes * minutes)
    return {"lipsync_usd": (round(lo, 2), round(hi, 2)), "plate_amortised_usd": (round(amort[0], 2), round(amort[1], 2)),
            "total_usd": (round(lo + amort[0], 2), round(hi + amort[1], 2)),
            "per_finished_min": (round((lo + amort[0]) / minutes, 2), round((hi + amort[1]) / minutes, 2)),
            "seconds_sent": jobs["seconds_sent"], "seconds_skipped": jobs["seconds_skipped_hidden"], "rows": rows, "minutes": round(minutes, 2)}


def what_if(jobs, engine):
    """Same timeline, everything on one engine, no visibility routing (the naive baseline)."""
    e = ENGINES[engine]
    m = jobs["duration"] / 60.0
    rw = REWORK.get(e["kind"], (1.2, 1.4))
    return (round(m * e["usd_per_min"][0] * rw[0], 2), round(m * e["usd_per_min"][1] * rw[1], 2))


def report(c, jobs, capex_secs, capex, lifetime_minutes):
    L = [f"cost (USD, 2026-10 public prices — verify): video {c['minutes']} min",
         f"  plates: {capex_secs:.0f}s generated once → capex ${capex[0]:.0f}–{capex[1]:.0f}, amortised over {lifetime_minutes:.0f} finished minutes → ${c['plate_amortised_usd'][0]}–{c['plate_amortised_usd'][1]} for this video",
         f"  lip-sync: {c['seconds_sent']}s sent, {c['seconds_skipped']}s skipped (host hidden) → ${c['lipsync_usd'][0]}–{c['lipsync_usd'][1]}"]
    for jid, eng, s, a, b in c["rows"]:
        L.append(f"     {jid} {eng:<12} {s:6.2f}s  " + (f"${a:.2f}–{b:.2f}" if a is not None else "price: see console"))
    L.append(f"  TOTAL ${c['total_usd'][0]}–{c['total_usd'][1]}  → ${c['per_finished_min'][0]}–{c['per_finished_min'][1]} per finished minute (TTS excluded: every route needs it)")
    base = what_if(jobs, "sync-2-pro")
    L.append(f"  naive baseline (whole video on sync-2-pro, no routing): ${base[0]}–{base[1]}")
    L.append("  alternatives per finished minute: " + "; ".join(f"{n} ${a:g}–{b:g}" for n, a, b in ALTERNATIVES))
    return "\n".join(L)
