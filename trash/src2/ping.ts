import { parseArgs } from "util";

import mysql from 'mysql2/promise';

import { getTimestamp, sleep, parseConnectionString, type MysqlDsn } from './lib'

function logger(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

class MysqlPing {
    private initState = false
    private isPing = false
    private connectionPool: mysql.Pool;

    constructor(private readonly md: MysqlDsn) {
        this.connectionPool = mysql.createPool({
            host: this.md.host,
            port: this.md.port,
            user: this.md.user,
            password: this.md.password,
            connectionLimit: 2,
        });
    }

    getName() {
        return this.md.name
    }

    getAddr() {
        return `${this.md.host}:${this.md.port}`
    }

    getIsPing() {
        return this.isPing
    }

    setIsPing(state: boolean) {
        this.isPing = state
    }

    private async init() {
        if (this.initState) return;
        const connection = await this.connectionPool.getConnection();
        try {
            await connection.execute('CREATE DATABASE IF NOT EXISTS `mysql_ping`');
            await connection.execute('CREATE TABLE IF NOT EXISTS `mysql_ping`.`heartbeat` (ping_name VARCHAR(10) PRIMARY KEY, ping_timestamp INT)');
            this.initState = true
        } finally {
            connection.release();
        }
    }

    async ping(timestamp: number) {
        if (!this.initState) {
            await this.init()
        }

        const connection = await this.connectionPool.getConnection();
        try {
            await connection.execute('REPLACE INTO mysql_ping.heartbeat(ping_name, ping_timestamp) VALUES (?, ?)', [MP_FOLLOWER_NAME, timestamp]);
            logger(`Ping inserted for ${this.md.name}`);
        } finally {
            connection.release();
        }
    }
}

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        "follower-ping": { type: 'string', },
        "source-dsns": { type: 'string' },
        "ping-range": { type: 'string', default: "60" },
        "export-port": { type: 'string', default: "3000" }
    },
    strict: true,
    allowPositionals: true,
});

if (!values["follower-ping"] || !values["source-dsns"]) {
    logger("Missing required arguments: follower-ping and source-dsns must be provided.");
    process.exit(1)
}

const MP_MysqlPing = new Map<string, MysqlPing>();
const MP_FOLLOWER_NAME = values["follower-ping"]
const MP_EXPORT_PORT: number = Number(values["export-port"])
const MP_PING_RANGE: number = Number(values["ping-range"])
const MP_METRICS = new Map<string, number>()
const MP_METRICS_ERROR = new Map<string, number>()


values["source-dsns"]?.split(",")
    .map(d => d.trim())
    .forEach(fn => {
        const dsn = parseConnectionString(fn)
        logger(`Adding MySQL DSN ${dsn.name}`);

        MP_MysqlPing.set(dsn.name, new MysqlPing(dsn))
    })

function http_server() {
    Bun.serve({
        port: MP_EXPORT_PORT,
        async fetch(req) {
            const url = new URL(req.url);
            if (req.method === "GET" && url.pathname.startsWith("/metrics")) {
                let body = "# HELP mysqlping_timestamp created counter\n"
                body += "# TYPE mysqlping_timestamp counter\n"
                for (const [name, ts] of MP_METRICS.entries()) {
                    const mmp = MP_MysqlPing.get(name)!
                    body += `mysqlping_timestamp{mysql_name="${name}", mysql_addr="${mmp.getAddr()}", follower_name="${MP_FOLLOWER_NAME}"} ${ts}\n`
                }
                body += "# HELP mysqlping_error created gauge\n"
                body += "# TYPE mysqlping_error gauge\n"
                for (const [name, error] of MP_METRICS_ERROR.entries()) {
                    const mmp = MP_MysqlPing.get(name)!
                    body += `mysqlping_error{mysql_name="${name}", mysql_addr="${mmp.getAddr()}", follower_name="${MP_FOLLOWER_NAME}"} ${error}\n`
                }
                return new Response(body);
            }
            return new Response("404!", { status: 404 });
        },
    })
}

async function main() {
    while (true) {
        const timestamp = getTimestamp()
        for (const md of MP_MysqlPing.values()) {
            MP_METRICS_ERROR.set(md.getName(), 0)
            MP_METRICS.set(md.getName(), timestamp)
            if (!md.getIsPing()) {
                md.setIsPing(true);
                (async () => {
                    const sleepTime = (Math.floor(Math.random() * MP_PING_RANGE) + 1) * 1000;
                    logger(`${md.getName()} sleeping for ${sleepTime} ms`);
                    await sleep(sleepTime)
                    await md.ping(timestamp).then(() => MP_METRICS.set(md.getName(), timestamp)).catch(() => MP_METRICS_ERROR.set(md.getName(), 1))
                    md.setIsPing(false)
                })();
            } else {
                logger(md.getName() + " running")
            }
        }
        await sleep(1000)
    }
}

main()
http_server()