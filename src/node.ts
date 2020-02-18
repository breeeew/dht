import * as dgram from 'dgram';
import * as dht from 'kademlia';
import * as crypto from 'crypto';
import {Contacts} from './contacts';
import {sha1, makeContact, timeout} from './utils';

export class Node {
    private nodeId: Buffer;
    private socket: dgram.Socket;
    private contacts: Contacts;
    private rpcMap: Map<string, Function>;

    constructor(options?: INodeOptions) {
        this.socket = dgram.createSocket('udp4');
        this.rpcMap = new Map();

        this.contacts = options.contacts;
        this.socket.on('message', this.handleRPC);
    }

    public listen(options: dht.IListenOptions) {
        this.nodeId = options.nodeId;
        this.contacts.setMe(this.contact());

        return new Promise((res, rej) => {
            try {
                this.socket.bind({
                    port: options.port,
                    address: options.address,
                }, res);
            } catch (err) {
                rej(err);
            }
        });
    }

    private handleRPC = async (msg: Buffer, info: dgram.RemoteInfo) => {
        try {
            const me = this.contact();
            console.log(`${me.nodeId.toString('hex')} got: ${msg} ${info.address}:${info.port} -> ${me.ip}:${me.port}`);

            const message: dht.IRPCMessage = JSON.parse(msg.toString());
            const remoteContact = makeContact(message.nodeId, info);
            await this.contacts.addContacts(remoteContact);

            switch (message.type) {
                case 'REPLY':
                    await this.handleReply(message.rpcId, message.data);
                case 'PING':
                    await this.pong(message.rpcId, remoteContact);
                case 'STORE':
                    await this.contacts.store(message as dht.TStoreRPC, info);
                    await this.replyRPC(remoteContact, {rpcId: message.rpcId});
                case 'FIND_NODE':
                    const contacts = this.contacts.findNode(remoteContact.nodeId);
                    await this.sendNodes(message.rpcId, remoteContact, contacts);
                case 'FIND_VALUE':
                    const result = await this.contacts.findValue((message as dht.TFindValueRPC).data.key);
                    if (Array.isArray(result)) {
                        await this.sendNodes(message.rpcId, remoteContact, contacts);
                    } else {
                        await this.sendValue(message.rpcId, remoteContact, result);
                    }
                default:
                    // TODO: log, throw exception
                    return;
            }
        } catch (error) {
            console.error(error);
        }
    }

    public contact(): dht.IContact {
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

    public ping(contact: dht.IContact) {
        return this.callRPC('PING', contact);
    }

    public pong(rpcId: string, contact: dht.IContact) {
        return this.replyRPC(contact, {rpcId});
    }

    public sendNodes(rpcId: string, remoteContact: dht.IContact, contacts: Array<dht.IContact>) {
        return this.replyRPC<dht.IReplyFindNode>(remoteContact, {
            rpcId,
            data: {
                contacts,
            },
        });
    }

    public sendValue(rpcId: string, remoteContact: dht.IContact, result: string) {
        return this.replyRPC<typeof result>(remoteContact, {
            rpcId,
            data: result,
        });
    }

    public handleReply(rpcId: string, data: dht.IRPCMessage['data']) {
        this.rpcMap.get(rpcId)?.(data);
    }

    public async callRPC<T = void>(type: dht.TType, contact: dht.IContact, options: dht.IRPCOptions<T> = {}) {
        const rpcId = options.rpcId || sha1(crypto.randomBytes(4).toString()).digest('hex');

        const promise = new Promise((res, rej) => {
            const message = JSON.stringify({
                type,
                rpcId,
                data: options.data,
                nodeId: this.nodeId.toString('hex'),
            });

            this.socket.send(message, contact.port, contact.ip, (error) => {
                if (error) {
                    return rej(error);
                }

                this.rpcMap.set(rpcId, res);
            });
        });

        try {
            await timeout(promise, options.timeout ?? 30000);
        } finally {
            this.rpcMap.delete(rpcId);
        }
    }

    private replyRPC<T>(contact: dht.IContact, options: dht.IRPCOptions<T>) {
        return this.callRPC('REPLY', contact, options);
    }
}

interface INodeOptions {
    nodeId?: Buffer;
    contacts: Contacts;
}