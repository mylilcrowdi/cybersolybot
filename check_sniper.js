const { Connection, PublicKey } = require('@solana/web3.js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connection = new Connection(process.env.RPC_ENDPOINT);
const SNIPER_WALLET = "4DkcEpTG8fTdnUDtQshiCPBKXZrchE9X4R9F77CvbPzp";

async function check() {
    try {
        const balance = await connection.getBalance(new PublicKey(SNIPER_WALLET));
        console.log(`SNIPER_BALANCE:${balance / 1e9}`);
    } catch (e) {
        console.error(e);
    }
}
check();