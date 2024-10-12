import { parseArgs } from "util";
import { getTimestamp } from './mysqlping_lib'

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

const MP_FOLLOWER_ADDRS: string[] = followerAddrs.split(",").map(fa => fa.trim());
const MP_MYSQL_NAME = mysqlName;
const MP_PING_RANGE: number = parseInt(pingRange, 10);

(async () => {
    for (const fAddr of MP_FOLLOWER_ADDRS) {
        try {
            if (!(await fetch(`http://${fAddr}/ready`)).ok) {
                console.error(`Follower ${fAddr} not ready.`);
                process.exit(1)
            }

            const res = await fetch(`http://${fAddr}/ping`, { method: "POST", body: MP_MYSQL_NAME });
            if (res.ok) {
                const pingTimestamp = parseInt(await res.text(), 10);
                if (getTimestamp() - pingTimestamp <= MP_PING_RANGE) {
                    console.log("alive");
                    process.exit(0);
                }
            } else {
                console.error(`Ping to follower ${fAddr} returned non-ok status.`);
                process.exit(1)
            }
        } catch (error) {
            console.error(`Error fetching from ${fAddr}: ${error}`);
            process.exit(1)
        }
    }
    console.log("down");
    process.exit(0);
})();