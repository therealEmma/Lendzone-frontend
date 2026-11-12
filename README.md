# Redline Protocol

Redline Protocol is an original, browser-based, real-time 2D side-view arena shooter. The Node.js server is authoritative for movement, platforms, jetpack fuel, bullets, damage, respawns, scores, and match timing. The client renders the world with Canvas and uses Socket.IO for input and snapshots.

The repository is split into `backend/` for the server, physics, shared network contracts, and game rules, and `frontend/` for the React/Vite Canvas client.

## Run locally

Requires Node.js 20+.

```bash
cd C:/Users/eozeg/COD
npm install
copy frontend/.env.example frontend/.env
npm run dev
```

Open `http://localhost:5173` in two or more browser tabs. The first player is shown as the room owner; owner actions still require the `HOST_SECRET` from `frontend/.env`. The owner can set the round duration and room capacity before deployment.

For a production-style single process:

```bash
npm run build
npm --prefix frontend start
```

The built server lives in `backend/dist` and serves `backend/dist/client`. It exposes `GET /health`. Use a persistent Node.js host with WebSocket support; do not deploy this server as a serverless function.

## Tests and load test

```bash
npm test
npm run smoke
npm run loadtest
```

The smoke test verifies two clients can join and enter the PLAYING state. The load test creates 30 Socket.IO clients by default, sends movement/aim/fire input for 30 seconds, and reports connection, message, and snapshot rates. It does not claim CPU or memory results; collect those from the hosting process while it runs. Configure it with `LOADTEST_URL`, `LOADTEST_CLIENTS`, and `LOADTEST_DURATION_MS`.

## Controls

Desktop: `A/D` or arrow keys move, `W/Space` jumps, `Shift` flies, mouse aims and fires, `R` reloads.

Mobile: use the left movement stick, right aim/fire stick, and the jump/boost buttons. Landscape orientation is recommended.

## Deployment notes

Set `PORT`, `HOST_SECRET`, `MAX_PLAYERS`, `MATCH_DURATION_SECONDS`, and `CORS_ORIGIN` in the host environment. Set `VITE_SERVER_URL` only when the browser should connect to a separate API origin; same-origin production is the default. Put the service behind HTTPS so Socket.IO can use WSS.

The current MVP intentionally keeps state in process memory and supports one shared room. Restarting the process ends the room and clears scores, which is appropriate for a short-lived company event. Snapshots are sent as volatile 12 Hz updates so stale packets are dropped instead of queued under load, and the client interpolates remote players between snapshots.
