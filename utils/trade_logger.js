const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_FILE = path.join(__dirname, '../data/history.json');

class TradeLogger {
    constructor() {
        this.ensureFile();
    }

    ensureFile() {
        if (!fs.existsSync(LOG_FILE)) {
            // Ensure directory exists
            const dir = path.dirname(LOG_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
        }
    }

    async logAction(action) {
        // action: { type, token, amount, price, signature, strategy, status, ... }
        const entry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            ...action
        };

        try {
            const data = fs.readFileSync(LOG_FILE, 'utf8');
            const history = JSON.parse(data);
            history.push(entry);
            fs.writeFileSync(LOG_FILE, JSON.stringify(history, null, 2));
            console.log(`[Logger] Action logged: ${entry.type} ${entry.token || ''} (${entry.status})`);
            return entry;
        } catch (err) {
            console.error('[Logger] Failed to write log:', err);
            return null;
        }
    }

    getHistory() {
        try {
            const data = fs.readFileSync(LOG_FILE, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            return [];
        }
    }
}

module.exports = new TradeLogger();
