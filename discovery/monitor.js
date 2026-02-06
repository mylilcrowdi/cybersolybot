const { Connection, PublicKey } = require('@solana/web3.js');
const { checkSocials } = require('./metadata_filter');
const { analyzeSentiment } = require('../analysis/grok_agent');
const logger = require('../utils/trade_logger');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const RAYDIUM_PUBLIC_KEY = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const connection = new Connection(RPC_ENDPOINT, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
    confirmTransactionInitialTimeout: 60000
});

// Sentinel State
let isBusy = false;
let onTargetFoundCallback = null;

/**
 * The Sentinel: Single-threaded processing to protect RPC limits.
 * Drops all events while "busy" processing one.
 */
async function startMonitoring(callback) {
    onTargetFoundCallback = callback;
    console.log(`[Monitor] ⚡ Agent Cyber Listening (Sentinel Mode: ON)`);

    connection.onLogs(
        new PublicKey(RAYDIUM_PUBLIC_KEY),
        async (logs) => {
            if (isBusy || logs.err) return;
            const isInit = logs.logs.some(l => l.includes("initialize2") || l.includes("ray_log"));
            if (isInit) {
                attemptProcess(logs.signature, "Raydium");
            }
        },
        "confirmed"
    );

    connection.onLogs(
        new PublicKey(PUMP_FUN_PROGRAM),
        async (logs) => {
            if (isBusy || logs.err) return;
            const isCreation = logs.logs.some(l => l.includes("Instruction: Create"));
            if (isCreation) {
                attemptProcess(logs.signature, "PumpFun");
            }
        },
        "confirmed"
    );
}

async function attemptProcess(signature, source) {
    if (isBusy) return;
    isBusy = true;

    try {
        console.log(`[Sentinel] 🔒 Locked. Processing ${source} signal...`);
        await processTransaction(signature, source);
    } catch (err) {
        console.error(`[Sentinel] Error:`, err.message);
    } finally {
        // Cool down: Allow RPC to recover tokens before unlocking
        // 2000ms cooldown = Max ~0.5 requests/sec average
        setTimeout(() => {
            isBusy = false;
        }, 2000);
    }
}

async function processTransaction(signature, source) {
    try {
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
        });

        if (!tx || !tx.meta || tx.meta.err) return;

        const tokenBalances = tx.meta.postTokenBalances;
        const candidate = tokenBalances?.find(b => 
            b.mint !== "So11111111111111111111111111111111111111112" &&
            b.uiTokenAmount.uiAmount > 0
        );

        const mint = candidate?.mint;
        if (mint) {
            // Check Metadata (RPC Call #2)
            const result = await checkSocials(mint);
            
            if (result.valid) {
                console.log(`[${source}] ✅ TARGET ACQUIRED: ${result.name} (${result.symbol})`);
                
                // Sentiment Analysis (API Call)
                const sentiment = await analyzeSentiment(result.symbol, result.name);
                
                const target = {
                    mint,
                    source,
                    name: result.name,
                    symbol: result.symbol,
                    score: result.score,
                    sentiment,
                    signature
                };

                await logger.logAction({
                    type: "DISCOVERY_SIGNAL",
                    ...target
                });

                if (onTargetFoundCallback) {
                    onTargetFoundCallback(target);
                }
            } else {
                // console.log(`[${source}] ❌ Filtered: ${result.error || 'No socials'}`);
            }
        }
    } catch (err) {
        if (err.message && err.message.includes('429')) {
            console.warn(`[Sentinel] ⚠️ RPC 429 in transaction fetch. Backing off.`);
        }
    }
}

module.exports = { startMonitoring };
