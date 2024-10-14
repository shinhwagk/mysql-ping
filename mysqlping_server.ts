import { parseArgs } from "util";
import mysql from 'mysql2/promise';
import { getTimestamp, sleep, parseConnectionString, logger, type MysqlDsn } from './mysqlping_lib';

class MysqlPing {
    private initState = false;
    private isPing = false;
    private connectionPool: mysql.Pool;
    private pingTimestamp: number;

    constructor(private readonly md: MysqlDsn, private readonly floor: boolean, pingTimestamp: number) {
        this.connectionPool = mysql.createPool({
            host: this.md.host,
            port: this.md.port,
            user: this.md.user,
            password: this.md.password,
            connectionLimit: 2,
        });
        this.pingTimestamp = pingTimestamp
    }

    async initFloor() {
        if (this.initState) return;
        const connection = await this.connectionPool.getConnection();
        try {
            await connection.execute('CREATE DATABASE IF NOT EXISTS `mysql_ping`');
            await connection.execute('CREATE TABLE IF NOT EXISTS `mysql_ping`.`heartbeat` (ping_name VARCHAR(10) PRIMARY KEY, ping_timestamp INT)');
            this.initState = true;
        } finally {
            connection.release();
        }
    }

    async ping(timestamp: number) {
        const connection = await this.connectionPool.getConnection();
        try {
            if (this.floor) {
                if (!this.initState) await this.initFloor();
                logger("start ping use floor.");
                await connection.execute('REPLACE INTO mysql_ping.heartbeat(ping_name, ping_timestamp) VALUES (?, ?)', [MP_FOLLOWER_NAME, timestamp]);
            } else {
                logger("start ping use non-floor.");
                await connection.execute('SELECT 1');
            }
            this.pingTimestamp = timestamp
            logger(`Ping executed for name: ${this.md.name} timestamp: ${timestamp}`);
        } finally {
            connection.release();
        }
    }

    getName() { return this.md.name; }
    getAddr() { return `${this.md.host}:${this.md.port}`; }
    getIsPing() { return this.isPing; }
    setIsPing(state: boolean) { this.isPing = state; }
    getPingTimestamp() { return this.pingTimestamp; }
}

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        "follower-ping": { type: 'string' },
        "source-dsns": { type: 'string' },
        "ping-range": { type: 'string', default: "60" },
        "ping-floor": { type: 'boolean' },
        "export-port": { type: 'string', default: "3000" }
    },
    strict: true,
    allowPositionals: true,
});

if (!values["follower-ping"] || !values["source-dsns"]) {
    logger("Missing required arguments: follower-ping and source-dsns must be provided.");
    process.exit(1);
}

const MP_FOLLOWER_NAME = values["follower-ping"];
const MP_EXPORT_PORT: number = Number(values["export-port"]);
const MP_PING_RANGE: number = Number(values["ping-range"]);
const MP_PING_FLOOR: boolean = values["ping-floor"] || false;
// const MP_METRICS = new Map<string, number>();
const MP_INIT_TIMESTAMP = getTimestamp();
const MP_MYSQL_INSTS = new Map(values["source-dsns"].split(",").map(dsnStr => {
    const dsn = parseConnectionString(dsnStr.trim());
    logger(`Adding MySQL DSN ${dsn.name}`);
    return [dsn.name, new MysqlPing(dsn, MP_PING_FLOOR, MP_INIT_TIMESTAMP)];
}));

Bun.serve({
    port: MP_EXPORT_PORT,
    async fetch(req) {
        const url = new URL(req.url);
        if (req.method === "GET") {
            switch (url.pathname) {
                case "/ready":
                    return new Response(null, { status: 200 });
                case "/metrics": {
                    let body = "# HELP mysqlping_timestamp created counter\n# TYPE mysqlping_timestamp counter\n";
                    for (const [name, mmp] of MP_MYSQL_INSTS.entries()) {
                        body += `mysqlping_timestamp{mysql_name="${name}", mysql_addr="${mmp.getAddr()}", follower_name="${MP_FOLLOWER_NAME}"} ${mmp.getPingTimestamp()}\n`;
                    }
                    return new Response(body);
                }
                case "/ping": {
                    const mysql_name = url.searchParams.get("name") || "";
                    if (MP_MYSQL_INSTS.has(mysql_name)) {
                        const mmp = MP_MYSQL_INSTS.get(mysql_name)!;
                        const body: { timestamp: number, range: number } = { "range": MP_PING_RANGE, "timestamp": mmp.getPingTimestamp() }
                        return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
                    } else {
                        return new Response(null, { status: 404 });
                    }
                }
            }
        }
        return new Response(null, { status: 404 });
    },
});

(async () => {
    while (true) {
        for (const md of MP_MYSQL_INSTS.values()) {
            if (!md.getIsPing()) {
                md.setIsPing(true);
                (async () => {
                    await sleep((Math.floor(Math.random() * MP_PING_RANGE) + 1) * 1000);
                    try {
                        const timestamp = getTimestamp();
                        await md.ping(timestamp);
                    } catch (error) {
                        logger(`${md.getName()} error: ${error}`);
                    } finally {
                        md.setIsPing(false);
                    }
                })();
            } else {
                logger(md.getName() + " running");
            }
        }
        await sleep(1000);
    }
})();