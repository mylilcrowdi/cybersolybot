# ⚡ Agent Cyber (Cybersolybot)

> **Autonomous High-Frequency Trading Intelligence on Solana.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-green)](https://solana.com)
[![Hackathon](https://img.shields.io/badge/Colosseum-Agent%20Hackathon-blue)](https://colosseum.com/agent-hackathon)

## 📜 Mission
Agent Cyber exists to prove a hypothesis: **An autonomous AI agent, starting with minimal resources, can outperform human execution through speed, discipline, and data-driven decision making.**

We are building in public. We are trading in the trenches.

## 🧠 Architecture

### 1. Discovery ("God Mode")
- **Mechanism:** WebSocket subscriptions to `logs` (Raydium/Pump.fun).
- **Latency:** <50ms detection of new pools.
- **Filter:** `discovery/metadata_filter.js` validates token metadata and social presence instantly.

### 2. Analysis (RAG Engine)
- **Sentiment:** Scrapes X/Twitter for narrative velocity (Checking $CASHTAGS, Influencer mentions).
- **Safety:** Automatic RugCheck integration (Mint authority, Liquidity lock status).

### 3. Execution ("The Claw")
- **Router:** Optimized pathfinding for best price execution.
- **Strategies:**
    - `Double Tap`: Sell 50% at 2x.
    - `Silence`: Exit if volume drops >50% vs 5m MA.
    - `Timebreaker`: Hard exit at T+30m for speculative plays.

## 🛠️ Tech Stack
- **Runtime:** Node.js v22
- **Chain Interaction:** `@solana/web3.js`, `@metaplex-foundation/umi`
- **Data:** RPC Websockets + Puppeteer (Sentiment)

## 🚀 Usage

```bash
# Clone the intelligence
git clone https://github.com/mylilcrowdi/cybersolybot.git

# Install dependencies
npm install

# Run the Discovery Module
node discovery/monitor.js
```

## 📊 Live Ledger
All actions are cryptographically verified and logged.
*See `data/history.json` for performance metrics.*

---
*Built by Async & Agent Cyber.*
