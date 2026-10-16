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

Test `http://localhost:8080/health` or `https://timber.klarapp.com/health` for server health. Opening the game in a regular browser is intentionally not supported: it needs Discord's embedded SDK environment.

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

The deployment updater uses the canonical PM2 name Baba-Cyborg-DC. It deletes PM2 entries only when their resolved script path matches this checkout's server.cjs, then starts ecosystem.config.js in fork mode. This replaces older cluster settings and duplicate names without stopping other projects. It verifies the process ID, build ID, configured port and online state before saving PM2. Existing .env values are preserved.

For the current Pi setup, set PORT=2323 in the deployed .env and target http://127.0.0.1:2323 from cloudflared. Run bash update.sh from the deployed repository after pushing the updated deployment bundle. The /health response reports build and processId for deployment verification and disables caching.

Run node scripts/diagnose-connection.cjs on the Pi to compare local and public HTTP, polling sessions and WebSocket stability. If only the public target fails, inspect cloudflared logs at the same time; a 502 alone does not establish a bandwidth bottleneck.

If WebSockets connect then drop, the browser now falls back to polling for the remainder of that page session. This also prevents repeated WebSocket upgrade attempts. Server transport errors are logged with [transport handshake] / [transport closed] without authentication payloads. Code 1006 means the WebSocket ended without a close frame; it does not establish the underlying cause.

The multiplayer test suite also runs an 18-second Horde/FFA stability check with real enemy spawning and movement. It covers the undefined minStopDist crash that previously caused PM2 restarts and browser 502/reconnect loops. Enemy movement now uses the existing 5px arrival threshold and clamps its step to avoid overshooting.
