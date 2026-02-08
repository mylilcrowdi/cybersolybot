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

// Circuit Breaker State
let consecutive429s = 0;
const BASE_BACKOFF_MS = 5000; // Start with 5s
const MAX_BACKOFF_MS = 300000; // Max 5 minutes
const NORMAL_COOLDOWN_MS = 2000;

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

    let cooldown = NORMAL_COOLDOWN_MS;

    try {
        console.log(`[Sentinel] 🔒 Locked. Processing ${source} signal...`);
        await processTransaction(signature, source);
        
        // Success! Reset circuit breaker
        if (consecutive429s > 0) {
            console.log(`[Sentinel] 🟢 RPC Health Restored. Resumed normal operation.`);
            consecutive429s = 0;
        }

    } catch (err) {
        if (err.message && (err.message.includes('429') || err.message.includes('Too Many Requests'))) {
            consecutive429s++;
            // Exponential Backoff: 5s, 10s, 20s, 40s... up to 5m
            cooldown = Math.min(BASE_BACKOFF_MS * Math.pow(2, consecutive429s - 1), MAX_BACKOFF_MS);
            
            console.warn(`[Sentinel] 🔴 RPC 429 DETECTED (Strike ${consecutive429s}). Circuit broken.`);
            console.warn(`[Sentinel] ⏳ Sleeping for ${cooldown / 1000}s to allow tier recovery.`);
        } else {
            console.error(`[Sentinel] Error:`, err.message);
        }
    } finally {
        // Unlock only after the calculated cooldown (normal or backoff)
        setTimeout(() => {
            isBusy = false;
            if (consecutive429s > 0) {
                 console.log(`[Sentinel] 🟡 Circuit attempting to close. Peeking for signals...`);
            }
        }, cooldown);
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
        // Re-throw 429s so attemptProcess handles the backoff
        if (err.message && (err.message.includes('429') || err.message.includes('Too Many Requests'))) {
            throw err;
        }
        // Log other errors but don't crash
        console.error(`[Process] Error: ${err.message}`);
    }
}

module.exports = { startMonitoring };
