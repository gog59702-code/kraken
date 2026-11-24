"""Débloque les sessions OpenCode coincées en 'busy' et purge la file d'attente orpheline.

À lancer quand l'app OpenCode est FERMÉE (tray -> Quit), sinon la base est verrouillée.

    python tools/unstick-opencode.py            # montrer + réparer
    python tools/unstick-opencode.py --dry-run  # montrer seulement
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time

DB = os.path.expanduser(r"~\.local\share\opencode\opencode.db")
BUSY_STALE_MS = 120_000  # une session "busy" depuis > 2 min sans message = coincée


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--stale-seconds", type=int, default=BUSY_STALE_MS // 1000)
    args = ap.parse_args()

    if not os.path.exists(DB):
        print(f"base introuvable: {DB}")
        return 1

    con = sqlite3.connect(DB, timeout=8)
    cutoff = int(time.time() * 1000) - args.stale_seconds * 1000

    stuck = [r[0] for r in con.execute(
        "select id from session_v2 where time_busy is not null and time_busy < ?", (cutoff,))]
    queued = con.execute("select count(*) from session_inbox").fetchone()[0]

    print(f"sessions bloquées : {len(stuck)}")
    for sid in stuck:
        print(f"  - {sid}")
    print(f"messages en file  : {queued}")

    if args.dry_run:
        print("dry-run : rien modifié")
        return 0
    if not stuck and not queued:
        print("rien à faire")
        return 0

    with con:
        cleared = con.execute(
            "update session_v2 set time_busy = null, time_suspended = null, resume_attempts = 0 "
            "where time_busy is not null and time_busy < ?", (cutoff,)).rowcount
        purged = 0
        if stuck:
            marks = ",".join("?" * len(stuck))
            purged = con.execute(
                f"delete from session_inbox where session_id in ({marks})", stuck).rowcount

    print(f"busy remis à zéro : {cleared}")
    print(f"file purgée       : {purged}")
    print("relance OpenCode, ouvre un nouveau chat (Gemini 3.1 Flash Lite).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
