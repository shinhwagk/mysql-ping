#!/usr/bin/env bash

dnf install -y git unzip iproute procps-ng

if ! command -v deno >/dev/null 2>&1; then
  curl -fsSL https://deno.land/install.sh | sh -s v2.0.2 -y
fi
