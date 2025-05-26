import sys

import mysql.connector
import requests

MYSQL_PING_IDC_URLS = {
    "co": ["1.1.1.1:3001", "1.1.1.1:3001"],
    "aff": ["1.1.1.1:3000"],
    "ipk": ["1.1.1.1:3000"],
#    "tn": ["1.1.1.1:3000"],
    "ze": ["1.1.1.1:3002", "1.1.1.1:3002"],
    "tsg": ["1.1.1.1:3000", "1.1.1.1:3000", "1.1.1.1:3000"],
    "tpk": ["1.1.1.1:3000"],
}

MYSQL_PING_IDC_PAIR = {
    "co": ["co", "avg"],
    "aff": ["aff"],
    "ipk": ["ipk", "tn"],
    "ze": ["ze"],
    "tsg": ["tsg"],
    "tpk": ["tpk"],
}

MYSQL_PING_URL_DSN: list[tuple[str, str]] = []
ACTIVE_IDC = []

MYSQL_QUERY_USER = ""
MYSQL_QUERY_PASSWORD = ""
MYSQL_QUERY_HOST = ""
MYSQL_QUERY_PORT = 3306

MYSQL_PING_USER = "mysql_ping"
MYSQL_PING_PASSWORD = ""
MYSQL_PING_RANGE = 60


for idc, urls in MYSQL_PING_IDC_URLS.items():
    for url in urls:
        if not requests.get(f"http://{url}/ready").ok:
            print(f"idc: {idc}, urls: {url} not ready")
            sys.exit(1)

with mysql.connector.connect(host=MYSQL_QUERY_HOST, port=MYSQL_QUERY_PORT, user=MYSQL_QUERY_USER, password=MYSQL_QUERY_PASSWORD) as con:
    with con.cursor() as cur:
        cur.execute("SELECT idc, ip, port, hostname, role FROM db_dict.mysql_instance_list")
        for idc, ip, port, hostname, role in cur.fetchall():
            mp_dsn = f"n={hostname}:{port},r={MYSQL_PING_RANGE},u={MYSQL_PING_USER},p={MYSQL_PING_PASSWORD},h={ip},P={port}"
            append = False
            for p_idc, p_s_idc in MYSQL_PING_IDC_PAIR.items():
                if idc in p_s_idc:
                    ACTIVE_IDC.append(p_idc)
                    if MYSQL_PING_IDC_URLS[p_idc]:
                        append = True
                        for url in MYSQL_PING_IDC_URLS[p_idc]:
                            MYSQL_PING_URL_DSN.append((url, mp_dsn))
                            print(f"add {idc}:{hostname}{ip}:{port} -> {p_idc}:{url}")
            if not append:
                print(f"no find mysqlping server {idc}:{hostname}{ip}:{port} ")


MYSQL_URL_DSNS: dict[str, list[str]] = {}

for url, dsn in MYSQL_PING_URL_DSN:
    MYSQL_URL_DSNS.setdefault(url, []).append(dsn)

for url, dsns in MYSQL_URL_DSNS.items():
    print(f"url: {url}, dsns: {len(dsns)}")
    try:
        res = requests.post(f"http://{url}/dsns", json=dsns)
    except Exception as e:
        print(f"url: {url}, err: {e}")

for idc, urls in MYSQL_PING_IDC_URLS.items():
    if idc not in ACTIVE_IDC:
        for url in urls:
            try:
                res = requests.delete(f"http://{url}/dsns")
                print(f"delete idc {idc} {urls}", res.status_code, res.text)
            except Exception as e:
                print(f"url: {url}, err: {e}")

# docker run --rm -i --name mysqlping-refresh -v /data/mysqlping/refresh.py:/tmp/refresh.py python:3 sh -c "pip install mysql-connector-python==9.0.0 requests; python /tmp/refresh.py"
