#!/usr/bin/env bash
# shellcheck disable=SC2155

VERSION="v0.0.1"

BASE_DIR="$(dirname "${BASH_SOURCE[0]}")"

readonly TEMP_DIR=$(mktemp -d /tmp/mha.XXXXXX)

n_grep() {
    GREP_OPTIONS='' command grep "$@"
}

log_stdout() {
    local log_msg=$1
    local datetime=$(date '+%Y-%m-%d %H:%M:%S')
    printf "%s -- INFO(%s) -- %s\n" "${datetime}" "${GLB_FOLLOWER_NAME}" "${log_msg}"
}

log_stderr() {
    local log_msg=$1
    local datetime=$(date '+%Y-%m-%d %H:%M:%S')
    printf "%s -- ERROR(%s) -- %s\n" "${datetime}" "${GLB_FOLLOWER_NAME}" "${log_msg}" >&2

}

check_command() {
    local cmd="$1"

    if ! command -v "$cmd" &>/dev/null; then
        log_stderr "Error: Command '$cmd' not found."
        exit 1
    fi
}

parse_mysql_dsn() {
    local dsn="$1"
    local user_pass
    local ip_port

    local user_pass=$(echo "${dsn}" | cut -d'@' -f1)
    local ip_port=$(echo "${dsn}" | cut -d'@' -f2)

    local username=$(echo "${user_pass}" | cut -d':' -f1)
    local password=$(echo "${user_pass}" | cut -d':' -f2)

    local host=$(echo "${ip_port}" | cut -d':' -f1)
    local port=$(echo "${ip_port}" | cut -d':' -f2)

    echo "${host} ${port} ${username} ${password}"
}

mysql_cli() {
    local dsn="$1"
    shift
    local credentials=$(parse_mysql_dsn "${dsn}")

    read -r mhost mport muser mpass <<<"${credentials}"
    mysql -h"${mhost}" -P"${mport}" -u"${muser}" -p"${mpass}" "$@"
}

redis_cli() {
    redis-cli -h "${GLB_REDIS_HOST}" -p "${GLB_REDIS_PORT}" "$@"
}

redis_set() {
    redis_cli "$@" >/dev/null || exit 1
}

redis_get() {
    redis_cli "$@"
}

register_mysql_dsn() {
    local mysql_dsn="${1}"
    redis_set hset mha:mysql:dsn "${GLB_FOLLOWER_NAME}" "${mysql_dsn}"
    log_stdout "register mysql dsn."
}

get_followners() {
    redis_get hkeys mha:follower:liveness
}

get_ping_followners() {
    get_followners | n_grep -E '^fp[0-9]+$'
}

get_replicas_followers() {
    get_followners | n_grep -E '^fr[0-9]+$' | sort -t 'r' -k2,2n
}

get_source_dsn_by_follower_name() {
    redis_get hget mha:mysql:dsn fs1
}

push_follower_liveness() {
    redis_set hset mha:follower:liveness "${GLB_FOLLOWER_NAME}" "$(date '+%s')"
    log_stdout "push follower liveness."
}

