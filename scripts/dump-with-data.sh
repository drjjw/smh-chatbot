#!/bin/bash

# Export FULL database including all data and embeddings
# WARNING: This will be LARGE (embeddings data)

set -e

PROJECT_REF="mlxctdgnojvkgfqldaob"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_DIR="./database-dumps"
DUMP_FILE="${DUMP_DIR}/full_with_data_${TIMESTAMP}.sql"

echo "🗄️  Full Database Export (Schema + Data)"
echo "Project: Manuals-Chat"
echo "File: $DUMP_FILE"
echo ""
echo "⚠️  WARNING: This includes ALL data including embeddings!"
echo "   Expected size: ~100MB+ (you have 16,000+ vector embeddings)"
echo ""
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Export cancelled"
    exit 0
fi

# Create dump directory
mkdir -p "$DUMP_DIR"

# Get password
PASS=$(cat supabase/.env.local 2>/dev/null | grep "^DB_PASSWORD=" | cut -d= -f2- || echo "")

if [ -z "$PASS" ]; then
    read -sp "Enter database password: " PASS
    echo ""
fi

echo ""
echo "📦 Exporting full database with data..."
echo "   This may take a few minutes..."
echo ""

# Set password for pg_dump
export PGPASSWORD="$PASS"

# Use pg_dump with Session Pooler connection
DB_HOST="aws-0-us-east-1.pooler.supabase.com"
DB_PORT="6543"
DB_USER="postgres.${PROJECT_REF}"

# Full dump with data
pg_dump "postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/postgres" \
    --verbose \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --file="$DUMP_FILE" 2>&1 | grep -E "^(dumping|Dumping)" || true

unset PGPASSWORD

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
    echo "📋 Tables exported:"
    grep "^COPY public" "$DUMP_FILE" | sed 's/COPY public./  - /' | sed 's/ .*//' | sort -u || echo "  (checking...)"
    
    echo ""
    echo "To restore: psql <connection-string> -f $DUMP_FILE"
else
    echo ""
    echo "❌ Export failed"
    [ -f "$DUMP_FILE" ] && rm -f "$DUMP_FILE"
    exit 1
fi

