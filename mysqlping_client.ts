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
    process.exit(2);
}

const MP_FOLLOWER_ADDRS = followerAddrs.split(",").map(fa => fa.trim());
const MP_MYSQL_NAME = mysqlName;

// exit 2 follower error
// exit 1 mysql down
// exit 0 mysql live
try {
    for (const fAddr of MP_FOLLOWER_ADDRS) {
        const readyRes = await fetch(`http://${fAddr}/ready`);

        if (!readyRes.ok) {
            throw new Error(`Follower ${fAddr} not ready`);
        }
    }

    for (const fAddr of MP_FOLLOWER_ADDRS) {
        const res = await fetch(`http://${fAddr}/live?name=${MP_MYSQL_NAME}`);
        if (res.ok) {
            process.exit(0);
        } else if (res.status == 404) {
            throw new Error(`follower:${fAddr}, mysql:${MP_MYSQL_NAME}, status:${res.status}, not exists`);
        } else if (res.status == 503) {
            console.error(`follower:${fAddr}, mysql:${MP_MYSQL_NAME}, status:${res.status}, down`);
        }
    }
} catch (error) {
    console.error(`${error}`);
    process.exit(2);
}

process.exit(1);
