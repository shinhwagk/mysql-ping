#!/usr/bin/env bash

BASE_DIR="$(
    cd "$(dirname "$0")" || exit 1
    pwd
)"

. "$BASE_DIR/lib.sh"
. "$BASE_DIR/custom.sh"

push_replica_liveness() {
    push_mysql_liveness "replica" "${MYSQL_REPLICA_HOST}" "${MYSQL_REPLICA_PORT}" "${MYSQL_REPLICA_USER}" "${MYSQL_REPLICA_PASS}"
}

push_replica_gtidsets() {
    gtidsets=$(mysql_cli "${MYSQL_REPLICA_DSN}" -se "show master status\G" 2>/dev/null | grep -w 'Executed_Gtid_Set' | awk '{print $2}')
    redis_cli hset "replica:gtidsets" "${ROLE_NAME}" "$gtidsets" >/dev/null
    log "INFO" "replica gtidsets '$gtidsets'."
}

push_replica_running() {
    Slave_IO_Running=$(mysql -h${MYSQL_REPLICA_HOST} -P${MYSQL_REPLICA_PORT} -u${MYSQL_REPLICA_USER} -p${MYSQL_REPLICA_PASS} -se "show slave status\G" 2>/dev/null | grep -w 'Slave_IO_Running' | awk '{print $2}')
    Slave_SQL_Running=$(mysql -h${MYSQL_REPLICA_HOST} -P${MYSQL_REPLICA_PORT} -u${MYSQL_REPLICA_USER} -p${MYSQL_REPLICA_PASS} -se "show slave status\G" 2>/dev/null | grep -w 'Slave_SQL_Running' | awk '{print $2}')
    running=0
    if [[ $Slave_IO_Running == "Yes" ]] && [[ $Slave_SQL_Running == "Yes" ]]; then
        running=1
    fi
    redis_cli hset "replica:apply" "${ROLE_NAME}" $running >/dev/null
    log "INFO" "replica apply '$running'."
}

promote_mysql_source() {
    if [[ $(redis_cli get "replica:promote:source") == "$ROLE_NAME" ]]; then
        custom_failover_promote_mysql_replica "${MYSQL_REPLICA_HOST}" "${MYSQL_REPLICA_PORT}" "${MYSQL_REPLICA_USER}" "${MYSQL_REPLICA_PASS}" "$HOST_VIP" "$HOST_INTERFACE"
    fi
}

promote_mysql_replica() {
    if [[ $(redis_cli get "replica:promote:replica") == "$ROLE_NAME" ]]; then
        source_role_name=$(redis_cli get "replica:promote:source")
        source_addr=$(redis_cli get "source:addr:${source_role_name}")
        source_host=$(echo "$source_addr" | cut -d':' -f1)
        source_port=$(echo "$source_addr" | cut -d':' -f2)
        custom_failover_promote_mysql_replica "${MYSQL_REPLICA_HOST}" "${MYSQL_REPLICA_PORT}" "${MYSQL_REPLICA_USER}" "${MYSQL_REPLICA_PASS}" "${MYSQL_SOURCE_HOST}" "${MYSQL_SOURCE_PORT}"
    fi
}

main() {

    register_role

    # promote_mysql_source
    # promote_mysql_replica

    while true; do

        push_follower_liveness
        push_replica_liveness
        push_replica_running
        push_replica_gtidsets
        sleep 1
    done
}

check_commands
main
