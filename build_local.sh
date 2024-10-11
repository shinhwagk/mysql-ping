#!/bin/bash

bun build --compile ./mysqlping.ts --minify --target=bun-linux-x64 --outfile build/mysqlping
