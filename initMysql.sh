#!/usr/bin/env bash

mysql -uroot -proot_password -hdb1 -se"create user 'repl'@'%' identified by 'repl';"
mysql -uroot -proot_password -hdb1 -se"grant replication slave, replication client on *.* to 'repl'@'%';"

set -e

mysql -uroot -proot_password -hdb1 -se"set global super_read_only=0;drop database if exists test;"
mysql -uroot -proot_password -hdb2 -se"set global super_read_only=0;drop database if exists test;"
mysql -uroot -proot_password -hdb3 -se"set global super_read_only=0;drop database if exists test;"

mysql -uroot -proot_password -hdb1 -se"reset master;"

mysql -uroot -proot_password -hdb2 -se"set global read_only=1;"
mysql -uroot -proot_password -hdb2 -se"set global super_read_only=1;"
mysql -uroot -proot_password -hdb2 -se"stop slave;"
mysql -uroot -proot_password -hdb2 -se"reset slave all;"
mysql -uroot -proot_password -hdb2 -se"reset master;"
mysql -uroot -proot_password -hdb2 -se"change master to master_host='db1', master_port=3306, master_user='root', master_password='root_password', master_log_file='mysql-bin.000001', master_log_pos=4;"
mysql -uroot -proot_password -hdb2 -se"start slave;"
mysql -uroot -proot_password -hdb2 -se"show slave status\G"

mysql -uroot -proot_password -hdb3 -se"set global read_only=1;"
mysql -uroot -proot_password -hdb3 -se"set global super_read_only=1;"
mysql -uroot -proot_password -hdb3 -se"stop slave;"
mysql -uroot -proot_password -hdb3 -se"reset slave all;"
mysql -uroot -proot_password -hdb3 -se"reset master;"
mysql -uroot -proot_password -hdb3 -se"change master to master_host='db1', master_port=3306, master_user='root', master_password='root_password', master_log_file='mysql-bin.000001', master_log_pos=4;"
mysql -uroot -proot_password -hdb3 -se"start slave;"
mysql -uroot -proot_password -hdb3 -se"show slave status\G"

mysql -uroot -proot_password -hdb1 -se"create database if not exists test;"
mysql -uroot -proot_password -hdb1 -se"create table if not exists test.tab (a int auto_increment primary key, b varchar(10));"

for _ in $(seq 1 1000); do
    mysql -uroot -proot_password -hdb1 -se"insert into test.tab(b) values('bbb')"
    sleep .1
done

# ./bin/mha.sh --redis-addr redis:6379 --follower-ping fp1 &
# ./bin/mha.sh --redis-addr redis:6379 --follower-source fs1 --source-dsn root:root_password@127.0.0.1:33061 &
# ./bin/mha.sh --redis-addr redis:6379 --follower-replica fr1 --replica-dsn root:root_password@127.0.0.1:33061 &
# ./bin/mha.sh --redis-addr redis:6379 --follower-replica fr2 --replica-dsn root:root_password@127.0.0.1:33062 &
# ./bin/mha.sh --redis-addr redis:6379 --leader --follower-pings fp1 --follower-source fs1 --follower-replicas fr1,fr2 &

# sleep 10

# mysql -uroot -proot_password -hdb1 -se"shutdown;"

# wait

# mysql -uroot -proot_password -hdb1 -se"show slave status\G"
# mysql -uroot -proot_password -hdb1 -se"show slave status\G"
