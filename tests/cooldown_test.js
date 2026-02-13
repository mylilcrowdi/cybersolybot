const { runRotationCycle } = require('../execution/rotation_manager');
const logger = require('../utils/trade_logger');
const fs = require('fs');
const path = require('path');

// Mock Data
const MOCK_POSITIONS = [
    {
        address: "So11111111111111111111111111111111111111112", // Should be ignored (SOL)
        name: "SOL",
        entryTime: Date.now()
    },
    {
        address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Should be ignored (USDC)
        name: "USDC",
        entryTime: Date.now()
    },
    {
        address: "HYPE_MINT_123",
        name: "HYPE-SOL",
        entryTime: Date.now() - (60 * 60 * 1000), // 1 hour ago (Expired)
        amount: 100
    },
    {
        address: "PUMP_MINT_456",
        name: "PUMP-SOL",
        entryTime: Date.now() - (10 * 60 * 1000), // 10 mins ago (Valid)
        amount: 50
    }
];

const MOCK_HISTORY = [
    {
        type: "YIELD_EXIT",
        symbol: "HYPE-SOL",
        inputMint: "HYPE_MINT_123",
        timestamp: new Date().toISOString() // Just now
    }
];

// Mock File System
const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');
const HISTORY_FILE = path.join(__dirname, '../data/history.json');

// Backup
if (fs.existsSync(POSITIONS_FILE)) fs.copyFileSync(POSITIONS_FILE, POSITIONS_FILE + '.bak');
if (fs.existsSync(HISTORY_FILE)) fs.copyFileSync(HISTORY_FILE, HISTORY_FILE + '.bak');

console.log("🧪 --- STARTING COOLDOWN TEST ---");

// 1. Setup State: HYPE-SOL just exited
fs.writeFileSync(POSITIONS_FILE, JSON.stringify(MOCK_POSITIONS.slice(3), null, 2)); // Only PUMP remains
fs.writeFileSync(HISTORY_FILE, JSON.stringify(MOCK_HISTORY, null, 2)); // History says HYPE sold recently

// 2. Mock DexScreener to return HYPE as top candidate
const dexscreener = require('../analysis/dexscreener_client');
dexscreener.getTrending = async () => [
    { symbol: "HYPE-SOL", mint: "HYPE_MINT_123", change5m: 5.0 }, // Should be blocked
    { symbol: "SKR-SOL", mint: "SKR_MINT_789", change5m: 3.5 }    // Should be picked
];

// 3. Run Cycle (Mocking execution to avoid real swaps)
// We can't easily mock execution_module require inside the test script without rewire,
// so we'll observe the Logs output. The logic is in rotation_manager.js

// Note: This is an integration test of the logic.
// We expect: [Rotation] 🚀 BUYING NEW GEM: SKR-SOL
// NOT: HYPE-SOL

(async () => {
    try {
        await runRotationCycle();
    } catch (e) {
        console.error(e);
    } finally {
        // Restore
        if (fs.existsSync(POSITIONS_FILE + '.bak')) {
            fs.copyFileSync(POSITIONS_FILE + '.bak', POSITIONS_FILE);
            fs.unlinkSync(POSITIONS_FILE + '.bak');
        }
        if (fs.existsSync(HISTORY_FILE + '.bak')) {
            fs.copyFileSync(HISTORY_FILE + '.bak', HISTORY_FILE);
            fs.unlinkSync(HISTORY_FILE + '.bak');
        }
        console.log("🧪 --- TEST COMPLETE ---");
    }
})();
