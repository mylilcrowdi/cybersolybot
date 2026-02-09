const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const bs58 = require('bs58');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed');
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');

async function sweepWallet() {
    console.log("[Sweep] 🧹 Starting wallet reconciliation...");
    
    // Load Wallet
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')));
    const { Keypair } = require('@solana/web3.js');
    const wallet = Keypair.fromSecretKey(secretKey);
    console.log(`[Sweep] Wallet: ${wallet.publicKey.toBase58()}`);

    // Get all token accounts
    const accounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        programId: TOKEN_PROGRAM_ID
    });

    console.log(`[Sweep] Found ${accounts.value.length} token accounts.`);

    const holdings = [];
    
    for (const { account } of accounts.value) {
        const info = account.data.parsed.info;
        const amount = info.tokenAmount.uiAmount;
        const mint = info.mint;

        if (amount > 0.000001) { // Ignore dust
            console.log(`[Sweep] 💰 Holding: ${amount} of ${mint}`);
            holdings.push({ mint, amount });
        }
    }

    // Check against known positions
    const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');
    let knownPositions = [];
    if (fs.existsSync(POSITIONS_FILE)) {
        knownPositions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
    }

    // Identify Unknowns
    const unknownHoldings = holdings.filter(h => !knownPositions.find(p => p.address === h.mint)); // Note: positions.json stores pool address in 'address', but we might not have the mint easily mapped. 
    // Actually, positions.json usually stores the POOL address, not the token mint.
    // We need to be smarter. If we hold a token, it's an "Active Position" regardless of whether it's in an LP or a raw token.
    
    if (unknownHoldings.length > 0) {
        console.log(`[Sweep] ⚠️ Found ${unknownHoldings.length} UNTRACKED assets! Injecting into memory...`);
        
        unknownHoldings.forEach(h => {
            // Check if it's already in there to avoid dups (mint vs address confusion)
            // For raw tokens, we'll use the mint as the address
            if (!knownPositions.find(p => p.address === h.mint)) {
                knownPositions.push({
                    address: h.mint,
                    name: `UNTRACKED_${h.mint.slice(0,4)}`,
                    entryTime: Date.now(), // Assume now
                    entryUtil: 0,
                    allocation: 0.05, // Assumed cost basis
                    status: "active_holding", // New status for raw tokens
                    amount: h.amount
                });
            }
        });

        fs.writeFileSync(POSITIONS_FILE, JSON.stringify(knownPositions, null, 2));
        console.log("[Sweep] ✅ Memory updated. The bot should now manage these tokens.");
    } else {
        console.log("[Sweep] All holdings are tracked.");
    }
}

sweepWallet();
