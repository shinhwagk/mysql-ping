#!/usr/bin/env bash
# shellcheck disable=SC2155

# function:
# 1. log_stdout "msg"

# params:
#   1. msg
# return:
#   $?: 0:ok, 1:err
# echo:
#   error
custom_alert_msg() {
    :
}

# params:
#   1. MYSQL_SOURCE_HOST
#   2. MYSQL_SOURCE_PORT
#   3. MYSQL_SOURCE_USER
#   4. MYSQL_SOURCE_PASS
# return:
#   $?: 0:ok, 1:err
# echo:
#   error
custom_check_mysql_liveness() {
    local error=""
    for _ in $(seq 1 5); do
        result=$(mysql -h"${1}" -P"${2}" -u"${3}" -p"${4}" -N -se "SELECT 'ok';" 2>&1)
        if echo "$result" | grep -Eqw "^ok$"; then
            return 0
        else
            error=$(echo "$result" | grep -qv 'Using a password on the command line interface can be insecure.')
        fi
        sleep $((RANDOM % 11))
    done
    echo "${error}"
    return 1
}

# params:
# 1. TEMP_DIR
# return:
#   $?: 0:ok, 1:err
custom_failover_pre() {
    local failover_file="${TEMP_DIR}/failover.${RANDOM}"
    touch $failover_file
    while [[ -f "${failover_file}" ]]; do
        log_stdout "failover after delete ${failover_file}."
        sleep 1
    done
}

# desc:
#   exec on mha role source
# params:
#   1. MYSQL_SOURCE_HOST
#   2. MYSQL_SOURCE_PORT
#   3. MYSQL_SOURCE_USER
#   4. MYSQL_SOURCE_PASS
# return:
#   $?: 0:ok, 1:err
# echo:
#   error
custom_failover_demote_mysql_source() {
    # ip dev del
    echo "demote mysql source success."
}

# desc:
#   exec on mha role replica
# params:
#   1. MYSQL_REPLICA_HOST
#   2. MYSQL_REPLICA_PORT
#   3. MYSQL_REPLICA_USER
#   4. MYSQL_REPLICA_PASS
#   5. HOST_VIP
#   6. HOST_INTERFACE
# return:
#   $?: 0:ok, 1:err
# files:
#   stderr: "$TEMP_DIR/custom_failover_promote_mysql_replica.err.log"
#   stdout: "$TEMP_DIR/custom_failover_promote_mysql_replica.out.log"
# echo:
#   error
custom_failover_promote_mysql_replica() {
    mysql -h"${1}" -P"${2}" -u"${3}" -p"${4}" -v -e "stop slave; set global super_read_only=0; set global read_only=0;" >"$TEMP_DIR/custom_failover_promote_mysql_replica.out.log" 2>"$TEMP_DIR/custom_failover_promote_mysql_replica.err.log"
    # ip addr add $5/24 dev "$6"
    # arping -q -c 2 -U -I "$6" "$5"
}

# desc:
#   exec on mha role replica
# params:
#   1. MYSQL_REPLICA_HOST
#   2. MYSQL_REPLICA_PORT
#   3. MYSQL_REPLICA_USER
#   4. MYSQL_REPLICA_PASS
#   5. MYSQL_SOURCE_NEW_HOST
#   6. MYSQL_SOURCE_NEW_PORT
# return:
#   $?: 0:ok, 1:err
# echo:
#   error
custom_failover_repoint_mysql_replica() {
    mysql -h"${1}" -P"${2}" -u"${3}" -p"${4}" -v -e "STOP SLAVE; CHANGE REPLICATION SOURCE TO SOURCE_HOST='${5}', SOURCE_PORT=${6}, MASTER_AUTO_POSITION=1; START SLAVE;" >"$TEMP_DIR/custom_failover_repoint_mysql_replica.out.log" 2>"$TEMP_DIR/custom_failover_repoint_mysql_replica.err.log"
}

# envs:
#   MHA_REPLICA_STATUS_LOGFILE_fr*
#   MHA_REPLICA_STATUS_LOGPOS_fr*
#   MHA_REPLICA_GTIDSETS_fr*
#   MHA_REPLICA_LIVE_fr*
#   MHA_REPLICAS fr1,fr2,fr3
custom_elect_new_source_from_replicas() {
    local fn_newest=""
    for fn in ${MHA_REPLICAS//,/ }; do
        vn="MHA_REPLICA_LIVE_${fn}"

        if [[ ${!vn} == 0 ]]; then
            continue
        fi

        if [[ -z "$fn_newest" ]]; then
            fn_newest=$fn
        fi

        vn_cur="MHA_REPLICA_STATUS_LOGFILE_${fn}"
        local logfile_cur=${!vn_cur}
        local logfile_cur_n="${logfile_cur//[^0-9]/}"

        vn_new="MHA_REPLICA_STATUS_LOGFILE_${fn_newest}"
        local logfile_new=${!vn_new}
        local logfile_new_n="${logfile_new//[^0-9]/}"

        if ((logfile_cur_n > logfile_new_n)); then
            fn_newest=$fn
        elif ((logfile_cur_n < logfile_new_n)); then
            :
        else
            vn_cur="MHA_REPLICA_STATUS_LOGPOS_${fn}"
            local logpos_cur=${!vn_cur}
            local logpos_cur_n="${logpos_cur//[^0-9]/}"

            vn_new="MHA_REPLICA_STATUS_LOGPOS_${fn_newest}"
            local logpos_new=${!vn_new}
            local logpos_new_n="${logpos_new//[^0-9]/}"

            if ((logpos_cur_n > logpos_new_n)); then
                fn_newest=$fn
            elif ((logfile_cur_n < logfile_new_n)); then
                :
            else
                :
            fi
        fi
    done
    if [[ -z $fn_newest ]]; then
        return 1
    else
        echo "$fn_newest"
    fi
}

# return:
#   $?: 0:ok, 1:err
custom_failover_post() {
    :
}
