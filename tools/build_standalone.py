#!/usr/bin/env python3
"""Build a single-file Facility Alpha browser version from the source project.

The Home UI and stylesheet are copied into the standalone artifact. Local
images are embedded as data URIs; Three.js is loaded as an ES module online.
"""
from __future__ import annotations

import base64
import mimetypes
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "1VETTECH_Cyber_Tower_Combat_Animation_Pass_Standalone.html"


def data_uri(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    media_type = mimetypes.guess_type(path.name)[0]
    if not media_type:
        raise ValueError(f"Could not determine MIME type for {path.name}")
    return f"data:{media_type};base64,{encoded}"


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "src" / "styles.css").read_text(encoding="utf-8")
    js = (ROOT / "src" / "game.js").read_text(encoding="utf-8")

    css_link = '<link rel="stylesheet" href="src/styles.css">'
    if css_link not in html:
        raise SystemExit("Could not find stylesheet link in index.html")
    html = html.replace(css_link, f"<style>\n{css}\n</style>", 1)

    game_marker = "    /* GAME_SOURCE */"
    if game_marker not in html:
        raise SystemExit("Could not find game bootstrap marker in index.html")

    for filename in ("operator.webp", "bubba.webp", "lilbit.webp", "gideon.webp"):
        uri = data_uri(ROOT / "assets" / filename)
        html = html.replace(f'src="assets/{filename}"', f'src="{uri}"')
        js = js.replace(f"portrait: 'assets/{filename}'", f"portrait: '{uri}'")

    field_art_uri = data_uri(ROOT / "assets" / "1vettech 3d world.jpg")
    js = js.replace("'assets/1vettech 3d world.jpg'", f"'{field_art_uri}'")
    html = html.replace(game_marker, js, 1)
    OUT.write_text(html, encoding="utf-8")
    print(f"Built {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
