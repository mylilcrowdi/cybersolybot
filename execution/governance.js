/**
 * governance.js
 * The "Executive" of Agent Cyber.
 * Analyzes PnL performance of both strategies (Farmer vs Hunter)
 * and dynamically rebalances capital between them.
 */

const { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/trade_logger');
const nano = require('../utils/nano_agent');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, { commitment: 'confirmed' });

// Wallets
const YIELD_WALLET_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');
const SNIPER_SECRET = JSON.parse(process.env.KEYPAIR_SNIPER || "[]");

let farmerWallet;
let hunterWallet;

try {
    const yieldSecret = Uint8Array.from(JSON.parse(fs.readFileSync(YIELD_WALLET_PATH, 'utf-8')));
    farmerWallet = Keypair.fromSecretKey(yieldSecret);
    
    const sniperSecret = Uint8Array.from(SNIPER_SECRET);
    hunterWallet = Keypair.fromSecretKey(sniperSecret);
} catch (err) {
    console.error("[Governance] ❌ Failed to load wallets:", err.message);
    process.exit(1);
}

// Config
const MIN_BALANCE_SOL = 0.02; // Keep for gas
const REBALANCE_THRESHOLD_PCT = 10; // Only move if perf diff > 10%

async function runGovernanceCycle() {
    console.log("[Governance] ⚖️  Convening Neural Council...");

    // 1. Analyze Performance (Last 24h)
    const history = logger.getHistory();
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    const recentTrades = history.filter(h => new Date(h.timestamp).getTime() > cutoff);

    // Calculate ROI for each strategy
    // Note: This requires closed trades with PnL. For now, we simulate based on "wins".
    const farmerTrades = recentTrades.filter(t => t.type === 'YIELD_EXIT');
    const hunterTrades = recentTrades.filter(t => t.type === 'SNIPER_EXIT'); // TODO: Add exit logging to sniper

    // Mock Performance (until we have real closed trade data)
    // We assume activity = health for now
    const farmerScore = farmerTrades.length * 10; 
    const hunterScore = hunterTrades.length * 15; 

    console.log(`[Governance] 📊 Scores - Farmer: ${farmerScore}, Hunter: ${hunterScore}`);

    let decision = "HOLD";
    let transferAmount = 0;
    let fromWallet, toWallet, fromName, toName;

    // 2. Decide Rebalance
    if (hunterScore > farmerScore + 20) {
        // Hunter is winning -> Move funds to Hunter
        decision = "PROMOTE_HUNTER";
        fromWallet = farmerWallet;
        toWallet = hunterWallet;
        fromName = "Farmer";
        toName = "Hunter";
        transferAmount = 0.05; // SOL
    } else if (farmerScore > hunterScore + 20) {
        // Farmer is winning -> Move funds to Farmer
        decision = "PROMOTE_FARMER";
        fromWallet = hunterWallet;
        toWallet = farmerWallet;
        fromName = "Hunter";
        toName = "Farmer";
        transferAmount = 0.05; // SOL
    }

    // 3. Execute & Explain
    if (decision !== "HOLD") {
        try {
            // Check balance
            const balance = await connection.getBalance(fromWallet.publicKey);
            const balanceSol = balance / 1e9;

            if (balanceSol > (transferAmount + MIN_BALANCE_SOL)) {
                console.log(`[Governance] 💸 Moving ${transferAmount} SOL from ${fromName} to ${toName}...`);
                
                const transaction = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: fromWallet.publicKey,
                        toPubkey: toWallet.publicKey,
                        lamports: transferAmount * 1e9,
                    })
                );

                const signature = await sendAndConfirmTransaction(connection, transaction, [fromWallet]);
                console.log(`[Governance] ✅ Rebalance Complete: ${signature}`);

                // 4. Generate Narrative
                const prompt = `You are the Governance AI of Cybersolybot. You just moved ${transferAmount} SOL from the ${fromName} strategy to the ${toName} strategy because it is outperforming. Explain why in 1 sentence. Style: Corporate Cyberpunk.`;
                const narrative = await nano.generate(prompt, `Moved funds from ${fromName} to ${toName}.`);
                
                await logger.logAction({
                    type: "GOVERNANCE_ACTION",
                    decision: decision,
                    amount: transferAmount,
                    reason: narrative || "Performance rebalance",
                    tx: signature
                });

            } else {
                console.log(`[Governance] ⚠️ Insufficient funds in ${fromName} to rebalance.`);
            }
        } catch (err) {
            console.error(`[Governance] ❌ Rebalance Failed:`, err.message);
        }
    } else {
        console.log("[Governance] ⏸️  Equilibrium maintained. No action.");
    }
}

// Run if called directly
if (require.main === module) {
    runGovernanceCycle();
}

module.exports = { runGovernanceCycle };
