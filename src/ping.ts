import { parseArgs } from "util";

import { sleep, push_follower_liveness, parseConnectionString, GlobaStatus, createTaskExecutor, push_mysql_liveness } from './lib'

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        "leader-addr": { type: 'string', },
        "follower-ping": { type: 'string', },
        "source-dsn": { type: 'string', },
    },
    strict: true,
    allowPositionals: true,
});

Bun.env.MHA_FOLLOWER_NAME = values["follower-ping"]
Bun.env.MHA_LEADER_ADDR = values["leader-addr"]
const mysql_dsn = parseConnectionString(values["source-dsn"]!)
Bun.env.MHA_MYSQL_SOURCE_HOST = mysql_dsn.host
Bun.env.MHA_MYSQL_SOURCE_PORT = mysql_dsn.port
Bun.env.MHA_MYSQL_SOURCE_USER = mysql_dsn.user
Bun.env.MHA_MYSQL_SOURCE_PASS = mysql_dsn.pass

async function main() {
    const exec_task_on_global_setup = createTaskExecutor(GlobaStatus.Setup)
    const exec_task_on_global_monitor = createTaskExecutor(GlobaStatus.Monitor)
    const exec_task_on_global_done = createTaskExecutor(GlobaStatus.Done)
    const exec_task_on_global_failure = createTaskExecutor(GlobaStatus.Done)

    while (true) {
        push_follower_liveness()

        exec_task_on_global_setup(async () => { await push_mysql_liveness() })

        exec_task_on_global_monitor(async () => { await push_mysql_liveness() })

        exec_task_on_global_done(async () => { process.exit(0) })

        exec_task_on_global_failure(async () => { process.exit(1) })

        await sleep(1000)
    }
}

main()