#!/usr/bin/env bash

# exit 2 follower error
# exit 1 mysql down
# exit 0 mysql live

PING_RESULT=$(./build/mysqlping_client --follower-addrs 127.0.0.1:3000,127.0.0.1:3001 --mysql-name name1 2>&1)
PING_EXITCODE=$?

case $PING_EXITCODE in
    0)
        # MySQL is live, nothing to do
        ;;
    1)
        echo "MySQL is down"
        ;;
    2)
        echo "Follower error"
        ;;
    *)
        echo "Unknown exit code: $PING_EXITCODE"
        ;;
esac
