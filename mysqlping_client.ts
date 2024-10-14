import { parseArgs } from "util";
import { getTimestamp, type MysqlPingClient } from './mysqlping_lib';

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        "follower-addrs": { type: 'string' },
        "mysql-name": { type: 'string' },
        "ping-range": { type: 'string', default: "60" },
    },
    strict: true,
    allowPositionals: true,
});

const { "follower-addrs": followerAddrs, "mysql-name": mysqlName, "ping-range": pingRange } = values;
if (!followerAddrs || !mysqlName) {
    console.error("Missing required arguments: follower-addrs or mysql-name.");
    process.exit(1);
}

const MP_FOLLOWER_ADDRS = followerAddrs.split(",").map(fa => fa.trim());
const MP_MYSQL_NAME = mysqlName;
const MP_PING_RANGE = parseInt(pingRange, 10);
let MP_FOLLOWER_RANGE;

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
        if (!res.ok) {
            throw new Error(`Ping to follower ${fAddr} returned non-ok status.`);
        }
        const mpc = await res.json() as { timestamp: number, range: number };
        if (getTimestamp() - mpc.timestamp <= MP_PING_RANGE) {
            process.exit(0);
        }
    }
} catch (error) {
    console.error(`Error: ${error}`);
    process.exit(2);
}

process.exit(1);
