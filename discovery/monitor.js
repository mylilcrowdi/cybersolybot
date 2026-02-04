const { Connection, PublicKey } = require('@solana/web3.js');
const { checkSocials } = require('./metadata_filter');
const { analyzeSentiment } = require('../analysis/grok_agent');
const logger = require('../utils/trade_logger');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const RAYDIUM_PUBLIC_KEY = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

let onTargetFoundCallback = null;

async function startMonitoring(callback) {
    onTargetFoundCallback = callback;
    console.log(`[Monitor] ⚡ Agent Cyber Listening via Helius RPC`);

    connection.onLogs(
        new PublicKey(RAYDIUM_PUBLIC_KEY),
        async (logs) => {
            if (logs.err) return;
            const isInit = logs.logs.some(l => l.includes("initialize2") || l.includes("ray_log"));
            if (isInit) processTransaction(logs.signature, "Raydium");
        },
        "confirmed"
    );

    connection.onLogs(
        new PublicKey(PUMP_FUN_PROGRAM),
        async (logs) => {
            if (logs.err) return;
            const isCreation = logs.logs.some(l => l.includes("Instruction: Create"));
            if (isCreation) processTransaction(logs.signature, "PumpFun");
        },
        "confirmed"
    );
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
            const result = await checkSocials(mint);
            if (result.valid) {
                console.log(`[${source}] ✅ TARGET ACQUIRED: ${result.name} (${result.symbol})`);
                
                // Slow Brain: Grok Analysis
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
            }
        }
    } catch (err) {
        // Silent error to keep monitor running
    }
}

module.exports = { startMonitoring };
