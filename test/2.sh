#!/usr/bin/env bash

# MySQL 连接信息
MYSQL_HOST="db1"
MYSQL_USER="root"
MYSQL_PASSWORD="root_password"

compare_gtidsets() {
    mysql -h$MYSQL_HOST -u$MYSQL_USER -p$MYSQL_PASSWORD -N -se "SELECT GTID_SUBTRACT('$1', '$2')" 2>/dev/null
}

# compare_gtidsets 'ca61d9a6-5307-11ef-b75b-0242ac180004:1-80' 'ca61d9a6-5307-11ef-b75b-0242ac180004:1-70'
# compare_gtidsets 'ca61d9a6-5307-11ef-b75b-0242ac180004:1-80' 'ca61d9a6-5307-11ef-b75b-0242ac180004:1-10'

compare_gtidsets 'ca61d9a6-5307-11ef-b75b-0242ac180004:61-80' 'ca61d9a6-5307-11ef-b75b-0242ac180004:71-80'
compare_gtidsets 'ca61d9a6-5307-11ef-b75b-0242ac180004:71-80' 'ca61d9a6-5307-11ef-b75b-0242ac180004:61-80'

# compare_gtidsets 'ca61d9a6-5307-11ef-b75b-0242ac180004:10-80' 'ca61d9a6-5307-11ef-b75b-0242ac180004:11-80'
# compare_gtidsets 'ca61d9a6-5307-11ef-b75b-0242ac180004:11-80' 'ca61d9a6-5307-11ef-b75b-0242ac180004:10-80'
