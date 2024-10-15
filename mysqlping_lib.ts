export interface MysqlPingArgs {
    name: string
    host: string
    port: number
    user: string
    password: string
    range: number
    // timeout: number
    floor: boolean
}

export function parseMysqlPingArgs(argsString: string): MysqlPingArgs {
    const argsArray = argsString.trim().split(",");
    const args: any = {
        port: 3306,
        range: 60,
        timeout: 10,
        floor: false
    };

    argsArray.forEach((arg) => {
        if (arg === "f" || arg === "floor") {
            args.floor = true;
            return;
        }

        const [key, value] = arg.split("=");
        if (!value) {
            throw new Error(`Missing value for argument: ${key}`);
        }
        switch (key) {
            case "n":
            case "name":
                args.name = value; break;
            case "h":
            case "host":
                args.host = value; break;
            case "P":
            case "port":
                args.port = parseInt(value, 10); break;
            case "u":
            case "user":
                args.user = value; break;
            case "p":
            case "password":
                args.password = value; break;
            case "r":
            case "range":
                args.range = parseInt(value, 10) * 1000; break; // from s to ms
            // case "t":
            // case "timeout":
            //     args.timeout = parseInt(value, 10); break;
            default:
                throw new Error(`Unknown argument: ${key}`);
        }
    });

    if (!args.name) {
        throw new Error("Missing required argument: n (name)");
    }
    if (!args.host) {
        throw new Error("Missing required argument: h (host)");
    }
    if (!args.user) {
        throw new Error("Missing required argument: u (user)");
    }
    if (!args.password) {
        throw new Error("Missing required argument: p (password)");
    }

    return args as MysqlPingArgs;
}

export function getTimestamp() {
    return Math.floor(Date.now())
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function logger(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${message}`);
}

export interface MysqlPingClient {
    timestamp: number,
    range: number
}