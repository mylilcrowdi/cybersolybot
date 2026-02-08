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

    // 3. Get Recent Logs (Last 48h) & Filter for Neural Stream
    const history = require('../utils/trade_logger').getHistory();
    const cutoff = Date.now() - (48 * 60 * 60 * 1000);
    const recentLogs = history
        .filter(h => new Date(h.timestamp).getTime() > cutoff)
        .map(h => {
            // Format log for UI
            let type = "INFO";
            let agent = "SYSTEM";
            let msg = `Event detected: ${h.type}`;

            if (h.type === "DISCOVERY_SIGNAL") {
                type = "SCAN";
                agent = "SENTINEL";
                msg = `Detected ${h.name} ($${h.symbol}). Score: ${h.score}/100.`;
            } else if (h.type === "DISCOVERY_METEORA") {
                type = "YIELD_SCAN";
                agent = "FARMER";
                msg = `Found ${h.name} pool. Util: ${h.metrics?.utilization || 'N/A'}x`;
            } else if (h.type === "TRADE_EXECUTION") {
                type = "TRADE";
                agent = "FARMER";
                msg = `SWAP EXECUTION: ${h.inputAmount} SOL -> ${h.token}.`;
            } else if (h.type === "SNIPER_ENTRY") {
                type = "SNIPE";
                agent = "HUNTER";
                msg = `FIRED: ${h.symbol} with ${h.amount} SOL.`;
            }

            return {
                time: new Date(h.timestamp).toLocaleTimeString('en-GB'),
                agent: agent,
                type: type,
                message: msg
            };
        })
        .reverse() // Newest first
        .slice(0, 100); // Increased buffer

    // 4. Update Dashboard Data JSON
    const dashboardData = {
        lastUpdate: Date.now(),
        heartbeat: status.health || "UNKNOWN",
        uptime: process.uptime(),
        pnl: "0.00", // TODO: Calculate from closed trades
        mode: "DUAL_CORE",
        logs: recentLogs,
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
