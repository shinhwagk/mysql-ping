## Quick start
```sh
# deploy anywhere
./mha.sh --redis-addr redis:6379 --follower-ping fp1 --source-dsn root:root_password@db1:3306
./mha.sh --redis-addr redis:6379 --follower-ping fp2 --source-dsn root:root_password@db1:3306
# deploy on source
./mha.sh --redis-addr redis:6379 --follower-source fs1 --source-dsn root:root_password@db1:3306
# deploy on replica
./mha.sh --redis-addr redis:6379 --follower-replica fr1 --replica-dsn root:root_password@db2:3306
./mha.sh --redis-addr redis:6379 --follower-replica fr2 --replica-dsn root:root_password@db3:3306
# deploy anywhere
./mha.sh --redis-addr redis:6379 --leader --follower-pings fp1,fp2 --follower-source fs1 --follower-replicas fr1,fr2    

bun run leader.ts --follower-pings fp1,fp2 --follower-source fs1 --follower-replicas fr1,fr2
bun run ping.ts --leader-addr 127.0.0.1:3000 --follower-ping fp1 --source-dsn root:root_password@db1:3306
bun run ping.ts --leader-addr 127.0.0.1:3000 --follower-ping fp2 --source-dsn root:root_password@db1:3306

bun run replica.ts --leader-addr 127.0.0.1:3000 --follower-replica fr1 --replica-dsn root:root_password@db2:3306
bun run replica.ts --leader-addr 127.0.0.1:3000 --follower-replica fr2 --replica-dsn root:root_password@db3:3306

bun run source.ts --leader-addr 127.0.0.1:3000 --follower-source fs1 --source-dsn root:root_password@db1:3306


mha-leader --follower-pings fp1,fp2 --follower-source fs1 --follower-replicas fr1,fr2
mha-ping --leader-addr leader:3000 --follower-ping fp1 --source-dsn root:root_password@db1:3306
mha-source --leader-addr leader:3000 --follower-source fs1 --source-dsn root:root_password@db1:3306
mha-replica --leader-addr leader:3000 --follower-replica fr1 --replica-dsn root:root_password@db2:3306

bun build --compile ./index.ts --outfile simpleServer
```
