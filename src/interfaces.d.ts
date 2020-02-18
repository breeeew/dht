declare module 'kademlia' {
    import * as dgram from 'dgram';

    export interface IContact {
        ip: string;
        port: number;
        nodeId: Buffer;
    }

    export interface IKBucketOptions {
        maxContacts: number;
    }

    export interface IDHTOptions {
        address: string;
        port: number;
    }

    export interface IRPCMessage<T = TType> {
        type: T;
        rpcId: string;
        nodeId: string;
        data: T extends 'STORE'
            ? IStoreMessage
            : T extends 'FIND_VALUE'
                ? IFindValue
                : void;
    }

    export type TStoreRPC = IRPCMessage<'STORE'>;
    export type TFindNodeReplyRPC = IRPCMessage<'FIND_NODE_REPLY'>;
    export type TFindValueRPC = IRPCMessage<'FIND_VALUE'>;

    export interface IListenOptions {
        port: number;
        address: string;
        nodeId: Buffer;
    }

    export interface IConnectOptions {
        port: number;
        address?: string;
    }


    /**
     * While this is not formally specified, it is clear that the initial STORE message must contain in addition to the message ID
     * at least the data to be stored (including its length) and the associated key.
     * As the transport may be UDP, the message needs to also contain at least the nodeID of the sender,
     * and the reply the nodeID of the recipient.
     * The reply to any RPC should also contain an indication of the result of the operation.
     * For example, in a STORE while no maximum data length has been specified,
     * it is clearly possible that the receiver might not be able to store the data,
     * either because of lack of space or because of an I/O error.
     */
    export interface IStoreMessage {
        key: string;
        block: string; // hex bytes?
        length: number; // size of full length?
    }

    export interface IReplyFindNode {
        contacts: Array<IContact>;
    }

    export interface IFindValue {
        key: string;
    }

    export type TType = (
        'PING'|
        'REPLY'|
        'STORE'|
        'FIND_NODE'|
        'FIND_VALUE'
    );

    export interface IRPCOptions<T> {
        rpcId?: string;
        data?: T;
        timeout?: number;
    }

    interface IKBucket {

    }

    class Contacts {
        private readonly buckets: Map<number, IKBucket>;
        private readonly _store: Map<string, string>;
        addContacts(me: IContact, contact: IContact|Array<IContact>): Promise<void>;
        findNode(key: Buffer): Array<IContact>;
        findValue(key: string): Promise<string|Array<IContact>>;
        store(message: TStoreRPC, info: dgram.RemoteInfo): void;
    }
}
