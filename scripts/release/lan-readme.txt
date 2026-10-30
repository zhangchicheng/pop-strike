POP STRIKE — ENGLISH LAN EDITION

Includes solo survival and red-versus-blue LAN battles for 2-8 players.
5-minute rounds, first team to 20 kills wins. No friendly fire.
Eliminated players respawn after 3 seconds.

HOST A GAME
1. Extract this entire ZIP. The host needs Node.js 22 or newer.
   No npm install is required. Guests need only a WebGL 2 browser.
2. On macOS or Linux: open Terminal in the extracted folder and run:
     bash start-lan.sh
   On Windows: double-click start-lan.bat, or run:
     node pop-strike/server.mjs
3. Open the localhost address printed in the terminal, then select LAN Battle.
4. Friends on the same LAN/Wi-Fi open one of the printed LAN addresses, enter a
   callsign and select JOIN BATTLE. With two players the round starts automatically.
5. Keep the terminal open. Press Ctrl+C to stop the host.

If the page is unreachable, check that both computers are on the same LAN and
that the host firewall allows the game port (5173 by default) on that network.
This is a local-network host, not a public internet matchmaking service.
The host can change the port using the PORT environment variable.

Controls
WASD: move | Mouse: look | LMB: fire | RMB: aim / sniper scope
R: reload | 1-6 or mouse wheel: switch weapon | Shift: sprint
Space: jump (hold to mantle) | E: grab ladder | W/S: climb
Esc: pause / release cursor (LAN matches continue) | F: fullscreen | M: mute
Tab: hold for the team scoreboard
The radar shows living teammates in LAN matches. Headbands identify teams.

This ZIP is a downloadable host package. On itch.io, upload it as a download;
use the separate pop-strike-itch-en.zip for the in-browser solo player.

Third-party notices: pop-strike/vendor/THREE-LICENSE.txt and pop-strike/fonts/*OFL.txt.
All runtime assets and fonts are bundled locally; there are no CDN dependencies.
