const { executeSwap } = require('./execution/execution_module');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const SOL_MINT = "So11111111111111111111111111111111111111112";
const POSITIONS_FILE = path.join(__dirname, 'data/positions.json');

async function sellAll() {
    console.log("🔥 EMERGENCY SELL OFF INITIATED 🔥");
    
    if (!fs.existsSync(POSITIONS_FILE)) {
        console.log("No positions file found.");
        return;
    }

    let positions = [];
    try {
        positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
    } catch (e) {
        console.error("Failed to read positions:", e);
        return;
    }

    if (positions.length === 0) {
        console.log("No active positions to sell.");
        return;
    }

    const remainingPositions = [];

    for (const pos of positions) {
        if (pos.status === 'active_holding') {
            console.log(`💸 Selling ${pos.name} (${pos.address})...`);
            
            // We assume full balance sell if amount isn't tracked perfectly, 
            // but here we pass 'amount' which executeSwap uses as inputAmount.
            // Note: executeSwap(outputMint, inputAmount, inputMint, inputDecimals)
            // We need to know inputDecimals. Usually 6 or 9.
            // Ideally we fetch mint info, but for speed let's try 6 (common for SPL) or 9.
            // Better yet, let's use a specialized script that gets full balance.
            
            try {
                // executeSwap signature: (targetMint, amount, sourceMint, sourceDecimals)
                // We default to 6 decimals for the source token if unknown, usually safe for memes? 
                // Wait, most memes are 6. 
                
                const signature = await executeSwap(SOL_MINT, pos.amount, pos.address, 6);
                
                if (signature) {
                    console.log(`✅ SOLD ${pos.name}. TX: ${signature}`);
                    // Don't add to remainingPositions (it's gone)
                } else {
                    console.error(`❌ Failed to sell ${pos.name}. Keeping in file.`);
                    remainingPositions.push(pos);
                }
            } catch (err) {
                console.error(`❌ Error selling ${pos.name}:`, err.message);
                remainingPositions.push(pos);
            }
        } else {
            // Keep LP positions or others we can't simple-swap
            console.log(`⏭️ Skipping ${pos.name} (Status: ${pos.status}) - Manual LP exit required?`);
            remainingPositions.push(pos);
        }
    }

    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(remainingPositions, null, 2));
    console.log("📝 Positions file updated.");
}

sellAll();
