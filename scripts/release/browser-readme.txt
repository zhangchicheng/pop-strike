POP STRIKE — ENGLISH BROWSER EDITION

Play three solo survival waves in a colorful comic-book battleground.
Six weapons, climbable cover, upper walkways, sniper scope and comic-style effects.

On itch.io: create an HTML game, upload this ZIP, and mark it as playable in the browser.
Use an embedded viewport of 1280 x 800 (or 960 x 600) with Click to Play enabled.
Press F in the game for an immersive fullscreen view.
Desktop keyboard and mouse recommended. Requires a WebGL 2 browser.

Local preview: extract the ZIP, open a terminal in this folder and run:
  python3 -m http.server 8000 --bind 127.0.0.1
Then open http://localhost:8000/index.html in your browser.
Serve via HTTP; double-clicking index.html will not load ES modules reliably.

Controls
WASD: move | Mouse: look | LMB: fire | RMB: aim / sniper scope
R: reload | 1-6 or mouse wheel: switch weapon | Shift: sprint
Space: jump (hold to mantle) | E: grab ladder | W/S: climb
Esc: pause / release cursor | F: fullscreen | M: mute

The browser edition is solo only. For red-versus-blue LAN battles, download the
separate Pop Strike LAN English package and run its host on your local network.

Third-party notices are included in vendor/THREE-LICENSE.txt and fonts/*OFL.txt.
All runtime assets and fonts are bundled locally; there are no CDN dependencies.
