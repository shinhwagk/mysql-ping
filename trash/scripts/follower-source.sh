#!/usr/bin/env bash

BASE_DIR="$(
    cd "$(dirname "$0")"
    pwd
)"

. $BASE_DIR/custom.sh

# push_replica_liveness() {
#     live=0
#     mysqladmin -h${MYSQL_REPLICA_HOST} -P${MYSQL_REPLICA_PORT} -u${MYSQL_REPLICA_USER} -p${MYSQL_REPLICA_PASS} ping 2>/dev/null | grep -w 'mysqld is alive' >/dev/null
#     [[ $? == 0 ]] && live=1
#     redis_cli set "replica:liveness:${ROLE_NAME}" $live >/dev/null
# }

register_source_addr() {
    redis_cli sadd "source:addr:${ROLE_NAME}" "$ROLE_NAME" >/dev/null
}

push_follower_liveness() {
    redis_cli set "follower:liveness:${ROLE_NAME}" 1 EX 5 >/dev/null
}

push_source_gtidsets() {
    gtidsets=$(mysql -h${MYSQL_SOURCE_HOST} -P${MYSQL_SOURCE_PORT} -u${MYSQL_SOURCE_USER} -p${MYSQL_SOURCE_PASS} -se "show master status\G" 2>/dev/null | grep -w 'Executed_Gtid_Set' | cut -d' ' -f2)
    redis_cli set "source:gtidsets:${ROLE_NAME}" "$gtidsets" >/dev/null
}

main() {
    register_role

    while true; do
        push_follower_liveness
        push_source_gtidsets
        sleep 1
    done
}
