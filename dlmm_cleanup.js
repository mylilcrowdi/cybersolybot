const { Connection, PublicKey, Keypair, sendAndConfirmTransaction } = require('@solana/web3.js');
const DLMM = require('@meteora-ag/dlmm');
const fs = require('fs');
const path = require('path');
const BN = require('bn.js');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, { commitment: 'confirmed' });
const DLMM_PROGRAM_ID = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");

// Load Wallet
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');
const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')));
const wallet = Keypair.fromSecretKey(secretKey);

async function scanAndCloseDlmm() {
    console.log(`[DLMM Scan] 🛰️ Scanning for Meteora Positions...`);
    
    // Position V2 Layout in Anchor:
    // Discriminator (8) + LB Pair (32) + Owner (32) ...
    // So Owner should be at offset 8 + 32 = 40.
    
    // Let's try to find accounts where Owner == Wallet
    const filters = [
        {
            memcmp: {
                offset: 40, // 8 (discriminator) + 32 (lbPair)
                bytes: wallet.publicKey.toBase58()
            }
        }
    ];

    const accounts = await connection.getProgramAccounts(DLMM_PROGRAM_ID, {
        filters: filters
    });

    console.log(`[DLMM Scan] Found ${accounts.length} active LP positions.`);

    if (accounts.length === 0) {
        console.log("[DLMM Scan] ✅ No positions found.");
        return;
    }

    for (const { pubkey, account } of accounts) {
        console.log(`[DLMM Scan] 🔦 Inspecting Position: ${pubkey.toBase58()}...`);
        
        try {
            // We need to initialize the DLMM instance to close it.
            // But DLMM.create() takes a PAIR address, not a POSITION address.
            // We need to extract the Pair address from the account data.
            // Offset 8 is the LBPair address (32 bytes).
            
            const lbPairBuffer = account.data.slice(8, 40);
            const lbPair = new PublicKey(lbPairBuffer);
            console.log(`[DLMM Scan] 🔗 Belongs to Pair: ${lbPair.toBase58()}`);

            const dlmmPool = await DLMM.default.create(connection, lbPair);
            
            // Now we can use the SDK to close specific position
            // But the SDK methods usually look up positions by user. 
            // Let's verify if `dlmmPool.getPositionsByUserAndLbPair` finds it.
            
            const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey, lbPair);
            const targetPos = userPositions.find(p => p.publicKey.toBase58() === pubkey.toBase58());

            if (targetPos) {
                console.log(`[DLMM Scan] 📉 Closing ${pubkey.toBase58()}...`);
                
                const binIds = targetPos.positionData.positionBinData.map(bin => bin.binId);
                const removeLiquidityTx = await dlmmPool.removeLiquidity({
                    position: targetPos.publicKey,
                    user: wallet.publicKey,
                    binIds,
                    bps: new BN(10000),
                    shouldClaimAndClose: true
                });

                const txs = Array.isArray(removeLiquidityTx) ? removeLiquidityTx : [removeLiquidityTx];
                
                for (const tx of txs) {
                    const txHash = await sendAndConfirmTransaction(connection, tx, [wallet]);
                    console.log(`[DLMM Scan] ✅ Closed! TX: ${txHash}`);
                }
            } else {
                console.log(`[DLMM Scan] ⚠️ SDK could not match on-chain position data.`);
            }

        } catch (err) {
            console.error(`[DLMM Scan] ❌ Failed to close ${pubkey.toBase58()}: ${err.message}`);
        }
    }
}

scanAndCloseDlmm();
