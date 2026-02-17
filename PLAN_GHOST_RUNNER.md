# PLAN: "Ghost Runner" Protocol (Strategy Persistence & Comparison)

## 🎯 Objective
To prevent premature strategy abandonment ("strategy hopping") by tracking how deprecated strategies *would have performed* if they had remained active.

## 🏗 System Architecture

### 1. The "Shadow Realm" Engine
Instead of deleting old configurations, we move them to a **Shadow Mode**.
*   **Live Engine:** Executes real transactions with the `Active Strategy`.
*   **Shadow Engine:** A lightweight background process that receives the **exact same market data** but executes **Paper Trades** for `Deprecated Strategies`.

### 2. Data Flow (RPC Optimization)
To avoid 3x RPC costs, we decouple **Data Ingestion** from **Decision Logic**.
1.  **Input:** `monitor.js` fetches market data (Price, Volume, Liquidity) *once*.
2.  **Bus:** Data is emitted via an internal event emitter (`market_data`).
3.  **Consumers:**
    *   `Active Strategy` -> Analyzes -> Sends TX to Chain.
    *   `Ghost Strategy A` -> Analyzes -> Logs "Virtual TX" to JSON.
    *   `Ghost Strategy B` -> Analyzes -> Logs "Virtual TX" to JSON.

### 3. Version Control for Strategies
Every time the **Executive Manager** modifies the config (e.g., tightens stop-loss, changes filters), we create a **Snapshot**:
*   **File:** `memory/strategies/v{timestamp}_{name}.json`
*   **Content:** Full configuration parameters + reference to the logic version.

### 4. The "Regret Minimization" Metric
In the **Daily Executive Review**, we compare:
*   **Real PnL:** Actual wallet change.
*   **Ghost PnL:** What we *would* have made if we stayed on the old version.

**Decision Logic:**
*   IF `Ghost PnL > Real PnL` for **3 consecutive days**:
    *   **ALERT:** "New strategy is underperforming legacy version."
    *   **ACTION:** Auto-Rollback to the Ghost Strategy.

## 📂 File Structure Plan

```text
cybersolybot/
├── strategies/
│   ├── active_config.js       # The one trading real money
│   ├── archive/
│   │   ├── v1_sentinel.json   # Old config
│   │   └── v2_momentum.json   # Old config
├── data/
│   ├── shadow_trades.json     # Log of virtual trades by ghosts
│   └── comparison_log.md      # Daily "Real vs. Ghost" scoreboard
└── shadow_runner.js           # The script running the ghosts
```

## 🛡 Resource Limits
Running too many ghosts will eat CPU/RAM.
*   **Limit:** Max **2 Active Ghosts** (e.g., the previous version + one "experimental" version).
*   **Pruning:** If a Ghost Strategy underperforms the Real Strategy for 7 days, it is killed (archived permanently).

## 🚀 Implementation Stages
1.  **Refactor:** Separate `monitor.js` (data) from `execution_module.js` (trading) to allow multiple consumers.
2.  **Snapshotting:** Update `Daily_Executive_Review` to save `config.js` before modifying it.
3.  **Shadow Runner:** Build the script that loads a config and "pretends" to trade.
4.  **Dashboard Integration:** Add a "Ghost vs. Real" chart to the GitHub Pages dashboard.
