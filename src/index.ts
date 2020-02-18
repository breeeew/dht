import {DHT} from './dht';
import { sha1 } from './utils';


async function main() {
    const dht = new DHT();

    await dht.join({
        ip: '127.0.0.1',
        port: 12346,
    });
}

main();
