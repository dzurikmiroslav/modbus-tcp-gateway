/* global describe, it, before, after, beforeEach, afterEach */
'use strict';

const assert = require('assert');
const net = require('net');
const modbusTcpGateway = require('../lib/modbus-tcp-gateway');

const options = {
    modbusHost: 'localhost',
    modbusPort: 10502,
    dtuHost: 'localhost',
    dtuPort: 11502,
    dtuCodePattern: '7CA5D4033591 \\w+',
    dtuCodeTimeout: 1000,
    debug: true
};

describe('modbus-tcp-gateway', function () {
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
        it('should disconnect dtu for timeout', function (done) {
            this.timeout(2000);
            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuClient.on('close', () => {
                done();
            });
        });
    });

    describe('modbus no dtu', function () {
        it('should receive error data', function (done) {
            this.timeout(2000);
            const request = Buffer.from('000100000006010120000001', 'hex');
            const error = Buffer.from('00010000000301810a', 'hex');

            modbusClient = new net.Socket();
            modbusClient.connect(10502, 'localhost');
            modbusClient.once('connect', () => {
                modbusClient.write(request);
            });
            modbusClient.once('data', data => {
                console.log(data)
                assert(data.compare(error) === 0);
                done();
            });
        });
    });

    describe('modbus to dtu', function () {
        it('should send data from modbus to dtu', function (done) {
            this.timeout(2000);
            const buffer = Buffer.from('000100000006010120000001', 'hex');

            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuClient.once('connect', () => {
                dtuClient.write(Buffer.from('7CA5D4033591 random1', 'utf8'));
            });
            dtuClient.once('data', data => {
               assert(data.compare(buffer) === 0);
                done();
            });

            modbusClient = new net.Socket();
            modbusClient.connect(10502, 'localhost');
            modbusClient.once('connect', () => {
                modbusClient.write(buffer);
            });
        });
    });

    describe('dtu to modbus', function () {
        it('should send data from dtu to modbus', function (done) {
            this.timeout(2000);
            const buffer = Buffer.from('000100000006010120000001', 'hex');

            modbusClient = new net.Socket();
            modbusClient.connect(10502, 'localhost');
            modbusClient.once('data', data => {
                data.compare(buffer);
                done();
            });

            dtuClient = new net.Socket();
            dtuClient.connect(11502, 'localhost');
            dtuClient.once('connect', () => {
                dtuClient.write(Buffer.from('7CA5D4033591 random2', 'utf8'));
                setTimeout(() => dtuClient.write(buffer), 100);
            });
        });
    });
});