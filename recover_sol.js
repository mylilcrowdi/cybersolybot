const { executeSwap } = require('./execution/execution_module');
require('dotenv').config();

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";

async function recover() {
    console.log("🚑 RECOVERING SOL FROM USDC...");
    // USDC Balance is 14.53. Let's swap 14
    const signature = await executeSwap(SOL_MINT, 14, USDC_MINT, 6, 1000);
    if (signature) {
        console.log("✅ Recovery Swap Successful!");
    } else {
        console.log("❌ Recovery Swap Failed (Maybe no USDC?).");
    }
}

recover();