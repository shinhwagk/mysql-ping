#!/usr/bin/env bash

set -e

push_leader_liveness() {
    redis_cli set "leader:liveness:${ROLE_NAME}" 1 EX 5 >/dev/null
}

check_source_liveness() {
    for livekey in $(redis-cli -h ${REDIS_HOST} -p ${REDIS_PORT} keys "source:liveness:*"); do
        if [[ "$(redis-cli -h ${REDIS_HOST} -p ${REDIS_PORT} get "$livekey")" == "1" ]]; then
            echo 1
            return
        fi
    done
    echo 0
}

redis_query_gtidsets() {
    edis-cli -h ${REDIS_HOST} -p ${REDIS_PORT} get "${1}"
}

compare_gtidsets() {
    mysql -h${MYSQL_REPLICA_HOST} -P${MYSQL_REPLICA_PORT} -u${MYSQL_REPLICA_USER} -p${MYSQL_REPLICA_PASS} -se "SELECT GTID_SUBTRACT('$1', '$2')"
}

elect_new_source_from_replicas() {
    source_gtidsets=$(redis-cli -h ${REDIS_HOST} -p ${REDIS_PORT} get "source:gtidsets:fs1")
    replica_key_newest=""
    replica_gtidsets_newest=""
    for gsskey in $(redis-cli -h ${REDIS_HOST} -p ${REDIS_PORT} keys "replica:gtidsets:fr*"); do
        replica_gtidsets=$(redis_query_gtidsets "$gsskey")

        if [[ -z $replica_gtidsets_newest ]]; then
            replica_gtidsets_newest=$replica_gtidsets
            replica_key_newest=$gsskey
            continue
        fi

        source_replica_diff_gtidsets_last=$(compare_gtidsets "$source_gtidsets" "$replica_gtidsets_newest")
        source_replica_diff_gtidsets_curr=$(compare_gtidsets "$source_gtidsets" "$replica_gtidsets")

        diff_replica_replica2=$(compare_gtidsets "$source_replica_diff_gtidsets_last" "$source_replica_diff_gtidsets_curr")
        diff_replica_replica1=$(compare_gtidsets "$source_replica_diff_gtidsets_curr" "$source_replica_diff_gtidsets_last")

        if [[ -n "$diff_replica_replica2" ]] && [[ -n "$diff_replica_replica1" ]]; then
            :
        elif [[ -z "$diff_replica_replica2" ]] && [[ -z "$diff_replica_replica1" ]]; then
            :
        elif [[ -z "$diff_replica_replica2" ]] && [[ -n "$diff_replica_replica1" ]]; then
            :
        elif [[ -z "$diff_replica_replica1" ]] && [[ -n "$diff_replica_replica2" ]]; then
            replica_gtidsets_newest=$replica_gtidsets
            replica_key_newest=$gsskey
        else
            :
        fi
    done
    echo $replica_key_newest
}

elect_new_source() {
    if [[ -z $CANDIDATE_MASTER ]]; then
        elect_new_source_from_replicas
    fi
}

main() {

}

# push_leader_liveness

# if [[ $(check_source_liveness) == 0 ]]; then
#     echo "fower"
# fi
