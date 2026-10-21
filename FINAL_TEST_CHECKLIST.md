# Final test checklist

## Start the game

1. Extract the ZIP into a folder.
2. Open a terminal in the folder containing index.html.
3. Run python -m http.server 8000.
4. Open http://localhost:8000 in a desktop browser.
5. Allow https://cdn.jsdelivr.net for the full 3D renderer. If it cannot load, the playable canvas fallback should appear.

## Check the Facility Alpha build

- Confirm the Home/operator-select screen still shows its existing colors, layout, portraits, and preview.
- Deploy and check that the floor is grey with square seams, the walk routes are tan, and cargo cover includes blue, red, and white square boxes.
- Confirm JJ, Lil Bit, Bubba, and Gideon keep their original portraits, detailed gear, soft edge glow, and existing scene fog.
- Clear Mission 01, activate its access terminal, restore the Network Core, and use the exit gate. Confirm Mission 02 starts with its own briefing and enemy placement.
- Continue through Missions 03, 04, 05, and 06. Confirm each has a gate at a different location, later deployments add reinforcements, and the final gate shows the campaign-complete report.
- Check that replay restarts the current mission after a loss and restarts the campaign after a win.
- Move, fire, switch characters, and verify the squad and enemies still animate and fight. Check the browser console for uncaught errors.

## Run automated checks

The browser tests require Python Playwright and Chromium. Install them once, then run all three checks from the folder containing index.html:

    python -m pip install playwright
    python -m playwright install chromium
    python .\\tests\\test_combat_smoke.py
    python .\\tests\\test_combat_animation.py
    python .\\tests\\test_enemy_graphics.py

The first two tests exercise combat in the canvas fallback. The graphics guard checks source features and confirms the Home page and stylesheet are unchanged. It does not certify the full 3D renderer.

## Rebuild after source edits

From the project folder, run:

    python .\\tools\\build_standalone.py

Then reopen the standalone HTML and repeat the manual checks.
