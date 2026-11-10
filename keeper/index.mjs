// Keeper (cron) for SqueekPredict.
// Handles: round start, round end + reward distribution (finalize), and emergency cancel.
// - Livestream ends mid-round  -> markLivestreamEnded() + finalize early.
// - SqueekCore paused          -> cancelRound().
// - Timer done (settle window) -> finalize(); window passed -> cancelRound().
// startRound()/finalize() are permissionless on-chain; this bot exists for liveness + off-chain signals.
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = join(__dirname, 'history.json');
const WINNERS_FILE = join(__dirname, 'winners.json');
const HISTORY_LIMIT = 20;

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PREDICT_ADDRESS = process.env.PREDICT_ADDRESS;
const CORE_ADDRESS = process.env.CORE_ADDRESS;
const POLL_MS = Number(process.env.POLL_MS || 2000);
const STREAM_STATUS_URL = process.env.STREAM_STATUS_URL || 'https://media.squeekchain.com/live/current.json';
const STREAM_CHECK_SECONDS = Number(process.env.STREAM_CHECK_SECONDS || 15);

for (const [k, v] of Object.entries({ RPC_URL, PRIVATE_KEY, PREDICT_ADDRESS, CORE_ADDRESS })) {
  if (!v) throw new Error(`Missing env: ${k}`);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

// Unnamed tuple components -> viem returns plain arrays (positional).
const predictAbi = parseAbi([
  'function currentRoundId() view returns (uint256)',
  'function gamePaused() view returns (bool)',
  'function keeper() view returns (address)',
  'function gracePeriod() view returns (uint256)',
  'function settleWindow() view returns (uint256)',
  'function getRound(uint256) view returns ((uint256,uint256,uint256,uint64,uint64,uint256,uint256,uint8))',
  'function getWinningDistances(uint256) view returns (uint256[])',
  'function tierReward(uint256,uint256) view returns (uint256)',
  'function distanceTotalStake(uint256,uint256) view returns (uint256)',
  'function startRound()',
  'function finalize(uint256 roundId)',
  'function cancelRound(uint256 roundId)',
  'function markLivestreamEnded()',
]);

const coreAbi = parseAbi([
  'function state() view returns ((uint64,uint64,uint96,uint64,uint96,uint32,uint256,bool))',
]);

const P = { address: PREDICT_ADDRESS, abi: predictAbi };
const C = { address: CORE_ADDRESS, abi: coreAbi };

async function sendAndWait(fn) {
  try {
    const hash = await fn();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      console.error('  tx reverted:', receipt.transactionHash);
      return false;
    }
    return true;
  } catch (e) {
    console.error('  write failed:', e.shortMessage || e.message);
    return false;
  }
}

// ---- round history cache (latest 20 rounds, written to history.json) ----
function saveHistory(rows) {
  const tmp = `${HISTORY_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(rows));
  renameSync(tmp, HISTORY_FILE);
}

let lastHistoryRoundId = null;
let lastHistoryStatus = null;

async function refreshHistory(roundId) {
  const count = Math.min(Number(roundId), HISTORY_LIMIT);
  const start = Math.max(1, Number(roundId) - count + 1);
  const rows = [];
  for (let i = Number(roundId); i >= start; i--) {
    try {
      const r = await publicClient.readContract({ ...P, functionName: 'getRound', args: [BigInt(i)] });
      rows.push({ id: i, startHeight: Number(r[0]), endHeight: Number(r[1]), result: Number(r[2]), status: r[7] });
    } catch {
      // skip unreadable rounds
    }
  }
  rows.reverse(); // oldest -> newest
  saveHistory(rows);
  console.log(`[${new Date().toISOString()}] history updated (${rows.length} rounds)`);
}

// ---- winners cache (complete list of finalized rounds' winning tiers) ----
function loadWinners() {
  try {
    const data = JSON.parse(readFileSync(WINNERS_FILE, 'utf8'));
    return {
      lastScannedId: Number(data?.lastScannedId || 0),
      winners: Array.isArray(data?.winners) ? data.winners : [],
    };
  } catch {
    return { lastScannedId: 0, winners: [] };
  }
}

function saveWinners(data) {
  const tmp = `${WINNERS_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, WINNERS_FILE);
}

async function readWinnerData(id, result) {
  const dists = await publicClient.readContract({ ...P, functionName: 'getWinningDistances', args: [BigInt(id)] });
  const winningDistances = [];
  const tierReward = [];
  const distanceTotalStake = [];
  for (const d of dists) {
    const tr = await publicClient.readContract({ ...P, functionName: 'tierReward', args: [BigInt(id), d] });
    const ds = await publicClient.readContract({ ...P, functionName: 'distanceTotalStake', args: [BigInt(id), d] });
    winningDistances.push(Number(d));
    tierReward.push(tr.toString());
    distanceTotalStake.push(ds.toString());
  }
  return { id, result, winningDistances, tierReward, distanceTotalStake };
}

async function refreshWinners(roundId) {
  const data = loadWinners();
  const target = Number(roundId);
  let i = data.lastScannedId + 1;
  for (; i <= target; i++) {
    try {
      const r = await publicClient.readContract({ ...P, functionName: 'getRound', args: [BigInt(i)] });
      const status = r[7];
      if (status === 1) break; // current round still betting; revisit next refresh
      if (status === 2) {
        data.winners.push(await readWinnerData(i, Number(r[2])));
      }
      data.lastScannedId = i; // finalized (2) or cancelled (3): done scanning this round
    } catch {
      break; // transient read error; retry next refresh
    }
  }
  saveWinners(data);
}

