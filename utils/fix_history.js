const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../data/history.json');

try {
    const data = fs.readFileSync(file, 'utf8');
    // Try to parse
    JSON.parse(data);
    console.log("JSON is valid.");
} catch (e) {
    console.log("JSON invalid. Attempting repair...");
    let data = fs.readFileSync(file, 'utf8');
    
    // Look for the last valid closing brace of an object
    const lastClose = data.lastIndexOf('}');
    if (lastClose !== -1) {
        // Cut everything after the last object and close the array
        const fixed = data.substring(0, lastClose + 1) + '\n]';
        try {
            JSON.parse(fixed);
            fs.writeFileSync(file, fixed);
            console.log("Fixed JSON and saved.");
        } catch (e2) {
            console.error("Failed to fix JSON:", e2.message);
        }
    }
}
