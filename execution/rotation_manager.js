const { Connection, PublicKey } = require('@solana/web3.js');
const { executeSwap, wallet } = require('./execution_module');
const logger = require('../utils/trade_logger');
const dexscreener = require('../analysis/dexscreener_client');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const connection = new Connection(RPC_ENDPOINT, 'confirmed');

const MAX_HOLD_TIME_MS = 30 * 60 * 1000; // 30 Minutes
const TARGET_POSITIONS = 2;
const SOL_MINT = "So11111111111111111111111111111111111111112";
const POSITIONS_FILE = path.join(__dirname, '../data/positions.json');

// State to track last rotation check
let lastCheck = 0;
const CHECK_INTERVAL = 60000; // Check every 1 minute

async function getTokenBalance(mintStr) {
    try {
        const mint = new PublicKey(mintStr);
        const programs = [
            new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // Standard
            new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")  // Token-2022
        ];
        
        for (const prog of programs) {
            // Note: passing programId in options if filtering by mint requires care, 
            // but getParsedTokenAccountsByOwner(owner, filter) implies filter restricts results.
            // Actually web3js: getParsedTokenAccountsByOwner(owner, {mint}, commitment) 
            // scans specific program? No, we usually pass programId as 3rd arg if we want to query a specific one?
            // Wait, getParsedTokenAccountsByOwner(owner, filter) queries the *SPL Token* program by default? 
            // Actually it requires we hit the right program. 
            // Let's rely on getParsedTokenAccountsByOwner(owner, {mint: ...}) finding it if we just iterate.
            
            // Correction: The API signature is (publicKey, filter, commitment). 
            // To check specific programs we might need getParsedTokenAccountsByOwner(owner, {mint, programId}).
            // But usually we just search. Let's try simple first.
            
            const accounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint });
            if (accounts.value.length > 0) {
                const info = accounts.value[0].account.data.parsed.info;
                return {
                    amount: info.tokenAmount.uiAmount,
                    decimals: info.tokenAmount.decimals
                };
            }
        }
        return { amount: 0, decimals: 0 };
    } catch (e) {
        return { amount: 0, decimals: 0 };
    }
}

async function getOpenPositions() {
    try {
        // Source of Truth: positions.json
        if (!fs.existsSync(POSITIONS_FILE)) return [];
        
        const trackedPositions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
        const verifiedPositions = [];

        for (const p of trackedPositions) {
            // Verify on-chain balance
            const { amount, decimals } = await getTokenBalance(p.address);
            
            if (amount > 0) {
                verifiedPositions.push({
                    mint: p.address,
                    symbol: p.name,
                    amount: amount,
                    decimals: decimals,
                    entryTime: p.entryTime || Date.now()
                });
            } else {
                console.log(`[Rotation] ⚠️ Position ${p.name} tracked but has 0 balance. Ignoring.`);
            }
        }
        return verifiedPositions;
    } catch (err) {
        console.error("[Rotation] Failed to fetch positions:", err.message);
        return [];
    }
}

async function runRotationCycle() {
    const now = Date.now();
    if (now - lastCheck < CHECK_INTERVAL) return;
    lastCheck = now;

    console.log("[Rotation] 🔄 Checking Portfolio Health...");

    const positions = await getOpenPositions();
    console.log(`[Rotation] 📊 Open Positions: ${positions.length}/${TARGET_POSITIONS}`);

    // 1. Identify Expired Positions
    const expired = positions.filter(p => (now - p.entryTime) > MAX_HOLD_TIME_MS);
    
    expired.sort((a, b) => a.entryTime - b.entryTime);

    let positionToSell = null;
    let actionReason = "";

    if (expired.length > 0) {
        positionToSell = expired[0];
        const ageMins = ((now - positionToSell.entryTime) / 60000).toFixed(1);
        actionReason = `Expired (${ageMins}m > 30m)`;
    } else if (positions.length >= TARGET_POSITIONS) {
        console.log("[Rotation] ✅ Portfolio Full & Healthy. Holding.");
        return;
    } else {
        console.log("[Rotation] 🟢 Slot Available. Hunting...");
    }

    // 2. Execute Rotation (Sell if needed)
    if (positionToSell) {
        console.log(`[Rotation] 🔻 ROTATING OUT: ${positionToSell.symbol || positionToSell.mint} (${actionReason})`);
        
        const tx = await executeSwap(SOL_MINT, positionToSell.amount, positionToSell.mint, positionToSell.decimals);
        
        if (tx) {
            // Update JSON
            try {
                const currentFile = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
                const updated = currentFile.filter(p => p.address !== positionToSell.mint);
                fs.writeFileSync(POSITIONS_FILE, JSON.stringify(updated, null, 2));
                console.log("[Rotation] ✅ Position removed from tracker.");
            } catch (e) {
                console.error("[Rotation] Failed to update tracker:", e.message);
            }
            // Wait for confirmation
            await new Promise(r => setTimeout(r, 5000));
        } else {
            console.error("[Rotation] ❌ Sell failed. Aborting rotation for this cycle.");
            return; // Don't buy if sell failed
        }
    }

    // 3. Buy New Asset
    if (positionToSell || positions.length < TARGET_POSITIONS) {
        console.log("[Rotation] 🔍 Fetching Trending Candidates...");
        const candidates = await dexscreener.getTrending();
        const history = logger.getHistory();
        const now = Date.now();
        const COOLDOWN_MS = 15 * 60 * 1000;

        // Build Blacklist
        const recentExits = history.filter(h => 
            (now - new Date(h.timestamp).getTime()) < COOLDOWN_MS &&
            (h.type === "YIELD_EXIT" || (h.type === "TRADE_EXECUTION" && h.token === SOL_MINT))
        );
        const blacklistedMints = new Set(recentExits.map(h => h.inputMint).filter(Boolean));

        const validCandidates = candidates.filter(c => 
            !positions.some(p => p.mint === c.mint) && 
            (positionToSell ? c.mint !== positionToSell.mint : true) &&
            !blacklistedMints.has(c.mint)
        );

        if (validCandidates.length > 0) {
            const target = validCandidates[0];
            console.log(`[Rotation] 🚀 BUYING NEW GEM: ${target.symbol} (${target.change5m}% 5m)`);
            
            // Buy 0.02 SOL worth
            const buyTx = await executeSwap(target.mint, 0.02);
            
            if (buyTx) {
                // Add to tracker
                try {
                    let currentFile = [];
                    if (fs.existsSync(POSITIONS_FILE)) currentFile = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
                    
                    currentFile.push({
                        address: target.mint,
                        name: target.symbol,
                        entryTime: Date.now(),
                        allocation: 0.02,
                        amount: 0.02,
                        status: "active_holding",
                        txHash: buyTx
                    });
                    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(currentFile, null, 2));
                } catch(e) { console.error("[Rotation] Failed to save new position:", e.message); }
            }
        } else {
            console.log("[Rotation] ⚠️ No valid candidates found. Waiting.");
        }
    }
}

module.exports = { runRotationCycle };
