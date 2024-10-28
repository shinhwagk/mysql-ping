import { parseArgs } from 'jsr:@std/cli/parse-args';

const parsedArgs = parseArgs(Deno.args);

const { 'addrs': followerAddrs, 'mysql_addr': MP_ARGS_MYSQL_ADDR } = parsedArgs;
if (!followerAddrs || !MP_ARGS_MYSQL_ADDR) {
    console.error('Missing required arguments: follower-addrs or mysql-addr.');
    Deno.exit(2);
}

const MP_ARGS_FOLLOWER_ADDRS: string[] = followerAddrs.split(',').filter((a: string) => a.length >= 1).map((fa: string) => fa.trim());

// exit 2 follower error
// exit 1 mysql down
// exit 0 mysql live
try {
    await Promise.all(MP_ARGS_FOLLOWER_ADDRS.map(async (fAddr: string) => {
        try {
            if (!(await fetch(`http://${fAddr}/ready`)).ok) {
                throw new Error(`not ready`);
            }
        } catch (err) {
            throw new Error(`follower:${fAddr}, ${err}`);
        }
    }));

    for (const fAddr of MP_ARGS_FOLLOWER_ADDRS) {
        const res = await fetch(`http://${fAddr}/ping?mysql_addr=${MP_ARGS_MYSQL_ADDR}`);
        if (res.ok) {
            Deno.exit(0);
        } else if (res.status == 404) {
            throw new Error(`follower:${fAddr}, mysql:${MP_ARGS_MYSQL_ADDR}, status:${res.status}, not exists`);
        } else if (res.status == 599) {
            console.error(`follower:${fAddr}, mysql:${MP_ARGS_MYSQL_ADDR}, status:${res.status}, down`);
            Deno.exit(1);
        } else {
            throw new Error(`follower:${fAddr}, mysql:${MP_ARGS_MYSQL_ADDR}, status:${res.status}, unknown`);
        }
    }
} catch (error) {
    console.error(`${error}`);
    Deno.exit(2);
}
