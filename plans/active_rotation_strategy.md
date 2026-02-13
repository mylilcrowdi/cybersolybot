# Active Rotation Strategy Plan

## Goal
Implement a forced trading strategy that ensures active participation (at least every 30 minutes) and maintains 2 open positions, rotating the worst performer for a fresh opportunity.

## Directives
1.  **Frequency:** Execute a trade at least every 30 minutes.
2.  **Fallback:** If no "perfect" signal, pick the best available asset trending UP.
3.  **Position Management:**
    - Always aim for 2 open positions.
    - If 2 positions exist and >30 mins elapsed without a natural exit:
        - Identify the worst performer (highest loss).
        - Sell it.
        - Open a new position in a DIFFERENT asset (trending up).

## Implementation Plan

### Phase 1: Planning & State (Current)
- [ ] Create this plan file.
- [ ] Update MEMORY.md with new strategic directive.

### Phase 2: Test-Driven Development (TDD)
- [ ] Create a test file (e.g., `tests/rotation_strategy.test.js`).
- [ ] Mock:
    - Current Portfolio (2 positions, one losing more).
    - Time elapsed (>30 mins since last trade).
    - Market Data (Trend UP asset list).
- [ ] Test Case 1: Detects 30-minute inactivity.
- [ ] Test Case 2: Identifies correct "worst" position to sell.
- [ ] Test Case 3: Selects valid "fresh" asset (excludes sold asset).
- [ ] Test Case 4: Verifies Sell + Buy sequence execution.

### Phase 3: Implementation
- [ ] Modify `monitor.js` or create `rotation_manager.js`.
- [ ] Implement `checkRotation()` loop running every minute.
- [ ] Integrate with `trade_executor.js`.

### Phase 4: Validation
- [ ] Dry Run (Paper Trade) to verify rotation logic.
- [ ] Live Activation.
