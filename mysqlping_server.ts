import { parseArgs } from 'jsr:@std/cli/parse-args';

import mysql from 'npm:mysql2/promise';
import { getTimestampMs, logger, parseMysqlPingArgs } from './mysqlping_lib.ts';

class MysqlPing {
    private initState = false;
    private connectionPool: mysql.Pool;
    private pingWindow = 0;
    private pingTimestampOk = 0;
    private pingTimestamp = 0;
    private pingLock = false;

    constructor(
        private readonly fname: string,
        private readonly name: string,
        private readonly host: string,
        private readonly port: number,
        private readonly user: string,
        private readonly password: string,
        private readonly range: number,
        private readonly floor: boolean,
    ) {
        this.connectionPool = mysql.createPool({
            host: this.host,
            port: this.port,
            user: this.user,
            password: this.password,
            connectionLimit: 2,
        });

        this.pingTimestamp = getTimestampMs();
        this.pingTimestampOk = this.pingTimestamp;
    }

    private async initFloor(connection: mysql.PoolConnection) {
        if (this.initState) return;
        await connection.execute('CREATE DATABASE IF NOT EXISTS `mysql_ping`');
        await connection.execute('CREATE TABLE IF NOT EXISTS `mysql_ping`.`heartbeat` (ping_follower_name VARCHAR(10) PRIMARY KEY, ping_timestamp BIGINT NOT NULL)');
        this.initState = true;
    }

    private async ping(pingTimestampOk: number) {
        const connection = await this.connectionPool.getConnection();
        try {
            if (this.floor) {
                if (!this.initState) await this.initFloor(connection);
                await connection.execute('REPLACE INTO mysql_ping.heartbeat(ping_follower_name, ping_timestamp) VALUES (?, ?)', [this.fname, pingTimestampOk]);
            } else {
                await connection.execute('SELECT 1');
            }
        } finally {
            connection.release();
        }
    }

    async start() {
        if (this.pingLock) return;
        this.pingLock = true;

        const timestampMs = getTimestampMs();
        if (this.pingTimestamp + this.pingWindow < timestampMs) {
            this.pingTimestamp = timestampMs;
            this.pingWindow = Math.floor(Math.random() * this.range) + 1;
        }

        if (this.pingTimestampOk < this.pingTimestamp) {
            const pingTimestampOk = this.pingTimestamp + this.pingWindow;
            const logPrefix = `PING MYSQL(${this.name}@${this.getAddr()}) timestamp:${this.pingTimestamp}, timestamp ok:${this.pingTimestampOk}, floor:${
                String(this.floor).padEnd(5, ' ')
            }, window:${this.pingWindow}`;
            try {
                await this.ping(pingTimestampOk);
                this.pingTimestampOk = pingTimestampOk;
                logger(`${logPrefix}, timestamp ok:${this.pingTimestampOk}`);
            } catch (err) {
                logger(`${logPrefix}, ${err}`);
            }
        }
        this.pingLock = false;
    }

    getName() {
        return this.name;
    }
    getAddr() {
        return `${this.host}:${this.port}`;
    }
    getTimestampOk() {
        return this.pingTimestampOk;
    }
    getRange() {
        return this.range;
    }
}

const parsedArgs = parseArgs(Deno.args);
console.log(parsedArgs);

if (!parsedArgs['name'] || !parsedArgs['dsns']) {
    console.error(
        'Missing required arguments: name and dsns must be provided.',
    );
    Deno.exit(1);
}

const MP_ARGS_FOLLOWER_NAME: string = parsedArgs['name'];
const MP_ARGS_API_PORT: number = Number(parsedArgs['port']);
const MP_ARGS_DSNS: string = parsedArgs['dsns'];

const MP_MYSQL_PINGS = new Map(
    MP_ARGS_DSNS.split(';')
        .filter((a: string) => a.length >= 1)
        .map((mpArgs) => {
            const { name, host, port, user, password, range, floor } = parseMysqlPingArgs(mpArgs);
            return [
                name,
                new MysqlPing(MP_ARGS_FOLLOWER_NAME, name, host, port, user, password, range, floor),
            ];
        }),
);

const ac = new AbortController();
const server = Deno.serve(
    { port: MP_ARGS_API_PORT, signal: ac.signal },
    (req: Request) => {
        const url = new URL(req.url);
        if (req.method === 'GET') {
            switch (url.pathname) {
                case '/ready':
                    return new Response();
                case '/metrics': {
                    let body = '# HELP mysqlping_timestamp created counter\n# TYPE mysqlping_timestamp counter\n';
                    for (const [name, mmp] of MP_MYSQL_PINGS.entries()) {
                        body += `mysqlping_timestamp{mysql_name="${name}", mysql_addr="${mmp.getAddr()}", follower_name="${MP_ARGS_FOLLOWER_NAME}"} ${mmp.getTimestampOk()}\n`;
                    }
                    return new Response(body);
                }
                case '/ping': {
                    const mysql_name = url.searchParams.get('name') || '';
                    if (MP_MYSQL_PINGS.has(mysql_name)) {
                        const mmp = MP_MYSQL_PINGS.get(mysql_name)!;
                        const status = getTimestampMs() - mmp.getTimestampOk() <= mmp.getRange() ? 200 : 503;
                        return new Response(null, { status: status });
                    } else {
                        return new Response(null, { status: 404 });
                    }
                }
            }
        }
        return new Response(null, { status: 404 });
    },
);

const intervalId = setInterval(() => {
    for (const mmp of MP_MYSQL_PINGS.values()) {
        mmp.start();
    }
}, 1000);

Deno.addSignalListener('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    ac.abort();
    server.finished.then(() => {
        console.log('Server closed');
        clearInterval(intervalId);
        console.log('Shutdown complete.');
    });
});
