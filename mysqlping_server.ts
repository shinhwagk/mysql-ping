import { parseArgs } from 'jsr:@std/cli/parse-args';

import mysql from 'npm:mysql2/promise';

interface MysqlPingArgs {
    name: string;
    host: string;
    port: number;
    user: string;
    password: string;
    range: number;
    // timeout: number
    floor: boolean;
}

function parseMysqlPingArgs(argsString: string): MysqlPingArgs {
    const argsArray = argsString.trim().split(',');
    const args: MysqlPingArgs = { port: 3306, range: 60, floor: false, name: '', host: '', user: '', password: '' };

    argsArray.forEach((arg) => {
        if (arg === 'f' || arg === 'floor') {
            args.floor = true;
            return;
        }

        const [key, value] = arg.split('=');
        if (!value) {
            throw new Error(`Missing value for argument: ${key}`);
        }
        switch (key) {
            case 'n':
            case 'name':
                args.name = value;
                break;
            case 'h':
            case 'host':
                args.host = value;
                break;
            case 'P':
            case 'port':
                args.port = parseInt(value, 10);
                break;
            case 'u':
            case 'user':
                args.user = value;
                break;
            case 'p':
            case 'password':
                args.password = value;
                break;
            case 'r':
            case 'range':
                args.range = parseInt(value, 10) * 1000;
                break;
            // case "t":
            // case "timeout":
            //     args.timeout = parseInt(value, 10); break;
            // from s to ms
            default:
                throw new Error(`Unknown argument: ${key}`);
        }
    });

    if (args.name === '') {
        throw new Error('Missing required argument: n (name)');
    }
    if (args.host === '') {
        throw new Error('Missing required argument: h (host)');
    }
    if (args.user === '') {
        throw new Error('Missing required argument: u (user)');
    }
    if (args.password === '') {
        throw new Error('Missing required argument: p (password)');
    }

    return args as MysqlPingArgs;
}

function getTimestampMs() {
    return Math.floor(Date.now());
}

function logger(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${message}`);
}

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
        this.connectionPool = mysql.createPool({ host: this.host, port: this.port, user: this.user, password: this.password, connectionLimit: 2 });
        this.pingTimestamp = getTimestampMs();
        this.pingTimestampOk = this.pingTimestamp;
    }

    async end() {
        await this.connectionPool.end();
    }

    private async initFloor(connection: mysql.PoolConnection) {
        if (this.initState) return;
        await connection.execute('CREATE DATABASE IF NOT EXISTS `mysql_ping`');
        await connection.execute('CREATE TABLE IF NOT EXISTS `mysql_ping`.`heartbeat` (ping_follower_name VARCHAR(10) PRIMARY KEY, ping_timestamp BIGINT NOT NULL)');
        this.initState = true;
    }

    private async ping(pingTimestampOk: number) {
        let connection: mysql.PoolConnection | undefined;
        try {
            connection = await this.connectionPool.getConnection();
            if (this.floor) {
                if (!this.initState) await this.initFloor(connection);
                await connection.execute('REPLACE INTO mysql_ping.heartbeat(ping_follower_name, ping_timestamp) VALUES (?, ?)', [this.fname, pingTimestampOk]);
            } else {
                await connection.execute('SELECT 1');
            }
        } finally {
            if (connection) {
                connection.release();
            }
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
    console.error('Missing required arguments: name and dsns must be provided.');
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
            return [name, new MysqlPing(MP_ARGS_FOLLOWER_NAME, name, host, port, user, password, range, floor)];
        }),
);

const ac = new AbortController();
const server = Deno.serve(
    { port: MP_ARGS_API_PORT, signal: ac.signal },
    async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === '/ready' && req.method === 'GET') {
            return new Response();
        } else if (url.pathname === '/metrics' && req.method === 'GET') {
            let body = '# HELP mysqlping_timestamp created counter\n# TYPE mysqlping_timestamp counter\n';
            for (const [name, mmp] of MP_MYSQL_PINGS.entries()) {
                body += `mysqlping_timestamp{mysql_name="${name}", mysql_addr="${mmp.getAddr()}", follower_name="${MP_ARGS_FOLLOWER_NAME}"} ${mmp.getTimestampOk()}\n`;
            }
            return new Response(body);
        } else if (url.pathname === '/ping' && req.method === 'GET') {
            const mysql_name = url.searchParams.get('name') || '';
            if (MP_MYSQL_PINGS.has(mysql_name)) {
                const mmp = MP_MYSQL_PINGS.get(mysql_name)!;
                const status = getTimestampMs() - mmp.getTimestampOk() <= mmp.getRange() ? 200 : 599;
                return new Response(null, { status: status });
            } else {
                return new Response(null, { status: 404 });
            }
        } else if (url.pathname === '/dsns') {
            try {
                if (req.method === 'POST') {
                    ((await req.json()) as string[]).filter((a: string) => a.length >= 1).forEach((mpArgs) => {
                        const { name, host, port, user, password, range, floor } = parseMysqlPingArgs(mpArgs);
                        MP_MYSQL_PINGS.set(name, new MysqlPing(MP_ARGS_FOLLOWER_NAME, name, host, port, user, password, range, floor));
                    });
                } else if (req.method === 'DELETE') {
                    const mysql_pings = Array.from(MP_MYSQL_PINGS.values());
                    MP_MYSQL_PINGS.clear();
                    await Promise.all(mysql_pings.map((mp) => mp.end()));
                }
            } catch (err) {
                return new Response(String(err), { status: 500 });
            }
            return new Response();
        }
        return new Response(null, { status: 404 });
    },
);

let closePing = false;
Deno.addSignalListener('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    ac.abort();
    server.finished.then(() => {
        console.log('http server closed');
        closePing = true;
    });
});

let pings: Promise<void>[] = [];
while (!closePing) {
    pings = Array.from(MP_MYSQL_PINGS.values()).map((mmp) => mmp.start());
    await new Promise((res) => setTimeout(res, 1000));
}
await Promise.all(pings);
await Promise.all(Array.from(MP_MYSQL_PINGS.values()).map((mmp) => mmp.end()));
console.log('ping service closed');
