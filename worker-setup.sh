#!/bin/bash
# Orkestro Worker Node Automated Setup

echo "=== Orkestro Worker Setup ==="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node v18+ to proceed."
    exit 1
fi

echo "[1/4] Installing NPM dependencies..."
npm install

if ! command -v pm2 &> /dev/null; then
    echo "[2/4] PM2 not found, installing PM2 globally..."
    npm install -g pm2
else
    echo "[2/4] PM2 is already installed."
fi

echo "[3/4] Configuring environment variables..."
if [ ! -f ".env" ]; then
    echo ".env file not found. Creating a baseline .env..."
    echo "WORKER_ID=orkestro-worker-$RANDOM" > .env
    echo "MASTER_URL=ws://127.0.0.1:8787" >> .env
    echo "REDIS_URL=redis://127.0.0.1:6379" >> .env
    echo "WORKER_CAPACITY=4" >> .env
    echo "WARNING: Check your .env file! Update MASTER_URL and REDIS_URL to match your main Orkestro server IP."
else
    echo ".env file exists. Skipping generation."
fi

echo "[4/4] Setup complete!"
echo ""
echo "You can now run this worker in the background using PM2:"
echo "    pm2 start npm --name 'orkestro-worker' -- run start"
echo "    pm2 save"
echo "To monitor logs: pm2 logs orkestro-worker"
echo "When connected, you will see a 'Fleet connection established' echo."
