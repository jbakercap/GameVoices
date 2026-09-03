#!/bin/bash
# Data migration: Lovable Supabase → New Supabase
# Fetches from old instance REST API, inserts via new instance Management API

OLD_URL="${OLD_SUPABASE_URL:-https://mcrgcbbqfnbtfuiypcic.supabase.co/rest/v1}"
OLD_KEY="${OLD_SUPABASE_ANON_KEY:?Set OLD_SUPABASE_ANON_KEY env var}"
NEW_PROJECT="${NEW_SUPABASE_PROJECT_REF:?Set NEW_SUPABASE_PROJECT_REF env var}"
NEW_TOKEN="${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN env var}"
NEW_API="https://api.supabase.com/v1/projects/${NEW_PROJECT}/database/query"

TMPDIR="/tmp/gv_migration"
mkdir -p "$TMPDIR"

# Function to fetch all rows from old instance (handles pagination)
fetch_table() {
  local table=$1
  local select=${2:-"*"}
  local extra_params=${3:-""}
  local offset=0
  local limit=1000
  local all_file="$TMPDIR/${table}_all.json"

  echo "[]" > "$all_file"

  while true; do
    local url="${OLD_URL}/${table}?select=${select}&limit=${limit}&offset=${offset}${extra_params}"
    local chunk=$(curl -s "$url" \
      -H "apikey: ${OLD_KEY}" \
      -H "Prefer: count=exact" \
      --max-time 60)

    # Check if we got valid JSON array
    local count=$(echo "$chunk" | python3 -c "import json,sys; data=json.load(sys.stdin); print(len(data))" 2>/dev/null)

    if [ -z "$count" ] || [ "$count" = "0" ]; then
      break
    fi

    # Merge into all_file
    python3 -c "
import json, sys
with open('$all_file') as f:
    existing = json.load(f)
chunk = json.loads('''$chunk''') if len('''$chunk''') < 100000 else json.load(sys.stdin)
existing.extend(chunk if isinstance(chunk, list) else [])
with open('$all_file', 'w') as f:
    json.dump(existing, f)
" 2>/dev/null || {
      # For large chunks, use file-based approach
      echo "$chunk" > "$TMPDIR/${table}_chunk.json"
      python3 -c "
import json
with open('$all_file') as f:
    existing = json.load(f)
with open('$TMPDIR/${table}_chunk.json') as f:
    chunk = json.load(f)
existing.extend(chunk if isinstance(chunk, list) else [])
with open('$all_file', 'w') as f:
    json.dump(existing, f)
"
    }

    if [ "$count" -lt "$limit" ]; then
      break
    fi
    offset=$((offset + limit))
  done

  local total=$(python3 -c "import json; print(len(json.load(open('$all_file'))))")
  echo "  Fetched $total rows from $table"
}

# Function to insert data into new instance via Management API
insert_table() {
  local table=$1
  local file="$TMPDIR/${table}_all.json"

  local count=$(python3 -c "import json; print(len(json.load(open('$file'))))")

  if [ "$count" = "0" ]; then
    echo "  Skipping $table (no data)"
    return
  fi

  # Generate INSERT SQL from JSON, processing in batches of 100
  python3 << PYEOF
import json, sys

with open('$file') as f:
    rows = json.load(f)

if not rows:
    sys.exit(0)

table = '$table'
batch_size = 50
errors = []

for batch_start in range(0, len(rows), batch_size):
    batch = rows[batch_start:batch_start + batch_size]
    cols = list(batch[0].keys())
    col_names = ', '.join(f'"{c}"' for c in cols)

    values_list = []
    for row in batch:
        vals = []
        for c in cols:
            v = row[c]
            if v is None:
                vals.append('NULL')
            elif isinstance(v, bool):
                vals.append('true' if v else 'false')
            elif isinstance(v, (int, float)):
                vals.append(str(v))
            elif isinstance(v, list):
                # Array type
                arr_vals = ', '.join(f"'{str(item).replace(chr(39), chr(39)+chr(39))}'" for item in v)
                vals.append(f"ARRAY[{arr_vals}]::text[]" if arr_vals else "'{}'::text[]")
            elif isinstance(v, dict):
                json_str = json.dumps(v).replace("'", "''")
                vals.append(f"'{json_str}'::jsonb")
            else:
                escaped = str(v).replace("'", "''")
                vals.append(f"'{escaped}'")
        values_list.append(f"({', '.join(vals)})")

    sql = f'INSERT INTO {table} ({col_names}) VALUES {", ".join(values_list)} ON CONFLICT DO NOTHING;'

    # Write SQL to temp file and use it
    with open('/tmp/gv_migration/current_batch.sql', 'w') as sf:
        sf.write(sql)

    import subprocess
    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        '$NEW_API',
        '-H', 'Authorization: Bearer $NEW_TOKEN',
        '-H', 'Content-Type: application/json',
        '--data-binary', '@-',
        '--max-time', '120'
    ], input=json.dumps({"query": sql}).encode(), capture_output=True)

    response = result.stdout.decode()
    if '"error"' in response.lower() or '"code"' in response.lower():
        # Check if it's actually an error vs just empty result
        try:
            resp_json = json.loads(response)
            if isinstance(resp_json, dict) and 'error' in str(resp_json).lower():
                errors.append(f"Batch {batch_start}: {response[:200]}")
        except:
            pass

total = len(rows)
if errors:
    print(f"  Inserted into {table}: {total} rows with {len(errors)} batch errors")
    for e in errors[:3]:
        print(f"    Error: {e}")
else:
    print(f"  Inserted into {table}: {total} rows OK")
PYEOF
}

echo "=== GameVoices Data Migration ==="
echo ""

# Migration order (dependency-safe):
# 1. No-dep tables
echo "--- Phase 1: Core reference tables ---"
for table in leagues games speakers; do
  echo "Migrating $table..."
  fetch_table "$table"
  insert_table "$table"
done

# 2. Tables depending on leagues
echo ""
echo "--- Phase 2: Teams & Players ---"
for table in teams players; do
  echo "Migrating $table..."
  fetch_table "$table"
  insert_table "$table"
done

# 3. Shows (depends on leagues, teams)
echo ""
echo "--- Phase 3: Shows ---"
echo "Migrating shows..."
fetch_table "shows"
insert_table "shows"

# 4. Episodes (depends on shows) - could be large
echo ""
echo "--- Phase 4: Episodes ---"
echo "Migrating episodes..."
fetch_table "episodes"
insert_table "episodes"

# 5. Stories (depends on games)
echo ""
echo "--- Phase 5: Stories ---"
echo "Migrating stories..."
fetch_table "stories"
insert_table "stories"

# 6. Junction/relation tables
echo ""
echo "--- Phase 6: Relation tables ---"
for table in episode_stories episode_speakers show_hosts player_stories; do
  echo "Migrating $table..."
  fetch_table "$table"
  insert_table "$table"
done

# 7. X feed cache
echo ""
echo "--- Phase 7: X Feed Cache ---"
echo "Migrating x_feed_cache..."
fetch_table "x_feed_cache"
insert_table "x_feed_cache"

echo ""
echo "=== Migration Complete ==="
echo ""
echo "NOTE: User-generated data (profiles, comments, likes, listen history, etc.)"
echo "was NOT migrated since users will create fresh data on the new instance."
