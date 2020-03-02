import {DHT} from './dht';

async function main() {
    const dhtList = [];
    const origin = new DHT();

    await origin.listen({
        address: '127.0.0.1',
        port: 12400,
    });

    for (let i = 0; i < 100; i++) {
        const dht = new DHT();

        try {
            await dht.listen({
                address: '127.0.0.1',
                port: 12300 + i,
            });
            console.log('listening at ', 12300 + i);
            await dht.join({
                ip: '127.0.0.1',
                port: 12400,
            });
            dhtList.push(dht);
        } catch (e) {
            console.log(e);
            break;
        }
    }
}

main();
