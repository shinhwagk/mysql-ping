import { parseArgs } from "util";

import { getTimestamp, sleep, parseConnectionString, type MysqlDsn } from './lib'

import mysql, { type RowDataPacket } from 'mysql2/promise';

Bun.env.MHA_LEADER_ADDR = "127.0.0.1:3000"

const mysql_dsns = new Map<string, MysqlDsn>();
const FOLLOWER_PINGS: string[] = []

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        "follower-pings": { type: 'string' },
        "source-dsns": { type: 'string' }
    },
    strict: true,
    allowPositionals: true,
});


values["source-dsns"]?.split(",").forEach(fn => {
    const dsn = parseConnectionString(fn)
    mysql_dsns.set(dsn.name, dsn)
})
values["follower-pings"]?.split(",").forEach((fp) => FOLLOWER_PINGS.push(fp))

const InitMysqlState = new Map<string, boolean>()

// function http_server() {
Bun.serve({
    async fetch(req) {
        const url = new URL(req.url);
        if (req.method === "POST" && url.pathname === "/ready") {
            const mysql_name = await req.text()
            const body = InitMysqlState.get(mysql_name) ? "ok" : "no"
            return new Response(body);
        } else if (url.pathname.startsWith("/dsns")) {
            return new Response(JSON.stringify([...mysql_dsns.values()]), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            })
        } else if (url.pathname.startsWith("/metrics")) {
            if (req.method === "GET") {
                return new Response();
            }
        }
        return new Response("404!");
    },
})
// }

async function initMysqlPingTable(host: string, port: number, user: string, password: string) {
    const connection = await mysql.createConnection({ host: host, port: port, user: user, password: password });
    let query = 'CREATE DATABASE IF NOT EXISTS `mysql_ping`';
    await connection.execute(query);

    query = 'CREATE TABLE IF NOT EXISTS `mysql_ping`.`heartbeat`(ping_name VARCHAR(10) PRIMARY KEY, ping_timestamp INT)';
    await connection.execute(query);

    await connection.end();
}

async function abc(name: string, host: string, port: number, user: string, password: string): Promise<void> {
    const ts = getTimestamp()
    try {
        const connection = await mysql.createConnection({ host: host, port: port, user: user, password: password, rowsAsArray: true });
        const query = 'SELECT ping_name, ping_timestamp COUNT FROM mysql_ping.heartbeat';

        try {
            const [rows] = await connection.query<RowDataPacket[]>(query);
            for (const row of rows) {
                console.log(ts, row[0], row[1], ts - row[1])
            }
        } catch (error) {
            console.error('执行 SQL 查询时出错:', error);
        } finally {
            try {
                await connection.end();
            } catch (error) {
                console.error('执行 SQL 查询时出错:', error);
            }
        }
    } catch (error) {
        console.error('插入数据时出错:', error);
    }
}

async function main() {
    for (const { name, host, port, user, password } of mysql_dsns.values()) {
        InitMysqlState.set(name, false)
        initMysqlPingTable(host, port, user, password).then(() => {
            InitMysqlState.set(name, true);
        }).catch(console.log)
    }

    while (true) {
        for (const { name, host, port, user, password } of mysql_dsns.values()) {
            if (InitMysqlState.get(name)) {
                abc(name, host, port, user, password)
            }
        }

        await sleep(1000)
    }
}

main()
// http_server()


// await initMysqlPingTable("192.168.161.93", 33026, "root", "root_password")
// console.log("end")
// abc("x", "192.168.161.93", 33026, "root", "root_password")