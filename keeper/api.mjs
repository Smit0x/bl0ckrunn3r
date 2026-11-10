// Read-only history API: serves the keeper's history.json over HTTP.
// Vercel's /api/history proxies to this server-to-server, so no auth needed.
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = join(__dirname, 'history.json');
const PORT = Number(process.env.API_PORT || 3001);

function loadHistory() {
  try {
    const data = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const server = createServer((req, res) => {
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
