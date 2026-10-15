#!/bin/bash
set -e

# Navigate to the repository root directory
cd "$(dirname "$0")"

APP_NAME="Baba-Cyborg-DC"

echo ">>> [1/4] Pulling latest changes from Git..."
git pull

echo ">>> [2/4] Installing production dependencies..."
npm install --omit=dev

echo ">>> [3/4] Ensuring .env exists..."
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "WARNING: .env not found. Copying from .env.example..."
    cp .env.example .env
    echo "Please configure your DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env!"
  fi
fi

echo ">>> [4/4] Checking PM2 process ($APP_NAME)..."
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
  echo ">>> '$APP_NAME' is already registered in PM2. Restarting with updated environment..."
  pm2 restart "$APP_NAME" --update-env
else
  echo ">>> No PM2 instance found for '$APP_NAME'. Creating and starting it..."
  if [ -f ecosystem.config.cjs ]; then
    pm2 start ecosystem.config.cjs
  else
    pm2 start server.cjs --name "$APP_NAME"
  fi
fi

pm2 save

echo ""
echo "=== $APP_NAME is up to date and active! ==="
pm2 status "$APP_NAME"
