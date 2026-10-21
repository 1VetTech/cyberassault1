# cyberassault1
2–8 player 3D co-op cybersecurity &amp; networking learning game. Solve 24 real-world network device puzzles while defending 6 FOB sectors with Three.js &amp; WebRTC.

1VETTECH Cyber Tower — Six-Stage Puzzle Rush

Welcome to 1VETTECH Cyber Tower, a fast-paced, cyberpunk-themed multiplayer puzzle rush game. Designed as a standalone, zero-build web application, this game combines intense cooperative puzzle-solving with tactical operator loadouts, all rendered in a dynamic 3D environment using Three.js (with a lightweight 2D canvas fallback).

🚀 Features

Multiplayer Co-op: Join forces with other operators using room sharing codes. Track online player statuses and tackle the tower together.

Six-Stage Puzzle Rush: Race against the clock through six distinct network puzzle stages. Solve clues, decode masks, and spin the puzzle wheel to progress.

Operator Selection & Loadouts: Choose your operator, primary weapons, and tactical abilities before deploying into the facility.

Dynamic UI & HUD: Immersive cyberpunk aesthetic featuring scanlines, glass-morphism panels, interactive minimaps, health tracks, and real-time objective stacks.

Cross-Platform Controls: Fully playable on desktop (Keyboard/Mouse) and mobile devices (built-in Touch D-Pad and action buttons).

Zero-Build Architecture: The entire core game is contained within a single, highly portable HTML file.

📁 File Structure & References

index.html (or your main game file): Contains the complete core engine, UI/UX styling, puzzle logic, and rendering pipeline.

1VETTECH_Cyber_Tower_Combat_Animation_Pass_Standalone.html: A supplementary standalone file used for testing and reviewing the combat animation passes for the operators. Please ensure this file is kept in the same directory if you are referencing it for animation debugging.

🎮 How to Play

Installation

No installation or build steps are required. Simply open the main HTML file in any modern web browser (Chrome, Firefox, Safari, Edge).

Controls

Desktop (Keyboard):

Movement: W, A, S, D or Arrow Keys

Abilities/Weapons: 1, 2, 3, 4

Interact/Submit: Enter or Space

Help Menu: H or click the Help button on the control bar.

Mobile (Touch):

Use the on-screen virtual D-Pad on the bottom left for movement.

Use the colored action buttons on the bottom right for abilities and interactions.

Multiplayer Setup

On the Operator Select screen, locate the Co-op Join Panel.

To host a game, share your automatically generated Room Code with a friend.

To join a game, paste a friend's Room Code into the input field and click Join Room.

🛠️ Technology Stack

HTML5 / CSS3: Modern layout using CSS Grid/Flexbox, custom CSS variables, and advanced backdrop filters to achieve the cyberpunk "glass" look.

JavaScript (ES6+): Pure vanilla JavaScript for game logic, multiplayer state management, and UI interactions.

Three.js: Utilized via CDN for the primary 3D isometric rendering pipeline.

Canvas API: A lightweight 2D fallback rendering system that activates automatically if the Three.js CDN is unreachable or unsupported.

🎵 Audio

The game features an integrated music control system. Toggle the tactical soundtrack on or off using the music control panel located in the UI.

Facility Alpha MVP - 1VETTECH Systems
