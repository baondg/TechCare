#!/bin/sh
set -e
# Cloud Run sets PORT (often 8080). Compose typically maps host 80 -> container 80.
export PORT="${PORT:-80}"
# Docker Compose: http://backend:3000 | Cloud Run frontend: https://<backend-service>.run.app
export BACKEND_URL="${BACKEND_URL:-http://backend:3000}"
envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
