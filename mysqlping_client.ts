import { parseArgs } from "util";

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

const MP_FOLLOWER_ADDRS = followerAddrs.split(",").filter(a => a.length >= 1).map(fa => fa.trim());
const MP_MYSQL_NAME = mysqlName;

// exit 2 follower error
// exit 1 mysql down
// exit 0 mysql live
try {
    await Promise.all(MP_FOLLOWER_ADDRS.map(async (fAddr) => {
        try {
            if (!(await fetch(`http://${fAddr}/ready`)).ok) {
                throw new Error(`not ready`);
            }
        } catch (err) {
            throw new Error(`follower:${fAddr}, error:${err}`)
        }
    }));

    for (const fAddr of MP_FOLLOWER_ADDRS) {
        const res = await fetch(`http://${fAddr}/ping?name=${MP_MYSQL_NAME}`);
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
