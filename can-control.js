import { CanConstants } from '/can-ctrl-js/can-ctrl-consts.js';

const messageTableBody = document.getElementById('message-tbody');
const noMessagesPlaceholder = document.getElementById('no-messages-placeholder');

const filteredMessagesTableBody = document.getElementById('filtered-messages-tbody');
const noFilteredMessagesPlaceholder = document.getElementById('no-filtered-messages');

const connectionStatus = document.getElementById('connection-status');

let socket;

function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${wsProtocol}//${window.location.host}`);

    socket.onopen = function() {
        console.log('WebSocket connection established.');
        connectionStatus.textContent = 'Connected to server.';
        connectionStatus.style.color = 'green';
    };

    socket.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'detailedStats') {
                updateMessageTable(data.stats);
            } else if (data.type === 'filteredLogUpdate') {
                updateFilteredMessagesLog(data.log);
            }
        } catch (error) {
            console.error('Error processing message from server:', error);
        }
    };

    socket.onclose = function(event) {
        console.log('WebSocket connection closed.', event);
        connectionStatus.textContent = 'Disconnected. Attempting to reconnect...';
        connectionStatus.style.color = 'red';
        setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = function(error) {
        console.error('WebSocket error:', error);
        connectionStatus.textContent = 'Connection error.';
        connectionStatus.style.color = 'red';
    };
}

function updateMessageTable(stats) {
    messageTableBody.innerHTML = '';
    const sortedIds = Object.keys(stats).sort((a, b) => parseInt(a, 16) - parseInt(b, 16));

    if (sortedIds.length === 0) {
        noMessagesPlaceholder.style.display = 'block';
        return;
    }
    noMessagesPlaceholder.style.display = 'none';

    sortedIds.forEach(id => {
        const count = stats[id];
        const row = messageTableBody.insertRow();
        const msgObj= CanConstants.get(parseInt(id));
        // console.log(msgObj["name"]  );
        row.insertCell().textContent = msgObj["name"];
        row.insertCell().textContent = id;
        row.insertCell().textContent = count;
    });
}

function updateFilteredMessagesLog(log) {
    filteredMessagesTableBody.innerHTML = '';

    if (!log || log.length === 0) {
        noFilteredMessagesPlaceholder.style.display = 'block';
        return;
    }
    noFilteredMessagesPlaceholder.style.display = 'none';

    // Display messages as received (server sends them oldest in log to newest)
    // If newest first is desired, reverse here: log.slice().reverse().forEach(...)
    log.forEach(entry => {
        const row = filteredMessagesTableBody.insertRow();
        row.insertCell().textContent = entry.id;
        row.insertCell().textContent = entry.txid;
        row.insertCell().textContent = entry.data;
    });
}

// Initial connection attempt & UI setup
connectWebSocket();
updateMessageTable({}); // Initialize general stats table
updateFilteredMessagesLog([]); // Initialize filtered log table
