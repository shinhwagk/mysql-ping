```sh
## ping service
bun run mysqlping_server.ts --name fp1 --port 3000 --dsns 'n=test1,r=60,u=root,p=root_password,h=192.168.161.93,P=33126;n=test2,r=10,u=root,p=root_password,h=192.168.161.93,P=33026;n=test3,r=60,u=root,p=root_password,h=192.168.161.93,P=33026'

## ping client
bun run mysqlping_client.ts --follower-addrs 127.0.0.1:3000 --mysql-name name1
```