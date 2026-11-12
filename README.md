# Redline Protocol

Redline Protocol is an original, browser-based, real-time 2D side-view arena shooter. The Node.js server is authoritative for movement, platforms, jetpack fuel, bullets, damage, respawns, scores, and match timing. The client renders the world with Canvas and uses Socket.IO for input and snapshots.

The repository is split into `backend/` for the server, physics, shared network contracts, and game rules, and `frontend/` for the React/Vite Canvas client.

## Run locally

Requires Node.js 20+.

```bash
cd C:/Users/eozeg/COD/backend
npm install
copy .env.example .env

cd ../frontend
npm install
copy .env.example .env
npm run dev
```

The frontend and backend are intentionally started separately during development. Use two terminals:

```bash
# Terminal 1
cd C:/Users/eozeg/COD/backend
npm run dev

# Terminal 2
cd C:/Users/eozeg/COD/frontend
npm run dev
```

If you want the old convenience launcher, run `npm run dev:all` from `frontend/` instead.

Open `http://localhost:5173` in two or more browser tabs. The first player is shown as the room owner and can start/manage the room directly; `HOST_SECRET` from `backend/.env` can also be used for remote/admin control. The owner can set the round duration and room capacity before deployment. A round still requires at least two players.

For a production-style single process:

```bash
cd C:/Users/eozeg/COD/backend
npm run build

cd ../frontend
npm run build
npm start
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
