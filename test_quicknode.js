const web3 = require("@solana/web3.js");
const axios = require("axios");

const QN_ENDPOINT = "https://holy-boldest-thunder.solana-mainnet.quiknode.pro/a5ac277b9e6db538585485212341b630114ed78b/";

(async () => {
    console.log("⚡ Testing QuickNode Endpoint...");

    // 1. Basic RPC Test (Solana Core)
    try {
        const solana = new web3.Connection(QN_ENDPOINT);
        const slot = await solana.getSlot();
        console.log(`[RPC] ✅ Connection Successful. Current Slot: ${slot}`);
    } catch (err) {
        console.error(`[RPC] ❌ Failed:`, err.message);
    }

    // 2. Metis / Jupiter Proxy Test
    // QuickNode often exposes Jupiter API via the same endpoint or a specific path if the add-on is enabled.
    // Let's try to fetch a quote using the standard Jupiter v6 path appended to the QN URL, 
    // or checks if it responds to specific Metis RPC methods.
    
    // Test A: Check if it proxies Jupiter v6 Quote API
    // Some QN setups proxy /jupiter/v6/quote
    const inputMint = "So11111111111111111111111111111111111111112"; // SOL
    const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
    const amount = 10000000; // 0.01 SOL

    try {
        console.log("[Metis] 🧪 Testing Jupiter Quote Proxy...");
        // Common QN Metis path pattern or direct proxy
        const quoteUrl = `${QN_ENDPOINT}jupiter/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`;
        
        const response = await axios.get(quoteUrl);
        if (response.data && response.data.outAmount) {
            console.log(`[Metis] ✅ Jupiter Quote Success! Out Amount: ${response.data.outAmount}`);
        } else {
            console.log(`[Metis] ⚠️ Response received but unexpected format.`);
        }
    } catch (err) {
        // If 404, it might not be configured as a direct proxy path
        if (err.response && err.response.status === 404) {
            console.log(`[Metis] ℹ️ Standard proxy path (jupiter/v6) not found. This endpoint might be RPC-only or use a different path structure.`);
        } else {
            console.error(`[Metis] ❌ Quote Failed: ${err.message}`);
        }
    }

    // 3. Test Pump.fun Price (Metis specific)
    // Documentation suggests endpoints like /price might be available if using the Metis/Marketplace add-on
    try {
        console.log("[Metis] 🧪 Testing Pump.fun/Price endpoint...");
        // Attempting a direct fetch if it's a REST extension
        const priceUrl = `${QN_ENDPOINT}price?token=${inputMint}`; // Hypothetical REST path based on "price" doc
        const response = await axios.get(priceUrl);
        console.log(`[Metis] ❓ Price Endpoint Response:`, response.status);
    } catch (err) {
        console.log(`[Metis] ℹ️ Price endpoint fetch failed (Expected if not REST-enabled).`);
    }

})();