async function maybeRefreshHistory(roundId, status) {
  if (roundId === lastHistoryRoundId && status === lastHistoryStatus) return;
  lastHistoryRoundId = roundId;
  lastHistoryStatus = status;
  await refreshHistory(roundId);
}

let lastStreamCheck = 0;
let cachedStreamLive = true;

// Off-chain "is the livestream still live?" check.
// Defaults to SqueekChain's public live descriptor ({"state":"live", "validUntil": ...}).
async function isStreamLive() {
  const nowMs = Date.now();
  if (nowMs - lastStreamCheck < STREAM_CHECK_SECONDS * 1000) return cachedStreamLive;
  lastStreamCheck = nowMs;
  try {
    const res = await fetch(STREAM_STATUS_URL, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json', Origin: 'https://squeekchain.com' },
    });
    if (!res.ok) {
      cachedStreamLive = false; // 404 => not live
      return false;
    }
    const d = await res.json();
    const until = d.validUntil ? Date.parse(d.validUntil) : NaN;
    const live = d.state === 'live' && Number.isFinite(until) && until > Date.now();
    cachedStreamLive = live;
    return live;
  } catch {
    cachedStreamLive = true; // on error assume live (avoid false early finalize)
    return cachedStreamLive;
  }
}

async function tick() {
  const [roundId, gamePaused, keeperAddr, gracePeriod, settleWindow] = await Promise.all([
    publicClient.readContract({ ...P, functionName: 'currentRoundId' }),
    publicClient.readContract({ ...P, functionName: 'gamePaused' }),
    publicClient.readContract({ ...P, functionName: 'keeper' }),
    publicClient.readContract({ ...P, functionName: 'gracePeriod' }),
    publicClient.readContract({ ...P, functionName: 'settleWindow' }),
  ]);

  if (keeperAddr.toLowerCase() !== account.address.toLowerCase()) {
    console.log(`[${new Date().toISOString()}] not keeper (keeper=${keeperAddr})`);
    return;
  }
  if (gamePaused) {
    console.log(`[${new Date().toISOString()}] game paused, skipping`);
    return;
  }

  const [coreState, block] = await Promise.all([
    publicClient.readContract({ ...C, functionName: 'state' }),
    publicClient.getBlock({ blockTag: 'latest' }),
  ]);
  const height = coreState[3]; // blockHeight
  const corePaused = coreState[7]; // paused
  // Use the chain's clock (block.timestamp) so settle timing tracks the same
  // clock the contract's `require(block.timestamp ...)` checks use, regardless
  // of how much the VPS clock drifts from the chain.
  const now = block.timestamp;

  const start = () => sendAndWait(() => walletClient.writeContract({ ...P, functionName: 'startRound' }));
  const finalize = (id) => sendAndWait(() => walletClient.writeContract({ ...P, functionName: 'finalize', args: [id] }));
  const cancel = (id) => sendAndWait(() => walletClient.writeContract({ ...P, functionName: 'cancelRound', args: [id] }));
  const markEnded = () => sendAndWait(() => walletClient.writeContract({ ...P, functionName: 'markLivestreamEnded' }));

  if (roundId === 0n) {
    console.log(`[${new Date().toISOString()}] height=${height} -> startRound (first)`);
    await start();
    return;
  }

  const round = await publicClient.readContract({ ...P, functionName: 'getRound', args: [roundId] });
  const status = round[7];
  const endTime = round[4];

  if (status === 1) {
    // Betting
    if (corePaused) {
      console.log(`[${new Date().toISOString()}] height=${height} corePaused -> cancelRound(${roundId})`);
      await cancel(roundId);
    } else if (!(await isStreamLive())) {
      console.log(`[${new Date().toISOString()}] height=${height} livestream ended -> markLivestreamEnded + finalize(${roundId})`);
      await markEnded();
      const ok = await finalize(roundId);
      if (ok) {
        console.log(`[${new Date().toISOString()}] -> startRound (next)`);
        await start();
      }
    } else if (now >= endTime + gracePeriod && now <= endTime + gracePeriod + settleWindow) {
      console.log(`[${new Date().toISOString()}] height=${height} round ${roundId} timer done -> finalize`);
      const ok = await finalize(roundId);
      if (ok) {
        console.log(`[${new Date().toISOString()}] -> startRound (next)`);
        await start();
      }
    } else if (now > endTime + gracePeriod + settleWindow) {
      console.log(`[${new Date().toISOString()}] round ${roundId} settle window passed -> cancelRound`);
      await cancel(roundId);
    }
    // else: stream live, blocks may be stalled -> wait for the full timer
  } else {
    // Finalized (2) or Cancelled (3): open the next round
    console.log(`[${new Date().toISOString()}] round ${roundId} status=${status} -> startRound`);
    await start();
  }

  // Refresh the history cache whenever a round starts or ends.
  await maybeRefreshHistory(roundId, status);
  // Winners cache is incremental and cheap: run every tick so a just-finalized
  // round is recorded before the next round becomes visible to the frontend.
  await refreshWinners(roundId);
}

async function loop() {
  try {
    await tick();
  } catch (e) {
    console.error('[keeper] tick error:', e.shortMessage || e.message);
  }
  setTimeout(loop, POLL_MS);
}

console.log(
  `[keeper] starting account=${account.address} predict=${PREDICT_ADDRESS} core=${CORE_ADDRESS} poll=${POLL_MS}ms stream=${STREAM_STATUS_URL || '(none)'}`,
);
loop();

