const API_URL = './data.json';

async function fetchData() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        updateUI(data);
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

function updateUI(data) {
    // Vitals
    const hbEl = document.getElementById('heartbeat-val');
    if(hbEl) hbEl.textContent = data.heartbeat || 'OFFLINE';
    
    const upEl = document.getElementById('uptime-val');
    if(upEl) upEl.textContent = formatUptime(data.uptime);
    
    // Wallets & PnL
    const pnlEl = document.getElementById('pnl-val');
    if (pnlEl) {
        if (data.wallets) {
            const yieldBal = data.wallets.yield?.balance || '0.0000';
            const sniperBal = data.wallets.sniper?.balance || '0.0000';
            const total = data.totalBalance || (parseFloat(yieldBal) + parseFloat(sniperBal)).toFixed(4);
            
            pnlEl.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                    <span class="neon-purple">${total} SOL</span>
                    <div style="font-size: 0.4em; line-height: 1.4; margin-top: 5px; opacity: 0.8; text-align: right;">
                        <div style="color: #0aff0a;">YIELD: ${yieldBal}</div>
                        <div style="color: #ff0055;">SNIPER: ${sniperBal}</div>
                    </div>
                </div>
            `;
        } else {
            pnlEl.textContent = data.pnl || '0.00';
        }
    }
    
    // Narrative / Thought
    const thoughtEl = document.getElementById('current-thought');
    if (thoughtEl && data.thought) {
        thoughtEl.textContent = `"${data.thought}"`;
    }

    // Chart Update
    if (data.chartData && pnlChart) {
        pnlChart.data.labels = data.chartData.labels;
        pnlChart.data.datasets[0].data = data.chartData.data;
        pnlChart.update();
    }

    // Logs (Neural Stream)
    const feed = document.getElementById('log-feed');
    if (feed) {
        feed.innerHTML = ''; // Clear current
        
        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(log => {
                const div = document.createElement('div');
                div.className = 'log-entry';
                
                let colorClass = 'info';
                if (log.type === 'SCAN') colorClass = 'trade'; 
                if (log.type === 'SNIPE' || log.type === 'TRADE') colorClass = 'warn';
                if (log.type === 'YIELD_SCAN') colorClass = 'neon-blue';
                if (log.type === 'ERR') colorClass = 'err';

                const agent = log.agent || 'SYSTEM';
                
                div.innerHTML = `
                    <span class="time">[${log.time}]</span> 
                    <span class="agent-tag agent-${agent}">${agent}</span>
                    <span class="${colorClass}">${log.type}</span> 
                    ${log.message}
                `;
                feed.appendChild(div);
            });
        } else {
            feed.innerHTML = '<div class="log-entry"><span class="sys">SYSTEM</span> No recent activity recorded.</div>';
        }
    }
}

function formatUptime(seconds) {
    if (!seconds) return "00:00:00";
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// Chart.js Setup
const ctxEl = document.getElementById('pnlChart');
let pnlChart = null;

if (ctxEl) {
    const ctx = ctxEl.getContext('2d');
    pnlChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'PnL (SOL)',
                data: [],
                borderColor: '#b026ff',
                backgroundColor: 'rgba(176, 38, 255, 0.1)',
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
                y: { 
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#fff', font: { family: 'Fira Code' } }
                }
            },
            animation: false // Disable animation for smoother frequent updates
        }
    });
}

setInterval(fetchData, 5000);
fetchData();
