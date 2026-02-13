#!/bin/bash
cd /home/cyber/.openclaw/workspace/cybersolybot

# 1. Run the Node.js updater script
node utils/dashboard_updater.js

# 2. Check if data.json changed
if git diff --quiet docs/data.json; then
    echo "No changes in dashboard data."
else
    echo "Data updated. Pushing to GitHub..."
    git add docs/data.json
    git commit -m "Update dashboard stats [skip ci]"
    git push origin master
fi
