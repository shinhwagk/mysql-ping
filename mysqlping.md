```sh
## ping service
bun run mysqlping.ts --follower-ping fp1 --export-port 3000 --ping-range 60 --source-dsns name1@root:root_password@192.168.161.93:33026,name2@root:root_password@192.168.161.93:33026
bun run mysqlping.ts --follower-ping fp2 --export-port 3001 --ping-range 60 --source-dsns name1@root:root_password@192.168.161.93:33026,name2@root:root_password@192.168.161.93:33026

## ping client
bun run mysqlping_client.ts --follower-addrs 127.0.0.1:3000,127.0.0.1:3001 --mysql-name name1 --ping-range 60
```