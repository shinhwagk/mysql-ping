```sh
## ping service
bun run mysqlping_server.ts --follower-ping fp1 --http-port 3000 --ping-range 60 --source-dsns name1@root:root_password@192.168.161.93:33126,name2@root:root_password@192.168.161.93:33026

bun run mysqlping_server.ts --name fp1 --port 3000 --dsns 'n=test1,r=60,u=root,p=root_password,h=192.168.161.93,P=33126;n=test2,r=10,u=root,p=root_password,h=192.168.161.93,P=33026;n=test3,r=60,u=root,p=root_password,h=192.168.161.93,P=33026'

## ping client
bun run mysqlping_client.ts --follower-addrs 127.0.0.1:3000,127.0.0.1:3001 --mysql-name name1 --ping-range 60
```