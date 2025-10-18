#!/bin/bash

# Direct Database Dump using pg_dump
# Bypasses Supabase CLI and uses pg_dump directly

set -e

PROJECT_REF="mlxctdgnojvkgfqldaob"
# Use pooler for connection (direct db connection may not be available)
DB_HOST="aws-0-us-east-1.pooler.supabase.com"
DB_PORT="6543"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_DIR="./database-dumps"
DUMP_FILE="${DUMP_DIR}/full_dump_${TIMESTAMP}.sql"

echo "🗄️  Direct Database Dump"
echo "Project: Manuals-Chat"
echo "Connection: Pooler (port 6543)"
echo "File: $DUMP_FILE"
echo ""

# Create dump directory
mkdir -p "$DUMP_DIR"

# Check if pg_dump is installed
if ! command -v pg_dump &> /dev/null; then
    echo "❌ Error: pg_dump is not installed"
    echo "Install it with: brew install postgresql"
    exit 1
fi

# Get password from .env.local or prompt
PASS=$(cat supabase/.env.local 2>/dev/null | grep "^DB_PASSWORD=" | cut -d= -f2- || echo "")

if [ -z "$PASS" ]; then
    echo "💡 Tip: Run ./scripts/setup-db-password.sh to save password for future use"
    echo ""
    read -sp "Enter database password: " PASS
    echo ""
fi

# Build connection string using pooler
export PGPASSWORD="$PASS"
DB_URL="postgresql://postgres.${PROJECT_REF}@${DB_HOST}:${DB_PORT}/postgres"

echo "📦 Exporting database..."

# Export database
pg_dump "$DB_URL" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --file="$DUMP_FILE" 2>&1 | grep -E "(^ERROR|^FATAL)" || true

unset PGPASSWORD

if [ -f "$DUMP_FILE" ] && [ -s "$DUMP_FILE" ]; then
    SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    echo ""
    echo "✅ Export complete!"
    echo "📁 File: $DUMP_FILE"
    echo "📊 Size: $SIZE"
    echo ""
    echo "To restore: psql <connection-string> -f $DUMP_FILE"
else
    echo ""
    echo "❌ Export failed - check your password and network connection"
    rm -f "$DUMP_FILE"
    exit 1
fi

