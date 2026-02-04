/**
 * yield_manager.js
 * The "Farmer" of Agent Cyber.
 * Handles the lifecycle of Meteora DLMM positions.
 */

const { scanMeteora } = require('../discovery/meteora_scanner');
const logger = require('../utils/trade_logger');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// --- Configuration ---
const YIELD_CONFIG = {
    ENABLED: process.env.AUTO_YIELD === 'true',
    MIN_UTILIZATION: 1.5, // 24h Vol must be 1.5x TVL
    MAX_POSITIONS: 3,
    ALLOCATION_SOL: 0.05,
};

// State tracking for active positions
let activePositions = []; 

/**
 * The Farmer's Decision Engine
 * Orchestrates the Discovery -> Decision -> Execution -> Monitoring loop for Meteora.
 */
async function runYieldCycle() {
    console.log("[Yield] 🌾 Starting Yield Management cycle...");
    
    // 1. DISCOVERY: Get potential high-yield pools
    const pools = await scanMeteora();
    if (!pools || pools.length === 0) return;

    // 2. DECISION: Evaluate opportunities
    for (const pool of pools) {
        const isAlreadyOpen = activePositions.find(p => p.address === pool.address);
        
        if (!isAlreadyOpen && pool.metrics.utilization >= YIELD_CONFIG.MIN_UTILIZATION) {
            if (activePositions.length < YIELD_CONFIG.MAX_POSITIONS) {
                await enterPosition(pool);
            }
        }
    }

    // 3. MONITOR: Watch existing positions for exit/rebalance
    await monitorPositions();
}

/**
 * Logic to enter a DLMM pool
 */
async function enterPosition(pool) {
    console.log(`[Yield] 🚀 DECISION: ENTERING POOL ${pool.name} (Util: ${pool.metrics.utilization}x)`);
    
    if (YIELD_CONFIG.ENABLED) {
        // TODO: Integrate Meteora DLMM SDK for actual 'addLiquidity'
        console.log(`[Yield] ✍️ Signing entry for ${pool.name} with ${YIELD_CONFIG.ALLOCATION_SOL} SOL...`);
    } else {
        console.log(`[Yield] 🧪 DRY RUN: Would have deposited ${YIELD_CONFIG.ALLOCATION_SOL} SOL into ${pool.name}.`);
    }

    const newPos = {
        address: pool.address,
        name: pool.name,
        entryTime: Date.now(),
        entryUtil: pool.metrics.utilization,
        allocation: YIELD_CONFIG.ALLOCATION_SOL
    };

    activePositions.push(newPos);
    
    await logger.logAction({
        type: "YIELD_ENTRY",
        ...newPos,
        status: YIELD_CONFIG.ENABLED ? "executing" : "dry_run"
    });
}

/**
 * Logic to monitor and decide when to EXIT
 */
async function monitorPositions() {
    for (let i = activePositions.length - 1; i >= 0; i--) {
        const pos = activePositions[i];
        console.log(`[Yield] 🔍 Monitoring Position: ${pos.name}...`);
        
        // EXIT STRATEGY:
        // - Utilization drops below 0.8x
        // - Position age > 24 hours (unless ultra-profitable)
        // - Manual kill switch
        
        const ageHours = (Date.now() - pos.entryTime) / (1000 * 60 * 60);
        if (ageHours > 24) {
            console.log(`[Yield] 📉 DECISION: EXITING POOL ${pos.name} (Time Limit reached)`);
            activePositions.splice(i, 1);
            // TODO: Execute withdrawal via SDK
        }
    }
}

module.exports = { runYieldCycle };
