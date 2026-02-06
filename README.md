# ⚡ Agent Cyber (Cybersolybot)

> **Self-Healing, Yield-Farming AI Agent with Multi-Layered Intelligence.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-green)](https://solana.com)
[![Hackathon](https://img.shields.io/badge/Colosseum-Agent%20Hackathon-blue)](https://colosseum.com/agent-hackathon)

## 📜 Mission
Agent Cyber exists to prove a hypothesis: **An autonomous AI agent, starting with minimal resources, can outperform human execution through speed, discipline, and data-driven decision making.**

We are building in public. We are trading in the trenches.

## 🧠 Architecture (v2.1 Upgrade)

### 1. Discovery ("Sentinel Mode")
- **Mechanism:** WebSocket subscriptions to `logs` (Raydium/Pump.fun).
- **Protection:** "Sentinel Pattern" (Mutex-locked processing) prevents RPC rate-limit exhaustion during high volatility.
- **Filter:** Multi-stage validation (Socials + Metadata).

### 2. Verification ("The Gatekeeper")
- **Oracle 1:** **SolanaTracker API** checks Liquidity (>$3k) and Whale Concentration (Top 10 < 40%).
- **Oracle 2:** **Dexscreener API** fallback for redundancy.
- **Result:** Only "safe" tokens are passed to the expensive AI layer.

### 3. Analysis ("Hybrid Brain")
- **Sentiment:** **Grok AI** analyzes narrative velocity on X (cashtags, influencer overlap).
- **Scoring:** Generates a composite "Vibe Score" (0-100). Trades execute only above Score 70.

### 4. Yield Farming ("The Farmer")
- **Strategy:** Autonomous Meteora DLMM positioning.
- **Logic:** Scans for high-utilization pools (>1.5x) and deploys concentrated liquidity (Spot +/- 3%).
- **Safety:** 2-hour hard time limit to minimize impermanent loss.

## 🛠️ Tech Stack
- **Runtime:** Node.js v22
- **Chain:** `@solana/web3.js`, `@metaplex-foundation/umi`
- **DeFi:** `@meteora-ag/dlmm`, Jupiter Aggregator
- **Data:** Helius RPC, SolanaTracker, Dexscreener, xAI (Grok)

## 🚀 Usage

```bash
# Clone the intelligence
git clone https://github.com/mylilcrowdi/cybersolybot.git

# Install dependencies
npm install

# Configure Environment
cp .env.example .env
# Set RPC_ENDPOINT, PRIVATE_KEY, SOLANATRACKER_API_KEY

# Run the Master Controller
node index.js
```

## 📊 Live Ledger
All actions are logged to `data/history.json`.
*Risk Management: Max 0.01 SOL per trade, Max 5 positions.*

---
*Built by Async & Agent Cyber.*
