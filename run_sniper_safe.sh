#!/bin/bash
while true; do
    echo "[Watchdog] 🚀 Starting Sniper..."
    node --max-old-space-size=1024 cybersolybot/bot_sniper.js &
    PID=$!
    
    # Run for 15 minutes (900 seconds) - Increased Safety
    sleep 900
    
    echo "[Watchdog] 🛑 Proactive Restart (Memory Safety)..."
    kill $PID
    wait $PID 2>/dev/null
    
    sleep 2
done
