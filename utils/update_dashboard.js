const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const STATUS_FILE = path.join(__dirname, '../data/status.json');
const HISTORY_FILE = path.join(__dirname, '../data/history.json');
const PUBLIC_FILE = path.join(__dirname, '../docs/data.json');

// Get last 50 logs
function getRecentLogs(history) {
    return history.slice(-50).map(entry => ({
        time: entry.timestamp,
        level: getLevel(entry.type),
        msg: formatMsg(entry)
    }));
}

function getLevel(type) {
    if (type.includes('ERROR')) return 'ERROR';
    if (type.includes('WARN')) return 'WARN';
    if (type.includes('EXIT')) return 'PROFIT';
    if (type.includes('ENTRY')) return 'SUCCESS';
    return 'INFO';
}

function formatMsg(entry) {
    if (entry.type === 'DISCOVERY_SIGNAL') return `Detected signal: ${entry.name} ($${entry.symbol})`;
    if (entry.type === 'YIELD_ENTRY') return `Entered Yield Farm: ${entry.name}`;
    if (entry.type === 'YIELD_EXIT') return `Exited Position: ${entry.symbol}`;
    return `${entry.type}: ${entry.token || 'System Event'}`;
}

async function updateDashboard() {
    try {
        let status = {};
        let history = [];

        if (fs.existsSync(STATUS_FILE)) {
            status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        }
        if (fs.existsSync(HISTORY_FILE)) {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        }

        // Calculate PnL (Mock logic for now, real logic would sum exited trades)
        const pnl = history
            .filter(h => h.type === 'YIELD_EXIT')
            .length * 0.005; // Dummy logic: 0.005 SOL per win

        const dashboardData = {
            heartbeat: status.status || "OFFLINE",
            uptime: status.lastUpdate ? Date.now() - status.lastUpdate : 0, // Approx
            health: status.health || "UNKNOWN",
            pnl: pnl,
            logs: getRecentLogs(history),
            positions: status.positions || [], 
            thought: "Analyzing market microstructure for next opportunity..."
        };

        fs.writeFileSync(PUBLIC_FILE, JSON.stringify(dashboardData, null, 2));
        console.log("[Dashboard] Updated docs/data.json");
        
        // Auto-Push to GitHub
        commitAndPush();

    } catch (err) {
        console.error("[Dashboard] Update failed:", err);
    }
}

function commitAndPush() {
    const cmd = `cd ${path.join(__dirname, '..')} && git add docs/data.json && git commit -m "chore: Update dashboard stats" && git push`;
    
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`[Dashboard] Git Push Error: ${error.message}`);
            return;
        }
        console.log(`[Dashboard] Git Push Success: ${stdout}`);
    });
}

updateDashboard();
