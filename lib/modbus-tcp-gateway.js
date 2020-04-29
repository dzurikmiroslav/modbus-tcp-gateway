'use strict';

const net = require('net');

module.exports = (options) => {
    const dtuCodeReg = options.dtuCodePattern ? new RegExp(options.dtuCodePattern) : null;

    let dtuSocket = null;
    let modbusSocket = null;

    function setDtuSocket(socket) {
        dtuSocket = socket;
        dtuSocket.on('close', socket => {
            dtuSocket = null;
            console.log('DTU disconnected');
        });
        dtuSocket.on('data', data => {
            if (modbusSocket) {
                if (options.debug) {
                    console.debug('DTU -> MODBUS:', data.toString('hex'));
                }
                modbusSocket.write(data);
            } else {
                console.warn('DTU try to write, but no MODBUS connection available');
            }
        });
    }

    function setModbusSocket(socket) {
        modbusSocket = socket;
        modbusSocket.on('close', socket => {
            modbusSocket = null;
            console.log('MODBUS disconnected');
        });
        modbusSocket.on('data', data => {
            if (dtuSocket) {
                if (options.debug) {
                    console.debug('MODBUS -> DTU:', data.toString('hex'));
                }
                dtuSocket.write(data);
            } else {
                console.warn('MODBUS try to write, but no DTU connection available');
                const response = buildError(data);
                if (options.debug) {
                    console.debug('MODBUS -> ...:', data.toString('hex'));
                    console.debug('... -> MODBUS:', response.toString('hex'));
                }
                modbusSocket.write(response);
            }
        });
    }

    function validate(data) {
        return data.readUInt16BE(2) === 0x0 //is modbus
            && data.readUInt16BE(4) + 6 == data.length;
    }

    function buildError(data) {
        const resp = Buffer.alloc(9);
        data.copy(resp, 0, 0, 7); // copy firsty 7 bytes
        resp.writeUInt16BE(0x03, 4); // update lengt
        resp.writeUInt8(data.readUInt8(7) + 0x80, 7) // write operation
        resp.writeUInt8(0x0A, 8); // write error code
        return resp;
    }

    const dtuServer = net.createServer(socket => {
        console.debug('New DTU connection from', socket.remoteAddress);
        if (dtuSocket) {
            console.error('Already have DTU connection');
            socket.end();
        } else {
            if (dtuCodeReg) {
                let paired = false;
                let timeoutId = setTimeout(() => {
                    if (!paired) {
                        console.warn('DTU code timeout');
                        socket.end();
                    }
                }, options.dtuCodeTimeout);
                socket.once('data', data => {
                        clearTimeout(timeoutId);
                        const code = data.toString('utf8');
                        if (dtuCodeReg.test(code)) {
                            console.info('Successfully connected DTU');
                            setDtuSocket(socket);
                            paired = true;
                        } else {
                            console.warn('DTU send wrong code');
                            socket.end();
                        }
                    }
                );

            } else {
                console.info('Successfully connected DTU');
                setDtuSocket(socket);
            }
        }
    });

    const modbusServer = net.createServer(socket => {
        setTimeout(() => {
            console.debug('New MODBUS connection from', socket.remoteAddress);
            if (modbusSocket) {
                console.error('Already have MODBUS connection');
                socket.end();
            } else {
                setModbusSocket(socket);
            }
        }, 100);
    });

    dtuServer.listen({
        host: options.dtuHost,
        port: options.dtuPort
    }, () => {
        console.log('Opened DTU server on', dtuServer.address());
    });

    modbusServer.listen({
        host: options.modbusHost,
        port: options.modbusPort
    }, () => {
        console.log('Opened MODBUS server on', modbusServer.address());
    });

    return {
        dtuServer, modbusServer
    };
};