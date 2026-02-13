/**
 * yield_manager.js
 * The "Farmer" of Agent Cyber.
 * Handles the lifecycle of Meteora DLMM positions using the @meteora-ag/dlmm SDK.
 */

const { scanMeteora } = require('../discovery/meteora_scanner');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction } = require('@solana/web3.js');
const { executeSwap } = require('./execution_module'); // Import Swap Fallback
const { getMint } = require('@solana/spl-token'); // Import getMint
const DLMM = require('@meteora-ag/dlmm');
const logger = require('../utils/trade_logger');
const fs = require('fs');
const path = require('path');
const BN = require('bn.js');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// --- Configuration ---
const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, { commitment: 'confirmed' });

const YIELD_CONFIG = {
    ENABLED: process.env.AUTO_YIELD === 'true', // Safety switch
    MIN_UTILIZATION: 0.5,
    MAX_POSITIONS: 2,     // STRICT LIMIT: Only 2 active bets
    ALLOCATION_SOL: 0.015,
    TAKE_PROFIT_PCT: 50,  
    STOP_LOSS_PCT: -11.5,
    TRAILING_ACTIVATION_PCT: 15,
    TRAILING_DISTANCE_PCT: 15,
    MAX_HOLD_HOURS: 4,
    DUST_CLEANUP_ENABLED: true
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const STABLE_PAIRS = ["SOL-USDC", "SOL-USDT", "USDC-SOL", "USDT-SOL"];

// Load Wallet
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');
let wallet;
try {
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8')));
    wallet = Keypair.fromSecretKey(secretKey);
} catch (err) {
    console.error(`[Yield] ❌ Wallet load failed:`, err.message);
}

// State tracking
const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');
let activePositions = []; 

// Pool Cache to prevent memory leak / high churn
const poolCache = new Map();

function loadPositions() {
    if (fs.existsSync(POSITIONS_FILE)) {
        try {
            activePositions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
            console.log(`[Yield] 📂 Loaded ${activePositions.length} active positions from disk.`);
        } catch (e) {
            console.error("[Yield] ❌ Failed to load positions:", e.message);
        }
    }
}

function savePositions() {
    try {
        fs.writeFileSync(POSITIONS_FILE, JSON.stringify(activePositions, null, 2));
    } catch (e) {
        console.error("[Yield] ❌ Failed to save positions:", e.message);
    }
}

async function getDlmmPool(address) {
    if (poolCache.has(address)) {
        const pool = poolCache.get(address);
        try {
            // Attempt to refresh state if supported
            if (pool.refetchStates) await pool.refetchStates();
            return pool;
        } catch (err) {
            console.warn(`[Yield] ⚠️ Pool refresh failed, recreating: ${err.message}`);
            poolCache.delete(address);
        }
    }
    
    try {
        const poolKey = new PublicKey(address);
        const pool = await DLMM.create(connection, poolKey);
        poolCache.set(address, pool);
        return pool;
    } catch (err) {
        console.error(`[Yield] ❌ Failed to create DLMM instance for ${address}:`, err.message);
        return null;
    }
}

async function runYieldCycle() {
    if (!wallet) return;
    loadPositions(); // Ensure sync
    console.log(`[Yield] 🌾 Starting Yield Management cycle... (Active Positions: ${activePositions.length})`);
    
    // Check Balance to prevent spamming errors
    const bal = await connection.getBalance(wallet.publicKey);
    const minBal = 0.02 * 1e9; // 0.02 SOL Reserve for Gas
    const canBuy = bal > (YIELD_CONFIG.ALLOCATION_SOL * 1e9 + minBal);

    // 1. DISCOVERY
    const pools = await scanMeteora();
    if (!pools || pools.length === 0) {
        await monitorPositions();
        return;
    }

    // Filter out "boring" pools (SOL-USDC, etc) unless they are going nuclear
    const aggressivePools = pools.filter(p => 
        !STABLE_PAIRS.includes(p.name) &&
        (p.mint_x === SOL_MINT || p.mint_y === SOL_MINT)
    );

    // 2. INTELLIGENCE (Cross-Reference with Agent Cyber's Brain)
    // We only want to farm signals that the main agent has flagged as bullish.
    const history = logger.getHistory();
    const now = Date.now();
    const COOLDOWN_MS = 15 * 60 * 1000; // 15 Minute Cooldown (~10-15 turns)

    // Build Blacklist from Recent Exits
    const recentExits = history.filter(h => 
        (now - new Date(h.timestamp).getTime()) < COOLDOWN_MS &&
        (h.type === "YIELD_EXIT" || (h.type === "TRADE_EXECUTION" && h.token === SOL_MINT))
    );
    
    const blacklistedNames = new Set(recentExits.map(h => h.symbol).filter(Boolean));
    const blacklistedMints = new Set(recentExits.map(h => h.inputMint).filter(Boolean));

    if (blacklistedNames.size > 0 || blacklistedMints.size > 0) {
        console.log(`[Yield] ⏳ Cooldown Active: Skipping ${[...blacklistedNames, ...blacklistedMints].join(', ')}`);
    }

    const recentSignals = history.filter(h => 
        h.type === "DISCOVERY_SIGNAL" && 
        (now - new Date(h.timestamp).getTime()) < 6 * 60 * 60 * 1000 // Last 6h
    );

    // 3. DECISION (Aggressive Mode: Active)
    if (canBuy) {
        // --- FORCE ENTRY LOGIC (Ensure at least 1 position) ---
        const forceEntry = activePositions.length === 0; 
        
        for (const pool of aggressivePools) { // Iterate aggressive pools only
            // Duplicate Check: Same ADDRESS (Pool) or Same NAME (Token Pair)
            const isAlreadyOpen = activePositions.find(p => p.address === pool.address || p.name === pool.name);
            
            // Cooldown Check
            const isCoolingDown = blacklistedNames.has(pool.name) || 
                                  blacklistedMints.has(pool.mint_x) || 
                                  blacklistedMints.has(pool.mint_y);

            if (isCoolingDown) continue; // Skip recent exits

            const vol = pool.metrics.volume || pool.metrics.volume_24h || 0;
            const tvl = parseFloat(pool.metrics.tvl) || 1;
            const volTvlRatio = vol / tvl;
            
            const isHighActivity = volTvlRatio > 0.2; // 20% turnover/day
            const isUtilized = pool.metrics.utilization >= YIELD_CONFIG.MIN_UTILIZATION;

            // If forcing entry, relax utilization check slightly or just pick the best volume
            const entryCondition = isUtilized || isHighActivity || (forceEntry && volTvlRatio > 0.1);

            if (!isAlreadyOpen && entryCondition) {
                
                // Intelligence Filter: Must match a recent signal OR have very high volume
                const matchingSignal = recentSignals.find(s => s.mint === pool.mint_x || s.mint === pool.mint_y);
                const score = matchingSignal ? matchingSignal.score : (isHighActivity ? 1 : 0);
                
                if (matchingSignal || isHighActivity || forceEntry) {
                    // --- POSITION ROTATION LOGIC ---
                    if (activePositions.length >= YIELD_CONFIG.MAX_POSITIONS) {
                        // ... (Rotation Logic same as before) ...
                        const worstPosition = activePositions.sort((a, b) => (a.pnl || 0) - (b.pnl || 0))[0];
                        if (score >= 2 && worstPosition) {
                            console.log(`[Yield] ♻️ ROTATION: Full. Selling ${worstPosition.name} for ${pool.name}...`);
                            let sold = false;
                            if (worstPosition.status === 'active') sold = await exitPosition(worstPosition);
                            else sold = await sellHolding(worstPosition);
                            if (sold) {
                                activePositions = activePositions.filter(p => p.address !== worstPosition.address);
                                savePositions();
                                await enterPosition(pool);
                            }
                        }
                    } else {
                        // Not full
                        if (forceEntry) console.log(`[Yield] ⚡ FORCE ENTRY (Empty Portfolio): Apeing ${pool.name} (Vol/TVL: ${volTvlRatio.toFixed(2)})`);
                        else if (matchingSignal) console.log(`[Yield] 🧠 Validated by Brain: ${pool.name} (Score: ${matchingSignal.score})`);
                        else console.log(`[Yield] 🌊 HIGH TURNOVER DETECTED: ${pool.name} (Vol/TVL: ${volTvlRatio.toFixed(2)}x). Entering for fees.`);
                        
                        await enterPosition(pool);
                        if (forceEntry) break; // Only force one
                    }
                }
            }
        }
    } else {
        console.log(`[Yield] ⚠️ Low Balance (${(bal/1e9).toFixed(4)} SOL). Need > ${(YIELD_CONFIG.ALLOCATION_SOL + 0.005).toFixed(3)} to buy.`);
    }

    // 4. MONITOR
    await monitorPositions();
    
    // Garbage collection hint (if run via node --expose-gc)
    if (global.gc) {
        global.gc();
    }
}

/**
 * Enters a DLMM Position
 * One-Sided Strategy: Deposit SOL (or USDC) only, into a concentrated bin.
 */
async function enterPosition(poolData) {
    console.log(`[Yield] 🚀 ENTERING POOL ${poolData.name} (${poolData.address})`);
    
    if (!YIELD_CONFIG.ENABLED) {
        console.log(`[Yield] 🧪 DRY RUN: Would deposit ${YIELD_CONFIG.ALLOCATION_SOL} SOL.`);
        activePositions.push({
            address: poolData.address,
            name: poolData.name,
            entryTime: Date.now(),
            entryUtil: poolData.metrics.utilization,
            allocation: YIELD_CONFIG.ALLOCATION_SOL,
            status: "simulated"
        });
        savePositions();
        return;
    }

    // Add randomized delay to avoid rate limit synchronization
    await new Promise(r => setTimeout(r, Math.random() * 2000));

    let dlmmPool; // Define scope here

    try {
        dlmmPool = await getDlmmPool(poolData.address);
        if (!dlmmPool) throw new Error("Failed to init DLMM pool");

        // Calculate Bin Range (Strategy: Spot +/- 5% for high concentration)
        const activeBin = await dlmmPool.getActiveBin();
        
        // We need to determine if we are depositing X or Y (SOL)
        const isXSOL = dlmmPool.lbPair.tokenXMint.toBase58() === SOL_MINT;
        const isYSOL = dlmmPool.lbPair.tokenYMint.toBase58() === SOL_MINT;
        
        if (!isXSOL && !isYSOL) {
             console.log(`[Yield] ⚠️ Non-SOL pair skipped: ${poolData.name}`);
             return;
        }

        const totalXAmount = isXSOL ? new BN(YIELD_CONFIG.ALLOCATION_SOL * 1e9) : new BN(0);
        const totalYAmount = isYSOL ? new BN(YIELD_CONFIG.ALLOCATION_SOL * 1e9) : new BN(0);

        // Strategy: Volatility Spread (Active +/- 1 bin) to ensure acceptance
        const activeBinId = activeBin.binId;
        const xYAmountDistribution = [
            { binId: activeBinId - 1, weight: 25 },
            { binId: activeBinId, weight: 50 },
            { binId: activeBinId + 1, weight: 25 }
        ];

        // Create new Keypair for position
        const newPositionKeypair = Keypair.generate();

        const newPosition = await dlmmPool.initializePositionAndAddLiquidityByWeight({
            positionPubKey: newPositionKeypair.publicKey,
            lbPairPubKey: dlmmPool.pubkey,
            user: wallet.publicKey,
            totalXAmount,
            totalYAmount,
            xYAmountDistribution
        });

        console.log(`[Yield] ✍️ Sending TX...`);
        // We must sign with BOTH the wallet (payer) and the new position keypair (account initialization)
        const txHash = await sendAndConfirmTransaction(connection, newPosition.transaction, [wallet, newPositionKeypair]);
        console.log(`[Yield] ✅ Position Opened! TX: ${txHash}`);

        activePositions.push({
            address: poolData.address,
            name: poolData.name,
            entryTime: Date.now(),
            entryUtil: poolData.metrics.utilization,
            allocation: YIELD_CONFIG.ALLOCATION_SOL,
            txHash,
            status: "active"
        });
        savePositions();

    } catch (err) {
        console.error(`[Yield] ❌ Entry Failed for ${poolData.name}:`, err.message);
        
        // FALLBACK: If LP fails, just APE the token (Swap)
        // This ensures we don't miss the opportunity, even if we can't farm it.
        if (err.message.includes("No liquidity") || err.message.includes("simulation")) {
            console.log(`[Yield] 🔄 LP Failed. Fallback -> SWAPPING for exposure.`);
            
            // Determine which token to buy (The one that isn't SOL)
            let targetMint = null;
            if (dlmmPool) {
                const tokenX = dlmmPool.lbPair.tokenXMint.toBase58();
                const tokenY = dlmmPool.lbPair.tokenYMint.toBase58();
                
                if (tokenX === SOL_MINT) targetMint = tokenY;
                else if (tokenY === SOL_MINT) targetMint = tokenX;
            } else {
                targetMint = poolData.mint_x === SOL_MINT ? poolData.mint_y : poolData.mint_x;
            }
            
            // Check if target is a stablecoin (Don't swap SOL for USDC in "Ape Mode")
            const isStable = ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"].includes(targetMint);
            
            if (targetMint && !isStable) {
                console.log(`[Yield] 🦍 Ape Mode: Buying ${poolData.name} directly...`);
                const tx = await executeSwap(targetMint, YIELD_CONFIG.ALLOCATION_SOL);
                
                if (tx) {
                    console.log(`[Yield] ✅ Ape Mode Success. Tracking position.`);
                    activePositions.push({
                        address: targetMint, // Track the TOKEN mint, not the pool address
                        name: poolData.name,
                        entryTime: Date.now(),
                        entryUtil: poolData.metrics.utilization,
                        allocation: YIELD_CONFIG.ALLOCATION_SOL,
                        amount: YIELD_CONFIG.ALLOCATION_SOL, // Tracking cost basis in SOL for now
                        txHash: tx,
                        status: "active_holding"
                    });
                    savePositions();
                }
            } else {
                console.log(`[Yield] ⏭️ Skipped Swap Fallback (Target is Stable or Unknown).`);
            }
        }
    }
}

async function monitorPositions() {
    for (let i = activePositions.length - 1; i >= 0; i--) {
        const pos = activePositions[i];
        
        // Time Check
        const ageHours = (Date.now() - pos.entryTime) / (1000 * 60 * 60);
        let shouldExit = false;
        let exitReason = "";
        let exitMode = "full"; // full | partial (90%)

        if (ageHours > YIELD_CONFIG.MAX_HOLD_HOURS) { 
            shouldExit = true;
            exitReason = `Time Limit > ${YIELD_CONFIG.MAX_HOLD_HOURS}h`;
        }

        // PnL Check (Only for active positions)
        if (!shouldExit && pos.status === "active") {
            try {
                const dlmmPool = await getDlmmPool(pos.address);
                if (!dlmmPool) continue;

                const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey, dlmmPool.pubkey);
                
                if (userPositions.length > 0) {
                    const activeBin = await dlmmPool.getActiveBin();
                    const price = Number(activeBin.price); // Price of X in Y

                    let totalValueSol = 0;
                    const isXSOL = dlmmPool.lbPair.tokenXMint.toBase58() === SOL_MINT;
                    const isYSOL = dlmmPool.lbPair.tokenYMint.toBase58() === SOL_MINT;

                    // Calculate total value of all positions in this pool
                    userPositions.forEach(p => {
                         const x = Number(p.positionData.totalXAmount) / 1e9; // Approx
                         const y = Number(p.positionData.totalYAmount) / 1e9; // Approx
                         
                         if (isXSOL) totalValueSol += x + (y / price);
                         else if (isYSOL) totalValueSol += (x * price) + y;
                    });

                    const pnlPct = ((totalValueSol - pos.allocation) / pos.allocation) * 100;
                    pos.pnl = pnlPct; // Store for rotation logic

                    // --- TRAILING STOP LOGIC ---
                    if (pos.highestPnl === undefined) pos.highestPnl = pnlPct;
                    if (pnlPct > pos.highestPnl) pos.highestPnl = pnlPct;

                    let dynamicStop = YIELD_CONFIG.STOP_LOSS_PCT;
                    
                    if (pos.highestPnl >= YIELD_CONFIG.TRAILING_ACTIVATION_PCT) {
                        const trailingFloor = pos.highestPnl - YIELD_CONFIG.TRAILING_DISTANCE_PCT;
                        dynamicStop = Math.max(dynamicStop, trailingFloor);
                        if (pos.highestPnl > 15 && dynamicStop < 1) dynamicStop = 1;
                    }

                    console.log(`[Yield] 📊 ${pos.name}: ${pnlPct.toFixed(2)}% PnL (High: ${pos.highestPnl?.toFixed(2)}% | Stop: ${dynamicStop.toFixed(2)}%)`);

                    if (pnlPct >= YIELD_CONFIG.TAKE_PROFIT_PCT) {
                        shouldExit = true;
                        exitReason = `Take Profit (+${pnlPct.toFixed(2)}%)`;
                    } else if (pnlPct <= dynamicStop) {
                        shouldExit = true;
                        exitReason = `Stop Loss / Trailing Hit (${pnlPct.toFixed(2)}%)`;
                        if (pnlPct <= YIELD_CONFIG.STOP_LOSS_PCT && !pos.isDustBag) {
                            // If hit HARD stop loss (not trailing profit stop), trigger 90% sell
                            exitMode = "partial_90";
                        }
                    }
                    
                    // --- DUST BAG CLEANUP ---
                    if (pos.isDustBag && YIELD_CONFIG.DUST_CLEANUP_ENABLED) {
                        // Check if we have another position performing better
                        const otherPos = activePositions.find(p => p.address !== pos.address && !p.isDustBag);
                        if (otherPos && (otherPos.pnl || 0) > pnlPct) {
                            console.log(`[Yield] 🧹 Dust Cleanup: ${otherPos.name} is performing better (${otherPos.pnl}% > ${pnlPct}%). Dumping dust.`);
                            shouldExit = true;
                            exitReason = "Dust Cleanup (Better Opportunity Found)";
                            exitMode = "full";
                        }
                    }
                }
            } catch (err) {
                console.warn(`[Yield] ⚠️ PnL Check Error for ${pos.name}: ${err.message}`);
            }
        }
        
        if (shouldExit) {
            console.log(`[Yield] 📉 EXITING ${pos.name} (${exitReason}) [Mode: ${exitMode}]`);
            
            if (pos.status === "active") {
                if (exitMode === "partial_90") {
                    const success = await exitPosition(pos, 9000); // 90% BPS
                    if (success) {
                        pos.isDustBag = true; // Mark as dust bag
                        savePositions();
                    }
                } else {
                    const success = await exitPosition(pos, 10000); // 100%
                    if (success) {
                        activePositions.splice(i, 1);
                        savePositions();
                    }
                }
            } else if (pos.status === "active_holding") {
                // For raw holdings, we can't easily do partial BPS on LP, but we can sell 90% of balance
                const success = await sellHolding(pos, exitMode === "partial_90" ? 0.9 : 1.0);
                if (success) {
                    if (exitMode === "partial_90") {
                        pos.isDustBag = true;
                        savePositions();
                    } else {
                        activePositions.splice(i, 1);
                        savePositions();
                    }
                }
            } else {
                activePositions.splice(i, 1); // Remove simulated
                savePositions();
            }
        }
    }
}

