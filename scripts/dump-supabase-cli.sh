#!/bin/bash

# Database Dump using Supabase CLI with password automation

set -e

PROJECT_REF="mlxctdgnojvkgfqldaob"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_DIR="./database-dumps"
DUMP_FILE="${DUMP_DIR}/full_dump_${TIMESTAMP}.sql"

echo "🗄️  Supabase Database Export"
echo "Project: Manuals-Chat"
echo ""
echo "What do you want to export?"
echo "1) Schema only (fast, 61KB)"
echo "2) Data only (slow, 224MB - includes all embeddings)"
echo "3) Both (schema + data)"
read -p "Choice (1-3) [default: 1]: " EXPORT_TYPE
EXPORT_TYPE=${EXPORT_TYPE:-1}

echo ""
echo "📁 Export directory: $DUMP_DIR"

# Create dump directory
mkdir -p "$DUMP_DIR"

# Check if logged in
if ! supabase projects list &>/dev/null; then
    echo "❌ Error: Not logged in to Supabase"
    echo "Run: supabase login"
    exit 1
fi

# Get password from .env.local
PASS=$(cat supabase/.env.local 2>/dev/null | grep "^DB_PASSWORD=" | cut -d= -f2- || echo "")

if [ -z "$PASS" ]; then
    echo "💡 Add password to supabase/.env.local for automation"
    echo ""
    read -sp "Enter database password: " PASS
    echo ""
fi

case $EXPORT_TYPE in
    1)
        echo "📦 Exporting schema only..."
        DUMP_FILE="${DUMP_DIR}/schema_${TIMESTAMP}.sql"
        supabase db dump \
            --linked \
            -f "$DUMP_FILE" \
            -p "$PASS" 2>&1 | grep -v "Pulling\|Download\|Digest\|Status\|Already exists" || true
        ;;
    2)
        echo "📦 Exporting data only (this will take a few minutes)..."
        DUMP_FILE="${DUMP_DIR}/data_${TIMESTAMP}.sql"
        supabase db dump \
            --linked \
            --data-only \
            -f "$DUMP_FILE" \
            -p "$PASS" 2>&1 | grep -v "Pulling\|Download\|Digest\|Status\|Already exists" || true
        ;;
    3)
        echo "📦 Exporting schema..."
        SCHEMA_FILE="${DUMP_DIR}/schema_${TIMESTAMP}.sql"
        supabase db dump \
            --linked \
            -f "$SCHEMA_FILE" \
            -p "$PASS" 2>&1 | grep -v "Pulling\|Download\|Digest\|Status\|Already exists" || true
        
        echo "📦 Exporting data (this will take a few minutes)..."
        DATA_FILE="${DUMP_DIR}/data_${TIMESTAMP}.sql"
        supabase db dump \
            --linked \
            --data-only \
            -f "$DATA_FILE" \
            -p "$PASS" 2>&1 | grep -v "Pulling\|Download\|Digest\|Status\|Already exists" || true
        
        DUMP_FILE="$SCHEMA_FILE and $DATA_FILE"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

if [ -f "$DUMP_FILE" ] && [ -s "$DUMP_FILE" ]; then
    SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    LINES=$(wc -l < "$DUMP_FILE")
    echo ""
    echo "✅ Export complete!"
    echo "📁 File: $DUMP_FILE"
    echo "📊 Size: $SIZE"
    echo "📝 Lines: $LINES"
    echo ""
    
    # Show what was exported
    echo "📋 Contents:"
    grep "^CREATE TABLE" "$DUMP_FILE" | sed 's/CREATE TABLE /  - /' | sed 's/ ($//' || echo "  (Schema export)"
    
    echo ""
    echo "To restore: psql <connection-string> -f $DUMP_FILE"
else
    echo ""
    echo "❌ Export failed"
    [ -f "$DUMP_FILE" ] && rm -f "$DUMP_FILE"
    exit 1
fi

