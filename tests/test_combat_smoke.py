"""Offline browser smoke test for the 1VETTECH Facility Alpha combat MVP.

Requires `pip install playwright` and `python -m playwright install chromium`.
This test temporarily disables the Three.js CDN and enables test-only hooks in
an in-memory copy of the source; the delivered game files are not modified.
"""
from __future__ import annotations

import base64
import json
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def make_offline_test_document() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "src" / "styles.css").read_text(encoding="utf-8")
    js = (ROOT / "src" / "game.js").read_text(encoding="utf-8")

    html = html.replace(
        '<link rel="stylesheet" href="src/styles.css">',
        f"<style>{css}</style>",
    )
    html = html.replace(
        """  <script type="module" id="gameBootstrap">
    try {
      window.THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
    } catch (error) {
      window.__THREE_CDN_FAILED__ = true;
      console.warn('Three.js module unavailable; using the canvas renderer.', error);
    }
    /* GAME_SOURCE */
  </script>""",
        "",
    )

    # Embed local artwork so the page remains fully offline during the test.
    for filename in ("operator.webp", "bubba.webp", "lilbit.webp", "gideon.webp"):
        data = base64.b64encode((ROOT / "assets" / filename).read_bytes()).decode("ascii")
        uri = f"data:image/webp;base64,{data}"
        html = html.replace(f'src="assets/{filename}"', f'src="{uri}"')
        js = js.replace(f"portrait: 'assets/{filename}'", f"portrait: '{uri}'")
    field_art = base64.b64encode((ROOT / "assets" / "1vettech 3d world.jpg").read_bytes()).decode("ascii")
    js = js.replace(
        "const FIELD_ART_URL = 'assets/1vettech 3d world.jpg'",
        f"const FIELD_ART_URL = 'data:image/jpeg;base64,{field_art}'",
    )

    # Expose a read-only snapshot and deterministic test hooks in the in-memory copy only.
    js = js.replace(
        "if(new URLSearchParams(location.search).has('debug')){window.__cyberTowerDebug=",
        "if(true){window.__cyberTowerDebug=",
    )
    js = js.replace(
        "score:game.score,kills:game.kills,team:actors.map",
        "score:game.score,kills:game.kills,hitCount:game.hitCount,team:actors.map",
    )
    js = js.replace(
        "  init();",
        """  window.__testHoldAI=()=>{
    for(const e of enemies)e.attackClock=game.time+30;
    for(const a of actors)if(a.id!==game.selected)a.attackClock=game.time+30;
  };
  window.__testForceDown=(id)=>{const a=teamById(id);damageAlly(a,999);};
  init();""",
    )
    return html.replace("</body>", f"<script>{js}</script></body>")


def main() -> None:
    errors: list[str] = []
    page_errors: list[str] = []
    document = make_offline_test_document()

    with sync_playwright() as playwright:
        # Prefer a system Chromium if present (useful in offline/container environments).
        system_chromium = next((shutil.which(name) for name in ("chromium", "chromium-browser", "google-chrome") if shutil.which(name)), None)
        launch_args = {"headless": True}
        if system_chromium:
            launch_args["executable_path"] = system_chromium
        browser = playwright.chromium.launch(**launch_args)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.set_content(document, wait_until="load", timeout=60_000)

        # Home / operator select must render; selecting an operator must still work.
        assert page.locator("#selectScreen").is_visible()
        page.locator('[data-operator="lilbit"]').click()
        assert "LIL BIT" in page.locator("#previewName").inner_text()
        page.locator('[data-operator="operator"]').click()
        page.locator("#deployBtn").click()
        page.wait_for_timeout(150)
        page.evaluate("window.__testHoldAI()")

        # A player shot must damage a target; this catches stale/uninitialized fire timers.
        before = page.evaluate("window.__cyberTowerDebug()")
        page.keyboard.down("KeyF")
        page.wait_for_timeout(120)
        page.keyboard.up("KeyF")
        page.wait_for_timeout(80)
        after_laser = page.evaluate("window.__cyberTowerDebug()")
        assert after_laser["hitCount"] > before["hitCount"], {
            "before": before["hitCount"], "after": after_laser["hitCount"]
        }

        # Launcher ammo and projectile lifecycle.
        page.keyboard.press("Digit4")
        page.keyboard.down("KeyF")
        page.wait_for_timeout(90)
        page.keyboard.up("KeyF")
        rocket = page.evaluate("window.__cyberTowerDebug()")
        assert rocket["projectiles"] > 0, "Grenade launcher did not spawn a projectile"
        assert page.locator("#ammoCount").inner_text().startswith("3/"), page.locator("#ammoCount").inner_text()
        page.wait_for_timeout(1_100)
        assert page.evaluate("window.__cyberTowerDebug().projectiles") == 0, "Projectile did not resolve"

        # Down and revive Lil Bit, with hostiles prevented from firing for a deterministic check.
        page.evaluate("window.__testForceDown('lilbit')")
        assert page.evaluate("window.__cyberTowerDebug().team.find(a=>a.id==='lilbit').down") is True
        page.wait_for_timeout(6_000)
        lilbit = page.evaluate("window.__cyberTowerDebug().team.find(a=>a.id==='lilbit')")
        assert lilbit["down"] is False and lilbit["hp"] > 0, lilbit

        # Switching the controlled operator remains functional.
        page.keyboard.press("Tab")
        assert page.evaluate("window.__cyberTowerDebug().selected") == "bubba"
        assert not errors and not page_errors, {"console_errors": errors, "page_errors": page_errors}

        print(json.dumps({
            "status": "PASS",
            "player_damage": after_laser["hitCount"] > before["hitCount"],
            "rocket_projectile_spawned": rocket["projectiles"] > 0,
            "lilbit_revived": {"hp": lilbit["hp"], "down": lilbit["down"]},
            "operator_switch": "bubba",
            "console_errors": errors,
            "page_errors": page_errors,
        }, indent=2))
        browser.close()


if __name__ == "__main__":
    main()
