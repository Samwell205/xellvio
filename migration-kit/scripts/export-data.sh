#!/usr/bin/env bash
# ============================================================
# Xellvio migration — Phase 3, step 1: export data from the OLD database.
#
# Run this inside the Lovable sandbox, where PGHOST/PGUSER/PGPASSWORD etc.
# already point at the Cloud database. It writes one CSV per public table.
#
#   bash migration-kit/scripts/export-data.sh
#
# Output: migration-kit/data/<table>.csv
# ============================================================
set -euo pipefail

OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
mkdir -p "$OUT_DIR"

TABLES=$(psql -At -c "
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;")

echo "Exporting $(echo "$TABLES" | wc -l | tr -d ' ') tables to $OUT_DIR"

for t in $TABLES; do
  printf '  %-36s' "$t"
  psql -q -c "\copy (select * from public.\"$t\") to '$OUT_DIR/$t.csv' with (format csv, header true)"
  rows=$(( $(wc -l < "$OUT_DIR/$t.csv") - 1 ))
  echo "$rows rows"
done

# Column order per table — the import replays this so the CSVs load even if
# the new schema ends up with a different physical column order.
psql -At -F',' -c "
  select table_name || ':' || string_agg(column_name, '|' order by ordinal_position)
  from information_schema.columns
  where table_schema = 'public'
  group by table_name order by table_name;" > "$OUT_DIR/_columns.txt"

echo
echo "Done. Manifest written to $OUT_DIR/_columns.txt"
echo "Next: bash migration-kit/scripts/import-data.sh \"<NEW_DB_URL>\""
