```sh
bun run ping.ts --follower-ping fp1 --export-port 3001 --source-dsns name1@root:root_password@db1:3306,name2@
bun run ping.ts --follower-ping fp2 --export-port 3000 --ping-range 60 --source-dsns name1@root:root_password@192.168.161.93:33026,name2@root:root_password@192.168.161.93:33026

bun build --compile ./ping.ts --outfile mysqlping


count(mysqlping_error == 0) by(mysql_addr,mysql_name) == 0 or count(time() - mysqlping_timestamp <=60) by(mysql_addr,mysql_name) == 0
```