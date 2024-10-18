import requests
from mysql.connector import MySQLConnection, connect

MYSQL_DSN = {"host":"172.27.1.6","port":3306,"user":"ghost","password":"54448hotINBOX","database":"db_dict"}
CONSUL_ADDR = "10.50.10.83:8500"
MYSQL_PING_DSNS={}
MYSQL_PING_USER="ghost"
MYSQL_PING_PASSWOR="54448hotINBOX"
MYSQL_PING_FOLLOWER_ADDRS=[]

for service in requests.get(f"http://{CONSUL_ADDR}/v1/catalog/service/mysqlping-export").json():
    ip = service.get('ServiceAddress')
    port = service.get('ServicePort')
    tags = service.get('ServiceTags', [])

    for tag in tags :
        if tag.startswith('follower_center='):
            idc = tag.split("=")[1]
    MYSQL_PING_FOLLOWER_ADDRS.append([idc,f"{ip}:{port}"])
    print(f"IP: {ip}, Port: {port} {tag}")

with connect(**MYSQL_DSN) as con:
    with con.cursor() as cur:
        cur.execute("select concat(hostname,'_',port) name, ip, port, role,idc from dic_mysql_list where update_time >= NOW() - INTERVAL 7 DAY and role = 'slave' and idc in ('tn','co','aff') and hostname !='co-litb-ordersort-db3' and hostname != 'co-litb-message-db2' and hostname !='aff-litb-apollotag-db2' group by ip, port, role, concat(hostname,'_',port), idc")
        for name,host,port,role,idc in cur.fetchall():
            if idc in MYSQL_PING_DSNS :
                MYSQL_PING_DSNS[idc].append(f"n={name},r=60,u={MYSQL_PING_USER},p={MYSQL_PING_PASSWOR},h={host},P={port}")
            else :
                 MYSQL_PING_DSNS[idc] = [f"n={name},r=60,u={MYSQL_PING_USER},p={MYSQL_PING_PASSWOR},h={host},P={port}"]

print(MYSQL_PING_DSNS)

for idc, faddr in MYSQL_PING_FOLLOWER_ADDRS:
   print(f"delete dsns from {faddr}")
#    response_delete = requests.delete(f"http://{faddr}/dsns")

for idc,faddr in MYSQL_PING_FOLLOWER_ADDRS:
    if idc in MYSQL_PING_FOLLOWER_ADDRS:
        print(idc,MYSQL_PING_DSNS[idc])
#    response_post = requests.post(f"http://{faddr}/dsns", json=MYSQL_PING_DSNS[idc])