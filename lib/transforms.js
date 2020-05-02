'use strict';

const stream = require('stream');
const crypto = require('crypto');

/**
 * Remove zero bytes after modbus packet
 * DTU should has this functionality...
 */
function getModbusTrim() {
    return new stream.Transform({
        transform(chunk, encoding, callback) {
            if (chunk.readUInt16BE(2) === 0x0) {
                //is modbus
                const dataLen = chunk.readUInt16BE(4);
                chunk = chunk.slice(0, dataLen + 6);
            }
            callback(null, chunk);
        }
    });
}

function getDecipher(options) {
    let decipher;
    switch (options.dtuEncryption) {
        case 'aes':
            decipher = crypto.createDecipheriv('aes-128-cbc', options.dtuEncryptionKey, options.dtuEncryptionIv);
            break;
        case 'des3':
            decipher = crypto.createDecipheriv('des3', options.dtuEncryptionKey, options.dtuEncryptionIv);
            break;
    }
    decipher.setAutoPadding(false);
    return decipher;
}

function getCipher(options) {
    let cipher;
    switch (options.dtuEncryption) {
        case 'aes':
            cipher = crypto.createCipheriv('aes-128-cbc', options.dtuEncryptionKey, options.dtuEncryptionIv);
            break;
        case 'des3':
            cipher = crypto.createCipheriv('des3', options.dtuEncryptionKey, options.dtuEncryptionIv);
            break;
    }
    cipher.setAutoPadding(false);
    return cipher;
}

function getPadding(options) {
    let blockSize;
    switch (options.dtuEncryption) {
        case 'aes':
            blockSize = 32;
            break;
        case 'des3':
            blockSize = 8;
            break;
    }

    return new stream.Transform({
        transform(chunk, encoding, callback) {
            if (chunk.length % blockSize) {
                const aligned = Buffer.alloc(chunk.length + blockSize - chunk.length % blockSize, 0);
                chunk.copy(aligned, 0);
                chunk = aligned;
            }
            callback(null, chunk);
        }
    })
}

module.exports.getModbusTrim = getModbusTrim;
module.exports.getDecipher = getDecipher;
module.exports.getCipher = getCipher;
module.exports.getPadding = getPadding;