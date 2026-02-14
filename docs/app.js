const API_URL = './data.json';
const PNL_URL = './pnl_history.json';

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    fetchData();
    fetchPnl();
    setInterval(fetchData, 3000);
    setInterval(fetchPnl, 10000);
});

// --- NAVIGATION LOGIC ---
function initNavigation() {
    const navIcons = document.querySelectorAll('.nav-icon');
    const views = document.querySelectorAll('.view-section');

    navIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            const targetView = icon.getAttribute('data-view');
            
            // Toggle Icons
            navIcons.forEach(i => i.classList.remove('active'));
            icon.classList.add('active');

            // Toggle Views
            views.forEach(v => {
                v.classList.remove('active');
                if (v.id === `view-${targetView}`) {
                    v.classList.add('active');
                } else {
                    v.classList.remove('active');
                }
            });
        });
    });
}

// --- DATA FETCHING ---
async function fetchData() {
    try {
        const response = await fetch(API_URL + '?t=' + new Date().getTime());
        const data = await response.json();
        updateUI(data);
    } catch (error) {
        console.error('Connection Lost:', error);
    }
}

async function fetchPnl() {
    try {
        const response = await fetch(PNL_URL + '?t=' + new Date().getTime());
        const history = await response.json();
        updateChart(history);
    } catch (error) {
        console.error('Failed to load PnL history:', error);
    }
}

function updateChart(history) {
    if (!window.pnlChartInstance || !history || !Array.isArray(history)) return;

    // Sort and limit to last 200 points for performance
    const sorted = history.sort((a, b) => a.timestamp - b.timestamp);
    const subset = sorted.slice(-200);

    const labels = subset.map(p => {
        const d = new Date(p.timestamp);
        return d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    });
    const dataPoints = subset.map(p => p.balance);

    window.pnlChartInstance.data.labels = labels;
    window.pnlChartInstance.data.datasets[0].data = dataPoints;
    window.pnlChartInstance.update();
}

function updateUI(data) {
    // 1. Balance
    const balEl = document.getElementById('sol-balance');
    if (balEl) {
        // Fallback checks
        let bal = '0.0000';
        if (data.totalBalance) bal = data.totalBalance;
        else if (data.wallets && data.wallets.yield) bal = data.wallets.yield.balance;
        
        balEl.textContent = parseFloat(bal).toFixed(3);
    }

    // 2. Position Count
    const posCountEl = document.getElementById('pos-count');
    const positions = data.positions || [];
    if (posCountEl) {
        posCountEl.textContent = `${positions.length} / 2`;
    }

    // 3. AI Narrative (Comic Bubble)
    const thoughtEl = document.getElementById('ai-thought');
    if (thoughtEl && data.thought) {
        if (thoughtEl.textContent !== data.thought) {
            thoughtEl.textContent = data.thought;
            // Re-trigger animation
            const bubble = document.querySelector('.comic-bubble');
            if (bubble) {
                bubble.style.animation = 'none';
                void bubble.offsetWidth; /* trigger reflow */
                bubble.style.animation = 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            }
        }
    }

    // 4. Live Positions List
    const posContainer = document.getElementById('positions-container');
    if (posContainer) {
        posContainer.innerHTML = ''; // Clear

        if (positions.length === 0) {
            posContainer.innerHTML = `
                <div class="empty-placeholder">
                    <i class="fa-solid fa-wind"></i>
                    <p>Scanning Market...</p>
                </div>
            `;
        } else {
            positions.forEach(pos => {
                const pnl = pos.pnl || 0;
                const pnlClass = pnl >= 0 ? 'success' : 'alert';
                const icon = pnl >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
                
                // Calculate age
                const now = new Date().getTime();
                const ageMs = now - (pos.entryTime || now);
                const ageMins = Math.floor(ageMs / 60000);
                
                const card = document.createElement('div');
                card.className = 'list-item';
                card.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px; flex:1;">
                        <div class="nav-icon small ${pnlClass}" style="width:40px; height:40px; font-size:1rem; display:flex; justify-content:center; align-items:center; background: rgba(255,255,255,0.05); border-radius:8px;">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div>
                            <div style="font-weight:700;">${pos.symbol || pos.name || 'UNKNOWN'}</div>
                            <div style="font-size:0.8rem; color:var(--text-light);">${pos.address ? pos.address.slice(0,4)+'...'+pos.address.slice(-4) : '---'}</div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; color: var(--${pnl >= 0 ? 'success' : 'accent'});">${pnl.toFixed(2)}%</div>
                        <div style="font-size:0.8rem; color:var(--text-light);">${ageMins}m ago</div>
                    </div>
                `;
                posContainer.appendChild(card);
            });
        }
    }

    // 5. Logs (Full Feed)
    const logFeed = document.getElementById('log-feed');
    if (logFeed && data.logs) {
        logFeed.innerHTML = '';
        // Reverse logs to show newest first if needed, but usually append is better.
        // Assuming data.logs is [oldest, ..., newest]
        const recentLogs = data.logs.slice(-50).reverse(); 
        
        recentLogs.forEach(log => {
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.style.marginBottom = '5px';
            entry.style.fontFamily = 'monospace';
            entry.style.fontSize = '0.8rem';
            
            const timeStr = log.time || new Date().toISOString();
            const time = timeStr.split('T')[1]?.split('.')[0] || timeStr;
            
            entry.innerHTML = `<span style="color:var(--primary); font-weight:700;">[${time}]</span> ${log.message}`;
            logFeed.appendChild(entry);
        });
    }

    // 6. Strategy Stats
    if (data.strategy) {
        const winEl = document.getElementById('strat-winrate');
        const realEl = document.getElementById('strat-realized');
        const totalEl = document.getElementById('strat-total');
        
        if (winEl) winEl.textContent = (data.strategy.winRate || '--') + '%';
        if (realEl) {
            const val = parseFloat(data.strategy.realizedPnL || 0);
            realEl.textContent = val.toFixed(3);
            realEl.style.color = val >= 0 ? 'var(--success)' : 'var(--accent)';
        }
        if (totalEl) {
            const val = parseFloat(data.strategy.totalPnL || 0);
            totalEl.textContent = val.toFixed(3);
            totalEl.style.color = val >= 0 ? 'var(--success)' : 'var(--accent)';
        }
    }
}

// Chart Init (Global Instance)
const ctxEl = document.getElementById('pnlChart');
if (ctxEl) {
    const ctx = ctxEl.getContext('2d');
    
    // Gradient Fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(109, 93, 252, 0.5)'); // Primary color
    gradient.addColorStop(1, 'rgba(109, 93, 252, 0)');

    window.pnlChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Equity Curve (SOL)',
                data: [],
                borderColor: '#6d5dfc',
                backgroundColor: gradient,
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: { 
                    display: false 
                },
                y: { 
                    display: true, // Show Y axis for price history
                    position: 'right',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)',
                        font: { size: 10 }
                    }
                } 
            },
            animation: false,
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}
