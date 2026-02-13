/**
 * backtest/strategies/momentum_basic.js
 * A simple momentum strategy for testing the engine.
 */

class MomentumStrategy {
    constructor() {
        this.name = "Momentum Basic";
    }

    onCandle(context) {
        const { candle, history, positions } = context;
        if (history.length < 5) return null;

        const currentPrice = candle.close;
        const prevPrice = history[history.length - 2].close;
        const lookbackPrice = history[history.length - 5].close;

        // Logic: Buy if price increased 3% in last 5 candles
        // Sell if price drops 1% from entry (Stop Loss) or gains 5% (Take Profit)

        const activePos = positions[0]; // Simple single position logic

        if (!activePos) {
            // Entry Condition
            const change = (currentPrice - lookbackPrice) / lookbackPrice;
            if (change > 0.03) {
                return { type: 'BUY', mint: 'TEST_MINT' };
            }
        } else {
            // Exit Condition
            const pnlPct = (currentPrice - activePos.entryPrice) / activePos.entryPrice;
            
            if (pnlPct >= 0.05) return { type: 'SELL', mint: 'TEST_MINT' }; // TP
            if (pnlPct <= -0.01) return { type: 'SELL', mint: 'TEST_MINT' }; // SL
        }

        return null;
    }
}

module.exports = MomentumStrategy;
