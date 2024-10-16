check_command() {
    local cmd="$1"

    if ! command -v "$cmd" &>/dev/null; then
        echo "Error: Command '$cmd' not found."
        exit 1
    fi
}

check_commands() {
    for cmd in mysql redis-cli ip; do
        check_command "$cmd"
    done
}

function n_grep() {
    GREP_OPTIONS='' command grep "$@"
}

log() {
    datetime=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$datetime -- $1($ROLE_NAME) -- $2"
}

parse_dsn() {
    local dsn="$1"
    local user_pass
    local ip_port

    user_pass=$(echo "$dsn" | cut -d'@' -f1)
    ip_port=$(echo "$dsn" | cut -d'@' -f2)

    local username=$(echo "$user_pass" | cut -d':' -f1)
    local password=$(echo "$user_pass" | cut -d':' -f2)

    local ip=$(echo "$ip_port" | cut -d':' -f1)
    local port=$(echo "$ip_port" | cut -d':' -f2)

    echo "$username $password $ip $port"
}

mysql_cli() {
    local dsn="$1"
    credentials=$(parse_dsn "$dsn")

    read -r username password ip port <<<"$credentials"
    mysql -h"$host" -P"$port" -u"$username" -p"$password" "$@"
}

redis_cli() {
    redis-cli -h $REDIS_HOST -p $REDIS_PORT "$@"
}

register_role() {
    result=$(redis_cli sadd "register" "$ROLE_NAME")
    if [[ "$result" == 0 ]]; then
        log "WARN" "register '$ROLE_NAME' exist."
    elif [[ "$result" == 1 ]]; then
        log "INFO" "register ok."
    else
        log "WARN" "register failure, '$ROLE_NAME' $result."
    fi
}

push_follower_liveness() {
    redis_cli hset "follower:liveness" "$ROLE_NAME" $(date '+%s') >/dev/null
    log "INFO" "push follower liveness."
}

push_mysql_liveness() {
    local MYSQL_ROLE=$1
    local MYSQL_DSN=$2
    local credentials=$(parse_dsn "$MYSQL_DSN")

    read -r MYSQL_USER MYSQL_PASS MYSQL_HOST MYSQL_PORT <<<"$credentials"
    live=0
    custom_check_mysql_liveness "${MYSQL_HOST}" "${MYSQL_PORT}" "${MYSQL_USER}" "${MYSQL_PASS}"
    if [[ $? == 0 ]]; then
        log "INFO" "ping mysql ${MYSQL_ROLE} 'success'."
        live=$(date '+%s')
    else
        log "INFO" "ping mysql ${MYSQL_ROLE} 'failure'."
    fi

    redis_cli hset "${MYSQL_ROLE}:liveness" ${ROLE_NAME} $live >/dev/null
}
