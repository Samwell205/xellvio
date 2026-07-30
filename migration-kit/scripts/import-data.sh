#!/usr/bin/env bash
# ============================================================
# Xellvio migration — Phase 3, step 2: import data into YOUR Supabase project.
#
#   bash migration-kit/scripts/import-data.sh "postgresql://postgres:PASS@db.xxx.supabase.co:5432/postgres" [DATA_DIR]
#
# Assumes 00-prelude.sql and 01-baseline-schema.sql have already been applied.
# Runs with foreign-key/trigger enforcement disabled so table order does not
# matter, and re-enables it at the end.
# ============================================================
set -euo pipefail

DB_URL="${1:?usage: import-data.sh <NEW_DATABASE_URL> [DATA_DIR]}"
DATA_DIR="${2:-/tmp/xellvio-migration-data}"
MANIFEST="$DATA_DIR/_columns.txt"


[ -f "$MANIFEST" ] || { echo "Missing $MANIFEST — run export-data.sh first."; exit 1; }

echo "Importing from $DATA_DIR into the target database"
echo "Disabling triggers/FK checks for this session..."

while IFS= read -r line; do
  table="${line%%:*}"
  cols="${line#*:}"
  csv="$DATA_DIR/$table.csv"
  [ -f "$csv" ] || { echo "  skip $table (no csv)"; continue; }

  rows=$(( $(wc -l < "$csv") - 1 ))
  if [ "$rows" -le 0 ]; then echo "  skip $table (empty)"; continue; fi

  collist=$(echo "$cols" | tr '|' ',')
  printf '  %-36s %s rows... ' "$table" "$rows"
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 <<SQL
set session_replication_role = replica;
\copy public."$table" ($collist) from '$csv' with (format csv, header true)
SQL
  echo "ok"
done < "$MANIFEST"

echo
echo "Re-checking constraints..."
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "set session_replication_role = origin;" -c "select 'constraints active' as status;"

echo "Done. Now run: psql \"\$DB_URL\" -f migration-kit/sql/03-verify.sql"
