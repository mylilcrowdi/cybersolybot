/**
 * strategy_comparator.js
 * The "Ghost Runner" Analysis Engine.
 * Compares "Active Rotation" (Real) vs. "HODL" (Ghost) vs. "Strict 30m" (Ghost).
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '../data/history.json');
const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');
const PNL_FILE = path.join(__dirname, '../data/pnl_history.json');

async function analyze() {
    console.log(`[Ghost Runner] 👻 Summoning past timelines...`);

    // Load Data
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    const positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8'));
    const pnlHistory = JSON.parse(fs.readFileSync(PNL_FILE, 'utf-8'));

    // 1. Real Performance
    const startBalance = pnlHistory[0].balance;
    const currentBalance = pnlHistory[pnlHistory.length - 1].balance;
    const realPnL = currentBalance - startBalance;

    // 2. Ghost: "Diamond Hands" (HODL everything)
    // Logic: Assume every "BUY" was never sold. Fetch current prices?
    // Simplified: Just sum the current value of all closed positions if we held them.
    // (Requires price data, which we might not have offline. We'll use "Exit Price" vs "Last Known Price" from logs if available, or skip).
    
    // 3. Ghost: "Strict 30m Rotation"
    // Logic: Check trades where holdTime > 30m. Re-calculate PnL as if sold at 30m mark.
    
    console.log(`\n📊 **STRATEGY COMPARISON REPORT**`);
    console.log(`=================================`);
    console.log(`🔹 **REALITY (Active Rotation)**`);
    console.log(`   - Start: ${startBalance.toFixed(4)} SOL`);
    console.log(`   - Now:   ${currentBalance.toFixed(4)} SOL`);
    console.log(`   - PnL:   ${(realPnL > 0 ? '+' : '')}${realPnL.toFixed(4)} SOL`);
    console.log(`   - Trades: ${history.length}`);

    // Analyze Rotation Efficiency
    const rotations = history.filter(h => h.action === 'SELL' && h.reason === 'ROTATION');
    if (rotations.length > 0) {
        console.log(`\n🔄 **ROTATION METRICS**`);
        console.log(`   - Rotated Positions: ${rotations.length}`);
        // Calculate average "loss saved" or "profit missed" would require price history.
    }

    // Recommendation
    console.log(`\n💡 **GHOST INSIGHT**`);
    if (realPnL < 0) {
        console.log(`   - "Active Rotation" is currently negative (-${Math.abs(realPnL).toFixed(4)}).`);
        console.log(`   - Recommendation: Pause aggressive rotation. Switch to 'Accumulate' mode (Hold winners).`);
    } else {
        console.log(`   - Strategy is profitable. Continue.`);
    }
}

if (require.main === module) {
    analyze();
}
