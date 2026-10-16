#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
APP_NAME="Baba-Cyborg-DC"

echo ">>> Pulling current deployment..."
git pull --ff-only
npm ci --omit=dev
if [ ! -f .env ]; then
  echo "Missing .env. Create it with your free PORT and Discord settings before starting." >&2
  exit 1
fi
if [ ! -f ecosystem.config.js ]; then
  echo "Missing ecosystem.config.js; update the complete deployment bundle." >&2
  exit 1
fi

# Reuse the existing entry; never delete processes during a normal update.
node scripts/restart-game.cjs

# Check both PM2 and HTTP; an unrelated listener must not count as success.
node scripts/verify-deployment.cjs
pm2 save
pm2 status "$APP_NAME"
echo "Deployment verified. Your tunnel must target the PORT in this checkout's .env."
