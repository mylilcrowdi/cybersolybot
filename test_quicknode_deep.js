const axios = require("axios");

const QN_ENDPOINT = "https://holy-boldest-thunder.solana-mainnet.quiknode.pro/a5ac277b9e6db538585485212341b630114ed78b/";

(async () => {
    console.log("⚡ Deep Testing QuickNode Metis Endpoints...");

    // 1. Test /price Endpoint (REST)
    // Docs say: GET https://<endpoint>/price?ids=SOL
    try {
        console.log("[Metis] 🧪 Testing /price endpoint...");
        // NOTE: The slash is important. endpoint is .../78b/ so we append "price"
        const priceUrl = `${QN_ENDPOINT}price?ids=SOL`;
        
        const response = await axios.get(priceUrl);
        console.log(`[Metis] ✅ /price Response:`, JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error(`[Metis] ❌ /price Failed: ${err.message}`);
        if (err.response) {
            console.error(`[Metis] Status: ${err.response.status}`);
            console.error(`[Metis] Data:`, err.response.data);
        }
    }

    // 2. Test /pump-fun/quote Endpoint (REST)
    // Docs say: GET https://<endpoint>/pump-fun/quote?mint=...&amount=...&isBuy=true
    try {
        console.log("\n[Metis] 🧪 Testing /pump-fun/quote endpoint...");
        const mint = "2q7jMwWYFxUdxBqWbi8ohztyG1agjQMrasUXwqGCpump"; // Example mint from docs
        const amount = 1000000; // small amount
        const quoteUrl = `${QN_ENDPOINT}pump-fun/quote?mint=${mint}&amount=${amount}&isBuy=true`;

        const response = await axios.get(quoteUrl);
        console.log(`[Metis] ✅ /pump-fun/quote Response:`, JSON.stringify(response.data, null, 2));
    } catch (err) {
        // Pump fun quotes might fail if the token is migrated or bonding curve logic issues,
        // but we want to see if the ENDPOINT works (200 OK vs 404/403).
        console.error(`[Metis] ❌ /pump-fun/quote Failed: ${err.message}`);
        if (err.response) {
            console.error(`[Metis] Status: ${err.response.status}`);
            console.error(`[Metis] Data:`, err.response.data);
        }
    }

    // 3. Test Jupiter Limit Order (REST)
    // Docs: POST /jupiter/limit-order/create
    // We won't actually create one, but let's check if the path exists by sending a bad payload (expecting 400, not 404).
    try {
        console.log("\n[Metis] 🧪 Testing /jupiter/limit-order/create path check...");
        const limitUrl = `${QN_ENDPOINT}jupiter/limit-order/create`;
        
        await axios.post(limitUrl, {});
    } catch (err) {
        if (err.response && err.response.status !== 404) {
             console.log(`[Metis] ✅ Jupiter Limit Order Path Exists! (Got ${err.response.status} as expected for empty body)`);
        } else {
             console.error(`[Metis] ❌ Jupiter Limit Order Path Failed: ${err.message} (Status: ${err.response?.status})`);
        }
    }

})();
