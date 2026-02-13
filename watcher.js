/**
 * watcher.js
 * Watches for file changes and triggers dashboard updates.
 * Keeps the GitHub Pages dashboard fresh.
 */

const fs = require('fs');
const path = require('path');
const { updateDashboard } = require('./utils/dashboard_updater');

const DATA_DIR = path.join(__dirname, 'data');
const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 Minutes

console.log(`[Watcher] 👁️ Dashboard Monitor Active. Updating every ${UPDATE_INTERVAL_MS / 1000}s.`);

// Initial update
updateDashboard();

// Scheduled Loop
setInterval(() => {
    try {
        updateDashboard();
        
        // Auto-Push to GitHub Pages
        const { execSync } = require('child_process');
        try {
            console.log("[Watcher] ☁️ Pushing dashboard update to GitHub...");
            // Stage docs/data.json
            execSync('git add docs/data.json', { cwd: path.join(__dirname, '..') });
            // Commit if changes exist
            try {
                execSync('git commit -m "Auto-Update Dashboard Data"', { cwd: path.join(__dirname, '..') });
                // Push
                execSync('git push origin master', { cwd: path.join(__dirname, '..') });
                console.log("[Watcher] ✅ GitHub Pages Updated.");
            } catch (gitErr) {
                if (gitErr.message.includes('nothing to commit')) {
                    console.log("[Watcher] 💤 No changes to push.");
                } else {
                    throw gitErr;
                }
            }
        } catch (pushErr) {
            console.error("[Watcher] ⚠️ Git Push Failed:", pushErr.message);
        }
        
    } catch (err) {
        console.error("[Watcher] ❌ Update failed:", err.message);
    }
}, UPDATE_INTERVAL_MS);

// File Watcher (Reactive Update)
// If positions.json changes (trade happens), update immediately.
fs.watch(path.join(DATA_DIR, 'positions.json'), (eventType, filename) => {
    if (eventType === 'change') {
        console.log(`[Watcher] ⚡ Detected trade activity. Triggering immediate update.`);
        // Debounce slightly
        setTimeout(updateDashboard, 2000); 
    }
});
