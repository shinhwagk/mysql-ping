#!/usr/bin/env bash

mysql -uroot -proot_password -hdb1 -se"create user 'repl'@'%' identified by 'repl';"
mysql -uroot -proot_password -hdb1 -se"grant replication slave, replication client on *.* to 'repl'@'%';"

set -e

mysql -uroot -proot_password -hdb1 -se"drop database if exists test;"
mysql -uroot -proot_password -hdb2 -se"drop database if exists test;"
mysql -uroot -proot_password -hdb3 -se"drop database if exists test;"

mysql -uroot -proot_password -hdb1 -se"reset master;"

mysql -uroot -proot_password -hdb2 -se"stop slave;"
mysql -uroot -proot_password -hdb2 -se"reset slave all;"
mysql -uroot -proot_password -hdb2 -se"reset master;"
mysql -uroot -proot_password -hdb2 -se"change master to master_host='db1', master_port=3306, master_user='root', master_password='root_password', master_log_file='mysql-bin.000001', master_log_pos=4;"
mysql -uroot -proot_password -hdb2 -se"start slave;"
mysql -uroot -proot_password -hdb2 -se"show slave status\G"

mysql -uroot -proot_password -hdb3 -se"stop slave;"
mysql -uroot -proot_password -hdb3 -se"reset slave all;"
mysql -uroot -proot_password -hdb3 -se"reset master;"
mysql -uroot -proot_password -hdb3 -se"change master to master_host='db1', master_port=3306, master_user='root', master_password='root_password', master_log_file='mysql-bin.000001', master_log_pos=4;"
mysql -uroot -proot_password -hdb3 -se"start slave;"
mysql -uroot -proot_password -hdb3 -se"show slave status\G"

mysql -uroot -proot_password -hdb1 -se"create database if not exists test;"
mysql -uroot -proot_password -hdb1 -se"create table if not exists test.tab (a int auto_increment primary key, b varchar(10));"

while true; do
    mysql -uroot -proot_password -hdb1 -se"insert into test.tab(b) values('bbb')"
    sleep 1
done
