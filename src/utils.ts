import {HASH_SIZE} from './constants';
import {createHash, BinaryLike} from 'crypto';
import {RemoteInfo} from 'dgram';
import {kademlia} from './kademlia';

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

export function timeout<R = unknown>(promise: Promise<R>, ttl: number, error?: Error): Promise<never | R> {
    const timeoutPromise = new Promise<R>((_, rej) => {
        setTimeout(() => rej(error ?? new Error('timeout')), ttl);
    });

    return Promise.race([
        promise,
        timeoutPromise,
    ]);
}

export function sha1(str: BinaryLike) {
    return createHash('sha1').update(str);
}

export function makeContact(hexNodeId: string, info: RemoteInfo): kademlia.IContact {
    return {
        nodeId: Buffer.from(hexNodeId, 'hex'),
        ip: info.address,
        port: info.port,
    }
}

export function chunk<T = any>(arr: T[], count: number): T[][] {
    const result: T[][] = [];
    const resultLength = Math.ceil(arr.length / count);

    for (let i = 0; i < resultLength; i++) {
        const index = i * count;
        const current = arr.slice(index, index + count);
        result.push(current);
    }

    return result;
}
