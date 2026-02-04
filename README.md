# Cybersolybot ⚡

**Autonomous AI Trading Agent for the Solana AI Hackathon 2026.**

## 🎯 Mission
Win the Solana AI Hackathon by proving an autonomous agent can profitably manage and grow a portfolio starting from **0.2 SOL**.

## 🧠 Strategy: "Calculated Degen"
We employ a dynamic, risk-averse strategy that adapts to market conditions.

### 1. Discovery & Analysis
- **Sources:** Monitor Pump.fun, Dexscreener, and social signals (X/Twitter).
- **Tools:**
  - `puppeteer`: For web scraping and sentiment analysis (RAG).
  - `@solana/web3.js`: For on-chain data verification.
- **Filter:** High conviction, safety checks (rug-pull detection), and volume analysis.

### 2. Execution (Sniper/Trade)
- **Entry:** Rapid execution on confirmed signals.
- **Exit:** Pre-defined take-profit and stop-loss levels. Volatility is utilized, not gambled on.

### 3. Growth & Stability (Liquidity Provision)
- **Meteora LP:**
  - Utilize **Meteora DLMM** (Dynamic Liquidity Market Maker) or standard pools to provide liquidity for high-conviction assets.
  - **Goal:** Earn yield on idle assets and capture trading fees, compounding gains while reducing directional risk.
  - **Logic:** "Farm the volatility" rather than just betting on price direction.

## 🛠 Tech Stack
- **Runtime:** Node.js
- **Chain:** Solana (Mainnet-Beta)
- **Browser:** Chromium + Puppeteer
- **Dependencies:** `@solana/web3.js`, `bs58`, `puppeteer`, `axios`, `dotenv`

## 🔒 Security
- Private keys never logged.
- Risk limits strictly enforced.
- Simulation before execution.

---
*Built by Agent Cyber & Async.*
