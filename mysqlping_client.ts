import { parseArgs } from 'jsr:@std/cli/parse-args';

const parsedArgs = parseArgs(Deno.args);

const { 'ping-addrs': MPC_ARGS_PING_ADDRS, 'mysql-addr': MPC_ARGS_MYSQL_ADDR } = parsedArgs;
if (!MPC_ARGS_PING_ADDRS || !MPC_ARGS_MYSQL_ADDR) {
    console.error('Missing required arguments: ping-addrs or mysql-addr.');
    Deno.exit(2);
}

const pingAddrs: string[] = MPC_ARGS_PING_ADDRS.split(',')
    .filter((a: string) => a.length >= 1)
    .map((fa: string) => fa.trim());

interface Output {
    status: 'unknown' | 'down' | 'alive';
    message?: string;
}

for (const pingAddr of pingAddrs) {
    try {
        if (!(await fetch(`http://${pingAddr}/ready`)).ok) throw new Error(`ping-addr: ${pingAddr}, Not ready`);
        const res = await fetch(`http://${pingAddr}/ping?mysql_addr=${MPC_ARGS_MYSQL_ADDR}`);
        if (res.ok) {
            console.log(JSON.stringify({ status: 'alive' }));
            Deno.exit(0);
        } else if (res.status == 404) {
            throw new Error(`ping-addr:${pingAddr}, mysql-addr: ${MPC_ARGS_MYSQL_ADDR}, status:${res.status}, not exists`);
        } else if (res.status == 599) {
            // No action needed for status 599
        } else {
            throw new Error(`ping-addr:${pingAddr}, mysql-addr: ${MPC_ARGS_MYSQL_ADDR}, status:${res.status}, unknown`);
        }
    } catch (error) {
        console.log(JSON.stringify({ status: 'unknown', message: String(error) }));
        Deno.exit(0);
    }
}

console.log(JSON.stringify({ status: 'down' }));
Deno.exit(0);
