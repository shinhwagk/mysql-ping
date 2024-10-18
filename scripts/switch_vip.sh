#!/usr/bin/env bash

# exit 2 follower error
# exit 1 mysql down
# exit 0 mysql live

VIP="192.168.0.100"
INTERFACE="eth0"
MYSQLPING_FOLLOWER="127.0.0.1:3000,127.0.0.1:3001"
MYSQLPING_NAME=""

MYSQLPING_RESULT=$(mysqlping_client --follower-addrs "${MYSQLPING_FOLLOWER}" --mysql-name ${MYSQLPING_NAME} 2>&1)
MYSQLPING_EXITCODE=$?

if [[ $MYSQLPING_EXITCODE == 1 ]]; then
  ip addr show ${INTERFACE} | grep ${VIP} >/dev/null 2>&1
  VIP_EXIST=$?
  ip addr add $VIP/24 dev $INTERFACE
  ip addr del $VIP/24 dev $INTERFACE noprefixroute
fi
