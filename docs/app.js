const API_URL = './data.json';

async function fetchData() {
    try {
        const response = await fetch(API_URL + '?t=' + new Date().getTime());
        const data = await response.json();
        updateUI(data);
    } catch (error) {
        console.error('Connection Lost:', error);
    }
}

function updateUI(data) {
    // 1. Balance
    const balEl = document.getElementById('sol-balance');
    if (balEl) {
        // Handle nested wallet structure or flat
        const bal = data.totalBalance || data.wallets?.yield?.balance || '0.0000';
        balEl.textContent = parseFloat(bal).toFixed(3);
    }

    // 2. Position Count
    const posCountEl = document.getElementById('pos-count');
    const positions = data.positions || [];
    if (posCountEl) {
        posCountEl.textContent = `${positions.length} / 2`;
    }

    // 3. Positions List
    const posContainer = document.getElementById('positions-container');
    if (posContainer) {
        posContainer.innerHTML = ''; // Clear

        if (positions.length === 0) {
            posContainer.innerHTML = `
                <div class="empty-placeholder">
                    <i class="fa-solid fa-wind"></i>
                    <p>Scanning Market... No Active Trades</p>
                </div>
            `;
        } else {
            positions.forEach(pos => {
                const pnl = pos.pnl || 0;
                const pnlClass = pnl >= 0 ? 'success' : 'alert';
                const icon = pnl >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
                
                const card = document.createElement('div');
                card.className = 'list-item';
                card.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px; flex:1;">
                        <div class="nav-icon small ${pnlClass}"><i class="fa-solid ${icon}"></i></div>
                        <div>
                            <div style="font-weight:700;">${pos.symbol || pos.name || 'UNKNOWN'}</div>
                            <div style="font-size:0.8rem; color:var(--text-light);">${pos.address.slice(0,4)}...${pos.address.slice(-4)}</div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; color: var(--${pnl >= 0 ? 'success' : 'accent'});">${pnl.toFixed(2)}%</div>
                        <div style="font-size:0.8rem; color:var(--text-light);">${pos.age || '0h'} ago</div>
                    </div>
                `;
                posContainer.appendChild(card);
            });
        }
    }

    // 4. Logs
    const logFeed = document.getElementById('log-feed');
    if (logFeed && data.logs) {
        logFeed.innerHTML = '';
        data.logs.slice(0, 10).forEach(log => {
            const entry = document.createElement('div');
            entry.className = 'log';
            const time = log.time.split('T')[1]?.split('.')[0] || log.time;
            entry.innerHTML = `<span style="color:var(--primary); font-weight:700;">[${time}]</span> ${log.message}`;
            logFeed.appendChild(entry);
        });
    }
}

// Initial Load
fetchData();
setInterval(fetchData, 3000);
