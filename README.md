# 1VETTECH Facility Alpha - Final Test Build

**Protecting Data. Empowering Veterans.**

This is the existing Facility Alpha game with the character graphics pass and a six-mission campaign update. It is the playable source project, not a replacement game or concept-art mockup. The upload ZIP has index.html at its root beside src/ and assets/.

## What changed

In the deployed 3D world, JJ, Lil Bit, Bubba, and Gideon use face textures cropped from the supplied operator portraits, lightweight camo fabric, and a restrained soft edge glow. The existing scene fog remains. The renderer uses a low-power hint, caps pixel ratio at 1.5, and uses 1024-pixel shadows.

Facility Alpha now has a neutral grey steel floor with square panel joints, tan segmented walkways, and blue, red, and white square cargo boxes. Six separate missions run as a connected campaign: each has its own briefing, exit location, enemy deployment, and later missions add reinforcements. Restore the Network Core, then use the lit exit gate to continue. The sixth gate completes the campaign.

The Home/operator-selection layout, brand colors, facility artwork, operator portraits, combat controls, and existing gameplay systems remain in place. The in-game environment palette is changed; the blue/cyan interface palette is not.

In src/game.js, use Ctrl+F to find the labeled edit sections:
- OPERATOR_FACE_FRAMES: portrait crop
- tacticalFabricMaterial(): camo pattern
- addOperatorEdgeGlow(): edge glow
- makeScene(): fog and renderer quality
- INDUSTRIAL FLOOR PALETTE: grey deck and square panel lines
- TAN WALKWAYS: path points, width, and panel seams
- SIX-MISSION CAMPAIGN: mission titles, briefings, reinforcements, and exits
- MISSION EXIT DOOR: gate frame, status light, and open animation

## Upload the build

- This ZIP is laid out for a website: index.html, src/, and assets/ are at the archive root. Upload this corrected ZIP if the destination accepts project archives.
- If it asks for a website folder, extract the ZIP and upload the files from its root, keeping src/ and assets/ beside index.html. Do not upload only index.html.
- If it accepts only one HTML file, use 1VETTECH_Cyber_Tower_Combat_Animation_Pass_Standalone.html. It embeds the local images, CSS, and game code. Three.js still loads from jsDelivr for the full 3D scene; the canvas fallback remains playable if the CDN is unavailable.
- Do not upload src/game.js by itself. It needs the page, styles, and runtime images.

## Run locally

1. Extract the ZIP.
2. Open a terminal in the extracted project folder.
3. Start a local server:

       python -m http.server 8000

4. Open http://localhost:8000 in a desktop browser.
5. Choose an operator and select Deploy to Facility.

For the full 3D renderer, the browser needs access to https://cdn.jsdelivr.net. The canvas fallback is available if the library cannot load.

## Game controls

- W A S D or arrow keys: move; W A S D also drive the armed tank
- Space: jump
- W or Up beside a ladder: climb; S or Down: descend
- E: enter or exit the tank, interact with objectives, or repair a nearby teammate
- 1-3: select LASER (2 damage), SPREAD (4 damage), or ROCKET (8 damage)
- Hold F or J: fire; the tank cannon deals 200 damage per shot
- R: reload
- Tab: switch between JJ, Bubba, and Lil Bit
- Q: tactical dash
- G: EMP pulse

## Keep the standalone file updated

Edit the source in src/game.js, then rebuild the single-file version from the project root:

       python .\tools\build_standalone.py

The generated standalone file is a build output. Make edits in the source project, rebuild it, then upload either the refreshed standalone file or the complete project folder.

## Updated game balance

JJ, Lil Bit, and Bubba have 600 HP. Standard enemies have 800 HP, the armored mech boss has 1,000 HP, and enemy strikes deal 600 / 22 HP each.
