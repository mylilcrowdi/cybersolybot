/**
 * sniper_manager.js
 * The "Hunter" of Agent Cyber.
 * Listens for high-confidence signals from monitor.js and executes direct swaps via Jupiter.
 */

const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const { swapJupiter } = require('./swap_engine');
const { startMonitoring } = require('../discovery/monitor');
const logger = require('../utils/trade_logger');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Configuration
const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, { commitment: 'confirmed' });
const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');

const SNIPER_CONFIG = {
    ENABLED: true,
    MIN_SCORE: 1, // Anything with at least 1 social link
    ALLOCATION_SOL: 0.05,
    SLIPPAGE_BPS: 200, // 2% for speed
    TAKE_PROFIT_PCT: 100, // 2x
    STOP_LOSS_PCT: -20,
    MIN_SOL_BUFFER: 0.02 // Always keep 0.02 SOL for gas
};

// Load Sniper Wallet (Distinct from Yield Wallet)
let wallet;
try {
    const secretKeyArray = JSON.parse(process.env.KEYPAIR_SNIPER || "[]");
    if (secretKeyArray.length === 0) throw new Error("KEYPAIR_SNIPER not found in env");
    const secretKey = Uint8Array.from(secretKeyArray);
    wallet = Keypair.fromSecretKey(secretKey);
    console.log(`[Sniper] 🔫 Wallet Loaded: ${wallet.publicKey.toBase58()}`);
} catch (err) {
    console.error(`[Sniper] ❌ Wallet load failed:`, err.message);
    process.exit(1);
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

async function runSniper() {
    console.log(`[Sniper] 🎯 System Active. Waiting for signals...`);
    
    // Hook into Monitor
    startMonitoring(async (signal) => {
        if (!SNIPER_CONFIG.ENABLED) return;

        console.log(`[Sniper] 🔎 Analyzing Signal: ${signal.name} (${signal.symbol}) Score: ${signal.score}`);

        if (signal.score >= SNIPER_CONFIG.MIN_SCORE) {
            console.log(`[Sniper] 🚀 EXECUTE! High score detected.`);
            await executeSnipe(signal.mint, SNIPER_CONFIG.ALLOCATION_SOL, signal.symbol || "UNKNOWN");
        } else {
             console.log(`[Sniper] 💤 Skipped (Score < ${SNIPER_CONFIG.MIN_SCORE})`);
        }
    });
}

async function executeSnipe(outputMint, amount, symbol) {
    try {
        const inputMint = SOL_MINT;

        // --- GAS SAFETY CHECK ---
        if (inputMint === SOL_MINT) {
            const balance = await connection.getBalance(wallet.publicKey);
            const balanceSol = balance / 1e9;
            const buffer = SNIPER_CONFIG.MIN_SOL_BUFFER || 0.02;

            if (balanceSol < buffer) {
                 console.log(`[Sniper] 🛑 Low SOL Balance (${balanceSol.toFixed(4)}). Preserving for gas.`);
                 return;
            }

            if (balanceSol - amount < buffer) {
                const adjustedAmount = balanceSol - buffer;
                console.log(`[Sniper] ⚠️ Adjusting buy amount: ${amount} -> ${adjustedAmount.toFixed(4)} SOL (Buffer: ${buffer})`);
                amount = adjustedAmount;

                if (amount < 0.002) { // Minimum viable trade
                    console.log(`[Sniper] 🛑 Adjusted amount too small (< 0.002). Skipping.`);
                    return;
                }
            }
        }
        // ------------------------

        const amountAtomic = Math.floor(amount * 1e9);

        // 1. Get Swap Route (Jupiter)
        const swapTransactionBase64 = await swapJupiter(inputMint, outputMint, amountAtomic, SNIPER_CONFIG.SLIPPAGE_BPS, wallet.publicKey);
        if (!swapTransactionBase64) return;

        // 2. Deserialize & Sign
        const swapTransactionBuf = Buffer.from(swapTransactionBase64, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        transaction.sign([wallet]);

        // 3. Send
        console.log(`[Sniper] 🔫 Firing Transaction...`);
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: true, // SPEED
            maxRetries: 3
        });

        console.log(`[Sniper] ✅ SNIPED! https://solscan.io/tx/${signature}`);
        
        // 4. Log Action
        await logger.logAction({
            type: "SNIPER_ENTRY",
            symbol: symbol,
            amount: amount,
            tx: signature
        });

        // 5. Register Position for Monitoring
        registerPosition(outputMint, symbol, amount);

    } catch (err) {
        console.error(`[Sniper] ❌ Failed: ${err.message}`);
    }
}

function registerPosition(mint, symbol, amount) {
    let positions = [];
    if (fs.existsSync(POSITIONS_FILE)) {
        try { positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8')); } catch(e){}
    }
    
    positions.push({
        mint: mint,
        symbol: symbol,
        amountSol: amount,
        entryTime: Date.now(),
        status: 'OPEN'
    });

    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
    console.log(`[Sniper] 📝 Position registered for monitoring: ${symbol}`);
}

// Start if run directly
if (require.main === module) {
    runSniper();
}

module.exports = { runSniper };
