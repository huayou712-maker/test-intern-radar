#!/bin/sh
set -eu

install -d -m 755 /opt/test-intern-radar/downloads /opt/test-intern-radar/runtime
cd /opt/test-intern-radar/downloads
curl --fail --show-error --location --max-time 300 --output node-v24.21.0-linux-x64.tar.xz https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz
curl --fail --show-error --location --max-time 30 --output SHASUMS256.txt https://nodejs.org/dist/v24.21.0/SHASUMS256.txt
sha256sum --check --ignore-missing SHASUMS256.txt
tar -xJf node-v24.21.0-linux-x64.tar.xz --strip-components=1 -C /opt/test-intern-radar/runtime
/opt/test-intern-radar/runtime/bin/node --version
