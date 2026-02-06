const blessed = require('blessed');
const contrib = require('blessed-contrib');
const fs = require('fs');
const path = require('path');

// Configuration
const HISTORY_FILE = path.join(__dirname, 'data/history.json');
const BOT_LOG = path.join(__dirname, 'bot.log');
const STATUS_FILE = path.join(__dirname, 'data/status.json');

const screen = blessed.screen({
    smartCSR: true,
    title: 'Agent Cyber Dashboard'
});

const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// 1. Activity Log (Terminal)
const log = grid.set(0, 0, 8, 8, blessed.log, {
    fg: "green",
    selectedFg: "green",
    label: 'Bot Live Stream',
    border: { type: 'line', fg: 'cyan' },
    scrollbar: { ch: ' ', track: { bg: 'cyan' }, style: { inverse: true } }
});

// 2. System Status Gauge
const statusGauge = grid.set(0, 8, 2, 4, contrib.gauge, {
    label: 'System Status',
    percent: [0, 0],
    stroke: 'green',
    fill: 'white',
    border: { type: 'line', fg: 'cyan' }
});

// 3. Performance Stats
const stats = grid.set(2, 8, 4, 4, contrib.table, {
    keys: true,
    fg: 'white',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: false,
    label: 'Performance Stats',
    width: '30%',
    height: '30%',
    border: { type: 'line', fg: 'cyan' },
    columnSpacing: 2,
    columnWidth: [15, 10]
});

// 4. Trade History
const historyTable = grid.set(6, 8, 6, 4, contrib.table, {
    keys: true,
    fg: 'green',
    label: 'Trade History',
    columnSpacing: 1,
    columnWidth: [10, 15, 8],
    border: { type: 'line', fg: 'cyan' }
});

// 5. Line Chart
const line = grid.set(8, 0, 4, 8, contrib.line, {
    style: {
        line: "yellow",
        text: "white",
        baseline: "black"
    },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: false,
    label: 'Profit Curve'
});

function updateSystemAwareness() {
    try {
        if (!fs.existsSync(STATUS_FILE)) {
            statusGauge.setData([0, 100]);
            statusGauge.setLabel('Status: DISCONNECTED');
            return;
        }
        
        const state = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        let percent = 100;
        let label = `Status: ${state.status}`;
        
        if (state.status === 'BACKOFF') {
            percent = 50;
            label += ` (Retry in ${Math.round(state.nextRetryIn / 1000)}s)`;
        } else if (state.status === 'FATAL_ERROR' || state.status === 'CRASHED') {
            percent = 10;
        }
        
        if (state.rateLimited) {
            label += ' [RATE LIMITED]';
        }

        statusGauge.setData([percent, 100 - percent]);
        statusGauge.setLabel(label);
    } catch (e) {}
}

function updateStats() {
    try {
        if (!fs.existsSync(HISTORY_FILE)) return;
        const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        
        const trades = history.filter(h => h.type === 'TRADE_EXIT' || h.type === 'YIELD_EXIT');
        const wins = trades.filter(t => t.profit > 0).length;
        const totalProfit = trades.reduce((acc, t) => acc + (t.profit || 0), 0);
        
        stats.setData({
            headers: ['Metric', 'Value'],
            data: [
                ['Total Actions', history.length],
                ['Completed Trades', trades.length],
                ['Win Rate', trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) + '%' : '0%'],
                ['Total PnL', totalProfit.toFixed(4) + ' SOL']
            ]
        });

        // Update History Table (last 10)
        const recent = history.slice(-10).reverse().map(h => [
            h.type.replace('TRADE_', '').replace('YIELD_', ''),
            h.token || 'N/A',
            h.status || 'OK'
        ]);
        historyTable.setData({
            headers: ['Type', 'Token', 'Status'],
            data: recent
        });

        // Update Chart
        line.setData([{
            title: 'SOL PnL',
            x: trades.map((_, i) => i.toString()),
            y: trades.reduce((acc, t, i) => {
                const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
                acc.push(prev + (t.profit || 0));
                return acc;
            }, [])
        }]);

    } catch (e) {}
}

// Watch bot.log for new lines
let lastPos = 0;
function watchLog() {
    if (!fs.existsSync(BOT_LOG)) return;
    const stat = fs.statSync(BOT_LOG);
    if (stat.size < lastPos) lastPos = 0;
    
    const stream = fs.createReadStream(BOT_LOG, { start: lastPos });
    stream.on('data', (chunk) => {
        log.log(chunk.toString().trim());
    });
    lastPos = stat.size;
}

// Keybindings
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
});

// Refresh loop
setInterval(() => {
    updateSystemAwareness();
    updateStats();
    watchLog();
    screen.render();
}, 2000);

screen.render();
log.log('Dashboard Started. Waiting for data...');
