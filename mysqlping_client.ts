import { parseArgs } from 'jsr:@std/cli/parse-args';

const parsedArgs = parseArgs(Deno.args);

const { 'ping-addrs': MPC_ARGS_PING_ADDRS, 'mysql-addr': MPC_ARGS_MYSQL_ADDR } = parsedArgs;
if (!MPC_ARGS_PING_ADDRS || !MPC_ARGS_MYSQL_ADDR) {
    console.error('Missing required arguments: ping-addrs or mysql-addr.');
    Deno.exit(2);
}

const pingAddrs: string[] = MPC_ARGS_PING_ADDRS.split(',').filter((a: string) => a.length >= 1).map((fa: string) => fa.trim());

// exit 2 ping error, exit 1 mysql down, exit 0 mysql live
try {
    for (const pingAddr of pingAddrs) {
        if (!(await fetch(`http://${pingAddr}/ready`)).ok) throw new Error(`ping-addr: ${pingAddr}, Not ready`);
        const res = await fetch(`http://${pingAddr}/ping?mysql_addr=${MPC_ARGS_MYSQL_ADDR}`);
        if (res.ok) Deno.exit(0);
        if (res.status == 404) throw new Error(`ping-addr:${pingAddr}, mysql-addr: ${MPC_ARGS_MYSQL_ADDR}, status:${res.status}, not exists`);
        if (res.status == 599) {
            console.error(`ping-addr:${pingAddr}, mysql-addr: ${MPC_ARGS_MYSQL_ADDR}, status:${res.status}, down`);
            Deno.exit(1);
        }
        throw new Error(`ping-addr:${pingAddr}, mysql-addr: ${MPC_ARGS_MYSQL_ADDR}, status:${res.status}, unknown`);
    }
} catch (error) {
    console.error(`${error}`);
    Deno.exit(2);
}
