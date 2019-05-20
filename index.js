#!/usr/bin/env node

const pkg = require('./package.json');
const log = require('yalm');
const config = require('yargs')
    .env('SICP')
    .usage(pkg.name + ' ' + pkg.version + '\n' + pkg.description + '\n\nUsage: $0 [options]')
    .describe('verbosity', 'possible values: "error", "warn", "info", "debug"')
    .describe('name', 'instance name. used as mqtt client id and as prefix for connected topic')
    .describe('mqtt-url', 'mqtt broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url')
    .describe('polling-interval', 'polling interval (in ms) for status updates')
    .describe('tv-address', 'IP address of TV')
    .describe('tv-port', 'Port used for LAN -> RS232 bridge')
    .describe('tv-id', 'ID set on TV')
    .describe('tv-name', 'Friendly name used for MQTT topics. If not specified IP-Address will be used.')
    .alias({
        h: 'help',
        m: 'mqtt-url',
        b: 'bridge-address',
        u: 'bridge-username',
        v: 'verbosity'
    })
    .default({
        name: 'scip',
        'mqtt-url': 'mqtt://127.0.0.1',
        'polling-interval': 3000,
        'tv-port': 5000,
        'tv-id': 0
    })
    .demandOption([
        'tv-address'
    ])
    .version()
    .help('help')
    .argv;
const MqttSmarthome = require('mqtt-smarthome-connect');
const Yatl = require('yetanothertimerlibrary');
const net = require('net');
const client = new net.Socket();

const cmdlist = {
    power: {
        set: 0x18,
        get: 0x19,
        on: 0x02,
        off: 0x01
    },
    input: {
        set: 0xAC,
        get: 0xAD,
        sources: {
            'HDMI1': 0x0D,
            'HDMI2': 0x06,
            'DVI': 0x0E,
            'BROWSER': 0x10
        }
    }
};

log.setLevel(config.verbosity);
log.info(pkg.name + ' ' + pkg.version + ' starting');
log.debug('loaded config: ', config);

log.info('mqtt trying to connect', config.mqttUrl);
const mqtt = new MqttSmarthome(config.mqttUrl, {
    logger: log,
    will: {topic: config.name+'/maintenance/'+(config.tvName||config.tvAddress)+'/online', payload: 'false', retain: true}
});
mqtt.connect();

client.connect(config.tvPort, config.tvAddress, () => {
    log.debug('Connected');
});
client.on('error', (err) => {
    log.error('client error', err); //TODO: Actual error handling with reconnect etc.
});

mqtt.on('connect', () => {
    log.info('mqtt connected', config.mqttUrl);
    mqtt.publish(config.name+'/maintenance/'+(config.tvName||config.tvAddress)+'/online', true, {retain: true});
});

// Polling status
var polling = new Yatl.Timer(() => {
    //TODO: better way of sequentially polling information with a little bit of time in between 
    setTimeout(() => {
        sendBuffer(buildCommand(config.tvId, [cmdlist.power.get]));
    }, 100);
    setTimeout(() => {
        sendBuffer(buildCommand(config.tvId, [cmdlist.input.get]));
    }, 200);
}).start(config.pollingInterval);

client.on('data', (msg) => {
    let res = procResponse(msg);
    if (!res) return;

    // Power
    if (res.cmd == cmdlist.power.get) {
        mqtt.publish(
            config.name+'/status/'+(config.tvName||config.tvAddress)+'/power', 
            res.data[0] == cmdlist.power.on
        );
    }

    // Input
    if (res.cmd == cmdlist.input.get) {
        mqtt.publish(
            config.name+'/status/'+(config.tvName||config.tvAddress)+'/input', 
            getKeyByValue(cmdlist.input.sources, res.data[0])
        );
    }
});

// MQTT Callback: 'root' topic
mqtt.subscribe(config.name+'/set/'+(config.tvName||config.tvAddress), (topic, message) => {
    // Message must be an JSON array where each element contains one byte of data
    sendBuffer(buildCommand(config.tvId, message));
});

// MQTT Callback: /power
mqtt.subscribe(config.name+'/set/'+(config.tvName||config.tvAddress)+'/power', (topic, message) => {
    sendBuffer(buildCommand(config.tvId, [
        cmdlist.power.set, 
        message ? cmdlist.power.on : cmdlist.power.off
    ]));
});

// MQTT Callback: /input
mqtt.subscribe(config.name+'/set/'+(config.tvName||config.tvAddress)+'/input', (topic, message) => {
    sendBuffer(buildCommand(config.tvId, [
        cmdlist.input.set, 
        cmdlist.input.sources[message], //TODO: Check if message is valid
        0x00,
        0x00,
        0x00
    ]));
});

// Helper functions
function xor_array(array) {
    return array.reduce((accumulator, currentValue) => accumulator ^= currentValue);
}
function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}
function sendBuffer(buffer) {
    client.write(buffer, (err) => {
        if (err) {
            log.error(err);
        } else {
            log.debug('sent >', buffer);
        }
    });
}

// TV-related functions
function buildCommand(id, data) {
    let packet = [0xA6, id, 0x00, 0x00, 0x00, data.length + 2, 0x01];
    packet = packet.concat(data);
    packet.push(xor_array(packet)); // Add XOR of all previous bytes of the array to the end of the array

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
    if (arr[0] != 0x21) { // According to RS232C_commands_doc_LExx40UHS.pdf every response begins with 0x21 as 1st byte
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
