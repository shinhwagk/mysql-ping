import { $ } from "bun";
import { parseArgs } from "util";

import { sleep, exec_task_on_global_status, push_follower_liveness, parseConnectionString, GlobaStatus, api_push_mysql_dsn, createTaskExecutor } from './lib'


const { values } = parseArgs({
    args: Bun.argv,
    options: {
        "leader-addr": { type: 'string', },
        "follower-source": { type: 'string', },
        "source-dsn": { type: 'string', },
    },
    strict: true,
    allowPositionals: true,
});

const mysql_dsn = parseConnectionString(values["source-dsn"]!)

Bun.env.MHA_FOLLOWER_NAME = values["follower-source"]
Bun.env.MHA_LEADER_ADDR = values["leader-addr"]
Bun.env.MHA_MYSQL_SOURCE_HOST = mysql_dsn.host
Bun.env.MHA_MYSQL_SOURCE_PORT = mysql_dsn.port
Bun.env.MHA_MYSQL_SOURCE_USER = mysql_dsn.user
Bun.env.MHA_MYSQL_SOURCE_PASS = mysql_dsn.pass

export async function exec_script_demote_mysql_source() {
    const { stderr, exitCode } = await $`custom/demote_mysql_source`.nothrow();
    console.log(stderr.toString())
    return exitCode === 0
}

async function main() {
    const exec_task_on_global_setup = createTaskExecutor(GlobaStatus.Setup)
    const exec_task_on_global_failoverdemotesource = createTaskExecutor(GlobaStatus.FailoverDemoteSource)

    while (true) {
        push_follower_liveness()

        exec_task_on_global_setup(async () => {
            api_push_mysql_dsn(values["source-dsn"]!)
        })

        exec_task_on_global_failoverdemotesource(async () => {
            exec_script_demote_mysql_source().then(() => {

            })
        })

        exec_task_on_global_status(GlobaStatus.Done, () => { process.exit(0) })

        exec_task_on_global_status(GlobaStatus.Failure, () => { process.exit(1) })
        await sleep(1000)
    }
}

main()