import { parseArgs } from "util";
import { getTimestamp, logger, type MysqlPingClient } from './mysqlping_lib'

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
    logger("Missing required arguments: follower-addrs or mysql-name.");
    process.exit(1);
}

const MP_FOLLOWER_ADDRS: string[] = followerAddrs.split(",").map(fa => fa.trim());
const MP_MYSQL_NAME = mysqlName;
const MP_PING_RANGE: number = parseInt(pingRange, 10);

(async () => {
    let exitCode = 200;
    for (const fAddr of MP_FOLLOWER_ADDRS) {
        try {
            const res = await fetch(`http://${fAddr}/ping/${MP_MYSQL_NAME}`);
            if (res.ok) {
                const pingStatus = (await res.json()) as MysqlPingClient;
                logger(JSON.stringify(pingStatus))
                if (getTimestamp() - pingStatus.timestamp <= MP_PING_RANGE && pingStatus.error == 0) {
                    exitCode = 0;
                    break;
                }
            } else {
                exitCode = 0;
                break;
            }
        } catch (error) {
            exitCode = 0;
            logger(`Error fetching from ${fAddr}: ${error}`);
            break;
        }
    }
    process.exit(exitCode);
})();
