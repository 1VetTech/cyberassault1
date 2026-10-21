# Changelog

## Six-mission Facility Alpha completion — 2026-10-20

- Added six separate, named operations with distinct enemy deployments and staged reinforcements.
- Added a physical exit gate for each operation. The gate unlocks after the Network Core is restored; using it starts the next mission. The sixth exit completes the campaign.
- Changed only the in-game environment floor to medium grey square steel panels, added tan segmented walkways, and recolored cover crates as blue, red, and white square cargo boxes.
- Preserved the Home/operator-selection layout, interface colors, branding, facility artwork, character assets, and existing combat controls.
- Added code comments and README navigation labels for the floor palette, walkway routes, mission data, and exit gate.
- Rebuilt the standalone HTML and flat-root upload ZIP from the updated source.
- Verified JavaScript syntax and the Home UI/stylesheet source guard. Browser gameplay checks remain unrun because Playwright is unavailable in this environment.

## Upload package correction — 2026-10-20

- Put index.html at the ZIP root beside src/ and assets/ so static hosts resolve the stylesheet and runtime images.
- The app CSS palette and live source were not changed.
- Rebuilt the clean upload package without the duplicate nested project folder.

## Final test package — 2026-10-20

- Made README.md the primary upload, run, and update guide.
- Rebuilt the standalone HTML from the packaged source.
- Confirmed the main source files and runtime assets match the live project.
- The graphics guard and JavaScript syntax check pass. Browser smoke and animation tests still need Playwright and Chromium.

## 3D character graphics update

- Started from the newest extracted Facility Alpha project (v10.30); preserved its existing gameplay, assets, and animation work.
- Added original portrait crops to the deployed 3D heads for JJ, Lil Bit, Bubba, and Gideon, plus small tactical fabric maps and a restrained soft squad glow.
- Kept the Home/operator-select UI, preview model, stylesheet, branding, and facility art unchanged.
- Reduced renderer cost with a low-power hint, a 1.5 pixel-ratio cap, and a 1024 shadow map; retained the existing distance fog.
- Added CHARACTER GRAPHICS: code comments and README navigation notes for fast edits.
- Rebuilt the standalone HTML from the updated source.
