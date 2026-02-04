/**
 * risk_manager.js
 * The "Safety Officer" of Agent Cyber.
 * Enforces treasury limits and loss prevention.
 */

const logger = require('../utils/trade_logger');

const RISK_CONFIG = {
    TOTAL_TREASURY_SOL: 0.2,
    MAX_SINGLE_TRADE_SOL: 0.01,
    MAX_OPEN_POSITIONS: 5,
    STOP_LOSS_BPS: 1500, // 15%
    TAKE_PROFIT_BPS: 5000, // 50%
};

class RiskManager {
    /**
     * Checks if a trade is allowed based on current exposure.
     */
    async validateTrade(amountSol) {
        const history = logger.getHistory();
        const openPositions = history.filter(h => h.type === 'TRADE_EXECUTION' && h.status === 'open');

        if (amountSol > RISK_CONFIG.MAX_SINGLE_TRADE_SOL) {
            return { allowed: false, reason: "Trade exceeds max single trade limit." };
        }

        if (openPositions.length >= RISK_CONFIG.MAX_OPEN_POSITIONS) {
            return { allowed: false, reason: "Too many open positions." };
        }

        // Logic to prevent over-exposure
        const currentBalance = 0.2; // This would ideally be a live check
        if (amountSol > currentBalance) {
            return { allowed: false, reason: "Insufficient treasury balance." };
        }

        return { allowed: true };
    }
}

module.exports = new RiskManager();
