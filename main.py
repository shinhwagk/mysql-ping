import socket
import argparse
import subprocess
import time
import os
import mysql.connector
from mysql.connector import Error

import redis


def ping_mysql_server(host: str, port: int, user: str, password: str) -> bool:
    try:
        with mysql.connector.connect(host=host, user=user, port=port, password=password):
            return True
    except Exception:
        return False


def query_mysql_gtidset(host, port, user, password) -> str:
    try:
        with mysql.connector.connect(host=host, user=user, port=port, password=password) as conn:
            with conn.cursor() as cur:
                cur.execute("show master status")
                return cur.fetchone()[4]
    except Error as e:
        print(f"Error: {e}")
        return ""


def query_mysql_server(con: mysql.connector.MySQLConnection, query: str):
    with con.cursor() as cur:
        cur.execute(query)
        cur.fetchone()


def _parse_dsn(dsn: str) -> tuple[str, int, str, str]:
    try:
        user_info, host_info = dsn.split("@")
        user, password = user_info.split(":")
        hostname, port = host_info.split(":")
        return [hostname, int(port), user, password]
    except ValueError:
        raise ValueError(f"Invalid DSN format: {dsn}")


class RedisClient:
    def __init__(self) -> None:
        pass

    # r = redis.Redis(host="localhost", port=6379, db=0)


class RoleFollower:
    def __init__(self, name: str, redis_host: str, redis_port: int, source_dsn: str, replica_dsn: str) -> None:
        self.name = name
        self.source_host, self.source_port, self.source_user, self.source_pass = _parse_dsn(source_dsn)
        self.replica_host, self.replica_port, self.replica_user, self.replica_pass = _parse_dsn(replica_dsn)

        self.redis = redis.Redis(host=redis_host, port=redis_port, db=0)

    def run(self):
        while True:
            if ping_mysql_server(self.source_host, self.source_port, self.source_user, self.source_pass):
                self.redis.set(f"liveness:{self.name}", 1, ex=5)
            else:
                self.redis.set(f"liveness:{self.name}", 0, ex=5)

            gtidsets = query_mysql_gtidset(self.replica_host, self.replica_port, self.replica_user, self.replica_pass)
            self.redis.set(f"gtidsets:replica:{self.name}", gtidsets, ex=60)
            print("push to redis gtidsets", gtidsets)

            time.sleep(1)


class RoleLeader:
    def __init__(self, name: str, redis_host: str, redis_port: int, source_dsn: str) -> None:
        self.name = name
        self.source_host, self.source_port, self.source_user, self.source_pass = _parse_dsn(source_dsn)

        self.redis = redis.Redis(host=redis_host, port=redis_port, db=0)

        self.gtid_sets = {}

    def run(self):
        while True:
            if ping_mysql_server(self.source_host, self.source_port, self.source_user, self.source_pass):
                self.redis.set(f"liveness:{self.name}", 1, ex=5)
            else:
                self.redis.set(f"liveness:{self.name}", 0, ex=5)

            gtidsets = query_mysql_gtidset(self.source_host, self.source_port, self.source_user, self.source_pass)
            self.redis.set(f"gtidsets:source:{self.name}", gtidsets, ex=60)
            print("push to redis gtidsets", gtidsets)

            time.sleep(1)


class RolePing:
    def __init__(self, name: str, redis_host, redis_port: int, source_host: str, source_port: int, source_user: str, source_pass: str) -> None:
        self.name = name
        self.source_host, self.source_port, self.source_user, self.source_pass = source_host, source_port, source_user, source_pass
        self.redis = redis.Redis(host=redis_host, port=redis_port, db=0)

        self.scripts = {"check_source", "/tmp/abc"}
        self.env = {
            "REDIS_HOST": redis_host,
            "REDIS_PORT": redis_port,
            "MYSQL_SOURCE_HOST": source_host,
            "MYSQL_SOURCE_PORT": source_port,
            "MYSQL_SOURCE_USER": source_user,
            "MYSQL_SOURCE_PASS": source_pass,
        }

    def run(self):
        while True:
            result = subprocess.run(["command"], env=self.env, capture_output=True, text=True)
            if result.check_returncode == 0:
                self.redis.set(f"liveness:{self.name}", 1, ex=5)
            else:
                self.redis.set(f"liveness:{self.name}", 0, ex=5)

            time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description="A simple argument parser example.")

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--leader", type=str, help="Specify if this is the leader")
    group.add_argument("--follower", type=str, help="Specify if this is a follower")
    group.add_argument("--ping", type=str, help="Specify if this is a follower")

    parser.add_argument("--redis-addr", type=str, required=True)

    parser.add_argument("--source-dsn", type=str)  # user:password@hostname:port

    parser.add_argument("--replica-dsn", type=str)  # user:password@hostname:port
    parser.add_argument("--replica-interface", type=str)
    parser.add_argument("--replica-vip", type=str)

    args = parser.parse_args()

    redis_host, redis_port = args.redis_addr.split(":", 1)
    redis_port = int(redis_port)

    source_host, source_port, source_user, source_pass = _parse_dsn(args.source_dsn)

    if args.ping:
        RolePing(args.ping, redis_host, redis_port, source_host, source_port, source_user, source_pass).run()
    elif args.leader:
        RoleLeader(args.leader, args.redis_addr, args.source_dsn).run()
    elif args.follower:
        RoleFollower(args.follower, args.redis_addr, args.source_dsn, args.replica_dsn).run()


if __name__ == "__main__":
    main()
