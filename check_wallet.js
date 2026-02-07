const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, 'confirmed');
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');

async function checkBalance() {
    try {
        const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')));
        const wallet = Keypair.fromSecretKey(secretKey);
        
        const balance = await connection.getBalance(wallet.publicKey);
        const solBalance = balance / 1e9;
        
        console.log(`WALLET_ADDRESS=${wallet.publicKey.toBase58()}`);
        console.log(`BALANCE_SOL=${solBalance}`);
    } catch (err) {
        console.error("Error:", err.message);
    }
}

checkBalance();