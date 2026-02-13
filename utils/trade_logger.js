const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_FILE = path.join(__dirname, '../data/history.json');
const MAX_HISTORY_ITEMS = 1000; // Keep file size manageable

class TradeLogger {
    constructor() {
        this.ensureFile();
    }

    ensureFile() {
        const dir = path.dirname(LOG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
    }

    async logAction(action) {
        const entry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            ...action
        };

        try {
            // Optimization: Read, Trim, Write
            // Ideally we'd use a DB or append-only stream, but for JSON compat:
            let history = [];
            try {
                const data = fs.readFileSync(LOG_FILE, 'utf8');
                history = JSON.parse(data);
            } catch (e) { history = []; }

            history.push(entry);

            // Prune if too large
            if (history.length > MAX_HISTORY_ITEMS) {
                // Keep last N items
                history = history.slice(-MAX_HISTORY_ITEMS);
            }

            fs.writeFileSync(LOG_FILE, JSON.stringify(history, null, 2));
            console.log(`[Logger] Action logged: ${entry.type} ${entry.token || ''} (${entry.status})`);
            return entry;
        } catch (err) {
            console.error('[Logger] Failed to write log:', err.message);
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
