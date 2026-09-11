#!/bin/sh
set -eu

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

HOST=$(json_escape "${MQTT_HOST:-localhost}")
PORT="${MQTT_PORT:-1883}"
case "$PORT" in
  ''|*[!0-9]*) PORT=1883 ;;
esac
PATH_VAL=$(json_escape "${MQTT_PATH:-/mqtt}")
USER_VAL=$(json_escape "${MQTT_USER:-}")
PASS_VAL=$(json_escape "${MQTT_PASSWORD:-}")
TLS_RAW=$(printf '%s' "${MQTT_TLS:-false}" | tr '[:upper:]' '[:lower:]')
if [ "$TLS_RAW" = "true" ] || [ "$TLS_RAW" = "1" ] || [ "$TLS_RAW" = "yes" ]; then
  TLS="true"
else
  TLS="false"
fi

CONFIG_DIR="${STATIC_DIR:-/app/dist}"
mkdir -p "$CONFIG_DIR" "${DATA_DIR:-/data}/layouts"

cat > "${CONFIG_DIR}/config.json" <<EOF
{
  "host": "${HOST}",
  "port": ${PORT},
  "path": "${PATH_VAL}",
  "username": "${USER_VAL}",
  "password": "${PASS_VAL}",
  "tls": ${TLS}
}
EOF

exec "$@"
