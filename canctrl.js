const Koa = require('koa');
const app = new Koa();
const can = require('socketcan');


app.use(async ctx => {
  ctx.body = 'Hello World';
});

app.listen(8080);

// Create a channel for can0
const channel = can.createRawChannel('can0', true);

// Listen for incoming CAN frames
channel.addListener("onMessage", (msg) => {
    console.log(`Received CAN message: ID=${msg.id.toString(16)} Data=${msg.data.toString('hex')}`);
});

// Start the channel
channel.start();

// Send a CAN message
/* const message = {
    id: 0x123, // CAN ID
    data: Buffer.from([0x01, 0x02, 0x03, 0x04]) // CAN payload
};
channel.send(message);

console.log("CAN message sent!");
 */