const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../data/history.json');
let data = fs.readFileSync(file, 'utf8');

// The corruption signature seen in logs
const corruptionIndex = data.lastIndexOf(']oks organic');

if (corruptionIndex !== -1) {
    console.log("Found specific corruption signature. Truncating...");
    // We want to keep the ']' at corruptionIndex? No, 'oks' implies the ']' might be part of the garbage or the valid end.
    // If it's `...} ]oks...`, then `]` is the closer.
    // Let's try parsing up to corruptionIndex + 1
    const attempt = data.substring(0, corruptionIndex + 1);
    try {
        JSON.parse(attempt);
        fs.writeFileSync(file, attempt);
        console.log("Fixed.");
        process.exit(0);
    } catch (e) {
        console.log("Truncation at ] failed:", e.message);
    }
}

// Fallback: Find last `}` and close
const lastClose = data.lastIndexOf('  },');
if (lastClose !== -1) {
    console.log("Fallback: Truncating at last object...");
    const fixed = data.substring(0, lastClose + 4).trim().replace(/,$/, '') + '\n]';
    fs.writeFileSync(file, fixed);
    console.log("Fixed via fallback.");
}