async function sellHolding(pos, percentage = 1.0) {
    console.log(`[Yield] 💸 Attempting to sell holding: ${pos.name} (${percentage * 100}%)`);
    try {
        const mint = new PublicKey(pos.address);
        const mintInfo = await getMint(connection, mint);
        const decimals = mintInfo.decimals;

        // Fetch ACTUAL token balance from wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: mint });
        
        if (tokenAccounts.value.length === 0) {
             console.log(`[Yield] ⚠️ No token account found for ${pos.name}. Removing from tracker.`);
             // Cleanup if we have no tokens
             return true; 
        }

        const tokenAmountObj = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
        const totalTokens = tokenAmountObj.uiAmount;
        
        if (totalTokens === 0) {
             console.log(`[Yield] ⚠️ Token balance is 0 for ${pos.name}. Removing from tracker.`);
             return true;
        }

        const amountToSell = totalTokens * percentage;
        
        console.log(`[Yield] 🔄 Selling ${amountToSell} ${pos.name} (Balance: ${totalTokens})`);

        // Execute Swap: Token -> SOL
        const tx = await executeSwap(SOL_MINT, amountToSell, pos.address, decimals);
        
        if (tx) {
            console.log(`[Yield] ✅ Sold ${pos.name}. TX: ${tx}`);
            // If we sold everything (approx), update amount to 0 or remove
            if (percentage >= 0.99) {
                pos.amount = 0;
            } else {
                 pos.amount = 0; // We lost track of cost basis, just reset to avoid confusion or re-fetch? 
                 // Actually, pos.amount was tracking SOL cost. We should probably update it proportionally if we wanted to keep tracking, 
                 // but 'active_holding' is a fallback state anyway.
            }
            return true;
        } else {
            console.error(`[Yield] ❌ Swap TX failed (returned null).`);
            return false;
        }
    } catch (err) {
        console.error(`[Yield] ❌ Sell Failed Exception:`, err);
        return false;
    }
}

