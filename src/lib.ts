import { $ } from "bun";

export enum GlobaStatus {
    Setup = 1,
    Monitor,
    FailoverPre,
    FailoverDemoteSource,
    FailoverPromoteReplica,
    FailoverRepointReplicas,
    FailoverPost,
    Done,
    Failure
}

export function parseConnectionString(connectionString: string) {
    const [credentials, hostWithPort] = connectionString.split("@");
    const [user, pass] = credentials.split(":");
    const [host, port] = hostWithPort.split(":");
    return { host, port, user, pass };
}

export function timestamp() {
    return Math.floor(Date.now() / 1000)
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let isTaskRunning = false;
export async function exec_task_on_global_status(name: GlobaStatus, task: () => Promise<void> = async () => { }) {
    try {
        const globalStatus = await (await fetch(`http://${Bun.env.MHA_LEADER_ADDR}/global_status`)).text();
        if (isTaskRunning == true) {
            console.log("is taskruning", "true")
        }
        if (name.toString() === globalStatus && !isTaskRunning) {
            isTaskRunning = true;
            task().finally(() => isTaskRunning = false)
        }
    } catch (e) {
        isTaskRunning = false
        console.log(e)
    }
}

export function createTaskExecutor(name: GlobaStatus) {
    let isTaskRunning = false;

    return async function exec_task(task: () => Promise<void> = async () => { }) {
        try {
            const globalStatus = await (await fetch(`http://${Bun.env.MHA_LEADER_ADDR}/global_status`)).text();
            if (name.toString() === globalStatus && !isTaskRunning) {
                isTaskRunning = true;
                task().finally(() => isTaskRunning = false).catch((e) => console.log(e))
            }
        } catch (e) {
            console.log(e);
        }
    };
}

export async function push_mysql_liveness() {
    const { stderr, exitCode } = await $`./custom/check_mysql_liveness`.nothrow().quiet();
    if (exitCode === 0) {
        await api_push_mysql_liveness(true)
    } else {
        await api_push_mysql_liveness(false)
        console.error(stderr.toString())
    }
}

export async function push_follower_liveness() {
    console.log("push follower livenesss")
    try {
        await fetch(`http://${Bun.env.MHA_LEADER_ADDR}/follower_liveness`, {
            method: 'POST',
            body: Bun.env.MHA_FOLLOWER_NAME
        });
    } catch (e) {
        console.log(e)
    }
}

export async function push_failover_demote_status() {
    try {
        await fetch(`http://${Bun.env.MHA_LEADER_ADDR}/failover/demote`, {
            method: 'POST',
            body: "ok"
        });
    } catch (e) {
        console.log(e)
    }
}

export async function api_push_mysql_liveness(ok: boolean) {
    try {
        await fetch(`http://${Bun.env.MHA_LEADER_ADDR}/mysql/liveness/${Bun.env.MHA_FOLLOWER_NAME}`, {
            method: 'POST',
            body: ok ? "1" : "0"
        });
    } catch (e) {
        console.log(e)
    }
}

export async function api_push_mysql_dsn(dsn: string) {
    try {
        await fetch(`http://${Bun.env.MHA_LEADER_ADDR}/mysql/dsn/${Bun.env.MHA_FOLLOWER_NAME}`, {
            method: 'POST',
            body: dsn
        });
    } catch (e) {
        console.log(e)
    }
}

export async function push_failover_promote_status() {
    try {
        await fetch(`http://${Bun.env.MHA_LEADER_ADDR}/failover/promote`, {
            method: 'POST',
            body: "ok"
        });
    } catch (e) {
        console.log(e)
    }
}

export async function api_push_replica_status(status: string[]) {
    try {
        await fetch(`http://${Bun.env.MHA_LEADER_ADDR}/replica/status/${Bun.env.MHA_FOLLOWER_NAME}`, {
            method: 'POST',
            body: JSON.stringify(status)
        });
    } catch (e) {
        console.log(e)
    }
}