const PORT = 5000;
const HOST = '127.0.0.1';
//const HOST = '192.168.10.231';

var net = require('net');

var client = new net.Socket();
client.on('error', err => console.log(err));
client.on('close', () => console.log('Connection closed'));


client.on('data', (data) => {
    console.log('Received: ' + data);
    console.log(procResponse(data));

    //console.log(procResponse(Buffer.from([0x21, 0x01, 0x00, 0x00, 0x04, 0x01, 0x19, 0x02, 0x3E]))); // Response from power state command
});
client.connect(PORT, HOST, () => {
    console.log('Connected.');

    var message = buildCommand(0x01, [0xAC, 0x0D, 0x00, 0x00, 0x00]) // Input of TV-ID 1 to HDMI 1
    //var message = buildCommand(0x01, [0xAC, 0x06, 0x00, 0x00, 0x00]) // Input of TV-ID 1 to HDMI 2
    console.log(message);

    client.write(message);
});


function xor_array(arr) {
    return arr.reduce((a,c) => a ^= c);
}
function buildCommand(id, data) {
    let packet = [0xA6, id, 0x00, 0x00, 0x00, data.length + 2, 0x01];
    packet = packet.concat(data);
    packet.push(xor_array(packet)); // XOR of all previous bytes in array

    return Buffer.from(packet);
}
function procResponse(buf) {
    // Extract array from Buffer
    let arr = [];
    for (let i = 0; i < buf.length -1; i++) {
        arr.push(buf.readUInt8(i));
    }
    let checksum = buf.readUInt8(buf.length - 1); // Last byte

    // Check checksum
    if (checksum != xor_array(arr)) {
        return null; // null or throw Error?
    }

    // Check header
    if (arr[0] != 0x21) {
        return null;
    }

    // Check correct length
    if (arr[4] != buf.length - 5) {
        return null;
    }

    // At this point no errors occoured
    return {
        id: arr[1],
        cmd: arr[6],
        data: arr.slice(7)
    }
}

