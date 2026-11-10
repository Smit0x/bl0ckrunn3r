// Read-only API: serves the keeper's caches over HTTP.
// - GET /history            -> last 20 rounds (history.json)
// - GET /claimable?address= -> rounds + amounts claimable by that wallet
// - GET /health             -> ok
// Vercel proxies to this server-to-server; no auth needed.
import 'dotenv/config';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, http, parseAbi } from 'viem';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = join(__dirname, 'history.json');
const WINNERS_FILE = join(__dirname, 'winners.json');
const PORT = Number(process.env.API_PORT || 3001);

const RPC_URL = process.env.RPC_URL;
const PREDICT_ADDRESS = process.env.PREDICT_ADDRESS;

const publicClient =
  RPC_URL && PREDICT_ADDRESS ? createPublicClient({ transport: http(RPC_URL) }) : null;

const predictAbi = parseAbi(['function userStake(uint256,address,uint256) view returns (uint256)']);

function loadHistory() {
  try {
    const data = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function loadWinners() {
  try {
    const data = JSON.parse(readFileSync(WINNERS_FILE, 'utf8'));
    return Array.isArray(data?.winners) ? data.winners : [];
  } catch {
    return [];
  }
}

async function computeClaimable(address, winners) {
  if (!publicClient) return [];
  const out = [];
  for (const w of winners) {
    const dists = w.winningDistances || [];
    let amount = 0n;
    const numbers = [];
    for (let j = 0; j < dists.length; j++) {
      const d = dists[j];
      const tier = BigInt(w.tierReward?.[j] || '0');
      const totalStake = BigInt(w.distanceTotalStake?.[j] || '0');
      if (totalStake === 0n) continue;
      const candidates = d === 0 ? [w.result] : [w.result - d, w.result + d];
      for (const n of candidates) {
        if (n < 0) continue;
        const stake = await publicClient.readContract({
          address: PREDICT_ADDRESS,
          abi: predictAbi,
          functionName: 'userStake',
          args: [BigInt(w.id), address, BigInt(n)],
        });
        if (stake > 0n) {
          amount += (tier * stake) / totalStake;
          numbers.push(n);
        }
      }
    }
    if (numbers.length > 0) {
      out.push({ roundId: w.id, amount: amount.toString(), numbers });
    }
  }
  return out;
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/history') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(loadHistory()));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/claimable') {
    const address = (url.searchParams.get('address') || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid address' }));
      return;
    }
    try {
      const items = await computeClaimable(address, loadWinners());
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(items));
    } catch (e) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`[history-api] listening on :${PORT}`);
});
