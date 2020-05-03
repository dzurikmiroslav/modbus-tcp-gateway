'use strict';

const net = require('net');
const stream = require('stream');
const transforms = require('./transforms');

module.exports = (options) => {
    const dtuCodeReg = options.dtuCodePattern ? new RegExp(options.dtuCodePattern) : null;

    // function validate(data) {
    //     return data.readUInt16BE(2) === 0x0 //is modbus
    //         && data.readUInt16BE(4) + 6 == data.length;
    // }

    function buildTimeoutError(data) {
        const resp = Buffer.alloc(9);
        data.copy(resp, 0, 0, 7); // copy firsty 7 bytes
        resp.writeUInt16BE(0x03, 4); // update lengt
        resp.writeUInt8(data.readUInt8(7) + 0x80, 7) // write operation
        resp.writeUInt8(0x0A, 8); // write error code
        return resp;
    }

    const toDtu = new stream.PassThrough();
    const fromDtu = new stream.PassThrough();

    if (options.debug) {
        toDtu.pipe(new stream.Writable({
            write(chunk, encoding, callback) {
                console.debug('To DTU', chunk.toString('hex'));
                callback();
            }
        }));
        fromDtu.pipe(new stream.Writable({
            write(chunk, encoding, callback) {
                console.debug('From DTU', chunk.toString('hex'));
                callback();
            }
        }));
    } else {
        //must be at least one consumer, to prevent after pipe emit all received data before
        const writable = new stream.Writable({
            write(chunk, encoding, callback) {
                callback();
            }
        });
        toDtu.pipe(writable);
        fromDtu.pipe(writable);
    }

    function pipeDtuSocket(socket) {
        if (options.dtuEncryption) {
            toDtu.pipe(transforms.getPadding(options))
                .pipe(transforms.getCipher(options))
                .pipe(socket);
            socket.pipe(transforms.getDecipher(options))
                .pipe(transforms.getModbusTrim())
                .pipe(fromDtu, {end: false});
        } else {
            toDtu.pipe(socket);
            socket.pipe(fromDtu, {end: false});
        }
    }

    function pipeModbusSocket(socket) {
        let timeoutId = 0;

        socket.pipe(new stream.Transform({
            transform(chunk, encoding, callback) {
                timeoutId = setTimeout(() => {
                    fromDtu.write(buildTimeoutError(chunk));
                }, options.dtuResponseTimeout);
                callback(null, chunk);
            }
        }))
            .pipe(toDtu, {end: false});

        fromDtu.pipe(new stream.Transform({
            transform(chunk, encoding, callback) {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = 0;
                }
                callback(null, chunk);
            }
        }))
            .pipe(socket);
    }

    const dtuServer = net.createServer(socket => {
        console.debug('New DTU connection from', socket.remoteAddress, socket.remotePort);
        socket.on('close', had_error => {
            console.debug('DTU connection closed', socket.remoteAddress, socket.remotePort)
        });
        socket.on('error', err => {
            console.error('DTU socket error', err);
            socket.destroy(err);
        })
        if (dtuCodeReg) {
            socket.setTimeout(options.dtuCodeTimeout, () => {
                console.warn('DTU code timeout');
                socket.end();
            });
            (options.dtuEncryption ? socket.pipe(transforms.getDecipher(options)) : socket).pipe(new stream.Writable({
                write(chunk, encoding, callback) {
                    socket.unpipe();
                    if (options.debug) {
                        console.debug('DTU send registration payload:', chunk.toString('hex'));
                    }
                    if (dtuCodeReg.test(chunk)) {
                        console.info('Successfully connected DTU');
                        socket.setTimeout(0);
                        pipeDtuSocket(socket);
                    } else {
                        console.warn('DTU send wrong code');
                        socket.end();
                    }
                    callback();
                }
            }));
        } else {
            pipeDtuSocket(socket);
        }
    });

    const modbusServer = net.createServer(socket => {
        console.debug('New MODBUS connection from', socket.remoteAddress, socket.remotePort);
        socket.on('close', had_error => {
            console.debug('MODBUS connection closed', socket.remoteAddress, socket.remotePort);
        });
        socket.on('error', err => {
            console.error('MODBUS socket error', err);
        })
        pipeModbusSocket(socket);
    });

    dtuServer.listen({
        host: options.dtuHost,
        port: options.dtuPort
    }, () => {
        console.log('Opened DTU server on', dtuServer.address());
    });
    dtuServer.on('error', err => {
        console.error('DTU server error', err);
    });

    modbusServer.listen({
        host: options.modbusHost,
        port: options.modbusPort
    }, () => {
        console.log('Opened MODBUS server on', modbusServer.address());
    });
    modbusServer.on('error', err => {
        console.error('MODBUS server error', err);
    });

    return {
        dtuServer, modbusServer
    };
};