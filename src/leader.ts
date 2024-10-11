import { parseArgs } from "util";

import { timestamp, sleep, exec_task_on_global_status, GlobaStatus, createTaskExecutor } from './lib'
import { $ } from "bun";

Bun.env.MHA_LEADER_ADDR = "127.0.0.1:3000"

const follower_liveness = new Map<string, number>();
const mysql_liveness = new Map<string, number>();
let failover_demote: undefined | boolean = undefined;
const mysql_dsn = new Map<string, string>();
const replica_status = new Map<string, string[]>();
let global_status: GlobaStatus = GlobaStatus.Setup

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        "follower-pings": { type: 'string' },
        "follower-source": { type: 'string' },
        "follower-replicas": { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
});

values["follower-pings"]?.split(",").forEach(fn => mysql_liveness.set(fn, 0))
values["follower-pings"]?.split(",").forEach(fn => follower_liveness.set(fn, 0))
values["follower-replicas"]?.split(",").forEach(fn => follower_liveness.set(fn, 0))
follower_liveness.set(values["follower-source"]!, 0)

Bun.serve({
    async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/global_status") {
            if (req.method === "GET") {
                return new Response(global_status.toString());
            }
        } else if (url.pathname === "/follower_liveness") {
            if (req.method === "POST") {
                const fn = await req.text()
                if (follower_liveness.has(fn)) {
                    follower_liveness.set(fn, timestamp())
                }
                return new Response();
            }
        } else if (url.pathname.startsWith("/mysql/liveness/")) {
            if (req.method === "POST") {
                const fn = url.pathname.substring(16)
                mysql_liveness.set(fn, Number(await req.text()))
                return new Response();
            }
        } else if (url.pathname.startsWith("/replica/status/")) {
            if (req.method === "POST") {
                const fn = url.pathname.substring(16)
                replica_status.set(fn, await req.json())
                return new Response();
            }
        } else if (url.pathname === "/failover/demote") {
            if (req.method === "POST") {
                if ((await req.text()) == "ok" && global_status === GlobaStatus.FailoverDemoteSource) {
                    global_status = GlobaStatus.FailoverPromoteReplica
                }
                return new Response();
            }
        } else if (url.pathname === "/failover/promote") {
            if (req.method === "POST") {
                if ((await req.text()) == "ok" && global_status === GlobaStatus.FailoverPromoteReplica) {
                    global_status = GlobaStatus.FailoverRepointReplicas
                }
                return new Response();
            }
        } else if (url.pathname === "/failover/repoint") {
            if (req.method === "POST") {
                if ((await req.text()) == "ok" && global_status === GlobaStatus.FailoverRepointReplicas) {
                    global_status = GlobaStatus.FailoverRepointReplicas
                }
                return new Response();
            }
        } else if (url.pathname.startsWith("/mysql/dsn/")) {
            if (req.method === "POST") {
                const fn = url.pathname.substring(11)
                mysql_dsn.set(fn, (await req.text()))
                return new Response();
            }
        }
        return new Response("404!");
    },
})


async function check_source_liveness_from_pings(): Promise<boolean | undefined> {
    for (const fn of follower_liveness.keys()) {
        if (fn.startsWith("fp")) {
            if (await check_follower_liveness(fn)) {
                if (mysql_liveness.get(fn) === undefined) {
                    return undefined
                } else {
                    if ((mysql_liveness.get(fn) === 1)) {
                        mysql_liveness.clear()
                        return true
                    }
                }
            }
        }
    }
    mysql_liveness.clear()
    return false
}

async function check_follower_liveness(follower_name: string): Promise<boolean> {
    const liveness_ts_curr = follower_liveness.get(follower_name)!
    if (liveness_ts_curr === 0) {
        return false
    }
    await sleep(2000)
    const liveness_ts_last = follower_liveness.get(follower_name)!
    return liveness_ts_last > liveness_ts_curr
}


async function check_liveness(livenessMap: Map<string, number>, follower_name: string): Promise<boolean> {
    const liveness_ts_curr = livenessMap.get(follower_name)!
    if (liveness_ts_curr === 0) {
        return false
    }
    await sleep(2000)
    const liveness_ts_last = livenessMap.get(follower_name)!
    return liveness_ts_last > liveness_ts_curr
}


// async function check_follower_liveness(follower_name: string): Promise<boolean> {
//     return check_liveness(follower_liveness, follower_name)
// }

async function check_mysql_liveness(follower_name: string): Promise<boolean> {
    return check_liveness(mysql_liveness, follower_name)
}

async function exec_script_elect_source_from_replicas() {
    const { stderr, exitCode } = await $`./custom/elect_new_source_from_replicas`.quiet();
    if (exitCode === 0) {
        console.log(0)
    } else {
        console.error(stderr.toString())
    }
}

async function wait_all_followers_ready() {
    let check = true
    for (const fn of follower_liveness.keys()) {
        console.log(fn, "check follower live.")
        if (await check_follower_liveness(fn)) {
            break
        } else {
            console.log(fn, "not ready")
            return check

        }
    }
    // return await check_source_liveness_from_pings()
}

async function main() {
    const exec_task_on_global_setup = createTaskExecutor(GlobaStatus.Setup)
    const exec_task_on_global_monitor = createTaskExecutor(GlobaStatus.Monitor)
    const exec_task_on_global_failoverpre = createTaskExecutor(GlobaStatus.FailoverPre)
    const exec_task_on_global_failoverdemotesource = createTaskExecutor(GlobaStatus.FailoverDemoteSource)


    while (true) {
        console.log("global_status:", global_status)
        console.log("follower_liveness", follower_liveness)
        console.log("mysql_liveness", mysql_liveness)

        exec_task_on_global_setup(async () => {
            await wait_all_followers_ready();
            global_status = GlobaStatus.Monitor
        })

        exec_task_on_global_monitor(async () => {
            if ((await check_source_liveness_from_pings()) === false) {
                global_status = GlobaStatus.FailoverPre
            }
        })

        exec_task_on_global_failoverpre(async () => { })

        exec_task_on_global_failoverdemotesource(async () => {
            await exec_script_elect_source_from_replicas()
        })

        exec_task_on_global_status(GlobaStatus.FailoverPromoteReplica, async () => {

        })

        exec_task_on_global_status(GlobaStatus.FailoverRepointReplicas, async () => {

        })

        exec_task_on_global_status(GlobaStatus.FailoverPost, async () => {

        })


        exec_task_on_global_status(GlobaStatus.Done, () => {
            process.exit(0);
        })

        exec_task_on_global_status(GlobaStatus.Failure, () => {
            process.exit(1);
        })

        await sleep(1000)
    }
}

main()