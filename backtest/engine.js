/**
 * backtest/engine.js
 * Core engine for running historical simulations using SolanaTracker data.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DATA_DIR = path.join(__dirname, 'data');
const RESULTS_DIR = path.join(__dirname, 'results');

class BacktestEngine {
    constructor(strategy, config = {}) {
        this.strategy = strategy;
        this.config = {
            initialCapital: 1.0, // SOL
            feeBps: 10,          // 0.1% per trade (Jupiter/Meteora avg)
            slippageBps: 50,     // 0.5% simulated slippage
            ...config
        };
        this.state = {
            balance: this.config.initialCapital,
            positions: [],
            trades: [],
            equityCurve: []
        };
        this.dataCache = {};
    }

    /**
     * Fetch historical OHLCV data from SolanaTracker
     * Note: Requires API Key if hitting paid endpoints, or scraping public.
     * We will implement a mock/cache layer to save data for replay.
     */
    async loadData(tokenMint, timeframe = '1m', days = 1) {
        const cacheFile = path.join(DATA_DIR, `${tokenMint}_${timeframe}_${days}d.json`);
        
        if (fs.existsSync(cacheFile)) {
            console.log(`[Backtest] 📂 Loading cached data for ${tokenMint}`);
            this.dataCache[tokenMint] = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            return;
        }

        console.log(`[Backtest] 🌍 Fetching data for ${tokenMint} from SolanaTracker...`);
        try {
            // SolanaTracker Chart API Endpoint (Reverse engineered or documented)
            // Assuming standard TV-style feed or similar. 
            // Fallback: DexScreener if ST is not available without key.
            // Using generic placeholder structure for now.
            
            // TODO: Replace with actual SolanaTracker Chart API call
            // GET https://data.solanatracker.io/chart/{mint}?type={timeframe} ...
            // For now, we stub this or ask user for docs.
            
            const response = await axios.get(`https://api.solanatracker.io/v1/chart/${tokenMint}`, {
                params: { type: timeframe, time_from: Math.floor(Date.now()/1000) - (days*86400), time_to: Math.floor(Date.now()/1000) },
                headers: { 'x-api-key': process.env.SOLANATRACKER_API_KEY }
            });

            const candles = response.data.ohlc; // Assuming { ohlc: [{t,o,h,l,c,v}, ...] }
            
            fs.writeFileSync(cacheFile, JSON.stringify(candles));
            this.dataCache[tokenMint] = candles;

        } catch (err) {
            console.error(`[Backtest] ❌ Data fetch failed: ${err.message}`);
            // Generate synthetic data for testing the engine if fetch fails
            this.dataCache[tokenMint] = this.generateSyntheticData(days * 1440); // 1m candles
        }
    }

    generateSyntheticData(points) {
        let price = 100;
        const data = [];
        for (let i = 0; i < points; i++) {
            const move = (Math.random() - 0.5) * 2;
            price = price + move;
            data.push({
                time: Date.now() - (points - i) * 60000,
                open: price,
                high: price + Math.random(),
                low: price - Math.random(),
                close: price + (Math.random() - 0.5),
                volume: Math.random() * 10000
            });
        }
        return data;
    }

    /**
     * Run the simulation
     */
    run(tokenMint) {
        console.log(`[Backtest] 🚀 Running Strategy: ${this.strategy.name} on ${tokenMint}`);
        const candles = this.dataCache[tokenMint];
        if (!candles || candles.length === 0) {
            console.error("[Backtest] No data loaded.");
            return;
        }

        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];
            const context = {
                candle,
                index: i,
                history: candles.slice(0, i),
                balance: this.state.balance,
                positions: this.state.positions
            };

            // 1. Strategy Signal
            const signal = this.strategy.onCandle(context);

            // 2. Execution Simulator
            if (signal) {
                this.executeSignal(signal, candle);
            }

            // 3. PnL Updates
            this.updateEquity(candle);
        }

        this.generateReport(tokenMint);
    }

    executeSignal(signal, candle) {
        const price = candle.close; // Simplified execution at close
        
        if (signal.type === 'BUY') {
            const amountSol = signal.amount || this.state.balance; // All in or specified
            if (amountSol > this.state.balance) return; // Insufficient funds

            const fee = amountSol * (this.config.feeBps / 10000);
            const netSol = amountSol - fee;
            const tokens = netSol / price;

            this.state.balance -= amountSol;
            this.state.positions.push({
                mint: signal.mint,
                entryPrice: price,
                amount: tokens,
                timestamp: candle.time
            });
            this.state.trades.push({ type: 'BUY', price, amount: amountSol, fee, time: candle.time });
        } 
        else if (signal.type === 'SELL') {
            const posIndex = this.state.positions.findIndex(p => p.mint === signal.mint);
            if (posIndex === -1) return; // No position

            const pos = this.state.positions[posIndex];
            const grossSol = pos.amount * price;
            const fee = grossSol * (this.config.feeBps / 10000);
            const netSol = grossSol - fee;

            this.state.balance += netSol;
            this.state.positions.splice(posIndex, 1);
            
            const pnl = netSol - (pos.amount * pos.entryPrice);
            this.state.trades.push({ type: 'SELL', price, amount: netSol, fee, pnl, time: candle.time });
        }
    }

    updateEquity(candle) {
        let equity = this.state.balance;
        for (const pos of this.state.positions) {
            equity += pos.amount * candle.close;
        }
        this.state.equityCurve.push({ time: candle.time, equity });
    }

    generateReport(tokenMint) {
        const finalEquity = this.state.equityCurve[this.state.equityCurve.length - 1].equity;
        const returnPct = ((finalEquity - this.config.initialCapital) / this.config.initialCapital) * 100;
        
        const report = {
            strategy: this.strategy.name,
            asset: tokenMint,
            initialCapital: this.config.initialCapital,
            finalEquity: finalEquity.toFixed(4),
            return: `${returnPct.toFixed(2)}%`,
            trades: this.state.trades.length,
            winRate: this.calculateWinRate()
        };

        console.table(report);
        fs.writeFileSync(path.join(RESULTS_DIR, `report_${Date.now()}.json`), JSON.stringify(this.state, null, 2));
    }

    calculateWinRate() {
        const closedTrades = this.state.trades.filter(t => t.type === 'SELL');
        if (closedTrades.length === 0) return '0%';
        const wins = closedTrades.filter(t => t.pnl > 0).length;
        return `${((wins / closedTrades.length) * 100).toFixed(1)}%`;
    }
}

module.exports = BacktestEngine;
