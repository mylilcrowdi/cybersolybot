document.addEventListener("DOMContentLoaded", () => {
    fetchData();
    setInterval(fetchData, 30000); // Update every 30s
});

async function fetchData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error("Failed to fetch data");
        const data = await response.json();
        renderDashboard(data);
    } catch (err) {
        console.warn("Using mock data due to fetch error:", err);
        // Mock data for preview if file missing
        renderDashboard({
            heartbeat: "OK",
            uptime: "LOADING...",
            health: "SYNCING",
            pnl: 0.00,
            logs: [
                { time: new Date().toISOString(), level: "SYS", msg: "Connecting to neural net..." }
            ],
            positions: [],
            thought: "Establishing uplink..."
        });
    }
}

function renderDashboard(data) {
    // Vitals
    document.getElementById('heartbeat-val').innerText = data.heartbeat || "ERR";
    document.getElementById('uptime-val').innerText = formatUptime(data.uptime);
    document.getElementById('health-val').innerText = data.health || "UNKNOWN";
    document.getElementById('pnl-val').innerText = (data.pnl || 0).toFixed(4);

    // Logs
    const logContainer = document.getElementById('log-feed');
    logContainer.innerHTML = '';
    (data.logs || []).slice().reverse().forEach(log => {
        const div = document.createElement('div');
        div.className = 'log-entry';
        const time = new Date(log.time).toLocaleTimeString();
        let colorClass = 'sys';
        if (log.level === 'WARN') colorClass = 'warn';
        if (log.level === 'ERROR') colorClass = 'err';
        if (log.level === 'SUCCESS' || log.level === 'PROFIT') colorClass = 'success';
        
        div.innerHTML = `<span class="time">[${time}]</span> <span class="${colorClass}">${log.level}</span> ${log.msg}`;
        logContainer.appendChild(div);
    });

    // Positions
    const posContainer = document.getElementById('positions-list');
    posContainer.innerHTML = '';
    if (!data.positions || data.positions.length === 0) {
        posContainer.innerHTML = '<div class="empty-state">NO ACTIVE POSITIONS</div>';
    } else {
        data.positions.forEach(pos => {
            const div = document.createElement('div');
            div.style.marginBottom = '10px';
            div.style.padding = '10px';
            div.style.border = '1px solid rgba(255,255,255,0.1)';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; color:var(--neon-blue)">
                    <b>${pos.symbol}</b>
                    <span>${pos.pnl}%</span>
                </div>
                <div style="font-size:0.8rem; color:var(--text-dim)">
                    Entry: ${new Date(pos.entry).toLocaleTimeString()}
                </div>
            `;
            posContainer.appendChild(div);
        });
    }

    // Thought
    if (data.thought) {
        document.getElementById('current-thought').innerText = `"${data.thought}"`;
    }
}

function formatUptime(ms) {
    if (!ms) return "00:00:00";
    const sec = Math.floor(ms / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n) { return n < 10 ? '0' + n : n; }
