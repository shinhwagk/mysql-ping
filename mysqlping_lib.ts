export interface MysqlDsn {
    name: string
    host: string
    port: number
    user: string
    password: string
}

export function parseConnectionString(connectionString: string): MysqlDsn {
    const [name, credentials, hostWithPort] = connectionString.split("@");
    const [user, pass] = credentials.split(":");
    const [host, port] = hostWithPort.split(":");
    return { name, host, port: Number(port), user, password: pass };
}

export function getTimestamp() {
    return Math.floor(Date.now() / 1000)
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
