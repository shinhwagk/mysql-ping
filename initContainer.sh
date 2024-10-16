#!/usr/bin/env bash

dnf install -y git unzip iproute procps-ng

dnf install -y https://dev.mysql.com/get/mysql80-community-release-el9-5.noarch.rpm
dnf install -y mysql-community-client-8.0.36

# dnf install -y epel-release
# dnf install -y redis ShellCheck

# dnf install -y python3.12 python3.12-pip

if ! command -v deno >/dev/null 2>&1; then
  curl -fsSL https://deno.land/install.sh | sh -s v2.0.0 -y
fi