async function exitPosition(pos, bps = 10000) {
    try {
        const dlmmPool = await getDlmmPool(pos.address);
        if (!dlmmPool) throw new Error("Pool cache missing");
        
        const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet.publicKey, dlmmPool.pubkey);
        
        if (userPositions.length === 0) {
            console.log(`[Yield] ⚠️ No on-chain positions found for ${pos.name}. Removing from local tracker.`);
            // Cleanup cache since position is gone
            poolCache.delete(pos.address);
            return true;
        }

        console.log(`[Yield] Closing position(s) for ${pos.name} (BPS: ${bps})...`);

        for (const position of userPositions) {
            const binIds = position.positionData.positionBinData.map(bin => bin.binId);
            const shouldClose = bps === 10000;
            
            const removeLiquidityTx = await dlmmPool.removeLiquidity({
                position: position.publicKey,
                user: wallet.publicKey,
                binIds,
                bps: new BN(bps),
                shouldClaimAndClose: shouldClose
            });

            const txs = Array.isArray(removeLiquidityTx) ? removeLiquidityTx : [removeLiquidityTx];
            
            for (const tx of txs) {
                 const txHash = await sendAndConfirmTransaction(connection, tx, [wallet]);
                 console.log(`[Yield] 💰 Liquidity Removed. TX: ${txHash}`);
                 
                 await logger.logAction({
                     type: "YIELD_EXIT",
                     symbol: pos.name,
                     tx: txHash,
                     timestamp: new Date().toISOString()
                 });
            }
        }
        
        // If fully closed, clear cache
        if (bps === 10000) {
            poolCache.delete(pos.address);
        }
        
        return true;

    } catch (err) {
        console.error(`[Yield] ❌ Exit Failed for ${pos.name}:`, err.message);
        return false;
    }
}

module.exports = { runYieldCycle, enterPosition, exitPosition };
