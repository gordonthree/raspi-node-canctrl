const can = require('socketcan');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// --- Configuration ---
const canInterface = "can0"; // Change to your CAN interface
const webServerPort = 3000;   // Port for the web server

const FILTER_ID_MIN = 0x700; // 1792 in decimal
const FILTER_ID_MAX = 0x77F; // 1919 in decimal
const MAX_FILTERED_LOG_SIZE = 50; // Max number of messages to keep in the filtered log

// Data structures
const receivedCanMessages = {}; // For general ID counts
let filteredMessagesLog = [];   // For messages in the 0x700-0x77F range

// --- Setup HTTP Server ---
const server = http.createServer((req, res) => {
    // const htmlFileName = 'index_filtered.html'; // Centralize filename
    // const rootFilePath = path.join(__dirname, req.url);
    // const includeFilePath = path.join(__dirname, 'include', req.url);

    // const filePath = fs.existsSync(rootFilePath) ? rootFilePath : includeFilePath;
    // const fullPath = path.join(__dirname, filePath);


    const htmlFileName = 'index_filtered.html'; // Centralize filename
    const filePath = (req.url === '/' || req.url === '/index.html' || req.url === `/${htmlFileName}`)
        ? htmlFileName
        : req.url;
    const fullPath = path.join(__dirname, filePath);

    if (fullPath.indexOf(__dirname) !== 0) { // Basic security
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    // if (filePath === htmlFileName) {
        fs.readFile(fullPath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end(`Error loading ${fullPath}`);
                return;
            }
            if (fullPath.includes('.html')) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
            } else if (fullPath.includes('.js')) {
            res.writeHead(200, { 'Content-Type': 'text/javascript' });
            res.end(data);
            } else if (fullPath.includes('.css')) {
            res.writeHead(200, { 'Content-Type': 'text/css' });
            res.end(data);
            } else {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(data);
            }
        });
    // } else {
    //     res.writeHead(404);
    //     res.end('Not Found');
    // }
});

// --- Setup WebSocket Server ---
const wss = new WebSocket.Server({ server });

function broadcastDetailedStats() {
    const detailedStats = {};
    for (const id in receivedCanMessages) {
        detailedStats[id] = receivedCanMessages[id].length;
    }
    const message = JSON.stringify({ type: 'detailedStats', stats: detailedStats });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
    });
}

function broadcastFilteredLog() {
    const message = JSON.stringify({ type: 'filteredLogUpdate', log: filteredMessagesLog });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
    });
}

wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    // Send current detailed stats
    const currentDetailedStats = {};
    for (const id in receivedCanMessages) {
        currentDetailedStats[id] = receivedCanMessages[id].length;
    }
    ws.send(JSON.stringify({ type: 'detailedStats', stats: currentDetailedStats }));

    // Send current filtered log
    ws.send(JSON.stringify({ type: 'filteredLogUpdate', log: filteredMessagesLog }));

    ws.on('close', () => console.log('Client disconnected'));
    ws.on('error', (error) => console.error('WebSocket error:', error));
});

// --- Create and Configure CAN Channel ---
let channel;
try {
    channel = can.createRawChannel(canInterface, true); // true for timestamps
} catch (error) {
    console.error(`Error creating CAN channel for ${canInterface}: ${error.message}`);
    process.exit(1);
}

// --- Listener for Incoming CAN Messages ---
channel.addListener("onMessage", (msg) => {
    const numericId = msg.id;
    const messageIdHex = `0x${numericId.toString(16).toUpperCase().padStart(3, '0')}`;
    const messageDataHex = msg.data.toString('hex').toUpperCase();
    const messageTXID = messageDataHex.substring(0,8);
    // console.info(`Data ${messageTXID}`);
    const timestamp = msg.ts_sec !== undefined && msg.ts_usec !== undefined
        ? parseFloat(`${msg.ts_sec}.${String(msg.ts_usec).padStart(6, '0')}`)
        : Date.now() / 1000; // Fallback timestamp

    // Update general message counts
    if (!receivedCanMessages[messageIdHex]) {
        receivedCanMessages[messageIdHex] = [];
    }
    receivedCanMessages[messageIdHex].push({ timestamp }); // Store minimal data for count
    broadcastDetailedStats(); // Broadcast after any message for general stats

    // Check if message ID is in the filter range
    if (numericId >= FILTER_ID_MIN && numericId <= FILTER_ID_MAX) {
        const logEntry = {
            id: messageIdHex,
            data: messageDataHex,
            txid: messageTXID
        };
        filteredMessagesLog.push(logEntry);
        if (filteredMessagesLog.length > MAX_FILTERED_LOG_SIZE) {
            filteredMessagesLog.shift(); // Remove the oldest message
        }
        broadcastFilteredLog(); // Broadcast update for the filtered log
    }
});

// --- Start Servers and CAN Channel ---
server.listen(webServerPort, () => {
    console.log(`Web server started on http://localhost:${webServerPort}, serving index_filtered.html`);
    try {
        channel.start();
        console.log(`Listening for CAN messages on ${canInterface}...`);
        // Send initial empty states or current states if any (e.g. after restart if persisted)
        broadcastDetailedStats();
        broadcastFilteredLog();
    } catch (error) {
        console.error(`Failed to start CAN channel on ${canInterface}: ${error.message}`);
        server.close();
        process.exit(1);
    }
});

// --- Graceful Shutdown ---
function shutdown() {
    console.log("\nStopping...");
    if (channel) {
        try { channel.stop(); console.log('CAN channel stopped.'); }
        catch (e) { console.error('Error stopping CAN channel:', e); }
    }
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.close();
    });
    wss.close(() => {
        console.log('WebSocket server closed.');
        server.close(() => {
            console.log('HTTP server closed.');
            process.exit(0);
        });
    });
    setTimeout(() => { console.error('Shutdown timed out.'); process.exit(1); }, 5000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);