follower_replica__push_replica_status_running() {
    local running_file="$1"

    local tmp_file="${TEMP_DIR}/status.${GLB_FOLLOWER_NAME}.cache"
    mysql_cli "$GLB_MYSQL_REPLICA_DSN" -se "show slave status\G" 2>/dev/null | grep -wE '(Slave_IO_Running|Slave_SQL_Running|Relay_Master_Log_File|Exec_Master_Log_Pos)' >"$tmp_file"
    local io_running=$(grep -w Slave_IO_Running "$tmp_file" | awk '{print $2}')
    local sql_running=$(grep -w Slave_SQL_Running "$tmp_file" | awk '{print $2}')
    local exec_master_log_file=$(grep -w Relay_Master_Log_File "$tmp_file" | awk '{print $2}')
    local exec_master_log_pos=$(grep -w Exec_Master_Log_Pos "$tmp_file" | awk '{print $2}')

    if [[ $io_running == "Yes" ]]; then
        redis_set hset "mha:replica:status:io" "${GLB_FOLLOWER_NAME}" 1
    else
        redis_set hset "mha:replica:status:io" "${GLB_FOLLOWER_NAME}" 0
    fi
    if [[ $sql_running == "Yes" ]]; then
        redis_set hset "mha:replica:status:sql" "${GLB_FOLLOWER_NAME}" 1
    else
        redis_set hset "mha:replica:status:sql" "${GLB_FOLLOWER_NAME}" 0
    fi
    redis_set hset "mha:replica:status:logfile" "${GLB_FOLLOWER_NAME}" "${exec_master_log_file}"
    redis_set hset "mha:replica:status:logpos" "${GLB_FOLLOWER_NAME}" "${exec_master_log_pos}"
    redis_set hset "mha:replica:status:ts" "${GLB_FOLLOWER_NAME}" "$(date '+%s')"

    log_stdout "push status complate."
    rm -f "$running_file"
}

follower_replica__push_replica_status() {
    local running_file="${TEMP_DIR}/status.${GLB_FOLLOWER_NAME}.running"

    if [[ -f "$running_file" ]]; then
        log_stdout "wait push status."
        return
    fi

    touch "$running_file"
    follower_replica__push_replica_status_running "$running_file" &
}

follower_leader__xxx() {
    local ping_follower_name=$1
    local follower_key="${ping_follower_name}-fs1"
    local tmp_file="${TEMP_DIR}/source_liveness_${ping_follower_name}-fs1"
    while true; do
        if check_follower_live "$ping_follower_name"; then
            local source_liveness_status=$(redis_get hget mha:source:liveness "$follower_key")
            if [[ -n $source_liveness_status ]]; then
                echo "$source_liveness_status" >"$tmp_file"
                break
            fi
            sleep 1
        else
            echo "" >"$tmp_file"
            break
        fi
    done
}

follower_leader__check_source_liveness() {
    local ping_follower_cnt=$(get_ping_followners | wc -l)
    local ping_follower_down_cnt=0
    local ping_follower_mysql_down_cnt=0
    local ping_follower_mysql_live_cnt=0
    for ping_follower_name in $(get_ping_followners); do
        follower_leader__xxx "$ping_follower_name" &
    done
    log_stdout "wait all ping source liveness."
    wait
    log_stdout "wait all ping source liveness done."

    for tmp_file in "${TEMP_DIR}"/source_liveness_fp*-fs1; do
        local status=$(cat "${tmp_file}")
        if [[ -z $status ]]; then
            ((ping_follower_down_cnt++))
        elif [[ $status == 1 ]]; then
            ((ping_follower_mysql_live_cnt++))
        elif [[ $status == 0 ]]; then
            ((ping_follower_mysql_down_cnt++))
        fi
    done

    log_stdout "ping_follower_mysql_live_cnt ${ping_follower_mysql_live_cnt}, ping_follower_mysql_down_cnt ${ping_follower_mysql_down_cnt}, ping_follower_down_cnt ${ping_follower_down_cnt}"
    [[ $ping_follower_mysql_live_cnt == 0 ]] && return 1 || return 0
}

compare_gtidsets() {
    mysql -hdb2 -uroot -proot_password -se "SELECT GTID_SUBTRACT('$1', '$2')" 2>/dev/null
}

elect_new_source_from_replicas() {
    if [[ $(get_replicas_followers | wc -l) -eq 1 ]]; then
        get_replicas_followers
        return
    fi

    local replica_follower_name_newest=""
    local replica_gtidsets_newest=""
    for replica_follower_name in $(redis_get hkeys mha:mysql:gtidsets | n_grep -E '^fr[0-9]+$'); do
        replica_gtidsets=$(redis_get hget "mha:mysql:gtidsets" "$replica_follower_name")

        if [[ -z $replica_gtidsets_newest ]]; then
            replica_gtidsets_newest=$replica_gtidsets
            replica_follower_name_newest=$replica_follower_name
            continue
        fi

        local diff_1=$(compare_gtidsets "$replica_gtidsets" "$replica_gtidsets_newest")
        local diff_2=$(compare_gtidsets "$replica_gtidsets_newest" "$replica_gtidsets")

        if [[ -z "$diff_1" && -n "$diff_2" ]]; then
            replica_gtidsets_newest=$replica_gtidsets
            replica_follower_name_newest=$replica_follower_name
        else
            :
        fi
    done
    echo "$replica_follower_name_newest"
}

