#!/bin/bash
# Cron Watchdog
# Checks if Cybersolybot is running. If not, starts it.

if pgrep -f "node.*index.js" > /dev/null; then
    # echo "Bot is running."
    exit 0
else
    echo "[Watchdog] Bot not found. Starting..." >> logs/watchdog.log
    cd /home/cyber/.openclaw/workspace/cybersolybot
    # Start the restart loop script
    nohup ./run.sh >> logs/launcher.log 2>&1 &
fi
