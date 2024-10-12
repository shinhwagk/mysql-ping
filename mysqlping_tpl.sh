#!/usr/bin/env bash

PING_RESULT=$(bun run mysqlping_client.ts --follower-addrs 127.0.0.1:3000,127.0.0.1:3001 --mysql-name name1 --ping-range 60)
PING_EXIT=$?

if [[ $PING_EXIT == 0 && $PING_RESULT == "down" ]]; then
    :
fi
