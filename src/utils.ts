import {HASH_SIZE} from './constants';
import {createHash, BinaryLike} from 'crypto';
import {RemoteInfo} from 'dgram';
import * as dht from 'kademlia';

export function xor(a: Buffer, b: Buffer) {
    const length = Math.max(a.length, b.length);
    const buffer = Buffer.allocUnsafe(length);

    for (let i = 0; i < length; ++i) {
        buffer[i] = a[i] ^ b[i];
    }

    return buffer;
}

export function bucketIndex(a: Buffer, b: Buffer) {
    const d = xor(a, b);
    let B = HASH_SIZE;

    for (let i = 0; i < d.length; i++) {
        if (d[i] == 0) {
            B -= 8;
            continue;
        }

        for (let j = 0; j < 8; j++) {
            if (d[i] & (0x80 >> j)) {
                return --B;
            }

            B--;
        }
    }

    return B;
}

export function timeout(promise: Promise<unknown>, ttl: number) {
    const timeoutPromise = new Promise((_, rej) => {
        setTimeout(() => rej(new Error('timeout')), ttl);
    });

    return Promise.race([
        promise,
        timeoutPromise,
    ]);
}

export function sha1(str: BinaryLike) {
    return createHash('sha1').update(str);
}

export function makeContact(hexNodeId: string, info: RemoteInfo): dht.IContact {
    return {
        nodeId: Buffer.from(hexNodeId, 'hex'),
        ip: info.address,
        port: info.port,
    }
}
