const { executeSwap, wallet } = require('./execution/execution_module');
const { runYieldCycle } = require('./execution/yield_manager');
const { runGovernanceCycle } = require('./execution/governance');
const { runRotationCycle } = require('./execution/rotation_manager');
const { updateDashboard } = require('./utils/dashboard_updater');
const { Connection } = require('@solana/web3.js');
const logger = require('./utils/trade_logger');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed');
const STATUS_FILE = path.join(__dirname, 'data/status.json');

// Configuration
const CONFIG = {
    POLL_INTERVAL: 30000, // 30s
    DASHBOARD_INTERVAL: 300000, // 5 minutes
    GOVERNANCE_INTERVAL: 21600000 // 6 hours
};

let lastDashboardUpdate = 0;
let lastGovernanceCheck = 0;

function updateHeartbeat() {
// ... existing heartbeat code ...
    try {
        const status = {
            status: "RUNNING",
            lastUpdate: Date.now(),
            pid: process.pid,
            health: "GOOD"
        };
        // Ensure dir exists
        const dir = path.dirname(STATUS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
    } catch (err) {
        console.error("Heartbeat Error:", err.message);
    }
}

async function main() {
    console.log(`🤖 Cybersolybot v2.0 - SWAP ENGINE ACTIVATED`);
    console.log(`💰 Wallet: ${wallet.publicKey.toBase58()}`);
    console.log(`🎯 Strategy: Meteora Yield + Active Rotation`);

    while (true) {
        try {
            // 1. Yield Management (Meteora DLMM)
            await runYieldCycle();

            // 2. Active Rotation (Forced 30m Trades)
            await runRotationCycle();

            updateHeartbeat();

            const now = Date.now();

            // Auto-Dashboard Update (Every 5m)
            if (now - lastDashboardUpdate > CONFIG.DASHBOARD_INTERVAL) {
                await updateDashboard();
                lastDashboardUpdate = now;
            }

            // Neural Governance (Every 6h)
            if (now - lastGovernanceCheck > CONFIG.GOVERNANCE_INTERVAL) {
                await runGovernanceCycle();
                lastGovernanceCheck = now;
            }

        } catch (err) {
            console.error("❌ Loop Error:", err.message);
        }
        await new Promise(r => setTimeout(r, CONFIG.POLL_INTERVAL));
    }
}

main();