const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '../data/history.json');
const PNL_FILE = path.join(__dirname, '../data/pnl_history.json');
const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');

function calculateSharpe(pnlEntries) {
    if (pnlEntries.length < 2) return 0;
    
    // Calculate daily returns
    const returns = [];
    for (let i = 1; i < pnlEntries.length; i++) {
        const prev = pnlEntries[i-1].balance;
        const curr = pnlEntries[i].balance;
        if (prev > 0) returns.push((curr - prev) / prev);
    }

    if (returns.length === 0) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualized Sharpe (assuming daily data, but our data might be minute-based)
    // If minute-based, this might be huge. Let's just return raw Risk/Reward ratio for now.
    return stdDev === 0 ? 0 : mean / stdDev;
}

function analyzeStrategy() {
    console.log("🧠 CYBER_CORE: Initiating Strategic Review...");

    // 1. Load Data
    const pnlHistory = JSON.parse(fs.existsSync(PNL_FILE) ? fs.readFileSync(PNL_FILE, 'utf8') : "[]");
    const history = JSON.parse(fs.existsSync(HISTORY_FILE) ? fs.readFileSync(HISTORY_FILE, 'utf8') : "[]");
    
    if (pnlHistory.length === 0) {
        return { status: "NO_DATA", recommendation: "WAIT" };
    }

    // 2. Calculate Metrics
    const startBal = pnlHistory[0].balance;
    const endBal = pnlHistory[pnlHistory.length - 1].balance;
    const totalReturn = ((endBal - startBal) / startBal) * 100;
    
    const volatility = calculateSharpe(pnlHistory); // Proxy for stability

    // 3. Trade Analysis
    const exits = history.filter(h => h.type.includes('EXIT'));
    const wins = exits.filter(h => (h.pnl || 0) > 0).length;
    const totalExits = exits.length;
    const winRate = totalExits > 0 ? (wins / totalExits) * 100 : 0;

    // 4. Formulate Directive
    let directive = "MAINTAIN";
    let reasoning = "";

    if (totalReturn < -10) {
        directive = "PIVOT_URGENT";
        reasoning = "Drawdown exceeds 10%. Strategy failing.";
    } else if (volatility < 0.1 && totalExits > 10) {
        directive = "OPTIMIZE";
        reasoning = "Low volatility implies passive behavior. Increase risk tolerance?";
    } else if (winRate < 40 && totalExits > 5) {
        directive = "TIGHTEN_STOPS";
        reasoning = "Win rate below 40%. Execution quality is poor.";
    } else {
        directive = "SCALE_UP";
        reasoning = "Systems nominal. Profitable trajectory.";
    }

    const report = {
        timestamp: new Date().toISOString(),
        metrics: {
            balance: endBal,
            returnPct: totalReturn.toFixed(2),
            winRate: winRate.toFixed(1),
            trades: totalExits,
            riskScore: volatility.toFixed(4)
        },
        directive,
        reasoning
    };

    console.log(JSON.stringify(report, null, 2));
    return report;
}

if (require.main === module) {
    analyzeStrategy();
}

module.exports = { analyzeStrategy };
