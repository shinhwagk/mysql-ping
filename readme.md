## Quick start

```sql
CREATE DATABASE IF NOT EXISTS `mysql_ping`;;
CREATE TABLE IF NOT EXISTS `mysql_ping`.`heartbeat` (ping_follower_name VARCHAR(10) PRIMARY KEY, ping_timestamp BIGINT NOT NULL);

CREATE USER 'mysql_ping'@'%' IDENTIFIED BY 'mysql_ping';
GRANT USAGE ON *.* TO 'mysql_ping'@'%';
GRANT INSERT, DELETE ON mysql_ping.heartbeat TO 'mysql_ping'@'%';
```

```sh;
## ping server
deno run --allow-net --allow-read mysqlping_server.ts --name fp2 --port 3003 --dsns 'n=test1,r=60,u=root,p=root_password,h=192.168.161.93,P=33126;n=test2,r=10,u=root,p=root_password,h=192.168.161.93,P=33026;n=test3,r=60,u=root,p=root_password,h=192.168.161.93,P=33026'

## ping client
deno run mysqlping_client.ts --addrs 127.0.0.1:3000 --name name1
```

## Api

```sh
GET  /ping?name={mysql_name}
GET  /ready
GET  /metrics # prometheus export
POST /dsns # body ['n=test1,r=60,u=root,p=root_password,h=192.168.161.93,P=33126']
```

### test

```sh
deno run --allow-net --allow-read mysqlping_server.ts --name fp2 --port 3003 --dsns 'n=test1,r=60,u=root,p=root_password,h=192.168.161.93,P=33126;'

curl -XPOST http://127.0.0.1:3000/dsns -d '["n=test1,r=60,u=root,p=root_password,h=192.168.161.93,P=33126","n=test2,r=10,u=root,p=root_password,h=192.168.161.93,P=33026"]'
```
