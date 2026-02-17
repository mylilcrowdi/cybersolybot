#!/bin/bash
while true; do
    echo "[Launcher] Starting Cybersolybot..."
    node --expose-gc index.js >> logs/bot.log 2>&1
    EXIT_CODE=$?
    echo "[Launcher] Cybersolybot exited with code $EXIT_CODE. Restarting in 5 seconds..."
    sleep 5
done
