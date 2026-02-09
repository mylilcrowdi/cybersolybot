const fs = require('fs');
const path = require('path');
const { Connection, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const nano = require('../utils/nano_agent');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const STATUS_FILE = path.join(__dirname, '../data/status.json');
const DASHBOARD_DATA_FILE = path.join(__dirname, '../docs/data.json');
const HISTORY_FILE = path.join(__dirname, '../data/history.json');
const PNL_HISTORY_FILE = path.join(__dirname, '../data/pnl_history.json');

// Wallet Paths
const YIELD_WALLET_PATH = process.env.KEYPAIR_PATH || path.join(process.env.HOME || '/home/cyber', '.config/solana/id.json');

async function getWalletBalances(connection) {
    let wallets = {
        yield: { address: 'N/A', balance: 0 },
        sniper: { address: 'N/A', balance: 0 }
    };
    let totalBal = 0;

    try {
        // 1. Yield Wallet
        if (fs.existsSync(YIELD_WALLET_PATH)) {
            try {
                const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(YIELD_WALLET_PATH, 'utf-8')));
                const kp = Keypair.fromSecretKey(secretKey);
                const bal = await connection.getBalance(kp.publicKey);
                const solBal = bal / 1e9;
                wallets.yield = {
                    address: kp.publicKey.toBase58().slice(0, 6) + '...' + kp.publicKey.toBase58().slice(-4),
                    balance: solBal.toFixed(4)
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
                const bal = await connection.getBalance(kp.publicKey);
                const solBal = bal / 1e9;
                wallets.sniper = {
                    address: kp.publicKey.toBase58().slice(0, 6) + '...' + kp.publicKey.toBase58().slice(-4),
                    balance: solBal.toFixed(4)
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

    // If empty or only 1 point, add a fake starting point if needed? 
    // Or just return what we have. 
    // We'll downsample if too many points (e.g., limit to ~24 points, 1 per hour, or just every update if sparse)
    
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
    const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

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

    // 3. Generate Narrative
    let narrative = "System nominal. Scanning for opportunities.";
    try {
        // Only generate new thought if status changed or rarely? 
        // For now, let's keep it lively.
        const prompt = `You are Agent Cyber. Current Balance: ${totalBal.toFixed(4)} SOL. 
        Wallets: Yield=${wallets.yield.balance}, Sniper=${wallets.sniper.balance}.
        Write a 1-sentence status update for the dashboard. 
        Tone: Cyberpunk, professional, focused on profit.`;
        
        const response = await nano.generate(prompt, "Update status.");
        if (response) narrative = response;
    } catch (e) {
        // console.error("[Dashboard] Nano generation failed:", e.message);
    }

    // 4. Get Recent Logs (Last 48h) & Filter
    let history = [];
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        } catch(e) { console.error("History read error"); }
    }

    const cutoff = Date.now() - (48 * 60 * 60 * 1000);
    const recentLogs = history
        .filter(h => h.timestamp && new Date(h.timestamp).getTime() > cutoff)
        .map(h => {
            let type = "INFO";
            let agent = "SYSTEM";
            let msg = `Event: ${h.type}`;

            if (h.type === "DISCOVERY_SIGNAL") {
                type = "SCAN";
                agent = "SENTINEL";
                msg = `Detected ${h.name || 'Unknown'} ($${h.symbol || '???'}). Score: ${h.score || 0}/100.`;
            } else if (h.type === "DISCOVERY_METEORA") {
                type = "YIELD_SCAN";
                agent = "FARMER";
                msg = `Found ${h.name || 'Pool'} pool. Util: ${h.metrics?.utilization || 'N/A'}x`;
            } else if (h.type === "TRADE_EXECUTION") {
                type = "TRADE";
                agent = "FARMER";
                msg = `SWAP: ${h.inputAmount || 0} SOL -> ${h.token || 'Token'}.`;
            } else if (h.type === "SNIPER_ENTRY") {
                type = "SNIPE";
                agent = "HUNTER";
                msg = `FIRED: ${h.symbol || 'Token'} with ${h.amount || 0} SOL.`;
            } else if (h.type === "ERROR") {
                type = "ERR";
                msg = h.message || "Unknown Error";
            }

            return {
                time: new Date(h.timestamp).toLocaleTimeString('en-GB'),
                agent: agent,
                type: type,
                message: msg
            };
        })
        .reverse()
        .slice(0, 100);

    // 5. Update Dashboard Data JSON
    const dashboardData = {
        lastUpdate: Date.now(),
        heartbeat: status.health || "UNKNOWN",
        uptime: process.uptime(),
        wallets: wallets,
        totalBalance: totalBal.toFixed(4),
        mode: "DUAL_CORE",
        logs: recentLogs,
        thought: narrative,
        chartData: chartData, // NEW
        positions: [] 
    };

    fs.writeFileSync(DASHBOARD_DATA_FILE, JSON.stringify(dashboardData, null, 2));
    console.log(`[Dashboard] ✅ Updated. PnL: ${totalBal.toFixed(4)} SOL. Logs: ${recentLogs.length}`);
}

// Run immediately if called directly
if (require.main === module) {
    updateDashboard();
}

module.exports = { updateDashboard };
