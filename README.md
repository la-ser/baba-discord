# Baba Cyborg Discord Voice Channel Activity

## Windows 11 installation

1. Install Node.js 20.19+ or 22.12+ (Vite 6 compatible).
2. Extract this folder. In PowerShell inside it, run `npm install`.
3. Copy `.env.example` to `.env` with `Copy-Item .env.example .env`.
4. In `.env`, set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` from the Discord Developer Portal.
5. In Discord Developer Portal, enable Activities and set the Activity URL mapping prefix `/` to `timber.klarapp.com` (without https://). Configure your development/test access in Discord.
6. Run `npm run build` then `npm start`. After changing the game, rebuild and restart the server so the Activity serves the updated files; reload the Activity in Discord.
7. Keep your existing Cloudflare Tunnel hostname `timber.klarapp.com` pointing to `http://localhost:8080`.
8. Join a Discord voice channel, launch the development Activity, and have a second person join that **same running Activity**.

Test `http://localhost:8080/health` or `https://timber.klarapp.com/health` for server health. The game also supports browser guests; Discord players use their verified Discord identity. Guest progress uses a browser-local ID, so clearing browser storage creates a new guest identity.

## Notes

- Every Discord Activity `instanceId` gets its own Socket.IO room. This is not a list of all voice channel members; only users who opened the Activity appear.
- The main menu includes character selection and persistent music/sound settings. `TEMP/sound/theme.mp3` is used as the looping theme.
- **Granny** is small and fast, dealing 1 heart per shot. **Baba Cyborg** is large and slower, dealing 2.25 hearts per shot. Aim with the mouse, fire with **E**, dash with **Space**, and press **R** to deflect incoming shots. Deflecting draws an energy barrier around you as you spin, reflecting shots back at enemies with boosted speed and damage. Dashing features smooth ease-out physics, ghost afterimage trails, and a 2.5-second cooldown. Collision is automatically calculated pixel-by-pixel from the character PNGs so transparent image margins never register as hits. The game also contains an unlisted keyboard-activated secret mode.
- FFA players receive a server-enforced five-second spawn shield on initial spawn and every respawn. Firing immediately ends the shield.
- The FFA arena is 2400×1350 with a camera-followed 800×450 viewport. The minimap shows the full arena and marks the current kill leader. Kills, deaths, K/D, and the server-room leaderboard last until that Activity room empties.
- Multiplayer uses sequenced, droppable snapshots with buffered interpolation for remote players, local movement prediction with gentle server reconciliation, periodic server-clock synchronization, and reliable timestamped spin events. This prevents stale network frames from causing movement or emote jitter.
- Background images cycle through the images in `TEMP/backround`.
- Background PNGs are kept in `TEMP/backround` as originals; their optimized, small JPEG runtime copies are in `src/assets/backgrounds` so they load reliably through Discord's Activity proxy.
- The server verifies each player's Discord OAuth access token against `/users/@me` and enforces movement bounds.
- **Prototype trust limitation:** the room ID comes from the SDK client and is not independently attested by Discord on the server. A malicious authenticated client could claim another known instance ID. Before public deployment, implement stronger instance membership validation or a server-issued room authorization mechanism as supported by Discord's current APIs.
- OAuth tokens are used only for the connection and are not persisted; use HTTPS through Cloudflare.
- Do not commit or share `.env` or your Discord client secret.
- If port 8080 is occupied, stop the old Node process before running this project.
- Discord SDK / developer portal flows change over time; consult https://discord.com/developers/docs/activities/overview if authorization settings differ.

## Connection verification

Run `npm run build` and `npm test` to check WebSocket and polling connections, movement between two clients, room isolation, stale input rejection, reconnects, and production image URLs. Run `npm start` for production; Vite development proxies API and Socket.IO requests to the configured server port. PORT in the project .env takes precedence over a PORT inherited from PM2 or the hosting environment. When .env has no PORT, the process environment is used, then 8080 as a fallback. Invalid port values stop startup with a clear error.

The client tries WebSocket first with polling fallback. Reverse proxies must forward both HTTP requests and WebSocket upgrades for /socket.io/ to the same running Node server. A public 502 requires checking the hosting process/tunnel target and /health; a browser transport setting cannot repair an unavailable upstream. Deploy the rebuilt dist folder together with server.cjs, server-port.cjs and its existing configuration/storage modules, then restart the service.

## PM2 and port conflicts

Run this game as one fork-mode process using ecosystem.config.js: rooms and simulation live in process memory. Replace the existing cluster-mode PM2 entry with this configuration; starting it alongside an old game entry will still conflict. Configure PORT in the .env beside server.cjs and point the reverse proxy/tunnel at that same port. A port conflict exits with code 78 and this PM2 configuration stops retrying it. Inspect the existing listener before stopping any process.

Image requests retry transient failures three times. The base scientist sprite is bundled for fallback while tier images load; unavailable decorative backgrounds keep the last successfully loaded background and do not overwrite connection status.

