/**
 * execution_module.js
 * The "Action" layer of Cybersolybot.
 * Integrates swap_engine with local wallet signing.
 */

const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const { swapJupiter } = require('./swap_engine');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/trade_logger');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
});

// Load keypair from default Solana CLI path or env
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');

let wallet;
try {
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')));
    wallet = Keypair.fromSecretKey(secretKey);
    console.log(`[Execution] 🔑 Wallet Loaded: ${wallet.publicKey.toBase58()}`);
} catch (err) {
    console.error(`[Execution] ❌ Failed to load wallet from ${KEYPAIR_PATH}:`, err.message);
    process.exit(1);
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Higher-level function to perform a swap and handle the full lifecycle (sign/send/log)
 * @param {string} outputMint - Token to buy
 * @param {number} amount - Amount in natural units (e.g. 0.1 SOL)
 * @param {string} inputMint - Token to sell (default: SOL)
 * @param {number} inputDecimals - Decimals of input token (default: 9 for SOL)
 * @param {number} slippageBps - Slippage tolerance in basis points
 */
async function executeSwap(outputMint, amount, inputMint = SOL_MINT, inputDecimals = 9, slippageBps = 100) {
    try {
        const amountAtomic = Math.floor(amount * Math.pow(10, inputDecimals));

        console.log(`[Execution] 🔄 Initializing Swap: ${amount} (raw: ${amountAtomic}) ${inputMint} -> ${outputMint}`);

        // 1. Get Transaction from Swap Engine (Jupiter)
        const swapTransactionBase64 = await swapJupiter(inputMint, outputMint, amountAtomic, slippageBps);

        if (!swapTransactionBase64) {
            throw new Error("Failed to get swap transaction from engine.");
        }

        // 2. Deserialize Transaction
        const swapTransactionBuf = Buffer.from(swapTransactionBase64, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

        // 3. Sign Transaction
        transaction.sign([wallet]);

        // 4. Execute Transaction
        console.log("[Execution] 📤 Sending transaction...");
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            maxRetries: 3,
            preflightCommitment: 'confirmed'
        });

        console.log(`[Execution] ✅ Transaction Sent! Signature: ${signature}`);
        console.log(`[Execution] 🔗 View on Solscan: https://solscan.io/tx/${signature}`);

        // 5. Log Action
        await logger.logAction({
            type: "TRADE_EXECUTION",
            token: outputMint,
            inputAmount: amount,
            inputMint: inputMint,
            signature: signature,
            status: "submitted",
            timestamp: new Date().toISOString()
        });

        return signature;

    } catch (err) {
        console.error("[Execution] ❌ Swap Execution Failed:", err.message);
        return null;
    }
}

module.exports = { executeSwap, wallet };

// Simple CLI test if run directly
if (require.main === module) {
    const targetMint = process.argv[2];
    const amount = parseFloat(process.argv[3] || "0.01");
    if (targetMint) {
        executeSwap(targetMint, amount);
    } else {
        console.log("Usage: node execution_module.js <MINT_ADDRESS> <AMOUNT_SOL>");
    }
}