check_mysql_live() {
    local mysql_dsn="${1}"
    read -r MYSQL_HOST MYSQL_PORT MYSQL_USER MYSQL_PASS <<<"$(parse_mysql_dsn "$mysql_dsn")"
    if custom_check_mysql_liveness "${MYSQL_HOST}" "${MYSQL_PORT}" "${MYSQL_USER}" "${MYSQL_PASS}"; then
        return 0
    else
        return 1
    fi
}

check_global_status() {
    local status="${1}"
    [[ "$(redis_get get "mha:global:status")" == "${status}" ]]
}

set_global_status() {
    # setup monitor pre-failover failover post-failover
    local status="${1}"
    redis_set set "mha:global:status" "${status}"
    log_stdout "global status change to ${status}."
}

follower_source__demote_running() {
    local done_file="${1}"

    local status=0

    read -r MYSQL_HOST MYSQL_PORT MYSQL_USER MYSQL_PASS <<<"$(parse_mysql_dsn "$GLB_MYSQL_SOURCE_DSN")"
    if custom_failover_demote_mysql_source "${MYSQL_HOST}" "${MYSQL_PORT}" "${MYSQL_USER}" "${MYSQL_PASS}"; then
        status=1
    fi
    redis_set hset mha:failover demote $status
    touch "$done_file"
}

follower_source__demote() {
    local running_file="${TEMP_DIR}/demote.${GLB_FOLLOWER_NAME}.running"
    local done_file="${TEMP_DIR}/demote.${GLB_FOLLOWER_NAME}.done"

    if [[ -f "$running_file" || -f "$done_file" ]]; then
        return
    fi

    redis_set hdel mha:failover demote
    log_stdout "clear mha:failover demote."

    touch "$running_file"
    follower_source__demote_running "$done_file" &
}

check_follower_live() {
    local follower_name=$1
    local follower_liveness_ts_curr=$(redis_get hget mha:follower:liveness "${follower_name}")
    sleep 2
    local follower_liveness_ts_last=$(redis_get hget mha:follower:liveness "${follower_name}")
    [[ "${follower_liveness_ts_last}" -le "${follower_liveness_ts_curr}" ]] && return 1 || return 0
}

leader__wait_all_followers_ready() {
    for follower_name in "${GLB_FOLLOWERS[@]}"; do
        while true; do
            if check_follower_live "$follower_name"; then
                break
            else
                log_stdout "${follower_name} not ready."
                sleep 1
            fi
        done
    done
}

follower_ping__push_source_liveness_running() {
    local done_file="$1"
    local follower_key="$2"
    local source_dsn="$3"

    local status="0"
    if check_mysql_live "${source_dsn}"; then
        log_stdout "source live."
        status="1"
    else
        log_stdout "source down."
    fi
    redis_set hset mha:source:liveness "${follower_key}" $status
    touch "$done_file"
}

follower_ping__push_source_liveness() {
    local source_dsn="${1}"
    local follower_key="${GLB_FOLLOWER_NAME}-fs1"

    local running_file="${TEMP_DIR}/source.liveness.${GLB_FOLLOWER_NAME}.running"
    local done_file="${TEMP_DIR}/source.liveness.${GLB_FOLLOWER_NAME}.done"

    if [[ -f "$done_file" ]] || [[ ! -f "$done_file" && ! -f "$running_file" ]]; then
        local source_liveness_status=$(redis_get hget mha:source:liveness "${follower_key}")
        [[ -z "${source_liveness_status}" ]] && rm -f "$running_file"
    fi

    if [[ -f "$running_file" ]]; then
        log_stdout "running source liveness."
        return
    fi

    redis_set hdel mha:source:liveness "$follower_key"
    log_stdout "clear mha:source:liveness '$follower_key'."

    touch "$running_file"
    follower_ping__push_source_liveness_running "$done_file" "$follower_key" "$source_dsn" &
}

