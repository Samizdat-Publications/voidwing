"""
Rebuild every VOID WING asset family in one Blender session.

    blender --background --factory-startup --python blender_scripts/build_all.py [-- family ...]

With no family names every family is built. Families: asteroids, player_ship, enemy_ships,
capital_ship, ordnance. A failure in one family is reported and the rest still run.
"""
import importlib
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

FAMILIES = ["asteroids", "player_ship", "enemy_ships", "capital_ship", "ordnance"]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    wanted = [f for f in argv if f in FAMILIES] or FAMILIES
    results = {}
    for fam in wanted:
        t = time.time()
        try:
            mod = importlib.import_module(fam)
            mod.main()
            results[fam] = f"ok ({time.time() - t:.0f}s)"
        except Exception:
            traceback.print_exc()
            results[fam] = "FAILED"
    print("[vw] build summary:", results)
    sys.stdout.flush()
    if any(v == "FAILED" for v in results.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
