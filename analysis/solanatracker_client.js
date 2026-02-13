const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const API_KEY = process.env.SOLANATRACKER_API_KEY;
const BASE_URL = "https://data.solanatracker.io";

// Rate Limit Tracking (Local Memory)
const QUOTA_LIMIT_MONTHLY = 10000;
const QUOTA_LIMIT_DAILY = Math.floor(QUOTA_LIMIT_MONTHLY / 30); // ~333
let dailyUsage = 0;
let lastReset = Date.now();

/**
 * Reset daily quota counter if 24h passed
 */
function checkQuotaReset() {
    const now = Date.now();
    if (now - lastReset > 24 * 60 * 60 * 1000) {
        console.log(`[SolanaTracker] 🔄 Daily Quota Reset. Previous usage: ${dailyUsage}`);
        dailyUsage = 0;
        lastReset = now;
    }
}

/**
 * Fetches token data from SolanaTracker
 * @param {string} mint - Token Mint Address
 * @returns {Promise<object|null>} - Token data or null if failed/skipped
 */
async function getTokenData(mint) {
    checkQuotaReset();

    if (!API_KEY) {
        console.warn("[SolanaTracker] ⚠️ No API Key found. Skipping check.");
        return null;
    }

    if (dailyUsage >= QUOTA_LIMIT_DAILY) {
        console.warn(`[SolanaTracker] 🛑 Daily quota exceeded (${dailyUsage}/${QUOTA_LIMIT_DAILY}). Skipping.`);
        return null;
    }

    try {
        const url = `${BASE_URL}/tokens/${mint}`;
        const response = await axios.get(url, {
            headers: { 'x-api-key': API_KEY }
        });

        dailyUsage++;
        const data = response.data;

        // Simplify and return key metrics
        return {
            price: data.priceUsd || 0,
            liquidity: data.liquidityUsd || 0,
            marketCap: data.marketCapUsd || 0,
            holders: data.holders || 0,
            riskScore: data.riskScore || 0, // 0 is good, 10 is bad usually? Need to verify scale. Assuming 0-10 based on docs example.
            top10Holders: data.top10 || 0, // Percentage held by top 10
            isRug: (data.liquidityUsd < 1000) || (data.holders < 10) // Basic heuristic
        };

    } catch (err) {
        console.error(`[SolanaTracker] Error fetching ${mint}:`, err.message);
        return null;
    }
}

/**
 * Fetches PnL data for a wallet
 * @param {string} walletAddress 
 * @returns {Promise<object>}
 */
async function getWalletPnL(walletAddress) {
    if (!API_KEY) return null;
    checkQuotaReset();
    if (dailyUsage >= QUOTA_LIMIT_DAILY) return null;

    try {
        // Assuming there's a PnL or portfolio endpoint. 
        // Based on docs, it might be /pnl/{wallet} or /wallet/{wallet}
        // Let's try /wallet/{wallet}/pnl if it exists, or just basic stats.
        // Fallback to portfolio if PnL not explicit.
        // NOTE: Official endpoint check needed. Assuming /pnl/{wallet} for now based on context.
        
        const url = `${BASE_URL}/pnl/${walletAddress}`; 
        const response = await axios.get(url, {
            headers: { 'x-api-key': API_KEY }
        });
        
        dailyUsage++;
        return response.data; // { totalRealized, totalUnrealized, winRate, etc }
    } catch (err) {
        console.warn(`[SolanaTracker] PnL Fetch Error for ${walletAddress}:`, err.message);
        return null; 
    }
}

/**
 * Evaluates if a token is safe enough to proceed to Sentiment Analysis
 * @param {object} trackerData 
 * @returns {boolean}
 */
function isSafeToTrade(trackerData) {
    if (!trackerData) return true; // Fail open if API down/quota exceeded (rely on other filters)

    const MIN_LIQUIDITY = 3000; // $3k min liquidity
    const MAX_TOP10_HOLDING = 40; // Max 40% held by top 10 (anti-whale)
    
    if (trackerData.liquidity < MIN_LIQUIDITY) {
        console.log(`[SolanaTracker] 🛡️ REJECT: Low Liquidity ($${trackerData.liquidity.toFixed(2)})`);
        return false;
    }

    if (trackerData.top10Holders > MAX_TOP10_HOLDING) {
        console.log(`[SolanaTracker] 🛡️ REJECT: Whale Concentration (${trackerData.top10Holders.toFixed(2)}%)`);
        return false;
    }

    console.log(`[SolanaTracker] ✅ PASSED: Liq $${trackerData.liquidity.toFixed(0)} | Top10: ${trackerData.top10Holders}% | Risk: ${trackerData.riskScore}`);
    return true;
}

module.exports = { getTokenData, getWalletPnL, isSafeToTrade };
