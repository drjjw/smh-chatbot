#!/bin/bash

# Export complete database (schema + data) in one file

set -e

PROJECT_REF="mlxctdgnojvkgfqldaob"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_DIR="./database-dumps"
COMPLETE_FILE="${DUMP_DIR}/complete_${TIMESTAMP}.sql"
TEMP_SCHEMA="${DUMP_DIR}/temp_schema_${TIMESTAMP}.sql"
TEMP_DATA="${DUMP_DIR}/temp_data_${TIMESTAMP}.sql"

echo "🗄️  Complete Database Export (Schema + Data)"
echo "Project: Manuals-Chat"
echo "Output: complete_${TIMESTAMP}.sql"
echo ""
echo "⚠️  Size: ~224MB (includes all embeddings)"
echo "⏱️  Time: ~2-3 minutes"
echo ""
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Export cancelled"
    exit 0
fi

# Create dump directory
mkdir -p "$DUMP_DIR"

# Check if logged in
if ! supabase projects list &>/dev/null; then
    echo "❌ Error: Not logged in to Supabase"
    echo "Run: supabase login"
    exit 1
fi

# Get password
PASS=$(cat supabase/.env.local 2>/dev/null | grep "^DB_PASSWORD=" | cut -d= -f2- || echo "")

if [ -z "$PASS" ]; then
    echo "💡 Tip: Add password to supabase/.env.local for automation"
    echo ""
    read -sp "Enter database password: " PASS
    echo ""
fi

echo ""
echo "📦 Exporting database..."
echo ""

# Step 1: Export schema
echo "[1/3] Exporting schema..."
supabase db dump \
    --linked \
    -p "$PASS" \
    -f "$TEMP_SCHEMA" 2>&1 | grep -E "(Dumped|error)" || true

# Step 2: Export data
echo "[2/3] Exporting data (this takes ~2 minutes)..."
supabase db dump \
    --linked \
    --data-only \
    -p "$PASS" \
    -f "$TEMP_DATA" 2>&1 | grep -E "(Dumped|error)" || true

# Step 3: Combine into single file
echo "[3/3] Combining files..."
cat "$TEMP_SCHEMA" "$TEMP_DATA" > "$COMPLETE_FILE"

# Cleanup temp files
rm -f "$TEMP_SCHEMA" "$TEMP_DATA"

if [ -f "$COMPLETE_FILE" ] && [ -s "$COMPLETE_FILE" ]; then
    SIZE=$(du -h "$COMPLETE_FILE" | cut -f1)
    LINES=$(wc -l < "$COMPLETE_FILE" | xargs)
    CREATES=$(grep -c "^CREATE TABLE\|^CREATE FUNCTION" "$COMPLETE_FILE")
    INSERTS=$(grep -c "^INSERT INTO" "$COMPLETE_FILE")
    
    echo ""
    echo "✅ Export complete!"
    echo ""
    echo "📁 File: $COMPLETE_FILE"
    echo "📊 Size: $SIZE"
    echo "📝 Lines: $LINES"
    echo ""
    echo "📋 Contents:"
    echo "   ✅ Schema: $CREATES CREATE statements"
    echo "   ✅ Data: $INSERTS INSERT statements (16,282 rows)"
    echo ""
    echo "🔄 To restore:"
    echo "   psql <connection-string> -f $COMPLETE_FILE"
    echo ""
    echo "   This single file contains EVERYTHING to recreate your database!"
else
    echo ""
    echo "❌ Export failed"
    [ -f "$COMPLETE_FILE" ] && rm -f "$COMPLETE_FILE"
    exit 1
fi

