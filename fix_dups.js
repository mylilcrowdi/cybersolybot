const fs = require('fs');
const path = require('path');

const POSITIONS_FILE = path.join(__dirname, 'data/positions.json');

try {
    let positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
    
    // Deduplicate based on address or name
    const uniquePositions = [];
    const seen = new Set();

    positions.forEach(pos => {
        const key = pos.address + pos.name;
        if (!seen.has(key)) {
            uniquePositions.push(pos);
            seen.add(key);
        }
    });

    // If we have dups, just keep the newest one or first one?
    // Let's keep unique entries. If multiple same entries exist, it's a bug.
    
    // Actually, filter by name/symbol to enforce "Never the same token" rule retroactively
    const uniqueBySymbol = [];
    const seenSymbols = new Set();
    
    uniquePositions.forEach(pos => {
        if (!seenSymbols.has(pos.name)) {
            uniqueBySymbol.push(pos);
            seenSymbols.add(pos.name);
        }
    });

    console.log(`[Fix] Cleaning positions. Before: ${positions.length}, After: ${uniqueBySymbol.length}`);
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(uniqueBySymbol, null, 2));

} catch (err) {
    console.error("Error fixing positions:", err);
}
