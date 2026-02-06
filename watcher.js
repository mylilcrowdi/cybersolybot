/**
 * IndexWatcher - Intelligent Process & Rate-Limit Orchestrator
 * Ensures the bot stays alive, handles backoffs, and maintains awareness.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    script: 'index.js',
    maxRetries: 30,
    initialBackoff: 2000, 
    maxBackoff: 3600000,   // 1 hour
    statusFile: 'data/status.json'
};

let retryCount = 0;
let child = null;
let systemState = {
    status: 'BOOTING',
    lastUpdate: Date.now(),
    retries: 0,
    rateLimited: false,
    backoffActive: false,
    pid: process.pid,
    childPid: null,
    incidentCount: 0,
    consecutive429s: 0,
    health: 'GOOD',
    lastSignalTime: Date.now()
};

function updateStatus(patch) {
    systemState = { ...systemState, ...patch, lastUpdate: Date.now() };
    try {
        const dir = path.join(__dirname, 'data');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(__dirname, CONFIG.statusFile), JSON.stringify(systemState, null, 2));
    } catch (err) {}
}

/**
 * Triggers the AI Agent (the user's assistant) to take a look when something goes wrong.
 */
function callAgent(reason, context) {
    console.log(`[Watcher] 🤖 AGENT_CALL: Requesting manual inspection for: ${reason}`);
    
    // In OpenClaw, we use standard console markers that the agent's log-tailing can catch,
    // or we write a specific trigger file that the agent looks for during heartbeats.
    const alert = `
🚨 BOT ALERT - ${new Date().toISOString()}
Reason: ${reason}
State: ${JSON.stringify(systemState, null, 2)}
Last Logs: ${context}
    `;
    
    try {
        const alertPath = path.join(__dirname, 'data/agent_alert.txt');
        fs.writeFileSync(alertPath, alert);
        // This marker is for the agent's real-time monitoring
        console.log(`AGENT_INSPECTION_REQUESTED: ${reason}`);
    } catch (err) {}
}

function startBot() {
    console.log(`[Watcher] 🚀 Starting ${CONFIG.script}... (Attempt ${retryCount + 1})`);
    updateStatus({ 
        status: 'RUNNING', 
        retries: retryCount, 
        rateLimited: false, 
        backoffActive: false,
        nextRetryIn: null,
        health: retryCount > 5 ? 'DEGRADED' : 'GOOD'
    });
    
    child = spawn('node', [CONFIG.script], {
        cwd: __dirname,
        env: { ...process.env, WATCHER_ACTIVE: 'true' },
        stdio: ['inherit', 'pipe', 'pipe']
    });

    updateStatus({ childPid: child.pid });

    let lastFewLogs = [];

    child.stdout.on('data', (data) => {
        const output = data.toString();
        process.stdout.write(`[Bot] ${output}`);
        lastFewLogs.push(output);
        if (lastFewLogs.length > 10) lastFewLogs.shift();
        handleLogs(output, lastFewLogs.join('\n'));
    });

    child.stderr.on('data', (data) => {
        const output = data.toString();
        process.stderr.write(`[Bot-Err] ${output}`);
        lastFewLogs.push(output);
        if (lastFewLogs.length > 10) lastFewLogs.shift();
        handleLogs(output, lastFewLogs.join('\n'));
    });

    child.on('close', (code) => {
        console.log(`[Watcher] ⚠️  Bot exited with code ${code}`);
        updateStatus({ status: 'CRASHED', lastExitCode: code, incidentCount: systemState.incidentCount + 1 });
        
        if (code !== 0 && code !== null) {
            callAgent(`CRASH_EXIT_CODE_${code}`, lastFewLogs.join('\n'));
        }
        
        handleRestart();
    });
}

function handleLogs(output, context) {
    if (output.includes('429') || output.includes('Too Many Requests')) {
        const newCount = (systemState.consecutive429s || 0) + 1;
        updateStatus({ 
            rateLimited: true, 
            lastRateLimit: Date.now(),
            consecutive429s: newCount,
            health: newCount > 20 ? 'CRITICAL' : 'DEGRADED'
        });

        if (newCount === 50) {
            console.log('[Watcher] 🛑 Severe RPC throttling. Triggering AI intervention...');
            callAgent('EXTREME_RATE_LIMIT_50', context);
            if (child) child.kill('SIGTERM');
        }
    } 
    else if (output.includes('✅ TARGET ACQUIRED') || output.includes('[Monitor] ⚡ Agent Cyber Listening')) {
        const wasLimited = systemState.rateLimited;
        updateStatus({ 
            consecutive429s: 0, 
            rateLimited: false, 
            health: 'GOOD',
            lastSignalTime: Date.now()
        });
        
        if (wasLimited) {
            console.log('[Watcher] ❇️  Network path cleared. System health restored.');
            retryCount = 0;
        }
    }
}

function handleRestart() {
    if (retryCount < CONFIG.maxRetries) {
        const rpcPenalty = systemState.consecutive429s > 25 ? 180000 : 0;
        const baseDelay = CONFIG.initialBackoff * Math.pow(2, Math.min(retryCount, 10));
        const delay = Math.min(baseDelay + rpcPenalty, CONFIG.maxBackoff);
        
        console.log(`[Watcher] ⏳ Waiting ${Math.round(delay/1000)}s before restart...`);
        updateStatus({ status: 'BACKOFF', backoffActive: true, nextRetryIn: delay });
        retryCount++;
        
        setTimeout(() => {
            startBot();
        }, delay);
    } else {
        console.log('[Watcher] 💀 Max retries reached.');
        updateStatus({ status: 'FATAL_ERROR', health: 'DEAD' });
        callAgent('MAX_RETRIES_REACHED', 'System reached fatal retry limit and stopped.');
        process.exit(1);
    }
}

// Global Awareness: Stale Process Detection
setInterval(() => {
    const staleTime = Date.now() - systemState.lastUpdate;
    if (systemState.status === 'RUNNING' && staleTime > 120000) {
        console.log('[Watcher] 🛰️  System Heartbeat Stale. Requesting Agent Audit...');
        callAgent('STALE_PROCESS_DETECTED', 'No logs received for >120s.');
    }
}, 60000);

process.on('SIGINT', () => {
    if (child) child.kill();
    process.exit();
});

console.log('[Watcher] 🧠 Agent Cyber Awareness System Active');
startBot();
