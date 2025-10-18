#!/bin/bash

# List all tables in the database with row counts

set -e

PROJECT_REF="mlxctdgnojvkgfqldaob"

echo "🗄️  Database Tables Overview"
echo "Project: Manuals-Chat"
echo ""

# Check if logged in
if ! supabase projects list &>/dev/null; then
    echo "❌ Error: Not logged in to Supabase"
    echo "Run: supabase login"
    exit 1
fi

# Get database password if stored
PASS=$(cat supabase/.env.local 2>/dev/null | grep DB_PASSWORD | cut -d= -f2 || echo "")

if [ -z "$PASS" ]; then
    echo "Password required for direct database access."
    read -sp "Enter database password: " PASS
    echo ""
fi

DB_URL="postgresql://postgres:${PASS}@db.${PROJECT_REF}.supabase.co:5432/postgres"

echo "📊 Tables and Row Counts:"
echo ""

# Query to list tables with row counts
psql "$DB_URL" -t -c "
SELECT 
    schemaname,
    tablename,
    n_tup_ins - n_tup_del AS row_count
FROM pg_stat_user_tables
ORDER BY schemaname, tablename;
" 2>/dev/null | grep -v '^$' | while read schema table rows; do
    printf "%-20s %-30s %10s rows\n" "$schema" "$table" "$rows"
done

echo ""
echo "📦 Total Database Size:"
psql "$DB_URL" -t -c "
SELECT pg_size_pretty(pg_database_size(current_database()));
" 2>/dev/null

