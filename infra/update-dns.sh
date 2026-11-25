#!/usr/bin/env sh
# Keeps the free DuckDNS name pointed at this VM's public IP (wildcard: rtc.<name>.duckdns.org works too).
set -eu
cd "$(dirname "$0")"
. ./.env
curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=" -o /dev/null && echo "duckdns ok"
