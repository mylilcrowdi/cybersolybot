/**
 * sniper_monitor.js
 * Tracks active sniper positions and executes exit strategies (TP/SL/Time-based).
 */

const { Connection, Keypair, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const { swapJupiter } = require('../execution/swap_engine'); // Re-use swap engine
const logger = require('../utils/trade_logger');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, { commitment: 'confirmed' });
const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');

// Config
const EXIT_CONFIG = {
    TAKE_PROFIT_PCT: 100, // +100% (2x)
    STOP_LOSS_PCT: -25,   // -25%
    TIME_LIMIT_MS: 30 * 60 * 1000, // 30 mins hard stop
    SLIPPAGE_BPS: 200 // 2%
};

// Load Sniper Wallet
let wallet;
try {
    const secretKeyArray = JSON.parse(process.env.KEYPAIR_SNIPER || "[]");
    const secretKey = Uint8Array.from(secretKeyArray);
    wallet = Keypair.fromSecretKey(secretKey);
} catch (err) {
    console.error("[SniperMonitor] ❌ Wallet load failed:", err.message);
    process.exit(1);
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

async function getTokenBalance(mintStr) {
    try {
        const filters = [
            { dataSize: 165 },
            { memcmp: { offset: 32, bytes: wallet.publicKey.toBase58() } },
            { memcmp: { offset: 0, bytes: mintStr } }
        ];
        const accounts = await connection.getParsedProgramAccounts(
            new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), 
            { filters: filters }
        );
        
        if (accounts.length === 0) return 0;
        return accounts[0].account.data.parsed.info.tokenAmount.uiAmount;
    } catch (e) {
        return 0;
    }
}

async function runMonitor() {
    console.log("[SniperMonitor] 🛡️ Guarding active positions...");
    
    // 1. Load Positions
    let positions = [];
    if (fs.existsSync(POSITIONS_FILE)) {
        positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
    }

    if (positions.length === 0) {
        // console.log("[SniperMonitor] No active positions.");
        return;
    }

    // 2. Check Each Position
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        if (pos.status === 'CLOSED') continue;

        try {
            // Get Current Price (Mocking via DexScreener for now, or just checking balance value if possible? 
            // Real implementation needs a price feed. Using simple Time/Balance logic for now to ensure safety.)
            
            // Strategy: 
            // 1. Check if we still have the token.
            // 2. If Time Limit exceeded -> DUMP.
            // 3. (Ideally) Check Price for TP/SL.
            
            const currentBalance = await getTokenBalance(pos.mint);
            
            // If balance is 0, we already exited manually or got wiped? Mark closed.
            if (currentBalance < 0.000001) {
                console.log(`[SniperMonitor] 📉 Position ${pos.symbol} appears empty. Marking CLOSED.`);
                pos.status = 'CLOSED';
                continue;
            }

            const age = Date.now() - pos.entryTime;
            
            // TIMEOUT EXIT
            if (age > EXIT_CONFIG.TIME_LIMIT_MS) {
                console.log(`[SniperMonitor] ⏰ Time Limit Exceeded for ${pos.symbol} (${(age/60000).toFixed(1)}m). Exiting...`);
                await executeExit(pos, currentBalance, "TIME_LIMIT");
                pos.status = 'CLOSED';
            }

            // TODO: Add Price Check (Need SolanaTracker/Jupiter Price API)
            // For now, relies on Time Limit to not hold forever.

        } catch (err) {
            console.error(`[SniperMonitor] Error checking ${pos.symbol}: ${err.message}`);
        }
    }

    // 3. Save Updates
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
}

async function executeExit(pos, amount, reason) {
    try {
        console.log(`[SniperMonitor] 🏃 EXITING ${pos.symbol} (${reason})...`);
        
        // Use swap_engine with correct ID
        const txBase64 = await swapJupiter(
            pos.mint, 
            SOL_MINT, 
            Math.floor(amount * (10 ** pos.decimals || 6)), // Approx decimals if missing
            EXIT_CONFIG.SLIPPAGE_BPS,
            wallet.publicKey
        );

        if (!txBase64) {
            console.error(`[SniperMonitor] ❌ Exit failed: No Quote.`);
            return;
        }

        const txBuf = Buffer.from(txBase64, 'base64');
        const transaction = VersionedTransaction.deserialize(txBuf);
        transaction.sign([wallet]);

        const sig = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
        console.log(`[SniperMonitor] ✅ SOLD ${pos.symbol}: https://solscan.io/tx/${sig}`);

        await logger.logAction({
            type: "SNIPER_EXIT",
            symbol: pos.symbol,
            amount: amount,
            reason: reason,
            tx: sig
        });

    } catch (err) {
        console.error(`[SniperMonitor] ❌ Exit Execution Failed: ${err.message}`);
    }
}

// Run loop if standalone
if (require.main === module) {
    setInterval(runMonitor, 60000); // Check every minute
    runMonitor();
}

module.exports = { runMonitor };
