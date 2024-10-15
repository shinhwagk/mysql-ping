import { parseArgs } from "util";
import { getTimestamp } from './mysqlping_lib';

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        "follower-addrs": { type: 'string' },
        "mysql-name": { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
});

const { "follower-addrs": followerAddrs, "mysql-name": mysqlName } = values;
if (!followerAddrs || !mysqlName) {
    console.error("Missing required arguments: follower-addrs or mysql-name.");
    process.exit(1);
}

const MP_FOLLOWER_ADDRS = followerAddrs.split(",").map(fa => fa.trim());
const MP_MYSQL_NAME = mysqlName;

// exit 2 follower error
// exit 1 mysql down
// exit 0 mysql live
try {
    for (const fAddr of MP_FOLLOWER_ADDRS) {
        const [readyRes] = await Promise.all([
            fetch(`http://${fAddr}/ready`)
        ]);

        if (!readyRes.ok) {
            throw new Error(`Follower ${fAddr} not ready.`);
        }
    }

    for (const fAddr of MP_FOLLOWER_ADDRS) {
        const res = await fetch(`http://${fAddr}/ping?name=${MP_MYSQL_NAME}`);
        if (res.status == 404) {
            throw new Error(`Ping to follower:${fAddr} mysql:${MP_MYSQL_NAME} not exits.`);
        } else if (!res.ok) {
            throw new Error(`Ping to follower:${fAddr} mysql:${MP_MYSQL_NAME} ${res.status}`);
        }

        const mpc = await res.json() as { timestamp: number, range: number };
        console.log(mpc.timestamp, mpc.range, getTimestamp())
        if (mpc.timestamp + mpc.range >= getTimestamp()) {
            process.exit(0);
        }
    }
} catch (error) {
    console.error(`${error}`);
    process.exit(2);
}

process.exit(1);
