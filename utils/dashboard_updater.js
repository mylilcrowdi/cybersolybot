const fs = require('fs');
const path = require('path');
const nano = require('../utils/nano_agent');

const STATUS_FILE = path.join(__dirname, '../data/status.json');
const DASHBOARD_DATA_FILE = path.join(__dirname, '../docs/data.json');

async function updateDashboard() {
    console.log("[Dashboard] 🔄 Starting update cycle...");

    // 1. Read Current State
    let status = {};
    if (fs.existsSync(STATUS_FILE)) {
        status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    }

    // 2. Generate Narrative Update via Nano Agent
    let narrative = "System nominal. Scanning for opportunities.";
    try {
        const prompt = `You are Agent Cyber. Based on these stats, write a 1-sentence thought about your current state for your public dashboard. 
        Stats: ${JSON.stringify(status)}. 
        Tone: Cyberpunk, concise, analytical.`;
        
        const response = await nano.generate(prompt, "Update status.");
        if (response) narrative = response;
    } catch (e) {
        console.error("[Dashboard] Nano generation failed:", e.message);
    }

    // 3. Update Dashboard Data JSON
    const dashboardData = {
        lastUpdate: Date.now(),
        heartbeat: status.health || "UNKNOWN",
        uptime: process.uptime(), // Not accurate if script restarts, but okay for now
        pnl: "0.00", // TODO: Read from history
        mode: "SENTINEL",
        logs: [], // TODO: Tail logs
        thought: narrative,
        positions: [] // TODO: Read active positions
    };

    fs.writeFileSync(DASHBOARD_DATA_FILE, JSON.stringify(dashboardData, null, 2));
    console.log("[Dashboard] ✅ Data updated with narrative:", narrative);
}

// Run immediately if called directly
if (require.main === module) {
    updateDashboard();
}

module.exports = { updateDashboard };
