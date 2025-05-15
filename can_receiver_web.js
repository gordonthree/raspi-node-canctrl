const can = require('socketcan');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// --- Configuration ---
const canInterface = "can0"; // Change to your CAN interface
const webServerPort = 3000;   // Port for the web server

// Object to store CAN messages, organized by ID
const receivedCanMessages = {};
let uniqueIdCount = 0;

// --- Setup HTTP Server ---
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// --- Setup WebSocket Server ---
const wss = new WebSocket.Server({ server });

function broadcastUniqueIdCount() {
    const currentCount = Object.keys(receivedCanMessages).length;
    if (currentCount !== uniqueIdCount) { // Only broadcast if the count actually changed
        uniqueIdCount = currentCount;
    }
    // Always send the latest count to ensure consistency,
    // especially for newly connected clients or if a previous message was missed.
    const message = JSON.stringify({ type: 'uniqueIdCount', count: uniqueIdCount });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    console.log(`Broadcasted unique ID count: ${uniqueIdCount}`);
}

wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    // Send the current count immediately to the newly connected client
    ws.send(JSON.stringify({ type: 'uniqueIdCount', count: Object.keys(receivedCanMessages).length }));

    ws.on('close', () => {
        console.log('Client disconnected from WebSocket');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// --- Create and Configure CAN Channel ---
let channel;
try {
    channel = can.createRawChannel(canInterface, true); // true for timestamps
} catch (error) {
    console.error(`Error creating CAN channel for interface ${canInterface}:`);
    console.error(error.message);
    console.error("Please ensure the CAN interface exists and is up, and that you have the necessary permissions.");
    console.error("For virtual CAN, try: sudo modprobe vcan && sudo ip link add dev vcan0 type vcan && sudo ip link set up vcan0");
    process.exit(1);
}

// --- Listener for Incoming CAN Messages ---
channel.addListener("onMessage", (msg) => {
    const messageIdHex = `0x${msg.id.toString(16).toUpperCase()}`;
    const messageDataHex = msg.data.toString('hex').toUpperCase();
    const timestamp = msg.ts_sec !== undefined && msg.ts_usec !== undefined
        ? `${msg.ts_sec}.${String(msg.ts_usec).padStart(6, '0')}`
        : 'N/A';

    // console.log(`Received CAN Msg - ID: ${messageIdHex}, Data: ${messageDataHex}, Timestamp: ${timestamp}s`);

    const isNewId = !receivedCanMessages[messageIdHex];
    if (isNewId) {
        receivedCanMessages[messageIdHex] = [];
    }

    // Store a simplified version or the full msg if needed for other purposes
    receivedCanMessages[messageIdHex].push({
        data: msg.data.toString('hex'), // Storing hex for simplicity if not needing Buffer later
        dlc: msg.dlc,
        timestamp: parseFloat(timestamp)
    });

    if (isNewId) {
        // If a new unique ID was added, update and broadcast the count
        broadcastUniqueIdCount();
    }
});

// --- Start Servers and CAN Channel ---
server.listen(webServerPort, () => {
    console.log(`Web server started on http://localhost:${webServerPort}`);
    try {
        channel.start();
        console.log(`Listening for CAN messages on ${canInterface}...`);
        // Initialize and broadcast count in case there are already messages (e.g. script restart with data persistence - not implemented here)
        // or to ensure clients connecting right at startup get the initial 0.
        broadcastUniqueIdCount();
    } catch (error) {
        console.error(`Failed to start CAN channel on ${canInterface}: `, error);
        server.close(); // Close the webserver if CAN fails to start
        process.exit(1);
    }
});

// --- Graceful Shutdown ---
function shutdown() {
    console.log("\nStopping servers and CAN listener...");
    if (channel) {
        try {
            channel.stop();
            console.log('CAN channel stopped.');
        } catch (e) {
            console.error('Error stopping CAN channel:', e);
        }
    }
    wss.clients.forEach(client => client.close());
    wss.close(() => {
        console.log('WebSocket server closed.');
        server.close(() => {
            console.log('HTTP server closed.');
            process.exit(0);
        });
    });

    // Force exit if servers don't close in time
    setTimeout(() => {
        console.error('Graceful shutdown timed out, forcing exit.');
        process.exit(1);
    }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);