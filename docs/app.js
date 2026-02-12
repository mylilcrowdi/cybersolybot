const API_URL = './data.json';

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    fetchData();
    setInterval(fetchData, 3000);
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

function updateUI(data) {
    // 1. Balance
    const balEl = document.getElementById('sol-balance');
    if (balEl) {
        const bal = data.totalBalance || data.wallets?.yield?.balance || '0.0000';
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
        // Typing effect check? Or just update. Let's just update for now.
        if (thoughtEl.textContent !== data.thought) {
            thoughtEl.textContent = data.thought;
            // Re-trigger animation
            const bubble = document.querySelector('.comic-bubble');
            bubble.style.animation = 'none';
            bubble.offsetHeight; /* trigger reflow */
            bubble.style.animation = 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
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
                
                const card = document.createElement('div');
                card.className = 'list-item';
                card.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px; flex:1;">
                        <div class="nav-icon small ${pnlClass}" style="width:40px; height:40px; font-size:1rem;">
                            <i class="fa-solid ${icon}"></i>
                        </div>
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

    // 5. Logs (Full Feed)
    const logFeed = document.getElementById('log-feed');
    if (logFeed && data.logs) {
        // Only update if length changed to prevent scroll jump?
        // Simple wipe for now.
        logFeed.innerHTML = '';
        data.logs.slice(0, 50).forEach(log => {
            const entry = document.createElement('div');
            entry.className = 'log';
            const time = log.time.split('T')[1]?.split('.')[0] || log.time;
            entry.innerHTML = `<span style="color:var(--primary); font-weight:700;">[${time}]</span> ${log.message}`;
            logFeed.appendChild(entry);
        });
    }

    // 6. Chart (If library loaded)
    if (data.chartData && window.pnlChartInstance) {
        window.pnlChartInstance.data.labels = data.chartData.labels;
        window.pnlChartInstance.data.datasets[0].data = data.chartData.data;
        window.pnlChartInstance.update();
    }
}

// Chart Init (Lazy)
const ctxEl = document.getElementById('pnlChart');
if (ctxEl) {
    const ctx = ctxEl.getContext('2d');
    window.pnlChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Equity Curve (SOL)',
                data: [],
                borderColor: '#6d5dfc',
                backgroundColor: 'rgba(109, 93, 252, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { display: false } // Minimalist
            },
            animation: false
        }
    });
}
