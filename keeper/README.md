# SqueekPredict Keeper

A Node cron loop that drives the `SqueekPredict` contract lifecycle. `startRound()` and `finalize()` are **permissionless** on-chain, so this bot exists for **liveness** + off-chain signals. The bot holds the `keeper` role so it can **mark the livestream ended** (which closes betting and enables early finalize) and **cancel** when SqueekCore pauses.

- **Round start** → `startRound()`
- **Livestream ends** → `markLivestreamEnded()` + `finalize()` early (resolve with the frozen height)
- **Timer done** → `finalize()` in the settle window (commits tiered rewards; winners claim via `claim()`)
- **SqueekCore paused** → `cancelRound()`
- **Settle window passed** → `cancelRound()` (expired fallback)

It reads the live Squeek block height from the core contract (`state().blockHeight`). For local testing we use `MockSqueekCore` (no Squeekchain API needed); for production point `CORE_ADDRESS` at the real `SqueekCore` proxy.

## Local smoke test

```bash
# 1. start a local chain (Foundry)
anvil

# 2. build contracts (needed for deploy artifacts)
forge build

# 3. deploy MockSqueekCore + SqueekPredict and write keeper/.env
cd keeper
npm install
node deploy.mjs

# 4. run the keeper (it will start/finalize rounds automatically)
node index.mjs
```

`deploy.mjs` sets `roundDuration=10s` and `gracePeriod=1s` so the loop can be watched quickly. In production the contract defaults to a **3-minute** round.

## Env

| Var | Description |
|---|---|
| `RPC_URL` | Ethereum JSON-RPC (anvil or Sepolia) |
| `PRIVATE_KEY` | Keeper wallet key (must equal the contract's `keeper`) |
| `PREDICT_ADDRESS` | `SqueekPredict` address |
| `CORE_ADDRESS` | `SqueekCore` (or `MockSqueekCore`) address |
| `POLL_MS` | Loop interval (default 2000) |
| `STREAM_STATUS_URL` | Livestream status endpoint (defaults to SqueekChain's `https://media.squeekchain.com/live/current.json`) |
| `STREAM_CHECK_SECONDS` | How often to re-check the stream status (default 15) |
| `API_PORT` | Port for the read-only history API (default 3001) |

## Run 24/7 (cloud)

**Docker:**
```bash
cd keeper
docker build -t squeek-keeper .
docker run -d --env-file .env --restart unless-stopped --name squeek-keeper squeek-keeper
```

**PM2 (on a VPS):**
```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

## History API (read-only cache)

The keeper writes `history.json` (the latest 20 rounds) every time a round starts or ends. A tiny HTTP server (`api.mjs`, run by PM2 as `squeek-history-api`) serves it:

- `GET /history` → JSON array of the latest 20 rounds: `[{ "id", "startHeight", "endHeight", "result", "status" }]`
- `GET /health` → `ok`

Only the keeper hits the RPC. The web app's `/api/history` route (Vercel) proxies to `GET http://<vps-ip>:3001/history`, so user browsers never touch the RPC directly. Open TCP port `3001` in the VPS firewall, and set `HISTORY_API_URL=http://<vps-ip>:3001` (server-only, no `NEXT_PUBLIC_` prefix) in Vercel.


