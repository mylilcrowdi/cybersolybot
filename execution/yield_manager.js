/**
 * yield_manager.js
 * The "Farmer" of Agent Cyber.
 * Handles the lifecycle of Meteora DLMM positions using the @meteora-ag/dlmm SDK.
 */

const { scanMeteora } = require('../discovery/meteora_scanner');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction } = require('@solana/web3.js');
const DLMM = require('@meteora-ag/dlmm').default;
const logger = require('../utils/trade_logger');
const fs = require('fs');
const path = require('path');
const BN = require('bn.js');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// --- Configuration ---
const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, { commitment: 'confirmed' });

const YIELD_CONFIG = {
    ENABLED: process.env.AUTO_YIELD === 'true', // Safety switch
    MIN_UTILIZATION: 1.5,
    MAX_POSITIONS: 3,
    ALLOCATION_SOL: 0.05,
};

// Load Wallet
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');
let wallet;
try {
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')));
    wallet = Keypair.fromSecretKey(secretKey);
} catch (err) {
    console.error(`[Yield] ❌ Wallet load failed:`, err.message);
}

// State tracking
let activePositions = []; 

async function runYieldCycle() {
    if (!wallet) return;
    console.log("[Yield] 🌾 Starting Yield Management cycle...");
    
    // 1. DISCOVERY
    const pools = await scanMeteora();
    if (!pools || pools.length === 0) return;

    // 2. DECISION
    for (const pool of pools) {
        const isAlreadyOpen = activePositions.find(p => p.address === pool.address);
        
        if (!isAlreadyOpen && pool.metrics.utilization >= YIELD_CONFIG.MIN_UTILIZATION) {
            if (activePositions.length < YIELD_CONFIG.MAX_POSITIONS) {
                await enterPosition(pool);
            }
        }
    }

    // 3. MONITOR
    await monitorPositions();
}

/**
 * Enters a DLMM Position
 * One-Sided Strategy: Deposit SOL (or USDC) only, into a concentrated bin.
 */
async function enterPosition(poolData) {
    console.log(`[Yield] 🚀 ENTERING POOL ${poolData.name} (${poolData.address})`);
    
    if (!YIELD_CONFIG.ENABLED) {
        console.log(`[Yield] 🧪 DRY RUN: Would deposit ${YIELD_CONFIG.ALLOCATION_SOL} SOL.`);
        activePositions.push({
            address: poolData.address,
            name: poolData.name,
            entryTime: Date.now(),
            entryUtil: poolData.metrics.utilization,
            allocation: YIELD_CONFIG.ALLOCATION_SOL,
            status: "simulated"
        });
        return;
    }

    try {
        const poolKey = new PublicKey(poolData.address);
        const dlmmPool = await DLMM.create(connection, poolKey);

        // Calculate Bin Range (Strategy: Spot +/- 5% for high concentration)
        const activeBin = await dlmmPool.getActiveBin();
        const minBinId = activeBin.binId - 30; // approx -3%
        const maxBinId = activeBin.binId + 30; // approx +3%

        const totalXAmount = new BN(YIELD_CONFIG.ALLOCATION_SOL * 1e9); // SOL
        const totalYAmount = new BN(0); // One-sided

        // Create Position Transaction
        // Strategy: SpotBalanced (Spread liquidity around active bin)
        const newPosition = await dlmmPool.initializePositionAndAddLiquidityByWeight({
            positionPubKey: null, // New position
            lbPairPubKey: poolKey,
            user: wallet.publicKey,
            totalXAmount,
            totalYAmount,
            xYAmountDistribution: [
                { binId: activeBin.binId, weight: 100 } // Super concentrated on active (simple start)
            ]
        });

        console.log(`[Yield] ✍️ Sending TX...`);
        const txHash = await sendAndConfirmTransaction(connection, newPosition.transaction, [wallet]);
        console.log(`[Yield] ✅ Position Opened! TX: ${txHash}`);

        activePositions.push({
            address: poolData.address,
            name: poolData.name,
            entryTime: Date.now(),
            entryUtil: poolData.metrics.utilization,
            allocation: YIELD_CONFIG.ALLOCATION_SOL,
            txHash,
            status: "active"
        });

    } catch (err) {
        console.error(`[Yield] ❌ Entry Failed:`, err.message);
    }
}

async function monitorPositions() {
    for (let i = activePositions.length - 1; i >= 0; i--) {
        const pos = activePositions[i];
        
        // 1. Time-based Exit (2 hours max for high volatility plays)
        const ageHours = (Date.now() - pos.entryTime) / (1000 * 60 * 60);
        
        if (ageHours > 2) { 
            console.log(`[Yield] 📉 EXITING ${pos.name} (Time Limit > 2h)`);
            
            if (pos.status === "active") {
                // TODO: Implement `dlmmPool.removeLiquidity` & `closePosition`
                // For now, we just remove from tracking to stop simulating
                console.log(`[Yield] ⚠️ Withdraw logic pending integration.`);
            }
            
            activePositions.splice(i, 1);
        }
    }
}

module.exports = { runYieldCycle };
