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

# Replace only processes whose script belongs to this exact checkout.
# A restart alone preserves old cluster mode and instance counts.
PROCESS_IDS="$(pm2 jlist | node -e '
const fs = require("fs"), path = require("path");
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  const target = fs.realpathSync(path.resolve("server.cjs"));
  const ids = JSON.parse(input).filter(p => {
    try { return fs.realpathSync(p.pm2_env.pm_exec_path) === target; }
    catch { return false; }
  }).map(p => p.pm_id);
  process.stdout.write(ids.join(" "));
});
')"
for id in $PROCESS_IDS; do
  pm2 delete "$id"
done
pm2 start ecosystem.config.js --only "$APP_NAME"

# Check both PM2 and HTTP; an unrelated listener must not count as success.
node scripts/verify-deployment.cjs
pm2 save
pm2 status "$APP_NAME"
echo "Deployment verified. Your tunnel must target the PORT in this checkout's .env."
