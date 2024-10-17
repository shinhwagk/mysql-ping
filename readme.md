## Quick start

```sh
## ping server
deno run --allow-net --allow-read mysqlping_server.ts --name fp2 --port 3003 --dsns 'n=test1,r=60,u=root,p=root_password,h=192.168.161.93,P=33126;n=test2,r=10,u=root,p=root_password,h=192.168.161.93,P=33026;n=test3,r=60,u=root,p=root_password,h=192.168.161.93,P=33026'

## ping client
bun run mysqlping_client.ts --addrs 127.0.0.1:3000 --name name1
```

## Api

```sh
GET /ping?name={mysql_name}
GET /ready
GET /metrics # prometheus export
```
