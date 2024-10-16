apt update
apt install -y curl lsb-release wget
curl -OsL https://dev.mysql.com/get/mysql-apt-config_0.8.32-1_all.deb
dpkg -i mysql-apt-config_0.8.32-1_all.deb