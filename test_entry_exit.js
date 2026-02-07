const { executeSwap, wallet } = require('./execution/execution_module');
const { scanMeteora } = require('./discovery/meteora_scanner');
const { Connection, PublicKey, Keypair, sendAndConfirmTransaction, ComputeBudgetProgram } = require('@solana/web3.js');
const DLMM = require('@meteora-ag/dlmm');
const { StrategyType } = require('@meteora-ag/dlmm');
const BN = require('bn.js');
require('dotenv').config();

const connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed');
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";

async function runTest() {
    console.log("🧪 STARTING ENTRY/EXIT TEST (Single-Sided Limit)...");

    // --- SWAP TEST ---
    console.log("\n--- [1/3] PREP: SWAP SOL -> USDC ---");
    // Swap 0.05 SOL. Enough for deposit.
    console.log("👉 Swapping Skipped (Pure SOL Strategy)...");

    // --- METEORA TEST ---
    console.log("\n--- [2/3] METEORA YIELD TEST (ENTRY) ---");
    
    const pools = await scanMeteora();
    if (!pools || pools.length === 0) return;

    const poolData = pools.find(p => 
        (p.mint_x === SOL_MINT && p.mint_y === USDC_MINT) || 
        (p.mint_x === USDC_MINT && p.mint_y === SOL_MINT)
    );
    
    if (!poolData) {
         console.error("❌ SOL-USDC pool not found.");
         return;
    }
    
    console.log(`🎯 Target Pool: ${poolData.name} (${poolData.address})`);
    
    let newPositionPubkey = null;

    try {
        const poolKey = new PublicKey(poolData.address);
        const dlmmPool = await DLMM.create(connection, poolKey);
        
        const activeBin = await dlmmPool.getActiveBin();
        const price = parseFloat(activeBin.pricePerToken);
        console.log(`Debug: Active Bin ${activeBin.binId}, Price ${price}`);
        
        const isSolX = poolData.mint_x === SOL_MINT;
        
        // Strategy: Deposit 0.02 SOL pure into a bin slightly above active.
        // This acts as a limit sell order.
        // If SOL is X, higher bin = higher price. We provide X.
        const offset = isSolX ? 5 : -5; 
        const targetBin = activeBin.binId + offset;
        
        const depositAmount = 0.02;
        const amountLamports = new BN(depositAmount * 1e9);
        
        let totalXAmount, totalYAmount;
        
        if (isSolX) {
            console.log("ℹ️  SOL is X. Targeting Higher Bin (Sell Side).");
            totalXAmount = amountLamports;
            totalYAmount = new BN(0);
        } else {
            console.log("ℹ️  SOL is Y. Targeting Lower Bin (Buy Side)."); 
            totalXAmount = new BN(0);
            totalYAmount = amountLamports;
        }

        console.log(`👉 Entering Meteora Position (Single-Sided)...`);
        console.log(`   X: ${totalXAmount.toString()} (lamports), Y: ${totalYAmount.toString()} (u6)`);
        console.log(`   Target Bin: ${targetBin} (Active: ${activeBin.binId})`);
        
        const positionKeypair = Keypair.generate();
        newPositionPubkey = positionKeypair.publicKey;
        
        // Use ByWeight to target specifically the target bin
        const newPosition = await dlmmPool.initializePositionAndAddLiquidityByWeight({
            positionPubKey: positionKeypair.publicKey,
            lbPairPubKey: poolKey,
            user: wallet.publicKey,
            totalXAmount,
            totalYAmount,
            xYAmountDistribution: [
                { binId: targetBin, weight: 100 }
            ]
        });

        if (!newPosition || !newPosition.transaction) throw new Error("Failed to create position tx");

        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 });
        const transaction = newPosition.transaction;
        transaction.add(modifyComputeUnits);

        console.log(`✍️ Sending Entry TX...`);
        const txHash = await sendAndConfirmTransaction(connection, transaction, [wallet, positionKeypair], {
            skipPreflight: true 
        });
        console.log(`✅ Meteora Entry Successful! TX: ${txHash}`);
        
        console.log("⏳ Waiting 15s...");
        await new Promise(r => setTimeout(r, 15000));

    } catch (err) {
        console.error("❌ Meteora Entry Failed:", err);
        return; 
    }

    // --- EXIT ---
    console.log("\n--- [3/3] METEORA YIELD TEST (EXIT) ---");
    try {
        const poolKey = new PublicKey(poolData.address);
        const dlmmPool = await DLMM.create(connection, poolKey); 
        
        const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey, poolKey);
        const targetPos = userPositions.find(p => p.publicKey.equals(newPositionPubkey));
        
        if (targetPos) {
            console.log(`Found position: ${targetPos.publicKey.toBase58()}`);
            console.log("👉 Closing Position...");
            
            const removeTx = await dlmmPool.closePosition({
                position: targetPos,
                user: wallet.publicKey,
                rentReceiver: wallet.publicKey,
                shouldClaimAndClose: true
            });
             
            if (Array.isArray(removeTx)) {
                 for (const tx of removeTx) {
                    await sendAndConfirmTransaction(connection, tx, [wallet], { skipPreflight: true });
                 }
                 console.log("✅ Meteora Exit Successful (Multiple TXs).");
            } else {
                 const txHashExit = await sendAndConfirmTransaction(connection, removeTx, [wallet], { skipPreflight: true });
                 console.log(`✅ Meteora Exit Successful! TX: ${txHashExit}`);
            }
        } else {
            console.error("❌ Position not found for exit.");
        }
    } catch (err) {
        console.error("❌ Meteora Exit Failed:", err);
    }
}

runTest();