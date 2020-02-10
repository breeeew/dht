import * as dgram from 'dgram';
import * as crypto from 'crypto';
import * as events from 'events';

function xor(a: Buffer, b: Buffer) {
    const length = Math.max(a.length, b.length);
    const buffer = Buffer.allocUnsafe(length);
  
    for (let i = 0; i < length; ++i) {
        buffer[i] = a[i] ^ b[i];
    }
  
    return buffer;
}

function distance(a: Buffer, b: Buffer) {
    return xor(a, b);
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

class KBucket {
    private maxContacts: number;
    private contacts: Array<Node>;
    
    constructor(options: IKBucketOptions) {
        this.maxContacts = options.maxContacts;
        this.contacts = [];
    }

    public async updateContact(contact: Node) {
        const current = this.contacts.find(c => c.nodeId === contact.nodeId);
        
        if (current) {
            this.moveToEnd(current);
            return;
        }

        if (this.contacts.length < this.maxContacts) {
            this.contacts.push(contact);
            return;
        }
        
        try {
            await this.pingFirst();
        } catch (e) {
            // TODO: separate timeout and other errors
            this.contacts.shift();
            this.contacts.push(contact);
        }
    }

    private async pingFirst() {
        const [first] = this.contacts;
        await first.ping();
    }

    private moveToEnd(contact: Node) {
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

        this.socket.on('message', async (msg, info) => {
            console.log(`${this.nodeId.toString('hex')} got: ${msg} ${info.address}:${info.port} -> ${this.socket.address().address}:${this.socket.address().port}`);
            try {
                const message: IRPCMessage = JSON.parse(msg.toString());
                if (message.type === 'PING') {
                    await this.pong(message.rpcId, info);
                    // TODO: should call updateContact here
                    return;
                }

                if (message.type === 'PONG') {
                    await this.receivePong(message.rpcId);
                    // TODO: should call updateContact here
                    return;
                }
            } catch (error) {
                console.error(error);
            }
        });
    }

    public async ping() {
        const rpcId = sha1(crypto.randomBytes(4).toString()).digest('hex');
        
        const promise = new Promise((res, rej) => {
            this.socket.send(JSON.stringify({
                type: 'PING',
                rpcId,
            }), (error) => {
                if (error) {
                    rej(error);
                } else {
                    this.rpcMap.set(rpcId, res);
                }
            });
        });

        // TTL is unspecified
        try {
            await timeout(promise, 3000);
        } finally {
            this.rpcMap.delete(rpcId);
        }
    }

    private async pong(rpcId: string, info: dgram.RemoteInfo) {
        this.socket.send(JSON.stringify({
            type: 'PONG',
            rpcId,
        }), info.port, info.address);
    }

    private receivePong(rpcId: string) {
        this.rpcMap.get(rpcId)?.();
    }
}

class DHT {
    private readonly kBucket: KBucket;
    private selfNode: Node;
    
    constructor(options?: DHTOptions) {
        this.kBucket = new KBucket({maxContacts: 20});
    }

    public listen(options: IListenOptions) {
        const socket = dgram.createSocket('udp4');
        socket.bind({port: options.port, address: options.address});
        this.selfNode = new Node({
            socket,
            nodeId: options.nodeId || sha1(crypto.randomBytes(4).toString()).digest(),
        });
    }

    public async join(options: IConnectOptions) {
        const socket = dgram.createSocket('udp4');
        socket.on('message', (msg, info) => {

        });
        await new Promise(res => {
            socket.connect(options.port, options.address, res);
        });

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
    ip: Buffer;
    port: Buffer;
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
