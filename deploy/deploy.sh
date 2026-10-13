#!/usr/bin/env bash
#
# Releases the current checkout. Run on the server as the `bhim` user:
#
#   cd /srv/bhim-crm/repo && ./deploy/deploy.sh
#
# Deliberately boring: pull, install, build, migrate, restart, verify. The
# build happens before the service is touched, so a build that fails leaves
# the running version alone.

set -euo pipefail

APP_DIR="/srv/bhim-crm/current"
ENV_FILE="$APP_DIR/.env"

echo "==> Checking environment"
[[ -r "$ENV_FILE" ]] || { echo "Cannot read $ENV_FILE"; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

echo "==> Pulling"
git -C "$APP_DIR" pull --ff-only

cd "$APP_DIR"

echo "==> Installing dependencies"
# `npm ci` and not `npm install`: the lockfile is the input, so the server gets
# exactly what was tested. Dev dependencies are included because the build
# needs them — they are pruned below.
npm ci

echo "==> Building"
# The build is the heaviest thing this VM does. If it is OOM-killed on a
# small size, add swap:
#   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
#   sudo mkswap /swapfile && sudo swapon /swapfile
NODE_OPTIONS=--max-old-space-size=1536 npm run build

echo "==> Migrating"
node scripts/migrate.mjs

echo "==> Seeding master data"
# Idempotent: adds master rows that are missing, changes nothing that exists.
npm run db:seed

# Neon does not enforce lifecycle rules, so abandoned uploads need sweeping.
# Install this once as a daily cron job rather than running it per release:
#   15 2 * * * cd /srv/bhim-crm/current && npm run storage:cleanup #     >> /var/log/bhim-cleanup.log 2>&1

echo "==> Restarting"
sudo systemctl restart bhim-crm

echo "==> Verifying"
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health?deep=1"
    echo
    echo "==> Released."
    exit 0
  fi
  sleep 2
done

echo "Service did not come up. Last 50 log lines:"
sudo journalctl -u bhim-crm -n 50 --no-pager
exit 1
