#!/bin/bash
# 定义VIP地址、网络接口、MySQL主库IP
VIP="192.168.0.100"
INTERFACE="eth0"
MYSQLPING_FOLLOWER="127.0.0.1:3000"
MYSQLPING_NAME=""

# 检查MySQL主库状态
mysqladmin ping -h $MYSQL_HOST > /dev/null 2>&1
MYSQL_STATUS=$?

# 检查当前是否已经绑定了VIP
ip addr show $INTERFACE | grep $VIP > /dev/null 2>&1
VIP_EXIST=$?

# 如果MySQL主库正常并且VIP没有绑定，添加VIP
if [ $MYSQL_STATUS -eq 0 ] && [ $VIP_EXIST -ne 0 ]; then
    echo "MySQL主库正常，添加VIP $VIP"
    ip addr add $VIP/24 dev $INTERFACE
fi

# 如果MySQL主库不可用并且VIP已经绑定，删除VIP
if [ $MYSQL_STATUS -ne 0 ] && [ $VIP_EXIST -eq 0 ]; then
    echo "MySQL主库宕机，删除VIP $VIP"
    ip addr del $VIP/24 dev $INTERFACE
fi
