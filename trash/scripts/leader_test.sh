source_gtidsets="ca634820-5307-11ef-907b-0242ac180003:1-100"
replica1_gtidsets="ca634820-5307-11ef-907b-0242ac180003:1-50"
replica2_gtidsets="ca634820-5307-11ef-907b-0242ac180003:1-70"

mysql -uroot -proot_password -hdb1 -se "SELECT GTID_SUBTRACT('$source_gtidsets', '$replica1_gtidsets');" # ca634820-5307-11ef-907b-0242ac180003:51-100
mysql -uroot -proot_password -hdb1 -se "SELECT GTID_SUBTRACT('$source_gtidsets', '$replica2_gtidsets');" # ca634820-5307-11ef-907b-0242ac180003:71-100

mysql -uroot -proot_password -hdb1 -se "SELECT GTID_SUBTRACT('ca634820-5307-11ef-907b-0242ac180003:51-100', 'ca634820-5307-11ef-907b-0242ac180003:71-100');"
mysql -uroot -proot_password -hdb1 -se "SELECT GTID_SUBTRACT('ca634820-5307-11ef-907b-0242ac180003:71-100', 'ca634820-5307-11ef-907b-0242ac180003:51-100');"

abc=$(mysql -uroot -proot_password -hdb1 -se "SELECT GTID_SUBTRACT('ca634820-5307-11ef-907b-0242ac180003:90-100', 'ca634820-5307-11ef-907b-0242ac180003:71-100');")

mysql -uroot -proot_password -hdb1 -se "SELECT GTID_SUBTRACT('', 'ca634820-5307-11ef-907b-0242ac180003:71-100');"