## Raspberry Pi update

The deployment updater uses the canonical PM2 name Baba-Cyborg-DC. Normal updates restart the existing fork entry by numeric ID, preserving its ID, restart history and log paths. It only creates an entry when none exists. Duplicate entries, old cluster settings or a conflicting name stop the update with an explicit message; the updater never deletes PM2 entries. It verifies the process ID, build ID, configured port and online state before saving PM2. Existing .env values are preserved.

For the current Pi setup, set PORT=2323 in the deployed .env and target http://127.0.0.1:2323 from cloudflared. Run bash update.sh from the deployed repository after pushing the updated deployment bundle. The /health response reports build and processId for deployment verification and disables caching.

Run node scripts/diagnose-connection.cjs on the Pi to compare local and public HTTP, polling sessions and WebSocket stability. If only the public target fails, inspect cloudflared logs at the same time; a 502 alone does not establish a bandwidth bottleneck.

If WebSockets connect then drop, the browser falls back to polling without repeated upgrade attempts. After two polling failures it can try WebSocket again, so a broken polling route cannot trap the page permanently. Server transport errors are logged with [transport handshake] / [transport closed] without authentication payloads. Code 1006 means the WebSocket ended without a close frame; it does not establish the underlying cause.

The multiplayer test suite also runs an 18-second Horde/FFA stability check with real enemy spawning and movement. It covers the undefined minStopDist crash that previously caused PM2 restarts and browser 502/reconnect loops. Enemy movement now uses the existing 5px arrival threshold and clamps its step to avoid overshooting.

## Connection and inventory hardening (October 2026)

A transport-close message describes the symptom; it does not identify the upstream cause. A tab reload can also end a pending poll. Check whether players actually disconnect, whether the process ID changes, and whether the local endpoint differs from the public tunnel.

Run `node scripts/diagnose-connection.cjs` on the Pi. It probes local and public health, both transport heartbeats for 30 seconds, and checks whether the process restarted. It creates no player or inventory. Use `--public-only` or `--local-only` for one target and `--duration=30000` to select the interval. Set `PUBLIC_GAME_URL` to override the public hostname. Health now reports uptime, event-loop delay and transport-error counters alongside the build and process ID.

The server sends heartbeats every 10 seconds with a 20-second response timeout. Any reverse proxy must preserve both polling GET/POST and WebSocket upgrades to the same single process. Its read timeout must exceed the heartbeat interval plus timeout; see [Socket.IO reverse-proxy documentation](https://socket.io/docs/v4/reverse-proxy/). Do not cache or buffer `/socket.io/`. Keep the existing Cloudflare tunnel target at the explicit IPv4 address and PORT in the deployed .env. Do not add a second proxy unless your hosting needs one.

The updater now verifies both local transports for 15 seconds before saving PM2 state. After updating on the Pi, run the full 30-second local/public diagnostic. Passing local checks does not prove that the public tunnel or Discord proxy works.

Case opening uses a persistent request receipt. A timeout or reconnect resends the same request ID and returns the same item without spending a second key. The inventory and receipt commit together. Failed writes return an error and restore the balance in memory; unreadable inventory files stop startup instead of being silently overwritten. A starter-key flag survives reconnects and restarts. Legacy inventories with keys or case history are treated as already granted. Authenticated players are identified by Discord ID; browser guests by a stored UUID. This does not prevent a guest deliberately clearing local storage from creating a new identity.

Horde lobbies reserve dropped players' seats for 45 seconds and restore their party and upgrades when they reconnect. Connected members receive host controls when the leader drops. Explicit Leave removes membership immediately. A squad with no active players does not spawn enemies or take base damage. Parties and matches remain in memory and do not survive a server restart.

Run `npm test` for disk-write failure, case replay/restart, transport fallback in both directions, multiplayer movement, horde simulation, eight-player party limits and real-network party-reconnect checks. Tests use isolated inventory directories.

The hangar background is an optimized local WebP generated with the built-in image-generation tool. Source prompt: cinematic industrial defense hangar, cyan strip lights, red emergency accents, wet metal floor, dark left side for menu text, empty circular pedestal on the right, no characters or lettering. The runtime asset is `src/assets/hangar-menu.webp`; original artwork is `src/assets/hangar-menu.png`.

Diagnostics finish at a heartbeat boundary so no live poll is aborted at the deadline. A 15-second probe can take about 20 seconds; a 30-second probe can take up to one heartbeat longer. Successful WebSocket probes use a normal close handshake. Earlier probe versions aborted pending polls at exactly 15/30 seconds, producing misleading premature-close and unknown-session messages. Existing PM2 log files remain where they are; use `pm2 logs Baba-Cyborg-DC --lines 100` to follow them across normal updates. See [PM2 process management](https://pm2.keymetrics.io/docs/usage/process-management/) and [log management](https://pm2.keymetrics.io/docs/usage/log-management/).
