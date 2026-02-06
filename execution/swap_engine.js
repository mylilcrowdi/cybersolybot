/**
 * swap_engine.js
 * The "Claw" of Agent Cyber.
 * Handles transaction building and submission for Jupiter and Pump.fun.
 */

const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true
});

/**
 * Executes a swap via Jupiter Aggregator (Raydium/Meteora/etc)
 * @param {string} inputMint 
 * @param {string} outputMint 
 * @param {number} amount (in lamports or atomic units)
 * @param {number} slippageBps (default 100 = 1%)
 */
async function swapJupiter(inputMint, outputMint, amount, slippageBps = 100) {
    try {
        console.log(`[Jupiter] 🚀 Building swap: ${amount} of ${inputMint} -> ${outputMint}`);
        
        // 1. Get Quote
        const quoteResponse = await (
            await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`)
        ).json();

        if (!quoteResponse.outAmount) {
            throw new Error(`Failed to get quote: ${JSON.stringify(quoteResponse)}`);
        }

        // 2. Get Swap Transaction
        const { swapTransaction } = await (
            await fetch('https://quote-api.jup.ag/v6/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse,
                    userPublicKey: process.env.WALLET_PUBLIC_KEY || "2xQ4KCE7tCogEAsXjGuT8VvzLMVHCDLf4atuVaJsHswK",
                    wrapAndUnwrapSol: true,
                    // optimization: use priority fees from Helius or dynamic estimation
                    dynamicComputeUnitLimit: true,
                    prioritizationFeeLamports: 'auto' 
                })
            })
        ).json();

        // 3. Deserialize and Sign (Placeholder - needs Private Key)
        console.log("[Jupiter] Swap transaction built. Awaiting signature mechanism...");
        return swapTransaction;

    } catch (err) {
        console.error("[Jupiter] Execution Error:", err.message);
        return null;
    }
}

/**
 * Executes a native Pump.fun swap
 * Uses direct program interaction for maximum speed in the "trenches".
 */
async function swapPumpFun(mint, amountSol, isBuy = true) {
    // Strategy:
    // 1. Fetch the Bonding Curve account for the mint.
    // 2. Build the Instruction (Buy/Sell) using Pump.fun Program ID.
    // 3. Submit via Jito or Helius for high-speed landing.
    console.log(`[Pump.fun] 🕒 Native ${isBuy ? 'BUY' : 'SELL'} logic for ${mint} initialized.`);
    // TODO: Implement direct instruction building with @solana/web3.js and borsh
}

module.exports = { swapJupiter, swapPumpFun };
