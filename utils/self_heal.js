/**
 * self_heal.js
 * The "Medic" of Agent Cyber.
 * Checks system vitals and restarts the heart if needed.
 * Run this via CRON (e.g., every 5 mins).
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const STATUS_FILE = path.join(__dirname, '../data/status.json');
const ALERT_FILE = path.join(__dirname, '../data/agent_alert.txt');
const MAX_SILENCE_MS = 5 * 60 * 1000; // 5 Minutes

function checkVitals() {
    console.log(`[Medic] 🚑 Checking vitals...`);

    if (!fs.existsSync(STATUS_FILE)) {
        reportFailure("Status file missing. Bot may never have started.");
        return;
    }

    try {
        const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        const now = Date.now();
        const silence = now - status.lastUpdate; // Assuming lastUpdate is ms timestamp

        console.log(`[Medic] Status: ${status.status} | Silence: ${Math.round(silence/1000)}s | PID: ${status.pid}`);

        if (silence > MAX_SILENCE_MS) {
            reportFailure(`Bot is comatose (Silent for ${Math.round(silence/1000)}s). Restarting...`);
            restartBot(status.pid);
        } else if (status.health === 'CRITICAL' || status.health === 'DEAD') {
            reportFailure(`Bot reported CRITICAL health. Restarting...`);
            restartBot(status.pid);
        } else {
            console.log(`[Medic] ✅ Vitals OK.`);
        }

    } catch (err) {
        reportFailure(`Corrupted status file: ${err.message}`);
    }
}

function reportFailure(msg) {
    console.error(`[Medic] 🚨 ${msg}`);
    // Write alert for Agent Cyber (OpenClaw) to pick up
    fs.writeFileSync(ALERT_FILE, `[${new Date().toISOString()}] SELF_HEAL_TRIGGERED: ${msg}`);
}

function restartBot(pid) {
    // 1. Kill old process
    if (pid) {
        try {
            process.kill(pid, 'SIGKILL');
            console.log(`[Medic] 🔫 Killed PID ${pid}`);
        } catch (e) {
            console.log(`[Medic] PID ${pid} not found (already dead?).`);
        }
    } else {
        // Fallback: Kill by name
        exec('pkill -f "node cybersolybot/index.js"', (err) => {
             if(!err) console.log("[Medic] Killed via pkill.");
        });
    }

    // 2. Restart mechanism
    // In a supervised environment (PM2/Docker), killing is enough.
    // If running raw, we can try to spawn it, but that risks zombies.
    // For now, we assume Supervisor/User will restart.
    console.log("[Medic] Process killed. Waiting for supervisor to restart.");
}

checkVitals();
