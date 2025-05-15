// Import the socketcan module
const can = require('socketcan');

// --- Configuration ---
const canInterface = "can0"; // Change this to your CAN interface (e.g., 'can0', 'vcan0')
const storeReceivedMessages = true; // Set to true to store messages, false to only log them

// Object to store CAN messages, organized by ID
// Each key will be a message ID (in hex string format), and the value will be an array of messages
const receivedCanMessages = {};

// --- Create and Configure CAN Channel ---
let channel;
try {
    // Create a raw CAN channel
    // The second argument 'true' enables timestamps for messages
    channel = can.createRawChannel(canInterface, true);
} catch (error) {
    console.error(`Error creating CAN channel for interface ${canInterface}:`);
    console.error(error.message);
    console.error("Please ensure the CAN interface exists and is up, and that you have the necessary permissions.");
    console.error("For virtual CAN, try: sudo modprobe vcan && sudo ip link add dev vcan0 type vcan && sudo ip link set up vcan0");
    process.exit(1); // Exit if channel creation fails
}

// --- Listener for Incoming CAN Messages ---
channel.addListener("onMessage", (msg) => {
    // msg object typically contains:
    // msg.id (number): The CAN ID
    // msg.data (Buffer): The message data
    // msg.dlc (number): Data Length Code
    // msg.ext (boolean): Extended frame flag
    // msg.rtr (boolean): Remote Transmission Request flag
    // msg.ts_sec (number): Timestamp in seconds (if enabled in createRawChannel)
    // msg.ts_usec (number): Timestamp microseconds part (if enabled)

    const messageIdHex = `0x${msg.id.toString(16).toUpperCase()}`;
    const messageDataHex = msg.data.toString('hex').toUpperCase();
    const timestamp = msg.ts_sec !== undefined && msg.ts_usec !== undefined
        ? `${msg.ts_sec}.${String(msg.ts_usec).padStart(6, '0')}`
        : 'N/A';

    console.log(`Received CAN Message:
  ID: ${messageIdHex}
  DLC: ${msg.dlc}
  Data: ${messageDataHex}
  Extended: ${msg.ext}
  RTR: ${msg.rtr}
  Timestamp: ${timestamp}s`);

    if (storeReceivedMessages) {
        // If this is the first message for this ID, create an array for it
        if (!receivedCanMessages[messageIdHex]) {
            receivedCanMessages[messageIdHex] = [];
        }

        // Store the relevant parts of the message. You can customize what you store.
        const storedMessage = {
            data: msg.data, // Store as Buffer
            // dataHex: messageDataHex, // Optionally store as hex string
            dlc: msg.dlc,
            ext: msg.ext,
            rtr: msg.rtr,
            timestamp: parseFloat(timestamp) // Store timestamp as a number for potential sorting
        };
        receivedCanMessages[messageIdHex].push(storedMessage);

        // Optional: Log the current state of a specific ID's messages
        // console.log(`Messages for ID ${messageIdHex}:`, receivedCanMessages[messageIdHex]);
    }
});

// --- Start the CAN Channel ---
channel.start();
console.log(`Listening for CAN messages on ${canInterface}...`);
console.log(storeReceivedMessages ? "Incoming messages will be stored." : "Incoming messages will only be logged.");

// --- Graceful Shutdown and Displaying Stored Messages ---
function shutdown() {
    console.log("\nStopping CAN listener...");
    if (channel) {
        channel.stop();
    }

    if (storeReceivedMessages) {
        console.log("\n--- All Received CAN Messages (Organized by ID) ---");

        // Get the message IDs (keys of the object)
        const messageIds = Object.keys(receivedCanMessages);

        // Sort the message IDs. IDs are strings like "0x123", so a simple string sort works.
        // For numerical sorting of hex IDs, you'd convert them to numbers first.
        messageIds.sort((a, b) => {
            // Convert hex strings to numbers for proper numerical sorting
            return parseInt(a, 16) - parseInt(b, 16);
        });

        if (messageIds.length === 0) {
            console.log("No messages were received and stored.");
        } else {
            messageIds.forEach(id => {
                console.log(`\nID: ${id}`);
                const messagesForId = receivedCanMessages[id];
                messagesForId.forEach((msgEntry, index) => {
                    console.log(`  Message ${index + 1}:`);
                    console.log(`    Data: ${msgEntry.data.toString('hex').toUpperCase()}`);
                    console.log(`    DLC: ${msgEntry.dlc}`);
                    console.log(`    Timestamp: ${msgEntry.timestamp}s`);
                    // Add other properties if needed
                });
            });
        }
    }
    process.exit(0);
}

// Listen for SIGINT (Ctrl+C) to gracefully shut down
process.on('SIGINT', shutdown);

// Keep the script running
// You might want to add a timeout or other condition for stopping in a real application
// For this example, it runs until Ctrl+C is pressed.
setInterval(() => {
    // This empty interval keeps the Node.js event loop active.
    // In a more complex application, you might have other tasks running.
}, 1000 * 60 * 60); // Keep alive for a long time