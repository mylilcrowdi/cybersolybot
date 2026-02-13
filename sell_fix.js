const { Connection, Keypair, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const { swapJupiter } = require('./execution/execution_module'); // Use the exported wrapper or engine directly
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

async function sellFullBalance(mintAddress) {
    const mint = new PublicKey(mintAddress);
    console.log(`[Sell] 🔍 Fetching full balance for ${mintAddress}...`);

    try {
        const ata = await getAssociatedTokenAddress(mint, wallet.publicKey);
        const account = await getAccount(connection, ata);
        const amount = account.amount; // BigInt
        
        if (amount === 0n) {
            console.log(`[Sell] ⚠️ Balance is 0. Nothing to sell.`);
            return;
        }

        console.log(`[Sell] 💰 Found Balance: ${amount.toString()} (Atomic Units)`);

        // Execute Swap via Engine directly to pass atomic amount
        console.log(`[Sell] 🔄 Swapping for SOL...`);
        
        // swapJupiter(inputMint, outputMint, amount, slippageBps)
        // Note: engineSwap expects number, but safe to pass if small enough or handle BigInt?
        // JS numbers are safe up to 9e15. Token supplies can trigger issues. 
        // Let's check swap_engine.js logic. It passes amount directly to URL.
        
        const swapTransactionBase64 = await engineSwap(mintAddress, SOL_MINT, amount.toString(), 200, wallet.publicKey);
        
        if (!swapTransactionBase64) {
            console.error("[Sell] ❌ Failed to get quote/transaction.");
            return;
        }

        const swapTransactionBuf = Buffer.from(swapTransactionBase64, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        transaction.sign([wallet]);

        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: true,
            maxRetries: 3
        });

        console.log(`[Sell] ✅ SOLD! Signature: https://solscan.io/tx/${signature}`);

    } catch (err) {
        if (err.message.includes("TokenAccountNotFoundError") || err.name === 'TokenAccountNotFoundError') {
             console.log(`[Sell] ⚠️ No Token Account found. You don't own this token.`);
        } else {
             console.error(`[Sell] ❌ Error: ${err.message}`);
        }
    }
}

// PENGUIN-SOL Mint from positions.json
const TARGET_MINT = "8Jx8AAHj86wbQgUTjGuj6GTTL5Ps3cqxKRTvpaJApump";
sellFullBalance(TARGET_MINT);
