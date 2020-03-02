import {Node} from './node';
import {kademlia} from './kademlia';

export class KBucket {
    private readonly maxContacts: number;
    private readonly node: Node;
    private contacts: Array<kademlia.IContact>;

    constructor(options: kademlia.IKBucketOptions) {
        this.maxContacts = options.maxContacts;
        this.contacts = [];
    }

    public getContacts(): Array<kademlia.IContact> {
        return this.contacts;
    }

    public async updateContact(contact: kademlia.IContact) {
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

    private moveToEnd(contact: kademlia.IContact) {
        this.contacts = [
            ...this.contacts.filter(c => c !== contact),
            contact,
        ];
    }
}
