const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, { commitment: 'confirmed' });
const SOL_MINT = "So11111111111111111111111111111111111111112";

// Load Wallet Public Key
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');
const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')));
const { Keypair } = require('@solana/web3.js');
const wallet = Keypair.fromSecretKey(secretKey);

async function inspectWallet() {
    console.log(`[Inspect] 🔍 Scanning ${wallet.publicKey.toBase58()}...`);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        programId: TOKEN_PROGRAM_ID
    });

    console.log(`[Inspect] Found ${tokenAccounts.value.length} token accounts.`);

    tokenAccounts.value.forEach(({ account, pubkey }) => {
        const parsed = account.data.parsed.info;
        const mint = parsed.mint;
        const uiAmount = parsed.tokenAmount.uiAmount;
        const decimals = parsed.tokenAmount.decimals;
        const amount = parsed.tokenAmount.amount;

        console.log(`- Mint: ${mint}`);
        console.log(`  Addr: ${pubkey.toBase58()}`);
        console.log(`  Balance: ${uiAmount} (Atomic: ${amount}, Decimals: ${decimals})`);
        
        if (uiAmount > 0 && uiAmount < 0.000001) {
            console.log(`  ⚠️ DUST DETECTED (Too small to sell, blocks closing)`);
        }
    });
}

inspectWallet();
