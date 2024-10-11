#!/bin/bash

bun build test/mysql.ts --compile --target=bun-linux-arm64 --outfile ./mycli
