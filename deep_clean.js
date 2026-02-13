const { Connection, Keypair, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
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

async function deepScanAndSell() {
    console.log(`[Deep Clean] 🤿 Scanning wallet ${wallet.publicKey.toBase58()}...`);

    // Scan Standard Token Program
    const standardAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        programId: TOKEN_PROGRAM_ID
    });
    console.log(`[Deep Clean] Found ${standardAccounts.value.length} Standard Token Accounts.`);

    // Scan Token-2022 Program (Likely where the "invisible" tokens are!)
    const token2022Accounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        programId: TOKEN_2022_PROGRAM_ID
    });
    console.log(`[Deep Clean] Found ${token2022Accounts.value.length} Token-2022 Accounts.`);

    const allAccounts = [...standardAccounts.value, ...token2022Accounts.value];

    for (const { account, pubkey } of allAccounts) {
        const parsed = account.data.parsed.info;
        const mint = parsed.mint;
        const amount = parsed.tokenAmount.amount; // String (atomic)
        const uiAmount = parsed.tokenAmount.uiAmount;
        const decimals = parsed.tokenAmount.decimals;

        if (mint === SOL_MINT) continue; 
        if (uiAmount <= 0.000001) continue; 

        console.log(`[Deep Clean] 🚨 TARGET ACQUIRED: ${uiAmount} of ${mint}`);

        try {
            console.log(`[Deep Clean] 🔫 Selling ${mint}...`);
            const swapTransactionBase64 = await engineSwap(mint, SOL_MINT, amount, 200, wallet.publicKey);
            
            if (swapTransactionBase64) {
                const swapTransactionBuf = Buffer.from(swapTransactionBase64, 'base64');
                const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
                transaction.sign([wallet]);

                const signature = await connection.sendRawTransaction(transaction.serialize(), {
                    skipPreflight: true,
                    maxRetries: 3
                });
                console.log(`[Deep Clean] ✅ DESTROYED ${mint}. TX: https://solscan.io/tx/${signature}`);
            } else {
                console.log(`[Deep Clean] ❌ Swap failed (No Route/Liquidity) for ${mint}`);
            }
        } catch (err) {
            console.error(`[Deep Clean] ❌ Error processing ${mint}: ${err.message}`);
        }
    }
}

deepScanAndSell();
