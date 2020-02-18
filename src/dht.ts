import * as dht from 'kademlia';
import {Contacts} from './contacts';
import {Node} from './node';
import {sha1} from './utils';
import {ALPHA} from './constants';

export class DHT {
    private readonly contacts: Contacts;
    private readonly node: Node;

    constructor() {
        this.contacts = new Contacts();
        this.node = new Node({
            contacts: this.contacts,
        });
    }

    public listen(options: dht.IDHTOptions) {
        return this.node.listen({
            port: options.port,
            address: options.address,
            nodeId: sha1(`${options.address}:${options.port}`).digest(),
        });
    }

    public async join(contact: Omit<dht.IContact, 'nodeId'>) {
        /**
         * A node joins the network as follows:
            - if it does not already have a nodeID n, it generates one
            - it inserts the value of some known node c into the appropriate bucket as its first contact
            - it does an iterativeFindNode for n
            - it refreshes all buckets further away than its closest neighbor, which will be in the occupied bucket with the lowest index.

            If the node saved a list of good contacts and used one of these as the "known node" it would be consistent with this protocol.
         */
        await this.contacts.addContacts({
            ...contact,
            nodeId: sha1(`${contact.ip}:${contact.port}`).digest(),
        });

        await this.findNode(this.node.contact().nodeId);
    }

    public async store(key: string) {

    }

    public async findNode(key: Buffer) {

    }

    public async findValue(key: string) {

    }

    private lookup() {
        const shortlist = this.contacts.findNode(this.node.contact().nodeId, ALPHA);
    }
}
