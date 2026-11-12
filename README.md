# Lendzone

Lendzone is an original, browser-based, real-time 2D side-view arena shooter. The Node.js server is authoritative for movement, platforms, jetpack fuel, bullets, damage, respawns, scores, and match timing. The client renders the world with Canvas and uses Socket.IO for input and snapshots.

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

## Deploy the frontend as a separate Railway service

Create a Railway service from this repository with its **Root Directory** set to `frontend`. Use `npm run build` as the build command and `npm start` as the start command. Do not use `build:server`; the frontend service must build only the Vite client.

Set this frontend service variable before building:

```text
VITE_SERVER_URL=https://YOUR-RAILWAY-BACKEND.up.railway.app
```

The value must be the backend's public origin, without `/socket.io`, a path, or a trailing slash. Vite embeds it at build time, so redeploy after changing it. The frontend now refuses to silently connect to its own origin when this variable is missing.

Set the backend service variables:

```text
MAX_PLAYERS=30
CORS_ORIGIN=https://YOUR-RAILWAY-FRONTEND.up.railway.app
```

Railway supplies `PORT`; the backend binds to `0.0.0.0` and exposes `/health` plus Socket.IO at `/socket.io`. Use HTTPS public domains so the browser can upgrade to WSS. Keep the backend at one replica unless a shared Redis Socket.IO adapter is added; this game currently keeps its single room and combat state in process memory.

The backend URL is an API/Socket.IO service, not the game page. Opening it should return a small JSON status response; open the frontend URL to play.

## Deploy the frontend to Vercel

Create a Vercel project from this repository and set its **Root Directory** to `frontend`. Vercel will use the included `vercel.json` and run `npm run build`, publishing `frontend/dist`.

Add this Vercel environment variable for the Production environment:

```text
VITE_SERVER_URL=https://YOUR-RAILWAY-BACKEND.up.railway.app
```

Use the Railway backend URL without a trailing slash, then redeploy Vercel. The backend Railway service should use `backend` as its Root Directory, `npm run build` as its build command, and `npm start` as its start command. Its `CORS_ORIGIN` value must be your Vercel URL, for example `https://your-game.vercel.app`.

The Railway backend URL is not the game page. It exposes the API, health check, and Socket.IO connection; the playable page is the Vercel URL.

To preview the built frontend locally:

```bash
npm run build
npm start
```

The frontend static server listens on `PORT` (or `4173`). The backend remains a separate Node.js service with WebSocket support; do not deploy the backend as a serverless function.

## Tests and load test

```bash
npm test
npm run smoke
npm run loadtest
```

The smoke test verifies two clients can join and enter the PLAYING state. The load test creates 30 Socket.IO clients by default, sends movement/aim/fire input for 30 seconds, and reports connection, message, and snapshot rates. It does not claim CPU or memory results; collect those from the hosting process while it runs. Configure it with `LOADTEST_URL`, `LOADTEST_CLIENTS`, and `LOADTEST_DURATION_MS`.

## Controls

Desktop: Arrow Left/Right move and turn, Arrow Up jumps and activates the jetpack, Arrow Down aims down, `X` fires, Shift boosts, mouse aims and fires, and `R` reloads. `A/D` and `W` remain supported as alternate movement keys.

Mobile: play in landscape. Use the left stick to move and face, then hold the large SHOOT button to fire in your current facing direction. JUMP and BOOST are beside it.

## Deployment notes

Set `PORT`, `HOST_SECRET`, `MAX_PLAYERS`, `MATCH_DURATION_SECONDS`, and `CORS_ORIGIN` in the backend environment. For every separately hosted frontend, `VITE_SERVER_URL` is required and must point at the same backend origin. Put both services behind HTTPS so Socket.IO can use WSS.

The current MVP intentionally keeps state in process memory and supports one shared room. Restarting the process ends the room and clears scores, which is appropriate for a short-lived company event. Snapshots are sent as volatile 12 Hz updates so stale packets are dropped instead of queued under load; reliable `shot`, `hit`, and elimination events cover short-lived combat events that may happen between snapshots. The `/health` response includes the room and instance ID so multiple-replica mistakes are visible.
