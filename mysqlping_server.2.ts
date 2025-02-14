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

interface IMysqlPing {
    start(): Promise<void>;
    end(): Promise<void>;
    args: MysqlPingArgs;
    getTimestampOk: () => number;
}

function CreateMysqlPing(pingName: string, args: string): IMysqlPing {
    const { host, port, user, password, range, floor, labels }: MysqlPingArgs = parseMysqlPingArgs(args);
    const connectionPool = mysql.createPool({ host, port, user, password, database: floor ? 'mysql_ping' : undefined, connectionLimit: 2 });

    let pingWindow = 0;
    let pingTimestampOk = Date.now();
    let pingTimestamp = Date.now();
    let pingLock = false;

    const startFn = () => {
        if (pingLock) return Promise.resolve();
        pingLock = true;
        const timestampMs = Date.now();
        if (pingTimestamp + pingWindow < timestampMs) {
            pingTimestamp = timestampMs;
            pingWindow = Math.floor(Math.random() * range) + 1;
        }
        if (pingTimestampOk < pingTimestamp) {
            const newPingTimestampOk = pingTimestamp + pingWindow;
            let connection: mysql.PoolConnection | undefined = undefined;
            const pingFn = async () => {
                try {
                    connection = await connectionPool.getConnection();
                    const query = floor ? `REPLACE INTO mysql_ping.heartbeat(ping_follower_name, ping_timestamp) VALUES ('${pingName}', ${newPingTimestampOk})` : 'SELECT 1';
                    await connection.execute(query);
                    pingTimestampOk = newPingTimestampOk;
                    logger(`MysqlAddr: ${host}:${port}, TimestampOk: ${pingTimestampOk}, Window: ${pingWindow}`);
                } catch (e) {
                    logger(`MysqlAddr: ${host}:${port}, ${e}`);
                } finally {
                    if (connection) {
                        try {
                            connection.release();
                        } catch (e) {
                            logger(`MysqlAddr: ${host}:${port}, ${e}`);
                        }
                    }
                    pingLock = false;
                }
            };
            pingFn();
        } else {
            pingLock = false;
        }
        return Promise.resolve();
    };

    const endFn = async () => await connectionPool.end();

    return { start: startFn, end: endFn, args: { host, port, user, password, range, floor, labels }, getTimestampOk: () => pingTimestampOk };
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
const MPS_MYSQL_PINGS: Map<Arg, IMysqlPing> = new Map();

const ac = new AbortController();
const server = Deno.serve(
    { port: MPS_ARGS_API_PORT, signal: ac.signal },
    async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === '/ready' && req.method === 'GET') {
            return new Response();
        } else if (url.pathname === '/metrics' && req.method === 'GET') {
            let body = '# HELP mysqlping_timestamp created counter\n# TYPE mysqlping_timestamp counter\n';
            for (const mp of MPS_MYSQL_PINGS.values()) {
                let labels = `mysql_addr="${mp.args.host}:${mp.args.port}", ping_name="${MPS_ARGS_PING_NAME}"`;
                for (const [labelName, labelValue] of MPS_ARGS_PROM_LABELS.entries()) {
                    labels += `, ${labelName}="${labelValue}"`;
                }
                for (const [labelName, labelValue] of mp.args.labels.entries()) {
                    labels += `, ${labelName}="${labelValue}"`;
                }
                body += `mysqlping_timestamp{${labels}} ${mp.getTimestampOk()}\n`;
            }
            return new Response(body);
        } else if (url.pathname === '/ping' && req.method === 'GET') {
            for (const mp of MPS_MYSQL_PINGS.values()) {
                if (`${mp.args.host}:${mp.args.port}` === url.searchParams.get('mysql_addr') || '') {
                    const status = Date.now() - mp.getTimestampOk() <= mp.args.range ? 200 : 599;
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
                        const mp = MPS_MYSQL_PINGS.get(mp_arg)!;
                        if (args.includes(mp_arg)) {
                            logger(`MysqlAddr: ${mp.args.host}:${mp.args.port}, Update: Keep`);
                        } else {
                            const end = MPS_MYSQL_PINGS.get(mp_arg)?.end();
                            end && ends.push(end);
                            logger(`MysqlAddr: ${mp.args.host}:${mp.args.port}, Update: Delete`);
                            MPS_MYSQL_PINGS.delete(mp_arg);
                        }
                    }

                    for (const arg of args) {
                        if (!MPS_MYSQL_PINGS.has(arg)) {
                            const mp = CreateMysqlPing(MPS_ARGS_PING_NAME, arg);
                            MPS_MYSQL_PINGS.set(arg, mp);
                            logger(`MysqlAddr: ${mp.args.host}:${mp.args.port}, Update: Append`);
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
