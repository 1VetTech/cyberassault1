"""Playwright regression test for AI combat states and actor movement animations.

Uses the same offline canvas harness as test_combat_smoke.py. The test focuses
on observable game state; it does not certify the external Three.js CDN path.
"""
from __future__ import annotations

import importlib.util
import json
import math
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("combat_smoke", ROOT / "tests" / "test_combat_smoke.py")
combat_smoke = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(combat_smoke)


def main() -> None:
    console_errors: list[str] = []
    page_errors: list[str] = []
    document = combat_smoke.make_offline_test_document()

    with sync_playwright() as playwright:
        system_chromium = next((shutil.which(name) for name in ("chromium", "chromium-browser", "google-chrome") if shutil.which(name)), None)
        launch_args = {"headless": True}
        if system_chromium:
            launch_args["executable_path"] = system_chromium
            launch_args["args"] = ["--no-sandbox"]
        browser = playwright.chromium.launch(**launch_args)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.set_content(document, wait_until="load", timeout=60_000)
        page.locator("#deployBtn").click()

        initial = page.evaluate("window.__cyberTowerDebug()")
        start_by_id = {actor["id"]: actor for actor in initial["team"]}
        saw_enemy_telegraph = False
        saw_ally_fire = False
        snapshots = []
        # Sample over several combat cycles instead of relying on a single random frame.
        for _ in range(34):
            page.wait_for_timeout(150)
            snapshot = page.evaluate("window.__cyberTowerDebug()")
            snapshots.append(snapshot)
            saw_enemy_telegraph |= any(e["alive"] and e["combatState"] in ("aim", "windup") for e in snapshot["enemies"])
            saw_ally_fire |= any(a["id"] in ("bubba", "lilbit") and a["firing"] for a in snapshot["team"])

        latest = snapshots[-1]
        team = {actor["id"]: actor for actor in latest["team"]}
        lilbit = team["lilbit"]
        bubba = team["bubba"]
        moved_bubba = math.hypot(bubba["x"] - start_by_id["bubba"]["x"], bubba["z"] - start_by_id["bubba"]["z"])

        # Lil Bit should select a high-ground route; Bubba should push into the fight.
        lilbit_reached_high_ground = any(s["team"] and next(a for a in s["team"] if a["id"] == "lilbit")["y"] >= 2.8 for s in snapshots)
        assert lilbit_reached_high_ground, "Lil Bit did not climb to an upper platform during the observation window"
        assert moved_bubba > 1.2, {"bubba_start": start_by_id["bubba"], "bubba_end": bubba, "distance": moved_bubba}
        assert saw_enemy_telegraph, "No enemy aim/wind-up telegraph observed"
        assert saw_ally_fire, "No autonomous Lil Bit/Bubba firing animation observed"

        # The player's controls still work alongside the new animation layer.
        before_move = page.evaluate("window.__cyberTowerDebug().controlled.x")
        page.keyboard.down("KeyD")
        page.wait_for_timeout(320)
        page.keyboard.up("KeyD")
        after_move = page.evaluate("window.__cyberTowerDebug().controlled.x")
        assert abs(after_move - before_move) > .2, {"before": before_move, "after": after_move}

        ROOT.joinpath("reference", "Combat_Animation_Review.png").parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(ROOT / "reference" / "Combat_Animation_Review.png"), full_page=True)

        assert not console_errors and not page_errors, {"console_errors": console_errors, "page_errors": page_errors}
        print(json.dumps({
            "status": "PASS",
            "enemy_aim_or_windup_seen": saw_enemy_telegraph,
            "autonomous_ally_fire_seen": saw_ally_fire,
            "lilbit_high_ground": {"y": round(lilbit["y"], 2), "reached_during_window": lilbit_reached_high_ground},
            "bubba_advance_distance": round(moved_bubba, 2),
            "player_movement": round(after_move - before_move, 2),
            "console_errors": console_errors,
            "page_errors": page_errors,
        }, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
