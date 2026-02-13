const { Connection, Keypair, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { swapJupiter: engineSwap } = require('./execution/swap_engine');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, { commitment: 'confirmed' });
const SOL_MINT = "So11111111111111111111111111111111111111112";

// Load Wallet
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');
const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')));
const wallet = Keypair.fromSecretKey(secretKey);

async function sellAllTokens() {
    console.log(`[Reset] 🧹 Scanning wallet ${wallet.publicKey.toBase58()} for ALL tokens...`);

    // Fetch all token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        programId: TOKEN_PROGRAM_ID
    });

    console.log(`[Reset] Found ${tokenAccounts.value.length} token accounts.`);

    for (const { account, pubkey } of tokenAccounts.value) {
        const parsed = account.data.parsed.info;
        const mint = parsed.mint;
        const amount = parsed.tokenAmount.amount; // String (atomic)
        const decimals = parsed.tokenAmount.decimals;
        const uiAmount = parsed.tokenAmount.uiAmount;

        if (mint === SOL_MINT) continue; // Skip Wrapped SOL if it appears (usually native SOL is separate)
        if (uiAmount <= 0.000001) continue; // Skip Dust

        console.log(`[Reset] 🚨 Found Asset: ${uiAmount} of ${mint}`);

        // SELL IT
        try {
            console.log(`[Reset] 💸 Selling ${mint}...`);
            const swapTransactionBase64 = await engineSwap(mint, SOL_MINT, amount, 200, wallet.publicKey);
            
            if (swapTransactionBase64) {
                const swapTransactionBuf = Buffer.from(swapTransactionBase64, 'base64');
                const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
                transaction.sign([wallet]);

                const signature = await connection.sendRawTransaction(transaction.serialize(), {
                    skipPreflight: true,
                    maxRetries: 3
                });
                console.log(`[Reset] ✅ SOLD ${mint}. TX: https://solscan.io/tx/${signature}`);
            } else {
                console.log(`[Reset] ❌ Could not get quote for ${mint} (Liquidity too low?)`);
            }
        } catch (err) {
            console.error(`[Reset] ❌ Failed to sell ${mint}: ${err.message}`);
        }
    }
    
    // Clear local state
    fs.writeFileSync(path.join(__dirname, 'data/positions.json'), '[]');
    console.log(`[Reset] 🗑️ positions.json wiped.`);
}

sellAllTokens();
