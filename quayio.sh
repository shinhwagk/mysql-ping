#!/usr/bin/env bash

set -e

VERSION=$(cat version)
docker pull --platform linux/amd64 docker.io/shinhwagk/mysql-ping:$VERSION
docker tag docker.io/shinhwagk/mysql-ping:$VERSION quay.io/shinhwagk/mysql-ping:$VERSION
docker tag docker.io/shinhwagk/mysql-ping:$VERSION quay.io/shinhwagk/mysql-ping:latest
docker push quay.io/shinhwagk/mysql-ping:$VERSION
docker push quay.io/shinhwagk/mysql-ping:latest
