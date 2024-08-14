### concepts
- the leader is a must source.
- the follower is must replica.

## testing
```sh
# follower ping
./mha.sh --redis-addr redis:6379 --follower-ping fp1
./mha.sh --redis-addr redis:6379 --follower-ping fp2
./mha.sh --redis-addr redis:6379 --follower-replica fr1 --replica-dsn root:root_password@db2:3306
./mha.sh --redis-addr redis:6379 --follower-replica fr2 --replica-dsn root:root_password@db3:3306

./mha.sh --redis-addr redis:6379 --follower-source fs1 --source-dsn root:root_password@db1:3306

./mha.sh --redis-addr redis:6379 --leader --follower-pings fp1,fp2 --follower-source fs1 --follower-replicas fr1,fr2 #[--auto-failover] [--force-source=fr1]
```

### 

```sql
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
```


## 

MYSQL SOURCE -> MYSQL REPLICA
             -> MYSQL REPLICA