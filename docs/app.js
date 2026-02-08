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
    document.getElementById('heartbeat-val').textContent = data.heartbeat || 'OFFLINE';
    document.getElementById('uptime-val').textContent = formatUptime(data.uptime);
    document.getElementById('pnl-val').textContent = data.pnl || '0.00';
    
    // Thought / Narrative (New!)
    if (data.thought) {
        document.getElementById('current-thought').textContent = `"${data.thought}"`;
    }

    // Logs (Mock for now, will pull from real logs later)
    // ...
}

function formatUptime(seconds) {
    if (!seconds) return "00:00:00";
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// Chart.js Setup (Preserved visual style)
const ctx = document.getElementById('pnlChart').getContext('2d');
const pnlChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
        datasets: [{
            label: 'PnL (SOL)',
            data: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2], // Flatline for now
            borderColor: '#b026ff',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0
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
        }
    }
});

setInterval(fetchData, 5000);
fetchData();
