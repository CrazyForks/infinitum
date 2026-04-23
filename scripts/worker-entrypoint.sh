#!/bin/sh
set -eu

DB_URL="${DATABASE_URL:-file:/app/data/dev.db}"
DB_URL="$(printf '%s' "$DB_URL" | sed 's/^"//; s/"$//')"

case "$DB_URL" in
  file:/*)
    DB_PATH="${DB_URL#file:}"
    ;;
  file:./*)
    DB_PATH="/app/${DB_URL#file:./}"
    ;;
  *)
    echo "Unsupported DATABASE_URL: $DB_URL" >&2
    echo "Only SQLite file: URLs are supported in the Docker deployment." >&2
    exit 1
    ;;
esac

mkdir -p "$(dirname "$DB_PATH")"
node scripts/setup-sqlite.mjs "$DB_PATH"

if [ -f /app/worker.cjs ]; then
  exec node worker.cjs
fi

exec npm run worker
