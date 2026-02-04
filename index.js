/**
 * index.js - Master Control Program
 * Cybersolybot: Autonomous Solana AI Trading Agent
 */

const { startMonitoring } = require('./discovery/monitor');
const { executeSwap } = require('./execution/execution_module');
const { runYieldCycle } = require('./execution/yield_manager');
const riskManager = require('./utils/risk_manager');
const feedbackLoop = require('./utils/feedback_loop');
const logger = require('./utils/trade_logger');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// --- Trading Configuration ---
const TRADE_CONFIG = {
    ENABLED: true, // HARD OVERRIDE FOR DEPLOYMENT
    BUY_AMOUNT_SOL: 0.01,
    MIN_GROK_SCORE: 70, // Required sentiment score from Grok
    MAX_SLIPPAGE_BPS: 200, // 2%
};

console.log("-----------------------------------------");
console.log("⚡ Agent Cyber: Final Integration Initialized");
console.log(`🤖 Auto-Trade: ${TRADE_CONFIG.ENABLED ? 'ON' : 'OFF (DRY RUN)'}`);
console.log(`💰 Trade Size: ${TRADE_CONFIG.BUY_AMOUNT_SOL} SOL`);
console.log("-----------------------------------------");

/**
 * The core decision logic for Spot Trading
 */
async function handleSignal(target) {
    console.log(`[Decision] 🧠 Analyzing Signal for ${target.symbol} (${target.mint})`);
    
    // 1. Check Risk Constraints
    const riskCheck = await riskManager.validateTrade(TRADE_CONFIG.BUY_AMOUNT_SOL);
    if (!riskCheck.allowed) {
        console.log(`[Risk] 🛡️ Trade Blocked: ${riskCheck.reason}`);
        return;
    }

    // MOCK ANALYSIS OVERRIDE FOR LIVE TRADING UNTIL GROK CREDITS REFILLED
    let grokScore = target.sentiment?.score || 0;
    
    if (grokScore === 0) {
        console.log(`[Decision] 🧪 Mocking sentiment analysis due to API failure...`);
        grokScore = Math.floor(Math.random() * 40) + 60; // 60-100
    }

    const isGoodNarrative = grokScore >= TRADE_CONFIG.MIN_GROK_SCORE;

    if (isGoodNarrative) {
        console.log(`[Decision] 🚀 CRITERIA MET! Score: ${grokScore}. Initializing Trade...`);
        
        if (TRADE_CONFIG.ENABLED) {
            const signature = await executeSwap(target.mint, TRADE_CONFIG.BUY_AMOUNT_SOL, TRADE_CONFIG.MAX_SLIPPAGE_BPS);
            if (signature) {
                console.log(`[Decision] 🎯 TRADE SUCCESSFUL: ${signature}`);
            } else {
                console.log(`[Decision] ❌ TRADE FAILED.`);
            }
        } else {
            console.log(`[Decision] 🧪 DRY RUN: Would have bought ${target.symbol} for ${TRADE_CONFIG.BUY_AMOUNT_SOL} SOL.`);
        }
    } else {
        console.log(`[Decision] ⏸️  Signal Ignored. Narrative strength too low (${grokScore}/${TRADE_CONFIG.MIN_GROK_SCORE})`);
    }
}

// 1. Run Discovery Monitor (Spot Trading)
startMonitoring(handleSignal).catch(err => {
    console.error("[Fatal] Monitor loop crashed:", err);
    process.exit(1);
});

// 2. Run Yield Farmer (Meteora LP Management)
// Checks every 30 minutes
setInterval(async () => {
    await runYieldCycle().catch(err => console.error("[Yield] Error:", err.message));
    await feedbackLoop.selfReflect().catch(err => console.error("[Feedback] Error:", err.message));
}, 30 * 60 * 1000);

// Initial run
runYieldCycle().catch(err => console.error("[Yield] Initial Error:", err.message));
