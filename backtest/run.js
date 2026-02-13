/**
 * backtest/run.js
 * CLI runner for backtests.
 */

const BacktestEngine = require('./engine');
const MomentumStrategy = require('./strategies/momentum_basic');

// Mock Token for testing engine without API key first
const TEST_TOKEN = "So11111111111111111111111111111111111111112"; 

async function main() {
    const strategy = new MomentumStrategy();
    const engine = new BacktestEngine(strategy, { initialCapital: 10 }); // Start with 10 SOL

    // Load data (will fallback to synthetic if API fails)
    await engine.loadData(TEST_TOKEN, '1m', 1); // 1 day of 1m data

    // Run
    engine.run(TEST_TOKEN);
}

main();
