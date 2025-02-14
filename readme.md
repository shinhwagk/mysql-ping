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
deno run mysqlping_client.ts --ping-addrs 192.168.161.93:3998,192.168.161.93:3999 --mysql-addr 192.168.161.2:3406
```

## Api

```sh
GET  /ping?mysql_addr=1.1.1.1:3306
GET  /ready
GET  /metrics # prometheus export
POST /dsns # body ['n=test1,r=60,u=root,p=root_password,h=192.168.161.93,P=33126']
GET  /dsns
```

### test

```sh
deno run --allow-net --allow-read mysqlping_server.ts --name xxx1 --port 3000 --labels "ping_idc=aff"
deno run --allow-net --allow-read mysqlping_server.ts --name xxx2 --port 3001 --labels "ping_idc=aff"

deno run --allow-net --allow-read mysqlping_client.ts --mysql-addr=192.168.161.93:33026 --ping-addrs=127.0.0.1:3000

curl -XPOST http://127.0.0.1:3000/dsns -d '["r=60,u=root,p=root_password,h=192.168.161.93,P=33026,ls=mysql_idc=xxx,mysql_name=xx","r=10,u=root,p=root_password,h=192.168.161.93,P=33027"]'
curl -XPOST http://127.0.0.1:3001/dsns -d '["r=60,u=root,p=root_password,h=192.168.161.93,P=33026,ls=mysql_idc=xxx,mysql_name=xx","r=10,u=root,p=root_password,h=192.168.161.93,P=33027"]'


docker run -d shinhwagk/mysql-ping:server-0.2.26 --name mysql-ping-02 --port 3000:3000 --labels "ping_idc=chengdu"
```

### compile

```sh
deno compile --allow-net --target x86_64-unknown-linux-gnu mysqlping_client.ts -o mysqlping_client
```
