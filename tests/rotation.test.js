const assert = require('assert');

// Mock Data
const MOCK_POSITIONS = [
    {
        mint: "TokenA_Mint",
        symbol: "TOKEN_A",
        entryPrice: 1.0,
        entryTime: Date.now() - (40 * 60 * 1000), // 40 mins ago (Should Rotate)
        currentPrice: 0.95, // -5%
        amount: 100
    },
    {
        mint: "TokenB_Mint",
        symbol: "TOKEN_B",
        entryPrice: 1.0,
        entryTime: Date.now() - (10 * 60 * 1000), // 10 mins ago (Keep)
        currentPrice: 1.02, // +2%
        amount: 100
    }
];

const MOCK_CANDIDATES = [
    {
        mint: "TokenC_Mint",
        symbol: "TOKEN_C",
        score: 95,
        trend: "UP"
    }
];

// Logic to Test (will be moved to rotation_manager.js)
function getRotationDecision(positions, candidates) {
    const MAX_HOLD_TIME_MS = 30 * 60 * 1000;
    const MAX_POSITIONS = 2;
    
    // 1. Check for expired positions
    const now = Date.now();
    const expiredPositions = positions.filter(p => (now - p.entryTime) > MAX_HOLD_TIME_MS);
    
    if (expiredPositions.length === 0 && positions.length >= MAX_POSITIONS) {
        return { action: "HOLD", reason: "No expired positions and full portfolio" };
    }

    // 2. If we need to free up space (either full portfolio + expired, or just expired)
    // The rule: "After 30 minutes the worse position with a higher loss, should be sold"
    // Actually, if ANY position is > 30m, we should rotate it. 
    // If multiple are > 30m, rotate the worst one.
    
    let positionToSell = null;
    
    if (expiredPositions.length > 0) {
        // Sort by PnL (ascending) -> lowest PnL (highest loss) first
        expiredPositions.sort((a, b) => {
            const pnlA = (a.currentPrice - a.entryPrice) / a.entryPrice;
            const pnlB = (b.currentPrice - b.entryPrice) / b.entryPrice;
            return pnlA - pnlB;
        });
        positionToSell = expiredPositions[0];
    } else if (positions.length < MAX_POSITIONS) {
        // We have space, no need to sell to buy
        positionToSell = null;
    } else {
        // Full, but nothing expired. 
        // User said: "Goal is to always have 2 positions open but after 30 minutes..."
        // This implies we wait for 30 minutes.
        return { action: "HOLD", reason: "Positions not yet expired" };
    }

    // 3. Select new asset
    // "Opportunity chosen that is going up at the moment"
    // "Not the same as the one sold"
    const soldMint = positionToSell ? positionToSell.mint : null;
    const validCandidates = candidates.filter(c => c.mint !== soldMint && !positions.some(p => p.mint === c.mint));
    
    if (validCandidates.length === 0) {
         if (positionToSell) {
             // If we MUST sell but have nothing to buy, do we sell? 
             // "so a new position can be opened" implies swap.
             // But strictly, clearing dead weight is good.
             return { action: "SELL_ONLY", sell: positionToSell, reason: "No buy candidates" };
         }
         return { action: "WAIT", reason: "No candidates" };
    }

    // Pick best candidate (highest score)
    validCandidates.sort((a, b) => b.score - a.score);
    const candidateToBuy = validCandidates[0];

    return {
        action: positionToSell ? "ROTATE" : "BUY",
        sell: positionToSell,
        buy: candidateToBuy
    };
}

// Test Runner
async function runTests() {
    console.log("🧪 Running Rotation Strategy Tests...");

    // Test 1: Rotate Expired Position
    console.log("Test 1: Rotate Expired Position (Token A)");
    const decision1 = getRotationDecision(MOCK_POSITIONS, MOCK_CANDIDATES);
    
    assert.strictEqual(decision1.action, "ROTATE", "Should decide to ROTATE");
    assert.strictEqual(decision1.sell.symbol, "TOKEN_A", "Should sell TOKEN_A (Expired & Loss)");
    assert.strictEqual(decision1.buy.symbol, "TOKEN_C", "Should buy TOKEN_C");
    console.log("✅ Passed");

    // Test 2: Hold if < 30 mins
    console.log("Test 2: Hold Fresh Positions");
    const freshPositions = [
        { ...MOCK_POSITIONS[1], entryTime: Date.now() - (5 * 60 * 1000) }, // 5m old
        { ...MOCK_POSITIONS[1], mint: "TokenD", symbol: "TOKEN_D", entryTime: Date.now() - (29 * 60 * 1000) } // 29m old
    ];
    const decision2 = getRotationDecision(freshPositions, MOCK_CANDIDATES);
    assert.strictEqual(decision2.action, "HOLD", "Should HOLD fresh positions");
    console.log("✅ Passed");

    // Test 3: Fill Empty Slot
    console.log("Test 3: Fill Empty Slot");
    const onePosition = [MOCK_POSITIONS[1]];
    const decision3 = getRotationDecision(onePosition, MOCK_CANDIDATES);
    assert.strictEqual(decision3.action, "BUY", "Should BUY to fill slot");
    assert.strictEqual(decision3.buy.symbol, "TOKEN_C", "Should buy TOKEN_C");
    console.log("✅ Passed");

    console.log("🎉 All Tests Passed!");
}

runTests().catch(err => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});
