#!/bin/bash

# Quick Database Dump Script
# Exports full database without prompts

set -e

PROJECT_REF="mlxctdgnojvkgfqldaob"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_DIR="./database-dumps"
DUMP_FILE="${DUMP_DIR}/full_dump_${TIMESTAMP}.sql"

echo "🗄️  Supabase Database Dump"
echo "Project: Manuals-Chat"
echo "File: $DUMP_FILE"
echo ""

# Create dump directory
mkdir -p "$DUMP_DIR"

# Check if logged in
if ! supabase projects list &>/dev/null; then
    echo "❌ Error: Not logged in to Supabase"
    echo "Run: supabase login"
    exit 1
fi

# Export database using Supabase CLI directly
echo "📦 Exporting database..."
supabase db dump \
    --linked \
    -f "$DUMP_FILE"

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo ""
echo "✅ Export complete!"
echo "📁 File: $DUMP_FILE"
echo "📊 Size: $SIZE"
echo ""
echo "To restore: psql <connection-string> -f $DUMP_FILE"


