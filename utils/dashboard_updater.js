const fs = require('fs');
const path = require('path');
const { Connection, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const nano = require('../utils/nano_agent');
const solanatracker = require('../analysis/solanatracker_client');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const STATUS_FILE = path.join(__dirname, '../data/status.json');
const DASHBOARD_DATA_FILE = path.join(__dirname, '../docs/data.json');
const HISTORY_FILE = path.join(__dirname, '../data/history.json');
const PNL_HISTORY_FILE = path.join(__dirname, '../data/pnl_history.json');

// Singleton Connection (Prevent socket leak)
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_ENDPOINT, 'confirmed');

// Wallet Paths
const YIELD_WALLET_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');

async function getWalletBalances(conn) {
    let wallets = {
        yield: { address: 'N/A', balance: 0, pnl: null },
        sniper: { address: 'N/A', balance: 0, pnl: null }
    };
    let totalBal = 0;

    try {
        // 1. Yield Wallet
        if (fs.existsSync(YIELD_WALLET_PATH)) {
            try {
                const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(YIELD_WALLET_PATH, 'utf-8')));
                const kp = Keypair.fromSecretKey(secretKey);
                const pubKey = kp.publicKey.toBase58();
                const bal = await conn.getBalance(kp.publicKey);
                const solBal = bal / 1e9;
                
                // Fetch PnL from SolanaTracker
                const pnlData = await solanatracker.getWalletPnL(pubKey);
                
                wallets.yield = {
                    address: pubKey.slice(0, 6) + '...' + pubKey.slice(-4),
                    balance: solBal.toFixed(4),
                    pnl: pnlData ? {
                        realized: pnlData.summary?.realized || 0,
                        unrealized: pnlData.summary?.unrealized || 0,
                        total: pnlData.summary?.total || 0,
                        winRate: pnlData.summary?.winRate || 0
                    } : null
                };
                totalBal += solBal;
            } catch (err) {
                console.error("[Dashboard] Yield wallet parse error:", err.message);
            }
        }

        // 2. Sniper Wallet
        if (process.env.KEYPAIR_SNIPER) {
            try {
                let secretKey;
                if (process.env.KEYPAIR_SNIPER.startsWith('[')) {
                    secretKey = Uint8Array.from(JSON.parse(process.env.KEYPAIR_SNIPER));
                } else {
                    secretKey = bs58.decode(process.env.KEYPAIR_SNIPER);
                }
                const kp = Keypair.fromSecretKey(secretKey);
                const pubKey = kp.publicKey.toBase58();
                const bal = await conn.getBalance(kp.publicKey);
                const solBal = bal / 1e9;
                
                const pnlData = await solanatracker.getWalletPnL(pubKey);

                wallets.sniper = {
                    address: pubKey.slice(0, 6) + '...' + pubKey.slice(-4),
                    balance: solBal.toFixed(4),
                    pnl: pnlData ? {
                        realized: pnlData.summary?.realized || 0,
                        unrealized: pnlData.summary?.unrealized || 0,
                        total: pnlData.summary?.total || 0,
                        winRate: pnlData.summary?.winRate || 0
                    } : null
                };
                totalBal += solBal;
            } catch (e) {
                console.error("[Dashboard] Failed to load Sniper Wallet:", e.message);
            }
        }
    } catch (e) {
        console.error("[Dashboard] Wallet fetch error:", e.message);
    }
    return { wallets, totalBal };
}

function updatePnLHistory(totalBal) {
    let pnlData = [];
    if (fs.existsSync(PNL_HISTORY_FILE)) {
        try {
            pnlData = JSON.parse(fs.readFileSync(PNL_HISTORY_FILE, 'utf8'));
        } catch (e) { console.error("PnL History read error, resetting."); }
    }

    const now = Date.now();
    // Append current state
    pnlData.push({ timestamp: now, balance: totalBal });

    // Prune data older than 7 days to keep file sane
    const cutoff = now - (7 * 24 * 60 * 60 * 1000);
    pnlData = pnlData.filter(d => d.timestamp > cutoff);

    // Write back
    fs.writeFileSync(PNL_HISTORY_FILE, JSON.stringify(pnlData, null, 2));
    
    return pnlData;
}

