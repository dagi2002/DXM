#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DB_PATH:-/var/lib/dxm/dxm.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dxm}"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required for backups." >&2
  exit 1
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database file not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/dxm-$STAMP.db"

sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
echo "Backup written to $BACKUP_FILE"
