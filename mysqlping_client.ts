import { parseArgs } from 'jsr:@std/cli/parse-args';

const parsedArgs = parseArgs(Deno.args);

const { 'addrs': followerAddrs, 'name': mysqlName } = parsedArgs;
if (!followerAddrs || !mysqlName) {
    console.error('Missing required arguments: follower-addrs or mysql-name.');
    Deno.exit(2);
}

const MP_ARGS_FOLLOWER_ADDRS = followerAddrs.split(',').filter((a: string) => a.length >= 1).map((fa: string) => fa.trim());
const MP_ARGS_MYSQL_NAME = mysqlName;

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
            throw new Error(`follower:${fAddr}, error:${err}`);
        }
    }));

    for (const fAddr of MP_ARGS_FOLLOWER_ADDRS) {
        const res = await fetch(`http://${fAddr}/ping?name=${MP_ARGS_MYSQL_NAME}`);
        if (res.ok) {
            Deno.exit(0);
        } else if (res.status == 404) {
            throw new Error(`follower:${fAddr}, mysql:${MP_ARGS_MYSQL_NAME}, status:${res.status}, not exists`);
        } else if (res.status == 503) {
            console.error(`follower:${fAddr}, mysql:${MP_ARGS_MYSQL_NAME}, status:${res.status}, down`);
        }
    }
} catch (error) {
    console.error(`${error}`);
    Deno.exit(2);
}

Deno.exit(1);
