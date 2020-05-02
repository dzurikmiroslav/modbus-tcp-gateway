/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

const assert = require('assert');
const net = require('net');
const stream = require('stream');
const modbusTcpGateway = require('../lib/modbus-tcp-gateway');
const transforms = require('../lib/transforms')

const options = {
    modbusHost: 'localhost',
    modbusPort: 10502,
    dtuHost: 'localhost',
    dtuPort: 11502,
    dtuCodePattern: '7CA5D4033591 \\w+',
    dtuCodeTimeout: 1000,
    dtuResponseTimeout: 1000,
    debug: true
};
const encOptions = {
    modbusHost: 'localhost',
    modbusPort: 10502,
    dtuHost: 'localhost',
    dtuPort: 11502,
    dtuCodePattern: '7CA5D4033591 \\w+',
    dtuCodeTimeout: 1000,
    // dtuEncryption: 'des3',
    // dtuEncryptionKey: '000000000000000000000000',
    // dtuEncryptionIv: '00000000',
    dtuEncryption: 'aes',
    dtuEncryptionKey: '0000000000000000',
    dtuEncryptionIv: '0000000000000000',
    dtuResponseTimeout: 1000,
    debug: true
};


describe('plain comunication', function () {
    let gw, dtuClient, modbusClient;

    before(function () {
        gw = modbusTcpGateway(options);
    });

    after(function () {
        gw.dtuServer.close();
        gw.modbusServer.close();
    });

    beforeEach(function () {
        dtuClient = null;
        modbusClient = null;
    });

    afterEach(function () {
        if (dtuClient) dtuClient.end();
        if (modbusClient) modbusClient.end();
    });

    describe('dtu code timeout', function () {
        it('should disconnect dtu', function (done) {
            this.timeout(2000);
            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuClient.on('close', () => {
                done();
            });
        });
    });

    describe('dtu wrong code', function () {
        it('should disconnect dtu', function (done) {
            this.timeout(500);

            const dtuInput = new stream.PassThrough();
            dtuInput.write('aabbcc');

            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuInput.pipe(dtuClient);

            dtuClient.on('close', had_error => {
                done();
            });
        });
    });

    describe('modbus no dtu', function () {
        it('should receive error data', function (done) {
            this.timeout(2000);
            const request = Buffer.from('000100000006010120000001', 'hex');
            const error = Buffer.from('00010000000301810a', 'hex');

            const modbusInput = new stream.PassThrough();
            modbusInput.write(request);

            modbusClient = new net.Socket();
            modbusClient.connect(10502, 'localhost');
            modbusInput.pipe(modbusClient);

            modbusClient.pipe(new stream.Writable({
                write(chunk, encoding, callback) {
                    assert(chunk.compare(error) === 0);
                    done();
                }
            }));
        });
    });

    describe('modbus to dtu', function () {
        it('should send data from modbus to dtu', function (done) {
            this.timeout(2000);
            const request = Buffer.from('000100000006010120000001', 'hex');

            const dtuInput = new stream.PassThrough();
            dtuInput.write('7CA5D4033591 random2');

            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuInput.pipe(dtuClient);

            dtuClient.pipe(new stream.Writable({
                write(chunk, encoding, callback) {
                    assert(chunk.compare(request) === 0);
                    done();
                }
            }))

            const modbusInput = new stream.PassThrough();
            modbusInput.write(request);

            modbusClient = new net.Socket();
            modbusClient.connect(10502, 'localhost');
            modbusInput.pipe(modbusClient);
        });
    });

    describe('dtu to modbus', function () {
        it('should send data from dtu to modbus', function (done) {
            this.timeout(2000);
            const buffer = Buffer.from('000100000006010120000001', 'hex');

            const dtuInput = new stream.PassThrough();
            dtuInput.write('7CA5D4033591 random2');
            dtuInput.write(buffer);

            modbusClient = new net.Socket();
            modbusClient.connect(10502, 'localhost');
            modbusClient.pipe(new stream.Writable({
                write(chunk, encoding, callback) {
                    chunk.compare(buffer);
                    done();
                }
            }))

            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuInput.pipe(dtuClient);
        });
    });
});

describe('encrypted communication', function () {
    let gw, dtuClient, modbusClient;

    before(function () {
        gw = modbusTcpGateway(encOptions);
    });

    after(function () {
        gw.dtuServer.close();
        gw.modbusServer.close();
    });

    beforeEach(function () {
        dtuClient = null;
        modbusClient = null;
    });

    afterEach(function () {
        if (dtuClient) dtuClient.destroy();
        if (modbusClient) modbusClient.destroy();
    });

    describe('dtu code timeout', function () {
        it('should disconnect dtu', function (done) {
            this.timeout(2000);

            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuClient.on('close', () => {
                done();
            });
        });
    });

    describe('dtu wrong code', function () {
        it('should disconnect dtu', function (done) {
            this.timeout(500);

            const dtuInput = new stream.PassThrough();
            dtuInput.write(Buffer.from('WRONG CODE', 'utf8'));

            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuInput.pipe(transforms.getPadding(encOptions)).pipe(transforms.getCipher(encOptions)).pipe(dtuClient);

            dtuClient.on('close', had_error => {
                done();
            });
        });
    });

    describe('dtu unencrypted code', function () {
        it('should disconnect dtu', function (done) {
            this.timeout(500);

            const dtuInput = new stream.PassThrough();
            dtuInput.write(Buffer.from('WRONG CODE', 'utf8'));

            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuInput.pipe(transforms.getPadding(encOptions)).pipe(dtuClient);

            dtuClient.on('close', had_error => {
                done();
            });
        });
    });

    describe('modbus to dtu', function () {
        it('should send data from modbus to dtu', function (done) {
            this.timeout(2000);
            const request = Buffer.from('000100000006010120000001', 'hex');

            const dtuInput = new stream.PassThrough();
            dtuInput.write('7CA5D4033591 random2');

            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuInput.pipe(transforms.getPadding(encOptions)).pipe(transforms.getCipher(encOptions)).pipe(dtuClient);

            dtuClient.pipe(transforms.getDecipher(encOptions)).pipe(transforms.getModbusTrim()).pipe(new stream.Writable({
                write(chunk, encoding, callback) {
                    assert(chunk.compare(request) === 0);
                    done();
                }
            }))

            const modbusInput = new stream.PassThrough();
            modbusInput.write(request);

            modbusClient = new net.Socket();
            modbusClient.connect(10502, 'localhost');
            modbusInput.pipe(modbusClient);
        });
    });

    describe('dtu to modbus', function () {
        it('should send data from dtu to modbus', function (done) {
            this.timeout(2000);
            const buffer = Buffer.from('000100000006010120000001', 'hex');

            const dtuInput = new stream.PassThrough();
            dtuInput.write('7CA5D4033591 random2');
            dtuInput.write(buffer);

            modbusClient = new net.Socket();
            modbusClient.connect(10502, 'localhost');
            modbusClient.pipe(new stream.Writable({
                write(chunk, encoding, callback) {
                    chunk.compare(buffer);
                    done();
                }
            }))

            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuInput.pipe(transforms.getPadding(encOptions)).pipe(transforms.getCipher(encOptions)).pipe(dtuClient);
        });
    });
});
