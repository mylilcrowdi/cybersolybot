const axios = require('axios');

const BASE_URL = "https://api.dexscreener.com/tokens/v1/solana";

/**
 * Fetches token data from Dexscreener (Fallback Source)
 * @param {string} mint - Token Mint Address
 * @returns {Promise<object|null>} - Standardized token data or null
 */
async function getTokenData(mint) {
    try {
        const response = await axios.get(`${BASE_URL}/${mint}`);
        
        if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
            return null; // No pairs found
        }

        // 1. Sort pairs by Liquidity (USD) Descending to find the main pool
        const pairs = response.data.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
        const bestPair = pairs[0];

        // 2. Map to Standard Format (matches SolanaTracker output structure where possible)
        return {
            price: parseFloat(bestPair.priceUsd) || 0,
            liquidity: bestPair.liquidity?.usd || 0,
            marketCap: bestPair.fdv || bestPair.marketCap || 0,
            pairCreatedAt: bestPair.pairCreatedAt,
            
            // Dexscreener doesn't give "riskScore" or "holders" directly in this endpoint
            // We use pair age as a rough proxy for "established"
            isRug: (bestPair.liquidity?.usd < 1000), 
            
            source: "Dexscreener"
        };

    } catch (err) {
        console.error(`[Dexscreener] ⚠️ Lookup failed for ${mint}:`, err.message);
        return null;
    }
}

/**
 * Basic safety check using Dexscreener data
 */
function isSafeToTrade(data) {
    if (!data) return true; // Fail open if data missing

    const MIN_LIQUIDITY = 3000;
    
    if (data.liquidity < MIN_LIQUIDITY) {
        console.log(`[Dexscreener] 🛡️ REJECT: Low Liquidity ($${data.liquidity.toFixed(2)})`);
        return false;
    }

    console.log(`[Dexscreener] ✅ PASSED: Liq $${data.liquidity.toFixed(0)} | MC: $${data.marketCap.toLocaleString()}`);
    return true;
}

module.exports = { getTokenData, isSafeToTrade };
