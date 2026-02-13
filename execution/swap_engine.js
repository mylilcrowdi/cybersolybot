/**
 * swap_engine.js
 * Handles interactions with Jupiter Aggregator for swap routes.
 * Supports multiple providers with failover (Strategy Pattern).
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// --- Providers Configuration ---
const PROVIDERS = {
    OFFICIAL: {
        name: 'Jupiter Official',
        baseUrl: 'https://api.jup.ag/swap/v1',
        apiKey: process.env.JUPITER_API_KEY, // x-api-key header
        priority: 1
    },
    // Future expansion:
    // QUICKNODE: { ... }
};

class SwapEngine {
    constructor() {
        this.currentProvider = PROVIDERS.OFFICIAL;
    }

    /**
     * Get the configured Axios instance for the current provider
     */
    getClient() {
        const headers = {};
        if (this.currentProvider.apiKey) {
            // Official Jupiter API uses 'x-api-key'
            headers['x-api-key'] = this.currentProvider.apiKey; 
        }
        
        return axios.create({
            baseURL: this.currentProvider.baseUrl,
            headers: headers,
            timeout: 10000
        });
    }

    /**
     * Get a Quote
     */
    async getQuote(inputMint, outputMint, amount, slippageBps = 100) {
        const client = this.getClient();
        try {
            const url = `/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
            console.log(`[Jupiter] 🚀 Fetching Quote via ${this.currentProvider.name}...`);
            
            const response = await client.get(url);
            return response.data;

        } catch (err) {
            this.handleError(err, 'Quote');
            return null;
        }
    }

    /**
     * Get Swap Transaction
     */
    async getSwapTransaction(quoteResponse, userPublicKey) {
        const client = this.getClient();
        try {
            console.log(`[Jupiter] 📝 Building Transaction via ${this.currentProvider.name}...`);
            
            const response = await client.post(`/swap`, {
                quoteResponse: quoteResponse,
                userPublicKey: userPublicKey,
                wrapAndUnwrapSol: true,
                // Optimization: Request higher priority if needed, but keeping standard for now
                // dynamicComputeUnitLimit: true,
                // priorizationFeeLamports: "auto"
            });

            return response.data.swapTransaction;

        } catch (err) {
            this.handleError(err, 'Swap');
            return null;
        }
    }

    /**
     * Error Handler & Failover Logic
     */
    handleError(err, context) {
        const status = err.response?.status;
        const msg = err.response?.data?.error || err.message;
        
        console.error(`[Jupiter] ❌ ${context} Error (${this.currentProvider.name}): ${status || 'Net'} - ${msg}`);

        if (status === 429) {
            console.warn(`[Jupiter] ⚠️ Rate Limit hit.`);
            // TODO: Switch to fallback provider if implemented
        }
    }
}

// Export singleton
const engine = new SwapEngine();

async function swapJupiter(inputMint, outputMint, amount, slippageBps, userPublicKey) {
    // 1. Get Quote
    const quote = await engine.getQuote(inputMint, outputMint, amount, slippageBps);
    if (!quote) return null;

    // 2. Get Transaction
    // Use passed key, fallback to env, or fail if missing
    const pubKey = userPublicKey ? userPublicKey.toBase58() : process.env.WALLET_PUBLIC_KEY;
    if (!pubKey) {
        console.error("[Jupiter] ❌ No userPublicKey provided for swap.");
        return null;
    }

    const tx = await engine.getSwapTransaction(quote, pubKey);
    return tx;
}

module.exports = { swapJupiter };