function generateChartData(pnlData) {
    // Filter for last 24h for the dashboard chart
    const now = Date.now();
    const dayCutoff = now - (24 * 60 * 60 * 1000);
    const recentData = pnlData.filter(d => d.timestamp > dayCutoff);

    // Simple downsample: take every Nth element if > 50 points
    let chartPoints = recentData;
    if (recentData.length > 50) {
        const step = Math.ceil(recentData.length / 50);
        chartPoints = recentData.filter((_, i) => i % step === 0);
    }

    return {
        labels: chartPoints.map(d => new Date(d.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })),
        data: chartPoints.map(d => d.balance)
    };
}

async function updateDashboard() {
    console.log("[Dashboard] 🔄 Starting update cycle...");
    // Use singleton connection

    // 1. Read Current State
    let status = {};
    if (fs.existsSync(STATUS_FILE)) {
        try {
            status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        } catch (e) { console.error("Status file read error"); }
    }

    // 2. Fetch Real Balances & Update PnL
    const { wallets, totalBal } = await getWalletBalances(connection);
    const pnlHistory = updatePnLHistory(totalBal);
    const chartData = generateChartData(pnlHistory);

    // 3. Get Recent Logs
    let recentLogs = [];
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            const allHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
            recentLogs = allHistory.slice(-10).map(h => ({
                timestamp: h.timestamp,
                message: `${h.type}: ${h.token || h.decision || 'Action'} (${h.status || 'Done'})`
            }));
        } catch (e) { console.error("History read error"); }
    }

    // 4. Generate Narrative
    let narrative = "Systems nominal. Analyzing market data.";
    try {
        const recentEvents = recentLogs.slice(0, 5).map(l => l.message).join('. ');
        
        const prompt = `You are Agent Cyber, an autonomous trading bot on Solana. 
        Current Status:
        - Balance: ${totalBal.toFixed(4)} SOL
        - Recent Events: ${recentEvents}
        
        Write a 1-sentence analytical status update for your dashboard. 
        Be concise, slightly robotic/cyberpunk, and mention the next logical move.`;
        
        const response = await nano.generate(prompt, "Generate status.");
        if (response) narrative = response;
    } catch (e) {
        console.warn("[Dashboard] AI Narrative skipped:", e.message);
    }

    // 5. Strategy Analysis
    const strategyData = {
        name: "Momentum_V2: Sentinel",
        winRate: (wallets.yield.pnl?.winRate || wallets.sniper.pnl?.winRate || 0) + '%',
        realizedPnL: (wallets.yield.pnl?.realized || 0) + (wallets.sniper.pnl?.realized || 0),
        unrealizedPnL: (wallets.yield.pnl?.unrealized || 0) + (wallets.sniper.pnl?.unrealized || 0),
        totalPnL: (wallets.yield.pnl?.total || 0) + (wallets.sniper.pnl?.total || 0),
        activePositions: wallets.yield.pnl ? "Active" : "Scanning"
    };

    const dashboardData = {
        lastUpdate: Date.now(),
        heartbeat: status.health || "UNKNOWN",
        uptime: process.uptime(),
        wallets: wallets,
        totalBalance: totalBal.toFixed(4),
        mode: "DUAL_CORE",
        logs: recentLogs,
        thought: narrative,
        chartData: chartData,
        strategy: strategyData,
        positions: (() => {
            try {
                const posFile = path.join(__dirname, '../data/positions.json');
                if (fs.existsSync(posFile)) {
                    const raw = JSON.parse(fs.readFileSync(posFile, 'utf8'));
                    if (Array.isArray(raw)) {
                        return raw.map(p => ({
                            symbol: p.name || p.symbol || 'Unknown',
                            address: p.address || p.mint || '???',
                            pnl: p.pnl || 0,
                            age: p.entryTime ? ((Date.now() - p.entryTime) / (1000 * 60 * 60)).toFixed(1) + 'h' : '0h'
                        }));
                    }
                }
                return [];
            } catch { return []; }
        })()
    };
    
    // 5. Write Dashboard Data
    fs.writeFileSync(DASHBOARD_DATA_FILE, JSON.stringify(dashboardData, null, 2));
    console.log("[Dashboard] ✅ Updated successfully.");
}

if (require.main === module) {
    updateDashboard();
}

module.exports = { updateDashboard };
