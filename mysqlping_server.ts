import { parseArgs } from "util";
import mysql from 'mysql2/promise';
import { getTimestamp as getTimestampMs, parseMysqlPingArgs, logger } from './mysqlping_lib';

class MysqlPing {
    private initState = false;
    private connectionPool: mysql.Pool;
    private pingWindow = 0;
    private pingTimestampOk = 0;

    constructor(
        private readonly fname: string,
        private readonly name: string,
        private readonly host: string,
        private readonly port: number,
        private readonly user: string,
        private readonly password: string,
        private readonly pingRange: number,
        private readonly floor: boolean,
        private pingTimestamp: number,
    ) {
        this.connectionPool = mysql.createPool({
            host: this.host,
            port: this.port,
            user: this.user,
            password: this.password,
            connectionLimit: 2,
        });
    }

    private async initFloor(connection: mysql.PoolConnection) {
        if (this.initState) return;
        await connection.execute('CREATE DATABASE IF NOT EXISTS `mysql_ping`');
        await connection.execute('CREATE TABLE IF NOT EXISTS `mysql_ping`.`heartbeat` (ping_follower_name VARCHAR(10) PRIMARY KEY, ping_timestamp BIGINT NOT NULL)');
        this.initState = true;
    }

    private async ping() {
        let connection;
        try {
            connection = await this.connectionPool.getConnection();
            if (this.floor) {
                if (!this.initState) await this.initFloor(connection);
                await connection.execute('REPLACE INTO mysql_ping.heartbeat(ping_follower_name, ping_timestamp) VALUES (?, ?)', [this.fname, this.pingTimestamp]);
            } else {
                await connection.execute('SELECT 1');
            }
            this.pingTimestampOk = getTimestampMs();
            logger(`PING MYSQL(${this.name}@${this.getAddr()}) timestamp:${this.pingTimestamp}, floor:${this.floor}, window:${this.pingWindow} timestamp ok:${this.pingTimestampOk}`);
        } catch (err) {
            logger(`PING MYSQL(${this.name}@${this.getAddr()}) timestamp:${this.pingTimestamp}, floor:${this.floor}, window:${this.pingWindow}, error:${err}`);
        } finally {
            if (connection) {
                try {
                    connection.release();
                } catch (releaseErr) {
                    logger(`PING MYSQL(${this.name}@${this.getAddr()}) error releasing connection: ${releaseErr}`);
                }
            }
        }
    }

    start() {
        if (this.pingTimestamp + this.pingWindow < getTimestampMs()) {
            this.pingTimestamp = getTimestampMs()
            this.pingWindow = (Math.floor(Math.random() * this.pingRange) + 1);
        }

        if (this.pingTimestampOk < this.pingTimestamp) {
            this.ping()
        }
    }

    getName() { return this.name; }
    getAddr() { return `${this.host}:${this.port}`; }
    getPingTimestamp() { return this.pingTimestamp; }
    getPingRange() { return this.pingRange; }
}

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        "name": { type: 'string' },
        "port": { type: 'string', default: "3000" },
        "dsns": { type: 'string' }
    },
    strict: true,
    allowPositionals: true,
});

if (!values["name"] || !values["dsns"]) {
    logger("Missing required arguments: name and dsns must be provided.");
    process.exit(1);
}

const MP_FOLLOWER_NAME = values["name"];
const MP_API_PORT: number = Number(values["port"]);

const MP_MYSQL_PINGS = new Map(values["dsns"].split(";").map(mpArgs => {
    const { name, host, port, user, password, range, floor } = parseMysqlPingArgs(mpArgs);
    return [name, new MysqlPing(MP_FOLLOWER_NAME, name, host, port, user, password, range, floor, getTimestampMs())];
}));

Bun.serve({
    port: MP_API_PORT,
    async fetch(req) {
        const url = new URL(req.url);
        if (req.method === "GET") {
            switch (url.pathname) {
                case "/ready":
                    return new Response(null, { status: 200 });
                case "/metrics": {
                    let body = "# HELP mysqlping_timestamp created counter\n# TYPE mysqlping_timestamp counter\n";
                    for (const [name, mmp] of MP_MYSQL_PINGS.entries()) {
                        body += `mysqlping_timestamp{mysql_name="${name}", mysql_addr="${mmp.getAddr()}", follower_name="${MP_FOLLOWER_NAME}"} ${mmp.getPingTimestamp()}\n`;
                    }
                    return new Response(body);
                }
                case "/ping": {
                    const mysql_name = url.searchParams.get("name") || "";
                    if (MP_MYSQL_PINGS.has(mysql_name)) {
                        const mmp = MP_MYSQL_PINGS.get(mysql_name)!;
                        const body: { timestamp: number, range: number } = { "range": mmp.getPingRange(), "timestamp": mmp.getPingTimestamp() };
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


setInterval(() => {
    for (const mmp of MP_MYSQL_PINGS.values()) {
        mmp.start();
    }
}, 1000);
