const fetch = require('node-fetch');
const logger = require('../utils/trade_logger');
require('dotenv').config();

const METEORA_API_BASE = "https://dlmm-api.meteora.ag";

/**
 * Scans Meteora DLMM for High Volume / Low TVL opportunities.
 * Strategy: Find pairs where 24h Volume > TVL (High turnover = High fees).
 */
async function scanMeteora() {
    try {
        console.log(`[Meteora] ☄️  Scanning DLMM Pools...`);
        
        // Fetch pairs (paginated)
        // Removed server-side sort to avoid 400s. We sort locally.
        const response = await fetch(`${METEORA_API_BASE}/pair/all_with_pagination?limit=100&page=0`);
        
        if (!response.ok) {
            console.error(`[Meteora] API Error: ${response.status}`);
            const text = await response.text();
            console.error(`[Meteora] Response: ${text}`);
            return;
        }

        const data = await response.json();
        
        // Manual Sort: Descending by 24h Volume
        data.pairs.sort((a, b) => b.trade_volume_24h - a.trade_volume_24h);
        
        // Filter Logic:
        // 1. Not blacklisted
        // 2. Volume 24h > $100k (ensure liquidity)
        // 3. Trade Volume > TVL (High Utilization)
        
        const opportunities = data.pairs.filter(p => {
            if (p.is_blacklisted) return false;
            if (p.trade_volume_24h < 100000) return false; // Ignore dead pools
            
            // Calculate Utilization (Volume / Liquidity)
            // Note: 'liquidity' in API is a string, parse it.
            const tvl = parseFloat(p.liquidity);
            const volume = p.trade_volume_24h;
            
            if (!tvl || tvl === 0) return false;
            
            const utilization = volume / tvl;
            
            // We want pools where Volume is at least 50% of TVL (Active trading)
            // But not "infinite" utilization which implies low liquidity danger.
            return utilization > 0.5;
        });

        console.log(`[Meteora] Found ${opportunities.length} active pools.`);

        // Top 3 Picks
        const topPicks = opportunities.slice(0, 10); // Return more for decision engine
        const pickObjects = [];
        
        for (const pool of topPicks) {
            const utilization = (pool.trade_volume_24h / parseFloat(pool.liquidity)).toFixed(2);
            console.log(`[Meteora] 🔥 Opportunity: ${pool.name}`);
            console.log(`   - Address: ${pool.address}`);
            console.log(`   - 24h Vol: $${pool.trade_volume_24h.toLocaleString()}`);
            console.log(`   - TVL: $${parseFloat(pool.liquidity).toLocaleString()}`);
            console.log(`   - Utilization: ${utilization}x`);
            
            // Log as a discovery
            await logger.logAction({
                type: "DISCOVERY_METEORA",
                token: pool.mint_x, // Usually the quote or base
                source: "Meteora_DLMM",
                name: pool.name,
                symbol: pool.name.split('-')[0], // Rough symbol extraction
                status: "candidate",
                metrics: {
                    volume: pool.trade_volume_24h,
                    tvl: pool.liquidity,
                    utilization: utilization
                }
            });
            
            pickObjects.push({
                address: pool.address,
                name: pool.name,
                mint_x: pool.mint_x,
                mint_y: pool.mint_y,
                metrics: {
                    volume: pool.trade_volume_24h,
                    tvl: parseFloat(pool.liquidity),
                    utilization: parseFloat(utilization)
                }
            });
        }
        return pickObjects;

    } catch (err) {
        console.error(`[Meteora] Scan Failed:`, err.message);
    }
}

// Standalone runner
if (require.main === module) {
    scanMeteora();
}

module.exports = { scanMeteora };