main_follower_ping() {
    log_stdout "ready."

    local source_dsn=""

    while true; do
        if check_global_status "setup"; then
            source_dsn=""
            log_stdout "setup complate"
        fi

        push_follower_liveness

        if check_global_status "monitor"; then
            if [[ -z $source_dsn ]]; then
                source_dsn=$(get_source_dsn_by_follower_name)
            fi
            follower_ping__push_source_liveness "${source_dsn}"
        fi

        if check_global_status "done"; then
            log_stdout "failover success."
            exit 0
        fi

        if check_global_status "failure"; then
            log_stdout "failover failure."
            exit 1
        fi
        sleep 1
    done
}

push_mysql_gtidsets() {
    local mysql_dsn="$1"
    local error_file="${TEMP_DIR}/query_gtidsets.err.log"
    if gtidsets=$(mysql_cli "${mysql_dsn}" -se "show master status;" 2>"${error_file}" | awk '{print $NF}' | sed 's/\\n//g'); then
        redis_set hset mha:mysql:gtidsets "${GLB_FOLLOWER_NAME}" "${gtidsets}"
        log_stdout "push mysql gtidsets '${gtidsets}'."
    else
        sed -i '1d' "${error_file}"
        log_stdout "$error_file"
        log_stderr "$(cat "${error_file}")"
    fi
    redis_set hset mha:mysql:gtidsets:ts "${GLB_FOLLOWER_NAME}" "$(date '+%s')"
}

follower_replica__push_gtidsets_running() {
    local running_file="$1"
    local mysql_dsn="$2"

    push_mysql_gtidsets "$mysql_dsn"
    log_stdout "push gitdsets complate."

    rm -f "$running_file"
}

follower__push_gtidsets() {
    local follonwer_name="$1"
    local mysql_dsn="$2"

    local running_file="${TEMP_DIR}/gtidsets.${follonwer_name}.running"

    if [[ -f "$running_file" ]]; then
        log_stdout "wait push gtidsets."
        return
    fi

    touch "$running_file"
    follower_replica__push_gtidsets_running "$running_file" "$mysql_dsn" &
}

follower_source__push_gtidsets() {
    follower__push_gtidsets "$GLB_FOLLOWER_NAME" "$GLB_MYSQL_SOURCE_DSN"
}

follower_replica__push_gtidsets() {
    follower__push_gtidsets "$GLB_FOLLOWER_NAME" "$GLB_MYSQL_REPLICA_DSN"
}

follower_replica__promote_running() {
    local done_file="${1}"

    local status=0

    read -r MYSQL_HOST MYSQL_PORT MYSQL_USER MYSQL_PASS <<<"$(parse_mysql_dsn "$GLB_MYSQL_REPLICA_DSN")"
    if custom_failover_promote_mysql_replica "${MYSQL_HOST}" "${MYSQL_PORT}" "${MYSQL_USER}" "${MYSQL_PASS}"; then
        status=1
    fi
    redis_set hset mha:failover promote $status
    touch "$done_file"
}

follower_replica__promote() {
    local running_file="${TEMP_DIR}/promote.${GLB_FOLLOWER_NAME}.running"
    local exclude_file="${TEMP_DIR}/promote.${GLB_FOLLOWER_NAME}.exclude"
    local done_file="${TEMP_DIR}/promote.${GLB_FOLLOWER_NAME}.done"

    if [[ -f "$exclude_file" || -f "$running_file" || -f "$done_file" ]]; then
        return
    fi

    if [[ $(redis_get hget mha:failover promote:follonwer) != "$GLB_FOLLOWER_NAME" ]]; then
        touch "$exclude_file"
    fi

    redis_set hdel mha:failover promote
    log_stdout "clear mha:failover promote."

    touch "$running_file"
    follower_replica__promote_running "$done_file" &
}

