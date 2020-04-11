import * as dgram from 'dgram';
import * as crypto from 'crypto';
import {Contacts} from './contacts';
import {sha1, makeContact, timeout} from './utils';
import {kademlia} from './kademlia';

export class Node {
    private nodeId: Buffer;
    private socket: dgram.Socket;
    private contacts: Contacts;
    private rpcMap: Map<string, {resolve: Function, type: kademlia.TType}>;

    constructor(options?: INodeOptions) {
        this.socket = dgram.createSocket('udp4');
        this.rpcMap = new Map();

        this.contacts = options.contacts;
        this.socket.on('message', this.handleRPC);
    }

    public listen(options: kademlia.IListenOptions) {
        this.nodeId = options.nodeId;
        return new Promise((res, rej) => {
            try {
                this.socket.bind({
                    port: options.port,
                    address: options.address,
                }, () => {
                    this.contacts.setMe(this.contact());
                    res();
                });
            } catch (err) {
                rej(err);
            }
        });
    }

    private handleRPC = async (msg: Buffer, info: dgram.RemoteInfo) => {
        try {
            const me = this.contact();
            // console.log(`${me.nodeId.toString('hex')} got: ${msg} ${info.address}:${info.port} -> ${me.ip}:${me.port}`);

            const message: kademlia.IRPCMessage<unknown> = JSON.parse(msg.toString());
            const remoteContact = makeContact(message.nodeId, info);
            await this.contacts.addContacts(remoteContact);

            switch (message.type) {
                case 'REPLY':
                    await this.handleReply(message.rpcId, (message as kademlia.IRPCMessage<'REPLY'>).data);
                    break;
                case 'PING':
                    await this.pong(message.rpcId, remoteContact);
                    break;
                case 'STORE':
                    await this.contacts.store(message as kademlia.TStoreRPC, info);
                    await this.replyRPC(remoteContact, {rpcId: message.rpcId});
                    break;
                case 'FIND_NODE':
                    const contacts = this.contacts.findNode(remoteContact.nodeId);
                    await this.sendNodes(message.rpcId, remoteContact, contacts);
                    break;
                case 'FIND_VALUE':
                    const result = await this.contacts.findValue((message as kademlia.TFindValueRPC).data.key);
                    if (Array.isArray(result)) {
                        await this.sendNodes(message.rpcId, remoteContact, result);
                    } else {
                        await this.sendValue(message.rpcId, remoteContact, result);
                    }
                    break;
                default:
                    // TODO: log, throw exception
                    return;
            }
        } catch (error) {
            console.error(error);
        }
    }

    public contact(): kademlia.IContact {
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

    public ping(contact: kademlia.IContact) {
        return this.callRPC('PING', contact);
    }

    public pong(rpcId: string, contact: kademlia.IContact) {
        return this.replyRPC(contact, {rpcId});
    }

    public sendNodes(rpcId: string, remoteContact: kademlia.IContact, contacts: Array<kademlia.IContact>) {
        return this.replyRPC<kademlia.IReplyFindNode>(remoteContact, {
            rpcId,
            data: {
                contacts,
            },
        });
    }

    public sendValue(rpcId: string, remoteContact: kademlia.IContact, result: string) {
        return this.replyRPC<typeof result>(remoteContact, {
            rpcId,
            data: result,
        });
    }

    public handleReply(rpcId: string, data: kademlia.IRPCMessage<unknown>['data']) {
        const rpc = this.rpcMap.get(rpcId);
        if (!rpc) {
            // Perhaps timed out
            return;
        }

        if (rpc.type === 'FIND_NODE') {
            const {contacts} = (data as kademlia.IRPCMessage<'FIND_NODE'>['data']);
            const result: Array<kademlia.IContact> = [];

            for (const contact of contacts) {
                result.push({
                    ...contact,
                    nodeId: Buffer.from(contact.nodeId.data),
                });
            }

            this.rpcMap.get(rpcId)?.resolve(data);
            return;
        }

        this.rpcMap.get(rpcId)?.resolve(data);
    }

    public async callRPC<T extends kademlia.TType>(
        type: kademlia.TType,
        contact: kademlia.IContact,
        options: kademlia.IRPCOptions<T> = {},
    ): Promise<kademlia.IResult[T]> {
        const rpcId = options.rpcId || sha1(crypto.randomBytes(4).toString()).digest('hex');

        const promise = new Promise<kademlia.IResult[T]>((resolve, reject) => {
            const message = JSON.stringify({
                type,
                rpcId,
                data: options.data,
                nodeId: this.nodeId.toString('hex'),
            });

            this.socket.send(message, contact.port, contact.ip, (error) => {
                if (error) {
                    return reject(error);
                }

                if (type === 'REPLY') {
                    // TODO: ACK?
                    resolve();
                } else {
                    this.rpcMap.set(rpcId, {
                        resolve,
                        type,
                    });
                }
            });
        });

        try {
            const error = new Error(`timeout error: ${type}`);
            Error.captureStackTrace(error);
            const result: kademlia.IResult[T] = await timeout(
                promise,
                options.timeout ?? 30000,
                error,
            );

            return result;
        } finally {
            this.rpcMap.delete(rpcId);
        }
    }

    private replyRPC<T>(contact: kademlia.IContact, options: kademlia.IRPCOptions<T>) {
        return this.callRPC<'REPLY'>('REPLY', contact, options);
    }
}

interface INodeOptions {
    nodeId?: Buffer;
    contacts: Contacts;
}
