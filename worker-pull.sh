#!/bin/bash
# Orkestro Worker Auto-Updater Script

echo "=== Orkestro Worker Force Pull & Restart ==="

# Fetch latest changes and force reset to origin/main
echo "[1/3] Pulling latest changes from repository..."
git fetch --all
git reset --hard origin/main

# Reinstall dependencies in case new ones were added
echo "[2/3] Checking dependencies..."
npm install

# Clear old PM2 logs and restart the worker
echo "[3/3] Flushing PM2 logs and restarting the worker..."
pm2 flush

if pm2 describe orkestro-worker > /dev/null; then
  pm2 restart orkestro-worker --update-env
else
  echo "[PM2] Process 'orkestro-worker' not found. Starting a new one..."
  pm2 start npm --name "orkestro-worker" -- run start
fi

echo ""
echo "=== Update Completed Successfully! ==="
echo "To monitor new logs: pm2 logs orkestro-worker"
