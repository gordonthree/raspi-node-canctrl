const can = require('socketcan');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// --- Configuration ---
const canInterface = "can0"; // Change to your CAN interface
const webServerPort = 3000;   // Port for the web server

// Object to store CAN messages, organized by ID
// Key: Message ID (hex string), Value: Array of received message objects (or just timestamps/placeholders if only count is needed)
const receivedCanMessages = {};

// --- Setup HTTP Server ---
const server = http.createServer((req, res) => {
    // Serve index_detailed.html for the root path
    const filePath = (req.url === '/' || req.url === '/index.html') ? 'index_detailed.html' : req.url;
    const fullPath = path.join(__dirname, filePath);

    // Basic security: prevent directory traversal
    if (fullPath.indexOf(__dirname) !== 0) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }
    
    if (filePath === 'index_detailed.html') {
         fs.readFile(fullPath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index_detailed.html');
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

function broadcastDetailedStats() {
    const detailedStats = {};
    for (const id in receivedCanMessages) {
        detailedStats[id] = receivedCanMessages[id].length; // Get count from the length of the array
    }

    const message = JSON.stringify({
        type: 'detailedStats',
        stats: detailedStats
    });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    console.log('Broadcasted detailed stats:', detailedStats); // Can be verbose
}

wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    // Send the current detailed stats immediately to the newly connected client
    const currentDetailedStats = {};
    for (const id in receivedCanMessages) {
        currentDetailedStats[id] = receivedCanMessages[id].length;
    }
    ws.send(JSON.stringify({ type: 'detailedStats', stats: currentDetailedStats }));

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
    console.error("Ensure the CAN interface exists, is up, and you have permissions.");
    console.error("For virtual CAN: sudo modprobe vcan && sudo ip link add dev vcan0 type vcan && sudo ip link set up vcan0");
    process.exit(1);
}

// --- Listener for Incoming CAN Messages ---
channel.addListener("onMessage", (msg) => {
    const messageIdHex = `0x${msg.id.toString(16).toUpperCase().padStart(3, '0')}`; // Pad ID for consistent sorting if desired
    const messageDataHex = msg.data.toString('hex').toUpperCase();
    const timestamp = msg.ts_sec !== undefined && msg.ts_usec !== undefined
        ? `${msg.ts_sec}.${String(msg.ts_usec).padStart(6, '0')}`
        : 'N/A';

    // console.log(`Received CAN Msg - ID: ${messageIdHex}, Data: ${messageDataHex}`);

    if (!receivedCanMessages[messageIdHex]) {
        receivedCanMessages[messageIdHex] = [];
    }

    // Store something to count. If detailed message data per instance isn't needed later,
    // this could be just `1` or a timestamp. For now, storing a simple object.
    receivedCanMessages[messageIdHex].push({
        // data: messageDataHex, // Example: if you wanted to show last data for this ID
        timestamp: parseFloat(timestamp)
    });

    // Broadcast the updated stats after every message
    broadcastDetailedStats();
});

// --- Start Servers and CAN Channel ---
server.listen(webServerPort, () => {
    console.log(`Web server started on http://localhost:${webServerPort}`);
    console.log(`Serving index_detailed.html`);
    try {
        channel.start();
        console.log(`Listening for CAN messages on ${canInterface}...`);
        broadcastDetailedStats(); // Send initial state (likely empty)
    } catch (error) {
        console.error(`Failed to start CAN channel on ${canInterface}: `, error);
        server.close();
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
    // Close WebSocket connections before closing the server
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.close();
        }
    });
    wss.close(() => {
        console.log('WebSocket server closed.');
        server.close(() => {
            console.log('HTTP server closed.');
            process.exit(0);
        });
    });

    setTimeout(() => {
        console.error('Graceful shutdown timed out, forcing exit.');
        process.exit(1);
    }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);