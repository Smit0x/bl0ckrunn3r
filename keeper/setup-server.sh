#!/usr/bin/env bash
set -euo pipefail

# One-shot keeper setup for an Ubuntu/Debian VPS.
# Run it from the keeper/ directory after cloning the repo:
#   cd bl0ckrunn3r/keeper && bash setup-server.sh

PREDICT_ADDRESS="${PREDICT_ADDRESS:-0x7B0EC536AeF48f063C3521d66D630ada217C2900}"
CORE_ADDRESS="${CORE_ADDRESS:-0x74665dAecA35A2303e767E76a2FF1FB6F93e119f}"
RPC_URL="${RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"

echo "==> Installing Node.js 20 (if needed)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> Installing PM2 (if needed)..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

cd "$(dirname "$0")"

echo "==> Installing dependencies..."
npm install

echo "==> Writing .env..."
read -r -p "Paste the keeper wallet private key (0x...): " KEY
if [ -z "$KEY" ]; then
  echo "No key provided; aborting."
  exit 1
fi

cat > .env <<EOF
RPC_URL=${RPC_URL}
PRIVATE_KEY=${KEY}
PREDICT_ADDRESS=${PREDICT_ADDRESS}
CORE_ADDRESS=${CORE_ADDRESS}
POLL_MS=2000
STREAM_STATUS_URL=https://media.squeekchain.com/live/current.json
STREAM_CHECK_SECONDS=15
EOF
chmod 600 .env
echo ".env written."

echo "==> Starting keeper with PM2..."
pm2 start index.mjs --name squeek-keeper
pm2 save
pm2 startup
pm2 status
echo "Done! Logs: pm2 logs squeek-keeper"
