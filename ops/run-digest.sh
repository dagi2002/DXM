#!/usr/bin/env bash
set -euo pipefail

trim() {
  local value="${1-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

DIGEST_URL="${DIGEST_URL:-http://127.0.0.1:4000/digest/send-all}"
NODE_ENV_VALUE="$(trim "${NODE_ENV:-}")"
DIGEST_SECRET_VALUE="$(trim "${DIGEST_CRON_SECRET:-}")"
JWT_SECRET_VALUE="$(trim "${JWT_SECRET:-}")"

if [[ -n "$DIGEST_SECRET_VALUE" ]]; then
  SECRET="$DIGEST_SECRET_VALUE"
elif [[ "$NODE_ENV_VALUE" != "production" && -n "$JWT_SECRET_VALUE" ]]; then
  SECRET="$JWT_SECRET_VALUE"
else
  echo "Missing digest secret. Set DIGEST_CRON_SECRET, or JWT_SECRET for non-production only." >&2
  exit 1
fi

curl -fsS -X POST "$DIGEST_URL" -H "x-digest-key: $SECRET"
