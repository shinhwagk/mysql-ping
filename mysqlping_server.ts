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
        lsMatch[1].split(',').forEach((label) => {
            const [labelKey, labelValue] = label.split('=');
            if (labelKey && labelValue) args.labels.set(labelKey, labelValue);
        });
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

    if (!args.host || !args.user || !args.password) throw new Error('Missing required arguments: host, user, or password');

    return args as MysqlPingArgs;
}

function logger(message: string): void {
    console.log(`${(new Date()).toISOString().replace('T', ' ').split('.')[0]} - ${message}`);
}

class MysqlPing {
    private connectionPool: mysql.Pool;
    private pingWindow = 0;
    private pingTimestampOk = Date.now();
    private pingTimestamp = Date.now();
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
        this.connectionPool = mysql.createPool({
            host: this.host,
            port: this.port,
            user: this.user,
            password: this.password,
            database: floor ? 'mysql_ping' : undefined,
            connectionLimit: 2,
        });
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
            if (connection) connection.release();
        }
    }

    start() {
        if (this.pingLock) return;
        this.pingLock = true;

        const timestampMs = Date.now();
        if (this.pingTimestamp + this.pingWindow < timestampMs) {
            this.pingTimestamp = timestampMs;
            this.pingWindow = Math.floor(Math.random() * this.range) + 1;
        }

        if (this.pingTimestampOk < this.pingTimestamp) {
            const pingTimestampOk = this.pingTimestamp + this.pingWindow;

            this.ping(pingTimestampOk)
                .then(() => {
                    this.pingTimestampOk = pingTimestampOk;
                    logger(`MysqlAddr: ${this.getAddr()}, TimestampOk: ${this.pingTimestampOk}, Window: ${this.pingWindow}`);
                })
                .catch((e) => logger(`MysqlAddr: ${this.getAddr()} ${e}`))
                .finally(() => this.pingLock = false);
        } else {
            this.pingLock = false;
        }
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
    getLabels() {
        return this.labels;
    }
}

const parsedArgs = parseArgs(Deno.args);
logger(`Args: ${JSON.stringify(parsedArgs)}`);

if (!parsedArgs['name']) {
    logger('Missing required arguments: name must be provided.');
    Deno.exit(1);
}
const MPS_ARGS_PING_NAME = parsedArgs['name'];
const MPS_ARGS_API_PORT: number = Number(parsedArgs['port'] || '3000');
const MPS_ARGS_PROM_LABELS: Map<string, string> = new Map(
    (parsedArgs['labels'] || '')
        .split(',')
        .map((lv: string) => lv.split('='))
        .filter(([key, value]: [string, string]) => key?.length >= 1 && value?.length >= 1),
);

type Arg = string;
const MPS_MYSQL_PINGS: Map<Arg, MysqlPing> = new Map();

const ac = new AbortController();
const server = Deno.serve(
    { port: MPS_ARGS_API_PORT, signal: ac.signal },
    async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === '/ready' && req.method === 'GET') {
            return new Response();
        } else if (url.pathname === '/metrics' && req.method === 'GET') {
            let body = '# HELP mysqlping_timestamp created counter\n# TYPE mysqlping_timestamp counter\n';
            for (const mmp of MPS_MYSQL_PINGS.values()) {
                let labels = `mysql_addr="${mmp.getAddr()}", ping_name="${MPS_ARGS_PING_NAME}"`;
                for (const [labelName, labelValue] of MPS_ARGS_PROM_LABELS.entries()) {
                    labels += `, ${labelName}="${labelValue}"`;
                }
                for (const [labelName, labelValue] of mmp.getLabels().entries()) {
                    labels += `, ${labelName}="${labelValue}"`;
                }
                body += `mysqlping_timestamp{${labels}} ${mmp.getTimestampOk()}\n`;
            }
            return new Response(body);
        } else if (url.pathname === '/ping' && req.method === 'GET') {
            for (const mp of MPS_MYSQL_PINGS.values()) {
                if (mp.getAddr() === url.searchParams.get('mysql_addr') || '') {
                    const status = Date.now() - mp.getTimestampOk() <= mp.getRange() ? 200 : 599;
                    return new Response(null, { status: status });
                }
            }
            return new Response(null, { status: 404 });
        } else if (url.pathname === '/dsns') {
            try {
                if (req.method === 'POST') {
                    const args = (await req.json() as string[]).filter((a: string) => a.length >= 1);

                    const ends: Promise<void>[] = [];

                    for (const mp_arg of MPS_MYSQL_PINGS.keys()) {
                        if (args.includes(mp_arg)) {
                            logger(`PING MYSQL(${MPS_MYSQL_PINGS.get(mp_arg)?.getAddr()}, Update: Keep`);
                        } else {
                            const end = MPS_MYSQL_PINGS.get(mp_arg)?.end();
                            end && ends.push(end);
                            logger(`PING MYSQL(${MPS_MYSQL_PINGS.get(mp_arg)?.getAddr()}, Update: Delete`);
                            MPS_MYSQL_PINGS.delete(mp_arg);
                        }
                    }

                    for (const arg of args) {
                        if (!MPS_MYSQL_PINGS.has(arg)) {
                            const mpa: MysqlPingArgs = parseMysqlPingArgs(arg);
                            const mp = new MysqlPing(MPS_ARGS_PING_NAME, mpa.host, mpa.port, mpa.user, mpa.password, mpa.range, mpa.floor, mpa.labels);
                            MPS_MYSQL_PINGS.set(arg, mp);
                            logger(`PING MYSQL(${mp.getAddr()}, Update: Append`);
                        }
                    }
                    Promise.all(ends).catch((e) => logger(`${String(e)}`));
                } else if (req.method === 'GET') {
                    return new Response(
                        JSON.stringify([...MPS_MYSQL_PINGS.keys()].map((id: string) => id.replace(/,p=.+?,/, ',p=******,'))),
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
    logger('Received SIGTERM, shutting down gracefully...');
    ac.abort();
    server.finished.then(() => {
        logger('http server closed');
        closePing = true;
    });
});

while (!closePing) {
    await Promise.all([...MPS_MYSQL_PINGS.values()].map((mmp) => Promise.resolve().then(() => mmp.start())));
    await new Promise((res) => setTimeout(res, 1000));
}

await Promise.all(Array.from(MPS_MYSQL_PINGS.values()).map((mmp) => mmp.end()));
logger('mysql ping closed');
