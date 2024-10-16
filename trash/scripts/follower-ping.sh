#!/usr/bin/env bash

BASE_DIR="$(
    cd "$(dirname "$0")" || exit 1
    pwd
)"

. "$BASE_DIR/lib.sh"
. "$BASE_DIR/custom.sh"

push_source_liveness() {
    push_mysql_liveness "source" "${MYSQL_SOURCE_DSN}"
}

main() {
    register_role

    while true; do
        push_follower_liveness
        push_source_liveness
        sleep 1
    done
}

check_commands
main
