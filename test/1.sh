#!/usr/bin/env bash

# MySQL 连接信息
MYSQL_HOST="db1"
MYSQL_USER="root"
MYSQL_PASSWORD="root_password"

REDIS_HOST="redis"
REDIS_PORT=6379

# 主服务器的 GTID 集合
MASTER_GTID_SET="ca61d9a6-5307-11ef-b75b-0242ac180004:1-80"

# 从服务器的 GTID 集合
SLAVE_GTID_SET_1="ca61d9a6-5307-11ef-b75b-0242ac180004:1-17"
SLAVE_GTID_SET_2="ca61d9a6-5307-11ef-b75b-0242ac180004:1-8"

redis_query_gtidsets() {
    redis-cli -h ${REDIS_HOST} -p ${REDIS_PORT} get "${1}"
}
# 比较 GTID 集合
compare_gtid_sets() {
    local master_gtid_set=$1
    local slave_gtid_set_1=$2
    local slave_gtid_set_2=$3

    # 计算每个从服务器与主服务器之间的 GTID 差异
    diff_slave1_master=$(mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD -se "SELECT GTID_SUBTRACT('$master_gtid_set', '$slave_gtid_set_1');")
    diff_slave2_master=$(mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD -se "SELECT GTID_SUBTRACT('$master_gtid_set', '$slave_gtid_set_2');")

    # 计算两个从服务器之间的 GTID 差异
    diff_slave1_slave2=$(mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD -se "SELECT GTID_SUBTRACT('$diff_slave1_master', '$diff_slave2_master');")
    diff_slave2_slave1=$(mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD -se "SELECT GTID_SUBTRACT('$diff_slave2_master', '$diff_slave1_master');")

    # 输出结果并比较
    if [ -z "$diff_slave1_slave2" ] && [ -n "$diff_slave2_slave1" ]; then
        echo "Slave 1 ($slave_gtid_set_1) is newer than Slave 2 ($slave_gtid_set_2)"
    elif [ -z "$diff_slave2_slave1" ] && [ -n "$diff_slave1_slave2" ]; then
        echo "Slave 2 ($slave_gtid_set_2) is newer than Slave 1 ($slave_gtid_set_1)"
    elif [ -z "$diff_slave1_slave2" ] && [ -z "$diff_slave2_slave1" ]; then
        echo "Both slaves are at the same replication state"
    else
        echo "The GTID sets are not directly comparable"
    fi
}

compare_gtidsets() {
    mysql -h$MYSQL_HOST -u$MYSQL_USER -p$MYSQL_PASSWORD -se "SELECT GTID_SUBTRACT('$1', '$2')" 2>/dev/null
}

# 比较两个从服务器的 GTID 集合
# compare_gtid_sets "$MASTER_GTID_SET" "$SLAVE_GTID_SET_1" "$SLAVE_GTID_SET_2"

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

elect_new_source
