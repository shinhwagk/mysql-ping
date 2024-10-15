#!/usr/bin/env bash

dnf install -y git unzip iproute procps-ng

dnf install -y https://dev.mysql.com/get/mysql80-community-release-el9-5.noarch.rpm
dnf install -y mysql-community-client-8.0.36

# dnf install -y epel-release
# dnf install -y redis ShellCheck

# dnf install -y python3.12 python3.12-pip

if ! command -v bun >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install | bash -s "bun-v1.1.29"
    echo 'export BUN_INSTALL="$HOME/.bun"' >> /root/.bash_profile 
    echo 'export PATH=$BUN_INSTALL/bin:$PATH' >> /root/.bash_profile 
fi
