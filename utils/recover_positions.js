const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '../data/history.json');
const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');

function recover() {
    console.log("🔍 Scanning history for lost positions...");
    
    if (!fs.existsSync(HISTORY_FILE)) {
        console.error("No history file found.");
        return;
    }

    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    const entries = history.filter(h => h.type === 'YIELD_ENTRY');
    const exits = history.filter(h => h.type === 'YIELD_EXIT');

    const positions = [];

    entries.forEach(entry => {
        // Find if this entry has been exited
        // entry.symbol vs exit.symbol (or name)
        const hasExit = exits.find(exit => exit.symbol === entry.name || exit.symbol === entry.symbol);
        
        if (!hasExit) {
            console.log(`⚠️ Found Orphan: ${entry.name} (${entry.status || 'unknown'})`);
            
            // Reconstruct position object for yield_manager
            positions.push({
                address: entry.address,
                name: entry.name,
                entryTime: new Date(entry.timestamp).getTime(),
                entryUtil: entry.entryUtil,
                allocation: entry.allocation,
                status: entry.status === 'simulated' || entry.status === 'dry_run' ? 'simulated' : 'active',
                txHash: entry.txHash
            });
        } else {
            console.log(`✅ Closed: ${entry.name}`);
        }
    });

    console.log(`\nRecovered ${positions.length} positions.`);
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
    console.log("💾 Saved to data/positions.json");
}

recover();
