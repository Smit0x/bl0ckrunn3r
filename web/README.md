# BlockRunner Web

Next.js + Privy (embedded wallets) + viem. No wagmi layer — fewer dependencies.

## Setup

1. Create a Privy app at https://dashboard.privy.io and copy its App ID.
2. Set the following values in `web/.env.local` (the app reads config from `.env.local`):
   - `NEXT_PUBLIC_PRIVY_APP_ID` — your Privy App ID.
   - `NEXT_PUBLIC_PREDICT_ADDRESS` — your deployed contract address (either `SqueekPredict` or `SqueekPredictManual`).
   - `NEXT_PUBLIC_RPC_URL` — Sepolia RPC (default set).
3. `npm install && npm run dev`.

## How it avoids repeated wallet signature popups

- Users log in once (email / wallet). An embedded wallet is created automatically on login only for users who don't bring their own wallet (`embeddedWallets.createOnLogin`).
- Contract calls are sent directly through the connected wallet's EIP-1193 provider via viem. Privy-embedded wallets sign without a popup; external wallets (Rabby/MetaMask) show their own confirmation as expected.

## Game

Each round lasts **3 minutes**. Users pick a **number** = how many blocks SqueekChain produces in that window. The 4 closest distinct predictions win fixed tiers (50/25/15/10%). The number grid shows, for every picked number, the **count of users** (`#N`) and the total staked.

- **`SqueekPredict`** (real): the result is `SqueekCore.state().blockHeight` at round end minus the height at round start. Settling is permissionless and bounded (refund fallback for expired rounds).
- **`SqueekPredictManual`** (simulated): fully self-contained. Anyone presses **Start round** to begin a 3-minute simulated production window (random total blocks), then anyone presses **Finalize round** to resolve (only the owner can **Cancel round**). Rewards are claimed manually with **Claim winnings**.

## Auto-simulated block production (no SqueekCore needed)

`SqueekPredictManual` is the simulator. When anyone presses **Start round**, the contract simulates a 3-minute window: `currentHeight()` ramps linearly from 0 to a random `_roundBlocks` total (between `minBlocksPerRound` and `maxBlocksPerRound`, default 1–100). Players bet on the final block count while the round runs; betting closes at `endTime`, then anyone presses **Finalize round** and winners pull their rewards via **Claim winnings**.


## Squeekchain live video embed

A `LiveStream` component sits above the block ladder and shows Squeekchain's
live video **automatically** — no config, env vars, or API keys needed.

Squeekchain publishes a live-stream descriptor at
`https://media.squeekchain.com/live/current.json` (the same file their own site
polls). The server route `app/api/squeek-live/route.ts` fetches it and, when it
reports `state: "live"`, returns the X broadcast embed URL
(`https://studio.x.com/embed/broadcast/<id>`), which the client renders in an
iframe. The client polls every 15s, so the video appears when a stream starts
and disappears when it ends.

The descriptor is fetched server-side because `media.squeekchain.com`'s CORS
allowlist only covers squeekchain.com origins.


## Squeekchain live status (official API)

Squeekchain publishes a free, read-only HTTP API — no key, and CORS-enabled
(`Access-Control-Allow-Origin: *`) so the browser can call it directly:

- `GET https://api.squeekchain.com/v1/status` — live pipeline state: whether the
  wheel is running (`measurement.freshness`, `measurement.coreStatus`,
  `measurement.rpmMilli`), the settled and projected block height, and Oracle /
  settlement-queue state.
- `GET https://api.squeekchain.com/v1/core` — settled `blockHeight`,
  `blockProgress`, and the `paused` flag.
- `GET /healthz` and `/readyz` — API health.

`SqueekStatus.tsx` polls `/v1/status` every 15s and shows a badge with the
current projected block height and wheel RPM above the ladder. Full reference:
https://docs.squeekchain.com/developers/api

The API reports the **data** (liveness, block height, wheel speed), not the
**video**. The live video is a separate stream (on X); use the embed above to
show it.