follonwer_replica__repoint_running() {
    local done_file="${1}"
    local status=0

    local promote_follower_name=$(redis_get hget mha:failover promote:follonwer)

    local promote_mysql_dsn=$(redis_get hget mha:mysql:dsn "$promote_follower_name")

    read -r MYSQL_SOURCE_HOST MYSQL_SOURCE_PORT _ _ <<<"$(parse_mysql_dsn "$promote_mysql_dsn")"
    read -r MYSQL_HOST MYSQL_PORT MYSQL_USER MYSQL_PASS <<<"$(parse_mysql_dsn "$GLB_MYSQL_REPLICA_DSN")"

    if custom_failover_repoint_mysql_replica "${MYSQL_HOST}" "${MYSQL_PORT}" "${MYSQL_USER}" "${MYSQL_PASS}" "${MYSQL_SOURCE_HOST}" "${MYSQL_SOURCE_PORT}"; then
        status=1
    fi
    redis_set hset mha:failover "repoint:${GLB_FOLLOWER_NAME}" $status
    touch "$done_file"
}

follonwer_replica__repoint() {
    local running_file="${TEMP_DIR}/repoint.${GLB_FOLLOWER_NAME}.running"
    local exclude_file="${TEMP_DIR}/repoint.${GLB_FOLLOWER_NAME}.exclude"
    local done_file="${TEMP_DIR}/repoint.${GLB_FOLLOWER_NAME}.done"

    if [[ -f "$exclude_file" || -f "$running_file" || -f "$done_file" ]]; then
        return
    fi

    if [[ $(redis_get hget mha:failover promote:follonwer) == "$GLB_FOLLOWER_NAME" ]]; then
        touch "$exclude_file"
        return
    fi

    redis_set hdel mha:failover "repoint:${GLB_FOLLOWER_NAME}"
    log_stdout "clear mha:failover repoint:${GLB_FOLLOWER_NAME}."

    touch "$running_file"
    follonwer_replica__repoint_running "$done_file" &
}

main_follower_replica() {
    log_stdout "temp dir: ${TEMP_DIR}."
    log_stdout "ready."

    # check replica running ok.
    register_mysql_dsn "${GLB_MYSQL_REPLICA_DSN}"

    while true; do
        if check_global_status "setup"; then
            register_mysql_dsn "${GLB_MYSQL_REPLICA_DSN}"
        fi

        push_follower_liveness

        if check_global_status "monitor" || check_global_status "failover-pre" || check_global_status "failover-demote-source" || check_global_status "failover-promote-replica"; then
            follower_replica__push_replica_status
            follower_replica__push_gtidsets
        fi

        if check_global_status "failover-promote-replica"; then
            follower_replica__promote
        fi

        if check_global_status "failover-repoint-replicas"; then
            follonwer_replica__repoint
        fi

        if check_global_status "done"; then
            log_stdout "failover success."
            exit 0
        fi

        if check_global_status "failure"; then
            log_stdout "failover failure."
            exit 1
        fi
        sleep 1
    done
}

main_follower_source() {
    log_stdout "ready."

    register_mysql_dsn "${GLB_MYSQL_SOURCE_DSN}"

    while true; do
        redis_get get mha:global:status

        if check_global_status "setup"; then
            register_mysql_dsn "${GLB_MYSQL_SOURCE_DSN}"
        fi

        push_follower_liveness

        if check_global_status "monitor" || check_global_status "failover-pre" || check_global_status "failover-demote-source"; then
            follower_source__push_gtidsets
        fi

        if check_global_status "failover-demote-source"; then
            follower_source__demote
        fi

        if check_global_status "done"; then
            log_stdout "failover success."
            exit 0
        fi

        if check_global_status "failure"; then
            log_stdout "failover failure."
            exit 1
        fi
        sleep 1
    done
}

