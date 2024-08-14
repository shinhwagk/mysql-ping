 
CREATE USER 'repl'@'%' IDENTIFIED BY 'repl';
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl'@'%';

CHANGE MASTER TO
  MASTER_HOST='db1',
  MASTER_PORT=3306,
  MASTER_USER='root',
  MASTER_PASSWORD='root_password',
  MASTER_LOG_FILE='mysql-bin.000001',
  MASTER_LOG_POS=4;

create database test;
create table test.tab(a int AUTO_INCREMENT primary key, b varchar(10));

while true; do
  mysql -hdb1 -uroot -proot_password -se "insert into test.tab(b) values('a')"
  sleep 1
done
 


## 

MYSQL SOURCE -> MYSQL REPLICA
             -> MYSQL REPLICA