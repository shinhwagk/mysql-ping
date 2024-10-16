import { $ } from "bun";
import { parseArgs } from "util";

import mysql, { type ConnectionOptions, type RowDataPacket } from 'mysql2';

import { sleep, exec_task_on_global_status, push_follower_liveness, parseConnectionString, GlobaStatus, createTaskExecutor, api_push_mysql_dsn, api_push_replica_status, api_push_mysql_liveness, push_mysql_liveness } from './lib'

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        "leader-addr": { type: 'string', },
        "follower-replica": { type: 'string', },
        "replica-dsn": { type: 'string', },
    },
    strict: true,
    allowPositionals: true,
});

const mysql_dsn = parseConnectionString(values["replica-dsn"]!)
Bun.env.MHA_MYSQL_SOURCE_HOST = mysql_dsn.host
Bun.env.MHA_MYSQL_SOURCE_PORT = mysql_dsn.port
Bun.env.MHA_MYSQL_SOURCE_USER = mysql_dsn.user
Bun.env.MHA_MYSQL_SOURCE_PASS = mysql_dsn.pass
Bun.env.MHA_FOLLOWER_NAME = values["follower-replica"]
Bun.env.MHA_LEADER_ADDR = values["leader-addr"]

export async function push_replica_status() {
    const access: ConnectionOptions = {
        host: Bun.env.MHA_MYSQL_SOURCE_HOST,
        port: Number(Bun.env.MHA_MYSQL_SOURCE_PORT),
        user: Bun.env.MHA_MYSQL_SOURCE_USER,
        password: Bun.env.MHA_MYSQL_SOURCE_PASS,
    };

    const conn = mysql.createConnection(access);
    conn.query<RowDataPacket[]>("show replica status", (_err, rows) => {
        if (_err) {
            console.log(_err)
        } else {
            const rir = rows[0]["Replica_IO_Running"]
            const rsr = rows[0]["Replica_SQL_Running"]
            const rmlf = Number(rows[0]["Relay_Source_Log_File"].split('.')[1])
            const emlp = rows[0]["Exec_Source_Log_Pos"]
            api_push_replica_status([rir, rsr, rmlf, emlp])
        }
        conn.end()
    })
}

async function main() {
    const exec_task_on_global_setup = createTaskExecutor(GlobaStatus.Setup)
    const exec_task_on_global_monitor = createTaskExecutor(GlobaStatus.Monitor)

    while (true) {
        push_follower_liveness()

        exec_task_on_global_setup(async () => {
            api_push_mysql_dsn(values["replica-dsn"]!)
            push_mysql_liveness()
            push_replica_status()
        })

        exec_task_on_global_monitor(async () => {
            push_mysql_liveness()
            push_replica_status()
        })

        exec_task_on_global_status(GlobaStatus.FailoverPromoteReplica, async () => {

        })

        exec_task_on_global_status(GlobaStatus.FailoverRepointReplicas, async () => {

        })

        exec_task_on_global_status(GlobaStatus.Done, () => { process.exit(0) })

        exec_task_on_global_status(GlobaStatus.Failure, () => { process.exit(1) })

        await sleep(1000)
    }
}

main()