main_leader() {
    local promote_follower_name=""

    set_global_status "setup"

    while true; do
        if check_global_status "setup"; then
            leader__wait_all_followers_ready
            set_global_status "monitor"
        fi

        if check_global_status "monitor"; then
            if follower_leader__check_source_liveness; then
                for ping_follower_name in $(get_ping_followners); do
                    redis_set hdel mha:source:liveness "${ping_follower_name}-fs1"
                done
            else
                set_global_status "failover-pre"
            fi
        fi

        if check_global_status "failover-pre"; then
            if custom_failover_pre "$TEMP_DIR"; then
                set_global_status "failover-demote-source"
            else
                set_global_status "failure"
                log_stderr "global status: 'failover-pre' failure."
            fi
        fi

        if check_global_status "failover-demote-source"; then
            while true; do
                if check_follower_live "fs1"; then
                    if [[ $(redis_get hget mha:failover demote) == 1 ]]; then
                        log_stderr "failover demote success."
                        set_global_status "failover-promote-replica"
                        break
                    elif [[ $(redis_get hget mha:failover demote) == 0 ]]; then
                        set_global_status "failure"
                        log_stderr "failover demote source failure."
                    fi
                else
                    set_global_status "failover-replica"
                    break
                fi
                sleep 1
            done
        fi

        if check_global_status "failover-promote-replica"; then
            promote_follower_name=$(elect_new_source_from_replicas)

            if [[ -z "$promote_follower_name" ]]; then
                set_global_status "failure"
                continue
            fi

            log_stdout "promote follower name: ${promote_follower_name}"
            redis_set hset mha:failover promote:follonwer "$promote_follower_name"

            while true; do
                if check_follower_live "$promote_follower_name"; then
                    local promote_status=$(redis_get hget mha:failover promote)
                    if [[ -n $promote_status ]]; then
                        log_stdout "wait promote source."
                        if [[ "$promote_status" == 1 ]]; then
                            set_global_status "failover-repoint-replicas"
                        elif [[ "$promote_status" == 0 ]]; then
                            log_stderr "failover promote replica '${promote_follower_name}' failure."
                            set_global_status "failure"
                        fi
                        log_stdout "repoint complate."
                        break
                    fi
                else
                    log_stderr "failover promote replica '${promote_follower_name}' failure."
                    set_global_status "failure"
                fi
                sleep 1
            done
        fi

        if check_global_status "failover-repoint-replicas"; then
            local repoint_count=0
            local failure_count=0
            local success_count=0
            for follower_name in $(get_replicas_followers | n_grep -wv "${promote_follower_name}"); do
                ((repoint_count++))
                log_stdout "check repoint"
                while true; do
                    if check_follower_live "$follower_name"; then
                        local repoint_status=$(redis_get hget mha:failover "repoint:${follower_name}")
                        if [[ -n $repoint_status ]]; then
                            if [[ "$repoint_status" == 1 ]]; then
                                ((success_count++))
                            elif [[ "$repoint_status" == 0 ]]; then
                                ((failure_count++))
                            fi
                            log_stderr "repoint complate."
                            break
                        fi
                    else
                        ((failure_count++))
                        log_stderr "follower down."
                        break
                    fi
                done
                sleep 1
            done
            set_global_status "failover-post"
        fi

        if check_global_status "failover-post"; then
            if custom_failover_post; then
                set_global_status "done"
            else
                log_stdout "wait failover post."
            fi
        fi

        if check_global_status "done"; then
            log_stdout "failover success."
            exit 0
        fi

        if check_global_status "failure"; then
            log_stdout "failover failure."
            exit 1
        fi
        sleep 1
    done
}

main_monitor() {
    :
}

