import * as dgram from 'dgram';
import * as crypto from 'crypto';
import * as events from 'events';

const HASH_SIZE = 160;
const K_BUCKET_SIZE = 20;

function xor(a: Buffer, b: Buffer) {
    const length = Math.max(a.length, b.length);
    const buffer = Buffer.allocUnsafe(length);

    for (let i = 0; i < length; ++i) {
        buffer[i] = a[i] ^ b[i];
    }

    return buffer;
}

function distance(a: Buffer, b: Buffer) {
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

function timeout(promise: Promise<unknown>, ttl: number) {
    const timeoutPromise = new Promise((_, rej) => {
        setTimeout(() => rej(new Error('timeout')), ttl);
    });

    return Promise.race([
        promise,
        timeoutPromise,
    ]);
}

class KBucket extends events.EventEmitter {
    private readonly maxContacts: number;
    private readonly node: Node;
    private contacts: Array<IContact>;

    constructor(options: IKBucketOptions) {
        super();
        this.maxContacts = options.maxContacts;
        this.contacts = [];
    }

    public async updateContact(contact: IContact) {
        const current = this.contacts.find(c => c.nodeId.equals(contact.nodeId));

        if (current) {
            this.moveToEnd(current);
            return;
        }

        if (this.contacts.length < this.maxContacts) {
            this.contacts.push(contact);
            return;
        }

        try {
            await this.node.ping(this.contacts[0]);
        } catch (e) {
            // TODO: separate timeout and other errors
            this.contacts.shift();
            this.contacts.push(contact);
        }
    }

    private moveToEnd(contact: IContact) {
        this.contacts = [
            ...this.contacts.filter(c => c !== contact),
            contact,
        ];
    }
}

class Node extends events.EventEmitter {
    public readonly nodeId: Buffer;
    private socket: dgram.Socket;
    private rpcMap: Map<string, Function>;

    constructor(options: INodeOptions) {
        super();

        this.nodeId = options.nodeId;
        this.socket = options.socket;
        this.rpcMap = new Map();

        this.socket.on('message', (msg: Buffer, info: dgram.RemoteInfo) => {
            this.emit('message', msg, info);
        });
    }

    public contact(): IContact {
        const address = this.socket.address();

        return {
            nodeId: this.nodeId,
            ip: address.address,
            port: address.port,
        };
    }

    public close() {
        this.socket.removeAllListeners('message');
        this.socket.close();
    }

    public async ping(contact: IContact) {
        const rpcId = sha1(crypto.randomBytes(4).toString()).digest('hex');

        const promise = new Promise((res, rej) => {
            const message = JSON.stringify({
                type: 'PING',
                rpcId,
                nodeId: this.nodeId.toString('hex'),
            });

            this.socket.send(message, contact.port, contact.ip, (error) => {
                if (error) {
                    return rej(error);
                }

                this.rpcMap.set(rpcId, res);
            });
        });

        // TTL is unspecified
        try {
            await timeout(promise, 3000);
        } finally {
            this.rpcMap.delete(rpcId);
        }
    }

    public async pong(rpcId: string, info: dgram.RemoteInfo) {
        return new Promise((res, rej) => {
            this.socket.send(JSON.stringify({
                type: 'PONG',
                rpcId,
            }), info.port, info.address, (error, bytes) => {
                if (error) {
                    return rej(error);
                }

                res(bytes);
            });
        });
    }

    public receivePong(rpcId: string) {
        this.rpcMap.get(rpcId)?.();
    }
}

class DHT {
    private readonly buckets: Map<number, KBucket>;
    private node: Node;

    constructor(options?: DHTOptions) {
        this.buckets = new Map();
    }

    public listen(options: IListenOptions) {
        const socket = dgram.createSocket('udp4');
        socket.bind({port: options.port, address: options.address});
        this.node = new Node({
            socket,
            nodeId: options.nodeId || sha1(crypto.randomBytes(4).toString()).digest(),
        });

        this.node.on('message', this.handleRPC);
    }

    public async join(options: IConnectOptions) {
        const socket = dgram.createSocket('udp4');
        socket.on('message', (msg, info) => {

        });
        await new Promise(res => {
            socket.connect(options.port, options.address, res);
        });
    }

    private getBucket(contact: IContact) {
        const index = distance(this.node.contact().nodeId, contact.nodeId);

        if (!this.buckets.has(index)) {
            const bucket = new KBucket({
                maxContacts: K_BUCKET_SIZE,
            });

            this.buckets.set(index, bucket);
        }

        return this.buckets.get(index);
    }

    private handleRPC = async (msg: Buffer, info: dgram.RemoteInfo) => {
        try {
            const contact = this.node.contact();
            console.log(`${contact.nodeId.toString('hex')} got: ${msg} ${info.address}:${info.port} -> ${contact.ip}:${contact.port}`);

            const message: IRPCMessage = JSON.parse(msg.toString());
            const remoteContact = {
                nodeId: Buffer.from(message.nodeId, 'hex'),
                ip: info.address,
                port: info.port,
            };

            await this.getBucket(remoteContact).updateContact(remoteContact);

            if (message.type === 'PING') {
                await this.node.pong(message.rpcId, info);
                return;
            }

            if (message.type === 'PONG') {
                await this.node.receivePong(message.rpcId);
                return;
            }
        } catch (error) {
            console.error(error);
        }
    }
}

function sha1(str: string) {
    return crypto.createHash('sha1').update(str);
}

async function main() {
    const socket = dgram.createSocket('udp4');
    socket.bind({port: 12344, address: '127.0.0.1'});

    const dht = new DHT();
    dht.listen({
        port: 1234,
    });

    // TODO: implement JOIN
    // dht.join();
}

main();

interface INodeOptions {
    nodeId: Buffer;
    socket: dgram.Socket;
}

interface IContact {
    ip: string;
    port: number;
    nodeId: Buffer;
}

interface IKBucketOptions {
    maxContacts: number;
}

interface DHTOptions {

}

interface IRPCMessage {
    type: TType;
    rpcId: string;
    nodeId: string;
}

interface IListenOptions {
    port: number;
    address?: string;
    nodeId?: Buffer;
}

interface IConnectOptions {
    port: number;
    address?: string;
}

type TType = 'PING' | 'PONG';
