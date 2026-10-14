#!/bin/sh
set -e
# Compose maps host 80 -> container 80; PORT overrides it.
export PORT="${PORT:-80}"
# Docker Compose: http://backend:3000
export BACKEND_URL="${BACKEND_URL:-http://backend:3000}"
envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
