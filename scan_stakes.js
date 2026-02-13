const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, { commitment: 'confirmed' });
const STAKE_PROGRAM_ID = new PublicKey("Stake11111111111111111111111111111111111111");

// Load Wallet
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');
const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')));
const { Keypair } = require('@solana/web3.js');
const wallet = Keypair.fromSecretKey(secretKey);

async function findStakeAccounts() {
    console.log(`[Stake Scan] 🔍 Searching for Stake Accounts owned by ${wallet.publicKey.toBase58()}...`);

    // Stake accounts have an Authorized struct at offset 12 (Meta) or 44? 
    // It's easier to use getProgramAccounts with memcmp on the Withdrawer/Staker field.
    // However, the offset depends on the account state (initialized vs uninitialized).
    // Standard Stake State:
    // State Enum (4 bytes)
    // Meta (120 bytes) -> RentExemptReserve(8) + Authorized(64) + Lockup(48)
    // Authorized: Staker(32) + Withdrawer(32)
    
    // Offset for Staker: 4 (State) + 8 (Rent) = 12
    // Offset for Withdrawer: 4 + 8 + 32 = 44
    
    // Check for Staker
    const stakerAccounts = await connection.getProgramAccounts(STAKE_PROGRAM_ID, {
        filters: [
            { memcmp: { offset: 12, bytes: wallet.publicKey.toBase58() } }
        ]
    });

    // Check for Withdrawer (usually the same, but good to check)
    const withdrawerAccounts = await connection.getProgramAccounts(STAKE_PROGRAM_ID, {
        filters: [
            { memcmp: { offset: 44, bytes: wallet.publicKey.toBase58() } }
        ]
    });

    const uniqueAccounts = new Set();
    stakerAccounts.forEach(a => uniqueAccounts.add(a.pubkey.toBase58()));
    withdrawerAccounts.forEach(a => uniqueAccounts.add(a.pubkey.toBase58()));

    console.log(`[Stake Scan] Found ${uniqueAccounts.size} stake accounts.`);

    for (const address of uniqueAccounts) {
        const balance = await connection.getBalance(new PublicKey(address));
        console.log(`- Stake Account: ${address}`);
        console.log(`  Balance: ${balance / 1e9} SOL`);
        
        // We could deactivate/withdraw here if requested
    }
}

findStakeAccounts();
