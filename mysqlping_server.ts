import { parseArgs } from 'jsr:@std/cli/parse-args';

import mysql from 'npm:mysql2/promise';

interface MysqlPingArgs {
    host: string;
    port: number;
    user: string;
    password: string;
    range: number;
    // timeout: number
    floor: boolean;
    labels: Map<string, string>;
}

function parseMysqlPingArgs(argsString: string): MysqlPingArgs {
    const args: MysqlPingArgs = { port: 3306, range: 60, floor: false, host: '', user: '', password: '', labels: new Map() };

    const lsMatch = argsString.match(/,ls=(.+)$/);

    if (lsMatch) {
        const lsValue = lsMatch[1];
        const labels = lsValue.split(',');
        for (const label of labels) {
            const [labelKey, labelValue] = label.split('=');
            if (labelKey && labelValue) {
                args.labels.set(labelKey, labelValue);
            }
        }
        argsString = argsString.replace(/,ls=.+$/, '');
    }

    argsString.split(',').forEach((arg) => {
        if (arg === 'f' || arg === 'floor') {
            args.floor = true;
            return;
        }

        const [key, value] = arg.split('=');
        if (!value) {
            throw new Error(`Missing value for argument: ${key}`);
        }
        switch (key) {
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
    private connectionPool: mysql.Pool;
    private pingWindow = 0;
    private pingTimestampOk = 0;
    private pingTimestamp = 0;
    private pingLock = false;

    constructor(
        private readonly pingName: string,
        private readonly host: string,
        private readonly port: number,
        private readonly user: string,
        private readonly password: string,
        private readonly range: number,
        private readonly floor: boolean,
        private readonly labels: Map<string, string>,
    ) {
        if (floor) {
            this.connectionPool = mysql.createPool({ host: this.host, port: this.port, user: this.user, password: this.password, database: 'mysql_ping', connectionLimit: 2 });
        } else {
            this.connectionPool = mysql.createPool({ host: this.host, port: this.port, user: this.user, password: this.password, connectionLimit: 2 });
        }
        this.pingTimestamp = getTimestampMs();
        this.pingTimestampOk = this.pingTimestamp;
    }

    async end() {
        try {
            await this.connectionPool.end();
        } catch (err) {
            logger(`PING MYSQL(${this.getAddr()}), ${err}`);
        }
    }

    private async ping(pingTimestampOk: number) {
        let connection: mysql.PoolConnection | undefined;
        try {
            connection = await this.connectionPool.getConnection();
            if (this.floor) {
                await connection.execute('REPLACE INTO mysql_ping.heartbeat(ping_follower_name, ping_timestamp) VALUES (?, ?)', [this.pingName, pingTimestampOk]);
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
            const logPrefix = `PING MYSQL(${this.getAddr()}) timestamp:${this.pingTimestamp}, timestamp ok:${this.pingTimestampOk}, floor:${
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

    getUser() {
        return this.user;
    }
    getPassword() {
        return this.password;
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
    getFloor() {
        return this.floor;
    }
    getLabels() {
        return this.labels;
    }
}

const parsedArgs = parseArgs(Deno.args);
console.log(parsedArgs);

if (!parsedArgs['name']) {
    console.error('Missing required arguments: name must be provided.');
    Deno.exit(1);
}
const MP_ARGS_PING_NAME = parsedArgs['name'];
const MP_ARGS_API_PORT: number = Number(parsedArgs['port'] || '3000');
const MP_ARGS_PROM_LABELS: Map<string, string> = new Map(
    (parsedArgs['labels'] || '')
        .split(',')
        .map((lv: string) => lv.split('='))
        .filter(([key, value]: [string, string]) => key && value !== undefined),
);

// const MP_MYSQL_PINGS: Map<string, MysqlPing> = new Map();
type addr = string;
type arg = string;
const MP_MYSQL_PINGS: Map<arg, MysqlPing> = new Map();

const ac = new AbortController();
const server = Deno.serve(
    { port: MP_ARGS_API_PORT, signal: ac.signal },
    async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === '/ready' && req.method === 'GET') {
            return new Response();
        } else if (url.pathname === '/metrics' && req.method === 'GET') {
            let body = '# HELP mysqlping_timestamp created counter\n# TYPE mysqlping_timestamp counter\n';
            for (const mmp of MP_MYSQL_PINGS.values()) {
                let labels = `mysql_addr="${mmp.getAddr()}", ping_name="${MP_ARGS_PING_NAME}"`;
                for (const [labelName, labelValue] of MP_ARGS_PROM_LABELS.entries()) {
                    labels += `, ${labelName}="${labelValue}"`;
                }
                for (const [labelName, labelValue] of mmp.getLabels().entries()) {
                    labels += `, ${labelName}="${labelValue}"`;
                }
                body += `mysqlping_timestamp{${labels}} ${mmp.getTimestampOk()}\n`;
            }
            return new Response(body);
        } else if (url.pathname === '/ping' && req.method === 'GET') {
            const mysql_addr = url.searchParams.get('mysql_addr') || '';

            for (const mp of MP_MYSQL_PINGS.values()) {
                if (mp.getAddr() === mysql_addr) {
                    const status = getTimestampMs() - mp.getTimestampOk() <= mp.getRange() ? 200 : 599;
                    return new Response(null, { status: status });
                }
            }
            return new Response(null, { status: 404 });
        } else if (url.pathname === '/dsns') {
            try {
                if (req.method === 'POST') {
                    const args = (await req.json() as string[]).filter((a: string) => a.length >= 1);

                    const ends: Promise<void>[] = [];

                    for (const mp_arg of MP_MYSQL_PINGS.keys()) {
                        if (args.includes(mp_arg)) {
                            console.log(`keep ${MP_MYSQL_PINGS.get(mp_arg)?.getAddr()}`);
                        } else {
                            const end = MP_MYSQL_PINGS.get(mp_arg)?.end();
                            if (end) {
                                ends.push(end);
                            }
                            console.log(`delete ${MP_MYSQL_PINGS.get(mp_arg)?.getAddr()}`);
                            MP_MYSQL_PINGS.delete(mp_arg);
                        }
                    }

                    for (const arg of args) {
                        if (!MP_MYSQL_PINGS.has(arg)) {
                            const mpa: MysqlPingArgs = parseMysqlPingArgs(arg);
                            const mp = new MysqlPing(MP_ARGS_PING_NAME, mpa.host, mpa.port, mpa.user, mpa.password, mpa.range, mpa.floor, mpa.labels);
                            MP_MYSQL_PINGS.set(arg, mp);
                            console.log(`append ${mp.getAddr()}`);
                        }
                    }
                    Promise.all(ends).catch(console.log);
                } else if (req.method === 'GET') {
                    return new Response(
                        JSON.stringify([...MP_MYSQL_PINGS.keys()].map((id: string) => id.replace(/,p=.+?,/, ',p=******,'))),
                        { headers: { 'content-type': 'application/json' } },
                    );
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
    pings = [...MP_MYSQL_PINGS.values()].map((mmp) => mmp.start());
    await new Promise((res) => setTimeout(res, 1000));
}
await Promise.all(pings);
await Promise.all(Array.from(MP_MYSQL_PINGS.values()).map((mmp) => mmp.end()));
console.log('ping service closed');