print_help() {
    cat <<EOF
Usage: ${0##*/} [OPTIONS]

Options:
    --redis-addr value

    --follower-source VALUE     Specify the follower source.
        --source-dsn VALUE

    --follower-ping VALUE       Specify the follower ping.

    --follower-replica VALUE    Specify the follower replica.
        --replica-dsn VALUE         Specify the replica DSN.

    --leader
        --follower-pings
        --follower-replicas
        --follower-source

    --monitor

    --help                      Display this help message and exit.

Description:
  This script parses the provided options and their values. Use the appropriate
  options to set the values for follower source, follower ping, follower replica,
  and replica DSN.

EOF
}

check_command mysql
check_command redis-cli

if [[ $# -eq 0 ]]; then
    echo "No arguments provided."
    print_help
    exit 1
fi

while [[ $# -gt 0 ]]; do
    case "$1" in
    --redis-addr)
        GLB_REDIS_HOST=$(echo "${2}" | cut -d':' -f1)
        GLB_REDIS_PORT=$(echo "${2}" | cut -d':' -f2)
        shift 2
        ;;
    --follower-source | -fs)
        GLB_MHA_ROLE="follower-source"
        GLB_FOLLOWER_NAME="${2}"
        shift 2
        if [[ "$1" == "--source-dsn" ]] || [[ "$1" == "-sd" ]]; then
            GLB_MYSQL_SOURCE_DSN="$2"
            shift 2
        fi
        ;;
    --follower-ping | -fp)
        GLB_MHA_ROLE="follower-ping"
        GLB_FOLLOWER_NAME="${2}"
        shift 2
        ;;
    --follower-replica | -fr)
        GLB_MHA_ROLE="follower-replica"
        GLB_FOLLOWER_NAME="${2}"
        shift 2
        if [[ "$1" == "--replica-dsn" ]] || [[ "$1" == "-rd" ]]; then
            GLB_MYSQL_REPLICA_DSN="$2"
            shift 2
        fi
        ;;
    --leader | -l)
        shift 1
        GLB_MHA_ROLE="leader"
        GLB_FOLLOWER_NAME="l1"
        GLB_FOLLOWERS=()
        if [[ "$1" == "--follower-pings" ]] || [[ "$1" == "-fps" ]]; then
            readarray -t lines < <(echo "${2}" | tr ',' '\n')
            for f in "${lines[@]}"; do
                GLB_FOLLOWERS+=("${f}")
            done
            shift 2
        fi
        if [[ "$1" == "--follower-source" ]] || [[ "$1" == "-fs" ]]; then
            GLB_FOLLOWERS+=("${2}")
            shift 2
        fi
        if [[ "$1" == "--follower-replicas" ]] || [[ "$1" == "-frs" ]]; then
            readarray -t lines < <(echo "${2}" | tr ',' '\n')
            for f in "${lines[@]}"; do
                GLB_FOLLOWERS+=("${f}")
            done
            shift 2
        fi

        # if [[ "$1" == "--auto-failover" ]] || [[ "$1" == "-af" ]]; then
        #     GLB_AUTO_FAILOVER="true"
        #     shift 1
        # fi
        # if [[ "$1" == "--force-source" ]] || [[ "$1" == "-fs" ]]; then
        #     GLB_FORCE_SOURCE="true"
        #     shift 2
        # fi
        ;;
    --monitor | -m)
        GLB_MHA_ROLE="monitor"
        exit 0
        ;;
    --help | -h)
        print_help
        exit 0
        ;;
    --version | -v)
        echo "${VERSION}"
        exit 0
        ;;
    *)
        echo "Unknown option: $1"
        print_help
        exit 1
        ;;
    esac
done

if [[ -f "$BASE_DIR/custom.sh" ]]; then
    # shellcheck source=/dev/null
    source "$BASE_DIR/custom.sh"
else
    log_stderr "file custom.sh not exists."
    exit 1
fi

if [[ "$GLB_MHA_ROLE" == "follower-ping" ]]; then
    main_follower_ping
elif [[ "$GLB_MHA_ROLE" == "follower-replica" ]]; then
    main_follower_replica
elif [[ "$GLB_MHA_ROLE" == "follower-source" ]]; then
    main_follower_source
elif [[ "$GLB_MHA_ROLE" == "leader" ]]; then
    main_leader
elif [[ "$GLB_MHA_ROLE" == "monitor" ]]; then
    :
else
    :
fi
