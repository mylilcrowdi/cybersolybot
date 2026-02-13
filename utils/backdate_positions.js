const fs = require('fs');
const path = require('path');

const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');

if (fs.existsSync(POSITIONS_FILE)) {
    const positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
    
    positions.forEach(p => {
        if (p.status === 'active_holding') {
            console.log(`Backdating ${p.name}...`);
            p.entryTime = Date.now() - (4 * 60 * 60 * 1000); // -4 hours
        }
    });

    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
    console.log("Updated positions.json");
}
