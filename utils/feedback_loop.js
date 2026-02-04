/**
 * feedback_loop.js
 * The "Optimizer" of Agent Cyber.
 * Analyzes past trades to suggest filter adjustments.
 */

const logger = require('./trade_logger');

class FeedbackLoop {
    /**
     * Analyzes trade history to find patterns in failed/successful trades.
     */
    async selfReflect() {
        const history = logger.getHistory();
        const results = history.filter(h => h.type === 'TRADE_RESULT');

        if (results.length < 5) {
            return "Insufficient data for self-reflection.";
        }

        const winRate = results.filter(r => r.profit > 0).length / results.length;
        
        console.log(`[Feedback] 🧠 Win Rate: ${(winRate * 100).toFixed(2)}%`);

        if (winRate < 0.4) {
            console.log("[Feedback] 🛠 AUTO-ADJUST: Tightening fast-brain filters due to low win rate.");
            // In a live system, this would write new thresholds to .env or a config file
        }
    }
}

module.exports = new FeedbackLoop();
